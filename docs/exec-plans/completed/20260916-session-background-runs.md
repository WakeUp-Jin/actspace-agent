# 会话切换与后台运行

状态：实现完成，待真实 Electron 手动验收；用户已批准方案并要求实现。

## 范围与约束

切换只改变可见会话；模型、工具、子 Agent 和后台 Bash 的执行与状态更新不依赖选择。沿用现有分页，运行中的会话保留状态，返回时先显示缓存再校准。Journal 仍是唯一持久事实源，不改 IPC、后端执行语义或用户数据；应用退出后的任务续跑不在范围内。保留已有暂存及未暂存改动，不提交。

必读：AGENTS.md、协作/架构/core-beliefs、CODING_BEHAVIOR、FRONTEND_VERIFICATION、HISTORY_GUIDE、QUALITY_SCORE，以及 front-progressive-session-loading 与 front-agent-tool-stream-rendering。

## 执行与验证

1. 在 renderer App 集成测试中复现 A 运行时切 B 再回 A、两个会话并发和后台完成；先运行失败用例。
2. 在 renderer/session 增加会话运行状态类型，App 按 sessionId/runId 路由事件；仅刷新可见会话组件，侧栏运行集合在生命周期变化时更新。新建、分叉、隐藏工作区同样走选择边界。
3. 分页请求按会话版本隔离，最终结果使旧读取失效；流式回合覆盖其持久化对应消息，避免重复和状态倒退。后台 Bash 独立按 sessionId/taskId 更新。
4. 验证快速切换、后台失败、停止请求晚返回、工具终态、子 Agent、Bash 和历史分页；运行 App 回归、desktop typecheck/build 与 docs 检查。以隔离 fixture 验证真实 Electron，不能把 mock 通过当真实 Provider 通过。
5. 同步设计、history、学习笔记与执行摘要，归档计划。

## 风险与回退

最主要风险是旧历史快照覆盖刚完成的运行或重复拼接当前回合；测试明确覆盖乱序和稳定工具 ID。只回退本任务代码和文档即可，无数据迁移；不回退他人改动。
