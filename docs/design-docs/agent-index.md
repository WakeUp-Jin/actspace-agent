# Agent 设计文档

本入口汇总 `packages/agent-core`、Agent Run/Turn/LLM Call、模型与上下文、工具系统、权限、协作形态、Kairos 和评估相关长期设计原则。这里回答“为什么这么设计、边界在哪里、哪些方案被排除”；具体实施步骤放在 `docs/exec-plans/`。

Agent 文档按强关联专题进入 `docs/design-docs/` 下的一级目录；本入口保留在根层，因为它需要跨越全部 Agent 专题。

## Runtime

- `agent-runtime/agent-backend-design.md`：后端 Agent Runtime 总体设计事实来源。
- `agent-runtime/agent-turn-layers.md`：Renderer、Main Process、Bridge、Agent 四层职责规范。
- `agent-runtime/agent-observability-trace-model.md`：Session V2 与分析 Trace 的 ID、事件、安全和读取契约。
- `agent-runtime/agent-current-module-map.md`：当前 `packages/agent-core` 已落地模块地图。
- `agent-runtime/agent-testing.md`：后端 Agent 内部测试策略和覆盖范围。

## 模型与上下文

- `model-context/agent-multi-provider-llm.md`：DeepSeek、Kimi、OpenRouter 多供应商和模型管理目标态。
- `model-context/agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力边界。
- `model-context/agent-token-usage-and-context-state.md`：token usage、成本统计和 context state 分层。
- `model-context/agent-context-compression.md`：上下文压缩与大工具输出边界。
- `model-context/agent-cache-loss-audit.md`：缓存失效排查设计。

## 工具系统

- `tool-system/agent-skill-loading.md`：Skill 目录生态、渐进式披露和加载边界。
- `tool-system/agent-web-tools.md`：`web_fetch` 与多供应商 `web_search` 设计。
- `tool-system/agent-tool-preview-design-guidelines.md`：新增工具必须遵守的前端预览契约。
- `tool-system/agent-subprocess-runner-guidelines.md`：agent-core 内部受控子进程规范。

## 执行安全

- `execution-safety/agent-权限设计规则和原则.md`：工具权限、用户审核和风险分层总原则。
- `execution-safety/agent-tool-approval-pause-resume.md`：工具审核暂停恢复和幂等 decision。
- `execution-safety/agent-bash-policy-allowlist-design.md`：Bash 全局策略、会话 allowlist 和沙箱路线。
- `execution-safety/agent-bash工具设计文档.md`：Bash 工具契约、输出管道、后台运行和沙盒执行模型。

## Browser Use

- `browser/agent-browser-use-index.md`：Browser Use 专题入口，阅读其他 Browser 文档前先读。
- `browser/agent-browser-bridge-design.md`：真实 Chrome 浏览器桥接层设计。
- `browser/agent-browser-use-integration-design.md`：ActSpace Browser Use 集成方案。
- `browser/agent-browser-use-command-surface.md`：canonical command 命令面分类详解。
- `browser/agent-browser-use-command-implementation.md`：命令的 CDP 调用链与分层实现设计。

## 协作形态

- `collaboration/agent-members.md`：跨 Room 持久 Agent Member 设计。
- `collaboration/agent-subagent-runtime.md`：通用 Subagent 运行时和 transcript 边界。
- `collaboration/agent-explore-subagent.md`：只读 Explore 子代理设计。
- `collaboration/agent-form-room.md`：Agent Room 设计规范。
- `collaboration/agent-form-team.md`：Agent Team 设计规范。

## Kairos

- `kairos/agent-kairos-autonomous-mode.md`：Kairos 自治模式、tick 调度和事件流。
- `kairos/agent-kairos-prompt-design.md`：Kairos Prompt 分层、人格和规则设计。
- `kairos/agent-kairos-prompt-cache-optimization.md`：Prompt 缓存和观测增量化。
- `kairos/agent-kairos-notifications.md`：Kairos 通知中心设计。
- `kairos/front-Kairos监控页规范.md`：Kairos 监控页和聊天态 compact view。

## 评估

- `evaluation/agent-evaluation.md`：Agent 评估模块、独立评估仓库和评分器设计。
- `evaluation/agent-eval-failure-candidate.md`：`/eval` 失败回归 Candidate 生成与导入边界。

## 独立集成

- `agent-plugins-fs-watch.md`：Plugins 模式与 fs-watch 文件监听设计。
