# Plan 0：Shared Contract 与 Coordinator

> 状态：已完成。

## 目标

建立人工 Git Review 的唯一共享模型，并由 Main-owned Coordinator 管理 snapshot generation、缓存、失效通知和 viewed sidecar。

## 交付

- `ReviewSelection` 六 scope；Branch 保存本地 `branch`，不保存 renderer 指定的 remote/base ref。
- `ReviewSnapshot`、结构化 file/hunk/line、metrics、warnings、capabilities 和 mutation result。
- Branch 列表、copy apply command、snapshot/file diff/mutation/viewed/PR typed IPC。
- Coordinator 按 workspace + selection + generation 缓存 summary 和 file diff。
- full-file loading 进入 file-diff cache key，避免 patch/full 内容串用。
- mutation/refresh/watch 增加 generation；旧请求返回 stale。
- viewed sidecar 不进入 Git 或 session JSONL。

## 删除范围

- Review model purpose 与 `reviewModel`。
- Review run/finding/comment/session context 契约。
- Review Agent 和评论相关 IPC/event projection。
- `runAgentReview` capability。

## 验证

- Shared contract round-trip 与旧 settings 兼容。
- Coordinator request dedupe、refresh、stale generation、viewed persistence。
- `@actspace/shared` build 和 desktop typecheck。
