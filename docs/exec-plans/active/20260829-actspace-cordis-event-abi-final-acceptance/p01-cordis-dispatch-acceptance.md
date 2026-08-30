# P01：Cordis dispatch 验收单

关联总计划：[README.md](./README.md)

状态：PASS

## 验收目标

证明插件公共事件面是真实 Cordis Context，而不是 EventHub 的字符串转发。必须分别验证 waterfall continuation、serial bail、parallel settlement 和 contained notification failure。

## 目标文件

- `packages/cordis-adapter/src/event-contract.ts`
- `packages/cordis-adapter/src/dispatch.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/index.ts`
- `packages/cordis-adapter/tests/cordis-lifecycle.spec.ts`
- `packages/cordis-adapter/tests/lifecycle.spec.ts`
- `packages/cordis-adapter/tests/service-contract.spec.ts`

## 必须检查

1. `AgentLoopIntervention` 包含 9 个事件：`system-prompt/assemble`、`agent/pre-step`、`agent/request`、`llm/stream`、`agent/request-error`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`agent/turn-stopping`。
2. 前 8 个使用 waterfall，`agent/turn-stopping` 使用 serial；waterfall handler 的最后参数是 `next()`。
3. outer → inner → built-in 的 around 顺序可观察；不调用 `next()` 时下游不执行；handler 可以包装返回值。
4. serial 在首个非 `null`、非 `false`、非 `undefined` 返回值处停止；parallel 等待所有 listener settlement。
5. `emitContained` 对同步 throw 和异步 rejection 逐 listener 隔离，兄弟 listener 仍执行。
6. `packages/cordis-adapter/src/events.ts` 不存在；不存在 `createEventHub`、`createCordisEventHub` 或字符串事件桥。

## 验证命令

```sh
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/cordis-adapter typecheck
```

## 通过证据

执行摘要必须附 listener 顺序、短路、serial bail、parallel 等待和 observer failure 的测试名称/输出。若只证明了 `ctx.on()` 能接收事件，但没有证明真实 `next()` continuation，P01 不通过。
