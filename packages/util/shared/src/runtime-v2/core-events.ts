import type { RuntimeV2JsonValue } from "./host-dto";
import type { ApprovalDecision, ApprovalRequest, PermissionMode, SessionGrant } from "./permission";
import type { RuntimeV2AgentMode } from "./runtime";
import type { SessionEventCandidateV1, SessionEventProvenanceV1, SessionSurfaceNodeV1, SessionSurfaceOperationV1 } from "./session-events";
import type { InboxSourceId, SubagentActivationStatus, SubagentActivationTrigger, SubagentDelivery, SubagentKind, SubagentPreset } from "./subagents";

/**
 * `@actspace/core` 名下的 Session 事件在写入时的形状：事件名 → `data`。
 *
 * 往日志里写这些事件只有 `coreEvent` 一个入口。事件名写错、字段名写错、少了必填字段，都在编译时报错；
 * 加一种事件或一个字段，先改这张表。这里只描述现在的代码会写什么：旧会话里的历史形状由 codec 的校验和各处的读取代码兼容，
 * 不放进来。
 *
 * 字段的值都得是 JSON。结构由别的包定义、这里只负责原样存下来的字段（用量、失败原因、消息内容、请求快照等）
 * 写成 `RuntimeV2JsonValue`。
 */
export type CoreEventDataMap = {
  "turn/start": { readonly turnId: string; readonly agentRunId: string; readonly mode: RuntimeV2AgentMode; readonly modeRevision: number };
  /** `forked`：fork 出的子会话把继承来的那个回合收尾；`interrupted`：恢复时补上的结束。 */
  "turn/end": { readonly turnId: string; readonly reason: "completed" | "step-limit" | "aborted" | "failed" | "interrupted" | "forked"; readonly failure?: RuntimeV2JsonValue; readonly repairId?: string };
  "step/start": { readonly turnId: string; readonly stepId: string; readonly agentRunId: string; readonly stepIndex: number; readonly metadata?: RuntimeV2JsonValue };
  "step/end": { readonly turnId: string; readonly stepId: string; readonly reason: "completed" | "tool-use" | "aborted" | "failed" | "interrupted"; readonly usage?: RuntimeV2JsonValue; readonly repairId?: string };
  /** 任务队列领取任务时写的那一条不带 `turnId`：它写在回合开始之前。 */
  "user/message": { readonly messageId: string; readonly agentRunId: string; readonly turnId?: string; readonly content: RuntimeV2JsonValue };
  "assistant/message":
    | (CoreRequestIds & { readonly messageId: string; readonly content: RuntimeV2JsonValue; readonly finishReason: string; readonly usage: RuntimeV2JsonValue; readonly firstTokenAt?: string })
    /** 恢复时给没有结果的请求补的结束。 */
    | { readonly requestId: string; readonly messageId: string; readonly content: ""; readonly finishReason: "aborted"; readonly recovery: "outcome-unknown"; readonly repairId: string };
  "llm/retry": { readonly requestId: string; readonly retryId: string; readonly attempt: number; readonly nextAttempt: number; readonly delayMs: number; readonly failure: RuntimeV2JsonValue; readonly usage: RuntimeV2JsonValue };
  "llm/retry-started": { readonly requestId: string; readonly retryId: string; readonly attempt: number };
  "llm/auxiliary-start": CoreAuxiliaryRequestData;
  "llm/auxiliary-end": CoreAuxiliaryRequestData & { readonly finishedAt: string; readonly status: "completed" | "failed" | "aborted"; readonly usage: RuntimeV2JsonValue };

  "request/header": CoreRequestIds & { readonly routeId: string; readonly model: string; readonly contextWindow: number | null; readonly attempt: number; readonly agentMode: RuntimeV2AgentMode; readonly agentModeRevision: number };
  "request/system-prompt": CoreRequestIds & { readonly digest: string; readonly sections: readonly RuntimeV2JsonValue[]; readonly modelFacts: readonly RuntimeV2JsonValue[]; readonly contributorProvenance: readonly RuntimeV2JsonValue[] };
  "request/tools": CoreRequestIds & { readonly digest: string; readonly tools: readonly RuntimeV2JsonValue[] };
  /** 恢复时给只写了 header 的请求补的那一条只有 id，没有快照。 */
  "request/context": CoreRequestIds & ({ readonly snapshot: RuntimeV2JsonValue } | { readonly repairId: string });

  "tool/call": CoreRequestIds & { readonly agentRunId: string; readonly callId: string; readonly pluginId: string; readonly name: string; readonly args: RuntimeV2JsonValue };
  "tool/result": {
    readonly approvalMode?: "auto" | "manual" | "session";
    readonly approvalReason?: string;
    readonly callId: string;
    readonly pluginId: string;
    readonly name: string;
    readonly status: "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
    readonly summary: string;
    readonly modelOutput: readonly RuntimeV2JsonValue[];
    readonly detail: readonly RuntimeV2JsonValue[];
    readonly artifacts: readonly RuntimeV2JsonValue[];
    readonly failure: RuntimeV2JsonValue;
    readonly renderer: RuntimeV2JsonValue;
  };
  "tool/recovery-outcome": { readonly callId: string; readonly repairId: string; readonly outcome: "not-started" | "outcome-unknown"; readonly retryAllowed: boolean; readonly content: string };
  "tool-workflow/run-start": { readonly callId: string; readonly pluginId: string; readonly name: string; readonly registrationId: string; readonly definitionVersion: number; readonly definitionDigest: string };

  "permission/asked": ApprovalRequest;
  /** 审批中途权限模式变了，拒绝会多带一个 `reason`。 */
  "permission/decided": ApprovalDecision | (Extract<ApprovalDecision, { readonly kind: "deny" }> & { readonly reason: string });
  "permission/scope-denied": { readonly callId: string; readonly code: string; readonly reason: string };
  "permission/grant-added": SessionGrant;
  "permission/grant-used": { readonly schemaVersion: 1; readonly grantId: string; readonly sessionId: string; readonly agentId: string; readonly callId: string; readonly pluginId: string; readonly toolName: string; readonly commandDigest: string; readonly usedAt: string };
  "permission/grant-revoked": { readonly schemaVersion: 1; readonly grantId: string; readonly sessionId: string; readonly agentId: string; readonly revokedAt: string; readonly reason: "workspace-changed" | "permission-mode-downgrade" | "user-revoked" };
  "permission/mode-set": { readonly mode: PermissionMode; readonly changedAt: string; readonly source: string };

  "agent/mode-set": { readonly mode: RuntimeV2AgentMode; readonly revision: number; readonly changedAt: string; readonly source: string };
  "agent/inbox/spliced":
    | { readonly operation: "enqueue"; readonly messageId: string; readonly target: CoreInboxTarget; readonly content: RuntimeV2JsonValue; readonly source: InboxSourceId; readonly senderId?: string; readonly notice?: CoreInboxNotice }
    /** 领取时把内容再带一遍：只加载后半段日志也能推出模型看到的节点。 */
    | { readonly operation: "claim"; readonly messageId: string; readonly target: CoreInboxTarget; readonly content: RuntimeV2JsonValue; readonly source?: InboxSourceId; readonly senderId?: string; readonly notice?: CoreInboxNotice; readonly opensTurn?: true }
    | { readonly operation: "discard"; readonly messageId: string; readonly target: CoreInboxTarget; readonly reason: string };

  "session/title-set": { readonly title: string | null };
  "session/pinned-set": { readonly pinned: boolean };
  "session/archived-set": { readonly archived: boolean };
  "session/workspace-set": { readonly workspaceRoot: string };
  "session/rewound": { readonly cutSeq: number; readonly droppedThroughSeq: number; readonly runId: string; readonly archive: string; readonly rewoundAt: string };
  "session/end-seed": { readonly sessionId: string; readonly lastSeq: number };

  "background/task":
    | { readonly op: "start"; readonly taskId: string; readonly kind: "bash" | "agent"; readonly callId: string; readonly description: string; readonly startedAt: string; readonly transcriptPath?: string }
    | { readonly op: "settle"; readonly taskId: string; readonly status: "completed" | "failed" | "stopped" | "lost"; readonly exitCode?: number | null; readonly endedAt: string; readonly delivery: "notified" | "stopped" | "lost" }
    | { readonly op: "prune"; readonly taskId: string; readonly prunedAt: string; readonly reason: "session-cap" };
  /** `preset` 只有 `local` 有，`inheritedThroughSeq` 只有 `fork` 有。 */
  "subagent/spawned": { readonly agentId: string; readonly callId: string; readonly kind: SubagentKind; readonly preset?: SubagentPreset; readonly description: string; readonly transcriptPath: string; readonly createdAt: string; readonly inheritedThroughSeq?: number; readonly toolNames?: readonly string[] };
  "subagent/activation":
    | { readonly op: "start"; readonly agentId: string; readonly activationId: string; readonly trigger: SubagentActivationTrigger; readonly callId: string; readonly background: boolean; readonly model?: string; readonly reasoningEffort?: string; readonly startedAt: string }
    | { readonly op: "settle"; readonly agentId: string; readonly activationId: string; readonly status: SubagentActivationStatus; readonly summary: string; readonly result?: string; readonly resultTruncated?: boolean; readonly delivery: SubagentDelivery; readonly endedAt: string };

  "recovery/start": { readonly repairId: string; readonly sourceBoundarySeq: number };
  "recovery/committed": { readonly repairId: string; readonly sourceBoundarySeq: number };

  "compaction/start": { readonly compactionId: string; readonly start: number; readonly end: number };
  "compaction/summary": { readonly compactionId: string; readonly summaryDigest: string };
  /** 摘要节点只存在 `data.node`，`surface` 只记被替换的范围。 */
  "surface/replaced": { readonly compactionId: string; readonly sourceEventSeqs: readonly number[]; readonly replacedTokens: { readonly conversation: number; readonly summarizedConversation: number }; readonly estimatorVersion: string; readonly node: SessionSurfaceNodeV1 };
  "compaction/end": { readonly compactionId: string; readonly summaryDigest: string; readonly durationMs?: number; readonly trigger?: "manual" | "auto"; readonly beforeTokens?: number; readonly afterTokens?: number; readonly beforeEstimated?: true };
};

export type CoreEventType = keyof CoreEventDataMap;

/** 一次 LLM 请求的各条记录共用的 id。 */
export type CoreRequestIds = { readonly requestId: string; readonly turnId: string; readonly stepId: string };

export type CoreInboxTarget = "next-step" | "next-turn";
/** 后台任务通知的展示信息；模型只读 `content`。 */
export type CoreInboxNotice = { readonly taskId: string; readonly kind: string; readonly title: string; readonly status: string };

/**
 * 辅助请求（会话标题、压缩、图片识别、自动审批）的身份。会话标题和压缩不属于某一次工具调用，不带那四个 id，
 * 压缩可以带 `turnId`；图片识别和自动审批由工具发起，四个 id 都要有。
 */
export type CoreAuxiliaryRequestData = (
  | { readonly sessionId: string; readonly purpose: "session-title" }
  | { readonly sessionId: string; readonly purpose: "compaction"; readonly turnId?: string }
  | { readonly sessionId: string; readonly purpose: "image-inspection" | "auto-review"; readonly agentRunId: string; readonly turnId: string; readonly stepId: string; readonly callId: string }
) & {
  /** 同一次逻辑请求的各次尝试共用。 */
  readonly logicalRequestId: string;
  /** 每次派发一个。 */
  readonly attemptId: string;
  readonly attempt: number;
  readonly routeId: string;
  readonly model: string;
  readonly startedAt: string;
};

export type CoreEventOptions = {
  /** 这条事件是否改动模型看到的对话；不传就是不改。 */
  readonly surface?: SessionSurfaceOperationV1 | null;
  /** 不传时由日志补默认值（没有来源事件，没有贡献者）。 */
  readonly provenance?: SessionEventProvenanceV1;
};

export const CORE_EVENT_OWNER = "@actspace/core";

/** 构造一条 `@actspace/core` 名下的事件，交给 `session.append` / `appendMany`。 */
export function coreEvent<T extends CoreEventType>(type: T, data: CoreEventDataMap[T], options: CoreEventOptions = {}): SessionEventCandidateV1 {
  return {
    type,
    eventVersion: 1,
    source: { ownerPluginId: CORE_EVENT_OWNER },
    data,
    surface: options.surface ?? null,
    ...(options.provenance === undefined ? {} : { provenance: options.provenance }),
  };
}
