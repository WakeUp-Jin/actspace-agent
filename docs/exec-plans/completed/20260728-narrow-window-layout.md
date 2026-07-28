# 桌面端 480px 窄窗适配执行计划

## 目标

让 actspace 桌面端窗口可以稳定缩小到 `480px`，并在窄窗下将左右面板切换为覆盖式交互，保证聊天、设置、Usage 与 Kairos 的核心内容可读、可操作。

## 范围

- 包含：Electron 最小窗口宽度、工作台窄窗面板策略、Composer 紧凑布局、设置页单栏降级、Usage/Kairos 响应式降级、自动化测试、设计文档与 history。
- 不包含：移动端产品形态、面板拖拽换区、重新设计现有视觉语言、改变桌面宽窗的默认尺寸与面板宽度。

## 背景

- 相关文档：`docs/FRONTEND_VERIFICATION.md`、`docs/design-docs/frontend/front-工作台布局与面板交互规范.md`、`docs/design-docs/frontend/front-主题与配色规范.md`。
- 相关代码路径：`packages/desktop/src/main/index.ts`、`packages/desktop/src/renderer/components/WorkbenchLayout.tsx`、`packages/desktop/src/renderer/components/Composer.tsx`、设置页、Usage、Kairos 与对应测试。
- 已知约束：中间聊天区优先；窄窗打开侧栏时不能挤压主区；颜色只消费现有主题 token；不通过启动或操控 Electron 代替用户的真实验收。

## 风险

- 风险：只降低 Electron `minWidth` 会让侧栏无法展开、设置页内容被固定导航挤压。
- 缓解方式：使用明确的窄窗 breakpoint，将左右面板改为 overlay，并为全屏页面提供单栏布局。
- 风险：响应式规则影响 1120px 以上的既有桌面布局。
- 缓解方式：所有降级规则限制在窄窗 breakpoint 内，并验证 `480 / 820 / 1120 / 1440px`。

## 里程碑

1. 落地窗口下限与工作台覆盖式面板。
2. 完成 Composer、Settings、Usage、Kairos 的窄窗降级。
3. 增加测试、同步文档并完成工程与浏览器验证。

## 验证方式

- 命令：`pnpm typecheck`、`pnpm build`、`pnpm check:frontend-theme`、相关 Vitest 测试。
- 手工检查：浏览器 renderer 在 `480 / 820 / 1120 / 1440px` 下检查聊天空态、侧栏、Composer、设置、Usage 与 Kairos。
- 观测检查：确认窄窗打开侧栏/右栏时主区尺寸不变化，宽窗仍保持 SplitView 行为。

## 进度记录

- [x] 确认 `minWidth: 1120` 与现有 SplitView 自动折叠逻辑。
- [x] 完成工作台 overlay 与窗口下限。
- [x] 完成页面级窄窗降级。
- [x] 完成测试、文档与验证。

## 决策记录

- 2026-07-28：目标下限定为 `480px`；紧凑模式保留桌面信息架构，但左右面板使用临时覆盖层，不引入新的移动端导航模型。
- 2026-07-29：紧凑 breakpoint 定为 `820px`，与 `260px` 默认左栏 + `560px` 主区保护宽度的既有契约对齐，避免 761–819px 出现侧栏打开后立即被自动隐藏的不可达区间。
- 2026-07-29：完整 desktop 测试 `532/532`、主题检查、文档检查和仓库构建通过。Codex 内置浏览器本轮无法附着 localhost 标签页，因此截图级浏览器目测和 Electron 真实窗口验收留给用户执行。
