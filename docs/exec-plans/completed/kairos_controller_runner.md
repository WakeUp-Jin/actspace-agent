# Kairos Controller + Runner 装配

## 目标

把前面几份 plan 产出的"零件"装配成 Kairos 自治闭环：

- `KairosController`：单实例，持有 scheduler / runner / config-loader / observe / briefs / shortTermMemory / ringBuffer / configWatcher 的引用；处理 `start` / `stop` / `wake_now` / `reset_today` 控制；emit `state` / `event`。
- `MessageQueue` + `QueueProcessor`：尾递归调度、可中断 sleep、tickBudget 限额、blocklist.timeWindows 拦截、熔断。
- `KairosRunner`：消费一个 `TickPayload`（来自 dispatcher），组装 system prompt（[1]~[6] 全部段）+ messages，调 `runAgentLoop`；通过 `eventSink` 把 SessionEvent 写入 short-memory-store + ring-buffer + IPC channel。
- `prompt-assembler`：把 plan 2 的 `buildConfigTipsBlock`、plan 3 的 `summarySegments`、plan 4 的 sessions-digest + watch-diff 一起拼装出完整 [1]~[6] 段。
- 月度/年度归档作为内部 brief 维护任务（不暴露 UI）。

完成后整个 agent-core 侧的 Kairos 业务逻辑闭环；只剩 main IPC + renderer 两端联调。

## 范围

- 包含：
  - `packages/agent-core/src/kairos/controller.ts`（新增）
  - `packages/agent-core/src/kairos/scheduler.ts`（新增；MessageQueue + QueueProcessor）
  - `packages/agent-core/src/kairos/runner.ts`（新增）
  - `packages/agent-core/src/kairos/prompt.ts`（新增；KAIROS_SYSTEM_PROMPT 模板，纯字符串）
  - `packages/agent-core/src/kairos/prompt-assembler.ts`（**扩展** plan 2 已建的同名文件；增加 [5][6] 段拼接）
  - `packages/agent-core/src/kairos/aggregator.ts`（thin re-export from `@actspace/shared`；让本 package 也能 import）
  - `packages/agent-core/src/engine/agent.ts` 新增工厂入口 `createKairosAgentForLoop(deps)`
  - `packages/agent-core/src/kairos/index.ts`（导出 `createKairos(deps)`）
  - 上述模块单测
- 不包含：
  - main 进程 IPC（`kairos_main_ipc_and_renderer` plan）
  - renderer KairosPage（同上）
  - 任何 plan 2/3/4 已经实现的模块（仅消费）

## 依赖关系

- 依赖（顺序前置，必须先完成）：
  - `kairos_shared_contracts`
  - `kairos_config_and_tool_guard`
  - `kairos_short_term_memory`
  - `kairos_observe_and_briefs`
- 产出给：`kairos_main_ipc_and_renderer`（main 进程 hold 一个 KairosController 实例并桥接到 IPC）

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md` 的「架构总览」「Tick 调度规则」「上下文构成」「actspace 版 KAIROS 系统提示词」「与主 Agent 的交互边界」「错误处理与熔断」六章
- `.agents/skills/llm-agent-dev/references/agent-runtime/cron-job-kaiors.md`（通用 KAIROS 概念）
- `.agents/skills/llm-agent-dev/examples/kairos-runner.ts`（参考实现伪代码）
- `packages/agent-core/src/engine/agent.ts`（理解 `createAgentForSession` + `runAgentLoop` 现有形态）
- 前置 plan 的所有公开导出（schema / loader / watcher / prompt-assembler 已有 [3] 段 / ShortMemoryStore / ShortTermMemoryContext / RingBuffer / Compressor / WatchDiffEngine / SessionsDigestBuilder / BriefsIndexManager / BriefsDispatcher / Sleep 工具）

## 背景

- 关键约束：
  - **KairosRunner 永远不消费 user 消息**——user 消息只走主 Agent；Kairos 只消费 tick。
  - 主 Agent runTurn 时 emit `kairos.wake()` 信号 → controller 中断 Kairos sleep；本 plan 不改主 Agent，但需在 `engine/agent.ts` 暴露 `onUserTurnStart` 钩子供 controller 订阅。
  - Sleep 工具是"记账"——controller 从本次 tick 的 SessionEvent 流中提取最后一次 `tool_call(sleep, args={seconds})` 并夹紧后进入实际 setTimeout 等待。
  - 控制器 emit 的所有 SessionEvent 必须**先写盘 → 再 push ring buffer → 再回调 listener**（IPC 推送由 main 在 listener 中触发）。
  - 月度/年度归档作为 controller 内部 brief（不暴露用户 UI），在 quiet hours 由 dispatcher 选中后 runner 执行。

## 设计方案

### 1. KAIROS_SYSTEM_PROMPT 模板（`prompt.ts`）

```ts
export const KAIROS_SYSTEM_PROMPT = `
You are Kairos, the autonomous companion of the user's actspace-agent.

# Pacing
{...保留 7 条核心指令: Pacing / First wake-up / Subsequent wake-ups / Staying responsive / Bias toward action / Be concise / Terminal focus...}

# actspace 专属约束
你目前没有 cron、定时任务和外部系统接入。在巡检时不要假装这些能力存在；
专注于复盘最近用户对话、整理用户偏好、为下次交互准备建议。

# 配置与规则
配置提示段告诉你哪些路径可读、哪些时间段不该打扰、哪些工具被禁用——
这些都已由代码强制执行，无需你二次判断。

观测摘要段展示了主 Agent sessions 的最近活动和巡检目录的具体变化（每条都是相对 watch 根的完整路径）；
需要详情时用 read_file / list_directory 直接读，不要假设你已经看过原文。

你可以把分析或学习要点写到 <memory_dir>/notes/<YYYY-MM>/<title>.md
（用 write_file 新建，用 edit_file 修改/追加；追加做法是先 read_file 看末尾，再 edit_file 替换"末尾段"为"末尾段 + 新内容"）。
这些笔记只给用户在笔记 Tab 浏览，不强制注入下次 prompt。

# 上下文段
[当前时间] {current_time}（{current_phase}）
[活跃 briefs] {active_briefs_count} 个

{config_tips_block}

# 用户规则
{user_rules}

# 观测摘要
{observation_summary}

# 历史摘要
{history_summary}
`.trim();
```

`prompt.ts` 仅维护模板字符串。占位符替换交给 `prompt-assembler.ts`。

### 2. prompt-assembler 扩展（在 plan 2 基础上加 §5/§6 段）

```ts
// plan 2 已建：buildConfigTipsBlock(config)
// 本 plan 新增：

export async function buildObservationSummary(opts: {
  watchDiffs: WatchDiffEntry[];
  sessionsDigest: SessionsDigestResult;
}): Promise<string>;

export async function buildHistorySummary(opts: {
  shortTermResult: KairosShortTermLoadResult;
}): Promise<string>;

export async function assembleSystemPrompt(opts: {
  config: KairosConfig;
  watchDiffs: WatchDiffEntry[];
  sessionsDigest: SessionsDigestResult;
  shortTermResult: KairosShortTermLoadResult;
  now: Date;
  activeBriefsCount: number;
}): Promise<string>;
```

`buildObservationSummary` 输出示例：

```
## 巡检目录变化（截至 2026-05-27 19:00:00）

### /Users/.../actspace-agent/docs
（用户标注：设计文档目录，有新增或修改希望你扫一眼）
- 新增 2：
  - design-docs/agent-core/kairos-autonomous-mode.md
  - histories/2026-05/...
- 删除 0

### /Users/.../downloads/data
（用户标注：下载数据目录，发现新 csv 帮我读取总结）
- 新增 1：2026-Q1/sales.csv
- 删除 0

## 主 Agent 最近 sessions（按未读 turn 数排序）

- session-xxx "Kairos 设计讨论" (12 turns, 2 unread)
  最新 user: "上下文如何注入..."
- session-yyy "Tailwind 重构" (8 turns, 0 unread)
```

`buildHistorySummary` 把 `shortTermResult.summarySegments` 用 `\n\n---\n\n` 拼接即可。

`assembleSystemPrompt` 把所有占位符替换并按 600/800/3000 token 预算各自截尾。

### 3. Scheduler（`scheduler.ts`）

```ts
export type QueueMessage =
  | { type: "tick"; payload: TickPayload }
  | { type: "system"; payload: { kind: "compress" | "monthly-archive" | "yearly-archive" } };

export class MessageQueue {
  enqueue(msg: QueueMessage): void;
  dequeue(): QueueMessage | null;
  isEmpty(): boolean;
}

export class QueueProcessor {
  constructor(opts: {
    queue: MessageQueue;
    runner: KairosRunner;
    config: KairosConfig;
    onStateChange: (state: KairosRunState) => void;
  });

  start(): Promise<void>;                          // 注入第一个 tick 后进入循环
  stop(): Promise<void>;                           // 等当前 tick 跑完，不强杀
  triggerWake(reason: "user_message" | "wake_now"): void;
  resetToday(): Promise<void>;                     // 切 short-term 文件 + 清 ring buffer
}
```

主循环（伪码）：

```
loop:
  if queue 空 and state==idle and 不在 blocklist.timeWindows:
      投递 dispatcher.pickNext(now)
  msg = queue.dequeue()
  if blocklist.timeWindows.includes(now): 推迟到窗口外; continue
  if tickBudget.超额: stop(); emit error; break
  state = ticking
  try:
      result = await runner.processTick(msg)
      sleepSecs = result.sleepSecondsRequested || preferences.sleepRangeSeconds.default
      clamped = clampSleep(sleepSecs, sleepBias(now))
      state = sleeping
      emit kairos_sleep_start({ plannedSeconds: clamped })
      await wakeOrTimeout(clamped)                  // 可被 triggerWake 中断
      if wakeReason=="user_message":
          emit kairos_sleep_interrupted
          state = interrupted
          await waitMainAgentDone()                  // 等主 Agent runTurn 完
          await delay(5000)                          // 防 user 立即跟进
      else:
          emit kairos_sleep_end
      consecutiveErrors = 0
  catch err:
      emit error
      consecutiveErrors++
      if consecutiveErrors >= circuitBreaker.errorThreshold:
          state = cooldown
          await delay(cooldownSec * 1000)
          consecutiveErrors = 0
  state = idle
```

### 4. KairosRunner（`runner.ts`）

```ts
export type TickResult = {
  sleepSecondsRequested: number | null;            // 从工具调用历史里抓的最后一次 Sleep
  toolCallCount: number;
};

export class KairosRunner {
  constructor(opts: {
    config: KairosConfig;
    shortTerm: KairosShortTermMemoryContext;
    observeRefresh: () => Promise<{ watchDiffs; sessionsDigest }>;
    briefsCount: () => Promise<number>;             // 活跃 briefs 数
    eventSink: (event: SessionEvent) => Promise<void>;  // 写盘+ringbuffer+IPC
    llm: LLMService;
    toolManager: ToolManager;                       // Kairos 专属（已注册 Sleep + 主 Agent 工具集 − blocklist.toolsDenied）
    kairosGuard: KairosGuardContext;                // 给 ToolScheduler 用
  });

  async processTick(msg: QueueMessage): Promise<TickResult>;
}
```

`processTick` 流程：

1. 调 `observeRefresh()` 拿 `watchDiffs` + `sessionsDigest`
2. 调 `shortTerm.load()` 拿 `shortTermResult`
3. 调 `assembleSystemPrompt({ ... })` 拿 system prompt
4. 准备 user message：`{ role: "user", content: payload.content }`
5. 发出 SessionEvent：`kairos_tick_injected({trigger, content, briefId?})`
6. 调 `createKairosAgentForLoop(deps).runTurn(systemPrompt, messages, ...)`，所有工具调用通过 ToolScheduler 时传 `callerAgent: "kairos", kairosGuard: opts.kairosGuard`
7. runAgentLoop 内部产生的所有 AgentEvent → 转为 SessionEvent → 通过 `eventSink` 异步落盘
8. turn 结束后扫描本次 SessionEvent 流，找最后一次 `tool_call(sleep, args.seconds)`，作为 `sleepSecondsRequested`
9. 工具调用计数累加
10. 如果触发了 brief：调 briefs index `markRun(briefId, result, nextRun)`
11. 检查 short-term `estimateTokens()`，超阈值时**异步**启动压缩（不阻塞返回）

### 5. `createKairosAgentForLoop`（`engine/agent.ts` 加新工厂）

```ts
export function createKairosAgentForLoop(deps: {
  llm: LLMService;
  toolManager: ToolManager;
  systemPromptBuilder: () => Promise<string>;
  eventSink: (event: SessionEvent) => Promise<void>;
  shortTermContext: KairosShortTermMemoryContext;
}): KairosAgent;
```

实现：

- 复用 `runAgentLoop`，但 ContextManager 只注册 `KairosShortTermMemoryContext`（不注册主 Agent 的 ConversationContext）。
- 不创建任何 session.jsonl；落盘走 `eventSink`。
- 不持有 sessionId（用 `kairos-<date>` 伪 id 标识 SessionEvent）。
- 主 Agent 入口 `createAgentForSession` 不变。

### 6. Controller（`controller.ts`）

```ts
export interface KairosController {
  start(): Promise<void>;
  stop(): Promise<void>;
  wakeNow(): Promise<void>;
  resetToday(): Promise<void>;
  getState(): KairosRuntimeState;
  on(event: "state", listener: (s: KairosRuntimeState) => void): void;
  on(event: "event", listener: (e: SessionEvent) => void): void;
  notifyMainAgentTurnStart(): void;                  // 主 Agent 调用，触发 wake
  notifyMainAgentTurnEnd(): void;
}

export function createKairos(deps: {
  kairosRoot: string;                               // <userData>/kairos
  llm: LLMService;
  toolManagerFactory: () => ToolManager;            // 让 controller 实例化 Kairos 专属 ToolManager
  contextWindow: number;
}): Promise<KairosController>;
```

启动序列（`start`）：

1. `loadKairosConfig(kairosRoot)`
2. `configWatcher.start()`，绑定每个文件的 listener（变更时重新 load 对应部分并应用）
3. 实例化 `ShortMemoryStore` / `KairosShortTermMemoryContext` / `RingBuffer` / `WatchDiffEngine` / `SessionsDigestBuilder` / `BriefsIndexManager` / `BriefsDispatcher` / `Compressor`
4. `briefsIndex.startWatching()`
5. 用 `toolManagerFactory()` 创建 Kairos 专属 ToolManager，注册主 Agent 工具集 − `blocklist.toolsDenied`，再调 `registerKairosTools()` 加 Sleep
6. 构造 `runner`、`queue`、`processor`
7. 注册主 Agent wake 信号订阅（监听主 Agent runTurn）
8. 注入"启动后第一次 tick"：5s 后投 `{trigger:"auto", content:"<tick first wake-up/>"}` 到 queue
9. processor.start()
10. 把 controller 状态切到 `enabled=true, state=idle`

`notifyMainAgentTurnStart()` 调用 `processor.triggerWake("user_message")`；`notifyMainAgentTurnEnd()` 解除"等主 Agent 完成"信号。

### 7. EventSink 内部

```ts
async function eventSink(event: SessionEvent): Promise<void> {
  await shortMemoryStore.appendEvent(event);
  ringBuffer.push(event);
  controller.emit("event", event);
}
```

**写盘必须先于推送**——失败时不 push 不 emit，错误进 `logs/`。

### 8. 月度/年度归档作为内部 brief

在 controller 启动时检查 `briefs/index.json`：

- 若不存在 id `_internal/monthly-archive` 的 brief，则创建一份：
  - `id: "_internal/monthly-archive"`, `trigger: "cron"`, `cron: "0 3 1 * *"`（每月 1 号 03:00），`priority: "low"`, `body: "请把上个月的 week summaries 合并成 month_YYYY-MM.summary.md"`
- 同理 `_internal/yearly-archive`：`cron: "0 3 1 1 *"`
- 文件保存在 `briefs/tasks/_internal-monthly-archive.md` / `_internal-yearly-archive.md`
- 前端 UI **不展示** id 以 `_internal/` 开头的 brief（dispatcher 不过滤；UI 过滤）

### 9. 测试

`scheduler/__tests__/scheduler.test.ts`：

- 注入 tick → 处理 → 进入 sleep → 自然结束再注入
- sleep 中 triggerWake → 当前 sleep 立即结束 → 等"主 Agent 完成"信号 → 再 delay 5s → 才注入下一个 tick
- 连续 5 次 runner.throw → 进 cooldown
- rhythm.sleepBias=deep + work hours → default sleep 翻倍并夹紧 min=300s
- blocklist.timeWindows 命中 → tick 推迟到窗口外
- tickBudget.perHour 超限 → emit error + stop

`runner/__tests__/runner.test.ts`：

- MockLLMService.setResponses 给一个"调 Sleep(seconds=60) + 回 'done'"的响应
- 验证 tick 后 `sleepSecondsRequested === 60`
- 多次 Sleep 调用 → 取最后一次合法值并夹紧
- brief 投递 → SessionEvent 流中第一个 event 是 `kairos_tick_injected({trigger:"brief"})`
- 验证 system prompt 中包含 [3] 段配置 + [5] 段观测 + [6] 段 history

`controller/__tests__/controller.test.ts`：

- start → state=idle → processor 投第一个 tick
- 修改 preferences.enabled=false 触发 reload → 等当前 tick 完成 → state=stopped
- notifyMainAgentTurnStart → state=interrupted
- resetToday → short-term 切段 + ring buffer 清空

`prompt-assembler/__tests__/observation.test.ts` / `history.test.ts` / `system-prompt.test.ts`：

- watch diffs 合并展示
- sessions-digest 按 unreadTurnsForKairos 降序排
- 完整 system prompt 长度 ≤ 6000 token

## 任务拆分

- [ ] Step 1：新建 `kairos/prompt.ts`，按 §1 写完模板。
- [ ] Step 2：在 plan 2 已建的 `kairos/config/prompt-assembler.ts`（或新建 `kairos/prompt-assembler.ts`）追加 `buildObservationSummary` / `buildHistorySummary` / `assembleSystemPrompt`；写单测。
- [ ] Step 3：新建 `kairos/scheduler.ts`：MessageQueue + QueueProcessor + clampSleep + sleepBias 推导；写 `scheduler.test.ts`。
- [ ] Step 4：在 `engine/agent.ts` 新增 `createKairosAgentForLoop`，复用 runAgentLoop；新增对应单测（可用 mock LLM + mock ToolManager）。
- [ ] Step 5：新建 `kairos/runner.ts`：实现 processTick；写 `runner.test.ts` 含 Sleep 抽取、brief 投递、system prompt 含全段。
- [ ] Step 6：新建 `kairos/aggregator.ts` 作为 thin re-export from shared；保证 agent-core 内部 import 路径稳定。
- [ ] Step 7：新建 `kairos/controller.ts`：实现 createKairos + 启动序列 + 月度/年度归档 brief 自维护；写 `controller.test.ts`。
- [ ] Step 8：新建 `kairos/index.ts`，导出 `createKairos` 与所有公共类型。
- [ ] Step 9：跑 `pnpm --filter @actspace/agent-core test` + `pnpm typecheck`；修复任何 import 循环。
- [ ] Step 10：补一条 history：`docs/histories/<month>/<timestamp>-kairos-controller-runner.md`，列出 controller 启动序列、scheduler 关键不变量与已覆盖单测。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm typecheck`（monorepo 根）
- 手工检查：
  - 用 Node REPL（或专门 dev script `pnpm dev:kairos-loop`，如不需要 IPC 测试用）：
    - 构造一个临时 `<userData>/kairos/` 目录
    - `await createKairos({ kairosRoot: ".../kairos", llm: mockLLM, ... }).start()`
    - 观察 short-term jsonl 在 5 秒后出现新条目；触发 mainAgentTurnStart → state 切到 interrupted
- 观测检查：
  - controller 启动后 `briefs/index.json` 应包含两个 `_internal/*-archive` 项
  - tick 后 `<short-term jsonl>` 含 `kairos_tick_injected` → `tool_call` → `tool_result` → `assistant_message` → `kairos_sleep_start` 顺序

## 风险

- 风险：Sleep 抽取逻辑（"最后一次合法值"）错误，导致 Kairos 永不入睡或睡太久。
- 缓解：单测覆盖 0 / 负数 / 字符串 / 多次调用；fallback 走 `preferences.sleepRangeSeconds.default`。

- 风险：主 Agent wake 信号订阅不当，导致 main runTurn 期间 Kairos 仍偷跑 tick。
- 缓解：runner 在 processTick 开头检查 `state===interrupted` 直接 return；主 Agent 集成点（在 `kairos_main_ipc_and_renderer` plan）补端到端测试。

- 风险：月度/年度归档 brief 文件被用户手动删除后，启动序列每次都自动重建带来困惑。
- 缓解：删除后下次启动 controller 自动重建并 emit warning；前端 UI 同时把 `_internal/*` brief 标为 "system maintained, 不可删除"。

- 风险：assembleSystemPrompt 在某些极端 config 下超长。
- 缓解：每段独立截尾（[3]≤600, [4]≤1500, [5]≤800, [6]≤3000），实测总长 ≤6300 token；安全余量大。

- 风险：runAgentLoop 在 Kairos 模式下因没有 SessionStore 而依赖错误。
- 缓解：在 `createKairosAgentForLoop` 中传入 null SessionStore 或专属 noop SessionStore；engine/agent.ts 已隐含支持"无 session"路径（如未支持则在本 plan 改造一次，保持兼容）。

## 决策记录

- 2026-05-27：scheduler 使用尾递归 + 异步 queue，而非 setInterval。原因：tick 处理时长不固定（含 LLM 等待），尾递归确保上一个 tick 真正结束才开始下一个；setInterval 容易堆积。
- 2026-05-27：wake 后 delay 5s 再注入下一个 tick，写死。原因：避免主 Agent runTurn 刚结束 user 又跟进一句被 Kairos 抢资源；5s 是经验值，足够 user 思考下一句。
- 2026-05-27：内部维护任务（归档）走 brief 路径而不是另起一套调度。原因：复用 dispatcher + cron 已有能力，零新代码；UI 通过 `_internal/` 前缀屏蔽即可。
