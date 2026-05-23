/**
 * LLM 工厂函数
 *
 * 根据 LLMConfig.provider 创建对应的服务实例。
 * 自动从环境变量解析 apiKey 和 baseUrl。
 */

import type { LLMConfig } from "./types";
import { LLMServiceError } from "./types";
import { BaseLLMService } from "./base";
import { MockLLMService } from "./services/mock";
import { DeepSeekService } from "./services/deepseek";

export function createLLMService(config: LLMConfig): BaseLLMService {
  const resolvedConfig: LLMConfig = {
    ...config,
    apiKey: resolveApiKey(config),
    baseUrl: resolveBaseUrl(config),
  };

  switch (resolvedConfig.provider.toLowerCase()) {
    case "deepseek":
      return new DeepSeekService(resolvedConfig);

    case "mock":
    case "deepseek-mock":
      return new MockLLMService(resolvedConfig);

    default:
      throw new LLMServiceError(
        `Unknown LLM provider: "${resolvedConfig.provider}". Available: deepseek, mock`,
        "invalid_request",
        false,
      );
  }
}

/** 创建 mock 配置的快捷函数 */
export function createMockLLMConfig(): LLMConfig {
  return {
    provider: "mock",
    apiKey: "mock-key",
    model: "deepseek-mock",
  };
}

function resolveApiKey(config: LLMConfig): string {
  if (config.apiKey) return config.apiKey;
  const envKey = `${config.provider.toUpperCase()}_API_KEY`;
  return process.env[envKey] ?? "";
}

function resolveBaseUrl(config: LLMConfig): string | undefined {
  if (config.baseUrl) return config.baseUrl;
  const envUrl = `${config.provider.toUpperCase()}_BASE_URL`;
  return process.env[envUrl] || undefined;
}
