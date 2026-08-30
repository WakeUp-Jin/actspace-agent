# P00：Scope Contract 与基础原语

## 目标

建立唯一的 opaque Scope identity、可循环检查的 parent relation、parent-aware registry view 和可等待静止的 Scope disposer。P00 完成后不切换 Agent Loop 生产调用点，但所有后续 Agent/Subagent 实现都可以依赖同一份 Scope contract。

## 范围

包含：

- `ScopeKey` 对象 identity；
- `ScopeIdentity` 诊断字段与 lineage；
- parent bind/read/chain，拒绝 cycle 和非法重复绑定；
- global/exact-scope/ancestor chain registry visibility；
- registration owner 与 disposer 绑定；
- active、quiescing、disposed 状态；
- P00 单元和契约测试。

不包含：

- Cordis 事件 dispatch hook；
- Agent Loop 调用点；
- Tool/Session/LLM 行为。

## 具体任务

1. 在 `packages/core/scope/src/` 定义不透明 `ScopeKey`、parent relation 和 chain 查询；对 parent link 做 cycle check，并确保重复 bind 只能由原始 owner rebind。
2. 扩展 `AgentScope`，使其保留公开诊断 id，同时内部生成稳定的实例级 key；`child()` 必须建立 parent relation，并由 parent disposer 负责 child 清理。
3. 将 `ScopedRegistry` 的 `get/entries` 语义固定为 global + farthest-ancestor-to-nearest merge；保留领域级 duplicate/shadow policy，不允许通用 registry 静默覆盖 core contribution。
4. 让注册操作在成功安装 undo 后再触发可选通知；Scope dispose 逆序执行 owner disposers，重复调用共享同一 quiescence boundary。
5. 为上述行为增加测试：cycle、重复 bind、parent/child/sibling visibility、nearest shadow、parent isolation、child cleanup、dispose race。

## 允许修改的文件

- `packages/core/scope/src/scope.ts`
- `packages/core/scope/src/layered-registry.ts`
- `packages/core/scope/src/disposer.ts`
- `packages/core/scope/src/index.ts`
- `packages/core/scope/src/` 新增的 key/chain 模块
- `packages/core/scope/src/test/**`

## 验收

- 同一 scope key 的 parent relation 可重复读取且不会形成 cycle；
- child 能读 parent contribution，parent 读不到 child-only contribution；
- 同名项由最近 scope 胜出，释放 child 后 parent value 恢复；
- child dispose 不释放 parent/sibling disposer；
- dispose race 最终只执行一次每个 disposer，并等待异步 disposer 完成；
- `pnpm --filter @actspace/core-scope typecheck && pnpm --filter @actspace/core-scope test` 通过。

## 回退

P00 只增强 Scope package 的内部原语和测试。若实现不通过，可回退新增 key/chain 文件和相关测试；现有 `AgentScope` 的 string identity 与 registry API 保持可运行，不涉及 Session 数据或运行时 boot。

## 依赖与交付

无外部依赖、无凭据、无网络。完成后把 contract 结果记录到总计划的执行记录，并将 P01 需要消费的导出名固定下来。
