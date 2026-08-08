# Kairos 自治模式设计

> 长期设计事实来源（design fact source）。本文档约束 actspace 桌面端 Kairos 自治模式的范围、模块边界、契约和交互；后续 execution plan 从本文档派生。

## 当前状态

- 状态：v1 代码已上线（2026-05-27）；端到端核心逻辑由 Kairos 单测保障，实机 GUI 验收待用户在本机 `pnpm dev:log` 跑一遍，见 `docs/histories/2026-05/20260527-2105-kairos-project-summary.md`。2026-05-28 补强默认初始化：Kairos 会创建独立 `<userData>/kairos/workspace/`，默认 `paths.json` 只授权该目录，避免后台自治默认读写应用仓库。2026-06-02 落地 Agent 文件收件箱：Main Agent / Lab Agent 只向 Kairos 留观察信号，Kairos 每次 tick 主动读取。2026-07-03 三项联动更新：(a) 系统提示词重写为「唤醒例程 + 闲时工作」骨架；(b) 旧 poll-on-tick 巡检管道（watch-scanner / watch-diff / paths.json `watch` 字段 / 设置页巡检开关）整体退役，目录变化感知归口 fs-watch 插件（`agent-plugins-fs-watch.md`）；(c) 工具守卫落地读写授权分离——`allowedRoots`（paths.json，可读写）+ `readOnlyRoots`（Skill 目录 + fs-watch 监听目录，只读）。同日深夜按实测反馈二次迭代：提示词升级为「执事」骨架（人设 + 信息渠道 + 场景应对表 + 笔记约定）、tick message 增加「任务表」行（active briefs 排班）与固定提醒后缀（`TICK_MESSAGE_REMINDER`）、briefs 目录并入 `readOnlyRoots`、first wake-up 标记改为"今日无短期记忆才携带"（修复 controller rebuild 反复投递首次唤醒）。
- 适用范围：`packages/agent-core`、`packages/desktop`（main / renderer）、`packages/shared` 三端联动。
- 关联 Skill：`.agents/skills/llm-agent-dev/references/agent-runtime/cron-job-kaiors.md`（核心理念出处，actspace 实现不再复述）。
- 参考实现：`back-code/heartclaw/apps/ruyi-api/src/core/agent/kairos_agent.py`（思路参考，actspace 不复用其代码，也不复用其"天工巡检"业务线）。
- 实施 plan：见 `docs/exec-plans/README.md` 中 `kairos_*` 一组。
  - ✅ `kairos_shared_contracts.md`（SessionEvent 4 个 Kairos type + `KairosEventRow` + `aggregateKairosEvents` + fixtures）— 2026-05-27 完成。
  - ✅ `kairos_config_and_tool_guard.md`（3 JSON+rule.md schema/loader + prompt-assembler[3]段 + ToolScheduler callerAgent + extractPaths + 6 工具 hook + Sleep 工具 + 39 单测）— 2026-05-27 完成。实施时务实调整：v1 未引入 zod/chokidar/micromatch，全部手写轻量实现；KairosConfigWatcher 简化为 controller 主动 reload（plan 5 接入）。
  - ✅ `kairos_short_term_memory.md`（ShortMemoryStore 移植自 heartclaw + SessionEventRingBuffer + KairosShortTermMemoryContext 按 token budget 加载 + sanitizeOrphanToolPairs + compressKairosSegments 调 LLMService + 20 单测）— 2026-05-27 完成。
  - ✅ `kairos_observe_and_briefs.md`（watch-scanner 手写递归 + WatchDiffEngine sha1 manifest + SessionsDigestBuilder 不挑食策略 + briefs parser/index-manager/dispatcher，27 单测）— 2026-05-27 完成。务实调整：briefs v1 改用 `intervalSec` 替代 5 段 cron；不引入 gray-matter/cron-parser/chokidar，配置写入时由 main IPC 主动调 `rebuildFromDisk()`。
  - ✅ `kairos_controller_runner.md`（KAIROS_SYSTEM_PROMPT + prompt-assembler 全段拼装 + clampSleep/sleepBias + MessageQueue + QueueProcessor 可中断 sleep 与熔断 + KairosRunner.processTick 提取 sleep 工具参数 + KairosController 闭环 + engine/loop.ts 加 `toolExecuteOptions` 透传，26 单测）— 2026-05-27 完成。务实调整：v1 不内建 `_internal/monthly-archive` brief；blocklist.timeWindows / tickBudget 不在调度层硬执行，靠 prompt 提示让 LLM 自尊重；configWatcher 由 main IPC 主动 await `reloadConfig()`。
  - ✅ `kairos_main_ipc_and_renderer.md`（`kairos-bootstrap.ts` scaffolding + LLM/ToolManager 工厂 + `kairos-ipc.ts` 5 invoke + 50ms debounce event/state 推送 + preload `window.kairos` + `KairosPage` 状态条/事件表/详情面板/4 个 raw config tab + `useKairos` hook + `agent:run` try/finally 调 `notifyMainAgentRun{Start,End}`，7 组件级单测）— 2026-05-27 完成。务实调整：不引入 zustand/router/Monaco；notes Tab 按决策不实现；`get-events-recent` 暂不回退 jsonl（ring 200 条够首屏）；main IPC 单测留给 e2e 实机验证补。
  - ✅ `20260602-kairos-agent-inbox.md`（Main Agent / Lab Agent → Kairos 的两份 Markdown 收件箱；Kairos 每 tick 读取，作为观察信号注入 prompt [5] 段；`inbox.ts` 提供 append-only 写入和摘要 loader）— 2026-06-02 完成。

## 设计动机

actspace 主链路是用户在 Composer 输入 → Agent 单轮 turn → 流式回填消息。这种链路完全被动：用户不发消息，Agent 永远不动。

Kairos 想解决的问题：

- 用户离开 Composer 后，让 Agent 能继续处理积压（读最近对话、检查 cron、写笔记、产生提醒）。
- 让用户在主聊天区随时拿回控制权，自治进度被 user 消息打断后无缝切换到交互模式。
- 让自治过程"可观察、可启停、可解释"，而不是黑盒的后台轮询。

Kairos 不是另一个 Agent，而是和现有 Agent 共享 LLM / 工具 / 长期记忆，但有独立 system prompt、独立短期记忆、独立事件流。

## 设计目标

- 单实例：actspace 一个实例只跑一个 Kairos，对应一个本地用户。
- 极致复用：除 `Sleep` 工具外，Kairos 完全复用主 Agent 的 LLMService / ToolManager / 工具集 / 上下文模块；用 `callerAgent` 标记区分行为差异。
- 事件驱动：tick / tool / reply / sleep / interrupt 全部表达为 `SessionEvent`，UI 是事件流的视图。
- 默认隐藏：`settings.kairos.featureEnabled` 缺失或为 `false` 时不展示产品入口，也不创建 Controller；用户只能从「设置 > Kairos」显式开放功能。
- 桌面端约束：通过 Electron IPC stream 暴露事件，不走 HTTP / WebSocket。
- 本地落盘：复用 actspace 现有 `SessionEvent` 格式，**`memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl` 是 Kairos 唯一持久化层**，覆盖运行记录、行动日志、事件流三种语义。
- 数据流稳健：运行时"先写盘成功，再 IPC 推送给前端"；刷新页面先从内存 ring buffer（最近 200 条 SessionEvent）回填，不够再读 jsonl。
- 控制动作需要回传最终权威态：`start / stop / reset_today` 这类命令在内部副作用完成后，controller 还要再 emit 一次完整 `KairosRuntimeState`，保证 renderer 看到的是最终 `enabled / state / counters` 组合，而不是中间态。
- 文件收件箱：Main Agent / Lab Agent 可以把希望 Kairos 后台观察、归纳、提醒或形成 Lab 候选的内容追加到各自 inbox Markdown；Kairos 每次 tick 读取这些文件，把它们当作观察信号，而不是用户当前输入或高风险动作授权。

### 三层状态边界

- `settings.kairos.featureEnabled` 是产品功能门控：决定 Kairos 是否出现在左侧栏、右侧对象启动页和对象菜单，以及 main 是否持有 Controller。默认 `false`。
- `preferences.json.enabled` 是自主循环意图：只在功能开放后生效，由 Kairos 页的「开启 / 暂停」控制。
- `budget-state.json` 的 `budget.enabled` 是额度护栏开关：不决定功能入口或自主循环是否存在。

关闭产品功能时，main 必须先把 `preferences.enabled` 持久化为 `false`，再停止并释放 Controller，避免留下不可见后台任务。重新开放功能只恢复入口和运行时能力，始终保持自主循环暂停；用户仍需在 Kairos 页显式开启。任务、记忆、模型、Skill 白名单及其他配置均保留。

## 非目标（v1 明确不做）

- 不接入"天工"或外部任务系统巡检。actspace 没有对应概念，先聚焦自治闭环。
- 不做工具白名单。Kairos 默认共享主 Agent 工具集；`blocklist.json` 走调度层硬限制，不是细粒度白名单。
  - 注：**成本配额护栏已落地**（2026-05-30，单一余额模型）。它不是"工具白名单"，而是在 tick 边界对累计花费做约束；详见 [额度护栏（单一余额）](#额度护栏单一余额) 章节。仅约束 Kairos 自治循环，不约束主 Agent。
- 不做 cron 任务管理面板。cron 工具可在后续单独 plan 引入；Kairos 页 v1 不做 cron 视图（briefs 内部走 cron-like 调度，但不暴露给主 Agent）。
- Kairos 模型 / 思考链：**真来源是 `settings.json` 的 `kairos` 分区**，不再使用 `KAIROS_MODEL_ID` / `KAIROS_THINKING` env，也不再从 `preferences.json` 读取模型。设置页「Kairos 自主智能体」分区只提供两个模型选项：`deepseek-v4-flash`（默认，落 `modelId: null`）与 `deepseek-v4-pro`（落 `modelId: "deepseek-v4-pro"`）；其它模型（包括 Kimi）对 Kairos 无效并回落 Flash。保存模型或 thinking 后 main 立即停旧 controller、重建 LLM，再按 `preferences.enabled` 恢复 Kairos 开关状态。
- 不做多设备 / 云端同步。短期记忆仅本地保存。
- 不做"取消天工任务"或子进程管理类工具。
- 不在 Electron 主进程做用户目录的 fs.watch 实时监听（config / briefs 目录是唯一例外——文件数少、稳定）。v1 曾用 tick-time poll diff 巡检，2026-07-03 退役后由独立 fs-watch 插件进程承担实时监听。
- 不做外部数据集成（飞书、Slack 等）。v2 再考虑，不在 v1 config 里预留 schema 文件。
- 不为 Kairos 单独造 `kairos_*` 业务工具。除 `Sleep` 外，read / list / grep / glob / write / edit / bash 全部复用主 Agent；访问控制走 ToolScheduler 的 `callerAgent` hook + 工具 definition 的 `extractPaths`。
- **v1 不做 `pinned.md` 机制**：不引入用户 ⭐ 钉住、不在 system prompt 留常驻笔记段、不做 `pinned-archive/`、不做 `kairos:pin-note` IPC。Kairos 笔记由用户在笔记 Tab 只读浏览。等用户反馈"我希望让 Kairos 长期记住某段笔记"再加。
- 不为 Kairos 加任何工具字段（不给 `edit_file` 加 append 模式；不给 `write_file` 加 mode 参数）。Kairos 想"追加笔记"走 read → edit_file 替换最后一段的现有路径——和主 Agent 改文件的方式完全一致。
- 不分离 events / journal / short-term 三套存储。**唯一持久化层是 short-term jsonl（SessionEvent 流）**，前端事件流通过聚合器（`aggregateKairosEvents`）从同一份数据计算得到。
- 不做复杂 Agent 消息总线。Main Agent / Lab Agent 到 Kairos 的 V0 通信只使用两份 Markdown inbox，不做 WebSocket、跨 Agent 直接聊天、ack 回执、锁文件或消息数据库。

## 架构总览

```
Renderer (KairosPage)
  ─ IPC ─▶ Main Process (kairos-ipc.ts)
                ─ 调用 ─▶ KairosController (agent-core/src/kairos/controller.ts)
                              ─ 编排 ─▶ MessageQueue
                                              ▲
                                              │ enqueue(tick) ◀── 尾递归调度
                                              │
                              ─ 消费 ─▶ QueueProcessor ─ tick ─▶ KairosRunner ─▶ runAgentLoop
                                                                                     │
                                                                                     ▼
                                                                              ToolManager (含 SleepTool)
                                                                                     │
                                                                                     ▼
                                                                              LLMService (共享)
  ◀── stream ── Main 转发 SessionEvent ◀── KairosController emit
```

四个层次的职责：

| 层 | 关键文件 | 输入 | 输出 |
|---|---|---|---|
| Renderer | `desktop/src/renderer/components/kairos/*` | 用户控制（启停、立即唤醒、过滤） | `KairosControl` 命令 + 订阅 `SessionEvent` 流，通过 `aggregateKairosEvents` 聚合渲染 |
| Main | `desktop/src/main/kairos-ipc.ts` | `KairosControl` | 调用 controller、转发事件、维护单实例 |
| Controller | `agent-core/src/kairos/controller.ts` | 启停命令 + LLM/Tool/ContextManager 依赖 | 先写盘 short-term jsonl 成功，再 emit `SessionEvent` 给 Renderer，同时维护 200 条 ring buffer |
| Runner | `agent-core/src/kairos/runner.ts` | 单条 tick `QueueMessage` | LLM 回复文本 + 工具调用副作用，事件通过 eventSink 写入 short-term + ring buffer + IPC |

## 模块分层

### `packages/agent-core/src/kairos/`

```
kairos/
  controller.ts            // KairosController：scheduler + runner + 配置/briefs 监听编排
  scheduler.ts             // MessageQueue + QueueProcessor（尾递归、可中断 sleep、熔断）
                           //   + sleepBias 夹紧 + timeWindow 拦截 + tickBudget 限额
  runner.ts                // KairosRunner：消费 tick / brief，独立上下文，调用 runAgentLoop
  prompt.ts                // KAIROS_SYSTEM_PROMPT 核心模板（不含 config 原文）
  prompt-assembler.ts      // 读 config + paths + rule.md + observe/ + inbox/，手动拼接 system 段

  context/                 // Kairos 专属上下文模块
    short-term.ts          // KairosShortTermMemoryContext（复用 heartclaw 算法）
    sessions-digest.ts     // 主 Agent sessions 摘要生成器
                           // （watch-scanner.ts / watch-diff.ts 已于 2026-07-03 退役，
                           //   目录变化感知归口 fs-watch 插件）

  config/                  // Config 加载与监听（preferences / paths / blocklist + rule.md）
    schema.ts              // zod schema + 默认值合并 + tip 字段约定
    loader.ts              // 读盘 + 校验 + 默认值
    watcher.ts             // chokidar 监听 config/ 和 briefs/，变更触发重载

  briefs/                  // Briefs 管理
    parser.ts              // frontmatter markdown 解析
    index-manager.ts       // index.json 状态机 + cron 触发
    dispatcher.ts          // 决定下次 tick 投递 brief 正文还是普通 <tick>

  storage/
    short-memory-store.ts  // jsonl + 月文件夹（移植 heartclaw）
    ring-buffer.ts         // 最近 200 条 SessionEvent，给前端首屏拉取
    notification-store.ts  // 通知中心持久化（memory/notifications.json，含可变已读状态）

  tools/                   // Kairos 专属工具
    sleep.ts               // Sleep 工具定义 + handler
    notify.ts              // notify_user：通知中心（见 agent-kairos-notifications.md）

  guard/                   // 主 Agent 工具的 callerAgent=kairos 路径校验
    extract-paths.ts       // 中心化 fallback：从工具 args 提取路径列表
    blocklist-check.ts     // glob 匹配 blocklist.paths

  compression/
    compressor.ts          // 复用主 Agent compressor + Kairos 专用 prompt 模板

  aggregator.ts            // 把 SessionEvent[] 聚合成 KairosEventRow[]（也导出给 shared）
  index.ts                 // 对外导出 createKairos(deps)
```

> 关键变化：
> - `kairos/tools/` 有 2 个专属工具：Sleep 与 notify_user（2026-07-04 通知中心上线）。原 list-sessions / read-session / write-note / pin-note / brief-update / scan-watch 全部由主 Agent 共享工具或 controller 内部逻辑替代。
> - 删除 `note-store.ts`：v1 没有 pinned.md / 归档 / token 限额，写笔记直接走主 Agent `write_file` / `edit_file`。
> - v1 曾有 `watch-scanner.ts` / `watch-diff.ts`（poll-on-tick 巡检），2026-07-03 随 fs-watch 插件上线整体退役。

### `packages/agent-core/src/context/modules/kairos-short-term.ts`

仿照 `ConversationContext`，但读写路径独立、最大轮次缩短，行格式与主 Agent `session.jsonl` 完全对齐（每行一条 `SessionEvent`）。

- 构造期接受 `kairosRoot: string`，读当天的 `<root>/memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl`。
- 运行期保留按 token 预算（默认 75% context window）加载的 SessionEvent 序列，配合 week/month/year summary 进 system prompt。
- 不复用 `ConversationContext`，避免与主 Agent session 互相污染。

### `packages/agent-core/src/engine/loop.ts`

Kairos 不新增 `Agent` 工厂入口，也不复用主 Agent 的 `ContextManager` 持有态实例。当前实现由 `KairosRunner.processTick()` 每次 tick 手动组装 `Context`，然后直接调用共享 `runAgentLoop`：

- `messages` 来自 Kairos short-term 记忆 + 当前 tick user message。
- `tools` 来自 Kairos 专属 ToolManager（主 Agent 共享工具集 + `sleep` + `notify_user`）。
- `toolExecuteOptions` 传 `{ callerAgent: "kairos", kairosGuard }`，让 ToolScheduler 启用 Kairos 路径与 blocklist 守卫。

主 Agent 入口 `createAgentForSession` 不变；它仍然通过 `Agent.run()` + `engine/bridge.ts` 处理普通会话。

### `packages/desktop/src/main/kairos-ipc.ts`

新增文件，集中处理 Kairos IPC：

- `kairos:read-config` / `kairos:write-config` 是常驻配置通道，在 Kairos 模型未配置、Controller 尚未创建时也必须注册，保证设置页可以读写本地配置。
- 其余运行态通道跟随 Controller 注册；仅当 `featureEnabled=true` 且模型可用时创建 Controller，不要求重启应用。功能关闭时配置通道仍可用，运行态通道不存在。

- `kairos:get-state` 返回当前 `KairosRuntimeState`（运行状态、计数器）。
- `kairos:get-events-recent` 从 ring buffer 返回最近 200 条 SessionEvent，不足时从 short-term jsonl 倒序补足。
- `kairos:control` 接收 `KairosControl`（start / stop / wake_now / reset_today）。
- `kairos:state` / `kairos:event` 由 controller emit 后通过 webContents.send 单向推到 renderer（沿用 `bridge.ts` 风格）。

### `packages/desktop/src/renderer/components/kairos/`

```
kairos/
  KairosPage.tsx                  // 顶层布局 + IPC 订阅 + 控制
  KairosControlBar.tsx            // 启停 toggle、立即唤醒、重置历史
  KairosStatusBanner.tsx          // 巨型状态 + Sleep 环形倒计时
  KairosPaceMetrics.tsx           // 4 张指标卡 + 24h 迷你时间轴
  KairosEventTable.tsx            // 左侧事件表，行可展开
  KairosEventDetail.tsx           // 选中事件的详情（thinking / 工具 i/o）
  KairosReplyPanel.tsx            // 最近 / 选中回复预览 + 完整模态
```

### `packages/shared/src/kairos-contracts.ts`

新增文件，是 renderer / main / agent-core 共用契约的唯一来源。详见 [契约定义](#契约定义)。

## 契约定义

> 全部类型放在 `packages/shared/src/kairos-contracts.ts`。命名风格沿用现有 `session.ts`、`ipc.ts` 习惯。

### 复用 `SessionEvent` + 扩展生命周期 type

**Kairos 的持久化事件就是 `SessionEvent`**，不再单独定义 `KairosEvent` 类型。仅在 `SessionEventType` 中扩展 4 个 Kairos 专属生命周期 type：

```ts
// packages/shared/src/session.ts 扩展
export type SessionEventType =
  | "user_message"               // 主 Agent / Kairos 共用（含 wake-now 注入的 tick 文本）
  | "assistant_message"
  | "assistant_reply"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "llm_usage"
  | "diff_preview"
  | "context_snapshot"
  | "error"
  // 新增（Kairos 专属，主 Agent 永远不发）
  | "kairos_tick_injected"       // controller 自动注入的 tick（区分用户 wake-now）
  | "kairos_sleep_start"
  | "kairos_sleep_end"
  | "kairos_sleep_interrupted";

// 对应的 payload 类型（追加到 session.ts）
export type KairosTickInjectedPayload = {
  trigger: "auto" | "wake_now" | "brief";
  briefId?: string;                    // trigger=brief 时给出
  content: string;                     // 注入到 user message 的内容
};

export type KairosSleepStartPayload = {
  plannedSeconds: number;
  reason: "after_tick" | "after_error" | "manual";
};

export type KairosSleepEndPayload = {
  actualSeconds: number;
};

export type KairosSleepInterruptedPayload = {
  reason: "user_message" | "wake_now";
  remainingSeconds: number;
};
```

落盘格式：`memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl` 每一行是一条 `SessionEvent`，结构与主 Agent session.jsonl **完全一致**，差异仅在：

- `sessionId` 使用 `kairos-YYYY-MM-DD` 格式（按日轮转的伪 session）
- 多出 4 个 `kairos_*` event type
- 主 Agent 不需要解析这些扩展 type 也能跑

### 前端聚合视图：`KairosEventRow`

前端不直接渲染 SessionEvent，而是通过聚合器把 events 折叠成"事件行"：

```ts
// packages/shared/src/kairos-contracts.ts
export type KairosRowKind = "tick" | "tool" | "reply" | "sleep" | "interrupt" | "error";

export type KairosEventRow = {
  id: string;                                // 聚合区间内首个 event id
  kind: KairosRowKind;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: "running" | "success" | "failed" | "interrupted";
  summary: string;                           // 表格列单行摘要
  relatedEventIds: import("./session").EventId[];  // 反查原始 SessionEvent[]
};

export function aggregateKairosEvents(events: SessionEvent[]): KairosEventRow[];
```

聚合规则：

| 行 kind | 来自哪些 SessionEvent |
|---|---|
| `tick` | 从 `kairos_tick_injected` 起，到该 turnId 的最后一个 event（含 thinking / tool_call / assistant_message） |
| `tool` | 一对：`tool_call` + 配对的 `tool_result`（按 `payload.id` / `toolCallId` 匹配） |
| `reply` | 单条：`assistant_message` 或 `assistant_reply` |
| `sleep` | 一对：`kairos_sleep_start` + `kairos_sleep_end` 或 `kairos_sleep_interrupted` |
| `interrupt` | 单条：`kairos_sleep_interrupted`（同时关闭对应的 sleep 行） |
| `error` | 单条：`error`（如发生在 sleep 期间，关闭 sleep 行） |

### Runtime state

```ts
export type KairosRunState =
  | "idle"          // 已启用但当前空闲，等待下一次 tick
  | "ticking"       // 正在跑一次 tick（LLM + 工具）
  | "sleeping"      // 上一次 tick 完成，进入可中断 sleep
  | "interrupted"   // sleep 期间被 user 消息打断
  | "stopped"       // 用户未启用 Kairos
  | "cooldown"      // 连续 tick 错误熔断中
  | "budget_exhausted";  // 额度余额 ≤ 0 被动暂停（区别于主动 stopped），不自动恢复

/** Kairos 额度护栏运行态（单一余额模型）。真相源 = memory/budget-state.json。 */
export interface KairosBudgetRuntime {
  enabled: boolean;          // 额度护栏开关；false = 无限运行，UI 不渲染额度块
  balanceCny: number;        // 剩余可花额度（¥）；运行时被扣减，用户随时可改；tick 边界检查，可能短暂为负
  exhausted: boolean;        // = enabled && balanceCny <= 0；为 true 时进入 budget_exhausted
}

export type KairosRuntimeState = {
  enabled: boolean;
  state: KairosRunState;
  budget: KairosBudgetRuntime;   // 始终存在（enabled=false 表示无限运行）
  sleepEndsAt?: string;
  todayTickCount: number;
  lastReplyAt?: string;
  toolCallCountInCurrentTick: number;
  totalSleepSecondsToday: number;
};

export type KairosControl =
  | { type: "start" }
  | { type: "stop" }
  | { type: "wake_now" }
  | { type: "reset_today" }
  | { type: "set_budget"; enabled: boolean; balanceCny: number };  // 设置页两个控件 → 写 budget-state.json
```

补充语义约束：

- `featureEnabled` 不属于 `KairosRuntimeState`，它是 settings 中的产品能力门控；renderer 在进入运行态页面前已经完成该层判断。
- `state` 描述调度器当前生命周期，例如 `sleeping`、`ticking`、`stopped`、`budget_exhausted`。
- `enabled` 描述用户意图上的 Kairos 开关，决定 Kairos 页主按钮显示“开启”还是“暂停”。
- 当 `stop()` 过程中 scheduler 先推送 `state: "stopped"` 时，controller 仍需在 `enabled = false` 落定后再补发一次 state，避免 renderer 停留在 `{ enabled: true, state: "stopped" }` 这样的中间组合。
- `budget` 是额度护栏运行态。注意区分两个 enabled：`budget.enabled`（额度护栏开关，用户没关）与 `runtimeState.enabled`（Kairos 总开关）。耗尽时 `runtimeState.enabled=false` + `state="budget_exhausted"`，但 `budget.enabled` 保持 true。详见 [额度护栏（单一余额）](#额度护栏单一余额)。

### IPC channels

| Channel | 方向 | Payload |
|---|---|---|
| `kairos:get-state` | renderer ↔ main | `void` → `KairosRuntimeState` |
| `kairos:get-events-recent` | renderer ↔ main | `{ limit?: number; before?: EventId }` → `SessionEvent[]`（ring buffer 不够时倒读 jsonl 补足） |
| `kairos:control` | renderer → main | `KairosControl`（含 `set_budget`：设置页改额度开关 / 剩余额度 → controller.setBudget → 写 budget-state.json） |
| `kairos:state` | main → renderer | `KairosRuntimeState`（runState 任意变更时推送） |
| `kairos:event` | main → renderer | `SessionEvent`（每条落盘成功后推送一次） |
| `app:shutting-down` | main → renderer | `void`（优雅退出开始的单向通知，renderer 据此弹关闭遮罩；裸字符串通道，不引入常量） |

> v1 不需要 `kairos:pin-note`（pinned.md 整套未启用）；后续若加 ⭐ 钉住功能再补该 channel。

## 事件存储与前端聚合

### 唯一持久化层

```
memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl     // 每行一条 SessionEvent
```

这一份 jsonl 同时承担三种语义：

- **运行记录**：给 LLM 加载历史用（heartclaw 短期记忆模式：token 预算 + 三层摘要）。
- **事件流**：给前端 KairosEventTable 用（通过 `aggregateKairosEvents` 聚合）。
- **行动日志**：未来如需"做了什么 / 为什么"视图，从 short-term 按 type 过滤即可（无需独立存储）。

短期记忆原本要交给 LLM 的字段（role / content / tool_calls / source）和前端要的字段（type / payload / timestamp / turnId）天然在 SessionEvent 里都齐了，**不需要再造任何中间结构**。

### 数据流：运行时

```
KairosRunner / scheduler 产生 SessionEvent
        ↓
[1] noteStore / shortMemoryStore.append(event)  ← 先写盘成功
        ↓
[2] ringBuffer.push(event)                       ← controller 内存缓存最近 200 条
        ↓
[3] main: webContents.send('kairos:event', event) ← 写盘成功后才推
        ↓
renderer 收到 event → events.push → 增量聚合 → 表格 patch
```

**关键约束**：

- **写盘必须先于推送**。如果磁盘写失败（极少见），不推送，错误进 `logs/`；前端永远不会看到没有落盘的事件，避免刷新页面后丢数据。
- ring buffer 是 main 进程内存，不持久化；进程退出即空，下次启动自然从 jsonl 重建。

### 数据流：启动 / 刷新

```
renderer 打开 Kairos 页 / 刷新
        ↓
IPC: kairos:get-events-recent({ limit: 200 })
        ↓
main:
  return ringBuffer.tail(limit)
        ↓
renderer 把返回的 events 喂给 aggregator → 渲染表格
```

v1 当前只从 main 进程内存 ring buffer 返回最近事件，`hasMore=false`；进程重启后不会从 short-term jsonl 回填首屏。后续如要做"加载更多历史"，再扩展 `kairos:get-events-recent({ before })`，从 `memory/short-term/` 倒序读取并与 ring buffer 去重合并。

### Ring buffer 设计

- 默认上限 200 条 SessionEvent，对应大约 30–50 个聚合 row、覆盖几小时活动。
- 数据结构：环形数组 + insertion order index，O(1) append / O(1) tail 切片。
- 不持久化，不跨进程。
- 当 controller 收到 `reset_today` 时清空 ring buffer。

### 主 Agent 工具持久化路径

主 Agent 既有的 `runAgentLoop` → `engine/bridge.ts` 把工具事件写入主 Agent session.jsonl 的逻辑**不需要改**。Kairos 走的是同一个 `runAgentLoop`，但事件 adapter 不同：Kairos 在 runner 内把同样的 AgentEvent 转换成 SessionEvent 后写入 Kairos 的 short-term jsonl，而不是主 Agent 的 session.jsonl。

> 当前实现方式：`KairosRunner.processTick` 直接调用 `runAgentLoop(context, llm, loopConfig, onEvent)`。这里的 `onEvent` 是 Kairos 专属 adapter：把 `tool_start` / `tool_end` / `message_end` 这类 `AgentEvent` 转为 Kairos short-term 使用的 `SessionEvent`，再交给 controller 的 `eventSink` 做"写盘 → ring buffer → IPC 推送"。
>
> `message_end (assistant)` 除了产出 `assistant_message` 外，还会按需要追加一条 `llm_usage` SessionEvent（payload = `LlmUsagePayload`），用于 KairosHeader 用量胶囊和未来日历视图聚合 token/成本。该事件**只用于持久化与展示**：`toLlmMessages` 不翻译 `llm_usage`，因此不会被回灌到 LLM messages 段、不影响下一轮 prompt。
>
> 价格按调用时 `packages/shared/src/model-config.ts` 的 pricing 快照计算并写盘；后续即使价格调整或模型下架，历史成本展示也保持稳定。模型未在注册表中匹配时 `cost.total` 为 0，但仍写一条 usage 事件保留 token 事实。
>
> **累加器（KairosUsageAccumulator，双维度）**：controller 维护**两份**内存 `KairosUsageSummary` —— `lifetime`（全期账，对应 `KairosRuntimeState.usageLifetime`）和 `sinceReset`（阶段账，对应 `usageSinceReset`）。每条 `llm_usage` 进 `eventSink` 后两份同步累加，debounce 写到 `<kairosRoot>/memory/usage-accumulator.json`（schemaVersion=2）。
>
> 设计原因：用户既要"全期总账"（看长期成本走势），又要"阶段账"（看本轮自治的开销）。两个维度的清零边界完全不同：
> - `lifetime`：**只有手动删 accumulator 文件**才会归零；`重置今日` 不动它。文件缺失/损坏时启动会扫描**全部短期记忆 jsonl 段**重建——"持久化历史即真相"。
> - `sinceReset`：`重置今日` 时清零，与 `todayTickCount` / `totalSleepSecondsToday` 同生命周期。文件被删时也会归零（reset 边界只能由 accumulator 文件维护）。
>
> v1 旧 schema（单维度 `summary` 字段）会被自动迁移到 v2：旧 summary 同时拷贝到 `lifetime` 和 `sinceReset`，作为升级锚点。

### 主 Agent vs Kairos 执行链路

主 Agent 和 Kairos **共用 LLM / ToolManager / ToolScheduler / runAgentLoop**，但外壳不同。不要为 Kairos 复制一套工具执行器，也不要让 Kairos 写主 Agent 的 session。

| 层 | 主 Agent | Kairos |
|---|---|---|
| 触发源 | 用户在 Composer 发消息 | scheduler 投递 tick / brief / wake_now |
| 入口文件 | `desktop/src/main/agent-run.ts` → `engine/bridge.ts` → `Agent.run()` | `kairos/controller.ts` → `kairos/scheduler.ts` → `kairos/runner.ts` |
| user message | 真实用户输入，写入主 session | controller 注入的 tick 文本，写入 Kairos short-term |
| system prompt | `prompt/main-agent.ts` + 主会话上下文 | `kairos/prompt.ts` + config tips / rule.md / 历史摘要（低频内容；观测增量走 tick message） |
| 工具注入 | `Agent.run()` 从 ToolManager 注入 tools | `KairosRunner.processTick()` 从 ToolManager 注入 tools |
| 工具执行 | `ToolManager.execute()` | 同一个 `ToolManager.execute()`，额外传 `callerAgent: "kairos"` |
| 工具守卫 | workspaceRoot 单根守卫 + 工具自身权限 | allowedRoots + blocklist + toolsDenied + 工具自身权限 |
| 流式事件 | `RuntimeStreamEvent` → `agent:stream` → 聊天区 | `SessionEvent` → `kairos:event` → Kairos 事件流 |
| 持久化 | 主会话 `session.jsonl` | `kairos/memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl` |
| 结束后语义 | 一轮对话完成 | 一次 tick 完成，scheduler 根据最后一次 `sleep(seconds)` 进入可中断 sleep |

关键原则：

- `runAgentLoop` 是唯一工具循环内核。主 Agent 和 Kairos 的差异只存在于调用前的 context 组装、调用时的 options、调用后的事件 adapter。
- `engine/bridge.ts` 只服务主 Agent 的聊天流；Kairos 不走这个 bridge，以免把后台事件写进用户会话。
- `kairos/runner.ts` 是 Kairos 的 bridge。它只把 Kairos 需要重放和展示的事件落成 `SessionEvent`：`tool_call`、`tool_result`、`assistant_message`，再配合 scheduler/controller 产生 `kairos_tick_injected`、`kairos_sleep_*`。

### Kairos 工具能力矩阵

Kairos 可见工具由三步决定：

1. `desktop/src/main/kairos-bootstrap.ts#createKairosToolManagerFactory()` 创建 Kairos 专属 ToolManager 工厂，把 `env.disabledTools` 与 `config.blocklist.toolsDenied` 合并为 `disabledTools`。
2. `agent-core/src/tools/index.ts#createToolManager()` 注册主 Agent 同款基础工具，并按 provider / Kimi key / disabledTools 过滤。
3. `agent-core/src/kairos/controller.ts#createKairos()` 调用 `registerKairosTools(toolManager)` 追加 Kairos 专属 `sleep`。

最终在 `agent-core/src/kairos/runner.ts#processTick()` 里执行：

```ts
const tools = this.opts.toolManager.getAll().map(toToolDefinition);
```

这行得到的工具定义数组就是本次 tick 真正传给 LLM 的 tools 段。LLM 只看到工具的 `name / description / parameters`，看不到 executor 代码。

| 工具 | 来源 | 默认可见性 | 参数入口 | Kairos 额外约束 |
|---|---|---|---|---|
| `sleep` | Kairos 专属 | 可见 | `kairos/tools/sleep.ts` | 只记账；真正 sleep 由 scheduler 根据最后一次合法调用执行 |
| `read_file` | 主 Agent 共享 | 可见 | `tools/tools/read-file/definition.ts` | path 必须落在 `paths.json` allowedRoots，且不命中 blocklist |
| `list_directory` | 主 Agent 共享 | 可见 | `tools/tools/list-directory/definition.ts` | 同上 |
| `grep` | 主 Agent 共享 | 可见 | `tools/tools/grep/definition.ts` | 同上 |
| `glob` | 主 Agent 共享 | 可见 | `tools/tools/glob/definition.ts` | 同上 |
| `write_file` | 主 Agent 共享 | 可见 | `tools/tools/write-file/definition.ts` | 同上；默认相对路径写到 Kairos workspace |
| `edit_file` | 主 Agent 共享 | 可见 | `tools/tools/edit-file-diff/definition.ts` | 同上；追加内容仍走 read → edit 的普通替换路径 |
| `bash` | 主 Agent 共享 | 取决于 env/config | `tools/tools/bash/definition.ts` | 建议默认放入 `toolsDenied`；命令字符串难精确提取路径，主要靠整工具禁用管控 |
| `web_search` | 主 Agent 共享 | 任一搜索 provider key 存在时可见 | `tools/tools/web-search/definition.ts` | 无路径参数，不走 allowedRoots；仍可被 `toolsDenied` 禁用 |
| `web_fetch` | 主 Agent 共享 | 始终可见 | `tools/tools/web-fetch/definition.ts` | 无路径参数，不走 allowedRoots；仍可被 `toolsDenied` 禁用 |

新增工具时必须同时回答三个问题：

1. 是否应该进入 `createToolManager()` 的共享工具集？如果只服务 Kairos，放到 `kairos/tools/` 并由 `registerKairosTools()` 注册。
2. 是否有路径参数？有则在工具 definition 上实现 `extractPaths`，否则 Kairos guard 不能可靠判断 allowedRoots / blocklist。
3. 前端如何展示？如需 richer preview，扩展共享 `ToolUiPreview` 和主 Agent bridge；Kairos 事件流至少要能通过 `tool_call.arguments` 与 `tool_result.summary` 展示基础详情。

### Kairos 工具事件推送契约

Kairos 工具调用必须形成稳定的事件对：

| 内部事件 | Kairos `SessionEvent` | payload 关键字段 | 前端聚合 |
|---|---|---|---|
| `tool_start` | `tool_call` | `{ id, name, arguments }` | 创建 `工具执行` 行，状态 `running` |
| `tool_end` success | `tool_result` | `{ toolCallId, toolName, ok: true, summary, modelOutput }` | 匹配同 id 工具行，状态 `success` |
| `tool_end` error/cancelled | `tool_result` | `{ toolCallId, toolName, ok: false, summary/modelOutput }` | 匹配同 id 工具行，状态 `failed` |

推送顺序：

```
LLM 产生 tool call
  -> runAgentLoop emit tool_start
  -> KairosRunner 转为 tool_call
  -> controller.eventSink 先写 short-term jsonl
  -> ringBuffer.push
  -> kairos:event 推给 renderer
  -> ToolManager.execute
  -> runAgentLoop emit tool_end
  -> KairosRunner 转为 tool_result
  -> 同样写盘、入 ring、推 IPC
  -> renderer aggregateKairosEvents 折叠为一行工具执行
```

约束：

- 只要工具真正进入执行流程，就必须先看到 `tool_call`，再看到同 `toolCallId` 的 `tool_result`。guard 拒绝、权限拒绝、工具不存在也应表现为 `tool_result.ok=false`，而不是静默消失。
- `tool_call.payload.arguments` 是观察 Kairos 给工具传参的事实来源；KairosPage 右侧"工具结果 / 输入"直接从这里展示 compact JSON。
- `tool_result.payload.modelOutput` 是回填给 LLM 的工具输出；`summary` 是给 UI 和快速阅读用的短摘要。后续做输出压缩时，不要把 UI 摘要、模型回填和排障日志混成一个字段。
- Kairos v1 不推主 Agent 的 `RuntimeStreamEvent`，因此不会展示 `tool_call_delta` 级别的 partial args preview。Kairos 事件流展示的是执行开始与执行结束两个稳定点。

## Tick 调度规则

Kairos 内部沿用 skill `cron-job-kaiors.md` 中的尾递归调度模式，actspace 收敛掉与 cron 相关的优先级条目（v1 不接 cron）。

队列优先级：

| 优先级 | mode | 来源 |
|---|---|---|
| 0 | user | 主 Agent 用户消息（不进入 KairosQueue，单独通过 wake 信号打断 sleep） |
| 1 | tick | 尾递归注入或 wake-now |

调度流程：

```
启用时        ─▶ 等待 5s ─▶ 队列空 ─▶ 注入第一个 tick
处理一次 tick ─▶ 抓取 Sleep 秒数（从工具调用记录里）
            ─▶ 进入可中断 sleep
                    ├── sleep 自然结束 + 队列空 ─▶ 注入下一个 tick
                    └── user 消息事件触发 wake ─▶ 跳过下一次 tick，等用户消息处理完后回到调度
连续 tick 失败 ≥ 5 次 ─▶ 进入 cooldown 60s，再回到第一个 tick
```

打断信号的实现：

- 主 Agent runTurn 入口在执行前 emit `kairos.wake()` 信号。
- KairosController 把信号映射为 `QueueProcessor.waitForWake` 的 resolve，使可中断 sleep 立即返回。
- 主 Agent runTurn 完成后，KairosController 不立刻注入 tick（避免和 user/Assistant 流抢资源），等队列再次空闲且当前 `KairosRunState` 仍为 enabled 才注入。

> 关键不变量：**KairosRunner 永远不消费 user 消息**。user 消息只走主 Agent；Kairos 只消费 tick。

## 上下文输入分类

Kairos 的输入分为 5 大类，按"代码硬判断 vs LLM 软提示"两个维度组合。**关键不变量：JSON 配置原文永远不进 system prompt，进 prompt 的是代码读取后手动拼接的 tip 字符串。**

| 类别 | 加载机制 | 硬判断（代码层） | 软提示（system prompt） |
|---|---|---|---|
| **长期偏好（config）** | 启动一次性读 + chokidar 监听重载 | `preferences.sleepBias` 夹紧 sleep / `blocklist.paths` 拦工具 / `blocklist.timeWindows` 拦 tick | `preferences.tip` + `paths.tip` + `blocklist.tip` 拼接 |
| **主动任务（briefs）** | 调度器读 frontmatter，触发时投递 | cron 表达式调度 | 任务索引段一行摘要；触发时整篇 markdown 投到 user message |
| **自身记忆（memory）** | token 预算 + 多层摘要 | short-term 压缩触发 | summaries 进 system [6] 段；原文 jsonl 进 messages [A] 段 |
| **外部观测（observe）** | tick 前重算 | sessions-digest 重算（巡检 diff 已退役，目录变化走 fs-watch Skill） | sessions-digest 拼字符串 |
| **Agent 收件箱（inbox）** | 每次 tick 读取两份 Markdown | 只做文件存在性、读取长度和截断保护；每份最多取最近 8 条 / 1800 字符，两份合计 3000 字符 | Main Agent / Lab Agent 留给 Kairos 的观察信号，拼入 system [5] 段 |

### 关键不变量

1. **JSON 原文绝不进 system prompt**。所有 config 文件由 `prompt-assembler.ts` 读取后拼接成人话；LLM 看到的是 `tip` 字段和精简过的 paths 列表，看不到 `sleepRangeSeconds.min=30` 这种结构。
2. **rule.md 是 LLM 看到的唯一长文本规则**。其它配置文件的复杂结构由代码负责执行；用户想给 LLM 加规则，写到 rule.md 里。
3. **第 4 类绝不进上下文原文**。主 Agent session.jsonl 可能几十万 token——只有计数 + top N 路径进 prompt，原文走主 Agent 的 read_file / list_directory 等工具按需 fetch。
4. **briefs 任务正文只在被触发时注入**。任务索引（id/cron/status）在 system 段维持极简列表，正文等到任务真正执行那一刻再塞进 user message。
5. **短期记忆是无限期累积的**，没有"清理"概念，只有压缩到更高层（week → month → year）。
6. **inbox 是信号，不是授权**。Main Agent / Lab Agent 写入的内容只能提示 Kairos 观察、归纳、提醒或建议创建 Lab 实验；涉及修改代码、运行高风险命令、晋升能力或改变默认工具集时，仍走原有权限和评审边界。

## 上下文构成

KairosRunner 每次 tick 由 `prompt-assembler.ts` 组装上下文。**LLM 看到的 system prompt 只有 4 段低频内容，全部由代码读 config + 文件后手动拼接字符串，永远不出现 JSON 原文。** 每 tick 必变的内容（时间 / phase / 观测增量）一律走 tick message（见下文 Messages 段），保证 system prompt 在配置不变时逐字节稳定、可被 DeepSeek 前缀缓存复用（详见 `docs/design-docs/kairos/agent-kairos-prompt-cache-optimization.md`）。

### System Prompt 段（4 段，低频内容，缓存友好）

```
[1] 核心指令段       ~1100 tokens  prompt.ts 模板：{soul} 人格插槽（config/soul.md，用户可改，
                                  空白 fallback 内置默认；预算 500 token）+ 机制段（产出契约 /
                                  信息渠道 / 唤醒例程 / 场景应对 / 笔记约定 / 闲时工作 / pacing / 读写边界）
[2] 配置提示段       ≤ 600 tokens  3 份 config 的 tip 拼接 + paths 列表（path + tip）
[3] 用户规则段       ≤ 1500 tokens config/rule.md 全文（用户写的纯文本规则）
[4] 历史摘要段       ≤ 3000 tokens memory/short-term/ 加载的 week/month/year summary 文件（最末段；只在压缩产出新摘要时变化）
```

> 2026-07-04 起 [1] 段拆出 **soul 人格插槽**：身份/气质/语气由 `config/soul.md` 承载（设置页
> 「Kairos → 人格」预设下拉 + 文本框可改），机制段仍由代码维护、不可被用户覆盖。
> 分层设计、预设字典与被排除方案（全量覆盖 / 双层 overlay）见 `docs/design-docs/kairos/agent-kairos-prompt-design.md`。

> 原"时空环境段"和"观测摘要段"已移出 system prompt：时间/phase/任务表与观测**增量**
> （未读 sessions、inbox 新消息）由 `assembleTickMessage` 拼进每个 tick 注入的
> user message。历史 tick 消息里的增量合起来即完整时间线，重放无冗余快照。
> 2026-07-03 起观测增量只剩两个来源（sessions + inbox）；目录变化感知归口 fs-watch Skill，
> 由系统提示词的「唤醒例程」引导 Kairos 每次醒来主动读取。

> v1 删除了原"常驻笔记段（pinned.md）"。Kairos 自己写的笔记不强制进 prompt——它每次 tick 通过 short-term 短期记忆能看到自己最近写过什么，足够形成连续性。等用户提需求再恢复 pinned 段。

[2] 配置提示段的拼接示例：

```
## 配置提示

[preferences] 我在工作时段更活跃，安静时段请少打扰；睡眠时长由我设置，超出会被夹紧。
[paths] Kairos 可读写的本地路径：
  - /Users/.../actspace-agent  →  actspace 项目根目录
  - /Users/.../actspace-agent/docs  →  我的设计文档目录
  - <userData>/sessions/actspace-agent  →  主 Agent 的 session 存储
[blocklist] 含密钥的目录已被屏蔽，命中后工具会直接拒绝，不必绕路。
```

> LLM 看不到 `sleepRangeSeconds.min=30` 这种结构数据，也看不到 blocklist 的具体 glob 列表——这些都是代码硬判断的输入，给 LLM 看反而干扰判断。

### Messages 段（按 token 预算从新到旧加载）

```
[A] 短期记忆原文          按预算       memory/short-term/<month>/<day>.jsonl（最新 segment；
                                      thinking / assistant_message / tool_call 按"同回合合并"还原为
                                      与现场逐字节一致的 assistant 消息，thinking 块含 signature）
[B] 当前 tick user msg    动态         assembleTickMessage 输出：<tick> 包裹的
                                      [当前时间(分钟粒度)/phase] + [任务表]（active briefs 的
                                      id + 下次执行时间，上限 8 项，空表输出「空」）+ 观测增量
                                      （未读 sessions / inbox 新消息；空增量输出
                                      "自上个 tick 无新观测"）+ 任务正文（仅 brief tick）
                                      + 固定提醒后缀（TICK_MESSAGE_REMINDER，逐 tick 一致，
                                      把"数据源要自己读 / 安静才许睡"钉在决策点旁边，
                                      对抗系统提示词被长历史稀释）。
                                      与 kairos_tick_injected.payload.content 为同一字符串：
                                      发送 = 落盘 = 重放。
```

> 观测增量的游标（sessions lastSeenTurnId / inbox 已读水位）只在 tick
> 正常闭合后提交；失败 tick 不提交，下个 tick 重见同批增量。打开上下文 Sheet 只计算
> 不提交，不会"看一眼就吃掉观测"。

### Tools 段（v1 工具集）

| 工具 | 来源 | 备注 |
|---|---|---|
| `Sleep` | Kairos 专属 | 仅 Kairos 注册 |
| `read_file` / `list_directory` / `grep` / `glob` | 主 Agent 共享 | 经 ToolScheduler `callerAgent=kairos` 走 blocklist 校验 |
| `edit_file` / `write_file` | 主 Agent 共享 | 同上 |
| `bash` | 主 Agent 共享 | 默认禁用；用户从 `blocklist.toolsDenied` 移除 `"bash"` 后才会暴露给 Kairos |
| `web_search` / `web_fetch` | 主 Agent 共享 | `web_search` 看搜索 key、`web_fetch` 始终可见；均可被 `toolsDenied` 禁用 |

工具集**不再有 `kairos_*` 业务工具**。访问控制走 ToolScheduler 的 hook，完整矩阵见上文 [Kairos 工具能力矩阵](#kairos-工具能力矩阵)，实现细节见后文 [工具系统扩展](#工具系统扩展callerAgent--extractPaths)。

## actspace 版 KAIROS 系统提示词

`packages/agent-core/src/kairos/prompt.ts` 维护 [1] 段核心指令模板。2026-07-03 深夜二次重写为「唤醒例程 + 场景应对」骨架（同日第一版「唤醒例程」实测修正了"无脑 sleep"，但暴露新问题：Kairos 读到 fs-watch 变化后只口头总结一句就睡，不知道具体场景该做什么；first wake-up 的保守指令还会压过例程）。2026-07-04 身份段拆为 `{soul}` 插槽（默认「时机之神」人格，塞巴斯执事设定废弃），产出契约独立成段：

- **身份段（{soul} 插槽）**：默认人格为「时机之神」——名字取自 καιρός（恰当的时机），平时安静观察整理、时机到来果断出手、汇报简洁克制。用户可通过设置页预设（默认/极简/技术流/温暖陪伴）或自定义 soul.md 替换；人设提供气质、术语保持工程精确，不做全文角色扮演（防弱模型混淆比喻与指令）。
- **产出契约段**（原写在身份段内，soul 拆槽后独立为机制段，用户改人格不会弄丢它）：**每 tick 合格产出至少一种——任务成果 / notes 笔记 / 给用户的简短汇报建议，一个 tick 没留下其一就等于白醒（全安静除外）**。
- **信息渠道段**：把 Kairos 的全部上下文来源列成"渠道说明书"——任务表（briefs，到期投正文 / 头部列排班 / briefs 目录可读原文）、观测增量（sessions + inbox）、持续数据源型 Skill（不送上门，要自己读）、rule.md（优先级高于一般建议）、配置提示（代码强制，无需二次判断）。
- **唤醒例程（1→6）**：任务正文优先 → 读观测增量 → 查数据源 Skill → 有变化对照场景应对 → 全安静做闲时工作 → sleep 收尾。
- **场景应对表**（新增，替代第一版抽象的"至少产出一件事"；表首注明**授权覆盖原则**——rule.md 里的场景规则优先于本表默认动作，本表只是兜底）：监听目录新建文本类文件 → 读内容 + 记观察笔记；密集修改 → 记"正在编辑"，平息后再复盘；删除/重命名 → 记一笔；sessions 新对话 → 复盘更新主题笔记；inbox 新留言 → 整理或形成提醒。非文本/大文件只记事件不读内容。
- **笔记约定**（新增，固定落点消除犹豫）：当日观察流水 `notes/observations/<YYYY-MM-DD>.md` + 长期主题笔记 `notes/<主题>.md`，追加走 read → edit_file。
- **闲时工作清单**：复盘最近会话 / 整理 notes / 推进"待续"事项 / 形成给用户的建议；一个 tick 做一件，防刷笔记烧钱（tickBudget + 额度护栏仍在代码层兜底）。
- **Pacing**：sleep 是例程终点而非默认选项；quiet/off 时段例程照常执行（读数据源不打扰用户），只是间隔更长、汇报更简——堵住"省资源所以跳过例程"的推理路径。
- **First wake-up 与例程解除冲突**：首个 tick 先只读勘察，但发现变化同样按场景应对处理，不得以"首次唤醒"为由跳过。
- 保留 Staying responsive / Be concise / actspace 专属约束（无 cron / 外部系统；任务表调度由宿主代码完成）。
- **Workspace boundary 读写分离表述**（与 guard 的 `allowedRoots` / `readOnlyRoots` 硬约束一致）：

  > 读和写的授权范围不同，都由代码强制执行：
  > - **可读**：配置提示段的 paths 列表、已启用 Skill 的目录、文件监听（fs-watch）正在监听的目录、任务表目录（briefs/）。
  > - **可写**：仅限 paths 列表内的路径（默认只有你自己的 workspace）。

**tick message 固定提醒后缀（`TICK_MESSAGE_REMINDER`）**：每条 tick 消息末尾原样携带 3 行提醒（"观测增量不含数据源 Skill 输出，需自行读取；发现变化对照场景应对；全部安静才许 sleep"）。动机：系统提示词在长上下文最前端，随 short-term 历史增长（7k+ tokens）会被稀释，且历史里几十条"无观测 → sleep"先例形成行为惯性压过指令（2026-07-03 实测：重置 short-term 前 Kairos 完全无视例程）。固定后缀贴着模型每 tick 必读的决策点，逐 tick 完全一致（历史中重复携带，所以必须短）。

**first wake-up 标记的注入条件收紧**：`controller.start()` 投递的首个 tick 只在**今天（当前分卷）还没有任何短期记忆**时携带 `<tick first wake-up/>`。此前无条件携带，settings 变更引发的 controller rebuild 会让 Kairos 一天内收到多个"首次唤醒"（实测模型困惑并重复勘察）；已有今日记忆说明环境是熟悉的，投普通 tick 即可。reset_today 后新分卷为空，下次 start 自然重新视为首次唤醒——语义正确（记忆确实清了）。

`prompt.ts` 模板的占位符（由 `prompt-assembler.ts` 替换；只允许低频内容，
每 tick 必变的时间 / phase / 任务表 / 观测增量由 `assembleTickMessage` 进 tick message）：

```
{config_tips_block}     // [2] 段拼好的字符串（含 paths 列表）
{skill_catalog}         // Kairos Skill 白名单 catalog（改 enabledSkills 时随 controller 重建更新）
{user_rules}            // config/rule.md 全文（[3] 段）
{history_summary}       // working memory loader 输出的 summary 段（[4] 段，模板最末）
```

## 存储布局

```
<userData>/kairos/
  ├─ workspace/                     # Kairos 默认工作空间；文件工具相对路径默认落这里
  │   └─ notes/                     # Kairos 写给自己/用户看的札记（走 write_file / edit_file）
  │       └─ 2026-05/
  │           └─ 2026-05-27-insight.md
  │
  ├─ config/                        # 类别 1：长期偏好（3 份 JSON + 2 份 markdown）
  │   ├─ preferences.json           # 全局开关 / 模型 / sleep 范围 / tickBudget / 熔断 / 节奏偏好
  │   ├─ paths.json                 # Kairos 可读写的路径列表
  │   ├─ blocklist.json             # 路径黑名单 / 工具禁用 / 时间窗 / 单 tick 工具调用上限
  │   ├─ rule.md                    # 用户写给 Kairos 的纯文本规则，全文注入 [4] 段
  │   └─ soul.md                    # 人格插槽（2026-07-04 新增），注入 [1] 段开头的 {soul}；空白 fallback 内置默认
  │
  ├─ briefs/                        # 类别 2：用户主动任务
  │   ├─ index.json                 # 任务索引 + 状态机（id / status / lastRun / nextRun）
  │   └─ tasks/                     # 单任务 Markdown（frontmatter 元信息 + 正文）
  │       └─ <task-id>.md
  │
  ├─ inbox/                         # 类别 5：其它 Agent 写给 Kairos 的收件箱
  │   ├─ main-agent.md              # Main Agent 追加的观察信号、重复失败、用户偏好、Lab 候选
  │   └─ lab-agent.md               # Lab Agent / Lab Runtime 追加的实验观察请求和待跟进事项
  │
  ├─ memory/                        # 类别 3：Kairos 自身记忆（唯一持久化层）
  │   ├─ state.json                 # 启用状态 + active segment + last tick 位置
  │   ├─ usage-accumulator.json     # token/成本双维度累加器（lifetime + sinceReset，只增不减的统计事实）
  │   ├─ budget-state.json          # 额度护栏运行态：{ enabled, balanceCny }（可花余额，会被扣减且用户可改）
  │   ├─ short-term/                # 滚动记忆体（heartclaw 模式 + actspace SessionEvent 格式）
  │   │   ├─ 2026-05/
  │   │   │   ├─ 2026-05-27.jsonl            # 每行一条 SessionEvent
  │   │   │   ├─ 2026-05-27_001.jsonl        # reset_today 后的新段
  │   │   │   └─ week_05-17_to_05-23.summary.md
  │   │   ├─ 2026-04/
  │   │   │   └─ month_2026-04.summary.md
  │   │   └─ year_2025.summary.md
  └─ observe/                       # 类别 4：外部观测快照（每次 tick 前重算）
      ├─ sessions-digest.json       # 主 Agent session 列表精简摘要
      ├─ sessions-state.json        # sessions 已读游标
      └─ inbox-state.json           # inbox 已读水位
```

> `observe/watch-manifests/` 已随巡检管道退役（2026-07-03）；旧安装遗留的该目录无害，可手动删除。

> 注意：相比初版**已删除** `events/` 和 `journal/` 目录、`config/integrations.json`、`briefs/interests.md`、`briefs/do-not.md`、`memory/notes/pinned.md`、`memory/notes/pinned-archive/`。前者由 short-term 唯一承载；中间者用户应直接写到 `rule.md`；pinned 整套 v1 不做。

### 关键约定

- 启动时 controller 顺序读 `config/preferences.json` → `memory/state.json`，按 `preferences.enabled` 决定是否恢复 ticking；其他 config 在首次需要时懒加载，且由 chokidar 监听 mtime 变化触发热重载。
- `memory/short-term/` 完全复用 heartclaw `ShortMemoryStore` + `ShortTermMemoryContext` 模式，但**每行是 `SessionEvent`**（与主 Agent session.jsonl 完全对齐），不是 heartclaw 的 message dict。**唯一其它调整**：tick 密度高，token 预算"加载上限"从默认 60% 提到 75%，压缩触发阈值仍为 85%。
- `workspace/` 是 Kairos 的默认读写根。`kairos-bootstrap.ts` 创建 ToolManager 时把 `workspaceRoot` 指向这里，默认 `config/paths.json` 也只把这里放进 `allowedRoots`。用户要让 Kairos **写**其它项目目录，必须显式编辑 `paths.json`；只想让它**读**某个目录，把目录加进「文件监听」（fs-watch）即可，监听目录会自动并入只读授权。
- `workspace/notes/` 由 bootstrap/controller 预创建，供 Kairos 用共享文件工具写札记；当前 Kairos 文件工具的相对路径默认落到 `workspace/`，因此 prompt/rule 里的笔记路径应写成 `notes/<YYYY-MM>/<title>.md` 这类 workspace 内相对路径。
- `inbox/` 是其它 Agent 写给 Kairos 的输入信号目录，由 bootstrap 幂等创建；Kairos 每次 tick 直接读取，不需要通过 LLM 文件工具访问，也不受 `paths.json` 是否授权 workspace 的影响。
- `reset_today` 控制命令对当天 jsonl 走 `rotate_daily` 创建新 segment（不删除旧段，便于后续压缩），同时清空 ring buffer 和当日运行计数；后续 tick 的短期记忆加载只会读“当天最新 segment”，因此从 LLM 视角等价于“今天重新开始”。`workspace/notes/` 不动，避免误删用户/Kairos 已沉淀的内容。
- renderer 收到 `reset_today` 成功返回后，应立刻把本地执行列表、轨迹和详情区清空，回到“今日初始空态”；下一次 tick 再从新 segment 重新长出内容。
- 任意时刻"Kairos 在做什么"都可以通过 `short-term/<YYYY-MM>/<today>.jsonl` 还原——这是 v1 的唯一可观测数据源，任何排查都从这里看起。

## Agent 文件收件箱

Kairos 是主动运行的后台 Agent，因此 Agent 间通信的最小可用形态不是让 Main Agent / Lab Agent 直接和 Kairos 对话，而是让它们把观察信号写入 Kairos 的文件收件箱，由 Kairos 在每次 tick 开始时主动读取。

V0 固定两份 Markdown：

```text
<userData>/kairos/inbox/main-agent.md
<userData>/kairos/inbox/lab-agent.md
```

### 通信方向

| 文件 | 写入方 | 读取方 | 典型内容 |
|---|---|---|---|
| `inbox/main-agent.md` | Main Agent | Kairos | 重复失败、用户长期偏好、当前会话暴露的能力缺口、建议创建 Lab 实验的线索 |
| `inbox/lab-agent.md` | Lab Agent / Lab Runtime | Kairos | 需要后台继续观察的实验、等待更多证据的能力缺口、blocked 实验的提醒、待用户决策事项 |

Main Agent 和 Lab Agent 只负责追加信息。Kairos 不要求它们维护复杂状态，也不要求它们读取 Kairos short-term 记忆。V0 的自动写入只走文件末尾 append，不做 `## Pending` 中间插入，也不自动移动到 processed 区。

### Markdown 格式

每条消息追加到文件末尾（即默认模板的 `## Pending` 区下方），推荐格式：

```markdown
### 2026-06-02T11:50:00+08:00 | priority: normal | topic: 前端验证反复失败

- from: main-agent
- relatedSessionId: session_xxx
- relatedExperimentId: none
- workspaceRoot: /path/to/workspace

Main Agent 最近在桌面端前端验证时多次卡在浏览器 mock。
请 Kairos 后续观察是否这是重复能力缺口；如果是，可以建议创建 Lab 实验。
```

字段保持轻量：标题里的时间、priority 和 topic 供 Kairos 快速判断新近程度与重要性；正文用自然语言写清希望 Kairos 观察、归纳、提醒或建议的内容。`relatedSessionId`、`relatedExperimentId`、`workspaceRoot` 都是可选线索，不要求每条都有。

### 读取规则

- `prompt-assembler.ts` 每次 tick 读取两份 inbox，按**已读水位**（`observe/inbox-state.json`，消息块头时间戳即天然游标）过滤出新消息，截断后拼入 tick message 的「观测增量」节；全部来源无新消息时整节省略。水位只在 tick 正常闭合后提交。
- `OBSERVATION_TOKEN_BUDGET` 为 1200 token；inbox 子预算为每份最多最近 8 条消息 / 1800 字符，两份合计 3000 字符，不能把 sessions digest 完全挤掉。
- loader 只做存在性检查、读取失败降级、最近消息截取、长度截断和基础摘要；V0 不做严格 frontmatter / AST 解析。
- 文件缺失时 bootstrap 下次启动会重建默认文件；读取失败只写 warning，不阻断 Kairos tick。
- inbox 内容不会自动写入 `memory/short-term/`。只有 Kairos 基于 inbox 做了回复、工具调用、笔记或提醒，这些行动才以 `SessionEvent` 写入 short-term。

### 写入入口

- `packages/agent-core/src/kairos/inbox.ts` 是 V0 唯一写入模块，提供 `appendKairosInboxMessage()`；同一模块提供 `loadKairosInboxSummary()` 给 prompt assembler 使用。
- 写入参数保持结构化：`source`、`priority`、`topic`、`body` 必填，`relatedSessionId`、`relatedExperimentId`、`workspaceRoot`、`now` 可选；`source: "main-agent"` 写 `main-agent.md`，`source: "lab-agent"` 写 `lab-agent.md`。
- Main Agent V0 不让 LLM 自由决定何时写 inbox；只在后端有明确结构化触发点时调用，例如用户显式要求 Kairos 后续观察/提醒、重复失败检测器产出稳定信号、或未来 Lab 候选入口显式提交。
- Lab Runtime 尚未落地前，只预留同一个追加函数，不新增自动写入链路。

### 边界

- inbox 是观察信号，不是用户当前命令。Kairos 可以根据它整理笔记、提出提醒、建议创建 Lab 实验，但不能把它当作高风险操作授权。
- V0 不做 `status: consumed`、ack 回执、锁文件、JSONL index 或数据库。若消息量增长导致上下文膨胀，再升级为"最近 N 条 + 归档摘要"或 JSONL schema。
- V0 默认模板不创建 `## Processed`。如果人或 Agent 手工增加 processed 区，代码层也不依赖它判断状态；自动写入仍只追加到文件末尾。
- Lab Runtime 尚未落地前，`lab-agent.md` 可以先作为用户或未来实现手动写入的占位收件箱。

## Config 详设

v1 最终落到 **3 份 JSON + 1 份 Markdown**：

| 文件 | 作用 | 注入路径 |
|---|---|---|
| `preferences.json` | 全局开关 / 模型 / sleep 范围 / tickBudget / 熔断阈值 / 节奏偏好 | `tip` 进 [3] 段；数值由代码硬执行 |
| `paths.json` | 可读写路径列表 | `tip` 和 paths 列表进 [3] 段；权限由代码硬执行 |
| `blocklist.json` | 路径黑名单 / 工具禁用 / 时间窗 / 单 tick 工具调用上限 | `tip` 进 [3] 段；规则全部代码硬执行 |
| `rule.md` | 用户写给 Kairos 的纯文本规则 | 全文进 [4] 段 |

### 共同约定：`tip` 字段

所有 JSON 文件根对象都有一个 `tip: string` 字段，是一句给 LLM 看的人话。Config loader 把 `tip` 字段抽取后由 `prompt-assembler.ts` 手动拼接进 [3] 段，**JSON 结构数据本身不出现在 prompt 中**。

如果用户删掉某文件，loader 回退到内置默认值并 emit warning，不会让 Kairos 崩。

### `config/preferences.json`

```jsonc
{
  "tip": "我在工作时段更活跃，安静时段请少打扰；睡眠时长由我设置，超出会被夹紧。",

  "enabled": false,                                  // v1 默认关闭；改后保存会真的起/停 Kairos
  "sleepRangeSeconds": { "min": 30, "max": 900, "default": 120 },
  "tickBudget": { "perDay": 200, "perHour": 30 },
  "circuitBreaker": { "errorThreshold": 5, "cooldownSec": 60 },
  "memory": {
    "loadBudgetRatio": 0.75,
    "compressionThreshold": 0.85
  },

  "rhythm": {
    "timezone": "Asia/Shanghai",
    "workHours": { "start": "09:00", "end": "20:00", "sleepBias": "normal" },
    "quietHours": { "start": "23:00", "end": "07:00", "sleepBias": "deep" },
    "weekend": { "sleepBias": "deep" }
  }
}
```

`sleepBias` 影响调度层夹紧规则：

| bias | min 抬高到 | default 翻倍因子 |
|---|---|---|
| `light` | 30s | 1.0 |
| `normal` | 60s | 1.0 |
| `deep` | 300s | 2.0 |

LLM 看到 `current_phase` 占位符（由 rhythm 推导）后会自然调整 Sleep 调用值，但**最终秒数由调度层夹紧**——不依赖 LLM 自觉。

### `config/paths.json`

合并了原 `workspaces.json`。**每条路径只有 2 个字段**（2026-07-03 起 `watch` 字段随巡检管道退役，loader 读到旧文件里的 `watch` 会静默忽略）：

```jsonc
{
  "tip": "Kairos 可读写的本地路径；默认只授权 Kairos 自己的 workspace，新增路径前请确认不会暴露敏感目录。",
  "paths": [
    {
      "path": "<userData>/kairos/workspace",
      "tip": "Kairos 的默认工作空间，文件工具的相对路径会落在这里。"
    }
  ]
}
```

**字段定义**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `path` | ✓ | 绝对路径或 `<userData>` 开头的占位符 |
| `tip` | ✗ | 给 LLM 看的人话；强烈建议填，否则 LLM 不知道这个目录是干嘛的 |

**写死在代码里的策略**（永远不暴露给用户配置）：

- Kairos 默认只读写 `<userData>/kairos/workspace/`。要让 Kairos **写**项目源码、下载目录或其它用户目录，必须由用户把绝对路径加入 `paths.json`；v1 的文件工具执行层仍以单个 `workspaceRoot` 作为相对路径根，外部多根写入需要后续单独扩展。
- 目录变化感知归口到 fs-watch 插件（见 `agent-plugins-fs-watch.md`）：用户在「文件监听」设置里添加目录，Kairos 通过 Skill 读事件日志。

**硬判断接入 —— 读写授权分离**（由 `ToolScheduler` + guard 上下文共同执行，2026-07-03 起生效，详见 [工具系统扩展](#工具系统扩展callerAgent--extractPaths)）：

- **可读可写（`allowedRoots`）**：controller 把 `paths.json` 中的所有 `path` 收集为 `allowedRoots: string[]`，注入 ToolScheduler 的 Kairos 专属上下文（不是改 `workspaceGuard` 的签名，避免影响主 Agent）。
- **只读（`readOnlyRoots`）**：已启用 Skill 的目录 + fs-watch 正在监听的目录（用户把目录加入文件监听即视为"允许 Kairos 阅读"）+ `briefs/` 任务表目录（Kairos 可以翻自己的排班原文，但任务是用户定的，不给写）。fs-watch 监听目录变化时 main 重建 controller，让授权跟上。
- `callerAgent === "kairos"` 时，ToolScheduler 按工具的 `isReadOnly` 标记分流：只读工具（read/list/grep/glob）对 `allowedRoots ∪ readOnlyRoots` 逐个调用 `guardWorkspacePath(path, root)`，任一 root 通过即放行；写类工具（write/edit/delete）只对 `allowedRoots` 校验——"写入范围 = paths.json"是代码强制而非软约定。
- 主 Agent 的工具调用仍走单 root 校验，行为不变。

> **已退役（2026-07-03）**：v1 的 poll-on-tick 巡检（`watch-scanner.ts` / `watch-diff.ts`、`observe/watch-manifests/`、paths.json 的 `watch` 字段与设置页「巡检」开关）已整体下线，由事件驱动的 fs-watch 插件替代——精度更高（含 modified/renamed）、不占 tick 时间、由用户在「文件监听」设置统一管理。历史实现细节见 git history。

### `config/blocklist.json`

```jsonc
{
  "tip": "含密钥的目录和敏感工具已被屏蔽，命中后工具会直接拒绝，不必绕路。",

  "paths": ["**/.env", "**/.env.*", "**/secrets/**", "**/*.pem", "**/*.key"],
  "toolsDenied": ["bash"],                           // bash 默认对 Kairos 关闭；用户可改成 [] 显式开放
  "timeWindows": [                                   // Kairos 完全不唤醒的时段
    { "from": "23:30", "to": "07:00" }
  ],
  "maxToolCallsPerTick": 10
}
```

**执行层面（全部硬判断）**：

| 字段 | 拦截层 | 行为 |
|---|---|---|
| `paths` | ToolScheduler（callerAgent=kairos 时） | read/write/edit/glob/grep 等工具，从 args 提取路径后做 glob 匹配，命中直接拒绝并 emit `tool_result(isError=true)` |
| `toolsDenied` | controller 注册阶段 | 命中工具在 Kairos 的 ToolManager 中不暴露给 LLM |
| `timeWindows` | scheduler 层 | 落在窗口内的 tick 不注入，下次 tick 推迟到窗口外 |
| `maxToolCallsPerTick` | scheduler 层 | 单次 tick 工具调用数达上限后强行中断 tick 进入 sleep |

`blocklist.json` 在 system prompt 里只有一句 `tip`，**LLM 看不到 paths 列表**——避免给 LLM 提供"如何绕过"的线索。

### `config/rule.md`

```markdown
# 我对 Kairos 的偏好

## 你应该多做的

- 每次唤醒先扫一眼 `<workspace>/docs` 最近 3 天有没有新设计文档，如果有就帮我总结要点。
- 发现我的 session 标题里出现"bug"或"问题"字样时，把对应 session 简要回顾后写笔记。

## 你不要做的

- 不要在我没主动问之前 push 任何外网请求。
- 不要修改 actspace-agent 仓库代码，那是我手动改的领地；你想到改进意见请写到笔记里。

## 我的关注主题

- 设计文档协作模式
- 桌面端 Agent 工作流
- 短期记忆压缩算法
```

`rule.md` 全文（≤ 1500 token）进 system prompt [4] 段。超出时 loader 截尾保留前部分并 emit warning。
取代了原设计中的 `briefs/interests.md` + `briefs/do-not.md` 两个文件——本质都是用户给 Kairos 的偏好指令，合并到一处更清晰。

## Briefs（用户主动任务）

### Brief 文件格式（frontmatter Markdown）

`briefs/tasks/<task-id>.md`：

```markdown
---
id: daily-commit-recap
status: active                  # active | paused | done | failed
trigger: cron                   # cron | event | manual
cron: "0 9 * * *"
priority: normal                # high | normal | low
created: 2026-05-27T15:00:00+08:00
lastRun: null
nextRun: 2026-05-28T09:00:00+08:00
---

# 每日提交回顾

每天早上 9 点，扫描我所有已授权 workspace 的最近 24 小时 git commit，
按项目分组总结，输出到 `notes/daily/YYYY-MM-DD-commits.md`。

如果没有 commit，写一条"今日无提交"即可，不要编造。
```

### `briefs/index.json` 状态机

```jsonc
{
  "tasks": [
    {
      "id": "daily-commit-recap",
      "status": "active",
      "trigger": "cron",
      "cron": "0 9 * * *",
      "lastRun": "2026-05-27T09:00:12+08:00",
      "lastResult": "ok",
      "nextRun": "2026-05-28T09:00:00+08:00",
      "priority": "normal",
      "fileMtime": 1748332800
    }
  ]
}
```

调度器维护 `index.json`（**完全由 controller 内部逻辑，不暴露工具给 LLM**）：

- 启动时扫描 `tasks/*.md`，按 frontmatter 重建 index（fileMtime 与磁盘对比，变更则重读）。
- 每个 tick 前先看 index：有 `nextRun <= now` 且 `status === active` 的任务，把任务 markdown 整篇作为 user message 投递（替代默认的 `<tick>` 内容），同时往 SessionEvent 流写一条 `kairos_tick_injected{ trigger: "brief", briefId, content }`。
- tick 结束后（LLM 输出完成、本次 tick turn 闭合），调度器**根据本次 turn 的执行结果**自动更新 `lastRun` / `lastResult` / `nextRun`。`status` 切换需要用户在 UI 操作。
- LLM 不需要"我执行完任务了，请帮我更新状态"——调度器看到 turn 完结自然推进。

### Brief 触发方式

| trigger | 调度行为 |
|---|---|
| `cron` | 严格按 cron 表达式触发；触发时把 brief 正文作为 user message 注入 |
| `event` | 由特定事件触发（原设想的 `watch.id` 事件已随巡检管道退役，v1 实际未实现 event 触发） |
| `manual` | 不自动触发，仅供用户在 UI 点"立即执行"时投递 |

### 创建方式

- **页面表单**：Kairos 页提供"新建 brief"按钮，弹窗收集 trigger / cron / 正文，提交后写盘并刷新 index。
- **直接编辑 Markdown**：用户也可手动在 `briefs/tasks/` 创建文件；调度器通过 mtime 检测到新文件自动收录。
- 两者等价，互不覆盖；UI 表单保存时不会破坏用户手写的额外 frontmatter 字段（merge 而非 overwrite）。

## Notes 说明

`workspace/notes/` 是 Kairos 在日常 tick 中写给自己/用户看的 markdown 札记。**v1 走共享文件工具，零专属 API**：

| 动作 | 工具路径 |
|---|---|
| 新建一篇笔记 | `write_file` → `notes/<YYYY-MM>/<slug>.md` |
| 编辑某段 | `edit_file`，标准 `old_string → new_string` 替换 |
| 在末尾追加 | `read_file` → 找到末尾段 → `edit_file` 把"末尾段"替换为"末尾段 + 新内容"（不需要新工具/新字段） |

笔记内容典型场景（system prompt 中以建议形式告知 LLM）：

- **观察总结**：复盘最近 session、用户工作模式、当日变化趋势
- **文件监听触发**：fs-watch 事件日志出现值得注意的变化，写一篇"今天的变化"+ 初步分析
- **自我备忘**：跨 tick 的 todo（"上次 tick 看到 compressor.py:120，待续"）

**v1 不做的 pinned 机制**（写下来避免后续遗忘）：

- 不存在 `pinned.md`
- system prompt 没有"常驻笔记段"
- 没有 `kairos:pin-note` IPC
- 没有 1500 token 限额 / 归档逻辑
- 笔记 Tab 是只读浏览，没有 ⭐ 按钮

**Kairos 的"跨 tick 连续性"靠什么**：

- **短期记忆**（system [6] 段 + messages [A] 段）：Kairos 能看到自己最近写过什么笔记的 SessionEvent 流
- **观测增量**（tick message）：基于 sessions-digest + inbox；目录变化走 fs-watch Skill 主动读取
- **用户规则**（system [4] 段 = rule.md）：用户随时可以"我希望你这周多关注 X"

这套已经够支撑 Kairos 形成日常感。如果用户反馈"我希望让 Kairos 长期记住某段笔记"，再回头加 pinned.md + ⭐ 钉住的能力（数据迁移很简单，因为 notes 文件结构没变）。

**与主 Agent Memory 的语义切割**（v1 范围内只需要知道）：

- Kairos 写的 notes 主 Agent 看不到（路径在 `<userData>/kairos/`，主 Agent 无访问授权）。
- 主 Agent 未来引入的 long-term memory 也不会被 Kairos 默认看到——除非用户在 `paths.json` 显式授权该路径。

## Working Memory 加载与压缩

完全复用 heartclaw `ShortTermMemoryContext` 的核心算法。actspace 端的调整：

### 加载流程（每次 KairosRunner 实例化时）

1. 计算 token 预算：`context_window * loadBudgetRatio`（默认 0.75）。
2. 调用 `ShortMemoryStore.get_all_dates_descending()` 取所有日期，新到旧遍历：
   - 若该日期被某 summary 覆盖（week_xx-xx / month_xxxx-xx），加载 summary（去重）；
   - 否则加载该日期 `latest segment` 的原始 jsonl。
   - 累计 token 达到预算即停。
3. 再加载所有 `year_*.summary.md`（独立于日期）。
4. 反转顺序（早到晚）合并到 `messages`，summaries 转成 system [6] 段。
5. 跑 `sanitize_messages` 清掉不完整的工具调用对（避免 LLM API 报错）。

### 压缩触发（已实现：`compression/trigger.ts`）

每次 tick 闭合（scheduler `onSleepStart`）后，controller fire-and-forget 调用
`KairosCompressionTrigger.maybeCompressInBackground()`，不阻塞调度循环：

1. **阈值判定**：`shortTerm.estimateDiskTokens() >= contextWindow * compressionThreshold`（默认 0.85）。
   注意必须用**全量磁盘估算**（含 reset_today 切出的所有段、不受 load budget 截断）——
   `load()` 的预算上限是 75%，永远低于 85% 阈值，用它判定会让压缩永不触发。
2. **磁盘压缩**：把"前天往前"的、还没被 summary 覆盖的日期，旧到新取最多 7 天，调用
   `compressKairosSegments(kind: "week")` 生成 `week_MM-DD_to_MM-DD.summary.md`。
   候选批次限定**同一自然月**——summary 落在首日所在月目录，而覆盖判定只查日期所在月目录，
   跨月批次会让另一个月的日期失去覆盖、被重复加载。
3. **失败策略**：压缩 LLM 调用失败仅 emit warning + 跳过本轮，下次 tick 闭合后重试；
   in-flight 互斥（同一时刻最多一轮压缩在飞）；shutdown 时通过 abortController 中断在飞调用。
4. **留痕**：压缩成功写一条 `context_compaction` 事件到当日 jsonl
   （`toLlmMessages` 跳过该类型，不进 LLM 上下文；aggregator 暂不渲染，仅供排障追溯）。
5. 压缩后无需主动 reload——下一次 tick 的 `shortTerm.load()` 自动看到 summary 覆盖、
   不再加载原文 jsonl。这会造成一次已知的缓存前缀断裂（历史原文 → 摘要），属于设计内的低频大断点。

**V1 不做 intra-day fallback**：当日数据单独超阈值时（单日 tick 数有限，实际很难触达）仅
emit warning 提示，不做日内压缩。后续若真实触达再补。

**已知小缺口**：压缩走 `llm.complete()` 直调，不经过 eventSink 的 `llm_usage` 流——
其 token 消耗暂不计入用量统计与额度扣减（频率极低、单次成本小）。

### 月度 / 年度归档（后台任务）

- 每月 1 号 03:00（quiet hours 内）调度器投递一次内部 brief，让 Kairos 自己把上个月的 week summaries 合并成 `month_YYYY-MM.summary.md`。
- 每年 1 月 1 号 03:00 类似，把上一年的 month summaries 合成 `year_YYYY.summary.md`。
- 这两个内部 brief 不出现在用户 UI 中，是 Kairos 的"自我维护"任务。

## 主 Agent Sessions 的访问

**Kairos 没有 `kairos_list_sessions` / `kairos_read_session` 这类专属工具**。读主 Agent session 走通用工具：

- `list_directory("<userData>/sessions/actspace-agent")` 拿到 session 目录列表。
- `read_file("<userData>/sessions/actspace-agent/<session-id>/session.jsonl")` 读完整 session。
- `grep` / `glob` 在 session 目录下做关键词搜索。

这些路径必须先出现在 `paths.json` 里（被收入 Kairos 的 `allowedRoots`），否则 ToolScheduler 在 `callerAgent=kairos` 时会拒绝。

**`observe/sessions-digest.json` 作用不变**：在每次 tick 前由 controller 重算（cheap，只读 session 目录 meta），提供给 system [5] 段一个"鸟瞰摘要"，让 Kairos 不用调工具就能知道"今天有哪些 session 有动静"：

```jsonc
{
  "workspaces": [
    {
      "rootPath": "<userData>/sessions/actspace-agent",
      "sessions": [
        {
          "id": "session-xxx",
          "title": "Kairos 设计讨论",
          "updatedAt": "2026-05-27T16:00:00+08:00",
          "agentRunCount": 12,
          "unreadTurnsForKairos": 2,        // 自 Kairos 上次访问后新增的 turn
          "lastUserPreview": "上下文如何注入..."
        }
      ]
    }
  ]
}
```

> 实现位置：`context/sessions-digest.ts` 复用主 Agent `SessionStore` 的 meta 读取能力即可，不需要新工具。
> `paths.json` 中 `path` 指向 `<userData>/sessions/...` 的条目会被 controller 自动识别为"session 目录"，并把它纳入 digest 计算范围。LLM 想要细节就直接用 read_file 读对应 jsonl。

## 工具系统扩展（callerAgent + extractPaths）

为了让 Kairos 安全复用主 Agent 工具集，对现有 `ToolScheduler` / `ToolDefinitionSpec` 做最小化扩展。**所有改动对主 Agent 透明**：主 Agent 完全不会感知 callerAgent 字段，行为保持不变。

### `ToolScheduler.execute` 增加 `callerAgent` 参数

```ts
// 现状（伪代码）
toolScheduler.execute(toolCall, { sessionId, signal })

// 新增 callerAgent 字段
toolScheduler.execute(toolCall, {
  sessionId,
  signal,
  callerAgent: "main" | "kairos",     // 新增，默认 "main"
})
```

ToolScheduler 内部新增校验环节，**仅在 `callerAgent === "kairos"` 时启用**：

```
1. 取出 ToolDefinitionSpec.extractPaths(toolCall.args)
2. 对每条路径：
   a. 遍历 Kairos 的 allowedRoots：对任一 root 调 guardWorkspacePath(path, root)
      —— 只要有一个返回 ok 即放行；全部失败则拒绝
   b. 检查是否命中 blocklist.json 的 paths glob，命中则拒绝
3. 检查工具名是否在 blocklist.toolsDenied 中（双保险，正常情况下 ToolManager 注册阶段已过滤）
4. 通过后才进入既有的工具执行流程
```

> 实现技巧：现有 `guardWorkspacePath(inputPath, workspaceRoot)` 只接受单 root，**不需要改其签名**。Kairos 的校验代码自己循环 allowedRoots、命中即放行，主 Agent 仍走原 single-root 路径。

被拒绝时 ToolScheduler emit 一条 `tool_result(isError=true)` SessionEvent，原因写在 content 里，让 LLM 知道下次别再调。

### `ToolDefinitionSpec.extractPaths` hook

工具 definition 中新增可选字段，**只有"会涉及路径"的工具需要实现**：

```ts
export type ToolDefinitionSpec = {
  // ... 既有字段
  extractPaths?: (args: unknown) => string[];      // 返回 args 中涉及的所有路径
};
```

各工具的实现示例：

| 工具 | extractPaths 实现 |
|---|---|
| `read_file` | `(args) => [args.path]` |
| `write_file` / `edit_file` | `(args) => [args.path]` |
| `list_directory` | `(args) => [args.path]` |
| `grep` | `(args) => [args.path ?? args.dir ?? "."]` |
| `glob` | `(args) => [args.cwd ?? "."]` |
| `bash` | `(args) => []`（路径在命令里难精确提取，整个工具靠 `toolsDenied` 整体管控） |
| `web_search` / `web_fetch` | 不实现（不涉及本地路径） |

> 设计原则：`extractPaths` 由工具自己最清楚怎么提取（同一工具未来加新参数也只改一处），ToolScheduler 只做"调用 hook + 匹配规则"，不维护任何工具特定逻辑。

### 启动流程整合

```
controller.start()
  ├─ load preferences.json → 注册 SleepTool
  ├─ load paths.json
  │   └─ 把每条 path 收集为 Kairos 的 allowedRoots（callerAgent=kairos 时逐 root 调 guard）
  ├─ load blocklist.json
  │   ├─ 把 toolsDenied 列表传给 ToolManager（Kairos 实例不注册这些工具）
  │   └─ 把 paths blocklist 注册到 ToolScheduler 的 callerAgent=kairos hook
  ├─ load rule.md（纯文本，不需要硬执行）
  └─ start scheduler
```

### 与主 Agent 的隔离保证

| 维度 | 主 Agent | Kairos |
|---|---|---|
| `callerAgent` 标记 | 默认 `"main"` | 显式传 `"kairos"` |
| `extractPaths` hook | **不调用**（保持原有行为） | 调用并强制路径校验 |
| `paths.json` 限制 | 不生效 | 强制 |
| `blocklist.paths` 限制 | 不生效 | 强制 |
| `Sleep` 工具 | 不可见 | 注册 |
| 工具集 | 全集 | 全集 − `blocklist.toolsDenied` |

> 这套方案让主 Agent 的工具不会因 Kairos 引入而变得更严格——避免"为了让 Kairos 安全，主 Agent 也开始处处碰壁"的退化路径。

## 与主 Agent 的交互边界

| 主 Agent 动作 | Kairos 反应 |
|---|---|
| 用户在 Composer 发消息 | Kairos 立刻打断当前 sleep；不消费该消息；事件流写一条 `interrupt(user_message)` |
| 主 Agent runTurn 中 | Kairos 保持 `interrupted`/`idle`，不注入 tick |
| 主 Agent runTurn 完成且队列空 | Kairos 等待 5s（防止 user 立即跟进），再注入下一次 tick |
| 用户切换 session | Kairos 不受影响（事件流是全局的，不绑定 session） |
| 用户切换 workspace root | Kairos 自动 stop，避免在错误 workspace 上继续观察；用户重新启用 |
| 应用退出 | 走优雅退出：`before-quit` 拦截 → 弹关闭遮罩 → `controller.shutdown()`（abort 在飞请求 + 停循环 + flush usage/budget）→ 最多 5s 超时强退。持久化 `state.enabled` 与运行时计数 / 余额，下次启动按 `enabled` 恢复。详见 [优雅退出](#优雅退出) |

## 渲染规范（Kairos 页面）

Kairos 页面产品 UI 的详细规范以 `docs/design-docs/kairos/front-Kairos监控页规范.md` 为准。本节只保留和自治模式数据流相关的渲染边界，避免前端视觉规则散落在后端设计文档里。

当前页面采用“顶部控制 + 紧凑运行轨迹 + 左执行列表 + 右统计/详情”的两列监控布局：

- 顶部只展示 `Kairos`、当前状态胶囊、用量胶囊（紧凑 `12.4K tok · ¥0.0234`，左侧 logo 可切换 lifetime/sinceReset 维度，右侧 `本阶段` / `累计` mode chip，hover 展开明细）和 `暂停` / `立即唤醒` / `上下文` / `重置今日` 操作，不展示 Workspace、Session、Last wake、Sleep today 等 metadata chip。
- 用量胶囊直接读取 `state.usageLifetime` + `state.usageSinceReset`（controller 用 `KairosUsageAccumulator` 维护两份维度、IPC 推送过来），**不再**在 renderer 端从 ring buffer 实时聚合；这样跨进程重启、ring buffer 滚动都不影响"账目"的事实。`重置今日` 按钮只清 `sinceReset` 维度，**保留** `lifetime`——产品语义：累计账是持久化历史的真相，按钮不应破坏。用户当前选的 mode 持久化到 `localStorage["kairos.usageBadgeMode"]`，跨开关页保持。
- 运行轨迹颜色职责以 [`Kairos 监控页规范`](front-Kairos监控页规范.md) 为准：运行 / 健康使用 operational green，睡眠 / 等待 / 普通事件使用中性灰，风险使用 warning，异常使用 danger；最终回复仅在需要信息分类时克制使用 info blue。
- 左侧执行列表渲染 `KairosEventRow[]`，列为时间、类型、状态、摘要、耗时；类型图标无色，状态 badge 可带语义色。
- 右侧上方是紧凑统计区，只展示名称和值，不放图标。
- 右侧下方是单一详情容器，通过 `最终回复` / `工具结果` 胶囊 tab 切换；默认完整展示最终回复，工具结果只在选中工具行或切到工具 tab 后展示。

数据源仍保持不变：renderer 订阅 `SessionEvent[]`，通过 `aggregateKairosEvents(events)` 派生 `KairosEventRow[]`。详情区通过 `row.relatedEventIds` 反查原始事件，但默认产品 UI 不直接展示原始 JSON。

## Sidebar 与导航

`Sidebar.tsx` 已有 `view: "kairos"`，目前 `WorkbenchLayout` 渲染 `PlaceholderView`。实现时替换为新的 `KairosPage`。

- Sidebar 上的 Kairos 图标在 `enabled` 时显示一个小绿点；`cooldown` 时显示红点；`sleeping` 时显示灰点。
- Workbench 在 `view === "kairos"` 时不渲染右侧 RightPanel（与 lab / usage 一致）。

## 错误处理与熔断

- 单次 tick 内部出现 LLM 错误：捕获后 emit `error` 事件，状态切回 `idle`，按 `default_sleep_seconds=120` 进入 sleep。
- 连续 5 次 tick 失败：状态切到 `cooldown(60s)`，期间不注入 tick；冷却结束后回到 `idle` 等待下次注入。
- Sleep 工具被模型多次调用时只取最后一次合法值，并夹紧到 `[min=30, max=900]`。
- 主 Agent 抛错不影响 Kairos；Kairos 抛错不影响主 Agent。两者错误日志各自打到 `logs/latest-dev.log` 中带 `[kairos]` 前缀。

## 额度护栏（单一余额）

> 2026-05-30 落地。给一直循环运行的 Kairos 加一层"花钱保险"，避免无人值守时持续烧钱。**只约束 Kairos 自治循环，不约束主 Agent 主动对话。**

### 模型：单一余额

UI 上只有两个控件：一个「额度限制」开关 + 一个「剩余额度（¥）」数字。

- 开关开 → Kairos 每次模型回复（`llm_usage` 事件）都把 `cost.total` 从 `balanceCny` 里**扣减**，余额这个数不断变小。
- `开关开 且 balanceCny ≤ 0` → 报"额度不足"并停止（进入 `budget_exhausted`）。
- 用户随时能改这个余额：想充值就填大、想收紧就填小、填 0 即不再让它跑。改完需手动「开启」。
- 开关关 → 无限运行，无额度概念，UI 不渲染额度块。

与初版"上限 + 已消耗 + 清空已消耗"钱包模型的差异：**只有一个 `balanceCny`，运行时直接做减法**（而非对 spent 做加法），去掉了"清空已消耗"按钮——充值即直接把余额改大。

### 存储：独立运行态文件 `memory/budget-state.json`

```jsonc
{
  "schemaVersion": 1,
  "enabled": false,      // 额度护栏开关；false=无限运行
  "balanceCny": 0,       // 剩余可花额度（¥）；运行时被扣减，用户可随时改
  "updatedAt": "2026-05-30T21:00:00+08:00"
}
```

- **不进 `preferences.json`**：余额是 Kairos 每跑一次就回写的高频运行态数据，放配置文件会触发配置热重载、与用户手动编辑打架；概念上也要把"配置"和"运行时变化的数"分开。`config/schema.ts` 因此不改。
- 与 `usage-accumulator.json`（token/成本总账）**独立**——后者是"统计事实"只增不减，前者是"可花余额"会被扣减且用户可改。
- 由 `agent-core/src/kairos/storage/budget-store.ts` 的 `KairosBudgetStore` 管理：照抄 usage-accumulator 的 debounce + atomic rename + flush 范式；文件缺失/损坏时回退 `enabled=false, balanceCny=0`（无限运行，不误伤）。

### 检查时机与状态机（耗尽不自动恢复）

- **扣减**：`eventSink` 处理 `llm_usage`、累加 usage-accumulator 后，若 `budget.enabled` → `budgetStore.deduct(cost.total)`；若扣到耗尽 → `processor.triggerWake("wake_now")` 提前结束当前 sleep，让 loop 尽快被拦下。
- **tick 边界拦截**：`QueueProcessor.loop()` 在投/取下一个 tick 前调用注入的 `canStartTick()`（= `!budget.exhausted`）；返回 false → `onStateChange("budget_exhausted")` + break。tick 内允许跑完，**不做 tick 内实时熔断**（余额可能被扣成负数，UI 显示 ¥0）。
- **耗尽副作用**（controller `haltForBudget`）：`runtimeState.enabled=false` + `state="budget_exhausted"` → 持久化 `preferences.enabled=false`（避免重启反复撞墙）→ emit 一条 `error` SessionEvent（"额度不足，Kairos 已暂停…"）→ emit state。
- **`start({force:true})` 防御**：若耗尽 → 不起 processor、setState("budget_exhausted")、**throw**（"额度不足，请先在设置页调高剩余额度后再开启。"）让 renderer toast。
- **设置/恢复**：`set_budget` → `controller.setBudget({enabled, balanceCny})` 写盘 + 重算 `runtimeState.budget` + **耗尽态清理**（若 `state==="budget_exhausted"` 且现在 `!exhausted` → 拨回 `"stopped"`）。**不自动起跑**——用户改完额度仍需手动「开启」。

### 取舍

- 币种固定按 CNY（¥）；非 CNY 成本仍按数值扣减，MIXED 极端情况不特殊处理（Kairos 默认 DeepSeek，`cost.currency==="CNY"`；模型未匹配注册表时 `cost.total===0`，不扣额度但仍记 token 事实）。
- tick 边界粒度检查：最后一个 tick 可能超额跑完，超额有限，余额允许为负、UI 显示 ¥0。
- 无周期自动重置（每日/每月）——单一余额无周期。

### 渲染

- 设置页「Kairos 自主智能体」分区：模型 / 思考链下方加「额度限制」开关 + 「剩余额度（¥）」输入两行，读写走 `window.kairos`（`getState().budget` 回填 + `onState` 订阅运行时余额递减 + `control({type:"set_budget"})` 提交）。输入用本地 draft + focus 标志，运行时余额递减不打断用户编辑。
- Kairos 页状态条：`budget.enabled` 时旁边显示「¥x.xx」额度胶囊，耗尽时转 danger 语义色 + "不足"；`budget_exhausted` 状态文案为"额度不足"。「开启」被 reject 时由 `useKairos` 的 error surface 到页面底部错误条。

## 优雅退出

> 2026-05-30 落地。退出软件时先让 Kairos 安全收尾，再真正关窗，避免后台循环 / 正在飞的 LLM 请求被硬切导致丢账或残留运行态。

### 流程

1. `app.on("before-quit")`：首次进入 `event.preventDefault()` 拦下退出，`shuttingDown` 标志防重入，向 renderer 发 `app:shutting-down`。
2. renderer 收到后铺 `ShutdownOverlay` 全屏遮罩「Kairos 正在安全关闭…」。
3. main `await kairosController.shutdown()`：`abortController.abort()`（中断正在飞的 LLM 请求）→ `processor.stop()`（停循环，等当前 tick 自然收尾）→ `usageAccumulator.flush()` + `budgetStore.flush()`（写盘不丢账/余额）。
4. 收尾完成或 **5 秒超时** → `app.exit(0)` 强退（绕过 before-quit，不再拦截），保证用户一定能关掉软件。

### 关键约束

- Electron `before-quit` 不 await async 回调，所以必须 `preventDefault` + 完成后 `app.exit(0)`。
- AbortSignal 经 `KairosRunner.getAbortSignal()` 透传到 `runAgentLoop(..., signal)` → `llm.stream({signal})`，每次 `start()` 重建 controller，shutdown / 耗尽时 abort。
- **Kairos 无独立 OS 进程**——它是 main 进程内的 `QueueProcessor` 循环；"强制杀进程"转化为"停循环 + abort in-flight 请求 + 超时强退"。
- mock 模式（无 `window.actspace.onShuttingDown`）：renderer 不挂监听，遮罩不出现。

## 安全与隐私

- Kairos 复用主 Agent 工具集，但 `blocklist.toolsDenied` 在 controller 注册阶段就让命中工具对 Kairos 的 ToolManager 不可见。
- 所有工具调用走主 Agent 既有的 `ToolScheduler` 权限决策（含用户审核流）+ Kairos 专属的 `callerAgent=kairos` 路径校验（paths.json allowedRoots + blocklist.paths 黑名单）。详见 [工具系统扩展](#工具系统扩展callerAgent--extractPaths)。
  - 待审核工具调用在 Kairos 上下文中处理方式：若进入 `ask` 状态，KairosRunner 直接把该调用判为失败、写入事件流；不阻塞 sleep 调度。后续 plan 可补"挂起 tick + 等用户审核"模式，本期不做。
- `Sleep` 工具走"按 callerAgent 注册"方案：v1 不扩展现有 `exposeOnlyTo`（它当前用于按 LLM provider 区分），而是在 Kairos ToolManager 初始化时**额外注册** Sleep，主 Agent 的 ToolManager 不注册——简单显式，不污染共享类型。
- `paths.json` 中的所有 `path` 在 Kairos 启动时收集为 `allowedRoots`，**Kairos 触发的工具调用涉及的路径必须能通过 allowedRoots 中任一 root 的 `guardWorkspacePath` 校验**——用户没授权的目录无法访问。
- `blocklist.paths` 在 multi-root guard 之上再叠一层 glob 匹配，命中（如 `**/.env`）直接拒绝；LLM 看不到具体规则，避免提供绕过线索。
- 所有 Kairos 数据位于 `userData/kairos/`，不进入任何 session.jsonl，也不上传任何远端。
- 系统提示词中明确告诉模型"不存在外部 cron 或定时任务"（briefs 是用户主动配的，不是 Kairos 自己拥有 cron 能力），避免它编造能力。

## 配置变更响应

`config/` 和 `briefs/` 下任何文件被修改（mtime 变化），controller 自动重载，规则：

| 文件 | 重载策略 | 影响 |
|---|---|---|
| `preferences.json` | 整体替换 | 立即生效；若 `enabled` 切换，等当前 tick 结束后进入对应状态；当前 sleep 不重算，下次 sleep 用新 bias |
| `paths.json` | 整体替换 | 立即生效；重建 Kairos 的 `allowedRoots` |
| `blocklist.json` | 整体替换 | 立即生效；正在执行的工具调用不撤销 |
| `rule.md` | 内容缓存 | 下次组装 system [4] 段时重读 |
| `briefs/tasks/*.md` | 文件级监听 | 任何 markdown 变更触发 `briefs/index.json` 重建（按 fileMtime 差量） |

实现：用 `chokidar` 监听 `config/` 和 `briefs/tasks/` 两个目录。**这是 Kairos 域内唯一使用 fs.watch 的地方**——文件数量小、稳定性可控；用户目录的变化监听由独立的 fs-watch 插件进程承担（Rust `notify`，不占 Electron 主进程）。

## 验证策略

实现时按以下顺序写测试，每一组都要有：

1. **scheduler 单测**（`agent-core/src/kairos/__tests__/scheduler.test.ts`）：
   - 注入 tick → 处理 → 进入 sleep → 自然结束再注入。
   - sleep 中被 wake 信号打断，验证下一次不注入 tick 直到 wake 源完成。
   - 连续 5 次 throw 触发 cooldown。
   - `rhythm.sleepBias=deep` 时 default sleep 自动翻倍并夹紧 min 到 300s。
   - `blocklist.timeWindows` 命中时，tick 投递推迟到窗口外。
   - `tickBudget.perHour` 超限后调度器自动 stop 并 emit error 事件。
2. **工具访问控制单测**（`agent-core/src/kairos/__tests__/tool-guard.test.ts`）：
   - `callerAgent=kairos` 时，路径无法通过 `paths.json` 任一 root 的 guard → 拒绝并 emit `tool_result(isError=true)`。
   - `callerAgent=kairos` 时，路径命中 `blocklist.paths` → 拒绝。
   - `callerAgent=main` 时，paths.json 和 blocklist.paths 全部不生效。
   - `blocklist.toolsDenied` 中的工具在 Kairos 的 ToolManager 中不被注册。
   - 各工具的 `extractPaths` 实现覆盖：read_file / write_file / list_directory / grep / glob。
3. **briefs 单测**（`briefs/__tests__/index-manager.test.ts`）：
   - 扫描 tasks/ 目录构建 index.json，frontmatter 错误时单文件标记 failed 而不影响其他。
   - cron 表达式触发：到时间投递 brief 正文为 user message（同时写一条 `kairos_tick_injected{ trigger: "brief" }`），未到时间继续投递普通 `<tick>`。
   - mtime 变更后 index 自动重建。
   - tick turn 闭合后 index 自动推进 `lastRun` / `nextRun`。
4. **runner 单测**（`runner.test.ts`）：
   - 使用 `MockLLMService.setResponses` 给定 tick 应回的内容（含 Sleep 工具调用）。
   - 验证 `KairosShortTermMemoryContext` 在 token 预算下加载正确的 jsonl + summary。
   - 验证 `getSleepSeconds` 在多次 Sleep 调用时取最后一次合法值并夹紧。
   - 验证 brief 投递时上下文 [C] 段为整篇 markdown 正文。
   - 验证 system [3] 段拼接顺序：preferences.tip → paths 列表 → blocklist.tip。
5. **context 单测**（`context/__tests__/short-term.test.ts` / `watch-scanner.test.ts` / `watch-diff.test.ts`）：
   - 模拟 3 个月的 short-term 数据 + 1 个 week summary，验证加载顺序和去重。
   - sessions-digest 计算"unreadTurnsForKairos"正确。
   - `watch-scanner`：手写递归命中 `node_modules` / `.git` / `.DS_Store` / `.hidden` 不进入；超过 5000 文件即停并 emit warning；权限错误的目录跳过不抛。
   - `watch-diff`：mock 新旧 entries 集合，验证 `added` / `removed` 计算正确；首次扫描时 manifest 不存在视为 `oldEntries=[]`；截断到 50 条；重命名场景表现为 `removed + added` 两项。
6. **事件聚合单测**（`shared/__tests__/kairos-aggregator.test.ts`）：
   - tool_call + tool_result 聚合为单行 `kind: "tool"`，按 toolCallId 匹配；缺失 result 时行 status=`running`。
   - kairos_sleep_start + kairos_sleep_end 聚合为单行 `kind: "sleep"`，duration 正确。
   - kairos_sleep_interrupted 关闭对应的 sleep 行并产生 `kind: "interrupt"` 行。
   - kairos_tick_injected 起始的所有同 turnId event 聚合为 `kind: "tick"` 父行。
7. **IPC 集成测**（`desktop/src/main/__tests__/kairos-ipc.test.ts`）：
   - `kairos:control(start)` 后能 `kairos:get-state` 拿到 `enabled=true`。
   - `kairos:get-events-recent({ limit: 200 })` 从 ring buffer 返回，buffer 不足时倒序读 jsonl 补足。
   - 主 Agent runTurn 期间 controller 的 sleep 被打断（用 mock controller 验证）。
   - 修改 `config/preferences.json` 后，controller 在下次 sleep 用新 bias。
   - 修改 `config/paths.json` 增加一个 `watch=true` 的 path 后，下次 tick 的 `watch-diff.json` 中该 path 出现，且 manifest 文件被创建。
8. **renderer 视觉验证**：
   - 浏览器 mock 模式启动 Vite，按 `fixtures` 注入示例 SessionEvent[]，截图比对 4 个状态（stopped / ticking / sleeping / cooldown）。
   - Electron 真实窗口跑 `pnpm dev:log` 并 mock LLM 验证一次完整 tick → sleep → wake 流程，含 brief 触发路径。

## 推进顺序（占位）

> 本节只提示 execution plan 的拆分顺序，正式排期等 plan 文档落地。

1. **shared 契约 + SessionEvent 扩展**：
   - `packages/shared/src/session.ts` 加 4 个 Kairos 专属 type 和 payload。
   - `packages/shared/src/kairos-contracts.ts`（KairosRunState / KairosRuntimeState / KairosControl / KairosEventRow + aggregator 签名）。
   - 让前端可基于契约先做 mock fixtures。
2. **Config schema + loader + watcher**：
   - `kairos/config/{schema,loader,watcher}.ts`（preferences / paths / blocklist + rule.md，含 zod schema 和 tip 字段默认值）。
   - `prompt-assembler.ts` 拼接 [3]/[4] 段的实现。
3. **Storage + Working Memory + Aggregator**：
   - 移植 heartclaw `ShortMemoryStore` 到 `kairos/storage/short-memory-store.ts`（行格式改为 SessionEvent）。
   - 实现 `ring-buffer`、`aggregator`。
   - `KairosShortTermMemoryContext` 单测覆盖加载策略。
   - 不需要 `note-store`：notes 走主 Agent `write_file` / `edit_file`。
4. **Briefs 子系统**：
   - parser / index-manager / dispatcher 接入。
   - `briefs/tasks/*.md` chokidar 监听 + 自动 index.json 重建。
5. **工具访问控制扩展**：
   - `ToolScheduler.execute` 增加 `callerAgent` 参数。
   - 给各工具 definition 补 `extractPaths`。
   - `kairos/guard/{extract-paths,blocklist-check}.ts`。
   - 单测覆盖路径校验与 blocklist。
6. **Controller + Scheduler + Runner**：
   - `scheduler.ts`（队列 / 尾递归 / 可中断 sleep / rhythm 夹紧 / blocklist 时间窗）。
   - `runner.ts`（独立 system prompt 组装 + brief 投递 + eventSink 写 short-term）。
   - `tools/sleep.ts`。
7. **观测层**：
   - sessions-digest 计算器
   - `watch-scanner` + `watch-diff` + manifest 持久化（Node fs.readdir 手写递归 + default exclude + 5000 上限）
   - controller 在每次 tick 前重算 observe/ 缓存。
8. **Main 进程 IPC**：
   - `desktop/src/main/kairos-ipc.ts`（v1 不含 `kairos:pin-note`）。
9. **Renderer KairosPage + Tabs**：
   - 4 个 tabs（详情 / Briefs / 配置 / 笔记，笔记只读）。
   - 与现有 Sidebar / Workbench 联调。
10. **端到端验证 + 文档同步**：
    - `current-module-map.md`、`core-storage-and-observability.md` 同步补 Kairos 节。
    - skill 内 `cron-job-kaiors.md` 不动；本设计文档作为 actspace 化的事实来源。

## 维护规则

- Kairos 的"为什么 / 边界 / 不变量"长期事实优先写在本文档。
- 已落地模块清单合并到 `docs/design-docs/agent-runtime/agent-current-module-map.md`，本文档不重复记录实现细节。
- 存储路径变更必须同步 `core-storage-and-observability.md`。
- skill `cron-job-kaiors.md` 是通用知识来源，本文档只记录 actspace 化决策，不复述通用原理。
- 新增工具进入 Kairos 默认工具集时，需在本文档"安全与隐私"中显式记录默认信任范围。

## 附录：v1 实测目录树（2026-05-27）

> 历史快照，保留当年验收事实。2026-07-03 起 `context/watch-scanner.ts`、`context/watch-diff.ts`、`observe/watch-manifests/` 已随巡检管道退役并删除；上文"测试计划 / 推进顺序"两节中的 watch-scanner / watch-diff 条目同样属于历史记录。

源码：

```
packages/agent-core/src/kairos/
├── controller.ts             # createKairos / 装配中枢
├── scheduler.ts              # MessageQueue + QueueProcessor + clampSleep
├── runner.ts                 # KairosRunner.processTick
├── prompt.ts                 # KAIROS_SYSTEM_PROMPT 模板
├── prompt-assembler.ts       # 拼装 5 段
├── inbox.ts                  # Agent inbox 默认文件、append 写入和摘要 loader
├── aggregator.ts             # 薄壁 re-export shared 聚合器
├── index.ts                  # 公共出口
├── config/
│   ├── schema.ts             # Preferences/Paths/Blocklist 类型与默认值
│   ├── loader.ts             # loadKairosConfig
│   └── prompt-assembler.ts   # buildConfigTipsBlock
├── storage/
│   ├── short-memory-store.ts # JSONL append + rotateDaily + loadDailyRange
│   └── ring-buffer.ts        # SessionEventRingBuffer (cap=200)
├── context/
│   ├── short-term.ts         # KairosShortTermMemoryContext
│   ├── watch-scanner.ts      # fs.readdir 递归 + exclude
│   ├── watch-diff.ts         # sha1 manifest diff
│   └── sessions-digest.ts
├── briefs/
│   ├── parser.ts             # frontmatter + body 解析
│   ├── index-manager.ts      # briefs/index.json 维护
│   └── dispatcher.ts         # pickNext(now)
├── guard/
│   ├── extract-paths.ts
│   └── blocklist-check.ts    # globToRegex
├── compression/
│   └── compressor.ts         # 调 llm.complete() 出 markdown summary
├── tools/
│   ├── sleep.ts              # Sleep 工具 spec + executor
│   └── index.ts              # registerKairosTools
└── test/
    ├── controller.test.ts
    ├── scheduler.test.ts
    ├── prompt-assembler.test.ts
    ├── runner.test.ts
    └── ...各子模块 test/

packages/desktop/src/main/
├── kairos-bootstrap.ts       # scaffolding + LLM/ToolManager 工厂
├── kairos-ipc.ts             # 5 invoke + 50ms debounce 推送
└── index.ts                  # 集成点（whenReady + agent:run 钩子）

packages/desktop/src/renderer/
├── pages/KairosPage.tsx      # KairosHeader/EventTable/DetailPanel/ConfigTab
└── state/useKairos.ts        # React hook + IPC 订阅 + aggregate
```

运行时（`<userData>/kairos/`）：

```
config/
├── preferences.json
├── paths.json
├── blocklist.json
└── rule.md

memory/short-term/
├── 2026-05/
│   ├── 2026-05-27.jsonl
│   ├── 2026-05-27_001.jsonl      # resetToday 后
│   └── week_2026-W22.summary.md  # compressor 生成

observe/watch-manifests/<sha1>.json
briefs/
├── tasks/<id>.md
└── index.json
inbox/
├── main-agent.md
└── lab-agent.md
notes/...
```

详细字段语义见 `docs/design-docs/core-storage-and-observability.md` 的 "Kairos 存储与可观测性" 章节。
