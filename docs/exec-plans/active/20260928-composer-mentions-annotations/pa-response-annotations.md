# PA：回复批注

状态：已实施，PA.8 Electron 验收待确认（执行过程步骤 6）。上级：[总览](README.md)。

## 目标

用户在助手回复里拖选一段文字 → 点「添加到对话」→ 引用出现在 Composer 顶部托盘，可加评论、编辑、移除 → 随消息发送 → 历史里的用户消息显示引用摘要，被引用的回复旁显示编号 marker，悬停可看原文和评论。

## 不做

- 代码块、工具行、thinking、图片、跨多条回复的选区。
- 已发送批注的删除或编辑（只提供「复制到草稿」）。
- 快捷键添加（例如 `Cmd+Shift+I`）。
- 未发送草稿里的批注在回复上画 marker（只在 Composer 托盘里显示）。

## 必读

- `AGENTS.md`、`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/design-docs/frontend/front-中间消息区规范.md`、`docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/frontend/front-icon-button-tooltip-guidelines.md`。
- 设计文档第 8、9 节（交互细节），以及顶部「实施决策修订」。
- 代码：`messages/MarkdownProse.tsx`、`messages/AssistantReply.tsx`、`messages/UserMessage.tsx`、`ConversationView.tsx`（`renderMessage` 约 170 行）、`Composer.tsx`（附件条 `renderAttachmentStrip`、`resolvedLayout`、`canSendMessage`、`sendCurrentMessage`）、`App.tsx`（`draftsRef` 约 844 行、`handleSend` 约 1635 行、两处 `setComposerDraftRestore`）、`components/ui/HoverCard.tsx`。

## 关键设计

**可批注文本模型**（纯函数，不依赖 React）：在回复容器内按文档顺序遍历文本节点，只收录祖先链上最近的块级元素是 `p`、`h1`–`h6`、`li`、`blockquote`、`td`、`th` 的节点；位于 `pre`、`.markdown-code-shell`、`img`、`[data-annotation-exclude]` 内的跳过。相邻两个不同块之间插入一个虚拟 `\n`。得到：

```ts
type AnnotatableText = {
  text: string;                                   // 所有收录文本拼接（含块间 \n）
  segments: { node: Text; start: number; end: number }[];  // 每个文本节点在 text 中的区间
};
```

偏移都以这个 `text` 的 UTF-16 下标计。行内代码（段落里的 `code`）、加粗、链接文字都照常收录。

**状态归属**：草稿批注由 `App.tsx` 按 sessionId 保存（与 `draftsRef` 同级的 `responseAnnotationDraftsRef` + 当前会话的 state），以受控 props 传给 Composer：`responseAnnotations` + `onResponseAnnotationsChange`。这样切换会话天然隔离，发送失败可以直接放回。

> 实施调整：草稿实际放在 `WorkbenchLayout`，和文字草稿一样按 `draftKey` 存进内存 Map；当前会话的 state 在 `ConversationView` 里通过 `useResponseAnnotationState` 管理。发送失败仍经 App 的 `draftRestore` 放回。

**回复侧上下文**：`ConversationView` 提供一个 React context（`ResponseAnnotationContext`），内容为：已发送批注按 `assistantMessageId` 建的索引、`canAnnotate(messageId)`、`onAddAnnotation(ref)`、`onCopyToDraft(ref)`。`AssistantReply` 从 context 读取，`renderMessage` 签名不变。

**何时允许选区**：只有 id 符合 `/^v2-\d+$/` 的回复允许（`canAnnotate` 按 id 判断，不看 `isStreaming`）。流式中的回复块 id 是 `turn:<runId>:assistant:<n>`，流式结束到投影刷新之间仍保持这个 id，而 main 只认 `v2-<journal seq>`；按 id 判断能同时挡住这两段时间。

## 任务

### PA.1 可批注文本模型

- 新增 `apps/desktop/src/renderer/components/messages/response-annotation-text.ts`：
  - `collectAnnotatableText(root: HTMLElement): AnnotatableText`
  - `rangeToOffsets(model, range: Range): { start: number; end: number } | null`：起点或终点不在收录节点内时返回 null；反向选区归一化；首尾空白收缩到非空白字符。
  - `offsetsToRange(model, start, end): Range | null`
  - `createAnnotationDraft(model, start, end, assistantMessageId): ResponseAnnotationReference`：`selectedText = text.slice(start, end)`，前后文各取最多 64 个码元，`annotationId` 用 `ann_<时间戳>_<随机>`。
  - `resolveAnnotation(model, ann): { status: "resolved"; start: number; end: number } | { status: "unresolved" }`：先比对 `text.slice(start, end) === selectedText`；不等时在全文里找 `prefix + selectedText + suffix` 的出现位置，恰好一处则 resolved，否则 unresolved。
- 测试 `apps/desktop/src/renderer/test/response-annotation-text.test.tsx`，用真实 `MarkdownProse` 渲染以下 Markdown 后断言：
  - 段落内跨 `**粗体**`、`*斜体*`、Markdown 链接文字 的选区，偏移与 `selectedText` 正确。
  - 列表、引用、表格单元格可选；两个段落之间是 `\n`。
  - 选区起点或终点落在代码块里返回 null。
  - 中文与 emoji（代理对）混排时，`offsetsToRange` 后 `range.toString()` 与原文一致。
  - `resolveAnnotation`：偏移正确 → resolved；偏移错位但前后文唯一 → resolved 到正确位置；同一段文字出现两次且前后文相同 → unresolved；原文不存在 → unresolved。

### PA.2 选区浮动工具条

- `AssistantReply.tsx`：外层 `article` 加 `data-assistant-message-id={message.id}`，内容容器加 `ref`；容器设为 `position: relative`，作为 marker 层的坐标基准。
- 新增 `messages/ResponseSelectionToolbar.tsx`（由 ConversationView 挂一个实例，不是每条回复一个）：
  - 监听 `document` 的 `selectionchange`（用 rAF 合并），取选区起终点各自最近的 `[data-assistant-message-id]`；两者必须是同一条且 `canAnnotate` 为真。
  - 用 PA.1 算出偏移，得不到或文本超过 8000 码点就不显示。
  - 工具条用 portal 渲染，锚定 `range.getBoundingClientRect()`：优先在选区上方 8px，上方空间不足时翻到下方；水平方向限制在视口内 12px。
  - 按钮文案「添加到对话」，是真正的 `<button>`，支持键盘 focus、Enter / Space。
  - 点击：调用 `onAddAnnotation`，然后 `getSelection().removeAllRanges()`，工具条关闭。
  - 选区清空、按 Escape、滚动容器滚动时关闭；出现动画 120ms 透明度 + 4px 位移，`prefers-reduced-motion` 下取消。
- 测试 `apps/desktop/src/renderer/test/response-selection-toolbar.test.tsx`（jsdom 下给 Range 打 rect 桩）：有效选区出现按钮；代码块内、跨两条回复、流式中的回复、流式已结束但 id 仍是 `turn:` 形态的回复不出现；点击后 `onAddAnnotation` 收到正确引用且选区被清空；Escape 关闭。

### PA.3 Composer 引用托盘

- 新增 `apps/desktop/src/renderer/components/composer/ResponseAnnotationTray.tsx`：
  - 位置：Composer 面板内、附件条之上。有引用时 Composer 强制 stacked 布局（与有附件相同）。
  - 收起态：一行「▣ N 条引用」+「清空全部」+ 展开箭头。
  - 展开态：每条一张卡片，显示序号、选中文字（最多 2 行，超出省略）、评论摘要（有才显示）、「编辑」「移除」。超过 3 条时列表区域限高内部滚动。
  - 添加新引用后托盘自动展开，并把新卡片滚入可见区。
- 新增 `composer/ResponseAnnotationCommentEditor.tsx`：卡片内的多行纯文本输入，placeholder「添加可选评论…」；Enter 提交、Shift+Enter 换行、输入法组合中不提交；Escape 取消并恢复原评论；超过 2000 码点显示错误文案并禁止提交，不截断。
- `Composer.tsx`：
  - 新 props：`responseAnnotations?: ResponseAnnotationReference[]`、`onResponseAnnotationsChange?: (next) => void`。
  - `canSendMessage` 改为：正文、附件、批注有其一，且模型可用。
  - `createSendOptions(true)` 带上 `responseAnnotations`；`sendCurrentMessage` 发送后调用 `onResponseAnnotationsChange([])`。
  - Escape 分层：评论编辑中先退出编辑，其次再走现有关闭浮层逻辑。
- 测试（`composer.test.tsx` 新增 describe 块）：1 条 / 多条显示；展开收起；添加、编辑、取消编辑、移除、清空全部；只有批注没有正文也能发送，且发送参数正确；评论超长时报错不提交；与图片附件、Skill 共存时布局为 stacked。

### PA.4 App 接线：草稿、发送、失败恢复

- `App.tsx`：
  - `responseAnnotationDraftsRef: Map<sessionId, ResponseAnnotationReference[]>` 与当前会话 state；切换会话时读写，与现有 `draftsRef` 的处理放在一起。
  - 收到 `onAddAnnotation`：按 `assistantMessageId + start + end` 去重后追加；超过 20 条时拒绝并在 Composer 显示提示「最多引用 20 段回复」。
  - `handleSend`：`options.responseAnnotations` 已由 P0 透传；这里在发送前清空当前会话的草稿批注，并把它们放进 rejected / 抛错两处 `draftRestore` 的恢复逻辑。
  - `onCopyToDraft`：把一条已发送批注（去掉原 `annotationId`，生成新的）追加到当前草稿并展开托盘、聚焦评论输入。
- 测试：发送成功后托盘清空；`runAgent` 返回 `referenceIssue` 或抛错时批注回到托盘且错误可见；A 会话的批注切到 B 会话不可见、切回仍在。

### PA.5 用户消息里的引用摘要

- `UserMessage.tsx`：有 `responseAnnotations` 时，在正文和附件之后显示一个按钮「N 条回复引用」，点击展开列表；每项显示选中文字（最多 3 行）、评论、「定位」。摘要不参与正文的折叠。
- 「定位」：通过 context 找到目标回复；可定位时滚动到回复并让对应 marker 进入选中态；目标回复不在已加载历史里或 unresolved 时，该项显示「原回复不可用」且没有「定位」。
- 测试：`user-message.test.tsx` 补展开 / 收起、无评论时不显示评论区、原回复不可用状态。

### PA.6 回复上的编号 marker

- `ConversationView.tsx`：从已加载的 user blocks 建索引 `Map<assistantMessageId, { annotation, label, sourceUserMessageId }[]>`，同一条回复按引用出现顺序从 1 编号；通过 `ResponseAnnotationContext` 下发。
- 新增 `messages/ResponseAnnotationMarkers.tsx`（在 `AssistantReply` 内容容器内渲染的绝对定位层）：
  - 对每条批注跑 `resolveAnnotation`；unresolved 的不画。
  - resolved 的用 `offsetsToRange` → `getClientRects()` 取最后一个矩形，marker 放在它右侧，坐标换算为相对内容容器。
  - 碰撞：按 y 排序，与上一个间距小于 20px 时向下顺延。
  - 每条回复最多画 20 个，超出的不画（仍可在用户消息摘要里查看）。
  - 内容容器用 `ResizeObserver`、窗口 `resize` 触发重算，统一用 rAF 合并；卸载时全部解绑。
  - marker 是 `<button aria-label="回复批注 {n}">`，显示数字，使用中性 token（`bg-surface-raised`、`text-text-muted`、`border-line`），悬停 / 选中只提高对比度。
- 新增 `messages/ResponseAnnotationPopover.tsx`：用现有 `ui/HoverCard`，悬停或键盘聚焦 marker 时打开；内容为「选中文本」（限高内部滚动）、「用户评论」（有才显示）、按钮「复制到草稿」。鼠标移到卡片上不关闭；Escape 关闭并把焦点还给 marker。
- 选中态高亮：点击 marker 或用户消息摘要里的「定位」时，用 CSS Custom Highlight API（`CSS.highlights.set("act-annotation", new Highlight(range))`）高亮原文，不改动 DOM；高亮颜色在主题 token 里新增 `--act-color-annotation-highlight`（浅 / 深两套）。环境不支持该 API 时只显示 marker 选中态。点击回复外部或按 Escape 清除。
- 测试 `response-annotation-markers.test.tsx`：resolved 渲染 marker、unresolved 不渲染；超过 20 条只画 20 个；按钮可聚焦，聚焦时 popover 打开且无评论时不显示评论区；「复制到草稿」调用 `onCopyToDraft`。

### PA.7 浏览器 fixture 与视觉验证

- 按 `docs/FRONTEND_VERIFICATION.md` 的 fixture 写法新增 `apps/desktop/src/renderer/test/fixtures/response-annotations-preview.{html,tsx}`：一条长回复（段落、列表、表格、代码块、中英文混排）、一条带 3 个批注（其中 1 个 unresolved）的用户消息、Composer 托盘展开态。
- 截图：宽窗口、600px 以下窄窗、浅色、深色；状态包括工具条（选区在视口顶部时翻到下方）、托盘收起 / 展开 / 编辑评论、marker 碰撞、popover。截图存到执行记录目录。

### PA.8 Electron 真实验证

`pnpm dev:log` 启动，按 `docs/FRONTEND_VERIFICATION.md` 用日志里的 `[dev-runtime] appName / appId` 定位窗口：

1. Agent 会话中选中回复里一段普通段落，添加到对话，写评论，发送。
2. 确认模型回复里理解了引用；打开会话目录的 `journal.jsonl`，用户消息内容里有 `response-excerpt` 块且没有整条回复副本。
3. 用户消息显示「1 条回复引用」，被引用回复旁有 marker，悬停看到原文和评论，点击高亮原文。
4. 改变窗口宽度、切换主题、滚动，marker 不错位。
5. 断开网络或选无效模型让发送失败，确认托盘里的批注和正文都恢复。
6. 重启应用，历史里的摘要和 marker 仍在。
7. Chat 会话重复第 1、3 步。

## 完成标准

- PA.1–PA.6 测试通过；统一验证命令通过（desktop 只剩基线已知失败）。
- fixture 截图和 Electron 验证结果记录在执行过程中；未能验证的项写进执行摘要。

## 回退

- 若某类块定位不稳定：把它从 PA.1 的收录列表里去掉，该类块上不再出现「添加到对话」。
- 若 Custom Highlight API 在目标 Electron 版本有问题：去掉高亮，只保留 marker 选中态。
- 不退回到保存屏幕坐标。
