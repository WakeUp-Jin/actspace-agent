# Kairos 自治模式设计

> 长期设计事实来源（design fact source）。本文档约束 actspace 桌面端 Kairos 自治模式的范围、模块边界、契约和交互；后续 execution plan 从本文档派生。

## 当前状态

- 状态：v1 代码已上线（2026-05-27）；端到端核心逻辑由 56 个 Kairos 单测保障，实机 GUI 验收待用户在本机 `pnpm dev:log` 跑一遍，见 `docs/histories/2026-05/20260527-2105-kairos-project-summary.md`。
- 适用范围：`packages/agent-core`、`packages/desktop`（main / renderer）、`packages/shared` 三端联动。
- 关联 Skill：`.agents/skills/llm-agent-dev/references/agent-runtime/cron-job-kaiors.md`（核心理念出处，actspace 实现不再复述）。
- 参考实现：`back-code/heartclaw/apps/ruyi-api/src/core/agent/kairos_agent.py`（思路参考，actspace 不复用其代码，也不复用其"天工巡检"业务线）。
- 实施 plan：见 `docs/exec-plans/README.md` 中 `kairos_*` 一组。
  - ✅ `kairos_shared_contracts.md`（SessionEvent 4 个 Kairos type + `KairosEventRow` + `aggregateKairosEvents` + fixtures）— 2026-05-27 完成。
  - ✅ `kairos_config_and_tool_guard.md`（3 JSON+rule.md schema/loader + prompt-assembler[3]段 + ToolScheduler callerAgent + extractPaths + 6 工具 hook + Sleep 工具 + 39 单测）— 2026-05-27 完成。实施时务实调整：v1 未引入 zod/chokidar/micromatch，全部手写轻量实现；KairosConfigWatcher 简化为 controller 主动 reload（plan 5 接入）。
  - ✅ `kairos_short_term_memory.md`（ShortMemoryStore 移植自 heartclaw + SessionEventRingBuffer + KairosShortTermMemoryContext 按 token budget 加载 + sanitizeOrphanToolPairs + compressKairosSegments 调 LLMService + 20 单测）— 2026-05-27 完成。
  - ✅ `kairos_observe_and_briefs.md`（watch-scanner 手写递归 + WatchDiffEngine sha1 manifest + SessionsDigestBuilder 不挑食策略 + briefs parser/index-manager/dispatcher，27 单测）— 2026-05-27 完成。务实调整：briefs v1 改用 `intervalSec` 替代 5 段 cron；不引入 gray-matter/cron-parser/chokidar，配置写入时由 main IPC 主动调 `rebuildFromDisk()`。
  - ✅ `kairos_controller_runner.md`（KAIROS_SYSTEM_PROMPT + prompt-assembler 全段拼装 + clampSleep/sleepBias + MessageQueue + QueueProcessor 可中断 sleep 与熔断 + KairosRunner.processTick 提取 sleep 工具参数 + KairosController 闭环 + engine/loop.ts 加 `toolExecuteOptions` 透传，26 单测）— 2026-05-27 完成。务实调整：v1 不内建 `_internal/monthly-archive` brief；blocklist.timeWindows / tickBudget 不在调度层硬执行，靠 prompt 提示让 LLM 自尊重；configWatcher 由 main IPC 主动 await `reloadConfig()`。
  - ✅ `kairos_main_ipc_and_renderer.md`（`kairos-bootstrap.ts` scaffolding + LLM/ToolManager 工厂 + `kairos-ipc.ts` 5 invoke + 50ms debounce event/state 推送 + preload `window.kairos` + `KairosPage` 状态条/事件表/详情面板/4 个 raw config tab + `useKairos` hook + `agent:run-turn` try/finally 调 `notifyMainAgentTurn{Start,End}`，7 组件级单测）— 2026-05-27 完成。务实调整：不引入 zustand/router/Monaco；notes Tab 按决策不实现；`get-events-recent` 暂不回退 jsonl（ring 200 条够首屏）；main IPC 单测留给 e2e 实机验证补。

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
- 默认关闭：v1 默认不启用，需要用户在 Kairos 页主动 toggle。
- 桌面端约束：通过 Electron IPC stream 暴露事件，不走 HTTP / WebSocket。
- 本地落盘：复用 actspace 现有 `SessionEvent` 格式，**`memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl` 是 Kairos 唯一持久化层**，覆盖运行记录、行动日志、事件流三种语义。
- 数据流稳健：运行时"先写盘成功，再 IPC 推送给前端"；刷新页面先从内存 ring buffer（最近 200 条 SessionEvent）回填，不够再读 jsonl。

## 非目标（v1 明确不做）

- 不接入"天工"或外部任务系统巡检。actspace 没有对应概念，先聚焦自治闭环。
- 不做工具白名单 / 配额护栏。Kairos 默认共享主 Agent 工具集；`blocklist.json` 走调度层硬限制，不是细粒度白名单。
- 不做 cron 任务管理面板。cron 工具可在后续单独 plan 引入；Kairos 页 v1 不做 cron 视图（briefs 内部走 cron-like 调度，但不暴露给主 Agent）。
- 不做模型独立选择。Kairos 使用与主 Agent 相同的已选模型。
- 不做多设备 / 云端同步。短期记忆仅本地保存。
- 不做"取消天工任务"或子进程管理类工具。
- 不做 fs.watch 实时监听巡检目录。v1 巡检走 tick-time poll diff，避免 Electron 多目录监听的稳定性问题（config / briefs 目录是唯一例外——文件数少、稳定）。
- 不做外部数据集成（飞书、Slack 等）。v2 再考虑，不在 v1 config 里预留 schema 文件。
- 不为 Kairos 单独造 `kairos_*` 业务工具。除 `Sleep` 外，read / list / grep / glob / write / edit / bash 全部复用主 Agent；访问控制走 ToolScheduler 的 `callerAgent` hook + 工具 definition 的 `extractPaths`。
- **v1 不做 `pinned.md` 机制**：不引入用户 ⭐ 钉住、不在 system prompt 留常驻笔记段、不做 `pinned-archive/`、不做 `kairos:pin-note` IPC。Kairos 笔记由用户在笔记 Tab 只读浏览。等用户反馈"我希望让 Kairos 长期记住某段笔记"再加。
- 不为 Kairos 加任何工具字段（不给 `edit_file` 加 append 模式；不给 `write_file` 加 mode 参数）。Kairos 想"追加笔记"走 read → edit_file 替换最后一段的现有路径——和主 Agent 改文件的方式完全一致。
- 不分离 events / journal / short-term 三套存储。**唯一持久化层是 short-term jsonl（SessionEvent 流）**，前端事件流通过聚合器（`aggregateKairosEvents`）从同一份数据计算得到。

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
  prompt-assembler.ts      // 读 config + paths + rule.md + observe/，手动拼接 system 段

  context/                 // Kairos 专属上下文模块
    short-term.ts          // KairosShortTermMemoryContext（复用 heartclaw 算法）
    sessions-digest.ts     // 主 Agent sessions 摘要生成器
    watch-scanner.ts       // Node fs.readdir 手写递归扫描 + default exclude + 5000 上限
    watch-diff.ts          // entries set 差集 → added/removed；管理 watch-manifest 读写

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

  tools/                   // Kairos 专属工具（v1 仅一个）
    sleep.ts               // Sleep 工具定义 + handler

  guard/                   // 主 Agent 工具的 callerAgent=kairos 路径校验
    extract-paths.ts       // 中心化 fallback：从工具 args 提取路径列表
    blocklist-check.ts     // glob 匹配 blocklist.paths

  compression/
    compressor.ts          // 复用主 Agent compressor + Kairos 专用 prompt 模板

  aggregator.ts            // 把 SessionEvent[] 聚合成 KairosEventRow[]（也导出给 shared）
  index.ts                 // 对外导出 createKairos(deps)
```

> 关键变化：
> - `kairos/tools/` 只有 1 个工具（Sleep）。原 list-sessions / read-session / write-note / pin-note / brief-update / scan-watch 全部由主 Agent 共享工具或 controller 内部逻辑替代。
> - 删除 `note-store.ts`：v1 没有 pinned.md / 归档 / token 限额，写笔记直接走主 Agent `write_file` / `edit_file`。
> - `watch-diff.ts` 拆为 `watch-scanner.ts`（扫描）+ `watch-diff.ts`（diff 算法 + manifest 持久化）两职责清晰。

### `packages/agent-core/src/context/modules/kairos-short-term.ts`

仿照 `ConversationContext`，但读写路径独立、最大轮次缩短，行格式与主 Agent `session.jsonl` 完全对齐（每行一条 `SessionEvent`）。

- 构造期接受 `kairosRoot: string`，读当天的 `<root>/memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl`。
- 运行期保留按 token 预算（默认 75% context window）加载的 SessionEvent 序列，配合 week/month/year summary 进 system prompt。
- 不复用 `ConversationContext`，避免与主 Agent session 互相污染。

### `packages/agent-core/src/engine/agent.ts`

不改实现，但要新增一个工厂入口：

- `createKairosAgentForLoop(deps)`：构造一个不持有 session.jsonl 的 Agent 实例（context 模块用 `KairosShortTermContext`），复用 `runAgentLoop`、ToolManager、LLMService。
- 主 Agent 入口 `createAgentForSession` 不变。

### `packages/desktop/src/main/kairos-ipc.ts`

新增文件，集中处理 Kairos IPC：

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
  | "cooldown";     // 连续 tick 错误熔断中

export type KairosRuntimeState = {
  enabled: boolean;
  state: KairosRunState;
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
  | { type: "reset_today" };
```

### IPC channels

| Channel | 方向 | Payload |
|---|---|---|
| `kairos:get-state` | renderer ↔ main | `void` → `KairosRuntimeState` |
| `kairos:get-events-recent` | renderer ↔ main | `{ limit?: number; before?: EventId }` → `SessionEvent[]`（ring buffer 不够时倒读 jsonl 补足） |
| `kairos:control` | renderer → main | `KairosControl` |
| `kairos:state` | main → renderer | `KairosRuntimeState`（runState 任意变更时推送） |
| `kairos:event` | main → renderer | `SessionEvent`（每条落盘成功后推送一次） |

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
  if ringBuffer.size >= 200:
      return ringBuffer.tail(200)
  else:
      // 从 short-term 当天 jsonl 倒序读补足，跨日时继续读昨天
      return mergeRecent(ringBuffer, jsonl, limit=200)
        ↓
renderer 把返回的 events 喂给 aggregator → 渲染表格
```

加载更多历史：用户在表格底部点"加载更多" → IPC 带 `before=<最旧 event id>` → main 按 before 倒序补 200 条 → 前端 append。

### Ring buffer 设计

- 默认上限 200 条 SessionEvent，对应大约 30–50 个聚合 row、覆盖几小时活动。
- 数据结构：环形数组 + insertion order index，O(1) append / O(1) tail 切片。
- 不持久化，不跨进程。
- 当 controller 收到 `reset_today` 时清空 ring buffer。

### 主 Agent 工具持久化路径

主 Agent 既有的 `runAgentLoop` → `engine/bridge.ts` 把工具事件写入主 Agent session.jsonl 的逻辑**不需要改**。Kairos 走的是同一个 `runAgentLoop`，但 bridge 实例不同——Kairos 的 bridge 把同样的 AgentEvent 转换成 SessionEvent 后写入 Kairos 的 short-term jsonl，而不是主 Agent 的 session.jsonl。

> 实现方式：`createKairosAgentForLoop` 注入一个 Kairos 专属的 `eventSink` 函数（写 short-term + ring buffer + emit IPC），bridge 的现有 `onEvent` 回调被替换为该 sink。

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

Kairos 的输入分为 4 大类，按"代码硬判断 vs LLM 软提示"两个维度组合。**关键不变量：JSON 配置原文永远不进 system prompt，进 prompt 的是代码读取后手动拼接的 tip 字符串。**

| 类别 | 加载机制 | 硬判断（代码层） | 软提示（system prompt） |
|---|---|---|---|
| **长期偏好（config）** | 启动一次性读 + chokidar 监听重载 | `preferences.sleepBias` 夹紧 sleep / `blocklist.paths` 拦工具 / `blocklist.timeWindows` 拦 tick | `preferences.tip` + `paths.tip` + `blocklist.tip` 拼接 |
| **主动任务（briefs）** | 调度器读 frontmatter，触发时投递 | cron 表达式调度 | 任务索引段一行摘要；触发时整篇 markdown 投到 user message |
| **自身记忆（memory）** | token 预算 + 多层摘要 | short-term 压缩触发 | summaries 进 system [6] 段；原文 jsonl 进 messages [A] 段 |
| **外部观测（observe）** | tick 前重算 | manifest diff 算法 / sessions-digest 重算 | watch-diff 摘要 + sessions-digest 拼字符串 |

### 关键不变量

1. **JSON 原文绝不进 system prompt**。所有 config 文件由 `prompt-assembler.ts` 读取后拼接成人话；LLM 看到的是 `tip` 字段和精简过的 paths 列表，看不到 `sleepRangeSeconds.min=30` 这种结构。
2. **rule.md 是 LLM 看到的唯一长文本规则**。其它配置文件的复杂结构由代码负责执行；用户想给 LLM 加规则，写到 rule.md 里。
3. **第 4 类绝不进上下文原文**。主 Agent session.jsonl 可能几十万 token，巡检文件夹可能上千文件——只有计数 + top N 路径进 prompt，原文走主 Agent 的 read_file / list_directory 等工具按需 fetch。
4. **briefs 任务正文只在被触发时注入**。任务索引（id/cron/status）在 system 段维持极简列表，正文等到任务真正执行那一刻再塞进 user message。
5. **短期记忆是无限期累积的**，没有"清理"概念，只有压缩到更高层（week → month → year）。

## 上下文构成

KairosRunner 每次 tick 由 `prompt-assembler.ts` 组装上下文。**LLM 看到的 system prompt 只有 5 段，全部由代码读 config + 文件后手动拼接字符串，永远不出现 JSON 原文。**

### System Prompt 段（6 段，每次 tick 重组）

```
[1] 核心指令段       ~500 tokens   prompt.ts 模板（pacing / wake-up / responsive / concise 等核心指令）
[2] 时空环境段       ~150 tokens   current_time + current_phase（work/quiet/weekend）+ active_briefs_count
[3] 配置提示段       ≤ 600 tokens  3 份 config 的 tip 拼接 + paths 列表（仅 path + watch 标记 + tip）
[4] 用户规则段       ≤ 1500 tokens config/rule.md 全文（用户写的纯文本规则）
[5] 观测摘要段       ≤ 800 tokens  sessions-digest 精简 + watch-diff 详情（含具体 added / removed 列表）
[6] 历史摘要段       ≤ 3000 tokens memory/short-term/ 加载的 week/month/year summary 文件
```

> v1 删除了原"常驻笔记段（pinned.md）"。Kairos 自己写的笔记不强制进 prompt——它每次 tick 通过 short-term 短期记忆能看到自己最近写过什么，足够形成连续性。等用户提需求再恢复 pinned 段。

[3] 段的拼接示例：

```
## 配置提示

[preferences] 我在工作时段更活跃，安静时段请少打扰；睡眠时长由我设置，超出会被夹紧。
[paths] Kairos 可访问的本地路径。watch=true 的路径会自动监听变化：
  - /Users/.../actspace-agent  →  actspace 项目根目录
  - /Users/.../actspace-agent/docs  (watch)  →  我的设计文档目录
  - <userData>/sessions/actspace-agent  →  主 Agent 的 session 存储
[blocklist] 含密钥的目录已被屏蔽，命中后工具会直接拒绝，不必绕路。
```

> LLM 看不到 `sleepRangeSeconds.min=30` 这种结构数据，也看不到 blocklist 的具体 glob 列表——这些都是代码硬判断的输入，给 LLM 看反而干扰判断。

### Messages 段（按 token 预算从新到旧加载）

```
[A] 短期记忆原文          按预算       memory/short-term/<month>/<day>.jsonl（最新 segment）
[B] 当前 tick user msg    ≤ 200       `<tick>YYYY-MM-DD HH:mm:ss</tick>` + 触发原因（来自 KairosTickInjectedPayload.trigger）
[C] 触发任务正文          动态         briefs/tasks/<id>.md 整篇（仅在该任务此次被触发时）
```

> v1 不做"watch diff 详情"独立段——所有 watch 变化由 system [5] 段一次性以人话呈现，含 added/removed 完整列表（受截断保护），Kairos 直接基于此决定要不要 read_file。

### Tools 段（v1 工具集）

| 工具 | 来源 | 备注 |
|---|---|---|
| `Sleep` | Kairos 专属 | 仅 Kairos 注册 |
| `read_file` / `list_directory` / `grep` / `glob` | 主 Agent 共享 | 经 ToolScheduler `callerAgent=kairos` 走 blocklist 校验 |
| `edit_file` / `write_file` | 主 Agent 共享 | 同上 |
| `bash` | 主 Agent 共享 | 默认启用；用户在 `blocklist.toolsDenied` 加 `"bash"` 可整体禁用 |
| `web_search` / `analyze_media` | 主 Agent 共享 | 同上 |

工具集**不再有 `kairos_*` 业务工具**。访问控制走 ToolScheduler 的 hook，详见后文 [工具系统扩展](#工具系统扩展callerAgent--extractPaths)。

## actspace 版 KAIROS 系统提示词

`packages/agent-core/src/kairos/prompt.ts` 维护 [1] 段核心指令模板，约束 v1 范围：

- 删除 heartclaw 中所有"天工 / 锻造令 / 取消请求"段落。
- 删除"长期记忆文件路径"段落（v1 不强制读主 Agent long-term memory）。
- 保留 7 条核心指令：Pacing / First wake-up / Subsequent wake-ups / Staying responsive / Bias toward action / Be concise / Terminal focus。
- 增加一条 actspace 专属：

  > 你目前没有 cron、定时任务和外部系统接入。在巡检时不要假装这些能力存在；专注于复盘最近用户对话、整理用户偏好、为下次交互准备建议。

- 增加上下文段说明：

  > 配置提示段告诉你哪些路径可读、哪些时间段不该打扰、哪些工具被禁用——这些都已由代码强制执行，无需你二次判断。
  >
  > 观测摘要段展示了主 Agent sessions 的最近活动和巡检目录的具体变化（每条都是相对 watch 根的完整路径）；**需要详情时用 read_file / list_directory 直接读**，不要假设你已经看过原文。
  >
  > 你可以把分析或学习要点写到 `<memory_dir>/notes/<YYYY-MM>/<title>.md`（用 write_file 新建，用 edit_file 修改/追加；追加做法是先 read_file 看末尾，再 edit_file 把"末尾段"替换为"末尾段 + 新内容"）。这些笔记只给用户在笔记 Tab 浏览，不强制注入下次 prompt——但你可以靠 short-term 记忆看到自己最近写过什么。

`prompt.ts` 模板的占位符（由 `prompt-assembler.ts` 替换）：

```
{current_time}          // 由 controller 在 tick 注入时替换
{current_phase}         // 由 preferences.rhythm 推导：work | quiet | weekend
{active_briefs_count}   // 当前 status=active 的 briefs 数
{config_tips_block}     // [3] 段拼好的字符串（含 paths 列表）
{user_rules}            // config/rule.md 全文（[4] 段）
{observation_summary}   // sessions-digest + watch-diff 详情（[5] 段）
{history_summary}       // working memory loader 输出的 summary 段（[6] 段）
```

## 存储布局

```
<userData>/kairos/
  ├─ config/                        # 类别 1：长期偏好（4 份 + 1 份 rule.md）
  │   ├─ preferences.json           # 全局开关 / 模型 / sleep 范围 / tickBudget / 熔断 / 节奏偏好
  │   ├─ paths.json                 # Kairos 可访问的路径列表（含 watch 标记）
  │   ├─ blocklist.json             # 路径黑名单 / 工具禁用 / 时间窗 / 单 tick 工具调用上限
  │   └─ rule.md                    # 用户写给 Kairos 的纯文本规则，全文注入 [4] 段
  │
  ├─ briefs/                        # 类别 2：用户主动任务
  │   ├─ index.json                 # 任务索引 + 状态机（id / status / lastRun / nextRun）
  │   └─ tasks/                     # 单任务 Markdown（frontmatter 元信息 + 正文）
  │       └─ <task-id>.md
  │
  ├─ memory/                        # 类别 3：Kairos 自身记忆（唯一持久化层）
  │   ├─ state.json                 # 启用状态 + active segment + last tick 位置
  │   ├─ short-term/                # 滚动记忆体（heartclaw 模式 + actspace SessionEvent 格式）
  │   │   ├─ 2026-05/
  │   │   │   ├─ 2026-05-27.jsonl            # 每行一条 SessionEvent
  │   │   │   ├─ 2026-05-27_001.jsonl        # reset_today 后的新段
  │   │   │   └─ week_05-17_to_05-23.summary.md
  │   │   ├─ 2026-04/
  │   │   │   └─ month_2026-04.summary.md
  │   │   └─ year_2025.summary.md
  │   └─ notes/                     # Kairos 写给自己/用户看的札记（走主 Agent write_file / edit_file）
  │       └─ 2026-05/
  │           └─ 2026-05-27-insight.md
  │
  └─ observe/                       # 类别 4：外部观测快照（每次 tick 前重算）
      ├─ sessions-digest.json       # 主 Agent session 列表精简摘要
      ├─ watch-manifest/            # 各 watch 目录上次扫描快照
      │   └─ <pathHash>.json        # { path, entries[], lastScanAt }（entries 是相对 root 的文件路径列表）
      └─ watch-diff.json            # 最近一次 tick 计算的 diff（added/removed 完整路径列表 + 截断标记）
```

> 注意：相比初版**已删除** `events/` 和 `journal/` 目录、`config/integrations.json`、`briefs/interests.md`、`briefs/do-not.md`、`memory/notes/pinned.md`、`memory/notes/pinned-archive/`。前者由 short-term 唯一承载；中间者用户应直接写到 `rule.md`；pinned 整套 v1 不做。

### 关键约定

- 启动时 controller 顺序读 `config/preferences.json` → `memory/state.json`，按 `preferences.enabled` 决定是否恢复 ticking；其他 config 在首次需要时懒加载，且由 chokidar 监听 mtime 变化触发热重载。
- `memory/short-term/` 完全复用 heartclaw `ShortMemoryStore` + `ShortTermMemoryContext` 模式，但**每行是 `SessionEvent`**（与主 Agent session.jsonl 完全对齐），不是 heartclaw 的 message dict。**唯一其它调整**：tick 密度高，token 预算"加载上限"从默认 60% 提到 75%，压缩触发阈值仍为 85%。
- `memory/notes/` 走主 Agent `write_file` / `edit_file` 写入，**不需要 Kairos 专属的 note-store 模块**。文件命名约定（如 `YYYY-MM/<slug>.md`）只在 prompt 中以建议形式告知，违反不阻断。
- `reset_today` 控制命令对当天 jsonl 走 `rotate_daily` 创建新 segment（不删除旧段，便于后续压缩），同时清空 ring buffer；`notes/` 和 `observe/watch-manifest/` 不动，避免误删用户/Kairos 已沉淀的内容。
- 任意时刻"Kairos 在做什么"都可以通过 `short-term/<YYYY-MM>/<today>.jsonl` 还原——这是 v1 的唯一可观测数据源，任何排查都从这里看起。

## Config 详设

v1 最终落到 **3 份 JSON + 1 份 Markdown**：

| 文件 | 作用 | 注入路径 |
|---|---|---|
| `preferences.json` | 全局开关 / 模型 / sleep 范围 / tickBudget / 熔断阈值 / 节奏偏好 | `tip` 进 [3] 段；数值由代码硬执行 |
| `paths.json` | 可访问路径列表（含 watch 标记） | `tip` 和 paths 列表进 [3] 段；权限由代码硬执行 |
| `blocklist.json` | 路径黑名单 / 工具禁用 / 时间窗 / 单 tick 工具调用上限 | `tip` 进 [3] 段；规则全部代码硬执行 |
| `rule.md` | 用户写给 Kairos 的纯文本规则 | 全文进 [4] 段 |

### 共同约定：`tip` 字段

所有 JSON 文件根对象都有一个 `tip: string` 字段，是一句给 LLM 看的人话。Config loader 把 `tip` 字段抽取后由 `prompt-assembler.ts` 手动拼接进 [3] 段，**JSON 结构数据本身不出现在 prompt 中**。

如果用户删掉某文件，loader 回退到内置默认值并 emit warning，不会让 Kairos 崩。

### `config/preferences.json`

```jsonc
{
  "tip": "我在工作时段更活跃，安静时段请少打扰；睡眠时长由我设置，超出会被夹紧。",

  "enabled": false,                                  // v1 默认关闭
  "modelId": null,                                    // null = 跟随主 Agent
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

合并了原 `workspaces.json` 和 `watch.json`。**每条路径只有 3 个字段**：

```jsonc
{
  "tip": "Kairos 可访问的本地路径。watch=true 的路径会自动监听变化。",
  "paths": [
    {
      "path": "/Users/.../actspace-agent",
      "watch": false,
      "tip": "actspace 项目根目录"
    },
    {
      "path": "/Users/.../actspace-agent/docs",
      "watch": true,
      "tip": "我的设计文档目录，有新增或修改希望你扫一眼"
    },
    {
      "path": "<userData>/sessions/actspace-agent",
      "watch": false,
      "tip": "主 Agent 的 session 存储，可以读历史对话总结"
    },
    {
      "path": "/Users/.../downloads/data",
      "watch": true,
      "tip": "我的下载数据目录，发现新 csv 帮我读取总结"
    }
  ]
}
```

**字段定义**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `path` | ✓ | 绝对路径或 `<userData>` 开头的占位符 |
| `watch` | ✗ | 默认 `false`。`true` 时 controller 每次 tick 前对该路径跑 manifest diff |
| `tip` | ✗ | 给 LLM 看的人话；强烈建议填，否则 LLM 不知道这个目录是干嘛的 |

**写死在代码里的策略**（永远不暴露给用户配置）：

- 默认 exclude（命中即整目录不进、不入 manifest）：`.git`、`node_modules`、`.DS_Store`、`.cache`、`dist`、`build`、`.next`、`__pycache__`、`.venv`、`venv`、`target`、所有 `.` 开头的隐藏文件/目录
- 单 watch 路径扫描文件上限：5000；扫到 5000 即停，short-term 写一条 warning event 提醒用户精简
- 单次 tick 单 path 最多展示 50 条变化（超出截断，摘要标"另有 N 条"）
- Kairos **永远不允许直接修改原文件**——要"整理一份副本"必须用 write_file 到 `<memory_dir>/notes/` 或其它授权写入路径

**硬判断接入**（由 `ToolScheduler` + `paths.json` 共同执行，详见 [工具系统扩展](#工具系统扩展callerAgent--extractPaths)）：

- 启动时 controller 把 `paths.json` 中的所有 `path` 收集为 Kairos 的 `allowedRoots: string[]`，**注入到 ToolScheduler 的 Kairos 专属上下文中**（不是改 `workspaceGuard` 的签名，避免影响主 Agent）。
- `callerAgent === "kairos"` 时，ToolScheduler 对工具 args 中的路径逐个调用 `guardWorkspacePath(path, root)`，**任一 root 通过即放行**——等价于 multi-root 校验，但不修改 guard 实现。
- 用户没把目录加进 `paths.json` 之前，Kairos 没法读它，也没法写它。主 Agent 的工具调用仍走单 root 校验，行为不变。

**watch 实现策略（v1 走 poll-on-tick + Node 原生递归）**：

1. **扫描**：每次 tick 开始前，调度器对每个 `watch=true` 的 path 跑一次手写递归扫描（Node `fs.readdir({ withFileTypes: true })`，**遇到 exclude 名字的目录不进去**——这是不用 ripgrep / 不用 `recursive: true` 的关键，避免扫到 `node_modules` 爆掉）。
2. **manifest 格式**：`observe/watch-manifest/<pathHash>.json`，`pathHash` 是 watch 根路径 SHA1 前 12 位：
   ```jsonc
   {
     "path": "/Users/.../docs",
     "entries": [                                  // 相对 root 的文件路径列表（已排序）
       "ARCHITECTURE.md",
       "design-docs/index.md",
       "design-docs/agent-core/kairos-autonomous-mode.md"
     ],
     "lastScanAt": "2026-05-27T19:00:00+08:00"
   }
   ```
   完整路径还原：`path.join(manifest.path, entry)`。**只追踪文件，不追踪目录本身**（空目录的出现/消失 Kairos 不感知；用户加文件进去自然就看到了）。
3. **对比**：新旧 entry 集合做 set 差集：
   - `added = newSet − oldSet`
   - `removed = oldSet − newSet`
   - **不识别 modified**（同名文件内容改了对 Kairos 不可见——v1 接受这个取舍）。重命名表现为 `removed + added` 两个独立项。
4. **写盘**：diff 结果写入 `observe/watch-diff.json`，作为 system [5] 段输入；同时新 entries 覆盖旧 manifest。
5. **首次启动**：manifest 文件不存在时视为 `oldEntries=[]`，本次所有 entry 都进 `added`（避免静默漏掉初次状态）。

**首次扫描的"全量 added"如何处理**：

- 如果首次扫到超过 50 条 added，按 50 截断 + 摘要"另有 N 条"，下次 tick 不会再重复——因为 manifest 已记下全部 entries。
- v1 不为"首次扫描"做特殊静默；用户授权一个新目录就应该被告知"里面已经有这些东西"。

**未来扩展**（不进 v1 config，全部留在代码里）：

- v2：增加 mtime 跟踪，把 modified 也作为信号；manifest 升级为 `entries: Array<{ path, mtime }>`，diff 算法叠加 mtime 对比。
- v3：变化数 ≥ 阈值时，调度器主动注入特殊 tick `<tick:watch-changed path=... files=[...]/>`，让 Kairos 立即 read_file 而不等下次自然 tick。
- v4：根据 `path.tip` 的语义（"帮我读 csv 总结"等），Kairos 自动 read_file + write_file 在 notes/ 生成总结副本。
- v5：如有用户要求才考虑加 include/exclude 字段；目前用"加一条更细的 path 进 paths.json"代替。

### `config/blocklist.json`

```jsonc
{
  "tip": "含密钥的目录和敏感工具已被屏蔽，命中后工具会直接拒绝，不必绕路。",

  "paths": ["**/.env", "**/.env.*", "**/secrets/**", "**/*.pem", "**/*.key"],
  "toolsDenied": [],                                 // 例：["bash"] 全局禁用 Bash
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
按项目分组总结，输出到 `<memory_dir>/notes/daily/YYYY-MM-DD-commits.md`。

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
| `event` | 由特定事件触发（v1 只支持 `watch.id` 事件，即某巡检目录有变更） |
| `manual` | 不自动触发，仅供用户在 UI 点"立即执行"时投递 |

### 创建方式

- **页面表单**：Kairos 页提供"新建 brief"按钮，弹窗收集 trigger / cron / 正文，提交后写盘并刷新 index。
- **直接编辑 Markdown**：用户也可手动在 `briefs/tasks/` 创建文件；调度器通过 mtime 检测到新文件自动收录。
- 两者等价，互不覆盖；UI 表单保存时不会破坏用户手写的额外 frontmatter 字段（merge 而非 overwrite）。

## Notes 说明

`memory/notes/` 是 Kairos 在日常 tick 中写给自己/用户看的 markdown 札记。**v1 走主 Agent 共享工具，零专属 API**：

| 动作 | 工具路径 |
|---|---|
| 新建一篇笔记 | `write_file` → `<memory_dir>/notes/<YYYY-MM>/<slug>.md` |
| 编辑某段 | `edit_file`，标准 `old_string → new_string` 替换 |
| 在末尾追加 | `read_file` → 找到末尾段 → `edit_file` 把"末尾段"替换为"末尾段 + 新内容"（不需要新工具/新字段） |

笔记内容典型场景（system prompt 中以建议形式告知 LLM）：

- **观察总结**：复盘最近 session、用户工作模式、当日变化趋势
- **watch 触发**：某个 watch 路径出现新文件，写一篇"今天的新增/删除"+ 初步分析
- **自我备忘**：跨 tick 的 todo（"上次 tick 看到 compressor.py:120，待续"）

**v1 不做的 pinned 机制**（写下来避免后续遗忘）：

- 不存在 `pinned.md`
- system prompt 没有"常驻笔记段"
- 没有 `kairos:pin-note` IPC
- 没有 1500 token 限额 / 归档逻辑
- 笔记 Tab 是只读浏览，没有 ⭐ 按钮

**Kairos 的"跨 tick 连续性"靠什么**：

- **短期记忆**（system [6] 段 + messages [A] 段）：Kairos 能看到自己最近写过什么笔记的 SessionEvent 流
- **观测摘要**（system [5] 段）：基于 sessions-digest + watch-diff
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

### 压缩触发

每次 tick 结束后检查：`estimate_tokens() >= contextWindow * 0.85` 时触发：

1. **优先磁盘压缩**：把"前天往前"的、还没被 summary 覆盖的日期取最多 7 天，调用 `compressor.compress_to_week_summary()` 生成 `week_MM-DD_to_MM-DD.summary.md`。
2. **fallback 当日压缩**：磁盘没有可压缩日期时，把当前 turn_start 之前的 in-memory items 压成 `intra_day_summary`（system [6] 段独立条目），保留当前 turn 的所有消息。
3. 压缩后调用 `_load_memory()` 重新加载，确保 system 段不重复。

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
          "turnCount": 12,
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
| `web_search` / `analyze_media` | 不实现（不涉及本地路径） |

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
| 用户切换 workspace root | Kairos 自动 stop，避免在错误 workspace 上继续巡检；用户重新启用 |
| 应用退出 | 持久化 `state.enabled` 与运行时计数，下次启动按 `enabled` 恢复 |

## 渲染规范（Kairos 页面）

Kairos 页面产品 UI 的详细规范以 `docs/design-docs/frontend-ui/Kairos监控页规范.md` 为准。本节只保留和自治模式数据流相关的渲染边界，避免前端视觉规则散落在后端设计文档里。

当前页面采用“顶部控制 + 紧凑运行轨迹 + 左执行列表 + 右统计/详情”的两列监控布局：

- 顶部只展示 `Kairos`、当前状态胶囊和 `暂停` / `立即唤醒` / `重置今日` 操作，不展示 Workspace、Session、Last wake、Sleep today 等 metadata chip。
- 运行轨迹只使用 4 类颜色语义：蓝色=回复，黄色=睡眠，红色=异常，灰色=其他事件。
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
| `paths.json` | 整体替换 | 立即生效；重建 Kairos 的 `allowedRoots`；watch 标记变化在下次 tick 生效（新增 watch 的首次 manifest 在下次 tick 计算，首次 diff 全部视为新增） |
| `blocklist.json` | 整体替换 | 立即生效；正在执行的工具调用不撤销 |
| `rule.md` | 内容缓存 | 下次组装 system [4] 段时重读 |
| `briefs/tasks/*.md` | 文件级监听 | 任何 markdown 变更触发 `briefs/index.json` 重建（按 fileMtime 差量） |

实现：用 `chokidar` 监听 `config/` 和 `briefs/tasks/` 两个目录。**这是 v1 唯一使用 fs.watch 的地方**——文件数量小、稳定性可控；用户加入 `paths.json` 的 watch 目录仍然走 poll-on-tick，避免 Electron 多目录监听的稳定性问题。

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
    - `current-module-map.md`、`storage-and-observability.md` 同步补 Kairos 节。
    - skill 内 `cron-job-kaiors.md` 不动；本设计文档作为 actspace 化的事实来源。

## 维护规则

- Kairos 的"为什么 / 边界 / 不变量"长期事实优先写在本文档。
- 已落地模块清单合并到 `agent-core/current-module-map.md`，本文档不重复记录实现细节。
- 存储路径变更必须同步 `storage-and-observability.md`。
- skill `cron-job-kaiors.md` 是通用知识来源，本文档只记录 actspace 化决策，不复述通用原理。
- 新增工具进入 Kairos 默认工具集时，需在本文档"安全与隐私"中显式记录默认信任范围。

## 附录：v1 实测目录树（2026-05-27）

源码：

```
packages/agent-core/src/kairos/
├── controller.ts             # createKairos / 装配中枢
├── scheduler.ts              # MessageQueue + QueueProcessor + clampSleep
├── runner.ts                 # KairosRunner.processTick
├── prompt.ts                 # KAIROS_SYSTEM_PROMPT 模板
├── prompt-assembler.ts       # 拼装 5 段
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
└── index.ts                  # 集成点（whenReady + agent:run-turn 钩子）

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
notes/...
```

详细字段语义见 `docs/design-docs/storage-and-observability.md` 的 "Kairos 存储与可观测性" 章节。
