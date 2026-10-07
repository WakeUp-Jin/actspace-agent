import { createContext, useContext } from "react";
import type { ComposerExecutionContext, ComposerWorkspaceOption } from "../components/Composer";
import { capabilitiesOf, type RunTarget } from "./run-target";
import type { RunTargetState } from "./use-run-target";

/**
 * 当前会话（或新建页）的运行目标，以及选择它的入口。WorkbenchLayout → ConversationView → Composer 不再逐层传。
 * `choices` 在没有 Provider 的组件测试里可以不给，这时 Composer 不显示远端的运行位置和工作区 select。
 */
export type RunTargetValue = Omit<RunTargetState, "choices"> & {
  readonly choices?: RunTargetState["choices"];
  /** 新建页可选的本机工作区。 */
  readonly workspaceOptions?: ComposerWorkspaceOption[];
  readonly selectedWorkspaceRoot?: string | null;
  readonly onSelectWorkspace?: (workspaceRoot: string) => void;
  /** 本机的 Git 状态、分支和运行位置。 */
  readonly execution?: ComposerExecutionContext;
};

const LOCAL: RunTarget = { kind: "local" };

/** 没有 Provider 时（直接渲染组件的测试）当作本机、未锁定。 */
export const DEFAULT_RUN_TARGET: RunTargetValue = { target: LOCAL, capabilities: capabilitiesOf(LOCAL), locked: false, readiness: { state: "ready" } };

export const RunTargetContext = createContext<RunTargetValue>(DEFAULT_RUN_TARGET);

export function useRunTargetContext(): RunTargetValue {
  return useContext(RunTargetContext);
}
