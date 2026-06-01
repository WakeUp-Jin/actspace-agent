# 外观页 · 字体设置 + 界面缩放（计划 A）

## 用户诉求

设计并实现「设置 → 外观」的字体能力。讨论后定稿：字体只分两类——`界面字体`（管界面 + AI 输出正文）与 `代码字体`（管等宽/代码块）；预设字体栈下拉；`界面字号`用整窗缩放、`代码字号`单独调；主题三态（浅/深/跟随系统）作为独立专项后续做。本轮先落「字体 + 缩放」（计划 A）。

## 设计动机

- app 的字体语义天然对上现有三个 token：`--act-font-ui`（界面）、`--act-font-display`（输出正文，本就 = ui）、`--act-font-mono`（代码）。因 display 始终跟随 ui，「界面字体 + 输出字体合并为 UI 字体」零额外成本——只改 `--act-font-ui` 两处一起变。
- 界面字号用 `webFrame.setZoomFactor` 整窗缩放：UI 组件普遍写死像素，无法靠 root rem 缩放，整窗 zoom 是最干净的路子；代码字号则因 markdown/diff 局部可控，用单独 CSS 变量 `--act-font-mono-size` 精确调。
- 外观是纯 UI 偏好，走 renderer `localStorage` + `:root` CSS 变量，不进 `settings.json` / IPC；开机在 `main.tsx` 渲染前重放避免闪烁。`setUiZoom` 在 preload 直接调 `webFrame`，同步无 IPC 往返；浏览器 mock 下不存在则降级 no-op。

## 主要改动

- 新增外观偏好模块：`packages/desktop/src/renderer/appearance/{types,fonts,storage,apply}.ts`
  - `types.ts`：`AppearancePrefs`（uiFontId / codeFontId / uiZoom / codeFontSize）+ 范围常量 + 默认值。
  - `fonts.ts`：UI / 代码各 4 个预设字体栈（带 fallback，不打包字体）。
  - `storage.ts`：`load/saveAppearance`，坏 JSON / 缺字段回落默认、数值 clamp、非法字体 id 拒绝。
  - `apply.ts`：写 `--act-font-ui` / `--act-font-mono` / `--act-font-mono-size` + 调 `setUiZoom`。
- 代码字号变量化：`tokens.css` 增 `--act-font-mono-size: 13px`；`markdown.css`（代码块）、`diff.css`、`BashRunBlock.tsx`（输出/命令/意图三处 mono 文本）改为消费该变量。
- UI：`SettingsPrimitives.tsx` 新增 `Stepper`（− 值 +，越界禁用）；`SettingsPage.tsx` `AppearanceSection` 重写为「主题（占位）/ 字体（两下拉）/ 字号（两步进器）」，变更即 `save + apply`。
- 桥接：`preload/index.ts` 暴露 `setUiZoom`（`webFrame.setZoomFactor`）；`global.d.ts` 补类型；`main.tsx` 开机重放。
- 测试：新增 `renderer/test/appearance.test.ts`（storage clamp/回落 + apply 写变量与调用 setUiZoom）；`settings-page.test.tsx` 增外观分区交互用例并给 stub 补 `setUiZoom` + `localStorage.clear()`；`app-streaming-user-message.test.tsx` 的 `settingsApiStub` 补 `setUiZoom`。
- 文档：`docs/design-docs/front-设置页规范.md` 外观章节定稿；执行计划 `docs/exec-plans/active/20260529-appearance-fonts-and-zoom.md`（A）与 `20260529-appearance-dark-theme.md`（B，深色专项）。

## 验证

- `pnpm --filter @actspace/desktop typecheck` 通过；`test` 全绿（16 文件 / 144 用例）。
- 浏览器 mock 进入「外观」：结构正确（主题/字体/字号三组）；点「代码字号增大」后 `--act-font-mono-size` 实时变 14px 且 localStorage 持久化 `codeFontSize:14`。
- 待用户在 Electron 真实环境验证「界面字号」整窗缩放（mock 下为 no-op，不可验）。

## 修订（同轮，应用户反馈）

用户反馈「界面字号显示成缩放百分比不好，应像 Cursor 那样是 15/17 的 px 数字」。调整：

- `AppearancePrefs.uiZoom` → `uiFontSize`（px，默认 14，范围 12–20）；`apply.ts` 由 `uiFontSize / UI_FONT_SIZE_BASE(14)` 推导整窗缩放比。诚实保留缩放机制（UI 用写死 px 非 rem，无法逐元素改字号），但对外呈现为 px 基准字号。
- 代码字号做缩放反向补偿：`--act-font-mono-size = codeFontSize / zoom`，整窗缩放再乘回后恰为设定 px，使「代码字号 13px」在任何界面字号下都精确。浏览器 mock 无缩放则直接用字面 px。
- `Stepper` 增 `defaultValue` → 值≠默认时显示重置按钮（仿 Cursor 的 ↺）；界面/代码字号均接入。
- 同步更新 `appearance.test.ts`、`settings-page.test.tsx`（断言改为 px 与 `uiFontSize`）、`设置页规范.md`、计划 A。typecheck + 144 用例仍全绿；浏览器 mock 实测字号显示为 `14px` 且重置按钮按预期出现/消失。

## 最关键受影响文件

- `packages/desktop/src/renderer/appearance/*`（新模块）
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`、`SettingsPrimitives.tsx`
- `packages/desktop/src/renderer/styles/tokens.css`、`markdown.css`、`diff.css`、`components/messages/BashRunBlock.tsx`
- `packages/desktop/src/preload/index.ts`、`src/global.d.ts`、`src/renderer/main.tsx`
