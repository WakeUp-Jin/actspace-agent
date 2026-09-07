/**
 * 把工具/子 Agent 过程的耗时格式化成 `Worked for ...` 折叠头文案。
 *
 * 主消息流的工具活动组和子 Agent transcript panel 共用同一套文案，避免出现两份实现。
 */
export function formatWorkedDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "Worked";
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `Worked for ${seconds}s`;
  }

  if (seconds === 0) {
    return `Worked for ${minutes}m`;
  }

  return `Worked for ${minutes}m ${seconds}s`;
}
