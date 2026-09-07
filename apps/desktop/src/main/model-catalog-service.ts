import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { type CatalogSource, type ModelCatalogSnapshot, type ModelCatalogStatus } from "@actspace/shared";

export const MODEL_CATALOG_TTL_MS = 4 * 60 * 60 * 1000;
const SOURCES: Record<CatalogSource, string> = { "models.dev": "https://models.dev/api.json", openrouter: "https://openrouter.ai/api/v1/models" };
type Cache = ModelCatalogSnapshot & { source: CatalogSource; checkedAt: number; etag?: string; lastModified?: string };
type Parsed = Pick<ModelCatalogSnapshot, "entries" | "contentHash">;
type Options = { dataRoot: string; fetch?: typeof fetch; now?: () => number; parse?: (source: CatalogSource, text: string, signal: AbortSignal) => Promise<Parsed> };

/** Public pricing only. No credentials, usage or custom connection URLs cross this boundary. */
export class ModelCatalogService {
  readonly #cache = new Map<CatalogSource, Cache>();
  readonly #inflight = new Map<CatalogSource, Promise<void>>();
  readonly #attempts = new Map<CatalogSource, number>();
  readonly #abort = new AbortController();
  readonly #errors = new Map<CatalogSource, string>();
  #snapshot: ModelCatalogSnapshot | undefined;
  constructor(private readonly options: Options) {}
  private now(): number { return this.options.now?.() ?? Date.now(); }
  private path(source: CatalogSource): string { return join(this.options.dataRoot, "model-catalog", `${source}.json`); }

  async load(): Promise<void> {
    await Promise.all(Object.keys(SOURCES).map(async (source: CatalogSource) => {
      try {
        const text = await readFile(this.path(source), "utf8");
        if (Buffer.byteLength(text) > 16 * 1024 * 1024) return;
        const value = JSON.parse(text) as Cache;
        if (value.schemaVersion !== 1 || value.source !== source || !Array.isArray(value.entries) || !value.entries.length || !Number.isFinite(value.checkedAt) || value.checkedAt > this.now() + 60_000) return;
        if (!Number.isFinite(Date.parse(value.generatedAt)) || Date.parse(value.generatedAt) > this.now() + 60_000) return;
        if (createHash("sha256").update(JSON.stringify(value.entries)).digest("hex") !== value.contentHash) return;
        if (!value.entries.every((row) => row.source === source && typeof row.apiModel === "string" && (row.currency === "USD" || row.currency === "CNY") && typeof row.unsupportedBilling === "boolean" && row.rates && [row.rates.input, row.rates.output, row.rates.cacheRead, row.rates.cacheWrite].every((rate) => rate === null || typeof rate === "number" && Number.isFinite(rate) && rate >= 0))) return;
        this.#cache.set(source, value);
        this.#snapshot = undefined;
      } catch { /* A missing or damaged derived cache falls back to the shipped catalogue. */ }
    }));
  }

  snapshot(): ModelCatalogSnapshot {
    if (this.#snapshot) return this.#snapshot;
    const entries = Object.keys(SOURCES).flatMap((source: CatalogSource) => {
      const cache = this.#cache.get(source);
      const current = cache && Date.parse(cache.generatedAt) >= Date.parse(BUILTIN_MODEL_CATALOG.generatedAt) ? cache : BUILTIN_MODEL_CATALOG;
      return current.entries.filter((row) => row.source === source).map((row) => ({ ...row, fetchedAt: current.generatedAt }));
    });
    return this.#snapshot = { schemaVersion: 1, entries, generatedAt: [...this.#cache.values()].reduce((date, row) => row.generatedAt > date ? row.generatedAt : date, BUILTIN_MODEL_CATALOG.generatedAt), contentHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex") };
  }
  status(): ModelCatalogStatus { const snapshot = this.snapshot(); return { state: this.#inflight.size ? "updating" : this.#errors.size ? "failed" : "idle", updatedAt: snapshot.generatedAt, entries: snapshot.entries, ...(this.#errors.size ? { error: [...this.#errors.values()].join(" ") } : {}) }; }
  async refresh(force = false): Promise<ModelCatalogStatus> {
    if (this.#abort.signal.aborted) return this.status();
    await Promise.all(Object.keys(SOURCES).map((source: CatalogSource) => {
      const existing = this.#inflight.get(source);
      if (existing) return existing;
      const cache = this.#cache.get(source);
      if (!force && (this.now() - (cache?.checkedAt ?? Date.parse(BUILTIN_MODEL_CATALOG.generatedAt)) < MODEL_CATALOG_TTL_MS || this.now() - (this.#attempts.get(source) ?? 0) < 300_000)) return;
      this.#attempts.set(source, this.now());
      const task = this.refreshSource(source).catch(() => { this.#errors.set(source, "更新失败，仍使用本地价目。"); }).finally(() => this.#inflight.delete(source));
      this.#inflight.set(source, task);
      return task;
    }));
    return this.status();
  }
  dispose(): void { this.#abort.abort(); }

  private async refreshSource(source: CatalogSource): Promise<void> {
    const deadline = AbortSignal.any([this.#abort.signal, AbortSignal.timeout(15_000)]);
    const old = this.#cache.get(source);
    let next: Cache | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(4_000)]);
      let response: Response;
      try {
        response = await (this.options.fetch ?? fetch)(SOURCES[source], { signal, headers: { accept: "application/json", ...(old?.entries.length && old.etag ? { "if-none-match": old.etag } : {}), ...(old?.entries.length && old.lastModified ? { "if-modified-since": old.lastModified } : {}) } });
      } catch (error) { if (attempt === 0 && !deadline.aborted) continue; throw error; }
      if (response.status === 304 && old?.entries.length) { next = { ...old, checkedAt: this.now() }; break; }
      if (response.status >= 500 && attempt === 0) { await response.body?.cancel(); continue; }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Catalog HTTP ${response.status}`); }
      if (Number(response.headers.get("content-length")) > 16 * 1024 * 1024) { await response.body?.cancel(); throw new Error("Catalog too large"); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Catalog body missing");
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error("Catalog too large"); } chunks.push(chunk.value); }
      const parsed = await (this.options.parse ?? parseInWorker)(source, Buffer.concat(chunks).toString("utf8"), deadline);
      if (!parsed.entries.length) throw new Error("Catalog empty");
      next = { ...parsed, schemaVersion: 1, source, generatedAt: new Date(this.now()).toISOString(), checkedAt: this.now(), etag: response.headers.get("etag") ?? undefined, lastModified: response.headers.get("last-modified") ?? undefined };
      break;
    }
    deadline.throwIfAborted();
    if (!next) throw new Error("Catalog unavailable");
    await mkdir(join(this.options.dataRoot, "model-catalog"), { recursive: true });
    const path = this.path(source); const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    deadline.throwIfAborted();
    await rename(temporary, path);
    this.#cache.set(source, next);
    this.#errors.delete(source);
    this.#snapshot = undefined;
  }
}

function parseInWorker(source: CatalogSource, text: string, signal: AbortSignal): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Catalog aborted")); return; }
    const worker = new Worker(join(__dirname, "model-catalog-worker.js"), { workerData: { source, text } });
    const cleanup = () => { signal.removeEventListener("abort", abort); void worker.terminate(); };
    const abort = () => { cleanup(); reject(new Error("Catalog aborted")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.once("message", (result) => { cleanup(); result.error ? reject(new Error(result.error)) : resolve(result); });
    worker.once("error", (error) => { cleanup(); reject(error); });
    worker.once("exit", (code) => { if (code !== 0) reject(new Error("Catalog worker stopped")); });
  });
}
