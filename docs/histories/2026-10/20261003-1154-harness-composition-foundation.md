## [2026-10-03 11:54] | Task: 实现 Harness 重构 P1 基础

### Execution Context

- Agent：Codex（主代理，无子代理）
- Runtime：Codex desktop，本地执行

### User Query

> 开始执行第一阶段吧。

### Changes Overview

Scope：cordis-adapter、boot 及相关计划/记录。固定构建后 ESM 产物，新增独立 Loader 组合树、候选选择、租约及退役清理；复用 core-scope，不修改真实 Run/Loop/客户端默认路径。

已有 TypeScript 依赖移入 adapter 运行依赖用于 AST 导入检查；boot 增加 core-scope workspace 依赖和构建引用。没有升级 Cordis，没有引入 tmp 参考项目依赖。

### Design Intent

内容固定、实例隔离和使用者引用各有独立职责。prepare 成功不等于启用；启用成功不等于旧实例已清理。真实测试发现 Cordis 会吞掉部分清理异常并记录日志，新增按树归属的错误收集，避免误报释放成功。

### Files Modified

- `packages/cordis-adapter/src/plugin-artifact.ts`、`cordis-tree.ts` 和导出/测试。
- `packages/boot/src/harness-mount.ts`、`harness-generations.ts` 和导出/测试。
- 两包 README、包依赖、boot 构建引用、锁文件。
- P1 计划、设计决策及执行记录。

验证与范围限制见[执行摘要](../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)。命中可迁移、有陷阱、有模式，沉淀[选择与退役速记](../../learnings/2026-10/20261003-selection-and-retirement.md)。保留任务开始前的文档改动，未提交或推送。
