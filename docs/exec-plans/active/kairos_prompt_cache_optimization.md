# Kairos Prompt 缓存优化 + Thinking 全链路执行计划

## 目标

把 Kairos 的上下文重构为「静态前缀 + 动态尾部」：system prompt 只含低频内容，时间与观测增量移入每 tick 注入的 user message 并落盘；短期记忆重放与现场发送逐字节一致（含 thinking）；contextWindow 从模型注册表读取；前端可展示 Kairos thinking。最终让跨 tick 缓存命中率从 ~14% 提升到 ~90%+。

## 范围

- 包含：
  - system prompt 模板与组装重构（删时间/观测段，history_summary 保留为末段）。
  - tick message 组装：时间头（分钟粒度）+ 观测增量 + 触发正文，整体落盘到 `kairos_tick_injected.payload.content`。
  - 观测增量化：sessions digest 只输出未读、inbox 增加已读水位、watch diff 保持增量语义；游标统一在 tick 正常闭合后提交。
  - thinking 落盘（含 signature）、短期记忆同 turn 合并重放、前端 Kairos 面板展示 thinking 行。
  - `createKairos` 的 `contextWindow` 改为读 `MODEL_REGISTRY`。
- 不包含：
  - Kairos 压缩接线（`compressKairosSegments` 仍保持未调用，单独立 plan）。
  - 主会话（非 Kairos）的缓存优化。
  - 设置页新增 UI（thinking 三态开关已存在）。
  - 历史已落盘的旧 jsonl 迁移（开发阶段，旧短期记忆文件可直接清空）。

## 背景

- 必读文档：
  - `docs/design-docs/agent-kairos-prompt-cache-optimization.md`（本计划的设计事实来源）
  - `docs/design-docs/agent-kairos-autonomous-mode.md`
  - `docs/learnings/2026-06/event-replay-must-preserve-block-order.md`（重放保真原则）
- 相关代码路径：
  - `packages/agent-core/src/kairos/prompt.ts`、`prompt-assembler.ts`、`runner.ts`、`controller.ts`
  - `packages/agent-core/src/kairos/briefs/dispatcher.ts`
  - `packages/agent-core/src/kairos/context/short-term.ts`、`sessions-digest.ts`
  - `packages/agent-core/src/kairos/inbox.ts`、`env.ts`
  - `packages/shared/src/session.ts`（`ThinkingPayload`）、`kairos-contracts.ts`、`kairos-aggregator.ts`
  - `packages/desktop/src/main/index.ts`（`createKairos` 调用点，硬编码 `contextWindow: 32_000`）
  - `packages/desktop/src/renderer/state/kairosSelectors.ts`、`components/right-panel/KairosRightPanelView.tsx`
- 已知约束：
  - DeepSeek Anthropic 兼容端要求 assistant 消息块顺序 `[thinking, text, ...toolCalls]`，`tool_use` 必须为末尾块。
  - `anthropic-convert.ts` 仅在 thinking 块带 `signature` 时才回发给 API。
  - 发送 = 落盘 = 重放：tick content 与重放消息结构必须与现场逐字节一致。
  - `MODEL_REGISTRY` contextWindow：deepseek-v4-flash / v4-pro = 1_000_000，kimi-k2.6 = 256_000。

## 风险

- 风险：观测增量化后某次 tick 失败导致增量"已展示但未处理"。
  - 缓解：游标只在 tick 正常闭合后提交；失败 tick 不推进，下个 tick 重新看到同批增量。
- 风险：重放合并逻辑与现场组装产生新的结构分歧（如多 toolCall 顺序、空 text）。
  - 缓解：单测直接断言「重放消息数组 deepEqual 现场组装数组」，用同一份事件流双向验证。
- 风险：contextWindow 放大到 1M 后，短期记忆加载预算（75%）过大，单 tick 请求体积失控。
  - 缓解：加载预算受当日事件量自然约束；观测增量化同时减少每 tick 注入量。上线后用 `llm_usage` 观测 promptTokens 走势，必要时在 config schema 调低 `loadBudgetRatio`。
- 风险：thinking 落盘增加 jsonl 体积。
  - 缓解：thinking 只落 Kairos 短期记忆（不进主会话 session.jsonl）；后续压缩接线后会被摘要替换。

## 里程碑

### M1 契约与地基（先行，其余任务依赖）

1. `packages/shared/src/session.ts`：`ThinkingPayload` 增加可选 `signature?: string`。
   - 验证：`pnpm --filter @actspace/shared build` 通过；全仓 `tsc` 无新错误。
2. `packages/shared/src/kairos-contracts.ts`：`KairosRowKind` 增加 `"thinking"`。
   - 验证：同上。
3. `packages/desktop/src/main/index.ts`：`createKairos({ contextWindow })` 改为 `resolveKairosModelSpec(resolvedModelId).contextWindow`，删除 `32_000` 字面量。
   - 验证：`pnpm --filter @actspace/desktop test -- kairos` 通过；启动日志打印的 contextWindow 与所选模型一致。

### M2 system prompt 静态化 + tick message 动态尾部

4. `packages/agent-core/src/kairos/prompt.ts`：模板删除 `[当前时间] {current_time}（{current_phase}）`、`[活跃 briefs]` 与 `{observation_summary}` 段；保留 `{config_tips_block}`、`{user_rules}`、`{history_summary}`（history 为最末段）。在模板注释中写明「动态内容禁止进入本模板」。
5. `packages/agent-core/src/kairos/prompt-assembler.ts`：
   - `assembleSystemPrompt` 移除 `now`、`watchDiffs`、`sessionsDigest`、`inboxSummary`、`activeBriefsCount` 入参，只接 `config` + `shortTermResult`。
   - 新增 `assembleTickMessage(input)`：输入 `{ now, phase, activeBriefsCount, observationDelta, triggerContent }`，输出 tick message 全文；时间格式 `YYYY-MM-DD HH:mm`（分钟粒度）。
   - 观测格式化函数（`buildObservationSummary` 等）改造为"增量渲染"：空增量的节直接省略，全部为空时输出一行「自上个 tick 无新观测」。
6. `packages/agent-core/src/kairos/runner.ts`：
   - `processTick` 用 `assembleTickMessage` 生成完整 tick content；`kairos_tick_injected.payload.content` 与发送给 LLM 的 `tickUserMsg.content` 为同一字符串。
   - 验证（M2 整体）：`packages/agent-core/src/kairos/test/` 下 runner / prompt-assembler 单测更新后通过；新增断言「落盘 content === 发送 content」。

### M3 观测增量化与游标提交

7. `packages/agent-core/src/kairos/context/sessions-digest.ts`：拆分「计算 digest」与「提交 lastSeenTurnId」。计算阶段只读 state.json 不写；新增 `commitCursor()` 由 controller 在 tick 正常闭合后调用。digest 输出只含 `unreadTurnsForKairos > 0` 的 session。
8. `packages/agent-core/src/kairos/inbox.ts`：`loadKairosInboxSummary` 增加 `readCursor?: Record<KairosInboxSource, string>` 入参，只返回消息块头时间戳晚于水位的块；返回值带 `latestTimestamps`（每来源最新消息时间戳）供提交。
9. `packages/agent-core/src/kairos/controller.ts`：
   - 把 inbox 已读水位并入 sessions-digest 同一个 `memory/state.json`（字段 `inboxReadCursor`），读写复用现有 state 读写函数。
   - tick 正常闭合（`processTick` 无异常返回）后依次提交 sessions 游标与 inbox 水位；异常路径不提交。
   - 验证（M3 整体）：新增单测覆盖「tick 失败 → 游标不动 → 下个 tick 重见同批增量」与「tick 成功 → 游标推进 → 下个 tick 增量为空」。

### M4 Thinking 落盘与重放保真

10. `packages/agent-core/src/kairos/runner.ts`：`agentEventToSessionEvents` 在 `message_end` 时抽取 assistant 消息的 thinking 块，落 `thinking` 事件（`payload: { content, signature? }`），顺序在同 turn 的 `assistant_message` / `tool_call` 事件之前。
11. `packages/agent-core/src/kairos/context/short-term.ts`：
    - `toLlmMessages` 重写为「同 turn 合并」：同一 `turnId` 内连续的 `thinking` → `assistant_message` → `tool_call`(可多条) 事件折叠为一条 assistant 消息，块顺序 `[thinking, text, ...toolCalls]`；thinking 块还原 `signature`。
    - `tool_result` 仍独立成 `ToolResultMessage`；`sanitizeOrphanToolPairs` 行为保持。
    - 验证：核心单测——用 runner 现场组装路径与 short-term 重放路径处理同一事件流，断言两侧 `Message[]` 结构 deepEqual（thinking 开/关各一组）。

### M5 前端 thinking 展示

12. `packages/shared/src/kairos-aggregator.ts`：`aggregateKairosEvents` 把 `thinking` 事件折叠为 `kind: "thinking"` 行，summary 取内容首行截断 80 字符。
13. `packages/desktop/src/renderer/state/kairosSelectors.ts`：`kairosKindLabel` 增加 thinking 文案（「思考」）。
14. `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx` 与 Kairos 事件表：thinking 行弱化展示（沿用 `text-text-faint` 等主题 token，禁止字面量颜色，遵守 `docs/design-docs/front-主题与配色规范.md`）；点击行右侧详情可见全文。
    - 验证：`pnpm --filter @actspace/desktop test` 通过；按 `docs/FRONTEND_VERIFICATION.md` 浅/深双主题各截图一次。

### M6 端到端验证与收尾

15. `pnpm dev:log` 启动，开启 Kairos 跑 ≥4 个 tick（thinking 开启），然后：
    - 脚本聚合 `<kairosRoot>/memory/short-term/*.jsonl` 的 `llm_usage`，确认跨 tick 第 1 次调用不再出现 `hit=640` 模式，命中率 ≥85%；
    - 前端 Kairos 面板可见 thinking 行；
    - 切换 Kimi 模型确认 contextWindow 日志为 256K。
16. 文档同步：更新 `docs/design-docs/agent-kairos-autonomous-mode.md` 的 prompt 结构描述；按 `docs/HISTORY_GUIDE.md` 写 history；本 plan 移入 `docs/exec-plans/completed/`。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/shared build && pnpm typecheck`（若无该脚本则 `pnpm -r exec tsc --noEmit`）
- 手工检查：M6 的端到端步骤（tick 命中率、thinking 展示、contextWindow 日志）。
- 观测检查：`llm_usage` 聚合脚本输出 before/after 对比，记录进 history。

## 进度记录

- [x] M1：契约与地基（ThinkingPayload.signature / KairosRowKind / contextWindow 接注册表）。
- [x] M2：system prompt 静态化 + tick message 动态尾部。
- [x] M3：观测增量化与游标提交。
- [x] M4：thinking 落盘与同 turn 合并重放。
- [x] M5：前端 thinking 展示。
- [ ] M6：自动化验证全绿（typecheck + agent-core 624 / desktop 327 / shared 31）；
      **剩余手工验收**：`pnpm dev:log` 启动后跑 ≥4 个 tick，确认 `llm_usage` 命中率 ≥85%、
      前端 thinking 行可见、切 Kimi 后 contextWindow=256K。验收通过后本 plan 移入 completed。

## 决策记录

- 2026-06-10：观测增量化一步到位（不做"先全量进 tick message"的过渡态），用户决策；代价是 M3 涉及游标提交时序重构。
- 2026-06-10：history_summary 保留在 system prompt 末段——它只在压缩产出新摘要时变化，跟随压缩断点不产生额外缓存损失。
- 2026-06-10：thinking 必须落盘并带 signature，否则 anthropic-convert 不会回发 thinking 块，重放即残缺；体积问题靠"只落 Kairos 短期记忆 + 未来压缩摘要替换"消化。
- 2026-06-10：开发阶段不迁移旧短期记忆 jsonl，直接清空重跑。
- 2026-06-10（实现偏差）：inbox 已读水位落独立文件 `observe/inbox-state.json`，**不**并入 sessions 的 state 文件（原计划写 `memory/state.json`，实际 sessions 游标在 `observe/sessions-state.json`；分文件归属清晰、避免两个模块对同一文件做读改写竞争）。
- 2026-06-10（实现偏差）：`tool_call` 事件改由 `message_end` 的 toolCall 块产出（原先来自 `tool_start`）。sequential 执行下 tool_start 与 tool_result 交错，重放时无法无歧义还原"同一次 LLM 回复"的归属；从 message_end 块产出后，落盘顺序天然等于现场块顺序 `[thinking*, text?, toolCall*]`。
- 2026-06-10（实现偏差）：同回合合并**不**按 turnId 分组（整个 tick 共享一个 turnId，无法区分多次 LLM 调用），改为按事件序列结构折叠：连续的 `thinking* / assistant_message? / tool_call*` 段为一条 assistant 消息，`tool_result`/`user_message` 断开分组。
- 2026-06-10（实现偏差）：游标提交点放在 `runner.processTick` 成功路径末尾（通过 `observeRefresh` 返回的 commit 闭包 + `commitInboxCursor` 回调注入），而非 controller 外层——runner 自身最清楚"tick 正常闭合"。
- 2026-06-10（顺手修复）：`getContextSnapshot` 改为只计算不提交后，修掉了"打开上下文 Sheet 会推进 watch manifest / sessions 游标、吃掉观测增量"的隐性 bug。
- 2026-06-10（实现偏差）：dispatcher 的 auto tick content 改为空字符串（原 `<tick>ts</tick>`），时间戳由 `assembleTickMessage` 统一渲染，避免双重时间噪音。
