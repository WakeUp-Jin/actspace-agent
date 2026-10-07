import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { approvalPendingScenario } from "./approval-pending";
import { emptyScenario } from "./empty";
import { longSessionScenario } from "./long-session";
import { remoteHostScenario } from "./remote-host";
import { streamingScenario } from "./streaming";

export type MockScenario = "empty" | "streaming" | "long-session" | "approval-pending" | "remote-host";

/** 场景只负责写入种子数据，必要时覆盖少量 handler（如流式回放的触发时机）。 */
export const MOCK_SCENARIOS: Readonly<Record<MockScenario, (clock: MockClock) => MockHandlers | void>> = {
  empty: emptyScenario,
  streaming: streamingScenario,
  "long-session": longSessionScenario,
  "approval-pending": approvalPendingScenario,
  "remote-host": remoteHostScenario,
};

export function isMockScenario(value: string | null): value is MockScenario {
  return value !== null && Object.hasOwn(MOCK_SCENARIOS, value);
}
