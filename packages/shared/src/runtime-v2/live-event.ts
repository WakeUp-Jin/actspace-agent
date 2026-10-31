import type { RuntimeV2JsonValue } from "./host-dto";

/**
 * Wire shape of the Agent loop live stream (`host.event` value `{ kind: "live", event }`).
 * Structurally mirrors `AgentLoopLiveEvent` without depending on core packages; nested
 * Runtime records keep only the fields presentation reads.
 */
type LiveIdentity = {
  readonly parentSessionId?: string;
  readonly parentCallId?: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId?: string;
  readonly workspaceRoot?: string;
};
type StreamPayload =
  | { readonly kind: "assistant-delta"; readonly message: string }
  | { readonly kind: "reasoning-delta"; readonly message: string }
  | { readonly kind: "tool-call-delta"; readonly callId: string; readonly name: string; readonly argumentsDelta: string };
export type AgentLiveToolResult = { readonly status: "completed" | "failed" | "denied" | "aborted" | "outcome-unknown"; readonly [field: string]: unknown };
export type AgentLiveFailure = { readonly kind: string; readonly message: string; readonly retryable: boolean; readonly [field: string]: unknown };
export type AgentLiveEvent = LiveIdentity & (
  | (StreamPayload & { readonly requestId: string; readonly messageId: string })
  | { readonly kind: "run-state"; readonly message: string; readonly requestId?: string; readonly model?: string; readonly failure?: AgentLiveFailure }
  | { readonly kind: "tool-prepared"; readonly requestId: string; readonly callId: string; readonly name: string; readonly arguments: RuntimeV2JsonValue }
  | { readonly kind: "tool-started"; readonly requestId: string; readonly callId: string; readonly name: string }
  | { readonly kind: "tool-finished"; readonly requestId: string; readonly callId: string; readonly name: string; readonly result: AgentLiveToolResult; readonly resultEventId: string }
  | { readonly kind: "compaction-started" }
  | { readonly kind: "compaction-finished"; readonly removedCount: number; readonly durationMs: number; readonly compactionId?: string; readonly trigger?: "manual" | "auto"; readonly beforeTokens?: number; readonly afterTokens?: number; readonly beforeEstimated?: true }
  | { readonly kind: "compaction-failed"; readonly message: string }
  /** 唤醒回合第一步领取的任务通知带 `notice` 与正文，前端据此在回合开头画分隔行。 */
  | { readonly kind: "inbox-claimed"; readonly messageId: string; readonly source?: "task_notification" | "steer"; readonly notice?: { readonly taskId: string; readonly kind: string; readonly title: string; readonly status: string }; readonly content?: string }
);
