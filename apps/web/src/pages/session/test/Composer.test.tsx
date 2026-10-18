import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { connectionWrapper, FakeConnectionStore, fakeClient, fakeConnection } from "../../../test/helpers/fake-session";
import { EMPTY_OBSERVATION } from "../../../sessions/session-observer";
import { Composer } from "../Composer";

const wide = (matches: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches, addEventListener() {}, removeEventListener() {} }) });
const composerFor = (overrides: Record<string, unknown> = {}) => ({
  draft: "你好", setDraft: vi.fn(), send: vi.fn(), sending: false, stop: vi.fn(), cancelQueued: vi.fn(), setMode: vi.fn(), configure: vi.fn(),
  model: "mock/mock", effort: null, effortOptions: [], error: null, clearError: vi.fn(), connected: true, maintenance: false, ...overrides,
});
const observation = { ...EMPTY_OBSERVATION, disconnected: false, loadOlder: vi.fn(), applyTasks: vi.fn(), refresh: vi.fn() };
const view = (composer: ReturnType<typeof composerFor>, denied = false) => render(
  <Composer observation={observation as never} composer={composer as never} awaitingApproval={false} queued={[]} denied={denied} focusSignal={denied ? 1 : 0} />,
  { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(fakeClient(() => null)))) },
);

it("Enter sends on wide screens and inserts a newline on narrow ones", async () => {
  wide(true);
  const a = composerFor();
  view(a);
  await userEvent.type(screen.getByLabelText("消息"), "{Enter}");
  expect(a.send).toHaveBeenCalledTimes(1);
  document.body.innerHTML = "";
  wide(false);
  const b = composerFor();
  view(b);
  await userEvent.type(screen.getByLabelText("消息"), "{Enter}");
  expect(b.send).not.toHaveBeenCalled();
});

it("shows the deny placeholder and focuses the input", () => {
  wide(false);
  view(composerFor({ draft: "" }), true);
  const input = screen.getByLabelText("消息");
  expect(input).toHaveAttribute("placeholder", "告诉 Agent 应该怎么做…");
  expect(input).toHaveFocus();
});

it("disables input and send while disconnected", () => {
  wide(false);
  view(composerFor({ connected: false }));
  expect(screen.getByLabelText("消息")).toBeDisabled();
  expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  expect(screen.getAllByText("已断开，正在重连…").length).toBeGreaterThan(0);
});
