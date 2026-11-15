# Anthropic 提示缓存时长按连接设置 — 执行过程

- **关联计划**：`docs/exec-plans/completed/20261115-prompt-cache-ttl.md`
- **执行模式**：交互

## 时间线

- 2026-11-15 调查：请求侧已支持 `cacheRetention: long → ttl: "1h"`（direct pi-ai 与 proxy 两条线都有测试），但只有 Chat 模式发 1 小时；连接设置只有开关；计费只有一个缓存写入单价，pi-ai 解析的 `cacheWrite1h` 没人读。
- 用户确认：按连接设置（5 分钟 / 1 小时 / 关闭），所有请求跟随连接，1 小时写入单独计价。
- 先改四份规范，再写计划，然后实现：设置类型与迁移、IPC guard、`ModelConnectionsService.update` / 视图、连接详情下拉、`LegacyLlmAdapter` 覆盖模式策略、`LlmUsage.cacheWrite1hTokens`（direct 读 pi-ai `usage.cacheWrite1h`，proxy 读 `cache_creation.ephemeral_1h_input_tokens`）、`calculateUsageCost` 拆桶、journal 辅助请求校验、用量记录行与统计页费用明细。
- 决定：1 小时单价 = `rates.input × 2`，放在 `@actspace/shared` 的 `cacheWrite1hRate`，主进程计价与 renderer 明细共用。pi-ai 在字段缺失时给合成的 0，按「全是 5 分钟写入」处理，与旧行为一致。
- 协议切换时缓存模式回到新协议默认值，避免 OpenAI 协议连接残留 `long`。

## 问题

- `session-journal` 单独跑 `npx vitest run` 有 3 个文件报 `describe is not defined`，与本次无关：该包的 test 脚本带 `--globals`，用 `pnpm test` 全部通过。
