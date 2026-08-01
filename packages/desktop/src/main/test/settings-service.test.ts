import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadEnv, MAIN_AGENT_SYSTEM_PROMPT } from "@actspace/agent-core";
import { PROVIDER_REGISTRY } from "@actspace/shared";
import { SettingsService, type SecretCrypto } from "../settings-service";

const MANAGED_ENV_KEYS = [
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "ACTSPACE_DISABLED_TOOLS",
  "ACTSPACE_BASH_ALWAYS_ASK",
  "LLM_TEMPERATURE",
  "LLM_MAX_TOKENS",
  "KAIROS_MODEL_ID",
  "KAIROS_THINKING",
  "IMAGE_GENERATION_API_KEY",
  "IMAGE_GENERATION_BASE_URL",
  "IMAGE_GENERATION_MODEL",
];

/**
 * 用一个不存在的 envPath + 不写 process.env，刷新冻结的 env：
 * 这样 env 完全由当前 process.env 决定，单测不受仓库 .env 干扰。
 */
const NONEXISTENT_ENV = "/private/tmp/actspace-settings-test-does-not-exist";
function reloadEnv(): void {
  loadEnv({ envPath: NONEXISTENT_ENV, mergeToProcessEnv: false });
}

function resetManagedEnv(): void {
  for (const key of MANAGED_ENV_KEYS) delete process.env[key];
  reloadEnv();
}

interface FakeCrypto extends SecretCrypto {
  available: boolean;
}

function makeCrypto(available = true): FakeCrypto {
  return {
    available,
    isAvailable() {
      return this.available;
    },
    encrypt(plain: string) {
      return Buffer.from(`enc:${plain}`, "utf8");
    },
    decrypt(cipher: Buffer) {
      const text = cipher.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("bad ciphertext");
      return text.slice(4);
    },
  };
}

async function makeDataRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "actspace-settings-test-"));
}

function makeService(dataRoot: string, crypto: SecretCrypto = makeCrypto()): SettingsService {
  return new SettingsService({ dataRoot, crypto, reloadEnv });
}

async function atomicJsonWriter(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.test-tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}

describe("SettingsService", () => {
  beforeEach(() => {
    resetManagedEnv();
  });

  afterEach(() => {
    resetManagedEnv();
  });

  it("首次运行无 settings.json 时从当前 env 播种默认值", async () => {
    process.env.ACTSPACE_BASH_ALWAYS_ASK = "1";
    process.env.LLM_TEMPERATURE = "0.5";
    reloadEnv();

    const svc = makeService(await makeDataRoot());
    await svc.load();
    const s = svc.get();

    expect(s.agent.bashAlwaysAsk).toBe(true);
    expect(s.agent.systemPromptPath).toBe(join(s.agent.systemPromptPath.split("/prompts/")[0], "prompts", "main-agent.md"));
    expect(await readFile(s.agent.systemPromptPath, "utf8")).toBe(MAIN_AGENT_SYSTEM_PROMPT);
    expect(s.agent.temperature).toBe(0.5);
    expect(s.kairos.modelId).toBeNull();
    expect(s.kairos.thinking).toBe("auto");
    expect(s.defaultModelId).toBeNull();
    expect(s.shortcuts?.quickOpen).toEqual({
      enabled: true,
      accelerator: "CommandOrControl+Shift+Space",
      target: { kind: "automatic" },
    });
  });

  it("persists quick open shortcut settings and restores them in a new service", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    await svc.updateQuickOpenShortcut({
      accelerator: "CommandOrControl+Alt+A",
      target: { kind: "workspace", workspaceId: "workspace-1" },
    });

    const reopened = makeService(dataRoot);
    await reopened.load();
    expect(reopened.get().shortcuts?.quickOpen).toEqual({
      enabled: true,
      accelerator: "CommandOrControl+Alt+A",
      target: { kind: "workspace", workspaceId: "workspace-1" },
    });
  });

  it("update 会持久化、刷新 env，并能被新实例读回", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const updated = await svc.update({
      defaultModelId: "deepseek-v4-pro",
      agent: {
        bashAlwaysAsk: true,
        temperature: 1.2,
        maxTokens: 4096,
        disabledTools: ["bash"],
      },
    });

    expect(updated.agent.bashAlwaysAsk).toBe(true);
    expect(process.env.ACTSPACE_BASH_ALWAYS_ASK).toBe("1");
    expect(process.env.LLM_TEMPERATURE).toBe("1.2");
    expect(process.env.LLM_MAX_TOKENS).toBe("4096");
    expect(process.env.ACTSPACE_DISABLED_TOOLS).toBe("bash");

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.agent.bashAlwaysAsk).toBe(true);
    expect(persisted.version).toBe(2);
    expect(persisted.defaultModelId).toBeUndefined();
    expect(persisted.taskModels.defaultChatModel).toBe("deepseek:deepseek-v4-pro");

    const reopened = makeService(dataRoot);
    await reopened.load();
    expect(reopened.get().agent.maxTokens).toBe(4096);
    expect(reopened.get().defaultModelId).toBe("deepseek-v4-pro");
  });

  it("read/writeAgentSystemPrompt 直接读写主提示词文件", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const before = await svc.readAgentSystemPrompt();
    expect(before.path).toBe(join(dataRoot, "prompts", "main-agent.md"));
    expect(before.content).toBe(MAIN_AGENT_SYSTEM_PROMPT);

    const updated = await svc.writeAgentSystemPrompt("Use short Chinese answers.");
    expect(updated).toEqual({
      path: join(dataRoot, "prompts", "main-agent.md"),
      content: "Use short Chinese answers.",
    });
    expect(await readFile(updated.path, "utf8")).toBe("Use short Chinese answers.");
  });

  it("旧 settings.agent.systemPrompt 非空且新文件不存在时迁移到主提示词文件", async () => {
    const dataRoot = await makeDataRoot();
    await writeFile(
      join(dataRoot, "settings.json"),
      JSON.stringify({
        version: 1,
        defaultModelId: null,
        agent: {
          systemPrompt: "Legacy custom prompt.",
          temperature: null,
          maxTokens: null,
          disabledTools: [],
          bashAlwaysAsk: false,
        },
        kairos: { modelId: null, thinking: "auto" },
      }),
      "utf8",
    );

    const svc = makeService(dataRoot);
    await svc.load();

    const promptFile = await svc.readAgentSystemPrompt();
    expect(promptFile.path).toBe(join(dataRoot, "prompts", "main-agent.md"));
    expect(promptFile.content).toBe("Legacy custom prompt.");

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.agent.systemPrompt).toBeUndefined();
    expect(persisted.agent.systemPromptPath).toBe(join(dataRoot, "prompts", "main-agent.md"));
  });

  it("setProviderKey 加密落盘、标记 hasApiKey 且不回写 LLM process.env", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const res = await svc.setProviderKey("deepseek", "  sk-abc123  ");
    expect(res.ok).toBe(true);

    expect(svc.get().providers.deepseek.hasApiKey).toBe(true);
    expect(svc.get().providers.kimi.hasApiKey).toBe(false);
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(svc.getDecryptedKey("deepseek")).toBe("sk-abc123");

    const secrets = JSON.parse(await readFile(join(dataRoot, "secrets.json"), "utf8"));
    expect(typeof secrets.deepseek).toBe("string");
    expect(Buffer.from(secrets.deepseek, "base64").toString("utf8")).toBe("enc:sk-abc123");
  });

  it("OpenRouter 调用 Key 与 Management Key 分开加密存储", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    await svc.updateProviderConnection({
      provider: "openrouter",
      apiKey: "sk-or-call",
      managementKey: "sk-or-management",
    });

    expect(svc.getV2().providers.openrouter).toMatchObject({
      hasApiKey: true,
      hasManagementKey: true,
    });
    expect(svc.getProviderRuntimeConfig("openrouter")).toMatchObject({ apiKey: "sk-or-call" });
    expect(svc.getOpenRouterManagementRuntimeConfig()).toMatchObject({ apiKey: "sk-or-management" });

    const secrets = JSON.parse(await readFile(join(dataRoot, "secrets.json"), "utf8"));
    expect(Buffer.from(secrets.openrouter, "base64").toString("utf8")).toBe("enc:sk-or-call");
    expect(Buffer.from(secrets["openrouter-management"], "base64").toString("utf8")).toBe("enc:sk-or-management");

    await svc.updateProviderConnection({ provider: "openrouter", apiKey: null, managementKey: null });
    expect(svc.getV2().providers.openrouter).toMatchObject({ hasApiKey: false, hasManagementKey: false });
  });

  it("图片生成配置把 Key 加密、Base URL 与模型持久化，并提供 main-only runtime", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const view = await svc.updateImageGeneration({
      apiKey: "  test-image-key  ",
      baseUrl: "https://www.duckcoding.ai/v1/",
      model: " gpt-image-2 ",
    });

    expect(view).toEqual({
      hasApiKey: true,
      baseUrl: "https://www.duckcoding.ai/v1",
      model: "gpt-image-2",
    });
    expect(svc.getImageGenerationRuntimeConfig()).toEqual({
      apiKey: "test-image-key",
      baseUrl: "https://www.duckcoding.ai/v1",
      model: "gpt-image-2",
    });
    expect(process.env.IMAGE_GENERATION_API_KEY).toBeUndefined();

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.imageGeneration).toEqual({
      baseUrl: "https://www.duckcoding.ai/v1",
      model: "gpt-image-2",
    });
    expect(JSON.stringify(persisted)).not.toContain("test-image-key");
  });

  it("图片生成 Base URL 拒绝完整 endpoint，更新模型时可保留现有 Key", async () => {
    const svc = makeService(await makeDataRoot());
    await svc.load();
    await svc.updateImageGeneration({
      apiKey: "test-image-key",
      baseUrl: "https://www.duckcoding.ai/v1",
      model: "gpt-image-2",
    });

    await expect(svc.updateImageGeneration({
      baseUrl: "https://www.duckcoding.ai/v1/images/generations",
      model: "gpt-image-3",
    })).rejects.toThrow("不要包含 /images/generations");

    const next = await svc.updateImageGeneration({
      baseUrl: "https://example.com/v1",
      model: "gpt-image-custom",
    });
    expect(next.hasApiKey).toBe(true);
    expect(svc.getImageGenerationRuntimeConfig()?.apiKey).toBe("test-image-key");
  });

  it("DuckCoding 额外 Key 与倍率绑定、密钥只进 secrets 且被模型引用时禁止删除", async () => {
    const dataRoot = await makeDataRoot();
    const svc = new SettingsService({
      dataRoot,
      crypto: makeCrypto(),
      reloadEnv,
      createCredentialId: () => "codex-sale",
    });
    await svc.load();
    await svc.updateProviderConnection({
      provider: "duckcoding",
      apiKey: "sk-duck-default",
      defaultPricingMultiplier: 1,
    });
    await svc.addProviderCredential({
      provider: "duckcoding",
      label: "CodeX-Sale",
      apiKey: "sk-duck-sale",
      pricingMultiplier: 0.2,
    });

    expect(svc.getV2().providers.duckcoding).toMatchObject({
      hasApiKey: true,
      defaultPricingMultiplier: 1,
      additionalCredentials: [{ id: "codex-sale", label: "CodeX-Sale", pricingMultiplier: 0.2, hasApiKey: true }],
    });
    expect(svc.getProviderRuntimeConfigForCredential("duckcoding", "codex-sale")).toMatchObject({
      apiKey: "sk-duck-sale",
      pricingMultiplier: 0.2,
    });
    expect(JSON.stringify(svc.getV2())).not.toContain("sk-duck-sale");

    const secrets = JSON.parse(await readFile(join(dataRoot, "secrets.json"), "utf8"));
    expect(Buffer.from(secrets.providerCredentials["duckcoding:codex-sale"], "base64").toString("utf8")).toBe("enc:sk-duck-sale");

    await svc.updateModelStorage({
      installedModels: {
        "duckcoding:grok-4.5": { enabled: true, addedAt: "2026-07-27T00:00:00.000Z", credentialId: "codex-sale" },
      },
    });
    await expect(svc.removeProviderCredential("duckcoding", "codex-sale")).resolves.toMatchObject({
      ok: false,
      code: "credential_in_use",
      references: ["duckcoding:grok-4.5"],
    });
  });

  it("图片分析默认使用 OpenRouter Luna，并保护被引用的已有 Key", async () => {
    const dataRoot = await makeDataRoot();
    const svc = new SettingsService({
      dataRoot,
      crypto: makeCrypto(),
      reloadEnv,
      createCredentialId: () => "vision-key",
    });
    await svc.load();

    expect(svc.getV2().imageInspection).toEqual({
      modelKey: "openrouter:openai/gpt-5.6-luna",
    });

    await svc.addProviderCredential({
      provider: "openrouter",
      label: "Vision",
      apiKey: "test-openrouter-vision-key",
      pricingMultiplier: 1,
    });
    await svc.update({
      imageInspection: {
        modelKey: "openrouter:openai/gpt-5.6-luna",
        credentialId: "vision-key",
      },
    });

    expect(svc.getProviderRuntimeConfigForCredential("openrouter", "vision-key")).toMatchObject({
      apiKey: "test-openrouter-vision-key",
    });
    await expect(svc.removeProviderCredential("openrouter", "vision-key")).resolves.toMatchObject({
      ok: false,
      code: "credential_in_use",
      references: ["openrouter:openai/gpt-5.6-luna"],
    });

    const reopened = makeService(dataRoot);
    await reopened.load();
    expect(reopened.getV2().imageInspection).toEqual({
      modelKey: "openrouter:openai/gpt-5.6-luna",
      credentialId: "vision-key",
    });
    expect(JSON.stringify(reopened.getV2())).not.toContain("test-openrouter-vision-key");
  });

  it("clearProviderKey 彻底删除密钥，不再回落 .env", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-from-dotenv";
    reloadEnv();

    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    await svc.setProviderKey("deepseek", "sk-ui");
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();

    await svc.clearProviderKey("deepseek");
    expect(svc.getDecryptedKey("deepseek")).toBeUndefined();
    // 不再回落 .env 兜底：直接从 process.env 删除。
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(svc.get().providers.deepseek.hasApiKey).toBe(false);
  });

  it("密钥串不可用时拒绝保存且不写任何密文", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot, makeCrypto(false));
    await svc.load();

    const res = await svc.setProviderKey("deepseek", "sk-abc");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(svc.getDecryptedKey("deepseek")).toBeUndefined();
    expect(svc.get().providers.deepseek.hasApiKey).toBe(false);

    await expect(readFile(join(dataRoot, "secrets.json"), "utf8")).rejects.toBeTruthy();
  });

  it(".env 里的裸 Key 不再视为已连接：load 后 hasApiKey=false 且 process.env 被清除", async () => {
    process.env.KIMI_API_KEY = "sk-kimi-env";
    reloadEnv();

    const svc = makeService(await makeDataRoot());
    await svc.load();

    expect(svc.get().providers.kimi.hasApiKey).toBe(false);
    // 无 UI 密钥 → applyToEnv 删除该键（生产环境 loadEnv 可能从 .env 文件回填，故强调"移除 .env"）。
    expect(process.env.KIMI_API_KEY).toBeUndefined();
  });

  it("Kairos 模型与思考链持久化到 settings.json，不写 KAIROS env", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const updated = await svc.update({ kairos: { modelId: "deepseek-v4-pro", thinking: "off" } });
    expect(updated.kairos.modelId).toBe("deepseek-v4-pro");
    expect(updated.kairos.thinking).toBe("off");
    expect(process.env.KAIROS_THINKING).toBeUndefined();
    expect(process.env.KAIROS_MODEL_ID).toBeUndefined();

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.kairos).toEqual({ modelId: "deepseek:deepseek-v4-pro", thinking: "off", enabledSkills: [] });

    const reset = await svc.update({ kairos: { modelId: null, thinking: "auto" } });
    expect(reset.kairos).toEqual({ modelId: null, thinking: "auto", enabledSkills: [] });
    expect(process.env.KAIROS_THINKING).toBeUndefined();
  });

  it("非法 defaultModelId / kairos.modelId 被收敛为 null；kairos.thinking 仍生效", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const updated = await svc.update({
      defaultModelId: "not-a-model" as never,
      kairos: { modelId: "not-a-kairos-model" as never, thinking: "on" },
    });
    expect(updated.defaultModelId).toBeNull();
    expect(updated.kairos.modelId).toBeNull();
    expect(updated.kairos.thinking).toBe("on");
  });

  it("plugins / skills / kairos.enabledSkills 默认播种并持久化 round-trip", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    // 默认播种：全部关闭 / 空列表
    expect(svc.get().plugins).toEqual({ repoRoot: null, fsWatch: { enabled: false } });
    expect(svc.get().skills).toEqual({ disabled: [] });
    expect(svc.get().kairos.enabledSkills).toEqual([]);

    await svc.update({
      plugins: { repoRoot: "  /Users/me/actspace-plugins  ", fsWatch: { enabled: true } },
      skills: { disabled: ["foo", "foo", " ", "bar"] },
      kairos: { enabledSkills: ["fs-watch", "fs-watch"] },
    });

    // 重新加载实例读回：去重、剔除空白项、路径 trim
    const reloaded = makeService(dataRoot);
    await reloaded.load();
    expect(reloaded.get().plugins.fsWatch.enabled).toBe(true);
    expect(reloaded.get().plugins.repoRoot).toBe("/Users/me/actspace-plugins");
    expect(reloaded.get().skills.disabled).toEqual(["foo", "bar"]);
    expect(reloaded.get().kairos.enabledSkills).toEqual(["fs-watch"]);

    // 只更新 fsWatch 不应清掉 repoRoot；显式传空串则重置为 null
    await reloaded.update({ plugins: { fsWatch: { enabled: false } } });
    expect(reloaded.get().plugins.repoRoot).toBe("/Users/me/actspace-plugins");
    await reloaded.update({ plugins: { repoRoot: "" } });
    expect(reloaded.get().plugins.repoRoot).toBeNull();
  });

  it("老 settings.json 缺 plugins/skills 分区时回默认并补写", async () => {
    const dataRoot = await makeDataRoot();
    await writeFile(
      join(dataRoot, "settings.json"),
      JSON.stringify({
        version: 1,
        defaultModelId: null,
        agent: { systemPromptPath: join(dataRoot, "prompts", "main-agent.md") },
        kairos: { modelId: null, thinking: "auto" },
      }),
      "utf8",
    );

    const svc = makeService(dataRoot);
    await svc.load();
    expect(svc.get().plugins).toEqual({ repoRoot: null, fsWatch: { enabled: false } });
    expect(svc.get().skills).toEqual({ disabled: [] });
    expect(svc.get().kairos.enabledSkills).toEqual([]);

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.plugins).toEqual({ repoRoot: null, fsWatch: { enabled: false } });
    expect(persisted.skills).toEqual({ disabled: [] });
  });

  it("干净安装直接生成完整 settings v2 与四家 provider", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const view = svc.getV2();
    expect(view.version).toBe(2);
    expect(Object.keys(view.providers)).toEqual(["deepseek", "kimi", "openrouter", "duckcoding"]);
    expect(view.providers.openrouter).toMatchObject({
      hasApiKey: false,
      enabled: true,
      baseUrl: null,
      proxy: { enabled: false, url: null },
      lastConnection: { status: "untested" },
    });
    expect(view.providers.duckcoding).toMatchObject({
      hasApiKey: false,
      defaultPricingMultiplier: 1,
      additionalCredentials: [],
    });
    expect(Object.keys(view.installedModels)).toHaveLength(4);

    const persisted = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(persisted.version).toBe(2);
    expect(persisted.defaultModelId).toBeUndefined();
    expect(persisted.agent.exploreModelId).toBeUndefined();
  });

  it("loads the retired official DeepSeek Anthropic URL as the OpenAI-compatible default", async () => {
    const dataRoot = await makeDataRoot();
    const first = makeService(dataRoot);
    await first.load();

    const filePath = join(dataRoot, "settings.json");
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    persisted.providers.deepseek.baseUrl = "https://api.deepseek.com/anthropic";
    await writeFile(filePath, JSON.stringify(persisted), "utf8");

    const migrated = makeService(dataRoot);
    await migrated.load();
    expect(migrated.getV2().providers.deepseek.baseUrl).toBeNull();
    expect(PROVIDER_REGISTRY.deepseek.defaultBaseUrl).toBe("https://api.deepseek.com");
  });

  it("v1 迁移无损、生成一次性备份且重复加载 addedAt 稳定", async () => {
    const dataRoot = await makeDataRoot();
    const v1 = {
      version: 1,
      defaultModelId: "deepseek-v4-pro",
      agent: {
        systemPromptPath: join(dataRoot, "prompts", "main-agent.md"),
        temperature: 0.6,
        maxTokens: 4096,
        disabledTools: ["bash"],
        bashAlwaysAsk: true,
        exploreModelId: "kimi-k2.6",
      },
      kairos: { modelId: "kimi-k2.7-code", thinking: "on", enabledSkills: ["fs-watch"] },
      plugins: { repoRoot: "/tmp/plugins", fsWatch: { enabled: true } },
      skills: { disabled: ["demo"] },
    };
    const rawV1 = JSON.stringify(v1, null, 2);
    await writeFile(join(dataRoot, "settings.json"), rawV1, "utf8");
    await writeFile(join(dataRoot, "secrets.json"), JSON.stringify({
      version: 1,
      deepseek: Buffer.from("enc:sk-ds", "utf8").toString("base64"),
    }), "utf8");

    const first = makeService(dataRoot);
    await first.load();
    const migrated = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    const firstAddedAt = migrated.installedModels["deepseek:deepseek-v4-pro"].addedAt;

    expect(migrated.version).toBe(2);
    expect(migrated.taskModels).toEqual({
      defaultChatModel: "deepseek:deepseek-v4-pro",
      utilityModel: "deepseek:deepseek-v4-flash",
      exploreModel: "kimi:kimi-k2.6",
    });
    expect(migrated.kairos.modelId).toBe("kimi:kimi-k2.7-code");
    expect(migrated.agent.exploreModelId).toBeUndefined();
    expect(migrated.plugins).toEqual(v1.plugins);
    expect(migrated.skills).toEqual(v1.skills);
    expect(await readFile(join(dataRoot, "settings.v1.backup.json"), "utf8")).toBe(rawV1);

    const second = makeService(dataRoot);
    await second.load();
    const reloaded = JSON.parse(await readFile(join(dataRoot, "settings.json"), "utf8"));
    expect(reloaded.installedModels["deepseek:deepseek-v4-pro"].addedAt).toBe(firstAddedAt);
    expect(await readFile(join(dataRoot, "settings.v1.backup.json"), "utf8")).toBe(rawV1);
  });

  it.each([
    ["坏 JSON", "{broken"],
    ["未知版本", JSON.stringify({ version: 99, marker: "keep" })],
    ["不完整 v2", JSON.stringify({ version: 2, agent: { bashAlwaysAsk: true } })],
  ])("%s 使用安全默认内存配置且不覆盖原文件", async (_label, raw) => {
    const dataRoot = await makeDataRoot();
    await writeFile(join(dataRoot, "settings.json"), raw, "utf8");
    const svc = makeService(dataRoot);
    await svc.load();

    expect(svc.get().version).toBe(2);
    expect(svc.getLastLoadError()).toBeTruthy();
    expect(await readFile(join(dataRoot, "settings.json"), "utf8")).toBe(raw);
  });

  it("忽略原子写遗留的半截临时文件并继续读取完整 settings.json", async () => {
    const dataRoot = await makeDataRoot();
    const first = makeService(dataRoot);
    await first.load();
    await first.updateV2({ taskModels: { utilityModel: "deepseek:deepseek-v4-flash" } });
    const stableRaw = await readFile(join(dataRoot, "settings.json"), "utf8");
    await writeFile(join(dataRoot, "settings.json.tmp"), "{\"version\":2,\"providers\":", "utf8");

    const second = makeService(dataRoot);
    await second.load();

    expect(second.getLastLoadError()).toBeUndefined();
    expect(second.getV2().taskModels.utilityModel).toBe("deepseek:deepseek-v4-flash");
    expect(await readFile(join(dataRoot, "settings.json"), "utf8")).toBe(stableRaw);
  });

  it("OpenRouter key 只加密落 secrets，runtime 可解密且 renderer view 不含明文", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    await svc.updateProviderConnection({
      provider: "openrouter",
      apiKey: "test-openrouter-key",
      baseUrl: "https://openrouter.ai/api/v1/",
      proxy: { enabled: true, url: "http://127.0.0.1:7890" },
    });

    const view = svc.getV2();
    expect(view.providers.openrouter.hasApiKey).toBe(true);
    expect(view.providers.openrouter.proxy?.url).toBe("http://127.0.0.1:••••");
    expect(JSON.stringify(view)).not.toContain("test-openrouter-key");
    const runtime = svc.getProviderRuntimeConfig("openrouter");
    expect("code" in runtime).toBe(false);
    if (!("code" in runtime)) {
      expect(runtime.apiKey).toBe("test-openrouter-key");
      expect(runtime.transport?.proxyUrl).toBe("http://127.0.0.1:7890/");
    }

    const settingsRaw = await readFile(join(dataRoot, "settings.json"), "utf8");
    const secretsRaw = await readFile(join(dataRoot, "secrets.json"), "utf8");
    expect(settingsRaw).not.toContain("test-openrouter-key");
    expect(secretsRaw).not.toContain("test-openrouter-key");
    expect(Buffer.from(JSON.parse(secretsRaw).openrouter, "base64").toString("utf8")).toBe("enc:test-openrouter-key");
  });

  it("修改连接参数会重置状态，断开 key 不删除模型", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();
    await svc.updateProviderConnection({ provider: "openrouter", apiKey: "sk-or" });
    await svc.markProviderConnectionResult("openrouter", {
      ok: true,
      message: "连接成功。",
      checkedAt: "2026-07-24T10:00:00.000Z",
    });
    expect(svc.getV2().providers.openrouter.lastConnection?.status).toBe("available");

    const beforeModels = svc.getV2().installedModels;
    await svc.updateProviderConnection({ provider: "openrouter", baseUrl: "https://example.com/v1" });
    expect(svc.getV2().providers.openrouter.lastConnection?.status).toBe("untested");
    await svc.updateProviderConnection({ provider: "openrouter", apiKey: null });
    expect(svc.getV2().providers.openrouter.hasApiKey).toBe(false);
    expect(svc.getV2().installedModels).toEqual(beforeModels);
  });

  it("provider 更新串行化，最终状态按调用顺序确定", async () => {
    const svc = makeService(await makeDataRoot());
    await svc.load();
    const first = svc.updateProviderConnection({ provider: "openrouter", baseUrl: "https://first.example/v1" });
    const second = svc.updateProviderConnection({ provider: "openrouter", baseUrl: "https://second.example/v1" });
    await Promise.all([first, second]);
    expect(svc.getV2().providers.openrouter.baseUrl).toBe("https://second.example/v1");
  });

  it("写入失败时回滚内存且不返回成功状态", async () => {
    const dataRoot = await makeDataRoot();
    let failWrites = false;
    const svc = new SettingsService({
      dataRoot,
      crypto: makeCrypto(),
      reloadEnv,
      writeJson: async (filePath, value) => {
        if (failWrites) throw new Error("disk full");
        await atomicJsonWriter(filePath, value);
      },
    });
    await svc.load();
    const before = svc.getV2().providers.openrouter;
    failWrites = true;

    await expect(svc.updateProviderConnection({
      provider: "openrouter",
      baseUrl: "https://should-not-stick.example/v1",
    })).rejects.toThrow("写入失败");
    expect(svc.getV2().providers.openrouter).toEqual(before);
  });
});
