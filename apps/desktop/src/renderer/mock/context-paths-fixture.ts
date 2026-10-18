import { CONTEXT_ACTIVE_PATH_LIMIT, selectNextActivePathIds, type ContextDisclosureSummary, type ContextPathEntry, type ContextPathsInput, type ContextPathsPage } from "@actspace/shared";
import { MOCK_WORKSPACE_ROOT } from "./fixtures";

const DIRS = [
  "apps/desktop/src/main/ipc", "apps/desktop/src/main/runtime-v2", "apps/desktop/src/renderer/components/right-panel/context",
  "apps/desktop/src/renderer/mock", "docs/design-docs/frontend", "packages/agent-service/src", "packages/context/disclosure/src",
  "packages/context/engine/src", "packages/core/agent-loop/src", "packages/shared/src",
];
const FILES = ["index.ts", "types.ts", "state.ts", "policy.ts", "paths.ts", "plugin.ts", "compaction.ts", "source.ts", "context-panel.ts", "guards.ts",
  "handlers.ts", "loop.ts", "README.md", "ContextPanel.tsx", "ContextStats.tsx", "task-ledger.ts", "artifact-store.ts", "context-paths.ts"];
const OWNER = "actspace.context-disclosure";
const NOW = Date.parse("2026-10-11T11:00:00.000Z");

export type MockPathSet = { cycle: number; paths: ContextPathEntry[] };

/** 浏览器 mock 的披露路径：确定性生成，`nextCompaction` 用和后端同一个 shared 规则算。 */
export function mockContextPaths(activeCount = 87, sleepingCount = 342, cycle = 4): MockPathSet {
  let seed = activeCount * 31 + sleepingCount + 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool: string[] = [];
  for (const dir of DIRS) for (const file of FILES) pool.push(`${MOCK_WORKSPACE_ROOT}/${dir}/${file}`);
  for (let i = 0; pool.length < activeCount + sleepingCount; i++) pool.push(`${MOCK_WORKSPACE_ROOT}/packages/legacy/module-${String(i).padStart(4, "0")}/index.ts`);
  const entry = (path: string, visibility: ContextPathEntry["visibility"]): ContextPathEntry => {
    const readsInCycle = visibility === "active" ? (random() < 0.55 ? Math.ceil(random() * 6) : 0) : random() < 0.06 ? Math.ceil(random() * 2) : 0;
    const addedCycle = visibility === "active" && random() < 0.25 ? cycle : Math.floor(random() * cycle);
    const lastRead = readsInCycle > 0 ? NOW - Math.floor(random() * 50) * 60_000 : random() < 0.5 ? NOW - Math.floor(2 + random() * 40) * 3_600_000 : null;
    return { id: path, path, owners: [OWNER], visibility, readsInCycle, addedCycle, ...(lastRead ? { lastReadAt: new Date(lastRead).toISOString() } : {}) };
  };
  const paths = [
    ...(activeCount ? [{ id: "journal", path: "/Users/mock/Library/Application Support/ActSpace/sessions/mock/journal.jsonl", description: "Original Session Journal", owners: [OWNER], visibility: "active" as const, readsInCycle: 0, addedCycle: cycle }] : []),
    ...pool.slice(0, Math.max(0, activeCount - 1)).map(path => entry(path, "active")),
    ...pool.slice(Math.max(0, activeCount - 1), activeCount - 1 + sleepingCount).map(path => entry(path, "sleeping")),
  ];
  const next = new Set(selectNextActivePathIds(paths, cycle));
  return { cycle, paths: paths.map(path => {
    const forecast = path.visibility === "active" ? (next.has(path.id) ? undefined : "sleep") : next.has(path.id) ? "wake" : undefined;
    return forecast ? { ...path, nextCompaction: forecast } : path;
  }) };
}

export function mockDisclosureSummary(set: MockPathSet, revision: string): ContextDisclosureSummary {
  return { status: "ready", revision, cycle: set.cycle, activeLimit: CONTEXT_ACTIVE_PATH_LIMIT,
    activeCount: set.paths.filter(path => path.visibility === "active").length, sleepingCount: set.paths.filter(path => path.visibility === "sleeping").length };
}

/** 和后端一样按 path、id 排序分页；游标是偏移量字符串，只在 mock 里用。 */
export function mockContextPathsPage(set: MockPathSet, input: ContextPathsInput): ContextPathsPage {
  const filtered = set.paths.filter(path => path.visibility === input.visibility).sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  const start = Number(input.cursor ?? "0"), end = Math.min(filtered.length, start + Math.min(100, input.limit ?? 50));
  return { revision: input.revision, visibility: input.visibility, total: filtered.length, paths: filtered.slice(start, end), ...(end < filtered.length ? { nextCursor: String(end) } : {}) };
}
