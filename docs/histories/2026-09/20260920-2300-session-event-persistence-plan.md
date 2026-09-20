# Session 事件持久化重构设计与计划

## 用户诉求

以 DeepSeek Harness 的实际分层作为重构起点；设计审核通过后先生成执行计划，不实施代码。

## 文档变更

- 固化已批准的 Session Core、事件持久化、必需检查点和 accepted/durable 契约。
- 新建 `docs/exec-plans/active/20260920-session-event-persistence/README.md`，包含三个独立可用阶段、文件职责、负向验收和回退边界。
- 更新设计及计划导航，标注旧 P1-A 与投影计划的任务交接，保留已有证据。
- 当前实现未变；不迁移用户数据、不引入数据库、不进行提交或推送。

## 验证

`pnpm run check:docs`、`pnpm run check:current-docs`、`git diff --check` 通过。没有运行实现测试，也不把计划中的验证命令记为已执行。

## 学习沉淀

本轮只落设计与计划；实施阶段按计划沉淀事件接纳与持久化屏障的验证经验。
