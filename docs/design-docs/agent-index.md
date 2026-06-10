# Agent 设计文档

本入口汇总 `packages/agent-core`、Agent Turn、工具系统、上下文、权限和 Kairos 相关长期设计原则。这里回答“为什么这么设计、边界在哪里、哪些方案被排除”；具体实施步骤仍放在 `docs/exec-plans/active/`。

`docs/design-docs/` 已改为扁平结构，Agent 专题文档统一使用 `agent-` 前缀。

## 核心入口

- `agent-backend-design.md`：后端 Agent Runtime 的总体设计事实来源，约束 LLM Service、Context Pipeline、Tool Runtime、Execution Engine 和 Session Persistence。
- `agent-turn-layers.md`：Agent Turn 四层职责规范（Renderer -> Main Process -> Bridge -> Agent），约束每层输入输出和边界。
- `agent-current-module-map.md`：当前 `packages/agent-core` 已落地模块地图，记录 LLM、tools、context、engine、persistence、env 等实现清单。
- `agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。

## 模型与上下文

- `agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入设计。
- `agent-token-usage-and-context-state.md`：token usage、成本统计、context snapshot 与每会话 context state 的数据分层设计。
- `agent-context-compression.md`：上下文压缩设计，包括工具输出预防层、历史治疗层和读边界取舍。
- `agent-skill-loading.md`：Agent Skill 设计与加载规范，包括 Skill 目录生态、渐进式披露、catalog 注入、`read_file` 正文读取和安全边界。
- `agent-cache-loss-audit.md`：缓存失效排查设计，包括 `llm_usage` 索引、Context 快照和 hash 链断点分析。
- `agent-subagent-runtime.md`：Agent 工具与 SubAgent run 设计，约束子智能体上下文隔离、transcript、只读 Explore 子智能体和前端执行流展示。

## 工具与权限

- `agent-tool-preview-design-guidelines.md`：新增工具时必须遵守的前端预览契约。
- `agent-subprocess-runner-guidelines.md`：agent-core 内部受控子进程调用规范。
- `agent-权限设计规则和原则.md`：Agent 工具权限、用户审核、风险分层和权限记录的设计规则。
- `agent-tool-approval-pause-resume.md`：工具审核暂停恢复设计，约束 PendingApprovalRegistry、幂等 decision、会话切换和过期处理。
- `agent-bash-policy-allowlist-design.md`：Bash 全局执行策略、会话级 allowlist、Allow 子命令拆分授权和真沙箱路线图。

## 自治模式

- `agent-kairos-autonomous-mode.md`：Kairos 自治模式设计，约束独立 prompt、短期记忆、tick 调度、IPC 契约和事件流页面边界。
- `agent-kairos-prompt-cache-optimization.md`：Kairos prompt 缓存优化设计，约束「静态前缀 + 动态尾部」上下文形态、观测增量化、thinking 落盘回放与 contextWindow 来源。
