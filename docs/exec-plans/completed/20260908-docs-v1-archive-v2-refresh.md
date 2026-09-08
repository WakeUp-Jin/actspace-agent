# Docs 清理：归档 v1，原位更新 v2

状态：已完成，2026-09-08；文档与检查范围验收通过，既有历史链接债务单独记录。

## 边界

只有 v1 资料进入 `docs/archive/v1/`，v2 留在原专题目录修订。历史、学习和执行记录维持原位置。保留 Session Format v1；不改产品代码、用户数据，不提交或推送，不处理无关未跟踪文件。

## 执行批次

- [x] 归档现有 v1 设计、旧审计与笔记；保存 Member/Room/Team 完整旧稿，保留精简产品稿；修复迁移引用并记录逐文件映射。
- [x] 原位校准 v2 总体架构、Runtime 生命周期、相关契约、导航、质量与状态说明。
- [x] 将已实现计划移入 completed、无独立工作的重定向移入 discarded；保留真实剩余任务和人工门禁。
- [x] 扩展文档链接及旧入口检查，运行文档测试、仓库卫生、diff 检查；填写执行摘要与 history。

## 验收与回退

运行 `pnpm check:docs`、`pnpm test:current-docs`、`pnpm check:repo`、`git diff --check`，核对归档文件和资产引用。迁移映射见同名 exec-run。失败时按映射逆向移动并回退本次正文修改，不涉及用户数据。已有历史断链区分本次修复与原有债务，不将人工门禁写成通过。

执行记录：[过程](../../exec-runs/20260908-docs-v1-archive-v2-refresh/execution-process.md) · [摘要](../../exec-runs/20260908-docs-v1-archive-v2-refresh/execution-summary.md)。

## 2026-09-09 追加文档复核

完成剩余 active 计划与 design-docs 重复规范的复核，原位合并 Context 数据契约并校准 Service/事件文档。P2 补出语义 validator 缺口，仍留 active；补跑全仓 typecheck/test 通过后，将仅余人工验收的 Context 计划移入 completed。没有以文档清理代替产品实现或人工验收。明细见 [后续复核与合并清单](../../exec-runs/20260908-docs-v1-archive-v2-refresh/followup-audit.md)。
