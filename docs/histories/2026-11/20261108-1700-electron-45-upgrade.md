## [2026-11-08 17:00] | Task: Electron 39 → 45.2.3（CI 计划 P5）

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux VM)`

### 📥 User Query

> 按计划 docs/exec-plans/active/20261108-ci-pipelines.md：……P5 是 Electron 39 升到当前稳定版。这两个各自单独开 PR。那么我们继续接下来的任务吧。

### 🛠 Changes Overview

**Scope:** `apps/desktop`、`scripts/release-package.sh`、`docs/`

**Key Actions:**

- **Electron 45.2.3**（Node 24.22.2 / Chromium 156）：`apps/desktop/package.json` 由 `^39.8.3` 升到 `^45.2.3`。安装器 `@electron/get` 从 2 升到 5，lockfile 少了 `got` / `global-agent` 一整串间接依赖。
- **clipboard 迁移**：Electron 44 把 `clipboard` 重构成 W3C 风格、去掉了 `writeImage` 等窄接口。`artifact-context-menu-service.ts` 的「Copy image」改为 `clipboard.write([new ClipboardItem({ "image/png": new Blob([image.toPNG()]) })])`；`writeText` 现在返回 Promise，「Copy file contents」和「Copy path」都包进 `runMenuAction`，失败只记日志不变成 unhandled rejection。两处 vitest 的 `electron` mock 同步改成 `write` / `ClipboardItem`。
- **打包脚本按需下载 runtime**：Electron 42 起 npm 包不再在 postinstall 下载二进制，`pnpm install` 后没有 `node_modules/electron/dist`。`release-package.sh` 在原来的「runtime 不存在就失败」之前加一步 `node -e 'require("electron")'`，让 Electron 自己的 `index.js` 拉取当前平台的二进制；开发启动的 `run-electron-dev.mjs` 本来就是 `require("electron")`，不用改。
- **renderer tsconfig `lib` 显式 ES2024**：升级后 renderer 类型检查报 `findLastIndex` / `Object.groupBy` 不存在。`tsc --explainFiles` 对比发现，这些 lib 之前是被 `type-fest@0.13.1` 的 `/// <reference lib="esnext"/>` 带进来的——它是 Electron 39 安装器（`@electron/get@2` → `global-agent` → `roarr`）的间接依赖，而 mermaid 的 d.ts 把 `type-fest` 放在 devDependencies 却在类型里 import，恰好解析到了它。Electron 45 不再依赖这条链，于是把 `lib` 从 ES2022 改成 ES2024，把真实依赖写明。
- **逐条对照 40–45 的 breaking changes**：45 沙箱 preload 去掉 `Buffer` / `setImmediate` / `require("events"|"url"|"timers")`，检查 `dist-electron/preload/index.bundle.js` 只 `require("electron")`，不受影响；45 弃用 `safeStorage` 同步方法（46 移除），`SecretCrypto` 与 `HostCredentials` 都在用，记 tech debt 单独做；44 去掉 macOS 12 / Windows 32 位、renderer 不再有 `clipboard` 模块（renderer 没用过）；43 对话框默认目录改 Downloads，行为变化不需改代码。
- **文档**：`docs/CICD.md` 更新 Electron 安装方式、当前版本与最低系统要求；exec plan 勾掉 P5、补三条决策；exec-runs 过程补步骤 9、摘要补 P5 变更行与实机走查项；tech-debt 新增 `safeStorage` 同步方法一行。

### 🧠 Design Intent (Why)

直接升到当前 stable 45 而不是逐级升：中间版本没有 LTS，Electron 只维护最近三个大版本，逐级升不会减少要处理的 breaking change。`safeStorage` 改异步会动 settings store、model-connections 等一整条调用链，不塞进版本升级 PR。分支叠在 P4 的 PR #57 上而不是 `main`，因为 `main` 的 `类型检查与测试` job 在 #57 合并前一直是红的，叠上去才能看到本 PR 自己的 CI 结果。

### ✅ Verification

- `pnpm --filter @actspace/desktop typecheck`：通过。
- desktop vitest：303 个文件 2897 个用例通过。
- Linux `./scripts/release-package.sh`：先删掉 `node_modules/electron/dist` 再跑，「download electron runtime」阶段自动拉取 45.2.3，全程通过，产物 185 MB。
- 把 Linux 产物解包，在 `xvfb-run` 下带 `--remote-debugging-port` 启动，用 CDP 读页面：`window.actspace` 桥存在、侧栏文案渲染出来、主进程日志有 `runtime v2 ready` 且无错误。真实桌面上的窗口、审批弹层和剪贴板粘贴留给用户实机走查。

### 📁 Files Modified

- `apps/desktop/package.json`、`pnpm-lock.yaml`、`apps/desktop/tsconfig.json`
- `apps/desktop/src/main/artifact-context-menu-service.ts`、`apps/desktop/src/main/test/artifact-context-menu-service.test.ts`、`apps/desktop/src/main/test/file-applications-service.test.ts`
- `scripts/release-package.sh`
- `docs/CICD.md`、`docs/exec-plans/active/20261108-ci-pipelines.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/exec-runs/20261108-ci-pipelines/execution-process.md`、`docs/exec-runs/20261108-ci-pipelines/execution-summary.md`
