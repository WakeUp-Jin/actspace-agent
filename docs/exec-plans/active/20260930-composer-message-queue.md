# Composer 消息队列与运行中插入（Steer）

## 目标

Agent 运行中（包括上下文压缩中）用户可以继续输入并发送：消息进入 Composer 上方的队列托盘，当前运行结束后按顺序自动发出，每条是一个新回合。每行队列可以「↳ 插入」，把这条消息立即送进正在运行的回合，模型在下一步就能看到；也可以删除或拿回输入框编辑。形态参考用户 2026-09-29 提供的 Codex 截图：输入框上方的托盘，每行是消息文本，右侧有 `↳ Steer`、删除、`···`。

## 范围

- 包含：
  - Composer 运行中可发送：输入框有内容时按钮是 ↑ 发送，Enter / 点击把消息加入队列；输入框为空时按钮是停止。
  - 队列托盘（Composer 上方，和回复批注托盘同一位置体系）：行内显示文本摘要和附件 / 引用数量；操作有 `↳ 插入`、删除、`···`（编辑、上移）。
  - 自动发出：运行正常结束（含自动压缩、手动 `/compact` 结束）后发出队首一条，依次清空。
  - 运行被停止或失败后队列暂停，不自动发出；托盘顶部显示「已暂停」，用户点「继续发送」或手动发送后恢复。
  - 插入：把队列项作为 durable inbox `next-step` 消息写入正在运行的回合；loop 在下一步开始前读到它。如果模型当时正在写最后的回复，回合不结束，而是多跑一步处理这条插入。
  - 插入的消息在对话流中作为用户消息，实时出现在当前回合里插入的位置。
  - 插入后回合被停止、消息还没被读到：消息回到队列顶部，不丢。
  - `/compact` 可以排队（作为命令项），不能插入。
  - 每个会话有自己的队列；切到别的会话后，后台会话的队列照常在它的运行结束后自动发出。
- 不包含：
  - 队列跨应用重启保存（队列只在渲染进程内存中，与草稿一致）。
  - 拖拽排序（只提供「上移」）。
  - 多条排队消息合并成一个回合。
  - 子会话 / Subagent 的插入。

## 背景

- 相关文档：`docs/design-docs/frontend/front-中间消息区规范.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`；上一计划 `docs/exec-plans/completed/20260929-context-compaction-timeline.md`（压缩中停止按钮置灰，排队留给本计划）。
- 相关代码路径：
  - `packages/core/agent/src/inbox.ts`（`MainAgentInbox`：enqueue / claim / discard，durable `agent/inbox/spliced` 事件）
  - `packages/core/agent-loop/src/loop.ts`（每步开始 `inbox.claim("next-step")`；无工具调用即结束回合；abort / 失败时 `discardAll`）
  - `packages/desktop-app/src/service.ts`（`enqueueMainMessage`、`cancelPendingMessage`、`runTurn` 的 `SESSION_BUSY`）
  - `apps/desktop/src/main/runtime-v2/runtime-registry.ts`（`enqueueMessage`、`cancelMessage`）
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（`runAgent`：引用校验 + `toRunContent` 附件准备）
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`
  - `apps/desktop/src/preload/index.ts`（renderer bridge）
  - `packages/client/src/sessions/chat.ts`（inbox claim 已投影为 `user_message`）
  - `apps/desktop/src/renderer/App.tsx`（`handleSend`、`SessionRunState`、`finishRun`）、`components/Composer.tsx`、`components/composer/ResponseAnnotationTray.tsx`
- 已知约束（2026-09-30 调研）：
  - inbox 的 enqueue / discard 在 main 里已有 IPC（`RUNTIME_V2_DESKTOP_CHANNELS.enqueueMessage / cancelMessage`），但 preload 没有暴露给 renderer，renderer 从未使用。
  - `next-step` 只在每步开始时被读到。模型最后一步没有工具调用时回合直接结束，这时插入的消息会一直 pending，直到下一回合第一步才被读到，而且会排在新用户消息之后。本计划需要改 loop 修正这一点。
  - `next-turn` 目标没有任何代码自动读取；本计划的普通排队不使用它（见决策记录）。
  - abort / 失败时 loop 会 `discardAll`，未被读到的插入会被丢弃。
  - 运行中 renderer 会过滤掉当前 run 的 durable 事件，只显示 streaming 块；被读到的插入消息必须通过 live 事件进入 streaming 块，否则要等回合结束才出现。
  - `handleSend` 只针对当前可见会话；后台会话自动发出需要把「为某个会话开始一次运行」从 `handleSend` 中拆出来。
  - `runTurn` 在同一会话已有运行时抛 `SESSION_BUSY`，自动发出必须在上一个运行完全结束后进行。

## 风险

- 风险：把 `handleSend` 拆成按会话启动的运行函数，可能影响已有的流式、草稿恢复、失败处理。
  - 缓解：只做提取，不改分支逻辑；`app-streaming-user-message.test.tsx` 全量回归，另补后台会话自动发出的用例。
- 风险：loop 在「有 pending 插入」时多跑一步，改变回合结束条件。
  - 缓解：只对用户插入（inbox `source: "steer"`）生效，`task_notification` 行为不变；多跑的一步仍受 `maxSteps` 约束；agent-loop 补单测。
- 风险：插入与停止竞争（插入写入后、被读到前用户点停止）。
  - 缓解：停止后 renderer 以 durable 投影为准核对 messageId 是否已被读到；没有被读到的放回队列顶部。
- 风险：附件在排队期间被移动或删除。
  - 缓解：发出时仍走 `runAgent` 的原有校验；被拒时沿用现有草稿恢复逻辑，把这条放回输入框并显示原因，队列暂停。
- 回退：renderer 队列、插入 IPC、loop 改动三块边界清楚；journal 格式只新增 inbox `source` 取值，旧会话无需迁移。

## 任务

- [x] T1 设计 demo（2026-09-30 用户确认，发送按钮收敛为两种样子）：`docs/design-docs/frontend/message-queue-demo.html`，包含托盘的空 / 1 条 / 多条 / 已暂停状态、行内操作、插入后用户消息出现在回合中的样子、运行中发送按钮的两种形态；与用户确认后再动代码。
- [x] T2 Core：`InboxSource` 增加 `"steer"`；loop 在无工具调用、准备结束回合前检查是否有 pending 的 `steer` 项，有就继续下一步（受 `maxSteps` 约束）；`claim` 后发出 live 事件 `inbox-claimed { messageId, target }`。测试：插入在中间步骤被读到；插入在最后一步到达时回合多跑一步；abort 时未读插入被丢弃。
- [x] T3 Main：新增 fixed-renderer 通道 `agent:steer`，复用 `runAgent` 的引用校验和 `toRunContent`，写入 `next-step` + `source: "steer"`，messageId 由 renderer 生成；会话没有运行中的回合或正在压缩时返回 `rejected`（`STEER_UNAVAILABLE`）。新增 `agent:cancel-steer`（包装 `cancelMessage`）。Stream adapter 把 `inbox-claimed` 映射为 `user_message_steered { sessionId, agentRunId, messageId }`。preload 暴露 `steerAgentRun`、`cancelSteer`。补 main 单测。
- [x] T4 契约：`RuntimeStreamEvent` 增加 `user_message_steered`；`packages/shared` 增加 `SteerAgentRunInput` / `SteerAgentRunResult`、`CancelSteerInput` / `CancelSteerResult`。`QueuedComposerMessage`（id、text、发送选项快照、kind: `message | compact`）放在 renderer `apps/desktop/src/renderer/session/message-queue.ts`，因为 `ComposerSendOptions` 只存在于 renderer。
- [x] T5 Renderer 运行启动重构：从 `handleSend` 提取 `startSessionRun(sessionId, text, options)`，`handleSend` 只负责可见会话入口；行为不变，现有测试全绿。
- [x] T6 Renderer 队列状态：`App` 按会话保存队列（`Map<sessionId, QueuedComposerMessage[]>` + 暂停标记）；运行中 `handleSend` 改为入队；`finishRun` 根据结果（completed / aborted / failed / rejected）决定自动发出队首或暂停；插入：调用 `steerAgentRun`，成功后从队列移到当前运行的「待读插入」，收到 `user_message_steered` 时把用户块插入 streaming segments；运行结束时未读的插入放回队首。
- [x] T7 Composer 与托盘：`MessageQueueTray` 组件（托盘位置与样式对齐 `ResponseAnnotationTray`）；Composer 按钮只有 ↑ 发送 / ■ 停止两种样子：输入框有内容时是发送（运行中点击或 Enter 入队，aria-label 与提示为「加入队列」），运行中且输入框为空时是停止；`···` 菜单「编辑」（输入框为空时把该项放回输入框并移出队列）、「上移」；删除直接移除；已暂停时托盘顶部「已暂停 · 继续发送」。插入按钮在正在压缩、等待审批以外的运行中可用；`/compact` 项不显示插入。去掉上一计划的「压缩中停止按钮置灰」以外的发送限制（停止仍置灰）。
- [x] T8 测试：App 层覆盖运行中入队 → 完成后自动发出、停止后暂停、插入成功 / 被拒 / 停止后回队、后台会话自动发出、`/compact` 排队；托盘组件单测；Composer 发送按钮形态单测。
- [x] T9 文档与收尾：`front-中间消息区规范.md` 增加「消息队列」一节（或 Composer 规范对应章节）；demo 定稿；exec-runs 两份文档；history；README 行。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared test`、agent-loop 包 vitest、`pnpm --filter @actspace/client test`
  - Desktop：vitest 定向跑 `app-streaming-user-message`、队列托盘、Composer、stream adapter、fixed-renderer IPC；随后全量
  - 受影响包与 `apps/desktop` 的 typecheck；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`
- 手工检查：
  - 浏览器 fixture（浅色 / 深色）看托盘各状态与 Composer 两种按钮形态。
  - Electron 实机（人工门禁）：长任务中排两条 → 完成后依次发出；工具执行中插入 → 下一步模型回应插入内容；模型写最终回复时插入 → 回合继续一步；插入后立刻停止 → 消息回到队列；压缩中排队 → 压缩完成后发出；切到其他会话等待后台会话自动发出。

## 决策记录

- 2026-09-29：消息队列从上下文压缩计划中拆出，采用 Composer 上方托盘形态（用户确认）。
- 2026-09-30（用户确认）：普通排队放在渲染进程内存，不用 durable `next-turn`。理由：`next-turn` 没有自动读取的驱动，接上需要 main 自己驱动回合，并保存每条消息的模型 / 模式 / 技能选项；排队项还要能编辑、删除，放在 journal 里会留下大量 enqueue / discard 事件。代价是应用重启会丢队列，与草稿一致。
- 2026-09-30（用户确认）：插入走 durable `next-step`。它本来就是回合内注入的通道，claim 时会写进 Surface，模型下一步可见；投影已经把它显示为用户消息。
- 2026-09-30（用户确认）：每条排队消息各自一个回合，不合并。
- 2026-09-30（用户确认）：停止 / 失败后队列暂停，不自动发出，避免用户停止后又被自动发出的消息「再次启动」。
- 2026-09-30（用户确认，看 demo 后修订）：发送按钮只有两种样子：输入框有内容时是 ↑ 发送（运行中点它 / Enter 即加入队列，只有提示文案不同，不变形成「加入队列」文字按钮），运行中且输入框为空时是 ■ 停止（压缩中置灰）。
- 2026-09-30（用户确认）：「↳ Steer」中文为「↳ 插入」，悬停提示「让 Agent 在下一步看到这条消息」。
- 2026-09-30（用户确认）：只有 Enter 入队，不加 ⌘Enter 直接插入。
- 2026-09-30（用户确认）：插入的消息在对话流里和普通用户消息完全一样，不加标记。
- 2026-09-30（demo 细化，用户确认）：插入后、被读到前该行留在托盘顶部，显示「下一步读取」和「撤回」（撤回走 `agent:cancel-steer`）；没有运行中的回合时不显示「插入」，压缩中 / 等待审批时显示但不可用；`/compact` 行标「命令」、没有插入；托盘标题「N 条排队 · N 条已插入」+ 状态提示，暂停时右侧「继续发送」。

## 执行模式

- **交互模式**：涉及 loop 回合结束条件与 renderer 运行启动重构，人在线逐步推进；T1 demo 确认后再进入 T2。

## 执行文档

`docs/exec-runs/20260930-composer-message-queue/`：`execution-process.md`、`execution-summary.md`。
