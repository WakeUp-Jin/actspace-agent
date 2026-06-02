# 02 Cache-First 上下文稳定性排序

## 目标

借鉴 reasonix「字节级前缀稳定」的缓存设计，给上下文管理引入显式的缓存稳定性（`stability`）属性：数字越大越不易变（100 = 整会话不变，10 = 每轮常变）。组装系统提示词时按稳定性降序排列，让不易变内容稳定排在前缀，最大化 DeepSeek prefix-cache 命中率；同时把「会话历史只追加、临时内容不入前缀」这条原则在代码与文档里固化。

## 范围

包含：

- `packages/agent-core/src/context/types.ts`：给 `PromptSegment` 加 `stability`，给 `SystemPart` 加可选 `stability`，新增稳定性档位常量。
- `packages/agent-core/src/context/modules/system-prompt.ts`：segment 排序键改为「stability desc → priority desc → id asc」。
- `packages/agent-core/src/context/manager.ts`：`buildSystemPrompt` 收集各模块 SystemPart 后按 `stability` 降序排列再渲染。
- 文档：在 `docs/design-docs/agent-token-usage-and-context-state.md` 的「DeepSeek Cache 设计影响」小节补充 stability 分层与三区域（不变前缀 / 只追加历史 / 临时不入前缀）落地说明。

不包含：

- 不重排会话历史消息（必须保持 append-only，重排会破坏 tool_call/tool_result 配对与缓存前缀）。
- 不实现 reasonix 的 fold / shrink / repair 管线（历史压缩已有 `compression/` 子系统，不在本计划内改动）。
- 不改前端契约（`ContextUsageSnapshot` 不变）。

## 背景

### reasonix 关键启示（已读源文档）

源：`/Users/wakeup-jin/Desktop/code-project/back-code/deepseek-reasonix-learing/docs/design-docs/reasonix-cache-first-architecture.md`

- 三区域：不变前缀（system + tools + few-shots）/ 只追加历史 / 每轮重置的临时区。
- 缓存命中率由客户端决定：任何前缀字节漂移（重排、重序列化工具、注入时间戳、reasoning 混入日志）都会打破缓存。
- 折叠是追加操作，不重写前缀。

### 当前实现对照

- `SystemPromptContext.getPrompt()`（`system-prompt.ts` 66-72 行）已按 `priority` 降序拼接，但 `priority` 语义是「重要性 / 位置」，没有显式表达「缓存稳定性」。
- `ContextManager.buildSystemPrompt()`（`manager.ts` 241-259 行）按「systemPromptModule, longTermModule」固定顺序收集 SystemPart，未按稳定性排序。
- 会话历史由 `ConversationContext` append-only 管理（`context/modules/conversation.ts`），已天然是「只追加」的 volatile tail；`convert.ts` 转换时不会把 thinking 回放进请求（OpenAI 格式），临时 reasoning 不污染前缀。
- 主 Agent 系统提示词 `prompt/main-agent.ts` 不注入时间戳等易变内容（已确认无 `new Date` / `timestamp`），前缀本就较稳。

### 关键约束

- 排序只作用于「系统提示词内部各 part / segment」这一层；会话消息顺序不动。
- DeepSeek 请求中 `tools` 是独立参数，其序列化顺序也影响缓存前缀；需保证每轮 `getContext().tools` 顺序确定（当前一次性 `setTools` 后整会话不变，已稳定，本计划仅加测试守护，不强行重排）。

## 实施任务

### Step 1: 类型与常量

`packages/agent-core/src/context/types.ts`：

- 新增稳定性档位常量（单一事实来源）：

```ts
/** 缓存稳定性档位：数字越大越不易变，越应排在前缀以提高 prefix-cache 命中率。 */
export const CACHE_STABILITY = {
  /** 整会话不变：核心系统提示词、工具协议说明。 */
  IMMUTABLE: 100,
  /** 基本稳定：规则、长期记忆摘要。 */
  STABLE: 70,
  /** 半易变：会话级注入但本轮内不变。 */
  SEMI: 40,
  /** 每轮常变：动态注入内容（本计划暂不引入实例，仅保留语义）。 */
  VOLATILE: 10,
} as const;

export type CacheStability = (typeof CACHE_STABILITY)[keyof typeof CACHE_STABILITY];
```

- `PromptSegment` 增加 `stability: number`（默认值由模块赋）。
- `SystemPart` 增加可选构造参数 `stability?: number`（默认 `CACHE_STABILITY.STABLE`），存为字段，供 manager 排序读取。`render()` 不变。

验收：

- `pnpm --filter @actspace/agent-core typecheck` 通过；既有 `SystemPart` 构造调用仍可用（stability 可选）。

### Step 2: SystemPromptContext 排序键

`system-prompt.ts`：

- core segment 设 `stability: CACHE_STABILITY.IMMUTABLE`；`registerSegment` 默认 `stability: CACHE_STABILITY.STABLE`，允许调用方覆盖。
- `getPrompt()` 排序键改为：

```ts
.sort((a, b) =>
  b.stability - a.stability ||
  b.priority - a.priority ||
  a.id.localeCompare(b.id),
)
```

- `format()` 产出的 `SystemPart` 带上该模块的整体 stability（取 `IMMUTABLE`，因为它包含 core）。

验收：

- 单测：注册若干 stability/priority 不同的 segment，断言拼接顺序为稳定性降序、同稳定性按 priority 降序、再按 id 升序，且多次调用顺序一致（确定性）。

### Step 3: ContextManager 收集后排序

`manager.ts#buildSystemPrompt`：

- 收集所有模块的 `SystemPart` 后，按 `part.stability ?? CACHE_STABILITY.STABLE` 降序稳定排序（用 index 做 tie-break 保持稳定排序），再 `render().join("\n\n")`。

验收：

- 单测：给两个 stability 不同的模块（高/低），断言高稳定模块的 part 排在系统提示词前面。

### Step 4: 工具顺序守护（轻量）

- 加一条单测：同一组工具调用两次 `getContext()`，断言 `JSON.stringify(ctx.tools)` 两次完全相同（守护工具序列化不漂移）。无需改生产代码（当前已稳定），仅防回归。

### Step 5: 文档同步

- 在 `docs/design-docs/agent-token-usage-and-context-state.md`「DeepSeek Cache 设计影响」小节补：
  - `CACHE_STABILITY` 档位含义与默认取值。
  - 三区域映射：系统提示词（按 stability 降序的不变前缀）/ 会话历史（append-only volatile tail）/ thinking 临时内容不回放进请求前缀。
  - 明确「会话历史不可重排」的硬约束与原因。

## 风险

- 风险：调整系统提示词内部顺序本身会让现有会话的前缀变化，触发一次性 cache miss。
  - 缓解：一次性代价可接受；调整后顺序长期稳定，反而提高后续命中率。
- 风险：未来有人给 segment 设了不合理 stability 导致前缀抖动。
  - 缓解：档位用常量约束 + 单测覆盖排序确定性；文档写明默认与约束。

## 验证方式

- 命令：`pnpm --filter @actspace/agent-core test -- system-prompt`、`pnpm --filter @actspace/agent-core test -- context`、`pnpm --filter @actspace/agent-core typecheck`。
- 观测：可选在 run-log 里打印一次系统提示词前缀的 sha256（开发态），用于人工对比同会话多轮前缀是否稳定；本计划不强制落地该日志，仅在文档建议。

## 进度记录

- [x] Step 1 类型与常量（`CACHE_STABILITY` + `PromptSegment.stability` + `SystemPart.stability`）。
- [x] Step 2 SystemPromptContext 排序键（stability → priority → id）+ format 标 IMMUTABLE。
- [x] Step 3 ContextManager 收集后按 stability 稳定排序。
- [x] Step 4 工具顺序守护测试 + 跨模块稳定性排序测试 + segment 默认 STABLE 测试。
- [x] Step 5 文档同步（token-usage-and-context-state.md「缓存稳定性档位 / 三区域映射」）。
- 验证：`pnpm --filter @actspace/agent-core test`（484 passed，+4 新测试）、typecheck 通过。

## 决策记录

- 2026-05-30：新增独立 `stability` 字段而非复用 `priority`，让「缓存稳定性」与「展示/重要性优先级」解耦。
- 2026-05-30：本计划只对系统提示词内部排序，会话历史保持 append-only 不重排。
