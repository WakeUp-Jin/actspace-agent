# 重构收尾：代码与文档清理

状态：本批实施与验收完成；A2精确30秒竞争实机未覆盖，单测补证；全仓其他专题未作完成声明。2026-10-04 用户授权执行两份清理分析；不提交、不推送、不删除用户数据。

依据：[代码清理](../../design-docs/agent-plugin-runtime/agent-refactor-code-cleanup-review.md)、[文档清理](../../design-docs/agent-plugin-runtime/agent-refactor-docs-cleanup-review.md)。

## 执行顺序与验证

- [x] C2：删 Runtime Headless 空转发及 exports，构建与配置入口验证。
- [x] C1：ManagedRuns 移除 session 缓存及伪 Loop/Inbox；应用层直调 TaskService，保留配置、lease、取消所属任务。消费者为 AgentApplication、HeadlessRunner、Runtime tests。
- [x] C3：Desktop 标题成为包内 Cordis 插件；run-preparing/title-changing 通知替代基类继承钩子；辅助 LLM 独立模块；保留后台任务 idle、手动重命名优先与退出等待。
- [x] C4/C5：Runtime 文件按 startup/session/harness 归属移动；迁移 import、exports、构建输入、契约生成和行为测试。
- [x] C6：核实 Session driver seam，记录保留或收敛理由，不擅自新增 Core 包。
- [x] D：退役清单记录源路径、去向与保护入链；清理重复旧设计、无效计划、重复验收轮次，保留最终覆盖/限制。
- [x] 验证：相关包测试、typecheck、build、代码/事件/文档门禁、CLI/Host/recovery 进程验证。涉及任务/标题的 UI 委派 Sol 验收。

## 目录目标

Runtime 的 runtime/ 平铺实现按 startup/（启动与退出）、session/（持久会话与投影装配）、harness/（组合与执行绑定）分组。公开包名不变。领域包、Host、Client 所有权不变。

## 文档保护与回退

histories/learnings 已存 hash 快照，既有文件不删不改。被其引用的退役文档保留短回溯入口，其他已被替代文件可删；当前入口链接到最终真源。前端/产品概念 WIP 不混入。

每批验证后独立可运行；失败回退本批文件，不用旧 dist 或改用户配置绕过。实际过程与结果只记同任务的[过程](../../exec-runs/20261004-agent-refactor-cleanup/execution-summary.md)和[摘要](../../exec-runs/20261004-agent-refactor-cleanup/execution-summary.md)，不复制设计全文。
