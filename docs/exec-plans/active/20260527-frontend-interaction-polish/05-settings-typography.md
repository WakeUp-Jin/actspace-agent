# 05 Settings General / Typography

## 目标

完成 `#17` 设置页面通用样式设置，尤其字体。点击左侧 Settings 后进入设置态，显示 General / Typography 区域；第一版支持 UI 字号、代码字号、UI 字体和代码字体的本地设置或预览，并至少影响 renderer 可见文本或预览区域。

## 范围

包含：

- Settings 按钮从 noop 改为页面态入口。
- 设置态布局符合 `docs/design-docs/frontend-ui/设置页规范.md`：左侧设置导航，右侧设置内容。
- General / Typography 区域包含 UI Font Size、Code Font Size、UI Font Family、Code Font Family 或等价基础项。
- 第一版用 renderer localStorage 或组件状态持久化，不新增 main/preload 设置 IPC。
- 字体设置改变后影响设置页预览区域，若风险可控再影响全局 renderer CSS variables。
- 支持返回聊天态。

不包含：

- 不实现账号、登录、云同步或远端设置。
- 不引入完整跨进程 settings store。
- 不改 Usage / Kairos 页的产品设计。
- 不做主题色、暗色模式或复杂外观系统。

## 背景

相关文档：

- `docs/design-docs/frontend-ui/设置页规范.md`
- `docs/design-docs/frontend-ui/全局视觉语言规范.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `docs/exec-plans/tech-debt-tracker.md`

相关代码路径：

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/test/**`

已知现状：

- Sidebar 的 Settings 按钮当前没有 onClick 行为。
- `WorkbenchLayout` 当前 view 只有 `chat | lab | usage | kairos`。
- 全局字体 token 应以 `styles/tokens.css` 为来源，并通过 `styles/tailwind.css` 映射给 Tailwind；普通 Settings 页面样式写在组件局部 Tailwind class 中。

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

- [ ] 完成 Settings view 接入。
- [ ] 完成 Settings 页面组件。
- [ ] 完成 Typography 本地设置模型。
- [ ] 完成测试和浏览器 mock 验证。

## 决策记录

- 2026-05-28：Typography 第一版优先 renderer localStorage，不新增跨进程 settings store，避免把单个 UI polish 任务扩大成设置系统工程。
