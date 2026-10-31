import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import { connectionWrapper, FakeConnectionStore, fakeClient, fakeConnection } from "../../../test/helpers/fake-session";
import { ApprovalCard } from "../ApprovalCard";

const request = (withGrant: boolean): ApprovalRequest => ({
  schemaVersion: 1, requestId: "r1", callId: "c1", sessionId: "s1", agentRunId: "run", agentId: "a", pluginId: "p", toolName: "bash", definitionDigest: "d", normalizedArgsDigest: "n",
  reasons: [], resources: [{ kind: "process", access: "execute", commandDigest: "x", cwd: "/w", dynamic: false }],
  grantSuggestions: withGrant ? [{ suggestionId: "g1", lifetime: "session", action: "process.execute", access: "execute", selector: { kind: "command_prefix", prefix: ["git", "status"], cwdRoot: "/w" }, audience: { pluginId: "p", permissionDomain: "d", policyVersion: 1 }, label: "x" }] : [],
  supportedLifetimes: ["session"], requestedAt: "", expiresAt: "",
} as unknown as ApprovalRequest);

function setup(handler: (method: string) => unknown, withGrant = true) {
  const client = fakeClient(handler);
  const store = new FakeConnectionStore(fakeConnection(client));
  const onDecided = vi.fn();
  render(<ApprovalCard request={request(withGrant)} command="git status" onDecided={onDecided} />, { wrapper: connectionWrapper(store) });
  return { client, store, onDecided };
}

it("sends once, session (with suggestionId) and deny decisions", async () => {
  for (const [name, expected] of [["运行", { kind: "once" }], ["本会话允许 git status", { kind: "session", suggestionId: "g1" }], ["拒绝", { kind: "deny" }]] as const) {
    const { client, onDecided } = setup(() => null);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith(expected.kind));
    expect(client.calls[0]).toEqual({ method: "approvals.decide", params: { sessionId: "s1", requestId: "r1", ...expected } });
    expect(screen.getAllByRole("button").filter(button => (button as HTMLButtonElement).disabled)).toHaveLength(screen.getAllByRole("button").length);
    document.body.innerHTML = "";
  }
});

it("hides the session grant button without a command prefix suggestion", () => {
  setup(() => null, false);
  expect(screen.queryByText(/本会话允许/)).toBeNull();
});

it("re-enables the buttons and shows the reason when the decision fails", async () => {
  const { store } = setup(() => { throw new Error("审批已过期"); });
  await userEvent.click(screen.getByRole("button", { name: "运行" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("审批已过期");
  expect(screen.getByRole("button", { name: "运行" })).toBeEnabled();
  expect(store.errors).toHaveLength(1);
});

it("recovers the full pending command through the session-owned tool detail before enabling allow", async () => {
  let resolve!: (value: unknown) => void;
  const client = fakeClient(() => new Promise(done => { resolve = done; }));
  const store = new FakeConnectionStore(fakeConnection(client));
  render(<ApprovalCard request={request(true)} />, { wrapper: connectionWrapper(store) });
  expect(screen.getByRole("button", { name: "运行" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /本会话允许/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "拒绝" })).toBeEnabled();
  const command = `printf '%s' '${"long sensitive fixture ".repeat(300)}'`;
  resolve({ snapshot: { sessionId: "s1" }, journal: [
    { type: "tool/call", data: { callId: "other", name: "bash", args: { command: "WRONG" } } },
    { type: "tool/call", data: { callId: "c1", name: "bash", args: { command } } },
  ] });
  await waitFor(() => expect(screen.getByRole("button", { name: "运行" })).toBeEnabled());
  expect(document.querySelector("pre")?.textContent).toBe(`$ ${command}`);
  expect(client.calls[0]).toEqual({ method: "sessions.tool", params: { sessionId: "s1", callId: "c1" } });
});

it("rejects a mismatched detail response, supports retry, and leaves deny available", async () => {
  let attempts = 0;
  const client = fakeClient(method => method === "sessions.tool" ? {
    snapshot: { sessionId: ++attempts === 1 ? "different-session" : "s1" },
    journal: [{ type: "tool/call", data: { callId: "c1", name: "bash", args: { command: "echo safe" } } }],
  } : null);
  render(<ApprovalCard request={request(false)} />, { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(client))) });
  expect(await screen.findByRole("status")).toHaveTextContent("命令详情不可用");
  expect(screen.getByRole("button", { name: "运行" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "重试详情" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "运行" })).toBeEnabled());
  await userEvent.dblClick(screen.getByRole("button", { name: "拒绝" }));
  expect(client.calls.filter(call => call.method === "approvals.decide")).toHaveLength(1);
});

it("keeps an already handled approval locked and refreshes instead of allowing another decision", async () => {
  const onStale = vi.fn(async () => {});
  const client = fakeClient(() => { throw { kind: "NOT_FOUND", message: "handled by another observer" }; });
  render(<ApprovalCard request={request(true)} command="git status" onStale={onStale} />, { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(client))) });
  await userEvent.click(screen.getByRole("button", { name: "运行" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已处理或过期");
  expect(onStale).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "运行" })).toBeDisabled();
});
