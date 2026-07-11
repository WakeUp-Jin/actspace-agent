## [2026-07-10 00:10] | Task: 编写 Browser Use 设计文档与执行计划

### 🤖 Execution Context

- **Agent ID**: `cursor-agent`
- **Base Model**: `claude-opus-4-20250514`
- **Runtime**: `Cursor IDE`

### 📥 User Query

> 整理 Browser Use 设计文档 + 生成详细执行计划。决策：将 actspace-plugins 整体合并进主仓库 plugins/ 目录。

### 🛠 Changes Overview

**Scope:** docs/design-docs, docs/exec-plans

**Key Actions:**

- **[创建 command-surface 文档]**: 完整记录 62 条浏览器命令，按 CUA / DOM CUA / Playwright / 导航 / Tab / 用户浏览器 / 等待 / 文件 / 调试分类，含参数 schema、内部实现和安全门控。
- **[创建 integration-design 文档]**: 定义薄集成方案——agent-core 只维护工具定义和 socket 客户端，Go bridge 承担命令编排和事件路由，Chrome Extension 做执行。涵盖通信协议、工具暴露分层、光标可视化、Tab Group 管理和五阶段实现路线。
- **[生成 6 份执行计划]**: Plan 0-pre（仓库合并）→ Plan 0（协议契约）→ Plan 1（Go socket server）→ Plan 2（BridgeClient + 基础工具）→ Plan 3（交互命令 + Playwright）→ Plan 4（Tab Group + 光标）。
- **[仓库合并决策]**: 确认 actspace-plugins 整体合并进 actspace-agent/plugins/ 目录。
- **[更新 index.md]**: 在 Agent 分区下添加两份新文档的索引。

### 🧠 Design Intent (Why)

对 Codex browser-client.mjs 逆向分析和 open-browser-use 项目的研究沉淀为仓库内可执行规范和可并行推进的执行计划。仓库合并消除跨仓协调成本，让协议变更和 TS 消费侧能原子提交。六份 plan 拆分粒度确保每个 plan 可独立启动、独立验证、独立回退。

### 📁 Files Modified

- `docs/design-docs/agent-browser-use-command-surface.md`（新建）
- `docs/design-docs/agent-browser-use-integration-design.md`（新建）
- `docs/design-docs/index.md`（追加索引）
- `docs/exec-plans/active/20260710-browser-use/README.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-0-pre-repo-merge.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-0-protocol-contract.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-1-go-socket-server.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-2-agent-core-bridge-client.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-3-interaction-commands.md`（新建）
- `docs/exec-plans/active/20260710-browser-use/plan-4-tab-group-cursor.md`（新建）
