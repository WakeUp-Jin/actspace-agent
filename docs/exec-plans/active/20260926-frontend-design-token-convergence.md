# 前端设计 token 收口与视觉修复

> 状态：2026-09-26 T0 对比 demo 已完成，等待用户确认 D1–D5；确认前不改代码。

## 目标

把规范里已经定好、但代码里还写死的数值（字号、圆角、z-index、阴影、内容宽度、动效时长）全部变成 token，修掉审查中确认的几处可见视觉问题，补上 `Button` / `IconButton` 两个基础组件，并用检查脚本防止回流。做完后：

- 浅色、深色主题下，消息卡片、用户消息卡、Composer 的左右边缘对齐，工作台里没有常驻的大阴影和冷蓝灰阴影。
- 窗口右上角和设置页顶部不再出现孤立的横线。
- renderer 组件里不再有 `text-[Npx]`、`rounded-[Npx]`、`z-[N]`（N≥3）和 `rgba(31,45,61,…)`，新增时 `pnpm check:frontend-tokens` 会失败。
- 设置页和审批卡的按钮来自同一个 `Button` 组件。

## 来源

2026-09-25 前端设计审查（对话内报告，结论已在本节和"问题清单"固化，执行时不需要回看对话）。2026-09-26 在当前 HEAD（`fd73999`，设置中心改版已合入）上重新核对了全部数字。

## 问题清单（2026-09-26 核对值）

| # | 问题 | 证据 | 成因 |
|---|---|---|---|
| 1 | 右上角面板开关下有一截孤立横线；设置页顶部有一条贯穿全宽的白色空条和底线 | 截图确认；`styles/electron.css:82-86` `.chrome-right` 常驻 `box-shadow: inset 0 -1px`；`components/settings/SettingsPage.tsx:305-311` 在 `bg-surface` 外壳里渲染了空的 `window-chrome-bar` | 分隔线画在 chrome 列上而不是右侧面板上；面板收起时这一列只剩 34px |
| 2 | 字号写死 535 处，另有 74 处 Tailwind 默认 `text-sm`(14px)/`text-xs` | 12px 208、13px 168、11px 100；小于 11px 的 15 处（10px 14、9px 1）；规范外 15/17/18/22/11.5/12.5px 共 29 处 | 规范的 `--text-*` 从未映射进 `styles/tailwind.css` 的 `@theme`；Tailwind 的 `text-sm`=14px 和规范 sm=13px 同名不同值 |
| 3 | 按钮样式常量 45 份，无公共 Button | `SettingsPage.tsx:68-75` 的 `BTN_*`（h-8）、`ProviderSettings.tsx:536` 删除按钮（h-9、hover 只降透明度）、`CustomModelForm.tsx:95`（h-9）、`ApprovalParts.tsx` 另一套 | `front-基础组件封装规范.md` 计划的 `components/ui/Button.tsx` 未实现 |
| 4 | Composer 圆角 22px/18px 并带 `0 18px 48px` 大阴影；用户消息卡带阴影 | `Composer.tsx:134/136`、`UserMessage.tsx:7`、`ConversationView.tsx:63`；截图中 Composer 与同宽的用户消息卡（12px）圆角明显不一致 | 换主题时只迁移了颜色；规范要求 Composer 只靠 surface + 细边框 |
| 5 | 阴影色仍是旧蓝色主题的冷蓝灰 `rgba(31,45,61)`，13 处 | `tokens.css:148-149` 两个阴影 token 本身，另 11 处在 Composer、UserMessage、ConversationView、SettingsPrimitives、UsageStatisticsPage | 阴影写在 rgba 里，`check:frontend-theme` 不覆盖 |
| 6 | 消息块比 Composer 和用户消息卡窄 80px | fixture 截图：审批行"未执行"标记止于约 1040px，Composer 右缘 1160px；5 个文件写死 `max-w-[800px]`（AgentRunBlock、ApprovalParts、AssistantReply、BashRunBlock、ThinkingBlock），内容列是 `--conversation-content-width: 880px` | 块宽度没有 token，各块沿用旧值 |
| 7 | z-index 18 个离散值，Tooltip/HoverCard（200）低于 Sheet（1000） | 见"z-index 分层"表 | 没有层级约定 |
| 8 | 圆角写死 41 处 | 10px 12（设置内嵌分组，用户 2026-09-25 批准的 10px）、7px 10、其余 2/3/5/6/8/9/14/18/22px | 批准的 10px 没有 token，其他为历史遗留 |
| 9 | 减少动态效果只处理了工具行扫光 | `styles/base.css:162`；会话状态无限脉冲、`rise-in`、`active:scale` 未处理；时长有 100/130/140/150/200/300ms | 没有全局兜底 |
| 10 | 28 处 `outline-none` 同一 className 内没有 `focus-visible` 替代 | `grep -rn "outline-none" … \| grep -v focus-visible` | 历史代码；需逐条判断是否由父级 `focus-within` 提供焦点环 |

## 范围

- 包含：
  - `apps/desktop/src/renderer/styles/tokens.css`、`tailwind.css`、`base.css`、`electron.css` 的 token 与全局规则。
  - renderer 下所有 `.tsx`/`.ts`（不含 `test/`）中字号、圆角、z-index、阴影、动效时长写死值的替换。
  - 问题 1、4、5、6 的视觉修复；问题 10 的逐条修复。
  - 新增 `components/ui/Button.tsx`、`components/ui/IconButton.tsx`，迁移设置中心与审批卡的按钮。
  - 新增 `scripts/check-frontend-design-tokens.mjs`、`pnpm check:frontend-tokens`，接入 `scripts/check-repo-hygiene.sh`。
  - 设计文档同步：`front-全局视觉语言规范.md`、`front-主题与配色规范.md`（阴影段）、`front-基础组件封装规范.md`、`front-tailwind-style-architecture.md`。
- 不包含：
  - `DropdownMenu`、`Switch`、`Textarea`、`Tabs`：仍由 `active/frontend-ui-components-foundation.md` 负责。
  - 间距写死值（`p-[7px]`、`gap-[9px]` 等）：记入 `tech-debt-tracker.md`，本计划不动。
  - `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部的 px 字号：只列清单记入技术债。
  - `components/LabPage.tsx`：v1 遗留页（主题规范已声明不属于当前契约），加入检查脚本 allowlist，不迁移。
  - Composer 的交互、布局和菜单逻辑；消息块的信息结构。
  - `apps/site/`（官网改版计划正在进行）。

## 背景

- 必读：`AGENTS.md`、`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`front-全局视觉语言规范.md`、`front-tailwind-style-architecture.md`、`front-基础组件封装规范.md`、`docs/coding-standards/team/frontend-style-scope-conventions.md`。
- 视觉 fixture（`pnpm --filter @actspace/desktop dev:renderer` 或已运行的 `pnpm dev` 的 5173 端口，路径前缀 `/src/renderer/test/fixtures/`）：`tool-stream-typography-preview.html`、`reply-completion-preview.html`、`settings-preview.html?section=…&theme=…`、`model-settings-preview.html`、`usage-preview.html`、`extensions-preview.html`、`chinese-ui-preview.html`、`custom-reasoning-preview.html`、`english-learning-preview.html`；主入口 `/` 可看空会话。
- 截图工具：本机已有 Playwright 缓存的 `~/Library/Caches/ms-playwright/chromium_headless_shell-*/…/chrome-headless-shell`，用 Node 22 自带 `WebSocket` 走 CDP 即可，不新增依赖。
- 已知约束：
  - 2026-09-26 另一轮 Chat / Composer 改动尚未提交（`docs/histories/2026-09/20260926-0815-chat-composer-inline-context-usage.md`、`20260926-0900-composer-plus-menu-form-switch.md`），涉及 `App.tsx`、`Composer.tsx`、`ConversationView.tsx`、`WorkbenchLayout.tsx` 及对应测试。**这四个文件在那轮提交前一律不改**；受影响的是 T3（`ConversationView.tsx:63` 阴影）、T5、T7/T8 中这些文件的部分、T10（`WorkbenchLayout.tsx` 的 `z-[50]`）。每个任务开工前运行 `git status --short apps/desktop/src/renderer/{App.tsx,components/Composer.tsx,components/ConversationView.tsx,components/WorkbenchLayout.tsx}` 确认。
  - 设置中心 10px 内嵌分组是用户批准的设计（见 `completed/20260925-settings-visual-redesign.md`），只做 token 化，不改数值。
  - 审批卡的 26px/28px 按钮高度、12px+16px+8px=36px 的悬挂缩进是批准的设计，不改。

## 审查条目覆盖表

2026-09-25 审查报告的每一条在本计划中的去向。"未覆盖"项需要用户决定是否纳入，执行者不得自行扩大范围。

| 审查条目 | 去向 |
|---|---|
| P0-1 基础组件缺失、45 份按钮常量 | **部分覆盖**。T12 只做 `Button` / `IconButton`，只迁移设置中心（`SettingsPage`、`ProviderSettings`、`CustomModelForm`）和 `ApprovalParts`。其余按钮常量（Composer 12、Sidebar 4、PreviewSourceToggle 4、ConversationTurnRail 3、WorkspaceChromeControls 2、ReplyHtmlRenderView 2、SubAgentTranscriptModal 2 等）以及 `DropdownMenu` / `Dialog` / `Switch` / `Tabs` 归 `active/frontend-ui-components-foundation.md`，本计划不迁移 |
| P0-2 字号无 token | T6、T7、T8、T13，完整覆盖 |
| P1-3 右上角横线 | T2 |
| P1-4 Composer 圆角 / 阴影、用户卡阴影 | T3、T5（D1、D2、D5） |
| P1-5 消息块与 Composer 不对齐 | T4（D3） |
| P1-6 设置页顶部空带 | T2 |
| P1-6 设置导航分组标签 10px 大写 | 已由设置中心改版（`fd73999`）修复，不再处理 |
| P1-6 `CustomModelForm.tsx:60/93`、`SettingsPage.tsx` 连接状态块仍是"边框卡片"分组 | **未覆盖**。设置改版计划把表单内部列为范围外；是否改成内嵌分组需要用户决定 |
| P2-7 z-index | T10 |
| P2-8 圆角 | T9 |
| P2-9 减少动态效果、时长 | T11 |
| P2-10 `outline-none` 缺焦点环 | T12 内逐条处理 |
| P2-11 标题栏 `Activity` 波形图标（`SessionViewToggle.tsx:30`，实为"对话 / 轨迹"切换）含义不明 | **未覆盖**。需要设计决定（加文字 / 分段控件 / 换图标），可在 T0 demo 追加一块或另起小任务 |
| 间距写死值（`p-[7px]`、`gap-[9px]` 等） | 不做，T14 记入 `tech-debt-tracker.md` |
| `markdown.css` / `diff.css` / `tool-result.css` / `web-tool.css` 内 px 字号 | 不做，T14 记入技术债 |

## 需要用户确认的视觉决定（T0 demo 里对比）

| 决定 | 默认方案（未确认前按此写 demo） | 备选 |
|---|---|---|
| D1 Composer 圆角 | 会话中和初始状态统一 12px（`rounded-act-lg`），与用户消息卡一致 | 保留大圆角，新增 `--act-radius-composer` 统一为 16px |
| D2 常驻阴影 | 去掉 Composer、用户消息卡的阴影，只保留边框；浮层（popover/dialog/sheet）保留 | 保留 Composer 一道极轻阴影 `0 1px 2px` |
| D3 消息块宽度 | 新增 `--conversation-block-max-width`，等于内容列 880px，5 类消息块左右与 Composer 对齐 | 保持 800px，但让 Composer 和用户卡也收到 800px |
| D4 小于 11px 的字号 | 全部提到 11px | 逐处保留 10px 并在规范中加一档 |
| D5 Composer 输入字号（`Composer.tsx` `COMPOSER_INPUT_CLASS` / `COMPOSER_INITIAL_INPUT_CLASS`，现状 15px） | 16px，规范「Composer 输入：16px」 | 14px；或保留 15px 并在规范加一档 |

## z-index 分层

执行时以此表为准，在 `tokens.css` 定义，组件用 `z-(--act-z-*)` 消费。组件内部的局部叠放（`z-[1]`、`z-[2]`）改用 Tailwind 内置 `z-1`/`z-2`，不进分层。

| token | 值 | 现有使用点（当前值） |
|---|---:|---|
| `--act-z-pane` | 30 | SplitView 拖拽柄（32） |
| `--act-z-chrome` | 60 | `.window-chrome-bar`（electron.css 60）、RightPanel tabs 行（61，改为 `calc(var(--act-z-chrome) + 1)`） |
| `--act-z-dropdown` | 80 | RightPanel（70）、ReplyHtmlRenderView（70）、RightPanelObjectMenu（70）、Sidebar（80/81/90）、WorkspaceChromeControls（90）、OpenInAppMenu（95）、WorkbenchLayout（50，执行时确认用途后归入 pane 或 dropdown） |
| `--act-z-overlay` | 100 | ReviewWorkspace（100）、ReviewToolbar（120） |
| `--act-z-modal` | 150 | SettingsPage（120/130/150）、WorkspaceChromeControls（120/150）、ProviderSettings（160）、OpenRouterModelCatalogDialog（160）、Sheet（1000） |
| `--act-z-popover` | 200 | Tooltip、HoverCard、SettingsPrimitives 的 portal 菜单（200/210） |
| `--act-z-system` | 1000 | ShutdownOverlay |

Sheet 从 1000 降到 modal 层后，Sheet 内的 Tooltip 才能显示在它上面。执行前在 Sheet 里悬停一个带 Tooltip 的按钮，确认目前 tooltip 是否被遮住，把结果写进执行过程文档。

## 任务

每个任务结束都跑 `pnpm --filter @actspace/desktop typecheck` 和 `pnpm check:frontend-theme`；涉及渲染的任务加跑相关测试（`pnpm --filter @actspace/desktop test -- <文件>`）。

### 阶段 0：基线

**T0 对比 demo。** 已建 `docs/design-docs/frontend/design-token-convergence-demo.html`：原尺寸还原，"现状 / 修改后"原地切换（空格键），浅 / 深 / 跟随系统可切换；四块内容为会话中（D1/D2/D3）、新会话（D1/D2/D5）、窗口顶部 chrome（问题 1）、小于 11px 的字与浮层阴影（D4、T3）。右下角「你的决定」可选备选方案并复制结论。用户确认后，把 D1–D5 的结论写进本文"决策记录"。

**T1 样式快照工具。** 在 `docs/exec-runs/20260926-frontend-design-token-convergence/tools/style-snapshot.mjs` 写一个 CDP 脚本：打开上面列出的全部 fixture（浅、深各一次），对每个可见元素按 DOM 路径记录 `font-size`、`line-height`、`font-weight`、`border-radius`、`box-shadow`、`z-index`、`transition-duration`，输出 JSON；另一个参数模式对比两份 JSON 并列出差异。同时保存每个 fixture 的整页截图到 `before/`。
验证：对未修改的代码连续跑两次，差异为 0。

### 阶段 A：可见问题（小改动，先做）

**T2 chrome 横线（问题 1）。**
- `styles/electron.css`：删除 `.chrome-right` 的 `box-shadow`。右侧面板打开时，`RightPanel.tsx:64` `RIGHT_TABS_CLASS` 自带的 `border-b border-line` 已经画出同一位置的线。
- `components/settings/SettingsPage.tsx:305`：外壳由 `bg-surface` 改为与导航列一致的布局——导航列和内容区各自延伸到窗口顶部（内容区用 `pt-[var(--window-chrome-strip-height)]`），顶部不再有独立色带。
- 验证：主界面右侧面板开 / 关、窗口 820px 以下 compact 模式、设置页，浅深各截图；右侧面板打开时 tab 行下方仍有且只有一条线。

**T3 阴影 token（问题 5）。**
- `tokens.css:148-149` 浅色值改为 `0 18px 48px rgba(20, 21, 18, 0.08)` 与 `0 24px 64px rgba(20, 21, 18, 0.14)`（规范给定的暖色基底）。
- 新增 `--act-shadow-xs: 0 1px 2px rgba(20, 21, 18, 0.06)`（小按钮、Toggle 滑块）与 `--act-shadow-thumb: 0 4px 12px rgba(20, 21, 18, 0.08)`（附件缩略图），light / dark / system-dark 三个分支都写，映射到 `tailwind.css` 的 `shadow-act-xs` / `shadow-act-thumb`。
- 11 处组件内 `shadow-[…rgba(31,45,61…)]` 按用途换成 `shadow-act-xs` / `shadow-act-thumb`；`UserMessage.tsx:7` 与 `ConversationView.tsx:63` 的卡片阴影按 D2 处理。`Composer.tsx` 的 5 处等 Composer 解锁后做。
- 验证：`grep -rn "31, *45, *61" apps/desktop/src/renderer --exclude-dir=test` 无结果；截图对比。

**T4 消息块宽度（问题 6）。** `tokens.css` 新增 `--conversation-block-max-width`（值按 D3），5 个文件的 `max-w-[800px]` 改为 `max-w-[var(--conversation-block-max-width)]`。
验证：`tool-stream-typography-preview.html` 截图中审批行右缘、用户消息卡右缘、Composer 右缘对齐（量像素）；375px 窄列无横向滚动。

**T5 Composer 圆角与阴影（问题 4，需 Composer 解锁）。** `Composer.tsx:134/136` 按 D1、D2 修改；同文件 5 处冷色阴影按 T3 规则替换。
验证：`tool-stream-typography-preview.html`（会话中）与主入口空会话（初始状态）浅深截图；Composer 聚焦、拖入附件、打开 `/` 菜单时视觉正常。

### 阶段 B：字号 token（问题 2）

**T6 定义字号 token。** 沿用仓库 `rounded-act-*`、`shadow-act-*` 的命名方式，在 `tailwind.css` `@theme` 中新增：

```css
--text-act-xxs: 11px;
--text-act-xs: 12px;
--text-act-sm: 13px;
--text-act-md: 14px;
--text-act-lg: 16px;
--text-act-xl: 20px;
--text-act-title: 24px;
```

不改 Tailwind 默认的 `text-sm` 等（避免同名不同值继续误导），而是在 T13 里禁止使用它们。
验证：`pnpm --filter @actspace/desktop build` 后在产物 CSS 中检查 `.text-act-sm` 的声明。如果 Tailwind 为它生成了 `line-height`，而原来的 `text-[13px]` 只生成 `font-size`，就给每档加 `--text-act-*--line-height: inherit` 或改用其他方式，直到 T7 的快照对比为 0 差异。

**T7 等值替换（零视觉变化）。** 写一次性脚本（放在 `docs/exec-runs/…/tools/`），只替换与规范完全相等的值：`text-[11px]→text-act-xxs`、`12→xs`、`13→sm`、`14→md`、`16→lg`、`20→xl`、`24→title`；Tailwind 默认 `text-xs→text-act-xs`、`text-sm→text-act-md`、`text-xl→text-act-xl`。跳过 `LabPage.tsx`；`Composer.tsx` 在解锁后单独跑。
验证：T1 快照对比，全部 fixture 的 `font-size`/`line-height` 差异为 0。

**T8 规范外字号（有视觉变化）。** 剩余 40 处（规范外共 44 处，LabPage 的 4 处不动）逐条处理，按以下规则，改完截图：
- 9/10px → 11px（D4）；11.5/12.5px → 12px；Composer 两处输入框 15px 按 D5，其余 15px → 14px；17/18px → 16px；22px → 20px。
- 数据展示数字（使用统计里 ≥28px 的大数字）保留写死值，加入 T13 allowlist，并在规范"字号"一节注明。
- 涉及文件（按数量）：SettingsPage 5、ProviderSettings 4、Composer 4（解锁后）、ModelSettings 3、CustomConnectionModels 3、SubAgentTranscriptModal 3、UsageStatisticsPage 2、SettingsPrimitives 2、OpenRouterModelCatalogDialog 2、ApprovalParts 2，其余 10 个文件各 1。
验证：`grep -rhoE "text-\[[0-9.]+px\]" apps/desktop/src/renderer --exclude-dir=test` 只剩 LabPage 和 allowlist 条目。

### 阶段 C：圆角、z-index、动效

**T9 圆角。** `tokens.css` 新增 `--act-radius-group: 10px`（设置内嵌分组，用户批准值）并映射 `rounded-act-group`；确认 `--act-radius-xl: 18px` 的使用点，D1 之后如无使用则删除。其余写死值映射：1/2/3px（细进度条、指示点）保留原值并加入 T13 allowlist；4px → `rounded-act-xs`；5/6/7px → `rounded-act-sm`；8/9px → `rounded-act-md`；14px → `rounded-act-lg`。
验证：快照对比，只有预期的圆角差异；设置页各 section 截图。

**T10 z-index。** 按"z-index 分层"表在 `tokens.css` 定义并替换全部使用点，`electron.css:46` 同步改为 `var(--act-z-chrome)`。
验证：手动检查 —— 设置页弹窗里打开下拉菜单；Sheet 内 Tooltip；Sidebar 右键菜单压在右侧面板上方；关闭应用时 ShutdownOverlay 在最上层。

**T11 动效。**
- `styles/base.css` 增加全局兜底：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

  用 0.01ms 而不是 `none`，保证依赖 `transitionend`/`animationend` 的逻辑仍会触发。
- 时长统一：100/120/130/140ms → `duration-(--motion-fast)`；150/160ms → `duration-(--motion-base)`；200/220ms → `duration-(--motion-slow)`；300ms 那一处确认用途后归入 slow。
验证：Chrome DevTools 或 CDP `Emulation.setEmulatedMedia` 设 `prefers-reduced-motion: reduce`，会话运行状态点不再脉冲、工具行扫光隐藏；搜索相关测试中对 `transitionend` 的等待仍通过。

### 阶段 D：Button / IconButton（问题 3、10）

**T12 基础组件。**
- `components/ui/Button.tsx`：`variant` = `primary`（墨色 action）/ `secondary`（surface + border）/ `ghost` / `danger`；`size` = `xs`（26px，审批行）/ `sm`（28px，审批卡）/ `md`（32px，设置与对话框）。统一 `focus-visible:ring-2 ring-focus-ring`、`disabled` 样式、`active:scale-[0.97]`（受 T11 兜底约束）。
- `components/ui/IconButton.tsx`：`label` 为必填 prop，同时生成 `aria-label` 和 Tooltip，从类型层面保证 `front-icon-button-tooltip-guidelines.md` 的要求。
- 迁移：`SettingsPage.tsx` 的 `BTN_*`、`ProviderSettings.tsx`（含 536 行删除按钮，改为 `danger`）、`CustomModelForm.tsx`、`ApprovalParts.tsx` 的 `ApprovalButton`（保持现有视觉，只改实现）。其他文件的按钮常量本计划不迁移，记录清单留给 foundation 计划。
- 同一轮处理问题 10：列出 28 处 `outline-none`，由父级 `focus-within` 提供焦点环的保持不变并在执行过程文档注明，其余补 `focus-visible:ring-2 focus-visible:ring-focus-ring`。
验证：新增 `test/ui-button.test.tsx`，覆盖 variant/size 类名、disabled、IconButton 缺 `label` 时的类型错误（`// @ts-expect-error`）与 tooltip 渲染；已有 `settings-page.test.tsx`、`approval-parts.test.tsx`、`provider-model-settings.test.tsx` 通过；键盘 Tab 走一遍设置页与审批卡，焦点环可见。

### 阶段 E：防回流

**T13 检查脚本。** 新增 `scripts/check-frontend-design-tokens.mjs`，扫描 `apps/desktop/src/renderer/**/*.{ts,tsx}`（不含 `test/`），对以下模式报错并给出文件和行号：
- `text-\[[0-9.]+px\]`，以及 Tailwind 默认字号 `\btext-(xs|sm|base|lg|xl|[2-9]xl)\b`
- `rounded(-[a-z]+)?-\[`
- `z-\[[0-9]+\]` 中大于 2 的值
- `rgba\(31, ?45, ?61`
- `duration-\[`

allowlist 采用"文件 + 精确匹配串"，与 `check-frontend-theme-colors.mjs` 的 `LITERAL_ALLOWLIST` 相同结构（LabPage、使用统计大数字、细指示条圆角）。根 `package.json` 加 `check:frontend-tokens`，`scripts/check-repo-hygiene.sh` 在 theme 检查后调用。新增 `scripts/test/frontend-design-tokens.test.mjs`：用临时文件验证每条规则能命中、allowlist 能放行。
验证：`pnpm check:frontend-tokens` 通过；在任一组件临时加 `text-[13px]` 能看到失败，删掉后恢复。

### 阶段 F：收尾

**T14 文档与验收。**
- 更新 `front-全局视觉语言规范.md`（字号节写明 `text-act-*` 类名，圆角节加 `group`，新增 z-index 分层节，阴影节改为已落地 token）、`front-tailwind-style-architecture.md`、`front-基础组件封装规范.md`（Button/IconButton 已落地）、`front-主题与配色规范.md`（阴影不再是例外来源）。
- `tech-debt-tracker.md` 记入：间距写死值、4 个 CSS 文件内的 px 字号、未迁移的按钮常量清单。
- 更新 `active/frontend-ui-components-foundation.md` 的进度：Button/IconButton 已由本计划完成。
- T1 快照 after 版本与 before 截图并排放进执行摘要；按 `FRONTEND_VERIFICATION.md` 在 Electron 窗口看主界面、长会话、设置页、右侧面板，浅 / 深 / 跟随系统三态。
- 写 history；判断是否满足 learning 条件（Tailwind v4 字号 token 的 line-height 行为若踩坑则写）。

## 顺序与并行

```text
T0 ─► T1 ─► T2 ─► T3 ─► T4 ─┐
                            ├─► T6 ─► T7 ─► T8 ─► T9 ─► T10 ─► T11 ─► T12 ─► T13 ─► T14
Composer 解锁后：T5、以及 T3/T7/T8 中 Composer 的部分（可插在任意阶段之后）
```

T2–T4 相互独立，可以分开提交。T7 必须在 T6 验证通过后才跑。T13 放在最后，前面各阶段清理完才能开启无基线的严格检查。

## 风险与回退

- 字号 codemod 改变行高：T6 先验证产物，T7 用快照对比兜底；出现差异就停下修 token 定义，不手工逐处补 `leading-*`。
- z-index 调整造成浮层互相遮挡：T10 的手动检查清单逐项过；单个浮层出问题只回退该组件的映射。
- `Button` 改变审批卡外观：审批卡迁移要求快照对比 0 差异，否则调整 Button 的 `xs`/`sm` 尺寸定义，而不是改审批卡。
- 与 Composer 在飞改动冲突：Composer 相关部分全部后置，不在它提交前碰这个文件。
- 每个任务单独提交，出问题可以按任务 `git revert`。

## 验证方式

- 命令：`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`、`pnpm check:frontend-theme`、`pnpm check:frontend-tokens`、`pnpm build`、`node --test scripts/test/frontend-design-tokens.test.mjs`。
- 浏览器 renderer：T1 工具对全部 fixture 做 before/after 快照与截图，浅深两套。
- Electron：收尾时按三态主题看主界面、长会话、设置页、右侧面板；没有 Computer Use 时请用户提供截图。

## 进度记录

- [x] 2026-09-26 审查结论在当前 HEAD 复核，写入问题清单。
- [x] 2026-09-26 T0 对比 demo 完成，headless Chromium 浅 / 深、现状 / 修改后与备选组合截图检查通过。
- [ ] D1–D5 由用户确认。
- [ ] T1 样式快照工具与 before 基线。
- [ ] T2 chrome 横线。
- [ ] T3 阴影 token。
- [ ] T4 消息块宽度。
- [ ] T5 Composer 圆角与阴影（待 Composer 解锁）。
- [ ] T6 字号 token。
- [ ] T7 等值替换。
- [ ] T8 规范外字号。
- [ ] T9 圆角。
- [ ] T10 z-index。
- [ ] T11 动效。
- [ ] T12 Button / IconButton 与焦点环。
- [ ] T13 检查脚本。
- [ ] T14 文档、Electron 验收、history。

## 决策记录

- 2026-09-26：字号 token 使用 `text-act-*` 命名，不覆盖 Tailwind 默认 `text-sm` 等。理由：与仓库已有的 `rounded-act-*`、`shadow-act-*` 一致；覆盖默认值会让熟悉 Tailwind 的人误判字号。代价：需要检查脚本禁止默认字号类。
- 2026-09-26：设置内嵌分组 10px 圆角作为具名 token `group` 保留，不并入 8px 或 12px。理由：该值是用户 2026-09-25 批准的设计。
- 2026-09-26：本计划只做 `Button` / `IconButton`，`DropdownMenu` / `Switch` / `Textarea` / `Tabs` 仍归 `frontend-ui-components-foundation.md`，避免两个计划同时改同一组件。
- 2026-09-26：审查子代理提出的"审批卡头部与正文未对齐""`size-4` 图标只有 4px"经复核为误判，不纳入。

## 执行模式

交互模式。T0 需要用户做视觉决定；T5 依赖另一轮 Composer 改动的提交时间。

## 执行文档

开工时创建 `docs/exec-runs/20260926-frontend-design-token-convergence/`，从 `docs/exec-runs/templates/` 复制 `execution-process.md` 与 `execution-summary.md`；T1 的工具和快照也放在这个目录下。
