## [2026-07-17 23:17] | Task: 更新 7 月功能发布记录

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 盘点目前的更新和历史记录，更新 release 文件夹，并将当前这批修改提交。

### 🛠 Changes Overview

**Scope:** `docs/releases`、发布记录 history

**Key Actions:**

- 对照 2026-07-05 之后的 Git 更新、`docs/histories/2026-07/` 和当前工作区改动，补齐用户可感知的功能与重要修复。
- 新增 Agent Turn 稳定性、Browser Locator Runtime、后台 Bash 生命周期、右侧对象面板、Agent 评估体系、Browser Use 全链路与体验、多模态图片输入、输入编辑体验和 LLM 错误恢复等发布条目。
- 将同一能力的多份 history 合并为面向用户的发布主题，避免把实现步骤、纯设计文档和内部重构逐条复制成提交日志。
- 保留既有月份、表格列和“先用户价值、后变更摘要”的发布记录格式。

### 🧠 Design Intent (Why)

功能发布记录上次集中回填后停在 2026-07-06，之后已完成多批 Browser Use、Agent 评估、图片路由和交互稳定性更新。发布记录需要反映用户实际能感知的能力，同时保持与 Git 提交、history 和当前代码状态可追溯。

### ✅ Verification

- `pnpm check:docs`：通过。
- `git diff --check`：通过。
- `shared`、`agent-core`、`desktop` typecheck：通过。
- Agent Core 定向测试的非 socket 用例全部通过；Browser socket 用例在沙盒内因 Unix socket `EPERM` 被阻止，沙盒外重跑 `browser-tools.test.ts` 为 13/13 通过。
- Desktop 定向测试：39/39 通过；Shared selector 测试：11/11 通过。
- `pnpm check:browser` 与 Browser Bridge Go tests：通过。

### 📁 Files Modified

- `docs/releases/feature-release-notes.md`
- `docs/histories/2026-07/20260717-2317-refresh-july-release-notes.md`
