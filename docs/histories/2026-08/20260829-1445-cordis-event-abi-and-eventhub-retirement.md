# Cordis 原生事件 ABI 与 EventHub 退役设计

日期：2026-08-29

## 用户诉求

统一检查 ActSpace 与 DeepSeek Harness 的事件插件化差异，并为后续将 Agent Loop 迁移到真实 Cordis 事件语义整理设计规范和 execution plan。用户明确要求重构结束后直接删除无用的 EventHub 代码，不保留兼容层。

## 本轮产出

- 新增 Cordis 原生事件 ABI 与 EventHub 退役设计规范；
- 明确 `emit`、`parallel`、`serial`、`waterfall` 的不同失败和返回值语义；
- 明确 Waterfall 必须使用 `next()` around middleware；
- 明确 `llm/stream` 包围完整 stream、`agent/request-error` 返回恢复决策；
- 明确 Agent subject、scope carrier、fiber effect cleanup 和通知 containment；
- 新增 P00–P05 execution plan：类型契约、真实 dispatch、Loop/Tool 接入、scope/lifecycle、EventHub 删除、CLI run 验收；
- 修正 Agent Loop 插入面文档中 Waterfall、`llm/stream`、`agent/request-error` 的语义描述；
- 更新 Agent Plugin Runtime 与 execution plan 索引。

## 设计动机

现有 EventHub 只是顺序 payload 变换器，无法表达 Cordis/DSH 的 continuation、短路、bail、完整 stream middleware 和真实作用域，因此不能作为长期公共 ABI。终态使用真实 Cordis Context；领域 Service 对通知 observer 单独执行错误隔离；具体工具 executor 保持行为不变，只迁移 ToolRuntime 外壳和事件 seam。

## 影响范围

本轮仅修改设计文档、execution plan、索引和 history，没有修改运行时代码、Session 数据、工具实现或 Git 状态。
