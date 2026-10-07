import { describe, expect, it, vi } from "vitest";
import type { ComposerSendOptions } from "../components/Composer";
import type { PendingSubmissionRecord } from "../session/pending-submission";
import { createSessionGateway, type SendTarget, type SessionGatewayDeps } from "../session/session-gateway";

// 15 T12：App handleSend 中选目标、提交、pending 记录的部分。

const options = { mode: "agent", selectedSkills: [], model: "local-model", thinkingEnabled: false, attachments: [{ id: "a", name: "x.png", path: "/x.png", previewUrl: "blob:x" }] } as unknown as ComposerSendOptions;
const local: SendTarget = { target: { kind: "local" }, readiness: { state: "ready" }, localWorkspaceRoot: "/repo" };
const remote: SendTarget = { target: { kind: "remote", hostId: "server", hostName: "Cloud" }, readiness: { state: "ready" }, remoteWorkspaceId: "w2", remoteModelId: "m" };
const receipt = { task: { taskId: "t1" }, snapshot: {} } as never;

function deps(patch: Partial<SessionGatewayDeps> = {}) {
  const store = new Map<string, PendingSubmissionRecord>();
  type D = SessionGatewayDeps;
  const defaults = {
    createSession: vi.fn<D["createSession"]>(async () => ({ meta: { id: "created", agentModeRevision: 3 } })),
    setPlanMode: vi.fn<D["setPlanMode"]>(async () => undefined),
    recordRemoteSession: vi.fn<D["recordRemoteSession"]>(),
    configure: vi.fn<D["configure"]>(async () => true),
    submit: vi.fn<D["submit"]>(async () => receipt),
    pending: {
      read: vi.fn<D["pending"]["read"]>((id) => store.get(id) ?? null),
      write: vi.fn<D["pending"]["write"]>((id, record) => { store.set(id, { ...record, createdAt: "now" }); }),
      clear: vi.fn<D["pending"]["clear"]>((id) => { store.delete(id); }),
    },
    rememberOptions: vi.fn<D["rememberOptions"]>(), forgetOptions: vi.fn<D["forgetOptions"]>(), notice: vi.fn<D["notice"]>(), restoreDraft: vi.fn<D["restoreDraft"]>(),
    newSubmissionId: vi.fn<D["newSubmissionId"]>(() => `sub-${Math.random()}`), now: () => 42,
  };
  const value = { ...defaults, ...patch } as typeof defaults;
  return { value, store };
}

describe("ensureSession", () => {
  it("keeps an existing Session", async () => {
    const { value } = deps();
    await expect(createSessionGateway(value).ensureSession("existing", local, options)).resolves.toBe("existing");
    expect(value.createSession).not.toHaveBeenCalled();
  });

  it("creates a local Session in the selected workspace and switches it to plan mode", async () => {
    const { value } = deps();
    await expect(createSessionGateway(value).ensureSession(null, local, { ...options, mode: "plan" })).resolves.toBe("created");
    expect(value.createSession).toHaveBeenCalledWith({ workspaceRoot: "/repo", agentForm: "agent" });
    expect(value.setPlanMode).toHaveBeenCalledWith("created", 3);
    expect(value.recordRemoteSession).not.toHaveBeenCalled();
  });

  it("creates a remote Session on the Host and records its workspace and model", async () => {
    const { value } = deps();
    await createSessionGateway(value).ensureSession(null, remote, { ...options, mode: "chat" });
    expect(value.createSession).toHaveBeenCalledWith({ hostId: "server", workspaceId: "w2", agentForm: "chat" });
    expect(value.recordRemoteSession).toHaveBeenCalledWith("created", { workspaceId: "w2", modelId: "m" });
    expect(value.setPlanMode).not.toHaveBeenCalled();
  });

  it("refuses to send to a remote target that is not ready, even for an existing Session", async () => {
    const { value } = deps();
    const offline: SendTarget = { ...remote, readiness: { state: "offline" } };
    await expect(createSessionGateway(value).ensureSession("existing", offline, options)).rejects.toThrow("Host is not ready");
    await expect(createSessionGateway(value).ensureSession(null, offline, options)).rejects.toThrow("Host is not ready");
    expect(value.createSession).not.toHaveBeenCalled();
  });

  it("reports a failed creation", async () => {
    const { value } = deps({ createSession: vi.fn(async () => null) });
    await expect(createSessionGateway(value).ensureSession(null, remote, options)).rejects.toThrow("Unable to create remote Session");
    await expect(createSessionGateway(value).ensureSession(null, local, options)).rejects.toThrow("Unable to create Session");
  });
});

describe("submit", () => {
  it("records the submission first, configures, submits and clears the record", async () => {
    const order: string[] = [];
    const { value, store } = deps();
    value.pending.write.mockImplementation((id, record) => { order.push("write"); store.set(id, { ...record, createdAt: "now" }); });
    value.configure.mockImplementation(async () => { order.push("configure"); return true; });
    value.submit.mockImplementation(async (input) => { order.push("submit"); expect(input.attachments?.[0]).not.toHaveProperty("previewUrl"); return receipt; });
    await expect(createSessionGateway(value).submit("s", "hi", options, "m")).resolves.toBe(receipt);
    expect(order).toEqual(["write", "configure", "submit"]);
    expect(value.configure).toHaveBeenCalledWith("s", expect.objectContaining({ model: "m", thinkingEnabled: false }));
    expect(store.has("s")).toBe(false);
    expect(value.restoreDraft).not.toHaveBeenCalled();
  });

  it("reuses the submission id when the same content is sent again", async () => {
    const { value } = deps({ submit: vi.fn(async () => ({ status: "submission-failed" as const, acknowledgement: "unknown" as const, message: "?" })) });
    const gateway = createSessionGateway(value);
    await expect(gateway.submit("s", "hi", options, "m")).rejects.toThrow("提交尚未确认");
    const ids = value.submit.mock.calls.map(([input]) => (input as { submissionId: string }).submissionId);
    expect(new Set(ids).size).toBe(1);
    expect(value.notice).toHaveBeenCalledWith("s", "提交结果尚未确认，正在用同一标识核对。");
    // 结果未知：记录保留，草稿放回；再次发送同样内容时沿用同一个 id。
    expect(value.pending.read("s")).not.toBeNull();
    expect(value.restoreDraft).toHaveBeenCalledWith("s", expect.objectContaining({ text: "hi", error: "提交尚未确认，再次发送将核对同一次提交。" }));
    value.submit.mockResolvedValue(receipt);
    await gateway.submit("s", "hi", options, "m");
    expect((value.submit.mock.calls.at(-1)![0] as { submissionId: string }).submissionId).toBe(ids[0]);
    await gateway.submit("s", "different", options, "m");
    expect((value.submit.mock.calls.at(-1)![0] as { submissionId: string }).submissionId).not.toBe(ids[0]);
  });

  it("treats a thrown submit as unknown and checks once more", async () => {
    const { value } = deps();
    value.submit.mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(receipt);
    await expect(createSessionGateway(value).submit("s", "hi", options, "m")).resolves.toBe(receipt);
    expect(value.submit).toHaveBeenCalledTimes(2);
  });

  it("clears the record and restores the draft with the issue when the submission is rejected", async () => {
    const attachmentIssue = { code: "image_too_large" as const, fileName: "x.png" };
    const { value } = deps({ submit: vi.fn(async () => ({ status: "submission-failed" as const, acknowledgement: "rejected" as const, message: "bad", attachmentIssue })) });
    await expect(createSessionGateway(value).submit("s", "hi", options, "m")).rejects.toThrow("bad");
    expect(value.pending.read("s")).toBeNull();
    expect(value.forgetOptions).toHaveBeenCalled();
    expect(value.submit).toHaveBeenCalledTimes(1);
    const draft = value.restoreDraft.mock.calls[0]![1];
    expect(draft).toMatchObject({ id: 42, sessionId: "s", text: "hi", attachmentIssue });
    expect(draft).not.toHaveProperty("status");
  });

  it("does not submit when configure fails", async () => {
    const { value } = deps({ configure: vi.fn(async () => false) });
    await expect(createSessionGateway(value).submit("s", "hi", options, "m")).rejects.toThrow("无法更新任务配置");
    expect(value.submit).not.toHaveBeenCalled();
    expect(value.pending.read("s")).toBeNull();
    expect(value.forgetOptions).toHaveBeenCalled();
    expect(value.restoreDraft).toHaveBeenCalledWith("s", expect.objectContaining({ error: "无法更新任务配置，草稿已保留。" }));
  });
});
