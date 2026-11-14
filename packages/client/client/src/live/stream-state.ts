// 流式状态的就地变更 helper：只改传入的 StreamingState / segments，不触发渲染（14 T1 从 App 迁出）。
import type { ToolUiPreview } from "@actspace/shared";
import type { StreamingSegment, StreamingState } from "./run-state.js";

export function hasFinishedAllActiveTools(state: StreamingState): boolean {
  return (
    state.activeTools.size > 0 &&
    [...state.activeTools.values()].every((tool) => tool.finished && !tool.approvalPending)
  );
}

export function isEmptyTodoPreview(preview: Extract<ToolUiPreview, { kind: "todo" }>): boolean {
  return (
    preview.todos.length === 0 && preview.totalCount === 0 && preview.completedCount === 0 && preview.revision === 0
  );
}

export function upsertStreamingTool(
  state: StreamingState,
  toolCallId: string,
  toolName: string,
  preview: ToolUiPreview | undefined,
): void {
  const existing = state.activeTools.get(toolCallId);
  if (existing) {
    if (existing.terminalStatus) return;
    if (!(preview?.kind === "todo" && isEmptyTodoPreview(preview) && existing.preview?.kind === "todo")) {
      existing.preview = preview ?? existing.preview;
    }
    existing.toolName = toolName;
    return;
  }

  let effectivePreview = preview;
  if (preview?.kind === "todo") {
    const previous = [...state.activeTools.entries()].find(([, tool]) => tool.preview?.kind === "todo");
    if (previous) {
      if (isEmptyTodoPreview(preview) && previous[1].preview?.kind === "todo") {
        effectivePreview = previous[1].preview;
      }
      state.activeTools.delete(previous[0]);
      const segment = state.segments.find(
        (candidate): candidate is Extract<StreamingSegment, { type: "tool" }> =>
          candidate.type === "tool" && candidate.toolCallId === previous[0],
      );
      if (segment) segment.toolCallId = toolCallId;
    }
  }

  state.activeTools.set(toolCallId, { toolName, preview: effectivePreview });
  if (!state.segments.some((segment) => segment.type === "tool" && segment.toolCallId === toolCallId)) {
    state.segments.push({ type: "tool", toolCallId });
  }
}

export function updateStringSet(current: Set<string>, value: string, included: boolean): Set<string> {
  if (current.has(value) === included) {
    return current;
  }

  const next = new Set(current);
  if (included) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}

/**
 * 追加正文 / 思考。同类型且属于同一条消息（任一方不知道消息时视为同一条）就接在上一段后面。
 * 思考段额外记下第一个字和最后一个字到达的时间（`nowMs`），用于显示思考用时。
 */
export function appendOrMergeSegment(
  segments: StreamingSegment[],
  segType: "thinking" | "text",
  delta: string,
  source: { readonly llmCallId?: string; readonly messageId?: string } = {},
  nowMs: number = Date.now(),
): void {
  const last = segments[segments.length - 1];
  if (
    last &&
    last.type === segType &&
    (last.messageId === undefined || source.messageId === undefined || last.messageId === source.messageId)
  ) {
    last.text += delta;
    if (last.llmCallId === undefined && source.llmCallId !== undefined) last.llmCallId = source.llmCallId;
    if (last.messageId === undefined && source.messageId !== undefined) last.messageId = source.messageId;
    if (last.type === "thinking") {
      last.startedAtMs ??= nowMs;
      last.lastDeltaAtMs = nowMs;
    }
  } else {
    const identity = {
      ...(source.llmCallId === undefined ? {} : { llmCallId: source.llmCallId }),
      ...(source.messageId === undefined ? {} : { messageId: source.messageId }),
    };
    segments.push(
      segType === "thinking"
        ? { type: "thinking", text: delta, ...identity, startedAtMs: nowMs, lastDeltaAtMs: nowMs }
        : { type: "text", text: delta, ...identity },
    );
  }
}

/** LLM 重试前清掉失败尝试留下的半截 thinking/text 段（已完成的工具块保留） */
export function dropTrailingStreamSegments(segments: StreamingSegment[]): void {
  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (last.type === "thinking" || last.type === "text") {
      segments.pop();
    } else {
      break;
    }
  }
}

export function upsertCompactionSegment(state: StreamingState, agentRunId: string): void {
  if (!state.segments.some((segment) => segment.type === "compaction" && segment.agentRunId === agentRunId)) {
    state.segments.push({ type: "compaction", agentRunId });
  }
}

export function upsertWorkspacePreparationSegment(state: StreamingState, agentRunId: string): void {
  if (
    !state.segments.some((segment) => segment.type === "workspace_preparation" && segment.agentRunId === agentRunId)
  ) {
    state.segments.push({ type: "workspace_preparation", agentRunId });
  }
}
