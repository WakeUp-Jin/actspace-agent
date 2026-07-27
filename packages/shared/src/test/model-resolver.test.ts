import { describe, expect, it } from "vitest";
import {
  BUILTIN_MODEL_REGISTRY,
  type ModelDefinition,
  type ModelKey,
} from "../model-config";
import {
  capabilityMatchesPurpose,
  listUsableModels,
  resolveConfiguredModel,
  type ModelSnapshot,
} from "../model-resolver";

const now = "2026-07-24T00:00:00.000Z";

function makeSnapshot(): ModelSnapshot {
  return {
    providers: {
      deepseek: {
        enabled: true,
        hasApiKey: true,
        lastConnection: { status: "available", checkedAt: now },
      },
      kimi: {
        enabled: true,
        hasApiKey: true,
        lastConnection: { status: "available", checkedAt: now },
      },
      openrouter: {
        enabled: true,
        hasApiKey: true,
        lastConnection: { status: "available", checkedAt: now },
      },
      duckding: {
        enabled: true,
        hasApiKey: false,
        lastConnection: { status: "untested" },
        additionalCredentials: {},
      },
    },
    definitions: { ...BUILTIN_MODEL_REGISTRY },
    installedModels: Object.fromEntries(
      Object.keys(BUILTIN_MODEL_REGISTRY).map((key) => [key, { enabled: true, addedAt: now }]),
    ) as ModelSnapshot["installedModels"],
  };
}

function dynamicModel(overrides: Partial<ModelDefinition> = {}): ModelDefinition {
  return {
    key: "openrouter:example/model",
    provider: "openrouter",
    api: "openai-completions",
    apiModel: "example/model",
    label: "Example Model",
    source: "provider-catalog",
    contextWindow: 128_000,
    maxTokens: 8192,
    thinkingDefault: false,
    capabilities: {
      input: ["text"],
      toolUse: "unknown",
      reasoning: false,
      thinkingToggle: false,
    },
    ...overrides,
  };
}

function install(snapshot: ModelSnapshot, definition: ModelDefinition): void {
  snapshot.definitions[definition.key] = definition;
  snapshot.installedModels[definition.key] = { enabled: true, addedAt: now };
}

describe("model resolver", () => {
  it("lists builtin chat models in stable provider order", () => {
    const keys = listUsableModels(makeSnapshot(), "chat").map((model) => model.key);
    expect(keys).toEqual([
      "deepseek:deepseek-v4-flash",
      "deepseek:deepseek-v4-pro",
      "kimi:kimi-k2.6",
      "kimi:kimi-k2.7-code",
    ]);
  });

  it("keeps configured providers usable before the optional connection test", () => {
    const snapshot = makeSnapshot();
    snapshot.providers.deepseek.lastConnection = { status: "untested" };

    expect(resolveConfiguredModel(snapshot, "deepseek-v4-flash", "utility").ok).toBe(true);
    expect(listUsableModels(snapshot, "chat").map((model) => model.key)).toContain(
      "deepseek:deepseek-v4-pro",
    );
  });

  it("allows tool-unknown catalog models for utility but not agent purposes", () => {
    const snapshot = makeSnapshot();
    const definition = dynamicModel();
    install(snapshot, definition);

    expect(resolveConfiguredModel(snapshot, definition.key, "utility").ok).toBe(true);
    expect(resolveConfiguredModel(snapshot, definition.key, "chat")).toMatchObject({
      ok: false,
      reason: "capability_mismatch",
    });
    expect(resolveConfiguredModel(snapshot, definition.key, "explore")).toMatchObject({
      ok: false,
      reason: "capability_mismatch",
    });
    expect(resolveConfiguredModel(snapshot, definition.key, "kairos")).toMatchObject({
      ok: false,
      reason: "capability_mismatch",
    });
  });

  it("accepts declared tools for chat and image input for vision", () => {
    const snapshot = makeSnapshot();
    const definition = dynamicModel({
      key: "openrouter:example/vision",
      apiModel: "example/vision",
      capabilities: {
        input: ["text", "image"],
        toolUse: "declared",
        reasoning: true,
        thinkingToggle: false,
      },
    });
    install(snapshot, definition);

    expect(capabilityMatchesPurpose(definition, "chat")).toBe(true);
    expect(capabilityMatchesPurpose(definition, "vision")).toBe(true);
    expect(resolveConfiguredModel(snapshot, definition.key, "chat").ok).toBe(true);
    expect(resolveConfiguredModel(snapshot, definition.key, "vision").ok).toBe(true);
  });

  it.each([
    ["provider_disabled", (snapshot: ModelSnapshot) => { snapshot.providers.deepseek.enabled = false; }],
    ["provider_disconnected", (snapshot: ModelSnapshot) => { snapshot.providers.deepseek.hasApiKey = false; }],
    ["connection_unavailable", (snapshot: ModelSnapshot) => {
      snapshot.providers.deepseek.lastConnection = { status: "unavailable", checkedAt: now };
    }],
    ["model_not_installed", (snapshot: ModelSnapshot) => {
      delete snapshot.installedModels["deepseek:deepseek-v4-pro"];
    }],
    ["model_disabled", (snapshot: ModelSnapshot) => {
      snapshot.installedModels["deepseek:deepseek-v4-pro"] = { enabled: false, addedAt: now };
    }],
  ] as const)("returns %s with the configured model preserved", (reason, mutate) => {
    const snapshot = makeSnapshot();
    mutate(snapshot);
    expect(resolveConfiguredModel(snapshot, "deepseek-v4-pro", "chat")).toMatchObject({
      ok: false,
      key: "deepseek:deepseek-v4-pro",
      reason,
      definition: { label: "DeepSeek V4 Pro" },
    });
  });

  it("does not default missing or unknown selections", () => {
    const snapshot = makeSnapshot();
    expect(resolveConfiguredModel(snapshot, "openrouter:missing/model", "utility")).toEqual({
      ok: false,
      key: "openrouter:missing/model",
      reason: "model_missing",
    });
    expect(resolveConfiguredModel(snapshot, "not-a-model" as ModelKey, "chat")).toEqual({
      ok: false,
      reason: "model_missing",
    });
  });

  it("keeps identical upstream ids distinct across providers", () => {
    const snapshot = makeSnapshot();
    const openRouterDefinition = dynamicModel({
      key: "openrouter:kimi-k2.6",
      apiModel: "kimi-k2.6",
      capabilities: {
        input: ["text"],
        toolUse: "declared",
        reasoning: false,
        thinkingToggle: false,
      },
    });
    install(snapshot, openRouterDefinition);

    const keys = listUsableModels(snapshot, "chat").map((model) => model.key);
    expect(keys).toContain("kimi:kimi-k2.6");
    expect(keys).toContain("openrouter:kimi-k2.6");
  });

  it("uses an explicitly bound extra credential without requiring the default Key", () => {
    const snapshot = makeSnapshot();
    const definition = dynamicModel({
      key: "duckding:grok-4.5",
      provider: "duckding",
      apiModel: "grok-4.5",
      source: "custom",
      capabilities: {
        input: ["text"],
        toolUse: "declared",
        reasoning: true,
        thinkingToggle: false,
      },
    });
    install(snapshot, definition);
    snapshot.installedModels[definition.key] = {
      enabled: true,
      addedAt: now,
      credentialId: "sale",
    };
    snapshot.providers.duckding.additionalCredentials = {
      sale: { hasApiKey: true, lastConnection: { status: "available", checkedAt: now } },
    };

    expect(resolveConfiguredModel(snapshot, definition.key, "chat").ok).toBe(true);
  });

  it("does not silently fall back when a bound credential is missing or unavailable", () => {
    const snapshot = makeSnapshot();
    snapshot.providers.duckding.hasApiKey = true;
    const definition = dynamicModel({
      key: "duckding:grok-4.5",
      provider: "duckding",
      apiModel: "grok-4.5",
      source: "custom",
    });
    install(snapshot, definition);
    snapshot.installedModels[definition.key] = {
      enabled: true,
      addedAt: now,
      credentialId: "missing",
    };

    expect(resolveConfiguredModel(snapshot, definition.key, "utility")).toMatchObject({
      ok: false,
      reason: "credential_missing",
    });

    snapshot.providers.duckding.additionalCredentials = {
      missing: {
        hasApiKey: true,
        lastConnection: { status: "unavailable", checkedAt: now },
      },
    };
    expect(resolveConfiguredModel(snapshot, definition.key, "utility")).toMatchObject({
      ok: false,
      reason: "credential_unavailable",
    });
  });
});
