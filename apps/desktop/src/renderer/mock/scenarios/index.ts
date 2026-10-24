import { backgroundTasksScenario } from "./background-tasks";
import { contextPaginationScenario } from "./context-pagination";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { approvalPendingScenario, approvalPrefixScenario } from "./approval-pending";
import { emptyScenario, noWorkspaceScenario } from "./empty";
import { longSessionScenario } from "./long-session";
import { remoteHostScenario } from "./remote-host";
import { sidebarScenario } from "./sidebar";
import { streamingScenario } from "./streaming";
import { turnDeliverablesScenario } from "./turn-deliverables";
import { subagentTrajectoryScenario } from "./subagent-trajectory";

export type MockScenario = "empty" | "streaming" | "long-session" | "approval-pending" | "remote-host" | "approval-prefix" | "context-pagination" | "turn-deliverables" | "no-workspace" | "sidebar" | "subagent-trajectory" | "background-tasks";

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
};

export function isMockScenario(value: string | null): value is MockScenario {
  return value !== null && Object.hasOwn(MOCK_SCENARIOS, value);
}
