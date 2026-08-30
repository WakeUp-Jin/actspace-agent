# P1-B：Service Definition / Provider / Consumer 三层收敛

状态：实施中；Service Definition/Provider/Consumer contract slice 已交付，G1 全局收口待执行。

## 目标与依赖

把当前 `@actspace/cordis-adapter` 的 `ServiceDefinition`、`ServiceProvider`、`ServiceConsumer` 雏形提升为所有核心能力的可检查 ABI。依赖 P0 已冻结的 Cordis lifecycle、Agent Scope 和核心 Service seam；可与 P1-A 并行，P1-C 只在 Definition/Provider metadata 稳定后接入生产 Composition。

设计真源：[Service Definition / Provider / Consumer 分层规范](../../../design-docs/agent-plugin-runtime/agent-spec-service-definition-provider-consumer.md)。

## 范围和文件所有权

允许修改：

- `packages/cordis-adapter/src/service-contract.ts` 及其 type/runtime metadata tests；
- `packages/cordis-adapter/src/manifest.ts`、`plugin-contract.ts`、验证器和 exports；
- Session、Journal、Persistence、LLM、Prompt、Tools、Compaction、Agent、Agent Loop、Runtime 各 package 的 `service-definition.ts`、`provider.ts`、`consumer.ts` 或等价 metadata 入口；
- 各 package manifest、`package.json` exports、service contract/lifecycle tests；
- Tool Runtime shell 的 provider adapter 和 registration metadata。

禁止修改具体工具 executor 的参数、路径、排序、截断、错误或副作用逻辑；禁止新增中央 service map；禁止通过 Provider 私有 class 作为 Consumer 入口。

## 核心 Service 清单

至少覆盖以下稳定 ID，并为每行标出 owner、scope、required、default Provider、Consumer 和 dispose 语义：

`session.core`、`session.persistence`、`session.journal`、`llm.service`、`prompt.runtime`、`context.assembly`、`tools.runtime`、`agent.registry`、`agent.loop`、`compaction.runtime`、`agent.runtime`。

Tool Runtime 的 `core-tools`、`browser-tools` 以 Provider contribution 注册；其 executor body 仍由现有工具 package 拥有。

## 实施步骤

1. **公共 ABI**：补齐 JSON-safe、可 hash 的 Definition metadata（id、abiVersion、owner、scope、required、config schema、errors、public surface），并固定 `ProviderHandle.dispose()` 与 `Consumer.requires` 语义。
2. **领域声明**：为核心 package 建立 Definition/Provider/Consumer 入口，清楚区分 `session.core` 与 `session.persistence`，以及 `tools.runtime` 与具体工具 contribution。
3. **Cordis 生命周期**：Provider 在 apply 前校验 config/dependencies，使用 `ctx.effect()` 管理 listener/timer/lease/task，完成原子 publish、quiesce、drain、逆序 dispose；Consumer 只通过 Definition narrow interface 注入。
4. **Manifest consistency verifier**：机械比较 `manifest.provides/injects`、Definition metadata、`ctx.provide` 和 `static inject`；对缺失 required、重复 Provider、inject cycle、disposed Fiber 和未导出 symbol fail closed。
5. **Fake Consumer tests**：Consumer 测试只使用 Definition-compatible fake；增加 provider failure、config invalid、duplicate registration、dispose idempotency、scope mismatch 和 RuntimeHandle 不泄露 Context/Fiber/Provider class 的测试。
6. **交接**：输出 Service ownership table、依赖 DAG、manifest verifier 命令和供 P1-C/P2 消费的 metadata index。

## 验收标准

- 每个核心 Service 都能从 public export 找到 Definition、默认 Provider、Consumer 清单。
- manifest、`static inject`、`ctx.provide` 和 Definition metadata 一致；负向 fixture 会失败并保留结构化 diagnostics。
- Consumer 不导入 JSONL、pi-ai、具体 Tool executor 或 Provider 私有 class。
- Provider activation/dispose 为可等待、幂等、fail-closed lifecycle；RuntimeHandle 不暴露 Context、Fiber、writer 或 Loader handle。
- read/list/edit/bash/Browser Bridge 的 executor parity fixture 全部保持现有行为。

## 定向验证

```bash
pnpm --filter @actspace/cordis-adapter typecheck
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/runtime typecheck
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/tools-runtime typecheck
pnpm run check:packages
```

完成后再运行 `pnpm -r typecheck`、`pnpm -r test` 和 CLI one-shot process smoke；真实 Provider/Browser 是外部门禁，需单独标记。

## 回退

如果某个 Service seam 失败，回退对应 Provider adapter 和 metadata 接线，保留 Definition/fake tests 和 P0 Cordis ABI。不得恢复中央 `serviceValues` 容器、让 Runtime 拥有领域状态，或改工具 executor 以掩盖 shell contract 差异。

## 交接给下游

P1-C 需要消费每个 Service 的唯一 provider、config schema、required/capability 和 loader admission metadata。P2 需要消费 Definition/Provider/Consumer 的 owner、public export、tests、sourceRefs 和 diagnostics 规则。

## 进度

- [x] 冻结公共 Definition/Provider/Consumer ABI。
- [x] 完成核心 Service ownership 与 package exports metadata。
- [x] 完成 lifecycle/manifest consistency verifier 与 Service graph validator。
- [x] 完成 fake Consumer、负向 fixture 和 provider lifecycle contract tests。
- [x] 通过定向门禁、全仓 typecheck/test，并向 P1-C/P2 交接 metadata。
