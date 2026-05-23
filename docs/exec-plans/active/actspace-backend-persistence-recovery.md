# actspace 后端计划 F：Session Persistence 与 Recovery

## 目标

稳定本地会话持久化和恢复链路，让 `session.jsonl` 成为后端事实来源，并能恢复为前端消息流和会话级 diff/context 状态。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/context/type-session-history.md`
- `.agents/skills/llm-agent-dev/examples/session-storage.ts`

## 相关路径

- `packages/agent-core/src/persistence.ts`
- `packages/agent-core/src/persistence/`
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/index.ts`

## 范围

包含：

- 稳定会话目录结构。
- 稳定 `session.jsonl` 追加写入。
- 完善 `meta.json`。
- 增加 jsonl 读取和恢复 adapter。
- 增加坏行容错策略。
- 增加写盘失败错误传播。
- 支持从 session events 生成会话列表、消息流、会话级 diff。

不包含：

- 不做云同步。
- 不做数据库。
- 不做加密存储。
- 不做多设备同步。

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

`meta.json` 至少包含：

- `id`
- `title`
- `createdAt`
- `updatedAt`
- `turnCount`

可选包含：

- `lastModel`
- `lastError`
- `lastContextSnapshot`

## 写入要求

- 每一行 jsonl 是一个完整 `SessionEvent`。
- 写入前确保 session 目录存在。
- 追加写入失败必须返回结构化错误。
- 不在 session 文件中写入密钥。
- 大工具输出后续可落 file ref，首版可先 inline 但必须受裁剪策略约束。

## 恢复要求

- 读取 `meta.json` 和 `session.jsonl`。
- 可跳过无法解析的坏行。
- 坏行数量和错误原因需要可观测。
- 恢复后能生成：
  - session record
  - message blocks
  - context snapshot
  - session diff summary

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- 写入完整 turn 后能读取恢复。
- 重启应用后会话列表可恢复。
- session events 可恢复中间消息区。
- edit diff events 可恢复会话级 diff。
- 坏 jsonl 行不会让整个会话读取崩溃。
- 写盘失败能返回错误给 main/renderer。

## 并行关系

- 依赖计划 A 的 `SessionEvent` 契约草案。
- 可与 LLM Service、Tool Runtime、Context Pipeline 并行。
- Execution Engine 最终通过本计划落盘。

## 进度

- [ ] 审查现有 `persistence.ts`。
- [ ] 稳定 session paths。
- [ ] 稳定 jsonl append/read。
- [ ] 完善 meta 写入。
- [ ] 增加 recovery adapter。
- [ ] 增加坏行容错。
- [ ] 增加写盘失败传播。
- [ ] 验证恢复消息流和 diff。
- [ ] 通过类型检查。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-23：首版继续使用本地 jsonl，不引入重量级数据库。
