# P00 执行过程

## 2026-08-30

- 复核 Session Journal、Surface、RuntimeV2 snapshot 和现有 projection adapter。
- 在 shared runtime-v2 增加 Projection key、revision、snapshot、change 与 Context/Trajectory projection 类型。
- 扩展 `@actspace/session-projection` 的 Session projection，补充 `sessionId`、`throughJournalSeq` 和 canonical Surface adapter。
- 增加 Surface、Inbox claim、snapshot/change contract tests。
- 重建 shared 与 session-projection，修复 workspace dist 声明消费问题。

## 验证

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/session-projection typecheck`
- `pnpm --filter @actspace/session-projection test`
- `pnpm --filter @actspace/session-journal test`
