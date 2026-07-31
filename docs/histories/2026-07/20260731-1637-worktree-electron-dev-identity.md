## [2026-07-31 16:37] | Task: Worktree-specific Electron dev identity

### Execution Context

- **Agent ID**: `Codex /root`
- **Runtime**: `Codex Desktop worktree`

### User Query

> 解决多个 worktree 的开发 Electron 共用应用身份，导致 Computer Use 自动打开旧 Electron 欢迎页的问题，并恢复自动化 UI 点击验收。

### Changes Overview

**Scope:** macOS 开发启动、Electron main 身份、桌面验证文档

- 新增 `scripts/run-electron-dev.mjs`：macOS 下按 repository absolute path 生成稳定 workspace hash，在系统临时目录缓存独立 Electron runtime。
- 临时 runtime 使用 worktree 可读名称、唯一 bundle ID 和唯一主可执行文件名；复制优先使用 APFS clone，首次生成后复用缓存。
- 临时 bundle 改写 `Info.plist` 后做 ad-hoc signing，并注册到 LaunchServices，使 Computer Use 可以按明确的 `appName` / `appId` 选中当前开发实例。
- `dev:electron:run` 改由启动器拉起；非 macOS 平台继续直接执行依赖提供的 Electron binary。
- main 进程接受启动器提供的开发 `appName` / `appId`，但 `userData` 仍固定在既有 `actspace` 目录，避免开发身份变化造成会话和设置分叉。
- 独立 DevTools 改为仅在 `ACTSPACE_OPEN_DEVTOOLS=1` 时打开，避免自动化被同一开发应用的第二个窗口抢走焦点。
- `docs/FRONTEND_VERIFICATION.md` 要求自动化从 `[dev-runtime]` 日志读取目标应用名或 bundle ID，禁止再用模糊的 `Electron`。

### Design Intent

`app.setName()` 和窗口标题不能改变 macOS LaunchServices 选择的 bundle。多个 worktree 都直接运行依赖里的 `Electron.app` 时，它们共享 `com.github.Electron`，Computer Use 只能按应用身份解析，无法按 PID 选择窗口。开发启动必须在进程启动前提供唯一 bundle 身份，自动化才有稳定目标。

正式打包链路与 `com.actspace.desktop` 保持不变；临时 runtime 不写入仓库，也不替换安装版 Actspace。

### Verification

- `node --check scripts/run-electron-dev.mjs`：通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `node scripts/run-electron-dev.mjs --prepare-only`：成功生成并注册 `Actspace Dev d11e-ab10` / `com.actspace.desktop.dev.wab10a3c4`。
- `pnpm dev:log` 真实启动成功；日志确认 effective packaged 为 `false`，默认不打开独立 DevTools，renderer 正常加载。
- Computer Use 按 `com.actspace.desktop.dev.wab10a3c4` 命中当前 worktree 主窗口；display name 不被当前工具接受时，bundle ID 可稳定选择应用。
- 自动点击通过 Review、Scope、Options、Files、Jump、Collapse/Expand 和 Commit 菜单；capped 模式保留 183 个文件的完整文件树，中央单文件切换与连续三屏滚动无永久 Loading。
- 未执行 commit、push、Create PR 或其他 Git mutation；这些动作继续保持独立授权与验收边界。
- 空闲采样时 main 与 renderer CPU 均为 0%；最新开发日志未发现 Review `spawn EBADF`、uncaught、unhandled rejection 或 renderer gone。
