# Plan 3：撤销 AI Review 能力

> 状态：已完成（2026-07-30）。

## 决策

用户明确 Review 不需要 AI Review。最终产品只保留人工 Git Review，因此不采用“隐藏按钮、保留后台”的折中方案。

## 清理范围

- 删除 renderer AI Review 菜单、Review activity、findings 和评论回注。
- 删除 preload/main 的 start/cancel run、finding status、comment 和 projection IPC。
- 删除 desktop Review Agent/comment services 与测试。
- 删除 agent-core Review runtime、只读工具、prompt、validator 和测试。
- 删除 Review model purpose、`reviewModel` 设置与模型引用保护。
- 删除 session review lifecycle events 和 detached review context。
- 删除 shared finding/comment/run contract 与 `runAgentReview` capability。
- 同步设计文档、执行计划、质量评分和发布说明。

## 保留能力

- 六 scope、结构化 Diff、word diff、图片预览。
- stage/unstage/revert、Commit/Push/Create PR。
- generation、fingerprint、workspace guard 和 viewed sidecar。
