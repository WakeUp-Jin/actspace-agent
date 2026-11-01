## [2026-11-01 12:40] | Task: 文件打开收敛

### 🤖 Execution Context

- **Agent ID**: `subagent (架构优化 P3)`
- **Base Model**: `Claude Sonnet 5.5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 执行功能减法 P3：应用内只渲染 Markdown 和图片，HTML 交给系统默认浏览器，其他文件交给系统默认应用，打不开时弹兜底对话框。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/desktop`、`scripts/`、`apps/site`、`docs/`

**Key Actions:**

- **实测 `shell.openPath`**: 对没有关联应用的扩展名，macOS 上约 75ms 返回 `"Failed to open path"`，系统不弹框。据此让 main 把这个错误映射为新错误码 `no_application`，不需要调用前预查关联应用。
- **统一打开路由**: 新增 `components/files/open-workspace-path.ts`。`.md` / `.markdown` 和图片读文件后在右侧面板打开，其他（含 HTML）交给系统。交付卡、本轮改动的「打开整个文件」、聊天文件链接、读文件工具行、工作区文件树都改走它；远端 Host 会话保持原有预览。
- **兜底对话框**: 新增 `OpenFileFallbackProvider`（挂在 `WorkbenchLayout`）和 `OpenFileFallbackDialog`：选择应用打开、在 Finder 中显示、VS Code 未安装时的一行提示。应用图标和名称行从 `OpenWithButton` 抽成 `ApplicationLabel` 共用。
- **main 只读 Markdown 和图片**: `renderKindOf` 只返回 `markdown` / `image` / `external`；删 HTML、CSV 扩展名表和全部代码语言映射；`external` 只返回 stat。契约删 `language` 和读文件的 `binary` 错误。
- **删除渲染视图**: `HtmlRenderView`、`CsvRenderView`、`open-html-in-browser.ts` 及其测试；`RightPanelContext` 删 `html`、`csv` 标签类型和 `text.language`。`CodeRenderView` 保留（Markdown 源码、Space 演示、远端文本预览在用）。
- **同步文档与脚本**: 改写右侧面板规范的文件渲染规则，删 CSV 与 HTML 沙箱两节；站点「文件预览」页；更新日志；主题检查脚本去掉 `HtmlRenderView` 的字面量例外，原生按钮基线删 `CsvRenderView`。

### 🧠 Design Intent (Why)

渲染 HTML、代码、CSV 是浏览器和编辑器的本职，应用里做不好也占资源。只保留 Markdown 和图片，其余尊重用户已选好的系统默认应用，不写死 Chrome 或 VS Code，也不在启动时检测软件；只在点了却打不开的那一刻给出兜底。属于「架构优化」第一步功能减法（`docs/design-docs/架构优化/01-功能减法设计.md` 第 2 节）。Markdown 仍按现有 `markdown` 标签打开，文档面板由 P4 接手。

### 📁 Files Modified

- `apps/desktop/src/main/workspace-fs-service.ts`、`file-applications-service.ts`
- `apps/desktop/src/renderer/components/files/`（新增 4 个文件）
- `apps/desktop/src/renderer/components/RightPanel.tsx`、`WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/components/right-panel/`（`workspaceFileTab.ts`、`RightPanelContext.tsx`、`WorkspaceOperationBar.tsx`、`WorkspaceFileTree.tsx`；删 `HtmlRenderView.tsx`、`CsvRenderView.tsx`、`open-html-in-browser.ts`）
- `apps/desktop/src/renderer/components/turn-tail/`、`conversation/use-workspace-file-links.ts`
- `apps/desktop/src/renderer/mock/scenarios/turn-deliverables.ts`
- `packages/shared/src/ipc.ts`
- `scripts/check-frontend-theme-colors.mjs`、`scripts/native-button-baseline.json`
- `docs/design-docs/frontend/`（右侧面板、工作台布局、图标按钮三份）、`apps/site/src/content/docs/file-preview.md`、`docs/releases/feature-release-notes.md`
