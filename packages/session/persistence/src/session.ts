import { join } from "node:path";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionError } from "@actspace/session-journal";
import type { SessionHeaderV1 } from "@actspace/session-journal";
import { SessionJournal } from "@actspace/session-journal";
import { createSessionProjection, type SessionProjection } from "@actspace/session-projection";
import type { SessionPersistenceDriver } from "./session-driver.js";
import { SessionWriteBehind } from "./write-behind.js";

export type ArtifactReferenceV1 = {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
};

export interface ArtifactStore {
  put(bytes: Uint8Array, metadata: { readonly mediaType: string }): Promise<ArtifactReferenceV1>;
  read(reference: ArtifactReferenceV1): Promise<Uint8Array>;
}

export type SessionFileLayout = {
  readonly root: string;
  readonly sessionDir: string;
  readonly journalPath: string;
  readonly artifactsDir: string;
  readonly recoveryDir: string;
};

export type CreatePersistentSessionOptions = {
  readonly header: SessionHeaderV1;
  readonly registry: EventCodecRegistry;
  readonly layout: SessionFileLayout;
  readonly driver: SessionPersistenceDriver;
  readonly seed?: readonly SessionEventEnvelopeV1[];
  readonly now?: () => string;
  readonly onBackgroundFailure?: (error: unknown) => void;
  /** Post-commit firehose. It is called only after the driver append resolves. */
  readonly onEvent?: (event: SessionEventEnvelopeV1) => void | Promise<void>;
  /** Durable checkpoint notification. It runs after the queued batch is flushed. */
  readonly onFlush?: (throughSeq: number) => void | Promise<void>;
};

export class SessionHandle {
  readonly #writeBehind: SessionWriteBehind;
  #mutation: Promise<unknown> = Promise.resolve();
  #closed = false;
  #closePromise: Promise<void> | undefined;

  private constructor(
    readonly header: SessionHeaderV1,
    readonly layout: SessionFileLayout,
    readonly journal: SessionJournal,
    private readonly driver: SessionPersistenceDriver,
    onBackgroundFailure: (error: unknown) => void,
    private readonly onEvent: ((event: SessionEventEnvelopeV1) => void | Promise<void>) | undefined,
    private readonly onFlush: ((throughSeq: number) => void | Promise<void>) | undefined,
  ) {
    this.#writeBehind = new SessionWriteBehind({
      write: async (events) => {
        await this.driver.append(events);
        for (const event of events) {
          void Promise.resolve(this.onEvent?.(event)).catch(onBackgroundFailure);
        }
      },
      reportBackgroundFailure: onBackgroundFailure,
    });
  }

  static async create(options: CreatePersistentSessionOptions): Promise<SessionHandle> {
    const journal = new SessionJournal({ registry: options.registry, now: options.now, seed: options.seed });
    return new SessionHandle(options.header, options.layout, journal, options.driver, options.onBackgroundFailure ?? (() => undefined), options.onEvent, options.onFlush);
  }

  static createEphemeral(options: { readonly header: SessionHeaderV1; readonly registry: EventCodecRegistry; readonly now?: () => string; readonly onEvent?: (event: SessionEventEnvelopeV1) => void | Promise<void>; readonly onFlush?: (throughSeq: number) => void | Promise<void> }): SessionHandle {
    const journal = new SessionJournal({ registry: options.registry, now: options.now });
    const writer = Object.freeze({ append: async () => undefined, close: async () => undefined });
    const driver = Object.freeze({ assertOwned: async () => undefined, append: writer.append, close: writer.close });
    return new SessionHandle(options.header, ephemeralSessionLayout(options.header.sessionId), journal, driver, () => undefined, options.onEvent, options.onFlush);
  }

  append(candidate: SessionEventCandidateV1): Promise<SessionEventEnvelopeV1> {
    return this.#serialize(async () => {
      this.#assertOpen();
      if (!this.#writeBehind.canAccept) throw new SessionError("SESSION_DURABILITY_FAILED", "Session writer is blocked.");
      await this.driver.assertOwned();
      const event = this.journal.append(candidate);
      this.#writeBehind.enqueue(event);
      return event;
    });
  }

  appendMany(candidates: readonly SessionEventCandidateV1[]): Promise<readonly SessionEventEnvelopeV1[]> {
    return this.#serialize(async () => {
      this.#assertOpen();
      if (!this.#writeBehind.canAccept) throw new SessionError("SESSION_DURABILITY_FAILED", "Session writer is blocked.");
      await this.driver.assertOwned();
      const events = this.journal.appendMany(candidates);
      for (const event of events) this.#writeBehind.enqueue(event);
      return events;
    });
  }

  flush(throughSeq = this.journal.lastSeq): Promise<void> {
    return this.#serialize(async () => {
      this.#assertOpen();
      await this.#writeBehind.flush();
      await this.driver.assertOwned();
      if (this.journal.lastSeq < throughSeq) throw new SessionError("INVALID_EVENT", `Cannot flush unknown seq ${throughSeq}.`);
      await this.onFlush?.(throughSeq);
    });
  }

  get projection(): SessionProjection {
    return createSessionProjection(this.journal.events, this.journal.surface, this.journal.validation.relations);
  }

  get lastSeq(): number {
    return this.journal.lastSeq;
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#closePromise = this.#serialize(async () => {
      if (this.#closed) return;
      this.#closed = true;
      let failure: unknown;
      try {
        await this.#writeBehind.close();
      } catch (error) {
        failure = error;
      }
      try {
        await this.driver.close();
      } catch (error) {
        failure ??= error;
      }
      if (failure !== undefined) throw failure;
    });
    return this.#closePromise;
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#mutation.then(operation, operation);
    this.#mutation = result.then(() => undefined, () => undefined);
    return result;
  }

  #assertOpen(): void {
    if (this.#closed) throw new SessionError("SESSION_CLOSED", "SessionHandle is closed.");
  }
}

function ephemeralSessionLayout(sessionId: string): SessionFileLayout {
  const root = `memory://sessions-v2`;
  const sessionDir = `${root}/${sessionId}`;
  return Object.freeze({ root, sessionDir, journalPath: `${sessionDir}/journal.jsonl`, artifactsDir: `${sessionDir}/artifacts`, recoveryDir: `${sessionDir}/recovery` });
}

export function sessionFileLayout(dataRoot: string, sessionId: string): SessionFileLayout {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(sessionId) || sessionId === "." || sessionId === "..") {
    throw new SessionError("INVALID_HEADER", "Session id is not path-safe.");
  }
  const root = join(dataRoot, "sessions-v2");
  const sessionDir = join(root, sessionId);
  return Object.freeze({ root, sessionDir, journalPath: join(sessionDir, "journal.jsonl"), artifactsDir: join(sessionDir, "artifacts"), recoveryDir: join(sessionDir, "recovery") });
}
