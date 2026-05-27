## [2026-05-28 00:48] | Task: README project entry refresh

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 现在应该是可以重新梳理一下项目的 README，结合 docs 中的文档来说。

### 🛠 Changes Overview

**Scope:** `README.md`, `docs`

**Key Actions:**

- **[README scope]**: 将根 README 从早期 V1 初始化说明改成项目总入口，突出定位、当前能力、快速开始、运行边界、文档导航、技术栈和仓库结构。
- **[Docs routing]**: README 不再复制易漂移的详细计划状态，改为指向 `docs/TODOLIST.md`、`docs/exec-plans/README.md` 和 design-docs。
- **[Status sync]**: 将 `docs/TODOLIST.md` 中 Kairos 监控页从 active 焦点移到已完成入口，对齐 `docs/exec-plans/README.md`。

### 🧠 Design Intent (Why)

根 README 应该帮助新读者和新 Agent 快速理解 actspace 是什么、怎么启动、真实状态去哪读，而不是继续承载会随迭代频繁变化的计划细节。当前 `docs/` 已经承担架构、计划、质量、安全和历史记录的事实来源，README 因此收敛为稳定导航入口。

### 📁 Files Modified

- `README.md`
- `docs/TODOLIST.md`
