# P00：Projection Contract 与 Canonical Surface Adapter

## 目标

冻结 ActSpace 的 Session Projection public contract，并让 Conversation projection 明确复用 `SessionJournal.surface` 的结果。完成后，任何 consumer 都可以使用 `sessionId + throughJournalSeq` 识别一份一致快照，`agent/inbox/spliced` 产生的 user Surface node 不会在 Desktop 或其他 Host 的 adapter 中被漏掉。

## 依赖

- P0 的 13 种核心事件、持久化扩展、Surface 和通知契约；
- P1-A 已交付或可消费的 Session Core/Persistence detached types；
- 当前 `packages/session/projection`、`packages/shared/src/runtime-v2/projection.ts` 和 `SessionJournal.surface` 实现。

P00 不等待 P1-C 的 Boot 接线，也不修改 Session JSONL 文件格式。

## 范围

允许修改：

- `packages/session/projection/src/projection.ts`；
- `packages/session/projection/src/index.ts`；
- `packages/session/projection/src/manifest.ts` 和 `plugin.ts`，仅在 service metadata/export 需要时；
- `packages/shared/src/runtime-v2/projection.ts`；
- `packages/shared/src/runtime-v2/index.ts`；
- `packages/session/projection/src/test/**`；
- `apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`，只增加 contract/regression fixture。

禁止修改：

- `packages/session/journal` 的事件名称、顺序和 Surface eligibility；
- JSONL writer、lease、recovery 和物理目录；
- Agent Loop、Tool executor、LLM adapter、Electron UI 组件；
- `apps/desktop/src/renderer/App.tsx` 的状态迁移。

## 实施步骤

1. 在 `packages/shared/src/runtime-v2/projection.ts` 冻结 `ProjectionKey`、`ProjectionRevision`、`SessionProjectionSnapshot`、`ProjectionChange` 和核心 projection value 的 JSON-safe 约束。`throughJournalSeq` 必须是同一 snapshot 的共享水位。
2. 在 `packages/session/projection/src/projection.ts` 将现有 `SessionProjection` 扩展为 detached、可序列化、带 `sessionId` 和 `throughJournalSeq` 的 contract；保留当前 pending Inbox、open Turn、open Step 和 Surface 信息。
3. 增加 canonical Surface adapter。它只调用 `SessionJournal` 的 Surface fold 或对其做纯 DTO 映射，不再按 Desktop renderer event type 重新猜测哪些事件能产生消息。
4. 为 `user/message`、`agent/inbox/spliced` enqueue/claim/discard、`assistant/chunk`、`assistant/message`、`tool/result`、`surface/replaced` 建立最小 golden fixtures，断言 Surface entries、sourceEventSeqs 和 replaceGeneration。
5. 为空 Journal、未知 ignorable event、未知 required event、非法 Surface replacement、seq gap 和多个 Session 并行建立 contract test；验证 projection 不读取 AgentLoop 或 renderer 私有状态。
6. 更新 `packages/session/projection` 的 exports 和 manifest metadata，使后续 P01 可以按稳定 key 注册 projection unit。

## 验收标准

- `SessionProjectionSnapshot` 的每个返回值都有 `sessionId` 和 `throughJournalSeq`。
- canonical Surface adapter 对 `agent/inbox/spliced` 的 claim Surface append 生成 user node。
- 全量 replay 与从同一事件前缀构建的 snapshot 字节稳定，除了明确允许的 key 顺序差异。
- `apply`、`view` 和 schema 都是同步、JSON-safe、可脱敏的纯 contract。
- 13 个核心事件和现有 Surface golden 结果不变；旧 `SessionEvent` UI 事件类型不被重新写入 Journal。
- `pnpm --filter @actspace/session-projection typecheck` 和 `test` 通过。

## 定向验证

```bash
pnpm --filter @actspace/session-projection typecheck
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/shared typecheck
pnpm exec vitest run apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts
pnpm run check:docs
```

## 回退

P00 只涉及 public types、纯 adapter 和测试。若 contract 设计需要调整，回退新增 exports 和 adapter，保留原有 Journal、Surface 和 JSONL 文件；不得用 Desktop renderer 的旧事件映射替代 canonical Surface 作为最终方案。

## 交接给 P01/P02

必须提供：

- 最终 projection key 列表；
- `SessionProjectionSnapshot`、`ProjectionChange` 和 revision 类型；
- canonical Surface adapter 的调用入口；
- stateVersion 的初始值和变更规则；
- golden fixture 路径及定向测试结果。

## 进度记录

- [ ] 冻结 shared projection types。
- [ ] 完成 canonical Surface adapter。
- [ ] 完成核心事件和 Surface golden/negative fixtures。
- [ ] 更新 exports、manifest 和设计索引。
- [ ] 完成定向验证并交接。

## 执行模式

交互模式。P00 是后续 Registry、Desktop Store 和 Contract Matrix 的公共类型地基，任何字段或水位语义变化都需要在本计划和设计规范中同步记录。
