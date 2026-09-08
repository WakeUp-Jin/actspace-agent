# 文档导航

本目录是仓库知识的正式来源。先按任务选择入口，再进入具体专题；当前实现、未来设计和历史证据分开阅读。

| 任务 | 入口 |
|---|---|
| 仓库协作与维护 | [协作约定](REPO_COLLAB_GUIDE.md)、[核心理念](design-docs/core-beliefs.md) |
| 理解当前架构 | [架构总览](ARCHITECTURE.md)、[v2 总体架构](design-docs/agent-plugin-runtime/agent-target-overall-architecture.md) |
| 查设计与契约 | [设计索引](design-docs/index.md)、[Agent 专题](design-docs/agent-index.md)、[前端专题](design-docs/frontend/README.md) |
| 继续已有工作 | [执行计划](exec-plans/README.md)、[仓库 TODO](TODOLIST.md)、[执行记录](exec-runs/README.md) |
| 查验证与安全要求 | [Agent 测试](design-docs/agent-plugin-runtime/agent-testing.md)、[前端验证](FRONTEND_VERIFICATION.md)、[安全](SECURITY.md) |
| 查变更与学习 | [history 约定](HISTORY_GUIDE.md)、[学习文档](learnings/README.md)、[发布记录](releases/README.md) |
| 查外部研究或诊断工具 | [参考资料](references/README.md)、[Session Viewer](tools/session-viewer/README.md) |
| 追溯 v1 | [v1 归档](archive/v1/README.md) |

## 状态与维护

- 当前实现以源码、公开契约和对应执行摘要共同核对；文档注明部分实施时，不能把目标当作已交付事实。
- Member、Room、Team 仍是未来产品设计，不代表当前 v2 已实现对应 Runtime。
- v1 资料集中到 `archive/v1/`。v2 文档在原专题目录持续更新，历史决策注明被替代的范围，不另建 v2 归档树。
- 已完成实现的计划进入 `completed/`，保留尚未通过的人工门禁；被替代的计划进入 `discarded/`。
- 历史和学习按原时间组织，执行记录按任务组织；它们可以引用归档，但不构成当前 API 依据。
