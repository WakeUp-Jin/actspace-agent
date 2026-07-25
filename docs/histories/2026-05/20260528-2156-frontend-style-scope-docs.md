## [2026-05-28 21:56] | Task: 补充前端样式作用域规范

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop app`

### 📥 User Query

> 总结 Lab 按钮样式 bug 的根因后，希望补充规范文档，并检查现有前端样式如何更好地避免这类问题。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[规范入口]**: 在 `docs/FRONTEND.md` 增加前端样式作用域约定入口，说明当前 Tailwind 与旧 `styles.css` 的加载关系。
- **[团队约定]**: 新增 `frontend-style-scope-conventions.md`，明确禁止新增裸元素 reset 和 `.split-view button` 这类宽泛选择器。
- **[学习沉淀]**: 新增全局 CSS reset 覆盖 Tailwind utility 的学习文档，记录 computed style 排查方法。
- **[历史补全]**: 补充 Lab 样式 history 的真实根因和受影响文件。
- **[执行计划]**: 新增 active plan，规划样式所有权收口、legacy CSS 拆分、旧全局样式下线和 computed style 验收。
- **[第一阶段执行]**: 先将 `styles.css` 导入到 `legacy` cascade layer，再把 legacy 顶部重复的 token/base 定义回收到 `tokens.css` / `base.css`，验证 Lab、Kairos、Sidebar 真窗无回退。
- **[第二阶段执行]**: 将旧 `styles.css` 按职责拆为 `electron.css`、`markdown.css`、`diff.css`、`legacy-shell.css`、`legacy-conversation.css`、`legacy-composer.css`、`legacy-right-panel.css`，入口不再导入 `../styles.css`，并同步更新相关测试与文档。
- **[RightPanel 切片]**: 将 RightPanel shell、tabs 和 mock body 样式迁回 `RightPanel.tsx` 的 Tailwind 局部 class 常量，删除 `legacy-right-panel.css`，并让 tab `no-drag` contract 由组件测试覆盖。
- **[Shell 切片第一步]**: 将 SplitView 和 PlaceholderView 的样式迁回组件内 Tailwind 局部 class 常量，删除 `legacy-shell.css` 中 `.split-view*` / `.placeholder-*` 规则，Sidebar 复杂交互样式留在后续独立切片。
- **[Sidebar 切片第一步]**: 将 Sidebar 外壳、顶部主入口和底部 Settings 样式迁回 `Sidebar.tsx` 的 Tailwind 局部 class 常量，删除 `legacy-shell.css` 中 `.sidebar` / `.sidebar-primary-*` / `.settings-entry` 规则；暂保留 `.sidebar button` reset 给未迁移的会话行和 Workspace 按钮。
- **[Sidebar 切片收口]**: 将分组标题、会话行、Pin / Archive hover、See more 和 Workspace 文件夹头也迁回 `Sidebar.tsx`，删除 `legacy-shell.css` 剩余 Sidebar selector；该文件现只保留共享 `session-status-pulse` keyframe。
- **[Conversation / Composer 切片第一步]**: 将 `ConversationView.tsx` 的消息骨架、turn actions、基础 message row（User / Assistant / Thinking / ToolLogLine）以及 `Composer.tsx` 的外壳、附件区、输入区和控制条主按钮迁回组件内 Tailwind 局部 class 常量，并删除 `legacy-conversation.css` / `legacy-composer.css` 对应的基础布局规则。
- **[Composer 浮层收口]**: 将 model dropdown、model options 与 `ContextPopup.tsx` 迁回组件内 Tailwind 局部 class 常量，删除 `legacy-composer.css` 并从 `styles/index.css` 移除对应 import。
- **[Bash 切片收口]**: 将 `BashRunBlock.tsx` 的执行折叠行、输出面板、approval 卡片和操作按钮样式迁回组件内 Tailwind 局部 class 常量，删除 `legacy-conversation.css` 中 `.bash-*` 视觉规则。
- **[Base layer 修正]**: 浏览器 mock computed style 发现 `button { font: inherit; }` 会在未分层导入时压过 Tailwind `text-*` / `font-*` utility；`styles/index.css` 改为 `@import "./base.css" layer(base);`，并同步更新团队样式约定。
- **[Bash 验证]**: 浏览器 mock 复查确认 Bash toggle 为 14px、approval/action/output 文本为 13px，approval 卡片背景/边框和操作按钮背景来自组件 class，页面 console error 为空。
- **[文档状态同步]**: 旧根部 `styles.css` 与 `legacy-*` 分区下线后，同步 `FRONTEND.md`、Tailwind 架构规范、团队样式约定和 active plans，将未来执行路径改为 `styles/index.css`、明确全局边界文件或组件局部 Tailwind class，避免后续计划继续指向已删除入口。
- **[更宽文档审计]**: 扩展扫描 active plans 之外的设计规范和 learning 文档；将 Usage Statistics 字重规范从“在 `styles.css` 中统一拉回”改为“在组件局部 Tailwind class / token 映射中收敛”，并更新 Tailwind 迁移 learning 的全局 CSS 边界描述。
- **[状态验证]**: 确认 `packages/desktop/src/renderer/styles.css` 不存在，`packages/desktop/src/renderer/styles/legacy-*.css` 无文件；剩余文档命中均为历史复盘、防回流约束或已完成进度说明。

### 🧠 Design Intent (Why)

这次问题暴露的是迁移期样式所有权边界，而不是单个按钮颜色。把排查路径和团队约束落到仓库文档，可以减少后续继续靠反复试 class 或 inline style 抢优先级解决问题。

继续执行后，核心目标从“说明根因”升级为“把旧大样式文件拆成可删除的分区文件”。这样后续迁移可以按区域删 legacy，而不是继续在单个文件里做手术。

### 📁 Files Modified

- `docs/FRONTEND.md`
- `docs/coding-standards/team/README.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`
- `docs/learnings/2026-05/global-css-reset-vs-tailwind.md`
- `docs/histories/2026-05/20260528-1958-lab-button-card-visual-tune.md`
- `docs/histories/2026-05/20260528-2156-frontend-style-scope-docs.md`
- `docs/exec-plans/active/20260528-frontend-style-ownership-cleanup.md`
- `docs/exec-plans/README.md`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/styles/markdown.css`
- `packages/desktop/src/renderer/styles/diff.css`
- `packages/desktop/src/renderer/styles/legacy-shell.css`
- `packages/desktop/src/renderer/styles/legacy-conversation.css`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ContextPopup.tsx`
- `packages/desktop/src/renderer/components/messages/UserMessage.tsx`
- `packages/desktop/src/renderer/components/messages/AssistantReply.tsx`
- `packages/desktop/src/renderer/components/messages/ThinkingBlock.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
- `packages/desktop/src/renderer/components/SplitView.tsx`
- `packages/desktop/src/renderer/components/PlaceholderView.tsx`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/main/index.ts`
- `docs/design-docs/frontend/front-tailwind-style-architecture.md`
- `docs/exec-plans/active/actspace-tailwind-style-architecture.md`
- `docs/exec-plans/active/20260528-tailwind-remaining-ui-migration.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/01-composer-visual-and-model-menu.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/03-context-readonly-popover.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/04-sidebar-workspaces-and-session-status.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/05-settings-typography.md`
- `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md`
- `docs/exec-plans/active/frontend-ui-components-foundation.md`
- `docs/exec-plans/active/lab-v0-frontend-mock-implementation.md`
- `docs/design-docs/frontend/front-usage-statistics.md`
- `docs/learnings/2026-05/global-css-reset-vs-tailwind.md`
- `docs/learnings/2026-05/tailwind-page-slice-migration.md`
