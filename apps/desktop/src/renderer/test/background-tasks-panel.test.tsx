import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import type { BackgroundBashTaskView } from "@actspace/shared/runtime-v2";
import { BackgroundTaskLinkContext, BashRunBlock } from "../components/messages/BashRunBlock";
import { BackgroundTasksPanel } from "../components/right-panel/BackgroundTasksPanel";
import { TooltipProvider } from "../components/ui/Tooltip";
import { overrideBridge } from "./helpers/bridge";

const now = Date.now();
const dev: BackgroundBashTaskView = { taskId: "bash_dev", callId: "c1", description: "启动开发服务器", command: "pnpm dev", cwd: "/work", sandboxed: true, status: "running", startedAt: now - 25_000 };
const test: BackgroundBashTaskView = { taskId: "bash_test", callId: "c2", description: "跑全量测试", command: "pnpm test", cwd: "/work", sandboxed: false, status: "failed", startedAt: now - 90_000, endedAt: now - 30_000, exitCode: 1 };

function renderPanel(focus?: { taskId: string; revision: number }) {
  return render(<TooltipProvider><BackgroundTasksPanel sessionId="s" focus={focus} /></TooltipProvider>);
}

it("lists running commands first, then ended ones, with environment and exit status", async () => {
  overrideBridge({ "tasks.listBackground": vi.fn().mockResolvedValue([test, dev]) });
  renderPanel();
  const running = await screen.findByText("运行中 · 1");
  expect(screen.getByText("已结束 · 1").compareDocumentPosition(running) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(screen.getByRole("button", { name: /启动开发服务器/ })).toHaveTextContent("25s");
  expect(screen.getByRole("button", { name: /跑全量测试/ })).toHaveTextContent("退出 1");
  expect(screen.getByRole("button", { name: /跑全量测试/ }).querySelector(".bash-real-env-badge")).not.toBeNull();
});

it("opens a command's live output and stops it for the user", async () => {
  const read = vi.fn().mockResolvedValue({ task: dev, text: "$ pnpm dev\nready" });
  const stop = vi.fn().mockResolvedValue({ ...dev, status: "stopped", endedAt: now, exitCode: null });
  overrideBridge({ "tasks.listBackground": vi.fn().mockResolvedValue([dev]), "tasks.readBackgroundOutput": read, "tasks.stopBackground": stop });
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: /启动开发服务器/ }));
  expect(await screen.findByLabelText("后台命令输出")).toHaveTextContent("ready");
  expect(read).toHaveBeenCalledWith({ sessionId: "s", taskId: "bash_dev" });
  expect(screen.getByText("pnpm dev", { selector: "dd" })).toBeInTheDocument();
  expect(screen.getByText("停止后会告诉模型是你停的")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  await waitFor(() => expect(stop).toHaveBeenCalledWith({ sessionId: "s", taskId: "bash_dev" }));
  expect(await screen.findByText("已停止")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "停止" })).not.toBeInTheDocument();
});

it("selects the task the chat's 后台 tag points at, or says it is gone", async () => {
  overrideBridge({ "tasks.listBackground": vi.fn().mockResolvedValue([dev]), "tasks.readBackgroundOutput": vi.fn().mockResolvedValue({ task: dev, text: "" }) });
  const { rerender } = renderPanel({ taskId: "bash_dev", revision: 1 });
  expect(await screen.findByRole("heading", { name: "启动开发服务器" })).toBeInTheDocument();
  rerender(<TooltipProvider><BackgroundTasksPanel sessionId="s" focus={{ taskId: "bash_old", revision: 2 }} /></TooltipProvider>);
  expect(await screen.findByText(/找不到这条后台命令/)).toBeInTheDocument();
});

it("shows why the list cannot load", async () => {
  overrideBridge({ "tasks.listBackground": vi.fn().mockRejectedValue(new Error("This operation is unavailable for remote sessions")) });
  renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("无法加载后台任务：This operation is unavailable for remote sessions");
});

it("turns the chat's 后台 tag into a link to the panel only where the conversation provides one", () => {
  const message = { id: "b1", kind: "bash", createdAt: "now", title: "Bash command", status: "running", command: "pnpm dev", background: true, backgroundTaskId: "bash_dev", sandboxed: true } as Extract<MessageBlock, { kind: "bash" }>;
  const open = vi.fn();
  const { unmount } = render(<TooltipProvider><BackgroundTaskLinkContext.Provider value={open}><BashRunBlock message={message} /></BackgroundTaskLinkContext.Provider></TooltipProvider>);
  fireEvent.click(screen.getByRole("button", { name: "后台" }));
  expect(open).toHaveBeenCalledWith("bash_dev");
  expect(screen.getByRole("button", { expanded: false })).not.toHaveTextContent("后台");
  unmount();
  render(<TooltipProvider><BashRunBlock message={message} /></TooltipProvider>);
  expect(screen.queryByRole("button", { name: "后台" })).not.toBeInTheDocument();
  expect(screen.getByText("后台")).toBeInTheDocument();
});
