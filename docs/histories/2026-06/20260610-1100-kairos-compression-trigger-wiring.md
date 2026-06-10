## [2026-06-10 11:00] | Task: Kairos 短期记忆压缩接线（compressKairosSegments 触发链路）

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

### 📥 User Query

> 上下文压缩未完全接入：Kairos 的 `compressKairosSegments` 仍未调用，压缩策略只走了一半。判断一下是否接入、逻辑是否正确；没有接入的话开始接入。

### 🛠 Changes Overview

**Scope:** `@actspace/agent-core`（kairos 域）

**Key Actions:**

- **排查结论**: `compressKairosSegments` 确实未接入——只有函数本体 + 单测 + index 导出，运行时零调用。另发现隐藏 bug：`KairosShortTermMemoryContext.estimateTokens()` 复用 `load()` 的结果，而 load 受 budget（75%）截断，永远达不到 85% 压缩阈值，即使有人调用也永不触发。
- **estimateDiskTokens**: `context/short-term.ts` 删除旧 `estimateTokens()`，新增全量磁盘估算——不受 load budget 截断、用 `loadDailyAll`（含 reset_today 切出的 _NNN 段）、covered 日期只算 summary（去重）。
- **KairosCompressionTrigger**（新建 `compression/trigger.ts`）: tick 闭合后判定 `diskTokens >= contextWindow × compressionThreshold`；候选取「前天往前」未被 summary 覆盖的日期，旧到新最多 7 天且限同一自然月（summary 落首日所在月目录，覆盖判定只查日期所在月目录，跨月批次会导致重复加载）；调 `compressKairosSegments(kind:"week")` 生成 `week_MM-DD_to_MM-DD.summary.md`；成功后写一条 `context_compaction` 事件留痕（`toLlmMessages` 跳过该类型，不进 LLM 上下文）。in-flight 互斥、失败仅 warning 不抛错。
- **controller 接线**: 装配 trigger（阈值经闭包读 config，reload 自动生效；abortController 透传支持 shutdown 中断），在 scheduler `onSleepStart` 里 fire-and-forget 调 `maybeCompressInBackground()`，不阻塞调度循环。
- **compressor**: `CompressKairosSegmentsInput` 增加可选 `signal`，透传给 `llm.complete`。
- **测试**: 新增 `compression/test/trigger.test.ts` 7 例——低于阈值跳过、压缩成功（summary 文件 + compaction 事件 + 二轮不再触发 + load 走 summary）、仅今昨数据时 warning 跳过、同月截断、maxDatesPerBatch、后台模式吞错；以及 `estimateDiskTokens` 不受 budget 截断的对照测试。全量 631 测试 + typecheck 通过。

### 🧠 Design Intent (Why)

调用策略沿用既有设计（design doc §压缩触发 + kairos_short_term_memory plan 的风险缓解条款）：压缩是非关键路径，必须异步发起、失败可跳过，不能把 Kairos 卡死。接线点选 `onSleepStart` 而非 runner 内部——tick 已闭合、进入睡眠期，是后台压缩的天然窗口。V1 范围裁剪：不做 intra-day fallback（单日 tick 量有限，几乎不可能单日写满阈值 token），真触达时仅 warning。已知小缺口：压缩 LLM 调用不经过 eventSink 的 `llm_usage` 流，token 消耗暂不计入用量统计与额度扣减（频率极低、单次成本小），已记录在设计文档。

### 📁 Files Modified

- `packages/agent-core/src/kairos/context/short-term.ts`（estimateTokens → estimateDiskTokens）
- `packages/agent-core/src/kairos/compression/compressor.ts`（signal 透传）
- `packages/agent-core/src/kairos/compression/trigger.ts`（新建）
- `packages/agent-core/src/kairos/compression/test/trigger.test.ts`（新建）
- `packages/agent-core/src/kairos/storage/short-memory-store.ts`（导出 `toIsoDate`）
- `packages/agent-core/src/kairos/controller.ts`（装配 + onSleepStart 接线）
- `packages/agent-core/src/kairos/index.ts`（导出 trigger）
- `docs/design-docs/agent-kairos-autonomous-mode.md`（压缩触发章节按实现重写）
- `docs/QUALITY_SCORE.md`（短板条目更新）

### ✅ Verification

- `pnpm --filter @actspace/agent-core test`：631 passed（含 trigger 7 例新测试）
- `pnpm --filter @actspace/agent-core typecheck`：通过
