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
