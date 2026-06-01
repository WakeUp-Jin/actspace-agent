## [2026-05-31 23:26] | Task: Cache Loss Audit Design

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 希望参考 Reasonix 的缓存设计，为 actspace-agent 设计一套缓存失效排查机制：低缓存时能在 session 中留下标记，并保存前后两次真实上下文供后续脚本分析。

### 🛠 Changes Overview

**Scope:** `docs`、`scripts`

**Key Actions:**

- **[Design]**: 新增 `agent-core/cache-loss-audit.md`，定义 `llm_usage` 轻量索引、旁路 `cache-audit/` 目录、滚动 `last.context.json` 与 hash 链 diff。
- **[Plan]**: 新增 active execution plan，拆分共享契约、运行时 `CacheAuditTracker`、session 标记和验证任务。
- **[Script]**: 新增 `scripts/analyze-cache-audit.mjs`，可扫描未来 audit 目录或直接对比 `previous/current` Context 快照。
- **[Runtime]**: 扩展 `LlmUsagePayload`，在主 Agent LLM 调用前后接入 `CacheAuditTracker`，低缓存时把 `cacheStatus/cacheAuditId/cacheHitRatio` 写入 `llm_usage.payload`。
- **[Sidecar Files]**: desktop main 将审计根目录配置为 `<userData>/cache-audit`；tracker 维护滚动 `last.context.json`，低缓存时固化 `summary.json`、`previous.context.json`、`current.context.json` 和 `diff.txt`。
- **[Tests]**: 新增 `observability/test/cache-audit.test.ts` 覆盖滚动快照与低缓存固化；扩展 `engine/test/bridge.test.ts` 覆盖 `llm_usage` 审计索引。

### 🧠 Design Intent (Why)

缓存失效排查需要真实证据，而不是只看方法调用或最终命中率。`session.jsonl` 保持轻量事实索引，完整上下文只在低缓存时旁路落盘，能兼顾后续可分析性、隐私风险和文件体积。

### 📁 Files Modified

- `docs/design-docs/agent-core/cache-loss-audit.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-core/current-module-map.md`
- `docs/design-docs/storage-and-observability.md`
- `docs/exec-plans/active/actspace-cache-loss-audit-plan.md`
- `scripts/analyze-cache-audit.mjs`
- `docs/learnings/2026-05/20260531-cache-audit-rolling-snapshot.md`
- `packages/shared/src/session.ts`
- `packages/agent-core/src/observability/cache-audit.ts`
- `packages/agent-core/src/engine/{types,loop,agent,bridge}.ts`
- `packages/agent-core/src/observability/test/cache-audit.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/main/agent-turn.ts`

### ✅ Verification

- `node --check scripts/analyze-cache-audit.mjs`
- `pnpm check:docs`
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core test -- src/observability/test/cache-audit.test.ts src/engine/test/bridge.test.ts`（Vitest 当前配置实际跑完 agent-core 全量 73 个测试文件 / 519 个测试）
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core build`
- `pnpm --filter @actspace/desktop typecheck`
