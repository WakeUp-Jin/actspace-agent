# Composer 消息队列与运行中插入 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260930-composer-message-queue.md`
- **执行模式**：交互
- **开始时间**：2026-09-30 00:10
- **结束时间**：2026-09-30 14:00（Electron 实机验收待人工）

## 执行时间线

### 步骤 1：T1 设计 demo

- **操作**：产出 `docs/design-docs/frontend/message-queue-demo.html`（托盘空 / 1 条 / 多条 / 已暂停、行内插入 / 删除 / ···、插入后用户消息出现在回合中、运行中发送按钮），与用户逐项确认。
- **决定**：用户认为发送按钮四种状态太复杂，收敛为两种样子：输入框有内容是 ↑ 发送（运行中即入队，只换提示文案），运行中且输入框为空是 ■ 停止（压缩中置灰）。

### 步骤 2：T2 Core

- **操作**：`InboxSource` 增加 `"steer"`，`MainAgentInbox` 新增 `status(messageId)`；loop 每步 claim 后发出 live 事件 `inbox-claimed`；无工具调用时如果还有 pending 的 steer 项，回合不结束，多跑一步（仍受 `maxSteps` 约束）；回合开始时把上一回合遗留的 steer 以 `stale-steer` 丢弃，避免它排到本回合用户消息之后。`testing.ts` 增加 `onLoop` 钩子。
- **影响文件**：`packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts`、`testing.ts`、新增 `test/steer.test.ts`。
- **验证**：agent-loop 32 项、core-agent 18 项通过。

### 步骤 3：T3 Main + T4 契约

- **操作**：`packages/shared` 增加 `SteerAgentRunInput / Result`、`CancelSteerInput / Result`、`RuntimeStreamEvent.user_message_steered`、fixed-renderer 通道 `steerAgentRun / cancelSteer`。`desktop-app` service 增加 `steerRun`、`cancelSteer`、`isRunActive`；registry 包装并发出 durable-changed；IPC `steerAgentRun` 复用引用校验和 `toRunContent`，失败回滚已导入附件，没有运行中回合返回 `unavailable`；`cancelSteer` 返回 `cancelled | claimed | discarded | missing`。Stream adapter 只把 `source: "steer"` 的 claim 映射为 `user_message_steered`。preload / global.d.ts 暴露 `steerAgentRun`、`cancelSteer`。
- **影响文件**：`packages/shared/src/ipc.ts`、`session.ts`、`runtime-v2/fixed-renderer.ts`；`packages/desktop-app/src/service.ts`；`apps/desktop/src/main/runtime-v2/runtime-registry.ts`、`fixed-renderer-ipc.ts`、`fixed-renderer-stream-adapter.ts`；`apps/desktop/src/preload/index.ts`、`src/global.d.ts`；新增 `src/main/test/runtime-v2-steer-ipc.test.ts`，`runtime-v2-tool-stream.test.ts` 补用例。
- **决定**：`QueuedComposerMessage` 放在 renderer（`ComposerSendOptions` 只在 renderer 定义），不进 shared。插入竞争以 cancel 结果为准：除 `claimed` 外都回到队首。
- **验证**：desktop-app 11 项；main steer / stream / run-references / browser-reconfigure 共 29 项通过；`tsc -p tsconfig.electron.json` 无错误。

### 步骤 4：T5 运行启动重构

- **操作**：从 `handleSend` 提取 `startSessionRun(sessionId, text, options, env)`，返回 `completed | aborted | failed | rejected | not_started`；`handleSend` 只保留可见会话入口（新建会话、切换工作区、首轮 `executionContext`）。
- **影响文件**：`apps/desktop/src/renderer/App.tsx`。
- **验证**：`app-streaming-user-message` 42 项通过，行为不变。

### 步骤 5：T6 队列状态 + T7 托盘与 Composer

- **操作**：新增 `session/message-queue.ts`（纯函数：入队、删除、上移、标记插入、回到队首）；App 按会话保存队列（ref + 当前会话 state），`continueQueue` 在每次运行后先核对插入、再按结果发出队首或暂停；`handleSend` 在会话运行中 / 排空间隙入队；插入、撤回、编辑、继续发送；`user_message_steered` 作为新的 `user_message` streaming 段显示。新增 `MessageQueueTray`（托盘 + `···` 菜单，portal 定位）；Composer 传入队列时运行中可输入，发送按钮两种样子，运行中斜杠菜单隐藏模式切换、`/compact` 入队。
- **影响文件**：`App.tsx`、`session/{message-queue,session-run-state}.ts`、`components/{Composer,ConversationView,WorkbenchLayout}.tsx`、`components/composer/MessageQueueTray.tsx`。
- **决定**：托盘控制打包为一个 `MessageQueueControls` 对象穿过三层组件，避免 8 个 prop；只接到后续对话的 Composer（初始 Composer 不会处于运行中）。插入的正文另存 `steerContentRef`，直到渲染或确认回队才删，避免撤回与读取赛跑时丢内容；核对 / 撤回前先等在途插入请求落定。

### 步骤 6：T8 测试

- **操作**：新增 `app-message-queue.test.tsx`（10 项：入队 → 依次自动发出、停止暂停与继续、插入读到后出现在对话、停止后未读插入回队首、unavailable 回队、撤回、审批中不可插入、后台会话自动发出、`/compact` 排队、编辑回输入框）和 `message-queue-tray.test.tsx`（8 项：队列模型与托盘状态）。
- **验证**：18 项全部通过；desktop 全量 964/965 通过（失败 1 项见下）。

### 步骤 7：T9 文档与视觉验证

- **操作**：`front-中间消息区规范.md` 新增「消息队列与运行中插入」一节并修正压缩一节的发送描述；临时 fixture 页（截图后已删除）在浅色 / 深色下查看运行中排队、已插入 + 命令、压缩中插入不可用、已暂停四种状态：`queue-light.png`、`queue-dark.png`（本目录）。
- **验证**：`tsc -p tsconfig.json`（仅既有 editor-poc prosemirror 缺失错误）、`tsc -p tsconfig.electron.json` 通过；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。

## 遇到的问题

- **问题**：agent-loop steer 测试报 `inbox.status is not a function`。
  - **原因**：workspace 包从 `dist` 消费，core-agent 改完没重新构建。
  - **应对**：在 `packages/core/agent` 执行 `pnpm build`。
- **问题**：会话在 T5 开始前因 API 400 中断，上下文丢失。
  - **应对**：2026-09-30 13:30 从 transcript 恢复进度，重跑 T2–T4 测试确认仍通过后继续。
- **问题**：desktop 全量中 `workspace-git-context-service.test.ts`「hides Git controls for a non-repository workspace」失败（期望 `not_repository`，实际 `failed`）。
  - **原因**：与本计划无关，该测试和服务文件本次未改动（最近一次提交 `5bd08b3`），疑似本机 git 环境差异。
  - **应对**：记录，不在本计划内处理。

## 跳过或推迟的事项

- Electron 实机验收：需要人工在真实窗口里跑长任务（见执行摘要的必须验证）。
