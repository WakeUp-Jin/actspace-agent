import { afterEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import { ChatAttachmentValidationError } from "../runtime-v2/runtime-registry";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel), on: vi.fn(), removeListener: vi.fn(),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";
import { PendingApprovalRegistry } from "../approval-registry";
afterEach(() => handlers.clear());
it("returns a serializable rejection before starting a turn and identifies the selected attachment", async () => {
  const submitTask = vi.fn();
  const importChatAttachments = vi.fn().mockRejectedValue(new ChatAttachmentValidationError({ code: "invalid_utf8", fileName: "bad.txt" }, 1));
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/chat-admission", workspaceRoot: "/work" },
    registry: {
      taskCommand: async () => ({ snapshot: { tasks: [] } }), subscribe: () => () => {}, subscribeRendererStream: () => () => {}, inspectSession: async () => ({ agentMode: "chat" }), importChatAttachments, submitTask },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { id: 7 } }),
  } as unknown as FixedRendererIpcOptions);
  const input = { sessionId: "chat", submissionId: "run", userInput: "keep", attachments: [
    { id: "good", name: "good.txt", path: "/fixture/good.txt", kind: "file" },
    { id: "bad", name: "bad.txt", path: "/fixture/bad.txt", kind: "file" },
  ] };
  try {
    const handler = handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.submitTask)!;
    const result = await handler({ sender: { id: 7 } }, input);
    expect(JSON.parse(JSON.stringify(result))).toEqual({ status: "submission-failed", acknowledgement: "rejected", message: "附件校验失败，请检查后重试。", attachmentIssue: { code: "invalid_utf8", fileName: "bad.txt", attachmentId: "bad" } });
    expect(submitTask).not.toHaveBeenCalled();
    importChatAttachments.mockRejectedValueOnce(new ChatAttachmentValidationError({ code: "total_text_too_large", limit: 256000 }, undefined, [130000, 130000]));
    expect(await handler({ sender: { id: 7 } }, input)).toMatchObject({ attachmentIssue: { textCharacterCounts: { good: 130000, bad: 130000 } } });
    importChatAttachments.mockRejectedValueOnce(new Error("store unavailable"));
    await expect(handler({ sender: { id: 7 } }, input)).rejects.toThrow("store unavailable");
    expect(submitTask).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});

it("recovers the accepted call preview and excludes approvals resolved while reading it", async () => {
  const approvals = new PendingApprovalRegistry();
  const request = { id: "approval", sessionId: "s", agentRunId: "r", toolCallId: "c", toolName: "read_file", args: { resources: [{ kind: "file", path: "/outside/fixture.txt" }] }, summary: "Read fixture", reason: "outside workspace", createdAt: Date.now() };
  const decision = approvals.waitForDecision(request);
  const detail = { snapshot: { workspaceRoot: "/work" }, journal: [{ type: "tool/call", data: { callId: "c", args: { path: "/outside/fixture.txt" } } }] };
  const browseToolDetail = vi.fn(async () => detail);
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/approval-recovery", workspaceRoot: "/work" }, approvals,
    registry: {
      taskCommand: async () => ({ snapshot: { tasks: [] } }), subscribe: () => () => {}, subscribeRendererStream: () => () => {}, browseToolDetail },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { id: 7 } }),
  } as unknown as FixedRendererIpcOptions);
  try {
    const handler = handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listPendingApprovals)!;
    expect(await handler({ sender: { id: 7 } }, { sessionId: "s" })).toEqual([expect.objectContaining({ recovery: expect.objectContaining({ agentRunId: "r", toolCallId: "c", preview: expect.objectContaining({ kind: "read", filePath: "/outside/fixture.txt" }) }) })]);
    let release!: (value: typeof detail) => void;
    browseToolDetail.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const reading = handler({ sender: { id: 7 } }, { sessionId: "s" });
    approvals.decide("approval", "deny"); release(detail);
    expect(await reading).toEqual([]);
    await decision;
  } finally { approvals.expireAll(); registration.dispose(); }
});
