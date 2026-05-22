## [2026-05-22 01:33] | Task: fix electron build allowance

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 修复 Electron 启动失败的 bug。

### 🛠 Changes Overview

**Scope:** workspace config, `docs/`

**Key Actions:**

- **[放开构建脚本]**: 将 `pnpm-workspace.yaml` 中的 `electron` 和 `esbuild` 从禁止构建改为允许构建。
- **[升级 Electron]**: 将桌面端 Electron 版本升级到较新的稳定 39.x，以规避 macOS 26 上的启动兼容风险。
- **[文档补充]**: 在 `docs/CICD.md` 中记录这项依赖构建前提，避免后续再次因为 build scripts 被禁而出现桌面端无法启动的问题。
- **[后续验证准备]**: 为重新安装依赖和验证 `electron --version`、`pnpm dev` 做配置收口。

### 🧠 Design Intent (Why)

这次启动失败不是单一原因。一开始是 Electron 运行时在依赖安装阶段就没有被正确装好；修复构建脚本后，又进一步暴露出 Electron 35 在当前 macOS 26.3 环境里启动即崩的问题。先恢复运行时安装，再升级到较新的稳定 Electron 版本，才能让桌面开发启动真正可用。

### 📁 Files Modified

- `pnpm-workspace.yaml`
- `packages/desktop/package.json`
- `docs/CICD.md`
- `docs/histories/2026-05/20260522-0133-fix-electron-build-allowance.md`
