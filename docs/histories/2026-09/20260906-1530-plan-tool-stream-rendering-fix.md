## [2026-09-06 15:30] | Task: 工具流式渲染修复计划与实施

### Execution Context

- Agent：Codex 主任务代理。
- Runtime：Codex desktop，本地 workspace。

### 用户诉求

> Agent 输出时工具也需要正确渲染，先生成修复计划；随后批准开始执行。

### 变更

- 新增工具流式渲染修复设计和对应 execution plan。
- 明确 Core 独立工具参数事件、工具准备/开始/结果事实、Main 内部流式适配、共享 typed preview 与 renderer 终态合并边界。
- 列出超过 8 个实现文件的完整交付范围、失败回归、并行工具与拒绝/超时/取消测试、Electron 与真实 Provider 验收和回滚。
- 将设计与计划登记到导航；真实会话只记录脱敏统计，不保存请求或输出。

### 状态与验证

- 用户批准后完成 Core 工具事件分类、Tools 真正执行开始和增量提交、Main 共享预览及专用订阅、Renderer 终态合并。
- 回归先红后绿；Core 9、Tools 18、Shared 63、Desktop 600、CLI 13 tests 通过；根类型检查和生产构建通过。
- 浅深主题浏览器组件已查看；Computer Use 无法选择开发版 Electron，真实 Electron / DeepSeek 验收保留，详见 [执行摘要](../../exec-runs/20260906-agent-tool-stream-rendering/execution-summary.md)。
- 计划已归档，无提交或推送。命中“可迁移、有陷阱、有模式”，沉淀 [流式事件与持久化投影](../../learnings/2026-09/20260906-streaming-events-and-durable-projection.md)。
