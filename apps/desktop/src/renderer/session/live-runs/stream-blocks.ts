// 把流式状态生成为 MessageBlock：live 块的 id / renderKey 规则在这里（14 T1 从 App 迁出）。
import type { BashStatus, MessageBlock, ToolUiPreview } from "@actspace/shared";
import type { StreamingState, ToolEntry } from "../session-run-state";

export function getStreamingBashStatus(tool: {
  isError?: boolean;
  finished?: boolean;
  approvalPending?: boolean;
}, previewStatus?: BashStatus): BashStatus {
  if (tool.approvalPending) {
    return "pending";
  }
  if (!tool.finished) {
    return "running";
  }

  if (previewStatus === "denied" || previewStatus === "expired" || previewStatus === "cancelled") {
    return previewStatus;
  }

  return tool.isError ? "failed" : "success";
}

export function getStreamingReadText(preview: Extract<ToolUiPreview, { kind: "read" }>): string {
  return `Read ${preview.filePath}${preview.range ? ` ${preview.range}` : ""}`;
}

export function getStreamingSearchText(preview: Extract<ToolUiPreview, { kind: "search" }>): string {
  const scope = preview.scope ? `${preview.scope} ` : "";
  return `Searched files ${scope}for ${preview.query}`;
}

export function getStreamingGrepText(preview: Extract<ToolUiPreview, { kind: "grep" }>): string {
  return `Grep ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

export function getStreamingGlobText(preview: Extract<ToolUiPreview, { kind: "glob" }>): string {
  return `Glob ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

export function getStreamingWebSearchText(preview: Extract<ToolUiPreview, { kind: "web_search" }>): string {
  return preview.displayText;
}

export function getStreamingMediaAnalysisText(preview: Extract<ToolUiPreview, { kind: "media_analysis" }>): string {
  return preview.displayText;
}

export function getStreamingDirectoryText(
  preview: Extract<ToolUiPreview, { kind: "directory_list" }>,
  finished?: boolean,
): string {
  if (finished && preview.entryCount !== undefined) {
    return `Listed ${preview.path} (${preview.entryCount} entries)`;
  }

  return `Listed ${preview.path}`;
}

export function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

export function getStreamingDeleteText(
  preview: Extract<ToolUiPreview, { kind: "delete" }>,
  status: Extract<MessageBlock, { kind: "delete" }>["status"],
): string {
  const fileLabel = displayFileName(preview.filePath || "file...");
  if (status === "completed") return `Deleted ${fileLabel}`;
  if (status === "failed") return `Delete ${fileLabel} failed`;
  if (status === "denied") return `Denied delete ${fileLabel}`;
  if (status === "pending") return "Delete file requires approval";
  return `Delete ${fileLabel}`;
}

export function toolEntryToBlock(toolCallId: string, tool: ToolEntry, now: string, agentRunId?: string): MessageBlock {
  const blockId = agentRunId ? `turn:${agentRunId}:tool:${toolCallId}` : `streaming-tool-${toolCallId}`;

  // Previews without a dedicated approval component must retain an actionable fallback.
  if (tool.approvalPending && !["bash", "read", "grep", "glob", "delete", "write", "edit_diff"].includes(tool.preview?.kind ?? "")) {
    return {
      kind: "tool", id: blockId, toolName: tool.toolName,
      title: tool.approvalSummary ?? tool.toolName,
      content: tool.preview?.kind === "directory_list" ? tool.preview.path : tool.approvalReason ?? "等待审批",
      createdAt: now, status: "pending", approvalRequestId: tool.approvalRequestId,
      approvalReason: tool.approvalReason, approvalScope: tool.approvalScope,
    };
  }

  if (tool.preview?.kind === "bash") {
    return {
      kind: "bash",
      id: blockId,
      status: getStreamingBashStatus(tool, tool.preview.status),
      title: tool.approvalPending
        ? (tool.approvalSummary ?? "Bash command needs approval")
        : tool.preview.title,
      command: tool.preview.command || "Waiting for Bash result...",
      commandPreview: tool.preview.commandPreview || "bash",
      cwd: tool.preview.cwd,
      stdout: tool.finished ? tool.preview.stdout : undefined,
      stderr: tool.isError && !tool.preview.stdout ? (tool.preview.stderr ?? "Tool execution failed") : undefined,
      reason: tool.approvalReason ?? tool.preview.reason,
      approvalRequestId: tool.approvalRequestId,
      intent: tool.preview.intent,
      backgroundTaskId: tool.preview.backgroundTaskId,
      backgroundStatus: tool.preview.backgroundStatus,
      outputFilePath: tool.preview.outputFilePath,
      sandboxed: tool.preview.sandboxed,
      notExecuted: tool.preview.notExecuted,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "read") {
    return {
      kind: "read",
      id: blockId,
      filePath: tool.preview.filePath,
      range: tool.preview.range,
      displayText: tool.finished ? tool.preview.displayText : getStreamingReadText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.approvalPending ? "pending" : tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
    };
  }

  if (tool.preview?.kind === "search") {
    return {
      kind: "search",
      id: blockId,
      query: tool.preview.query,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingSearchText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
    };
  }

  if (tool.preview?.kind === "grep") {
    return {
      kind: "grep",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingGrepText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.approvalPending ? "pending" : tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
    };
  }

  if (tool.preview?.kind === "glob") {
    return {
      kind: "glob",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingGlobText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.approvalPending ? "pending" : tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
    };
  }

  if (tool.preview?.kind === "web_search") {
    return {
      kind: "web_search",
      id: blockId,
      mode: tool.preview.mode,
      query: tool.preview.query,
      url: tool.preview.url,
      displayText: getStreamingWebSearchText(tool.preview),
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      resultUrls: tool.finished ? tool.preview.resultUrls : undefined,
      contentPreview: tool.finished ? tool.preview.contentPreview : undefined,
    };
  }

  if (tool.preview?.kind === "media_analysis") {
    return {
      kind: "media_analysis",
      id: blockId,
      mediaName: tool.preview.mediaName,
      mediaKind: tool.preview.mediaKind,
      displayText: getStreamingMediaAnalysisText(tool.preview),
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      isError: tool.isError,
    };
  }

  if (tool.preview?.kind === "image_generation") {
    return {
      kind: "image_generation",
      id: blockId,
      status: tool.finished
        ? tool.isError ? "failed" : tool.preview.status
        : "running",
      promptPreview: tool.preview.promptPreview,
      requestedCount: tool.preview.requestedCount,
      generatedCount: tool.finished ? tool.preview.generatedCount : undefined,
      model: tool.preview.model,
      size: tool.preview.size,
      displayText: tool.preview.displayText,
      images: tool.finished ? tool.preview.images : undefined,
      warning: tool.preview.warning,
      errorMessage: tool.isError ? tool.preview.errorMessage : undefined,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "directory_list") {
    return {
      kind: "directory_list",
      id: blockId,
      path: tool.preview.path,
      entryCount: tool.finished ? tool.preview.entryCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingDirectoryText(tool.preview, tool.finished),
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
    };
  }

  if (tool.preview?.kind === "delete") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.isError
          ? tool.preview.status === "denied" ? "denied" : "failed"
          : "completed"
        : "running";
    return {
      kind: "delete",
      id: blockId,
      filePath: displayFileName(tool.preview.filePath || "file..."),
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
      displayText: getStreamingDeleteText(tool.preview, status),
      createdAt: now,
      status,
      isError: status === "failed" || status === "denied",
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
    };
  }

  if (tool.preview?.kind === "edit_diff") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.preview.status ?? (tool.isError ? "failed" : "completed")
        : "running";
    return {
      kind: "edit_diff",
      id: blockId,
      filePath: tool.preview.filePath,
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      generationProgress: tool.preview.generationProgress,
      createdAt: now,
      status,
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
      errorMessage: tool.preview.errorMessage,
    };
  }

  if (tool.preview?.kind === "write") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.preview.status ?? (tool.isError ? "failed" : "completed")
        : "running";
    return {
      kind: "write_diff",
      id: blockId,
      filePath: tool.preview.filePath,
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      generationProgress: tool.preview.generationProgress,
      streamingContent: tool.finished ? undefined : tool.preview.streamingContent,
      createdAt: now,
      status,
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
      errorMessage: tool.preview.errorMessage,
    };
  }

  if (tool.preview?.kind === "agent") {
    return {
      kind: "agent",
      id: blockId,
      description: tool.preview.description,
      status: tool.finished ? tool.preview.status : "running",
      subagentType: tool.preview.subagentType,
      agentKind: tool.preview.agentKind,
      displayText: tool.preview.displayText,
      summary: tool.preview.summary,
      recentEvents: tool.preview.recentEvents,
      transcriptRef: tool.preview.transcriptRef,
      stats: tool.preview.stats,
      error: tool.preview.error,
      // 流式首帧也必须沿用统一的右侧 child Session 入口，不能回退到旧 inline transcript。
      display: tool.preview.display ?? "panel",
      transcriptEvents: tool.transcriptEvents,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "todo") {
    return {
      kind: "todo",
      id: agentRunId ? `turn:${agentRunId}:todo` : `streaming-todo-${toolCallId}`,
      todos: tool.preview.todos,
      totalCount: tool.preview.totalCount,
      completedCount: tool.preview.completedCount,
      revision: tool.preview.revision,
      displayText: tool.preview.displayText,
      status: tool.finished ? tool.isError ? "failed" : "completed" : "running",
      isError: tool.isError,
      createdAt: now,
    };
  }

  return {
    kind: "tool",
    id: blockId,
    toolName: tool.toolName,
    artifacts: tool.preview?.kind === "generic" ? tool.preview.artifacts : undefined,
    title: tool.preview?.kind === "generic"
      ? tool.preview.title
      : tool.finished ? `${tool.toolName}` : `Running ${tool.toolName}...`,
    content: tool.approvalPending && tool.toolName.startsWith("browser_")
      ? "等待确认浏览器操作"
      : tool.preview?.kind === "generic"
        ? tool.preview.content
      : tool.finished
        ? tool.isError ? "Tool execution failed" : "Completed"
        : "Executing...",
    createdAt: now,
    isError: tool.isError,
    status: tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.isError ? "failed" : "completed"
        : "running",
    approvalRequestId: tool.approvalRequestId,
    approvalReason: tool.approvalReason,
    approvalScope: tool.approvalScope,
  };
}

export function streamingStateToBlocks(state: StreamingState, agentRunId?: string): MessageBlock[] {
  const now = new Date().toISOString();
  const blocks: MessageBlock[] = [];
  let thinkingIdx = 0;
  let textIdx = 0;

  for (const [segmentIndex, seg] of state.segments.entries()) {
    if (seg.type === "thinking") {
      if (!seg.text.trim()) continue;
      const index = thinkingIdx++;
      blocks.push({
        kind: "thinking",
        id: agentRunId ? `turn:${agentRunId}:thinking:${index}` : `streaming-thinking-${index}`,
        title: "Thinking...",
        content: seg.text,
        createdAt: now,
        collapsedByDefault: false,
        status: segmentIndex === state.segments.length - 1 ? "running" : "completed",
      });
    } else if (seg.type === "text") {
      const index = textIdx++;
      blocks.push({
        kind: "assistant",
        id: agentRunId ? `turn:${agentRunId}:assistant:${index}` : `streaming-assistant-${index}`,
        content: seg.text,
        createdAt: now,
      });
    } else if (seg.type === "tool") {
      const tool = state.activeTools.get(seg.toolCallId);
      if (tool) {
        blocks.push(toolEntryToBlock(seg.toolCallId, tool, now, agentRunId));
      }
    } else if (seg.type === "compaction") {
      const block = state.activeCompactions.get(seg.agentRunId);
      if (block) {
        blocks.push(block);
      }
    } else if (seg.type === "workspace_preparation") {
      const block = state.activeWorkspacePreparations.get(seg.agentRunId);
      if (block) blocks.push(block);
    } else if (seg.type === "user_message") {
      blocks.push(seg.block);
    }
  }

  if (state.retryNotice) {
    blocks.push({
      kind: "status",
      id: agentRunId
        ? `turn:${agentRunId}:retry:${state.retryNotice.attempt}`
        : `llm-retry-${state.retryNotice.attempt}`,
      content: `网关异常，正在重试 (${state.retryNotice.attempt}/${state.retryNotice.maxAttempts})`,
      createdAt: now,
      tone: "muted",
    });
  }

  if (state.waitingForModel && !state.retryNotice) {
    blocks.push({
      kind: "status",
      id: agentRunId ? `turn:${agentRunId}:model-wait` : "model-wait",
      content: "Operating Space · Expanding",
      createdAt: now,
      tone: "muted",
    });
  }

  // 每个 live 块都带所属 run 的 runId（14 T13），合并 durable 与 live 时按它判断归属；已有 runId 的（压缩块）保持不变。
  return agentRunId ? blocks.map((block) => block.runId ? block : { ...block, runId: agentRunId }) : blocks;
}

export type CompactionBlock = Extract<MessageBlock, { kind: "context_compaction" }>;

// 手动 /compact 与自动压缩共用同一个块；完成后的可展开摘要以 durable 投影为准，这里只负责本次运行期间的状态。
export function createCompactionBlock(input: {
  agentRunId: string;
  status: CompactionBlock["status"];
  startedAt?: string;
  removedCount?: number;
  durationMs?: number;
  errorMessage?: string;
}): CompactionBlock {
  return {
    kind: "context_compaction",
    id: `turn:${input.agentRunId}:context-compaction:0`,
    runId: input.agentRunId,
    status: input.status,
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
    ...(input.removedCount !== undefined ? { removedCount: input.removedCount } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    createdAt: new Date().toISOString(),
  };
}
