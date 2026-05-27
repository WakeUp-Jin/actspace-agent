import type { EventId, SessionEvent } from "./session";

/**
 * Kairos 当前运行阶段。
 * 单个 KairosController 实例同时只处于其中一个状态。
 *
 * - `idle`：已启动但当前没有 tick 在跑，也不在 sleep。
 * - `ticking`：正在执行一次 tick（runner 在调 LLM / 工具）。
 * - `sleeping`：tick 已结束，处于可被中断的 setTimeout 等待。
 * - `interrupted`：被主 Agent 的 user message 中断，正在等主 Agent runTurn 完成。
 * - `cooldown`：达到熔断阈值，进入冷却期。
 * - `stopped`：用户主动停止 / preferences.enabled=false，整体闲置。
 */
export type KairosRunState =
  | "idle"
  | "ticking"
  | "sleeping"
  | "interrupted"
  | "stopped"
  | "cooldown";

/** Kairos 对外暴露的运行时快照。前端 KairosPage 顶部状态条直接渲染本结构。 */
export type KairosRuntimeState = {
  enabled: boolean;
  state: KairosRunState;
  /** ISO time，仅 state==="sleeping" 时有意义，用于前端倒计时。 */
  sleepEndsAt?: string;
  todayTickCount: number;
  /** ISO time，最后一次 assistant_message 的时间戳。 */
  lastReplyAt?: string;
  toolCallCountInCurrentTick: number;
  totalSleepSecondsToday: number;
};

/** 用户从 KairosPage 发起的控制指令，全部走 `kairos:control` IPC 通道。 */
export type KairosControl =
  | { type: "start" }
  | { type: "stop" }
  | { type: "wake_now" }
  | { type: "reset_today" };

/** KairosEventTable 中一行的语义类型。 */
export type KairosRowKind =
  | "tick"
  | "tool"
  | "reply"
  | "sleep"
  | "interrupt"
  | "error";

/** 一行的运行状态。`running` 表示尚未观察到对应"关闭" event（如 tool_call 没有匹配 tool_result）。 */
export type KairosRowStatus =
  | "running"
  | "success"
  | "failed"
  | "interrupted";

/**
 * 由 `aggregateKairosEvents` 把若干条 `SessionEvent` 折叠成 UI 表格一行。
 * `relatedEventIds` 反向指回原始 SessionEvent，方便右侧详情面板按 id 反查。
 */
export type KairosEventRow = {
  id: string;
  kind: KairosRowKind;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: KairosRowStatus;
  summary: string;
  relatedEventIds: EventId[];
};

/** IPC `kairos:get-events-recent` 请求体；不传 limit 时 main 端默认按 200 返回。 */
export type KairosGetEventsRecentRequest = {
  limit?: number;
  /** 拿"早于该 event id 的更早事件"用，配合无限滚动。 */
  before?: EventId;
};

/** IPC `kairos:get-events-recent` 响应体。 */
export type KairosGetEventsRecentResponse = {
  events: SessionEvent[];
  hasMore: boolean;
};

/**
 * v1 不实现 pin notes 工作流。这里显式标记为 `never`，让任何误调用在编译期就失败。
 * v2 重启该能力时改为真实请求 type。
 */
export type KairosPinNoteRequest = never;

/** 4 份配置文件的逻辑名（IPC 用），main 端映射成实际文件名。 */
export type KairosConfigName = "preferences" | "paths" | "blocklist" | "rule";

/** `kairos:read-config` 请求/响应。`content` 是原始文本（JSON 或 markdown），由 renderer 直接显示/编辑。 */
export type KairosReadConfigRequest = { name: KairosConfigName };
export type KairosReadConfigResponse = {
  /** 文件原文；不存在时返回空字符串，renderer 显示为"暂未配置"。 */
  content: string;
  /** 文件相对 `<kairosRoot>/config` 的实际文件名（便于 UI 标题展示）。 */
  fileName: string;
  /** true 表示磁盘上没有该文件，content 为空字符串。 */
  notFound: boolean;
};

/**
 * `kairos:write-config` 请求/响应。
 * main 端会在写盘前用对应 schema parse（rule.md 跳过 parse）；
 * 失败时直接 throw → renderer invoke 收到 rejected Promise → 弹 toast，磁盘原文件不动。
 */
export type KairosWriteConfigRequest = { name: KairosConfigName; content: string };
export type KairosWriteConfigResponse = { ok: true };

/** `kairos:control` 响应统一格式。 */
export type KairosControlResponse = { ok: true };

/**
 * `window.kairos` API surface 的契约类型集合，前后端 type-only import 同源。
 * preload 实现要逐字段对齐。
 */
export interface KairosBridgeApi {
  getState(): Promise<KairosRuntimeState>;
  getEventsRecent(req?: KairosGetEventsRecentRequest): Promise<KairosGetEventsRecentResponse>;
  control(ctrl: KairosControl): Promise<KairosControlResponse>;
  readConfig(req: KairosReadConfigRequest): Promise<KairosReadConfigResponse>;
  writeConfig(req: KairosWriteConfigRequest): Promise<KairosWriteConfigResponse>;
  onEvent(listener: (event: SessionEvent) => void): () => void;
  onState(listener: (state: KairosRuntimeState) => void): () => void;
}
