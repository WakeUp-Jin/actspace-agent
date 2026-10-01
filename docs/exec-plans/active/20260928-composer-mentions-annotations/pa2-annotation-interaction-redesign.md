# PA2：回复批注交互重做

状态：执行中（2026-10-01，分支 `feat/response-annotation-redesign`，从 `main@d758122` 切出）。上级：[总览](README.md)。

## 为什么重做

PA 按原设计实现后，用户对照 Codex 的截图认为交互和样式不对：选区上方是常驻工具条、Composer 里是一块可展开的托盘、已发送批注在回复旁画中性编号 marker，整体偏重、偏散。用户确认了 demo [`pa2-annotation-demo.html`](../../../exec-runs/20260928-composer-mentions-annotations/assets/pa2-annotation-demo.html)（2026-10-01），本计划把实现改成 demo 的样子。

数据契约（P0 的 `response-excerpt` 内容块、`ResponseAnnotationReference`、偏移 + 前后文定位、main 校验）不变，只改 renderer 的交互和样式。

## 目标交互（以 demo 为准）

1. **选区菜单**：在可批注回复里选完文字（松开鼠标或键盘扩选后），选区末尾下方出现一个小菜单，只有一项「添加到对话」。拖选过程中不出现。没有 Ask in side chat。
2. **评论输入框**：点「添加到对话」后，原生选区清掉，原文变成蓝色持久高亮，选区末尾出现编号圆点，选区下方弹出单行输入框「添加评论（可选）…」和深色圆形 ✓。
   - Enter 或 ✓ 保存（空内容即无评论）；Shift+Enter 换行；输入法组合中不提交。
   - Esc 关闭且不改评论（新加的批注保留，只是没有评论）。
   - 点输入框外部：保存已输入的内容并关闭。
   - 超过 2000 码点：显示错误、✓ 禁用，不截断。
3. **回复里的草稿标记**：每条草稿批注在原文上保持高亮，末尾右上角画一个实心蓝色编号圆点（编号 = Composer 卡片里的序号）。点圆点重新打开该条的评论输入框。
4. **Composer 胶囊**：Composer 面板里只剩一个胶囊「💬 N 条批注」。
   - 悬停或键盘聚焦胶囊：上方出卡片，逐条显示「序号. 选中文本：」+ 原文（最多 4 行）、「评论：」+ 评论（有才显示），右上角铅笔（编辑）和垃圾桶（删除）。
   - 悬停卡片里某一条：该条原文高亮加深。
   - 铅笔：把原文滚到可见区，打开同一个评论输入框。
   - 悬停胶囊时右上角出现 ×：清空全部草稿批注。
   - 「最多引用 20 段回复」提示显示在胶囊旁。
5. **已发送**：用户消息卡片上方右对齐同样的胶囊，悬停出卡片，没有编辑和删除。
   - 悬停某一条：原文临时高亮加深；点击（或 Enter / Space）：滚到原文并高亮约 1.6 秒。
   - 原回复不在已加载历史里或定位失败：该条显示「原回复不可用」，不可点击。
   - 发送后回复里不再显示该批注的高亮和圆点。

## 已确认的取舍

- 发送后回复不保留高亮和圆点（用户 2026-10-01 确认 demo 时接受）。
- 高亮和圆点颜色用 info 蓝，不跟强调色。新增主题 token，浅 / 深 / 跟随系统三处都定义。
- 文案用中文：「添加到对话」「N 条批注」「选中文本：」「评论：」「添加评论（可选）…」。
- **去掉「复制到草稿」**：截图里已发送卡片没有操作；已发送批注仍然只读（修订总览决策 8）。
- 用户消息卡片本身的样式（左对齐整宽卡片）不在本计划内，只在它上方加胶囊。

## 不做

- 不改 shared / main / core 的任何代码和契约。
- 不做快捷键添加、跨回复选区、代码块批注（与 PA 相同）。
- 不重做用户消息气泡为右对齐（demo 里只是示意）。

## 必读

- `AGENTS.md`、`docs/FRONTEND.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/design-docs/frontend/front-icon-button-tooltip-guidelines.md`。
- [PA 子计划](pa-response-annotations.md) 的「关键设计」（可批注文本模型、`canAnnotate` 规则仍然适用）。
- demo：`docs/exec-runs/20260928-composer-mentions-annotations/assets/pa2-annotation-demo.html`。

## 代码现状 → 目标

| 现有文件（`apps/desktop/src/renderer/`） | 处理 |
|---|---|
| `components/messages/ResponseSelectionToolbar.tsx` | 改名 `ResponseSelectionMenu.tsx`：菜单样式、拖选中不出现、锚在选区末尾下方 |
| `components/composer/ResponseAnnotationTray.tsx` | 删除，换成 `composer/ResponseAnnotationPill.tsx`（胶囊 + 悬停卡片，草稿 / 已发送两种） |
| `components/composer/ResponseAnnotationCommentEditor.tsx` | 删除，换成 `messages/ResponseAnnotationCommentPopover.tsx`（portal、跟随原文定位） |
| `components/messages/ResponseAnnotationMarkers.tsx` | 改为只画草稿圆点；不再负责已发送 marker 和高亮 |
| `components/messages/ResponseAnnotationPopover.tsx` | 删除（已发送 marker 和「复制到草稿」不再存在） |
| 新增 `components/messages/ResponseAnnotationHighlights.tsx` | 全会话唯一的高亮注册：草稿常规档 + 当前条加深档 |
| `components/messages/response-annotation-context.ts` | context 改为：草稿列表、编辑中 id、增删改、当前高亮 id、按需定位 / 解析 |
| `components/messages/useResponseAnnotationState.ts` | 去掉 `sentByMessageId` / `reportResolution` / `editRequest` / `onCopyToDraft`，加编辑和解析能力 |
| `components/messages/UserMessage.tsx` | 摘要按钮换成卡片上方的已发送胶囊 |
| `components/messages/AssistantReply.tsx` | 只在有草稿时挂草稿圆点层 |
| `components/Composer.tsx` | 托盘换胶囊；`responseAnnotationEditRequest` 换成 `onEditResponseAnnotation` |
| `components/ConversationView.tsx` | 挂菜单、高亮层、评论输入框；Composer props 调整 |
| `styles/tokens.css`、`styles/tailwind.css`、`styles/base.css` | 高亮 token 改蓝色并加深档、圆点 token；`::highlight(act-annotation-active)`；动画改名 |

## 任务

### PA2.1 Token 与样式

- `tokens.css` 三个块：
  - `--act-color-annotation-highlight`：浅 `rgba(57,120,184,0.18)`，深 `rgba(108,166,218,0.22)`。
  - 新增 `--act-color-annotation-highlight-active`：浅 `0.32`，深 `0.38`。
  - 新增 `--act-color-annotation-mark`（`var(--act-color-info)`）和 `--act-color-on-annotation-mark`（浅 `#ffffff`，深 `#181916`）。
- `tailwind.css` 的 `@theme inline` 加 `annotation-mark` / `on-annotation-mark` 颜色。
- `base.css`：加 `::highlight(act-annotation-active)`；`annotation-toolbar-in` 改名 `annotation-pop-in`。

### PA2.2 状态与 context

`useResponseAnnotationState` 返回：

- `drafts`、`setDrafts`、`notice`。
- `contextValue`：
  - `drafts`、`canAnnotate`、`addDraft(annotation)`：去重、上限；成功后把它设为编辑中。
  - `updateComment(id, comment)`、`removeDraft(id)`。
  - `editingAnnotationId` / `setEditingAnnotationId`。
  - `activeAnnotationId` / `setActiveAnnotationId`：加深档。
  - `resolveRange(annotation)`：按 `assistantMessageId` 在滚动容器里找 `[data-annotation-root]`，跑 `collectAnnotatableText` + `resolveAnnotation` + `offsetsToRange`，失败返回 null。
  - `locateAnnotation(annotation)`：滚动到原文、加深 1.6 秒。
  - `editAnnotation(id)`：滚动到原文，下一帧打开评论框。

切换 `draftKey` 时清掉编辑中和高亮。发送失败经 `draftRestore` 放回的逻辑不变。

### PA2.3 选区菜单

`ResponseSelectionMenu`：

- 选区判定沿用现有 `readSelection`。
- `pointerdown` 标记拖选中并关闭；`pointerup` 后用 rAF 评估一次；`selectionchange` 只在非拖选时评估（覆盖键盘扩选）。
- 菜单 `role="menu"`，一个 `role="menuitem"` 按钮「添加到对话」。按下时 `preventDefault`，不抢焦点。
- 定位在选区最后一个矩形的右下方：`left = rect.right` 限制在视口内，`top = rect.bottom + 6`，下方放不下时翻到选区上方。
- 选区清空、按 Escape、滚动时关闭。
- 点击：`addDraft`，清掉原生选区，关闭菜单。

### PA2.4 评论输入框

`ResponseAnnotationCommentPopover`（portal，fixed）：

- `editingAnnotationId` 对应的草稿能解析出 range 时打开，锚在最后一个矩形下方 8px，左缘对齐该矩形左缘减 4px，限制在视口内。
- 滚动容器滚动、窗口 resize 时重新定位（rAF 合并）。
- 内容：单行起步、自动增高（最多 4 行）的 textarea，placeholder「添加评论（可选）…」，aria-label「第 N 条批注的评论」；右侧 28px 圆形 ✓（`bg-action text-on-action`，aria-label「保存评论」）。
- 键盘、外部点击、超长规则见「目标交互」第 2 条。点 ✓ 或 Enter 后焦点回到 Composer 输入框。

### PA2.5 高亮与草稿圆点

- `ResponseAnnotationHighlights`（ConversationView 挂一个）：
  - 在 `drafts`、`activeAnnotationId`、`messages` 变化后的 layout effect 里解析所有草稿 range。
  - `CSS.highlights.set("act-annotation", ...)` 注册草稿，`"act-annotation-active"` 注册当前条（可以是已发送的）。
  - 不支持 Highlight API 时什么也不做。卸载时删除两个注册。
- `ResponseAnnotationMarkers` 改为草稿圆点层：输入为当前回复的草稿及其全局序号，沿用现有测量、ResizeObserver、rAF 合并。
  - 圆点 14px，`bg-annotation-mark text-on-annotation-mark`，`ring-2 ring-surface`（背景色描边）。
  - 位置在最后一个矩形右上角：`left = rect.right - 2`，`top = rect.top - 10`。
  - 同一位置重叠时向右错开 16px。
  - 圆点 `aria-label="批注 N，编辑评论"`，点击调用 `setEditingAnnotationId`。

### PA2.6 胶囊与卡片

`ResponseAnnotationPill`，参数 `{ annotations, variant: "draft" | "sent", notice? }`，从 context 取操作。

- 胶囊：28px 高、`rounded-act-pill border border-line bg-surface`，图标 `MessageSquareText` 14px 加「N 条批注」。悬停 / 聚焦时 `border-line-strong text-text-main`。
- 卡片：用 `ui/HoverCard`（受控，`openDelay` 100、`closeDelay` 120）。草稿版在胶囊上方，已发送版在下方右对齐。宽 360px，最高 380px 内部滚动。
  - 胶囊上按 Tab 时把焦点移进卡片（沿用旧 Popover 的做法）。
  - 卡片里 Escape 关闭并把焦点还给胶囊。
- 草稿条目右上角是 `IconButton` 编辑（`Pencil`）和删除（`Trash2`），aria-label 带序号。
- 已发送条目整条是按钮（可解析时）；不可解析的显示「原回复不可用」。解析结果在卡片打开时用 `resolveRange` 算一次。
- 悬停 / 聚焦条目 → `setActiveAnnotationId(id)`；离开卡片 → `null`（已在编辑中的除外）。
- 草稿版胶囊右上角的 ×：18px，`group-hover` / `group-focus-within` 时显示，aria-label「清空全部批注」。

### PA2.7 接线

- `Composer.tsx`：
  - `ResponseAnnotationTray` 换成 `<ResponseAnnotationPill variant="draft">`，放在附件条之前、单独一行（`px-3 pt-3`）。
  - 删除 `responseAnnotationEditRequest` prop。
  - 有批注时仍强制 stacked。
  - 发送、`canSendMessage`、发送后清空逻辑不变。
- `UserMessage.tsx`：删除 `ResponseAnnotationSummary`。有 `responseAnnotations` 时在卡片前加一行 `flex justify-end pb-2`，放已发送胶囊；article 改为纵向排列。
- `AssistantReply.tsx`：从 context 取属于本回复的草稿（带全局序号），有才挂圆点层。
- `ConversationView.tsx`：挂 `ResponseSelectionMenu`、`ResponseAnnotationHighlights`、`ResponseAnnotationCommentPopover`；两处 Composer 去掉 `responseAnnotationEditRequest`。

### PA2.8 测试

- 改写 `response-selection-toolbar.test.tsx` 为 `response-selection-menu.test.tsx`：
  - 有效选区松开鼠标后出现菜单；拖选中（`pointerdown` 未 `pointerup`）不出现。
  - 代码块内、跨两条回复、`turn:` id 的回复不出现。
  - 点击后草稿 +1、选区被清空、评论框打开；Escape 关闭。
- 改写 `response-annotation-markers.test.tsx`：
  - 草稿圆点编号、unresolved 草稿不画、点圆点打开评论框。
  - 评论框的 Enter 保存、Esc 不改、外部点击保存、超长禁用。
  - 高亮注册（给 `CSS.highlights` / `Highlight` 打桩）：草稿进常规档、悬停条目进加深档、删除后移除。
- `composer.test.tsx` 的托盘 describe 改为胶囊：
  - 显示数量；悬停卡片显示原文和评论；删除一条、× 清空全部、编辑调用 `editAnnotation`。
  - 只有批注也能发送，发送参数正确。
- `user-message.test.tsx`：已发送胶囊；卡片无编辑 / 删除；可定位条目点击调用 `locateAnnotation`；不可解析显示「原回复不可用」。
- `response-annotation-state.test.tsx`、`app-response-annotations.test.tsx`、fixture `response-annotations-preview.tsx`：跟着新 API 改。草稿切会话隔离、发送失败恢复的断言保留。

### PA2.9 视觉验证

- 用 fixture 在 headless Chromium 里截图：浅色、深色、600px 窄窗。
- 状态：选区菜单、评论框、两条草稿圆点 + 高亮、胶囊卡片、已发送胶囊卡片。
- 截图放 `docs/exec-runs/20260928-composer-mentions-annotations/pa2-screenshots/`。
- Electron 真实验收沿用 PA.8 的步骤（第 3 步改为：胶囊、悬停卡片、点击定位），由用户确认。

## 验证命令

沿用总览「统一验证命令」。desktop 测试前先 `pnpm --filter "./packages/**" build`，避免 dist 过期。

## 完成标准

- PA2.8 测试通过；统一验证命令通过（desktop 只剩已知的 workspace-git-context-service 基线失败）。
- 截图与 demo 一致。
- 设计文档、总览、执行过程、history 已更新。

## 回退

- 单个分支、未合并前可整体丢弃。合并后若交互有问题，`git revert` 合并提交即可回到 PA。数据契约没有变，已发送的历史两边都能读。
- 评论框定位在某些布局下不稳：退回为在 Composer 卡片里内联编辑（PA 的 `ResponseAnnotationCommentEditor` 的做法）。
