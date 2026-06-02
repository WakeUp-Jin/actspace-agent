import type { ModelApi } from "@actspace/shared";

/**
 * Agent-core 内部消息类型体系
 *
 * 类型层次：Context > Message > Content
 *
 * - Context：LLM 调用的完整输入（systemPrompt + messages + tools）
 * - Message：判别联合（UserMessage | AssistantMessage | ToolResultMessage）
 * - Content：内容片段判别联合（TextContent | ThinkingContent | ImageContent | ToolCallContent）
 *
 * 这些类型是 agent-core 内部使用的"富类型"，包含 source/priority/timestamp 等管理字段。
 * 与 shared 包的 SessionEvent/AssistantReply 是两层——前者供 LLM/Context/Tools 消费，
 * 后者供 IPC/renderer 消费，通过 adapters 桥接。
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/llm-service.ts
 */

// ─── Content Types（内容类型判别联合） ───

export interface TextContent {
  type: "text";
  text: string;
  /** Provider-specific opaque text metadata; preserved only for same-api replay. */
  textSignature?: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  /** 推理签名，多轮对话中回传给 API 保持连续性 */
  signature?: string;
  /** 是否被安全过滤器编辑 */
  redacted?: boolean;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ToolCallContent {
  type: "toolCall";
  /** 工具调用唯一标识，用于关联 ToolResultMessage */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Provider-specific opaque thinking context, e.g. Gemini thought signatures. */
  thoughtSignature?: string;
}

export type Content = TextContent | ThinkingContent | ImageContent | ToolCallContent;

// ─── Usage（Token 使用量与成本） ───

export interface UsageCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface ServerToolUseUsage {
  webSearchRequests?: number;
  webFetchRequests?: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  cacheHit: number;
  cacheMiss: number;
  totalTokens: number;
  cost: UsageCost;
  serverToolUse?: ServerToolUseUsage;
}

// ─── Message Priority（压缩优先级） ───

export enum MessagePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
}

// ─── Stop Reason ───

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// ─── Message Types（消息判别联合） ───

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
  source?: string;
  priority?: MessagePriority;
}

export interface AssistantMessage {
  role: "assistant";
  /** 结构化内容数组：文本、推理链、工具调用各归其位 */
  content: (TextContent | ThinkingContent | ToolCallContent)[];
  /** API protocol that produced this message; used for safe cross-provider replay. */
  api?: ModelApi;
  model: string;
  provider: string;
  /** Actual provider response model when it differs from requested model. */
  responseModel?: string;
  /** Provider response/message id for diagnostics and future replay support. */
  responseId?: string;
  /** Sanitized provider/runtime diagnostics. */
  diagnostics?: Record<string, unknown>[];
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
  source?: string;
  priority?: MessagePriority;
}

export interface ToolResultMessage {
  role: "toolResult";
  /** 关联的 ToolCallContent.id */
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  timestamp: number;
  source?: string;
  priority?: MessagePriority;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ─── Tool（给 LLM 看的 definition 子集） ───

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ─── Context（顶层容器） ───

export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

// ─── Message 工具函数 ───

export function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

export function getToolCalls(message: AssistantMessage): ToolCallContent[] {
  return message.content.filter((c): c is ToolCallContent => c.type === "toolCall");
}

export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some((c) => c.type === "toolCall");
}

export function getThinkingContent(message: AssistantMessage): string {
  return message.content
    .filter((c): c is ThinkingContent => c.type === "thinking")
    .map((c) => c.thinking)
    .join("");
}

export function getMessageText(message: Message): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("");
  }
  if (message.role === "assistant") {
    return message.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("");
  }
  return message.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

// ─── Usage 工具函数 ───

export function createEmptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    cacheHit: 0,
    cacheMiss: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function accumulateUsage(total: Usage, delta: Usage): void {
  total.input += delta.input;
  total.output += delta.output;
  total.cacheRead += delta.cacheRead;
  total.cacheWrite += delta.cacheWrite;
  total.reasoning += delta.reasoning;
  total.cacheHit += delta.cacheHit;
  total.cacheMiss += delta.cacheMiss;
  total.totalTokens += delta.totalTokens;
  total.cost.input += delta.cost.input;
  total.cost.output += delta.cost.output;
  total.cost.cacheRead += delta.cost.cacheRead;
  total.cost.cacheWrite += delta.cost.cacheWrite;
  total.cost.total += delta.cost.total;
  if (delta.serverToolUse) {
    total.serverToolUse = {
      webSearchRequests:
        (total.serverToolUse?.webSearchRequests ?? 0) +
        (delta.serverToolUse.webSearchRequests ?? 0),
      webFetchRequests:
        (total.serverToolUse?.webFetchRequests ?? 0) +
        (delta.serverToolUse.webFetchRequests ?? 0),
    };
  }
}
