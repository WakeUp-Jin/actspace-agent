import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import { appendMockMessage, type MockDb, type MockRawEvent, type MockSession } from "../mock-db";
import { seedSession } from "./seed";

/**
 * 后台任务：第 1 轮后台跑测试、后台委派调研；第 2、3 轮由任务完成通知唤醒，以细分隔行开头；
 * 第 3 轮又起了一个仍在运行的后台 dev server。用来检查「后台」标签、卡片状态和唤醒分隔行。
 */

function appendTool(db: MockDb, session: MockSession, runId: string, name: string, args: Record<string, RuntimeV2JsonValue>, result: Record<string, RuntimeV2JsonValue>, after: (callId: string) => MockRawEvent[] = () => []): string {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, tool: { name, args, result } };
  // background/task 与 delegation/requested 写在工具结果之后，挂到下一条消息前面。
  const pending = after(message.id);
  if (pending.length) appendEvents(db, session, runId, pending);
  return message.id;
}

/** 只有原始事件、没有正文的占位消息。 */
function appendEvents(db: MockDb, session: MockSession, runId: string, events: MockRawEvent[]): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, events };
}

function notification(taskId: string, kind: "bash" | "agent", summary: string, body: string): string {
  return ["<task_notification>", `<task_id>${taskId}</task_id>`, `<kind>${kind}</kind>`, "<status>completed</status>", `<summary>${summary}</summary>`, kind === "bash" ? `<output_tail>${body}</output_tail>` : `<result>${body}</result>`, "</task_notification>"].join("\n");
}

function claim(messageId: string, notice: { taskId: string; kind: "bash" | "agent"; title: string; status: string }, content: string): MockRawEvent {
  return {
    type: "agent/inbox/spliced",
    data: { operation: "claim", messageId, target: "next-step", source: "task_notification", notice, opensTurn: true },
    surface: { kind: "append", node: { kind: "user", messageId, content } },
  };
}

export function backgroundTasksScenario({ db }: MockClock): void {
  const session = seedSession(db, { title: "后台跑测试并调研", minutesAgo: 1, turns: [["跑一下全量测试，同时让子 Agent 调研 Kimi Code 的后台任务工具。", null]] });
  const first = session.messages[session.messages.length - 1].agentRunId;
  appendTool(db, session, first, "bash", { command: "pnpm test", intent: "运行全量测试", blockMs: 0 }, {
    status: "completed", summary: "Bash command",
    modelOutput: [{ type: "text", text: "status: backgrounded\ntask_id: bash_mock_test" }],
    detail: [{ label: "background-task", value: { taskId: "bash_mock_test", status: "running" } }],
  }, (callId) => [{ type: "background/task", data: { op: "start", taskId: "bash_mock_test", kind: "bash", callId, description: "运行全量测试", startedAt: new Date().toISOString() } }]);
  appendTool(db, session, first, "agent", { task: "调研 Kimi Code 的后台任务工具", background: true }, {
    status: "completed", summary: "Background agent started",
    modelOutput: [{ type: "text", text: "task_id: agent_mock_inv\nautomatic_notification: true" }],
    detail: [{ label: "delegation", value: { childSessionId: "mock-child-session", presetId: "actspace.agent", background: true, status: "running" } }],
  }, (callId) => [
    { type: "delegation/requested", data: { invocationId: "mock_inv", parentCallId: callId, childSessionId: "mock-child-session", presetId: "actspace.agent" } },
    { type: "background/task", data: { op: "start", taskId: "agent_mock_inv", kind: "agent", callId, description: "调研 Kimi Code 的后台任务工具", startedAt: new Date().toISOString() } },
  ]);
  appendMockMessage(db, session, "assistant", "测试和调研都放到后台了，完成后我会自动收到通知。", first);

  const second = db.nextId("seed-run");
  appendEvents(db, session, second, [
    { type: "background/task", data: { op: "settle", taskId: "bash_mock_test", status: "completed", exitCode: 0, endedAt: new Date().toISOString(), delivery: "notified" } },
    claim("notice-bash", { taskId: "bash_mock_test", kind: "bash", title: "运行全量测试", status: "completed" }, notification("bash_mock_test", "bash", "Background command \"pnpm test\" completed with exit code 0.", "Test Files  86 passed (86)\n     Tests  412 passed (412)")),
  ]);
  appendMockMessage(db, session, "assistant", "全量测试通过：86 个文件、412 个用例。调研还在进行。", second);

  const third = db.nextId("seed-run");
  appendEvents(db, session, third, [
    { type: "delegation/completed", data: { invocationId: "mock_inv", childSessionId: "mock-child-session", presetId: "actspace.agent", status: "completed" } },
    { type: "background/task", data: { op: "settle", taskId: "agent_mock_inv", status: "completed", endedAt: new Date().toISOString(), delivery: "notified" } },
    claim("notice-agent", { taskId: "agent_mock_inv", kind: "agent", title: "调研 Kimi Code 的后台任务工具", status: "completed" }, notification("agent_mock_inv", "agent", "Background agent completed: 调研 Kimi Code 的后台任务工具", "Kimi Code 用统一的任务登记表管理后台 Bash 与子 Agent，提供 TaskList / TaskOutput / TaskStop / WaitFor 四个工具。")),
  ]);
  appendTool(db, session, third, "bash", { command: "pnpm dev", intent: "启动开发服务器", blockMs: 0 }, {
    status: "completed", summary: "Bash command",
    modelOutput: [{ type: "text", text: "status: backgrounded\ntask_id: bash_mock_dev" }],
    detail: [{ label: "background-task", value: { taskId: "bash_mock_dev", status: "running" } }],
  }, (callId) => [{ type: "background/task", data: { op: "start", taskId: "bash_mock_dev", kind: "bash", callId, description: "启动开发服务器", startedAt: new Date().toISOString() } }]);
  appendMockMessage(db, session, "assistant", "调研结论：Kimi Code 用统一登记表管理后台 Bash 与子 Agent，配四个任务工具。开发服务器已在后台启动。", third);
}
