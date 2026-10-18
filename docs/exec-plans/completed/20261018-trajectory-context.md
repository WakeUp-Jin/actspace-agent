# 轨迹上下文分类与子工具接线

状态：实施完成，定向验收已执行；2026-10-18 用户确认。沿用当前分支，保留已有未提交改动。

## 范围与契约

1. 概述显示 user/context 已有 startedAt，复用时间切换组件。
2. 请求快照新增带 id/owner/order/content 的 contextSections（不替换旧 systemSections）；历史窗口保留首份和变化份，未变化沿用。轨迹按来源区分规则、技能目录、已加载技能、运行信息，首见/变化/移除各生成上下文展示记录；明确这些是请求组成投影，实际角色仍为 system。旧数据不推测来源。
3. 动态补充保留 owner/id/lifetime，显示可读类别；不改变消息角色，不强制 XML。
4. 父调用通过 delegation/requested 关联子 Session；复用 ClientSessionStore 和 DesktopSessionBridge 订阅与历史读取。各 Session 单独构建，再把工具记录挂到父调用，身份带 Session 命名空间，Schema 来自子请求，父请求统计不包含子请求 Token。载入失败和历史未完整必须可见，取消/切换后释放订阅。

## 步骤与验证

- [x] 时间展示回归用例先失败再修复。
- [x] 快照来源与历史精简兼容；分类增删改/旧日志/不变去重的测试。
- [x] 跨 Session 关联、同名 callId、子 Schema、失败与订阅释放测试；分页沿用现有读取链路，真实历史翻页单列验收。
- [x] Desktop 类型检查和全量测试、相关 runtime/context/prompt 测试、前端三项检查通过；文档检查仍被一条既有归档断链阻挡。
- [x] 构建生产 Electron；gpt-6.1-sol 定向 Computer Use 已执行，重载、时间、上下文来源、子工具 Schema、浅深主题和窄窗结果见验收报告；未触发项与父委派持久化失败单列。

## 风险与回退

来源元数据会增加请求记录大小；沿用记录大小上限和历史去重，准备后输入被改写时明确不可分类。子会话数量和历史读取需要按已关联会话加载，不递归扫描全部会话。失败时保留父轨迹与可见错误。回退仅撤销本任务精确改动，不重置工作区。

执行记录：[过程](../../exec-runs/20261018-trajectory-context/execution-process.md)、[摘要](../../exec-runs/20261018-trajectory-context/execution-summary.md)。

验收边界：[已知问题](../../exec-runs/20261018-trajectory-context/known-limits.md)。本计划完成轨迹显示范围，不代表此前的父委派持久化问题已解决。
