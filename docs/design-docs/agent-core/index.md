# Agent Core 设计文档

这个目录用于沉淀 `packages/agent-core` 相关的长期设计原则。这里的文档回答“为什么这么设计、边界在哪里、哪些方案被排除”，具体实施步骤仍放在 `docs/exec-plans/active/`。

## 文档列表

- `backend-agent-design.md`：后端 Agent Runtime 的总体设计事实来源，约束 LLM Service、Context Pipeline、Tool Runtime、Execution Engine 和 Session Persistence。
- `agent-turn-layers.md`：Agent Turn 四层职责规范（Renderer → Main Process → Bridge → Agent），约束每层的输入输出和边界。
- `current-module-map.md`：当前 `packages/agent-core` 已落地模块地图，记录 LLM、tools、context、engine、persistence、env 等实现清单。
- `backend-agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。
- `deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入设计，约束 provider、工具暴露、联网搜索和多模态能力边界。
- `token-usage-and-context-state.md`：token usage、成本统计、轻量 context snapshot 与每会话 context-state 的数据分层设计。
- `tool-preview-design-guidelines.md`：新增工具时必须遵守的前端预览契约，约束 `previewKind`、`ToolUiPreview` 和用户可见工具日志。
- `subprocess-runner-guidelines.md`：agent-core 内部受控子进程调用规范，约束 `rg` 等 CLI helper 的 timeout、退出码、输出裁剪和安全边界。
- `权限设计规则和原则.md`：Agent 工具权限、用户审核、风险分层和权限记录的设计规则。
- `tool-approval-pause-resume.md`：工具审核暂停恢复设计，约束 PendingApprovalRegistry、幂等 decision、会话切换和过期处理。
- `bash-policy-allowlist-design.md`：Bash 全局执行策略、会话级 allowlist、Allow 子命令拆分授权和真沙箱路线图。
- `kairos-autonomous-mode.md`：Kairos 自治模式设计，约束独立 prompt、短期记忆、tick 调度、IPC 契约和事件流页面边界。
