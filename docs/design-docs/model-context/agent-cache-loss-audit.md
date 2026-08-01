# Cache Loss Audit 设计

> 状态：设计规范
> 关联计划：`docs/exec-plans/completed/actspace-cache-loss-audit-plan.md`
> 适用范围：`packages/agent-core`、`packages/shared`、本地 session 存储与排障脚本

## 背景

actspace 已经把每次模型调用的 token 与缓存数据落入 `session.jsonl` 的 `llm_usage` 事件：

- `packages/shared/src/session.ts#LlmUsagePayload`
- `packages/agent-core/src/engine/bridge.ts#createLlmUsageEvent`

这能回答“缓存命中率低不低”，但还不能回答“为什么低”。项目开发阶段尤其需要一种低成本排查链路：当某次模型调用真实 cache read 很低时，可以找回这次调用和上一次调用的完整输入上下文，比较哪一段不再是 append-only，从而定位 prefix 变化、历史压缩、上下文改写或 provider 参数变化等原因。

参考项目 Reasonix 的 Cache-First 设计证明了两点：

1. 缓存命中率由客户端上下文稳定性决定，而不只是 provider 能力。
2. 仅靠“某个方法被调用过”判断缓存风险不够稳，最好对真实准备发送给 provider 的上下文做结构指纹。

## 目标

- 当真实模型调用 cache hit ratio 低于阈值时，在 `session.jsonl` 中留下轻量索引。
- 低缓存事件发生时，把上一轮与当前轮真实送入 provider 的 Context 保存到旁路目录。
- 为后续脚本提供 `summary.json`、上下文快照和 diff 线索，能快速判断缓存低的主要原因。
- 让审计字段不进入下一轮 LLM 输入，避免排查系统本身污染 prompt cache。

## 非目标

- 不在首版自动修复缓存失效。
- 不把每次请求的完整上下文都长期保存。
- 不把大段上下文、hash 链或 diff 明细写入 `session.jsonl`。
- 不改变 Usage Statistics 页面现有聚合语义；它仍以 `llm_usage` token 事实为准。

## 数据落点

### `session.jsonl`

`session.jsonl` 只保存轻量索引，建议落在 `llm_usage.payload`：

```json
{
  "type": "llm_usage",
  "payload": {
    "cacheHitTokens": 42000,
    "cacheMissTokens": 58000,
    "cacheStatus": true,
    "cacheAuditId": "20260531T153012Z-turn12-call0"
  }
}
```

字段语义：

- `cacheStatus: true`：本次模型调用真实 cache hit ratio 低于阈值，默认阈值为 `0.9`。
- `cacheAuditId`：旁路审计目录中的事件 ID。只有 `cacheStatus === true` 时必填。

`cacheStatus` 不表示发送前判断一定命中，它表示“真实 usage 已证明这次缓存很低”。发送前分析只用于解释原因。

### 旁路审计目录

建议目录：

```text
<userData>/cache-audit/<sessionId>/
  last.context.json
  <cacheAuditId>/
    summary.json
    previous.context.json
    current.context.json
    diff.txt
```

职责：

- `last.context.json`：滚动文件，只保存上一次真实送入 provider 的 Context。
- `previous.context.json`：低缓存事件发生时，从滚动文件复制出的上一轮 Context。
- `current.context.json`：低缓存事件发生时，本轮真实送入 provider 的 Context。
- `summary.json`：小型索引卡片，供脚本快速扫描，不包含完整上下文正文。
- `diff.txt`：给人看的粗粒度差异摘要。

滚动文件避免长期在内存中保留 1M 级上下文，也避免每一轮都落完整快照。只有低缓存事件才把 previous/current 固化为证据。

## 发送前分析

发送前分析不以“是否调用过 addTool/compact”等事件为主，而以真实 Context 的结构指纹为主。

一次 Context 快照至少包含：

- `systemPrompt`
- `tools`
- `messages`
- provider 与模型调用关键参数，例如 `provider`、`model`、`thinkingEnabled`

审计器对快照计算：

- `prefixHash`：`systemPrompt + tools + provider 参数` 的稳定序列化 hash。
- `messageHashes`：每条 message 的稳定序列化 hash 数组。
- `requestHash`：完整 Context 的稳定序列化 hash。

发送前与上一轮快照比较：

```text
previous.messageHashes = [a, b, c, d]
current.messageHashes  = [a, b, c, d, e]
=> append-only，suspectBeforeSend = false

previous.messageHashes = [a, b, c, d]
current.messageHashes  = [a, x, c, d, e]
=> 第 1 条消息变化，appendOnlyBroken = true
```

建议输出：

```ts
type CacheAuditPreflight = {
  suspectBeforeSend: boolean;
  prefixChanged: boolean;
  appendOnlyBroken: boolean;
  firstChangedMessageIndex?: number;
  previousPrefixHash?: string;
  currentPrefixHash: string;
  previousRequestHash?: string;
  currentRequestHash: string;
};
```

其中：

- `prefixChanged`：系统提示词、工具定义或 provider 参数导致前缀变化。
- `appendOnlyBroken`：历史消息不是“上一轮完整消息数组 + 新消息”的形状。
- `firstChangedMessageIndex`：hash 链首次不一致的位置，用于快速定位断点。

## 模型返回后确认

模型返回后，使用 `AssistantMessage.usage` 中的真实缓存数据判断：

```ts
const hit = usage.cacheHit || usage.cacheRead;
const miss = usage.cacheMiss;
const denominator = hit + miss;
const cacheHitRatio = denominator > 0 ? hit / denominator : 0;
const cacheStatus = denominator > 0 && cacheHitRatio < 0.9;
```

如果 `cacheStatus === true`：

1. 生成 `cacheAuditId`。
2. 将 `cacheStatus` 与 `cacheAuditId` 写入当前 `llm_usage.payload`。
3. 复制 `last.context.json` 到 `<cacheAuditId>/previous.context.json`。
4. 写入本轮 Context 到 `<cacheAuditId>/current.context.json`。
5. 写入 `summary.json` 与 `diff.txt`。

无论本轮是否低缓存，模型调用结束后都应该用当前 Context 覆盖 `last.context.json`，作为下一轮的 previous。

## `summary.json` 建议结构

```json
{
  "schemaVersion": 1,
  "auditId": "20260531T153012Z-turn12-call0",
  "sessionId": "session-abc",
  "turnId": "turn-12",
  "callId": "llm_call_turn12_1",
  "createdAt": "2026-05-31T15:30:12.123Z",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "cacheStatus": true,
  "cacheHitRatio": 0.42,
  "cacheHitTokens": 42000,
  "cacheMissTokens": 58000,
  "threshold": 0.9,
  "suspectBeforeSend": true,
  "prefixChanged": false,
  "appendOnlyBroken": true,
  "firstChangedMessageIndex": 12,
  "previous": {
    "messageCount": 31,
    "prefixHash": "prev-prefix",
    "requestHash": "prev-request"
  },
  "current": {
    "messageCount": 34,
    "prefixHash": "curr-prefix",
    "requestHash": "curr-request"
  },
  "files": {
    "previousContext": "previous.context.json",
    "currentContext": "current.context.json",
    "diff": "diff.txt"
  }
}
```

`summary.json` 是索引卡片，不是证据正文。脚本应优先扫描它，再按需读取两份 Context。

## 排查解释规则

后续脚本可按以下优先级解释低缓存：

1. `prefixChanged === true`：优先检查 system prompt、tools、provider 参数、模型 ID。
2. `appendOnlyBroken === true`：优先检查历史压缩、session replay、heal、retry、rewind 或中途改写历史。
3. `firstChangedMessageIndex` 很靠前：说明缓存断点在高复用前缀区，成本影响大。
4. `firstChangedMessageIndex` 靠近尾部：可能只是近期工具结果或用户输入变化，影响较小。
5. 以上都为 false 但 cache 低：可能是首次请求、provider 侧缓存过期、缓存尚未热、或服务端策略波动。

当前 `scripts/analyze-cache-audit.mjs` 会在保留上述 hash diff 的基础上输出诊断分类：

- `cold start`：没有上一轮 Context 快照，首轮低命中通常正常。
- `prefix changed`：稳定前缀发生变化。
- `append-only broken`：消息链不是上一轮完整前缀加新增后缀。
- `large appended suffix`：prefix 与 append-only 都正常，但新增消息/工具结果占本轮请求比例较大。
- `provider/cache uncertainty`：客户端结构未见明显问题，优先考虑缓存预热、过期或 provider 侧策略。

脚本中的字符数与新增比例只用于本地排障排序，不替代 provider 返回的 token/cache usage 事实。

## 与现有设计的关系

- `docs/design-docs/model-context/agent-token-usage-and-context-state.md` 定义 token 与 usage 事实来源，本设计只扩展 `llm_usage` 的排障索引字段。
- `docs/design-docs/model-context/agent-context-compression.md` 已说明历史压缩会影响 DeepSeek prompt cache，本设计提供压缩前后证据。
- `docs/design-docs/core-storage-and-observability.md` 定义本地 session、context-state 和排障日志边界，本设计新增 `cache-audit/` 作为低频、按需写入的排障材料。

## 安全与隐私

- Context 快照可能包含用户输入、工具结果和文件片段，只能写入本地 `userData`。
- `cache-audit/` 不应上传，不应进入反馈 issue，不应写入 renderer 状态。
- 后续实现可以增加配置开关，默认只在开发版或显式启用时保存完整上下文。
- 脚本输出默认只展示摘要与文件路径，不直接打印完整上下文正文。
