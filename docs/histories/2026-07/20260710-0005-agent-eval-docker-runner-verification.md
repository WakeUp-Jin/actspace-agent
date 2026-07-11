## [2026-07-10 00:05] | Task: 验证 Docker 评估运行链路

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 继续完成 Agent 评估执行计划。

### Changes Overview

**Scope:** 外部 `actspace-agent-eval` 仓库、Agent 评估文档

**Key Actions:**

- **Docker 预检**: 启动 Docker Desktop 后，`doctor` 已验证数据集、ActSpace CLI、Docker CLI 和 Docker daemon 均通过。
- **容器级验证**: 跑通 `coding-basic` 的容器级 `--mock-agent`，证明 Docker runner 可以真实调用 ActSpace CLI 并生成评估产物和结构化报告。
- **通过报告验证**: 跑通 `judge-basic` 的 `--mock-agent + --judge-command`，证明 Docker runner、ActSpace CLI、产物读取、命令式裁判评分和报告链路闭合。
- **真实模型准备**: 外部评估仓库新增 `--env KEY` 显式环境变量透传，用于后续真实模型 live Agent 验证，同时避免默认暴露宿主 `.env`。
- **文档同步**: 更新 ActSpace 评估设计文档和执行计划，并同步外部评估仓库设计文档副本。

### Design Intent (Why)

Docker 评估不能只停留在 dry-run。容器级 mock Agent 证明运行器的隔离、挂载、CLI 调用和产物读取链路真实可用；命令式裁判数据集提供一个可通过的容器级评分样例。真实模型路径需要显式环境变量和网络策略，不能为了方便默认泄露宿主环境。

### Files Modified

- `docs/design-docs/agent-evaluation.md`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- `docs/histories/2026-07/20260710-0005-agent-eval-docker-runner-verification.md`
