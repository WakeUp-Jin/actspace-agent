import { describe, expect, it, vi } from "vitest";
import { DocumentCache, type LoadControl } from "../cache.js";
import type { DocumentLoadResult, ParsedDocument } from "../ocr-response.js";

const doc = (chars: number): ParsedDocument => ({ pages: ["x".repeat(chars)], incomplete: [], split: false, chars });
const ok = (chars = 10): DocumentLoadResult => ({ ok: true, document: doc(chars) });
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const never = () => new AbortController().signal;

/** A job that waits until the test resolves it. */
function deferredJob() {
  let resolve!: (value: DocumentLoadResult) => void;
  let reject!: (error: unknown) => void;
  let control: LoadControl | undefined;
  const job = vi.fn((given: LoadControl) => {
    control = given;
    return new Promise<DocumentLoadResult>((res, rej) => { resolve = res; reject = rej; });
  });
  return { job, resolve: (value: DocumentLoadResult) => resolve(value), reject: (error: unknown) => reject(error), control: () => control };
}

describe("DocumentCache LRU", () => {
  it("moves a hit to most recent and evicts the least recently used past the limit", async () => {
    const cache = new DocumentCache({ maxChars: 30 });
    await cache.load("a", never(), async () => ok(10));
    await cache.load("b", never(), async () => ok(10));
    await cache.load("c", never(), async () => ok(10));
    expect(cache.get("a")).toBeDefined(); // a is now most recent
    await cache.load("d", never(), async () => ok(10));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.get("d")).toBeDefined();
  });

  it("keeps a single document larger than the limit until the next write", async () => {
    const cache = new DocumentCache({ maxChars: 30 });
    await cache.load("huge", never(), async () => ok(100));
    expect(cache.get("huge")).toBeDefined();
    await cache.load("small", never(), async () => ok(5));
    expect(cache.get("huge")).toBeUndefined();
    expect(cache.get("small")).toBeDefined();
  });
});

describe("DocumentCache loads", () => {
  it("runs one job for concurrent loads of the same key", async () => {
    const cache = new DocumentCache();
    const pending = deferredJob();
    const first = cache.load("k", never(), pending.job);
    const second = cache.load("k", never(), pending.job);
    await flush();
    const result = ok();
    pending.resolve(result);
    expect(await first).toBe(result);
    expect(await second).toBe(result);
    expect(pending.job).toHaveBeenCalledTimes(1);
  });

  it("shares a failure without caching it, and retries next time", async () => {
    const cache = new DocumentCache();
    const failure: DocumentLoadResult = { ok: false, failure: { code: "DOCUMENT_FAILED", message: "x", retryable: true } };
    const pending = deferredJob();
    const both = Promise.all([cache.load("k", never(), pending.job), cache.load("k", never(), pending.job)]);
    await flush();
    pending.resolve(failure);
    expect(await both).toEqual([failure, failure]);
    expect(cache.get("k")).toBeUndefined();
    const retry = vi.fn(async () => ok());
    await cache.load("k", never(), retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("rejects every caller when the job throws and frees the slot", async () => {
    const cache = new DocumentCache({ maxLoads: 1 });
    const pending = deferredJob();
    const both = Promise.allSettled([cache.load("k", never(), pending.job), cache.load("k", never(), pending.job)]);
    const after = vi.fn(async () => ok());
    const third = cache.load("other", never(), after);
    await flush();
    pending.reject(new Error("boom"));
    expect((await both).map(item => item.status)).toEqual(["rejected", "rejected"]);
    await third;
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("runs at most two jobs at once, first come first served", async () => {
    const cache = new DocumentCache();
    const jobs = [deferredJob(), deferredJob(), deferredJob()];
    const results = jobs.map((pending, index) => cache.load(`k${index}`, never(), pending.job));
    await flush();
    expect(jobs.map(pending => pending.job.mock.calls.length)).toEqual([1, 1, 0]);
    jobs[0]!.resolve(ok());
    await results[0];
    await flush();
    expect(jobs[2]!.job).toHaveBeenCalledTimes(1);
    jobs[1]!.resolve(ok());
    jobs[2]!.resolve(ok());
    await Promise.all(results);
  });

  it("does not run a queued job whose only caller aborts, and frees nothing it never took", async () => {
    const cache = new DocumentCache({ maxLoads: 1 });
    const running = deferredJob();
    const first = cache.load("a", never(), running.job);
    const caller = new AbortController();
    const queuedJob = vi.fn(async () => ok());
    const queued = cache.load("b", caller.signal, queuedJob);
    caller.abort();
    expect(await queued).toMatchObject({ ok: false, failure: { code: "TOOL_ABORTED" } });
    const next = vi.fn(async () => ok());
    const third = cache.load("c", never(), next);
    running.resolve(ok());
    await first;
    await third;
    expect(queuedJob).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("keeps the load alive while another caller still waits", async () => {
    const cache = new DocumentCache();
    const pending = deferredJob();
    const caller = new AbortController();
    const aborted = cache.load("k", caller.signal, pending.job);
    const waiting = cache.load("k", never(), pending.job);
    await flush();
    caller.abort();
    expect(await aborted).toMatchObject({ ok: false, failure: { code: "TOOL_ABORTED" } });
    expect(pending.control()!.signal.aborted).toBe(false);
    const result = ok();
    pending.resolve(result);
    expect(await waiting).toBe(result);
  });

  it("cancels the load when every caller aborts before the upload", async () => {
    const cache = new DocumentCache();
    const pending = deferredJob();
    const caller = new AbortController();
    const result = cache.load("k", caller.signal, pending.job);
    await flush();
    caller.abort();
    await result;
    expect(pending.control()!.signal.aborted).toBe(true);
    pending.resolve({ ok: false, failure: { code: "TOOL_ABORTED", message: "x", retryable: true } });
    await flush();
    expect(cache.get("k")).toBeUndefined();
  });

  it("finishes and caches the load when every caller aborts after the upload starts", async () => {
    const cache = new DocumentCache();
    const pending = deferredJob();
    const caller = new AbortController();
    const result = cache.load("k", caller.signal, pending.job);
    await flush();
    pending.control()!.startUpload();
    caller.abort();
    expect(await result).toMatchObject({ ok: false, failure: { code: "TOOL_ABORTED" } });
    expect(pending.control()!.signal.aborted).toBe(false);
    pending.resolve(ok(7));
    await flush();
    expect(cache.get("k")?.chars).toBe(7);
  });

  it("dispose aborts running jobs, drops queued ones, clears the cache and refuses later loads", async () => {
    const cache = new DocumentCache({ maxLoads: 1 });
    await cache.load("done", never(), async () => ok());
    const running = deferredJob();
    const first = cache.load("a", never(), running.job);
    const queuedJob = vi.fn(async () => ok());
    const queued = cache.load("b", never(), queuedJob);
    await flush();
    cache.dispose();
    expect(running.control()!.signal.aborted).toBe(true);
    expect(await queued).toMatchObject({ ok: false, failure: { code: "TOOL_ABORTED" } });
    running.resolve(ok());
    await first;
    expect(queuedJob).not.toHaveBeenCalled();
    expect(cache.get("done")).toBeUndefined();
    expect(cache.get("a")).toBeUndefined();
    const later = vi.fn(async () => ok());
    expect(await cache.load("c", never(), later)).toMatchObject({ ok: false, failure: { code: "TOOL_ABORTED" } });
    expect(later).not.toHaveBeenCalled();
  });
});
