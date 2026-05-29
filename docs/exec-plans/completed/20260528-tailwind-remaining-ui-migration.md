# Tailwind 剩余 UI 迁移调整计划

> 状态：已完成。2026-05-29 通过审计确认 Settings / Placeholder / Remaining Pages 无剩余普通 UI legacy selector，并完成全局 CSS 收口验收。

## 目标

在 Tailwind v4 基础设施、Usage Statistics 样板和 Lab V0 页面已经落地后，继续把 `packages/desktop/src/renderer` 的主要 UI 从 legacy 分区 CSS 迁移到“Tailwind utility + React UI primitive + 少量明确全局边界”的样式架构。

本计划是 `docs/exec-plans/completed/actspace-tailwind-style-architecture.md` 的实施型子计划，重点回答剩余页面按什么顺序迁、每个切片改哪些文件、如何验证、哪些全局样式暂不迁。

## 范围

- 包含：
  - 审计 `packages/desktop/src/renderer/styles/*.css` 与 renderer 组件中剩余样式所有权，按 UI 区域分组。
  - 迁移 RightPanel 与 Kairos compact 相关 UI 样式。
  - 迁移 Workbench shell 与 Sidebar 相关 UI 样式。
  - 迁移 Conversation messages、Tool previews 与 Composer 相关 UI 样式。
  - 迁移 Settings / Placeholder / 其他剩余普通页面样式。
  - 将重复视觉结构沉淀为小型 React UI primitives 或局部 class 常量。
  - 清理已经迁移切片对应的旧 CSS selector。
  - 补充 `docs/coding-standards/` 中的 Tailwind 书写约定。
  - 更新 history、TODO 和 Tailwind 架构文档状态。
- 不包含：
  - 不重做产品视觉方向，不引入新的品牌色或大面积主题变化。
  - 不引入 shadcn/ui 或 Radix 组件体系作为本轮迁移目标。
  - 不改变 Electron main / preload / IPC 契约。
  - 不改变业务数据流、session 存储、Kairos runtime 或 Lab runtime。
  - 不把 Markdown、代码块、diff、第三方 DOM 或 Electron drag primitives 强行 Tailwind 化。
  - 不一次性删除所有 legacy 分区文件；只有在所有迁移切片完成并验证后再移除对应 import。

## 背景

- Tailwind v4 已接入 `packages/desktop`，入口为 `packages/desktop/src/renderer/styles/index.css`。
- 当前样式入口已经收口为 `tokens.css`、`tailwind.css`、`base.css`、`electron.css`、`markdown.css` 和 `diff.css`，并通过 `base` / `chrome` / `components` layer 导入。
- Usage Statistics 已作为第一块完整 Tailwind 样板迁移。
- Lab V0 renderer mock 已使用 Tailwind utility + `LabPage.tsx` 局部 class 常量落地。
- 旧根部 `styles.css` 与 `legacy-*` 分区已经下线；Conversation / ToolLog / Composer、RightPanel shell/tabs、Workbench shell / Sidebar 已迁回组件，`markdown.css` 和 `diff.css` 作为明确内容边界保留。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend-ui/全局视觉语言规范.md`
- `docs/design-docs/frontend-ui/tailwind-style-architecture.md`
- `docs/exec-plans/completed/actspace-tailwind-style-architecture.md`
- `docs/learnings/2026-05/tailwind-page-slice-migration.md`

## 相关代码路径

- 样式入口：
  - `packages/desktop/src/renderer/styles/index.css`
  - `packages/desktop/src/renderer/styles/tokens.css`
  - `packages/desktop/src/renderer/styles/tailwind.css`
  - `packages/desktop/src/renderer/styles/base.css`
  - `packages/desktop/src/renderer/styles/electron.css`
  - `packages/desktop/src/renderer/styles/markdown.css`
  - `packages/desktop/src/renderer/styles/diff.css`
- 已迁移样板：
  - `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
  - `packages/desktop/src/renderer/components/LabPage.tsx`
- 待迁移重点：
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/right-panel/`
  - `packages/desktop/src/renderer/pages/KairosPage.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/SplitView.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/messages/`
- 测试：
  - `packages/desktop/src/renderer/test/sidebar.test.tsx`
  - `packages/desktop/src/renderer/test/kairos-page.test.tsx`
  - `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
  - `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
  - `packages/desktop/src/renderer/test/file-diff-block.test.tsx`
  - `packages/desktop/src/renderer/test/markdown-prose.test.tsx`

## 样式所有权规则

### Tailwind / React 负责

- 页面和组件布局。
- spacing、sizing、grid、flex。
- 字号、字重、行高、颜色。
- hover、active、selected、disabled。
- 响应式断点。
- 常规按钮、icon button、卡片、弹窗、tabs、table row、empty state。
- 同一文件内重复出现的 utility 组合可使用局部 class 常量。
- 跨 2 个以上页面重复、且语义稳定的结构可抽 React primitive。

### 全局 CSS 继续负责

- `html`、`body`、`#root` 和字体基础。
- scrollbar、focus-visible、selection。
- Electron chrome / drag / no-drag 基础边界。
- Markdown prose、code block、diff、第三方或非 React 控制 DOM。
- 复杂 keyframes 或必须跨组件共享的动画。
- 明确内容边界中的少量全局规则；普通 UI 不再新增 legacy 分区。

### 禁止做法

- 不用 `@apply` 把旧 `.sidebar-*`、`.message-*`、`.kairos-*` 逐条翻译一遍。
- 不让测试断言 Tailwind class。
- 不在组件里无节制增加新的 raw hex；优先用 `text-text-*`、`bg-surface`、`border-line` 等语义 token。
- 不在同一页面同时保留旧全局 selector 和新 Tailwind utility 两套事实来源。

## 风险

- 风险：Sidebar / SplitView 迁移影响 Electron hit-test、折叠、resize。
  - 缓解：Sidebar 切片单独执行，保留现有测试，必须做 Electron 真实窗口验证。
- 风险：Conversation / Composer 迁移影响消息滚动、输入框高度、流式消息显示。
  - 缓解：先补或复用 renderer 测试，再迁移；浏览器 mock 中验证发送区、附件区、长消息和工具块。
- 风险：Markdown / Diff 被 Tailwind Preflight 或全局清理破坏。
  - 缓解：Markdown / Diff 保留内容样式边界，迁移前后分别跑对应测试和视觉检查。
- 风险：JSX className 太长导致可读性下降。
  - 缓解：只抽稳定重复结构为局部 class 常量或小 primitive，不回退到大 CSS 文件。
- 风险：并行任务改动同一 UI 区域。
  - 缓解：每个切片在执行前确认 dirty files；若同一区域已有未合并改动，先缩小范围或暂停。

## 迁移顺序

### 0. 样式审计

- 扫描 `styles/*.css` 和组件局部 class 常量，按样式所有权输出分组：
  - Workbench / SplitView
  - Sidebar
  - Conversation / Messages
  - Composer
  - RightPanel
  - Kairos
  - Markdown / Diff / Tool previews
  - Base / keyframes / scrollbar / Electron chrome
- 为每组标记：
  - `migrate-now`：本计划内迁到 Tailwind。
  - `global-keep`：长期保留全局边界。
  - `legacy-until-slice`：待对应切片迁移后删除。
- 验证：
  - 生成审计记录到本计划的“进度记录”或单独 history。
  - 不改代码，只确认切片边界。

### 1. RightPanel / Kairos Compact 切片

优先迁移这块，因为近期改动多、历史 legacy 样式增长明显，且风险低于 Sidebar。

- 修改范围：
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/right-panel/`
  - 与右栏 compact view 直接相关的局部 renderer 组件。
  - legacy right panel / Kairos compact selector。
- 工作内容：
  - 将 right panel shell、tabs、empty state、compact Kairos rows 改为 Tailwind utility / 局部 class 常量。
  - 删除迁移后不再使用的 `.right-panel*`、`.kairos-compact*` selector。
  - 若同一按钮/卡片样式重复 3 次以上，抽小型局部 helper 或 primitive。
- 验证：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop test -- right-panel-kairos.test.tsx kairos-page.test.tsx`
  - Browser mock 打开右栏 Kairos 视图，确认 tabs、compact rows、滚动、空态无重叠。

### 2. Workbench Shell / Sidebar 切片

- 修改范围：
  - `WorkbenchLayout.tsx`
  - `SplitView.tsx`
  - `Sidebar.tsx`
  - `WindowChromeBar.tsx`
  - Workbench / Sidebar 组件局部 class 常量，以及历史 legacy shell selector 的剩余引用。
- 工作内容：
  - 将 shell grid、split pane、sidebar top actions、session row、workspace foldout 改成 Tailwind utility。
  - 保留或集中 Electron chrome / drag / no-drag 的基础 CSS 边界。
  - 删除迁移完成的旧 sidebar selector。
- 验证：
  - `pnpm --filter @actspace/desktop test -- sidebar.test.tsx app-streaming-user-message.test.tsx`
  - `pnpm --filter @actspace/desktop typecheck`
  - Browser mock 验证 sidebar 展开 / 折叠、Workspaces 折叠、See more / less。
  - Electron 真实窗口验证折叠按钮和 resize hit-test。

### 3. Conversation / Tool Preview / Composer 切片

- 修改范围：
  - `ConversationView.tsx`
  - `Composer.tsx`
  - `components/messages/`
  - Conversation、message、turn actions、composer、tool log、bash block 等普通组件局部 class 常量和剩余全局边界。
- 工作内容：
  - 将消息布局、turn actions、工具预览外壳、Composer 输入区和附件区迁到 Tailwind。
  - Markdown prose、code block、diff 内容样式暂时保留全局边界，不在本切片强迁。
  - 若 Bash / file diff 等工具块有明确稳定结构，可抽局部 primitive。
- 验证：
  - `pnpm --filter @actspace/desktop test -- app-streaming-user-message.test.tsx file-diff-block.test.tsx markdown-prose.test.tsx`
  - `pnpm --filter @actspace/desktop typecheck`
  - Browser mock 验证长消息、工具块、approval block、Composer 输入和附件区。

### 4. Settings / Placeholder / Remaining Pages 切片

- 修改范围：
  - `PlaceholderView.tsx`
  - Settings 相关组件。
  - 剩余未覆盖的普通页面级 selector。
- 工作内容：
  - 将低风险占位页、设置入口、空态和普通 panel 样式迁到 Tailwind。
  - 删除对应旧 selector。
- 验证：
  - `pnpm --filter @actspace/desktop typecheck`
  - 相关 renderer tests。
  - Browser mock 快速导航所有 sidebar 主入口。

### 5. 全局 CSS 收口

- 修改范围：
  - `styles/base.css`
  - `styles/index.css`
  - `styles/tailwind.css`
  - `docs/design-docs/frontend-ui/tailwind-style-architecture.md`
  - `docs/coding-standards/`
- 工作内容：
  - 把长期保留的 base、Electron、Markdown、Diff、keyframes 等边界移入更明确的 CSS 文件。
  - 保持 `styles/index.css` 不导入旧根部 `styles.css` 或任何 `legacy-*` 分区。
  - 保持旧根部 `styles.css` 删除状态，不让普通 UI 样式回流到全局入口。
  - 补充 Tailwind 编码约定：局部 class 常量、primitive 抽取、raw hex 使用边界、测试不绑定 class。
- 验证：
  - `pnpm typecheck`
  - `pnpm --filter @actspace/desktop build`
  - `pnpm --filter @actspace/desktop test`
  - Browser mock 全主入口导航。
  - Electron 真实窗口 smoke 验证。

## 验证矩阵

| 切片 | 必须命令 | 必须手工验收 |
| --- | --- | --- |
| RightPanel / Kairos Compact | `pnpm --filter @actspace/desktop typecheck`; `pnpm --filter @actspace/desktop test -- right-panel-kairos.test.tsx kairos-page.test.tsx` | Browser mock 打开右栏和 Kairos compact，无 console error |
| Workbench / Sidebar | `pnpm --filter @actspace/desktop test -- sidebar.test.tsx app-streaming-user-message.test.tsx`; `pnpm --filter @actspace/desktop typecheck` | Browser mock + Electron 真实窗口，确认 collapse / resize / hit-test |
| Conversation / Composer | `pnpm --filter @actspace/desktop test -- app-streaming-user-message.test.tsx file-diff-block.test.tsx markdown-prose.test.tsx`; `pnpm --filter @actspace/desktop typecheck` | Browser mock 验证长消息、工具块、Composer 和 approval block |
| Final cleanup | `pnpm typecheck`; `pnpm --filter @actspace/desktop build`; `pnpm --filter @actspace/desktop test` | Browser mock 全入口 + Electron smoke |

## 进度记录

- [x] Tailwind v4 基础设施已接入。
- [x] Usage Statistics 样板已迁移。
- [x] Lab V0 页面已按 Tailwind utility + 局部 class 常量落地。
- [x] 完成 `styles.css` 剩余 selector 审计：审计结果已在 `20260528-frontend-style-ownership-cleanup.md` M0 记录，旧根部 `styles.css` 已不再承载真实样式。
- [x] 完成 RightPanel shell / tabs 切片：`RightPanel.tsx` 已改为 Tailwind utility + 局部 class 常量，`legacy-right-panel.css` 已删除，tab no-drag contract 改由组件测试覆盖。
- [x] 完成 Workbench Shell 第一步：`SplitView.tsx` 和 `PlaceholderView.tsx` 已迁为 Tailwind 局部 class 常量，`legacy-shell.css` 中对应 `.split-view*` / `.placeholder-*` selector 已删除。
- [x] 完成 Workbench Shell 第二步：`Sidebar.tsx` 的外壳、顶部主入口和底部 Settings 已迁为 Tailwind 局部 class 常量，`legacy-shell.css` 中对应 `.sidebar` / `.sidebar-primary-*` / `.settings-entry` selector 已删除。
- [x] 完成 Workbench Shell / Sidebar 切片：`Sidebar.tsx` 已接管分组标题、会话行、Pin / Archive hover、See more 和 Workspace 文件夹头；后续全局收口已删除 `legacy-shell.css`。
- [x] 完成 Conversation / Composer 切片第一步：`ConversationView.tsx`、基础 message row（User / Assistant / Thinking / ToolLogLine）和 `Composer.tsx` 主体外壳已迁为 Tailwind 局部 class 常量；`legacy-conversation.css` 与 `legacy-composer.css` 顶部大段基础布局规则已删除。
- [x] 完成 Composer 浮层收口：model dropdown、model options、ContextPopup 已迁为组件内 Tailwind 局部 class 常量，`legacy-composer.css` 已删除并从 `styles/index.css` 移除。
- [x] 完成 Bash approval / execution 切片：`BashRunBlock.tsx` 已接管执行折叠行、输出面板、approval 卡片和操作按钮样式，`legacy-conversation.css` 中 `.bash-*` 视觉规则已删除；浏览器 mock computed style 确认按钮/输出字号、背景和边框符合组件 class。
- [x] 修正基础层导入：`styles/index.css` 改为 `@import "./base.css" layer(base);`，避免 `button { font: inherit; }` 等 base reset 在导入顺序上压过 Tailwind typography utility。
- [x] 完成 Conversation / Tool Preview / Composer 切片：`ToolLogLine.tsx` 接管 tooltip open / running / reduced-motion 样式，`FileDiffBlock.tsx` 复用组件侧工具行 running class，`ConversationView.tsx` 接管工具、思考和 diff 相邻消息压缩关系；`legacy-conversation.css` 已删除并从 `styles/index.css` 移除。
- [x] 完成 Settings / Placeholder / Remaining Pages 切片：审计确认 `PlaceholderView.tsx` 已使用 Tailwind 局部 class 常量，Sidebar Settings 入口已由 `Sidebar.tsx` 接管；当前没有独立 Settings 页面组件，也没有 `.settings-*` / `.placeholder-*` / `legacy-*` 普通 UI selector 残留。
- [x] 完成全局 CSS 收口并删除过渡 import：旧根部 `styles.css` 与 `legacy-*` 分区已下线，`styles/index.css` 仅导入 token、Tailwind、base、Electron chrome、Markdown 和 diff 边界。
- [x] 补充 coding standards Tailwind 书写约定。
- [x] 更新 history，并同步主 Tailwind 架构计划状态。

## 决策记录

- 2026-05-28：先迁 RightPanel / Kairos Compact，再迁 Sidebar。原因是 RightPanel / Kairos compact 近期新增全局 CSS 较多，收益明显且交互风险低；Sidebar 涉及 Electron hit-test 和 resize，需要单独切片和更强验收。
- 2026-05-28：Markdown / Diff / code block 暂不强迁 Tailwind。原因是这些区域属于内容渲染边界，受 Preflight 和模型输出影响更大，保留明确全局样式比 utility 化更稳。
- 2026-05-28：本计划不使用 `@apply` 批量翻译旧 selector。原因是 Tailwind 迁移目标是重切样式所有权，而不是把旧全局 CSS 换成另一种语法。
- 2026-05-29：Settings / Placeholder / Remaining Pages 作为审计型切片收尾。原因是 Placeholder 和 Settings 入口已经在前置 Workbench / Sidebar 切片中迁回组件，当前没有独立 Settings 页面或剩余普通页面级 selector 需要再迁移。
