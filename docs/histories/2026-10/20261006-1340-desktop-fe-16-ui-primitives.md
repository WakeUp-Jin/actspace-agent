## 2026-10-06 13:40 | Task: Desktop 前端重构 16：UI 原语与组件拆分

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-16`。
- 状态：完成，已交给验收。
- Runtime 补充：
  - 子分支 `refactor/desktop-fe-16`，squash 回 `refactor/desktop-frontend`。
  - 收尾验收用两种方式：
    - 浏览器 mock：vite + headless Chrome + CDP，前后截图逐字节比较；
    - Electron：临时数据目录 + CDP 真实键盘、鼠标、触摸事件，含 480px 窄窗。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第七份是 16：弹层、菜单、对话框、下拉选择统一成一套基于 Radix 的原语，Esc 只关最上层、焦点回到触发器；拆分 SettingsPage、Sidebar、ConversationView、WorkbenchLayout；Composer 只挂载一次，附件随会话草稿走；原生 `<button>` 只减不增。

### 主要改动

- **原语**：`components/ui/` 新增 Dialog、ConfirmDialog、Popover、Menu、ContextMenu、Select、OpenerCapture、`menu-styles`、`cn`，基于 Radix。Esc 在原语里 `stopPropagation`，只关最上层；没有 Trigger 的弹层由 `OpenerCapture` 还焦点；遮罩和浮层 `no-drag`。
- **迁移**：对话框（Git 提交、Review、Mermaid、OpenRouter 目录、工作区、设置页三个）、浮层（ContextPopup、批注评论、选区菜单、Review 范围 / 跳转、MessageQueue、会话状态说明）、菜单（侧栏右键、消息操作、TurnActions ⋯、权限模式）、设置页下拉全部改用原语。删除 `settings/ConfirmDialog` 和 `useDialogFocusTrap`。
- **拆分**：SettingsPage 2074 → 221 行，Sidebar 1287 → 245，ConversationView 1218 → 374，WorkbenchLayout 746 → 378。
- **Composer 只挂一次**：附件按会话存进 `SessionLocalStore`，不用 `key={draftKey}` 重挂。
- **检查脚本**：原生 `<button>` 按文件计数基线（只许减）；`createPortal` 和 `role="dialog"` 只许在 `ui/`。
- **按钮收口**：234 → 230，保留原生的按类写明原因。
- **收尾验收修复**：重命名结束后焦点回到标题；浮层关闭后行提示不再自己冒出来。
- **文档**：基础组件规范新增「弹层原语」「按钮收口与检查」「大组件拆分的目录约定」；05 §7「实施后的更正」9 条；技术债新增「Desktop 前端组件遗留」。

### 设计动机

弹层原来有十多套手写实现，各自监听 Escape 和 document mousedown，层叠时一次 Esc 关两层，关闭后焦点常落到 body；附件存在 Composer 组件里，而 Composer 在新建页和会话页各挂一份、没有 key，切换会话时附件会串。四个大组件都超过 700 行，改一处要读上千行。

### 待用户确认

- `pauses.md` P2：ResponseAnnotationPill 保留 HoverCard（建议 A，已按此执行）。
- T17 的三处按钮外观变化（停止按钮、Stepper 重置悬停、子 Agent 返回按钮）。

### 学习沉淀

- [受控组件的 open 被「遮住」时，关闭回调会丢失](../../learnings/2026-10/20261006-masked-controlled-open.md)：收尾验收在 Electron 里发现的行提示残留，根因是 Radix 受控状态只在「和传入值不同」时回调。
- 另一个踩到的坑：Python 写中文时偶尔把一个字写成 U+FFFD（替换字符），T16b 的提交说明就带进去了。之后每次写完文件和提交说明都用 `grep $'\xef\xbf\xbd'` 查一遍。一句话能说清，没有单独写。

### 文件

- `apps/desktop/src/renderer/components/ui/`：Dialog、ConfirmDialog、Popover、Menu、ContextMenu、Select、OpenerCapture、menu-styles、cn
- `apps/desktop/src/renderer/components/settings/`：`sections/`、`dialogs/`、`use-settings.ts`、SettingsPage、SettingsPrimitives
- `apps/desktop/src/renderer/components/sidebar/`、`conversation/`、`workbench/`，以及 Sidebar、ConversationView、WorkbenchLayout、Composer、`composer/attachment-preview.ts`
- `apps/desktop/src/renderer/session/` 的 SessionLocalStore（`attachments`）
- 各处迁移的业务组件：ContextPopup、ReviewToolbar、ReviewWorkspace、MessageQueueTray、MermaidPreviewDialog、ResponseAnnotationCommentPopover、ResponseSelectionMenu、WorkspaceChromeControls、TurnActions、PermissionModeControl、SessionRow 等
- `scripts/check-frontend-design-tokens.mjs`、`scripts/native-button-baseline.json`、`scripts/test/frontend-design-tokens.test.mjs`
- `apps/desktop/package.json`（Radix 依赖）
- 测试：renderer 新增 ui-dialog、ui-menu-popover-select、settings-dialogs、use-settings、session-grouping、session-status、conversation-turns、composer-attachment-drafts 等
- 文档：`docs/design-docs/frontend/front-基础组件封装规范.md`、`front-聊天输入框规范.md`、`front-会话状态与数据流规范.md`、`docs/desktop-frontend-refactor/05`–`07`、README、`docs/exec-plans/tech-debt-tracker.md`、`docs/learnings/2026-10/20261006-masked-controlled-open.md`、`docs/exec-runs/20261005-desktop-fe-16-ui-primitives/`
