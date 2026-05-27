# actspace Tailwind 样式架构接入计划

## 目标

为桌面端 renderer 接入 Tailwind v4，并把样式架构收敛为“全局 token / base CSS + Tailwind utility + React UI primitive”。第一阶段以 Usage Statistics 页面作为完整样板，后续再分批迁移 Workbench、Sidebar、Conversation、Composer 和 Right Panel。

## 范围

- 包含：
  - 在 `packages/desktop` 接入 Tailwind v4 和 `@tailwindcss/vite`。
  - 建立 `packages/desktop/src/renderer/styles/` 样式入口、token、Tailwind theme 映射和 base 样式。
  - 用 Tailwind utility 迁移 Usage Statistics 页面，保留当前原型视觉基线。
  - 后续按切片迁移 Sidebar、Workbench shell、Conversation、Composer、Right Panel 和 Settings。
  - 删除被迁移切片对应的旧全局 CSS，不保留长期 legacy 样式层。
  - 更新前端设计文档、coding standards 和 history。
- 不包含：
  - 不引入 shadcn/ui 或 Radix 作为本次基础组件方案。
  - 不做暗色模式、主题编辑器或多主题系统。
  - 不改变 usage statistics 的数据来源、IPC 协议或 session 解析逻辑。
  - 不改变 Workbench split-view 的交互模型。
  - 不在本计划里重做产品视觉方向。

## 背景

- 相关文档：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/PLANS_GUIDE.md`
  - `docs/CODING_BEHAVIOR.md`
  - `docs/FRONTEND.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/QUALITY_SCORE.md`
  - `docs/design-docs/frontend-ui/index.md`
  - `docs/design-docs/frontend-ui/全局视觉语言规范.md`
  - `docs/design-docs/frontend-ui/tailwind-style-architecture.md`
  - `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- 相关代码路径：
  - `packages/desktop/package.json`
  - `packages/desktop/vite.config.mts`
  - `packages/desktop/src/renderer/main.tsx`
  - `packages/desktop/src/renderer/styles.css`
  - `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
  - `packages/desktop/src/renderer/App.tsx`
- 已知约束：
  - 本仓库当前没有 Tailwind 依赖和配置。
  - 前端是 Vite + React + Electron renderer。
  - 用户已明确项目处于开发阶段，不需要保留旧样式兼容层。
  - Usage Statistics 页面需要贴近 `docs/design-docs/frontend-ui/usage-statistics/prototype.html` 的原型效果。
  - 代码实现前仍需遵守 `AGENTS.md`：先确认方案，再改代码。

## 风险

- 风险：Tailwind Preflight 改变旧组件默认样式。
  - 缓解方式：按页面切片迁移，完成一个切片就执行浏览器验证，不把全站一次性推到半迁移状态。
- 风险：JSX 内 className 太长，降低可读性。
  - 缓解方式：将重复结构抽成 `Panel`、`IconButton`、`SegmentedControl`、`MetricCard` 等 React primitive；只在必要时少量使用局部 class 常量。
- 风险：全局 CSS 和 Tailwind token 双重来源。
  - 缓解方式：`--act-*` CSS 变量作为唯一来源，Tailwind `@theme inline` 只做映射。
- 风险：Markdown、代码块、diff、Monaco 这类第三方或内容渲染区域被 Preflight 影响。
  - 缓解方式：这些区域保留专门的 base / component layer，并单独做视觉验收。
- 风险：迁移过程中误动 usage statistics 数据逻辑。
  - 缓解方式：Usage 页面迁移阶段只改样式和组件结构，不改 IPC、session 解析、selectors 和数据模型。

## 里程碑

1. Tailwind 基础设施。
   - 安装 `tailwindcss` 和 `@tailwindcss/vite`。
   - 在 `packages/desktop/vite.config.mts` 加入 Tailwind Vite plugin。
   - 新建 `packages/desktop/src/renderer/styles/index.css`、`tokens.css`、`tailwind.css`、`base.css`。
   - 更新 `packages/desktop/src/renderer/main.tsx` 的样式入口。
   - 迁移或删除与基础层重复的旧 `styles.css` 内容。
2. Usage Statistics 样板迁移。
   - 将 Usage 页面改为 Tailwind utility 和少量 React primitive。
   - Token 总数大卡内部包含 toolbar、数字、金额、分布条、底部输入 / 输出 / 缓存 / 推理卡。
   - 金额点击打开成本估算弹窗。
   - 工具调用卡移到左侧，保持原型紧凑样式，`查看详情` 打开弹窗。
   - 缓存效率卡改为蓝色主色并删除说明性长文案。
   - 不在本切片调整全局左右列比例，等 Tailwind 基础完成后单独处理响应式布局。
3. Workbench shell 与 Sidebar 迁移。
   - 迁移 app shell、左侧菜单、Pinned / Scheduled / Workspaces 列表。
   - 保留 Electron drag / no-drag、collapse、resize、scroll 行为。
   - 去掉对应旧 `.app-*`、`.sidebar-*` 全局 class。
4. Conversation、Composer 与 Right Panel 迁移。
   - 迁移消息区、工具预览、输入框、附件区和右侧预览面板。
   - 对 Markdown、代码、diff、图片预览保留必要内容样式边界。
5. 清理与规范固化。
   - 删除旧 `styles.css` 和未使用 class。
   - 补充 `docs/coding-standards/` 中的 Tailwind 书写约定。
   - 更新 `docs/histories/`。
   - 做完整 typecheck、build、测试和 Electron 真实窗口验收。

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm --filter @actspace/desktop build`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm dev:log`
- 手工检查：
  - 浏览器 mock 打开 `http://127.0.0.1:5173/`，检查 Usage 页面。
  - 对照 `http://127.0.0.1:5500/docs/design-docs/frontend-ui/usage-statistics/prototype.html` 的原型布局。
  - 检查金额弹窗、工具详情弹窗、表格滚动、热力图、工具调用卡和缓存效率卡。
  - 调整窗口宽度，确认卡片不溢出、不遮挡、不出现错误横向滚动。
- 观测检查：
  - 查看 `logs/latest-dev.log` 是否存在 Vite、Electron 或 renderer 报错。
  - DevTools console 不应出现 Tailwind 构建、React hydration 或 runtime error。

## 进度记录

- [x] 确认 Tailwind 接入方向：使用 Tailwind v4、Vite plugin、Preflight、无长期 legacy CSS。
- [x] 创建前端 Tailwind 样式架构设计文档。
- [x] 创建 active execution plan。
- [x] 安装 Tailwind 依赖并接入 Vite plugin。
- [x] 建立 renderer 样式入口和 token 映射。
- [x] 迁移 Usage Statistics 页面。
- [x] 完成浏览器 mock 验收。
- [x] 完成 Electron 真实窗口验收。
- [x] 迁移 Kairos 完整监控页和右侧紧凑视图到 Tailwind utility，删除对应 `.kairos-*` 全局 CSS。
- [x] 确认 Lab V0 renderer mock 已使用 Tailwind utility + 局部 class 常量，无 `.lab-*` 全局 CSS 需要迁移。
- [ ] 迁移剩余主要前端区域。
- [ ] 删除旧 CSS 并更新 history / coding standards。

## 决策记录

- 2026-05-28：Kairos 页面迁移时把运行轨迹测试锚点从旧 CSS class 改为 `data-testid`。原因是 Tailwind 迁移后样式类不再是稳定契约，测试应依赖语义和明确测试锚点，而不是旧 BEM class。
- 2026-05-27：使用 Tailwind v4 + `@tailwindcss/vite`。原因是项目基于 Vite，官方推荐该插件路径，且 v4 的 CSS-first 配置适合与现有视觉 token 合并。
- 2026-05-27：启用 Preflight。原因是项目仍处开发阶段，用户明确不需要保留旧样式；全量显式样式比长期兼容旧默认更清晰。
- 2026-05-27：不保留长期 `legacy.css`。影响是每个迁移切片必须完整落地并验证，不能留下半迁移 class。
- 2026-05-27：Usage Statistics 作为第一个样板页面。原因是该页面已有 HTML 原型、明确视觉反馈和较完整的卡片 / 表格 / 弹窗 / 响应式需求。
- 2026-05-27：将 desktop Vite 配置改为 `vite.config.mts`。原因是 `@tailwindcss/vite` 是 ESM-only，`.mts` 能让 Vite 配置以 ESM 方式加载，同时不影响 Electron main 的 CommonJS tsconfig。
