import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComposerSendOptions } from "../components/Composer";
import { MessageQueueTray, type MessageQueueControls } from "../components/composer/MessageQueueTray";
import { TooltipProvider } from "../components/ui/Tooltip";
import { EMPTY_MESSAGE_QUEUE, projectTaskQueue, takeSteering, type SessionMessageQueue } from "../session/message-queue";
function queueOf(...texts: string[]): SessionMessageQueue {
  return projectTaskQueue({ sessionId: "s", revision: 1, paused: false, runs: [], queue: texts.map((_, i) => String(i)), tasks: texts.map((text, i) => ({ taskId: String(i), submissionId: String(i), content: text, acceptedSeq: i, state: "pending", runId: null, targetRunId: null, continuationOf: null })) });
}

function renderTray(queue: SessionMessageQueue, overrides: Partial<MessageQueueControls> = {}, inputEmpty = true) {
  const controls: MessageQueueControls = {
    queue, running: true, steerBlockedReason: null,
    onSteer: vi.fn(), onUnsteer: vi.fn(), onRemove: vi.fn(), onMoveUp: vi.fn(), onEdit: vi.fn(), onResume: vi.fn(),
    ...overrides,
  };
  render(<TooltipProvider delayDuration={0}><MessageQueueTray controls={controls} inputEmpty={inputEmpty} /></TooltipProvider>);
  return controls;
}

it("projects Host order and keeps consumed supplements out of the pending tray", () => {
  const queue = queueOf("a", "/compact");
  expect(queue.items.map(item => item.kind)).toEqual(["message", "compact"]);
  const steered = { ...queue, items: queue.items.slice(1), steering: queue.items.slice(0, 1) };
  expect(takeSteering(steered, "0").queue.steering).toEqual([]);
});

describe("MessageQueueTray", () => {
  it("renders nothing for an empty queue", () => {
    renderTray(EMPTY_MESSAGE_QUEUE);
    expect(screen.queryByRole("region", { name: "消息队列" })).toBeNull();
  });

  it("shows the command label and hides steer for /compact and when no run is active", () => {
    renderTray(queueOf("/compact", "normal"), { running: false });
    const tray = screen.getByRole("region", { name: "消息队列" });
    expect(within(tray).getByText("命令")).toBeInTheDocument();
    expect(within(tray).queryByRole("button", { name: "↳ 插入" })).toBeNull();
    expect(within(tray).getByText("即将发送")).toBeInTheDocument();
  });

  it("disables steering with the blocking reason", async () => {
    renderTray(queueOf("hold on"), { steerBlockedReason: "压缩中不能插入，完成后会自动发送" });
    expect(screen.getByRole("button", { name: "↳ 插入" })).toBeDisabled();
  });

  it("shows steering rows first with withdraw, and the paused header with resume", async () => {
    let queue = queueOf("steered", "waiting");
    queue = { items: queue.items.slice(1), steering: queue.items.slice(0, 1), paused: true };
    const controls = renderTray(queue);
    const tray = screen.getByRole("region", { name: "消息队列" });
    expect(within(tray).getByText("1 条排队 · 1 条已插入")).toBeInTheDocument();
    expect(within(tray).getAllByRole("listitem")[0]).toHaveTextContent("steered下一步读取撤回");
    await userEvent.click(within(tray).getByRole("button", { name: "撤回" }));
    expect(controls.onUnsteer).toHaveBeenCalledWith(queue.steering[0]!.id);
    await userEvent.click(within(tray).getByRole("button", { name: "继续发送" }));
    expect(controls.onResume).toHaveBeenCalled();
  });

  it("only allows editing when the input is empty and moving up when not first", async () => {
    const queue = queueOf("first", "second");
    renderTray(queue, {}, false);
    await userEvent.click(screen.getByRole("button", { name: "更多操作：排队消息 1" }));
    expect(screen.getByRole("menuitem", { name: /编辑/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "上移" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
