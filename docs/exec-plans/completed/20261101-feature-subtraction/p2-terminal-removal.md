# P2 删除内置终端

## 目标

应用里不再有终端：没有 node-pty 原生模块，没有 xterm，没有终端标签和终端 IPC。Agent 的 Bash 工具不受影响。

## 范围

- 包含：main 终端服务、renderer 终端视图、契约与类型、依赖、打包脚本、实验脚本、测试、文档、站点文档。
- 不包含：
  - Agent Bash 工具（`packages/tools/shell-tools`，自带 shell 逻辑，不依赖 `main/terminal/`）。
  - `workspace-open-service.ts` 里的 `terminal` / `iterm2`（用系统终端打开目录，保留）。
  - Space 演示的 mock 终端面板。

## 必读

- `AGENTS.md`
- [01 功能减法设计](../../../design-docs/架构优化/01-功能减法设计.md) 第 4 节
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`（将删除，先读懂生命周期再删）

## 关键耦合

`capabilities.terminal` 不只管终端。`WorkbenchLayout.tsx` 把它转成 `developmentEnabled` 传给 `RightPanel`，同时管文件树、文件标签、Review、子 Agent、后台任务。**先改名，再删终端**：

- `apps/desktop/src/renderer/target/run-target.ts`：`RunTargetCapabilities.terminal` 改名为 `workspacePanels`，注释改为“文档、改动、子 Agent、后台任务等工作区面板”（约 27–28、49、59 行）。
- `components/WorkbenchLayout.tsx`：`terminalEnabled` 改名（约 72、372、422 行）。
- `renderer/test/run-target.test.ts`：同步改名（约 17、26、38 行）。

## 步骤

行号以 `b590e02f` 为准，动手前复核。

### 1. 改名（独立一个提交，便于回滚）

见上文「关键耦合」。改完先跑 `pnpm --filter @actspace/desktop typecheck` 和 `test`。

### 2. 删除整文件

- `apps/desktop/src/main/terminal/` 整个目录：`node-pty-terminal-backend.ts`、`shell-environment-service.ts`、`terminal-backend.ts`、`terminal-process-cleanup.ts`、`terminal-session-service.ts`、`test/`。删除前 `grep -rn "shell-environment-service" apps packages` 确认只有 `terminal-session-service.ts` 引用。
- renderer：`components/right-panel/TerminalRenderView.tsx`、`terminal-render-loader.ts`、`terminal-theme.ts`、`terminal-title.ts`、`useOpenTerminal.ts`、`api/terminal.ts`。
- 测试：`renderer/test/terminal-render-view.test.tsx`、`terminal-title.test.tsx`、`terminal-theme.test.ts`。
- `scripts/experiments/terminal-native-spike/` 整个目录。
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`。
- `apps/site/src/content/docs/terminal.md`。

### 3. main

- `apps/desktop/src/main/index.ts`：删 `TerminalSessionService`、`createNodePtyBackend` import（约 26–27 行），`terminalSessionService` 变量（约 50 行），`closeOwnedTerminals`（约 157 行），`hasNodePty()` 判断与创建（约 212–231 行），传给 shell IPC 的 `terminal` / `terminalAvailable`（约 238–239 行），`disposeAll()`（约 331 行），`hasNodePty()` 函数（约 349–356 行）。
- `apps/desktop/src/main/main-lifecycle.ts`：删 `closeOwnedTerminals` 字段与清理逻辑（约 6、10–16 行）。若 `attachWindowLifecycle` 只剩 `onClosed`，保持函数但简化。
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`：删 `TerminalSessionService` import（约 23 行），options 的 `terminal?` / `terminalAvailable?`（约 30–31 行），`terminalAvailable` 变量（约 77 行），8 个 `contract.terminal.*` handler（约 151–160 行）。
- `apps/desktop/src/main/ipc/guards.ts`：删 `terminal.create`、`terminal.write` guard（约 112–113 行）。
- `apps/desktop/tsconfig.electron.json`：删 5 个 terminal 文件条目（约 39–43 行）。

### 4. 契约

- `packages/shared/src/desktop-bridge/contract.ts`：删 `terminal: {…}`（约 140–148 行）和 `events.terminal`（约 235 行）。
- `packages/shared/src/runtime-v2/fixed-renderer.ts`：删 9 个 terminal channel（约 40–48 行）。
- `packages/shared/src/ipc.ts`：删 `TERMINAL_LIMITS` 和全部 `Terminal*` 类型（约 21–92 行）。

### 5. renderer

- `components/RightPanel.tsx`：删 terminal 相关 import（`terminalDisplayTitle`、`SquareTerminal`、`TerminalSessionSnapshot`、`useOpenTerminal`、`terminal-render-loader`、`terminalApi`），`syncTerminalTabs` 与 `terminalApi.list` 的 effect（约 75、79–90 行），`isDevelopmentTab` 里三个 terminal kind（约 153 行），`closeRightTab` 的 terminal 分支（约 166–175 行），`terminalStarting` 标签文案（约 219 行），`RightPanelBody` 三个 terminal 分支（约 289–313 行），`useOpenTerminal`（约 382 行），launcher 的 terminal 项（约 439–448 行），`TerminalStartingView` / `TerminalErrorView`（约 495–520 行），不再使用的 `Suspense` import。
- `components/right-panel/RightPanelContext.tsx`：删 `TerminalSessionSnapshot` import、`terminalDisplayTitle`、三个 terminal kind（约 43–45 行）、`syncTerminalTabs` 的类型、实现与导出（约 139、318–335、370、399 行）。`isSourceShown` / `setSourceShown` 暂留，P4 再处理。
- `components/right-panel/RightPanelObjectMenu.tsx`：删 `SquareTerminal`、terminal import、`useOpenTerminal`、终端菜单项（约 1、4–5、29、61–67 行）。
- `mock/handlers.ts`：删 `terminal: { list … }`（约 199 行）。
- `scripts/native-button-baseline.json`：删 `TerminalRenderView.tsx` 一行（约 59 行）。

### 6. 依赖与打包

- `apps/desktop/package.json`：删 `@xterm/addon-fit`、`@xterm/xterm`、`node-pty`。
- `pnpm-workspace.yaml`：删 `allowBuilds` 里的 `node-pty: true`。
- `pnpm install` 更新 `pnpm-lock.yaml`。
- `scripts/release-package.sh`：删 spawn-helper 的 chmod 与检查块（约 91–104 行）。**必须删**，否则没有 node-pty 时打包直接 `exit 1`。

### 7. 测试

- `main/test/ipc-guards.test.ts`：删 terminal 用例（约 32–33 行）。
- `main/test/main-lifecycle.test.ts`：按简化后的 `attachWindowLifecycle` 改写。
- `main/test/runtime-v2-desktop-shell-ipc.test.ts`：删 `terminalAvailable` 用例与参数（约 123–135、147、167 行）。
- `renderer/test/mock-bridge.test.ts`：删 `bridge.terminal.create`（约 51 行）。
- `renderer/test/desktop-bridge-contract-types.test.ts`：删 `events.terminal`（约 19 行）。
- `packages/shared/src/test/desktop-bridge-build.test.ts`：删 `events.terminal`（约 54–57 行）。
- `renderer/test/right-panel-object-menu.test.tsx`：删终端菜单用例（约 22 行）。
- `renderer/test/right-panel-review.test.tsx`：改注释（约 263 行）。

### 8. 文档

- 去掉终端引用：`docs/ARCHITECTURE.md`、`docs/design-docs/frontend/README.md`、`front-工作台布局与面板交互规范.md`、`front-右侧面板与文件渲染规范.md`、`front-preload-bridge与mock规范.md`、`front-新功能开发清单.md`、`front-会话状态与数据流规范.md`、`front-desktop-chinese-ui.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/SECURITY.md`、`docs/QUALITY_SCORE.md`、`docs/design-docs/index.md`。
- 站点：`apps/site/CONTENT_SOURCES.md`、`first-task.md`、`file-preview.md`、`what-is-actspace.md`、`troubleshooting.md`、`sessions.md`、`apps/site/src/lib/home-features.ts`、`screenshots.json`。
- `docs/releases/feature-release-notes.md` 追加移除说明。
- `docs/histories/` 记一条。

## 验证

- 命令：README「统一验证命令」+ 依赖类命令；另跑 `pnpm check:site` 和 `pnpm test:site`。
- 残留检查：`grep -rni "xterm\|node-pty\|terminalApi\|TerminalSession" apps packages scripts --exclude-dir=node_modules --exclude-dir=dist` 无命中（Space mock 的 `SpaceTerminalView` 除外）。
- 打包检查：`bash scripts/release-package.sh` 的 macOS 分支能走过原 spawn-helper 检查位置（若本机无法完整打包，至少 `bash -n scripts/release-package.sh` 并说明未实测）。
- 手工检查：Electron 启动正常；右侧「+」和对象菜单里没有终端；Agent 跑一条 Bash 命令正常；「在 Terminal 中打开」仍能打开系统终端。

## 风险

- `capabilities.terminal` 改名漏改，会让文档、改动等面板在本机会话里消失。缓解：改名单独提交，先测再删。
- 打包脚本漏改会让发版失败。缓解：步骤 6 列为必做项并在验证里检查。

## 回滚

`git revert` 本子计划的提交，再 `pnpm install` 恢复 node-pty 原生模块。
