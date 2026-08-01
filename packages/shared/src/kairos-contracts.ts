import type { EventId, LlmUsageCost, SessionEvent } from "./session";

/**
 * Kairos 当前运行阶段。
 * 单个 KairosController 实例同时只处于其中一个状态。
 *
 * - `idle`：已启动但当前没有 tick 在跑，也不在 sleep。
 * - `ticking`：正在执行一次 tick（runner 在调 LLM / 工具）。
 * - `sleeping`：tick 已结束，处于可被中断的 setTimeout 等待。
 * - `interrupted`：被主 Agent 的 user message 中断，正在等主 Agent runAgent 完成。
 * - `cooldown`：达到熔断阈值，进入冷却期。
 * - `stopped`：用户主动停止 / preferences.enabled=false，整体闲置。
 * - `budget_exhausted`：额度余额 ≤ 0 被动暂停（区别于用户主动 stopped）。
 *   需用户在设置页把余额改 > 0 后**手动**重新开启，不自动恢复。
 */
export type KairosRunState =
  | "idle"
  | "ticking"
  | "sleeping"
  | "interrupted"
  | "stopped"
  | "cooldown"
  | "budget_exhausted";

/**
 * Kairos 的 token / cost 累计（自上一次 reset_today 以来）。
 *
 * 字段对齐 `aggregateKairosUsage` 的返回，主要由 KairosController 持续累加并落盘，
 * 通过 `KairosRuntimeState.usageLifetime` / `usageSinceReset` 同步给 renderer。
 *
 * - `currency` 多次 LLM call 使用了不同币种时退化为 `"MIXED"`，避免误把 USD 数字
 *   贴 `¥` 显示给用户。
 * - `callCount === 0` 时所有字段都是 0；UI 可据此显示 placeholder（如 `--`）。
 *
 * 之所以放在 contracts 文件里：本结构同时是 IPC 状态推送的契约和聚合函数返回值，
 * 让两者共用一份类型可以避免 renderer / main 端在 schema 上漂移。
 */
export interface KairosUsageSummary {
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  cost: number;
  currency: LlmUsageCost["currency"] | "MIXED";
}

/**
 * Kairos 额度护栏运行态（单一余额模型）。
 *
 * 真相源是 `<kairosRoot>/memory/budget-state.json`：controller 运行时把每次模型回复的成本
 * 从 `balanceCny` 里扣减，用户在设置页可随时改这个余额。**不进 preferences.json**——
 * 它是被高频回写的运行态数据，放配置文件会与热重载打架。
 *
 * - `enabled=false` 时 `balanceCny` 无意义，UI 不渲染额度块、Kairos 无限运行。
 * - `exhausted = enabled && balanceCny <= 0`；为 true 时 Kairos 进入 `budget_exhausted`。
 */
export interface KairosBudgetRuntime {
  enabled: boolean;
  /** 剩余可花额度（¥）。运行时递减，可被用户改写。tick 边界粒度检查，可能短暂为负。 */
  balanceCny: number;
  exhausted: boolean;
}

/** Kairos 对外暴露的运行时快照。前端 KairosPage 顶部状态条直接渲染本结构。 */
export type KairosRuntimeState = {
  enabled: boolean;
  state: KairosRunState;
  /** 额度护栏运行态（始终存在；enabled=false 表示无限运行）。 */
  budget: KairosBudgetRuntime;
  /** ISO time，仅 state==="sleeping" 时有意义，用于前端倒计时。 */
  sleepEndsAt?: string;
  todayTickCount: number;
  /** ISO time，最后一次 assistant_message 的时间戳。 */
  lastReplyAt?: string;
  toolCallCountInCurrentTick: number;
  totalSleepSecondsToday: number;
  /**
   * **全生命周期**累计的 token / 成本：从 Kairos 第一次有 `llm_usage` 起的总账。
   *
   * 关键语义：
   * - **`重置今日` 按钮不清空它**——产品上"重置今日"只清"阶段"维度（`usageSinceReset`）。
   * - 只有手动删 `<kairosRoot>/memory/usage-accumulator.json` 时才归零；
   *   此时下一次启动会扫描全部短期记忆 jsonl 段重建（持久化历史即真相）。
   * - 跨进程重启不丢账。
   */
  usageLifetime: KairosUsageSummary;
  /**
   * **阶段**累计的 token / 成本：自上一次 `重置今日` 起累计。
   *
   * 与 `todayTickCount` / `totalSleepSecondsToday` 同生命周期——`重置今日` 时清零。
   * accumulator 文件被删时也会归零（因为 reset 边界只能由 accumulator 文件维护，
   * 无法从原始 jsonl 推断"用户最后一次 reset 的时间"）。
   */
  usageSinceReset: KairosUsageSummary;
};

/** 用户从 KairosPage / 设置页发起的控制指令，全部走 `kairos:control` IPC 通道。 */
export type KairosControl =
  | { type: "start" }
  | { type: "stop" }
  | { type: "wake_now" }
  | { type: "reset_today" }
  /**
   * 设置页「额度限制」开关 + 「剩余额度」输入 → 写 `budget-state.json`。
   * `balanceCny` 语义 = "保存后它还能花多少"（即剩余余额，运行时会被扣减）。
   */
  | { type: "set_budget"; enabled: boolean; balanceCny: number };

/** KairosEventTable 中一行的语义类型。 */
export type KairosRowKind =
  | "tick"
  | "thinking"
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

/** 5 份配置文件的逻辑名（IPC 用），main 端映射成实际文件名。 */
export type KairosConfigName = "preferences" | "paths" | "blocklist" | "rule" | "soul";

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

// ─── briefs（任务表）编辑 IPC（详见 docs/design-docs/kairos/agent-kairos-prompt-design.md §7） ───

/** brief 生命周期状态；UI 只在 active/paused 间切换，done/failed 由系统写入。 */
export type KairosBriefStatus = "active" | "paused" | "done" | "failed";
export type KairosBriefTrigger = "interval" | "manual" | "event";
export type KairosBriefPriority = "high" | "normal" | "low";

/**
 * `kairos:briefs-list` 响应的单条摘要（frontmatter 投影，不含正文）。
 * `created` / `lastRun` / `nextRun` 由系统维护，UI 只读展示。
 */
export interface KairosBriefSummary {
  id: string;
  status: KairosBriefStatus;
  trigger: KairosBriefTrigger;
  intervalSec: number | null;
  priority: KairosBriefPriority;
  created: string;
  lastRun: string | null;
  nextRun: string | null;
}

export type KairosBriefsListResponse = { briefs: KairosBriefSummary[] };

export type KairosBriefReadRequest = { id: string };
export type KairosBriefReadResponse = { summary: KairosBriefSummary; body: string };

/**
 * `kairos:briefs-write` 请求：新建或编辑同走一条通道（按 id 是否已存在区分）。
 * 只允许提交用户可编辑字段；`created`（新建时置当前时间）与 `lastRun` / `nextRun`
 * （编辑时保留原值）由 main 端维护，防止 UI 破坏调度状态。
 */
export type KairosBriefWriteRequest = {
  id: string;
  status: Extract<KairosBriefStatus, "active" | "paused">;
  trigger: KairosBriefTrigger;
  intervalSec: number | null;
  priority: KairosBriefPriority;
  body: string;
};
export type KairosBriefWriteResponse = { ok: true };

export type KairosBriefDeleteRequest = { id: string };
export type KairosBriefDeleteResponse = { ok: true };

// ─── 通知中心（详见 docs/design-docs/kairos/agent-kairos-notifications.md） ───

/** 通知级别；`important` 会额外触发 macOS 系统通知。 */
export type KairosNotificationLevel = "info" | "important";

/**
 * 单条通知。由 Kairos 调用 `notify_user` 工具产生，落盘 `<kairosRoot>/memory/notifications.json`。
 * `read` 是可变状态（用户点击已读），因此不进 append-only 的事件流。
 */
export interface KairosNotification {
  id: string;
  /** ISO time，创建时间。 */
  timestamp: string;
  /** 一句话结论，通知列表主行。 */
  title: string;
  /** markdown 详情，可为 null（只有一句话时）。 */
  body: string | null;
  level: KairosNotificationLevel;
  read: boolean;
}

/** `kairos:notifications-list` 响应；notifications 按新→旧排序。 */
export type KairosNotificationsListResponse = {
  notifications: KairosNotification[];
  unreadCount: number;
};

/** `kairos:notifications-mark-read` 请求；省略 `id` = 全部标记已读。 */
export type KairosNotificationsMarkReadRequest = { id?: string };
export type KairosNotificationsMarkReadResponse = { ok: true; unreadCount: number };

/**
 * `kairos:notifications-remove` 请求（纯用户侧操作，Kairos 工具不感知删除）：
 * - `{ id }`：删除单条；
 * - `{ scope: "read" }`：清除所有已读；
 * - `{ scope: "all" }`：清空全部。
 */
export type KairosNotificationsRemoveRequest = { id: string } | { scope: "read" | "all" };
export type KairosNotificationsRemoveResponse = {
  ok: true;
  removedCount: number;
  unreadCount: number;
};

// ─── 上下文 Sheet 快照（详见 docs/design-docs/kairos/front-Kairos监控页规范.md） ───

/** prompt-assembler 推导出的当前节奏阶段；UI 概览段直接渲染。 */
export type KairosContextPhase = "work" | "quiet" | "weekend" | "off";

/**
 * 历史消息的角色。
 * - `system` / `user` / `assistant` 与 LLM Message 对齐；
 * - `tool` 对应 ToolResultMessage（renderer 友好命名，不沿用 "toolResult"）。
 */
export type KairosContextMessageRole = "user" | "assistant" | "tool" | "system";

/** 来自 ShortMemoryStore 的 week/month/year summary 文件 ; 在 Sheet [③历史] 子段渲染。 */
export interface KairosContextHistorySegment {
  label: string;
  text: string;
}

/**
 * 短期记忆 messages 的 UI 投影。
 * - `content`：renderer 直接展示；assistant 的 thinking / toolCall 已合并为可读文本；
 * - `timestamp`：ISO 字符串，缺失说明源消息无 timestamp（比如从 summary 段合并出来的）；
 * - `source`：可选，区分 `kairos_tick` / 用户消息等业务来源。
 */
export interface KairosContextMessage {
  role: KairosContextMessageRole;
  source?: string;
  content: string;
  timestamp?: string;
}

/**
 * 工具列表单条。
 * - `source: "kairos"` 表示该工具仅在 Kairos 实例注册（`sleep` / `notify_user`）；
 * - `source: "shared"` 表示来自主 Agent 共享工具集；
 * - `parametersSchema` 保留 JSON Schema 子树以备将来扩展；v1 渲染器只显示
 *   `name + description`，不再让用户点开 schema（细节不直观）。
 */
export interface KairosContextTool {
  name: string;
  description: string;
  source: "kairos" | "shared";
  parametersSchema: unknown;
}

/**
 * 系统提示词的"段"——renderer 把 system prompt 按 6 段渲染，每段独立折叠，
 * 并展示该段的源文件（用户可以直接打开对应文件改）。
 *
 * - `text` 是该段实际拼入 LLM system prompt 的纯文本（已截断到 budget）；
 *   纯运行时段（如观测摘要）也是同一字段，方便统一渲染。
 * - `sourceFiles` 若非空，表示该段可由编辑这些文件来改变。
 *   纯运行时段 / 代码硬编码段（如 `prompt.ts`）也允许标注；renderer 只渲染
 *   basename + 完整路径 tooltip，是否真能编辑取决于路径性质。
 */
export interface KairosContextPromptSegment {
  label: string;
  text: string;
  sourceFiles?: string[];
}

/**
 * Kairos 上下文快照。
 *
 * 通过 `kairos:get-context-snapshot` 按需拉取：controller 复用 runner 的依赖
 * （observeRefresh / shortTerm.load / activeBriefsCount）一次性组装出**如果现在 tick
 * LLM 会看到的内容**，不真正调用 LLM。renderer 关闭 Sheet 后即丢弃。
 *
 * 字段约定（v1.1）：
 * - 概览段已下线；Sheet 标题旁只渲染 `generatedAt`。
 * - `modelId` / `phase` / `systemPromptTokens` 暂时保留：未来在消息粒度展示 token 时
 *   还会用到，删了会牵动一堆 fixture，不值。
 * - `systemPromptSegments` 是 renderer 首选源；`systemPrompt` 保留为整篇拼好的原文，
 *   方便"复制全部"和未来对比/落盘。
 */
export interface KairosContextSnapshot {
  generatedAt: string;
  /**
   * Kairos 实际使用的模型 id：由 `settings.json` 的 `kairos.modelId` 解析、回落 Kairos
   * 默认模型后的真实 id（恒非空，与 LLM 真正调用的模型一致）。改设置页模型下拉会更新它。
   */
  modelId: string | null;
  phase: KairosContextPhase;
  systemPrompt: string;
  /** 基于 char-ratio 估算器（chars / 3.5）算出的整数 token 数。 */
  systemPromptTokens: number;
  /** 分段视图，renderer 据此渲染"系统提示词"块。 */
  systemPromptSegments: KairosContextPromptSegment[];
  historySummary: KairosContextHistorySegment[];
  historyMessages: KairosContextMessage[];
  tools: KairosContextTool[];
}

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
  /** Sheet 按钮按需拉取的上下文快照；renderer 不缓存，关闭即释放。 */
  getContextSnapshot(): Promise<KairosContextSnapshot>;
  briefsList(): Promise<KairosBriefsListResponse>;
  briefsRead(req: KairosBriefReadRequest): Promise<KairosBriefReadResponse>;
  briefsWrite(req: KairosBriefWriteRequest): Promise<KairosBriefWriteResponse>;
  briefsDelete(req: KairosBriefDeleteRequest): Promise<KairosBriefDeleteResponse>;
  notificationsList(): Promise<KairosNotificationsListResponse>;
  notificationsMarkRead(
    req: KairosNotificationsMarkReadRequest,
  ): Promise<KairosNotificationsMarkReadResponse>;
  notificationsRemove(
    req: KairosNotificationsRemoveRequest,
  ): Promise<KairosNotificationsRemoveResponse>;
  onEvent(listener: (event: SessionEvent) => void): () => void;
  onState(listener: (state: KairosRuntimeState) => void): () => void;
  onNotification(listener: (notification: KairosNotification) => void): () => void;
}
