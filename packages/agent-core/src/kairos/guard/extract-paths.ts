/**
 * Kairos 工具参数 → 路径数组的中心化兜底提取器。
 *
 * 调用顺序（详见 docs/exec-plans/active/kairos_config_and_tool_guard.md §5）：
 * 1. scheduler 优先调用 InternalTool.extractPaths
 * 2. 若未提供，fall back 到本模块
 * 3. 若本模块也提不出路径，则视为"无法判定" → 拒绝（白名单式）
 */

/** 已知的"路径字段"列表，按优先级排序。 */
const PATH_FIELDS = ["path", "filePath", "file", "dir", "directory", "cwd"];

/** 已知的"路径数组字段"。 */
const PATH_ARRAY_FIELDS = ["files", "paths"];

export function extractPathsFromArgs(args: Record<string, unknown>): string[] {
  const result: string[] = [];

  for (const key of PATH_FIELDS) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) {
      result.push(value);
    }
  }

  for (const key of PATH_ARRAY_FIELDS) {
    const value = args[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0) result.push(item);
      }
    }
  }

  return result;
}
