# P01：Agent Carrier 与 Scoped Dispatch

## 目标

把 Scope parent chain 接入 Agent-subject event admission，并提供 fused dispatcher，保证 Agent subject 与 Scope carrier 永远一致。P01 不重新定义事件列表或调度 mode，只消费 P0 事件 ABI 提供的 Cordis dispatch hook。

## 范围

包含：

- scope carrier 和 ancestor admission；
- `Agent subject + Scope carrier` fused dispatcher；
- `emit/parallel/serial/waterfall` 的 carrier 复用；
- subject/carrier mismatch invariant；
- parent/child/sibling dispatch contract tests。

不包含：

- 9 个 Agent Loop 事件字段、顺序或 mode 选择；
- Cordis 原生事件 ABI 的公共 API 重构（由独立事件 ABI 计划负责）；
- Agent factory 和 Subagent 生产身份切换（由 P02 完成）。

## 具体任务

1. 在 `packages/core/scope/src/` 增加 routing-only carrier：carrier 只保存 Scope route，不复制 Agent subject；为 carrier 提供可验证的 key 读取和 active 状态检查。
2. 在 `packages/core/agent/src/` 增加 Agent dispatch adapter：创建时捕获唯一 Agent 实例和对应 carrier，向事件 payload 注入该 Agent，并把 dispatch 转发到最终 Cordis Context。
3. 固定 admission：无标签 listener、目标 Scope listener 和任意祖先 listener 可见；child/sibling/unrelated listener 不可见；global bypass 只能由事件契约显式允许。
4. 实现开发/测试 invariant：payload subject 与 carrier key 不一致时 fail closed；disposed Agent 不接受新 dispatch；通知 listener 的单个异常不能改变 carrier 路由结果。
5. 增加 test Context fixture，覆盖真实 Cordis Context 可用和轻量测试 Context 两条路径；测试 `waterfall(next)` 保持下游委托能力，不退化为 payload 顺序变换。

## 允许修改的文件

- `packages/core/scope/src/**`
- `packages/core/scope/src/test/**`
- `packages/core/agent/src/**` 中新增的 dispatch adapter 与测试
- `packages/core/agent-loop/src/test/**` 中仅与 carrier/admission 相关的 fixture

不得修改 `packages/cordis-adapter/src/events.ts` 的事件定义；如果并行事件 P0 尚未提供最终 hook，先通过最小接口 adapter 验证，不在本计划中复制第二个事件实现。

## 验收

- parent listener 能观察 child event；child listener 不观察 sibling event；
- 同一 Agent 的所有 dispatch mode 使用同一 carrier；
- payload 中的 Agent 与 carrier identity 不一致时被拒绝；
- disposed carrier 不再调用 listener；
- true waterfall listener 可以调用 next、短路或改写下游结果；
- 相关 package tests 和 `pnpm -r typecheck` 通过。

## 回退

P01 失败时可保留 P00 的 Scope 原语，但生产 Agent Loop 不得恢复到自定义事件总线；如果 carrier invariant 不能证明，生产入口必须 fail closed。

## 依赖与交付

依赖 P00，以及并行事件 P0 提供的 Cordis dispatch hook 形状。无外部依赖、无凭据、无网络。完成后输出事件 admission 矩阵和 mismatch 测试证据，供 P02 接入。
