// @vitest-environment node
import { expect, it } from "vitest";
import type { SessionQuerySource } from "@actspace/session-storage";
import { UsageCatalogFallback } from "../runtime-v2/usage-catalog-fallback";
import { prepare } from "../runtime-v2/usage-sql";

type Lineage = SessionQuerySource["header"]["lineage"];
const source = (sessionId: string, lineage: Lineage = null) => ({ header: { sessionId, createdAt: "2026-10-21T00:00:00.000Z", cwd: "/w", lineage, createdWith: { profileId: "test", presetId: "actspace.main", initialAgentMode: "agent" } }, throughSeq: -1, stamp: sessionId }) as unknown as SessionQuerySource;
const row = (querySource: SessionQuerySource) => ({ sessionId: querySource.header.sessionId, title: querySource.header.sessionId, revision: -1, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z", workspaceRoot: "/w", pinned: false, archived: false, accessState: "read-write", isChildSession: false, agentRunCount: 0, querySource });
const lineage = (origin: "side-chat" | "fork"): Lineage => ({ parentSessionId: "main", parentBoundarySeq: 3, origin, delegationDepth: 0 });

it("records the side chat parent from the Session header and counts it on the parent", () => {
  const fallback = new UsageCatalogFallback();
  try {
    for (const item of [source("main"), source("side", lineage("side-chat")), source("fork", lineage("fork"))]) fallback.append(row(item), [], true);
    const visible = prepare(fallback.database, "SELECT session_id,is_child_session,(SELECT COUNT(*) FROM session_catalog AS side WHERE side.side_chat_parent_id=session_catalog.session_id AND side.archived=0) AS side_chat_count FROM session_catalog WHERE side_chat_parent_id IS NULL ORDER BY session_id").all();
    expect(visible).toEqual([
      // 只有 delegation 算子会话；普通分叉照常进侧栏。
      { session_id: "fork", is_child_session: 0, side_chat_count: 0 },
      { session_id: "main", is_child_session: 0, side_chat_count: 1 },
    ]);
    expect(prepare(fallback.database, "SELECT side_chat_parent_id FROM session_catalog WHERE session_id='side'").get()).toEqual({ side_chat_parent_id: "main" });
  } finally { fallback.close(); }
});
