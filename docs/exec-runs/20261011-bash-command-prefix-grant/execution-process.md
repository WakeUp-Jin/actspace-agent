# Bash 前缀授权执行过程

- 2026-10-11：用户批准执行完整方案。核对未提交工作区，保留上下文引擎及其他并行改动。按契约、工具规则、Runtime、Host/前端、验证顺序执行。

- 完成 process.execute / command_prefix 正式契约、Journal codec、projection 恢复、工具授权分析、Runtime 匹配/复验/使用审计、本地 Desktop audience 接线及工作区变更回收。
- 增加保守语法与参数排除测试、真实临时目录/symlink 检查、授权签发复用撤销、审计失败、checkpoint 期间撤销、Journal 恢复和前端建议切换测试。
- 一次并行启动构建和测试导致 shared 构建产物短暂缺失；构建完成后重跑后端集成通过，未以首次失败计作产品缺陷。
- 完整 typecheck 通过；最终局部增量另行复查。Desktop 首轮全量因多项超时失败（8 文件、21 测试）；降低到 2 workers 重跑后仍出现超时，不能宣称全量通过。
- Computer Use 委派 gpt-6.1-sol：浏览器 mock 操作、文案、浅深和480px通过；已运行 Electron 属于另一 checkout，未操作其真实会话，因此实机授权复用、恢复未覆盖。

- 2 workers 全量重跑完成：1726 passed、6 failed、2 skipped；6 项为消息流 4 超时、IPC 大会话 1 超时、workspace watcher 1 断言失败。对这 6 项启动单 worker 定向复测，未修改它们的实现或超时阈值。

- 单 worker 隔离复测完成：6 passed、1 failed、43 skipped（名称筛选额外匹配一个消息流用例）。消息流/IPC 用例通过；workspace watcher 第 66 行仍失败。本轮未修改该模块，未对既有基线做对照，不断言为已有问题。
- Desktop 完整构建及审批定向 25 测试通过；最终 docs 检查通过。保留完整套件未通过和真实 Electron 未覆盖门槛。
