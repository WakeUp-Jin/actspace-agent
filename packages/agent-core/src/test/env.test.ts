import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "MOCK_MODE",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_API_FORMAT",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_ANTHROPIC_BASE_URL",
  "ACTSPACE_DISABLED_TOOLS",
];
const EMPTY_ENV_PATH = "/private/tmp/actspace-agent-env-test-does-not-exist";

describe("envToLLMConfig", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    vi.resetModules();
  });

  it("defaults DeepSeek to Anthropic format without a Kimi key", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "deepseek-key",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-chat",
    });
  });

  it("honors custom DeepSeek Anthropic base URL on the default route", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    process.env.DEEPSEEK_ANTHROPIC_BASE_URL = "https://example.test/anthropic";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "deepseek-key",
      baseUrl: "https://example.test/anthropic",
      model: "deepseek-chat",
    });
  });

  it("can explicitly fall back to DeepSeek OpenAI-compatible format", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    process.env.DEEPSEEK_API_FORMAT = "openai";
    process.env.DEEPSEEK_BASE_URL = "https://example.test/openai";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "deepseek",
      apiFormat: "openai",
      apiKey: "deepseek-key",
      baseUrl: "https://example.test/openai",
      model: "deepseek-chat",
    });
  });

  it("selects Kimi config when Kimi is the primary provider", async () => {
    process.env.LLM_PROVIDER = "kimi";
    process.env.KIMI_API_KEY = "kimi-key";
    process.env.KIMI_MODEL = "kimi-k2.6";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "kimi",
      apiKey: "kimi-key",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });
  });

  it("keeps mock mode as an explicit test/demo override", async () => {
    process.env.MOCK_MODE = "true";
    process.env.LLM_PROVIDER = "kimi";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "mock",
      apiKey: "mock-key",
      model: "deepseek-mock",
    });
  });

  it("parses disabled tools from a comma-separated env var", async () => {
    process.env.ACTSPACE_DISABLED_TOOLS = "read_file, bash,web_search ,,";
    const { loadEnv, env } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(env.ACTSPACE_DISABLED_TOOLS).toEqual(["read_file", "bash", "web_search"]);
  });
});
