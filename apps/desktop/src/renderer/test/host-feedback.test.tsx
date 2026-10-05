import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { HostConnectionsSettings } from "../components/settings/HostConnectionsSettings";
import { Composer } from "../components/Composer";
import { useRemoteTarget } from "../hooks/useRemoteTarget";
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

it.each([
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': HostDisconnectedError: Host connection lost; mutation acknowledgement may be unknown", "远端连接已断开"],
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': Error: Host is offline", "远端连接已断开"],
  ["Error invoking remote method 'runtime-v2:fixed:session:get-page': Error: internal failure", "消息加载失败，请稍后重试。"],
])("shows readable session errors and recovers through retry: %s", async (message, expected) => {
  const id = "host:" + btoa(JSON.stringify(["server", "session"]));
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
  function Harness() {
    const remote = useRemoteTarget(null);
    return <Composer contextSnapshot={mockContextSnapshot} onSend={onSend} surface="initial" executionContext={{ remote, gitContext: null, runLocation: "this_mac" }} />;
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
  expect(screen.getByText("Host 未就绪，草稿仍可编辑")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("消息输入框"), { target: { value: "keep this draft" } });
  expect(screen.getByLabelText("消息输入框")).toHaveValue("keep this draft");
  const send = screen.getByRole("button", { name: "暂无可用模型，请在设置中连接服务商" });
  expect(send).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(send);
  expect(onSend).not.toHaveBeenCalled();
});
