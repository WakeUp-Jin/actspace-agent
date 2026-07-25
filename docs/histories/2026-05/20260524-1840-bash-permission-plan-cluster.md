## [2026-05-24 18:40] | Task: Group Bash permission plans

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 把工具权限调度、Bash 工具、Bash 审核 UI、暂停恢复与会话边界四个计划整理到同一个文件夹，方便后续继续验证和推进。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Plan Grouping]**: 将四个相关 active execution plan 移入 `Bash工具和工具权限调度开发计划/`。
- **[Overview]**: 新增 README，总结完成状态、依赖关系、推荐继续顺序和验收重点。
- **[References]**: 更新 execution plan 索引、权限设计文档和相关 history 的路径引用。

### 🧠 Design Intent (Why)

Bash 工具、权限调度、审核 UI 和暂停恢复不是四条孤立工作线。把它们收拢为一个计划簇，可以让后续 Agent 先读总览再推进子计划，减少状态判断和路径查找成本。

### 📁 Files Modified

- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-permission-scheduler-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-tool-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-approval-ui-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`
- `docs/exec-plans/README.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
