import type { ContextPanelView } from "@actspace/shared";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { mockContextPanelView, mockContextState } from "../context-panel-fixture";
import { longSessionScenario } from "./long-session";

/** Explicit browser-only fixture for conditional reads, catch-up and pagination. */
export function contextPaginationScenario(clock: MockClock): MockHandlers {
  longSessionScenario(clock);
  let reads = 0, failed = true;
  const full = (sessionId: string): ContextPanelView => {
    const view = mockContextPanelView(sessionId, clock.db.sessions.get(sessionId));
    const extra = Array.from({ length: 620 }, (_, i) => ({ key: `demo-tool-${i}`, bucket: "tools" as const, title: `演示工具 ${i}`, estimatedTokens: 10, preview: `显式分页样例 ${i}`, fullTextAvailable: true }));
    view.current.entries.push(...extra); view.current.buckets.tools = (view.current.buckets.tools ?? 0) + 6200; view.current.totalEstimatedTokens += 6200;
    view.current.basis = "current-context"; view.currentVersion = "mock-current";
    view.history = { status: failed ? "unavailable" : reads < 3 ? "syncing" : "ready", indexedThroughSeq: failed ? -1 : reads < 3 ? 10 : 100, targetThroughSeq: 100, indexGeneration: "mock-generation", ...(failed ? { error: "演示：历史索引暂不可用，请重试。" } : {}) };
    if (view.history.status !== "ready") view.stats = null;
    view.versionToken = `mock-${view.history.status}`;
    return view;
  };
  return { sessions: {
    describeContext: async ({ sessionId }) => mockContextState(full(sessionId)),
    describeContextPanel: async input => {
      if (input.release) return null;
      if (input.retry) failed = false;
      reads++;
      const view = full(input.sessionId);
      if (input.versionToken === view.versionToken) return { notModified: true, versionToken: view.versionToken!, history: view.history! };
      const total = view.current.entries.length;
      view.current.entries = view.current.entries.slice(-100);
      view.previous = null;
      view.entriesPage = { revision: "mock-pages", total, truncated: true, nextCursor: "100" };
      return view;
    },
    listContextEntries: async input => {
      if (input.revision !== "mock-pages") throw new Error("明细版本过期，请刷新。");
      const entries = full(input.sessionId).current.entries;
      const start = Number(input.cursor ?? "0"), end = Math.min(entries.length, start + 200);
      return { revision: input.revision, total: entries.length, entries: entries.slice(Math.max(0, entries.length - end), entries.length - start), previous: [], ...(end < entries.length ? { nextCursor: String(end) } : {}) };
    },
    readContextEntry: async input => {
      if (input.revision !== "mock-pages" || !input.key.startsWith("demo-tool-")) throw new Error("原文不可用。");
      return { revision: input.revision, key: input.key, text: input.offset ? "这是原文第二段。" : "这是显式演示工具的原文第一段。", ...(input.offset ? {} : { nextOffset: 65536 }) };
    },
  } };
}
