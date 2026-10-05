# 代码与文档清理执行摘要

2026-10-05 后续结算：本文保留当轮实施与验收快照；重构范围内的剩余清理及界面门禁已由[最终收尾](../20261005-agent-refactor-final-closeout/execution-summary.md)完成，逐项 35/35 通过。

状态：本批源码、首批文档清理及验收完成；保留下面的测试限制，不作全仓清理完成签收。

## 已落地

- ManagedRuns 删除重复 Session 缓存和模拟 Loop/Inbox 外观，Task/Run 事实仍由 AgentService 持有。
- 删除 Runtime Headless 空转发及出口；默认配置直接使用 headless 插件。
- 自动标题成为 desktop-app 包内 Cordis 行为，移除应用基类的标题钩子；辅助文本调用独立复用。
- Runtime 按 startup、session、harness 分目录，同步公开出口、默认固定产物构建、imports 和测试。没有压合领域包。
- Session driver/provider seam 已存在，本批保留；没有把旧物理拆包计划冒充已完成。

删除3份重复历史设计、14份交接/轮次记录；3份旧页缩成 Git 回溯入口。P1–P5 最终验收索引保留轮次覆盖、修复和限制。Profile-first旧文明确标为历史，当前决定与实际实现同步。

## 验证

| 项目 | 当前结果 |
| --- | --- |
| 全仓 typecheck / build | 通过；Desktop dev 新测试 Context 类型适配修正后启动通过 |
| 相关包隔离验证 | 独立临时 worktree只应用本批源码差异，offline install、Runtime依赖闭包构建和85项测试通过 |
| Host / Harness recovery / CLI进程 | 通过；本地模拟服务，不是云部署验收 |
| 包边界 / v2 legacy / Harness事件 / 文档 | 通过；package-cutover非strict仍列出3个既存site /eval路径，未宣称strict通过 |
| Desktop全套 | 原工作区首次1008断言通过但悬空HoverCard定时器报错；复验一项批注卡关闭时序失败；隔离完整构建后串行全套1008项通过（139文件，1文件/2用例跳过）；未掩盖原工作区时序不稳定 |
| CLI分发产物 | 隔离副本生成tar.gz，解包后help/version、持久会话与resume冒烟通过；非签名Desktop发布验收 |
| Computer Use | gpt-6.1-sol完成[逐项验收](computer-use-acceptance.md)：A1/A3/A4/A5/A6通过；A2运行中手动命名与终态保持通过，标题请求30秒内竞争未实际覆盖，仅单测补证。没有确认新产品Bug |
| 历史保护 | 原有813个histories/learnings文件hash一致；原有产品/前端WIP保留 |

## 统计与未覆盖

前后统计使用 `pnpm refactor:stats before/after --plan 20261004-agent-refactor-cleanup`。源代码行几乎不变，不能声称大幅减码；本批收益是删除重复所有权与适配、模块职责可读、重复文档减少。统计包含本批新增计划/记录，也保留执行前已存在的未提交WIP，Git diff总行数不可直接作为本批收益。

其他功能专题设计、旧 active 验收计划及其他 exec-runs 尚未全部逐项审计，保持保留；不凭时间删除，不取消实际剩余需求。移动业务职责不等于全仓无冗余，后续清单继续维护在两份分析中。没有实现自进化工作流、手机Web或实际云部署。未提交、未推送。

## 2026-10-05 过程记录归并

原过程页补充事实：两次固定 Harness 路径替换错误曾由回归发现，修正后 Runtime 43 项通过；开发构建中的 Cordis Context 类型适配缺口通过 wrapper 修正。后续隔离全套结果见本文验证表。未覆盖的标题竞争不因删除过程副本而标为通过。
