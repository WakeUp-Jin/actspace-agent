# Kairos Prompt 缓存优化与 Thinking 全链路设计

状态：设计定稿（2026-06-10），对应执行计划 `docs/exec-plans/active/kairos_prompt_cache_optimization.md`。

## 1. 为什么做

### 1.1 问题：跨 tick 缓存命中率呈"前缀断裂"模式

对 Kairos `llm_usage` 事件的逐 call 分析显示规律性模式（DeepSeek 按 64-token 块匹配前缀缓存）：

```
call  7 | hit=4480 miss= 107  命中率=98%   ← tick 内第 2 次调用
call  8 | hit= 640 miss=3911  命中率=14%   ← 新 tick 第 1 次调用，只命中前 640 token
call  9 | hit=4608 miss= 127  命中率=97%
call 10 | hit= 640 miss=4069  命中率=14%
```

根因定位（不是压缩机制——`compressKairosSegments` 至今未被 controller 接线调用）：

- `KairosRunner.processTick` 每个 tick 重新组装 system prompt；
- `KAIROS_SYSTEM_PROMPT` 模板中静态指令头约 697 token（1622 字符），紧接着就是 `[当前时间] {current_time}`（秒级 ISO 时间戳，每 tick 必变）；
- ⌊697/64⌋ = 10 块 = 640 token，与观测值严丝合缝；
- 时间戳之后的 config_tips / user_rules / 观测摘要 / 历史摘要全部作废重算。

一个 tick 通常包含 2 次 LLM 调用（工具回合 + 总结），tick 内 context 只追加所以命中率高；跨 tick 第 1 次调用必断在 640。

### 1.2 连带发现的两个问题

1. **contextWindow 硬编码**：`packages/desktop/src/main/index.ts` 中 `createKairos({ contextWindow: 32_000 })` 写死 32K，而 `MODEL_REGISTRY` 中 DeepSeek 两档均为 1M、Kimi K2.6 为 256K。短期记忆加载预算（`contextWindow × 0.75`）被错误压到 24K。
2. **thinking 链路断头**：设置页已有 `kairos.thinking`（auto/on/off）开关，main 进程已把 `thinkingEnabled` 传进 runner；但 runner 刻意不落 thinking 事件，短期记忆无法回放 thinking，前端 Kairos 面板也不展示。

## 2. 设计原则

**Static prefix, dynamic suffix**：可缓存前缀 = 所有"低频变化"内容；每 tick 必变的内容只允许出现在上下文末尾。

**发送 = 落盘 = 重放**：任何会进入下个 tick 重放范围的内容，落盘形态必须与发送给 LLM 的形态逐字节一致，否则断点只是后移（与 2026-06-10 修复的主会话 adapters 块顺序 bug 同根，见 `docs/learnings/2026-06/event-replay-must-preserve-block-order.md`）。

## 3. 目标上下文形态

```
┌─ system prompt（仅低频段，按变化频率降序排列）─────────────┐
│ [1] 静态指令头（含 {soul} 插槽）← 改 soul.md 才变（2026-07-04）│
│ [2] config_tips_block          ← 改 preferences 才变      │
│ [3] user_rules                 ← 改 rule.md 才变          │
│ [4] history_summary            ← 压缩产出新摘要文件才变    │
└──────────────────────────────────────────────────────────┘
┌─ messages（当日事件重放，append-only）───────────────────┐
│ tick N-2 的 [tick msg / thinking / text / toolCall / result]│
│ tick N-1 的 …                                             │
├─ 本 tick 注入的 user message（动态尾部）──────────────────┤
│ <tick ts="...">                                           │
│ [当前时间 / phase / 活跃 briefs 数]                        │
│ [观测增量：watch diff / sessions digest / inbox 新消息]    │
│ [brief 正文（若 brief tick）]                              │
│ </tick>                                                   │
└──────────────────────────────────────────────────────────┘
```

system prompt 模板删除 `[当前时间]` 行和 `{observation_summary}` 段；`{current_time}`、`{current_phase}`、`{active_briefs_count}`、观测内容全部移入 tick user message。

### 3.1 为什么 history_summary 留在 system prompt

历史摘要只在压缩产出新 `*.summary.md` 时变化。压缩触发本身就必然造成一次前缀断裂（旧事件被摘要替换，无法避免，主 Agent compaction 同理），让 history_summary 跟着同一时刻变化不产生额外断点。频率上有滞回保障：水位从 keepRatio 涨回 threshold 需要大量 tick。

### 3.2 tick message 的组装与落盘

- `dispatcher.ts` 继续产出触发语义（`<tick>` / brief 正文）；
- runner 在注入前把"时间头 + 观测增量"拼进 content，**整体写入 `kairos_tick_injected.payload.content`**，发送与落盘同源；
- 重放路径（`short-term.ts::translateEvent`）不需要任何改动即可保证一致。

## 4. 观测增量化

观测从"每 tick 全量快照"改为"自上个 tick 以来的增量"。语义收益：历史里每个 tick 记录的是"当时看到了什么新东西"，重放时模型可重建完整时间线，不再有冗余快照。

| 观测源 | 现状 | 增量化方案 |
| --- | --- | --- |
| watch diff | ~~本身就是快照对比差异（`watch-diff.ts`）~~ 2026-07-03 已随巡检管道退役，目录变化改由 fs-watch Skill 主动读取，不再进观测增量 | （已退役，无需增量化） |
| sessions digest | 已有 `lastSeenTurnId` 游标（`memory/state.json`），但每 tick 输出全量列表 | 只输出 `unreadTurnsForKairos > 0` 的 session；全部已读时省略该节 |
| inbox | 每 tick 输出每个来源最近 N 条消息全文，无已读水位 | 新增已读水位（按消息块的时间戳行），只注入水位之后的新消息块；tick 闭合后推进水位 |

inbox 已读水位持久化到 `observe/inbox-state.json`（独立文件；sessions 游标实际位于 `observe/sessions-state.json`，分文件归属清晰、避免两个模块对同一文件读改写竞争），格式 `{ readCursor: Record<KairosInboxSource, string /* 最后已读消息的 ISO 时间戳 */> }`。inbox 文件是 append-only 的 markdown，消息块头部 `### <ISO> | priority | topic` 即天然游标。

**增量丢失兜底**：tick 失败（LLM 报错/中断）时不推进任何游标，下个 tick 重新看到同一批增量。游标推进时机统一为"tick 正常闭合后"（实现：`observeRefresh` 返回 commit 闭包 + `commitInboxCursor` 回调，由 `runner.processTick` 成功路径末尾调用）。`getContextSnapshot` 只计算不提交，预览不消费观测。（watch manifest 相关的提交约定已随巡检管道退役删除。）

## 5. Thinking 全链路

要求：Kairos 可开启思考模式（设置页开关已存在），thinking 需要落盘、回放、前端展示。

### 5.1 落盘

`runner.ts::agentEventToSessionEvents` 不再丢弃 thinking。`message_end` 时按现场块顺序落 `thinking*`（`payload: { content, signature? }`）→ `assistant_message`(text) → `tool_call*`。signature 必须保留——`anthropic-convert.ts` 仅在 `block.signature` 存在时才把 thinking 块回发给 API，丢 signature 等于重放残缺。

注意（实现决策）：`tool_call` 事件改由 `message_end` 的 toolCall 块产出，不再来自 `tool_start`——sequential 执行下 tool_start 与 tool_result 交错落盘，重放时无法无歧义还原"同一次 LLM 回复含哪几个 toolCall"；从 message_end 产出后，落盘顺序天然等于现场块顺序。

### 5.2 回放（重放保真的核心）

`short-term.ts` 重放要与现场发送的消息结构逐字节一致。现状有两处分歧，必须一并修复：

1. **同回合块合并**：现场是一条 assistant 消息含 `[thinking?, text?, toolCall...]`；重放却把 `tool_call` / `assistant_message` 事件拆成两条消息。改为按**事件相邻性**合并（注意：不能按 turnId 分组——整个 tick 共享一个 turnId，无法区分 tick 内的多次 LLM 调用）：连续的 `thinking*` → `assistant_message?` → `tool_call*` 折叠为一条 assistant 消息，`tool_result` / `user_message` 断开分组；块顺序 `[thinking, text, ...toolCalls]`（与 2026-06-10 adapters 修复一致：tool_use 必须是末尾块）。
2. **thinking 块回放**：合并时把 thinking 事件还原为 assistant 消息的首块（带 signature）。

不修这两处，system prompt 静态化后断点只是后移到"上一个 tick 的消息处"（live 形态 ≠ replay 形态），吃不满收益。

### 5.3 前端展示

- `KairosRowKind` 增加 `"thinking"`；`aggregateKairosEvents` 把 `thinking` 事件折叠为一行（summary 取首行截断）。
- `KairosRightPanelView` / Kairos 事件表按现有 row 渲染管线展示 thinking 行，样式对齐主会话 thinking 块的视觉规范（弱化、可折叠）。
- 设置页开关已存在（`KairosSettings.tsx`，三态 auto/on/off），不需要新增 UI；确认 `auto` 跟随 `ModelSpec.thinkingDefault` 的行为不变。

### 5.4 体积与脱敏

thinking 内容只落 Kairos 自己的短期记忆 jsonl（`<kairosRoot>/memory/short-term/`），不进主会话 session.jsonl；压缩时 thinking 事件与其它事件一起被摘要替换，不会无限膨胀。

## 6. contextWindow 接模型注册表

- `createKairosBootstrap` 处删除硬编码 `32_000`，改为 `resolveKairosModelSpec(modelId).contextWindow`（DeepSeek 1M / Kimi 256K）。
- 短期记忆加载预算随之变为 `1M × 0.75 = 750K`（DeepSeek），实际受当日事件量约束，不会立即放大请求；但意味着**压缩触发会非常稀疏**，符合"压缩 = 低频大动作"的预期。
- Kairos 切换模型时 contextWindow 跟随变化；模型解析失败时回退 `resolveKairosModelId` 的默认模型对应值，不再保留独立 fallback 常量。

## 7. 时间戳粒度约定

- tick message 中 `[当前时间]` 用分钟粒度（`YYYY-MM-DD HH:mm`），秒级精度对 Kairos 决策无价值；
- 观测增量内部的时间戳（watch diff 截至时间等）同样降到分钟粒度；
- 该约定不影响缓存（tick message 在动态尾部），目的是减少模型注意力噪音与 diff 噪音。

## 8. 被排除的方案

- **把观测摘要保留在 system prompt 并按稳定性排序**（仅调段顺序）：可把稳定前缀从 640 提到约 2700 token，但跨 tick 仍必断，治标不治本，作为过渡态无必要。
- **观测全量进 tick message（不增量化）**：一致性自动满足、改动小，但每 tick 历史膨胀 1~2k token，加速逼近预算且重放充满冗余快照。已被用户明确否决，直接一步到位增量化。
- **thinking 不落盘**（保持现状）：消除一个重放分歧源，但用户明确要求 Kairos 支持思考模式且前端可见，故 thinking 必须进入"发送 = 落盘 = 重放"闭环。
- **重放时从 jsonl 原文逐字节回放请求体**：最彻底但等于自建请求快照层，与 SessionEvent 抽象冲突，复杂度不成比例。

## 9. 预期收益与验证

- 跨 tick 第 1 次调用命中率从 ~14% 提升到 ~90%+（miss 仅剩动态尾部 + 上一 tick 增量）；
- 验证方式：本地跑 Kairos 数个 tick 后，用脚本聚合 `llm_usage` 的 `cacheHitTokens/cacheMissTokens`，确认不再出现"hit=640"模式；
- 回归保障：short-term 重放合并的单测断言"重放消息结构 === 现场组装结构"；runner 单测断言 tick content 落盘与发送一致。

## 10. 相关文档

- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`：Kairos 总体设计。
- `docs/design-docs/model-context/agent-cache-loss-audit.md`：主会话缓存失效排查设计（断点分析方法论同源）。
- `docs/learnings/2026-06/event-replay-must-preserve-block-order.md`：事件重放保真原则的来源。
- `docs/code_design-audit/05-kairos-autonomous-mode.md`：压缩未接线的偏移记录。
