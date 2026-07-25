## [2026-05-28 17:02] | Task: Kairos header 增加 token / 成本用量胶囊

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 我们一起来处理一下 kairos 的 token 显示，这样用户可以知道成本，一个是 token，一个是成本，看看如何设计吧。
> 表格里面，要不要加一列，用来显示本条消息消耗的 token 和成本（但是我觉得没有必要，因为这个显示的没有意义）。
> 我觉得只要显示这个就可以 token/成本，这样就可以，你看看显示在哪里比较好吧，第一行还有一些位置看看吧。

裁决要点（追加问答）：

1. 货币按 `payload.cost.currency` 自适应（DeepSeek 当前注册表写 USD，CNY 模型未来切过来自动跟随）。
2. 新增 `llm_usage` 事件**写盘到 Kairos short-term jsonl**，跨重启可重建累计。
3. 胶囊文案紧凑型 `12.4K tok · ¥0.0234`。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/shared`、`packages/desktop`、`docs/`

**Key Actions:**

- **[Kairos runner 产出 llm_usage]**：`runner.ts#agentEventToSessionEvents` 在 `message_end (assistant)` 分支新增一条 `llm_usage` SessionEvent。payload 由新加的 `buildKairosLlmUsagePayload` 组装：复用主 Agent 的 `resolveModelSpecByApiModel` + `calculateUsageCost`，按调用时 `model-config.ts` 价格快照算成本；usage 字段全 0 时（mock provider 默认）跳过不落，避免污染聚合。`turnId` 内用本地 counter 生成稳定 `callId`（`llm_call_${turnId}_${index}`），便于未来按 LLM call 维度做明细视图。
- **[shared `aggregateKairosUsage`]**：`kairos-aggregator.ts` 新增纯函数选择器，扫描 SessionEvent 流中所有 `llm_usage`，累加 token + cost 并做币种一致性校验（混合币种返回 `"MIXED"`）。`shared/index.ts` 同步 re-export `aggregateKairosUsage` 和 `KairosUsageSummary`。
- **[renderer selector `buildKairosUsageBadge`]**：`kairosSelectors.ts` 新增视图层格式化函数，把 `KairosUsageSummary` 转成胶囊渲染模型（`tokensLabel` / `costLabel` / `tooltip` / `hasData`）。`formatKairosTokenCount` 走 `< 100K/M 保留 1 位小数 + 整数`策略，避免 15400 → 15K 的 ≈6% 误差；`formatKairosCost` 按 currency 选 `$` / `¥` / `≈ $` 符号，紧凑/precise 双模式。
- **[KairosHeader 用量胶囊]**：`KairosPage.tsx` 新增 `KairosUsageBadge` 子组件，状态胶囊右侧并列展示；视觉上不带状态 dot、背景更弱，跟"运行状态"做差异化。hover 通过原生 `title` 给明细 tooltip（LLM 调用次数 / 输入输出 / 缓存命中 / 累计成本精确小数 / 混合币种提示）。`Coins` 图标用 lucide，灰色 `currentColor`。0 调用状态只显示 `0 tok`，省略成本部分。
- **[Llm usage 不污染 LLM messages]**：核对 `KairosShortTermMemoryContext.translateEvent` 的 `default → return null` 分支——`llm_usage` 永远不会被翻译成 LLM Message 进 messages 段，写盘只服务于持久化和聚合。
- **[Fixtures + 单测]**：
  - `shared/test/fixtures/kairos-events.ts` 新增 `makeLlmUsage(payload?)`，默认贴 DeepSeek-Flash 一次普通调用的数字（4K input / 1K output / $0.012 USD）。
  - `shared/test/kairos-aggregator.test.ts` 新增 5 个 `aggregateKairosUsage` 用例：空输入、多调用累加、`totalTokens=0` 回退、混合币种、与其他事件类型混合时只挑 llm_usage。
  - `agent-core/kairos/test/runner.test.ts` 新增 2 个用例：手写带 usage 的 AssistantMessage → 落一条 `llm_usage` 且 token/cost 正确；mock 默认 usage=0 → 不落 `llm_usage`。
  - `desktop/renderer/test/kairos-page.test.tsx` 新增 2 个 UI 用例：无 usage 事件时胶囊显示 `0 tok`、无 cost；有 usage 事件时按 buffer 聚合显示 `15.4K tok · ¥0.18` 且 tooltip 含明细。
- **[文档同步]**：
  - `docs/design-docs/kairos/agent-kairos-autonomous-mode.md` 在 runner 数据流段说明 `llm_usage` 事件的产出规则、写盘策略、不进 LLM messages 段；渲染规范段补"用量胶囊"在 header 第一行。
  - `docs/design-docs/kairos/front-Kairos监控页规范.md` 顶部控制区新增"用量胶囊"专节（形态 / 数据来源 / 货币 / token 格式 / tooltip），验收要点同步补两条（header 数据胶囊白名单、执行列表不加 token 列）。

### 🧠 Design Intent (Why)

用户的具体诉求只是"显示 token + 成本"，但实施前先想清楚两条边界：

1. **不在执行列表加列**：用户已经主动否决，这条直觉是对的——单条 LLM 调用的 token 数对运维监控没价值（不能据此判断是否要中断 / 异常），用户只关心"总账"。把"总账"放在 header 用量胶囊，跟状态胶囊同行并列，等于把"现在系统怎么样 + 已经消耗多少"两个最常被瞥一眼的信号一次性给到。
2. **不靠 IPC 单查"今日"**：之所以采用"前端聚合 ring buffer"而不是给 controller 加 `tokensToday` 字段 + 走 KairosRuntimeState 推送，是因为 ring buffer 与 `重置今日` 已经天然耦合（buffer 清空 → 胶囊归零），少加一份状态字段、少一个"数据源不一致"的隐患。代价是进程重启后第一次拉 ring 不足 200 条会少算一点，但 v1 可接受；后续若要严格今日，再扩展 `kairos:get-events-recent({ before })` 倒读 jsonl 补齐即可——而**llm_usage 已经落到 short-term jsonl，所以补齐路径是通的**，不会再开历史债。

具体取舍记一笔：

- **币种走 `cost.currency` 自适应而非硬切 CNY**：用户表达"用 ¥"的潜台词是"我希望看到人民币"。但 model-config 当前把 DeepSeek pricing 写成 USD，硬切符号会让用户看到 `¥0.05` 但实际是 USD 数额——是欺骗。selector 按 currency 显示符号，未来只要 model-config 改 DeepSeek 为 CNY、整个胶囊和 tooltip 自动跟着切到 ¥，无需再改 UI。这件事也在 history 里显式记下来，避免下任 Agent 看到 `$` 又来反复横跳。
- **mock provider 默认 usage=0 时不产 llm_usage**：避免在前端聚合时产生一堆 0-token 调用记录拉低 tooltip 的 "LLM 调用 N 次"语义。代价是当某 provider 真的回了 0 token（理论上不会，但流式中断有可能），那一次也不算 token——可接受。
- **`llm_usage` 落盘但不入 LLM messages**：依赖 `KairosShortTermMemoryContext.translateEvent` 的 default 分支。这是个隐式契约，所以在 design-md 里显式写"llm_usage 不污染 LLM messages 段"，给后人加 SessionEventType 时一个明确警示。
- **token 紧凑格式 `< 100` 保留 1 位小数**：v0 草稿是 `< 10`，但 15400 → 15K 误差 ~6%、Kairos 的工作量级最常落在 10K-50K，正好被"吃精度"。改为 `< 100` 后 `15.4K`、`48.7K`、`124K`、`1.2M`、`15M` 都合理。
- **header 不引入富 tooltip popover**：当前 KairosPage 没有 Radix popover 依赖，用原生 `title` 已经够好；如果未来要可点击 / 多列布局，再换成 popover。先 Make it work，少加一个 UI 依赖。

### 📁 Files Modified

- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/test/runner.test.ts`
- `packages/shared/src/kairos-aggregator.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/fixtures/kairos-events.ts`
- `packages/shared/src/test/kairos-aggregator.test.ts`
- `packages/desktop/src/renderer/state/kairosSelectors.ts`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/kairos/front-Kairos监控页规范.md`
