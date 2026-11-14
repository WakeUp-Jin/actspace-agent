import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import {
  BackgroundNoticeRow,
  backgroundNoticeBody,
  backgroundNoticeLabel,
} from "../components/messages/BackgroundNoticeRow";
import { TurnView } from "../components/conversation/TurnView";

type Notice = Extract<MessageBlock, { kind: "background_notice" }>;
const notice = (partial: Partial<Notice>): Notice => ({
  kind: "background_notice",
  id: "n",
  createdAt: "now",
  content: "",
  taskId: "child-1",
  taskKind: "subagent",
  title: "复核提交顺序",
  status: "completed",
  ...partial,
});

const done = [
  "<subagent_notification>",
  "<agent_id>child-1</agent_id>",
  "<description>复核提交顺序</description>",
  "<status>completed</status>",
  "<summary>复核了 prepare &amp; commit</summary>",
  "<transcript>/data/child-1/transcript.md</transcript>",
  "<closing_message>",
  "顺序没问题，`a &lt; b` 成立。",
  "</closing_message>",
  "</subagent_notification>",
].join("\n");

// 登记表发的新格式：结论保持原文（不转义）。
const taskDone = [
  "<task_notification>",
  "<task_id>child-1</task_id>",
  "<kind>agent</kind>",
  "<description>复核提交顺序</description>",
  "<status>completed</status>",
  "<summary>Subagent child-1 (复核提交顺序) completed.</summary>",
  "<transcript>/data/child-1/transcript.md</transcript>",
  "<closing_message>",
  "顺序没问题，`a &lt; b` 是字面量。",
  "</closing_message>",
  "</task_notification>",
].join("\n");

it("reads the registry's task_notification for a subagent, closing message kept as written", () => {
  expect(backgroundNoticeBody(notice({ content: taskDone }))).toBe("顺序没问题，`a &lt; b` 是字面量。");
  const stopped = taskDone
    .replace(/<closing_message>[\s\S]*<\/closing_message>/, "")
    .replace("completed.</summary>", "was stopped.</summary>");
  expect(backgroundNoticeBody(notice({ content: stopped, status: "stopped" }))).toBe(
    "Subagent child-1 (复核提交顺序) was stopped.",
  );
  expect(backgroundNoticeLabel(notice({ status: "stopped" }))).toBe("子智能体 复核提交顺序 已停止");
});

it("labels subagent, agent message and Bash notices", () => {
  expect(backgroundNoticeLabel(notice({}))).toBe("子智能体 复核提交顺序 已完成");
  expect(backgroundNoticeLabel(notice({ status: "lost" }))).toBe("子智能体 复核提交顺序 中断（应用退出）");
  expect(backgroundNoticeLabel(notice({ taskKind: "agent_message", status: "message" }))).toBe("复核提交顺序 发来消息");
  expect(backgroundNoticeLabel(notice({ taskKind: "bash", title: "pnpm test" }))).toBe(
    "后台任务 · Bash: pnpm test · 已完成",
  );
});

it("shows a subagent's conclusion, a message's body and a Bash notice as is", () => {
  expect(backgroundNoticeBody(notice({ content: done }))).toBe("顺序没问题，`a < b` 成立。");
  // 没有结论（或结论为空）时看 summary；结束前刚来过信时带上说明。
  const omitted = done.replace(
    /<closing_message>[\s\S]*<\/closing_message>/,
    "<note>It sent you a message just before finishing, so its closing message is omitted.</note>",
  );
  expect(backgroundNoticeBody(notice({ content: omitted }))).toBe(
    "复核了 prepare & commit\n\nIt sent you a message just before finishing, so its closing message is omitted.",
  );
  expect(
    backgroundNoticeBody(notice({ content: done.replace("顺序没问题，`a &lt; b` 成立。", "(no closing message)") })),
  ).toBe("复核了 prepare & commit");
  expect(
    backgroundNoticeBody(
      notice({
        taskKind: "agent_message",
        content: '<agent_message from="child-1" relation="child">\n只改一处\n</agent_message>',
      }),
    ),
  ).toBe("只改一处");
  const bash = "<task_notification>\n<task_id>bash_1</task_id>\n</task_notification>";
  expect(backgroundNoticeBody(notice({ taskKind: "bash", content: bash }))).toBe(bash);
});

it("expands to the conclusion and opens the subagent", () => {
  const open = vi.fn();
  render(<BackgroundNoticeRow message={notice({ content: done })} onOpenSubagent={open} />);
  expect(screen.queryByRole("button", { name: "打开子智能体" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /子智能体 复核提交顺序 已完成/ }));
  expect(screen.getByText("顺序没问题，`a < b` 成立。")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "打开子智能体" }));
  expect(open).toHaveBeenCalledWith("child-1");
});

it("opens the subagent from a notice that starts a turn", () => {
  const open = vi.fn();
  render(
    <TurnView
      turn={{ id: "n", user: null, notice: notice({ content: done }), messages: [] }}
      isActive={false}
      sessionId="parent"
      setTurnElement={() => {}}
      onOpenSubagent={open}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /子智能体 复核提交顺序 已完成/ }));
  fireEvent.click(screen.getByRole("button", { name: "打开子智能体" }));
  expect(open).toHaveBeenCalledWith("child-1");
});
