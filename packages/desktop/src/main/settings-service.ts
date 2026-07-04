/**
 * SettingsService —— 运行时应用设置的读写、加密与生效。
 *
 * 职责：
 * 1. 持久化：非敏感项落 `<dataRoot>/settings.json`，供应商 API Key 经
 *    `SecretCrypto`（生产环境是 Electron safeStorage）加密后落 `<dataRoot>/secrets.json`。
 * 2. 生效：把设置覆盖到 `process.env` 后调用注入的 `reloadEnv()`（默认 agent-core 的
 *    `loadEnv`）刷新冻结的 `env`，使大部分 env-backed 配置"下一轮对话自动生效"。
 * 3. 派生视图：`get()` 返回的 `providers[id].hasApiKey` 只反映"safeStorage 里是否有
 *    用户在页面保存的密钥"，renderer 永远拿不到明文。
 *
 * API Key 来源（重要）：
 * - 唯一来源是用户在页面输入、加密落 secrets.json 的密钥；**不再把 .env 里的 Key
 *   当作已连接**。applyToEnv 用 UI 密钥覆盖 process.env，无 UI 密钥则删除该键。
 * - 仍想让 .env 里的 Key 生效的话需自行保留；但 UI 的"已连接/断开"只认 secrets.json。
 *
 * 设计原则：
 * - 本文件不 import "electron"，safeStorage 通过 `SecretCrypto` 注入，保证可单测。
 * - 首次运行（无 settings.json）从当前 env 播种 agent/kairos 默认值（不含 Key）。
 * - 任何读盘失败都回落默认/空，不向调用方抛错（与 Kairos 配置加载策略一致）。
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { getEnv, loadEnv, MAIN_AGENT_SYSTEM_PROMPT } from "@actspace/agent-core";
import {
  MODEL_REGISTRY,
  SETTINGS_PROVIDER_IDS,
  isPublicModelId,
  type AgentSystemPromptFile,
  type AppSettings,
  type KairosModelId,
  type KairosThinkingMode,
  type ModelId,
  type ProviderId,
  type SettingsUpdateInput,
} from "@actspace/shared";

const LLM_TEMPERATURE_DEFAULT = 0;
const LLM_MAX_TOKENS_DEFAULT = 8192;
const AGENT_SYSTEM_PROMPT_MAX_CHARS = 20_000;
const PROMPTS_DIR = "prompts";
const MAIN_AGENT_PROMPT_FILE = "main-agent.md";

/** 供应商 API Key 的加解密接口；生产用 Electron safeStorage 实现，测试可注入假实现。 */
export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

export interface SettingsServiceOptions {
  /** 数据根目录（生产 = app.getPath("userData")）。 */
  dataRoot: string;
  crypto: SecretCrypto;
  /** 覆盖 process.env 后用于刷新冻结 env 的钩子，默认 agent-core 的 loadEnv。 */
  reloadEnv?: () => void;
}

/** settings.json 落盘形态（非敏感项）。 */
interface PersistedSettings {
  version: 1;
  defaultModelId: ModelId | null;
  agent: AppSettings["agent"];
  kairos: AppSettings["kairos"];
  plugins: AppSettings["plugins"];
  skills: AppSettings["skills"];
}

interface ReadSettingsResult {
  settings: PersistedSettings;
  legacySystemPrompt?: string;
  needsWrite: boolean;
}

/** secrets.json 落盘形态：每个供应商一段 base64 密文。 */
interface PersistedSecrets {
  version: 1;
  deepseek?: string;
  kimi?: string;
}

const SETTINGS_FILE = "settings.json";
const SECRETS_FILE = "secrets.json";

function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODEL_REGISTRY;
}

function isKairosModelId(value: unknown): value is KairosModelId {
  return value === "deepseek-v4-pro" || value === "kimi-k2.6" || value === "kimi-k2.7-code";
}

export class SettingsService {
  private readonly dataRoot: string;
  private readonly crypto: SecretCrypto;
  private readonly reloadEnv: () => void;

  private settings: PersistedSettings;
  /** 内存中的 base64 密文，按需解密；不长期持有明文。 */
  private secrets: PersistedSecrets;
  private loaded = false;

  constructor(options: SettingsServiceOptions) {
    this.dataRoot = options.dataRoot;
    this.crypto = options.crypto;
    this.reloadEnv = options.reloadEnv ?? (() => loadEnv());
    this.settings = defaultSettingsFromEnv(this.dataRoot);
    this.secrets = { version: 1 };
  }

  /** 启动时调用一次：读盘 → 合并默认 → 覆盖 process.env → 刷新 env。 */
  async load(): Promise<void> {
    const loadedSettings = await this.readSettingsFile();
    this.settings = loadedSettings.settings;
    await this.ensureAgentSystemPromptFile(loadedSettings.legacySystemPrompt);
    if (loadedSettings.needsWrite) {
      await this.writeSettingsFile();
    }
    this.secrets = await this.readSecretsFile();
    this.loaded = true;
    this.applyToEnv();
  }

  /**
   * 返回 renderer 视图，不含明文。
   * `hasApiKey` 只反映 safeStorage 里是否有用户在页面保存的密钥。
   */
  get(): AppSettings {
    return {
      version: 1,
      defaultModelId: isPublicModelId(this.settings.defaultModelId) ? this.settings.defaultModelId : null,
      providers: {
        deepseek: { hasApiKey: Boolean(this.getDecryptedKey("deepseek")) },
        kimi: { hasApiKey: Boolean(this.getDecryptedKey("kimi")) },
      },
      agent: { ...this.settings.agent, disabledTools: [...this.settings.agent.disabledTools] },
      kairos: { ...this.settings.kairos, enabledSkills: [...this.settings.kairos.enabledSkills] },
      plugins: { repoRoot: this.settings.plugins.repoRoot, fsWatch: { ...this.settings.plugins.fsWatch } },
      skills: { disabled: [...this.settings.skills.disabled] },
    };
  }

  async update(input: SettingsUpdateInput): Promise<AppSettings> {
    if (input.defaultModelId !== undefined) {
      this.settings.defaultModelId = isPublicModelId(input.defaultModelId) ? input.defaultModelId : null;
    }
    if (input.agent) {
      this.settings.agent = sanitizeAgent({ ...this.settings.agent, ...input.agent }, this.settings.agent);
      await this.ensureAgentSystemPromptFile();
    }
    if (input.kairos) {
      this.settings.kairos = sanitizeKairos({ ...this.settings.kairos, ...input.kairos });
    }
    if (input.plugins) {
      this.settings.plugins = sanitizePlugins({
        repoRoot: input.plugins.repoRoot !== undefined ? input.plugins.repoRoot : this.settings.plugins.repoRoot,
        fsWatch: { ...this.settings.plugins.fsWatch, ...input.plugins.fsWatch },
      });
    }
    if (input.skills) {
      this.settings.skills = sanitizeSkills({ ...this.settings.skills, ...input.skills });
    }
    await this.writeSettingsFile();
    this.applyToEnv();
    return this.get();
  }

  async readAgentSystemPrompt(): Promise<AgentSystemPromptFile> {
    await this.ensureAgentSystemPromptFile();
    return {
      path: this.settings.agent.systemPromptPath,
      content: await readFile(this.settings.agent.systemPromptPath, "utf8"),
    };
  }

  async writeAgentSystemPrompt(content: string): Promise<AgentSystemPromptFile> {
    await this.ensureAgentSystemPromptFile();
    const nextContent = content.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS);
    await writeTextAtomic(this.settings.agent.systemPromptPath, nextContent);
    return { path: this.settings.agent.systemPromptPath, content: nextContent };
  }

  async setProviderKey(provider: ProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return { ok: false, error: "API Key 不能为空。" };
    }
    if (!this.crypto.isAvailable()) {
      return { ok: false, error: "系统密钥串不可用，无法安全保存 API Key。" };
    }
    const cipher = this.crypto.encrypt(trimmed);
    this.secrets[provider] = cipher.toString("base64");
    await this.writeSecretsFile();
    this.applyToEnv();
    return { ok: true };
  }

  async clearProviderKey(provider: ProviderId): Promise<{ ok: boolean }> {
    delete this.secrets[provider];
    await this.writeSecretsFile();
    this.applyToEnv();
    return { ok: true };
  }

  /** 解密某供应商的明文 Key（仅 main 内部使用，例如测试连接）。无密钥或解密失败返回 undefined。 */
  getDecryptedKey(provider: ProviderId): string | undefined {
    const base64 = this.secrets[provider];
    if (!base64) return undefined;
    try {
      return this.crypto.decrypt(Buffer.from(base64, "base64"));
    } catch {
      return undefined;
    }
  }

  // ─── 内部 ───

  /** 有 UI 密钥则覆盖 process.env；否则删除该键（不再回落 .env / 外部 env）。 */
  private applyProviderKey(provider: ProviderId, envKey: string): void {
    setOrDeleteEnv(envKey, this.getDecryptedKey(provider));
  }

  /**
   * 把当前设置覆盖到 process.env 后刷新 env。
   *
   * 规则：
   * - 供应商 Key：有 UI 密钥则写 process.env；无则 delete。Key 的唯一来源是页面，
   *   不再把 .env 里的 Key 当作已连接（若 .env 文件仍保留该键，loadEnv 仍可能回填，
   *   要彻底断开请从 .env 中移除）。
   * - 其余 env-backed 项：settings 始终覆盖（首次运行已从 env 播种，故不会误改）。
   * - 可为空的项（温度/maxTokens）为 null 时 delete，回落 .env/默认。
   * - Kairos 模型 / 思考链不在 env：其唯一来源是 settings.json 的 kairos 分区。
   */
  private applyToEnv(): void {
    this.applyProviderKey("deepseek", "DEEPSEEK_API_KEY");
    this.applyProviderKey("kimi", "KIMI_API_KEY");

    process.env.ACTSPACE_DISABLED_TOOLS = this.settings.agent.disabledTools.join(",");
    process.env.ACTSPACE_BASH_ALWAYS_ASK = this.settings.agent.bashAlwaysAsk ? "1" : "0";

    setOrDeleteEnv(
      "LLM_TEMPERATURE",
      this.settings.agent.temperature === null ? undefined : String(this.settings.agent.temperature),
    );
    setOrDeleteEnv(
      "LLM_MAX_TOKENS",
      this.settings.agent.maxTokens === null ? undefined : String(this.settings.agent.maxTokens),
    );

    this.reloadEnv();
  }

  private async readSettingsFile(): Promise<ReadSettingsResult> {
    try {
      const raw = await readFile(join(this.dataRoot, SETTINGS_FILE), "utf8");
      return mergePersistedSettings(JSON.parse(raw) as unknown, this.dataRoot);
    } catch {
      // 缺文件 / 坏 JSON：从当前 env 播种默认，保证不覆盖用户 .env。
      return { settings: defaultSettingsFromEnv(this.dataRoot), needsWrite: true };
    }
  }

  private async readSecretsFile(): Promise<PersistedSecrets> {
    try {
      const raw = await readFile(join(this.dataRoot, SECRETS_FILE), "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedSecrets>;
      const out: PersistedSecrets = { version: 1 };
      for (const id of SETTINGS_PROVIDER_IDS) {
        const value = parsed[id];
        if (typeof value === "string" && value.length > 0) out[id] = value;
      }
      return out;
    } catch {
      return { version: 1 };
    }
  }

  private async writeSettingsFile(): Promise<void> {
    await writeJsonAtomic(join(this.dataRoot, SETTINGS_FILE), this.settings);
  }

  private async writeSecretsFile(): Promise<void> {
    await writeJsonAtomic(join(this.dataRoot, SECRETS_FILE), this.secrets);
  }

  private async ensureAgentSystemPromptFile(legacySystemPrompt?: string): Promise<void> {
    const filePath = this.settings.agent.systemPromptPath;
    try {
      await readFile(filePath, "utf8");
      return;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    const initialContent =
      legacySystemPrompt && legacySystemPrompt.trim().length > 0
        ? legacySystemPrompt.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS)
        : MAIN_AGENT_SYSTEM_PROMPT;
    await writeTextAtomic(filePath, initialContent);
  }
}

function defaultSettingsFromEnv(dataRoot: string): PersistedSettings {
  const env = getEnv();
  return {
    version: 1,
    defaultModelId: null,
    agent: {
      systemPromptPath: defaultSystemPromptPath(dataRoot),
      temperature: env.LLM_TEMPERATURE !== LLM_TEMPERATURE_DEFAULT ? env.LLM_TEMPERATURE : null,
      maxTokens: env.LLM_MAX_TOKENS !== LLM_MAX_TOKENS_DEFAULT ? env.LLM_MAX_TOKENS : null,
      disabledTools: [...env.ACTSPACE_DISABLED_TOOLS],
      bashAlwaysAsk: env.ACTSPACE_BASH_ALWAYS_ASK,
      exploreModelId: null,
    },
    kairos: {
      modelId: null,
      thinking: "auto",
      enabledSkills: [],
    },
    plugins: { repoRoot: null, fsWatch: { enabled: false } },
    skills: { disabled: [] },
  };
}

function mergePersistedSettings(raw: unknown, dataRoot: string): ReadSettingsResult {
  const seed = defaultSettingsFromEnv(dataRoot);
  if (typeof raw !== "object" || raw === null) return { settings: seed, needsWrite: true };
  const obj = raw as Record<string, unknown>;
  const agent = (obj.agent ?? {}) as Record<string, unknown>;
  const kairos = (obj.kairos ?? {}) as Record<string, unknown>;
  const plugins = (obj.plugins ?? {}) as Record<string, unknown>;
  const skills = (obj.skills ?? {}) as Record<string, unknown>;
  const legacySystemPrompt = typeof agent.systemPrompt === "string" ? agent.systemPrompt : undefined;
  const needsWrite =
    typeof agent.systemPromptPath !== "string" ||
    typeof agent.systemPrompt === "string" ||
    obj.plugins === undefined ||
    obj.skills === undefined ||
    obj.version !== 1;
  return {
    needsWrite,
    legacySystemPrompt,
    settings: {
      version: 1,
      defaultModelId: isModelId(obj.defaultModelId) ? obj.defaultModelId : null,
      agent: sanitizeAgent({
        systemPromptPath: agent.systemPromptPath as string | undefined,
        temperature: agent.temperature as number | null | undefined,
        maxTokens: agent.maxTokens as number | null | undefined,
        disabledTools: agent.disabledTools as string[] | undefined,
        bashAlwaysAsk: agent.bashAlwaysAsk as boolean | undefined,
        exploreModelId: agent.exploreModelId as ModelId | null | undefined,
      }, seed.agent),
      kairos: sanitizeKairos({
        modelId: kairos.modelId as KairosModelId | null | undefined,
        thinking: kairos.thinking as KairosThinkingMode | undefined,
        enabledSkills: kairos.enabledSkills as string[] | undefined,
      }, seed.kairos),
      plugins: sanitizePlugins(plugins as Partial<AppSettings["plugins"]>),
      skills: sanitizeSkills(skills as Partial<AppSettings["skills"]>),
    },
  };
}

function sanitizeAgent(
  input: Partial<AppSettings["agent"]>,
  fallback: AppSettings["agent"],
): AppSettings["agent"] {
  const temperature = input.temperature;
  const maxTokens = input.maxTokens;
  return {
    systemPromptPath: sanitizeSystemPromptPath(input.systemPromptPath, fallback.systemPromptPath),
    temperature:
      typeof temperature === "number" && Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
        ? temperature
        : temperature === null
          ? null
          : fallback.temperature,
    maxTokens:
      typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens >= 1
        ? Math.floor(maxTokens)
        : maxTokens === null
          ? null
          : fallback.maxTokens,
    disabledTools: Array.isArray(input.disabledTools)
      ? input.disabledTools.filter((item): item is string => typeof item === "string")
      : fallback.disabledTools,
    bashAlwaysAsk: typeof input.bashAlwaysAsk === "boolean" ? input.bashAlwaysAsk : fallback.bashAlwaysAsk,
    exploreModelId:
      input.exploreModelId === null
        ? null
        : isModelId(input.exploreModelId)
          ? input.exploreModelId
          : fallback.exploreModelId,
  };
}

function sanitizeKairos(
  input: Partial<AppSettings["kairos"]>,
  fallback: AppSettings["kairos"] = defaultKairos(),
): AppSettings["kairos"] {
  const thinking = input.thinking;
  return {
    modelId: isKairosModelId(input.modelId) ? input.modelId : input.modelId === null ? null : fallback.modelId,
    thinking:
      thinking === "auto" || thinking === "on" || thinking === "off" ? thinking : fallback.thinking,
    enabledSkills: sanitizeSkillNameList(input.enabledSkills, fallback.enabledSkills),
  };
}

function defaultKairos(): AppSettings["kairos"] {
  return { modelId: null, thinking: "auto", enabledSkills: [] };
}

function sanitizePlugins(input: Partial<AppSettings["plugins"]>): AppSettings["plugins"] {
  const fsWatch = (input.fsWatch ?? {}) as Partial<AppSettings["plugins"]["fsWatch"]>;
  const repoRoot = typeof input.repoRoot === "string" && input.repoRoot.trim().length > 0
    ? input.repoRoot.trim()
    : null;
  return {
    repoRoot,
    fsWatch: { enabled: typeof fsWatch.enabled === "boolean" ? fsWatch.enabled : false },
  };
}

function sanitizeSkills(input: Partial<AppSettings["skills"]>): AppSettings["skills"] {
  return { disabled: sanitizeSkillNameList(input.disabled, []) };
}

/** 过滤为去重后的非空字符串数组；非法输入回落 fallback。 */
function sanitizeSkillNameList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const names = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return [...new Set(names)];
}

function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}

async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, filePath);
}

function defaultSystemPromptPath(dataRoot: string): string {
  return join(dataRoot, PROMPTS_DIR, MAIN_AGENT_PROMPT_FILE);
}

function sanitizeSystemPromptPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return isAbsolute(trimmed) ? trimmed : join(dirname(fallback), trimmed);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}
