import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
  parseBlocklist,
  parsePathsConfig,
  parsePreferences,
  type Blocklist,
  type PathsConfig,
  type Preferences,
} from "./schema";

const RULE_MD_TOKEN_BUDGET = 1500;
const SOUL_MD_TOKEN_BUDGET = 500;
const TOKEN_CHARS_PER_UNIT = 3;          // 与主 Agent 估算保持一致

export interface KairosConfig {
  preferences: Preferences;
  paths: PathsConfig;
  blocklist: Blocklist;
  ruleMd: string;
  /**
   * soul.md 原文（人格插槽，设计见 agent-kairos-prompt-design.md §3）。
   * 缺失 = 空串；空白时 prompt-assembler fallback 到 KAIROS_DEFAULT_SOUL。
   */
  soulMd: string;
  warnings: string[];                    // loader 路径上的非致命问题
}

export interface LoadKairosConfigOptions {
  /** 缺省按 join(rootDir, "config", "{name}.json") 寻址 */
  configDir?: string;
  /** 测试用：注入"显示警告"的 hook，loader 仍把警告塞 returned config 里 */
  onWarning?: (msg: string) => void;
}

/**
 * 从 `<rootDir>/config/` 读取 3 份 JSON + 1 份 rule.md。
 *
 * - 文件不存在或 JSON 损坏 → 落默认值，记一条 warning（不 throw）。
 * - rule.md 超 1500 token 近似 → 截尾并记 warning。
 * - loader 是纯异步函数，可在 controller 启动 / IPC 写入后被反复调用。
 */
export async function loadKairosConfig(
  rootDir: string,
  options: LoadKairosConfigOptions = {},
): Promise<KairosConfig> {
  const dir = options.configDir ?? join(rootDir, "config");
  const warnings: string[] = [];
  const warn = (msg: string) => {
    warnings.push(msg);
    options.onWarning?.(msg);
  };

  const preferences = await readJson(
    join(dir, "preferences.json"),
    parsePreferences,
    DEFAULT_PREFERENCES,
    warn,
  );
  const paths = await readJson(
    join(dir, "paths.json"),
    parsePathsConfig,
    DEFAULT_PATHS_CONFIG,
    warn,
  );
  const blocklist = await readJson(
    join(dir, "blocklist.json"),
    parseBlocklist,
    DEFAULT_BLOCKLIST,
    warn,
  );

  const ruleMd = await readMarkdownWithBudget(
    join(dir, "rule.md"),
    RULE_MD_TOKEN_BUDGET,
    warn,
  );
  const soulMd = await readMarkdownWithBudget(
    join(dir, "soul.md"),
    SOUL_MD_TOKEN_BUDGET,
    warn,
  );

  return { preferences, paths, blocklist, ruleMd, soulMd, warnings };
}

async function readJson<T>(
  filePath: string,
  parse: (raw: unknown) => T,
  fallback: T,
  warn: (msg: string) => void,
): Promise<T> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") warn(`Failed to read ${filePath}: ${(err as Error).message}`);
    return cloneDefault(fallback);
  }
  try {
    return parse(JSON.parse(text));
  } catch (err) {
    warn(`Failed to parse ${filePath}: ${(err as Error).message}; falling back to defaults.`);
    return cloneDefault(fallback);
  }
}

async function readMarkdownWithBudget(
  filePath: string,
  tokenBudget: number,
  warn: (msg: string) => void,
): Promise<string> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") warn(`Failed to read ${filePath}: ${(err as Error).message}`);
    return "";
  }
  const tokenEstimate = Math.ceil(text.length / TOKEN_CHARS_PER_UNIT);
  if (tokenEstimate <= tokenBudget) return text;
  const maxChars = tokenBudget * TOKEN_CHARS_PER_UNIT;
  const name = filePath.split("/").pop() ?? filePath;
  warn(`${name} exceeds ${tokenBudget}-token budget; truncating to ${maxChars} chars.`);
  return `${text.slice(0, maxChars)}\n\n[Truncated: ${name} too long]`;
}

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
