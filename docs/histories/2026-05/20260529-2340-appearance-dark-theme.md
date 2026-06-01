# 外观页 · 深色主题专项（计划 B）

## 用户诉求

在计划 A（字体 + 缩放）落地后，继续执行计划 B：让桌面端支持 **浅色 / 深色 / 跟随系统** 三态主题，并在「设置 → 外观」提供切换。核心是把散落在 renderer 各组件里的硬编码颜色收口成语义 token，使主题只需覆盖一组 `--act-color-*` 即可整体翻转，并同步 Electron 原生 chrome（交通灯 / 滚动条）。

## 设计动机

- Tailwind v4 `@theme inline` 已把语义 `--color-*` 映射到 `--act-color-*`。只要组件统一用语义类（`bg-surface` / `text-text-main` / `border-line`），深色覆盖 `--act-color-*` 即自动翻转——问题全在散落的字面量（`bg-white` / `bg-[#xxx]` / `text-[#xxx]` / `rgba()`）。因此主线工作是「等价替换」：浅色值不变，只把字面量换成 token。
- 三态用 `data-theme` 驱动：`light` / `dark` 走 `:root[data-theme=...]` 覆盖块；`system` 用 `:root[data-theme="system"]` 下的 `@media (prefers-color-scheme: dark)`，让 CSS 自身随 OS 切换，无需 JS 监听 matchMedia 重应用。
- 原生交通灯 / 系统滚动条不受 CSS token 控制，须经 `nativeTheme.themeSource` 同步：新增 `appearance:set-theme` IPC，`applyAppearance` 在写 `data-theme` 的同时调 `setNativeTheme(mode)`。
- 数据可视化色（图表色板、阶段色、状态点）不能一律映射成中性 token：抽成 `--act-chart-series-*`（浅深各一组）或保留半透明字面量（叠加在任意背景上都成立），并对热力图等关键对比加显式 `dark:` 变体。

## 主要改动

- **token 地基**：`tokens.css` 在浅色 `:root` 外新增 `:root[data-theme="dark"]` 覆盖块与 `:root[data-theme="system"] @media(prefers-color-scheme: dark)`；补齐 `danger/success/warm` 的 `*-soft` 背景与 `on-*` 前景、`surface-raised` / `overlay` / `focus-ring` / `selection` / `hover-overlay`、`--act-chart-series-1..6`、`--act-gradient-surface-fade` 等语义 token。`tailwind.css` 增补这些 token 的 `@theme inline` 映射，并新增 `dark:` 自定义 variant（对齐 `data-theme="dark"` 与 system 下的 `prefers-color-scheme`）。
- **CSS 文件收口**：`base.css`（focus ring / selection）、`electron.css`（chrome 按钮 hover）、`markdown.css`（引用 / 行内码 / 代码块 / 链接 / 表格 / hr）、`diff.css`（增删 / 流式）全部改用语义 token。
- **组件收口**（16 个文件）：状态色 / 中性面（`SettingsPage`/`SettingsPrimitives`/`SettingsNav`/`ConversationView`/`UserMessage`/`ToolLogLine`/`RightPanel`/`Sheet`/`BashRunBlock`/`KairosContextSheet`）+ 图表 / 渐变 / 阴影（`UsageStatisticsPage`/`KairosPage`/`KairosRightPanelView`/`Composer`/`LabPage`）。`ContextPopup` 与 `ToolLogLine` 的反色深色 tooltip 有意保留为主题无关的暗色元素。
- **主题装配与切换**：`appearance/types.ts` 增 `ThemeMode` 与 `theme` 字段（默认 `system`）；`storage.ts` 加载校验回落 `system`；`apply.ts` 写 `data-theme` 并调 `setNativeTheme`。`SettingsPage.tsx` 的 `AppearanceSection` 主题组改为三态分段控件 `ThemeSegmented`（浅色 / 深色 / 跟随系统，带图标）。`main.tsx` 开机重放防 FOUC。
- **原生同步**：`main/index.ts` 注册 `appearance:set-theme` → `nativeTheme.themeSource`；`preload/index.ts` 暴露 `setNativeTheme`；`global.d.ts` 补类型。
- **测试**：`appearance.test.ts` 增 `theme` 字段与 apply 写 `data-theme` / 调 `setNativeTheme` 断言；`settings-page.test.tsx` 增主题切换用例（断言 `data-theme` + `setNativeTheme` + localStorage 持久化）；`app-streaming-user-message.test.tsx` stub 补 `setNativeTheme`。

## 验证

- `pnpm --filter @actspace/desktop typecheck` 通过；`test` 全绿（16 文件 / 145 用例）。
- 浏览器 mock 逐页双主题对比：
  - 会话页（含 Composer / Bash 块 / Diff / 审查按钮 / 附件）、Usage、Lab：浅深双态均正常，无浅色残留；浅色态零回归。
  - 设置 → 外观：点击「深色」整页即时翻转，CDP 确认 `data-theme="dark"` 且 `localStorage.actspace.appearance.v1` 持久化 `theme:"dark"`；切回「跟随系统」恢复。
- 待用户在 Electron 真实环境验证：原生交通灯 / 系统滚动条随主题切换、「跟随系统」随 macOS 外观切换、重启保持，以及 Kairos 完整面板（mock 下 `window.kairos` 未暴露，仅「桥未就绪」卡可见）与 Usage 图表 / 热力图（mock 无数据）的双主题表现。

## 修订（同轮跟进，应用户反馈）

用户在 Electron 真实环境发现 Usage 页「TOKEN 总数」hero 大数字在深色态仍是黑字（看不见），并要求把「颜色必须随主题翻转」沉淀成约束未来的规范文档。

- **修 bug**：`UsageStatisticsPage.tsx` hero 数字 `text-black` → `text-text-main`（收口时遗漏，因 `text-black` 不在 `text-[#...]` grep 模式内）。顺带排查同类：`LabPage.tsx` 加号按钮 `hover:bg-black/[0.04]`（深色下几乎不可见）→ `hover:bg-[var(--act-color-hover-overlay)]`。其余 `text-white` 均在品牌底/反色元素上，属合法例外。
- **新增规范**：`docs/design-docs/front-主题与配色规范.md`——三态主题机制 + 「禁止 `text-black`/`bg-white`/`#hex` 等非主题感知字面量」硬约束 + 6 类合法例外 + 自检清单（含 `rg` 自查命令）+ 浅/深双主题验收要求。
- **导航接入**：`AGENTS.md`（前端区，标「改任何带颜色的样式前必读」）、`docs/FRONTEND.md`、`docs/design-docs/front-index.md`、`全局视觉语言规范.md`（色彩原则新增「主题与暗色（硬约束）」小节）均加指针。
- typecheck + 145 用例仍全绿。该 hero 数字需真实数据才渲染，浏览器 mock 为空状态无法复现，但属与其它 hero 数字一致的 1:1 token 替换。

## 最关键受影响文件

- `packages/desktop/src/renderer/styles/{tokens,tailwind,base,markdown,diff,electron}.css`
- `packages/desktop/src/renderer/appearance/{types,storage,apply}.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`（`ThemeSegmented`）
- `packages/desktop/src/main/index.ts`、`src/preload/index.ts`、`src/global.d.ts`
- 收口重灾区：`pages/KairosPage.tsx`、`components/{UsageStatisticsPage,LabPage,Composer}.tsx`、`components/kairos/KairosContextSheet.tsx`、`components/right-panel/KairosRightPanelView.tsx`
