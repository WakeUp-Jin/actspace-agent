import type { InternalTool } from "../../../internal-tools";
import { bashDefinition } from "./definition";
import { bashExecutor, type BashExecutorConfig } from "./executor";
import { createBashPermissionChecker } from "./permissions";
import { renderBashResult } from "./render-result";

export { bashDefinition } from "./definition";
export { bashExecutor } from "./executor";
export type { BashResult, BashBackgroundedResult, BashExecutorConfig } from "./executor";
export { bashCheckPermissions, createBashPermissionChecker } from "./permissions";
export { renderBashResult } from "./render-result";
export { bashOutputTool, bashKillTool } from "./background-tools";
export {
  bashTaskRegistry,
  BashTaskRegistry,
  formatTaskNotification,
  formatTaskEventNotification,
  type BashTask,
  type BashTaskNotification,
  type BashTaskEventStatus,
  type BashTaskStatus,
  type BashTaskListener,
} from "./task-registry";
export {
  TaskOutputMonitor,
  MIN_SUBSCRIPTION_DEBOUNCE_MS,
  type OutputSubscriptionSpec,
} from "./output-monitor";
export {
  probeSandbox,
  resetSandboxProbeCache,
  buildSandboxSpawn,
  buildSandboxProfile,
  findSandboxViolationEvidence,
  formatSandboxViolationHint,
} from "./sandbox";
export type { SandboxProfileInput, SandboxProfileSpec, SandboxSpawnInput, SandboxSpawnSpec } from "./sandbox";

export function createBashTool(workspaceRoot: string, config: BashExecutorConfig = {}): InternalTool {
  // 生产链路默认沙盒优先（executor 内还有运行时探测兜底）；
  // 直接调 bashExecutor 的测试不经过这里，默认无沙盒。
  const effectiveConfig: BashExecutorConfig = { sandbox: true, ...config };
  return {
    ...bashDefinition,
    handler: (args) => bashExecutor(args, workspaceRoot, effectiveConfig),
    checkPermissions: createBashPermissionChecker(workspaceRoot),
    renderResult: renderBashResult,
    previewKind: "bash",
  };
}
