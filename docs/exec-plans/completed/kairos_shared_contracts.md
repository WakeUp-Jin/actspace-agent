# Kairos Shared Contracts 基座

## 目标

为 Kairos 自治模式建立 `packages/shared` 层的全部类型契约：

- 扩展 `SessionEventType` 增加 4 个 Kairos 专属生命周期事件类型与对应 payload。
- 新增 `packages/shared/src/kairos-contracts.ts`：`KairosRunState` / `KairosRuntimeState` / `KairosControl` / `KairosEventRow` / `aggregateKairosEvents` 签名 + 默认实现。
- 提供首批 fixtures，让后续 plan（renderer / controller / IPC）可基于稳定数据形态开发。

完成后所有其他 Kairos plan 都基于本 plan 的导出符号，**不允许在其它 plan 里重复定义 Kairos 相关类型**。

## 范围

- 包含：
  - `packages/shared/src/session.ts`（扩展 type + payload，**追加但不破坏现有 type**）
  - `packages/shared/src/kairos-contracts.ts`（新增）
  - `packages/shared/src/kairos-aggregator.ts`（新增，实现 `aggregateKairosEvents`）
  - `packages/shared/src/__tests__/kairos-aggregator.test.ts`（新增）
  - `packages/shared/test/fixtures/kairos-events.ts`（新增 fixtures）
  - `packages/shared/src/index.ts`（导出新模块）
- 不包含：
  - 后端 controller / runner / scheduler 的实现
  - 前端 KairosPage / 任意 React 组件
  - IPC 实际通道接线（仅定义类型）
  - 数据落盘逻辑（仅定义事件结构）

## 依赖关系

- 本 plan 没有 Kairos 内部依赖。
- 启动前置：repo 已完成 `actspace-backend-contracts-events`（已 completed），`SessionEvent` 基础设施可用。
- 产出给：`kairos_config_and_tool_guard`、`kairos_short_term_memory`、`kairos_observe_and_briefs`、`kairos_controller_runner`、`kairos_main_ipc_and_renderer`、`kairos_e2e_and_docs_sync` 全部依赖本 plan 的导出。

## 必读

新会话开始执行前必读：

- `AGENTS.md`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md` 的「契约定义」「事件存储与前端聚合」两章
- `packages/shared/src/session.ts`（理解现有 SessionEvent 形态、命名约定）
- `packages/shared/src/index.ts`（理解现有导出风格）

## 背景

- 相关设计文档：`docs/design-docs/agent-core/kairos-autonomous-mode.md`
- 相关代码路径：
  - `packages/shared/src/session.ts`
  - `packages/shared/src/index.ts`
  - `packages/shared/test/`（如有现有 fixtures 目录约定）
- 关键约束：
  - 现有 `SessionEventType` 联合类型必须**严格追加**，不允许改名或调换顺序——会破坏主 Agent session.jsonl 兼容。
  - `aggregateKairosEvents` 必须是**纯函数**：输入 `SessionEvent[]`，输出 `KairosEventRow[]`，无副作用，便于 main 和 renderer 共用。
  - 所有新增类型必须以 `Kairos` 为前缀，避免与主 Agent 共用类型混淆。

## 设计方案

### 1. SessionEventType 扩展

在 `packages/shared/src/session.ts` 末尾追加 4 个 type 字面量到联合：

```ts
export type SessionEventType =
  | "user_message"
  | "assistant_message"
  | "assistant_reply"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "llm_usage"
  | "diff_preview"
  | "context_snapshot"
  | "error"
  // ↓ 新增 ↓
  | "kairos_tick_injected"
  | "kairos_sleep_start"
  | "kairos_sleep_end"
  | "kairos_sleep_interrupted";
```

并在 payload 联合处追加：

```ts
export type KairosTickInjectedPayload = {
  trigger: "auto" | "wake_now" | "brief";
  briefId?: string;
  content: string;                                  // 注入到 user message 的内容
};

export type KairosSleepStartPayload = {
  plannedSeconds: number;
  reason: "after_tick" | "after_error" | "manual";
};

export type KairosSleepEndPayload = {
  actualSeconds: number;
};

export type KairosSleepInterruptedPayload = {
  reason: "user_message" | "wake_now";
  remainingSeconds: number;
};
```

并把这 4 个 payload 通过 discriminated union 接入到 `SessionEvent` 的 `payload` 字段（参考现有 type→payload 的映射模式）。

### 2. `packages/shared/src/kairos-contracts.ts`

```ts
import type { EventId, SessionEvent } from "./session";

export type KairosRunState =
  | "idle"
  | "ticking"
  | "sleeping"
  | "interrupted"
  | "stopped"
  | "cooldown";

export type KairosRuntimeState = {
  enabled: boolean;
  state: KairosRunState;
  sleepEndsAt?: string;                              // ISO time
  todayTickCount: number;
  lastReplyAt?: string;
  toolCallCountInCurrentTick: number;
  totalSleepSecondsToday: number;
};

export type KairosControl =
  | { type: "start" }
  | { type: "stop" }
  | { type: "wake_now" }
  | { type: "reset_today" };

export type KairosRowKind =
  | "tick"
  | "tool"
  | "reply"
  | "sleep"
  | "interrupt"
  | "error";

export type KairosRowStatus =
  | "running"
  | "success"
  | "failed"
  | "interrupted";

export type KairosEventRow = {
  id: string;                                        // 聚合区间内首个 event id
  kind: KairosRowKind;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: KairosRowStatus;
  summary: string;                                   // 表格列单行摘要
  relatedEventIds: EventId[];                        // 反查原始 SessionEvent[]
};

// IPC payload 形态（不绑定具体通道实现）
export type KairosGetEventsRecentRequest = {
  limit?: number;                                    // 默认 200
  before?: EventId;                                  // 用于分页加载更多历史
};
export type KairosGetEventsRecentResponse = {
  events: SessionEvent[];
  hasMore: boolean;
};

export type KairosPinNoteRequest = never;            // v1 不实现，预留 type=never 让滥用编译失败
```

> 注意：`KairosPinNoteRequest` 显式标记 `never` 是为了在编译期阻止误引用，等 v2 重启 pinned 功能时再换成真实类型。

### 3. `packages/shared/src/kairos-aggregator.ts`

实现 `aggregateKairosEvents(events: SessionEvent[]): KairosEventRow[]`，规则：

| 行 kind | 触发 event | 关闭 event | 备注 |
|---|---|---|---|
| `tick` | `kairos_tick_injected` | 同 turnId 的最后一条 event（按 timestamp） | 摘要取 trigger + content 前 60 字符 |
| `tool` | `tool_call` | 同 toolCallId 的 `tool_result` | 缺 result 时 status=running |
| `reply` | `assistant_message` / `assistant_reply` | 同条 | 摘要取文本前 80 字符 |
| `sleep` | `kairos_sleep_start` | `kairos_sleep_end` 或 `kairos_sleep_interrupted`（按到达顺序） | duration 取 actualSeconds 或剩余时间反推 |
| `interrupt` | `kairos_sleep_interrupted` | 同条 | summary 写 `reason` |
| `error` | `error` | 同条 | summary 写 message 前 80 字符 |

实现细节：

- 单趟扫描，O(n) 复杂度。
- 内部维护 `pendingToolCalls: Map<toolCallId, partialRow>` 和 `pendingSleep: partialRow | null`。
- 收到关闭 event 时把 partialRow `finalize` 并推入结果数组。
- 最终 `kairos_tick_injected` 关闭逻辑：以 turnId 为分组 key，记录该 turn 内最后一个 event 的 timestamp 作为 finishedAt。
- 输出按 `startedAt` 升序排列。

### 4. 单测：`kairos-aggregator.test.ts`

至少覆盖：

- **基本对**：tool_call + tool_result 聚合成单 `tool` 行；缺 tool_result → status=running。
- **sleep 正常**：sleep_start + sleep_end → 单 `sleep` 行，duration 正确。
- **sleep 被打断**：sleep_start + sleep_interrupted → 单 `sleep` 行 status=interrupted，**额外**产出 `interrupt` 行。
- **tick 父行**：kairos_tick_injected 起到本 turnId 最后 event 之间所有 event 计入 relatedEventIds，summary 含 trigger。
- **reply**：assistant_message 单条 → 单 `reply` 行。
- **error 在 sleep 期间**：sleep_start + error → sleep 行 status=failed + 单独 `error` 行。
- **空输入**：返回空数组。
- **多 turn 混杂**：3 个 tick 各自的 tool/reply 不串扰。

每个用例使用 `kairos-events.ts` 中的 fixtures 工厂构造输入。

### 5. fixtures：`packages/shared/test/fixtures/kairos-events.ts`

提供工厂函数：

```ts
export const makeTickInjected = (overrides?) => SessionEvent
export const makeToolCall      = (overrides?) => SessionEvent
export const makeToolResult    = (overrides?) => SessionEvent
export const makeAssistantReply = (overrides?) => SessionEvent
export const makeSleepStart    = (overrides?) => SessionEvent
export const makeSleepEnd      = (overrides?) => SessionEvent
export const makeSleepInterrupted = (overrides?) => SessionEvent
export const makeError         = (overrides?) => SessionEvent

// 场景级
export const sampleSingleTickWithToolAndReply = (): SessionEvent[]
export const sampleSleepInterrupted          = (): SessionEvent[]
export const sampleMultiTickMix              = (): SessionEvent[]
```

后续 plan 的测试都从这个 fixtures 文件 import，不在各自 plan 重写一遍。

### 6. 导出

`packages/shared/src/index.ts` 追加：

```ts
export * from "./kairos-contracts";
export { aggregateKairosEvents } from "./kairos-aggregator";
```

`session.ts` 的扩展通过原有 `export *` 自动传递，不需要额外动作。

## 任务拆分

- [ ] Step 1：在 `packages/shared/src/session.ts` 追加 4 个 `kairos_*` SessionEventType 和对应 payload；保持 type 字面量原顺序，新 type 追加在末尾。运行 `pnpm --filter @actspace/shared typecheck` 应通过。
- [ ] Step 2：新建 `packages/shared/src/kairos-contracts.ts`，按设计方案 §2 写完全部 type；不实现任何函数。运行 `pnpm typecheck`。
- [ ] Step 3：新建 `packages/shared/src/kairos-aggregator.ts`，按 §3 实现 `aggregateKairosEvents`；纯函数，无外部依赖。
- [ ] Step 4：新建 `packages/shared/test/fixtures/kairos-events.ts`，提供 §5 列出的全部工厂和场景级 sample。
- [ ] Step 5：新建 `packages/shared/src/__tests__/kairos-aggregator.test.ts`，按 §4 八类用例覆盖。运行 `pnpm --filter @actspace/shared test` 应全过。
- [ ] Step 6：更新 `packages/shared/src/index.ts` 导出新模块；运行 `pnpm typecheck` 在 monorepo 根目录确认无下游编译错误（agent-core / desktop 都不直接 import Kairos 类型时应保持现状）。
- [ ] Step 7：在 `docs/design-docs/agent-core/kairos-autonomous-mode.md` 的「契约定义」一节顶部加一行链接指向本 plan，作为"已实现"标记；不改其它正文。
- [ ] Step 8：补一条 history：`docs/histories/<month>/<timestamp>-kairos-shared-contracts.md`，记录扩展的 type、aggregator 行为、覆盖测试数量。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared test`（aggregator 单测全过）
  - `pnpm --filter @actspace/shared typecheck`
  - `pnpm typecheck`（monorepo 根，确认未破坏其它包）
- 观测检查：
  - 在 `packages/shared/dist/` 或 `tsc --noEmit` 输出中确认新增类型可被 import。
  - 验证 fixture `sampleMultiTickMix()` 经过 `aggregateKairosEvents` 后产出的 row 数与人工预期一致（在测试用例中显式 assert 行数 + 每行 kind 序列）。

## 风险

- 风险：在 `SessionEventType` 中插入位置错乱，影响其它包对联合的 narrowing 行为。
- 缓解：严格追加在末尾；如发现 `assistant_reply` 等老 type 已经被外部按位置 narrow（极少见），用 `as const` 锁字面量顺序。

- 风险：aggregator 行为偏离设计文档，导致 renderer 渲染异常。
- 缓解：每条聚合规则都对应单独测试；renderer plan 直接消费 fixture，不允许重定义聚合行为。

- 风险：fixtures 写法过于具体，未来 SessionEvent payload 字段变更时 fixture 大面积失效。
- 缓解：工厂函数仅接受 `Partial<X>` 覆盖必要字段，默认值通过常量集中维护，单点改动可全局生效。

## 决策记录

- 2026-05-27：选 `extend_session_event` 而不是为 Kairos 造独立 KairosEvent 类型。原因：Kairos 短期记忆需要进 LLM messages（与主 Agent session 结构对齐），独立类型会让 working-memory loader 多一个类型映射层。
- 2026-05-27：聚合在 shared 而不是 renderer-only。原因：未来若要在 main 层做服务端事件流过滤/搜索，可直接复用 aggregator；renderer 改成纯展示层。
- 2026-05-27：`KairosPinNoteRequest = never`。原因：v1 不引入 pin 机制，但保留命名以避免 v2 引入时与现有命名打架；`never` 让任何误引用变成编译错误。
