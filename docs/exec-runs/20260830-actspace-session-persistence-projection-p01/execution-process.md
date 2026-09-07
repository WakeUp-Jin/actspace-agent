# P01 执行过程

## 2026-08-30

- 在 `@actspace/session-projection` 增加纯 projection registry、per-session cell、统一 watermark 和 change feed。
- 新增 `@actspace/session-projection-cache`，实现内存 checkpoint store、restore floor、cold restore 和可删除 cache。
- cache 只消费 Journal tail 与 detached value，不参与 Journal append。
- 增加 late registration、duplicate key、event gap、checkpoint restore、version mismatch 和 cache delete tests。

## 验证

- `pnpm --filter @actspace/session-projection typecheck`
- `pnpm --filter @actspace/session-projection test`
- `pnpm --filter @actspace/session-projection-cache typecheck`
- `pnpm --filter @actspace/session-projection-cache test`
