# P01：True Cordis Dispatch

## 目标

让测试 fixture 和生产 Context 使用同一套 Cordis 调度语义：Waterfall 使用真正的 continuation chain，Serial 支持 bail，Parallel 等待全部 listener，通知 observer 逐 listener 隔离失败。

## 文件范围

- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/cordis-adapter/tests/cordis-lifecycle.spec.ts`
- 新增 `packages/cordis-adapter/tests/cordis-event-contract.spec.ts`
- `packages/session/persistence/src/session.ts`
- `packages/core/agent/src/*` 的 notification dispatch
- 受影响 package 的事件测试

`packages/cordis-adapter/src/events.ts` 在本阶段只允许被测试引用，不扩展其能力。

## 具体动作

1. 通过真实 Cordis Context 的 `ctx.waterfall(thisArg, name, payload, next)` 调用内建行为。
2. 将通知发布拆为 contained emit：同步 throw、异步 rejection 分别记录 diagnostics，后续 listener 继续执行。
3. 将 Session append 后的 `session/event` observer 与 `session/disposed` observer 使用同一套 containment 规则。
4. 为 `parallel` 添加明确的 Context 类型和 contract fixture；`session/flush` 使用 parallel，不把它伪装成 emit。
5. 为真实 Cordis 和 lightweight fixture 各添加 waterfall/serial/parallel/notification failure 测试，确保两条路径没有不同语义。

## 验收

- Waterfall 的 A → B → built-in、短路、结果包装全部通过；
- Serial 的首个 bail value 阻止后续 listener；
- Parallel 的所有 listener 都运行并等待；
- Notification listener 失败不阻断其他 listener；
- Cordis root dispose 后无活动 listener/fiber。

## 回退

如果真实 Cordis fixture 暴露版本差异，只修正 adapter 类型收口和测试 fixture，不增加第二个事件实现。
