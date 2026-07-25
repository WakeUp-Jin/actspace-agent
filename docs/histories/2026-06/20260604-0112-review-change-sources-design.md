## [2026-06-04 01:12] | Task: Design Review Change Sources

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 先整理一个设计文档放入到 design-docs 中，沉淀 Review 功能、结构化 diff、无 Git 仓库 baseline 等设计；随后确认 V1 应学习 Codex，优先做 Git Review，无 Git 时提示创建 Git repository，V2 再做 Session Review。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **新增设计文档**: 增加 `core-review-change-sources.md`，定义 Review source、baseline、`ReviewChangeSet`、Git / Session / Snapshot provider 分层，以及 AI Review 与 Commit / Push / PR 的边界。
- **调整 V1 / V2 路线**: 将 V1 改为 Codex-style Git Review，默认展示 Git uncommitted changes；无 Git 时提示创建 Git repository。Session Review 降为 V2 的 `Last Turn` / `Session` 视角。
- **更新索引与引用**: 在 `docs/design-docs/index.md` 挂入 Core 入口，并在右侧面板规范中引用 Review 数据源设计。
- **新增执行计划**: 增加 `docs/exec-plans/active/20260604-review-v1-git-review.md`，拆出 shared 契约、main Git provider、IPC、Composer 入口、右侧 Review tab 和验证矩阵。
- **同步前端规范**: 将右侧面板规范中的 Diff 口径从会话级主线调整为 Git-first Review，Session / Last Turn 明确留到 V2。
- **明确文件级展开交互**: V1 Review 采用文件级 accordion：每个文件先展示 status icon / path / `+N -M`，点击后展开具体 unified diff；`New` / `Deleted` / `Renamed` 等状态进入图标和可访问语义，视觉行尾只保留增删统计。

### 🧠 Design Intent (Why)

Review 主入口应该回答「当前 repo 真实改了什么」，而不是只回答「Agent 本轮记得自己改了什么」。因此第一版优先学习 Codex 的 Git-first 行为：有 Git 时以 repository state 为事实来源；无 Git 时提示用户显式创建 Git repository。Session diff 仍有价值，但更适合作为 `Last Turn` / `Session` 过滤视角或无 Git 临时兜底。

后续前端原型确认后，Review V1 的右侧视图进一步收敛为白色 Codex-style 极简列表：顶部只有单行操作栏，主体是文件列表；不做大标题、baseline 文案、summary card 或状态文字标签列。

### 📁 Files Modified

- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/index.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/exec-plans/active/20260604-review-v1-git-review.md`
- `docs/histories/2026-06/20260604-0112-review-change-sources-design.md`
