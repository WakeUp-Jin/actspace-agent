# Token usage 与 context state 数据地基

## 用户诉求

希望 actspace 能把 token usage、成本、缓存命中和上下文水位作为可追溯数据写入持久化层，为后续 Context 面板、会话/每日统计、DeepSeek 缓存成本优化和上下文绝对控制打基础。

## 主要改动

- 新增共享模型配置 `packages/shared/src/model-config.ts`，把模型能力、上下文窗口和价格配置从 IPC 契约中拆出。
- 扩展 session 契约，新增 `llm_usage` 事件、usage cost 结构、轻量 `context_snapshot.estimator` 和当前 `ContextState` 类型。
- Agent loop 现在保留每次 LLM call 的 usage 边界，bridge 按每次模型回复写入一条 `llm_usage`，并关联同次模型回复产生的 session events。
- DeepSeek-compatible usage 解析补齐 cache hit、cache miss、reasoning tokens，并通过 `calculateUsageCost()` 写入每条 usage 的成本。
- 新增每会话 `context-state.json` 读写，保存当前 Context 面板可用的 bucket 与 entry 视图；`session.jsonl` 仍只保留轻量历史水位。
- 更新架构和可靠性文档，记录 `llm_usage`、`context_snapshot` 与 `context-state.json` 的职责边界。

## 设计动机

usage 是事实数据，最小单位应该是一次模型回复，而不是 turn 或 session。这样工具循环、子 Agent 和多次 LLM call 都能被准确聚合。

context snapshot 是历史水位，适合放在事件流里；context state 是当前可变视图，适合放在每会话独立文件里。这个拆分可以避免把大量可编辑上下文 entries 塞进 append-only session 事件流。

## 验证

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/desktop typecheck`

## 后续

- Context popup 仍需要接入 `contextState` 做只读展示。
- Kimi 模型价格暂未写入 pricing，避免把不确定价格固化到配置；补齐价格后 historical usage 会继续使用当时已写入的 `cost`。
