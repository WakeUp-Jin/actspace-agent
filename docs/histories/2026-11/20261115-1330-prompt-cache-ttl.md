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
- `LegacyLlmAdapter` prepare：连接设置覆盖按模式的策略，`off → none`、`long → long`、`short → short`；没有连接设置（OpenRouter 内置连接）仍按模式。
- `LlmUsage.cacheWrite1hTokens`：direct 读 pi-ai `usage.cacheWrite1h`，proxy 读 `cache_creation.ephemeral_1h_input_tokens`；`calculateUsageCost` 把 1 小时部分按 `cacheWrite1hRate`（输入价 × 2，`@actspace/shared`）计；journal 辅助请求校验接受该字段；用量记录行带上，统计页费用明细拆两行。
- 规范：`agent-llm-core-pi.md` §16、`agent-multi-provider-llm.md`、`agent-model-catalog-and-usage-cost.md`、`front-设置页规范.md` §5.3；计划 `exec-plans/completed/20261115-prompt-cache-ttl.md`，执行文档 `exec-runs/20261115-prompt-cache-ttl/`。

### 🧠 Design Intent (Why)

- 中转支不支持 `ttl`、愿不愿意多付写入费，都是按连接决定的，所以设置放在连接上；同一连接的所有请求共享前缀缓存，压缩和子 Agent 跟随才不会互相打断。
- 1 小时写入贵 60%（2 倍 vs 1.25 倍），不拆桶费用会算少。
- 行为变化：已有 Anthropic 连接存的是 `short`，以前 Chat 模式会自动用 1 小时，现在一律按连接设置。

### ✅ Verification

- `pnpm typecheck`、desktop 全量（2987）、client、session-journal、web、llm-service、llm-pi-ai 单测通过；`check:frontend-tokens`、`check:docs`、`check:current-docs` 通过。
- 浏览器 renderer 由 Sonnet 子智能体在 1200 / 560 浅色和 1200 深色验收通过（对齐、无溢出、DeepSeek 不出现）；Electron 与真实中转请求未验。

### 📁 Files Modified

- 见执行摘要「核心变更清单」。
