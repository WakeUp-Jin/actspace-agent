# 子智能体单行卡片、来信卡片与面板实时动态

## 目标

主会话里的子智能体变矮：派发卡片从两行改为一行，实时动态移到右侧「子 Agent」列表的第二行。子智能体发来的消息（`agent_message`）不再是分隔线，改为来信卡片：头部和派发卡片一样，正文直接显示。所有卡片的状态跟着子智能体一起变。右侧列表在刚来信的几秒内显示来信摘要。

规范：`docs/design-docs/frontend/front-子Agent与后台任务规范.md` §2、§2.1、§2.2；demo `docs/design-docs/frontend/subagent-compact-demo.html`（K1 + 面板「实时动态 + 来信」，用户 2026-11-08 选定）。

## 范围

- 包含：
  - 桌面端派发卡片、来信卡片、列表第二行；
  - Web 来信卡片；
  - `SubagentListItem` 增加 `activity`、`lastMessage` 两个字段，以及主进程的实时动态记录；
  - mock、测试、文档。
- 不包含：后台 Bash 通知的样式；Web 端的子 Agent 面板（Web 没有）。

## 背景

- 实时动态现在由 `FixedRendererStreamAdapter` 按父调用记录（`SubagentActivity`），只在派发工具还在运行时更新。后台派发的工具会立刻返回，之后子智能体的事件就找不到父调用了，所以要在主进程按子会话 id 另记一份。
- 来信在父会话日志里，是 `agent/inbox/spliced` 事件（`source: "agent_message"`，带 `senderId`，并有 enqueue / claim 两步）。列表本来就每秒读一次父会话日志（`projectSubagentItems`），顺带扫一遍即可。
- 来信卡片的状态取同一列表里派发卡片的状态（`agent` 块的 `transcriptRef.runId` 等于发送方 id），两者天然一致。派发卡片因为分页不在列表里时，不显示状态。

## 步骤

1. **共享类型与投影**（`packages/util/shared`、`packages/client/client`）
   - `SubagentListItem` 增加 `activity?: string` 和 `lastMessage?: { text: string; at: string }`。
   - 在 shared 里加 `agentMessageBody(content)`，去掉 `<agent_message>` 外壳；`BackgroundNoticeRow` 和 `session-transcript` 的同类正则改为复用它（session-transcript 包不依赖 shared 的话就不动）。
   - `projectSubagentItems` 扫描来信：按 `messageId` 取第一次出现的时间（enqueue，没有 enqueue 时用 claim），每个发送方保留最新一条，正文取第一行。
   - 新增 `subagentStatusByAgent(blocks)`：从 `agent` 块得到「子智能体 id → 卡片状态」，桌面和 Web 共用。
2. **主进程实时动态**（`runtime-registry.ts`、`fixed-renderer-ipc.ts`）
   - `#emitRuntimeLive` 收到带 `parentSessionId` 的事件时，按 `sessionId` 交给各自的 `SubagentActivity` 记下当前文案。
   - run 进入终态时删除这条记录；记录数设上限 200。
   - `registry.subagentActivity(sessionId)` 对外提供读取；`getSubagents` 给运行中的通用 / 探索 / Fork 子智能体填上 `activity`。
3. **桌面派发卡片**（`AgentRunBlock`、`AgentIdentity`）
   - 卡片改为一行 34px：20px 头像、标题、种类、后台、状态；
   - 删掉模型、动态行和 `agentLatestActivity`；
   - 失败时用 `title` 悬停给出错误；
   - `AgentAvatar` 增加 20px 尺寸。
4. **桌面来信卡片**：新建 `SubagentMessageCard`。
   - `render-message` 与 `TurnPrompt` 遇到 `agent_message` 时用它，Bash 仍用 `BackgroundNoticeRow`。
   - 状态从 `SubagentStatusContext` 取：`ConversationView` 用 `subagentStatusByAgent` 算出，内容不变时保持同一个引用。
   - 本轮结束后，`renderTurnBody` 把来信卡片从过程组里拿出来，放在 Worked 之后、最终回复之前；运行中保持原位。
5. **桌面右侧列表第二行**（`SubagentsPanel`）
   - 运行中显示 `activity`（没有时显示「正在思考」，外部子智能体不写）；
   - 6 秒内有来信时显示「来信：」加正文第一行，最右的转圈换成蓝点；
   - 换行时用滑动动画（把 `ActivityLine` 挪进 `AgentIdentity` 共用，`agent-activity.css` 跟着挪）。
6. **Web**
   - `EventRow` 遇到 `agent_message` 时改成来信卡片：名字、「来信」、状态文字、正文；
   - `TurnView` 折叠后，把来信卡片放在 Worked 之外；
   - 状态用 `subagentStatusByAgent`。
7. **mock**：`subagent-trajectory` 的列表给运行中的子智能体补上 `activity`；来信场景能看到来信卡片。
8. **测试**
   - 更新 `agent-run-block`、`subagents-panel`、`conversation-turns`（结束后来信卡片的位置）、Web `turn-model` / `TurnView`、client `subagent-list`；
   - 新增 `SubagentMessageCard` 测试和主进程动态记录测试。
9. **文档**
   - 更新 `05-界面与设置设计规范.md`、`front-中间消息区规范.md`、`FRONTEND_VERIFICATION.md`；
   - 写历史记录，更新记忆。

## 验证方式

- 命令：
  - desktop renderer + main 相关测试，`apps/web` 测试，client 测试；
  - `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:hot-path-reads`、`check:docs`、`test:current-docs`；
  - 三个包各自跑 typecheck。
- 手工检查：浏览器 mock `?mock=subagent-trajectory`、`?mock=background-tasks`，截图看浅色、深色和窄面板。
- Electron 实机（之后）：后台派两个子智能体，让一个 `send_message` 给父会话，看列表第二行的动态和来信、来信卡片的状态跟着完成而变。

## 风险

- 来信卡片的状态依赖派发卡片还在消息列表里。长会话分页后可能查不到，这时不显示状态，符合规范的说法。
- 主进程的动态记录只在内存里。应用重启后要等到下一个事件才有，期间显示「正在思考」。

## 进度记录

- [x] 1 共享类型与投影
- [x] 2 主进程实时动态
- [x] 3 派发卡片
- [x] 4 来信卡片
- [x] 5 列表第二行
- [x] 6 Web
- [x] 7 mock
- [x] 8 测试
- [x] 9 文档

## 决策记录

- 2026-11-08：用户选定 K1 单行卡片，面板第二行显示「实时动态 + 来信」。状态只有运行中和已完成两种主态，不加「完成中」。
- 2026-11-08：规范里写的 `border-line-soft` 没有这个 token，正文分隔线改用 `border-line`，来信卡片头部悬停用 `bg-surface`。
- 2026-11-08：来信卡片整条头部是卡片式原生按钮（同 `AgentRunBlock`），原生按钮基线加 1；「展开」用 `Button` ghost xs。
- 2026-11-08：已完成并验证（typecheck、desktop / web / client 全量测试、token / theme / hot-path 检查、浏览器 mock 浅色深色截图）。剩 Electron 实机检查。

## 执行模式

交互模式（主智能体顺序实现）。
