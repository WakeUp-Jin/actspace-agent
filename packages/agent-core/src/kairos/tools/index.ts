import type { ToolManager } from "../../tools/manager";
import { sleepDefinition, sleepExecutor } from "./sleep";

/**
 * 把 Kairos 专属工具注册到给定 ToolManager 上。
 * 调用方应传入"Kairos 实例自己的" ToolManager，
 * 不要混到主 Agent 的 ToolManager（Sleep 不能给主 Agent 用）。
 */
export function registerKairosTools(manager: ToolManager): void {
  manager.registerFromSpec(sleepDefinition, sleepExecutor);
}

export { sleepDefinition, sleepExecutor };
