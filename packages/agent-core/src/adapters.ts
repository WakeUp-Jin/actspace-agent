/**
 * Message ↔ SessionEvent 适配层
 *
 * agent-core 内部使用 Message 判别联合（UserMessage/AssistantMessage/ToolResultMessage），
 * shared 使用 SessionEvent（持久化格式）和 AssistantReply（前端展示格式）。
 *
 * 本模块提供两个方向的转换：
 * 1. Message → SessionEvent（运行时产物持久化）
 * 2. SessionEvent[] → Message[]（恢复会话重建上下文）
 * 3. AssistantMessage → AssistantReply（前端展示）
 */

import type {
  AssistantReply,
  ComposerAttachment,
  SessionEvent,
  SessionId,
  TurnId,
  ToolExecutionResult,
  ContextUsageSnapshot,
} from "@actspace/shared";
import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolResultMessage,
  UserMessage,
} from "./messages";
import { getTextContent, getToolCalls } from "./messages";
import { sanitizeBrowserToolArgs } from "./tools/tools/browser/redaction";

// ─── 事件 ID 生成 ───

function createEventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── SessionEvent 工厂 ───

function createSessionEvent<TPayload>(
  sessionId: SessionId,
  turnId: TurnId,
  type: SessionEvent["type"],
  payload: TPayload,
  // 源消息的真实发生时间（epoch ms）。事件是在一轮结束时批量落盘的，如果都用 flush 时刻，
  // 整轮事件会挤在同一毫秒，导致前端「Worked for」之类基于时间差的展示恒为 ~0。
  occurredAtMs?: number,
): SessionEvent<TPayload> {
  const timestamp =
    typeof occurredAtMs === "number" && Number.isFinite(occurredAtMs)
      ? new Date(occurredAtMs).toISOString()
      : new Date().toISOString();
  return {
    id: createEventId(),
    sessionId,
    turnId,
    type,
    timestamp,
    schemaVersion: 1,
    payload,
  };
}

export function createPersistedSessionEvent<TPayload>(
  sessionId: SessionId,
  turnId: TurnId,
  type: SessionEvent["type"],
  payload: TPayload,
): SessionEvent<TPayload> {
  return createSessionEvent(sessionId, turnId, type, payload);
}

export function formatUserMessageForModel(
  content: string,
  attachments?: ComposerAttachment[],
  options?: {
    modelId?: string;
    input?: string[];
    canInspectImages?: boolean;
  },
): string | (TextContent | ImageContent)[] {
  const input = options?.input ?? ["text"];
  const supportsImages = input.includes("image");
  const hasLocalImageAttachment = attachments?.some(
    (attachment) => attachment.kind === "image" && Boolean(attachment.path),
  ) ?? false;
  const runtimeModel = [
    "<runtime_model>",
    options?.modelId ? `model_id: ${options.modelId}` : undefined,
    `input: ${input.join(",")}`,
    "</runtime_model>",
  ].filter(Boolean).join("\n");

  const sections = [content.trim()];

  if (attachments?.length) {
    sections.push(
      [
        "Attached files:",
        ...attachments.map((attachment, index) => {
          const path = attachment.path ? ` path=${attachment.path}` : "";
          const mimeType = attachment.mimeType ? ` mime=${attachment.mimeType}` : "";
          return `${index + 1}. [${attachment.kind}] ${attachment.name}${path}${mimeType}`;
        }),
        hasLocalImageAttachment
          ? supportsImages
            ? "Image attachments are also provided as image input when a local path is available."
            : options?.canInspectImages
              ? "The current model does not accept image input. Use inspect_image with the provided local image path when visual inspection is needed. Do not make visual claims before using the tool."
              : "The current model does not support image input. Do not make visual claims from image attachments; ask the user to switch to an image-capable model if visual inspection is required."
          : undefined,
        "For ordinary file attachments, use read_file with the provided path only if you need the file contents.",
      ].filter(Boolean).join("\n"),
    );
  }

  sections.push(runtimeModel);

  const text = sections.filter((section) => section.trim().length > 0).join("\n\n");
  if (!supportsImages || !hasLocalImageAttachment) {
    return text;
  }

  const parts: (TextContent | ImageContent)[] = [{ type: "text", text }];
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || !attachment.path) continue;
    parts.push({
      type: "image",
      data: attachment.path,
      mimeType: attachment.mimeType ?? "image/png",
    });
  }
  return parts;
}

// ─── 方向 1：Message → SessionEvent[] ───

export function userMessageToEvents(
  msg: UserMessage,
  sessionId: SessionId,
  turnId: TurnId,
  payload?: {
    attachments?: ComposerAttachment[];
  },
): SessionEvent[] {
  const content = typeof msg.content === "string"
    ? msg.content
    : msg.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("");

  return [
    createSessionEvent(sessionId, turnId, "user_message", {
      content,
      ...(payload?.attachments?.length ? { attachments: payload.attachments } : {}),
      // 注入消息（如后台任务通知）标记来源；前端 selectors 按来源隐藏，恢复时也不会混入用户消息
      ...(msg.source && msg.source !== "user" ? { source: msg.source } : {}),
    }, msg.timestamp),
  ];
}

export function assistantMessageToEvents(
  msg: AssistantMessage,
  sessionId: SessionId,
  turnId: TurnId,
): SessionEvent[] {
  const events: SessionEvent[] = [];

  const thinkingBlocks = msg.content.filter((block): block is ThinkingContent => block.type === "thinking");
  for (const thinking of thinkingBlocks) {
    if (!thinking.thinking && !thinking.signature) continue;
    events.push(
      createSessionEvent(sessionId, turnId, "thinking", {
        content: thinking.thinking,
        collapsedByDefault: true,
        ...(thinking.signature && { signature: thinking.signature }),
        ...(msg.api && { api: msg.api }),
        model: msg.model,
        provider: msg.provider,
      }, msg.timestamp),
    );
  }

  const toolCalls = getToolCalls(msg);
  for (const tc of toolCalls) {
    events.push(
      createSessionEvent(sessionId, turnId, "tool_call", {
        id: tc.id,
        name: tc.name,
        arguments: sanitizeBrowserToolArgs(tc.name, tc.arguments),
        ...(msg.api && { api: msg.api }),
        model: msg.model,
        provider: msg.provider,
      }, msg.timestamp),
    );
  }

  // 失败回复通常正文为空（或被 guard 清空），不落空 assistant_message 事件，
  // 避免渲染成空白气泡；错误信息由 turn 级 error 事件承载（见 engine/bridge buildSessionEvents）。
  const text = getTextContent(msg);
  const isIncompleteMessage = msg.stopReason === "error" || msg.stopReason === "aborted";
  if (text || (toolCalls.length === 0 && !isIncompleteMessage)) {
    const reply: AssistantReply = {
      content: text,
      stopReason: msg.stopReason,
      ...(msg.api && { api: msg.api }),
      model: msg.model,
      provider: msg.provider,
      usage: {
        inputTokens: msg.usage.input,
        outputTokens: msg.usage.output,
        totalTokens: msg.usage.totalTokens,
        reasoningTokens: msg.usage.reasoning || undefined,
        cacheHitTokens: msg.usage.cacheHit || msg.usage.cacheRead || undefined,
        cacheMissTokens: msg.usage.cacheMiss || undefined,
        serverToolUse: msg.usage.serverToolUse,
      },
    };
    events.push(
      createSessionEvent(sessionId, turnId, "assistant_message", reply, msg.timestamp),
    );
  }

  return events;
}

export function toolResultMessageToEvents(
  msg: ToolResultMessage,
  sessionId: SessionId,
  turnId: TurnId,
  executionResult?: ToolExecutionResult,
): SessionEvent[] {
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");

  const result: ToolExecutionResult = executionResult ?? {
    toolName: msg.toolName,
    toolCallId: msg.toolCallId,
    ok: !msg.isError,
    summary: msg.isError ? `Error in ${msg.toolName}` : `Ran ${msg.toolName}`,
    modelOutput: text,
    truncatedOutput: text,
    rawOutput: text,
    uiPreview: {
      kind: "generic",
      title: msg.isError ? `Error in ${msg.toolName}` : `Ran ${msg.toolName}`,
      content: text,
    },
  };

  return [
    createSessionEvent(sessionId, turnId, "tool_result", result, msg.timestamp),
  ];
}

export function contextSnapshotToEvent(
  snapshot: ContextUsageSnapshot,
  sessionId: SessionId,
  turnId: TurnId,
): SessionEvent {
  return createSessionEvent(sessionId, turnId, "context_snapshot", snapshot);
}

export function messageToEvents(
  msg: Message,
  sessionId: SessionId,
  turnId: TurnId,
  executionResult?: ToolExecutionResult,
): SessionEvent[] {
  switch (msg.role) {
    case "user":
      return userMessageToEvents(msg, sessionId, turnId);
    case "assistant":
      return assistantMessageToEvents(msg, sessionId, turnId);
    case "toolResult":
      return toolResultMessageToEvents(msg, sessionId, turnId, executionResult);
  }
}

// ─── 方向 2：SessionEvent[] → Message[]（恢复会话） ───

export interface RecoveryResult {
  messages: Message[];
  errors: Array<{ index: number; error: string }>;
}

export function sessionEventsToMessages(events: SessionEvent[]): RecoveryResult {
  const messages: Message[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  const now = Date.now();

  let pendingThinking: ThinkingContent[] = [];
  let pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
  let pendingAssistantIdentity: Pick<AssistantMessage, "api" | "model" | "provider"> | undefined;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      switch (event.type) {
        case "user_message": {
          flushPendingAssistant();
          const payload = event.payload as {
            content: string;
            attachments?: ComposerAttachment[];
            source?: string;
          };
          messages.push({
            role: "user",
            content: formatUserMessageForModel(payload.content, payload.attachments, { input: ["text"] }),
            timestamp: new Date(event.timestamp).getTime() || now,
            ...(payload.source ? { source: payload.source } : {}),
          });
          break;
        }

        case "thinking": {
          const payload = event.payload as {
            content: string;
            signature?: string;
            api?: AssistantMessage["api"];
            model?: string;
            provider?: string;
          };
          pendingThinking.push({
            type: "thinking",
            thinking: payload.content,
            ...(payload.signature && { signature: payload.signature }),
          });
          pendingAssistantIdentity = mergePendingAssistantIdentity(pendingAssistantIdentity, payload);
          break;
        }

        case "tool_call": {
          const payload = event.payload as {
            id: string;
            name: string;
            arguments: Record<string, unknown>;
            api?: AssistantMessage["api"];
            model?: string;
            provider?: string;
          };
          pendingToolCalls.push({
            id: payload.id,
            name: payload.name,
            arguments: payload.arguments,
          });
          pendingAssistantIdentity = mergePendingAssistantIdentity(pendingAssistantIdentity, payload);
          break;
        }

        case "tool_result": {
          flushPendingAssistant();
          const payload = event.payload as ToolExecutionResult;
          messages.push({
            role: "toolResult",
            toolCallId: payload.toolCallId ?? `tc_${i}`,
            toolName: payload.toolName,
            content: [{ type: "text", text: payload.modelOutput ?? payload.truncatedOutput ?? payload.rawOutput ?? "" }],
            isError: !payload.ok,
            timestamp: new Date(event.timestamp).getTime() || now,
            source: `tool:${payload.toolName}`,
          });
          break;
        }

        case "assistant_message":
        case "assistant_reply": {
          const payload = event.payload as AssistantReply;
          const content: AssistantMessage["content"] = [];

          // 还原原始消息的块顺序 [thinking, text, ...toolCalls]（与流式组装一致）。
          // tool_use 必须是 assistant 消息的末尾块：DeepSeek Anthropic 兼容端要求
          // tool_use 之后紧跟 tool_result，若 text 排在 tool_use 后会被 400 拒绝。
          content.push(...pendingThinking);
          pendingThinking = [];
          if (payload.content) {
            content.push({ type: "text", text: payload.content });
          }
          for (const tc of pendingToolCalls) {
            content.push({ type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments });
          }
          pendingToolCalls = [];
          pendingAssistantIdentity = undefined;

          messages.push({
            role: "assistant",
            content,
            ...(payload.api && { api: payload.api }),
            model: payload.model,
            provider: payload.provider,
            usage: {
              input: payload.usage?.inputTokens ?? 0,
              output: payload.usage?.outputTokens ?? 0,
              cacheRead: payload.usage?.cacheHitTokens ?? 0,
              cacheWrite: 0,
              reasoning: payload.usage?.reasoningTokens ?? 0,
              cacheHit: payload.usage?.cacheHitTokens ?? 0,
              cacheMiss: payload.usage?.cacheMissTokens ?? 0,
              totalTokens: payload.usage?.totalTokens ?? 0,
              serverToolUse: payload.usage?.serverToolUse,
              cost: {
                input: payload.usage?.cost?.input ?? 0,
                output: payload.usage?.cost?.output ?? 0,
                cacheRead: payload.usage?.cost?.cacheRead ?? 0,
                cacheWrite: payload.usage?.cost?.cacheWrite ?? 0,
                total: payload.usage?.cost?.total ?? 0,
              },
            },
            stopReason: payload.stopReason,
            timestamp: new Date(event.timestamp).getTime() || now,
          });
          break;
        }

        case "error":
        case "llm_usage":
        case "context_snapshot":
        case "diff_preview":
          break;

        case "turn_aborted":
          pendingThinking = [];
          pendingToolCalls = [];
          pendingAssistantIdentity = undefined;
          break;
      }
    } catch (err) {
      errors.push({
        index: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  flushPendingAssistant();

  return { messages, errors };

  function flushPendingAssistant(): void {
    if (pendingThinking.length === 0 && pendingToolCalls.length === 0) return;

    const content: AssistantMessage["content"] = [];
    content.push(...pendingThinking);
    pendingThinking = [];
    for (const tc of pendingToolCalls) {
      content.push({ type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments });
    }
    pendingToolCalls = [];

    if (content.length > 0) {
      const identity = pendingAssistantIdentity;
      pendingAssistantIdentity = undefined;
      messages.push({
        role: "assistant",
        content,
        ...(identity?.api && { api: identity.api }),
        model: identity?.model ?? "unknown",
        provider: identity?.provider ?? "unknown",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          reasoning: 0,
          cacheHit: 0,
          cacheMiss: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: now,
      });
    }
  }

  function mergePendingAssistantIdentity(
    current: Pick<AssistantMessage, "api" | "model" | "provider"> | undefined,
    next: { api?: AssistantMessage["api"]; model?: string; provider?: string },
  ): Pick<AssistantMessage, "api" | "model" | "provider"> | undefined {
    if (!next.model || !next.provider) return current;
    return {
      ...(next.api && { api: next.api }),
      model: next.model,
      provider: next.provider,
    };
  }
}

// ─── 方向 3：AssistantMessage → AssistantReply ───

export function toAssistantReply(msg: AssistantMessage): AssistantReply {
  return {
    content: getTextContent(msg),
    stopReason: msg.stopReason,
    model: msg.model,
    provider: msg.provider,
    usage: {
      inputTokens: msg.usage.input,
      outputTokens: msg.usage.output,
      totalTokens: msg.usage.totalTokens,
      reasoningTokens: msg.usage.reasoning,
      cacheHitTokens: msg.usage.cacheHit,
      cacheMissTokens: msg.usage.cacheMiss,
      serverToolUse: msg.usage.serverToolUse,
    },
  };
}
