import { expect, it, vi } from "vitest";
import { HostRpc } from "../rpc.js";
import type { HostRpcOptions } from "../rpc.js";
import type { HostRequestContext } from "../server.js";
const context: HostRequestContext = { deviceId: "d", connectionId: "c", notify() {}, onClose() {}, afterReply() {} };
it("keeps ordinary attachments as artifact references instead of exposing Host paths in user text", async () => {
  const submitTask = vi.fn();
  const rpc = new HostRpc({ state: () => "ready", application: { submitTask, taskCommand: async () => ({ snapshot: { tasks: [] } }), inspectSession: async () => ({}) }, uploads: { pin: async () => [{ id: "file", name: "notes.txt" }], resolve: async () => ({ mediaType: "text/plain", path: "/private/host/uploads/file" }) } } as unknown as HostRpcOptions);
  await rpc.dispatch("tasks.submit", { sessionId: "s", submissionId: "id", content: "read it", uploadIds: ["file"] }, context);
  expect(submitTask.mock.calls[0]?.[2].prepared).toEqual([{ type: "text", text: "read it" }, { type: "artifact", artifact: { artifactId: "file", mediaType: "text/plain" }, label: "notes.txt" }]);
});
it("rejects unadvertised model selection, arbitrary paths and new work during maintenance", async () => {
  const submitTask = vi.fn(), taskCommand = vi.fn(); let state: "ready" | "draining" = "ready";
  const options = { application: { submitTask, taskCommand }, config: { workspaces: [{ id: "main", path: "/workspace" }], providers: [{ id: "p", models: ["m"] }] }, state: () => state } as unknown as HostRpcOptions;
  const rpc = new HostRpc(options);
  await expect(rpc.dispatch("tasks.command", { sessionId: "s", op: "configure", configuration: { model: "other/model" } }, context)).rejects.toThrow("not published");
  await expect(rpc.dispatch("sessions.create", { workspaceId: "main", workspaceRoot: "/private" }, context)).rejects.toThrow("Unexpected");
  expect(taskCommand).not.toHaveBeenCalled(); state = "draining";
  await expect(rpc.dispatch("tasks.submit", { sessionId: "s", submissionId: "one", content: "hello" }, context)).rejects.toMatchObject({ kind: "MAINTENANCE" });
  expect(submitTask).not.toHaveBeenCalled();
  await rpc.dispatch("tasks.command", { sessionId: "s", op: "stop", runId: "r" }, context);
  expect(taskCommand).toHaveBeenCalledWith({ sessionId: "s", op: "stop", runId: "r" });
});
it("validates response ownership before accepting a reference and reuses accepted content without revalidation", async () => {
  const annotation = { annotationId: "a", assistantMessageId: "v2-2", selectedText: "reply", startOffset: 0, endOffset: 5, prefixContext: "", suffixContext: "" };
  let tasks: unknown[] = [], valid = false;
  const submitTask = vi.fn(async (_session, submissionId, content) => { tasks = [{ submissionId, content }]; return { accepted: true }; });
  const readSessionProjection = vi.fn(async () => ({ window: { events: valid ? [{ seq: 2, type: "assistant/message", surface: { kind: "append", node: { kind: "assistant" } } }] : [] } }));
  const rpc = new HostRpc({ state: () => "ready", application: { submitTask, taskCommand: async () => ({ snapshot: { tasks } }), inspectSession: async () => ({ throughJournalSeq: 2 }), readSessionProjection } } as unknown as HostRpcOptions);
  const input = { sessionId: "s", submissionId: "id", content: "", responseAnnotations: [annotation] };
  await expect(rpc.dispatch("tasks.submit", input, context)).rejects.toThrow("annotation_source_missing");
  expect(submitTask).not.toHaveBeenCalled(); valid = true;
  await rpc.dispatch("tasks.submit", input, context); const accepted = submitTask.mock.calls[0]![2];
  valid = false; await rpc.dispatch("tasks.submit", input, context);
  expect(submitTask.mock.calls[1]![2]).toEqual(accepted);
  await expect(rpc.dispatch("tasks.submit", { ...input, content: "changed" }, context)).rejects.toThrow("different content");
});
it("paginates each workspace and pin group without duplicating the next page", async () => {
  const items = Array.from({ length: 15 }, (_, index) => ({ sessionId: `s${String(index).padStart(2, "0")}`, updatedAt: "2026-10-04", metadata: { title: `Session ${index}`, archived: false, pinned: false }, workspaceRoot: "/workspace", lineage: null, agentMode: "agent", agentForm: "agent" }));
  const rpc = new HostRpc({ state: () => "ready", application: { listSessions: async () => items } } as unknown as HostRpcOptions);
  const first = await rpc.dispatch("sessions.browse", {}, context) as import("@actspace/shared").SessionListPage;
  expect(first.items).toHaveLength(10); expect(first.groups[0]?.hasMore).toBe(true);
  const second = await rpc.dispatch("sessions.browse", { workspaceRoot: "/workspace", pinned: false, after: first.items.at(-1)!.id }, context) as import("@actspace/shared").SessionListPage;
  expect(second.items).toHaveLength(5); expect(second.groups[0]?.hasMore).toBe(false);
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(15);
});

it("revokes a session-owned grant through the typed Host API, including while draining", async () => {
  const revokeSessionGrant = vi.fn(async () => {});
  const publish = vi.fn();
  const rpc = new HostRpc({ state: () => "draining", application: { revokeSessionGrant }, observations: { publish } } as unknown as HostRpcOptions);
  await expect(rpc.dispatch("sessions.revokeGrant", { sessionId: "s1", grantId: "g1" }, context)).resolves.toEqual({ ok: true });
  expect(revokeSessionGrant).toHaveBeenCalledWith("s1", "g1");
  await expect(rpc.dispatch("sessions.revokeGrant", { sessionId: "s1", grantId: "g1", selector: {} }, context)).rejects.toThrow("Unexpected");
  expect(revokeSessionGrant).toHaveBeenCalledOnce();
});

it("forks by Journal position or by assistant turn, never both and never neither", async () => {
  const forkMainSession = vi.fn(async () => ({ sessionId: "child" }));
  const rpc = new HostRpc({ state: () => "ready", application: { forkMainSession } } as unknown as HostRpcOptions);
  await rpc.dispatch("sessions.fork", { sessionId: "p", boundarySeq: 7, newSessionId: "child" }, context);
  expect(forkMainSession).toHaveBeenLastCalledWith("p", 7, "child");
  await rpc.dispatch("sessions.fork", { sessionId: "p", turnId: "turn-1", newSessionId: "child" }, context);
  expect(forkMainSession).toHaveBeenLastCalledWith("p", { turnId: "turn-1" }, "child");
  await expect(rpc.dispatch("sessions.fork", { sessionId: "p", newSessionId: "child" }, context)).rejects.toThrow("exactly one");
  await expect(rpc.dispatch("sessions.fork", { sessionId: "p", boundarySeq: 7, turnId: "turn-1", newSessionId: "child" }, context)).rejects.toThrow("exactly one");
  expect(forkMainSession).toHaveBeenCalledTimes(2);
});
