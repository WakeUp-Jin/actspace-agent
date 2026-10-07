import { render, screen, waitFor, within } from "@testing-library/react";
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

it("restores remote queued attachments and annotations from the durable snapshot after Reload", () => {
  const content = { kind: "composer-task", original: { userInput: "edit me", uploadIds: ["image-1"], responseAnnotations: [{ annotationId: "a", comment: "keep me" }] },
    prepared: [{ type: "artifact", artifact: { artifactId: "image-1", mediaType: "image/png" }, label: "visible.png" }] };
  const snapshot = { sessionId: "host:remote-session", revision: 4, paused: true, runs: [], queue: ["task"], tasks: [{ taskId: "task", submissionId: "send", content, acceptedSeq: 1, state: "pending" as const, runId: null, targetRunId: null, continuationOf: null }] };
  const queue = projectTaskQueue(JSON.parse(JSON.stringify(snapshot)));
  expect(queue.items[0]?.options).toEqual({ attachments: [{ id: "image-1", kind: "image", name: "visible.png", mimeType: "image/png", remoteArtifact: { sessionId: snapshot.sessionId, artifactId: "image-1" } }], fileReferences: undefined, responseAnnotations: [{ annotationId: "a", comment: "keep me" }] });
  renderTray(queue, { running: false });
  expect(screen.getByRole("region", { name: "消息队列" })).toHaveTextContent("1 个文件 · 1 条引用");
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
    expect(within(tray).queryByRole("button", { name: "↳ 引导" })).toBeNull();
    // 没有标题行：计数和发送时机在第一行图标的提示里。
    expect(within(tray).getByRole("img", { name: "2 条排队，即将发送" })).toBeInTheDocument();
    expect(within(tray).queryByText("即将发送")).toBeNull();
  });

  it("shows the counts in the first row icon tooltip", async () => {
    const user = userEvent.setup();
    renderTray(queueOf("first", "second"));
    const tray = screen.getByRole("region", { name: "消息队列" });
    expect(within(tray).queryByText(/条排队/)).toBeNull();
    // 只有第一行的图标带提示，其余行的图标不进 Tab 顺序。
    expect(within(tray).getAllByRole("img")).toHaveLength(1);
    await user.hover(within(tray).getByRole("img", { name: "2 条排队，当前运行结束后依次发送" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2 条排队，当前运行结束后依次发送");
  });

  it("caps the list at four rows and dims row actions until hover or focus", () => {
    renderTray(queueOf("a", "b", "c", "d", "e"));
    const list = screen.getByRole("list", { name: "排队的消息" });
    expect(list).toHaveClass("max-h-[144px]", "overflow-y-auto");
    const actions = screen.getByRole("button", { name: "删除排队消息 1" }).parentElement!;
    expect(actions).toHaveClass("opacity-60", "group-hover/queue-row:opacity-100", "group-focus-within/queue-row:opacity-100");
  });

  it("disables steering with the blocking reason", async () => {
    renderTray(queueOf("hold on"), { steerBlockedReason: "压缩中不能引导，完成后会自动发送" });
    expect(screen.getByRole("button", { name: "↳ 引导" })).toBeDisabled();
  });

  it("shows steering rows first with withdraw, and the paused row with resume at the bottom", async () => {
    let queue = queueOf("steered", "waiting");
    queue = { items: queue.items.slice(1), steering: queue.items.slice(0, 1), paused: true };
    const controls = renderTray(queue);
    const tray = screen.getByRole("region", { name: "消息队列" });
    expect(within(tray).getByRole("img", { name: "1 条排队 · 1 条已引导" })).toBeInTheDocument();
    expect(within(tray).getAllByRole("listitem")[0]).toHaveTextContent("steered下一步读取撤回");
    const paused = within(tray).getByRole("status");
    expect(paused).toHaveTextContent("已暂停");
    expect(screen.getByRole("list", { name: "排队的消息" }).compareDocumentPosition(paused) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(within(tray).getByRole("button", { name: "撤回" }));
    expect(controls.onUnsteer).toHaveBeenCalledWith(queue.steering[0]!.id);
    await userEvent.click(within(tray).getByRole("button", { name: "继续发送" }));
    expect(controls.onResume).toHaveBeenCalled();
  });

  it("only allows editing when the input is empty and moving up when not first", async () => {
    const queue = queueOf("first", "second");
    renderTray(queue, {}, false);
    const trigger = screen.getByRole("button", { name: "更多操作：排队消息 1" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /编辑/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /编辑/ })).toHaveTextContent("先清空输入框");
    expect(screen.getByRole("menuitem", { name: "上移" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("edits or moves a queued message from its menu, also by keyboard", async () => {
    const user = userEvent.setup();
    const controls = renderTray(queueOf("first", "second"));
    await user.click(screen.getByRole("button", { name: "更多操作：排队消息 2" }));
    await user.click(screen.getByRole("menuitem", { name: "上移" }));
    expect(controls.onMoveUp).toHaveBeenCalledWith("1");
    expect(screen.queryByRole("menu")).toBeNull();

    // 键盘打开时焦点落在第一项上，Enter 执行。
    screen.getByRole("button", { name: "更多操作：排队消息 1" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "编辑" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(controls.onEdit).toHaveBeenCalledWith("0");
    expect(controls.onMoveUp).toHaveBeenCalledTimes(1);
  });
});
