# Agent Core 设计文档

这个目录用于沉淀 `packages/agent-core` 相关的长期设计原则。这里的文档回答“为什么这么设计、边界在哪里、哪些方案被排除”，具体实施步骤仍放在 `docs/exec-plans/active/`。

## 文档列表

- `backend-agent-design.md`：后端 Agent Runtime 的总体设计事实来源，约束 LLM Service、Context Pipeline、Tool Runtime、Execution Engine 和 Session Persistence。
- `backend-agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。
- `deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入设计，约束 provider、工具暴露、联网搜索和多模态能力边界。
- `token-usage-and-context-state.md`：token usage、成本统计、轻量 context snapshot 与每会话 context-state 的数据分层设计。
- `权限设计规则和原则.md`：Agent 工具权限、用户审核、风险分层和权限记录的设计规则。
