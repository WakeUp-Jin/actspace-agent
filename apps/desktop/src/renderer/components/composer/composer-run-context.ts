import type { ContextState, ContextUsageSnapshot } from "@actspace/shared";
import { selectRequestContextEstimate, type ClientSessionCell } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalProjectionTarget, useProjectionSelect } from "../../session";
import { jsonEqual } from "../../json-equal";
import type { ComposerExecutionContext, ComposerWorkspaceOption } from "./composer-types";
import type { RunTargetRowProps } from "./RunTargetRow";

/**
 * 09 T30：context 用量的来源，按优先级：会话的 ContextState → 调用方给的快照 → 会话投影里的请求估算。
 * 投影只在它属于当前会话时才用（没传 sessionId 时视为当前会话）。
 */
export function useComposerContextSnapshot(sessionId: string | null | undefined, contextState: ContextState | null | undefined, contextSnapshot: ContextUsageSnapshot | null): ContextUsageSnapshot | null {
  const target = useOptionalProjectionTarget();
  const belongs = target !== null && target.sessionId !== null && target.sessionId === (sessionId ?? target.sessionId);
  // 只订阅派生出的用量快照：流式时 cell 每帧换一次，快照几乎不变，输入框外壳不随帧重渲染。
  const projectedSnapshot = useProjectionSelect<ContextUsageSnapshot | null>(selectProjectedContextSnapshot, jsonEqual, belongs ? undefined : null);
  return (contextState ? {
    basis: contextState.basis,
    totalTokens: contextState.totalEstimatedTokens,
    maxTokens: contextState.maxTokens,
    percentUsed: contextState.percentUsed,
    estimator: contextState.estimator,
    buckets: contextState.buckets,
  } : null)
    ?? contextSnapshot
    ?? projectedSnapshot;
}

function selectProjectedContextSnapshot(cell: ClientSessionCell | null): ContextUsageSnapshot | null {
  const estimate = cell ? selectRequestContextEstimate(cell) : null;
  return estimate ? contextEstimateToSnapshot(estimate) : null;
}

/** 本机的分支和运行位置：没有分支名但 HEAD 分离时写「分离的 HEAD」；空仓库（no_head）也算有分支。 */
export function composerGitFacts(executionContext: ComposerExecutionContext | undefined) {
  const gitStatus = executionContext?.gitContext?.status;
  const gitReady = gitStatus === "ready";
  const selectedBranch = executionContext?.selectedBranch ?? executionContext?.gitContext?.currentBranch;
  const detachedHead = gitReady && Boolean(executionContext?.gitContext?.detachedCommit);
  return {
    gitHasBranch: gitReady || gitStatus === "no_head",
    selectedBranch,
    branchLabel: selectedBranch || (detachedHead ? "分离的 HEAD" : undefined),
    runLocation: executionContext?.runLocation ?? "this_mac",
  };
}

export type ComposerLocalRunTargetOptions = {
  readonly workspaceOptions: readonly ComposerWorkspaceOption[];
  readonly selectedWorkspaceRoot?: string;
  readonly onSelectWorkspace?: (root: string) => void;
  readonly executionContext?: ComposerExecutionContext;
  readonly newWorktree: RunTargetRowProps["local"]["newWorktree"];
};

/** 新建页运行位置行的本机部分：工作区、分支和运行位置。工作区名找不到时退回第一项，再退回「工作区」。 */
export function composerLocalRunTarget({ workspaceOptions, selectedWorkspaceRoot, onSelectWorkspace, executionContext, newWorktree }: ComposerLocalRunTargetOptions): RunTargetRowProps["local"] {
  const { gitHasBranch, selectedBranch, branchLabel, runLocation } = composerGitFacts(executionContext);
  return {
    workspaces: workspaceOptions,
    selectedWorkspaceRoot,
    workspaceLabel: workspaceOptions.find((workspace) => workspace.value === selectedWorkspaceRoot)?.label ?? workspaceOptions[0]?.label ?? "选择工作区",
    onSelectWorkspace,
    onUseExistingWorkspace: executionContext?.onUseExistingWorkspace,
    onCreateWorkspaceFolder: executionContext?.onCreateWorkspaceFolder,
    branchLabel: gitHasBranch ? branchLabel : undefined,
    branches: executionContext?.gitContext?.branches ?? [],
    selectedBranch,
    onSelectBranch: executionContext?.onSelectBranch,
    runLocation,
    onSelectRunLocation: executionContext?.onSelectRunLocation,
    newWorktree,
  };
}
