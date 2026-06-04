# Turn View From Call Facts

Related history: `docs/histories/2026-06/20260604-1954-usage-request-details.md`

## Core Idea

Usage data often has two useful grains:

- Fact grain: one immutable `llm_usage` event per model call.
- Product view grain: one row per user turn, derived by grouping facts by `sessionId + turnId`.

The fact grain should stay fine. The UI can always derive coarser rows later, but it cannot recover lost per-call details if the persisted event was written too coarsely.

## Why It Matters

Agent turns are not always one prompt and one answer. A single user input can trigger multiple LLM calls:

- first call asks for a tool;
- tool result is appended;
- second call asks for another tool or writes the final answer;
- compaction or sub-agent paths may add more model calls.

For billing and cache analysis, every call matters. For a human-facing Usage table, one row per user turn is easier to scan. These are different needs, not competing truths.

## Practical Pattern

Keep the event log append-only and precise:

```ts
// persisted fact
llm_usage: {
  sessionId,
  turnId,
  callId,
  promptTokens,
  completionTokens,
  cacheHitTokens,
  cacheMissTokens,
}
```

Then build a view model at query time:

```ts
const key = `${event.sessionId}:${event.turnId}`;
row.totalTokens += usage.totalTokens;
row.modelCallCount += 1;
row.timestamp = max(row.timestamp, event.timestamp);
```

## Common Traps

- Do not rename `cacheMissTokens` to Cache Write. Cache miss means uncached input tokens; cache write is a provider-specific write metric and needs its own fact field.
- Do not persist turn-level totals as the only source of truth. That hides which model produced which tokens.
- Do not sort derived turn rows by the first event in the turn if the user wants "latest first"; use the latest `llm_usage.timestamp` inside the grouped turn.

## Self Check

1. If a turn uses two models, which model should a one-line table show?
2. If Cache Write is not present in provider usage, should the UI display `cacheMissTokens` under that label?
3. Why is `sessionId + turnId` a view key rather than a replacement for `callId`?
