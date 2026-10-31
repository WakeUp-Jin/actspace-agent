## [2026-10-31 15:00] | Task: 修复使用统计口径与累计用量文案

### 🤖 Execution Context

- **Agent ID**: `claude-subagent-0912-usage`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code`

### 📥 User Query

> 0912 使用体验 Bug：统计页缓存命中率显示「—」；输入框下方的累计 token 与「上下文」弹窗的数字看起来对不上；统计页「未知」项太乱，每张卡片都挂橙色说明。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer 统计页、Composer 状态行、main 读模型 worker）、`packages/client`（fallback 口径）、设计文档

**Key Actions:**

- **缓存命中率**: cacheWrite 未上报（OpenAI 兼容协议）按 0 计入分母；只在已上报用量的请求缺 input 或缓存读取时显示「—」。
- **累计 vs 窗口占用**: 胶囊改为「累计 N tok · 缓存命中 X%」，弹窗改名「会话累计消耗」并写明口径与缓存命中算法；上下文圆环加 Tooltip「当前上下文窗口占用 ≈A / B（估算）」。
- **未知项收敛**: 四张卡片恢复固定标签与灰色说明，缺口合并为一行注脚并按原因分类；读模型 SQL 与 fallback 不再把 running 请求、无 token 的失败请求计入未知；行内未定价的费用「未知」加 Tooltip。

### 🧠 Design Intent (Why)

数据缺口是真实的，只是不该在每张卡片上重复出现四次；running 残留和无 token 的失败请求本来就没有可缺的费用依据。口径只在读模型层调整，不改 runtime 和 schema（不需要动 `user_version`）。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`
- `packages/client/src/sessions/indexed-usage.ts`、`usage-aggregates.ts`
- `apps/desktop/src/renderer/components/composer/ComposerStatsPills.tsx`、`ComposerStatusRow.tsx`、`stats/StatDialog.tsx`
- `docs/design-docs/frontend/front-usage-statistics-refresh.md`、`front-聊天输入框规范.md`、`model-context/agent-model-catalog-and-usage-cost.md`
