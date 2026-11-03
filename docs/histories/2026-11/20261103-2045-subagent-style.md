## [2026-11-03 20:45] | Task: 子 Agent 列表与详情顶部栏样式调整

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 右侧子 Agent 列表和打开后的执行过程样式不好看，先做 HTML demo 让我选。选定分组卡列表（去掉「后台 / Explore」，右上 token、右下耗时）和精简面包屑顶部栏（去掉「子 Agent /」，右侧模型名、耗时、轨迹图标）；按这么改，改完提 PR。

### 🛠 Changes Overview

**Scope:** `packages/client/client/src/sessions`、`apps/desktop/src/main/runtime-v2`、`apps/desktop/src/renderer/components/{right-panel,messages}`、`apps/desktop/src/renderer/mock`、`docs/`

**Key Actions:**

- **demo**：`subagent-style-demo.html` 三轮，用户选定「列表 B 调整版 + 顶部栏 A 精简 · 带模型」。
- **token 数据**：`AgentToolStats.totalTokens` 以前只有类型没人填。`projectSubagentList` 新增 `childTokens` 入参，`getSubagents` 逐个读子会话快照的 `usage.totalTokens`；已结束的子会话缓存，不再每秒重读。
- **列表**：设置页分组卡；每行头像、标题、一句最近动作 / 结果，右上 token、右下耗时（运行中绿色转圈）。
- **顶部栏**：一行，返回箭头 · 18px 头像 + 标题 · 模型 · 状态图标 + 耗时 · 对话 / 轨迹切换（挪到最右）。
- **公用**：`AgentIdentity` 新增 `AgentStatusIcon`、`agentLatestActivity`（对话卡片和列表共用）、`formatAgentDuration`，头像支持 18px。
- **mock**：`subagent-trajectory` 补运行中、后台运行中、失败、已停止四个子 Agent。

### 🧠 Design Intent (Why)

列表原来一行塞了状态、类型、模型、秒数，68px 定宽状态还留出空洞；顶部栏把返回、切换、头像、标题、元信息挤在一起，模型名被截断。现在列表只留「在做什么、花了多少」，类型和模型放到打开后的顶部栏和悬停提示里。token 由 main 读子会话快照，不让 renderer 每个子 Agent 再发请求。

### 📁 Files Modified

- `packages/client/client/src/sessions/chat.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`
- `apps/desktop/src/renderer/components/messages/AgentIdentity.tsx`
- `apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`
- `apps/desktop/src/renderer/mock/scenarios/subagent-trajectory.ts`
- `apps/desktop/src/renderer/test/subagents-panel.test.tsx`
- `apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`
- `docs/design-docs/frontend/front-子Agent列表与详情顶部栏.md`（新）
- `docs/design-docs/frontend/subagent-style-demo.html`（新）
- `docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/exec-plans/completed/20261103-subagent-style.md`（新）

### ✅ Verification

- desktop `typecheck`、相关 vitest、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过。
- 浏览器 mock `?mock=subagent-trajectory` 浅色 / 深色截图：列表、已完成详情、失败详情。
- 未做：Electron 真实运行（真实子会话的 token 累计、运行中耗时跳动）。
