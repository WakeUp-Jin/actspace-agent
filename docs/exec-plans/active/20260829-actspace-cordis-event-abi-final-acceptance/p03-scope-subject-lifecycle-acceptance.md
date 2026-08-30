# P03：Scope、Subject 与 Lifecycle 验收单

关联总计划：[README.md](./README.md)

状态：PASS（scope/subject/lifecycle 自动化证据通过）

## 验收目标

证明 Agent subject、Session scope、Tool execution scope 和 Cordis fiber 生命周期是一致的，事件不会跨 Agent 串线，插件 dispose 后不会泄漏 listener 或 in-flight 工作。

## 目标文件

- `packages/core/scope/src/scope.ts`
- `packages/core/scope/src/test/scope.test.ts`
- `packages/core/scope/src/test/lifecycle.test.ts`
- `packages/core/agent/src/registry.ts`
- `packages/core/agent/src/test/registry.test.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/session-plugin.ts`
- `packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts`

## 必须检查

1. Agent subject 和 scope carrier 成对绑定，不能将 Agent A 的 subject 配给 Agent B 的 scope。
2. parent scope 可以按授权规则观察 child；child 不接收 sibling 或未授权 descendant 的干预。
3. 两个 Agent 并行运行时，各自的 request、tool、status、error 和 session 事件互不串线。
4. plugin fiber dispose 后 listener、timer、lease、subprocess/in-flight dispatch 都收束；重复 dispose 幂等。
5. Runtime partial boot failure 逆序清理；正常关闭顺序可证明为 `stopAcceptingWork → flush → close → Cordis dispose`。

## 验证命令

```sh
pnpm --filter @actspace/core-scope test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/core-scope typecheck
pnpm --filter @actspace/core-agent typecheck
pnpm --filter @actspace/runtime typecheck
```

## 通过证据

执行摘要必须附 scope isolation、parent/child visibility、parallel Agent 和 dispose cleanup 的测试名称/日志。只通过单 Agent happy path 不足以通过 P03。
