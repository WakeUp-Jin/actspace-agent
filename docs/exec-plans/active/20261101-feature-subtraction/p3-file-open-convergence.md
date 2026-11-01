# P3 文件打开收敛

## 目标

应用内只渲染 Markdown 和图片。所有“点一个工作区文件”的入口走同一个路由：Markdown 和图片在右侧面板打开，HTML 交给系统默认浏览器，其他文件交给系统默认应用；只有系统打不开时才弹兜底对话框。

## 范围

- 包含：统一打开路由、删除 HTML / CSV / 代码渲染标签、main 读文件只返回 Markdown 和图片内容、兜底对话框、调用方改造、测试、文档。
- 不包含：
  - 文档面板本身（P4）。本子计划里 Markdown 仍按现有方式打开 `markdown` 标签。
  - 远端 Host 会话（保持 `remoteArtifact.ts` 的现有预览，见 README 实施细节第 5 条）。
  - `CodeRenderView` / `VirtualCodeView` / `highlight.ts` / `code-source-selection.ts` / `use-code-selection.ts`：Markdown 源码视图、Space 演示和远端文本预览还在用，保留。
  - `kind:"text"` 标签：读取失败提示和远端文本预览在用，保留。

## 必读

- `AGENTS.md`
- [01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md) 第 2 节
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`「文件渲染规则」「HTML 渲染与沙箱安全」「外部打开」
- `docs/design-docs/frontend/front-基础组件封装规范.md`（对话框用 `components/ui/Dialog.tsx`）

## 打开路由

新建 `apps/desktop/src/renderer/components/files/open-workspace-path.ts`，取代 `components/right-panel/open-html-in-browser.ts`：

| 判断（按扩展名，大小写不敏感） | 行为 |
|---|---|
| `.md` / `.markdown` | `workspacesApi.readFile` → `tabFromFile` 打开 `markdown` 标签（P4 改为打开文档面板） |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` | `readFile` → `image` 标签（现状） |
| `.html` / `.htm` | `workspacesApi.openFile({ action: "open" })`，即系统默认浏览器 |
| 其他 | `workspacesApi.openFile({ action: "open" })`，即系统默认应用 |

导出两个函数：`classifyWorkspaceFile(relativePath)` 返回 `"markdown" | "image" | "external"`；`openWorkspacePath({ workspaceRoot, relativePath, openTab })` 返回 `{ ok: true } | { ok: false; reason: "no_app"; relativePath } | { ok: false; reason: "error"; message }`。

## 兜底对话框

新建 `apps/desktop/src/renderer/components/files/OpenFileFallbackDialog.tsx`，由 `OpenFileFallbackProvider`（同目录 `open-file-fallback-context.tsx`）挂在 `WorkbenchLayout` 内，向下提供 `useOpenWorkspacePath()`：调用 `openWorkspacePath`，结果为 `no_app` 时弹对话框。

对话框内容（`components/ui/Dialog.tsx`，只用主题 token）：

- 标题：“没有可以打开「文件名」的应用”。
- 「选择应用打开」：复用 `components/turn-tail/useFileApplications.ts` 拉取关联应用列表，列表 UI 抽自 `OpenWithButton.tsx` 的下拉项（抽成共享组件，`OpenWithButton` 改为复用它）。选中后 `workspacesApi.openFile({ action: "open", applicationId })`。列表为空时这一项不显示。
- 「在 Finder 中显示」：`workspacesApi.openFile({ action: "reveal" })`。
- 一行轻提示：“推荐安装 VS Code 打开代码文件”，附下载链接 `https://code.visualstudio.com/`，经现有安全外链打开。只在 `listOpenTools` 显示 VS Code `available: false` 时出现。

### 什么时候算“打不开”

`shell.openPath` 在 macOS 上对没有关联应用的文件会不会返回错误字符串，需要实机确认（盘点时未验证）。步骤 1 先做这个确认，按结果二选一：

- 返回错误字符串：main 把这个错误映射为新错误码 `no_application`，renderer 收到后弹对话框。
- 不返回错误（系统自己弹框或静默）：renderer 在调用 `openFile` 前先查 `listFileApplications`，列表为空就直接弹我们的对话框，不调用 `openPath`。查询结果按路径扩展名缓存（复用 `useFileApplications` 的缓存）。

两种做法都写进执行过程，并在本文件「决策记录」里记下实际选了哪一种。

## 步骤

行号以 `b590e02f` 为准，动手前复核。

### 1. 确认系统行为

用临时 Electron 脚本或 dev 环境，对一个没有关联应用的扩展名（如 `tmp/x.actspace-probe`）调用 `shell.openPath`，记录返回值和系统是否自己弹框。

### 2. main

- `apps/desktop/src/main/workspace-fs-service.ts`：
  - `renderKindOf`（约 232 行）只返回 `"markdown"`、`"image"`、`"external"`。
  - 删 `HTML_EXTS`、`CSV_EXTS`、`LANGUAGE_BY_EXT`、`LANGUAGE_BY_BASENAME`、`LANGUAGE_BY_BASENAME_PREFIX`、`languageOf`、`listMappedLanguages`（约 50–220 行）。
  - `readWorkspaceFile`：`external` 只返回 stat，不读内容、不做二进制检测；去掉 `language`。
- `apps/desktop/src/main/file-applications-service.ts`：按步骤 1 的结果决定是否新增 `no_application` 错误码。
- `packages/shared/src/ipc.ts`：`WorkspaceFileRenderKind`（约 556 行）改为 `"markdown" | "image" | "external"`；删 `WorkspaceReadFileResult.language`（约 574 行）；不再读文本后若 `binary` 错误无来源则删除；按步骤 1 结果给 `openFile` 错误联合加 `no_application`。

### 3. renderer：删除

- `components/right-panel/HtmlRenderView.tsx`、`CsvRenderView.tsx`。
- `components/right-panel/open-html-in-browser.ts`（由 `open-workspace-path.ts` 取代）。
- 测试：`renderer/test/html-render-view.test.tsx`、`csv-render-view.test.tsx`。

### 4. renderer：修改

- `components/right-panel/workspaceFileTab.ts`：删 `html` / `csv` / 代码文本分支；`external` 不再生成标签。`READ_ERROR_TEXT`、`readFailureTab` 保留。
- `components/right-panel/RightPanelContext.tsx`：删 `html`、`csv` kind（约 30–33 行）和 `text` 标签的 `language?` 字段。
- `components/RightPanel.tsx`：删 `HtmlRenderView`、`CsvRenderView` 的 import 与分支（约 327–329、358–367 行的 `HtmlTab`）；`text` 分支不再传 `language`。
- `components/right-panel/WorkspaceOperationBar.tsx`：`dualViewTab` 只剩 `markdown`。
- `components/right-panel/useFileFreshness.ts`：重载逻辑按新 `tabFromFile` 调整（约 143–147 行）。
- 调用方全部改走 `useOpenWorkspacePath()`：
  - `components/turn-tail/open-turn-file.ts` 的 `openTurnFile`（被 `TurnDeliverables`、`TurnReviewView` 调用）。远端分支保持在最前面不变。`TurnDeliverables` 点卡片主体：Markdown / 图片预览，其他文件直接用默认应用打开，与右侧分体按钮行为一致。
  - `components/conversation/use-workspace-file-links.ts` 的 `openReadFile`（聊天里的文件链接、读文件工具行）。远端分支不变。
  - `components/right-panel/WorkspaceFileTree.tsx` 的 `openFile`（P4 会整体替换，这里先接上路由，保证中间状态可用）。
- `components/turn-tail/OpenWithButton.tsx`：改为复用抽出的关联应用列表组件。

### 5. 测试

- 修改：`main/test/workspace-fs-service.test.ts`（renderKind、去掉 language 映射用例）、`renderer/test/highlight.test.ts`（删与 `listMappedLanguages` 双向锁定的用例）、`workspace-file-freshness.test.tsx`、`workspace-file-target.test.tsx`、`turn-tail.test.tsx`、`turn-output-artifacts.test.tsx`、`app-streaming-user-message.test.tsx`、`conversation-turns.test.ts`、`workspace-file-tree.test.tsx`（html 用例改为“走默认应用”）。
- 新增：`renderer/test/open-workspace-path.test.ts`（四类分流、远端不经过此路由）、`renderer/test/open-file-fallback-dialog.test.tsx`（三项显示条件、选择应用与 Finder 调用参数、VS Code 已安装时不显示提示）。

### 6. 文档

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：改写「文件渲染规则」，删「HTML 渲染与沙箱安全」，补「打开路由与兜底对话框」（或链接到文档面板规范与 01 第 2 节）。
- `front-工作台布局与面板交互规范.md` 中文件预览相关描述。
- 站点 `apps/site/src/content/docs/file-preview.md` 改写。
- `docs/releases/feature-release-notes.md`、`docs/histories/` 各记一条。

## 验证

- 命令：README「统一验证命令」。
- 残留检查：`grep -rn "HtmlRenderView\|CsvRenderView\|open-html-in-browser\|languageOf" apps/desktop/src packages/shared/src` 无命中。
- 手工检查（Electron）：
  - 交付卡、聊天文件链接、读文件工具行分别点 `.md`、`.png`、`.html`、`.pdf`、`.ts`：前两种右侧打开，`.html` 进默认浏览器，`.pdf` 进预览，`.ts` 进关联编辑器；临时改一个无关联扩展名，弹兜底对话框，三项都能用。
  - 浅色、深色下各截一张兜底对话框。

## 风险

- 步骤 1 的系统行为与假设不同。缓解：已写好两种分支，执行时按实测选。
- `TurnDeliverables` 点击主体的行为变化可能让人意外。缓解：与分体按钮保持一致，手工检查时确认。

## 回滚

`git revert` 本子计划的提交（若 P4 已合入，先回滚 P4）。

## 决策记录

- 2026-11-01 步骤 1 实测：用 `tmp/spike-openpath/` 里的临时 Electron 脚本，对 `probe.actspace-probe`（没有任何关联应用的扩展名）调用 `shell.openPath`，约 75ms 返回字符串 `"Failed to open path"`，系统没有自己弹框。
- 选用第一个分支：main 的 `openWorkspaceFile` 把 `openPath` 返回的非空错误串映射为新错误码 `no_application`，renderer 的 `openWorkspacePath` 把它转成 `no_app`，由 `OpenFileFallbackProvider` 弹兜底对话框。不需要在调用前预查 `listFileApplications`。目标文件已由 `resolveTarget` 确认存在，所以这个错误串按「没有可用应用」处理；`openPath` 抛异常和其他失败仍是 `open_failed`。
- 只在 macOS 实测；Windows / Linux 上 `shell.openPath` 的行为未验证，错误串路径对它们同样适用。
- `tabFromFile` 遇到 `external` 不报错，返回一个说明「这类文件不在应用内预览」的 `text` 标签，因为重载旧标签时仍会经过它；正常打开路径在调用它之前就已分流。
- `TurnDeliverables` 卡片主体和本轮改动里「打开整个文件」按钮的标签改为「打开」，不再说「在侧边栏预览 / 打开」，因为非 Markdown / 图片文件现在交给系统打开。
