/**
 * OpenAICompletionsService — OpenAI Chat Completions compatible protocol service.
 *
 * Provider-specific classes should be thin wrappers over this protocol service.
 */

import OpenAI from "openai";
import type { Context, AssistantMessage, Tool, Usage } from "../../messages";
import type {
  LLMService,
  LLMConfig,
  StreamOptions,
  SimpleStreamOptions,
  APIMessage,
} from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";
import {
  convertMessages,
  toRequestTools,
  mapSdkError,
  createAccumulator,
  processStreamChunks,
  buildAssistantMessage,
  buildErrorMessage,
} from "../convert";

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.cn/v1",
};

/** Kimi 内置联网搜索工具名；以 `$` 前缀标识 Kimi builtin_function。 */
const KIMI_WEB_SEARCH_NAME = "$web_search";
/** Kimi `$web_search` 内部回填的最大轮数，防止异常时死循环。 */
const KIMI_WEB_SEARCH_MAX_ROUNDS = 5;

function providerDisplayName(provider: string): string {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "kimi") return "Kimi";
  return provider;
}

function isBuiltinToolName(name: string | undefined): boolean {
  return typeof name === "string" && name.startsWith("$");
}

/** 把一轮 usage 累加进总账（跨 Kimi `$web_search` 多次内部往返）。 */
function addUsage(total: Usage, delta: Usage): void {
  total.input += delta.input;
  total.output += delta.output;
  total.totalTokens += delta.totalTokens;
  total.cacheRead += delta.cacheRead;
  total.cacheWrite += delta.cacheWrite;
  total.cacheHit += delta.cacheHit;
  total.cacheMiss += delta.cacheMiss;
  total.reasoning += delta.reasoning;
}

export class OpenAICompletionsService implements LLMService {
  protected client: OpenAI;
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    // 主 Agent 入口：Kimi 主模型在此启用 provider-native $web_search（见 _stream）。
    return this._stream(convertMessages(context, this.config), context.tools, options, true);
  }

  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, this.resolveSimpleOptions(options));
  }

  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  streamMessages(messages: APIMessage[], options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[], undefined, options);
  }

  async completeMessages(messages: APIMessage[], options?: StreamOptions): Promise<AssistantMessage> {
    return this.streamMessages(messages, options).result();
  }

  protected resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return { signal: options.signal };
  }

  protected _stream(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: Tool[],
    options?: StreamOptions,
    enableKimiBuiltinWebSearch = false,
  ): AssistantMessageEventStream {
    const self = this;
    // 仅主 Agent 入口（stream(context)）对 Kimi 启用 builtin $web_search 内部循环；
    // streamMessages / streamWithBuiltinWebSearch 等 helper 路径保持原有单次行为。
    const kimiMain = self.config.provider === "kimi" && enableKimiBuiltinWebSearch;
    // Kimi `$web_search` 要求禁用 thinking，二者互斥：用户显式开 thinking 时优先 thinking，
    // 不挂 web search；否则默认用 web search（thinking 关）。
    const kimiThinking = kimiMain && options?.thinkingEnabled === true;
    const kimiWebSearch = kimiMain && !kimiThinking;

    async function* generate() {
      const displayName = providerDisplayName(self.config.provider);
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          message: buildErrorMessage(
            createAccumulator(),
            self.config,
            self.config.provider,
            new LLMServiceError(
              `${displayName} API key not configured. Set ${self.config.provider.toUpperCase()}_API_KEY before selecting the ${self.config.provider} provider.`,
              "auth",
              false,
            ),
          ),
        };
        return;
      }

      const baseRequestTools = options?.tools ?? toRequestTools(tools ?? []);
      // Kimi 主模型联网搜索是 provider-native 能力：在请求里声明 builtin $web_search，
      // 由 Kimi 服务端执行，不进入本地 ToolManager（与 DeepSeek Anthropic server web search 对称）。
      const requestTools = kimiWebSearch
        ? [...baseRequestTools, { type: "builtin_function", function: { name: KIMI_WEB_SEARCH_NAME } }]
        : baseRequestTools;

      // 运行消息序列；Kimi $web_search 回填会向其追加 assistant/tool 消息后再次请求。
      const runningMessages = [...messages];
      // 跨内部往返累加的 usage 与搜索计数。
      const totalUsage = createAccumulator().usage;
      let webSearchRequests = 0;

      for (let round = 0; ; round++) {
        const acc = createAccumulator();
        const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
          model: self.config.model,
          messages: runningMessages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: options?.temperature ?? self.config.temperature ?? undefined,
          max_tokens: options?.maxTokens ?? self.config.maxTokens ?? undefined,
        };

        if (requestTools.length > 0) {
          (requestParams as any).tools = requestTools;
        }
        // 使用 $web_search 时 Kimi 要求禁用 thinking（见 platform.kimi.ai 文档）；
        // 用户显式开 thinking 时给 Kimi 发 { type: "enabled" }（K2.6 思考走 reasoning_content）。
        if (kimiWebSearch) {
          (requestParams as any).thinking = { type: "disabled" };
        } else if (kimiThinking) {
          (requestParams as any).thinking = { type: "enabled" };
        } else if (options?.thinking) {
          (requestParams as any).thinking = options.thinking;
        } else if (options?.thinkingEnabled === false) {
          (requestParams as any).thinking = { type: "disabled" };
        }

        try {
          const stream = await self.client.chat.completions.create(
            requestParams,
            { signal: options?.signal },
          );

          for await (const event of processStreamChunks(stream, acc)) {
            // builtin $web_search 的 tool_call 增量不暴露给上层（它不是本地工具调用）。
            if (kimiWebSearch && event.type === "tool_call_delta" && isBuiltinToolName(event.toolName)) {
              continue;
            }
            yield event;
          }
        } catch (error) {
          addUsage(totalUsage, acc.usage);
          acc.usage = totalUsage;
          if (error instanceof LLMServiceError) {
            yield { type: "error" as const, message: buildErrorMessage(acc, self.config, self.config.provider, error, options?.signal) };
            return;
          }
          const mapped = mapSdkError(error, displayName);
          yield { type: "error" as const, message: buildErrorMessage(acc, self.config, self.config.provider, mapped, options?.signal) };
          return;
        }

        addUsage(totalUsage, acc.usage);

        const builtinCalls = kimiWebSearch
          ? [...acc.toolCalls.values()].filter((tc) => isBuiltinToolName(tc.name))
          : [];
        const hasLocalCalls = [...acc.toolCalls.values()].some((tc) => !isBuiltinToolName(tc.name));

        // 仅当本轮只触发了 builtin $web_search（没有本地工具调用）时，在 service 内部回填后继续，
        // 让上层只看到最终一轮 assistant 回复。混入本地工具调用的罕见情况按最终轮处理。
        if (builtinCalls.length > 0 && !hasLocalCalls && round < KIMI_WEB_SEARCH_MAX_ROUNDS) {
          webSearchRequests += builtinCalls.length;
          runningMessages.push({
            role: "assistant",
            content: null,
            tool_calls: builtinCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.argumentsText || "{}" },
            })),
          });
          // 文档要求：把 tool_call.function.arguments 原样作为 role:tool 回填，Kimi 服务端据此执行搜索。
          for (const tc of builtinCalls) {
            runningMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: tc.argumentsText || "{}",
            });
          }
          continue;
        }

        // 最终轮：用累加 usage 覆盖，并把 builtin 搜索次数记入 serverToolUse（与 DeepSeek 对齐）。
        acc.usage = totalUsage;
        if (webSearchRequests > 0) {
          acc.usage.serverToolUse = {
            webSearchRequests,
            webFetchRequests: 0,
          };
        }
        const message = buildAssistantMessage(acc, self.config, self.config.provider);
        // 防御：剔除最终消息里残留的 builtin 工具调用，避免把 $web_search 当本地工具返回给上层。
        message.content = message.content.filter(
          (block) => block.type !== "toolCall" || !isBuiltinToolName(block.name),
        );
        yield { type: "done" as const, message };
        return;
      }
    }

    return new AssistantMessageEventStream(generate());
  }
}
