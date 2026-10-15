import type { RuntimeV2SessionSnapshot, RuntimeV2UsageSummary } from "@actspace/shared/runtime-v2/projection";

/**
 * 输入区用量胶囊的数字口径，逐条对应 DeepSeek Harness 的 `StatsPills.tsx` +
 * `token-format.ts`（参考实现见 docs/design-docs/frontend/composer-usage-dock-demo.html）。
 * 这里只做投影，不碰 DOM；两个胶囊的显示/隐藏分支在 ComposerStatsPills 里。
 */

/** 会话统计：模型用时、工具用时、首 token 延迟、输出速度。 */
export type ComposerSessionStats = {
  readonly turns: number;
  readonly steps: number;
  /** 请求墙钟时间之和（request/header → assistant/message）；没有任何一步带计时时为 0。 */
  readonly llmMs: number;
  /** 工具墙钟时间之和（tool/call → tool/result）；并行工具会超过真实经过时间。 */
  readonly toolMs: number;
  /** 带首 token 记录的那些请求的首 token 延迟之和。 */
  readonly ttftMs: number;
  /** 带 TTFT 记录的请求数。 */
  readonly ttftSteps: number;
  /** 同时报了输出 token 的那些请求的解码时间之和。 */
  readonly decodeMs: number;
  /** 与 `decodeMs` 同一批请求的输出 token 之和。 */
  readonly decodeTokens: number;
};

const EMPTY_STATS: ComposerSessionStats = {
  turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0,
};

/**
 * 从投影快照里读会话统计。轮次/步数和模型侧计时（`activity.timing`）都由宿主扫全量
 * journal 累加，重新打开的会话和长会话里同样准确；工具用时取自全量的 `tools` 投影。
 * @param snapshot - 会话投影快照，可能尚未加载。
 * @returns 会话统计数据；无快照时各项为 0。
 */
export function sessionStats(snapshot: RuntimeV2SessionSnapshot | null | undefined): ComposerSessionStats {
  if (!snapshot) return EMPTY_STATS;

  let toolMs = 0;
  for (const tool of snapshot.tools) {
    if (tool.durationMs !== null && Number.isFinite(tool.durationMs)) toolMs += Math.max(0, tool.durationMs);
  }

  const { timing } = snapshot.activity;
  return {
    turns: snapshot.activity.turnCount,
    steps: snapshot.activity.stepCount,
    toolMs,
    llmMs: timing.llmMs,
    ttftMs: timing.ttftMs,
    ttftSteps: timing.ttftSteps,
    decodeMs: timing.decodeMs,
    decodeTokens: timing.decodeTokens,
  };
}

/** 计费输入 = 未缓存输入 + 缓存读取 + 缓存写入（三个互不重叠的提示侧桶）。 */
export function billedInputTokens(usage: RuntimeV2UsageSummary): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/**
 * 缓存命中率。结果永不把「差一点全命中」舍成 100%：整数位会舍成 100 时自动加小数位，
 * 加多少位由整数运算定出来。
 * @param cacheReadTokens - 命中缓存的提示 token。
 * @param promptTokens - 计费输入总量。
 * @param decimalPlaces - 常规精度，0 或 1。
 * @returns 百分比文本；无计费输入时为 null。
 */
export function formatCacheHitPercent(cacheReadTokens: number, promptTokens: number, decimalPlaces: 0 | 1 = 0): string | null {
  if (promptTokens === 0) return null;
  const missedInputTokens = promptTokens - cacheReadTokens;
  if (missedInputTokens === 0) return "100";

  const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
  const fullHitUnits = decimalPlaces === 0 ? 100 : 1_000;
  if (roundedUnits < fullHitUnits) return displayPercentUnits(roundedUnits, decimalPlaces);

  let distinguishingPlaces = 1;
  let scaledDoubleGap = missedInputTokens * 200;
  const denominatorTens = Math.floor(promptTokens / 10);
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10;
    distinguishingPlaces += 1;
  }
  const denominatorOnes = promptTokens % 10;
  let roundedLoss = 5;
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1;
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10);
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss;
      break;
    }
  }
  return `99.${"9".repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`;
}

/** 整数二分求百分比单位数，用整数阈值比较避免浮点误差；正中间进位。 */
function roundedPercentUnits(cacheReadTokens: number, denominator: number, decimalPlaces: 0 | 1): number {
  const unitsPerPercent = decimalPlaces === 0 ? 1 : 10;
  const scale = unitsPerPercent * 100;
  const doubledScale = scale * 2;
  const denominatorQuotient = Math.floor(denominator / doubledScale);
  const denominatorRemainder = denominator % doubledScale;
  let lower = 0;
  let upper = scale;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2);
    const factor = candidate * 2 - 1;
    const threshold = factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale);
    if (cacheReadTokens >= threshold) lower = candidate;
    else upper = candidate - 1;
  }
  return lower;
}

function displayPercentUnits(units: number, decimalPlaces: 0 | 1): string {
  if (decimalPlaces === 0) return String(units);
  const whole = Math.floor(units / 10);
  const tenths = units % 10;
  return tenths === 0 ? String(whole) : `${whole}.${tenths}`;
}

/**
 * 紧凑时长：不到一分钟写「45.2秒」，再往上写「2分42秒」。
 * @param ms - 毫秒数。
 * @returns 展示文本。
 */
export function formatDuration(ms: number): string {
  const seconds = ms / 1_000;
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}秒`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}分${whole % 60}秒`;
}

/**
 * 输出速度：钳到 0；10 以上取整，否则一位小数。
 * @param tokensPerSecond - 每秒输出 token 数。
 * @returns 展示文本。
 */
export function formatTokensPerSecond(tokensPerSecond: number): string {
  const clamped = Math.max(0, tokensPerSecond);
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
}

/**
 * 紧凑 token 计数：517 / 12.2K / 517K / 1.2M。
 * @param value - 非负 token 数。
 * @returns 展示文本。
 */
export function formatTokens(value: number): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10);
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}

/**
 * 精确 token 计数，按千位分组。
 * @param value - 非负安全整数。
 * @returns 带分隔符的展示文本。
 */
export function formatExactTokens(value: number): string {
  const digits = String(value);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return groups.join(",");
}
