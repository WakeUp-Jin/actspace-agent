# agent-core 核心运行时审查计划

## 目标

检查 `packages/agent-core` 的 LLM、context、engine、persistence、observability、env、skills 等核心运行时模块是否符合当前模块地图和后端设计文档。重点关注模块职责、上下文工程、事件循环、provider 抽象、持久化恢复和开发期兼容层是否仍合理。

## 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-backend-design.md`
- `docs/design-docs/agent-context-compression.md`
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `docs/design-docs/agent-skill-loading.md`
- `docs/design-docs/agent-cache-loss-audit.md`
- `docs/design-docs/agent-testing.md`

## 重点代码与文件范围

- `packages/agent-core/src/llm/`
- `packages/agent-core/src/context/`
- `packages/agent-core/src/engine/`
- `packages/agent-core/src/persistence/`
- `packages/agent-core/src/observability/`
- `packages/agent-core/src/skills/`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/*.ts` 顶层兼容入口
- `packages/agent-core/src/**/test/`

## 审查问题

- LLM 协议服务和品牌兼容包装是否职责清晰，是否还有重复消息转换、tool call 重组或 usage 归一逻辑。
- ContextManager、ConversationContext、压缩模块是否符合上下文压缩设计，是否存在拆 tool_call/tool_result 配对等风险。
- Engine loop 是否保持纯函数边界，压缩、cache audit、abort 和工具循环是否耦合过重。
- Persistence 是否以 `session.jsonl` 为事实来源，恢复逻辑是否集中且可测试。
- Observability 是否只做本地排障日志，不污染持久化事实。
- Skill catalog 是否只注入元信息和路径，正文读取是否保持渐进式披露。
- 顶层兼容 re-export 是否仍必要，是否已经成为开发期冗余代码。

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

### 发现 1：历史压缩安全切点兜底仍可能生成连续 user 消息（待确认）

- 偏移点：`docs/design-docs/agent-context-compression.md` 要求历史压缩切点“不动区以 assistant turn 开头”，避免合成 `UserMessage(source:"compaction")` 后紧跟普通 user；但 `packages/agent-core/src/context/modules/conversation.ts:111-119` 的兜底只找“第一条非 toolResult”，如果 target 之后没有 assistant、第一条非 toolResult 是 user，就可能形成 `user(compaction) -> user`。现有测试只覆盖 assistant 边界和非 toolResult 的基本约束，见 `packages/agent-core/src/context/test/conversation-compact.test.ts:60-74`。
- 不合理设计：主路径和兜底路径的安全条件不一致；兜底把“不要以孤儿 toolResult 开头”和“必须以 assistant 开头”混成了弱约束。
- 可读性问题：`findCompactionSplit()` 注释写“优先 assistant，兜底非 toolResult”，但没有显式说明兜底可能破坏 user/assistant 交替，读者容易以为它仍满足设计文档中的强约束。
- 耦合问题：压缩算法依赖 Anthropic/OpenAI provider 对消息序列的接受策略，但这个约束只隐含在 context 模块注释里，没有由 LLM 转换层或测试共同守住。
- 死代码/兼容残留：无。
- 建议动作：补一个 target 后没有 assistant 的单元测试；若设计仍要求严格交替，兜底应返回 null 或寻找能保证 `compaction user -> assistant` 的切点，而不是返回普通 user。

### 发现 2：自动压缩事件的持久化顺序与运行时发生顺序不一致

- 偏移点：`runAgentLoop` 在每次 LLM 调用前触发 `maybeCompact()` 并立即 emit `context_compaction`，见 `packages/agent-core/src/engine/loop.ts:111-119`；但 bridge 聚合持久化事件时先把整轮 `result.messages` 转成 session events，再把 `compactions` 追加到末尾，见 `packages/agent-core/src/engine/bridge.ts:258-268`。这会让 `session.jsonl` 中的 `context_compaction` 出现在它实际影响的 LLM call 和后续 assistant/tool events 之后。
- 不合理设计：`session.jsonl` 是会话事实来源，事件顺序应尽量表达运行事实；当前顺序让“压缩发生在模型调用前”的因果关系只能从 payload 推断，不能从事件流位置直接看出。
- 可读性问题：`compactions` 作为 side buffer 在 bridge 尾部统一落盘，和 `runLogger` 的即时事件记录不是同一种时序，排查时需要同时理解两套事件路径。
- 耦合问题：engine 已经提供即时 `context_compaction` 事件，但 bridge 又重新排序，导致 engine 的生命周期语义和 persistence 的事实流语义产生偏差。
- 死代码/兼容残留：无。
- 建议动作：让 bridge 在处理 `AgentEvent.context_compaction` 时同步生成 pending session event，按 agent event 顺序插入；或在文档明确 `context_compaction` 是 turn-level summary event，不代表 session.jsonl 时序。

### 发现 3：cache audit 低缓存写盘失败时会留下无 `cacheAuditId` 的低缓存索引

- 偏移点：`docs/design-docs/agent-cache-loss-audit.md` 约定 `cacheStatus === true` 时 `cacheAuditId` 必填，用来指向旁路审计目录；但 `packages/agent-core/src/observability/cache-audit.ts:216-230` 在低缓存且写审计文件失败时返回 `{ cacheStatus: true, cacheHitRatio }`，没有 `cacheAuditId`。bridge 会把这些字段写入 `llm_usage.payload`，见 `packages/agent-core/src/engine/bridge.ts:541-549`。
- 不合理设计：失败路径把“真实低缓存事实”和“可定位审计证据”拆开了，但 payload 没有记录旁路写盘失败原因，后续脚本看到 `cacheStatus: true` 却没有目录 ID 时只能猜。
- 可读性问题：`CacheAuditUsageMetadata.cacheAuditId?` 是可选类型，弱化了设计文档里“低缓存索引必须可定位”的语义。
- 耦合问题：observability 的旁路写盘失败会改变 persistence 中 `llm_usage` 的解释方式；但 bridge/persistence 不知道这是“审计证据缺失”而不是“无需审计目录”。
- 死代码/兼容残留：无。
- 建议动作：补文档或类型区分 `cacheStatus` 与 `cacheAuditWriteFailed`；若保持设计原约束，应先生成并返回 `cacheAuditId`，同时在 payload 或 run-log 中记录审计文件写入失败。

### 发现 4：顶层兼容入口仍包含可执行旧运行时和 mock 工具实现，已经超过“re-export 兼容层”

- 偏移点：模块地图说旧单文件入口保留为兼容层、内部 re-export 新模块 API；但 `packages/agent-core/src/agent.ts:60-120` 仍实现旧 `createAgentRuntime().runTurn()`，`packages/agent-core/src/llm.ts:21-71` 仍实现旧 provider registry/mock provider，`packages/agent-core/src/tools.ts:31-98` 和 `packages/agent-core/src/tools.ts:100-303` 仍实现旧 `ToolRegistry` 与 mock `read_file/grep/edit_file/list_directory` 工具。
- 不合理设计：旧入口不是薄 re-export，而是另一套可执行 Agent/Tool/LLM 路径；其中旧 mock 工具返回“ No real grep implementation yet ”这类占位结果，和当前 `tools/` 下真实 definition+executor+scheduler 路径并存。
- 可读性问题：文件头写“将在所有消费者迁移后移除”，但 `rg` 只发现这些旧 API 的直接定义和历史文档引用，未发现当前 desktop main 直接调用 `createAgentRuntime` / `createProviderRegistry` / `createToolRegistry` / `createDefaultTools`（待确认：公共包外部消费者不在本仓库搜索范围内）。
- 耦合问题：`src/index.ts:1-21` 继续 barrel export 这些旧入口，使 desktop 或新代码很容易从 `@actspace/agent-core` 误导入旧 API，绕过当前 `engine/create-agent-deps.ts`、`ToolManager`、`ContextManager.createForSession` 的主路径。
- 死代码/兼容残留：`packages/agent-core/src/agent.ts`、`packages/agent-core/src/llm.ts`、`packages/agent-core/src/tools.ts` 中旧 API 和占位工具属于明显兼容残留；`packages/agent-core/src/persistence.ts:14` 的 `readSessionJsonl` 旧入口也继续从主 barrel 暴露。
- 建议动作：先补一条禁止 main/runtime 新代码导入旧 API 的测试或 lint；随后把旧 API 移出主 barrel，或迁到明确的 `compat/legacy` 命名空间；若确认没有外部消费者，删除旧 `createAgentRuntime`、旧 registry、旧 mock tools 和 `readSessionJsonl` 主出口。
