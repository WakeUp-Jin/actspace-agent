import type { ToolDefinitionSpec, ToolExecutorFn } from "../../tools/types";

/**
 * Sleep tool — Kairos 专属。
 *
 * 仅"记账"：返回 LLM 表达的 `plannedSeconds` + `reason`，
 * 真正的定时器逻辑由 controller 在 tick turn 结束后从工具历史中抽取
 * "最后一次合法 sleep 秒数"再夹紧，详见 kairos_controller_runner plan §3。
 *
 * 该工具仅注册到 Kairos 的 ToolManager，永远不暴露给主 Agent。
 */
export const sleepDefinition: ToolDefinitionSpec = {
  name: "sleep",
  description:
    "Pause Kairos for a given number of seconds before the next tick. " +
    "Sleep can be interrupted at any time by a user message in the main chat. " +
    "Use this between meaningful work units to avoid hammering tools/LLM. " +
    "If you call sleep multiple times in one tick, only the LAST call counts. " +
    "Seconds will be clamped to the [min, max] range defined in preferences.json.",
  parameters: {
    type: "object",
    properties: {
      seconds: {
        type: "number",
        description: "Number of seconds to sleep. Will be clamped to preferences.sleepRangeSeconds.",
      },
      reason: {
        type: "string",
        description: "Brief explanation for the chosen duration (optional, for observability).",
      },
    },
    required: ["seconds"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent-control",
  previewKind: "generic",
  // 该工具不操作任何文件路径——Kairos guard 走 toolsDenied 决定是否允许，与路径无关。
  extractPaths: () => [],
};

export const sleepExecutor: ToolExecutorFn = async (args) => {
  const seconds = typeof args.seconds === "number" ? args.seconds : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { success: false, error: "seconds must be a positive number" };
  }
  const reason = typeof args.reason === "string" && args.reason.length > 0 ? args.reason : null;
  return {
    success: true,
    data: { plannedSeconds: Math.floor(seconds), reason },
  };
};
