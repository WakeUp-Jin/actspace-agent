import { disclosurePaths, disclosureSummary, contextPathsPage } from "./context-paths";
import type { ContextPathsInput, ContextPathsPage } from "@actspace/shared";
import { createHash } from "node:crypto";
import type { ContextEntriesInput, ContextEntriesPage, ContextEntryInput, ContextEntryText, ContextPanelEntry, ContextPanelHistory, ContextPanelResponse, ContextPanelView, DescribeContextPanelInput, ManagedContextProjection, ContextState } from "@actspace/shared";
import { getContextBucketDisplay } from "@actspace/shared";
import type { UsageReadModelService } from "./usage-read-model";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";

type Current = { historyVersion: string; projection: ManagedContextProjection | null; version: string; entries: ContextPanelEntry[]; previous: NonNullable<ContextPanelView["previous"]>["entries"]; view: ContextPanelView };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Main only composes already materialized, versioned data. Current reads never
 * wait for global indexing, recover a Session or initiate Context assembly. */
export class ContextPanelService {
  #views = new Map<string, Current>();
  constructor(private readonly runtime: Pick<DesktopRuntimeV2Registry, "readContextProjection" | "readContextEntryText" | "sessionQuerySource">, private readonly history: UsageReadModelService) {}
  async describe(input: DescribeContextPanelInput): Promise<ContextPanelResponse | null> {
    const { sessionId } = input;
    if (input.release) { if (input.consumerId) this.history.releaseContext(sessionId, input.consumerId); return null; }
    const projection = await this.#projection(sessionId);
    let source: Awaited<ReturnType<DesktopRuntimeV2Registry["sessionQuerySource"]>> = null;
    let sourceError = false;
    try { source = await this.runtime.sessionQuerySource(sessionId); } catch { sourceError = true; }
    let indexed: ReturnType<UsageReadModelService["contextHistory"]> | null = null;
    try { indexed = source ? this.history.contextHistory(source, input.consumerId ?? `panel:${sessionId}`, input.retry) : null; } catch { sourceError = true; }
    const result = indexed?.result ?? null;
    const history: ContextPanelHistory = {
      status: indexed?.fallback ? "fallback" : sourceError || indexed?.error || !source ? "unavailable" : indexed?.syncing ? result ? "syncing" : "rebuilding" : result ? "ready" : "unavailable",
      indexedThroughSeq: indexed?.indexedThroughSeq ?? result?.revision ?? -1, targetThroughSeq: source?.throughSeq ?? -1, indexGeneration: result?.generation ?? "uninitialized",
      ...(sourceError || indexed?.error ? { error: "历史索引暂不可用，请重试。" } : {}),
    };
    const currentVersion = projection ? digest([projection.instanceGeneration ?? "legacy", projection.contextRevision, projection.throughJournalSeq, projection.model, projection.manifest?.estimatorVersion]) : `last-request:${result?.generation ?? "none"}:${result?.revision ?? -1}`;
    const versionToken = digest([currentVersion, history, result?.previous?.requestId ?? null]);
    const historyVersion = digest([result?.generation, result?.revision, result?.previous?.requestId]);
    const cached = this.#views.get(sessionId);
    if (input.versionToken && cached && (input.versionToken === versionToken || (input.versionToken === cached.view.versionToken && currentVersion === cached.view.currentVersion && cached.historyVersion === historyVersion && cached.view.history?.status === history.status))) {
      cached.view.versionToken = versionToken; cached.view.history = history;
      return { notModified: true, versionToken, history };
    }
    const manifest = projection?.manifest;
    const prior = result?.previous ?? null;
    const entries = manifest?.entries ?? (prior?.entries ?? []).map(entry => ({ ...entry, title: entry.title ?? "最近请求输入" }));
    const view: ContextPanelView = {
      schemaVersion: 2, sessionId, logicalAgentScopeId: projection?.identity.logicalAgentScopeId ?? result?.logicalAgentScopeId ?? `main:${sessionId}`,
      contextRevision: projection?.contextRevision ?? 0, throughJournalSeq: projection?.throughJournalSeq ?? result?.revision ?? -1,
      currentVersion, versionToken, history, disclosure: disclosureSummary(projection, currentVersion), model: projection?.model ?? result?.model ?? null,
      current: { basis: projection ? "current-context" : prior ? "last-request" : "unavailable", status: manifest ? "ready" : prior ? "stale" : "unavailable", totalEstimatedTokens: manifest?.totalEstimatedTokens ?? prior?.totalEstimatedTokens ?? 0, buckets: manifest?.buckets ?? prior?.buckets ?? {}, entries: [] },
      previous: prior ? { ...prior, entries: [] } : null,
      stats: result && (history.status === "ready" || history.status === "fallback") && result.revision >= history.targetThroughSeq ? result.stats : null,
      trend: result?.trend ?? [], events: result?.events ?? [], ...(result ? { limits: result.limits } : {}),
    };
    const entriesVersion = digest([currentVersion, result?.generation ?? null, prior?.requestId ?? null]);
    const current: Current = { historyVersion, projection, version: entriesVersion, entries, previous: prior?.entries ?? [], view };
    this.#views.delete(sessionId); this.#views.set(sessionId, current);
    while (this.#views.size > 16) this.#views.delete(this.#views.keys().next().value!);
    // Default page keeps the latest messages; totals were computed before paging.
    let limit = 200;
    let page = this.#page(current, { sessionId, revision: entriesVersion, limit });
    const assign = () => { view.current.entries = page.entries; if (view.previous) view.previous.entries = page.previous; view.entriesPage = { revision: entriesVersion, total: page.total, truncated: !!page.nextCursor, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }; };
    assign();
    if (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024) { for (const entry of view.current.entries) delete entry.preview; }
    while (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024 && limit > 1) { limit = Math.max(1, Math.floor(limit / 2)); page = this.#page(current, { sessionId, revision: entriesVersion, limit }); assign(); for (const entry of view.current.entries) delete entry.preview; }
    while (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024 && (view.trend.length || view.events.length)) {
      if (view.trend.length >= view.events.length) { view.trend = view.trend.slice(Math.ceil(view.trend.length / 2)); if (view.limits) view.limits = { ...view.limits, trend: { ...view.limits.trend, truncated: true, returnedCount: view.trend.length, fromSeq: null } }; }
      else { view.events = view.events.slice(0, Math.floor(view.events.length / 2)); if (view.limits) view.limits = { ...view.limits, events: { ...view.limits.events, truncated: true, returnedCount: view.events.length, fromSeq: null } }; }
    }
    if (Buffer.byteLength(JSON.stringify(view)) > 1024 * 1024) throw new Error("Context response exceeds 1 MiB.");
    return view;
  }
  async #projection(sessionId: string): Promise<ManagedContextProjection | null> {
    // A retired or incompatible live Harness must not hide durable request
    // history. Absence is exposed as last-request/unavailable, never live-ready.
    try { return await this.runtime.readContextProjection(sessionId); }
    catch { return null; }
  }
  async listPaths(input: ContextPathsInput): Promise<ContextPathsPage> {
    const cached = this.#views.get(input.sessionId);
    if (!cached || cached.view.currentVersion !== input.revision) throw new Error("Context revision stale; reload the panel.");
    const current = await this.#current(input.sessionId, cached.version);
    const paths = disclosurePaths(current.projection);
    if (paths === null) throw new Error("Context disclosure unavailable.");
    return contextPathsPage(paths, input);
  }
  async listEntries(input: ContextEntriesInput): Promise<ContextEntriesPage> { return this.#page(await this.#current(input.sessionId, input.revision), input); }
  async readEntry(input: ContextEntryInput): Promise<ContextEntryText> {
    const current = await this.#current(input.sessionId, input.revision);
    const entry = current.entries.find(entry => entry.key === input.key);
    const projection = current.projection;
    if (!entry?.fullTextAvailable || !projection || entry.bucket === "conversation" || entry.bucket === "summarizedConversation") throw new Error("Context entry text unavailable.");
    const text = await this.runtime.readContextEntryText(input.sessionId, projection.identity.logicalAgentScopeId, input.key, projection.contextRevision, projection.instanceGeneration ?? "legacy");
    if (text === null) throw new Error("Context entry text unavailable.");
    const bytes = Buffer.from(text); const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length || (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80)) throw new Error("Invalid Context text offset.");
    let end = Math.min(bytes.length, offset + 64 * 1024);
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    return { revision: input.revision, key: input.key, text: bytes.subarray(offset, end).toString("utf8"), ...(end < bytes.length ? { nextOffset: end } : {}) };
  }
  async #current(id: string, revision: string): Promise<Current> {
    const cached = this.#views.get(id);
    if (!cached || cached.version !== revision) throw new Error("Context revision stale; reload the panel.");
    const projection = await this.#projection(id);
    if ((projection?.instanceGeneration ?? null) !== (cached.projection?.instanceGeneration ?? null) || projection?.contextRevision !== cached.projection?.contextRevision || digest([projection?.model, projection?.throughJournalSeq, projection?.manifest?.estimatorVersion]) !== digest([cached.projection?.model, cached.projection?.throughJournalSeq, cached.projection?.manifest?.estimatorVersion])) throw new Error("Context revision stale; reload the panel.");
    return cached;
  }
  #page(current: Current, input: ContextEntriesInput): ContextEntriesPage {
    const query = digest([input.revision, input.bucket ?? null]);
    let offset = 0;
    if (input.cursor) {
      if (input.cursor.length > 1024) throw new Error("Context cursor invalid; reload the panel.");
      try { const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString()); if (parsed.query !== query || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error(); offset = parsed.offset; } catch { throw new Error("Context cursor invalid; reload the panel."); }
    }
    const entries = current.entries.filter(entry => !input.bucket || entry.bucket === input.bucket);
    const previous = current.previous.filter(entry => !input.bucket || entry.bucket === input.bucket);
    const byKey = new Map(entries.map(entry => [entry.key, entry])); const oldKeys = new Map(previous.map(entry => [entry.key, entry]));
    const keys = [...new Set([...entries.map(entry => entry.key).reverse(), ...previous.map(entry => entry.key).reverse()])];
    if (offset > keys.length) throw new Error("Context cursor invalid; reload the panel.");
    if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) throw new Error("Invalid Context page limit.");
    const limit = Math.min(500, input.limit ?? 200);
    let selected = keys.slice(offset, offset + limit).reverse();
    const materialize = (): ContextEntriesPage => { const end = offset + selected.length; return { revision: input.revision, total: keys.length, entries: selected.flatMap(key => { const entry = byKey.get(key); return entry ? [{ ...entry, title: entry.title.slice(0, 80), ...(entry.preview ? { preview: entry.preview.slice(0, 600) } : {}) }] : []; }), previous: selected.flatMap(key => { const entry = oldKeys.get(key); return entry ? [entry] : []; }), ...(end < keys.length ? { nextCursor: Buffer.from(JSON.stringify({ query, offset: end })).toString("base64url") } : {}) }; };
    let page = materialize();
    while (Buffer.byteLength(JSON.stringify(page)) > 200 * 1024 && selected.length > 1) { selected = selected.slice(Math.ceil(selected.length / 2)); page = materialize(); }
    if (Buffer.byteLength(JSON.stringify(page)) > 1024 * 1024) throw new Error("Context page exceeds 1 MiB.");
    return page;
  }
  /** Composer reuses the same light projection and never reads the full Journal. */
  async describeComposer(sessionId: string): Promise<ContextState | null> {
    const projection = await this.#projection(sessionId);
    const cached = this.#views.get(sessionId)?.view;
    const manifest = projection?.manifest ?? (cached?.previous ? { ...cached.previous, estimatorVersion: cached.previous.estimatorVersion ?? "legacy" } : null);
    if (!manifest) return null;
    const maxTokens = projection?.model?.contextWindow ?? cached?.model?.contextWindow ?? 0;
    return { sessionId, throughJournalSeq: projection?.throughJournalSeq ?? cached?.throughJournalSeq, updatedAt: new Date().toISOString(), basis: projection ? "current-request" : "last-request", estimator: { name: "context-engine", version: manifest.estimatorVersion }, totalEstimatedTokens: manifest.totalEstimatedTokens, maxTokens, percentUsed: maxTokens > 0 ? Math.min(100, manifest.totalEstimatedTokens / maxTokens * 100) : 0, buckets: Object.entries(manifest.buckets).map(([name, tokens]) => ({ key: name as import("@actspace/shared").ContextUsageBucketName, name: name as import("@actspace/shared").ContextUsageBucketName, label: getContextBucketDisplay(name).label, tokens })), entries: [] };
  }
}
