// 聊天流里一条渲染块（`MessageBlock`）与会话级 diff 汇总；由持久化事件和实时流事件投影而来。

import type { FileReference, ResponseAnnotationReference } from "../composer-content";
import type { ComposerAttachment } from "./attachments";
import type { BackgroundNotice, SessionEvent, TurnUsageSummary } from "./events";
import type { EventId, SessionId } from "./primitives";
import type {
  AgentToolPreview,
  BashPreview,
  PresentedFile,
  SubagentToolLink,
  TodoUiPreview,
  ToolArtifact,
} from "./tool-preview";

export type MessageBlock = {
  deferredToolDetail?: { sessionId: string; callId: string };
  /**
   * React 展示身份。持久化 event id 保留给数据引用和消息操作，流式状态与持久化状态
   * 则通过同一个 renderKey 复用 DOM，避免 turn 完成时重新播放入场动画。
   */
  renderKey?: string;
  /** 产生这个块的 run：durable 块取 event.agentRunId，live 块取当前 run。合并 durable 与 live 时按它判断归属。 */
  runId?: string;
  /** durable 块对应事件的 sourceSeq；live 块和合成事件产生的块没有。 */
  sourceSeq?: number;
  /** durable 块所在的 Journal turn；「从这条回复分叉」用它定位。live 块没有。 */
  turnId?: string;
} & (
  | {
      kind: "user";
      id: EventId;
      content: string;
      createdAt: string;
      attachments?: ComposerAttachment[];
      fileReferences?: FileReference[];
      responseAnnotations?: ResponseAnnotationReference[];
    }
  | {
      kind: "assistant";
      id: EventId;
      content: string;
      createdAt: string;
      model?: string;
      provider?: string;
      /** 本轮所有 LLM call 的用量合计，只挂在最终可见回复上。 */
      usage?: TurnUsageSummary;
    }
  | {
      kind: "thinking";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      collapsedByDefault: boolean;
      /** 仅用于当前 renderer 流式投影；持久化 Thinking 默认是 completed。 */
      status?: "running" | "completed";
    }
  | {
      kind: "read";
      id: EventId;
      filePath: string;
      range?: string;
      displayText: string;
      resultPreview?: string[];
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      approvalRequestId?: string;
      reason?: string;
    }
  | {
      kind: "search";
      id: EventId;
      query: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      resultPreview?: string[];
      createdAt: string;
      status?: "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
    }
  | {
      kind: "grep";
      id: EventId;
      pattern: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      resultPreview?: string[];
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      approvalRequestId?: string;
      reason?: string;
    }
  | {
      kind: "glob";
      id: EventId;
      pattern: string;
      scope?: string;
      resultCount?: number;
      displayText: string;
      resultPreview?: string[];
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      approvalRequestId?: string;
      reason?: string;
    }
  | {
      kind: "web_search";
      id: EventId;
      mode: "query" | "url";
      query?: string;
      url?: string;
      displayText: string;
      createdAt: string;
      status?: "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      resultUrls?: string[];
      contentPreview?: string;
    }
  | {
      kind: "media_analysis";
      id: EventId;
      mediaName: string;
      mediaKind: "image" | "video" | "media";
      displayText: string;
      createdAt: string;
      status?: "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      isError?: boolean;
    }
  | {
      kind: "image_generation";
      id: EventId;
      status: "running" | "completed" | "partial" | "failed";
      promptPreview: string;
      requestedCount: number;
      generatedCount?: number;
      model?: string;
      size: string;
      displayText: string;
      images?: ToolArtifact[];
      warning?: string;
      errorMessage?: string;
      createdAt: string;
    }
  | {
      kind: "directory_list";
      id: EventId;
      path: string;
      entryCount?: number;
      displayText: string;
      resultPreview?: string[];
      createdAt: string;
      status?: "running" | "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
    }
  | {
      kind: "edit_diff";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      /** Transient generation progress; never a count of bytes saved or diff lines. */
      generationProgress?: { phase: "generating" | "preparing" | "saving"; characters: number };
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** pending 审批时的原因说明 */
      reason?: string;
      /** 失败/拒绝时的错误说明 */
      errorMessage?: string;
    }
  | {
      kind: "write_diff";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      additions: number;
      deletions: number;
      diff: string;
      collapsedLines: number;
      /** Transient generation progress; never a count of bytes saved or diff lines. */
      generationProgress?: { phase: "generating" | "preparing" | "saving"; characters: number };
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      /** pending 审批时的原因说明 */
      reason?: string;
      /** 失败/拒绝时的错误说明 */
      errorMessage?: string;
      /** running 阶段从 LLM 流式 args.content 提取的部分内容；completed 不使用 */
      streamingContent?: string;
    }
  | {
      kind: "delete";
      id: EventId;
      filePath: string;
      outputPath?: string;
      outputRelativePath?: string;
      displayText: string;
      createdAt: string;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      isError?: boolean;
      approvalRequestId?: string;
      reason?: string;
    }
  | {
      kind: "present";
      id: EventId;
      files: PresentedFile[];
      displayText: string;
      createdAt: string;
      status?: "running" | "completed" | "failed" | "denied";
      isError?: boolean;
    }
  | ({
      kind: "bash";
      id: EventId;
      createdAt: string;
    } & BashPreview)
  | ({
      kind: "agent";
      id: EventId;
      createdAt: string;
      transcriptEvents?: SessionEvent[];
    } & Omit<AgentToolPreview, "kind">)
  | ({
      kind: "todo";
      id: EventId;
      createdAt: string;
      status: "running" | "completed" | "failed";
      isError?: boolean;
    } & Omit<TodoUiPreview, "kind">)
  | {
      kind: "tool";
      id: EventId;
      toolName?: string;
      title: string;
      content: string;
      artifacts?: ToolArtifact[];
      subagentLink?: SubagentToolLink;
      createdAt: string;
      isError?: boolean;
      status?: "pending" | "running" | "completed" | "failed" | "denied";
      approvalRequestId?: string;
      approvalReason?: string;
      approvalScope?: "browser_session";
    }
  | {
      kind: "context_compaction";
      id: EventId;
      status: "running" | "completed" | "failed";
      /** running：计时起点（ISO 时间） */
      startedAt?: string;
      /** completed：被摘要替换的消息条数 */
      removedCount?: number;
      /** completed：压缩耗时，来自 journal 时间差 */
      durationMs?: number;
      /** completed：压缩事务 id，「在轨迹中查看」按它定位 */
      compactionId?: string;
      /** completed：手动 /compact 或自动压缩 */
      trigger?: "manual" | "auto";
      /** completed：压缩前 / 后上下文 token；旧会话没有 */
      beforeTokens?: number;
      afterTokens?: number;
      /** completed：压缩前 token 含估算，显示带「约」 */
      beforeEstimated?: true;
      /** failed：失败原因 */
      errorMessage?: string;
      createdAt: string;
    }
  | ({
      /** 收件箱通知（后台 Bash、子智能体完成、子智能体来信）的分隔行；content 是通知原文。 */
      kind: "background_notice";
      id: EventId;
      content: string;
      createdAt: string;
    } & BackgroundNotice)
  | {
      kind: "workspace_preparation";
      id: EventId;
      status: "running" | "completed";
      sourceWorkspaceRoot: string;
      workspaceRoot?: string;
      baseBranch: string;
      branch?: string;
      baseCommit?: string;
      durationMs?: number;
      environmentSetup?: "none";
      createdAt: string;
    }
  | {
      kind: "error";
      id: EventId;
      title: string;
      content: string;
      createdAt: string;
      recoverable: boolean;
    }
  | {
      kind: "status";
      id: EventId;
      content: string;
      createdAt: string;
      tone?: "muted" | "error";
    }
);

export type SessionDiffSummary = {
  sessionId: SessionId;
  files: Array<{
    filePath: string;
    additions: number;
    deletions: number;
    diff: string;
    sourceEventIds: EventId[];
  }>;
  totalAdditions: number;
  totalDeletions: number;
};
