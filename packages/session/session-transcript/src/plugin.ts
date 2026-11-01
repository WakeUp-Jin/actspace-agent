import { existsSync } from "node:fs";
import { mkdir, open, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { containNotification, type CordisContext } from "@actspace/cordis-adapter";
import type { PromptHostPort } from "@actspace/prompt";
import { runtimeInfo } from "@actspace/prompt/source-support";
import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";
import { sessionsRoot, transcriptPath } from "./paths.js";
import { PLUGIN_ID, PROMPT_ID, sessionHistorySection } from "./prompt.js";
import { EMPTY_TRANSCRIPT, foldTranscript, inheritedThroughSeq, reduceTranscript, renderTranscript, type TranscriptBranch, type TranscriptState } from "./render.js";

type OpenSession = {
  readonly header: SessionHeaderV1;
  readonly journal: { project<T>(key: symbol, initial: () => T, reduce: (state: T, event: SessionEventEnvelopeV1) => T): T };
};
type SessionRuntime = { getOpen(sessionId: string): OpenSession | undefined };
type SessionStorage = {
  inspect(sessionId: string): Promise<{ readonly header: SessionHeaderV1 | null; readonly events: readonly SessionEventEnvelopeV1[] }>;
  listSessionIds(): Promise<readonly string[]>;
};
type HostSession = { readonly dataRoot: string };

export const inject = Object.freeze(["actspace.host.session", "session.runtime", "session.storage"]);

const PROJECTION = Symbol("actspace.session-transcript");
const HEADER_READ_LIMIT = 1024 * 1024;

/**
 * Keeps `sessions-v2/<id>/transcript.md` in step with the Journal (rewritten at
 * every Turn end) and tells main agents where those transcripts live.
 */
export class SessionTranscriptService {
  readonly #running = new Map<string, Promise<void>>();
  readonly #dirty = new Set<string>();
  readonly #prompts = new Map<string, () => void>();
  readonly #branches = new Map<string, TranscriptBranch[]>();
  readonly #removeListeners: Array<() => void> = [];
  #branchScan: Promise<void> | undefined;
  #closed = false;

  constructor(private readonly ctx: CordisContext, private readonly dataRoot: string) {
    const service = this;
    const listen = (name: "session/event" | "session/created" | "session/disposed", listener: (...args: never[]) => unknown) => {
      const remove = ctx.on?.(name, containNotification(ctx, listener as never) as never);
      if (typeof remove === "function") this.#removeListeners.push(remove as () => void);
    };
    listen("session/event", function (this: { sessionId?: string } | undefined, event: SessionEventEnvelopeV1) {
      const sessionId = this?.sessionId;
      if (sessionId && event?.type === "turn/end") return service.render(sessionId);
    });
    listen("session/created", (payload: { sessionId: string }) => this.#created(payload.sessionId));
    listen("session/disposed", (payload: { sessionId: string }) => this.#detachPrompt(payload.sessionId));
  }

  get root(): string { return sessionsRoot(this.dataRoot); }

  hasPrompt(sessionId: string): boolean { return this.#prompts.has(sessionId); }

  /** Rewrite one transcript; overlapping requests for the same Session coalesce into one extra pass. */
  render(sessionId: string): Promise<void> {
    const running = this.#running.get(sessionId);
    if (running) { this.#dirty.add(sessionId); return running; }
    const run = (async () => {
      do { this.#dirty.delete(sessionId); await this.#write(sessionId); } while (this.#dirty.has(sessionId) && !this.#closed);
    })().finally(() => { this.#running.delete(sessionId); });
    this.#running.set(sessionId, run);
    return run;
  }

  async #write(sessionId: string): Promise<void> {
    // `turn/end` is observed inside the Session's serialized append; leave it before projecting.
    await new Promise<void>(resolve => setImmediate(resolve));
    if (this.#closed) return;
    const target = transcriptPath(this.dataRoot, sessionId);
    // Ephemeral sessions have no directory and get no transcript.
    if (!existsSync(join(dirname(target), "journal.jsonl"))) return;
    const loaded = await this.#load(sessionId);
    if (!loaded) return;
    const branches = await this.#branchesOf(sessionId);
    await writeAtomic(target, renderTranscript(loaded.header, loaded.state, branches));
    for (const child of loaded.state.children) if (await this.#stale(child)) await this.render(child);
  }

  async #load(sessionId: string): Promise<{ header: SessionHeaderV1; state: TranscriptState } | undefined> {
    const live = (this.ctx.get?.("session.runtime") as SessionRuntime | undefined)?.getOpen(sessionId);
    if (live) {
      const inherited = inheritedThroughSeq(live.header);
      return { header: live.header, state: live.journal.project(PROJECTION, () => EMPTY_TRANSCRIPT, (state, event) => reduceTranscript(state, event, inherited)) };
    }
    const snapshot = await this.#storage().inspect(sessionId);
    if (!snapshot.header) return undefined;
    return { header: snapshot.header, state: foldTranscript(snapshot.events, inheritedThroughSeq(snapshot.header)) };
  }

  /** A delegated child is rewritten only when its Journal is newer than its transcript. */
  async #stale(sessionId: string): Promise<boolean> {
    let target: string;
    try { target = transcriptPath(this.dataRoot, sessionId); } catch { return false; }
    const [journal, transcript] = await Promise.all([stat(join(dirname(target), "journal.jsonl")).catch(() => null), stat(target).catch(() => null)]);
    return journal !== null && (transcript === null || transcript.mtimeMs < journal.mtimeMs);
  }

  async #created(sessionId: string): Promise<void> {
    const session = (this.ctx.get?.("session.runtime") as SessionRuntime | undefined)?.getOpen(sessionId);
    if (!session) return;
    const lineage = session.header.lineage;
    if (lineage?.origin !== "delegation") this.#attachPrompt(sessionId);
    if (lineage && lineage.origin !== "delegation") {
      await this.#ensureBranchIndex();
      // A new side chat or fork adds a mark to the parent's existing transcript.
      if (this.#noteBranch(session.header) && existsSync(transcriptPath(this.dataRoot, lineage.parentSessionId))) await this.render(lineage.parentSessionId);
    }
  }

  #attachPrompt(sessionId: string): void {
    if (this.#prompts.has(sessionId) || this.#closed) return;
    const extensions = (this.ctx.get?.("actspace.host.prompt") as PromptHostPort | undefined)?.extensions;
    if (!extensions) return;
    const section = sessionHistorySection(this.root);
    this.#prompts.set(sessionId, extensions.registerMainSession(sessionId, {
      id: PROMPT_ID, owner: PLUGIN_ID, order: 100, criticality: "optional", fields: ["system"],
      get: (context, write) => {
        // Chat mode has no file tools to read a transcript with.
        if (runtimeInfo(context).mode === "chat") return;
        write({ system: { sections: [{ id: PROMPT_ID, owner: PLUGIN_ID, order: 4800, content: section }], modelFacts: [] } });
      },
    }));
  }

  #detachPrompt(sessionId: string): void {
    this.#prompts.get(sessionId)?.();
    this.#prompts.delete(sessionId);
  }

  async #branchesOf(sessionId: string): Promise<readonly TranscriptBranch[]> {
    await this.#ensureBranchIndex();
    return this.#branches.get(sessionId) ?? [];
  }

  /** Headers never change, so one scan per process plus `session/created` keeps the index current. */
  #ensureBranchIndex(): Promise<void> {
    this.#branchScan ??= (async () => {
      for (const sessionId of await this.#storage().listSessionIds()) {
        const header = await readHeader(join(this.root, sessionId, "journal.jsonl"));
        if (header) this.#noteBranch(header);
      }
    })();
    return this.#branchScan;
  }

  #noteBranch(header: SessionHeaderV1): boolean {
    const lineage = header.lineage;
    if (!lineage || lineage.origin === "delegation") return false;
    const list = this.#branches.get(lineage.parentSessionId) ?? [];
    if (list.some(item => item.sessionId === header.sessionId)) return false;
    list.push({ sessionId: header.sessionId, origin: lineage.origin, boundarySeq: lineage.parentBoundarySeq });
    list.sort((a, b) => a.boundarySeq - b.boundarySeq || a.sessionId.localeCompare(b.sessionId));
    this.#branches.set(lineage.parentSessionId, list);
    return true;
  }

  #storage(): SessionStorage {
    const storage = this.ctx.get?.("session.storage") as SessionStorage | undefined;
    if (!storage) throw new Error("Session transcripts require session.storage.");
    return storage;
  }

  async dispose(): Promise<void> {
    this.#closed = true;
    for (const remove of this.#removeListeners.splice(0)) remove();
    for (const remove of this.#prompts.values()) remove();
    this.#prompts.clear();
    await Promise.allSettled([...this.#running.values()]);
  }
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

/** Read only the first JSONL line; the header is small even when the Journal is large. */
async function readHeader(path: string): Promise<SessionHeaderV1 | undefined> {
  const file = await open(path, "r").catch(() => undefined);
  if (!file) return undefined;
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < HEADER_READ_LIMIT) {
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, total);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(0x0a);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      total += bytesRead;
      if (newline !== -1) break;
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<SessionHeaderV1>;
    return value.recordKind === "header" && typeof value.sessionId === "string" ? value as SessionHeaderV1 : undefined;
  } catch { return undefined; } finally { await file.close(); }
}

export function apply(ctx: CordisContext): void {
  const host = ctx.get?.("actspace.host.session") as HostSession | undefined;
  if (!host?.dataRoot) throw new Error("Session transcripts require actspace.host.session.dataRoot.");
  const service = new SessionTranscriptService(ctx, host.dataRoot);
  ctx.provide?.("session.transcript", service);
  ctx.effect?.(() => () => service.dispose(), "session-transcript");
}
