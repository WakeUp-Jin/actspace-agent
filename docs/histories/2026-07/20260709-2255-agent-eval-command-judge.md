## [2026-07-09 22:55] | Task: 补齐命令式裁判评分链路

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 继续完成 Agent 评估执行计划。

### Changes Overview

**Scope:** Agent 评估文档与外部 `actspace-agent-eval` 仓库

**Key Actions:**

- **裁判命令适配器**: 在外部评估仓库补充 `--judge-command` 使用文档、静态裁判命令脚本和命令式裁判测试。
- **运行链路验证**: 新增 `CommandJudgeClient` stdin/stdout 测试，以及 `runCase` 调用命令式裁判评分器的端到端测试。
- **文档同步**: 更新 ActSpace 评估设计文档与执行计划，并同步外部评估仓库设计文档副本。

### Design Intent (Why)

裁判模型评分不能只停留在接口层。命令式裁判适配器让真实裁判模型可以先被包装成外部命令接入评估运行器，同时默认 CI 仍然只使用静态或模拟路径，避免引入不稳定的模型依赖。

### Files Modified

- `docs/design-docs/agent-evaluation.md`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- `docs/histories/2026-07/20260709-2255-agent-eval-command-judge.md`
