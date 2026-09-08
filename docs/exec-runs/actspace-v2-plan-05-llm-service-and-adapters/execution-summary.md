# ActSpace v2 P05：LLM Service、PreparedCall 与 Provider Adapter — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-05-llm-service-and-adapters.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-05-llm-service-and-adapters/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成实现；pi-ai registry/packaged gate 待 P02

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| ActSpace LLM contract | `packages/agent-runtime/src/llm/{message,stream,usage,failure,adapter}.ts` | 稳定领域消息、流、usage 与结构化失败 |
| Route/lease | `route-registry.ts`、`activation-lease.ts`、`prepared-call.ts`、`service.ts` | exact registration、draining、one-shot dispatch、无残留 timer 的 lease drain |
| Backend seam | `pi-ai-adapter.ts`、`legacy-transport-adapter.ts`、`legacy-proxy-wire-engine.ts` | pi-ai/legacy 双 backend 共享同一上层 contract，三路 terminal event fail-closed |
| Credential/retry/catalog | `credential-port.ts`、`retry-policy.ts`、`model-catalog.ts`、`redaction.ts` | credentialRef、显式 retry policy、model facts 和脱敏 helper |

## Agent 已完成的验证

- P05 LLM tests：4 files、16/16；pi-ai compatibility 另有 6 个本地合同测试。
- TypeScript 5.9.3 strict NodeNext typecheck：通过。
- PreparedCall 未 dispatch、stream success、abort/cancel、route replacement、lease timeout/recovery、三路 truncated stream 和 proxy disconnect 均覆盖。
- P05 未引入 pi-ai、OpenAI、Anthropic 或旧 `agent-core/src/llm` 导入。

## 已知风险和遗留事项

- 仓库声明的 `@earendil-works/pi-ai@0.82.1` 仍需 P02 fresh-registry、proxy、三 route 和 packaged Electron 门禁；本轮没有把它写入生产依赖。
- 公开 SDK 的三路 fixture 已覆盖 terminal mapping；真实 Provider 的 reasoning signature、image、usage/cost 和协议漂移仍需在 P02/P15 验证。
- credential resolver 的实际 Host 实现由 P13/P14 提供，P05 只固定调用边界。
