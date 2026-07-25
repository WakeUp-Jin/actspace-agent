## [2026-07-09 00:00] | Task: update Browser Bridge plugin navigation

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户确认 Browser Use / Browser Bridge 能力应迁入 actspace-plugins，并希望以后不用再反复说明项目位置。

### 🛠 Changes Overview

**Scope:** repository navigation docs

**Key Actions:**

- **AGENTS 导航**: 在 `AGENTS.md` 增加相关平级项目说明，明确 `actspace-plugins/plugins/browser-bridge/` 是 Browser Use / Browser Bridge 主位置。
- **设计文档同步**: 在 `docs/design-docs/browser/agent-browser-bridge-design.md` 标注 Browser Bridge 主线实现已迁入插件仓，原独立仓保留为迁移来源与历史上下文。

### 🧠 Design Intent (Why)

Browser Bridge 的源码位置从独立仓迁入插件仓后，Agent 入口文档必须直接暴露新的事实来源，避免后续任务继续在 `actspace-plugins`、`agent-browser-bridge` 和历史参考之间来回猜测。

### 📁 Files Modified

- `AGENTS.md`
- `docs/design-docs/browser/agent-browser-bridge-design.md`
- `docs/histories/2026-07/20260709-0000-browser-bridge-plugin-navigation.md`
