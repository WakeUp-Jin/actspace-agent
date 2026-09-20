import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionPersistenceDriver } from "./session-driver.js";
import { SessionWriteBehind } from "./write-behind.js";

/**
 * Owns the backend queue behind the Session event boundary. The live Session
 * accepts an event first; this coordinator makes the accepted prefix durable
 * without exposing writer or lease details to producers.
 */
export class SessionPersistenceCoordinator {
  readonly #writes: SessionWriteBehind;
  #durableSeq: number;
  #closed = false;

  constructor(
    private readonly driver: SessionPersistenceDriver,
    seed: readonly SessionEventEnvelopeV1[],
    reportBackgroundFailure: (error: unknown) => void = () => undefined,
  ) {
    this.#durableSeq = seed.length === 0 ? -1 : seed[seed.length - 1]!.seq;
    this.#writes = new SessionWriteBehind({
      write: async (events) => {
        await this.driver.append(events);
        const last = events[events.length - 1];
        if (last !== undefined) this.#durableSeq = last.seq;
      },
      reportBackgroundFailure,
    });
  }

  get durableSeq(): number { return this.#durableSeq; }
  get blocked(): boolean { return !this.#writes.canAccept; }

  accept(event: SessionEventEnvelopeV1): void {
    if (this.#closed) throw new Error("Session persistence coordinator is closed.");
    this.#writes.enqueue(event);
  }

  acceptMany(events: readonly SessionEventEnvelopeV1[]): void {
    if (this.#closed) throw new Error("Session persistence coordinator is closed.");
    if (this.#writes.canAccept === false) throw new Error("Session persistence coordinator is blocked.");
    for (const event of events) this.#writes.enqueue(event);
  }

  async flush(throughSeq: number): Promise<void> {
    if (this.#closed) throw new Error("Session persistence coordinator is closed.");
    await this.#writes.flush();
    await this.driver.assertOwned();
    if (this.#durableSeq < throughSeq) throw new Error(`Session durability barrier stopped at seq ${this.#durableSeq}; expected ${throughSeq}.`);
  }

  async close(throughSeq: number): Promise<void> {
    if (this.#closed) return;
    let failure: unknown;
    try { await this.flush(throughSeq); } catch (error) { failure = error; }
    this.#closed = true;
    try { await this.driver.close(); } catch (error) { failure ??= error; }
    if (failure !== undefined) throw failure;
  }
}
