## [2026-06-10 10:30] | Task: Kairos prompt 缓存优化 + thinking 全链路 + contextWindow 动态化

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

### 📥 User Query

> Kairos 的缓存命中呈规律性"前缀断裂"（每个 tick 第 1 次调用只命中 640 token，命中率 ~14%）。要求：① system prompt 完全静态化，时间等易变内容移到 tick 消息；② 观测摘要一步到位做成增量；③ Kairos 支持思考模式，前端可显示，设置页开关控制；④ contextWindow 从模型配置读取（DeepSeek 1M / Kimi 256K）。先出设计文档与执行计划，确认后开始执行。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`（kairos 域）、`@actspace/desktop`（main + renderer）

**Key Actions:**

- **system prompt 静态化**: `prompt.ts` 模板删除时间/phase/briefs 数/观测摘要占位符，只保留 config tips / rule.md / 历史摘要三个低频占位符；`assembleSystemPrompt` 入参收敛为 `config + shortTermResult`，逐字节稳定可被 DeepSeek 前缀缓存复用。
- **tick message 动态尾部**: 新增 `assembleTickMessage`——`<tick>` 包裹的「当前时间（分钟粒度）/phase/活跃 briefs 数 + 观测增量 + 任务正文（brief tick）」；与 `kairos_tick_injected.payload.content` 同一字符串，发送 = 落盘 = 重放。dispatcher 的 auto tick content 改为空字符串。
- **观测增量化（计算/提交分离）**: `WatchDiffEngine.computeDiff/commitManifest` 拆分；`SessionsDigestBuilder.refresh` 只算不写、新增 `commitCursor`；inbox 新增已读水位（`observe/inbox-state.json`，消息块头 ISO 时间戳即游标）。三类游标统一由 runner 在 tick 正常闭合后提交；失败 tick 不提交、增量不丢。`getContextSnapshot` 只计算不提交，顺手修掉"打开上下文 Sheet 吃掉观测"的隐性 bug。
- **thinking 全链路**: `ThinkingPayload` 增加 `signature?`；runner 在 `message_end` 按现场块顺序落 `thinking* → assistant_message → tool_call*`（tool_call 改由消息内 toolCall 块产出，不再用 tool_start，消除 sequential 执行下的归属歧义）；`toLlmMessages` 同回合合并还原 `[thinking, text, toolCall*]` 块结构（含 signature）；`sanitizeOrphanToolPairs` 升级为块级清理。
- **前端展示**: `KairosRowKind` 增加 `"thinking"`，aggregator 折叠 thinking 行，KairosPage 增加思考行图标、「思考过程」详情 Tab，选择器新增 `findKairosThinkingText`；设置页已有的 thinking 三态开关直接生效。
- **contextWindow 动态化**: 新增 `resolveKairosContextWindow`（读 `MODEL_REGISTRY`），`createKairos` 删除 `32_000` 硬编码。
- **回归测试**: 新增 `replay-fidelity.test.ts`（现场请求与重放消息经 Anthropic 序列化后 deepEqual，signature 存活）、游标提交时序测试（成功提交/失败不提交）、inbox 水位过滤与提交回写测试、tick content 落盘=发送测试等。

### 🧠 Design Intent (Why)

DeepSeek 按 64-token 块匹配前缀缓存。原实现每 tick 重组 system prompt 且时间戳在第 ~640 token 处，导致每个 tick 第 1 次调用缓存必断（命中率 14%）。修复原则是「静态前缀 + 动态尾部」：上下文中越靠前的内容变化频率必须越低。同时，落盘事件必须能逐字节还原现场请求（含 thinking 块及其 signature），否则跨 tick 重放在分歧处照样断缓存——这是把"发送 = 落盘 = 重放"作为硬约束、并用序列化层 deepEqual 测试锁住的原因。观测增量化则保证 tick 消息只携带新信息，历史不膨胀且增量在失败 tick 后不丢失。

### 📁 Files Modified

- `packages/shared/src/session.ts`、`kairos-contracts.ts`、`kairos-aggregator.ts`、`test/...`
- `packages/agent-core/src/kairos/prompt.ts`、`prompt-assembler.ts`、`runner.ts`、`controller.ts`、`index.ts`
- `packages/agent-core/src/kairos/briefs/dispatcher.ts`、`context/watch-diff.ts`、`context/sessions-digest.ts`、`context/short-term.ts`、`inbox.ts`
- `packages/agent-core/src/kairos/test/`（prompt-assembler / runner / inbox / replay-fidelity / sessions-digest / dispatcher 测试）
- `packages/desktop/src/main/index.ts`、`kairos-bootstrap.ts`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`、`state/kairosSelectors.ts`
- `docs/design-docs/agent-kairos-autonomous-mode.md`（上下文构成同步）、`docs/exec-plans/active/kairos_prompt_cache_optimization.md`（进度与决策记录）

### ✅ 验证

- `pnpm -r typecheck` 全绿；agent-core 624 / desktop 327 / shared 31 测试全过。
- 剩余手工验收（见 plan M6）：真实跑 ≥4 个 tick 看 `llm_usage` 命中率 ≥85%、前端 thinking 行、Kimi contextWindow=256K。注意旧短期记忆 jsonl 为旧格式，建议清空后重跑。
