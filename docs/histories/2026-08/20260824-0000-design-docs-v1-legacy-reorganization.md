# 设计文档 v1 归档与 v2 入口收口

## 用户诉求

整理 `docs`，把已经过时的 v1 设计集中归档，让 `docs/design-docs/` 默认表达 v2 的设计思路，避免 Agent 把历史方案当成当前事实来源。

## 本次变更

- 新建 `docs/archive/v1/design-docs/`，集中保存旧 Runtime、Kairos、Lab、旧评估、旧 Todo、fs-watch、DuckCoding 文字模型和相关原型资产。
- 更新 `docs/design-docs/index.md`、`agent-index.md`、`docs/ARCHITECTURE.md` 以及当前专题文档，把阅读入口切换到 `agent-plugin-runtime/` 和 v2 Runtime / Host / Session 契约。
- 修正执行计划、history、reference 和 audit 文档中的旧路径，使历史记录仍可追溯到归档文件。
- 清理现行工具、前端、Usage、Browser、模型和安全文档中的 Kairos/Lab 产品入口及旧 `agent-core` 路径；保留必要的“已删除/历史背景”说明。
- 新增本次整理的学习沉淀，记录“当前事实与历史证据必须分层”的文档治理模式。

## 设计动机

目录结构本身会参与 Agent 的检索和判断。历史设计若和当前设计平铺，文件名、旧包路径和旧产品入口会制造隐性冲突。将它们放入显式的 `v1-legacy/`，再在总索引中声明“禁止作为新功能事实来源”，可以同时保留迁移证据和降低默认阅读歧义。

## 关键入口

- 当前总索引：`docs/design-docs/index.md`
- Agent 专题入口：`docs/design-docs/agent-index.md`
- v2 Runtime 入口：`docs/design-docs/agent-plugin-runtime/README.md`
- 历史归档说明：`docs/archive/v1/design-docs/README.md`
