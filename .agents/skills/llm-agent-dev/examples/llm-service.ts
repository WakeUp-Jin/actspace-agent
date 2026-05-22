/**
 * LLM 类型系统与服务基类
 *
 * 类型层次：Context > Message > Content
 * - Context：LLM 调用的完整输入（systemPrompt + messages + tools）
 * - Message：判别联合（UserMessage | AssistantMessage | ToolResultMessage）
 * - Content：内容片段判别联合（TextContent | ThinkingContent | ImageContent | ToolCallContent）
 *
 * BaseLLMService 采用 stream-first 设计：
 * - 子类实现 _doStream（流式补全，接收已转换的 APIMessage[]）
 * - 基类提供 stream / complete / streamSimple / completeSimple 四个公开方法
 * - convertMessages 将内部 Message[] 转为 OpenAI 兼容格式，子类可重写
 */

// ─── Content Types（内容类型判别联合） ───

export interface TextContent {
  type: "text";
  /** 文本内容 */
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  /** 模型推理链内容 */
  thinking: string;
  /** 推理签名，用于多轮对话中回传给 API 保持连续性 */
  signature?: string;
  /** 是否被安全过滤器编辑，此时 signature 中存储加密的原始内容 */
  redacted?: boolean;
}

export interface ImageContent {
  type: "image";
  /** Base64 编码的图像数据 */
  data: string;
  /** MIME 类型，如 "image/jpeg"、"image/png" */
  mimeType: string;
}

export interface ToolCallContent {
  type: "toolCall";
  /** 工具调用唯一标识，用于关联 ToolResultMessage */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具调用参数 */
  arguments: Record<string, unknown>;
}

// ─── Usage（Token 使用量与成本） ───

export interface Usage {
  /** 输入 Token 数 */
  input: number;
  /** 输出 Token 数 */
  output: number;
  /** 缓存读取 Token 数 */
  cacheRead: number;
  /** 缓存写入 Token 数 */
  cacheWrite: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 成本分拆（美元） */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

// ─── Message Priority（压缩优先级） ───

export enum MessagePriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
}

// ─── Stop Reason（停止原因） ───

/** LLM 停止生成的原因 */
export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// ─── Message Types（消息判别联合） ───

export interface UserMessage {
  role: "user";
  /** 用户输入：简单文本或结构化内容（文本 + 图片） */
  content: string | (TextContent | ImageContent)[];
  /** Unix 时间戳（毫秒） */
  timestamp: number;
  /** 消息来源标识，如 "user"、"parent-agent" */
  source?: string;
  /** 压缩优先级，决定上下文紧张时的保留顺序 */
  priority?: MessagePriority;
}

export interface AssistantMessage {
  role: "assistant";
  /** 结构化内容数组：文本、推理链、工具调用各归其位 */
  content: (TextContent | ThinkingContent | ToolCallContent)[];
  /** 生成此回复的模型标识 */
  model: string;
  /** 模型提供商 */
  provider: string;
  /** Token 使用量与成本 */
  usage: Usage;
  /** 停止原因：stop（正常结束）/ toolUse（需要工具）/ length（超长截断）/ error / aborted */
  stopReason: StopReason;
  /** 错误信息，仅当 stopReason 为 "error" 或 "aborted" 时存在 */
  errorMessage?: string;
  /** Unix 时间戳（毫秒） */
  timestamp: number;
  /** 消息来源标识，如 "llm"、"subagent:explorer" */
  source?: string;
  /** 压缩优先级 */
  priority?: MessagePriority;
}

export interface ToolResultMessage {
  role: "toolResult";
  /** 关联的 ToolCallContent.id */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具执行结果：文本或图片 */
  content: (TextContent | ImageContent)[];
  /** 是否执行出错 */
  isError: boolean;
  /** Unix 时间戳（毫秒） */
  timestamp: number;
  /** 消息来源标识，如 "tool:bash"、"tool:search" */
  source?: string;
  /** 压缩优先级 */
  priority?: MessagePriority;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ─── Tool（工具定义） ───

export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述，LLM 用来理解工具用途 */
  description: string;
  /** JSON Schema 格式的参数定义 */
  parameters: Record<string, unknown>;
}

// ─── Context（顶层容器） ───

export interface Context {
  /** 系统提示词，独立于消息序列 */
  systemPrompt?: string;
  /** 对话消息序列 */
  messages: Message[];
  /** 可用工具列表 */
  tools?: Tool[];
}

// ─── Message 工具函数 ───

/** 从 AssistantMessage 中提取纯文本内容 */
export function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map(c => c.text)
    .join('');
}

/** 从 AssistantMessage 中提取工具调用列表 */
export function getToolCalls(message: AssistantMessage): ToolCallContent[] {
  return message.content.filter((c): c is ToolCallContent => c.type === 'toolCall');
}

/** 判断 AssistantMessage 是否包含工具调用 */
export function hasToolCalls(message: AssistantMessage): boolean {
  return message.content.some(c => c.type === 'toolCall');
}

/** 从任意 Message 中提取文本（用于估算 Token、生成摘要等） */
export function getMessageText(message: Message): string {
  if (message.role === 'user') {
    if (typeof message.content === 'string') return message.content;
    return message.content
      .filter((c): c is TextContent => c.type === 'text')
      .map(c => c.text)
      .join('');
  }
  if (message.role === 'assistant') {
    return message.content
      .filter((c): c is TextContent => c.type === 'text')
      .map(c => c.text)
      .join('');
  }
  // toolResult
  return message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map(c => c.text)
    .join('');
}

// ─── LLM 配置 ───

export interface LLMConfig {
  /** 提供商标识 */
  provider: string;
  /** API 密钥 */
  apiKey: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 模型标识 */
  model: string;
  /** 采样温度 */
  temperature?: number;
  /** 最大输出 Token 数 */
  maxTokens?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}

// ─── Stream Options ───

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface SimpleStreamOptions {
  /** Provider 无关的推理强度 */
  reasoning?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

// ─── API Message Types（OpenAI 兼容格式，供 provider 实现使用） ───

export interface APIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type APIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: APIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

// ─── 流式事件 ───

export type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_delta"; index: number; delta: string }
  | { type: "done"; message: AssistantMessage }
  | { type: "error"; error: Error };

export class AssistantMessageEventStream {
  constructor(private source: AsyncIterable<AssistantMessageEvent>) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AssistantMessageEvent> {
    yield* this.source;
  }

  /** 消费整个流，返回最终的 AssistantMessage */
  async result(): Promise<AssistantMessage> {
    let finalMessage: AssistantMessage | undefined;
    for await (const event of this.source) {
      if (event.type === 'done') {
        finalMessage = event.message;
      }
      if (event.type === 'error') {
        throw event.error;
      }
    }
    if (!finalMessage) throw new Error('Stream ended without producing a message');
    return finalMessage;
  }
}

// ─── BaseLLMService ───

export abstract class BaseLLMService {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 子类必须实现：流式补全，接收已转换的 API 格式消息 */
  protected abstract _doStream(
    messages: APIMessage[],
    tools?: Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream;

  /** 流式调用：转换消息后交给 _doStream */
  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const messages = this.convertMessages(context);
    return this._doStream(messages, context.tools, options);
  }

  /** 非流式调用：等待流完成，返回 AssistantMessage */
  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  /** 流式调用（通用选项）：将 SimpleStreamOptions 映射为 StreamOptions */
  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, this.resolveSimpleOptions(options));
  }

  /** 非流式调用（通用选项） */
  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  /**
   * 将 Context 中的 Message[] 转为 OpenAI 兼容的 API 消息格式。
   * 默认实现适用于 OpenAI / DeepSeek / Groq 等兼容 API。
   * 子类可重写以适配 Anthropic 等非兼容 provider。
   */
  protected convertMessages(context: Context): APIMessage[] {
    const result: APIMessage[] = [];

    if (context.systemPrompt) {
      result.push({ role: "system", content: context.systemPrompt });
    }

    for (const msg of context.messages) {
      switch (msg.role) {
        case "user":
          result.push({
            role: "user",
            content: typeof msg.content === "string"
              ? msg.content
              : msg.content
                  .filter((c): c is TextContent => c.type === "text")
                  .map(c => c.text)
                  .join(""),
          });
          break;
        case "assistant":
          result.push({
            role: "assistant",
            content: getTextContent(msg) || null,
            ...(hasToolCalls(msg) && {
              tool_calls: getToolCalls(msg).map(tc => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
          });
          break;
        case "toolResult":
          result.push({
            role: "tool",
            tool_call_id: msg.toolCallId,
            content: msg.content
              .filter((c): c is TextContent => c.type === "text")
              .map(c => c.text)
              .join(""),
          });
          break;
      }
    }

    return result;
  }

  /** 将通用选项映射为 provider 选项，子类可重写以支持 reasoning 等参数 */
  protected resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return {
      signal: options.signal,
    };
  }
}
