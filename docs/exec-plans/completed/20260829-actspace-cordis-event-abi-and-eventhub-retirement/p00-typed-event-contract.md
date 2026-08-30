# P00：Typed Event Contract

## 目标

建立唯一的 Cordis `Events` 类型契约，明确事件 payload、Agent subject、scope carrier、调度模式和 waterfall `next()`，使错误的旧式 `(payload, EventContext)` handler 在编译期暴露。

## 文件范围

- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/core/agent/src/*` 的事件声明与 Agent 类型
- `packages/core/agent-loop/src/*` 的事件 payload 类型
- `packages/tools/runtime/src/*` 的 Tool event 类型
- `packages/session/persistence/src/*` 的 Session lifecycle/flush 类型
- `packages/runtime/src/runtime/*` 的 Runtime lifecycle 类型
- 对应 package 的 `tests/` 和 `src/test/`

不得在本阶段删除 EventHub；但不得新增任何 EventHub 调用点。

## 具体动作

1. 在领域包中通过 declaration merging 声明 9 个 Agent Loop 事件、5 个主要通知和 Session/Runtime lifecycle 事件。
2. 为 waterfall 事件声明最后的 `next` 参数；为 serial 事件声明可返回 bail decision 的返回值；为 emit/parallel 事件声明观察者返回类型。
3. 定义 Agent subject event 的 payload 推导和 fused dispatch 输入类型，禁止调用方传入可覆盖的 `agent` 字段。
4. 将 `EventContext` 从领域事件 handler ABI 中移除；需要 signal、turn、step 或 scope 的信息放入 typed payload 或 Cordis `this`。
5. 在 package exports 中只暴露 typed event contract，不新增自定义 EventHub 替代品。

## 验收

- `pnpm -r typecheck` 通过；
- typed fixture 能证明 `next()` 的位置和返回值；
- fixture 编译失败时，错误明确指出旧式 EventContext handler 不符合事件签名；
- 事件类型没有 `any` 或无边界 `unknown` payload。

## 回退

类型不兼容时只回滚本阶段修改，不恢复新的事件适配层；保留已有 EventHub 供后续阶段隔离迁移。
