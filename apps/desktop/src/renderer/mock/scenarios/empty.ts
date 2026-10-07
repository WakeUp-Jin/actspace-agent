import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";

/** 首次启动：没有会话，只有默认工作区。 */
export function emptyScenario(_clock: MockClock): MockHandlers | void {}
