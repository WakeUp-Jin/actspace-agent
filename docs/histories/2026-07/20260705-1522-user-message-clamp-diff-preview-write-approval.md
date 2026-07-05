## [2026-07-05 15:22] | Task: 修复用户消息遮挡、edit diff 展示丢失、越界写入硬拒绝三个 bug

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE

### 📥 User Query

> 1. 用户输入内容太长时卡片过大，且 sticky 定位导致模型回复被遮挡，应像 Cursor 一样限制最大高度 + 内部滚动。
> 2. 编辑工具完成后不显示编辑行数和 diff。
> 3. edit/write 工具向工作区外写入时被直接拒绝，应该像 Cursor 一样弹审批窗口，用户同意后仍可写入。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs`

**Key Actions:**

- **[用户消息限高]**: `UserMessage.tsx` 正文加 `max-h-[min(240px,32vh)] overflow-y-auto`，超长输入在卡片内滚动，不再盖住 sticky prompt 下方的模型回复。
- **[diff 展示修复]**: 根因是大 diff 的 `modelOutput` 被上下文压缩改写，前端反解析压缩文本导致统计归零、展开内容变摘要。修复：scheduler `postProcess` 在所有返回路径保留 `ToolResult.structured`（原始结构化结果），bridge 的 `createToolUiPreview` 对 `edit_diff` / `write` 优先从 structured 取 diff/additions/deletions，压缩只影响回填给模型的文本。
- **[失败态建模]**: `ToolUiPreview` 与 `MessageBlock` 的 edit/write 分支新增 `status`（pending/running/completed/failed/denied）、`approvalRequestId`、`errorMessage` 字段；失败不再把错误文本塞进 diff 字段，`FileDiffBlock` 按状态分别渲染错误说明 / Denied 日志行；`session-selectors` 的 diff 汇总只统计 completed 的变更。
- **[越界写入审批]**: 新增 `createWriteBoundaryChecker`（edit/write 共用权限检查器）——目标越界时返回 `ask`（medium 风险、仅一次性批准），`sanitizedArgs` 带 `APPROVED_OUTSIDE_BOUNDARY_ARG` 内部标记；用户批准后 executor 依据标记放行该次路径。防绕过：检查器对工作区内路径显式剥除模型自行传入的标记。`createToolManager` 注册 edit/write 时接线权限检查器。
- **[审批 UI]**: `FileDiffBlock` 新增 pending 审批卡片（复用 delete 的 ApprovalCard 语法，Allow / Skip），`App.tsx` 传递审批与状态字段。
- **[测试]**: 新增 `write-boundary-approval.test.ts`（权限检查器 / executor 标记 / ToolManager 端到端审批 11 例）、bridge 压缩保 diff 与失败态 2 例、`FileDiffBlock` 审批与失败态 4 例、`UserMessage` 限高 1 例；全仓 typecheck + agent-core 736 例 + desktop 375 例通过。
- **[文档同步]**: 更新 `SECURITY.md`、`agent-权限设计规则和原则.md`（写越界从硬拒绝改为可审核）、`agent-tool-preview-design-guidelines.md`（structured 作为 diff 事实来源 + status/errorMessage 语义）、`front-中间消息区规范.md`（用户消息限高规则）。

### 🧠 Design Intent (Why)

- diff 展示与模型回填必须分层：回填文本可以被压缩，但 UI 事实必须来自 `structured` 原始结果，否则压缩策略的任何调整都会破坏前端展示。
- 「路径在工作区外」是意图清楚、范围可见、用户可判断的风险，符合权限设计原则 4 的「可审核」分类，不应硬拒绝——硬拒绝还会诱导模型转用 bash 绕道写入。
- 审批放行走 `sanitizedArgs` 内部标记而不是全局状态，天然对齐 scheduler 现有的「批准后用清洗参数执行」机制，且检查器剥除模型传入的标记，模型无法伪造审批。

### ➕ 追加（同轮 follow-up）：Composer 布局与发送按钮对齐 Cursor

用户追加诉求：输入框内容多行时布局走样（`+`/发送按钮垂直居中悬浮），且蓝色发送按钮不好看，要对齐 Cursor。

- **布局统一 stacked**：删除 follow-up 的 inline 单行布局与 `inputLayout` prop，Composer 一律 textarea 全宽在上、控件行贴底（左 `+` + 模型选择，右发送）。多行内容时按钮不再垂直居中悬浮，也避免 inline↔stacked 切换导致 textarea remount 丢焦点。
- **发送按钮反色化**：`bg-brand` 蓝色圆钮改为 Cursor 式反色圆钮 + 上箭头（`ArrowUp`），用 `bg-text-main` / `text-surface` 语义类随主题翻转，禁用态退为 `bg-text-subtle` 灰底。
- **模型菜单展开方向**：模型按钮随布局移到控件行左侧，菜单从 `right-0`（向左展开）改为 `left-0`（向右展开），Options 子菜单同步改为贴右弹出。
- 测试：composer.test 改为断言 stacked 结构 + 反色按钮类名；`pnpm --filter @actspace/desktop test` 376 例通过，typecheck 与 `build:renderer` 通过。按主题规范 rg 自查，无新增非法颜色字面量（bg-text-main/text-surface 均为语义类）。
- 文档：`front-聊天输入框规范.md` 更新 Composer 形态（废弃 inline 矩阵）、发送按钮配色原则。
- 验证限制：本环境无 Computer Use / 浏览器工具，未截图浅深主题下的实际渲染，需用户在 Electron 窗口目测确认。

### ➕ 追加（同轮 follow-up 2）：Composer inline↔stacked 动态切换 + 用户消息两态折叠

用户对齐 Cursor 实际行为后追加两点：① Composer 单行内容应该是紧凑单行布局，内容折行才切控件贴底的 stacked（上一次改成了永远 stacked，空输入框也占两行高）；② 用户消息卡片默认应折叠只露几行，点击才展开，而不是永远以最大高度 + 滚动条常驻。

- **Composer 动态布局**：inline / stacked 用同一个 grid 容器切换 `grid-template-areas`，textarea / `+` / 模型 / 发送 DOM 结构不变，切换不 remount、不丢焦点光标；toolbar 用 `display: contents` 保留 aria 分组。切换判定用 `scrollHeight` 超过单行阈值（40px），覆盖显式换行与自动折行；附件 / initial 强制 stacked。模型菜单展开方向随布局态动态选（inline 靠右向左展开，stacked 靠左向右展开），Options 子菜单同步。
- **用户消息两态折叠**：默认折叠 max-h 88px + `overflow-hidden` + 主题感知渐隐遮罩（`from-surface to-transparent`），点击展开到 `min(240px,32vh)` 内部滚动；收起只通过点击卡片外任意位置触发（document pointerdown 监听），再点卡片不收起；存在文本选区时不触发展开；短消息不参与（无光标 / 遮罩 / 交互）。溢出检测用 `scrollHeight`（不受 max-height 钳制）。
- 测试：composer 布局切换 2 例（含同一 DOM 节点断言）、user-message 折叠 3 例；desktop 379 例通过，typecheck 与 `build:renderer` 通过。
- 文档：`front-聊天输入框规范.md` 改为动态布局矩阵（含「切换不 remount」实现约束），`front-中间消息区规范.md` 用户消息改为两态折叠规则。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/messages/UserMessage.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/front-聊天输入框规范.md`
- `packages/desktop/src/renderer/components/messages/FileDiffBlock.tsx`
- `packages/desktop/src/renderer/App.tsx`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/permissions.ts`
- `packages/agent-core/src/tools/tools/edit-file-diff/executor.ts`
- `packages/agent-core/src/tools/tools/write-file/permissions.ts`
- `packages/agent-core/src/tools/tools/write-file/executor.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/test/write-boundary-approval.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/renderer/test/file-diff-block.test.tsx`
- `packages/desktop/src/renderer/test/user-message.test.tsx`
- `docs/SECURITY.md`
- `docs/design-docs/agent-权限设计规则和原则.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/front-中间消息区规范.md`
