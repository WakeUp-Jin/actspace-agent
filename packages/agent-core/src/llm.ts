/**
 * LLM 模块兼容层
 *
 * 旧 API（createProviderRegistry / createMockModelProvider）保留供现有
 * agent.ts 和 desktop/main/index.ts 消费。新代码应使用 llm/ 目录下的新 API。
 *
 * 后续计划 E（Execution Engine）会将 agent.ts 迁移到新 LLM 接口，届时
 * 本文件中的旧 API 可以移除。
 */

import type { ModelProvider, ModelProviderInput, ModelTurnOutput } from "./types";

// ─── 旧 API（兼容保留） ───

export type ProviderRegistry = {
  register(provider: ModelProvider): void;
  get(providerId: string): ModelProvider | undefined;
  list(): ModelProvider[];
};

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, ModelProvider>();
  return {
    register(provider) {
      providers.set(provider.id, provider);
    },
    get(providerId) {
      return providers.get(providerId);
    },
    list() {
      return [...providers.values()];
    }
  };
}

export function createMockModelProvider(): ModelProvider {
  return {
    id: "deepseek-mock",
    label: "DeepSeek (mock)",
    async completeTurn(input: ModelProviderInput): Promise<ModelTurnOutput> {
      return {
        model: "deepseek-mock",
        provider: "deepseek",
        thinking: `Plan the turn for session ${input.sessionId}, inspect the workspace, and produce a reviewable result.`,
        toolCalls: [
          {
            id: "tool_read_1",
            name: "read_file",
            arguments: {
              path: "README.md"
            }
          },
          {
            id: "tool_diff_1",
            name: "edit_file",
            arguments: {
              path: "docs/ARCHITECTURE.md",
              diff: "@@ -1,3 +1,5 @@\n- Old architecture notes\n+ actspace desktop workbench skeleton\n+ typed agent runtime contracts\n+ local session persistence wiring\n"
            }
          }
        ],
        finalReply: `I reviewed the request "${input.userInput}" and prepared the first actspace runtime slice.`,
        usage: {
          inputTokens: 1820,
          outputTokens: 640,
          totalTokens: 2460
        }
      };
    }
  };
}

// ─── 新 API re-export ───

export {
  MockLLMService,
  DeepSeekService,
  KimiService,
  createLLMService,
  createLLMServiceFromEnv,
  createMockLLMConfig,
  AssistantMessageEventStream,
  LLMServiceError,
} from "./llm/index";

export type {
  LLMService,
  LLMConfig,
  StreamOptions,
  SimpleStreamOptions,
  APIMessage,
  APIToolCall,
  AssistantMessageEvent,
  LLMErrorKind,
} from "./llm/index";
