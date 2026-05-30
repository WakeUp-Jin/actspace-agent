## [2026-05-30 23:35] | Task: 给 Kairos 加额度护栏 + 优雅退出

### 🤖 Execution Context

- **Agent ID**: `917a0b58-0cd9-4938-94d7-08d8655d5e56`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor`

### 📥 User Query

> Kairos 一直循环运行有风险，想加两层保险：
> 1. 设置页「智能体 → Kairos」加「额度限制」：一个开关 + 一个额度数字。运行时每次模型回复的成本从额度里扣，额度为 0 就停、报"额度不够"；开关关则无限运行。多轮确认后简化为**单一余额模型**——UI 显示的就是"还能花多少"，可随时改，运行时不断减少，到 0 停；充值就是把这个数改大。额度（开关 + 余额）存独立运行态文件，不进 preferences。
> 2. 软件退出时弹"Kairos 正在关闭"遮罩，关闭成功才真正退出。
> 3. 关闭时强制结束 Kairos 进程（澄清：Kairos 无独立进程，转化为停循环 + abort 在飞请求 + 超时强退）。
>
> 完成后同步更新 docs 与设计规范文档。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/agent-core`、`@actspace/desktop`、`docs/`

**Key Actions:**

- **shared 契约（T1）**：`KairosRunState` 加 `budget_exhausted`；新增 `KairosBudgetRuntime{enabled, balanceCny, exhausted}`；`KairosRuntimeState` 加 `budget`；`KairosControl` 加 `set_budget`。
- **agent-core（T2）**：新增 `kairos/storage/budget-store.ts`（单一余额，debounce + atomic 写盘）；`scheduler.ts` 加注入式 `canStartTick()`，tick 边界两处检查耗尽即 `budget_exhausted` + break；`runner.ts` 透传退出用 `AbortSignal` 进 `runAgentLoop`；`controller.ts` 接入扣减 / `haltForBudget` / `setBudget` / `shutdown`（abort + stop + flush usage/budget），`start({force})` 耗尽时 throw。配套单测。
- **desktop main（T3）**：`kairos-ipc-internals.ts` 的 `dispatchKairosControl` 加 `set_budget` 分派；`index.ts` 重写 `before-quit`（preventDefault + 发 `app:shutting-down` + `controller.shutdown()` + 5s 超时 `app.exit(0)`）；preload + `global.d.ts` 暴露 `onShuttingDown`。
- **desktop renderer（T4）**：`KairosSettings.tsx` 加额度开关 + 剩余额度输入（走 `window.kairos` getState/onState/control set_budget）；`KairosPage.tsx` 加额度胶囊 + `budget_exhausted` 文案 + danger 语义色；`kairosSelectors.ts` 加 `budget_exhausted` 标签；新增 `ShutdownOverlay.tsx` 挂 `App.tsx` 顶层。配套单测（kairos-settings / shutdown-overlay / kairos-page 额度用例）。
- **文档（T5）**：更新 `kairos-autonomous-mode.md`（非目标 / 契约 / 存储布局 / 新增「额度护栏」「优雅退出」两章 / IPC 表）、`设置页规范.md`、`current-module-map.md`、exec plan 进度。

### 🧠 Design Intent (Why)

- **单一余额而非钱包模型**：用户心智里"额度"就是"还能花多少"，直接对一个数做减法最直观；去掉"上限 + 已消耗 + 清空"三量与按钮，充值=把余额改大。
- **额度存独立 `memory/budget-state.json`**：余额是每跑一次就回写的高频运行态数据，放 `preferences.json` 会触发配置热重载、与用户手动编辑打架，也把"配置"与"运行时变化的数"混在一起。与 usage-accumulator（只增统计）也要语义隔离。
- **耗尽不自动恢复**：用 `budget_exhausted` 区分"被动耗尽暂停"与"主动 stopped"，并写 `preferences.enabled=false` 避免重启反复撞墙；用户充值后必须手动「开启」，行为可预期。
- **tick 边界检查**：tick 内允许跑完（不做实时熔断），实现简单、超额有限；余额允许为负，UI 显示 ¥0。
- **优雅退出用 before-quit + preventDefault**：Electron 不 await async 回调，必须拦截后异步收尾再 `app.exit(0)`；AbortSignal 中断在飞 LLM 请求，5s 超时兜底保证一定能关掉软件、不残留运行态。Kairos 无独立 OS 进程，故"杀进程"= 停循环 + abort + 超时强退。

### 📁 Files Modified

- `packages/shared/src/kairos-contracts.ts`
- `packages/agent-core/src/kairos/storage/budget-store.ts`（新增）
- `packages/agent-core/src/kairos/scheduler.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/state/kairosSelectors.ts`
- `packages/desktop/src/renderer/components/ShutdownOverlay.tsx`（新增）
- `packages/desktop/src/renderer/App.tsx`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`、`docs/design-docs/frontend-ui/设置页规范.md`、`docs/design-docs/agent-core/current-module-map.md`、`docs/exec-plans/active/20260530-kairos-budget-and-graceful-shutdown.md`
