import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { approvalPendingScenario, approvalPrefixScenario } from "./approval-pending";
import { backgroundTasksScenario } from "./background-tasks";
import { compactionScenario } from "./compaction";
import { contextPaginationScenario } from "./context-pagination";
import { emptyScenario, noWorkspaceScenario } from "./empty";
import { longSessionScenario } from "./long-session";
import { markdownScenario } from "./markdown";
import { remoteHostScenario } from "./remote-host";
import { scriptExecutionScenario } from "./script-execution";
import { sideChatScenario } from "./side-chat";
import { sidebarScenario } from "./sidebar";
import { streamingScenario } from "./streaming";
import { subagentTrajectoryScenario } from "./subagent-trajectory";
import { thinkingScenario } from "./thinking";
import { turnDeliverablesScenario } from "./turn-deliverables";

export type MockScenario =
  | "empty"
  | "streaming"
  | "long-session"
  | "approval-pending"
  | "remote-host"
  | "approval-prefix"
  | "context-pagination"
  | "turn-deliverables"
  | "no-workspace"
  | "sidebar"
  | "subagent-trajectory"
  | "background-tasks"
  | "compaction"
  | "side-chat"
  | "harness-stats"
  | "usage-stats"
  | "markdown"
  | "script-execution"
  | "thinking";

/** 场景只负责写入种子数据，必要时覆盖少量 handler（如流式回放的触发时机）。 */
export const MOCK_SCENARIOS: Readonly<Record<MockScenario, (clock: MockClock) => MockHandlers | void>> = {
  "context-pagination": contextPaginationScenario,
  empty: emptyScenario,
  "no-workspace": noWorkspaceScenario,
  streaming: streamingScenario,
  "long-session": longSessionScenario,
  "approval-pending": approvalPendingScenario,
  "approval-prefix": approvalPrefixScenario,
  "remote-host": remoteHostScenario,
  "turn-deliverables": turnDeliverablesScenario,
  sidebar: sidebarScenario,
  "subagent-trajectory": subagentTrajectoryScenario,
  "background-tasks": backgroundTasksScenario,
  compaction: compactionScenario,
  "side-chat": sideChatScenario,
  markdown: markdownScenario,
  "script-execution": scriptExecutionScenario,
  thinking: thinkingScenario,
  // 「Harness 统计」页的数据在 harness-stats-fixture.ts，会话侧沿用空场景；起始位置见 components/harness-stats/dev-start.ts。
  "harness-stats": emptyScenario,
  "usage-stats": emptyScenario,
};

export function isMockScenario(value: string | null): value is MockScenario {
  return value !== null && Object.hasOwn(MOCK_SCENARIOS, value);
}
