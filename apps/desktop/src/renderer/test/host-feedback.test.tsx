import { encodeSessionLocator } from "@actspace/shared/session-locator";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { HostConnectionsSettings } from "../components/settings/HostConnectionsSettings";
import { Composer } from "../components/Composer";
import { RunTargetContext } from "../target/run-target-context";
import { remoteSessionPrefs } from "../target/remote-session-prefs";
import { useRunTarget } from "../target/use-run-target";
import { projectionFixture } from "./projection-fixture";
import { mockContextSnapshot } from "./fixtures/workbenchFixture";
import { setupBridge } from "./helpers/bridge";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it.each([
  "System credential encryption is unavailable",
  "Error invoking remote method 'host:add': Error: Error while encrypting the text provided to safeStorage.encryptString. Encryption is not available.",
  "Error while decrypting the ciphertext provided to safeStorage.decryptString.",
])("explains local credential storage failure instead of blaming the server: %s", async message => {
  setupBridge({
    "hosts.list": async () => { throw new Error(message); }, "events.hostsChanged": () => () => {},
  });
  render(<HostConnectionsSettings />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("本机凭据存储不可用");
  expect(alert).toHaveTextContent("钥匙串");
  expect(alert).not.toHaveTextContent("服务器地址、网络");
});

it("keeps revoked device authorization distinct from a local keyring failure", async () => {
  setupBridge({
    "hosts.list": async () => { throw new Error("Device credential unavailable; pair again"); }, "events.hostsChanged": () => () => {},
  });
  render(<HostConnectionsSettings />);
  expect(await screen.findByRole("alert")).toHaveTextContent("设备授权已失效");
});

it("switches the new server form to an SSH tunnel and pairs with the alias and port", async () => {
  const add = vi.fn(async () => ({}));
  setupBridge({ "hosts.list": async () => [], "hosts.add": add, "events.hostsChanged": () => () => {} } as never);
  render(<HostConnectionsSettings />);
  const kind = screen.getByRole("combobox", { name: "连接方式" });
  expect(kind).toHaveTextContent("WSS");
  fireEvent.change(screen.getByLabelText("服务器地址"), { target: { value: "wss://typed.example" } });
  await userEvent.click(kind);
  await userEvent.click(await screen.findByRole("option", { name: "SSH 隧道" }));
  expect(kind).toHaveTextContent("SSH 隧道");
  expect(screen.getByLabelText("SSH 配置别名")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "云端" } });
  fireEvent.change(screen.getByLabelText("SSH 配置别名"), { target: { value: "my-server" } });
  fireEvent.change(screen.getByLabelText("服务器上的 Host 端口"), { target: { value: "7000" } });
  fireEvent.change(screen.getByLabelText("一次性配对码"), { target: { value: "123456" } });
  await userEvent.click(screen.getByRole("button", { name: "配对并连接" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith({ name: "云端", endpoint: { kind: "ssh", alias: "my-server", port: 7000 }, code: "123456" }));
});

it.each([
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': HostDisconnectedError: Host connection lost; mutation acknowledgement may be unknown", "远端连接已断开"],
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': Error: Host is offline", "远端连接已断开"],
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': Error: internal failure", "消息加载失败，请稍后重试。"],
])("shows readable session errors and recovers through retry: %s", async (message, expected) => {
  const id = encodeSessionLocator({ hostId: "server", sessionId: "session" });
  let disconnected = true;
  const page = vi.fn(async () => {
    if (disconnected) throw new Error(message);
    return projectionFixture(id);
  });
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, defaultWorkspaceId: "default", items: [] }),
    "sessions.list": async () => [{ id, hostId: "server", hostName: "Cloud", connectionState: "offline", title: "Remote session", workspaceRoot: "/tmp/workspace", agentRunCount: 0, updatedAt: "2026-10-04T00:00:00Z" }],
    "sessions.getPage": page, "approvals.listPending": async () => [],
    "events.sessionLive": () => () => {}, "events.agentStream": () => () => {},
    "review.getSnapshot": async () => ({ ok: false }), "visualize.list": async () => ({ items: [] }),
    "appearance.setUiZoom": () => {}, "appearance.setNativeTheme": () => {}, "events.shuttingDown": () => () => {},
  });
  render(<App />);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(expected);
  expect(alert).not.toHaveTextContent("runtime-v2");
  expect(alert).not.toHaveTextContent("HostDisconnectedError");
  disconnected = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(page.mock.calls.length).toBeGreaterThan(1);
});

it("switches workspace and model to the selected blocked Host's own description", async () => {
  const onSend = vi.fn();
  const hosts = ["ready", "blocked"].map(hostId => ({ id: hostId, hostId, name: hostId, state: "connected", endpoint: { kind: "wss", url: `wss://${hostId}.example/rpc` } }));
  setupBridge({
    "hosts.list": async () => hosts, "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {}, "events.hostUploadProgress": () => () => {}, "hosts.activate": async () => {},
    "hosts.call": async (input) => {
      const hostId = input?.hostId ?? "";
      return { state: hostId, workspaces: [{ id: "main", name: `${hostId} workspace`, path: `/${hostId}` }], models: [{ id: `${hostId}/model`, name: `${hostId} model` }], defaultModel: `${hostId}/model` };
    },
  });
  // 15 T6：新建页的运行目标由 useRunTarget 给出，经 RunTargetContext 交给 Composer（与 App 相同）。
  const local = {};
  function Harness() {
    const runTarget = useRunTarget({ sessionId: null, locked: false, local });
    return <RunTargetContext.Provider value={runTarget}><Composer contextSnapshot={mockContextSnapshot} onSend={onSend} surface="initial" executionContext={{ gitContext: null, runLocation: "this_mac" }} /></RunTargetContext.Provider>;
  }
  render(<Harness />);
  await screen.findByRole("option", { name: "ready" });
  fireEvent.change(screen.getByLabelText("会话运行位置"), { target: { value: "ready" } });
  await waitFor(() => expect(screen.getByLabelText("远端模型")).toHaveValue("ready/model"));
  expect(screen.getByLabelText("远端工作区")).toHaveTextContent("ready workspace");
  fireEvent.change(screen.getByLabelText("会话运行位置"), { target: { value: "blocked" } });
  await waitFor(() => expect(screen.getByLabelText("远端模型")).toHaveValue("blocked/model"));
  expect(screen.getByLabelText("远端模型")).not.toHaveTextContent("ready model");
  expect(screen.getByLabelText("远端工作区")).toHaveTextContent("blocked workspace");
  expect(screen.getByLabelText("远端工作区")).not.toHaveTextContent("ready workspace");
  // 15 T7：Host 报告 blocked 时说明原因（host-unavailable），草稿照常编辑。
  expect(screen.getByText("blocked 恢复上次的任务时出错，暂不接受新任务")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "keep this draft" } });
  expect(screen.getByLabelText("消息输入框")).toHaveValue("keep this draft");
  const send = screen.getByRole("button", { name: "blocked 恢复上次的任务时出错，暂不接受新任务" });
  expect(send).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(send);
  expect(onSend).not.toHaveBeenCalled();
});

it("creates the first remote Session on the selected Host and records its workspace", async () => {
  // 15 T6：App 按 RunTarget 判断远端发送；Host 不返回 workspaceId，创建时记进 remote-session-prefs。
  const id = encodeSessionLocator({ hostId: "server", sessionId: "created" });
  const host = { id: "server", hostId: "server", name: "Cloud", endpoint: { kind: "wss", url: "wss://cloud" }, state: "connected" };
  const create = vi.fn(async (_input: unknown) => projectionFixture(id));
  const submit = vi.fn(async () => ({ status: "queued", taskId: "task-1", snapshot: { sessionId: id, revision: 1, paused: false, queue: [], tasks: [], runs: [] } }));
  setupBridge({
    "app.getBootstrapState": async () => ({ appVersion: "test", dataRoot: "/tmp/test", sessionRoot: "/tmp/test", logRoot: "/tmp/test", tmpRoot: "/tmp/test", workspaceRoot: "/tmp/workspace" }),
    "workspaces.list": async () => ({ version: 1, defaultWorkspaceId: "default", items: [] }),
    "sessions.list": async () => [], "sessions.getPage": async () => projectionFixture(id), "sessions.create": create, "approvals.listPending": async () => [],
    "hosts.list": async () => [host], "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {}, "events.hostUploadProgress": () => () => {}, "hosts.activate": async () => {},
    "hosts.call": async () => ({ state: "ready", workspaces: [{ id: "w1", name: "api", path: "/srv/api" }, { id: "w2", name: "web", path: "/srv/web" }], models: [{ id: "m", name: "Model" }], defaultModel: "m" }),
    "tasks.submit": submit, "tasks.command": async () => ({ snapshot: { sessionId: id, revision: 1, paused: false, queue: [], tasks: [], runs: [] } }),
    "events.sessionLive": () => () => {}, "events.agentStream": () => () => {},
    "review.getSnapshot": async () => ({ ok: false }), "visualize.list": async () => ({ items: [] }),
    "appearance.setUiZoom": () => {}, "appearance.setNativeTheme": () => {}, "events.shuttingDown": () => () => {},
  });
  render(<App />);
  await screen.findByRole("option", { name: "Cloud" });
  fireEvent.change(screen.getByLabelText("会话运行位置"), { target: { value: "server" } });
  await waitFor(() => expect(screen.getByLabelText("远端工作区")).toHaveTextContent("web"));
  fireEvent.change(screen.getByLabelText("远端工作区"), { target: { value: "w2" } });
  fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "hello remote" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ hostId: "server", workspaceId: "w2" })));
  await waitFor(() => expect(remoteSessionPrefs.get(id)?.workspaceId).toBe("w2"));
  // 15 T8：新建页选的模型也记到会话上。
  expect(remoteSessionPrefs.get(id)?.modelId).toBe("m");
  remoteSessionPrefs.remove(id);
});

it("reports a recorded workspace that no longer exists on the Host", async () => {
  // 15 T7：已有会话记下的工作区在 Host 上找不到时不能发送，原因指向工作区。
  const id = encodeSessionLocator({ hostId: "server", sessionId: "gone" });
  remoteSessionPrefs.set(id, { workspaceId: "deleted" });
  setupBridge({
    "hosts.list": async () => [{ id: "server", hostId: "server", name: "Cloud", endpoint: { kind: "wss", url: "wss://cloud" }, state: "connected" }],
    "events.hostsChanged": () => () => {}, "events.hostEvent": () => () => {}, "hosts.activate": async () => {},
    "hosts.call": async () => ({ state: "ready", workspaces: [{ id: "w1", name: "api", path: "/srv/api" }], models: [{ id: "m", name: "Model" }], defaultModel: "m" }),
  });
  const { result } = renderHook(() => useRunTarget({ sessionId: id, locked: true, local: {} }));
  await waitFor(() => expect(result.current.readiness).toEqual({ state: "workspace-missing", workspaceId: "deleted" }));
  remoteSessionPrefs.remove(id);
});
