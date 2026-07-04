/**
 * Kairos 三份配置文件的 schema 与默认值。
 *
 * 设计原则（详见 docs/exec-plans/active/kairos_config_and_tool_guard.md §1）：
 * - 不引入 zod：手写校验 + 默认合并，依赖最少。
 * - 任何字段缺失都落默认值，loader 永远不应该 throw 给 controller。
 * - tip 字段给 LLM 看（拼进 system prompt [3] 段），不是给前端展示的字面 schema。
 */

export type SleepBias = "light" | "normal" | "deep";

export interface Preferences {
  tip: string;
  enabled: boolean;
  sleepRangeSeconds: {
    min: number;
    max: number;
    default: number;
  };
  tickBudget: {
    perDay: number;
    perHour: number;
  };
  circuitBreaker: {
    errorThreshold: number;
    cooldownSec: number;
  };
  memory: {
    loadBudgetRatio: number;
    compressionThreshold: number;
  };
  rhythm: {
    timezone: string;
    workHours: { start: string; end: string; sleepBias: SleepBias };
    quietHours: { start: string; end: string; sleepBias: SleepBias };
    weekend: { sleepBias: SleepBias };
  };
}

export interface PathsConfig {
  tip: string;
  paths: Array<{
    path: string;
    tip?: string;
  }>;
}

export interface Blocklist {
  tip: string;
  paths: string[];           // glob 列表
  toolsDenied: string[];
  timeWindows: Array<{ from: string; to: string }>;  // "HH:MM"
  maxToolCallsPerTick: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  tip: "Kairos 默认偏好；如需调整 sleep / tickBudget 等请编辑本文件。",
  enabled: false,
  sleepRangeSeconds: { min: 30, max: 900, default: 120 },
  tickBudget: { perDay: 200, perHour: 30 },
  circuitBreaker: { errorThreshold: 5, cooldownSec: 60 },
  memory: { loadBudgetRatio: 0.75, compressionThreshold: 0.85 },
  rhythm: {
    timezone: "Asia/Shanghai",
    workHours: { start: "09:00", end: "21:00", sleepBias: "normal" },
    quietHours: { start: "23:00", end: "07:00", sleepBias: "deep" },
    weekend: { sleepBias: "light" },
  },
};

export const DEFAULT_PATHS_CONFIG: PathsConfig = {
  tip: "在此声明 Kairos 可读写的本地路径（默认只有自己的 workspace）；目录变化感知请使用文件监听（fs-watch）。",
  paths: [],
};

export const DEFAULT_BLOCKLIST: Blocklist = {
  tip: "敏感目录与工具屏蔽清单；命中即拒绝，不会被 LLM 重新解读。",
  paths: [],
  toolsDenied: ["bash"],          // bash 默认对 Kairos 关闭，可由用户开放
  timeWindows: [],
  maxToolCallsPerTick: 10,
};

// ─── 轻量手写 validator ────────────────────────────────────────────────

type ValidationContext = { path: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickInt(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const int = Math.floor(value);
  return int >= min ? int : fallback;
}

function pickRatio(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 0 || value > 1) return fallback;
  return value;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function parsePreferences(raw: unknown): Preferences {
  if (!isObject(raw)) return { ...DEFAULT_PREFERENCES };
  const sr = isObject(raw.sleepRangeSeconds) ? raw.sleepRangeSeconds : {};
  const tb = isObject(raw.tickBudget) ? raw.tickBudget : {};
  const cb = isObject(raw.circuitBreaker) ? raw.circuitBreaker : {};
  const mem = isObject(raw.memory) ? raw.memory : {};
  const rh = isObject(raw.rhythm) ? raw.rhythm : {};
  const wh = isObject(rh.workHours) ? rh.workHours : {};
  const qh = isObject(rh.quietHours) ? rh.quietHours : {};
  const we = isObject(rh.weekend) ? rh.weekend : {};
  const biasAllowed: readonly SleepBias[] = ["light", "normal", "deep"];

  return {
    tip: pickString(raw.tip, DEFAULT_PREFERENCES.tip),
    enabled: pickBoolean(raw.enabled, DEFAULT_PREFERENCES.enabled),
    sleepRangeSeconds: {
      min: pickInt(sr.min, DEFAULT_PREFERENCES.sleepRangeSeconds.min, 1),
      max: pickInt(sr.max, DEFAULT_PREFERENCES.sleepRangeSeconds.max, 1),
      default: pickInt(sr.default, DEFAULT_PREFERENCES.sleepRangeSeconds.default, 1),
    },
    tickBudget: {
      perDay: pickInt(tb.perDay, DEFAULT_PREFERENCES.tickBudget.perDay, 1),
      perHour: pickInt(tb.perHour, DEFAULT_PREFERENCES.tickBudget.perHour, 1),
    },
    circuitBreaker: {
      errorThreshold: pickInt(cb.errorThreshold, DEFAULT_PREFERENCES.circuitBreaker.errorThreshold, 1),
      cooldownSec: pickInt(cb.cooldownSec, DEFAULT_PREFERENCES.circuitBreaker.cooldownSec, 1),
    },
    memory: {
      loadBudgetRatio: pickRatio(mem.loadBudgetRatio, DEFAULT_PREFERENCES.memory.loadBudgetRatio),
      compressionThreshold: pickRatio(mem.compressionThreshold, DEFAULT_PREFERENCES.memory.compressionThreshold),
    },
    rhythm: {
      timezone: pickString(rh.timezone, DEFAULT_PREFERENCES.rhythm.timezone),
      workHours: {
        start: DEFAULT_PREFERENCES.rhythm.workHours.start,
        end: DEFAULT_PREFERENCES.rhythm.workHours.end,
        sleepBias: pickEnum(wh.sleepBias, biasAllowed, DEFAULT_PREFERENCES.rhythm.workHours.sleepBias),
      },
      quietHours: {
        start: DEFAULT_PREFERENCES.rhythm.quietHours.start,
        end: DEFAULT_PREFERENCES.rhythm.quietHours.end,
        sleepBias: pickEnum(qh.sleepBias, biasAllowed, DEFAULT_PREFERENCES.rhythm.quietHours.sleepBias),
      },
      weekend: {
        sleepBias: pickEnum(we.sleepBias, biasAllowed, DEFAULT_PREFERENCES.rhythm.weekend.sleepBias),
      },
    },
  };
}

export function parsePathsConfig(raw: unknown): PathsConfig {
  if (!isObject(raw)) return { ...DEFAULT_PATHS_CONFIG, paths: [] };
  const items = Array.isArray(raw.paths) ? raw.paths : [];
  // 旧版 entry 里的 watch 字段（巡检开关）已随巡检管道退役，读到时静默忽略。
  const paths = items.flatMap((item): PathsConfig["paths"] => {
    if (!isObject(item)) return [];
    const p = typeof item.path === "string" ? item.path.trim() : "";
    if (!p) return [];
    const entry: PathsConfig["paths"][number] = {
      path: p,
    };
    if (typeof item.tip === "string" && item.tip.trim().length > 0) {
      entry.tip = item.tip.trim();
    }
    return [entry];
  });
  return {
    tip: pickString(raw.tip, DEFAULT_PATHS_CONFIG.tip),
    paths,
  };
}

export function parseBlocklist(raw: unknown): Blocklist {
  if (!isObject(raw)) return { ...DEFAULT_BLOCKLIST };
  const tw = Array.isArray(raw.timeWindows) ? raw.timeWindows : [];
  const timeWindows = tw.flatMap((item): Blocklist["timeWindows"] => {
    if (!isObject(item)) return [];
    if (typeof item.from !== "string" || typeof item.to !== "string") return [];
    return [{ from: item.from, to: item.to }];
  });
  const toolsDenied = Array.isArray(raw.toolsDenied)
    ? pickStringArray(raw.toolsDenied)
    : [...DEFAULT_BLOCKLIST.toolsDenied];
  return {
    tip: pickString(raw.tip, DEFAULT_BLOCKLIST.tip),
    paths: pickStringArray(raw.paths),
    toolsDenied,
    timeWindows,
    maxToolCallsPerTick: pickInt(
      raw.maxToolCallsPerTick,
      DEFAULT_BLOCKLIST.maxToolCallsPerTick,
      1,
    ),
  };
}

// ValidationContext 预留给未来需要"嵌套路径追踪"的更复杂校验；当前未使用。
export type { ValidationContext };
