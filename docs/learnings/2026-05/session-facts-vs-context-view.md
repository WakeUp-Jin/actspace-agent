# Session Facts vs Context View

关联 history：`docs/histories/2026-05/20260525-1627-token-usage-context-state-foundation.md`

## 是什么

持久化 Agent 会话时，可以把数据分成两类：事实事件和当前视图。事实事件回答“发生过什么”，当前视图回答“现在界面应该展示什么”。

在这次变更里，`llm_usage` 和 `context_snapshot` 属于事实事件，写入 append-only 的 `session.jsonl`。`context-state.json` 属于当前视图，可以被覆盖更新，用来支撑 Context 面板和未来上下文手动控制。

## 为什么需要

如果所有东西都写进事件流，历史会很完整，但当前 Context 面板要读取和修改就会很痛苦：每次都要 replay 大量事件，还容易把可编辑状态和不可变历史混在一起。

如果只保存当前状态，界面很容易做，但 token 统计、成本追溯和历史分析会失去事实依据。一次工具循环里可能有多次模型回复，按 turn 粗略记录会把 usage 边界抹平。

所以更稳的做法是：

- 事实数据使用 append-only event，例如 `user_message`、`assistant_message`、`llm_usage`。
- 展示状态使用可覆盖文件，例如 `context-state.json`。
- 历史水位使用轻量 snapshot，例如 `context_snapshot`，不塞完整 entries。

## 设计要点

- usage 的事实单位是一次 LLM call，不是一次 turn。
- turn、session、day 的统计应该从 `llm_usage` 聚合出来，而不是作为原始事实写入。
- 成本可以写入 usage，因为它是当时配置下的计算结果；价格配置本身仍集中维护。
- 当前 Context entries 不适合放进 `session.jsonl`，因为它们未来会被用户添加、删除、修改。

## 常见陷阱

- 不要把 snapshot 当成 source of truth。snapshot 是历史读数，不是当前 Context 的完整清单。
- 不要只存聚合 token。聚合值看起来简单，但会丢失多模型、多 call、缓存命中的分析能力。
- 不要把价格快照塞进每条 usage，除非要做账单级审计。多数产品统计只需要落盘后的 `cost` 和集中维护的当前价格配置。

## 自检问题

1. 一个 turn 里模型先请求工具、工具返回后又生成最终回复，应该写几条 `llm_usage`？
2. 用户以后手动删除一个 context entry，这个动作应该覆盖 `context-state.json`，还是改写历史 `context_snapshot`？
3. 如果模型价格变化，历史统计应该重新按新价格计算，还是读取当时已写入的 `cost`？
