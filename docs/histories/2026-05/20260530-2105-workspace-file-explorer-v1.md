## [2026-05-30 21:05] | Task: 实现工作区文件浏览器 V1

### 🤖 Execution Context

- **Agent ID**: `local-session`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> 讨论并实现类似 Cursor/Codex 的文件浏览器（右侧面板的文件夹树 + 点文件预览，像迷你 VSCode）。文件来源于会话 WorkSpaces；要能渲染 md，未来还想支持点 path 直达、Kairos 配置编辑。确认形态用「树 rail + 文件 Tab」、V1 只做 `+` 菜单唤出的只读浏览器、先文档后代码，并把 ts/js/css/yaml 等代码文件折进 V1 做语法高亮后，开始实现。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`（main + preload + renderer）、`docs`

**Key Actions:**

- **设计先行**: 落 `工作区文件浏览器规范.md` + 执行计划 `20260530-workspace-file-explorer.md`，挂入 frontend-ui 索引与右侧面板规范交叉引用。
- **IPC 契约**: `shared/ipc.ts` 新增 `workspace:list-dir` / `workspace:read-file` 的输入输出类型（含 text 类 `language` 字段）。
- **main fs 服务**: 新增 `workspace-fs-service.ts`——懒加载目录（忽略名单 + 1000 条上限 + 目录在前排序）、读单文件（文本 2MB / 图片 5MB 上限、NUL 二进制识别、图片 base64 data URL、扩展名→renderKind + highlight.js 语言推断）、越界一律 `escapes_root` 拦截在 root 内。
- **接线**: `main/index.ts` 注册两个 handler；preload 暴露 `listWorkspaceDir` / `readWorkspaceFile`；补 `global.d.ts` 类型。
- **renderer rail**: `RightPanelContext` 加 `isFileTreeOpen` + 开关；新增 `WorkspaceFileTree.tsx`（懒展开、文件夹/文件图标、点文件复用 markdown/html/image/text 视图开 `file:<path>` Tab、错误码降级为可读文本、无 IPC 时空态）；`RightPanel` 改横向 `[rail][主列]` 布局。
- **代码高亮**: `TextRenderView` 带 `language` 时用 highlight.js 高亮；把 hljs 配色从 `.markdown-doc` 提取为共享 `.act-code-hl`，Markdown 容器同时带上该 class，二者共用一套主题感知配色。
- **入口**: 「+ 新建对象」菜单加「工作区文件」项唤出 rail。
- **测试**: `workspace-fs-service.test.ts`（9 例：排序/忽略/越界/markdown/语言推断/图片 data URL/二进制/超限）+ `workspace-file-tree.test.tsx`（3 例：懒加载/代码文件带语言开 Tab/无 IPC 降级）；补现有 app 测试 mock 的两个新方法。

### 🧠 Design Intent (Why)

- 右侧面板的 Tab 系统与各渲染视图已成熟，文件浏览器复用即可，新增面只有「两个读盘 IPC + 一棵树」，成本低。
- UI 浏览**强约束在 workspaceRoot 内**，故意不复用读工具放开越界的 `resolveReadablePath`——面向用户的可点界面不该暴露整盘。
- 图片走 data URL 规避 renderer `file://` + CSP 冲突；HTML 文件走 `trust="file"` strict 沙箱。
- 代码高亮复用已是直接依赖的 highlight.js + 既有主题配色，按扩展名确定性推断语言（不做 highlightAuto），表外类型回退纯等宽，兼顾体验与确定性。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/workspace-fs-service.ts`（新增）
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`（新增）
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/right-panel/MarkdownRenderView.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/styles/markdown.css`
- `packages/desktop/src/main/test/workspace-fs-service.test.ts`（新增）
- `packages/desktop/src/renderer/test/workspace-file-tree.test.tsx`（新增）
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend-ui/工作区文件浏览器规范.md`（新增）
- `docs/exec-plans/active/20260530-workspace-file-explorer.md`（新增）
- `docs/design-docs/frontend-ui/index.md`、`docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`

### ✅ Verification

- `pnpm typecheck` 全绿（shared / agent-core / desktop）。
- `pnpm test` 全绿（agent-core 497 + desktop 180，含新增 9 + 3 例）。
- `pnpm build` 通过（renderer chunk >500kB 警告为既有现象）。
- ⏳ 待人工：Electron 真实验证（真实 workspace 展开树、点 md/图片/代码文件、越界拦截、浅/深双主题配色）。
