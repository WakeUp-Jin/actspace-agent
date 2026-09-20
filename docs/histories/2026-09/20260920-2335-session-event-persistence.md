## 2026-09-20 23:35 | Task: 重构 Session 事件持久化与检查点

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### User Query

> 以 DeepSeek Harness 为参考，完成 ActSpace Session 事件、持久化和 Agent Loop 检查点重构；补测试、更新文档并提交。

### Changes Overview

**Scope:** Session persistence、Agent Loop/Cordis events、Runtime composition、contract matrix。

**Key Actions:**

- 把 write-behind 和 durable cursor 移入独立 coordinator，区分 Journal accepted、observer notification 与 durable barrier。
- 新增必需 `session/checkpoint` policy 插件，Loop 在模型、工具、下一步和 turn settlement 边界发布事件。
- 补齐 created/disposed/llm chunk 生命周期，隔离 observer failure，并让后台持久化失败 fail closed。
- 增加 coordinator、observer failure、必需处理器、Loop checkpoint 顺序和 Runtime 组装测试。

### Design Intent

Agent Loop 保留事实生产职责，不持有文件写入策略；Session 接纳事实，Persistence 协调落盘，checkpoint policy 在真正副作用前建立 durable barrier。JSONL 格式和恢复算法保持不变。

### Files Modified

- `packages/session/persistence/src/coordinator.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/session/checkpoint-policy/`
- `packages/runtime/src/runtime/session-plugin.ts`
- `packages/cordis-adapter/src/dispatch.ts`
- `docs/design-docs/agent-plugin-runtime/agent-session-event-persistence-refactor.md`
