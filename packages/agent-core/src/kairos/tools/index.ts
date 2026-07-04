import type { ToolManager } from "../../tools/manager";
import { sleepDefinition, sleepExecutor } from "./sleep";
import { createNotifyUserExecutor, notifyUserDefinition, type NotifyExecutorDeps } from "./notify";

export interface KairosToolsDeps {
  /** 省略时不注册 notify_user（部分测试场景只需要 sleep）。 */
  notify?: NotifyExecutorDeps;
}

/**
 * 把 Kairos 专属工具注册到给定 ToolManager 上。
 * 调用方应传入"Kairos 实例自己的" ToolManager，
 * 不要混到主 Agent 的 ToolManager（sleep / notify_user 都不能给主 Agent 用）。
 */
export function registerKairosTools(manager: ToolManager, deps?: KairosToolsDeps): void {
  manager.registerFromSpec(sleepDefinition, sleepExecutor);
  if (deps?.notify) {
    manager.registerFromSpec(notifyUserDefinition, createNotifyUserExecutor(deps.notify));
  }
}

export { sleepDefinition, sleepExecutor };
export { notifyUserDefinition, createNotifyUserExecutor, NOTIFY_PER_TICK_LIMIT } from "./notify";
