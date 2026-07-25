/**
 * notify_user tool — Kairos 专属。
 *
 * Kairos 自主判断"这条值得用户看到"时调用；通知进入带未读状态的通知中心
 * （两个视图的铃铛），important 级额外弹 macOS 系统通知。
 * 描述做双向强调（必须用于重要发现 / 不要用于日常安静），防滥用也防不用；
 * 每 tick 限额是代码层兜底，不依赖提示词。
 * 设计详见 docs/design-docs/kairos/agent-kairos-notifications.md。
 */
import type { KairosNotificationLevel } from "@actspace/shared";
import type { ToolDefinitionSpec, ToolExecutorFn } from "../../tools/types";
import type { KairosNotificationStore } from "../storage/notification-store";

/** 每 tick 最多可发的通知条数（代码层防刷兜底）。 */
export const NOTIFY_PER_TICK_LIMIT = 3;

export const notifyUserDefinition: ToolDefinitionSpec = {
  name: "notify_user",
  description:
    "Send a notification to the user's notification center. " +
    "This is the ONLY channel guaranteed to reach the user — final replies get buried in the trace. " +
    "You MUST use it for important findings: task results, analysis conclusions triggered by user rules, " +
    "anomalies that need attention. " +
    "Do NOT use it for routine quiet observations (write notes instead) — " +
    "a noisy notification center loses its emphasis. " +
    'Use level "important" only when the user should be interrupted right now ' +
    "(it also fires an OS-level notification).",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "One-sentence conclusion shown as the notification headline. Required.",
      },
      body: {
        type: "string",
        description: "Optional markdown details (analysis summary, key numbers, next steps).",
      },
      level: {
        type: "string",
        enum: ["info", "important"],
        description:
          'Severity. "info" (default) = in-app only; "important" = also fires an OS notification.',
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent-control",
  previewKind: "generic",
  // 不操作任何文件路径——与 sleep 相同，guard 走 toolsDenied，与路径无关。
  extractPaths: () => [],
};

export interface NotifyExecutorDeps {
  store: KairosNotificationStore;
  /** 当前 tick 已发通知数；controller 每 tick 开始时清零。 */
  getTickNotifyCount(): number;
  incTickNotifyCount(): void;
}

export function createNotifyUserExecutor(deps: NotifyExecutorDeps): ToolExecutorFn {
  return async (args) => {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (title.length === 0) {
      return { success: false, error: "title must be a non-empty string" };
    }
    const rawLevel = args.level;
    if (rawLevel !== undefined && rawLevel !== "info" && rawLevel !== "important") {
      return { success: false, error: 'level must be "info" or "important"' };
    }
    const level: KairosNotificationLevel = rawLevel === "important" ? "important" : "info";
    const body =
      typeof args.body === "string" && args.body.trim().length > 0 ? args.body.trim() : null;

    if (deps.getTickNotifyCount() >= NOTIFY_PER_TICK_LIMIT) {
      return {
        success: false,
        error:
          `Notification limit reached for this tick (${NOTIFY_PER_TICK_LIMIT}). ` +
          "Merge your findings into a single notification instead.",
      };
    }
    deps.incTickNotifyCount();

    const notification = await deps.store.add({ title, body, level });
    return {
      success: true,
      data: { id: notification.id, title: notification.title, level: notification.level },
    };
  };
}
