## [2026-06-03 21:18] | Task: Add packaged startup log

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户反馈打包后的 macOS app 启动后 Dock 有图标但窗口没有正常显示，希望遵循“Agent 反复失败时优先修脚手架和环境”的原则，新增启动日志文件来排查安装版问题。

### Changes Overview

**Scope:** `packages/desktop` main process, reliability docs

**Key Actions:**

- **[Startup log]**: Electron main 进程启动后在 `<userData>/logs/main-startup.log` 写 JSONL 日志，并为每次启动生成 `main-startup-<timestamp>.log`。
- **[Window diagnostics]**: 记录窗口创建、preload 路径、packaged renderer 路径、`dom-ready`、`did-finish-load`、`did-fail-load`、renderer 进程退出和 renderer console。
- **[Failure capture]**: 记录 main 进程 `uncaughtException` 与 `unhandledRejection`，避免安装版启动问题只能靠终端复现。
- **[Docs]**: 更新 `docs/RELIABILITY.md`，把安装版启动日志作为排查 Dock 有图标但窗口没出来、白屏或 renderer 加载失败的默认入口。

### Design Intent (Why)

安装版 Electron 双击启动时 stdout/stderr 不容易读取，窗口没显示时容易陷入猜测。将 main 启动链路写入用户数据目录的固定日志，可以让源码本地自构建用户和 Agent 直接读取事实状态，定位是 main 初始化卡住、renderer 文件路径错误、renderer 加载失败，还是窗口/系统层问题。

### Verification

- `pnpm --filter @actspace/desktop typecheck`
- `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop:dmg`
- 启动 `dist/desktop/actspace.app/Contents/MacOS/Electron`
- `tail -n 80 "$HOME/Library/Application Support/actspace/logs/main-startup.log"`

### Files Modified

- `packages/desktop/src/main/index.ts`
- `docs/RELIABILITY.md`
