import type { DocumentFailure, DocumentLoadResult, ParsedDocument } from "./ocr-response.js";

export type LoadControl = { readonly signal: AbortSignal; readonly startUpload: () => void };
type Job = (control: LoadControl) => Promise<DocumentLoadResult>;

export const ABORTED_FAILURE: DocumentFailure = Object.freeze({ code: "TOOL_ABORTED", message: "Reading the document was aborted.", retryable: true });
const ABORTED: DocumentLoadResult = Object.freeze({ ok: false, failure: ABORTED_FAILURE });

/** One load shared by every caller of the same key; it belongs to the cache, not to any one call. */
type Load = {
  readonly controller: AbortController;
  promise: Promise<DocumentLoadResult>;
  waiters: number;
  uploading: boolean;
  /** True once the load holds one of the `maxLoads` slots. */
  started: boolean;
  /** Lets a queued load run. */
  readonly start: () => void;
};

/**
 * Parsed documents in memory (agent-deep-search-and-document-parsing.md §8.5): LRU by characters, at most `maxLoads`
 * loads reading and uploading at once, concurrent calls for one key share one load. Only successes are cached.
 */
export class DocumentCache {
  private readonly maxChars: number;
  private readonly maxLoads: number;
  private readonly entries = new Map<string, ParsedDocument>();
  private readonly loads = new Map<string, Load>();
  private readonly queue: Load[] = [];
  private chars = 0;
  private running = 0;
  private disposed = false;

  constructor(options: { readonly maxChars?: number; readonly maxLoads?: number } = {}) {
    this.maxChars = options.maxChars ?? 8_000_000;
    this.maxLoads = options.maxLoads ?? 2;
  }

  get(key: string): ParsedDocument | undefined {
    const document = this.entries.get(key);
    if (document === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, document);
    return document;
  }

  load(key: string, callerSignal: AbortSignal, job: Job): Promise<DocumentLoadResult> {
    if (this.disposed || callerSignal.aborted) return Promise.resolve(ABORTED);
    const load = this.loads.get(key) ?? this.begin(key, job);
    load.waiters += 1;
    return new Promise<DocumentLoadResult>((resolve, reject) => {
      let settled = false;
      const leave = () => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener("abort", onAbort);
        load.waiters -= 1;
      };
      const onAbort = () => {
        if (settled) return;
        leave();
        // Nobody waits and nothing has been sent: cancel. Once fetch is called the result still goes into the cache.
        if (load.waiters === 0 && !load.uploading) load.controller.abort(new Error("No caller is waiting for this document."));
        resolve(ABORTED);
      };
      callerSignal.addEventListener("abort", onAbort, { once: true });
      load.promise.then(
        (result) => { if (!settled) { leave(); resolve(result); } },
        (error: unknown) => { if (!settled) { leave(); reject(error); } },
      );
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const load of this.loads.values()) load.controller.abort(new Error("Document cache disposed."));
    this.entries.clear();
    this.chars = 0;
  }

  private begin(key: string, job: Job): Load {
    const controller = new AbortController();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => { release = resolve; });
    const load: Load = { controller, waiters: 0, uploading: false, started: false, start: () => release(), promise: undefined as never };
    const run = async (): Promise<DocumentLoadResult> => {
      await turn;
      try {
        if (controller.signal.aborted) return ABORTED;
        const result = await job({ signal: controller.signal, startUpload: () => { load.uploading = true; } });
        if (result.ok && !this.disposed) this.store(key, result.document);
        return result;
      } finally {
        if (load.started) { this.running -= 1; this.next(); }
      }
    };
    load.promise = run().finally(() => {
      if (this.loads.get(key) === load) this.loads.delete(key);
    });
    this.loads.set(key, load);
    // A queued load that is cancelled skips its job and gives up its place without taking a slot.
    controller.signal.addEventListener("abort", () => {
      const index = this.queue.indexOf(load);
      if (index >= 0) { this.queue.splice(index, 1); release(); }
    }, { once: true });
    this.queue.push(load);
    this.next();
    return load;
  }

  private next(): void {
    while (this.running < this.maxLoads && this.queue.length > 0) {
      const load = this.queue.shift()!;
      load.started = true;
      this.running += 1;
      load.start();
    }
  }

  private store(key: string, document: ParsedDocument): void {
    const previous = this.entries.get(key);
    if (previous) { this.chars -= previous.chars; this.entries.delete(key); }
    this.entries.set(key, document);
    this.chars += document.chars;
    for (const [oldKey, old] of this.entries) {
      if (this.chars <= this.maxChars) break;
      if (oldKey === key) continue;
      this.entries.delete(oldKey);
      this.chars -= old.chars;
    }
  }
}
