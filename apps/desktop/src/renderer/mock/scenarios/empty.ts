import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";

/** 首次启动：没有会话，只有一个工作区（相当于首次启动自动创建的那个）。 */
export function emptyScenario(_clock: MockClock): MockHandlers | void {}

/** 所有工作区都已从侧栏移除：新建会话页不能发送，提示「请先选择工作区」。 */
export function noWorkspaceScenario({ db }: MockClock): MockHandlers | void {
  db.workspaces = { ...db.workspaces, items: db.workspaces.items.map((item) => ({ ...item, hidden: true })) };
}
