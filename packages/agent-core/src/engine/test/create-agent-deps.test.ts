import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ModelSpec, SessionEvent } from "@actspace/shared";
import { MODEL_REGISTRY } from "@actspace/shared";
import { buildLLMConfig } from "../create-agent-deps";
import type { AgentEnvConfig, AgentConfig } from "../create-agent-deps";
import { appendEvents } from "../../persistence/jsonl";

function createTestEnvConfig(overrides?: Partial<AgentEnvConfig>): AgentEnvConfig {
  return {
    deepseekApiKey: "sk-test-deepseek",
    deepseekApiFormat: "anthropic",
    deepseekBaseUrl: undefined,
    deepseekAnthropicBaseUrl: undefined,
    kimiApiKey: "sk-test-kimi",
    kimiBaseUrl: undefined,
    temperature: undefined,
    maxTokens: undefined,
    disabledTools: [],
    ...overrides,
  };
}

function createTestAgentConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  const spec = MODEL_REGISTRY["deepseek-v4-flash"];
  const envConfig = createTestEnvConfig();
  const llmConfig = buildLLMConfig(spec, envConfig);
  return {
    llmConfig,
    toolManagerConfig: {
      workspaceRoot: "/tmp/workspace",
      primaryProvider: spec.provider,
      apiFormat: llmConfig.apiFormat,
      hasKimiKey: true,
      disabledTools: [],
    },
    thinkingEnabled: spec.thinkingDefault,
    modelSpec: spec,
    ...overrides,
  };
}

describe("buildLLMConfig", () => {
  it("should use deepseek key for deepseek provider", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig();
    const config = buildLLMConfig(spec, envConfig);

    expect(config.provider).toBe("deepseek");
    expect(config.apiFormat).toBe("anthropic");
    expect(config.apiKey).toBe("sk-test-deepseek");
    expect(config.model).toBe("deepseek-v4-flash");
    expect(config.temperature).toBeUndefined();
    expect(config.maxTokens).toBeUndefined();
  });

  it("should use kimi key for kimi provider", () => {
    const spec = MODEL_REGISTRY["kimi-k2.6"];
    const envConfig = createTestEnvConfig();
    const config = buildLLMConfig(spec, envConfig);

    expect(config.provider).toBe("kimi");
    expect(config.apiKey).toBe("sk-test-kimi");
    expect(config.model).toBe("kimi-k2.6");
  });

  it("should include temperature when env overrides default", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({ temperature: 0.7 });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.temperature).toBe(0.7);
  });

  it("should omit temperature when env leaves default", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({ temperature: undefined });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.temperature).toBeUndefined();
  });

  it("should include maxTokens when env overrides default", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({ maxTokens: 4096 });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.maxTokens).toBe(4096);
  });

  it("should include baseUrl when provided", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({
      deepseekApiFormat: "openai",
      deepseekBaseUrl: "https://custom.api.com",
    });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.baseUrl).toBe("https://custom.api.com");
  });

  it("should use Anthropic baseUrl when DeepSeek apiFormat is anthropic", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({
      deepseekApiFormat: "anthropic",
      deepseekBaseUrl: "https://openai-compatible.example",
      deepseekAnthropicBaseUrl: "https://anthropic-compatible.example",
    });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.apiFormat).toBe("anthropic");
    expect(config.baseUrl).toBe("https://anthropic-compatible.example");
  });

  it("should omit baseUrl when not provided", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({
      deepseekApiFormat: "openai",
      deepseekBaseUrl: undefined,
    });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.baseUrl).toBeUndefined();
  });

  it("should return empty apiKey for unknown provider", () => {
    const unknownSpec: ModelSpec = {
      id: "deepseek-v4-flash",
      label: "Unknown",
      provider: "unknown" as ModelSpec["provider"],
      apiModel: "unknown-model",
      thinkingDefault: false,
      supportsThinkingToggle: false,
      contextWindow: 100_000,
    };
    const envConfig = createTestEnvConfig();
    const config = buildLLMConfig(unknownSpec, envConfig);

    expect(config.apiKey).toBe("");
  });
});

describe("buildAgentConfig (via dynamic import to reset env)", () => {
  const ENV_KEYS = [
    "DEEPSEEK_API_KEY", "KIMI_API_KEY",
    "DEEPSEEK_API_FORMAT", "DEEPSEEK_BASE_URL", "DEEPSEEK_ANTHROPIC_BASE_URL",
    "LLM_TEMPERATURE", "LLM_MAX_TOKENS",
    "ACTSPACE_DISABLED_TOOLS",
  ];
  const EMPTY_ENV_PATH = "/private/tmp/actspace-agent-env-test-does-not-exist";

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();
  });

  it("should return pure config without runtime instances", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig).toBeDefined();
    expect(config.toolManagerConfig).toBeDefined();
    expect(config.modelSpec).toBeDefined();
    expect(typeof config.thinkingEnabled).toBe("boolean");
    expect(config).not.toHaveProperty("llm");
    expect(config).not.toHaveProperty("toolManager");
  });

  it("should resolve default model when none specified", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.modelSpec.id).toBe("deepseek-v4-pro");
    expect(config.thinkingEnabled).toBe(true);
  });

  it("should resolve specified model", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({ model: "deepseek-v4-pro" }, "/tmp/workspace");

    expect(config.modelSpec.id).toBe("deepseek-v4-pro");
    expect(config.thinkingEnabled).toBe(true);
  });

  it("should override thinkingEnabled from frontend input", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({ model: "deepseek-v4-pro", thinkingEnabled: false }, "/tmp/workspace");

    expect(config.thinkingEnabled).toBe(false);
  });

  it("should pass workspaceRoot into toolManagerConfig", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/my/project");

    expect(config.toolManagerConfig.workspaceRoot).toBe("/my/project");
  });

  it("should read env for llmConfig apiKey", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig.apiKey).toBe("sk-env-deepseek");
  });

  it("should route DeepSeek config to Anthropic format by default", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
    process.env.DEEPSEEK_ANTHROPIC_BASE_URL = "https://anthropic.example";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig).toMatchObject({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "sk-env-deepseek",
      baseUrl: "https://anthropic.example",
    });
    expect(config.toolManagerConfig.apiFormat).toBe("anthropic");
  });

  it("should keep the OpenAI-compatible route as an explicit DeepSeek fallback", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
    process.env.DEEPSEEK_API_FORMAT = "openai";
    process.env.DEEPSEEK_BASE_URL = "https://openai.example";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig).toMatchObject({
      provider: "deepseek",
      apiFormat: "openai",
      apiKey: "sk-env-deepseek",
      baseUrl: "https://openai.example",
    });
    expect(config.toolManagerConfig.apiFormat).toBe("openai");
  });
});

describe("createAgentFromConfig", () => {
  it("should create runtime instances from config", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const config = createTestAgentConfig();
    const deps = createAgentFromConfig(config);

    expect(deps.llm).toBeDefined();
    expect(deps.toolManager).toBeDefined();
    expect(deps.contextManager).toBeDefined();
    expect(deps.thinkingEnabled).toBe(config.thinkingEnabled);
    expect(deps.modelSpec).toBe(config.modelSpec);
  });

  it("should respect disabledTools from config", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const config = createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "anthropic",
        hasKimiKey: true,
        disabledTools: ["bash"],
      },
    });
    const deps = createAgentFromConfig(config);

    expect(deps.toolManager.has("bash")).toBe(false);
  });

  it("should register kimi-assistant tools when DeepSeek uses OpenAI-compatible format", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const config = createTestAgentConfig({
      llmConfig: {
        provider: "deepseek",
        apiFormat: "openai",
        apiKey: "sk-test-deepseek",
        model: "deepseek-v4-flash",
      },
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: true,
        disabledTools: [],
      },
    });
    const deps = createAgentFromConfig(config);

    expect(deps.toolManager.has("web_search")).toBe(true);
  });

  it("should not register kimi-assistant tools when hasKimiKey is false", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const config = createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: false,
        disabledTools: [],
      },
    });
    const deps = createAgentFromConfig(config);

    expect(deps.toolManager.has("web_search")).toBe(false);
  });

  it("should not register Kimi-backed web_search for DeepSeek Anthropic format", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const config = createTestAgentConfig({
      llmConfig: {
        provider: "deepseek",
        apiFormat: "anthropic",
        apiKey: "sk-test-deepseek",
        model: "deepseek-v4-flash",
      },
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "anthropic",
        hasKimiKey: true,
        disabledTools: [],
      },
    });
    const deps = createAgentFromConfig(config);

    expect(deps.toolManager.has("web_search")).toBe(false);
    expect(deps.toolManager.has("analyze_media")).toBe(true);
  });
});

describe("createAgentForSession", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `actspace-test-agent-deps-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function createEvent(type: string, payload: unknown, idx: number): SessionEvent {
    return {
      id: `evt_${idx}`,
      sessionId: "test-session",
      turnId: "turn-1",
      type: type as SessionEvent["type"],
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
      payload,
    };
  }

  it("creates AgentDeps with an empty conversation when sessionPath is omitted", async () => {
    const { createAgentForSession } = await import("../create-agent-deps");
    const deps = await createAgentForSession(createTestAgentConfig());

    expect(deps.contextManager.getMessageCount()).toBe(0);
  });

  it("creates AgentDeps whose contextManager already contains session history", async () => {
    const sessionPath = join(testDir, "session.jsonl");
    await appendEvents(sessionPath, [
      createEvent("user_message", { content: "remember this" }, 1),
      createEvent(
        "assistant_message",
        {
          content: "noted",
          stopReason: "stop",
          model: "test",
          provider: "test",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        2,
      ),
    ]);

    const { createAgentForSession } = await import("../create-agent-deps");
    const deps = await createAgentForSession(createTestAgentConfig(), { sessionPath });

    expect(deps.contextManager.getMessageCount()).toBe(2);
    const messages = deps.contextManager.getContext().messages;
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("creates an empty conversation when session.jsonl does not exist", async () => {
    const missingPath = join(testDir, "missing.jsonl");
    const { createAgentForSession } = await import("../create-agent-deps");
    const deps = await createAgentForSession(createTestAgentConfig(), { sessionPath: missingPath });

    expect(deps.contextManager.getMessageCount()).toBe(0);
  });
});
