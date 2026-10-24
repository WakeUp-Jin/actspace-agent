# 后台任务：后台 Bash、后台子智能体与任务工具

## 目标

后台 Bash 与后台子智能体由 Host 统一登记；完成时通知送达并能叫醒空闲会话；Agent 通过 `task_list` / `task_output` / `task_stop` / `task_wait` 查看和管理；每轮开始注入运行中任务清单；前端卡片只多一个「后台」标签，空闲唤醒的回合以细分隔行开头。

## 范围

- 包含：设计文档 [`agent-background-tasks.md`](../../design-docs/collaboration/agent-background-tasks.md) 中 D1–D10 的全部内容。
- 不包含：子智能体工具扩展（Bash/编辑）与审批冒泡；前台转后台按钮；统一「后台任务」面板；重启后恢复子智能体；子智能体内的后台任务。

## 背景

- 必读：`AGENTS.md`、设计文档、`docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md`、`docs/design-docs/collaboration/agent-subagent-runtime.md`、`docs/design-docs/frontend/front-新功能开发清单.md`。
- 代码路径：
  - 调度：`packages/agent-service/src/{service,run-manager,task-ledger}.ts`、`packages/runtime/src/harness/{managed-runs,agent-runtime-plugin,agent-factory-plugin,default-harness,default-harness-definition}.ts`
  - Loop 与收件箱：`packages/core/agent-loop/src/loop.ts`、`packages/core/agent/src/{inbox,agent-form,agent-mode-policy}.ts`
  - Bash：`packages/tools/shell-tools/src/{plugin,manifest,node-ports}.ts`
  - 子智能体：`packages/subagent/src/{tool-plugin,provider}.ts`、`packages/runtime/src/harness/harness-subagent-tools.ts`
  - 上下文：`packages/context/engine/src/modules.ts`、`packages/context/runtime/`（模板）
  - 事件与投影：`packages/session/journal/src/core-codecs.ts`、`packages/session/projection/src/facts.ts`、`packages/shared/src/runtime-v2/tasks.ts`、`packages/shared/src/session-selectors.ts`
  - 前端：`packages/client/src/sessions/{tool-card,chat}.ts`、`apps/desktop/src/renderer/components/messages/{BashRunBlock,AgentRunBlock,AgentIdentity}.tsx`、`apps/desktop/src/renderer/components/conversation/turns.ts`、`apps/desktop/src/renderer/session/{task-queue,message-queue}.ts`、`apps/desktop/src/renderer/trajectory/context-sections.ts`、`apps/desktop/src/renderer/App.tsx`（`bash_task_update`）
  - 忙碌判断：`packages/agent-service/src/application.ts`、`packages/agent-host/src/lifecycle.ts`
- 约束：
  - 新 core 扩展事件 `background/task` 使用 required codec，旧二进制不能继续写入含该事件的 Journal（与 lifecycle 文档既有规则一致）。
  - `fix/settings-model-select` 上有未提交的子 Agent 轨迹改动，本分支照常修改，合并时再解冲突（用户 2026-10-22 决定）。

## 风险

- 唤醒任务与用户队列、暂停、drain 交织出错 → 只在 `SessionRunManager` 内判断，复用 `kick()` 的全部前置条件；单测覆盖暂停、drain、已有唤醒任务、运行中四种情况。
- 后台子智能体脱离父回合后父 scope 被释放 → `launch()` 在返回前完成 `acquireForScope` 与子 Ledger 登记；单测覆盖「父回合结束后子智能体继续完成并通知」。
- 回合内通知导致无限续跑 → 续跑受 `maxSteps`；`output_match` 已有 5 秒去抖。
- 删除 `bash_output` / `bash_kill` 影响历史会话显示 → `tool-card` 继续识别旧工具名以渲染历史卡片。
- Journal 新事件被旧 projection 忽略 → 前端缺 settle 时按运行中处理，只影响旧版本显示。

## 任务

顺序依赖：T1 → T2 → (T3, T4, T5 可并行) → T6 → T7 → T8 → T9 → T10。

### T1 契约与事件

- `packages/session/journal/src/core-codecs.ts`：`PERSISTED_EXTENSION_EVENT_TYPES` 加 `background/task`，校验 `op ∈ {start, settle}`、`taskId` 字符串、`kind ∈ {bash, agent}`、settle 的 `status ∈ {completed, failed, stopped, lost}`、`delivery ∈ {notified, wait, stopped, lost}`。
- `packages/shared/src/runtime-v2/tasks.ts`：新增 `BACKGROUND_WAKE_KIND = "background-wake"` 与 `isBackgroundWake(content)`；`taskOperation` 对唤醒任务返回 undefined。
- 验证：`pnpm --filter @actspace/session-journal test`、`pnpm --filter @actspace/shared test`，新增 codec 正反用例各一。

### T2 登记表包 `packages/background-tasks`

- 新建 `@actspace/background-tasks`（package.json 照 `packages/context/runtime` 的形状，依赖 `@actspace/shared`、`@actspace/session-persistence`、`@actspace/core-agent`）。
- `src/registry.ts`：`BackgroundTaskRegistry`，构造参数 `{ openSession(sessionId): SessionHandle | undefined; wake(sessionId): void; now?(): number }`。方法：`register(source)`、`list(sessionId, { activeOnly, limit })`、`get(sessionId, taskId)`、`output(sessionId, taskId)`、`stop(sessionId, taskId, reason)`、`wait(sessionId, { taskId?, timeoutMs, signal })`、`notifyOutputMatch(taskId, text)`、`hasRunning(sessionId, kind?)`、`runningCount(sessionId, kind)`、`reconcile(session)`、`dispose()`。
- `src/notification.ts`：渲染 `<task_notification>`（含 `kind`、Bash `<output_tail>` 2000 字符、子智能体 `<result>` 8KB UTF-8 截断）、`lost` 文本。
- 去重：任务通知状态机 `pending → enqueued(messageId) | suppressed`；`wait` 报告终态时 `suppressed` 并 `inbox.discard(messageId, "delivered-via-wait")`；`stop` 先 `suppressed`。
- `register` 写 `background/task start`；`done` 结算后写 `settle`（`delivery` 按实际），未 suppressed 时 `MainAgentInbox.enqueue(text, notice)` 后调用 `wake`。
- `reconcile(session)`：扫描 `background/task`，有 start 无 settle 的补 `settle lost` 并入一条 lost 通知（不唤醒）。
- 测试 `src/test/registry.test.ts`：注册→完成→通知一次；wait 抢先报告后不再通知且 discard 已入队通知；stop 不通知；跨会话 `TASK_NOT_FOUND`；`wait` 超时返回 `timed_out` 与 still_running；`wait` 无 taskId 只等调用时已运行的任务；reconcile 产生 lost；`dispose` 停止全部。
- 验证：`pnpm --filter @actspace/background-tasks test`、`pnpm test:package-boundaries`。

### T3 收件箱与 Loop

- `packages/core/agent/src/inbox.ts`：`enqueue(content, notice?)` 把 `notice` 写入事件 data；`claim({ opensTurn? })` 把 `opensTurn` 写入 claim 事件；新增 `hasPendingNotifications()`。
- `packages/core/agent-loop/src/loop.ts`：
  - 回合结束判断加入 `this.options.inbox.hasPendingNotifications()`。
  - 异常路径 `discardAll` 改为只丢 `source === "steer"` 或 `target === "next-turn"` 的项。
  - `RunTurnInput.wake?: true`：跳过 `user/message`；第一步 `claim({ opensTurn: true })`；第一步无领取时写 `turn/end completed` 并返回 `steps: 0`。
- `packages/session/projection/src/facts.ts`：`pendingInbox` 项带 `source`；`packages/agent-service/src/application.ts` 的 `isIdleForReconfigure` 忽略 `source === "task_notification"`。
- 测试：`packages/core/agent-loop/src/test/` 新增「最终回复时有通知则续一步」「中断后通知保留」「wake 回合无通知不调模型」「wake 回合领取并带 opensTurn」。
- 验证：`pnpm --filter @actspace/core-agent test`、`pnpm --filter @actspace/core-agent-loop test`、`pnpm --filter @actspace/session-projection test`。

### T4 唤醒调度

- `packages/agent-service/src/task-ledger.ts`：`#claimEvents` 对 `isBackgroundWake` 不追加 `user/message`。
- `packages/agent-service/src/run-manager.ts`：`RunManagerOptions.hasPendingNotifications?: () => boolean`；新增 `wake()`（条件见设计文档「唤醒」第 3 条，提交 `submissionId = background-wake:<uuid>`）；Run 与维护操作结算的 `finally` 中在 `kick()` 前调用 `wake()`。
- `packages/agent-service/src/service.ts`：`AgentServicePorts.hasPendingNotifications?(session)`；`wake(sessionId)` 只作用于已打开的调度器。
- `packages/runtime/src/harness/managed-runs.ts`：端口用 `new MainAgentInbox(session).hasPendingNotifications()`；`openSession` 后调用 `registry.reconcile(session)`。
- `packages/runtime/src/harness/agent-factory-plugin.ts`：RunFactory 对唤醒任务调用 `runTurn({ ...configuration, wake: true, agentRunId })`。
- 测试 `packages/agent-service/src/test/`：空闲 + 有通知 → 唤醒一次；暂停不唤醒；drain 不唤醒；队列非空不唤醒；已有待执行唤醒任务不重复；Run 结算后补唤醒；唤醒任务领取不产生 `user/message`。
- 验证：`pnpm --filter @actspace/agent-service test`、`pnpm --filter @actspace/runtime test`。

### T5 任务工具插件 `packages/tools/background-tasks`

- 新建 `@actspace/tools-background-tasks`：`manifest.ts`（pluginId `actspace.background-tasks`，tools 四个，injects `tools.runtime` 与 `actspace.host.background-tasks`）、`plugin.ts`（定义、描述、schema、执行器调用登记表；权限 allow）。
- 描述文本按设计文档「四个工具」；`task_wait` 用 `context.signal` 支持中断。
- 接入：`packages/runtime/src/harness/default-harness-definition.ts` 新行 `["background-tasks", ["tools.background-tasks"], ["tools.runtime", "actspace.host.background-tasks"]]`；`default-harness.ts` 的 `DEFAULT_HARNESS_SHARED_SERVICES` 加 `actspace.host.background-tasks`；`packages/runtime/scripts/build-default-harness.mjs` 若需列包则加入；`packages/core/agent/src/agent-form.ts` 新成员 `actspace.background-tasks`；`agent-mode-policy.ts` plan 与 agent 加四个工具。
- `agent-runtime-plugin.ts`：`AgentRuntimeService` 创建登记表并 `ctx.provide("actspace.host.background-tasks", registry)`；`dispose` 先停后台任务。
- 测试：插件单测（各工具输出格式、未知 id、跨会话）；`packages/runtime/src/test/tool-contracts.test.ts` 更新工具集合。
- 验证：`pnpm --filter @actspace/tools-background-tasks test`、`pnpm --filter @actspace/runtime test`、`pnpm test:harness-events`。

### T6 Bash 接入登记表

- `packages/tools/shell-tools`：删除 `bash_output` / `bash_kill` 定义与端口；`plugin.ts` 注入 `actspace.host.background-tasks` 并传给端口；`BashTaskRegistry.register` 改为同时向 Host 登记 source（`description = intent ?? command`，`output()` 读文件尾 32KB + 路径，`stop()` 复用 kill，`done` 映射 `killed → stopped`、`MAX_RUNTIME_MS` 超时 → `failed`）；`#notify` 删除，`output_match` 走 `registry.notifyOutputMatch`。
- `backgrounded()` 文案改为指向 `task_output` / `task_stop` 并说明会自动通知。
- `hasRunningBackgroundTask` 的调用方（`application.ts`、`agent-host/src/lifecycle.ts`）改用登记表 `hasRunning(sessionId)`，覆盖子智能体。
- 更新 `packages/tools/shell-tools/README.md`、`packages/tools/README.md`。
- 测试：`node-ports.test.ts` 改为断言登记表收到 source、无 `notifyAgent` 直发；删除 bash_output/bash_kill 用例并迁到 T5。
- 验证：`pnpm --filter @actspace/tools-shell-tools test`、`pnpm test:agent-host:process`。

### T7 后台子智能体

- `packages/subagent/src/provider.ts`：拆出 `launch()`；`invoke()` = `launch()` + `await result`；`SubagentInvocation.background?: true` 时不连接 `signal`。
- `packages/subagent/src/tool-plugin.ts`：schema 加 `background`；描述补充后台说明；后台分支检查 `runningCount(sessionId, "agent") < 4`，`launch()` 后登记 source（`output()` 读子会话 Journal 生成进度摘要或最终文本，`stop()` 中止该 invocation，`done` 映射 `aborted → stopped`、其余失败 → `failed`）并立即返回；`registerSubagentTools` 增加登记表参数，`harness-subagent-tools.ts` 注入 `actspace.host.background-tasks`。
- 文档：`docs/design-docs/collaboration/agent-subagent-runtime.md` 删除「当前不提供：后台 Subagent 和异步完成通知」，补后台模式小节。
- 测试：`packages/subagent/src/test/` 新增「后台调用立即返回且父回合中断不影响子智能体」「第 5 个后台调用被拒」「task_stop → stopped 且无通知」「完成通知内联文本并截断」。
- 验证：`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/runtime test`。

### T8 上下文插件 `packages/context/background-tasks`

- 新建 `@actspace/context-background-tasks`：`manifest.ts`（服务 `context.source.background-tasks`，injects `actspace.host.background-tasks`）、`source.ts`（按设计文档生成文本，turnId 缓存，从未有过任务不写）。
- 接入：`CONTEXT_PLUGIN_PACKAGES` 加一行；`DEFAULT_HARNESS_ENTRIES` 的 context kinds 加 `background-tasks` 并带 injects；`agent-factory-plugin.ts` 的 `createSources` 仅主 Agent 注册该来源。
- 测试：同一 turn 内任务变化文本不变；新 turn 更新；全部结束写收尾文本；无任务史不写；子智能体不注册。
- 验证：`pnpm --filter @actspace/context-background-tasks test`、`pnpm --filter @actspace/context-engine test`。

### T9 前端

- `packages/client/src/sessions/chat.ts` 与投影：收集 `background/task` 为 `taskId → { status, callId }`；`tool-card.ts`：Bash 后台卡片状态取 settle，`backgroundStatus` 改为布尔 `background`；子智能体读 `detail.delegation.background`，状态取 `delegation/completed`；保留旧工具名识别。
- `apps/desktop/src/renderer/components/messages/BashRunBlock.tsx`：三态徽标改为单个「后台」标签；`AgentRunBlock.tsx` / `AgentIdentity.tsx`：后台时在状态旁加同款「后台」标签（复用 BashRunBlock 的标签 class，不新增颜色）。
- `packages/shared/src/session-selectors.ts`：`opensTurn` 的任务通知产出 `background_notice` 块（`title`、`status`、`content`）；`packages/shared/src/session.ts` 加块类型并删除 `bash_task_update`。
- `apps/desktop/src/renderer/components/conversation/turns.ts`：`background_notice` 开启 `user: null` 轮次并保持 currentTurn；新组件 `BackgroundNoticeRow.tsx`（细分隔行，可展开原文，主题 token 着色）。
- `apps/desktop/src/renderer/session/{task-queue,message-queue}.ts`、`packages/desktop-app/src/session-title.ts`、`packages/agent-host/src/rpc.ts`、`apps/web` 同类路径：跳过唤醒任务。
- `apps/desktop/src/renderer/trajectory/context-sections.ts`：`contextCategory` 加「后台任务」。
- 删除 `App.tsx`、`apps/web/src/sessions/session-observer.ts`、`packages/client/src/live/live-run.ts` 的 `bash_task_update` 处理与对应测试。
- 浏览器 mock：`apps/desktop/src/renderer/mock/` 加一组后台 Bash、后台子智能体、唤醒分隔行数据。
- 验证：`pnpm --filter @actspace/client test`、`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/desktop test`、`pnpm test:frontend-tokens`、浏览器 mock 浅/深主题截图（按 `docs/FRONTEND_VERIFICATION.md`）。

### T10 收尾

- 更新文档：`agent-task-run-lifecycle.md`（唤醒任务）、`agent-subprocess-runner-guidelines.md`（工具改名）、`agent-forms-and-modes.md`、`agent-spec-tool-name-contract.md`、`front-DSH轨迹能力迁移规范.md`（后台任务分类与分隔行）、`docs/releases/feature-release-notes.md`、设计文档状态改为当前事实。
- `docs/histories/2026-10/` 记录；评估学习文档（唤醒任务模式、通知去重）。
- 全量：`pnpm typecheck`、`pnpm test`。
- 计划移到 `completed/`，`docs/exec-plans/README.md` 同步；执行摘要写 Electron 人工验证指引。

## 验证方式

- 命令：各任务列出的定向测试；最终 `pnpm typecheck` 与 `pnpm test`。
- 手工检查（Electron，写入执行摘要供用户验收）：
  1. 让 Agent 后台跑 `sleep 20 && echo done`，回合结束后约 20 秒会话自动开一轮，以分隔行开头，Bash 卡片「后台」标签、状态变成功。
  2. `agent` 设 `background: true` 调研一个问题，主回合立即结束；子 Agent 面板可见运行；完成后自动一轮，回复引用结论。
  3. 后台任务运行中点停止主会话：任务继续；完成后不自动唤醒；再发一条消息时 Agent 看到通知。
  4. 让 Agent 调 `task_list`、`task_output`、`task_wait`、`task_stop`，核对输出与「停止后无通知」。
  5. 轨迹面板出现「上下文 · 后台任务」行；任务全结束后下一轮出现收尾文本。
- 观测：`logs/latest-dev.log` 无 `background/task` codec 报错。

## 进度记录

- [x] 2026-10-22 调研 Kimi / OpenCode / 现有代码，D1–D10 与用户确认，写设计文档与本计划。
- [x] T1 契约与事件
- [x] T2 登记表包
- [x] T3 收件箱与 Loop
- [x] T4 唤醒调度
- [x] T5 任务工具插件
- [x] T6 Bash 接入
- [x] T7 后台子智能体
- [x] T8 上下文插件
- [x] T9 前端（另加：Loop 唤醒回合的 `inbox-claimed` 带 notice 与正文 → live `background_notice_claimed`，回合进行中即显示分隔行）
- [x] T10 收尾

## 决策记录

- 2026-10-22：采用 Kimi 式统一登记表 + 四个工具，保留 OpenCode 式「完成自动通知 + 反轮询」描述；子智能体工具不变；空闲唤醒用不写 `user/message` 的唤醒任务，而非 synthetic 用户消息；停止后不唤醒；清单每轮开始更新一次；卡片只多「后台」标签。

## 执行模式

- **交互模式**：涉及调度与 Journal 契约，用户在线。

## 执行文档

执行开始时创建 `docs/exec-runs/20261022-background-tasks/execution-process.md` 与 `execution-summary.md`（模板见 `docs/exec-runs/templates/`）。
