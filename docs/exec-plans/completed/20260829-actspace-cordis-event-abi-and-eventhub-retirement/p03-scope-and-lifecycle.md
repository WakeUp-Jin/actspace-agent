# P03：Scope、Subject 与 Lifecycle

## 目标

用 Cordis scope chain 和 fused Agent dispatcher 取代精确 `kind/id` 事件匹配，并保证插件 listener、tool lease、timer 和 in-flight dispatch 随 fiber 正确清理。

## 文件范围

- `packages/core/scope/src/*`
- `packages/core/agent/src/registry.ts`
- `packages/core/agent/src/inbox.ts`
- `packages/core/agent/src/plugin.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- 新增 scope isolation、lifecycle disposal tests

## 具体动作

1. 为 runtime、preset、agent、child-agent/tool execution 建立父子 scope carrier。
2. Agent dispatcher 自动把 Agent subject 注入 payload，并使用同一个 carrier 作为 Cordis `this`。
3. 验证父 scope 可按规则观察 child，child 不接收 sibling 或 descendant 事件。
4. 将 listener、inbox wakeup、timer、approval waiter、tool lease 和 subprocess cleanup 绑定到 owning fiber 的 `ctx.effect`。
5. Runtime quiesce 时停止新 turn/inbox claim，等待 in-flight waterfall/serial/parallel/tool，再执行 Session flush 和 root dispose。

## 验收

- 两个并行 Agent 的 request/tool/status 不串线；
- child Agent 的通知可以被授权 parent scope 观察；
- sibling/descendant 事件不会被错误接收；
- dispose 后 listener 不再执行，所有 lease/waiter settle；
- 失败的 Agent 创建事务会回滚 scope、Session 和 inbox。

## 回退

scope 迁移问题只回退到真实 Cordis 的 root/child Context，不恢复全局 EventHub registry。
