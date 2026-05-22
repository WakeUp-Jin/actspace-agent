## [2026-05-22 12:28] | Task: add frontend verification docs

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 为桌面端前端代码修改后的测试验收方式增加规范，说明浏览器 mock、Electron 真实验证和 Computer Use 的关系。

### 🛠 Changes Overview

**Scope:** `docs/`

**Key Actions:**

- **[新增前端验证规范]**: 创建 `docs/FRONTEND_VERIFICATION.md`，定义工程验证、浏览器 mock 验证、Electron 真实验证三层方式。
- **[仓库级约定入口]**: 在 `docs/REPO_COLLAB_GUIDE.md` 的“测试与验证”中加入前端验收约定。
- **[前端入口补链]**: 在 `docs/FRONTEND.md` 中加入验证规范入口，并要求前端改动收尾时说明实际验证方式。

### 🧠 Design Intent (Why)

`actspace` 是 Electron 桌面端应用，浏览器页面只能验证 renderer，不能代表完整桌面能力。将前端验证拆成浏览器 mock 和 Electron 真实验证，可以让有 Computer Use 的 Agent 做真实窗口验收，也让没有 Computer Use 的 Agent 有清晰的替代路径。

### 📁 Files Modified

- `docs/FRONTEND_VERIFICATION.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/FRONTEND.md`
- `docs/histories/2026-05/20260522-1228-frontend-verification-docs.md`
