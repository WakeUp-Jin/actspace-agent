## [2026-10-14 21:55] | Task: 修复内置 Harness 连续升级导致任务卡队列

### Execution Context

- Agent ID: /root
- Base Model: Codex（主智能体）；gpt-6.1-sol（Computer Use 子智能体）
- Runtime: Codex Desktop，本地开发工作区

### User Query

> 开始修复 bug；确认 Q1 队列与 C1 验收样例修复方案。

### Changes Overview

- Control 允许完整 Host 可信内置历史连续升级，Host 契约变化后恢复应用随附版本；版本和契约未变不重复写 revision。用户选择、分支和其他恢复错误保留既有保护。
- Runtime 移除内置组合包含 plugin-manager 就不能升级的旧限制。
- HMR 将选择恢复阻塞映射为 RECOVERY_BLOCKED，让队列走既有可恢复暂停分支。
- turn-deliverables 保留原两轮，补第三轮单文件 +1/-1，并更新 mock 投影测试及前端验收指南。

### Design Intent

错误码是调度协议。原实例第二次内置升级被条件拒绝，HMR 又把恢复异常降为普通错误，形成无 Run、pending 且未暂停的任务。修复兼顾可信内置迁移与可恢复错误语义，不清空用户历史。

### Validation

- 实际运行失败回归后修复：Control 两例、HMR 两例先失败，修复后通过。
- Control 28、HMR 5、AgentService 33、Runtime 5、Desktop 定向 40，共 111 项通过。
- Desktop typecheck、依赖构建、Electron 构建通过。
- 原应用重启后选择历史 2→3，旧两条逐字保留，新记录为 Host trusted-builtin-upgrade。
- Computer Use 复验受另一项未完成改动阻塞：index.css 引用不存在的 trajectory.css。真实请求完成、present 和第三轮 mock 交互尚未声明通过，详见执行摘要。

### Files Modified

- packages/harness-control/src/{service,contracts}.ts 与 activation 回归测试
- packages/harness-hmr/src/service.ts 与 lifecycle 回归测试
- packages/runtime/src/harness/agent-runtime-plugin.ts
- apps/desktop/src/renderer/mock/scenarios/turn-deliverables.ts 与 mock-bridge 测试
- docs/FRONTEND_VERIFICATION.md、任务生命周期设计、执行计划与执行记录

### Learning

命中可迁移、有深度、有陷阱：错误语义跨层丢失会改变调度状态。见 ../../learnings/2026-10/20261014-recoverable-error-contract.md。
