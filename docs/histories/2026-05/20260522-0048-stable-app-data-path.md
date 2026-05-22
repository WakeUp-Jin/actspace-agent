## [2026-05-22 00:48] | Task: stabilize app data path

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 把本地数据目录改成稳定的产品目录名，统一叫做 `actspace`。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs/`

**Key Actions:**

- **[稳定 userData 目录]**: 在 Electron 启动早期显式设置应用名和 `userData` 路径，避免开发期包名影响本地数据目录。
- **[去掉多余嵌套]**: 让 `ensureDataDirectories()` 直接以稳定后的 `userData` 作为数据根目录，而不是再额外拼接一层 `actspace/`。
- **[文档同步]**: 更新 `README.md` 和 `docs/ARCHITECTURE.md`，写清新的跨平台目录规则。

### 🧠 Design Intent (Why)

如果继续依赖 Electron 对应用名的默认推导，开发态和安装态的本地数据目录可能出现不稳定或不够产品化的名字，比如受 `@actspace/desktop` 这类包名影响。显式把目录统一成 `actspace`，更符合真实桌面应用的用户预期，也更利于排障、备份和后续迁移。

### 📁 Files Modified

- `packages/desktop/src/main/index.ts`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/histories/2026-05/20260522-0048-stable-app-data-path.md`
