import { disclosurePaths, disclosureSummary, contextPathsPage } from "./context-paths";
import type { ContextPathsInput, ContextPathsPage } from "@actspace/shared";
import { createHash } from "node:crypto";
import type {
  ContextEntriesInput,
  ContextEntriesPage,
  ContextEntryInput,
  ContextEntryText,
  ContextEstimateView,
  ContextPanelBucketKey,
  ContextPanelEntry,
  ContextPanelHistory,
  ContextPanelResponse,
  ContextPanelView,
  ContextSurfaceNodeInput,
  DescribeContextPanelInput,
  ManagedContextProjection,
} from "@actspace/shared";
import { contextEstimateSummaryKeys, describeConversationNode } from "@actspace/shared";
import type { UsageReadModelService } from "./usage-read-model";
import type { DesktopRuntimeRegistry } from "./runtime-registry";

type Current = {
  historyVersion: string;
  projection: ManagedContextProjection | null;
  version: string;
  entries: ContextPanelEntry[];
  previous: NonNullable<ContextPanelView["previous"]>["entries"];
  view: ContextPanelView;
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Main only composes already materialized, versioned data. Current reads never
 * wait for global indexing, recover a Session or initiate Context assembly. */
export class ContextPanelService {
  #views = new Map<string, Current>();
  constructor(
    private readonly runtime: Pick<
      DesktopRuntimeRegistry,
      "readContextProjection" | "readContextEntryText" | "sessionQuerySource" | "readSessionProjectionValue"
    >,
    private readonly history: UsageReadModelService,
  ) {}
  async describe(input: DescribeContextPanelInput): Promise<ContextPanelResponse | null> {
    const { sessionId } = input;
    if (input.release) {
      if (input.consumerId) this.history.releaseContext(sessionId, input.consumerId);
      return null;
    }
    const projection = await this.#projection(sessionId);
    const estimate = await this.#estimate(sessionId);
    let source: Awaited<ReturnType<DesktopRuntimeRegistry["sessionQuerySource"]>> = null;
    let sourceError = false;
    try {
      source = await this.runtime.sessionQuerySource(sessionId);
    } catch {
      sourceError = true;
    }
    let indexed: ReturnType<UsageReadModelService["contextHistory"]> | null = null;
    try {
      indexed = source
        ? this.history.contextHistory(source, input.consumerId ?? `panel:${sessionId}`, input.retry)
        : null;
    } catch {
      sourceError = true;
    }
    const result = indexed?.result ?? null;
    const history: ContextPanelHistory = {
      status: indexed?.fallback
        ? "fallback"
        : sourceError || indexed?.error || !source
          ? "unavailable"
          : indexed?.syncing
            ? result
              ? "syncing"
              : "rebuilding"
            : result
              ? "ready"
              : "unavailable",
      indexedThroughSeq: indexed?.indexedThroughSeq ?? result?.revision ?? -1,
      targetThroughSeq: source?.throughSeq ?? -1,
      indexGeneration: result?.generation ?? "uninitialized",
      ...(sourceError || indexed?.error ? { error: "历史索引暂不可用，请重试。" } : {}),
    };
    const currentVersion =
      estimate || projection
        ? digest([
            estimate?.throughJournalSeq ?? null,
            estimate?.estimatorVersion ?? null,
            projection?.instanceGeneration ?? null,
            projection?.contextRevision ?? null,
            projection?.throughJournalSeq ?? null,
            projection?.model ?? null,
          ])
        : `last-request:${result?.generation ?? "none"}:${result?.revision ?? -1}`;
    const versionToken = digest([currentVersion, history, result?.previous?.requestId ?? null]);
    const historyVersion = digest([result?.generation, result?.revision, result?.previous?.requestId]);
    const cached = this.#views.get(sessionId);
    if (
      input.versionToken &&
      cached &&
      (input.versionToken === versionToken ||
        (input.versionToken === cached.view.versionToken &&
          currentVersion === cached.view.currentVersion &&
          cached.historyVersion === historyVersion &&
          cached.view.history?.status === history.status))
    ) {
      cached.view.versionToken = versionToken;
      cached.view.history = history;
      return { notModified: true, versionToken, history };
    }
    const prior = result?.previous ?? null;
    // 总数、分类、非对话明细来自 contextEstimate 投影；对话明细按需现算（agent-spec-request-record.md §6.3.2）。
    const described = estimate ? await this.#currentEntries(sessionId, estimate, projection) : null;
    const entries =
      described?.entries ?? (prior?.entries ?? []).map((entry) => ({ ...entry, title: entry.title ?? "最近请求输入" }));
    // 对比上一次请求：非对话项来自历史投影；对话项不逐条存，当前对话里在那次请求之前已有的项就是当时的项，之后的算新增。
    const priorSeq = prior?.seq;
    const previousEntries = prior
      ? [
          ...prior.entries,
          ...(described && priorSeq !== undefined
            ? entries
                .filter((entry) => (described.conversationSeqs.get(entry.key) ?? Infinity) <= priorSeq)
                .map(({ key, bucket, estimatedTokens, title, kind, trajectoryRef }) => ({
                  key,
                  bucket,
                  estimatedTokens,
                  title,
                  ...(kind ? { kind } : {}),
                  ...(trajectoryRef ? { trajectoryRef } : {}),
                }))
            : []),
        ]
      : [];
    // 累计数字只在索引追上日志时给出，避免显示半截的统计。
    const caughtUp =
      !!result &&
      (history.status === "ready" || history.status === "fallback") &&
      result.revision >= history.targetThroughSeq;
    const view: ContextPanelView = {
      schemaVersion: 2,
      sessionId,
      logicalAgentScopeId:
        projection?.identity.logicalAgentScopeId ?? result?.logicalAgentScopeId ?? `main:${sessionId}`,
      contextRevision: projection?.contextRevision ?? 0,
      throughJournalSeq: Math.max(
        estimate?.throughJournalSeq ?? -1,
        projection?.throughJournalSeq ?? -1,
        estimate || projection ? -1 : (result?.revision ?? -1),
      ),
      currentVersion,
      versionToken,
      history,
      disclosure: disclosureSummary(projection, currentVersion),
      model: estimate?.model ?? projection?.model ?? result?.model ?? null,
      current: {
        basis: estimate ? "current-context" : prior ? "last-request" : "unavailable",
        status: estimate ? "ready" : prior ? "stale" : "unavailable",
        totalEstimatedTokens: estimate?.totalEstimatedTokens ?? prior?.totalEstimatedTokens ?? 0,
        buckets: estimate ? { ...estimate.buckets } : (prior?.buckets ?? {}),
        entries: [],
      },
      previous: prior ? { ...prior, entries: [] } : null,
      stats: caughtUp ? result.stats : null,
      bash: caughtUp ? result.bash : null,
      trend: result?.trend ?? [],
      events: result?.events ?? [],
      ...(result ? { limits: result.limits } : {}),
    };
    const entriesVersion = digest([currentVersion, result?.generation ?? null, prior?.requestId ?? null]);
    const current: Current = {
      historyVersion,
      projection,
      version: entriesVersion,
      entries,
      previous: previousEntries,
      view,
    };
    this.#views.delete(sessionId);
    this.#views.set(sessionId, current);
    while (this.#views.size > 16) this.#views.delete(this.#views.keys().next().value!);
    // Default page keeps the latest messages; totals were computed before paging.
    let limit = 200;
    let page = this.#page(current, { sessionId, revision: entriesVersion, limit });
    const assign = () => {
      view.current.entries = page.entries;
      if (view.previous) view.previous.entries = page.previous;
      view.entriesPage = {
        revision: entriesVersion,
        total: page.total,
        truncated: !!page.nextCursor,
        ...(page.bucketCounts ? { bucketCounts: page.bucketCounts } : {}),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    };
    assign();
    if (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024) {
      for (const entry of view.current.entries) delete entry.preview;
    }
    while (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024 && limit > 1) {
      limit = Math.max(1, Math.floor(limit / 2));
      page = this.#page(current, { sessionId, revision: entriesVersion, limit });
      assign();
      for (const entry of view.current.entries) delete entry.preview;
    }
    while (Buffer.byteLength(JSON.stringify(view)) > 200 * 1024 && (view.trend.length || view.events.length)) {
      if (view.trend.length >= view.events.length) {
        view.trend = view.trend.slice(Math.ceil(view.trend.length / 2));
        if (view.limits)
          view.limits = {
            ...view.limits,
            trend: { ...view.limits.trend, truncated: true, returnedCount: view.trend.length, fromSeq: null },
          };
      } else {
        view.events = view.events.slice(0, Math.floor(view.events.length / 2));
        if (view.limits)
          view.limits = {
            ...view.limits,
            events: { ...view.limits.events, truncated: true, returnedCount: view.events.length, fromSeq: null },
          };
      }
    }
    if (Buffer.byteLength(JSON.stringify(view)) > 1024 * 1024) throw new Error("Context response exceeds 1 MiB.");
    return view;
  }
  async #estimate(sessionId: string): Promise<ContextEstimateView | null> {
    try {
      return (
        ((await this.runtime.readSessionProjectionValue(sessionId, "contextEstimate")) as
          | ContextEstimateView
          | undefined) ?? null
      );
    } catch {
      return null;
    }
  }
  /**
   * 非对话项用投影的估算，预览、全文向在线引擎按 key 取；对话项引擎在线时用引擎实例，
   * 否则用日志折叠出的当前对话现算。只在打开面板、翻页时算。
   */
  async #currentEntries(
    sessionId: string,
    estimate: ContextEstimateView,
    projection: ManagedContextProjection | null,
  ): Promise<{ entries: ContextPanelEntry[]; conversationSeqs: Map<string, number> }> {
    const engine = new Map((projection?.manifest?.entries ?? []).map((entry) => [entry.key, entry]));
    const staticEntries = estimate.entries.map((entry) => {
      const live = engine.get(entry.key);
      return {
        ...entry,
        ...(live?.preview ? { preview: live.preview } : {}),
        ...(live?.fullTextAvailable ? { fullTextAvailable: true } : {}),
      };
    });
    let surface:
      | {
          readonly entries?: readonly {
            readonly node: ContextSurfaceNodeInput;
            readonly sourceEventSeqs?: readonly number[];
          }[];
        }
      | undefined;
    try {
      surface = (await this.runtime.readSessionProjectionValue(sessionId, "surface")) as typeof surface;
    } catch {
      surface = undefined;
    }
    // 每个对话项最晚的来源 seq，用来和上一次请求对比。
    const summaryKeys = contextEstimateSummaryKeys(estimate);
    const conversationSeqs = new Map<string, number>();
    const journal: ContextPanelEntry[] = [];
    for (const item of surface?.entries ?? []) {
      const seq = Math.max(-1, ...(item.sourceEventSeqs ?? []));
      for (const { entry } of describeConversationNode(item.node, summaryKeys.get(item.node.messageId))) {
        conversationSeqs.set(entry.key, seq);
        journal.push(entry);
      }
    }
    const live = projection?.manifest?.entries.filter(
      (entry) => entry.bucket === "conversation" || entry.bucket === "summarizedConversation",
    );
    return { entries: [...staticEntries, ...(live ?? journal)], conversationSeqs };
  }
  async #projection(sessionId: string): Promise<ManagedContextProjection | null> {
    // A retired or incompatible live Harness must not hide durable request
    // history. Absence is exposed as last-request/unavailable, never live-ready.
    try {
      return await this.runtime.readContextProjection(sessionId);
    } catch {
      return null;
    }
  }
  async listPaths(input: ContextPathsInput): Promise<ContextPathsPage> {
    const cached = this.#views.get(input.sessionId);
    if (!cached || cached.view.currentVersion !== input.revision)
      throw new Error("Context revision stale; reload the panel.");
    const current = await this.#current(input.sessionId, cached.version);
    const paths = disclosurePaths(current.projection);
    if (paths === null) throw new Error("Context disclosure unavailable.");
    return contextPathsPage(paths, input);
  }
  async listEntries(input: ContextEntriesInput): Promise<ContextEntriesPage> {
    return this.#page(await this.#current(input.sessionId, input.revision), input);
  }
  async readEntry(input: ContextEntryInput): Promise<ContextEntryText> {
    const current = await this.#current(input.sessionId, input.revision);
    const entry = current.entries.find((entry) => entry.key === input.key);
    const projection = current.projection;
    if (
      !entry?.fullTextAvailable ||
      !projection ||
      entry.bucket === "conversation" ||
      entry.bucket === "summarizedConversation"
    )
      throw new Error("Context entry text unavailable.");
    const text = await this.runtime.readContextEntryText(
      input.sessionId,
      projection.identity.logicalAgentScopeId,
      input.key,
      projection.contextRevision,
      projection.instanceGeneration ?? "legacy",
    );
    if (text === null) throw new Error("Context entry text unavailable.");
    const bytes = Buffer.from(text);
    const offset = input.offset ?? 0;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > bytes.length ||
      (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)
    )
      throw new Error("Invalid Context text offset.");
    let end = Math.min(bytes.length, offset + 64 * 1024);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    return {
      revision: input.revision,
      key: input.key,
      text: bytes.subarray(offset, end).toString("utf8"),
      ...(end < bytes.length ? { nextOffset: end } : {}),
    };
  }
  async #current(id: string, revision: string): Promise<Current> {
    const cached = this.#views.get(id);
    if (!cached || cached.version !== revision) throw new Error("Context revision stale; reload the panel.");
    const projection = await this.#projection(id);
    if (
      (projection?.instanceGeneration ?? null) !== (cached.projection?.instanceGeneration ?? null) ||
      projection?.contextRevision !== cached.projection?.contextRevision ||
      digest([projection?.model, projection?.throughJournalSeq, projection?.manifest?.estimatorVersion]) !==
        digest([
          cached.projection?.model,
          cached.projection?.throughJournalSeq,
          cached.projection?.manifest?.estimatorVersion,
        ])
    )
      throw new Error("Context revision stale; reload the panel.");
    return cached;
  }
  #page(current: Current, input: ContextEntriesInput): ContextEntriesPage {
    const query = digest([input.revision, input.bucket ?? null]);
    let offset = 0;
    if (input.cursor) {
      if (input.cursor.length > 1024) throw new Error("Context cursor invalid; reload the panel.");
      try {
        const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
        if (parsed.query !== query || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error();
        offset = parsed.offset;
      } catch {
        throw new Error("Context cursor invalid; reload the panel.");
      }
    }
    const entries = current.entries.filter((entry) => !input.bucket || entry.bucket === input.bucket);
    const previous = current.previous.filter((entry) => !input.bucket || entry.bucket === input.bucket);
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    const oldKeys = new Map(previous.map((entry) => [entry.key, entry]));
    // 非对话条目（含上次请求有、这次没有的）全部放在首页；对话条目按新到旧往后翻，游标偏移只数对话条目（规范 §3）。
    const paged = (entry: { bucket: string }) => entry.bucket === "conversation";
    const fixed = [
      ...new Set([
        ...entries.filter((entry) => !paged(entry)).map((entry) => entry.key),
        ...previous.filter((entry) => !paged(entry)).map((entry) => entry.key),
      ]),
    ];
    const keys = [
      ...new Set([
        ...entries
          .filter(paged)
          .map((entry) => entry.key)
          .reverse(),
        ...previous
          .filter(paged)
          .map((entry) => entry.key)
          .reverse(),
      ]),
    ];
    const bucketCounts: Partial<Record<ContextPanelBucketKey, number>> = {};
    for (const entry of entries) bucketCounts[entry.bucket] = (bucketCounts[entry.bucket] ?? 0) + 1;
    if (offset > keys.length) throw new Error("Context cursor invalid; reload the panel.");
    if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1))
      throw new Error("Invalid Context page limit.");
    let take = Math.min(500, input.limit ?? 200);
    const materialize = (): ContextEntriesPage => {
      const end = Math.min(keys.length, offset + take);
      // 页内按上下文顺序（旧在前）：前端把下一页拼在已有条目前面。
      const selected = [...(offset === 0 ? fixed : []), ...keys.slice(offset, end).reverse()];
      return {
        revision: input.revision,
        total: fixed.length + keys.length,
        bucketCounts,
        entries: selected.flatMap((key) => {
          const entry = byKey.get(key);
          return entry
            ? [
                {
                  ...entry,
                  title: entry.title.slice(0, 80),
                  ...(entry.preview ? { preview: entry.preview.slice(0, 600) } : {}),
                },
              ]
            : [];
        }),
        previous: selected.flatMap((key) => {
          const entry = oldKeys.get(key);
          return entry ? [entry] : [];
        }),
        ...(end < keys.length
          ? { nextCursor: Buffer.from(JSON.stringify({ query, offset: end })).toString("base64url") }
          : {}),
      };
    };
    let page = materialize();
    while (Buffer.byteLength(JSON.stringify(page)) > 200 * 1024 && take > 1) {
      take = Math.ceil(take / 2);
      page = materialize();
    }
    if (Buffer.byteLength(JSON.stringify(page)) > 1024 * 1024) throw new Error("Context page exceeds 1 MiB.");
    return page;
  }
}
