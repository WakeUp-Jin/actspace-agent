import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ModelDefinition, ModelSpec, SessionEvent } from "@actspace/shared";
import { BUILTIN_MODEL_REGISTRY, IMAGE_INSPECTION_MODEL_LIST, MODEL_REGISTRY } from "@actspace/shared";
import { buildAgentConfigFromRuntime, buildLLMConfig, buildLLMConfigFromRuntime } from "../create-agent-deps";
import type { AgentEnvConfig, AgentConfig } from "../create-agent-deps";
import { appendEvents } from "../../persistence/jsonl";

function createTestEnvConfig(overrides?: Partial<AgentEnvConfig>): AgentEnvConfig {
  return {
    deepseekApiKey: "sk-test-deepseek",
    deepseekBaseUrl: undefined,
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
    systemPrompt: "TEST_SYSTEM_PROMPT",
    ...overrides,
  };
}

describe("buildLLMConfig", () => {
  it("should use deepseek key for deepseek provider", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig();
    const config = buildLLMConfig(spec, envConfig);

    expect(config.provider).toBe("deepseek");
    expect(config.apiFormat).toBe("openai");
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
      deepseekBaseUrl: "https://custom.api.com",
    });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.baseUrl).toBe("https://custom.api.com");
  });

  it("should omit baseUrl when not provided", () => {
    const spec = MODEL_REGISTRY["deepseek-v4-flash"];
    const envConfig = createTestEnvConfig({
      deepseekBaseUrl: undefined,
    });
    const config = buildLLMConfig(spec, envConfig);

    expect(config.baseUrl).toBe("https://api.deepseek.com");
  });

  it("should reject an unknown legacy provider instead of returning an empty key", () => {
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
    expect(() => buildLLMConfig(unknownSpec, envConfig)).toThrow("Provider is not registered");
  });
});

describe("buildLLMConfigFromRuntime", () => {
  const openRouterModel: ModelDefinition = {
    key: "openrouter:anthropic/claude-sonnet-4",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    source: "custom",
    contextWindow: 200_000,
    maxTokens: 8192,
    thinkingDefault: false,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: false,
    },
  };

  it("builds an explicit OpenRouter runtime with scoped proxy and headers", () => {
    const config = buildLLMConfigFromRuntime(
      openRouterModel,
      {
        provider: "openrouter",
        apiKey: "sk-or-test",
        baseUrl: "https://openrouter.ai/api/v1/",
        transport: { proxyUrl: "http://127.0.0.1:7890" },
      },
      { temperature: 0.2 },
    );

    expect(config).toMatchObject({
      provider: "openrouter",
      api: "openai-completions",
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-sonnet-4",
      temperature: 0.2,
      maxTokens: 8192,
      transport: { proxyUrl: "http://127.0.0.1:7890" },
      defaultHeaders: { "X-OpenRouter-Title": "Actspace" },
    });
  });

  it("rejects missing keys, mismatched providers, and invalid base URLs", () => {
    expect(() => buildLLMConfigFromRuntime(openRouterModel, {
      provider: "openrouter",
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
    })).toThrow("API key");

    expect(() => buildLLMConfigFromRuntime(openRouterModel, {
      provider: "kimi",
      apiKey: "sk-test",
      baseUrl: "https://api.moonshot.cn/v1",
    })).toThrow("do not match");

    const deepSeek = BUILTIN_MODEL_REGISTRY["deepseek:deepseek-v4-pro"]!;
    expect(() => buildLLMConfigFromRuntime(deepSeek, {
      provider: "deepseek",
      apiKey: "sk-test",
      baseUrl: "file:///tmp/not-http",
    })).toThrow("HTTP or HTTPS");
  });
});

describe("buildAgentConfigFromRuntime reasoning controls", () => {
  const runtime = {
    provider: "openrouter" as const,
    apiKey: "sk-or-test",
    baseUrl: "https://openrouter.ai/api/v1",
  };
  const model: ModelDefinition = {
    key: "openrouter:vendor/reasoning-model",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "vendor/reasoning-model",
    label: "Reasoning Model",
    source: "custom",
    contextWindow: 200_000,
    maxTokens: 16_000,
    thinkingDefault: true,
    capabilities: {
      input: ["text"],
      toolUse: "declared",
      reasoning: true,
      thinkingToggle: true,
      reasoningEfforts: ["low", "medium", "high"],
    },
  };

  it("keeps a supported effort and drops an unsupported effort", () => {
    const supported = buildAgentConfigFromRuntime({
      main: { definition: model, runtime },
      thinkingEnabled: true,
      reasoningEffort: "high",
    }, "/tmp/workspace");
    const unsupported = buildAgentConfigFromRuntime({
      main: { definition: model, runtime },
      thinkingEnabled: true,
      reasoningEffort: "max",
    }, "/tmp/workspace");

    expect(supported.reasoningEffort).toBe("high");
    expect(unsupported.reasoningEffort).toBeUndefined();
  });

  it("forces thinking on for mandatory reasoning models", () => {
    const config = buildAgentConfigFromRuntime({
      main: {
        definition: {
          ...model,
          capabilities: { ...model.capabilities, thinkingToggle: false, reasoningMandatory: true },
        },
        runtime,
      },
      thinkingEnabled: false,
      reasoningEffort: "medium",
    }, "/tmp/workspace");

    expect(config.thinkingEnabled).toBe(true);
    expect(config.reasoningEffort).toBe("medium");
  });

  it("injects image inspection only for text-only main models", () => {
    const imageInspection = {
      definition: IMAGE_INSPECTION_MODEL_LIST[0]!,
      runtime: {
        provider: "openrouter" as const,
        apiKey: "sk-or-vision",
        baseUrl: "https://openrouter.ai/api/v1",
      },
    };
    const runtimeContext = {
      sessionArtifactRoot: "/tmp/session/artifacts",
      imageInspectionAllowedPaths: ["/tmp/attachment.png"],
    };

    const textOnly = buildAgentConfigFromRuntime({
      main: { definition: model, runtime },
      imageInspection,
    }, "/tmp/workspace", undefined, runtimeContext);
    expect(textOnly.imageInspectionLlmConfig).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      maxRetries: 0,
    });
    expect(textOnly.imageInspectionToolConfig).toMatchObject({
      allowedImagePaths: ["/tmp/attachment.png"],
      artifactRoot: "/tmp/session/artifacts",
    });

    const nativeVision = buildAgentConfigFromRuntime({
      main: {
        definition: { ...model, capabilities: { ...model.capabilities, input: ["text", "image"] } },
        runtime,
      },
      imageInspection,
    }, "/tmp/workspace", undefined, runtimeContext);
    expect(nativeVision.imageInspectionLlmConfig).toBeUndefined();
    expect(nativeVision.imageInspectionToolConfig).toBeUndefined();
  });

  it("encodes DuckCoding Codex effort in the exact request model name", () => {
    const duckCodingModel: ModelDefinition = {
      key: "duckcoding:gpt-5.6-sol",
      provider: "duckcoding",
      api: "openai-responses",
      apiModel: "gpt-5.6-sol",
      label: "GPT 5.6 Sol",
      source: "custom",
      contextWindow: 255_000,
      maxTokens: null,
      thinkingDefault: true,
      capabilities: {
        input: ["text"],
        toolUse: "declared",
        reasoning: true,
        thinkingToggle: false,
        reasoningMandatory: true,
        reasoningEfforts: ["low", "medium", "high", "xhigh", "ultra"],
        reasoningDefaultEffort: "medium",
      },
      requestModelByReasoningEffort: {
        low: "gpt-5.6-sol-low",
        medium: "gpt-5.6-sol",
        high: "gpt-5.6-sol-high",
        xhigh: "gpt-5.6-sol-xhigh",
        ultra: "gpt-5.6-sol-ultra",
      },
    };
    const config = buildAgentConfigFromRuntime({
      main: {
        definition: duckCodingModel,
        runtime: {
          provider: "duckcoding",
          apiKey: "sk-duckcoding-test",
          baseUrl: "https://api.duckcoding.ai/v1",
        },
      },
      thinkingEnabled: true,
      reasoningEffort: "high",
    }, "/tmp/workspace", undefined, { sessionId: "session-cache" });

    expect(config.reasoningEffort).toBe("high");
    expect(config.llmConfig.model).toBe("gpt-5.6-sol-high");
    expect(config.modelDefinition?.apiModel).toBe("gpt-5.6-sol-high");
    expect(config.modelKey).toBe("duckcoding:gpt-5.6-sol");
    expect(config.llmConfig.promptCacheKey).toMatch(/^actspace:[a-f0-9]{48}$/);
    expect(config.llmConfig.promptCacheKey).not.toContain("session-cache");

    const ultra = buildAgentConfigFromRuntime({
      main: {
        definition: duckCodingModel,
        runtime: {
          provider: "duckcoding",
          apiKey: "sk-duckcoding-test",
          baseUrl: "https://api.duckcoding.ai/v1",
        },
      },
      reasoningEffort: "ultra",
    }, "/tmp/workspace", undefined, { sessionId: "session-cache" });
    expect(ultra.llmConfig.model).toBe("gpt-5.6-sol-ultra");
    expect(ultra.llmConfig.promptCacheKey).toBe(config.llmConfig.promptCacheKey);
  });
});

describe("buildAgentConfig (via dynamic import to reset env)", () => {
  const ENV_KEYS = [
    "DEEPSEEK_API_KEY", "KIMI_API_KEY",
    "DEEPSEEK_BASE_URL",
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
    expect(typeof config.systemPrompt).toBe("string");
    expect(config).not.toHaveProperty("llm");
    expect(config).not.toHaveProperty("toolManager");
  });

  it("should accept systemPrompt from runtime context", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace", undefined, {
      systemPrompt: "CUSTOM_SYSTEM_PROMPT",
    });

    expect(config.systemPrompt).toBe("CUSTOM_SYSTEM_PROMPT");
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

  it("should pass additionalWritableRoots from runtime context into toolManagerConfig", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/my/project", undefined, {
      additionalWritableRoots: ["/tmp/actspace/kairos/inbox"],
    });

    expect(config.toolManagerConfig.additionalWritableRoots).toEqual(["/tmp/actspace/kairos/inbox"]);
  });

  it("should pass the runtime tool profile into toolManagerConfig", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
    const config = buildAgentConfig({}, "/my/project", undefined, { toolProfile: "read-only" });

    expect(config.toolManagerConfig.toolProfile).toBe("read-only");
  });

  it("should read env for llmConfig apiKey", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig.apiKey).toBe("sk-env-deepseek");
  });

  it("should route DeepSeek config to OpenAI-compatible format by default", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
    const { loadEnv } = await import("../../env");
    const { buildAgentConfig } = await import("../create-agent-deps");
    loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });

    const config = buildAgentConfig({}, "/tmp/workspace");

    expect(config.llmConfig).toMatchObject({
      provider: "deepseek",
      apiFormat: "openai",
      apiKey: "sk-env-deepseek",
      baseUrl: "https://api.deepseek.com",
    });
    expect(config.toolManagerConfig.apiFormat).toBe("openai");
  });

  it("should honor a custom DeepSeek OpenAI-compatible base URL", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-env-deepseek";
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

  it("should use config.systemPrompt as the full system prompt", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const deps = createAgentFromConfig(createTestAgentConfig({ systemPrompt: "FULL_CUSTOM_SYSTEM_PROMPT" }));

    expect(deps.contextManager.getContext().systemPrompt).toContain("FULL_CUSTOM_SYSTEM_PROMPT");
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

  it("should expose no tools for the none profile", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const deps = createAgentFromConfig(createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: true,
        hasWebSearchKey: true,
        toolProfile: "none",
      },
    }));

    expect(deps.toolManager.getAll()).toEqual([]);
  });

  it("should expose only the explicit read-only allowlist", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const deps = createAgentFromConfig(createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: true,
        hasWebSearchKey: true,
        hasImageGenerationKey: true,
        toolProfile: "read-only",
      },
    }));

    expect(deps.toolManager.getAll().map((tool) => tool.name).sort()).toEqual([
      "glob",
      "grep",
      "list_directory",
      "read_file",
      "web_fetch",
      "web_search",
    ]);
  });

  it("should register web_search only when a search provider key is configured", async () => {
    const { createAgentFromConfig } = await import("../create-agent-deps");
    const withKey = createAgentFromConfig(createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: false,
        hasWebSearchKey: true,
        disabledTools: [],
      },
    }));
    const withoutKey = createAgentFromConfig(createTestAgentConfig({
      toolManagerConfig: {
        workspaceRoot: "/tmp/workspace",
        primaryProvider: "deepseek",
        apiFormat: "openai",
        hasKimiKey: false,
        hasWebSearchKey: false,
        disabledTools: [],
      },
    }));

    expect(withKey.toolManager.has("web_search")).toBe(true);
    expect(withoutKey.toolManager.has("web_search")).toBe(false);
    // web_fetch 无 key 依赖，两种情况下都注册
    expect(withKey.toolManager.has("web_fetch")).toBe(true);
    expect(withoutKey.toolManager.has("web_fetch")).toBe(true);
  });

  it("should register web tools for DeepSeek OpenAI format", async () => {
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
        hasWebSearchKey: true,
        disabledTools: [],
      },
    });
    const deps = createAgentFromConfig(config);

    expect(deps.toolManager.has("web_search")).toBe(true);
    expect(deps.toolManager.has("web_fetch")).toBe(true);
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
      agentRunId: "turn-1",
      type: type as SessionEvent["type"],
      timestamp: new Date().toISOString(),
      schemaVersion: 2,
      payload,
    };
  }

  it("creates AgentDeps with an empty conversation when sessionPath is omitted", async () => {
    const { createAgentForSession } = await import("../create-agent-deps");
    const deps = await createAgentForSession(createTestAgentConfig());

    expect(deps.contextManager.getMessageCount()).toBe(0);
  });

  it("uses config.systemPrompt when restoring a session", async () => {
    const { createAgentForSession } = await import("../create-agent-deps");
    const deps = await createAgentForSession(createTestAgentConfig({ systemPrompt: "RESTORED_SYSTEM_PROMPT" }));

    expect(deps.contextManager.getContext().systemPrompt).toContain("RESTORED_SYSTEM_PROMPT");
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
