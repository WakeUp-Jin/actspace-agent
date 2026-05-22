## [2026-05-22 12:33] | Task: add frontend verification route

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 将前端协作和验证规范放入 `AGENTS.md` 的按任务需要选读入口中，`REPO_COLLAB_GUIDE.md` 不再调整。

### 🛠 Changes Overview

**Scope:** `AGENTS.md`, `docs/histories`

**Key Actions:**

- **[补充任务路由]**: 在 `AGENTS.md` 的“按任务需要选读”中加入 `docs/FRONTEND.md` 和 `docs/FRONTEND_VERIFICATION.md`。
- **[记录规则变更]**: 新增 history，说明前端任务现在会通过 `AGENTS.md` 路由到验证规范。

### 🧠 Design Intent (Why)

`AGENTS.md` 是 Agent 每轮工作的第一层导航。前端任务需要尽早知道设计文档与验收规范的位置，但具体规则不应该塞进 `AGENTS.md`。因此只在这里增加入口，把细节继续留在 `docs/FRONTEND_VERIFICATION.md`。

### 📁 Files Modified

- `AGENTS.md`
- `docs/histories/2026-05/20260522-1233-agents-frontend-verification-route.md`
