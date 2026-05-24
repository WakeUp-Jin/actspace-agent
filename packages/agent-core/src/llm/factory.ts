/**
 * LLM 工厂函数
 *
 * 根据 LLMConfig.provider 创建对应的服务实例。
 * 也可通过 createLLMServiceFromEnv() 直接从 env 配置创建。
 */

import type { LLMConfig } from "./types";
import { LLMServiceError } from "./types";
import { BaseLLMService } from "./base";
import { MockLLMService } from "./services/mock";
import { DeepSeekService } from "./services/deepseek";
import { KimiService } from "./services/kimi";
import { envToLLMConfig } from "../env";

export function createLLMService(config: LLMConfig): BaseLLMService {
  switch (config.provider.toLowerCase()) {
    case "deepseek":
      return new DeepSeekService(config);

    case "kimi":
      return new KimiService(config);

    case "mock":
    case "deepseek-mock":
      return new MockLLMService(config);

    default:
      throw new LLMServiceError(
        `Unknown LLM provider: "${config.provider}". Available: deepseek, kimi, mock`,
        "invalid_request",
        false,
      );
  }
}

/** 直接从 env 配置创建 LLM 服务 */
export function createLLMServiceFromEnv(): BaseLLMService {
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
