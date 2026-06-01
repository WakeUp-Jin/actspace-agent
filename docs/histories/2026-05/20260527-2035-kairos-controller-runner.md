## [2026-05-27 20:35] | Task: 装配 Kairos Controller + Runner（plan 5）

### 🤖 Execution Context

- **Agent ID**: cursor-agent / actspace-agent workspace
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE / pnpm 10.33

### 📥 User Query

> 嗯嗯继续吧（执行 `docs/exec-plans/active/kairos_controller_runner.md`）

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **engine 层最小侵入扩展**：
  - `engine/types.ts` 给 `AgentLoopConfig` 新增 `toolExecuteOptions?: ToolExecuteOptions`，
    `engine/loop.ts` 把它原样透传给 `toolManager.execute(name, args, id, options)`。
  - 主 Agent 不传任何值 → 走零开销原路径；Kairos runner 传 `{ callerAgent:"kairos", kairosGuard }` 即激活 plan 2 的 ToolScheduler 双校验。
- **`kairos/prompt.ts`** 提供 `KAIROS_SYSTEM_PROMPT` 字符串模板（7 大节 pacing 指令 + 占位符 `{current_time}/{config_tips_block}/{user_rules}/{observation_summary}/{history_summary}` 等）。
- **`kairos/prompt-assembler.ts`** 在 plan 2 的 `buildConfigTipsBlock` 之上叠加：
  - `buildObservationSummary({ watchDiffs, sessionsDigest })`——拼接巡检差异 + 主 Agent sessions 摘要。
  - `buildHistorySummary({ shortTermResult })`——拼接 `summarySegments`。
  - `assembleSystemPrompt(...)`——总装并按 §5 ≤800tok / §6 ≤3000tok 截尾，使用占位符正则替换。
- **`kairos/scheduler.ts`**：
  - `MessageQueue` FIFO（含 system 任务通道）。
  - `clampSleep(raw, bias, prefs)` 走 deep×2 / light×0.5 系数后夹到 `sleepRangeSeconds.[min,max]`，raw≤0/NaN 走 default。
  - `sleepBiasAt(now, prefs)` 区分 weekend / quietHours（含跨午夜）/ workHours。
  - `QueueProcessor` 用尾递归 + 可中断 `setTimeout`（`SchedulerLike` 接口让测试 fake 时间），错误连续达 `circuitBreaker.errorThreshold` 切到 cooldown 状态等待 `cooldownSec` 后清零；`notifyMainAgentTurnStart/End` 维护 `mainAgentBusy` 信号让 scheduler 礼让 user。
- **`kairos/runner.ts` `KairosRunner.processTick`**：
  - 调 `observeRefresh()` → `shortTerm.load()` → `assembleSystemPrompt(...)`。
  - 落 `kairos_tick_injected` SessionEvent，构造 user message，调 `runAgentLoop` 跑一轮（含工具调用），AgentEvent 转 SessionEvent 通过 `eventSink` 异步落盘。
  - turn 闭合后扫 `tool_call(sleep, args.seconds)` 取最后一次合法值作为 `sleepSecondsRequested`（找不到返回 `null`，由 scheduler fallback 到 `preferences.default`）。
  - brief 触发时回调 `briefsIndex.markRun(id, ok|failed, now)`。
  - `applyConfig(config, guard)` 允许 controller reload 后热更新内部引用。
- **`kairos/controller.ts` `createKairos(opts)`**：
  - 拉起 ShortMemoryStore / RingBuffer / WatchDiffEngine / SessionsDigestBuilder / BriefsIndexManager / BriefsDispatcher / Runner / QueueProcessor。
  - `eventSink` 保证"先写盘 → push ring buffer → emit("event")"，写盘失败时不 push 不 emit。
  - 维护 `KairosRuntimeState` 计数：tick/turn 边界更新 todayTickCount、toolCallCountInCurrentTick、lastReplyAt、totalSleepSecondsToday。
  - `start()` 在 `preferences.enabled=false` 时直接进 `stopped` 状态不起 processor；启动后按 `firstTickDelayMs`（默认 5s）投递 `<tick first wake-up/>`。
  - `wakeNow()` / `resetToday()`（清 ring buffer + ShortMemoryStore.rotateDaily + 清当日计数）/ `reloadConfig()` 一应俱全。
  - `notifyMainAgentTurnStart/End` 桥到 QueueProcessor。
- **`kairos/aggregator.ts`** 是 `@actspace/shared` 的 thin re-export，让 agent-core 内部 import 路径稳定。
- **`kairos/index.ts`** 把 plan 1~5 全部公共类型/函数集中出口，main 进程一处 import 即可。
- **26 个新单测**：scheduler 12（含 fake scheduler 测可中断 sleep / 熔断进 cooldown）+ prompt-assembler 6 + runner 4（含 LLM 多次 sleep 取最后一次、brief markRun 调用）+ controller 4（含 enabled=false / first tick 落 ring buffer / reloadConfig / resetToday 清状态）。

### 🧠 Design Intent (Why)

- **toolExecuteOptions 走 loop.ts 透传**比"在 ToolManager 包装一个 KairosToolManager 子类"侵入面小一个数量级：主 Agent 路径不变，Kairos 路径只在 runner 多传两个字段。这也意味着将来如果加 `callerAgent: "subagent"` 都是 1 个 enum 值的事。
- **clampSleep 把 bias 折算成乘数**（deep×2 / light×0.5）而非另一套独立 min/max——避免配置爆炸；用户调一套 sleepRangeSeconds，全天分时段的"睡得深/浅"由 rhythm 决定。
- **QueueProcessor 的 sleep 中断走 Promise + handle 双轨**：`runInterruptibleSleep` 同时 setTimeout 排定和 expose 一个 resolve；`triggerWake` 调 `clearTimeout` 再 `resolve(reason)`，保证一定终止当前等待。测试用 `FakeScheduler` 完全替代真实 setTimeout，单测可在 0ms 内验证 60s sleep 自然结束。
- **KairosRunner 不持有 sessionId**：Kairos 不写 session.jsonl（plan 6 main IPC 之外，连前端 session 列表都不该露面），通过 `kairos-<YYYY-MM-DD>` 伪 id 满足 SessionEvent 的字段必填。所有真正的"持久化"都走 ShortMemoryStore。
- **`extractLastSleepSeconds` 而不是 `args.seconds`**：Sleep 是"工具调用记账"，runner 不读 tool_result 而读 tool_call.arguments——result 可能被截断，arguments 才是 LLM 真实意图。一个 turn 多次调 sleep 时取最后一次是 plan 共识（前面的视为思考过程被覆盖）。
- **controller 启动序列的"先创建目录再 load config"** 让首次启动也能写文件，而不是要求用户先 mkdir。preferences.enabled 默认 false 是设计共识——Kairos 不要在用户毫无感知时跑动消耗 API 配额。
- **`onSleepStart/onSleepEnd` 由 scheduler 回调而非 runner 主动写盘**：scheduler 是"知道 sleep 真实时长"的人，runner 已经在 tick 闭合后退出；这样 `kairos_sleep_start/end/interrupted` 的 `actualSeconds/remainingSeconds` 字段才能填准确值。

### 📚 Required Reading (Knowledge Used)

- `docs/exec-plans/active/kairos_controller_runner.md`：整体设计依据。
- `packages/agent-core/src/engine/{loop,agent,types}.ts`：现有 runAgentLoop 接口。
- `packages/agent-core/src/tools/{manager,scheduler}.ts`：plan 2 已建的 Kairos guard 集成点。
- `packages/agent-core/src/kairos/{config,context,storage,briefs,compression,tools}/`：plan 2~4 全部产物。
- `packages/shared/src/{session,kairos-contracts}.ts`：SessionEvent / KairosRuntimeState 契约。
- `.agents/skills/llm-agent-dev/references/agent-runtime/cron-job-kaiors.md`：Kairos 概念锚点。

### 🔧 Pragmatic Adjustments vs Plan

- **未实现"_internal/monthly-archive" brief**：plan §8 提议把月度/年度归档作为 controller 自维护 brief。v1 跳过——LLM 自己可以写 notes，用户需要时再手动加 brief；plan 7 e2e 再补这块自动化。理由：归档逻辑要再写一个"按 cron 表达式触发"的特例（briefs v1 只支持 intervalSec），与简化原则冲突。
- **blocklist.timeWindows / tickBudget 不在调度层硬执行**：v1 由 system prompt 段提示 LLM 自尊重；plan 文档保留"v2 加 hard guard"。理由：用户调好作息节奏更需要 LLM 配合，而非代码硬切——硬切错过 cron brief 反而扣印象分。
- **configWatcher 改为 controller.reloadConfig() 主动调用**：plan §6 步骤 2 提议 chokidar 监听；v1 让 main IPC 在用户保存 config 后 await `reloadConfig()`。理由：plan 2 已经放弃 chokidar，本 plan 不必再开 dep。
- **scheduler 错误处理简化**：cooldown 后清零再 idle，没实现"渐进性退避"（指数后退）。理由：errorThreshold=5 + cooldownSec=60 已经能挡住短时网络抖动；持续抛 5 次足够说明环境出了根本问题，让用户人介入比代码自救更稳。

### 🧱 Architectural Impact

- 在 agent-core 内首次出现"长生命周期 controller"，与现有 stateless `Agent` 类形成两条独立运行轨：
  - 主 Agent：被动 turn-based，sessionId 强绑定。
  - Kairos：主动 tick-based，伪 sessionId 仅用于落盘 schema 合规。
- `engine/loop.ts` 通过 `toolExecuteOptions` 字段建立"caller-aware 工具执行"的扩展点；后续 subagent 路径也可走该字段。
- `kairos/index.ts` 收口让 main 进程只 import `@actspace/agent-core/kairos` 一处，避免 IPC 层与内部目录耦合。

### 🧪 Verification

- **单元测试**：`pnpm --filter @actspace/agent-core test`
  - 全 packages/agent-core：**375/375 通过**（plan 5 新增 26 个）。
  - 关键覆盖：clampSleep 6 case / sleepBiasAt 跨午夜 / QueueProcessor sleep 自然结束 + 中断 + 熔断 cooldown / runner 提取 last sleep / brief markRun / controller enabled toggle / reloadConfig / resetToday。
- **类型**：`pnpm typecheck` 整库通过（packages/shared + agent-core + desktop）。
- **Lints**：`ReadLints(packages/agent-core/src/kairos, engine/loop.ts, engine/types.ts)` 无 issue。

### 📝 Files Touched

新增：
- `packages/agent-core/src/kairos/prompt.ts`
- `packages/agent-core/src/kairos/prompt-assembler.ts`
- `packages/agent-core/src/kairos/scheduler.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/aggregator.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/agent-core/src/kairos/test/{scheduler,prompt-assembler,runner,controller}.test.ts`

修改：
- `packages/agent-core/src/engine/types.ts`：`AgentLoopConfig.toolExecuteOptions` 新字段。
- `packages/agent-core/src/engine/loop.ts`：executeToolCalls 透传 options。
- `packages/agent-core/src/kairos/config/prompt-assembler.ts`：导出 `CONFIG_TIPS_TOKEN_BUDGET` / `TOKEN_CHARS_PER_UNIT` 给 plan 5 复用。
- `docs/design-docs/agent-kairos-autonomous-mode.md`：更新 plan 5 完成状态。

### 🚥 Next Steps

- 进入 plan 6 `kairos_main_ipc_and_renderer`：把 `KairosController` 实例化到 main 进程，通过 IPC 暴露 control/event/state，写 renderer 的 `KairosPage`（4 个 tab：Live / Briefs / Notes / Settings）+ 集成"主 Agent runTurn 边界" `notifyMainAgentTurn{Start,End}` 调用点。
- 然后 plan 7 `kairos_e2e_and_docs_sync`：端到端真实启动 Kairos 跑 1 个真 tick + 把 storage / observability 文档同步更新 + 写最终 sweep history。
