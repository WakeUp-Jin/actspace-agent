# P00：Session Journal 验收单

关联总计划：[README.md](./README.md)

状态：PASS（当前 Session Format v1 规则下；DSH 事件模型文档的 seq 起点矛盾另行记录）

## 验收目标

证明 Session 的最小持久化内核是 DSH 风格的 13 个核心事件，而不是只在类型文件中声明了 13 个字符串。必须同时证明 codec、Envelope、seq、append、flush、replay、recovery 和 post-commit 通知时序。

## 目标文件

- `packages/session/journal/src/core-codecs.ts`
- `packages/session/journal/src/event-envelope.ts`
- `packages/session/journal/src/invariant-validator.ts`
- `packages/session/journal/src/codec-registry.ts`
- `packages/session/journal/src/journal.ts`
- `packages/session/journal/src/test/journal.test.ts`
- `packages/session/persistence/src/session-store.ts`
- `packages/session/persistence/src/session.ts`
- `packages/session/persistence/src/recovery.ts`
- `packages/session/persistence/src/test/golden/acceptance.test.ts`
- `packages/session/persistence/src/test/recovery-fork.test.ts`

## 必须检查

1. `CORE_EVENT_TYPES` 恰好包含：`turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、`assistant/chunk`、`assistant/message`、`tool/call`、`tool/result`、`todo/write`、`request/header`、`request/context`、`session/end-seed`。
2. `PERSISTED_EXTENSION_EVENT_TYPES` 至少覆盖 `llm/retry*`、`compaction/*`、`approval/*`、`hook/*`、`goal/change`、`schedule/change`、`recovery/*` 和 `surface/replaced`；codec 存在不等于 producer 已实现。
3. 非法 payload、缺少 required codec、断 seq、损坏尾部的 access state 和恢复行为符合设计文档。
4. `SessionJournal` 重新以 seed 构造后，surface、relations 和 projection 与原 append 结果一致。
5. `SessionHandle` 的 `onEvent` 只在 writer append/fsync 后触发，`onFlush` 只在 batch flush 后触发；observer 失败不能回滚已提交记录。

## 验证命令

```sh
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/session-journal typecheck
pnpm --filter @actspace/session-persistence typecheck
```

## 通过证据

在执行摘要中记录每条命令的 exit code，并附上：核心事件数组输出、golden/recovery 测试结果、一个实际 `journal.jsonl` 的 header/seq/type 摘要，以及 `SessionStore.inspect()` 的 validation/accessState。缺少 replay 或 post-commit 证据时，P00 只能标记为 BLOCKED。
