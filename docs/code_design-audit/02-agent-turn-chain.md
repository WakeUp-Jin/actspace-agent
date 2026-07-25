# Agent Turn 链路审查计划

## 目标

检查从 Renderer 用户输入到 Main Process、Bridge、Agent 执行循环，再回到前端流式展示和持久化的完整链路。重点确认四层职责是否清晰，数据流是否符合设计，是否存在跨层读取、重复恢复、重复转换或过度兼容代码。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/agent-runtime/agent-backend-design.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`

## 重点代码与文件范围

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/context-compact.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/shared/src/`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`

## 审查问题

- Renderer 是否只收集输入、管理 UI 状态和消费 stream，没有读取文件系统、env 或 agent-core 内部实现。
- Main Process 是否只做 IPC、依赖装配、session meta 读取和结果持久化，没有直接恢复 `session.jsonl` 消息。
- Bridge 是否只负责事件翻译和结果聚合，没有创建 LLM/Tool 实例或做持久化。
- Agent 层是否不依赖 Electron、IPC 或 renderer 契约。
- `/compact` 是否明确分流，不进入普通 LLM conversation。
- `user_message -> thinking/tool -> llm_usage/tool_result -> assistant_message -> context_snapshot` 的持久化顺序是否稳定。
- Abort、stream event、final result 和 session recovery 是否存在职责重叠。

## 输出格式

### 偏移点

- 记录代码和文档设计不一致的地方。

### 不合理设计

- 记录实现选择、职责边界、数据流问题。

### 可读性问题

- 记录难读函数、命名、重复逻辑。

### 耦合问题

- 记录过高耦合、边界混乱，或者过度拆分导致理解成本高的问题。

### 死代码/兼容残留

- 记录开发期不需要保留的旧入口、无用分支、废弃类型。

### 建议动作

- 只给建议，不改代码。建议类型包括：删除、收敛、重构、补文档、补测试。

## 产出要求

- 本轮只审查和记录，不修改代码。
- 结论需要引用具体文件路径，尽量给出行号。
- 对不确定的问题标注为“待确认”，不要当作确定缺陷。

## 审查结果

### 发现 1：图片附件分析在 Main 进程里绕过 Agent/Bridge 的工具事件模型（待确认）

- 偏移点：`docs/design-docs/agent-runtime/agent-turn-layers.md` 约束 Main Process 做 IPC、依赖装配、session meta 读取和结果持久化，不处理 Agent 内部事件；Bridge/Agent 负责事件翻译、工具执行和结果聚合。当前 `packages/desktop/src/main/agent-turn.ts:248-254` 在进入 `runTurnWithAgent()` 前调用 `analyzeImageAttachmentsForTurn()`，而 `packages/desktop/src/main/media-analysis.ts:1-3` 直接读本地文件并从 `@actspace/agent-core` 调 `analyzeMediaWithKimi()`，`packages/desktop/src/main/media-analysis.ts:81-123` 还手工发送 `tool_started` / `tool_finished` 风格 stream event。
- 不合理设计：图片分析表现为工具运行流，但不是 Agent loop 的 tool call；`packages/agent-core/src/engine/test/bridge.test.ts:280-345` 明确断言附件分析只落在 `user_message` payload，且不会产生 `tool_call` / `tool_result`。这会让 stream 上看到“工具”，持久化事实里却没有同一工具事件。
- 可读性问题：读代码时需要同时理解 main 侧预处理、Bridge 的 `formatUserMessageForModel()` 注入、shared 的附件 payload，才能知道图片分析到底算不算一类工具；`packages/agent-core/src/adapters.ts:72-109` 又把附件和分析结果拼回用户消息，进一步弱化了它和普通工具事件的边界。
- 耦合问题：Main 进程对 Kimi 辅助能力、文件读取、媒体分析 stream preview 产生直接认知，和 Agent 层已有 `analyze_media` tool（`packages/agent-core/src/tools/tools/analyze-media/executor.ts`，搜索确认存在）形成两条能力入口。
- 死代码/兼容残留：未确认是兼容残留；也可能是“发送前附件预处理”的产品设计，需确认是否有文档明确允许 Main 预处理媒体。
- 建议动作：若希望附件分析是 Agent 能力，收敛到 agent-core 的工具/上下文预处理模块，由 Bridge 统一翻译并决定是否持久化；若希望它是发送前预处理，则补文档说明“media_analysis stream event 不对应 session tool_result”，并补测试覆盖 stream/persist 分层差异。

### 发现 2：Main 忽略 `writeSessionResult()` 的结构化失败，可能让 IPC 返回成功但 session 未完整落盘

- 偏移点：设计要求 Main Process 持久化 `AgentTurnResult` 到 session store，并且 `session.jsonl` 是恢复事实来源。`packages/desktop/src/main/agent-turn.ts:272-287` 拿到 `AgentTurnResult` 后调用 `await writeSessionResult(sessionPaths, result)`，但没有检查返回的 `WriteResult.ok`。
- 不合理设计：`packages/agent-core/src/persistence/session-store.ts:120-149` 的 `writeSessionResult()` 会把 `appendEvents()`、subagent transcript、meta、`context-state.json` 的失败以 `{ ok: false, error }` 返回；调用方忽略后，`packages/desktop/src/main/agent-turn.ts:288-307` 仍继续记录“turn_result_persisted”、生成标题并返回 result。这样 renderer 可能按本轮完成刷新，但后续 `session:get` 从 `session.jsonl` 恢复时缺事件。
- 可读性问题：`writeSessionResult()` 注释写“所有写入操作返回 WriteResult，错误不抛出”（`packages/agent-core/src/persistence/session-store.ts:1-6`），但调用点像异常式 API 使用，容易误读为失败会 throw。
- 耦合问题：Bridge 返回的 final result 和 Session Persistence 的事实来源之间缺少显式提交确认，stream/final result/persist 三者边界不够稳定。
- 死代码/兼容残留：无。
- 建议动作：在 `runAndPersistTurn()` 检查 `writeResult.ok`，失败时返回/抛出结构化错误并发送 `turn_failed` 或补一条可恢复 `error` 事件；同时补 main 层持久化失败测试。

### 发现 3：Abort 注册清理没有放在 `finally`，且早期预处理阶段的 abort 可能是空操作

- 偏移点：审查计划要求检查 Abort、stream event、final result 是否职责重叠。当前 `packages/desktop/src/main/agent-turn.ts:237` 先把 `activeTurnAborts` 注册为 `() => abortableDeps.abort?.()`，但 `deps.abort` 到 `packages/agent-core/src/engine/bridge.ts:215` 才由 Bridge 创建 Agent 后赋值。
- 不合理设计：在 `packages/desktop/src/main/agent-turn.ts:248-254` 的图片附件分析期间，如果 renderer 调 `agent:abort-turn`，`packages/desktop/src/main/agent-turn.ts:127-131` 会返回 true，但实际 `abortableDeps.abort` 仍是 `undefined`，预处理不会被取消。另一个风险是 `activeTurnAborts.delete(turnKey)` 只在 `packages/desktop/src/main/agent-turn.ts:306` 的成功路径执行，中间如果 `runTurnWithAgent()` 后处理或 `writeSessionResult()` 抛出，abort map 可能残留旧 turn。
- 可读性问题：Main 侧暴露的 `abortTurn()` 返回 boolean，但这个 boolean 只表示 map 中有 closure，不表示底层 Agent 或预处理已收到取消信号。
- 耦合问题：取消能力由 Main map、Bridge 对 `deps.abort` 的副作用赋值、Agent 内部 `AbortController` 三处共同拼成；边界上没有统一的 `AbortSignal` 从 IPC 贯穿到预处理和 Agent loop。
- 死代码/兼容残留：无。
- 建议动作：用 Main 创建的 `AbortController.signal` 贯穿 media analysis、Bridge、Agent；`activeTurnAborts.delete(turnKey)` 放入 `finally`；调整 `abortTurn()` 返回语义或补状态事件，并增加“Agent 创建前 abort”和“持久化异常后清理 map”的测试。

### 发现 4：手动 `/compact` 失败只发 stream，不写入可恢复的失败事实

- 偏移点：`/compact` 已在 renderer 明确分流：`packages/desktop/src/renderer/App.tsx:1066-1107` 对 `text.trim() === "/compact"` 走 `window.actspace.compactContext()`，不构造普通 `RunTurnInput`，这符合设计。但失败路径的持久化边界不稳定。
- 不合理设计：`packages/agent-core/src/engine/compact-context.ts:90-112` 在异常时发送 `context_compaction_failed` stream event，并返回 `status: "failed"`、`events: []`；`packages/desktop/src/main/context-compact.ts:49-61` 只在 `result.events.length > 0` 时 append events，所以失败不会写 `context_compaction` 或 `error` 到 `session.jsonl`。用户刷新/重启后看不到这次失败。
- 可读性问题：`packages/shared/src/session.ts:168-186` 的 `ContextCompactionPayload.status` 支持 `"failed"`，`packages/shared/src/session-selectors.ts:248-280` 也能把 failed compaction 渲染出来，但失败路径实际不产出对应 SessionEvent，类型能力和运行行为不一致。
- 耦合问题：stream UI 可以表达失败，session recovery 不能表达失败；stream/persist 分层在 `/compact` 失败场景断开。
- 死代码/兼容残留：`ContextCompactionPayload.status: "failed"` 与 selector 的 failed 分支目前像未被主流程使用的契约残留，除非其他路径会落 failed compaction（待确认）。
- 建议动作：失败时至少追加一条 `error` 或 `context_compaction`（status=`failed`）事件，并写入轻量 context snapshot/state；补 `/compact` 失败后 `session:get` 仍可恢复失败块的测试。

### 发现 5：Agent Turn 恢复边界基本符合设计，但 persistence 仍导出旧恢复/兼容入口，容易被 Main 误用

- 偏移点：主 turn 当前没有直接调用 `sessionEventsToMessages` / `recoverMessages`：`packages/desktop/src/main/agent-turn.ts:184-203` 只读 meta 并把 `sessionPath` 传给 `createAgentForSession()`；恢复实际在 `packages/agent-core/src/engine/create-agent-deps.ts:289-318` → `ContextManager.createForSession()` → `ConversationContext.createFromSession()`（`packages/agent-core/src/context/manager.ts:105-113`、`packages/agent-core/src/context/modules/conversation.ts:36-40`）。这点和文档一致。
- 不合理设计：`packages/agent-core/src/persistence/index.ts:40-47` 仍公开 `recoverMessages` / `recoverMessageBlocks` / `recoverContextSnapshot` / `recoverDiffSummary`，`packages/agent-core/src/persistence/compat.ts:11-27` 还保留 `readSessionJsonl` / `appendSessionEvent` 旧入口。虽然当前 main turn 未误用，但这些入口和“四层职责”文档中“Main 不调 recoverMessages / sessionEventsToMessages”的约束形成潜在绕路。
- 可读性问题：同一包同时暴露“session store 正式入口”“单项恢复入口”“deprecated compat 原始 JSONL 入口”，新代码很难一眼判断哪些能用于真实 turn。
- 耦合问题：恢复能力被多个导出面暴露，削弱了 `createAgentForSession(config, { sessionPath })` 作为唯一恢复入口的约束。
- 死代码/兼容残留：`packages/agent-core/src/persistence/compat.ts:11-27` 明确标注 deprecated，搜索重点范围内未发现主链路引用，属于可清理/隔离的兼容残留。
- 建议动作：把 compat 入口移出主 barrel export 或只保留测试/迁移脚本可见；在文档或 lint/测试中锁定 Main turn 禁止导入 `recoverMessages`、`sessionEventsToMessages`、`readSessionJsonl`。
