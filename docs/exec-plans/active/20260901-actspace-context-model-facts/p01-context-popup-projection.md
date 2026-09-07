# P01：Context Popup Projection 与 Composer 展示

## 目标

让输入框上方的 Context Popup 使用最近一次 request snapshot 的完整 Context bucket，并完成与 Composer 同宽、整数 token、整数百分比和零容量的展示规范。

## 依赖与范围

依赖：P00 Request Model Facts；现有 `projectContextState()`、`ContextState`、`ContextUsageSnapshot` 和 Session Projection provider。

包含：

- 将 ContextState / request snapshot bucket 传入 Composer 与 ContextPopup；
- Popup 不再优先使用 provider usage；
- 显示 system prompt、tools、rules、skills、summarized conversation、conversation 等已有 bucket；
- Context 面板宽度与输入框一致；
- 统一百分比和 token 紧凑格式；
- 补 renderer 与 projection regression tests，并按浅色/深色主题门禁验证。

不包含：

- provider usage 页面改版；
- MCP / Subagent 新持久化分类；
- Context entry 编辑、pin、exclude；
- 输入框临时模型选择自动保存为默认模型。

## 主要文件范围

- `apps/desktop/src/renderer/components/ContextPopup.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/session/projection-display.ts`
- `apps/desktop/src/renderer/test/context-popup.test.tsx`
- `apps/desktop/src/renderer/test/context-render-view.test.tsx`
- `apps/desktop/src/renderer/test/composer.test.tsx`
- 必要的 shared selector / fixture 文件

## 具体步骤

1. 新增纯格式化 helper：百分比取整数；token 小于 1000 显示整数，千级以上截断为整数 K，百万级以上显示整数 M；避免 `toLocaleString()` 直接输出长数字或小数。
2. 在 WorkbenchLayout → ConversationView → Composer 链路传递 request-context state；provider usage 继续保留给 Usage 语义。
3. Popup 使用 ContextState buckets 生成 meter 和明细；未知 bucket 仍使用共享注册表兜底。
4. 将 Popup 容器从固定 `min(820px, 100%)` 改为 Composer 容器内全宽，并验证窄窗口布局。
5. 保持 ContextRenderView 的逐条 preview、折叠和导出行为不变，只让其与 Popup 使用同一 projection 水位。

## 验证

- Popup 渲染六类已有 bucket；
- provider usage 存在时，Popup 仍显示 request snapshot bucket；
- `38.214999%` 显示 `38%`，`76,430` 显示 `76K`，`1,000,000` 显示 `1M`；
- contextWindow 缺失时显示 0，不显示 200K；
- meter 与输入框左右边缘一致的浏览器 mock / Electron 手工截图；
- `pnpm --filter @actspace/desktop test -- context-popup context-render-view composer`；
- `pnpm run check:frontend-theme`；
- `pnpm -r typecheck`、`pnpm run check:docs`、`git diff --check`。

## 风险与回退

如果完整 ContextState 尚未返回，Popup 可短暂显示 summary-only 状态，但必须标注数据尚未完成，不能回退到 provider usage 两桶冒充 request context。样式回退不应撤销 P00 的数据契约。

## 完成条件

- Popup 数据源、容量、格式和宽度均有自动化断言；
- 浅色、深色主题通过 token 检查；
- Electron 手工验收项目写入 execution summary；
- 完成变更写入 `docs/histories/YYYY-MM/`。

## 执行结果（2026-09-02）

- 已完成 WorkbenchLayout → ConversationView → Composer → ContextPopup 的 ContextState 传递。
- Popup 已改为 request-context/ContextState 优先，容器贴合 Composer 全宽，百分比与 token 使用整数紧凑格式；未知容量统一显示 0% 和 0 Tokens，不暴露 Unknown。
- Context Popup 与 ContextRenderView 聚焦测试通过。
- Electron 左右边缘、不同模型容量和临时模型选择仍需手工验收。
