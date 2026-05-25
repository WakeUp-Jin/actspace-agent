# actspace Token Usage 与 Context Control 数据地基计划

## 目标

建立 token usage、成本统计、轻量 context snapshot 和当前 context state 的数据地基，让 actspace 能按每次模型回复记录真实消耗，并为前端 Context 弹窗和未来上下文绝对控制能力提供稳定数据来源。

本计划只实现数据结构、持久化、统计口径和只读展示地基；不实现用户点击增删改上下文。

## Required Reading

新会话或子 Agent 执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/agent-core/token-usage-and-context-state.md`
- `docs/design-docs/agent-core/backend-agent-testing.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`

不要读取 `.env` 文件内容；只允许检查字段名、默认值、示例值和运行时错误信息。

## 背景

当前实现中：

- `packages/shared/src/ipc.ts` 包含 `MODEL_REGISTRY`。
- `packages/shared/src/session.ts` 定义 `SessionEvent`、`AssistantReply`、`ContextUsageSnapshot`。
- `packages/agent-core/src/messages.ts` 定义内部 `Usage`。
- `packages/agent-core/src/llm/convert.ts` 从 OpenAI-compatible stream usage 中读取部分 usage 字段。
- `packages/agent-core/src/context/token-estimator.ts` 使用 `字符数 / 3.5` 做估算。
- `packages/agent-core/src/persistence/session-store.ts` 负责 session 写入。
- `packages/desktop/src/main/index.ts` 在 turn 完成后写入 `AgentTurnResult.events`。
- 前端 Context popup 当前消费 `contextSnapshot` 和 `ContextUsageSnapshot.buckets`。

需要补齐：

- 模型配置从 IPC 契约中拆出。
- 每次 LLM call 生成一条 `llm_usage` 持久化事件。
- DeepSeek usage 映射覆盖 reasoning、cache hit、cache miss。
- 根据模型配置计算并写入 `cost`。
- 轻量 `context_snapshot` 保留历史水位。
- 每个会话增加可覆盖的 `context-state.json`，作为当前 Context 弹窗和未来上下文控制面板的数据源。

## 范围

包含：

- 新增 `packages/shared/src/model-config.ts`，集中维护模型配置、上下文窗口和价格。
- 在共享 session 契约中新增 `llm_usage` 事件和 `LlmUsagePayload`。
- 扩展 provider usage 映射，特别是 DeepSeek 的 cache hit、cache miss、reasoning token。
- 按每次 LLM API call 生成 `llm_usage`，并关联本次模型产生的 session event ids。
- 保留并调整轻量 `context_snapshot`，记录 estimated total、max、percent、buckets、estimator。
- 新增 `context-state.json` 路径、读写方法和当前 ContextState 类型。
- 前端 Context 弹窗改为优先展示当前 context state；没有 context state 时 fallback 到 latest context snapshot。
- 添加单元测试和必要的 renderer mock fixture。
- 更新架构、可靠性或前端验证文档中与 token/context 状态相关的事实。
- 完成代码变更后记录 history；若命中学习沉淀条件，按 `docs/learnings/WRITING_GUIDE.md` 追加 learning。

不包含：

- 不实现 Context 弹窗中的删除、添加、修改按钮。
- 不实现上下文压缩策略重构。
- 不实现账单级 pricing history 或 pricingSnapshot。
- 不新增第三方 tokenizer 依赖，除非后续单独计划批准。
- 不把完整 context entries 写入 `session.jsonl`。
- 不做云端同步、用户账号级用量统计或导出账单。

## 设计原则

### 1. Usage 以模型回复为最小事实单位

每次 LLM API call 产生一条 `llm_usage`。turn、session、day 的统计都从 `llm_usage` 聚合，不作为原始事实写入。

### 2. 成本写入 usage，价格配置集中维护

`llm_usage.payload.cost` 按当时 `model-config.ts` 中的价格计算后写入。`pricingSnapshot` 不写入事件流。

### 3. Context snapshot 只做轻量历史水位

`context_snapshot` 不包含完整 entries，仅记录估算总量、窗口、百分比、bucket 和 estimator。

### 4. Context state 是当前可变视图

完整 entries 写入每个会话目录的 `context-state.json`。该文件可覆盖更新，后续用于上下文控制面板。

## 相关代码路径

- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/agent-core/src/llm/services/deepseek.ts`
- `packages/agent-core/src/llm/services/kimi.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/types.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/*`

## 数据契约草案

### `LlmUsagePayload`

```ts
export type LlmUsagePayload = {
  callId: string;
  provider: "deepseek" | "kimi" | "mock";
  model: string;
  modelId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  cost: {
    input: number;
    output: number;
    cacheHitInput?: number;
    cacheMissInput?: number;
    reasoning?: number;
    total: number;
    currency: "CNY" | "USD";
  };
  relatedEventIds?: string[];
};
```

### `ContextState`

```ts
export type ContextState = {
  sessionId: string;
  activeTurnId?: string;
  updatedAt: string;
  estimator: { name: string; version: string };
  totalEstimatedTokens: number;
  maxTokens: number;
  percentUsed: number;
  buckets: ContextUsageBucket[];
  entries: ContextStateEntry[];
};
```

## 风险

- 风险：Agent loop 当前只返回最终 `AgentLoopResult`，不一定保留每次 LLM call 的边界。
  - 缓解方式：先在 engine event 或 loop result 中补充 per-call usage 记录，再由 bridge 生成 `llm_usage`。
- 风险：usage 事件与 session events 的 `relatedEventIds` 难以在第一版完全精确。
  - 缓解方式：第一版至少关联同一 LLM call 产生的 assistant 相关事件；无法关联时允许为空，但测试要覆盖最终回复关联。
- 风险：成本计算误差来自模型价格配置错误。
  - 缓解方式：价格集中在 `model-config.ts`，测试覆盖 cache hit/miss 和普通 input/output 的计算。
- 风险：`context-state.json` 与 `session.jsonl` 写入时机不一致。
  - 缓解方式：turn 完成时先写 session events，再覆盖 context state；读失败时前端 fallback 到 latest context snapshot。
- 风险：Context popup 变复杂导致 UI 回归。
  - 缓解方式：前端只做只读展示，按 `docs/FRONTEND_VERIFICATION.md` 做 Electron 或 browser fixture 验证。

## 里程碑

1. 模型配置与共享契约地基。
2. Provider usage 映射与 cost 计算。
3. Engine/bridge 生成 per-call `llm_usage` 事件。
4. Context snapshot 与 context-state 持久化。
5. 前端 Context 弹窗只读展示。
6. 测试、文档、history 与验收。

## 实施任务

### Task 1: 拆出模型配置

修改目标：

- `packages/shared/src/model-config.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/desktop/src/main/index.ts`
- 相关测试或 fixture

步骤：

1. 新增 `model-config.ts`，迁移现有 `MODEL_REGISTRY`。
2. 给每个模型补充 `contextWindow` 和 `pricing` 字段。
3. `ipc.ts` re-export 兼容的 `MODEL_REGISTRY`，避免一次性改动过大。
4. main 进程继续通过 `modelId` 解析 provider、apiModel、thinkingDefault。

验证：

- `pnpm typecheck`
- 前端模型选择器仍能显示原有模型。
- main 进程仍能解析 `deepseek-v4-flash`、`deepseek-v4-pro`、`kimi-k2.6`。

### Task 2: 扩展 shared session 契约

修改目标：

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/*test*` 或相关测试

步骤：

1. `SessionEventType` 增加 `llm_usage`。
2. 新增 `LlmUsagePayload` 类型。
3. 调整 `ContextUsageSnapshot` 或新增轻量 payload 字段，加入 estimator。
4. `createMessageBlocks()` 忽略 `llm_usage` 和 `context_snapshot`，不渲染为聊天消息。

验证：

- `pnpm --filter @actspace/shared test`，如果没有 test 脚本则运行 `pnpm typecheck`。
- 旧 session 事件仍可 normalize。

### Task 3: Provider usage 映射补全

修改目标：

- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/agent-core/src/llm/test/convert.test.ts`
- `packages/agent-core/src/llm/test/deepseek-service.test.ts`

步骤：

1. 内部 `Usage` 增加 `reasoningTokens`、`cacheHitTokens`、`cacheMissTokens`，或建立转换函数映射到 `LlmUsagePayload`。
2. 从 stream `chunk.usage` 读取：
   - `prompt_tokens`
   - `completion_tokens`
   - `total_tokens`
   - `prompt_cache_hit_tokens`
   - `prompt_cache_miss_tokens`
   - `completion_tokens_details.reasoning_tokens`
3. 保留 Kimi/mock 的兼容路径，缺少字段时使用 0 或 undefined。

验证：

- 新增 DeepSeek usage mock chunk 测试，断言 cache hit、cache miss、reasoning 被捕获。
- `pnpm --filter @actspace/agent-core test`

### Task 4: 成本计算

修改目标：

- `packages/agent-core/src/llm/*` 或新增 `packages/agent-core/src/usage/*`
- `packages/shared/src/model-config.ts`
- 相关测试

步骤：

1. 新增纯函数 `calculateUsageCost(usage, modelConfig)`。
2. 支持普通 input/output 和 DeepSeek cache hit/cache miss 输入价格。
3. 如果没有 cache 字段，按普通 input 价格计算。
4. 输出 `LlmUsagePayload.cost`。

验证：

- 单元测试覆盖：
  - 无缓存普通模型成本。
  - DeepSeek cache hit/miss 成本。
  - reasoning token 不重复计费，除非模型配置明确单独计价。

### Task 5: Engine 保留 per-call usage

修改目标：

- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`

步骤：

1. 给每次 LLM stream 调用生成 `callId`。
2. 在 loop result 或 agent event 中保留每次 call 的 usage、provider、model 和产生的 assistant message。
3. bridge 将这些 usage 转为 `llm_usage` session events。
4. `relatedEventIds` 尽量关联本次 call 产生的 `thinking/tool_call/assistant_message` event。

验证：

- 单工具调用回合应产生两条 `llm_usage`。
- 无工具普通回复应产生一条 `llm_usage`。
- `llm_usage` 不渲染成 MessageBlock。
- `pnpm --filter @actspace/agent-core test`

### Task 6: 轻量 context snapshot 与 context-state

修改目标：

- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/persistence/types.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/recovery.ts`
- `packages/agent-core/src/persistence/test/*`

步骤：

1. 在 snapshot 中加入 estimator。
2. 新增 `context-state.json` 路径到 `SessionStorePaths`。
3. 新增 `writeContextState()` 和 `readContextState()`。
4. turn 完成后覆盖写入当前 ContextState。
5. `readSessionRecord()` 返回 context state，或增加专用 IPC 读取接口；第一阶段优先让 bootstrap/session get 能拿到前端需要的数据。

验证：

- 新建 session 时不会因缺少 `context-state.json` 失败。
- 完成 turn 后生成或更新 `context-state.json`。
- 读取 session 时能返回 context state 或 fallback 到 snapshot。

### Task 7: 前端 Context 弹窗只读展示

修改目标：

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/*`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/shared/src/session.ts`

步骤：

1. Context popup 优先使用 `contextState`。
2. 显示总量、最大窗口、percent。
3. 显示 bucket 列表。
4. 显示 entries 列表，包括 title、kind、estimatedTokens、preview。
5. 不显示删除、添加、修改按钮。

验证：

- `pnpm typecheck`
- 按 `docs/FRONTEND_VERIFICATION.md` 使用 browser fixture 或 Electron 验证 Context popup。
- 截图确认文字不重叠，bucket 和 entries 可读。

### Task 8: 文档、history 与收尾

修改目标：

- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/FRONTEND_VERIFICATION.md`，如前端验收方式变化
- `docs/histories/YYYY-MM/*.md`
- `docs/learnings/YYYY-MM/*.md`，如命中学习沉淀条件

步骤：

1. 更新本地存储模型，加入 `context-state.json`。
2. 更新 session event 顺序示例，加入 `llm_usage`。
3. 记录 token usage 与 context state 数据地基的 history。
4. 判断是否需要 learning；本任务大概率命中新概念、可迁移、有深度、有模式。

验证：

- 文档中不出现与实现冲突的旧描述。
- `rg -n "MODEL_REGISTRY|context_snapshot|llm_usage|context-state" docs packages` 检查命名一致。

## 验证方式

命令：

- `pnpm typecheck`
- `pnpm --filter @actspace/shared test`
- `pnpm --filter @actspace/agent-core test`

手工检查：

- 完成一次普通模型回复，`session.jsonl` 出现一条 `llm_usage`。
- 完成一次包含 tool call 的回复，`session.jsonl` 出现多条 `llm_usage`。
- DeepSeek usage 事件包含 cache hit/miss 字段，缺省时不破坏 Kimi/mock。
- 会话目录出现 `context-state.json`。
- Context popup 显示总量、bucket、entries。

观测检查：

- `logs/agent-runs/*.jsonl` 不写入密钥。
- session 文件不写入 API key。
- usage 成本和 token 统计能通过 `session.jsonl` 聚合出来。

## 进度记录

- [x] 2026-05-25：确认设计边界：usage 写入事件流；cost 写入 usage；pricingSnapshot 不写入；轻量 context_snapshot 保留；完整 context state 存每会话单独文件。
- [ ] 拆出模型配置。
- [ ] 扩展 session usage 契约。
- [ ] 补齐 provider usage 映射和成本计算。
- [ ] 生成 per-call `llm_usage` 事件。
- [ ] 写入并读取 `context-state.json`。
- [ ] 前端 Context popup 只读展示 context state。
- [ ] 完成测试、文档、history 和必要 learning。

## 决策记录

- 2026-05-25：usage 以每次模型回复为最小事实单位，而不是按 turn 或 session 直接写聚合值。这样工具循环、多次 LLM call 和未来子 Agent 都能准确统计。
- 2026-05-25：`cost` 写入 `llm_usage`，但 `pricingSnapshot` 不写入事件。价格由共享模型配置维护，历史统计直接使用已落盘 cost。
- 2026-05-25：完整 Context Manifest 不写入 `session.jsonl`，而是写入每会话的 `context-state.json`。事件流只保留轻量 `context_snapshot` 作为历史水位。
- 2026-05-25：第一阶段不做 Context 弹窗中的增删改，只做可见性、统计和数据地基。
