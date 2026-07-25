## [2026-05-26 17:40] | Task: ConversationContext 构造时一次性恢复会话历史

### 🤖 Execution Context

- **Agent ID**: cursor agent (local)
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE 桌面端

### 📥 User Query

> 用户回话只剩一句"嗯嗯是的"，但模型回复说"看不到上下文"。怀疑会话历史没有从 session.jsonl 灌回 Context Manager；提示已有 `sessionEventsToMessages` 等转换函数应该被使用，并希望恢复职责放到 `ConversationContext` 自身、与系统提示词在 `getContext()` 中被注入的机制对齐——前端只传 sessionId / sessionPath，后端自己读盘 + 转换 + 写入 messages。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **[ConversationContext]**: 构造函数接受可选 `initialMessages`；新增 `static async createFromSession(sessionPath)`，内部 `parseJsonl + sessionEventsToMessages` 一次性恢复 `Message[]`；运行期 `format()` / `appendMessage` 仍是纯内存操作。
- **[ContextManager]**: 构造函数允许通过 `options.conversation` 注入已构造好的 ConversationContext；新增 `static async createForSession({ systemPromptModule, sessionPath, ... })` 语义入口；`getContext()` 保持同步契约。
- **[Engine]**: 新增 `createAgentForSession(config, { sessionPath })` async 工厂，main 进程使用；`createAgentFromConfig`（同步）保留供 mock / 单元测试 / 纯内存场景。
- **[Main]**: `runAndPersistTurn` 改为 `await createAgentForSession(config, { sessionPath })` 并复用 `sessionPaths` 给后续 `writeSessionResult`，main 完全不 import `recoverMessages` / 转换函数。
- **[Tests]**: 新增 `context/test/conversation.test.ts`、`context/test/manager.test.ts` 的 `createForSession` 段、`engine/test/create-agent-deps.test.ts` 的 `createAgentForSession` 段、`engine/test/session-history-replay.test.ts` 端到端两轮 turn 用例（含 session.jsonl 不存在的首轮路径）。
- **[Docs]**: 同步更新 `current-module-map.md`（ConversationContext / ContextManager / create-agent-deps 三段）、`agent-turn-layers.md`（Main / Bridge / 数据流 / 检查清单）、`actspace-backend-context-pipeline.md` 进度备注、`core-storage-and-observability.md` 关于 session.jsonl 恢复的描述。

### 🧠 Design Intent (Why)

`SystemPromptContext` 是"构造时吃 corePrompt、运行期 `format()` 纯内存"。会话历史 V0 的缺口在于它是"构造时啥也不吃、运行期也不读盘"——所以模型每轮只看到当前 user 输入。

修复让 `ConversationContext` 也"构造时吃数据"——通过 `createFromSession(sessionPath)` 在异步工厂里把 `session.jsonl → SessionEvent[] → Message[]` 一次性吃完。`ContextManager.getContext()` 保留同步契约不变，调用链零牵连。

数据所有权放回拥有数据的模块（`ConversationContext` 自己读盘 + 转换 + 灌 message），main 进程只传 `sessionPath`，对"读 session、调转换函数"零感知。这恰好是 V0 ConversationContext → V1 ShortTermMemoryContext"带持久化和 turn 标记"演进路径的合理提前——V1 升级只需补 turn 标记 / 多日切片 / 压缩接入，构造入口签名不破坏。

### 📁 Files Modified

- `packages/agent-core/src/context/modules/conversation.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/index.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/index.ts`
- `packages/agent-core/src/context/test/conversation.test.ts`（新增）
- `packages/agent-core/src/context/test/manager.test.ts`
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`
- `packages/agent-core/src/engine/test/session-history-replay.test.ts`（新增）
- `packages/desktop/src/main/agent-turn.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/exec-plans/completed/actspace-backend-context-pipeline.md`
- `docs/histories/2026-05/20260526-1740-conversation-context-session-replay.md`（本文件）
- `docs/learnings/2026-05/conversation-context-owns-history-recovery.md`（新增 learning，见下方）
