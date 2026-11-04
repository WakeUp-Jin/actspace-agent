# 文档导航

本目录是仓库知识的正式来源，也是唯一的总导航。先按任务选择入口，再进入具体专题；现行规则、执行过程和历史记录分开阅读。

| 任务 | 入口 |
|---|---|
| 仓库协作与维护 | [协作约定](REPO_COLLAB_GUIDE.md)（含编码行为纪律）、[执行计划约定](PLANS_GUIDE.md)、[history 约定](HISTORY_GUIDE.md) |
| 理解当前架构 | [架构总览](ARCHITECTURE.md)、[v2 总体架构](design-docs/agent-plugin-runtime/agent-target-overall-architecture.md)、[packages 地图](../packages/README.md) |
| 做前端 | [前端规范入口](design-docs/frontend/README.md)：先读[新功能开发清单](design-docs/frontend/front-新功能开发清单.md)，再读[视觉 token](design-docs/frontend/front-视觉token规范.md)、[文案与状态表达](design-docs/frontend/front-文案与状态表达规范.md)、[组件与交互模式](design-docs/frontend/front-组件与交互模式规范.md)；验收见[前端验证](FRONTEND_VERIFICATION.md) |
| 查后端设计与契约 | [设计索引](design-docs/index.md) |
| 继续已有工作 | [执行计划](exec-plans/README.md)、[已完成计划索引](exec-plans/completed/README.md)、[技术债](exec-plans/tech-debt-tracker.md)、[执行记录](exec-runs/README.md) |
| 查验证、稳定性与安全 | [Agent 测试](design-docs/agent-plugin-runtime/agent-testing.md)、[稳定性](RELIABILITY.md)、[安全](SECURITY.md)、[CI/CD 与供应链](CICD.md) |
| 查变更与学习 | [学习文档索引](learnings/README.md)、[发布记录](releases/README.md)、[路线图](roadmap.md)、`histories/`（决策时间线） |
| 查外部研究或诊断工具 | [参考资料](references/README.md)、[Session Viewer](tools/session-viewer/README.md) |

## 各目录放什么

- `design-docs/`：现行规则与设计，只写当前事实，不写日期、确认记录和实施流水。
- `exec-plans/`：`active/` 只放还有下一步的计划；完成的进 `completed/`，原文不改；`completed/design-archive/` 放从设计文档拆出的决策表、验收矩阵和旧稿，只做追溯。
- `exec-runs/`：每次执行只留 `execution-summary.md` 和被其他文档引用的证据文件。
- `histories/`：决策时间线，按时间保留原样；里面的旧路径只代表当时，不作为当前依据。
- `learnings/`：只收「下次还会踩、读代码看不出来」的教训，写法见 [WRITING_GUIDE](learnings/WRITING_GUIDE.md)。

## 维护规则

- 当前实现以源码和公开契约为准；文档注明部分实施时，不能把目标当作已交付事实。
- 代码或流程变更让文档过期时，在同一轮里改掉；失效文档删除，需要时查 git 历史。
- 多智能体协作（Space、Actor 名册）见 `design-docs/多智能体协作/`，当前只做前端演示，不代表 v2 已实现对应 Runtime。
- 链接用相对路径，不链接 gitignored 或 `tmp/` 下的文件；`pnpm check:docs` 校验必需文件、现行文档和链接。
