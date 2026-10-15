export type SessionUiStatusKind = "idle" | "running" | "waiting_approval" | "failed" | "unread";
type SessionStatusMeta = { label: string; detail: string; dotClass: string; rowClass: string };

export const SESSION_STATUS_META: Record<SessionUiStatusKind, SessionStatusMeta> = {
  idle: {
    label: "空闲",
    detail: "可以开始下一轮对话。",
    // 空闲不画点（DSH）：按钮还在，键盘和读屏仍能查到状态。
    dotClass: "size-1.5 rounded-full bg-text-faint opacity-0",
    rowClass: "",
  },
  running: {
    label: "运行中",
    detail: "Agent 正在执行当前轮次。",
    // 运行中是转圈的细环。
    dotClass: "size-2.5 rounded-full border-[1.5px] border-operational border-t-transparent animate-spin motion-reduce:animate-none",
    rowClass: "is-busy",
  },
  waiting_approval: {
    label: "等待审批",
    detail: "工具调用已暂停，等待审批。",
    dotClass: "size-1.5 rounded-full animate-[session-status-pulse_1500ms_ease-in-out_infinite] bg-warning",
    rowClass: "is-waiting-approval",
  },
  failed: {
    label: "失败",
    detail: "最近一轮执行失败或需要处理。",
    dotClass: "size-1.5 rounded-full bg-danger",
    rowClass: "is-failed",
  },
  unread: {
    label: "已完成",
    detail: "这一轮已跑完，还没查看。",
    dotClass: "size-1.5 rounded-full bg-success",
    rowClass: "is-unread",
  },
};

/**
 * 侧栏里一条会话的状态。`sessionStatuses` 里有记录就以它为准（认不出的值按空闲），
 * 没有记录时看 `busySessionIds`：在里面算运行中，否则空闲。
 */
export function sessionStatusOf(
  sessionId: string,
  busySessionIds?: ReadonlySet<string>,
  sessionStatuses?: Readonly<Record<string, unknown>>,
): SessionUiStatusKind {
  const status = sessionStatuses?.[sessionId] ?? (busySessionIds?.has(sessionId) ? "running" : "idle");
  // 用 hasOwnProperty 而不是 in：`"toString" in SESSION_STATUS_META` 也为真。
  return typeof status === "string" && Object.prototype.hasOwnProperty.call(SESSION_STATUS_META, status) ? status as SessionUiStatusKind : "idle";
}

/** 需要用户看一眼的会话：待审批、失败、跑完未读。按时间分组时收进最上面的「需要处理」。 */
export function needsAttention(status: SessionUiStatusKind): boolean {
  return status === "waiting_approval" || status === "failed" || status === "unread";
}

/** 这一轮还没结束（运行中或等待审批）：不能分叉，所在工作区也不能「归档全部」。 */
export function isSessionBusy(status: SessionUiStatusKind): boolean {
  return status === "running" || status === "waiting_approval";
}
