# 05 Settings General / Typography

## 目标

完成 `#17` 设置页面通用样式设置，尤其字体。点击左侧 Settings 后进入设置态，显示 General / Typography 区域；第一版支持 UI 字号、代码字号、UI 字体和代码字体的本地设置或预览，并至少影响 renderer 可见文本或预览区域。

当前状态：截至 2026-06-01，本计划按已落地代码计为完成。实现范围已经从最初的 General / Typography 扩展为 Settings 整页接管、设置导航、模型 / Agent / Tools / Appearance 等分区，其中 Typography 归入 Appearance 本地偏好。

## 范围

包含：

- Settings 按钮从 noop 改为页面态入口。
- 设置态布局符合 `docs/design-docs/front-设置页规范.md`：左侧设置导航，右侧设置内容。
- Appearance / Typography 区域包含 UI Font Size、Code Font Size、UI Font Family、Code Font Family 或等价基础项。
- 第一版用 renderer localStorage 或组件状态持久化，不新增 main/preload 设置 IPC。
- 字体设置改变后影响 renderer 可见文本；界面字号通过 Electron zoom / renderer appearance 应用，代码字号通过 CSS variable 应用。
- 支持返回聊天态。

不包含：

- 不实现账号、登录、云同步或远端设置。
- Typography / Appearance 偏好不引入完整跨进程 settings store，继续走 renderer localStorage。
- 不改 Usage / Kairos 页的产品设计。
- 不做完整主题色定制系统；主题只覆盖浅色 / 深色 / 跟随系统三态。

## 背景

相关文档：

- `docs/design-docs/front-设置页规范.md`
- `docs/design-docs/front-全局视觉语言规范.md`
- `docs/design-docs/front-工作台布局与面板交互规范.md`
- `docs/exec-plans/tech-debt-tracker.md`

相关代码路径：

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/test/**`

已知现状：

- Sidebar 的 Settings 按钮已接入 `settings` view。
- `WorkbenchLayout` 已在 `view === "settings"` 时整页渲染 `SettingsPage`，不再显示聊天侧栏 / 右栏。
- Appearance 偏好由 `packages/desktop/src/renderer/appearance/*` 管理并持久化到 localStorage。

## 实施任务

### Step 1: Settings view 接入

- 扩展 Sidebar view 或新增页面态，让 Settings 成为独立 view。
- 点击 Settings 切换到 settings。
- Settings 态左侧不再展示会话列表，而是设置导航；右侧展示当前设置内容。
- 提供 `Back to app` 返回聊天态。
- 页面根容器遵守 chrome bar 顶部让位规则。

验收：

- 点击 Settings 不再无响应。
- 可返回聊天态，不破坏当前会话。

### Step 2: Settings 页面组件

- 新建或拆出 `SettingsPage` / `SettingsLayout` 组件。
- 左侧导航至少包含 General / Appearance / Model / Tools / Advanced，其中第一版只实现 General。
- 右侧 General 中包含 Typography 分组。
- 控件使用熟悉 UI：select / segmented control / stepper 或 range，不用纯说明文字替代功能。

验收：

- 视觉符合设置页定稿方向：极简、冷静、桌面应用感，不像后台控制台。

### Step 3: Typography 设置模型

- 定义 renderer 本地设置类型，例如：
  - `uiFontSize`
  - `codeFontSize`
  - `uiFontFamily`
  - `codeFontFamily`
  - `density` 可选
- 使用 localStorage 保存。
- 应用到设置页预览；如全局应用，则通过 CSS variables 控制并避免破坏固定尺寸控件。
- 提供 reset default。

验收：

- 改变字体设置后，预览或 renderer 可见文本发生变化。
- 刷新后 localStorage 设置仍可恢复。

### Step 4: 测试

- renderer 测试覆盖：
  - 点击 Settings 进入设置态。
  - Back to app 返回聊天态。
  - 修改字体设置后预览变化。
  - reset default 生效。

## 风险

- 风险：全局字号设置影响 Composer / Sidebar 精密布局。
  - 缓解：第一版可以先影响设置页预览或有限 CSS variable；全局应用需在浏览器 mock 检查 Composer、Sidebar 不破版后再启用。
- 风险：设置态和聊天态共用 SplitView 时布局边界混乱。
  - 缓解：遵守设置页规范，Settings 是页面态，不塞进聊天页右侧面板。

## 验证方式

- `pnpm --filter @actspace/desktop test -- Settings` 或等价局部测试。
- `pnpm --filter @actspace/desktop typecheck`。
- 浏览器 mock 验证 Settings 进入/返回、Typography 控件、预览变化、窗口窄化。
- 本阶段不强制 Electron 真实验证，除非引入 preload / IPC。

## 进度记录

- [x] 完成 Settings view 接入。
- [x] 完成 Settings 页面组件。
- [x] 完成 Typography / Appearance 本地设置模型。
- [x] 完成测试和浏览器 mock 验证。

## 验证记录

- 2026-05-29：`docs/histories/2026-05/20260529-1950-settings-page.md` 记录 Settings 整页接管、SettingsPage / SettingsNav / SettingsPrimitives、默认模型联动和浏览器 mock 走查。
- 2026-05-29：`docs/histories/2026-05/20260529-2310-appearance-fonts-and-zoom.md` 记录 Appearance / Typography 本地偏好、字体/字号应用、localStorage 持久化和测试。
- 2026-06-01：静态核对确认 `WorkbenchLayout` 已接入 `SettingsPage`，`SettingsPage` 已实现字体、字号和主题本地偏好，本子计划计为完成。

## 决策记录

- 2026-05-28：Typography 第一版优先 renderer localStorage，不新增跨进程 settings store，避免把单个 UI polish 任务扩大成设置系统工程。
- 2026-06-01：Settings 实际实现已扩展到完整设置页骨架和 Appearance 分区；本计划按“Settings 入口 + Typography 本地偏好可用”验收，不再要求 Typography 必须留在 General 分区内。
