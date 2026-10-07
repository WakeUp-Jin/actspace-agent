import { describe, expect, it } from "vitest";
import type { HostConnection } from "@actspace/shared/host-protocol";
import { describeReadiness, hostReachable, resolveReadiness, summarizeError, type ReadinessInput, type RunTargetReadiness } from "../target/readiness";
import type { HostDescription } from "../target/host-directory";
import type { RunTarget } from "../target/run-target";

// 15 T7：能不能发送，以及 06 §4.5 的未就绪文案。

const remote: RunTarget = { kind: "remote", hostId: "h", hostName: "Cloud" };
const description: HostDescription = { state: "ready", workspaces: [{ id: "w1", name: "api", path: "/srv/api" }], models: [{ id: "m", name: "Model" }], defaultModel: "m" };
const host = (state: HostConnection["state"], extra: Partial<HostConnection> = {}) => ({ id: "h", hostId: "h", name: "Cloud", state, endpoint: { kind: "wss", url: "wss://cloud" }, ...extra }) as HostConnection;

function input(patch: { target?: RunTarget; loaded?: boolean; hosts?: HostConnection[]; description?: HostDescription | null; describeError?: string; workspaceId?: string; modelId?: string } = {}): ReadinessInput {
  const desc = patch.description === undefined ? description : patch.description;
  return {
    target: patch.target ?? remote,
    directory: {
      loaded: patch.loaded ?? true,
      hosts: patch.hosts ?? [host("connected")],
      descriptions: desc ? { h: desc } : {},
      describeErrors: patch.describeError !== undefined ? { h: patch.describeError } : {},
    },
    workspaceId: "workspaceId" in patch ? patch.workspaceId : "w1",
    modelId: "modelId" in patch ? patch.modelId : "m",
  };
}

describe("resolveReadiness", () => {
  it.each<[string, ReadinessInput, RunTargetReadiness]>([
    ["local", input({ target: { kind: "local" }, hosts: [] }), { state: "ready" }],
    ["remote with workspace and model", input(), { state: "ready" }],
    ["corrupt session key", input({ target: { kind: "invalid", key: "x" } }), { state: "removed" }],
    ["hosts not listed yet", input({ loaded: false, hosts: [] }), { state: "connecting" }],
    ["host gone from the list", input({ hosts: [] }), { state: "removed" }],
    ["connecting", input({ hosts: [host("connecting")] }), { state: "connecting" }],
    ["offline with error", input({ hosts: [host("offline", { error: "timeout" })] }), { state: "offline", error: "timeout" }],
    ["offline", input({ hosts: [host("offline")] }), { state: "offline" }],
    ["revoked", input({ hosts: [host("revoked")] }), { state: "revoked" }],
    ["incompatible", input({ hosts: [host("incompatible")] }), { state: "incompatible" }],
    ["describe failed", input({ describeError: "boom" }), { state: "describe-failed", error: "boom" }],
    ["describing", input({ description: null }), { state: "describing" }],
    ["host draining", input({ description: { ...description, state: "draining" } }), { state: "host-unavailable", hostState: "draining" }],
    ["host blocked", input({ description: { ...description, state: "blocked" } }), { state: "host-unavailable", hostState: "blocked" }],
    ["no workspace selected", input({ workspaceId: undefined }), { state: "workspace-missing" }],
    ["workspace gone from host", input({ workspaceId: "w9" }), { state: "workspace-missing", workspaceId: "w9" }],
    ["no model", input({ modelId: undefined }), { state: "model-missing" }],
    ["model gone from host", input({ modelId: "old" }), { state: "model-missing" }],
  ])("%s", (_name, value, expected) => {
    expect(resolveReadiness(value)).toEqual(expected);
  });

  it("describe errors win over a stale description", () => {
    expect(resolveReadiness(input({ describeError: "boom" })).state).toBe("describe-failed");
  });
});

describe("describeReadiness", () => {
  it.each<[RunTargetReadiness, string | null, string]>([
    [{ state: "connecting" }, "连接中", "正在连接 Cloud，草稿会保留"],
    [{ state: "offline" }, "离线", "Cloud 离线。前往设置重新连接"],
    [{ state: "revoked" }, "需要重新配对", "Cloud 的授权已失效，需要重新配对"],
    [{ state: "incompatible" }, "版本不兼容", "Cloud 的 Agent 版本与当前应用不兼容"],
    [{ state: "removed" }, "已移除", "这台机器已从列表移除"],
    [{ state: "describing" }, "正在读取", "正在读取 Cloud 的工作区和模型"],
    [{ state: "describe-failed", error: "Error invoking remote method 'hosts:call': Error: connection reset\n    at stack" }, "读取失败", "无法读取机器信息：connection reset"],
    [{ state: "host-unavailable", hostState: "draining" }, "暂不接受任务", "Cloud 正在停止，暂不接受新任务"],
    [{ state: "host-unavailable", hostState: "blocked" }, "暂不接受任务", "Cloud 恢复上次的任务时出错，暂不接受新任务"],
    [{ state: "workspace-missing" }, null, "选择一个远端工作区"],
    [{ state: "workspace-missing", workspaceId: "w9" }, null, "该工作区在 Cloud 上已不存在"],
    [{ state: "model-missing" }, null, "选择一个模型"],
  ])("%j", (readiness, label, reason) => {
    const copy = describeReadiness(readiness as Exclude<RunTargetReadiness, { state: "ready" }>, "Cloud");
    expect(copy.label).toBe(label);
    expect(copy.reason).toBe(reason);
    expect(copy.tone === null).toBe(label === null);
  });

  it("falls back to a generic Host name", () => {
    expect(describeReadiness({ state: "offline" }, "").reason).toBe("远端机器 离线。前往设置重新连接");
  });

  it("summarizes long errors", () => {
    expect(summarizeError("x".repeat(200))).toHaveLength(80);
    expect(summarizeError("HostDisconnectedError: Host connection lost")).toBe("Host connection lost");
    expect(summarizeError("")).toBe("未知错误");
  });
});

describe("hostReachable", () => {
  it("is false only while the Host itself is not connected", () => {
    const states: RunTargetReadiness[] = [{ state: "connecting" }, { state: "offline" }, { state: "revoked" }, { state: "incompatible" }, { state: "removed" }];
    for (const readiness of states) expect(hostReachable(readiness)).toBe(false);
    const connected: RunTargetReadiness[] = [{ state: "ready" }, { state: "describing" }, { state: "describe-failed", error: "x" }, { state: "host-unavailable", hostState: "draining" }, { state: "workspace-missing" }, { state: "model-missing" }];
    for (const readiness of connected) expect(hostReachable(readiness)).toBe(true);
  });
});
