## [2026-05-30 10:57] | Task: 修 Usage 语义 + 上下文缓存稳定性排序 + 配置驱动主题化 Context 弹窗

### 🤖 Execution Context

- **Agent ID**: `本地会话`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor IDE`

### 📥 User Query

> 1) Usage 有 bug：DeepSeek（Anthropic 格式）下「缓存 > 总计」「缓存未命中 ≠ 输入 − 命中」，且要去掉 4 张卡上的英文副标题（direct prompt / assistant reply / cache read / reasoning）。
> 2) 加强缓存机制：借鉴 reasonix「不易变的放前面、常变的放后面」，给上下文管理类加一个稳定性数值属性（100 不变 ~ 10 常变），最终组装 message 时按此排序，提高 DeepSeek prefix-cache 命中率。
> 3) 完成前端 Context 弹窗：配置驱动（新增上下文类型不改组件代码，「改配置不改代码」），点击进度条某一段高亮下方对应片段。
> 追加：ContextPopup 必须随主题翻转（浅色主题浅弹层、深色主题深弹层），不要做成恒定深色。

### 🛠 Changes Overview

**Scope:** `@actspace/agent-core`、`@actspace/shared`、`@actspace/desktop`、`docs/`

**Key Actions:**

- **任务1 Usage 语义修复**: `anthropicUsageToUsage` 把 Anthropic 的 `input_tokens`（仅未命中新输入）与 `cache_read` / `cache_creation` 合成完整 prompt，恢复不变量 `promptTokens = cacheHit + cacheMiss`、`total = prompt + output`；`UsageStatisticsPage` 去掉 4 张 BreakdownCard 的英文副标题；补/改测试（含用户上报高缓存场景 + 同步 deepseek-anthropic-service 总计断言）。
- **任务2 缓存稳定性排序**: 新增 `CACHE_STABILITY`（IMMUTABLE 100 / STABLE 70 / SEMI 40 / VOLATILE 10），`PromptSegment` 与 `SystemPart` 增 `stability` 字段；`SystemPromptContext.getPrompt()` 排序键改为「stability → priority → id」，`ContextManager.buildSystemPrompt()` 收集后按 stability 稳定排序；补排序/工具顺序守护测试；同步 `token-usage-and-context-state.md`。
- **任务3 配置驱动 + 主题化 Context 弹窗**: 新增共享 `context-buckets.ts` 注册表（`CONTEXT_BUCKET_REGISTRY` + 派生 `ContextUsageBucketName` + `getContextBucketDisplay` 兜底）；后端 `createEmptyBuckets` 与兼容层 `context.ts` 都改为遍历注册表；`tokens.css` 新增 `--act-context-*`（浅/深各一套 + 兜底）；`ContextPopup` 删除写死的 `colorByBucket`，外壳改主题语义 token，移除 footer，新增 meter 段 ↔ bucket 行双向点击交叉高亮（默认不选中，再次点击取消）；补 shared + desktop 测试。
- **规范同步**: 按用户要求把 `主题与配色规范.md` 里「ContextPopup 恒定深色」豁免删除，明确它是主题感知浮层。

### 🧠 Design Intent (Why)

- Anthropic 与 OpenAI 的 token 语义不同：Anthropic `input_tokens` 不含缓存部分，直接当成完整 prompt 会让「缓存 > 总计」。在转换层一次性对齐全局 OpenAI 式不变量，下游统计/成本无需各自打补丁。
- 缓存命中依赖请求前缀字节级稳定。用显式 `stability` 把「最不易变内容稳定排前缀」与既有 `priority`（展示/重要度）解耦，确定性排序（带 id/index tie-break）避免前缀漂移。
- bucket 用单一注册表做事实来源，新增上下文类型只加一行配置 + 一对主题 token，组件零改动；未知 key 走兜底不崩，落实「改配置不改代码」。

### 📁 Files Modified

- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/test/anthropic-convert.test.ts`
- `packages/agent-core/src/llm/test/deepseek-anthropic-service.test.ts`
- `packages/agent-core/src/context/types.ts`
- `packages/agent-core/src/context/modules/system-prompt.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/context/test/system-prompt.test.ts`
- `packages/agent-core/src/context/test/manager.test.ts`
- `packages/shared/src/context-buckets.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/test/context-buckets.test.ts`
- `packages/desktop/src/renderer/components/ContextPopup.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/test/context-popup.test.tsx`
- `docs/design-docs/agent-token-usage-and-context-state.md`
- `docs/design-docs/front-主题与配色规范.md`
- `docs/exec-plans/active/20260530-context-cache-and-usage/*`

### 🔁 Follow-up（同日 11:21·桶集合贴合实际 + 摘要单独成桶）

**Key Actions:**

- 注册表 `CONTEXT_BUCKET_REGISTRY` 移除尚未落地的 `mcp` / `subagents`，新增 `summarizedConversation`（label「Summarized conversation」，`--act-context-summarized` 粉色，置于 skills 与 conversation 之间），桶数 7 → 6。
- `tokens.css` 删除 `--act-context-mcp` / `--act-context-subagents`，新增 `--act-context-summarized`（浅 `#db4a86` / 深 `#ff6fa3`，三处主题块各一套）。
- `ContextManager.getUsageSnapshot()` 把会话消息按 `role:"user" && source:"compaction"` 拆出压缩摘要计入 `summarizedConversation`，其余计入 `conversation`；`SnapshotInput` / `createContextUsageSnapshot` 增 `summarizedConversationTokens` 并计入 total。
- `ContextStateEntry.kind` 与 bucket 现实对齐（去掉 `mcp` / `subagentDefinitions`，加 `summarizedConversation`），`bridge.ts` 删除已失效的 `subagents → subagentDefinitions` 映射分支。
- `workbenchFixture` mock 桶同步；`context-buckets.test.ts` 键集合改为 6 桶；`manager.test.ts` 新增「压缩摘要进 summarizedConversation、不再有 mcp/subagents」守护测试。
- 浏览器 mock 双主题复验：浅色白底 / 深色深底，弹窗均正确显示 6 桶且粉色 Summarized conversation 到位。

**说明（非 bug 澄清）:** Context 弹窗里 `System prompt = 0` 是真实值——`MAIN_AGENT_SYSTEM_PROMPT` 当前是空占位串；`rules / skills` 暂未喂数据也恒为 0。后端 snapshot 只填 `systemPrompt / tools / conversation(+summarized)`，其余桶有展示位但无数据源。压缩后上下文顺序为「系统提示词 → 压缩摘要(messages[0]) → 保留的近期历史 → 最新用户输入」，由 `conversation.applyCompaction` 的 `[summary, ...slice(split)]` 保证。

**Files Modified（follow-up）:**

- `packages/shared/src/context-buckets.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/test/context-buckets.test.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/test/manager.test.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/test/context-popup.test.tsx`
- `docs/design-docs/agent-token-usage-and-context-state.md`

### 🔁 Follow-up（同日 11:55·进度可视化口径修正）

对照 Cursor 的 Context 显示，修掉三处「占比/进度」表现 bug：

- **meter 进度条撑满**: `ContextPopup` 段宽分母从「已用总量 totalTokens」改为「总容量 maxTokens」，未用部分露出灰色轨道（轨道色从几乎不可见的 `surface-subtle` 换成 `--act-color-border-strong`）。此前 2,190/1,000,000 也会撑满整条，现在只占 ~0.2%。
- **底部蓝色环恒为半蓝**: `Composer` 的 `STATUS_USAGE_DOT` 原是 `border-r/t-brand-strong` 写死的静态环（永远亮上+右两段≈50%）。改为 `conic-gradient(brand-strong ${pct}%, border-strong ${pct}%)` + radial mask 的真实环形进度，0% 时全灰、36% 时蓝色占 36%。
- **「0% Full」误解**: 有内容但占比 < 1% 时，popup 与 composer 都显示「<1%」而非「0%」（1,000,000 上下文窗口下 2,190 token 确实约 0.2%，属真实值，仅改展示口径）。

**验证:** desktop typecheck 通过；测试 149 passed（含新增「<1% Full + meter 段宽相对 maxTokens」守护用例）；浏览器 mock 复验：meter 36% 着色 + 灰轨道，底部环 `conic-gradient(rgb(31,95,232) 36%, rgb(200,209,220) 36%)` 实测 36% 蓝弧。

**Files Modified（follow-up 2）:**

- `packages/desktop/src/renderer/components/ContextPopup.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/context-popup.test.tsx`
