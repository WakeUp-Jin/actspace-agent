import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "MOCK_MODE",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
];
const EMPTY_ENV_PATH = "/private/tmp/actspace-agent-env-test-does-not-exist";

describe("envToLLMConfig", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    vi.resetModules();
  });

  it("allows DeepSeek without a Kimi key", async () => {
    process.env.LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    const { loadEnv, envToLLMConfig } = await import("../env");

    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    expect(envToLLMConfig()).toMatchObject({
      provider: "deepseek",
      apiKey: "deepseek-key",
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
});
