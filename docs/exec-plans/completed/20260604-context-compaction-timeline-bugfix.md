# Context Compaction 时间线样式修复计划

## 目标

修复 `/compact` / 自动上下文压缩在消息流中的视觉层级：Context Compaction 必须作为独立 timeline item 展示，而不是贴到上一条 assistant 回复里，也不再使用卡片、pill 或图标。执行中状态显示稳定文字和一条与中间内容列 / Composer 输入框宽度对齐的进度条；完成态显示为 `──────── Context compacted · N messages ────────` 风格的独立 divider。

## 范围

- 包含：
  - 调整 `context_compaction` 消息块的 running / completed / skipped / failed 视觉。
  - 保持 `/compact` 不生成普通用户消息、不进入 LLM conversation 的既有行为。
  - 保持 `context_compaction` 作为独立 `MessageBlock.kind`，不改成 `ToolUiPreview`。
  - 调整完成态文案，从 `N messages removed` 收口为 divider 上的 `N messages`。
  - 更新 renderer 测试，覆盖无图标、独立 divider、running 进度条和完成文案。
  - 做浅色 / 深色主题与窄宽度视觉验收。
- 不包含：
  - 不调整后端压缩阈值、摘要 prompt、`ContextManager` 压缩策略。
  - 不改 `context:compact` IPC 契约。
  - 不新增展开详情。
  - 不做文字 opacity pulse、扫光或省略号动画。
  - 不把完成态做成用户消息气泡；它是独立系统事件，不是用户输入。

## 背景

- 相关文档：
  - `docs/design-docs/front-中间消息区规范.md`
  - `docs/design-docs/front-主题与配色规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/exec-plans/completed/20260602-compact-command-ui.md`
  - `docs/design-docs/agent-turn-layers.md`
- 相关代码路径：
  - `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/shared/src/session-selectors.ts`
  - `packages/shared/src/session.ts`
  - `packages/desktop/src/renderer/test/compact-command-block.test.tsx`
  - `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
  - `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
  - `packages/desktop/src/renderer/styles/base.css`
- 已知现状：
  - `/compact` 命令已经接入，后端会生成 `context_compaction_started/progress/finished/failed` 流式事件和 `context_compaction` 持久化事件。
  - 现有 `CompactCommandBlock` running 使用卡片、spinner 图标和阶段文案，completed 使用带图标的 pill，视觉上像系统通知。
  - `ConversationView` 已把 `context_compaction` 作为 `SYSTEM_MESSAGE_KINDS`，但完成态仍需要更明确地成为消息流里的独立 divider。

## 风险

- 风险：完成态 divider 太轻，用户看不到压缩发生。
  - 缓解方式：divider 独立占据消息流一段，使用左右细线 + 居中文案；视觉重量低于用户消息，高于普通工具日志行。
- 风险：running 进度条铺满后又变得抢戏。
  - 缓解方式：进度条高度控制在 2-3px，使用主题感知低饱和 track 和 brand fill；不加文字动效。
- 风险：自动压缩和手动 `/compact` 展示混在一起后语义不清。
  - 缓解方式：同一组件语法服务两类触发源；文案只表达结果，不暴露内部触发源，详细 trigger 继续保留在 payload / run-log。
- 风险：颜色或 divider 细线在深色主题下不可读。
  - 缓解方式：只使用语义 token / 语义 Tailwind 类；验收时检查浅色、深色和 system dark。

## 里程碑

1. 组件视觉重构。
2. 文案与 selector 对齐。
3. 测试与 fixture 更新。
4. 前端验证与收尾。

## 任务清单

### M1 组件视觉重构

- [x] T1.1 重构 `CompactCommandBlock`
  - 文件：`packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
  - 改动：移除 `lucide-react` 状态图标；running 改为无边框系统执行段，上方稳定文本，下方 full-width 进度条；completed / skipped 改为 timeline divider。
  - 验证：组件测试能查询到 `Compacting context`、进度条和 divider 文案，且不再查询到旧图标相关结构。

- [x] T1.2 调整进度条动效
  - 文件：`packages/desktop/src/renderer/styles/base.css`
  - 改动：保留 `compact-progress` indeterminate 动效或改为更克制的条内滑动；`prefers-reduced-motion` 下静态显示。
  - 验证：running 状态在无真实 progress 时仍可理解；有真实 progress 时 width 使用 0-100% clamp。

- [x] T1.3 确认消息流独立位置
  - 文件：`packages/desktop/src/renderer/components/ConversationView.tsx`
  - 改动：确认 `context_compaction` 不被渲染进 assistant markdown，不与上一条 assistant message 合并；必要时调整相邻间距 class，使 divider 有独立上下呼吸。
  - 验证：渲染包含 assistant -> compaction -> assistant / user 的消息序列，确认 compaction 是单独 article / separator。

### M2 文案与数据映射

- [x] T2.1 调整完成态文案
  - 文件：`packages/shared/src/session-selectors.ts`、`packages/desktop/src/renderer/App.tsx`
  - 改动：`removedCount > 0` 时将完成态展示收口为 `Context compacted · N messages`；`N messages removed` 不再作为主 UI 文案。
  - 验证：selector 单测覆盖 legacy payload、manual compacted、manual skipped。

- [x] T2.2 保持持久化事实不变
  - 文件：`packages/shared/src/session.ts`
  - 改动：若类型无需变化，不改契约；只确认 `removedCount` 仍作为事实字段保存。
  - 验证：shared typecheck；不引入迁移。

### M3 测试与 fixture

- [x] T3.1 更新组件测试
  - 文件：`packages/desktop/src/renderer/test/compact-command-block.test.tsx`
  - 改动：覆盖 running 无图标无卡片、completed divider 文案、skipped divider、failed 可读。
  - 验证：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/compact-command-block.test.tsx`

- [x] T3.2 更新 streaming 测试
  - 文件：`packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
  - 改动：断言 `/compact` 仍不调用 `runTurn`，finished 后显示新的 divider 文案。
  - 验证：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/app-streaming-user-message.test.tsx`

- [x] T3.3 更新 mock fixture
  - 文件：`packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
  - 改动：把示例完成态文案改成 `Context compacted · 18 messages`，running 示例保持无文字动效。
  - 验证：浏览器 mock 可直接看到新样式。

### M4 验证与收尾

- [x] T4.1 工程验证
  - 命令：
    - `pnpm --filter @actspace/shared typecheck`
    - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/compact-command-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
    - `pnpm --filter @actspace/desktop typecheck`
    - `git diff --check`

- [x] T4.2 前端视觉验收
  - 入口：浏览器 mock `http://127.0.0.1:5288/`。
  - 检查：
    - running 不显示方框、图标、spinner 或文字动效。
    - running 进度条与中间内容列 / Composer 输入框宽度对齐，390px 窄屏不横向溢出。
    - completed 显示独立 divider：`Context compacted · N messages`。
    - 默认 / system 主题下文字、细线、进度条可读；组件颜色走语义 token。真实 Electron 窗口未在本轮启动。

- [x] T4.3 History 与计划归档
  - 文件：`docs/histories/YYYY-MM/...`、`docs/exec-plans/README.md`
  - 改动：实现完成后记录改动与验证；计划完成后移动到 `docs/exec-plans/completed/` 并更新 active/completed 列表。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared typecheck`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/compact-command-block.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
  - `pnpm --filter @actspace/desktop typecheck`
  - `git diff --check`
- 手工检查：
  - 输入 `/compact`，确认消息流出现独立 running 系统段和完成 divider。
  - 刷新会话后，持久化的 `context_compaction` 仍恢复为独立 divider。
  - 构造短会话 skipped，确认 `Nothing to compact` 也以 divider 显示。
- 观测检查：
  - `session.jsonl` 仍只有 `context_compaction` / `context_snapshot` 事实事件，不新增普通 `/compact` user message。
  - `logs/agent-runs/*.jsonl` 中 compaction 记录仍可追踪。

## 进度记录

- [x] 2026-06-04：确认视觉方向：Context Compaction 是独立 timeline item；running 为稳定文字 + 进度条；completed 为 `Context compacted · N messages` divider；不使用图标、卡片、pill 或文字动效。
- [x] 2026-06-04：已更新 `docs/design-docs/front-中间消息区规范.md`，把该 UI 决策写入设计事实。
- [x] M1 组件视觉重构：`CompactCommandBlock` 已移除图标/卡片/pill，running 改为稳定文字 + 3px 进度条，completed/skipped/failed 改为独立 divider。
- [x] M2 文案与数据映射：恢复态和流式态均使用 `Context compacted · N messages`；`removedCount` 仍保留为事实字段，不改 IPC / session 契约。
- [x] M3 测试与 fixture：更新组件测试、streaming 测试、shared selector 测试和 mock fixture。
- [x] M4 验证与收尾：完成 targeted tests、typecheck、颜色扫描、`git diff --check` 和浏览器 mock 验收。
- [x] 2026-06-04：浏览器 mock 通过 `http://127.0.0.1:5288/` 验收默认/system 主题与 390px 窄屏：`context_compaction` 有独立 block，completed 有 `role="separator"`，running 有 `role="progressbar"`，两态 `svg` 数量均为 0，390px 下无横向溢出。受 Browser 只读页面脚本限制，未直接强制切换 `data-theme="dark"`；组件颜色均使用语义 token，system dark computed style 可读。

## 决策记录

- 2026-06-04：完成态采用 `──────── Context compacted · N messages ────────` 风格 divider。原因是压缩是消息流里的上下文边界事件，应该可感知但不应伪装成 assistant 正文或用户消息。
- 2026-06-04：running 文本不做 opacity pulse、扫光或 `...` 动画。原因是进度条已经承担动态反馈，文字再动会干扰聊天阅读流。
- 2026-06-04：不使用图标。原因是当前消息流里的 Read / Thinking / Listed 等工具语法已经趋向纯文本，Context Compaction 也应与这套克制语言对齐。
