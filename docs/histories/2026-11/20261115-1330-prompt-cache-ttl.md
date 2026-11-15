## [2026-11-15 13:30] | Task: Anthropic 提示缓存时长按连接设置 + 1 小时写入计价

### 🤖 Execution Context

- **Agent ID**: `Claude Code 主会话`
- **Base Model**: `claude-opus-5-5`（调查与浏览器验收交给 Sonnet 子智能体）
- **Runtime**: `Claude Code CLI，git worktree fix/composer-narrow-layout`

### 📥 User Query

> 中转的缓存创建是不是可以通过参数控制？现在只有 5 分钟。（了解到只有 Chat 模式发 1 小时、没有设置项、1 小时写入没单独计价后）按你的建议来：每个连接设置缓存时长，压缩和子智能体也跟随，1 小时写入单独计价。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`packages/llm/{llm-service,llm-pi-ai}`、`packages/session/session-journal`、`packages/client/client`、`apps/desktop`（main settings / runtime-v2、renderer 设置与统计页）

**Key Actions:**

- `promptCacheMode` 增加 `long`：设置迁移读入、IPC guard、`ModelConnectionsService.update`（只对 Anthropic 协议生效，改协议时回到默认值）、`ConnectionView.promptCacheMode`。
- 连接详情「连接」分组新增「提示缓存」下拉（5 分钟 / 1 小时 / 关闭）与旁注「1 小时写入按输入价 2 倍计」。
- Desktop LLM adapter（`runtime-v2/llm-adapter.ts`）prepare：连接设置覆盖按模式的策略，`off → none`、`long → long`、`short → short`；没有连接设置（OpenRouter 内置连接）仍按模式。
- `LlmUsage.cacheWrite1hTokens`：direct 读 pi-ai `usage.cacheWrite1h`，proxy 读 `cache_creation.ephemeral_1h_input_tokens`；`calculateUsageCost` 把 1 小时部分按 `cacheWrite1hRate`（输入价 × 2，`@actspace/shared`）计；journal 辅助请求校验接受该字段；用量记录行带上，统计页费用明细拆两行。
- 规范：`agent-llm-core-pi.md` §16、`agent-multi-provider-llm.md`、`agent-model-catalog-and-usage-cost.md`、`front-设置页规范.md` §5.3。执行计划按 `PLANS_GUIDE.md`「计划完成时」在合入前删除，规则都已写进上面的规范。

### 🧠 Design Intent (Why)

- 中转支不支持 `ttl`、愿不愿意多付写入费，都是按连接决定的，所以设置放在连接上；同一连接的所有请求共享前缀缓存，压缩和子 Agent 跟随才不会互相打断。
- 1 小时写入贵 60%（2 倍 vs 1.25 倍），不拆桶费用会算少。
- 行为变化：已有 Anthropic 连接存的是 `short`，以前 Chat 模式会自动用 1 小时，现在一律按连接设置。

### ✅ Verification

- `pnpm typecheck`、desktop 全量（2987）、client、session-journal、web、llm-service、llm-pi-ai 单测通过；`check:frontend-tokens`、`check:docs`、`check:current-docs` 通过。
- 浏览器 renderer 由 Sonnet 子智能体在 1200 / 560 浅色和 1200 深色验收通过（对齐、无溢出、DeepSeek 不出现）；Electron 与真实中转请求未验。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：Electron 实机；真实中转选 1 小时后请求体是否带 `"ttl":"1h"`、中转面板是否显示 1h 缓存创建（中转丢掉 `ttl` 字段则仍按 5 分钟）；统计页悬停费用出现「缓存写入（1 小时）」一行。
- **遗留**：新建连接向导不带缓存选项（默认 5 分钟，建好后在详情改）；OpenRouter 内置连接没有连接级缓存设置，仍按模式策略；历史记录不重算费用。

### 📁 Files Modified

- `packages/util/shared/src/{settings,model-connections,model-pricing}.ts`、`ipc/usage.ts`
- `apps/desktop/src/main/settings/{custom-connection,migrations}.ts`、`ipc/guards.ts`、`model-connections-service.ts`、`runtime-v2/llm-adapter.ts`
- `apps/desktop/src/renderer/components/settings/models/ConnectionDetailPage.tsx`、`components/usage/usage-stats-model.ts`、`mock/model-connections-fixture.ts`
- `packages/llm/llm-service/src/{usage,usage-cost}.ts`、`packages/llm/llm-pi-ai/src/{pi-ai-stream,legacy-proxy-wire-engine}.ts`
- `packages/session/session-journal/src/auxiliary-codec.ts`、`packages/client/client/src/sessions/chat.ts`
- 测试：`custom-connection-protocol`、`ipc-guards`、`model-connections-service`、`model-settings`、`usage-statistics-page`、`usage-cost`、`pi-ai-reasoning`、`legacy-proxy-wire-engine`、`auxiliary-requests`
