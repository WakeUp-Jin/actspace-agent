## [2026-05-27 20:15] | Task: 落地 Kairos 短期记忆 + ring buffer + LLM 压缩

### 🤖 Execution Context

- **Agent ID**: cursor-agent / actspace-agent workspace
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE / pnpm 10.33

### 📥 User Query

> 一个一个执行（执行 `docs/exec-plans/active/kairos_short_term_memory.md`）

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **ShortMemoryStore**：移植自 heartclaw `short_memory_store.py`，行格式从 dict 改为 SessionEvent。提供 appendEvent / rotateDaily / loadDaily / loadDailyAll / listAllDates / listSummaries / saveSummary / readSummary / isCoveredBySummary / findCoveringSummary。reset_today 后递增 `_NNN` 段，loadDaily 只读最新段、compression 才走 loadDailyAll。所有 IO 容错——JSONL 单行损坏静默跳过，ENOENT 返回空数组。
- **SessionEventRingBuffer**：200 条循环缓冲，给 KairosPage 提供"最近事件"快速 tail；纯内存、单线程、零依赖；返回数组与内部状态隔离。
- **KairosShortTermMemoryContext.load()**：按 heartclaw 算法两阶段加载——先用 week/month summary 覆盖老日子，再加载未覆盖日子的原始 jsonl，最后单独读年摘要。loadBudgetRatio 默认 0.75；超出 budget 即停。返回结构包含 messages / summarySegments / loadedTokenEstimate。
- **SessionEvent → Message 翻译**：`toLlmMessages` 把 6 类事件翻译为 actspace `Message` 联合（user/assistant/toolResult），thinking 与 usage 跳过。
- **sanitizeOrphanToolPairs**：扔掉孤儿 tool_call / tool_result（无配对），保证 LLM API 不因配对失衡 400。
- **compressKairosSegments + prompts**：把 SessionEvent[] 序列化为 JSONL 注入 user prompt，LLMService.complete 返回 markdown；4 类 kind（week/month/year/intra_day）共用系统 prompt，仅"任务头"不同。失败直接 throw，由 plan 5 controller 包成 warning。
- **20 个单测**：6 store / 6 ring-buffer / 6 short-term context（含 budget 限制场景）/ 2 compressor。

### 🧠 Design Intent (Why)

- **延续 heartclaw 的"日级 + 段"布局**：日级粒度便于按日清空（reset_today）和压缩；月度文件夹便于"按月归档"；周/月/年三级摘要让 token budget 可控。这套方案在 heartclaw 经过验证，不必重新发明。
- **行格式直接用 SessionEvent**：避免任何"内部 dict"再 adapter 转换的成本；与 plan 1 shared 契约一致；前端 aggregator 可同源消费。
- **sanitize on load 而不是 sanitize on write**：写入时 KairosController 已经保证配对完整；磁盘上偶发的不配对（崩溃/手改）由 load 阶段兜底；与"先信任后审计"语义一致。
- **compressor 不内部 catch**：plan 5 controller 把 compression 当"非关键路径"异步触发，错误处理放在 controller 层更合适，本层保持纯函数 + raise。
- **ring buffer 与 store 解耦**：内存层只服务 UI "近 200 条 tail"快速查询；store 是磁盘单一真相源。这两层切断耦合让 UI 渲染与 IO 互不阻塞。

### 📁 Files Modified

- `packages/agent-core/src/kairos/storage/short-memory-store.ts`（新增，~260 行）
- `packages/agent-core/src/kairos/storage/ring-buffer.ts`（新增）
- `packages/agent-core/src/kairos/context/short-term.ts`（新增，含 toLlmMessages + sanitizeOrphanToolPairs）
- `packages/agent-core/src/kairos/compression/{compressor,prompts}.ts`（新增）
- `packages/agent-core/src/kairos/storage/test/{short-memory-store,ring-buffer}.test.ts`（新增 12 单测）
- `packages/agent-core/src/kairos/context/test/short-term.test.ts`（新增 6 单测）
- `packages/agent-core/src/kairos/compression/test/compressor.test.ts`（新增 2 单测）
- `docs/design-docs/agent-kairos-autonomous-mode.md`（plan 完成清单更新）

### ✅ 验证结果

- `pnpm --filter @actspace/agent-core typecheck` ✅
- `pnpm --filter @actspace/agent-core test` ✅ **322/322 passed**（新增 20 测试；plan 1+2 共 39+11 全部保留）
- `pnpm typecheck`（整仓） ✅ shared / agent-core / desktop 全过
- `ReadLints` ✅ 关键文件无错
