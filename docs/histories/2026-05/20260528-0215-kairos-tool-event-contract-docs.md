## [2026-05-28 02:15] | Task: Kairos 工具与事件契约文档收口

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 梳理 Kairos 为什么具备工具调用能力、和主 Agent 的区别、工具如何传给 Kairos，以及工具执行事件如何推送到 Kairos 页面；将这些设计事实更新进 docs，避免后续实现错乱。

### Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Kairos design contract]**: 在 Kairos 自治模式设计文档中新增主 Agent vs Kairos 执行链路对照，明确两者共享 `LLMService / ToolManager / ToolScheduler / runAgentLoop`，但使用不同事件 adapter 和持久化路径。
- **[Tool capability matrix]**: 补充 Kairos 工具能力矩阵，说明共享工具、Kairos 专属 `sleep`、provider 条件、`toolsDenied` 过滤和最终注入给 LLM 的代码位置。
- **[Event push contract]**: 明确 `tool_start -> tool_call`、`tool_end -> tool_result` 的事件映射、推送顺序、前端聚合方式，以及右侧工具详情的参数来源。
- **[Fact alignment]**: 修正旧设计痕迹：Kairos 当前由 `KairosRunner.processTick` 直接调用 `runAgentLoop`，不是通过 `createKairosAgentForLoop`；`get-events-recent` v1 当前只回 ring buffer，不做 jsonl 回填；`bash` 默认在 Kairos blocklist 中关闭。
- **[Module map sync]**: 更新 agent-core 模块地图，给出 Kairos 工具复用与事件推送链路的速读版。

### Design Intent (Why)

Kairos 不是第二套 Agent 内核，而是共享主 Agent 的工具执行内核并包上一层自治调度、短期记忆和事件流适配。把这条边界写清楚，可以避免后续新增工具、修事件展示或改持久化时误把主聊天链路和后台自治链路混在一起。

### Files Modified

- `docs/design-docs/agent-core/kairos-autonomous-mode.md`
- `docs/design-docs/agent-core/current-module-map.md`
