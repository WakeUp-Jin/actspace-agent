import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv, MAIN_AGENT_SYSTEM_PROMPT } from "@actspace/agent-core";
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
    expect(persisted.defaultModelId).toBe("deepseek-v4-pro");

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

  it("setProviderKey 加密落盘、标记 hasApiKey 并覆盖到 process.env", async () => {
    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    const res = await svc.setProviderKey("deepseek", "  sk-abc123  ");
    expect(res.ok).toBe(true);

    expect(svc.get().providers.deepseek.hasApiKey).toBe(true);
    expect(svc.get().providers.kimi.hasApiKey).toBe(false);
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-abc123");
    expect(svc.getDecryptedKey("deepseek")).toBe("sk-abc123");

    const secrets = JSON.parse(await readFile(join(dataRoot, "secrets.json"), "utf8"));
    expect(typeof secrets.deepseek).toBe("string");
    expect(Buffer.from(secrets.deepseek, "base64").toString("utf8")).toBe("enc:sk-abc123");
  });

  it("clearProviderKey 彻底删除密钥，不再回落 .env", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-from-dotenv";
    reloadEnv();

    const dataRoot = await makeDataRoot();
    const svc = makeService(dataRoot);
    await svc.load();

    await svc.setProviderKey("deepseek", "sk-ui");
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-ui");

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
    expect(persisted.kairos).toEqual({ modelId: "deepseek-v4-pro", thinking: "off", enabledSkills: [] });

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
});
