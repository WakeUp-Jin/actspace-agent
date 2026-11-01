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

## 遇到的问题

- P1：计划没列 `chat-presentation-recovery.test.tsx`，它断言「+」菜单项等于 `["可视化回复", "上下文"]`，删入口后失败，已改为 `["上下文"]`。另有 `RightPanel.tsx`、`RightPanelObjectMenu.tsx` 里提到 Reply / 可视化回复的注释和提示文字，一并改掉。
- P2：P1 提交遗留了一个未使用的 import（`packages/shared/src/ipc.ts` 的 `ModelId`，原来只被已删的可视化类型用到），`apps/web` 开了 `noUnusedLocals`，导致 `pnpm typecheck` 失败。已在 P2 里顺手删掉这个 import。
- P2：计划列的 `main/test/main-lifecycle.test.ts` 两个终端用例随终端清理一起删，改成一个 `onClosed` 用例；`right-panel-object-menu.test.tsx` 的用例改名并改为断言菜单里没有「终端」；计划没列 `chat-presentation-recovery.test.tsx` 里的 `"终端"` 反向断言，也一并去掉。
- P3：计划列的几个测试里，`workspace-file-freshness`、`workspace-file-target`、`workspace-file-tree`、`runtime-v2-desktop-shell-ipc` 用 `.txt` 文件当「能读到内容」的样例，`workspace-fs-service.test.ts` 的 `..foo` 和截断用例用 `.log`，改成 `.md` 之后才成立；计划没列 `runtime-v2-desktop-shell-ipc.test.ts` 和 `file-applications-service.test.ts`，一并改。
- P3：`scripts/check-frontend-theme-colors.mjs` 里 `HtmlRenderView.tsx` 是必需的字面量例外，删文件后检查会直接崩溃（读不到文件）；`native-button-baseline.json` 里 `CsvRenderView` 条目也要删。计划没提这两处。
- P3：`!result.ok` 在 renderer 里不能收窄带字面量的判别联合（该 tsconfig 没开严格空值检查），要写 `result.ok === false`。
- P3：`pnpm --filter @actspace/desktop test` 有一次出现「环境销毁后捕获到错误」的偶发报错（1 个 Errors，所有用例仍通过），重跑两次没有复现；怀疑来自某个异步清理时序，未定位到具体文件。

## 跳过或推迟的事项

- P1：Space 演示里的 mock「可视化回复」标签留待 Space 演示后续处理（见 P1 决定）。磁盘上旧的 `visualizations.json` 不读不删。
- P2：`agent-contract-matrix.generated.md` 里仍含 node-pty 的依赖列表，基线已过期，留给 S1 重新生成。未实测完整打包（只做了 `bash -n`）。
- P3：Windows / Linux 上 `shell.openPath` 对无关联应用文件的返回值未实测；Electron 实机（交付卡、聊天链接、读文件工具行点 `.md`、`.png`、`.html`、`.pdf`、`.ts`，以及兜底对话框三项）留给用户手工检查。`TurnChangesCard` 头部悬停文字「在侧边栏预览」仍对应打开本轮改动视图，没改。
