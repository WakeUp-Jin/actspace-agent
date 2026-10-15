## [2026-10-15 21:30] | Task: 模型设置二级页的返回按钮并进标题行；会话统计的 TTFT / TPS 改由宿主投影计算

### Execution Context

- Agent ID: /root
- Base Model: Claude Opus 5.5（主智能体），未使用子智能体
- Runtime: Claude Code CLI，本地开发工作区

### User Query

> 模型详情页的返回按钮很奇怪：上面「模型」大标题，下面又是大的 Provider 名，返回小按钮反而夹在中间很小。会话统计要和 DSH 对上，DSH 有 TPS。讨论后两项都选方案 A：返回箭头并进标题行；TPS 和 DSH 一样在宿主投影里算。

### Changes Overview

**Scope:** `packages/shared`、`packages/session/projection`、`apps/desktop` renderer（设置页、输入框状态行）

**Key Actions:**

- **返回按钮（方案 A）**：新增 `SettingsPrimitives.tsx` 的 `PageHeader`。二级页的返回是标题行最左侧的 28px ghost `IconButton`，标题提升为页面级 `h2`，不再显示「模型」页标题和小号返回链接。`PageShell` 的 title 改为可选，「模型」页的页头由 `ProviderSettings` 按路由自己画。`DetailHeader` / `RouteBack` 已删除，`SetupHeader` 改为包一层 `PageHeader`（自定义连接、Anthropic、模型编辑页共用）。从目录进入的设置页返回「添加连接」，从列表进入的返回「模型」。
- **会话统计（方案 A）**：`sessionStats` 投影（stateVersion 1→2）扫全量 journal，累加 `activity.timing`（模型用时、TTFT 总和与次数、解码时长、输出 token）。计算口径沿用原来渲染端 `composer-timing.ts` 的写法（对应 DSH `assistantMetrics()`）。每步的临时数据放在 `openSteps` 里，step/end 时清掉，`view` 不对外暴露。首 token 之后的 chunk 不改状态，所以流式时不会每个 chunk 都推一次投影。渲染端改读 `snapshot.activity.timing`，`composer-timing.ts` 已删除。

### Design Intent (Why)

TPS 的展示逻辑原本就有，缺的是数据：历史窗口 `slimHistoryWindow` 会去掉已定稿消息的 `assistant/chunk`，所以重新打开的会话拿不到首 token 时间，TTFT 和 TPS 都不显示；长会话因为窗口有上限，模型用时也会少算。放到宿主投影里算就是 DSH 的做法：旧会话因为 stateVersion 变化重建投影，也能算出数字；窗口仍然保持精简。

### Files Modified

- `packages/shared/src/runtime-v2/projection.ts`（`RuntimeV2SessionTiming`、`activity.timing`）
- `packages/session/projection/src/facts.ts`、`src/test/facts.test.ts`
- `apps/desktop/src/renderer/components/composer/composer-stats.ts`、`ComposerStatsPills.tsx`；删除 `composer-timing.ts`
- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`、`SettingsPage.tsx`、`ProviderSettings.tsx`、`custom-connection-shared.tsx`
- 测试与 fixture：`test/composer-stats-pills.test.tsx`、`test/provider-model-settings.test.tsx`、`test/fixtures/model-settings-preview.tsx`；`activity` 字面量补 `timing` 的若干测试与 `mock/mock-db.ts`
- 文档：`docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md` §3.1、`front-聊天输入框规范.md`「状态行统计胶囊」

### Verification

- 浏览器 mock（`?mock=long-session`）截图：列表、详情（含返回悬停）、添加连接，浅色和深色主题都看过；脚本 `tmp/model-header-shots/shots.mjs`。
- 单测：设置、统计胶囊、投影计时（含「首 token 后的 chunk 不推送」）。
- 未做：Electron 真机、真实 Provider 流式下的 TPS 数字。
