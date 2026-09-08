# P02：Agent / Subagent Scope 集成

## 目标

将 main Agent、one-shot Subagent、Agent Loop 和 Runtime factory 的生产身份统一到 live Agent Scope：descriptor/preset 只保留静态配方语义，事件与资源所有权使用实例级 Scope identity。完成后多个同 descriptor Agent、不同 Session Agent 和 parent/child Subagent 可以并行运行而不串 listener、registry 或 dispose。

## 范围

包含：

- main Agent 唯一 scope identity；
- child Agent 默认使用 parent Scope；
- 显式 isolated child Scope（flat registration）选项；
- Agent setup/publication/dispose 顺序；
- Agent Loop 只替换 Scope carrier/identity 接入；
- one-shot Subagent 的级联取消和 child scope cleanup；
- CLI one-shot、Subagent 和 shutdown contract tests。

不包含：

- Agent Loop 事件 ABI 的字段或 mode；
- Session lineage schema 的重新设计；
- Tool executor 和权限策略的重写；
- Desktop UI。

## 具体任务

1. 在 `packages/core/agent` 固定 live Agent identity contract：公开 `agentId` 用于诊断，内部 subject/key 用于 dispatch；`MAIN_AGENT_DESCRIPTOR.id` 和 preset id 不再作为 scope key。
2. 修改 `packages/runtime/src/runtime/agent-factory-plugin.ts`，使每次 main Agent assembly 在 unpublished Scope 中创建自己的 Agent subject、Prompt/Tool registry view、cancel chain 和 dispatcher，完成 setup 后才 publish。
3. 修改 `packages/subagent/src/provider.ts`，默认以 parent Scope 创建 child Scope；child Agent 使用独立 child identity、Session、Inbox 和 dispatcher；child terminal 后先等待 loop/stream/tool settlement，再 dispose child Scope。为需要注册隔离的调用提供显式 flat child Scope 选项，不得把 flat 模式作为默认行为。
4. 修改 `packages/core/agent-loop/src/**` 中仅涉及 identity/carrier 的调用点，让通知、干预和 tool event 复用 Agent dispatcher；不修改事件名、事件顺序和工具执行函数。
5. 覆盖失败路径：setup failure 不 publish、publication failure 逆序回滚、parent abort 级联 child、child failure 不终止 parent、shutdown 不留下 orphan child。
6. 增加集成测试：两个相同 descriptor 的 main Agent 并行；parent/child/sibling listener 隔离；child registry shadow；child dispose 后 parent 恢复；CLI one-shot journal 仍写入原有事件序列。

## 允许修改的文件

- `packages/core/agent/src/**`
- `packages/core/agent-loop/src/**` 中 identity/carrier 相关文件和测试
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/agent-runtime-plugin.ts`
- `packages/subagent/src/provider.ts`
- `packages/subagent/src/test/**`
- `packages/runtime/src/runtime/test/**` 或现有对应 integration test 文件

不得修改工具 executor、Session event codec、JSONL writer 或 Cordis 事件 ABI 的所有权文件。

## 验收

- 同一 descriptor 的两个 Agent 不共享 scope key、listener 或 scoped registry；
- 普通 parent listener 可观察 child，child 不观察 sibling；显式 flat child 不读取 parent-local contribution，但仍保持独立 Agent/Session/lineage 关系；
- child Scope 清理不会移除 parent/sibling contribution；
- parent abort、Runtime shutdown 后没有 active child、pending dispatcher 或未释放 scope；
- child setup/publication 失败留下结构化失败结果，不产生半配置 Agent；
- `pnpm --filter @actspace/core-agent test`、`pnpm --filter @actspace/core-agent-loop test`、`pnpm --filter @actspace/subagent test`、CLI one-shot smoke 和 `pnpm -r test` 通过。

## 回退

若生产集成与并行 Service P0 发生冲突，可以先保留新 Scope primitives 和 carrier tests，将 Runtime factory 的 identity 接入切成一个独立提交；但不允许恢复 descriptor/preset id 作为 live event scope。Session 数据格式无需迁移，回退只影响进程内路由和生命周期实现。

## 依赖与交付

依赖 P00、P01，以及 Agent Loop 的最终 Cordis dispatch hook 和 Agent Service 的稳定创建/销毁入口。无外部依赖、无凭据、无网络。完成后需要更新 Agent/Subagent 设计规范的实现状态、总计划和 execution summary。
