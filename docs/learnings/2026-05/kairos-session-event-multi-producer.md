# SessionEvent 多 producer 共用 schema 的设计

关联 history：`docs/histories/2026-05/20260527-2105-kairos-project-summary.md`

## 是什么

`actspace` 的主 Agent 和 Kairos 自治 Agent 是两个独立的"事件生产者"，但它们写出的事件流共用同一份 `SessionEvent` schema（`packages/shared/src/session.ts`）。Kairos 没有自创"KairosEvent" schema，而是在 `SessionEventType` union 末尾加 4 个枚举值：

```ts
type SessionEventType =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "llm_usage"
  | "context_snapshot"
  // ↓ Kairos 扩展
  | "kairos_tick_injected"
  | "kairos_sleep_start"
  | "kairos_sleep_end"
  | "kairos_sleep_interrupted";
```

每条事件还是 `{ id, sessionId, turnId, timestamp, type, payload }`，只是 `type` 多了几个值、`payload` 用 discriminated union 按 type 收窄。前端不区分"主 Agent 流"和"Kairos 流"，调一个 `aggregateKairosEvents(events)` 函数按 `type` 分派到对应聚合器。

## 为什么需要

直觉做法是给 Kairos 单独建一份 `KairosEvent` schema：

```ts
// ❌ 直觉错位
type KairosEvent =
  | { type: "tick_injected"; ... }
  | { type: "sleep_start"; ... }
  // ...
  | { type: "kairos_tool_call"; ... }   // 又得复刻一遍 tool_call
  | { type: "kairos_assistant_text"; ... };
```

这样会带来 5 个具体问题，我们正是因为想避开它们才选择共用 schema：

1. **聚合代码翻倍**：主 Agent 已经有 `createMessageBlocks(events)`、`getLatestContextSnapshot(events)` 这些聚合函数，新 schema 全部都要再写一遍 `createKairosMessageBlocks(events)`。每次新增 block 类型，两边都得改，必然漂移。
2. **持久化代码翻倍**：`session.jsonl` 的 `parseJsonl + writeAtomic + recovery` 这套基建已经为主 Agent 写过，独立 schema 等于再写一遍。
3. **工具调用结果归属混乱**：Kairos 用的 `read_file / bash / edit_file` 都是主 Agent 同款工具，工具自己 emit 的是 `ToolCallContent` / `ToolResultContent`。如果 Kairos 流是另一种 schema，工具就必须知道当前 caller 是谁、emit 哪种 event——工具不该有这种知识。
4. **前端表格组件不可复用**：MessageBlock 渲染流（thinking / assistant_text / tool_call / tool_result）是已经打磨好的；Kairos UI 想沿用就必须把 KairosEvent 转换回 MessageBlock，做无意义的两次映射。
5. **统计/计量层逻辑分叉**：`llm_usage` 是按 provider 计 token 用量的事实，Kairos 的 LLM 调用也产生这种事实。两种 schema 就要写两套 usage 聚合。

共用 schema 的代价只有一个：`SessionEventType` 的 union 长度会增加。这是个 cheap concern——TypeScript discriminated union 对几十个 case 都跑得很轻松，新增一个 case 时 exhaustive switch 会把所有消费点暴露出来，反而是好事。

## 怎么用

### 1. 用 `type` 字段做 producer 标记，而不是单独的 `producer` 字段

```ts
// ✅ producer 信息嵌进 type 名
{ type: "kairos_tick_injected", payload: {...} }

// ❌ 多余的 producer 字段
{ type: "tick_injected", producer: "kairos", payload: {...} }
```

理由：

- `type` 已经是 discriminated union 的标签，TypeScript 能精确收窄 payload 类型。
- 加 `producer` 字段后所有消费点都要写两次判断（`type === "X" && producer === "Y"`），徒增噪声。
- type 名带上前缀（`kairos_*`）让 grep / 日志阅读时一眼能区分。

### 2. 共用事件 + 专属事件的分工

```
共用事件（producer 都写）：
  user_message / assistant_message / thinking / tool_call / tool_result
  llm_usage / context_snapshot

Kairos 专属事件（只有 Kairos producer 写）：
  kairos_tick_injected
  kairos_sleep_start / kairos_sleep_end / kairos_sleep_interrupted
```

规律：**只要语义在主 Agent 那边也成立，就复用；只有产生条件独属于某 producer，才新建 type**。

例如 Kairos 的"我决定睡 60s"是主 Agent 完全没有的语义，所以 `kairos_sleep_*` 是独立的；Kairos 的"我说了句话"和主 Agent 的"我说了句话"是同一件事，所以共用 `assistant_message`。

### 3. 聚合器纯函数 + 单文件

`packages/shared/src/kairos-aggregator.ts` 是个纯函数：

```ts
export function aggregateKairosEvents(events: SessionEvent[]): KairosEventRow[] {
  // 按 type switch，分支里复用主 Agent 的字段提取逻辑
}
```

主 Agent 那边 `createMessageBlocks` 也是纯函数。聚合器纯化的好处：

- 前端可以无视环境（Electron / 浏览器 mock / vitest 测试）直接调。
- 单元测试只测 fixtures → 期望输出，不需要 mock IPC。
- 不同视图（Kairos 表格、主聊天卡片）从同一份 events 派生不同 row 类型，事实只有一份。

### 4. 持久化"按 producer 分目录"，不按 producer 分 schema

```
<userData>/
├── sessions/<sessionId>/session.jsonl    # 主 Agent
└── kairos/memory/short-term/YYYY-MM/<date>.jsonl    # Kairos
```

文件位置区分 producer，**文件里每行的 schema 是同一种**。这样：

- `ShortMemoryStore` 和 `session-store` 都用同一份 `parseJsonl` / `writeAtomic`。
- 未来想做"统一 timeline 视图"（按时间合并两边 jsonl），只是简单的 `mergesort by timestamp`，不需要 schema 转换。

## 核心要点

1. **多 producer 共用 schema 的前提是 schema 本身 producer-agnostic**：用 `id / sessionId / turnId / timestamp / type / payload` 这种通用元数据，不要塞"主 Agent 专属"的字段。
2. **新增 producer 的成本应该是 O(新增 type 数量)，而不是 O(消费点数量)**：通过共用 schema + 把 producer 编码进 type 名，新增 producer 只需扩展 union；所有现有消费点（持久化、恢复、统计、前端聚合）零改动。
3. **discriminated union 的 exhaustive switch 是免费的回归保险**：每次扩展 type 时，TypeScript 会把所有没处理新 case 的 switch 标红。这就是 schema 的"自带 lint"。
4. **共用 schema 不等于共用 producer 行为**：Kairos 和主 Agent 走的是独立的 controller、独立的事件 sink、独立的存储路径。共用的只是事件的"形状"。

## 常见陷阱

### 陷阱 1：给每个 producer 都加一个 `meta.producer` 字段

```ts
// ❌ 看起来很标准化，实际是冗余
{ type: "assistant_message", meta: { producer: "kairos" }, payload: {...} }
```

为什么不好：`session.jsonl` 路径已经决定了 producer，再在事件里冗余一份等于把"事实"双写。哪天两份不一致（比如有人手工拷贝 jsonl），消费方就得决定信哪个。

正确做法：producer 信息**只**编码在文件路径 + type 前缀里。

### 陷阱 2：聚合器塞进 controller / state hook 里

```ts
// ❌ 把派生塞到副作用层
useEffect(() => {
  bridge.onEvent((ev) => {
    setRows((rows) => deriveRowsImperatively(rows, ev));
  });
}, []);
```

为什么不好：派生逻辑被埋在副作用里，单测不容易、回放/重排序不容易、想加新视图就要再写一遍 imperative 派生。

正确做法：派生永远是 `events => rows` 的纯函数，存 `events`、用 `useMemo` 派生 `rows`。

### 陷阱 3：把 producer 专属逻辑塞进共用事件的 payload

```ts
// ❌ 共用事件里塞 Kairos 才用得到的字段
type AssistantMessagePayload = {
  content: string;
  // ...
  kairosTickId?: string;   // 主 Agent 永远不写
};
```

为什么不好：schema 变成"有时是这种形状、有时是另一种"，TypeScript 收窄能力骤降。

正确做法：如果 Kairos 真的需要"这次 assistant_message 是哪个 tick 产的"，那应该用 `turnId` 字段（共用语义：哪个 turn / tick）承载，而不是新加 `kairosTickId`。`turnId` 在主 Agent 那边是 turn-NNNN，在 Kairos 那边是 tick-NNNN——同一字段不同的取值空间，但语义一致。

## 自检问题

1. 假设要新加一个"Cron Agent"做定时巡检，按本模式它的事件 schema 应该怎么设计？答：在 `SessionEventType` 加 `cron_*` 前缀的几个值（只针对它专属的事件），共用事件直接写，新建 `cron-aggregator.ts` 纯函数派生它自己的视图。
2. 如果共用事件突然出现一个 Kairos 真的需要、但主 Agent 不可能用到的字段，该怎么办？答：先怀疑这个字段是不是真的不可复用——往往主 Agent 后续也会需要。如果确认 producer 专属，要么扩展该字段在 payload 里的 union 形状（用 discriminator），要么新建一个 Kairos 专属事件 type。绝对不要给共用 payload 加"可选 Kairos 字段"。
3. 这种模式有什么不适合用的场景？答：当不同 producer 的事件**消费方完全不同**（不会有任何统一视图、统计、回放需求）时，强行共用 schema 反而是反模式，每个 producer 走自己的 schema 更清爽。共用 schema 的价值就在"消费侧需要看到统一事实"——比如 Kairos 的 KairosPage 想看 `assistant_message`、用户的 Workbench 也想看 `assistant_message`，那共用就值。
