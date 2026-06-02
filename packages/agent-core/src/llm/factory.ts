/**
 * LLM 工厂函数
 *
 * 根据 LLMConfig.provider 创建对应的服务实例。
 * 也可通过 createLLMServiceFromEnv() 直接从 env 配置创建。
 */

import type { LLMConfig, LLMService } from "./types";
import { LLMServiceError } from "./types";
import { MockLLMService } from "./services/mock";
import { AnthropicMessagesService } from "./services/anthropic-messages";
import { OpenAICompletionsService } from "./services/openai-completions";
import { envToLLMConfig } from "../env";

function resolveConfigApi(config: LLMConfig): NonNullable<LLMConfig["api"]> | "mock" {
  if (config.provider.toLowerCase() === "mock" || config.provider.toLowerCase() === "deepseek-mock") {
    return "mock";
  }
  if (config.api) return config.api;
  if (config.apiFormat === "anthropic") return "anthropic-messages";
  return "openai-completions";
}

export function createLLMService(config: LLMConfig): LLMService {
  switch (resolveConfigApi(config)) {
    case "anthropic-messages":
      return new AnthropicMessagesService(config);
    case "openai-completions":
      return new OpenAICompletionsService(config);
    case "mock":
      return new MockLLMService(config);
    default:
      throw new LLMServiceError(
        `Unknown LLM api: "${config.api ?? config.apiFormat ?? config.provider}". Available: openai-completions, anthropic-messages, mock`,
        "invalid_request",
        false,
      );
  }
}

/** 直接从 env 配置创建 LLM 服务（仅用于测试/mock fallback） */
export function createLLMServiceFromEnv(): LLMService {
  return createLLMService(envToLLMConfig());
}

/** 创建 mock 配置的快捷函数 */
export function createMockLLMConfig(): LLMConfig {
  return {
    provider: "mock",
    apiKey: "mock-key",
    model: "deepseek-mock",
  };
}
