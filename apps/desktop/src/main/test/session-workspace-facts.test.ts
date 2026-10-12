import { expect, it, vi } from "vitest";
import { readSessionWorkspaceFacts } from "../runtime-v2/session-workspace-facts";

it("restores workspace changes from bounded Session batches without transcript recovery or SQLite", async () => {
  const read = vi.fn(async (_id: string, input: { cursor?: string }) => input.cursor
    ? { events: [{ type: "session/workspace-set", data: { workspaceRoot: "/new" } }], cursor: "2", done: true }
    : { events: [{ type: "assistant/message", data: {} }], cursor: "1", done: false });
  const app = { sessionQuerySources: async () => ({ failedSessionIds: [], sources: [{ header: { sessionId: "s", createdAt: "today", cwd: "/old" }, throughSeq: 1 }] }), readSessionEventBatch: read };
  const result = await readSessionWorkspaceFacts(app as never);
  expect(result[0]?.workspaceRoot).toBe("/new");
  expect(read.mock.calls.map(call => call[1].cursor)).toEqual([undefined, "1"]);
});

it("uses immutable worktree bindings without reading their event bodies", async () => {
  const read = vi.fn();
  const worktree = { sourceWorkspaceRoot: "/source", workspaceRoot: "/tree" };
  const app = { sessionQuerySources: async () => ({ failedSessionIds: [], sources: [{ header: { sessionId: "s", createdAt: "today", cwd: "/tree", worktree }, throughSeq: 1 }] }), readSessionEventBatch: read };
  expect((await readSessionWorkspaceFacts(app as never))[0]?.worktree).toEqual(worktree);
  expect(read).not.toHaveBeenCalled();
});

it("isolates an unreadable Session while restoring healthy workspace facts", async () => {
  const app = {
    sessionQuerySources: async () => ({ failedSessionIds: [], sources: ["broken", "healthy"].map(sessionId => ({ header: { sessionId, createdAt: "today", cwd: `/${sessionId}` }, throughSeq: 0 })) }),
    readSessionEventBatch: async (id: string) => { if (id === "broken") throw new Error("invalid Journal"); return { events: [], cursor: "0", done: true }; },
  };
  const failures = vi.fn();
  const result = await readSessionWorkspaceFacts(app as never, failures);
  expect(result.map(row => row.id)).toEqual(["healthy"]);
  expect(failures).toHaveBeenCalledWith("broken");
});

it("keeps the original Session path when the provider lacks optional query capabilities", async () => {
  const read = vi.fn();
  const app = { sessionQuerySources: async () => null, readSessionEventBatch: read, listSessions: async () => [{ sessionId: "legacy", metadata: { title: "Legacy" }, updatedAt: "today", workspaceRoot: "/legacy" }] };
  expect((await readSessionWorkspaceFacts(app as never))[0]?.workspaceRoot).toBe("/legacy");
  expect(read).not.toHaveBeenCalled();
});
