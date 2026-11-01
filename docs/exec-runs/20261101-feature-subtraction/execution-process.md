# 架构优化（功能减法 + 插件结构） — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261101-feature-subtraction/README.md`（P1–P5）、`docs/exec-plans/active/20261101-plugin-structure/README.md`（S1–S4）
- **执行模式**：连续执行（用户 2026-11-01 同意两步一起做完；每个子计划本地提交一次，不推送）
- **开始时间**：2026-11-01
- **结束时间**：进行中

## 执行时间线

### 基线

- **操作**：在 `18155df5`（只含设计与计划文档）上跑统一验证命令，记录已知失败。
- **验证**：见下方“基线结果”。

#### 基线结果

前提：desktop / client 的测试和类型检查依赖包的构建产物，先跑 `pnpm --filter @actspace/desktop build:deps:dev`。没有构建产物时这三项会报 “Cannot find module '@actspace/shared'”，不是代码问题。

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过 |
| `pnpm --filter @actspace/client test` | 通过 |
| `pnpm --filter @actspace/desktop test` | 通过 |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm --filter @actspace/runtime test` | 通过 |
| `pnpm check:ipc-channels` / `check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:packages` / `check:desktop-build-graph` | 通过 |
| `pnpm test:contract-matrix` | **已知失败**：`agent-contract-matrix.generated.md` 在 main 上已过期（S1 会重新生成） |
| `pnpm check:current-docs` | **已知失败**：363 条，全部在 `docs/exec-runs/`（不进 git 的截图和 `tmp/` 链接） |

### P1 删除「转成可视化 HTML」

- **操作**：按 `p1-visualize-removal.md` 删除整个功能。
  - 删整文件 3 个：`fixed-renderer-visualization.ts`、`ReplyHtmlRenderView.tsx`、`api/visualize.ts`。
  - 契约：`contract.visualize`、`fixed-renderer.ts` 的 `visualizeReply` / `listVisualizations` channel 常量、`ipc.ts` 里五个类型、main 的两个 handler。
  - renderer：`TurnActions` 去掉可视化按钮、状态机和「重新生成可视化」菜单项（`useRightPanel`、`useRef` 等随之变成未使用的 import，一并删）；`RightPanel` 去掉 `replyHtml` 分支和启动页入口；`RightPanelObjectMenu`、`RightPanelContext` 去掉 Reply；mock、`session-background-runs` fixture 去掉 `visualize`。
  - 测试：`conversation-view-tooltip.test.tsx` 删 2 个可视化用例；10 个 App 级测试的 bridge stub 删 `visualize.*`；`chat-presentation-recovery.test.tsx` 的「+」菜单项断言去掉「可视化回复」。
  - 文档：右侧面板规范删「Reply 视图」「消息可视化转换」并把入口数改为四个；工作台布局规范、存储与观测、icon-button、基础组件封装、tech-debt-tracker、`desktop-frontend-refactor/04、05` 里的相关引用同步改；`feature-release-notes.md` 新增 2026-11-01 条目（只能用「改进」分类）；新增 `docs/histories/2026-11/20261101-1600-remove-visualize-reply.md`。
- **影响文件**：删 3 个；改约 38 个。`apps/desktop/tsconfig.electron.json` 是 glob 白名单，没有 `fixed-renderer-visualization.ts` 的条目，无需改；没有 `guards.ts` 条目。
- **决定**：
  - `scripts/native-button-baseline.json` 除了删 `ReplyHtmlRenderView.tsx` 一行，还把 `TurnActions.tsx` 从 3 收紧到 2（检查脚本提示；删按钮后原生 button 少了一个）。`PurposePicker.tsx` 的同类提示在本任务之前就有，不动。
  - 新建 `docs/histories/2026-11/` 目录（此前没有 11 月目录）。
  - Space 演示里的 mock「可视化回复」标签（`components/space/model/selectors.ts`、`panel-kind-icons.tsx`、`SpaceReviewView.tsx`、`space-panel.test.tsx`）不动，遵循 README 实施细节第 6 条「Space 演示不动」。
  - `registry.completeText`、`HtmlRenderView.tsx` 保留（后者 P3 处理）。
- **验证**（先跑 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（181） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（264 文件，2084 用例；首次跑有 1 个失败，见「遇到的问题」） |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |
| `pnpm check:ipc-channels` | 通过（契约 153 个 channel） |
| `pnpm check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:docs` / `check:current-docs` | 仍是 363 条已知失败，全部在 `docs/exec-runs/`，无新增 |
| `pnpm --filter @actspace/site test`（更新日志解析） | 通过（31） |
| 残留检查：对 `apps/desktop/src`、`packages/shared/src` grep `visualiz`、`replyHtml`、`ReplyHtml` | 无命中 |

### P2 删除内置终端

- **操作**：按 `p2-terminal-removal.md` 删除内置终端。
  - 先改名：`RunTargetCapabilities.terminal` → `workspacePanels`（`run-target.ts`、`WorkbenchLayout.tsx`、`run-target.test.ts`）。
  - 删整文件/目录：`main/terminal/` 整个目录（6 个源文件 + `test/`）、renderer 6 个文件（`TerminalRenderView.tsx`、`terminal-render-loader.ts`、`terminal-theme.ts`、`terminal-title.ts`、`useOpenTerminal.ts`、`api/terminal.ts`）、3 个终端测试、`scripts/experiments/terminal-native-spike/`、`front-右侧终端与会话生命周期规范.md`、站点 `terminal.md` 和 `terminal.png`。
  - main：`index.ts`（服务创建、`closeOwnedTerminals`、`disposeAll`、`hasNodePty()`、`webContents` import）、`main-lifecycle.ts`（`attachWindowLifecycle` 只剩 `onClosed`）、`desktop-shell-ipc.ts`（8 个 handler 和两个 options 字段）、`guards.ts`（2 条）、`tsconfig.electron.json`（5 条）。
  - 契约：`contract.terminal`、`events.terminal`、`fixed-renderer.ts` 的 9 个 channel、`ipc.ts` 的 `TERMINAL_LIMITS` 和全部 `Terminal*` 类型。
  - renderer：`RightPanel.tsx`（终端标签同步 effect、`closeRightTab` 的终端分支、三个终端 body 分支、启动页项、两个视图；终端关闭是唯一的异步关闭，所以 `closingTabIds` / `closeErrors` 状态一并去掉，关闭直接调 `closeTab`）、`RightPanelContext.tsx`、`RightPanelObjectMenu.tsx`、`mock/handlers.ts`、`native-button-baseline.json`。
  - 依赖与打包：`apps/desktop/package.json` 删 `@xterm/addon-fit`、`@xterm/xterm`、`node-pty`；`pnpm-workspace.yaml` 删 `node-pty: true`；`pnpm install`（lock 减 31 行、4 个包）；`release-package.sh` 删 spawn-helper 检查块。
  - 文档：`ARCHITECTURE`、前端规范（README、工作台布局、右侧面板、preload-bridge、新功能清单、chinese-ui）、`FRONTEND_VERIFICATION`、`SECURITY`、`QUALITY_SCORE`；站点 `CONTENT_SOURCES.md`、`bash` / `file-preview` / `first-task` / `what-is-actspace` / `sessions` / `troubleshooting` / `tools-and-approvals` / `agent-turn` / `settings-and-data`、`home-features.ts`、`screenshots.json`；更新日志追加；新增 `docs/histories/2026-11/20261101-1700-remove-builtin-terminal.md`。
- **影响文件**：删约 40 个（含整目录），改约 50 个。
- **决定**：
  - 改名和删除没有拆成两个提交：用户要求每个子计划本地提交一次，这里不单独提交，改名在同一个工作区里先做先测。
  - `RightPanelTabStrip` 的 `closing` / `closeHint` 属性现在没有调用方，保留（Space 右栏共用该组件），只改了注释。
  - 首页 `home-features.ts` 的「终端」卡片改成指向 `bash` 页的「Bash」卡片；`Hero.astro`、`home-stage.ts` 里的营销动画文案描述的是 Agent 执行命令，不动。
  - `desktop-bridge-contract-types.test.ts`、`mock-bridge.test.ts` 删终端断言；`mock-bridge.test.ts` 的「没有 mock 实现的成员会 reject」用例改用 `updates.start`。
  - 旧文档里的历史描述（`desktop-frontend-refactor/`、`histories/`、`exec-runs/`、`design-docs/架构优化/01`）不改。`agent-contract-matrix.generated.md` 是生成文档且基线已过期，不手改（S1 重新生成）。
  - Space 演示的 `SpaceTerminalView`（mock）不动，所以残留检查里仍有一处 `xterm` 字样的注释。
- **验证**（先跑 `pnpm install` 与 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（181） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（259 文件，2070 用例） |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |
| `pnpm typecheck` | 通过（先发现 P1 遗留问题，见「遇到的问题」） |
| `pnpm --filter @actspace/runtime test` | 通过（85） |
| `pnpm check:ipc-channels` | 通过（契约 144 个 channel） |
| `pnpm check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:packages` / `check:desktop-build-graph` | 通过 |
| `pnpm check:docs` / `check:current-docs` | 仍是 363 条已知失败，全部在 `docs/exec-runs/`，无新增 |
| `pnpm --filter @actspace/site test` / `pnpm check:site` | 通过（31）/ 0 errors |
| `pnpm --filter @actspace/desktop build` | 通过 |
| `bash -n scripts/release-package.sh` | 语法通过；未实测完整打包 |
| 残留检查：`grep -rni "xterm\|node-pty\|terminalApi\|TerminalSession" apps packages scripts` | 只剩 `SpaceTerminalView.tsx`（Space mock，计划允许） |
### P3 文件打开收敛

- **操作**：按 `p3-file-open-convergence.md` 收敛文件打开方式。
  - 步骤 1 实测（`tmp/spike-openpath/` 临时 Electron 脚本，不进 git）：对没有关联应用的 `probe.actspace-probe` 调用 `shell.openPath`，约 75ms 返回 `"Failed to open path"`，系统不弹框、不挂起。据此选用计划里的第一个分支（main 映射为 `no_application`），不预查 `listFileApplications`。只在 macOS 实测，其他平台未验证。
  - main：`workspace-fs-service.ts` 删 `HTML_EXTS`、`CSV_EXTS`、全部语言映射表、`languageOf`、`listMappedLanguages`，`renderKindOf` 只返回 `markdown` / `image` / `external`；`readWorkspaceFile` 对 `external` 只返回 stat，不读内容、不做二进制检测；`file-applications-service.ts` 把 `openPath` 的错误串映射为 `no_application`。
  - shared：`WorkspaceFileRenderKind` 改为三值，删 `WorkspaceReadFileResult.language` 和读文件的 `binary` 错误，`WorkspaceOpenFileResult.error` 加 `no_application`。
  - 新增：`components/files/open-workspace-path.ts`（`classifyWorkspaceFile`、`openWorkspacePath`）、`open-file-fallback-context.tsx`（`OpenFileFallbackProvider`、`useOpenWorkspacePath`）、`OpenFileFallbackDialog.tsx`、`ApplicationLabel.tsx`（从 `OpenWithButton` 抽出的应用图标和名称行，交付卡下拉和兜底对话框共用）；`WorkbenchLayout` 挂 Provider；`canChooseApplication` 从 `TurnDeliverables` 移到 `useFileApplications.ts` 共用。
  - 删除：`HtmlRenderView.tsx`、`CsvRenderView.tsx`、`open-html-in-browser.ts`、`html-render-view.test.tsx`、`csv-render-view.test.tsx`。
  - renderer 修改：`workspaceFileTab.ts`、`RightPanelContext.tsx`（删 `html`、`csv` kind 和 `text.language`）、`RightPanel.tsx`（删两个视图分支和 `HtmlTab`）、`WorkspaceOperationBar.tsx`（`dualViewTab` 只剩 markdown）；`open-turn-file.ts`、`use-workspace-file-links.ts`、`WorkspaceFileTree.tsx`、`TurnReviewView.tsx`、`TurnDeliverables.tsx` 全部改走 `useOpenWorkspacePath()`，远端分支保持在最前面不变。`useFileFreshness.ts` 的重载逻辑沿用 `tabFromFile`，不需要改。
  - 脚本：`scripts/check-frontend-theme-colors.mjs` 去掉 `HtmlRenderView` 的必需字面量例外；`scripts/native-button-baseline.json` 删 `CsvRenderView` 条目。
  - mock：`turn-deliverables` 场景的 `readFile` 改为 markdown / external，并让 `docs/chart.json` 模拟「没有关联应用」、VS Code 模拟未安装，用来验收兜底对话框。
  - 文档：`front-右侧面板与文件渲染规范.md`（改写文件渲染规则，新增「文件打开路由与兜底对话框」，删 CSV、HTML 沙箱两节和语言映射条目）、`front-工作台布局与面板交互规范.md`、`front-icon-button-tooltip-guidelines.md`、站点 `file-preview.md`；更新日志追加；新增 `docs/histories/2026-11/20261101-1240-file-open-convergence.md`。
- **影响文件**：删 5 个，新增 4 个源文件和 2 个测试，改约 30 个。
- **决定**：
  - `tabFromFile` 遇到 `external` 返回一个说明性的 `text` 标签，而不是抛错或返回 null：重载旧标签（例如读取失败标签）时仍会走到它，正常打开路径在它之前已分流。
  - `TurnDeliverables` 卡片和「打开整个文件」按钮的标签、悬停文字改为「打开」（原为「在侧边栏预览 / 打开」），避免对交给系统打开的文件说谎；对应测试的名称同步改。
  - 没有 Provider 时（单测、独立挂载）`useOpenWorkspacePath()` 退回不弹对话框的路由。
  - 测试里需要「读到文本内容」的用例（新鲜度、目标归属、文件树、IPC 沙箱）改用 `.md` 文件，因为其他扩展名不再读内容。
- **验证**（先跑 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（181） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（见「遇到的问题」里一次偶发的销毁后报错） |
| `pnpm --filter @actspace/desktop typecheck` / `pnpm typecheck` | 通过 |
| `pnpm check:ipc-channels` / `check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| `pnpm check:docs` / `check:current-docs` | 仍是 363 条已知失败，全部在 `docs/exec-runs/`，无新增 |
| `pnpm --filter @actspace/site test` / `pnpm check:site` | 通过（31）/ 0 errors |
| 残留检查：`grep -rn "HtmlRenderView\|CsvRenderView\|open-html-in-browser\|languageOf" apps/desktop/src packages/shared/src` | 无命中 |
| 兜底对话框截图 | 浏览器 mock（`?mock=turn-deliverables`，点 `docs/chart.json` 交付卡），Chrome headless 经 CDP 截浅色、深色各一张（`tmp/p3-fallback-light.png`、`tmp/p3-fallback-dark.png`，不进 git），两种主题都正常 |

### P4 文档面板

- **操作**：按 `p4-docs-panel.md` 实施，规范 `front-文档面板规范.md` 为准。
  - 后端：`workspaces.listMarkdownFiles`（git 仓库用 `git ls-files --cached --others --exclude-standard`，否则有上限的遍历；上限 5000 篇、50000 个目录项）和 `workspaces.writeMarkdownFile`（只写已存在的 `.md`、realpath 包含校验、临时文件加 rename）。契约、guard、handler、主进程服务都加了单测（共 63 个用例）。
  - renderer 新增 `components/right-panel/docs/` 共 10 个文件（`DocsPanel`、`DocsReader`、`DocsTree`、`DocsOutline`、`DocsLeaveDialog`、`MarkdownSourceEditor`、`docs-tree-model`、`use-docs-draft`、`use-docs-listing`），以及 `mock/docs-fixture.ts`。
  - 状态放进 `RightPanelContext`（选中、草稿、模式、展开、筛选、清单、离开确认），`markdown` 这种 Tab 类型删除，新增唯一的 `docs` Tab（id 固定为 `docs`，`select` 是一次性请求，由 `openTab` 剥掉）。
  - `MarkdownRenderView` 只留 `MarkdownPreviewBody`：块级 `memo` 分块渲染，闭合的 mermaid 围栏复用聊天区的 `MermaidDiagramBlock`，表格放进 `.markdown-table-wrap`，`.markdown-doc` 的网格列改成 `minmax(0, 1fr)`。
  - `open-workspace-path.ts` 的 Markdown 分支改成 `statFile` 后打开文档 Tab 并选中；`WorkspaceOperationBar` 瘦身为面包屑加外部打开菜单加过期提示条；删 `WorkspaceFileTree.tsx` 和 `listDir` 整条链（契约、guard、handler、`workspace-fs-service`、mock、测试）。
  - 「文件」标签改名「文档」，「Review」改名「改动」（菜单、启动页、标签标题、测试断言）。
  - `SplitView` 新增 `rightExpanded`，`WorkbenchLayout` 在文档 Tab 激活时传入，让右栏盖住聊天区；文档 Tab 另有自己的默认宽度 720px（拖宽只记在文档 Tab 上）。
  - 文档：规范状态改「已实施」并补实施位置表；`front-右侧面板与文件渲染规范.md`（文件浏览器一节改成链接，Markdown 渲染一节更新）、`front-工作台布局与面板交互规范.md`、站点 `file-preview.md` 和 `review.md`；更新日志追加；新增 `docs/histories/2026-11/20261101-2000-docs-panel.md`。
- **影响文件**：删 2 个源文件和测试（`WorkspaceFileTree.tsx`、`workspace-file-tree.test.tsx`）；新增约 11 个源文件和 5 个测试；改约 35 个。
- **决定**：
  - 文档状态（选中、草稿、展开层级、清单）放 Provider 而不是组件里：面板会随切标签、收起右栏反复卸载。离开确认对话框挂在 `RightPanel` 外壳上：从标签栏关闭「文档」时面板可能没挂载。
  - 新鲜度做成文档面板自己的 `use-docs-draft.ts`，不复用文件 Tab 的 `useFileFreshness`：要同时处理未保存草稿，且 Agent 编辑信号只在「这篇刚被新加进改过集合」时才算（否则打开一篇本会话早就改过的文档会立刻误报已变更）。
  - 清单在 turn 结束时随 `fileRevalidateKey` 刷新，没有另加刷新计数；树顶刷新按钮用 `docsRefreshKey`。
  - 操作栏在面板窄时（容器宽度小于 460px）收起三个次要操作。
  - 原生按钮基线：`DocsTree.tsx` 两个（目录行、文件行，行内含图标、名称、计数、绿点，不是普通按钮）；`WorkspaceOperationBar.tsx` 从 2 降到 1；删 `WorkspaceFileTree.tsx`；脚本顺带把 `PurposePicker.tsx` 从 3 收紧到 2（上一轮遗留的可收紧项），整个 JSON 被脚本重新排了序，所以 diff 看起来很大。
- **验证**（先跑 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（181） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（2113 通过、7 跳过） |
| `pnpm --filter @actspace/desktop typecheck` / `pnpm typecheck` | 通过 |
| `pnpm check:ipc-channels` | 通过（契约 145 个 channel） |
| `pnpm check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` | 通过 |
| 截图 | 浏览器 mock（`?mock=turn-deliverables`，打开右侧面板的「文档」），Chrome headless 经 CDP：`tmp/p4-docs-light.png`、`tmp/p4-docs-dark.png`、`tmp/p4-docs-source-dirty.png`（源码编辑加未保存圆点），不进 git |
| `listMarkdownFiles` 耗时 | 本仓库 1989 篇 Markdown，git 路径冷启动 46.5ms、热 32–33ms（esbuild 打包后在 Node 里直接调用，不含 IPC） |

### P5 Git Review 只留查看

- **操作**：按 `p5-review-trim.md` 实施。
  - 删除：`review-view-state-service`、`review-pr-service`、`review-git-service`、`review-workspace-watcher`、`review-ignore-filter` 及各自测试；`tsconfig.electron.json` 去掉对应条目。
  - 契约：`review` 域只留 getSnapshot、refreshSnapshot、getFileDiffs、getFileContents、listBranches、listCommits；删 stage / revert / viewed / PR / copy-apply / initGit 共 6 个 channel（契约从 145 降到 139）。`ReviewCapabilities` 改成 `{ canLoadFullFile }`，去掉 `ReviewFileSummary.viewed`、`ReviewSelection.lastTurn`、`ReviewHunk.patchFingerprint`；`ReviewChangeNotification.reason` 只剩 `"refresh"`。
  - main：`ReviewGitEngine` 只读（删 mutation、`createPatch`、lastTurn、旧 snapshot/diff 缓存）；`ReviewCoordinator` 只剩 `{ resolveWorkspace, queryProvider }`，`refreshSnapshot` 是唯一递增 generation 并广播 `reviewChanged` 的路径。
  - renderer：去掉 Review 内的 git 菜单、提交 / PR 对话框、hunk 和文件级 stage / revert、viewed、copy apply、「最近一轮」；非 Git 目录文案改成「当前目录不是 Git 仓库」。
  - 强制刷新：review store 挂载时 `loadSnapshot(sel, true)`；`reviewChanged` 通知 generation 与当前快照相同则跳过；`useReviewSummary.load(force)` 强制时走 `refreshSnapshot`，`refreshReviewSummary` 默认强制，切目标强制，排队中任一次强制则后续补查按强制。
  - 文档：`core-review-change-sources.md` 重写相关章节并新增「刷新时机」；`core-review-large-diff-loading.md`、右侧面板 / 输入框 / Environment 规范、`ARCHITECTURE.md`、设计文档索引、站点 `review.md`、旧 learning 一并同步；更新日志追加；新增 `docs/histories/2026-11/20261101-2200-review-view-only.md`。
- **影响文件**：删 5 个源文件和 5 个测试；改约 40 个（main、shared、renderer、测试、夹具、文档）。
- **决定**：
  - 去掉 coordinator 的公开 `invalidate()`，测试改用 `refreshSnapshot`，对应计划的「唯一递增 generation 的路径」。
  - `onReviewChanged` 从面板 prop 链（`ReviewRenderView`、`RightPanel`、`WorkbenchLayout`）删掉，面板内已无人调用；`WorkbenchLayout` 自己的 `onReviewChanged` 仍用于打开改动 Tab 和顶部菜单。
  - `ReviewHunk` 的指纹留作 `parseReviewPatchHunks` 内部局部量，只用于生成 id。
  - `ReviewCapability` 联合类型整个删掉。
  - 强制刷新自己的广播可能让摘要多排一次便宜的缓存读取，不再另加「忽略在途通知」规则。
- **验证**（先跑 `pnpm --filter @actspace/desktop build:deps:dev`）：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @actspace/shared test` | 通过（180） |
| `pnpm --filter @actspace/client test` | 通过（56） |
| `pnpm --filter @actspace/desktop test` | 通过（2093 通过、7 跳过） |
| `pnpm --filter @actspace/desktop typecheck` / `pnpm typecheck` | 通过 |
| `pnpm check:ipc-channels` | 通过（契约 139 个 channel） |
| `check:renderer-bridge` / `check:frontend-tokens` / `check:frontend-theme` / `check:packages` / `check:desktop-build-graph` | 通过；原生按钮基线用 `--update-native-button-baseline` 收紧（Review 各文件下降） |
| `pnpm --filter @actspace/desktop build` | 通过 |
| 残留 grep（`initGit`、`setFileViewed`、`applyMutation`、已删服务名、`lastTurn`、`copyGitApply`） | `apps/desktop/src`、`test-fixtures`、`packages/shared/src`、`scripts` 无命中（`apps/web` 里的 `lastTurn` 是无关局部变量） |

### S1 包搬家与改名

- **操作**：按 `docs/exec-plans/active/20261101-plugin-structure/s1-package-move.md` 实施，一次性脚本 `tmp/s1-move.mjs`（不进 git）。
  - 搬目录：设计 §4 表里的 62 个现有包全部对上（P1–P5 没有删包）。其中 `core/agent`、`core/agent-loop`、`core/scope` 目录不变，实际搬了 59 个，改名 16 个（`core-agent`→`agent`、`core-agent-loop`→`agent-loop`、`core-scope`→`scope`、`tools-runtime`→`tool-runtime`、`session-jsonl`→`session-persistence-jsonl`、`tools-filesystem-*`→`tool-fs-*`、`tools-shell-tools`→`tool-shell`、`tools-web-tools`→`tool-web`、`tools-image-*`→`tool-image-*`、`tools-todo-tools`→`tool-todo`、`tools-background-tasks`→`tool-background-tasks`、`tools-approval`→`approval`、`tools-browser-tools`→`tool-browser`）。先 `git mv` 到 `packages/.mv/<n>`，再到终点，避开 `packages/subagent` → `packages/subagent/subagent` 这种终点在起点之下的情况。搬前删掉旧目录里的 `node_modules`、`dist`、`tsbuildinfo`。
  - 相对路径：按旧位置解析每个出包的 `./`、`../` 字面量，映射到新位置后重算（297 处、83 个文件，主要是 `tsconfig*.json` 的 `extends` / `references`；第一级包多一层 `../`；`session-jsonl/src/test/storage.test.ts` 的 `../../../storage/...` → `../../../session-storage/...`）。
  - 包名与路径字符串：单次正则（长名优先，结尾边界 `(?![\w-])`）替换 531 处包名、977 处 `packages/<旧>` 路径，涉及 320 个文件。跳过 `docs/histories`、`docs/exec-runs`、`docs/exec-plans/completed`、`docs/learnings`、两套计划目录、`docs/design-docs/架构优化`、`pnpm-lock.yaml`。`packages/tools/README.md`（旧 `tools/` 目录唯一剩下的文件）删除，目录随之消失；其余旧能力目录 README 先留着，S4 重写。
  - 新包 `@actspace/tool-subagent`（`packages/subagent/tool-subagent`）：`harness-subagent-tools.ts` 用 `git mv` 成 `src/plugin.ts`；`manifest.ts`（plugin id `actspace.subagent-tools`，Entry id `subagent-tools`，provides `tools.subagents`，injects 与 `DEFAULT_HARNESS_ENTRIES` 那行一致）、`index.ts`、`src/test/lifecycle.test.ts`（2 个用例：manifest 与 `inject` 一致；注册 `agent` / `explore`，dispose 后工具消失）。`defaultHarnessEntrySource` 里 `subagent-tools` 改为 `@actspace/tool-subagent/plugin`；`@actspace/runtime` 加依赖和 tsconfig 引用。
  - 新包 `@actspace/skill`（`packages/skill/skill`，纯库）：`catalog.ts`、`discovery.ts`、`discovery.test.ts` 用 `git mv` 搬来，`index.ts` 导出两者；`@actspace/prompt` 的 `index.ts` 不再重导出，`host-context.ts`、`core-contributors.ts`、`skills/contributor.ts`、`output-choice.test.ts` 改从 `@actspace/skill` 导入；prompt 的依赖由 `official-skills` 换成 `skill`（prompt 源码本来就不直接用 `official-skills`）。
  - 根配置：`pnpm-workspace.yaml` 只留 `apps/*` 和 `packages/*/*`；`build-default-harness.mjs` 的 `external` 与 `default-harness.ts` 的 `hostModules` 里的 `@actspace/scope` 由包名替换覆盖，已核对。
  - 生成文件：`node scripts/generate-desktop-build-graph.mjs`（62 个 Desktop 依赖项目，生成脚本顺带按字母序重排了 `runtime` 等包的 `tsconfig.build.json` 引用）；`pnpm gen:contract-matrix`（`scripts/contract-matrix/source-registry.mjs` 补 `tool-subagent` 的 manifest 与两个新包的 `package.json`）。`cordis.yml` 的包名由替换覆盖，与 `TRUSTED_LOADER_ENTRIES` 一致（`test:agent-host:process` 真实启动 Host 通过）。
  - 检查脚本：`check-package-boundaries.mjs` 新增两条规则（包必须正好在 `packages/<能力>/<包>`；目录名等于包名去掉 `@actspace/`），`scripts/test/package-boundaries.test.mjs` 的夹具改成两级目录并新增一个覆盖这两条规则的用例。`check-current-docs.mjs`、`check-package-cutover.mjs`、`check-v2-legacy-removal.mjs` 里的路径由替换覆盖，无需手改。
  - 文档：`packages/README.md` 目录表、`README.md`、`docs/ARCHITECTURE.md`、工具预览设计指南里的路径改成新结构（完整的总地图与各能力 README 留给 S4）。`docs/exec-runs/`、`docs/exec-plans/completed/`、自进化设计文档里 22 条因搬家失效的 Markdown 链接目标已改到新路径（只改链接目标，不改文字），否则 `check:current-docs` 会比基线多 22 条。
  - 新增 `docs/histories/2026-11/20261101-2300-package-layout.md`。
- **影响文件**：`git diff -M --name-status HEAD`：925 个 rename（其中 737 个相似度 100%）、175 个修改、62 个新增 / 53 个删除。新增里 11 个是两个新包的文件（7 个源文件和 `package.json`，4 个 `tsconfig*.json`）；其余新增各对应一个删除，是很短、因相对路径整体改变而相似度低于 50% 的 `tsconfig*.json`（约 51 对）和只有一行的 `todo-projection-plugin.ts`，git 把它们记成删加对；另有 `packages/tools/README.md` 一个纯删除。
- **已持久化 Harness 产物里的 `sharedModules`（步骤 4 的结论）**：写进磁盘了，但不加旧 specifier 兼容。`publishPluginArtifact` 把 `sharedModules`（specifier、绝对 `file:` URL、integrity）写进 `artifact.json`，并把产物 JS 里的外部 import 改写成这些绝对 URL；`verifyPluginArtifact` 每次恢复都重读这些 URL 并校对 integrity，`checkHarnessCompatibility` 还要求产物里的 `sharedModules` 与当前 Host 的逐项相等。所以旧产物在包目录搬走（URL 失效）或 dist 重建（integrity 变）时本来就会失效，改 specifier 只是其中一个原因，给旧 specifier 登记别名救不了它。默认 Harness 每次启动由 `prepareDefaultHarnessArtifact` 从构建产物重新发布，只有用户演进出来的固定（pinned）选择会因 `hostContractDigest` 不一致得到 `RESTART_REQUIRED`，这是原有行为。没有加 `LEGACY_SHARED_MODULE_SPECIFIERS`，也没有补测试。
- **决定与偏离**：
  - `defaultHarnessEntrySource` 原来对剩余条目用 `@actspace/tools-${id}/plugin` 拼名字，改名后拼不出来。改成显式映射表（`tools-runtime`、`tools-approval`、七个工具 Entry、`browser-tools`、`background-tasks`、`subagent-tools` 各一行），并对未知 Entry id 抛错而不是猜名字。整张映射仍由 S2 删除。`tool-contracts.test.ts` 里同样拼名字的 `it.each` 改成直接写新包名。
  - 计划第 3 步说 `apps/desktop/src/main/runtime-v2/fixed-renderer-skills.ts` 要改成从 `@actspace/skill` 导入，实际这个文件只导入 `@actspace/official-skills`，自己带一套读取逻辑，既没用过 `@actspace/prompt` 的 catalog / discovery，也没有别的外部调用方，所以没有改它。
  - 替换脚本把 4 个 DeepSeek Harness 来源注释（`apps/desktop/src/renderer/components/files/*.tsx|ts` 里的 `packages/client/ui-primitives/...`）也当成本仓库路径改成了 `packages/client/client/ui-primitives/...`，发现后已还原这 4 个文件。
  - 搬完后 pnpm 没有刷新 `node_modules/.pnpm/node_modules/@actspace/` 里按旧路径建的隐式提升链接（cordis 加载器的裸 `import()` 靠它解析），Host 进程测试因此在启动时报 `loader entries failed to apply`。删掉 `node_modules/.pnpm/node_modules` 和 `node_modules/.modules.yaml` 后 `pnpm install --offline` 重建即可。这只影响搬家后的本地环境，全新检出不受影响。
  - 清空 `dist` 之后第一次 `build:deps:dev` 会在 `agent-service` 的测试文件上报找不到 `boot`、`composition`、`session-persistence-jsonl`：它的 `tsconfig.json` 把测试也编译，而构建图只看 `dependencies` 不看 `devDependencies`，所以靠别的包先建好 dist 才能过，重跑一次即通过。这是原有的顺序依赖，S1 不改它。
  - 没有跑 `scripts/release-package.sh` 的完整打包。用 `pnpm --filter @actspace/desktop --prod deploy --legacy --offline` 验证了部署：桌面端依赖里带上了 `tool-subagent` 和 `skill`，脚本里没有按旧路径找原生模块或资源的写法。
- **验证**（先 `pnpm install`，再 `pnpm --filter @actspace/desktop build:deps:dev`；`pnpm test` 是一串命令，遇到已知基线失败（`test:current-docs`）会停，所以用 `tmp/s1-test-all.sh` 把每一步都跑完）：

| 命令 | 结果 |
|---|---|
| `pnpm install` | 通过（69 个 workspace 项目） |
| `pnpm typecheck` | 通过 |
| `pnpm test` 逐步 | 全部通过，除 `test:current-docs`（基线：363 条，全在 `docs/exec-runs/`，无新增）；`pnpm -r --if-present test` 通过（含 `apps/desktop` 2093 通过 / 7 跳过、`shared` 180、`client` 56、`core/runtime` 85、`agent-service` 66、新包 `tool-subagent` 2、`skill` 2） |
| `test:contract-matrix` | 通过（重新生成后） |
| `test:package-boundaries` | 通过（含新增的布局用例） |
| `test:agent-host:process` | 通过（7 个，真实起 Host 进程，需先 `pnpm --filter @actspace/agent-cli build`） |
| `check:packages` / `check:desktop-build-graph` / `check:ipc-channels` / `check:renderer-bridge` | 通过（68 个 workspace manifest） |
| `check:docs` / `check:current-docs` | 仍是 363 条已知失败，无新增（搬家后一度是 385，修了 22 条链接目标） |
| `pnpm --filter @actspace/desktop build` | 通过 |
| 残留 grep（`@actspace/tools-`、`core-agent`、`core-scope`、`session-jsonl`） | `apps`、`packages`、`scripts`、`.github` 无命中；`ls packages/*/package.json` 无匹配（第一级没有包） |

### S2 插件清单与展示信息

- **操作**：按 `docs/exec-plans/active/20261101-plugin-structure/s2-plugin-catalog.md` 步骤 1–6 实施，辅助脚本在 `tmp/`（不进 git）。
  - manifest：`PluginManifest` 加可选 `display`，`BuiltinPluginManifestInput` 要求必填；`validatePluginManifest` 校验字数与 scope。49 个包的 `src/manifest.ts` 写入中文 `display`。
  - 清单：新增 `packages/core/runtime/src/plugin-catalog.ts`（`PLUGIN_CATALOG`、`pluginCatalogEntry`、`PLUGIN_PACKAGES_OUTSIDE_DEFAULT`、`harnessEntriesMissingHostCapabilities`）和 `manifests.ts`（runtime 自己的四个 manifest）。`TRUSTED_LOADER_ENTRIES`、`DEFAULT_HARNESS_ENTRIES`、`build-default-harness.mjs` 入口、codec 查找、基础 bundle、浏览器 bundle 都从清单计算；S1 遗留的入口到模块映射表删除。
  - `cordis.yml`：`scripts/generate-plugin-loader.mjs` 生成，`--check` 进 `check:packages`；与原文件只差头部注释和 `todo-projection` 的模块名（`@actspace/tool-todo/projection`）。新增 `scripts/check-plugin-catalog.mjs`（纯函数 `checkPluginCatalog` 可测）。
  - tool-todo 拆分：`projection-plugin.ts` + `./projection` 导出，runtime 的 `./todo-projection` 导出和 `session/todo-projection-plugin.ts` 删除。
  - 先对旧常量写对照测试（`plugin-catalog.test.ts`，7 个用例），按当前行为修正 manifest，再删旧表。
- **manifest 修正（为了与旧常量一致）**：session-projection、core/agent、desktop-app、english-learning、llm-service、tool-runtime、context-system / rules / skills / runtime / tools、image-inspection；tool-browser 加 `required: false` 与 `config: { disposeHost: false }`。
- **default-harness 的 files.json 条目数**：改前 45，改后 45。
- **决定与偏离**：
  - 新 todo 投影文件叫 `projection-plugin.ts`（`projection.ts` 已被占用）。
  - 通用「host.required 缺能力就不加载」规则只对 `required: false` 的条目生效；对必需条目（approval、sandbox）生效会让「只有 filesystem.read」的测试失败，context-disclosure 的相应 manifest 修改已还原。
  - 清单行多了 `admitOnHost` 字段，标记 Host 组合准入的条目；因此 sandbox 条目在没有 `process` 能力的 Host 上可被判为禁用。
  - `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 除计划里的包外，还登记了 scope、subagent、llm-pi-ai 三个带 `plugin.ts` 的包。
  - 8 个计划 §5.4 没覆盖的包，展示文字是实施时自拟的。
  - 浏览器组合条目：Entry id `tools.browser`、`required: false`、services `tools.browser`；`agent-factory` 的 `apply` 现在就是 Run 工厂入口，`applyAgentFactory` 删除；`todo-projection` 加载模块名改变。
  - Electron 实机检查留给用户。
- **验证**：

| 命令 | 结果 |
|---|---|
| `pnpm install` / `pnpm typecheck` | 通过 |
| `pnpm test`（逐步） | 除 `test:current-docs`（基线 363）外通过；runtime 95 个用例（含 `plugin-catalog` 7、`browser-capability` 3）；`scripts/test/plugin-catalog.test.mjs` 通过 |
| `check:packages`（含目录检查与 loader `--check`）/ `generate:plugin-loader --check` / `check:desktop-build-graph` / `check:ipc-channels` / `check:renderer-bridge` / `test:contract-matrix` | 通过（矩阵已重新生成） |
| `test:agent-host:process` | 通过 |
| `check:docs` / `check:current-docs` | 363 条已知失败，全在 `docs/exec-runs/`，无新增 |
| `pnpm --filter @actspace/desktop build` | 通过 |
| 残留 grep（`defaultHarnessEntrySource`、`applyAgentFactory`、`todo-projection-plugin`、`runtime/todo-projection`） | 无命中 |

## 遇到的问题

- P1：计划没列 `chat-presentation-recovery.test.tsx`，它断言「+」菜单项等于 `["可视化回复", "上下文"]`，删入口后失败，已改为 `["上下文"]`。另有 `RightPanel.tsx`、`RightPanelObjectMenu.tsx` 里提到 Reply / 可视化回复的注释和提示文字，一并改掉。
- P2：P1 提交遗留了一个未使用的 import（`packages/shared/src/ipc.ts` 的 `ModelId`，原来只被已删的可视化类型用到），`apps/web` 开了 `noUnusedLocals`，导致 `pnpm typecheck` 失败。已在 P2 里顺手删掉这个 import。
- P2：计划列的 `main/test/main-lifecycle.test.ts` 两个终端用例随终端清理一起删，改成一个 `onClosed` 用例；`right-panel-object-menu.test.tsx` 的用例改名并改为断言菜单里没有「终端」；计划没列 `chat-presentation-recovery.test.tsx` 里的 `"终端"` 反向断言，也一并去掉。
- P3：计划列的几个测试里，`workspace-file-freshness`、`workspace-file-target`、`workspace-file-tree`、`runtime-v2-desktop-shell-ipc` 用 `.txt` 文件当「能读到内容」的样例，`workspace-fs-service.test.ts` 的 `..foo` 和截断用例用 `.log`，改成 `.md` 之后才成立；计划没列 `runtime-v2-desktop-shell-ipc.test.ts` 和 `file-applications-service.test.ts`，一并改。
- P3：`scripts/check-frontend-theme-colors.mjs` 里 `HtmlRenderView.tsx` 是必需的字面量例外，删文件后检查会直接崩溃（读不到文件）；`native-button-baseline.json` 里 `CsvRenderView` 条目也要删。计划没提这两处。
- P3：`!result.ok` 在 renderer 里不能收窄带字面量的判别联合（该 tsconfig 没开严格空值检查），要写 `result.ok === false`。
- P3：`pnpm --filter @actspace/desktop test` 有一次出现「环境销毁后捕获到错误」的偶发报错（1 个 Errors，所有用例仍通过），重跑两次没有复现；怀疑来自某个异步清理时序，未定位到具体文件。

- P4：计划没列几个依赖旧「文件」Tab 的测试，实施时一并改：`workspace-file-freshness`、`workspace-file-target` 原来用 `.md` 样例走 markdown Tab，Markdown Tab 删掉后改用图片 Tab；`turn-tail`、`turn-output-artifacts`、`open-workspace-path` 原来断言读文件，现在断言 `statFile` 加文档 Tab；`right-panel-object-menu` 的菜单项名、`right-panel-review`、`chat-presentation-recovery` 里的「Review」「工作区文件」随改名更新。
- P4：`!result.ok` 在 renderer 里仍不能收窄判别联合，`use-docs-draft.ts`、`use-docs-listing.ts` 都要写 `result.ok === false`（同 P3）。
- P4：设计阶段发现一个会上线的误报：如果 Agent 编辑信号一律把当前文档标成已变更，打开一篇本会话早已改过的文档会立刻提示「已变更」。改成只在这篇文档从「不在改过集合」变成「在改过集合」时才触发。
- P4：浏览器 mock 的 `turn-deliverables` 场景自己覆盖了 `readFile`，导致文档树里点其他文件读不到。让它对不认识的路径回落到 `docs-fixture`。
- P4：截图里发现默认 390px 右栏放不下正文加 260px 文件树（正文只剩约 130px，操作栏被裁）。给文档 Tab 单独设了 720px 的默认宽度，面板窄时收起次要操作；同时发现 `.markdown-prose` 是 grid，宽表格的 `min-width` 会把整篇正文撑出面板，改成 `minmax(0, 1fr)` 并给表格加滚动容器。
- P4：树里选中行的底色不显示：`bg-transparent` 和 `bg-selected` 同时在 class 里，前者生效。改成互斥。
- P4：jsdom 里 `<mark>` 会让无障碍名称在高亮前后多出空格，测试里用 `\s*` 容忍。
- P5：计划说 10 个 App 测试 mock 带 `review.initGit`，实际只有 1 个测试文件加 1 个夹具（`test-fixtures/session-background-runs.tsx`）还含它。
- P5：计划没列 `app-streaming-user-message`、`composer-toolbar`、`review-diff-virtualization` 的改动；强制刷新后，凡是断言挂载时读 `getSnapshot` 的用例都要改成 `refreshSnapshot`；工具栏焦点测试原来用「提交或推送」当最后一个按钮，改用「显示文件列表」。

- S1：替换脚本把 4 个 DeepSeek Harness 来源注释里的 `packages/client/ui-primitives/...` 误改成 `packages/client/client/ui-primitives/...`，已还原；搬家后 pnpm 没刷新 `.pnpm/node_modules/@actspace/` 的隐式提升链接，Host 进程测试启动失败，重建后恢复；`build:deps:dev` 在清空 dist 后第一次会因 `agent-service` 测试文件缺依赖产物而失败，重跑通过（原有顺序依赖）。详见 S1 小节。
- S2：esbuild 在 todo 拆分后报 `No matching export applyTools`，原因是构建脚本还是旧的，改写 `build-default-harness.mjs` 后恢复；两个测试里字符串与品牌 `ServiceId` 比较报 TS2345，改用 `String(id)`；契约矩阵测试需先 `pnpm gen:contract-matrix`。

## 跳过或推迟的事项

- P1：Space 演示里的 mock「可视化回复」标签留待 Space 演示后续处理（见 P1 决定）。磁盘上旧的 `visualizations.json` 不读不删。
- P2：`agent-contract-matrix.generated.md` 里仍含 node-pty 的依赖列表，基线已过期，留给 S1 重新生成。未实测完整打包（只做了 `bash -n`）。
- P3：Windows / Linux 上 `shell.openPath` 对无关联应用文件的返回值未实测；Electron 实机（交付卡、聊天链接、读文件工具行点 `.md`、`.png`、`.html`、`.pdf`、`.ts`，以及兜底对话框三项）留给用户手工检查。`TurnChangesCard` 头部悬停文字「在侧边栏预览」仍对应打开本轮改动视图，没改。
- P4：Electron 实机检查留给用户：默认应用打开 / Finder 显示、⌘S 保存与外部编辑器同时改同一文件的行为、窗口聚焦后的「重新加载」、关闭「文档」标签时的未保存询问、展开面板盖住聊天区再还原、拖宽右栏后切到其他标签的宽度、真实大仓库（5000 篇以上）下的树。
- P4：补修三项原已知限制。(1) 换根不再丢草稿：新增模块级 `docs-draft-store.ts`，按 `workspaceRoot + relativePath` 暂存未保存草稿（含基准 mtime/size），`syncDocsRoot` 离开时暂存、回到同一个根时重新选中那一篇，`use-docs-draft` 读盘后套回草稿并显示未保存圆点；磁盘文件变过则同时出现已变化提示；不自动写盘，恢复时一次性取走，之后保存、不保存走原有流程；应用重启后丢失。(2) git 清单额外跑 `ls-files -z --deleted` 并排除结果，该调用失败时忽略。(3) git 使用 `:(icase)*.md`、`:(icase)*.markdown`；遍历和 `writeMarkdownFile` 原本就用不区分大小写的正则，补了测试。新增测试：`workspace-fs-service`（已删除、大小写、写入 `.MD`）、`docs-panel`（编辑、换根、切回恢复草稿）；原有截断测试的 fakeGit 改成按 `--deleted` 区分返回。
- P4：已知限制，不在本步处理：保存前不做冲突检测（规范明确不做）；`open-workspace-path` 的 Markdown 分支不核对传入的根是否等于面板当前的根；搜索或「本会话改过」筛选自动展开的文件夹，在清除筛选前不能手动折叠。
- P4：Space 演示里的「文件」「Review」标签文字（`SpaceReviewView`、`SpaceFilesView` 等）和 Composer 的 `ReviewStrip` 文字没改，它们不是右侧面板标签。站点 `file-preview.png` 截图仍是旧的文件树画面，已把图注改掉，截图需要在 Electron 里重拍。
- P4：没有新建 `docs-panel.css`，只用 Tailwind token 类；计划里的 `getDocsDoc` 没有实现（不需要）。
- P4：`pnpm --filter @actspace/site test` 通过（31）；`pnpm check:docs` / `check:current-docs` 仍是 363 条已知失败，全部在 `docs/exec-runs/`，无新增。
- P5：资源复测没有跑。`docs/exec-runs/20261008-review-resource-test/component-benchmark.cjs` 写死了另一个检出路径和 `/tmp` 夹具，并依赖已删的 `ReviewWorkspaceWatcher` 与 `scheduleInvalidation`，现在无法运行；目录下其他基准脚本同理。没有另建新基准。
- P5：Electron 实机检查留给用户：每轮结束后输入框 +N/−M 更新、打开「改动」面板时数字和 diff 更新、手动刷新、顶部菜单提交后数字更新、外部改文件后不自动变化、非 Git 目录文案、五个 scope 切换与分支 / 提交子视图。
- P5：已知限制：旧的磁盘 `view-state.json` 不读不删；`agent-contract-matrix.generated.md` 仍是旧基线，留给 S1 重新生成；`pnpm check:current-docs` 仍是 363 条已知失败。
- S1：Electron 实机检查留给用户：用已有数据目录启动、打开旧会话、新建会话发一条消息、运行一条 Bash。没有跑 `scripts/release-package.sh` 的完整打包，只验证了 `pnpm deploy`。旧能力目录（`context/`、`session/`、`llm/`、`sandbox/`）里的 README 仍按旧包目录写，`packages/README.md` 只改了路径，整体重写留给 S4。`scripts/refactor-stats.mjs` 的分区现在按能力目录统计（`packages/<能力>`），没有改。
- S2：Electron 实机检查留给用户（默认组合启动、浏览器能力有无时的工具列表、桌面端启动一个会话）。展示信息尚未接到设置页，留给 S3。
