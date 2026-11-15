# Anthropic 提示缓存时长按连接设置 + 1 小时写入计价

## 目标

Anthropic Messages 连接可以在设置里选提示缓存「5 分钟 / 1 小时 / 关闭」，对这个连接的所有请求（主会话、子 Agent、压缩、自动审批、轻量任务）生效；1 小时缓存写入按基础输入价 2 倍单独计价，费用不再算少。

## 范围

- 包含：
  - 设置类型 `promptCacheMode: "short" | "long" | "off"`，迁移读入 `long`；协议切换时回到新协议默认值。
  - `ConnectionView.promptCacheMode`（仅 Anthropic 协议）、`ConnectionUpdateInput.promptCacheMode`、IPC guard、`ModelConnectionsService.update`。
  - 连接详情「连接」分组新增「提示缓存」下拉。
  - `LegacyLlmAdapter` prepare：连接设置覆盖模式策略。
  - `LlmUsage.cacheWrite1hTokens`：direct（pi-ai `usage.cacheWrite1h`）与 proxy（`cache_creation.ephemeral_1h_input_tokens`）两条线都读；`calculateUsageCost` 拆桶；journal 辅助请求校验接受该字段。
  - 用量记录行 `UsageActivityTokens.cacheWrite1hTokens`，统计页费用明细拆「缓存写入 5 分钟 / 1 小时」。
- 不包含：
  - 新建连接向导里的缓存选项（建好后在详情改）。
  - OpenRouter 内置连接（没有连接级设置，仍按模式策略）。
  - 历史记录重算费用（费用在请求结束时写入日志）。

## 背景

- 规范：`agent-llm-core-pi.md` §16、`agent-multi-provider-llm.md`（自定义 Anthropic 连接）、`agent-model-catalog-and-usage-cost.md`（计费桶）、`front-设置页规范.md` §5.3。
- 代码：`packages/util/shared/src/settings.ts`、`model-connections.ts`；`apps/desktop/src/main/settings/{custom-connection,migrations}.ts`、`model-connections-service.ts`、`ipc/guards.ts`、`runtime-v2/legacy-llm-adapter.ts`；`packages/llm/llm-pi-ai/src/{pi-ai-stream,legacy-proxy-wire-engine}.ts`；`packages/llm/llm-service/src/{usage,usage-cost}.ts`；`packages/session/session-journal/src/auxiliary-codec.ts`；`packages/client/client/src/sessions/chat.ts`；`apps/desktop/src/renderer/components/{settings/models/ConnectionDetailPage.tsx,usage/usage-stats-model.ts}`。
- 约束：pi-ai 补丁不改；pi-ai 的 `cacheWrite1h` 在字段缺失时是合成的 0，等于「全按 5 分钟价」，与旧行为一致，可接受；只在 wire 报了 `cacheWrite` 时读取，并夹在 `[0, cacheWrite]`。

## 风险

- 行为变化：已有 Anthropic 连接存的是 `short`，以前 Chat 模式自动用 1 小时，改后一律 5 分钟。缓解：规范写明；用户在连接详情改成 1 小时即可。
- 中转不支持 `ttl` 时仍按 5 分钟缓存。缓解：说明只描述请求策略，命中与时长以返回的 usage 为准。

## 里程碑

1. 规范同步。
2. 设置、IPC、服务与界面。
3. 请求选项与计费。
4. 测试、类型检查、`check:frontend-tokens`、浏览器验收（Sonnet），history，提交。

## 验证方式

- 命令：`pnpm typecheck`；desktop / llm-pi-ai / llm-service / session-journal / client 相关单测；`pnpm check:frontend-tokens`、`check:docs`。
- 手工检查：浏览器 renderer 连接详情（Anthropic 中转连接）出现「提示缓存」，OpenAI 协议连接不出现；Electron 与真实中转请求待用户实机。

## 进度记录

- [x] 规范同步。
- [x] 设置 / IPC / 服务 / 界面。
- [x] 请求选项与计费。
- [x] 单测、类型检查、仓库检查；浏览器验收见执行摘要。Electron 与真实中转请求未验。

## 决策记录

- 2026-11-15：用户确认按连接设置（方案 a），所有请求跟随连接，1 小时写入单独计价。1 小时单价取 `rates.input × 2`（已含倍率与币种换算），输入价缺失则该次费用未知。

- 2026-11-15：新建连接向导不加缓存选项，默认 5 分钟，建好后在连接详情改。执行文档见 `docs/exec-runs/20261115-prompt-cache-ttl/`。

## 执行模式

- **交互模式**。
