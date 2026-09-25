# Chat 创建时的 Compaction Service 接口修复

## 用户诉求

使用 Computer Use 测试权限与 Chat 后，用户批准修复 Chat 创建失败，并继续验证真实桌面链路。

## 变更

- `packages/compaction/src/plugin.ts`：在 `CompactionService` 上转发 `withTriggerRatio`，返回独立的 `CompactionPlugin`，不改变共享 Agent policy。
- `packages/compaction/src/test/lifecycle.test.ts`：通过真实 Cordis plugin 注册与 `ctx.get` 获取服务，覆盖动态/数值阈值、基础实例隔离与释放。
- 更新 Chat 执行摘要，区分已验证的创建/两轮对话和仍开放的外部验收项。

## 原因

调用方按 `CompactionPlugin` 断言服务类型，但 Cordis 实际注册的是包装层 `CompactionService`。旧测试只验证内部对象，未覆盖新增方法在真实服务边界的可达性。生产代码仅增加一行已有风格的方法委托，不重构 Runtime，不修改权限策略。

## 验证

- Red：新增测试先得到 `service.withTriggerRatio is not a function`，1 failed / 5 passed。
- Green：compaction 6 tests、Runtime 13 tests 通过；compaction build、两包 typecheck 通过。
- `pnpm dev:log` 重建依赖并重启成功；Computer Use 确认顶部与 workspace 创建、真实模型两轮对话、会话切换正常；观察真实窗口截图。
- Journal 确认 Chat preset、两轮 completed、精确的两个工具集合，没有工具调用。
- 同形扫描：源码中仅一个生产 `withTriggerRatio` 调用点；Service 既有两个压缩方法已转发。
- 尚未验收附件、搜索/生图、fork、完整重启恢复与主题矩阵；Chat 显示 Agent 相关控件的问题记录在执行摘要，未在本轮扩改。

## 学习沉淀

命中“可迁移”和“有陷阱”：记录到 [服务包装层需要独立契约测试](../../learnings/2026-09/service-wrapper-contract-tests.md)。
