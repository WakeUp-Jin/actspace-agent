## [2026-05-28 02:18] | Task: Lab V0 frontend execution plan

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 今天先把 Lab 前端写好，后端 Agent 之后再设计；前端可以使用 mock 数据，但基本交互和执行流程要有。为这个前端原型写一份执行计划。

### Changes Overview

**Scope:** `docs/exec-plans/`

**Key Actions:**

- **[Plan]**: 新增 `docs/exec-plans/active/lab-v0-frontend-mock-implementation.md`，明确 Lab V0 今天只做真实 renderer 前端、mock 数据和基础交互流程。
- **[Scope guard]**: 在计划中排除后端 Agent、Lab Runtime、IPC、preload、本地持久化和真实能力晋升，避免前端实现范围失控。
- **[Task breakdown]**: 将工作拆成 LabPage 接入、mock view model、四栏矩阵、新实验弹窗、卡片详情、推进流程、已完成弹窗、renderer 测试和浏览器 mock 验收。
- **[Index]**: 将该计划加入 `docs/exec-plans/README.md` 的 active 列表。

### Design Intent (Why)

Lab 的单文件原型已经能表达页面形态和交互语法。下一步应先把它变成真实 React renderer 页面，用 mock 数据验证工作流与视觉密度；后端 Agent 和持久化仍需单独设计，暂不与前端实现耦合。

### Files Modified

- `docs/exec-plans/active/lab-v0-frontend-mock-implementation.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-05/20260528-0218-lab-v0-frontend-plan.md`
