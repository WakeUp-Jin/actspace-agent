import type { SessionListItem } from "@actspace/shared";
import type { DesktopAppServiceContract } from "@actspace/desktop-app";

/** Workspace admission uses Session facts, never the disposable SQLite index.
 * Avoid recovering every transcript simply to discover workspace bindings. */
export async function readSessionWorkspaceFacts(app: Pick<DesktopAppServiceContract, "sessionQuerySources" | "readSessionEventBatch" | "listSessions">, onFailure: (sessionId: string) => void = () => {}): Promise<SessionListItem[]> {
  const result: SessionListItem[] = [];
  const catalog = await app.sessionQuerySources?.();
  if (!catalog) return (await app.listSessions()).map(session => ({ id: session.sessionId, title: session.metadata.title ?? "New chat", updatedAt: session.updatedAt, agentRunCount: session.completedTurnCount ?? 0, workspaceRoot: session.workspaceRoot ?? undefined, ...(session.worktree ? { worktree: session.worktree } : {}) }));
  for (const id of catalog.failedSessionIds) onFailure(id);
  for (const source of catalog.sources) {
    try {
      const header = source.header;
      let workspaceRoot = header.cwd ?? undefined;
      let cursor: string | undefined;
      // Worktrees always belong to their immutable source workspace.
      if (!header.worktree) for (;;) {
        const batch = await app.readSessionEventBatch(header.sessionId, { throughSeq: source.throughSeq, eventTypes: ["session/workspace-set"], ...(cursor ? { cursor } : {}) });
        for (const event of batch.events) {
          if (event.type !== "session/workspace-set") continue;
          const data = event.data as { workspaceRoot?: unknown };
          if (typeof data.workspaceRoot === "string" && data.workspaceRoot.trim()) workspaceRoot = data.workspaceRoot;
        }
        if (batch.done) break;
        if (batch.cursor === cursor) throw new Error("Session workspace reader made no progress.");
        cursor = batch.cursor;
      }
      result.push({ id: header.sessionId, title: "", updatedAt: header.createdAt, workspaceRoot, agentRunCount: 0, ...(header.worktree ? { worktree: header.worktree } : {}) });
    } catch { onFailure(source.header.sessionId); }
  }
  return result;
}
