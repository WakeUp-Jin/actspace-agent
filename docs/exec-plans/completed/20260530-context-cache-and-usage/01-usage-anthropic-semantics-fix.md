# 01 Anthropic Usage 语义修复

## 目标

修复 DeepSeek 以 Anthropic 格式（`apiFormat: "anthropic"`，当前默认）回复时的 token usage 语义错误，让 Usage 页恢复全局一致的不变量：

- `缓存命中 ≤ 输入`，不再出现「缓存 > 总计」。
- `缓存命中 + 缓存未命中 = 输入`。
- `总计 = 输入 + 输出`。

并去掉 Usage 页主统计区 4 张卡的英文副标题。

## 范围

包含：

- 修 `packages/agent-core/src/llm/anthropic-convert.ts` 的 `anthropicUsageToUsage`。
- 去掉 `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx` 第 779-782 行的 `detail`。
- 更新/补充 `packages/agent-core/src/llm/test/anthropic-convert.test.ts` 的 usage 断言。

不包含：

- 不回修已写入 `session.jsonl` 的历史 usage 事件。
- 不改 `packages/agent-core/src/llm/convert.ts`（OpenAI 格式本就符合不变量）。
- 不改成本价格表与 `packages/agent-core/src/usage/cost.ts` 公式。

## 背景

### 根因

DeepSeek 默认走 Anthropic 协议：`packages/agent-core/src/env.ts` 的 `DEEPSEEK_API_FORMAT` 默认 `"anthropic"`，工厂据此实例化 `DeepSeekAnthropicService`。该 service 用真流式 `client.messages.stream`，经 `processAnthropicStream` 逐增量累积，再由 `buildAnthropicAssistantMessage` → `anthropicUsageToUsage` 生成 `Usage`，是唯一的 usage 入口（usage 来自流式累加器对 `message_start` / `message_delta` 的合并）。

Anthropic usage 语义：

- `input_tokens`：本次「未命中缓存的新输入」，不含缓存读取与缓存写入。
- `cache_read_input_tokens`：命中缓存读取（cache hit）。
- `cache_creation_input_tokens`：写入缓存（cache write）。
- 完整 prompt 输入 = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`。

但 `anthropicUsageToUsage` 当前把 `input_tokens` 当成完整输入：

```text
result.input = usage.input_tokens;                                  // 实际只是未命中部分
result.cacheHit = cacheRead;
result.cacheMiss = Math.max(usage.input_tokens - cacheRead, 0);     // 语义错位
result.totalTokens = usage.input_tokens + usage.output_tokens;      // 漏算缓存读取/写入
```

下游 `engine/bridge.ts#createLlmUsageEvent` 把 `usage.input → promptTokens`、`usage.cacheHit → cacheHitTokens`、`usage.totalTokens → totalTokens`，于是 Usage 页出现「缓存(7936) > 总计(6877)」「命中(286.3K)+未命中(107.6K) ≠ 输入(333.8K)」。

### 相关代码路径

- `packages/agent-core/src/llm/anthropic-convert.ts`（`anthropicUsageToUsage`，约 323-345 行）
- `packages/agent-core/src/llm/services/deepseek-anthropic.ts`（usage 来源确认）
- `packages/agent-core/src/engine/bridge.ts`（`createLlmUsageEvent`，375-393 行）
- `packages/agent-core/src/usage/cost.ts`（成本计算，依赖一致的 cacheHit/cacheMiss）
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`（779-782 行）

### 已知约束

- 价格表 `packages/shared/src/model-config.ts` 只有 `inputCacheHitPerMillion / inputCacheMissPerMillion / outputPerMillion`，没有独立「缓存写入」单价。本修复把 `cache_creation` 计入 `cacheMiss`，按未命中价计费，是当前可接受近似（与 reasonix 缓存写入按高价的精确模型相比有微小偏差，留作后续）。

## 实施任务

### Step 1: 修 `anthropicUsageToUsage`

把三段输入合成完整 prompt，并恢复不变量：

```ts
export function anthropicUsageToUsage(usage: AnthropicUsage): Usage {
  const result = createEmptyUsage();
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const reasoning = usage.output_tokens_details?.thinking_tokens ?? 0;

  // Anthropic 的 input_tokens 只是"未命中缓存的新输入"，不含 cache_read / cache_creation。
  // 合成完整 prompt 输入，对齐全局 OpenAI 式不变量：
  //   promptTokens = cacheHit + cacheMiss，total = prompt + output。
  const promptTokens = usage.input_tokens + cacheRead + cacheWrite;

  result.input = promptTokens;
  result.output = usage.output_tokens;
  result.cacheRead = cacheRead;
  result.cacheWrite = cacheWrite;
  result.cacheHit = cacheRead;
  // 未命中 = 新输入 + 缓存写入（都按未命中价计费，价格表暂无独立写入价）。
  result.cacheMiss = usage.input_tokens + cacheWrite;
  result.reasoning = reasoning;
  result.totalTokens = promptTokens + usage.output_tokens;

  if (usage.server_tool_use) {
    result.serverToolUse = {
      webSearchRequests: usage.server_tool_use.web_search_requests ?? 0,
      webFetchRequests: usage.server_tool_use.web_fetch_requests ?? 0,
    };
  }
  return result;
}
```

验收：

- 不变量恒成立：`cacheHit ≤ input`、`cacheHit + cacheMiss === input`、`totalTokens === input + output`。

### Step 2: 去掉 Usage 页 4 张卡副标题

`packages/desktop/src/renderer/components/UsageStatisticsPage.tsx` 第 779-782 行，删除 4 个 `detail` 属性（保留 `label` 与 `value`）：

```tsx
<BreakdownCard label="输入" value={formatMillions(effectiveSnapshot.summary.promptTokens)} />
<BreakdownCard label="输出" value={formatMillions(effectiveSnapshot.summary.completionTokens)} />
<BreakdownCard label="缓存" value={formatMillions(effectiveSnapshot.summary.cacheHitTokens)} />
<BreakdownCard label="推理" value={formatMillions(effectiveSnapshot.summary.reasoningTokens)} />
```

验收：

- 4 张卡只显示中文 label + 数值，不再有英文副标题；`BreakdownCard` 的可选 `detail` 入参保留不删。

### Step 3: 测试

更新 `packages/agent-core/src/llm/test/anthropic-convert.test.ts`：

- 给一条带 `input_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`、`output_tokens` 的 Anthropic usage，断言：
  - `usage.input === input_tokens + cache_read + cache_creation`
  - `usage.cacheHit === cache_read`
  - `usage.cacheMiss === input_tokens + cache_creation`
  - `usage.totalTokens === usage.input + output_tokens`
  - `usage.cacheHit + usage.cacheMiss === usage.input`（不变量）
- 用具体数字复刻用户上报场景：`input_tokens=6729, cache_read=7936, cache_creation=0, output=148`，断言 `total(14813) ≥ cacheHit(7936)`，不再「缓存 > 总计」。

可选：在 `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx` 加一条断言：主统计区不再出现文案 `direct prompt`。

## 风险

- 风险：把 `cache_creation` 计入 `cacheMiss` 导致成本相对官方账单略偏高。
  - 缓解：当前价格表无写入价，按未命中价是合理近似；后续若引入写入价，在 `cost.ts` 单独拆分即可，不影响本次不变量修复。

## 验证方式

- 命令：`pnpm --filter @actspace/agent-core test -- anthropic-convert`、`pnpm --filter @actspace/desktop typecheck`。
- 真实数据：跑一次真实 DeepSeek（anthropic 格式）turn，打开 Usage 页确认每日细目「缓存 ≤ 总计」、主统计区「缓存 + 缓存未命中 = 输入」。

## 进度记录

- [x] Step 1 修 `anthropicUsageToUsage`（三段合成 + 不变量注释）。
- [x] Step 2 去掉 4 张卡副标题。
- [x] Step 3 补/改测试并通过（含用户上报高缓存场景 + deepseek-anthropic-service 总计断言同步为 34）。
- 验证：`pnpm --filter @actspace/agent-core test`（480 passed）、desktop renderer 测试 145 passed、两包 typecheck 通过。

## 决策记录

- 2026-05-30：只修源头转换，不回修历史持久化事件；`cache_creation` 暂计入 `cacheMiss` 按未命中价计费。
