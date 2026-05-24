# actspace 后端计划 F：Session Persistence + Recovery

## 目标

稳定本地会话持久化和恢复链路，让 `session.jsonl` 成为后端事实来源。支持从 JSONL 事件流恢复为 agent-core 内部 Message 序列（供 ContextManager 消费）和前端 MessageBlock 序列（供 renderer 渲染）。

本计划与 Skill 的 `type-session-history.md` 对齐，但首版采用本地 JSONL 而非 Redis/WAL 等多后端架构。

## 设计来源

- `docs/design-docs/agent-core/backend-agent-design.md`
- `.agents/skills/llm-agent-dev/references/context/type-session-history.md`（会话历史存储设计）
- `.agents/skills/llm-agent-dev/examples/session-storage.ts`（存储参考）
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`

## 相关路径

- `packages/agent-core/src/persistence.ts`（当前实现，需补强）
- `packages/shared/src/session.ts`（SessionEvent/SessionMeta 类型）
- `packages/shared/src/session-selectors.ts`（事件到消息块的 adapter）
- `packages/desktop/src/main/index.ts`

## 范围

包含：

- 稳定会话目录结构
- 稳定 `session.jsonl` 追加写入（每行一个 SessionEvent）
- 完善 `meta.json` 写入和更新
- 实现 JSONL 读取和恢复 adapter：
  - SessionEvent[] → Message[]（供 ContextManager 重建上下文）
  - SessionEvent[] → MessageBlock[]（供 renderer 重建消息流）
  - SessionEvent[] → SessionDiffSummary（供 diff panel 重建）
  - SessionEvent[] → ContextUsageSnapshot（供 context popup 重建）
- 增加坏行容错策略
- 增加写盘失败错误传播
- 支持从 events 生成会话列表摘要

不包含：

- 不做云同步
- 不做数据库
- 不做加密存储
- 不做多设备同步

## 存储结构

```txt
~/Library/Application Support/actspace/
  sessions/
    <session-id>/
      meta.json
      session.jsonl
      attachments/
  logs/
  tmp/
```

### meta.json

必需字段：

- `id: SessionId`
- `title: string`
- `createdAt: string`（ISO 时间戳）
- `updatedAt: string`
- `turnCount: number`

可选字段：

- `lastModel: string`
- `lastError: string`
- `lastContextSnapshot: ContextUsageSnapshot`

### session.jsonl

每行一个完整 `SessionEvent`，包含：

- `id`、`sessionId`、`turnId`、`type`、`timestamp`、`schemaVersion`、`payload`

## 写入要求

- 写入前确保 session 目录存在
- 追加写入失败必须返回结构化错误（不静默吞掉）
- 不在 session 文件中写入密钥或 API key
- 大工具输出后续可落 file ref，首版可先 inline 但受裁剪策略约束
- 每轮 turn 结束后更新 meta.json（turnCount++、updatedAt、可选 lastModel）

## 恢复要求

### 坏行容错

- 读取时逐行解析 JSONL
- 无法解析的坏行跳过，不中断整个会话恢复
- 坏行数量和错误原因必须可观测（返回 `{ events, errors }` 结构）
- 恢复后的数据完整性可通过事件计数校验

### 恢复 adapter

需要支持四种恢复产物：

1. **Message[]**（agent-core 消费）：SessionEvent → 内部 Message 判别联合
   - user_message → UserMessage
   - assistant_message → AssistantMessage（重建结构化 Content[]）
   - thinking → 合并到前一个 AssistantMessage 的 ThinkingContent
   - tool_call → 合并到前一个 AssistantMessage 的 ToolCallContent
   - tool_result → ToolResultMessage

2. **MessageBlock[]**（renderer 消费）：SessionEvent → 前端渲染用 MessageBlock（现有 `session-selectors.ts` 逻辑）

3. **SessionDiffSummary**：从 diff_preview 事件聚合

4. **ContextUsageSnapshot**：从最后一个 context_snapshot 事件恢复

### 与 ContextManager 的集成

恢复后的 Message[] 需要能灌入 ContextManager：

```
session.jsonl → parse → SessionEvent[] → adapter → Message[] → ContextManager.appendMessage() 逐条灌入
```

这确保了进程重启后 ContextManager 可以重建上下文，继续对话。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- 写入完整 turn 后能读取恢复
- 重启应用后会话列表可恢复（从 meta.json）
- session events 可恢复为 Message[]，灌入 ContextManager 后 getContext() 正确
- session events 可恢复为 MessageBlock[]，前端消息区可渲染
- edit diff events 可恢复会话级 diff
- 坏 JSONL 行不会让整个会话读取崩溃
- 坏行错误数量和原因可从恢复结果获取
- 写盘失败能返回结构化错误给 main/renderer

## 并行关系

- 依赖计划 A 的 SessionEvent / Message 类型
- 可与 LLM Service、Tool Runtime、Context Pipeline 并行
- Execution Engine 最终通过本计划落盘
- 恢复 adapter 依赖计划 A 的 Message 判别联合和计划 D 的 ContextManager

## 进度

- [x] 审查现有 `packages/agent-core/src/persistence.ts`
- [x] 稳定 session 目录结构和路径（session-store.ts）
- [x] 稳定 JSONL append/read（jsonl.ts — 坏行容错 + 结构化错误）
- [x] 完善 meta.json 写入和增量更新（meta.ts — create/read/update/incrementTurnCount）
- [x] 实现 SessionEvent → Message[] 恢复（recovery.ts → adapters.ts sessionEventsToMessages）
- [x] 实现 SessionEvent → MessageBlock[] 恢复（recovery.ts → shared createMessageBlocks）
- [x] 实现 SessionEvent → ContextUsageSnapshot 恢复（recovery.ts → shared getLatestContextSnapshot）
- [x] 实现 SessionEvent → SessionDiffSummary 恢复（recovery.ts → shared createSessionDiffSummary）
- [x] 坏行容错策略（JsonlParseResult.errors + RecoveryResult.recoveryErrors）
- [x] 写盘失败错误传播（所有写入返回 WriteResult { ok, error? }）
- [x] 迁移现有 persistence.ts 为兼容层
- [x] 通过类型检查（agent-core + 全项目）
- [ ] 验证恢复后 ContextManager 可正确使用
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：首版继续使用本地 JSONL，不引入重量级数据库。
- 2026-05-23：恢复链路需要支持两个消费方向——agent-core 内部 Message[]（重建上下文继续对话）和 renderer MessageBlock[]（重建前端消息流）。坏行容错是必需的，恢复结果必须包含错误信息用于可观测性。
