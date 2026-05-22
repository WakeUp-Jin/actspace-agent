## [2026-05-22 02:40] | Task: align dev server host

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> Electron 窗口已经弹出，但开发态还是空白，修复 dev server 文件加载失败的问题。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs/histories`

**Key Actions:**

- **[统一开发态地址]**: 将 Vite dev server host 显式固定为 `127.0.0.1`，与 Electron `loadURL()` 使用的地址保持一致。
- **[补加载错误日志]**: 为 Electron `loadURL()` 增加显式错误日志，避免只出现白窗而没有足够可见的失败原因。

### 🧠 Design Intent (Why)

之前开发态空白窗的原因不是前端代码没有渲染，而是 Vite 实际监听在 `localhost`，而 Electron 去请求 `127.0.0.1`，最终触发 `ERR_CONNECTION_REFUSED`。把 host 和加载地址统一，是最小且稳定的修复方式；同时增加错误日志，可以让后续类似问题更容易被直接定位。

### 📁 Files Modified

- `packages/desktop/vite.config.ts`
- `packages/desktop/src/main/index.ts`
- `docs/histories/2026-05/20260522-0240-align-dev-server-host.md`
