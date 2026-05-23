# Plan guide quality rules

## 用户诉求

用户指出此前后端 execution plan 过粗，虽然已有设计文档，但缺少从设计文档转换为可执行计划的明确标准。希望参考 superpowers 中 brainstorming / writing-plans / subagent-driven-development 的原则，补强本仓库的 `PLANS_GUIDE.md`。

同时要求在 `AGENTS.md` 中加入 `docs/backend-agent-testing.md` 作为后端 Agent 测试策略入口。

## 本次改动

- 更新 `docs/PLANS_GUIDE.md`：
  - 增加“从设计文档生成 plan”的分层说明。
  - 增加 plan 就绪检查。
  - 增加可并行 plan 要求，明确子 Agent 执行提示必须要求先读 `AGENTS.md`。
  - 增加任务粒度和 plan 自审规则。
- 更新 `AGENTS.md`：
  - 在按任务需要选读中加入 `docs/backend-agent-testing.md`。

## 设计动机

这次沉淀是为了避免复杂后端任务再次出现“设计方向正确，但执行计划过粗”的问题。以后大型任务应先沉淀设计事实来源，再拆成足够具体、可验证、可并行交给 Agent 的 execution plans。

## 影响文件

- `docs/PLANS_GUIDE.md`
- `AGENTS.md`
