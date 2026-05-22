/**
 * LLM 工厂函数示例
 * 根据配置创建对应的 LLM 服务实例，对上层屏蔽供应商差异。
 */

import { LLMConfig, BaseLLMService } from './llm-service';

// Provider -> 服务类的映射注册表
const PROVIDERS: Record<string, new (config: LLMConfig) => BaseLLMService> = {};

export function registerProvider(name: string, cls: new (config: LLMConfig) => BaseLLMService) {
  PROVIDERS[name] = cls;
}

export function createLLMService(config: LLMConfig): BaseLLMService {
  const resolvedConfig: LLMConfig = {
    ...config,
    apiKey: resolveApiKey(config),
    baseUrl: resolveBaseUrl(config),
  };

  const ServiceClass = PROVIDERS[resolvedConfig.provider.toLowerCase()];
  if (!ServiceClass) {
    throw new Error(
      `Unknown LLM provider: ${resolvedConfig.provider}. Available: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  return new ServiceClass(resolvedConfig);
}

function resolveApiKey(config: LLMConfig): string {
  if (config.apiKey) return config.apiKey;
  const envKey = `${config.provider.toUpperCase()}_API_KEY`;
  const key = process.env[envKey];
  if (!key) throw new Error(`API key not found: set ${envKey} or pass apiKey in config`);
  return key;
}

function resolveBaseUrl(config: LLMConfig): string | undefined {
  if (config.baseUrl) return config.baseUrl;
  const envUrl = `${config.provider.toUpperCase()}_BASE_URL`;
  return process.env[envUrl] || undefined;
}
