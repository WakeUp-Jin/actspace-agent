# 外观页 · 深色主题专项（计划 B）

## 目标

让 actspace 桌面端支持**浅色 / 深色 / 跟随系统**三态主题，并在「设置 → 外观」提供切换。核心工作有两块：

1. **颜色 token 收口**：把散落在 renderer 各组件里的 **250+ 处硬编码颜色**（`bg-white` / `bg-[#xxx]` / `text-[#xxx]` / 渐变 / 阴影）替换为语义 token，使主题只需覆盖一组 `--act-color-*` 即可整体翻转。
2. **深色色板 + 切换机制**：定义深色 `--act-color-*`，按 `data-theme` 切换，「跟随系统」走 `prefers-color-scheme`；并通过 main 的 `nativeTheme` 同步交通灯按钮与原生滚动条。

## 范围

- 包含：
  - 扩充语义 token：新增状态色的 soft/前景变体（danger/success/warm 的 `*-soft` 背景与 `on-*` 前景）与少量缺失中性层，供徽标/提示块脱离硬编码。
  - `tokens.css`：在现有浅色 `:root` 之外，新增 `:root[data-theme="dark"]` 深色覆盖块；`:root[data-theme="system"]` 下用 `@media (prefers-color-scheme: dark)` 应用深色。
  - 全量收口 16 个文件的硬编码颜色 → 语义 token / Tailwind 语义类（见任务清单与映射规则）。
  - `tailwind.css` `@theme inline` 增补新语义 token 的映射。
  - renderer 外观偏好扩展 `theme` 字段并在 `applyAppearance` 里写 `data-theme`；开机重放。
  - main 侧 `nativeTheme.themeSource` 跟随主题（经一个 `appearance:set-theme` IPC 或复用现有桥），保证交通灯/系统滚动条不突兀。
  - 单测：主题 apply 写 `data-theme`、token 覆盖生效；浏览器 mock + Electron 双主题验证。
- 不包含：
  - 不改字体/字号（计划 A 已交付，本计划仅在其 `AppearancePrefs` 上加 `theme` 字段）。
  - 不引入高对比度 / 多套配色 / 主题自定义色板（仅浅、深两套色值）。
  - 不重排版式、不改组件结构，只改颜色与主题装配。

## 背景

- 必读文档（新会话 / 子 Agent 先读）：
  - `AGENTS.md`
  - `docs/FRONTEND.md` 与 `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend-ui/设置页规范.md`（外观章节）
  - `docs/design-docs/frontend-ui/全局视觉语言规范.md`
  - `docs/coding-standards/team/frontend-style-scope-conventions.md`
- 前置依赖：
  - **计划 A（`20260529-appearance-fonts-and-zoom.md`）必须先落地**：本计划复用其 `packages/desktop/src/renderer/appearance/{types,storage,apply}.ts` 模块与外观分区骨架。
- 相关代码路径：
  - token 与映射：`packages/desktop/src/renderer/styles/tokens.css`、`packages/desktop/src/renderer/styles/tailwind.css`、`base.css`、`markdown.css`、`diff.css`、`electron.css`
  - 硬编码颜色重灾区（含 `bg-white` / `bg-[#` / `text-[#` / `border-[#` / `#fff`，单文件命中计数）：
    - `components/kairos/KairosContextSheet.tsx`（66）
    - `components/right-panel/KairosRightPanelView.tsx`（36）
    - `components/UsageStatisticsPage.tsx`（29）
    - `components/settings/SettingsPage.tsx`（16）
    - `components/Composer.tsx`（11）、`components/ContextPopup.tsx`（11）
    - `pages/KairosPage.tsx`（95，含图表/进度条等装饰色，需谨慎）
    - `components/LabPage.tsx`（16）、`components/messages/BashRunBlock.tsx`（8）、`components/ui/Sheet.tsx`（8）
    - 其余各 1：`SettingsPrimitives.tsx`、`SettingsNav.tsx`、`UserMessage.tsx`、`RightPanel.tsx`、`ToolLogLine.tsx`、`ConversationView.tsx`
  - 主题装配：`packages/desktop/src/renderer/appearance/apply.ts`（计划 A 产物）、`packages/desktop/src/renderer/main.tsx`、`packages/desktop/src/main/index.ts`（`nativeTheme`）、`packages/desktop/src/preload/index.ts`、`global.d.ts`
- 已知约束：
  - Tailwind v4 `@theme inline` 把语义 `--color-*` 映射到 `--act-color-*`；**只要组件用语义类（`text-text-main`/`bg-surface`/`border-line`），深色覆盖 `--act-color-*` 即自动翻转**。问题全在硬编码字面量。
  - 部分硬编码是**装饰色/数据可视化色**（如 `KairosPage`/`UsageStatisticsPage` 的图表色板、渐变、阴影），不能一律映射到中性 token，需要单独评估：图表色板浅深各定一组、阴影深色下减弱不变蓝。
  - Electron 原生交通灯与系统滚动条不受 CSS token 控制，需 `nativeTheme.themeSource = "light"|"dark"|"system"` 同步。

## 数据模型与契约（以本节为准）

主题三态扩展进计划 A 的偏好对象（additive，向后兼容）：

```ts
// 追加到 packages/desktop/src/renderer/appearance/types.ts
export type ThemeMode = "light" | "dark" | "system";
// AppearancePrefs 增 theme: ThemeMode（DEFAULT_APPEARANCE.theme = "system"；loadAppearance 缺字段回落 "system"）
```

`applyAppearance` 增补：

```ts
const effective = prefs.theme; // "light" | "dark" | "system"
root.setAttribute("data-theme", effective);
window.actspace?.setNativeTheme?.(effective); // main nativeTheme.themeSource 同步
```

新增语义 token（`tokens.css` 浅色 `:root` 定义默认值，深色块覆盖；`tailwind.css` 映射）：

```
--act-color-danger-soft / --act-color-on-danger      // 红色提示块底/字（替换 bg-[#fdeaea] text-[#d04444] 等）
--act-color-success-soft / --act-color-on-success    // 绿色徽标
--act-color-warm-soft / --act-color-on-warm          // 橙色警示块
--act-color-surface-raised                            // 浮层/卡片更高一层背景（替换部分 bg-white / bg-[#fafbfc]）
--act-color-overlay                                   // 模态遮罩
--act-chart-series-1..6                               // 图表/可视化色板（浅深各一组）
```

深色色板基调（中性灰黑，参考 Cursor Dark；最终值在任务 1 定稿）：

```
--act-color-bg: #1a1b1e; --act-color-surface: #222428; --act-color-surface-subtle: #2a2c31;
--act-color-sidebar: #161719; --act-color-border: #34363c; --act-color-text: #e6e7ea; …
品牌蓝 --act-color-brand 深色下略提亮以保对比；danger/success/warm 取深色下可读的柔和底+亮前景。
```

## 任务拆分（按顺序）

### 任务 1：深色色板 + token 扩充（地基，不动组件）

- 文件：`tokens.css`、`tailwind.css`
- 新增上文语义 token 的浅色默认值；新增 `:root[data-theme="dark"]` 覆盖块与 `:root[data-theme="system"] @media(prefers-color-scheme: dark)`；`@theme inline` 映射新 token。
- 验证：手动给 `<html data-theme="dark">`，未收口的组件仍是浅色字面量（预期），但凡用语义类的区域（侧栏、会话、设置外壳）应整体变深且文字可读。`typecheck` 通过。

### 任务 2：状态色与中性面收口（低风险批量）

- 范围：徽标 / 提示块 / 次级背景这类语义明确的硬编码。
- 映射规则（全仓统一）：
  - `bg-white` → `bg-surface`；浮层卡片 `bg-white`（模态/popover）→ `bg-surface-raised`
  - `bg-[#fbfcfd]` / `bg-[#f7f8fb]` / `bg-[#f5f7f9]` / `bg-[#fafbfc]` → `bg-app-bg` 或 `bg-surface-subtle`（按层级）
  - 红：`text-[#d04444]`/`#b04014`/`#b45858` → `text-on-danger`；`bg-[#fdeaea]`/`#fdf0f0`/`#fff5f1` → `bg-danger-soft`
  - 绿：`text-[#2f9e5f]` → `text-on-success`；`bg-[#e7f6ec]` → `bg-success-soft`
  - 橙：`#d99a20`/`#946400` 系 → `warm` / `warm-soft` / `on-warm`
  - 灰字：`text-[#8b95a5]`/`#8a90a0`/`#8f96a3`/`#6c7281` → `text-text-faint` / `text-text-subtle`（按深浅）
  - 灰线：`border-[#dfe4ee]`/`#dce5f3`/`#d0d6dd`/`#bcc6d4` → `border-line` / `border-line-strong`
- 文件：`SettingsPage.tsx`、`SettingsPrimitives.tsx`、`SettingsNav.tsx`、`ConversationView.tsx`、`UserMessage.tsx`、`ToolLogLine.tsx`、`RightPanel.tsx`、`Sheet.tsx`、`ContextPopup.tsx`、`BashRunBlock.tsx`、`KairosContextSheet.tsx`
- 验证：浅色下视觉零回归（逐文件对比截图）；深色下这些区域变深可读。

### 任务 3：图表 / 可视化 / 渐变 / 阴影收口（高风险，单独处理）

- 文件：`UsageStatisticsPage.tsx`（`TOOL_COLORS`、`HEATMAP_MODEL_COLORS`、进度条渐变、卡片阴影）、`pages/KairosPage.tsx`、`Composer.tsx`（附件占位渐变）、`LabPage.tsx`（`tagColor`、卡片态色）
- 规则：
  - 数据色板抽成 `--act-chart-series-*`（浅深各一组），组件从 CSS 变量读色而非内联 hex。
  - 渐变/阴影：深色下阴影改为更深/更低透明，渐变高光降低；用 token 或 `data-theme` 作用域 CSS。
- 验证：图表在两套主题下都清晰、对比达标；不出现「深色背景上仍是浅色卡片」。

### 任务 4：主题切换 UI + 持久化 + 开机重放

- 文件：`appearance/types.ts`、`storage.ts`、`apply.ts`、`SettingsPage.tsx`（`AppearanceSection` 主题组）、`main.tsx`
- 主题组改为三态 `SettingsSelect` 或分段：浅色 / 深色 / 跟随系统，绑定 `prefs.theme`，变更即 `applyAppearance`。
- 「跟随系统」时监听 `window.matchMedia("(prefers-color-scheme: dark)")` 变化重应用（仅切 system 态需要）。
- 验证：切换即时翻转；刷新/重启保持；system 态跟随 OS 切换。

### 任务 5：原生主题同步（交通灯 / 滚动条）

- 文件：`main/index.ts`、`preload/index.ts`、`global.d.ts`
- main 新增 `appearance:set-theme` IPC（或在 `setNativeTheme` 桥里）→ `nativeTheme.themeSource = mode`；preload 暴露 `setNativeTheme(mode)`；`global.d.ts` 补类型。
- 验证（仅 Electron）：深色下窗口交通灯、原生滚动条、右键菜单同步为深色。

## 验证方式

- 命令：`pnpm --filter @actspace/desktop typecheck`、`test`、`lint`。
- 浏览器 mock：逐页（会话 / 设置各分区 / Kairos / 用量统计 / Lab）切换浅↔深，确认无浅色残留、文字对比达标。
- Electron 真实验证：交通灯/滚动条同步；「跟随系统」随 macOS 外观切换；重启保持。
- 回归基线：浅色态与计划 B 之前逐页截图对比，确认零视觉回归（收口只换 token 不改观感）。

## 风险与回退

- 风险：硬编码收口面广，易引入浅色态回归 → 按任务 2/3 分批小步提交，每批逐文件截图对比。
- 风险：图表/装饰色误映射为中性 token 导致信息色丢失 → 任务 3 单独处理，数据色板独立 token，不并入中性映射。
- 风险：深色对比度不达标 → 色板定稿时按 WCAG AA 校验关键文字/控件。
- 回退：主题切到「浅色」即恢复旧观感；token 收口是等价替换（浅色值不变），不改行为；`data-theme` 不设时默认浅色。

## 完成标准

- 浅 / 深 / 跟随系统三态可切换、即时生效、跨刷新与重启保持，原生 chrome 同步。
- 全部 16 个文件硬编码颜色收口到语义 token；浅色态零回归。
- 两套主题在所有页面对比达标、无浅色残留。
- typecheck / test / lint 全绿；浏览器 mock 与 Electron 双主题验证通过。
- 记 history 到 `docs/histories/2026-05/`，并在 `设置页规范.md` 标注深色已落地。
