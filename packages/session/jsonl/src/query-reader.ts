import { Worker } from "node:worker_threads";
import type { SessionQuerySource, SessionEventBatch, SessionEventBatchInput } from "@actspace/session-storage";

/** One lazily started reader per provider; parsing never occupies its caller's event loop. */
export class JsonlQueryReader {
  #worker?: Worker;
  #id = 0;
  #closed = false;
  #pending = new Map<number, { timer: ReturnType<typeof setTimeout>; resolve(value: SessionEventBatch | SessionQuerySource | readonly SessionQuerySource[]): void; reject(error: Error): void }>();
  read(path: string, sessionId: string, input: SessionEventBatchInput): Promise<SessionEventBatch> {
    return this.#request(path, sessionId, input) as Promise<SessionEventBatch>;
  }
  source(path: string, sessionId: string): Promise<SessionQuerySource> {
    return this.#request(path, sessionId) as Promise<SessionQuerySource>;
  }
  sources(sources: readonly { path: string; sessionId: string }[]): Promise<readonly SessionQuerySource[]> {
    if (sources.length > 128) return Promise.reject(new Error("Query descriptor batch exceeds 128 sessions."));
    return this.#message({ sources }) as Promise<readonly SessionQuerySource[]>;
  }
  #request(path: string, sessionId: string, input?: SessionEventBatchInput) {
    return this.#message({ path, sessionId, input });
  }
  #message(message: Record<string, unknown>): Promise<SessionEventBatch | SessionQuerySource | readonly SessionQuerySource[]> {
    if (this.#closed) return Promise.reject(new Error("Query reader closed."));
    if (this.#pending.size >= 128) return Promise.reject(new Error("Query reader queue is full."));
    const worker = this.#worker ??= this.#start();
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#worker !== worker) return;
        this.#worker = undefined;
        this.#fail(new Error("Query reader timed out."));
        void worker.terminate();
      }, 60_000);
      this.#pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, ...message }); }
      catch (error) { clearTimeout(timer); this.#pending.delete(id); reject(error); }
    });
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.#fail(new Error("Query reader closed."));
    await this.#worker?.terminate();
    this.#worker = undefined;
  }
  #fail(error: Error): void {
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.#pending.clear();
  }
  #start(): Worker {
    const worker = new Worker(new URL("./query-reader-worker.js", import.meta.url));
    worker.on("message", (reply: { id: number; result?: SessionEventBatch | SessionQuerySource | readonly SessionQuerySource[]; error?: string }) => {
      const pending = this.#pending.get(reply.id);
      if (!pending) return;
      this.#pending.delete(reply.id);
      clearTimeout(pending.timer);
      if (reply.error) pending.reject(new Error(reply.error));
      else if (reply.result) pending.resolve(reply.result);
      else pending.reject(new Error("Invalid query reader response."));
    });
    const failed = (error: Error) => {
      if (this.#worker !== worker) return;
      this.#worker = undefined;
      this.#fail(error);
      void worker.terminate();
    };
    worker.on("error", failed);
    worker.on("exit", code => failed(new Error(`Query reader exited: ${code}`)));
    return worker;
  }
}
