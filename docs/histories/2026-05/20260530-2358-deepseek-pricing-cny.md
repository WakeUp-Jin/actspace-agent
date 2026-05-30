## [2026-05-30 23:58] | Task: 把 DeepSeek 计价货币从 USD 改成 CNY（修正 Kairos 额度货币）

### 🤖 Execution Context

- **Agent ID**: `917a0b58-0cd9-4938-94d7-08d8655d5e56`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> KAIROS 默认模型应该是 flash 呀，你在搞什么？还有这个剩余额度可以填写到小数点几位呀？
>
> （澄清）不是，DeepSeek 输出的一定是中文、中国的货币（CNY）。剩余额度保持 2 位小数。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`docs/`

**Key Actions:**

- 核实默认模型：`DEFAULT_KAIROS_MODEL_ID = "deepseek-v4-flash"`（`env.ts`），本就是 flash，未改动。
- 修正定价货币：`model-config.ts` 里 `deepseek-v4-flash` / `deepseek-v4-pro` 的 `pricing.currency` 由 `USD` 改为 `CNY`。
- **同时换算单价**：把原 USD 单价按 ≈7.2 一次性换算成 CNY 单价（flash output 0.28→2.016、cacheMiss 0.14→1.008、cacheHit 0.0028→0.02016；pro 同理）。**不是只翻 `currency` 标签**——否则 `¥0.28` 实为 `$0.28`，正是 `cost-display-must-follow-fact-not-ui-preference.md` 警告的「7 倍欺骗」。
- 同步注释/测试夹具：`runner.test.ts` 货币注释、`shared/test/fixtures/kairos-events.ts` 默认 cost 改 `CNY`（消费方不断言币种，安全）。
- 余额输入精度保持 2 位小数（用户选择），`BudgetBalanceField` 未改。
- 文档：在学习文档加「后续更新」记录这次「改事实」动作，验证了 UI 跟随 `cost.currency` 的设计。

### 🧠 Design Intent (Why)

- **错在数据源，不在 UI**：Kairos 额度 UI 一直用 ¥ 是对的；`calculateUsageCost` 取 `pricing.currency`，所以只要改 `model-config` 这一处真来源，下游 Kairos 徽标 / 额度胶囊 / 成本事件全自动跟随，零 UI 改动。
- **换货币 = 换单价，不是换标签**：仓库既有学习文档明确——「想看 ¥」要翻译成「把单价切到 CNY 单价」，只翻 `currency` 标签会让数额虚低约 7 倍。故按 7.2 一次性换算静态常量（非运行时硬汇率），并注明接真实项目时换成官网 CNY 价目。
- **历史数据无需迁移**：旧 `llm_usage` 事件 cost 自带 `currency: "USD"`，按事件内字段照常显示；新事件用新 CNY 单价。这正是 cost 存完整 `LlmUsageCost` 的意义。
- **精度按 2 位小数**：用户明确选择；DeepSeek CNY 单价下一次 tick 约 ¥0.01～0.03 量级，2 位小数（最小 ¥0.01）足够表达常规预算的递减。

### 📁 Files Modified

- `packages/shared/src/model-config.ts`
- `packages/shared/src/test/fixtures/kairos-events.ts`
- `packages/agent-core/src/kairos/test/runner.test.ts`
- `docs/learnings/2026-05/cost-display-must-follow-fact-not-ui-preference.md`

### ✅ Verification

- `pnpm -r typecheck`：通过。
- `@actspace/shared` 测试 20/20、`@actspace/agent-core` 测试 518/518、desktop Kairos 相关用例（kairos-page 22、kairos-settings 5）全绿。
- 既有失败 `kairos-config-files.test.tsx`（工作区路径「默认」徽标）属另一未提交特性流，已用 stash 比对确认与本次货币改动无关。
