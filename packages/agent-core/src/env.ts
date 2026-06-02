/**
 * 集中式环境变量管理
 *
 * 职责：
 * 1. 从 .env 文件加载变量（合并到 process.env，不覆盖已有值）
 * 2. 按 schema 验证并导出类型安全的 env 对象
 * 3. 区分 required / optional，缺失 required 时抛出清晰错误
 *
 * 使用方式：
 *   import { env, loadEnv } from "./env";
 *
 *   // 启动时显式加载（可指定 .env 文件路径）
 *   loadEnv({ envPath: "/path/to/.env" });
 *
 *   // 之后任意位置直接读取
 *   env.DEEPSEEK_API_KEY
 *   env.LLM_PROVIDER
 *
 * 设计决策：
 * - 不引入 dotenv 等第三方依赖，自带轻量解析器
 * - process.env 中已有的值优先级高于 .env 文件（方便 CI / Docker 覆盖）
 * - env 对象在 loadEnv() 之后冻结，运行时不可篡改
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── 类型定义 ───

export interface AppEnv {
  /** 运行环境 */
  NODE_ENV: "development" | "production" | "test";

  /** LLM provider: "deepseek" | "kimi" */
  LLM_PROVIDER: "deepseek" | "kimi" | "mock" | "deepseek-mock";
  /** LLM 默认模型 */
  LLM_MODEL: string;
  /** LLM 默认温度 */
  LLM_TEMPERATURE: number;
  /** LLM 最大输出 token */
  LLM_MAX_TOKENS: number;

  /** DeepSeek API Key */
  DEEPSEEK_API_KEY: string;
  /** DeepSeek API protocol format */
  DEEPSEEK_API_FORMAT: "openai" | "anthropic";
  /** DeepSeek Base URL（自部署时使用） */
  DEEPSEEK_BASE_URL: string;
  /** DeepSeek Anthropic-compatible Base URL */
  DEEPSEEK_ANTHROPIC_BASE_URL: string;

  /** Kimi API Key */
  KIMI_API_KEY: string;
  /** Kimi Base URL */
  KIMI_BASE_URL: string;
  /** Kimi 默认模型 */
  KIMI_MODEL: string;

  /** 日志级别 */
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  /** 是否在 mock 模式下运行（快捷开关） */
  MOCK_MODE: boolean;
  /** 逗号分隔的禁用工具名列表 */
  ACTSPACE_DISABLED_TOOLS: string[];
  /** 调试开关：所有 bash 命令都进入审核（仅绕过 allowlist，硬拒绝仍生效） */
  ACTSPACE_BASH_ALWAYS_ASK: boolean;

}

type EnvField<T> = {
  envKey: string;
  required: boolean;
  default?: T;
  parse: (raw: string) => T;
  validate?: (value: T) => string | undefined;
};

// ─── Schema 定义 ───

const str = (raw: string) => raw;
const num = (raw: string) => {
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Expected a number, got "${raw}"`);
  return n;
};
const bool = (raw: string) => raw === "true" || raw === "1" || raw === "yes";
const csv = (raw: string) =>
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const ENV_SCHEMA: { [K in keyof AppEnv]: EnvField<AppEnv[K]> } = {
  NODE_ENV: {
    envKey: "NODE_ENV",
    required: false,
    default: "development" as const,
    parse: (raw) => {
      const valid = ["development", "production", "test"] as const;
      const v = raw.toLowerCase();
      return (valid as readonly string[]).includes(v)
        ? (v as AppEnv["NODE_ENV"])
        : "development";
    },
  },

  LLM_PROVIDER: {
    envKey: "LLM_PROVIDER",
    required: false,
    default: "deepseek",
    parse: (raw) => {
      const valid = ["deepseek", "kimi", "mock", "deepseek-mock"] as const;
      const v = raw.toLowerCase();
      return (valid as readonly string[]).includes(v)
        ? (v as AppEnv["LLM_PROVIDER"])
        : "deepseek";
    },
  },
  LLM_MODEL: {
    envKey: "LLM_MODEL",
    required: false,
    default: "deepseek-chat",
    parse: str,
  },
  LLM_TEMPERATURE: {
    envKey: "LLM_TEMPERATURE",
    required: false,
    default: 0,
    parse: num,
    validate: (v) => (v < 0 || v > 2 ? "LLM_TEMPERATURE must be between 0 and 2" : undefined),
  },
  LLM_MAX_TOKENS: {
    envKey: "LLM_MAX_TOKENS",
    required: false,
    default: 8192,
    parse: num,
    validate: (v) => (v < 1 ? "LLM_MAX_TOKENS must be positive" : undefined),
  },

  DEEPSEEK_API_KEY: {
    envKey: "DEEPSEEK_API_KEY",
    required: false,
    default: "",
    parse: str,
  },
  DEEPSEEK_API_FORMAT: {
    envKey: "DEEPSEEK_API_FORMAT",
    required: false,
    default: "anthropic" as const,
    parse: (raw): AppEnv["DEEPSEEK_API_FORMAT"] => {
      const v = raw.trim().toLowerCase();
      return v === "anthropic" ? "anthropic" : "openai";
    },
  },
  DEEPSEEK_BASE_URL: {
    envKey: "DEEPSEEK_BASE_URL",
    required: false,
    default: "https://api.deepseek.com",
    parse: str,
  },
  DEEPSEEK_ANTHROPIC_BASE_URL: {
    envKey: "DEEPSEEK_ANTHROPIC_BASE_URL",
    required: false,
    default: "https://api.deepseek.com/anthropic",
    parse: str,
  },

  KIMI_API_KEY: {
    envKey: "KIMI_API_KEY",
    required: false,
    default: "",
    parse: str,
  },
  KIMI_BASE_URL: {
    envKey: "KIMI_BASE_URL",
    required: false,
    default: "https://api.moonshot.ai/v1",
    parse: str,
  },
  KIMI_MODEL: {
    envKey: "KIMI_MODEL",
    required: false,
    default: "kimi-k2.6",
    parse: str,
  },

  LOG_LEVEL: {
    envKey: "LOG_LEVEL",
    required: false,
    default: "info" as const,
    parse: (raw) => {
      const valid = ["debug", "info", "warn", "error"] as const;
      const v = raw.toLowerCase();
      return (valid as readonly string[]).includes(v)
        ? (v as AppEnv["LOG_LEVEL"])
        : "info";
    },
  },
  MOCK_MODE: {
    envKey: "MOCK_MODE",
    required: false,
    default: false,
    parse: bool,
  },
  ACTSPACE_DISABLED_TOOLS: {
    envKey: "ACTSPACE_DISABLED_TOOLS",
    required: false,
    default: [],
    parse: csv,
  },
  ACTSPACE_BASH_ALWAYS_ASK: {
    envKey: "ACTSPACE_BASH_ALWAYS_ASK",
    required: false,
    default: false,
    parse: bool,
  },

};

// ─── .env 文件解析器 ───

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const content = readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

// ─── 自动探测 .env 文件路径 ───

function detectEnvFilePath(): string | undefined {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), ".env.local"),
    resolve(__dirname, "..", "..", "..", ".env"),
    resolve(__dirname, "..", "..", "..", ".env.local"),
  ];
  return candidates.find(existsSync);
}

// ─── 核心逻辑 ───

let _env: AppEnv | undefined;
let _loaded = false;

function buildEnv(fileVars: Record<string, string>): AppEnv {
  const result = {} as Record<string, unknown>;
  const errors: string[] = [];

  for (const [field, schema] of Object.entries(ENV_SCHEMA) as [keyof AppEnv, EnvField<unknown>][]) {
    const raw = process.env[schema.envKey] ?? fileVars[schema.envKey];

    if (raw === undefined || raw === "") {
      if (schema.required) {
        errors.push(`Missing required env var: ${schema.envKey}`);
        continue;
      }
      result[field] = schema.default;
      continue;
    }

    try {
      const parsed = schema.parse(raw);
      const validationError = schema.validate?.(parsed);
      if (validationError) {
        errors.push(validationError);
        continue;
      }
      result[field] = parsed;
    } catch (err) {
      errors.push(
        `Invalid value for ${schema.envKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }

  return result as unknown as AppEnv;
}

// ─── 公开 API ───

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Environment validation failed:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

export interface LoadEnvOptions {
  /** 指定 .env 文件路径；不传则自动探测 */
  envPath?: string;
  /** 是否将 .env 文件中的值写入 process.env（默认 true） */
  mergeToProcessEnv?: boolean;
}

/**
 * 加载并验证环境变量。
 *
 * 调用时机：应用启动时尽早调用一次。
 * 多次调用安全（会重新加载并刷新 env 对象）。
 */
export function loadEnv(options?: LoadEnvOptions): AppEnv {
  const envPath = options?.envPath ?? detectEnvFilePath();
  const mergeToProcess = options?.mergeToProcessEnv ?? true;

  const fileVars = envPath ? parseEnvFile(envPath) : {};

  if (mergeToProcess) {
    for (const [key, value] of Object.entries(fileVars)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  _env = Object.freeze(buildEnv(fileVars));
  _loaded = true;
  return _env;
}

/**
 * 获取当前环境配置。
 *
 * 如果 loadEnv() 尚未调用，会使用默认值自动初始化（不读取 .env 文件）。
 * 推荐在应用入口显式调用 loadEnv()。
 */
export function getEnv(): AppEnv {
  if (!_loaded) {
    _env = Object.freeze(buildEnv({}));
    _loaded = true;
  }
  return _env!;
}

/**
 * 便捷导出：直接使用 env.DEEPSEEK_API_KEY 等。
 *
 * 注意：这是一个 getter proxy，首次访问时如果还没 loadEnv()
 * 会使用 process.env + 默认值自动初始化。
 */
export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof AppEnv];
  },
});

/**
 * 从当前 env 生成 LLMConfig。
 *
 * 仅用于测试和 mock fallback 场景。
 * Electron 真实 turn 使用 engine/create-agent-deps.ts 中的 buildAgentConfig() + createAgentFromConfig()。
 */
export function envToLLMConfig() {
  const e = getEnv();
  if (e.MOCK_MODE || e.LLM_PROVIDER === "mock" || e.LLM_PROVIDER === "deepseek-mock") {
    return {
      provider: "mock",
      apiKey: "mock-key",
      model: "deepseek-mock",
      temperature: e.LLM_TEMPERATURE,
      maxTokens: e.LLM_MAX_TOKENS,
    };
  }

  if (e.LLM_PROVIDER === "kimi") {
    return {
      api: "openai-completions" as const,
      provider: "kimi",
      apiKey: e.KIMI_API_KEY,
      baseUrl: e.KIMI_BASE_URL || undefined,
      model: e.KIMI_MODEL,
      temperature: e.LLM_TEMPERATURE,
      maxTokens: e.LLM_MAX_TOKENS,
    };
  }

  return {
    api: e.DEEPSEEK_API_FORMAT === "anthropic"
      ? "anthropic-messages" as const
      : "openai-completions" as const,
    provider: "deepseek",
    apiFormat: e.DEEPSEEK_API_FORMAT,
    apiKey: e.DEEPSEEK_API_KEY,
    baseUrl: e.DEEPSEEK_API_FORMAT === "anthropic"
      ? e.DEEPSEEK_ANTHROPIC_BASE_URL || undefined
      : e.DEEPSEEK_BASE_URL || undefined,
    model: e.LLM_MODEL,
    temperature: e.LLM_TEMPERATURE,
    maxTokens: e.LLM_MAX_TOKENS,
  };
}
