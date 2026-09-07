# Agent 设计文档

本入口汇总 `packages/runtime` 与各领域 workspace package、Agent Run/Turn/LLM Call、模型与上下文、工具系统、权限和协作形态相关的当前 v2 设计原则。这里回答“为什么这么设计、边界在哪里、哪些方案被排除”；具体实施步骤放在 `docs/exec-plans/`。已退役的 v1 Runtime、Kairos、Lab、旧评估和旧工具方案见 [`v1-legacy/`](v1-legacy/)，不作为新功能默认事实来源。

Agent 文档按强关联专题进入 `docs/design-docs/` 下的一级目录；本入口保留在根层，因为它需要跨越全部 Agent 专题。

## v2 插件化 Runtime 设计

- `agent-plugin-runtime/agent-target-overall-architecture.md`：面向新读者的 v2 总体分层、启动流、单次任务流、Session 真相模型和决策状态。
- `agent-plugin-runtime/README.md`：研究证据、已确认目标、公共契约和条件采用门禁的总入口。
- `agent-plugin-runtime/agent-decisions-v2-foundation.md`：当前已确认决策总账、已关闭开放项和完整交付边界。
- `agent-plugin-runtime/agent-decision-cordis-adoption.md`：DSH Cordis 发布族的采用范围、门禁和回退条件。
- `agent-plugin-runtime/agent-target-agent-core.md`：ActSpace 自有 Agent Core、固定 Boot 边界和核心不变量。
- `agent-plugin-runtime/agent-target-session-and-context.md`：append-only Session、Surface、Event Codec 和 Context assembly。
- `agent-plugin-runtime/agent-target-llm-adapter.md`：pi-ai Adapter 边界、proxy/error/usage 门禁。
- `agent-plugin-runtime/agent-target-runtime-architecture.md`：Profile / Bundle / Patch 的历史目标基线（RuntimeHandle 表述已由 Profile-first 决策替代）。
- `agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`：受信任插件来源、manifest / codec / behavior 分离、稳定 identity、Host ceiling、restart-only 和生命周期公共契约。
- `agent-plugin-runtime/agent-spec-session-format-v1.md`：raw JSONL Session、Header / Event Envelope、Surface、codec、repair、fork、compaction 和 writer lease 规范。
- `agent-plugin-runtime/agent-spec-tool-runtime-abi.md`：Tool definition / executor、prepared lease、policy、approval、checkpoint、并发和 result 公共契约。
- `agent-plugin-runtime/agent-spec-runtime-projection.md`：Session、live progress、diagnostics、generic Tool DTO、renderer allowlist 和 fallback 契约。
- `agent-plugin-runtime/agent-spec-prompt-context-contributors.md`：动态上下文来源、确定性排序、Skills、Host facts 和 logical request snapshot 契约。
- `agent-plugin-runtime/agent-spec-agent-and-subagent.md`：main Agent、Agent / Explore、static Preset、one-shot Subagent、child Session 和 Todo durable events 契约。
- `agent-plugin-runtime/agent-testing.md`：package contract、Plugin lifecycle、领域行为、Runtime、Host 与外部人工门禁的测试分层。
- `agent-plugin-runtime/agent-spec-session-core-persistence-separation.md`：Session Core、Persistence Definition 与 JSONL Provider 的可替换边界。
- `agent-plugin-runtime/agent-spec-service-definition-provider-consumer.md`：全域 Service Definition / Provider / Consumer ABI、依赖方向与生命周期验证。
- `agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md`：Profile / Bundle / Patch 组合、Host capability ceiling 与唯一 BootManifest。
- `agent-plugin-runtime/agent-spec-contract-matrix-generation.md`：声明驱动的事件、Service、Composition、package export 契约矩阵生成和漂移门禁。
- `agent-plugin-runtime/agent-research-dsh-architecture.md`：DSH 的 Cordis 生命周期、配置组合、Agent 语义和 Host / Client 扩展机制。
- `agent-plugin-runtime/agent-research-actspace-current-state.md`：v1 Runtime、Context、Tools、Persistence、Desktop 与 Kairos 耦合的研究证据；v2 去留以相邻目标文档为准。
- `agent-plugin-runtime/agent-research-capability-disposition.md`：现有能力的 Keep / Adapt / Rewrite / Delete / Defer 判断。

该专题已经确定 v2 产品范围和公共语义，并已生成完整交付计划与当前阶段的 [P1/P2 总 execution plan](../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md)。当前实现入口已经切换到 v2；P1/P2 尚待实施，外部 registry、packaged Electron 和真实 Provider/Browser 验收仍需在可用环境执行。

## Runtime 观测层

- `agent-runtime/agent-turn-layers.md`：Host、Profile Bootstrap / App Bundle、Agent semantics、capability execution、Journal / Projection 五层职责规范。
- `agent-runtime/agent-observability-trace-model.md`：Journal 派生的 Agent Run / Turn / request / tool Journal 观测契约。

## 模型与上下文

- `model-context/agent-multi-provider-llm.md`：DeepSeek、Kimi、OpenRouter 多供应商和模型管理目标态。
- `model-context/agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的历史兼容背景；v2 Adapter 边界优先见 `agent-plugin-runtime/agent-target-llm-adapter.md`。
- `model-context/agent-token-usage-and-context-state.md`：provider usage、request snapshot、成本统计与 Context Projection 分层。

## 工具系统

- `tool-system/agent-skill-loading.md`：Skill 目录生态、渐进式披露和加载边界。
- `tool-system/agent-web-tools.md`：`web_fetch` 与多供应商 `web_search` 设计。
- `tool-system/agent-tool-preview-design-guidelines.md`：新增工具必须遵守的前端预览契约。
- `tool-system/agent-subprocess-runner-guidelines.md`：v2 Runtime Core Tools 的受控子进程规范。

## 执行安全

- `execution-safety/README.md`：当前 v2 Tool Runtime、审批、Host capability、Bash hard guard 和 outcome-unknown 边界。
- `execution-safety/agent-权限设计规则和原则.md`：长期工具权限、用户审核和风险分层原则；具体 API 以 v2 Tool Runtime ABI 为准。

## Browser Use

- `browser/agent-browser-use-index.md`：Browser Use 专题入口，阅读其他 Browser 文档前先读。
- `browser/agent-browser-bridge-design.md`：真实 Chrome 浏览器桥接层设计。
- `browser/agent-browser-use-integration-design.md`：ActSpace Browser Use 集成方案。
- `browser/agent-browser-use-command-surface.md`：canonical command 命令面分类详解。
- `browser/agent-browser-use-command-implementation.md`：命令的 CDP 调用链与分层实现设计。

## 协作形态

- `collaboration/agent-subagent-runtime.md`：当前一次性 Subagent 与 child Session 边界。
- `collaboration/agent-explore-subagent.md`：当前 Explore 静态 Preset 与只读工具限制。
- `collaboration/agent-members.md`：未来 Room / Team 产品设计中的持久 Agent Member，不是当前 v2 Runtime 事实。
- `collaboration/agent-form-room.md`：未来 Agent Room 产品设计；实现机械结构尚未迁入 v2。
- `collaboration/agent-form-team.md`：未来 Agent Team 产品设计；实现机械结构尚未迁入 v2。

## 历史设计

- `v1-legacy/README.md`：v1 旧 Runtime、旧 CLI、Kairos、Lab、旧评估、旧 Todo、fs-watch 和 DuckCoding 文字模型设计的归档规则与替代入口。
