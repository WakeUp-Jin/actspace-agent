# Session 事件持久化与检查点重构执行摘要

> 状态：核心代码实施完成；自动验证完成，人工验收边界保留。

## 交付内容

- Session 先接纳 Journal 事实，再由 persistence coordinator 入队，最后通知 observer；observer 错误不污染 durability。
- `acceptedSeq`、`durableSeq` 和 blocked 状态可区分 live 事实与 durable prefix。
- AgentLoop 只在语义边界发布必需 `session/checkpoint`；独立 policy 插件执行 `flush(throughSeq)`。
- `session/created`、`session/disposed` 和 `llm/chunk` 有实际处理/发布路径，生产 Profile 显式装配 checkpoint policy。
- JSONL 格式、lease、recovery、fork 和公开 Session 导入保持兼容。

## 自动验证

Runtime 依赖闭包、全仓 typecheck 和生产 build 通过。Session persistence 41、Core Agent 12、Agent Loop 16、Tools Runtime 18、Runtime 12、Journal 9、checkpoint policy 2、CLI 13 个测试全部通过；CLI 真实进程 smoke 2 个场景通过；contract matrix 13/10/6 生成与测试通过。文档和 v2 legacy removal 检查通过。

Desktop 全量测试单独运行时 744/758 通过。14 个失败均位于本次未修改的三个既有测试文件：12 个因为 `@actspace/llm-pi-ai` mock 缺少 `DeepSeekFileUploader`，2 个是 renderer 既有交互断言未命中。根 `check:packages` 另报告 3 个本次变更前已存在的 Desktop test 深层源码导入；新增 checkpoint package 的 lifecycle contract 已通过。这些既有门禁没有混入本次提交。

## 人工验证

尚未执行。使用隔离 data root 验证 Electron 流式显示、会话切换、正常退出重开、取消和持久化失败提示；真实 Provider 验证单独记录。自动化不替代 Electron、Provider 或 packaged lifecycle。

## 后续边界

物理 `@actspace/session-core` 包拆分和 consumer import 迁移仍在 P1-A；它不改变本次已交付的 accepted/durable/checkpoint 语义。不得把这项后续工作写成当前提交已完成。
