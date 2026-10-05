# 2026-10-04 | 存储与任务入口第二轮清理

## 执行环境

- Agent：Codex 主线程。主模型具体版本未在运行环境中明确提供。
- Computer Use：委派 `gpt-6.1-sol` 子智能体；主线程定位与修复。
- 以用户既有未提交工作树为基线，未提交或推送。

## 用户诉求

存储业务与 JSONL、未来 SQLite/MySQL 等实现解耦，同时清理冗余代码、整理模块目录及过时文档。参考 deepseek-harness 后批准方案并要求实施。保护 histories/learnings，避免因精简破坏模块化。

## 主要变更

- 新增 session-storage 中性契约与独立 Memory；JSONL 接收物理布局、锁与修复；Session 和 projection-cache 全部经注入后端读写。
- Task submit/receipt/snapshot 统一首发和队列，/compact 为任务操作；Run 结果通用化，Headless 等资源 settlement。移除无消费者启动包装、Runtime facade、旧 Run/Compact DTO 和对应测试旧入口。
- Host 显式编排执行排空、Session flush、插件树释放；失败仍继续关闭并允许重试。修复 JSONL acquisition/close 竞争，限制完整快照缓存保留。
- 默认 Harness 装配共用定义；生产校验 manifest 服务声明；矩阵覆盖实际包、插件和领域事件。
- 精简当前架构规范与两份审计文档；六组早期后端计划保留短回溯入口，独有欠账单独记录，不删除历史与学习档案。
- CU6 发现 Reload 重复用户占位，修复按稳定消息标识去重并补回归；CU4 发现失败后的压缩重试未恢复暂停队列，补接收确认后的定向 resume。

## 设计动机

保留存储接口是为了替换能力；删除多余包装是为了减少理解和维护成本。插件框架管理局部副作用，Host 仍需负责跨服务的释放顺序。测试同步当前契约，避免旧架构仅靠 mock 继续存在。

## 入口与验证

- 关键目录：`packages/session/storage`、`packages/session/jsonl`、`packages/session/persistence`、`packages/runtime/src/startup`、`packages/agent-service`、`apps/desktop/src/renderer`。
- [执行摘要](../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)：自动化、进程检查、保留边界与最终状态。
- [Computer Use](../../exec-runs/20261004-agent-storage-and-cleanup/computer-use-acceptance.md)：逐项真实界面证据；未覆盖项不视作通过。
- [资源释放顺序学习记录](../../learnings/2026-10/dependency-ordered-shutdown.md)：命中新概念、可迁移和生命周期陷阱。
