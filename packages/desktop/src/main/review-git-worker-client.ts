import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type {
  ReviewGitCommandResult,
  ReviewGitCommandRunner,
  ReviewGitObjectLoader,
  ReviewGitObjectOutcome,
  ReviewPatchParseInput,
  ReviewPatchParser,
} from "./review-git-engine";
import type { ReviewFileDiffOutcome } from "@actspace/shared";

export type ReviewWorkerRequest =
  | { id: number; type: "git"; args: string[]; options: { cwd: string; timeoutMs: number; maxOutputChars: number; input?: string } }
  | { id: number; type: "parse"; input: ReviewPatchParseInput }
  | { id: number; type: "cat-file"; input: { cwd: string; requests: Array<{ key: string; spec: string }>; maxBytes: number } }
  | { id: number; type: "cancel"; targetId: number };

export type ReviewWorkerResponse =
  | { id: number; ok: true; value: ReviewGitCommandResult | ReviewFileDiffOutcome[] | ReviewGitObjectOutcome[] }
  | { id: number; ok: false; error: string };

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

export class ReviewGitWorkerClient {
  private worker: Worker | undefined;
  private nextRequestId = 1;
  private crashRestarts = 0;
  private disposed = false;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly workerPath = join(__dirname, "review-git-worker.js")) {}

  readonly runGit: ReviewGitCommandRunner = async (args, options) => {
    try {
      return await this.request<ReviewGitCommandResult>({ type: "git", args, options: {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
        maxOutputChars: options.maxOutputChars,
        input: options.input,
      } }, options.signal);
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : "Review worker failed.",
        exitCode: null,
        timedOut: false,
        truncated: false,
        startError: error instanceof Error ? error.message : "Review worker failed.",
      };
    }
  };

  readonly parsePatches: ReviewPatchParser = (input) => this.request<ReviewFileDiffOutcome[]>({ type: "parse", input });

  readonly loadGitObjects: ReviewGitObjectLoader = (input) => this.request<ReviewGitObjectOutcome[]>({
    type: "cat-file",
    input: { cwd: input.cwd, requests: input.requests, maxBytes: input.maxBytes },
  }, input.signal);

  dispose(): void {
    this.disposed = true;
    this.rejectPending(new Error("Review worker was disposed."));
    void this.worker?.terminate();
    this.worker = undefined;
  }

  private request<T>(request:
    | Omit<Extract<ReviewWorkerRequest, { type: "git" }>, "id">
    | Omit<Extract<ReviewWorkerRequest, { type: "parse" }>, "id">
    | Omit<Extract<ReviewWorkerRequest, { type: "cat-file" }>, "id">,
  signal?: AbortSignal): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Review worker is unavailable."));
    if (signal?.aborted) return Promise.reject(new Error("Review request was cancelled."));
    const worker = this.ensureWorker();
    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        worker.postMessage({ id: this.nextRequestId++, type: "cancel", targetId: id } satisfies ReviewWorkerRequest);
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.cleanup();
        reject(new Error("Review request was cancelled."));
      };
      const cleanup = () => signal?.removeEventListener("abort", abort);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      worker.postMessage({ ...request, id } satisfies ReviewWorkerRequest);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (this.crashRestarts > 1) throw new Error("Review worker restart limit was reached.");
    const worker = new Worker(this.workerPath);
    this.worker = worker;
    worker.on("message", (message: ReviewWorkerResponse) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.cleanup();
      if (message.ok === true) pending.resolve(message.value);
      else pending.reject(new Error(message.error));
    });
    worker.on("error", (error) => this.handleWorkerFailure(worker, error));
    worker.on("exit", (code) => {
      if (!this.disposed && code !== 0) this.handleWorkerFailure(worker, new Error(`Review worker exited with code ${code}.`));
    });
    return worker;
  }

  private handleWorkerFailure(worker: Worker, error: Error): void {
    if (this.worker !== worker) return;
    this.worker = undefined;
    this.crashRestarts += 1;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }
}
