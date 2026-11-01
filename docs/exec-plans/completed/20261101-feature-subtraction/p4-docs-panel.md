# P4 文档面板

## 目标

右侧「文档」面板取代工作区文件树：右侧是只含 Markdown 的目录树，左侧是 Markdown 正文，可在预览和源码之间切换，源码直接编辑并保存。交互与视觉以[文档面板规范](../../../design-docs/frontend/front-文档面板规范.md)和 demo 方案 A 为准。Review 标签同时改名为「改动」。

## 范围

- 包含：Markdown 清单 IPC、Markdown 写入 IPC、文档面板组件（树 + 正文 + 操作栏 + 大纲 + 源码编辑）、绿点与「本会话改过」筛选、Mermaid 复用、入口改指向、标签改名、删除旧文件树与 `listDir`、测试、文档。
- 不包含：新建 / 重命名 / 删除；保存冲突检测；“渲染做精”（frontmatter、提示框、标题锚点、相对链接与图片、数学公式，以后单独立项）；更好的编辑器；正文全文搜索；文件监听；远端 Host 会话（面板只在本机会话出现）。

## 必读

- `AGENTS.md`
- [文档面板规范](../../../design-docs/frontend/front-文档面板规范.md)（逐条实现，冲突时以规范为准）
- demo：`docs/design-docs/frontend/md-file-tree-demo.html`，用浏览器打开，选方案 A，对照浅色和深色
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`「Markdown 渲染」「文件新鲜度与重新加载」
- `docs/design-docs/frontend/front-主题与配色规范.md`
- 依赖 P3 的 `components/files/open-workspace-path.ts`

## 设计要点（规范之外的实现决定）

1. **整棵清单一次取回，在 renderer 组装成树。** 不再逐层懒加载目录：Markdown 清单只是相对路径，几千条也只有几百 KB，一次取回才能做到“隐藏不含 Markdown 的文件夹”和全树搜索。
2. **新 IPC `workspaces.listMarkdownFiles`。**
   - 入参 `{ workspaceRoot: string }`。
   - 返回 `{ ok: true; files: string[]; truncated: boolean; source: "git" | "walk" } | { ok: false; error: "not_found" | "not_a_directory" | "escapes_root" }`。
   - git 仓库：`runGitCommand`（`apps/desktop/src/main/git/run-git.ts`）执行 `git ls-files -z --cached --others --exclude-standard -- '*.md' '*.markdown'`，结果去重排序。
   - 非 git 仓库：递归遍历，跳过沿用 `workspace-fs-service.ts` 的 `IGNORED_DIR_NAMES` 再加所有以 `.` 开头的目录；不跟随 symlink 目录。
   - 上限：最多返回 5000 篇；遍历最多访问 50000 个目录项。超过即停止并返回 `truncated: true`。
   - 越界校验复用 `toInsideRoot`。
3. **绿点数据来自 `collectEditedFilePaths`**（`components/workbench/edited-files.ts`，已被 `WorkbenchLayout` 使用），过滤出 Markdown 后转成 Set 传给面板。不新增后端能力。
4. **预览复用现有渲染。** `MarkdownRenderView` 保持现有渲染栈，加上 `messages/MermaidDiagramBlock.tsx` 渲染 Mermaid 代码块，复用 `messages/markdown-blocks.ts` 的 `splitMarkdownBlocks` 做分块渲染。
5. **源码编辑用原生 `<textarea>`，不加依赖。** 封装为 `MarkdownSourceEditor`（props：`value`、`onChange`、`onSave`、`readOnly`），以后单独优化 Markdown 时整体替换这个组件即可。
6. **新 IPC `workspaces.writeMarkdownFile`。** 入参 `{ workspaceRoot, relativePath, content }`；只允许已存在的 `.md` / `.markdown`，越界校验复用 `toInsideRoot`，不跟随 symlink 写到工作区外；写临时文件再 rename；返回 `{ ok: true; mtimeMs; size } | { ok: false; error: "not_found" | "escapes_root" | "not_markdown" | "write_failed" }`。不做 mtime 冲突检测（以人为准）。契约、channel、handler、guard、api、mock 五处同步加。
7. **截断文件只读。** `readFile` 返回已截断时，源码状态为只读并提示“文件过大，请用默认应用编辑”。

## 步骤

行号以 `b590e02f` 为准，动手前复核。

### 1. main 与契约

- `apps/desktop/src/main/workspace-fs-service.ts`：新增 `listWorkspaceMarkdownFiles(workspaceRoot, { runGit })`。
- `packages/shared/src/ipc.ts`：新增 `WorkspaceListMarkdownFilesInput` / `WorkspaceListMarkdownFilesResult`。
- `packages/shared/src/desktop-bridge/contract.ts`、`packages/shared/src/runtime-v2/fixed-renderer.ts`：新增 `workspaces.listMarkdownFiles` 与 channel。
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`：注册 handler（`listDir` 旁边，约 90 行）。
- `apps/desktop/src/main/ipc/guards.ts`：加入参 guard（参照 `listDir`，约 82 行）。
- `apps/desktop/src/renderer/api/workspaces.ts`、`mock/handlers.ts`：加方法与 mock 数据（mock 用 demo 里的目录结构）。
- 测试：`main/test/workspace-fs-service.test.ts` 新增 git 仓库（含被 `.gitignore` 忽略的 md、未跟踪的新 md）、非 git 仓库、超上限截断、越界四类用例。

### 2. renderer 组件

新建目录 `apps/desktop/src/renderer/components/right-panel/docs/`：

| 文件 | 职责 |
|---|---|
| `DocsPanel.tsx` | 面板外壳：左正文、右树，树可收起，面板全屏切换 |
| `DocsTree.tsx` | 树、搜索框、「全部 / 本会话改过」筛选、刷新按钮、图例、截断提示 |
| `docs-tree-model.ts` | 纯函数：路径清单 → 树（文件夹篇数、排序、按筛选和搜索裁剪、自动展开匹配项） |
| `DocsReader.tsx` | 操作栏（路径 + 未保存圆点、预览 / 源码、大纲、Finder、默认应用、复制路径、收起树）+ 正文 + 新鲜度提示条 + 空状态 |
| `DocsOutline.tsx` | 大纲浮层：本页 h2 / h3，点击平滑滚动 |
| `MarkdownSourceEditor.tsx` | 原生 textarea：等宽、自动换行、Tab 插入两个空格、⌘S / Ctrl+S 调用 `onSave`、`readOnly` |
| `use-docs-draft.ts` | 当前文档的草稿状态：原文、草稿、是否未保存、保存（调用 `writeMarkdownFile` 后更新新鲜度基线 mtime） |

- 样式：新增 `apps/desktop/src/renderer/styles/docs-panel.css`（或沿用现有 `markdown-prose` 所在样式文件），只用 token；绿点用 operational 语义色。
- 未保存离开：切换文档、关闭「文档」标签时，有未保存内容则用 `components/ui/ConfirmDialog.tsx` 提示「保存 / 不保存 / 取消」。
- 草稿与预览：切回预览渲染的是草稿内容。编辑期间 Agent 改了文件，照常显示“已变化”提示条，不替换草稿；保存后更新基线，提示条消失。
- 状态：`RightPanelContext.tsx` 中
  - `expandedDirs` 保留并改为文档树使用。
  - `dirCache`、`workspaceDirCacheKey` 删除，改为 `markdownFiles` 缓存（按 workspaceRoot）。
  - 新增 `docsTreeCollapsed`、`docsFilter`。
  - `isSourceShown` / `setSourceShown` 改为文档面板的预览 / 源码状态；每次打开新文档重置为预览。
  - `fileTreeRefreshKey` 改名 `docsRefreshKey`。
- 清单刷新时机：打开「文档」标签时、`agent_run_finished` / `aborted` / `failed` 时（在 `App.tsx` 现有收尾处 `refreshReviewSummary` 旁边递增 `docsRefreshKey`）、点树顶刷新按钮时。
- 新鲜度：沿用 `useFileFreshness.ts`。

### 3. 入口与标签

- 右侧面板标签：`kind: "docs"`（取代原文件树入口），标题「文档」；`kind: "review"` 的标题从「Review」改为「改动」。改 `components/RightPanel.tsx` launcher（约 416、423 行）、`RightPanelObjectMenu.tsx`（约 50 行 `openFileTree` → `openDocs`），以及所有写死“Review”文案的地方（`grep -rn "\"Review\"" apps/desktop/src/renderer`）。
- `components/files/open-workspace-path.ts`：Markdown 分支改为打开文档面板并选中、展开到该文件（不再打开独立 `markdown` 标签）。
- `kind: "markdown"` 标签：确认已无生产来源后删除；`remoteArtifact.ts` 若仍生成 `markdown` 标签，则保留该 kind 给远端使用，本机不再产生。

### 4. 删除

- `components/right-panel/WorkspaceFileTree.tsx`。
- `components/right-panel/PreviewSourceToggle.tsx`：保留，文档面板复用它做「预览 / 源码」切换。
- `workspaces.listDir` 全链路（contract、channel、handler、guard、api、mock、`listWorkspaceDir`、`WorkspaceListDir*` 类型）：先 `grep -rn "listDir\|listWorkspaceDir" apps packages` 确认只剩旧文件树一个调用方，再删。
- `components/right-panel/WorkspaceOperationBar.tsx`：只剩文档面板用到的部分则并入 `DocsReader.tsx`，否则保留。
- `components/files/FileTypeIcon.tsx` 等图标**保留**（`TurnDeliverables`、`TurnChangesCard` 在用）。

### 5. 测试

- 删除 / 改写：`renderer/test/workspace-file-tree.test.tsx` 改写为 `docs-panel.test.tsx`。
- 新增：
  - `docs-tree-model.test.ts`：隐藏无 Markdown 文件夹、篇数、排序、搜索高亮与自动展开、「本会话改过」裁剪。
  - `markdown-source-editor.test.tsx`：Tab 插入空格、⌘S / Ctrl+S 触发保存、只读时不可改。
  - `docs-panel.test.tsx`：默认预览；切到源码修改后出现未保存圆点，预览显示草稿；保存调用 `writeMarkdownFile` 后圆点消失；未保存时切换文档弹确认；截断文件源码只读；打开交付卡里的 `.md` 会选中并展开到该文件；绿点只标本会话改过的；空状态三种；大纲点击滚动。
  - `main/test/workspace-fs-service.test.ts` 增加写入用例：正常写入、非 Markdown 拒绝、不存在拒绝、越界与 symlink 逃逸拒绝。
- 修改：涉及标签名「Review」「文件」的断言（`right-panel-review.test.tsx`、`right-panel-object-menu.test.tsx` 等）。

### 6. 文档

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：「Workspace 文件浏览器」整节改为链接到文档面板规范；「Markdown 渲染」更新为增强后的能力。
- `docs/design-docs/frontend/front-文档面板规范.md`：状态改为“已实施”，补实际文件路径。
- `front-工作台布局与面板交互规范.md`：标签名「文档」「改动」。
- 站点 `file-preview.md`、`review.md` 中的标签名。
- `docs/releases/feature-release-notes.md`、`docs/histories/`。

## 验证

- 命令：README「统一验证命令」。
- 浏览器 mock：`pnpm --filter @actspace/desktop dev` 的 mock 模式打开文档面板，浅色 / 深色各截一张，与 demo 方案 A 对照。
- 手工检查（Electron，以本仓库为工作区）：
  - 树里看得到 `docs/` 的完整层级，看不到 `node_modules` 下的 README，没有空文件夹。
  - 让 Agent 改一篇 `.md`：本轮结束后出现绿点，「本会话改过」只剩它；正在阅读该文件时出现“已变化”提示条。
  - 打开一篇含表格、任务列表、Mermaid、代码块的文档，正常渲染；大纲跳转正确。
  - 切到源码改几行，⌘S 保存，用 `git diff` 确认只改了这几行；中文输入法输入正常；未保存时切换文档出现确认。
  - 在一个非 git 目录、和一个 Markdown 超过 5000 篇的目录分别打开，前者能列出、后者出现截断提示。
- 性能观察：在本仓库（约 1800 篇 Markdown）记录 `listMarkdownFiles` 耗时，写入执行过程。

## 风险

- 大仓库清单过大。缓解：5000 篇和 50000 目录项两道上限，超出给提示。
- 写入接口被滥用写到工作区外。缓解：只允许已存在的 Markdown，越界和 symlink 校验，main 侧测试覆盖。
- 截断文件被保存导致丢内容。缓解：截断即只读。
- 标签改名漏改文案。缓解：步骤 3 的 grep。

## 回滚

`git revert` 本子计划的提交；旧文件树与 `listDir` 随之恢复。
