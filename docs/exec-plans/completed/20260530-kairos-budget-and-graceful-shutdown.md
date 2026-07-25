# Kairos 额度护栏（单一余额）+ 优雅退出

## 目标

给一直循环运行的 Kairos 加两层"保险"：

1. **额度护栏（单一余额模型）**：UI 上就一个「开关」+ 一个「剩余额度（¥）」数字。运行时每次模型回复都把成本从余额里扣掉，余额这个数不断变小；`开关开 且 余额 ≤ 0` → 报"额度不足"并停止。用户随时能改这个余额（想充值就填大、想收紧就填小、填 0 即不再让它跑），改完手动「开启」即可继续。开关关 → 无限运行、无额度概念。**余额是运行时被高频回写的运行态数据，存独立文件 `budget-state.json`，不进 `preferences.json`（避免和配置文件热重载打架）。** 耗尽**不自动恢复**——用户把余额改成 > 0 后需手动重新开启。
2. **优雅退出**：退出软件时弹"Kairos 正在关闭"遮罩，先停掉 Kairos 循环、中断正在飞的 LLM 请求、flush 写盘，再真正退出；最多等 5 秒，超时用 `app.exit(0)` 强制退出，保证用户一定能关掉软件，且退出后不残留运行态/子进程。

## 与初版（钱包模型）的差异（重要）

初版设计为"上限 `limitCny` + 已消耗 `spentCny`（剩余 = 上限 − 已消耗）+ 清空已消耗按钮"，且 `limitCny` 写 `preferences.json`。与用户多轮确认后**简化为单一余额**：

- 不再有 `limitCny` / `spentCny` / `remainingCny` 三个量，只有一个 `balanceCny`（余额）。
- 运行时直接对 `balanceCny` **做减法**（而非对 spent 做加法）。
- **去掉**"清空已消耗"按钮与 `reset_budget` 控制——充值就是直接把余额改大。
- 额度配置（开关 + 余额）**全部**放运行态文件 `budget-state.json`，`preferences.json` / `config/schema.ts` **不动**。
- 设置页那个数字框的语义 = "保存后它还能花多少"（即剩余余额），用户随时可改。

## 范围

- 包含：
  - `packages/shared`：`KairosRunState` 新增 `budget_exhausted`、`KairosRuntimeState.budget` 运行态、`KairosControl` 新增 `set_budget`。**`settings.ts` 不动**（额度不进 `settings.json`）。
  - `packages/agent-core`：新增 `kairos/storage/budget-store.ts`（开关 + 余额运行态，debounce + atomic 写盘）；`controller.ts` 接入余额扣减 / 耗尽暂停 / setBudget / abort signal / `shutdown()`；`scheduler.ts` 在 tick 边界检查余额；`runner.ts` 透传 abort signal。**`config/schema.ts` 不动**（额度不进 preferences）。
  - `packages/desktop/src/main`：`index.ts` 重写 `before-quit`；`kairos-ipc-internals.ts` 支持 `set_budget`；`preload/index.ts` + `global.d.ts` 暴露 `onShuttingDown`。**`settings-service.ts` 不动**。
  - `packages/desktop/src/renderer`：设置页「Kairos 自主智能体」加「额度限制」开关 + 「剩余额度（¥）」输入两个控件（读写走 `window.kairos`）；Kairos 页状态条显示剩余额度 / `budget_exhausted` 文案；新增退出遮罩组件。
  - 文档同步：`kairos-autonomous-mode.md`、`设置页规范.md`、`current-module-map.md`、history。
- 不包含：
  - 额度进 `settings.json` 或 `preferences.json`（运行态余额只放 `budget-state.json`）。
  - 把整个 Kairos 配置 tab 的 raw json 编辑改成结构化表单——本期只为「额度」做控件，其余 config（preferences/paths/blocklist/rule）继续 raw。
  - 周期自动重置（每日/每月）——单一余额无周期。
  - 多币种额度——固定按 CNY（¥）；非 CNY 成本仍按数值扣减，MIXED 极端情况不特殊处理（注明取舍）。
  - tick 内实时熔断——在 **tick 边界**检查，单 tick 内允许跑完。
  - 主 Agent（用户主动对话）的额度限制——只约束 Kairos 自治循环。
  - 杀"独立 Kairos 进程"——Kairos 无独立进程，退出按"停循环 + abort 请求 + 超时强退"实现。

## 背景

- 相关文档：
  - `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`（Kairos 自治事实来源；"非目标"曾写"不做配额护栏"，本期是 **cost budget** 演进，需更新；存储布局补 `memory/budget-state.json`）。
  - `docs/design-docs/model-context/agent-token-usage-and-context-state.md`（`llm_usage.cost` 成本事实来源）。
  - `docs/design-docs/frontend/front-设置页规范.md`（智能体分区信息架构）。
- 相关代码路径（必读，已读完）：
  - 运行循环：`packages/agent-core/src/kairos/scheduler.ts`（`QueueProcessor.loop()` 尾递归 tick→sleep；空队列时 `pickNextTick` 投 tick）。
  - 装配中枢：`packages/agent-core/src/kairos/controller.ts`（`eventSink` 的 `llm_usage` 分支累加 usage、`start/stop/resetToday`、`setEnabledPreference` 的 merge-write 范式、`reloadConfig`、`setState`、`KairosRuntimeState` 初始化）。
  - 单 tick：`packages/agent-core/src/kairos/runner.ts`（`processTick` 第 169 行调 `runAgentLoop(context, llm, loopConfig, onEvent)`，当前**未传 signal**）。
  - 循环内核：`packages/agent-core/src/engine/loop.ts`（`runAgentLoop(context, llm, config, emit, signal?)` 已支持 `AbortSignal`，第 46/88/94 行）。
  - 成本累加器：`packages/agent-core/src/kairos/storage/usage-accumulator.ts`（debounce + atomic rename + flush 范式，**budget-store 直接照抄**）。
  - 主进程：`packages/desktop/src/main/index.ts`（`ensureKairosController` 488 行 / `before-quit` 874 行当前有 bug）。
  - Kairos IPC：`packages/desktop/src/main/kairos-ipc.ts` + `kairos-ipc-internals.ts`（`dispatchKairosControl` 170 行 / `KairosControllerForDispatch` 162 行）。
  - 契约：`packages/shared/src/kairos-contracts.ts`（`KairosRunState` 14 行 / `KairosRuntimeState` 48 行 / `KairosControl` 79 行）。
  - 前端设置页：`packages/desktop/src/renderer/components/settings/KairosSettings.tsx`（`SettingGroup title="Kairos 自主智能体"` 189 行，内有「模型」「思考链」两行）。
  - 前端 Kairos 页：`packages/desktop/src/renderer/pages/KairosPage.tsx`（`KairosHeader` 389 行状态胶囊；`useKairos` 控制）、`state/kairosSelectors.ts`（`getKairosStatusLabel` 235 行 / `kairosStateLabel` 263 行 / `stateTextClass`+`stateDotClass` in KairosPage 822/827 行）。
  - preload / 类型：`packages/desktop/src/preload/index.ts`（`actspace` 53 行）、`packages/desktop/src/global.d.ts`（`actspace` 接口 5 行）。
  - App 顶层：`packages/desktop/src/renderer/App.tsx`（return 在 804 行，`<RightPanelProvider>` 包 `<WorkbenchLayout>`；遮罩挂这里）。
- 已知约束：
  - `Electron before-quit` 不会等待 async 回调；要拦截退出必须 `event.preventDefault()`，完成后再 `app.exit(0)`。
  - `agent-core` 不能依赖 `desktop`/`electron`。
  - `preferences.json` 是用户可编辑 + reload 监听的**配置文件**，**不能**被运行时高频回写——故余额放独立运行态文件。
  - `controller.start()` 当前 `if (runtimeState.enabled) return;` 幂等；耗尽态必须保证「开启」按钮仍可用（见决策记录 D1）。
  - Kairos 跑 DeepSeek 时 `cost.currency === "CNY"`；模型未在注册表匹配时 `cost.total === 0`（不扣额度，但仍记 token 事实）。

## 数据模型与契约（以本节为准）

### 真相源与运行态分层

| 数据 | 存放 | 谁写 |
|---|---|---|
| 额度开关 `enabled` + 余额 `balanceCny` | `<kairosRoot>/memory/budget-state.json` | controller（运行时扣减 / 用户经设置页 set_budget） |

- 与 `usage-accumulator.json`（token/成本总账）**独立**——后者是"统计事实"只增不减，前者是"可花余额"会被扣减且用户可改。
- `preferences.json` 不含 budget 字段；`config/schema.ts` 不改。

### Kairos 运行态文件：`<kairosRoot>/memory/budget-state.json`

```jsonc
{
  "schemaVersion": 1,
  "enabled": false,      // 额度护栏开关；false=无限运行
  "balanceCny": 0,       // 剩余可花额度（¥）；运行时被扣减，用户可随时改
  "updatedAt": "2026-05-30T21:00:00+08:00"
}
```

文件缺失/损坏：`enabled=false`、`balanceCny=0` 起步（无限运行，不误伤）。

### `packages/shared/src/kairos-contracts.ts`

```ts
export type KairosRunState =
  | "idle" | "ticking" | "sleeping" | "interrupted" | "stopped" | "cooldown"
  | "budget_exhausted"; // 新增：余额耗尽被动暂停

/** Kairos 额度运行态；enabled=false 时 balanceCny 无意义，UI 不渲染额度块。 */
export interface KairosBudgetRuntime {
  enabled: boolean;
  /** 剩余可花额度（¥）。运行时递减，≤0 且 enabled 时进入 budget_exhausted。 */
  balanceCny: number;
  /** = enabled && balanceCny <= 0。renderer 据此显示"额度不足"。 */
  exhausted: boolean;
}

export type KairosRuntimeState = {
  // ...既有字段
  budget: KairosBudgetRuntime; // 新增（始终存在）
};

export type KairosControl =
  | { type: "start" } | { type: "stop" } | { type: "wake_now" } | { type: "reset_today" }
  | { type: "set_budget"; enabled: boolean; balanceCny: number }; // 设置页两个控件 → 写 budget-state.json
```

### `app:shutting-down` 通道

main → renderer 单向通知，无 payload。直接用字符串字面量 `"app:shutting-down"`（`ipc.ts` 无通道常量集合惯例，actspace 通道都是裸字符串，不引入常量）。

## 状态机（耗尽 / 设置 / 恢复，见决策记录 D1）

- **耗尽路径**（controller 私有 `haltForBudget()`）：停 processor 循环 → `runtimeState.enabled=false` + `state="budget_exhausted"` → 持久化 `preferences.enabled=false`（避免重启反复撞墙）→ emit 一条 `error` SessionEvent（content="额度不足，Kairos 已暂停"）→ emit state。
  - 注意区分两个 enabled：`budget.enabled`（额度护栏开关，用户没关）保持 true；`runtimeState.enabled`（Kairos 总开关）置 false。
- **检查时机**：
  1. `QueueProcessor.loop()` 投/取下一个 tick 前调用注入的 `canStartTick()`；返回 false → `onStateChange("budget_exhausted")` + break loop。
  2. `eventSink` 处理 `llm_usage`、扣减 `balanceCny` 后若已耗尽：`processor.triggerWake("wake_now")` 提前结束当前 sleep，让 loop 尽快被 `canStartTick()` 拦下（避免长 sleep 期间仍显示 sleeping）。
  3. `start({force:true})`（UI「开启」）：若 `budget.enabled && balanceCny<=0` → 不起 processor，setState("budget_exhausted")，并 **throw**（msg="额度不足，请先在设置页调高额度"）让 renderer toast。
  4. app 启动 auto-start `start()`：同 3 的防御性检查（正常不触发，因耗尽时已写 enabled=false）。
- **设置/恢复**（关键）：
  - `set_budget`（设置页改开关/余额）→ controller `setBudget({enabled, balanceCny})`：写 `budget-state.json` → 重算 `runtimeState.budget` → 耗尽态清理 → emit state。**不自动起跑**。
  - **耗尽态清理**：执行 `set_budget` 后，若 `state==="budget_exhausted"` 且现在 `!(budget.enabled && balanceCny<=0)`，把 `state` 改回 `"stopped"`（runtimeState.enabled 仍 false），UI 不再显示"额度不足"，用户点「开启」即可正常进 `idle`。
- `start()` 幂等改造：`if (runtimeState.enabled && runtimeState.state !== "budget_exhausted") return;`。

## controller 新增 API（agent-core）

```ts
interface KairosController {
  // ...既有
  /** 设置页两个控件 → 写 budget-state.json 的 enabled+balanceCny + 刷新 runtime + 耗尽态清理。 */
  setBudget(input: { enabled: boolean; balanceCny: number }): Promise<void>;
  /** 退出统一入口：abort in-flight 请求 → stop 循环 → flush usage/budget 写盘。 */
  shutdown(): Promise<void>;
}
```

## 任务分解（按依赖顺序）

### T1 — shared 契约（地基，无依赖）

- 文件：`packages/shared/src/kairos-contracts.ts`。
- 改动：加 `budget_exhausted`、`KairosBudgetRuntime{enabled,balanceCny,exhausted}`、`KairosRuntimeState.budget`、`KairosControl` 的 `set_budget`。**不改 `settings.ts`。**
- 验证：`pnpm --filter @actspace/shared build`；`pnpm --filter @actspace/shared test`（若有 `KairosRuntimeState` fixture 需补 `budget`）。

### T2 — agent-core 余额、扣减与中断

1. **`storage/budget-store.ts`（新建）**：`class KairosBudgetStore`：
   - 构造 `{ filePath, debounceMs=300, atomicWrite=true }`。
   - `load()`：读 `budget-state.json`，缺失/坏 → `enabled=false, balanceCny=0`。
   - `deduct(cny)`：`balanceCny = balanceCny - cny`（cny≤0 或 NaN 忽略）；标 dirty + debounce 写盘。仅 enabled 时由 controller 调。
   - `setBudget({enabled, balanceCny})`：直接覆盖（balanceCny 取非负有限数，否则保持）；立即写盘（仿 `resetSinceReset` 的"清 timer + await pendingWrite + persist"）。
   - `getEnabled()` / `getBalance()` / `getRuntime(): KairosBudgetRuntime`（含 `exhausted = enabled && balance<=0`）。
   - `flush()`：等 debounced 写盘落地（照抄 usage-accumulator）。
   - 测试（`storage/test/budget-store.test.ts`）：扣减正确、setBudget 覆盖并立即落盘、坏文件回退 enabled=false/balance=0、flush 落盘内容正确、负/NaN 扣减被忽略。
2. **`scheduler.ts`**：`QueueProcessorOptions` 加 `canStartTick?: () => boolean`；`loop()` 在"投 tick / dequeue 处理"前若 `canStartTick?.() === false` → `onStateChange("budget_exhausted")` + break（区别于 `stopRequested` 的 stopped 路径）。
   - 测试（`test/scheduler.test.ts` 增补）：`canStartTick=false` 不投 tick、emit `budget_exhausted`、loop 退出；`true` 正常 tick。
3. **`runner.ts`**：`KairosRunnerOptions` 加 `getAbortSignal?: () => AbortSignal | undefined`；`processTick` 第 169 行改为 `runAgentLoop(context, this.opts.llm, loopConfig, onEvent, this.opts.getAbortSignal?.())`。
   - 测试（`test/runner.test.ts` 增补）：注入已 abort 的 signal → loop 早退（无 tool_call / 无 assistant_message）。
4. **`controller.ts`**：
   - 顶层持有 `budgetStore = new KairosBudgetStore({ filePath: join(root,"memory","budget-state.json") })`、`await budgetStore.load()`；`let abortController = new AbortController()`。
   - `runtimeState` 初始化加 `budget: budgetStore.getRuntime()`。
   - layout() 加 `budgetStateFile`（与 usageAccumulatorFile 同级）。
   - `eventSink` 的 `llm_usage` 分支：累加 usage-accumulator 后，若 `budgetStore.getEnabled()` → `budgetStore.deduct(payload.cost.total)`、`runtimeState.budget = budgetStore.getRuntime()`；emit state（已有 emit）；若 `runtimeState.budget.exhausted` → `processor.triggerWake("wake_now")`。
   - `QueueProcessor` 注入 `canStartTick: () => !budgetStore.getRuntime().exhausted`。
   - `runner` 注入 `getAbortSignal: () => abortController.signal`。
   - 新增 `haltForBudget()`（私有逻辑，可内联在 setState 监听或在 loop break 后由 `onStateChange` 触发）：当 scheduler emit `budget_exhausted` 时 → `runtimeState.enabled=false` + 持久化 `setEnabledPreference(false)` + emit error event + emit state。**实现方式**：在 `setState` 里拦截 `s==="budget_exhausted"` 做这套副作用（注意避免重入：set_budget 清理时不要触发）。
   - 实现 `setBudget({enabled,balanceCny})`：`budgetStore.setBudget(...)` → `runtimeState.budget = budgetStore.getRuntime()` → 耗尽态清理（若 `state==="budget_exhausted" && !budget.exhausted` → `setState("stopped")`）→ `emit state`。
   - 实现 `shutdown()`：`abortController.abort()` → `await stop()` → `await usageAccumulator.flush()` → `await budgetStore.flush()`（try/catch 各自吞错，保证不抛）。
   - `start()`：force 时若 `budgetStore.getRuntime().exhausted` → `setState("budget_exhausted")` + throw；幂等条件改 `if (runtimeState.enabled && runtimeState.state !== "budget_exhausted") return;`；正常 start 时 `abortController = new AbortController()`（重建供本轮用）。
   - `stop()`：保持现状（shutdown 已单独 abort；stop 自身不必 abort，避免误伤正常暂停后再启动——但 start 会重建 controller，稳妥起见 stop 不动 signal）。
   - 测试（`test/controller.test.ts` 增补）：
     - budget.enabled、balance=0.01，喂 cost=0.02 的 `llm_usage` → 下个 tick 边界进 `budget_exhausted`、runtimeState.enabled=false、emit error。
     - `setBudget` 充值（balance 调大）→ budget.exhausted=false、`budget_exhausted` 清理回 stopped。
     - `setBudget` 关闭开关 → 不再受限、state 从 budget_exhausted 回 stopped。
     - `start({force:true})` 在 exhausted 时抛错且不起 processor。
     - `shutdown()` abort + flush 不抛。
- 验证：`pnpm --filter @actspace/agent-core test && pnpm --filter @actspace/agent-core build`。

### T3 — desktop main

1. **`kairos-ipc-internals.ts`**：`KairosControllerForDispatch` 加 `setBudget(input: { enabled: boolean; balanceCny: number }): Promise<void>`；`dispatchKairosControl` 加 `case "set_budget": await controller.setBudget({ enabled: ctrl.enabled, balanceCny: ctrl.balanceCny }); return;`（更新 exhaustive never）。
   - 测试（`main/test/kairos-ipc-internals.test.ts` 增补）：`set_budget` 正确派发入参。
2. **`index.ts`**：重写 `before-quit`（替换 874–881 行）：
   ```ts
   let shuttingDown = false;
   app.on("before-quit", (event) => {
     if (shuttingDown) return;          // 二次进入放行
     if (!kairosController) { kairosIpcHandle?.dispose(); return; }
     shuttingDown = true;
     event.preventDefault();
     getMainWindow()?.webContents.send("app:shutting-down");
     const finish = () => app.exit(0);  // 强退，不再走 before-quit
     const timer = setTimeout(finish, 5000);
     void (async () => {
       try { await kairosController?.shutdown(); }
       catch (err) { logMain("kairos shutdown threw", { error: String(err) }); }
       finally { clearTimeout(timer); kairosIpcHandle?.dispose(); finish(); }
     })();
   });
   ```
   - （`ensureKairosController` / `reconcileKairosAfterPreferences` **无需**为 budget 改动——额度走 budget-state.json，不经 preferences/settings。）
3. **`preload/index.ts` + `global.d.ts`**：`window.actspace` 加 `onShuttingDown(cb: () => void): () => void`（`ipcRenderer.on("app:shutting-down", handler)`，返回 off）；`global.d.ts` 的 actspace 接口同步加该方法签名。
- 验证：`pnpm --filter @actspace/desktop test`、desktop typecheck/build。

### T4 — desktop renderer

1. **设置页**（`KairosSettings.tsx` 的 `SettingGroup title="Kairos 自主智能体"`，模型/思考链下方加两行）：
   - 挂载时（bridge 可用）`window.kairos.getState()` 取 `budget.enabled/balanceCny`；并 `onState` 订阅，运行时余额递减时同步显示（用户**正在编辑**输入框时不被覆盖：用本地 draft + focus 标志）。
   - 「额度限制」开关行：`SettingRow` + 一个开关控件（复用 SettingsPrimitives 若有 Switch，否则用 `SettingsSelect` 开/关 二选一或简单按钮；优先找现有开关原子）。切换即时 `window.kairos.control({ type:"set_budget", enabled: next, balanceCny: 当前 })`。
   - 「剩余额度（¥）」数字输入行：仅 `enabled` 时可编辑；`onBlur` / 回车提交 `set_budget`（避免每键写盘）。描述注明"这是它还能花的钱，运行时会不断减少，可随时改；按人民币估算"。
   - 该 group 单独从 `window.kairos` 读写，不依赖 `window.actspace.updateSettings`。
   - 桥不可用（mock）时禁用控件 + 文案"仅桌面端可配置"。
   - 测试（`renderer/test/settings-page.test.tsx` 或新 `kairos-settings.test.tsx`）：mock `window.kairos`，切开关 / 改余额触发 `control({type:"set_budget"})` 入参正确；getState 初值回填。
2. **Kairos 页**（`KairosPage.tsx` / `kairosSelectors.ts`）：
   - `kairosStateLabel` / `getKairosStatusLabel` 加 `budget_exhausted` → "额度不足"；`stateTextClass`/`stateDotClass` 加 `budget_exhausted` → danger/warn 语义色。
   - `state.budget.enabled` 时状态条旁显示「额度 ¥x.xx」胶囊（余额；exhausted 时红色）。
   - 「开启」点击 reject（额度不足）时 `useKairos.control` 已 setError，页面底部 `pageErrorClass` 会渲染 → 确认文案够清楚（catch 不再吞掉 message，或保留 toast）。当前 `onStart` 是 `.catch(()=>{})`，需改为不吞错（让 hook 的 error 浮出）。
   - 测试（`renderer/test/kairos-page.test.tsx` 增补）：注入 `budget_exhausted` 渲染"额度不足"+额度胶囊。
3. **退出遮罩**：新增 `renderer/components/ShutdownOverlay.tsx`，在 `App.tsx` 顶层挂载（`RightPanelProvider` 内或外，全屏覆盖）。监听 `window.actspace.onShuttingDown` → 全屏遮罩「Kairos 正在安全关闭…」（主题语义类，浅/深双主题验证）。mock 模式（无 actspace）直接不挂监听。
   - 测试（`renderer/test/shutdown-overlay.test.tsx`）：触发 onShuttingDown 回调后遮罩出现。
- 验证：`pnpm --filter @actspace/desktop test`；浏览器 mock 截图浅/深；Electron `pnpm dev:log` 实机。

### T5 — 文档与收尾

- `kairos-autonomous-mode.md`：更新"非目标"（cost budget 已落地为单一余额）；存储布局加 `memory/budget-state.json`；新增「额度护栏（单一余额）」「优雅退出」章节；`KairosRunState`/`KairosRuntimeState` 字段同步。
- `设置页规范.md`：智能体分区 Kairos 条目补「额度限制（开关 + 剩余额度，写入 budget-state.json）」。
- `current-module-map.md`：补 `budget-store.ts`、controller budget/shutdown、退出遮罩。
- `docs/histories/2026-05/`：按 `HISTORY_GUIDE.md` 记一篇。

## 风险

- 风险：退出时 `controller.shutdown()` 卡在 abort 不生效。
  - 缓解：5s 超时 `app.exit(0)` 兜底；T2 验证 signal 确实传到 `runAgentLoop`→`llm.stream({signal})`。
- 风险：`enabled=false + state="budget_exhausted"` 被既有 renderer selector 误判为普通 stopped。
  - 缓解：renderer 以 `state` 优先判定文案，新增 budget_exhausted 分支并加测试。
- 风险：`cost.currency` 非 CNY 导致额度数值偏差。
  - 缓解：固定按数值扣减 + 文档/设置页注明"按人民币估算"；Kairos 默认 DeepSeek（CNY）。
- 风险：tick 边界检查导致"最后一个 tick"已超额仍跑完（余额可能被扣成负数）。
  - 缓解：tick_boundary 粒度已知取舍，超额有限，余额允许为负、UI 显示 ¥0；文档注明。
- 风险：设置页输入框显示的余额与运行时递减不同步 / 用户编辑被覆盖。
  - 缓解：`onState` 订阅刷新；编辑时用本地 draft + focus 标志，blur 才提交。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build && pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/agent-core test && pnpm --filter @actspace/agent-core build`
  - `pnpm --filter @actspace/desktop test`
  - 仓库根 `pnpm typecheck` / `pnpm build`（若有）
- 手工检查（Electron `pnpm dev:log`）：
  1. 设置页开启额度、余额 ¥0.05，开启 Kairos → 跑若干 tick 后自动暂停、Kairos 页显示「额度不足」、`<userData>/kairos/memory/budget-state.json` 的 `balanceCny` 降到 ≤0、`logs/latest-dev.log` 有 `[kairos]` 暂停记录。
  2. 设置页把余额改成 ¥1（充值）→ 手动点「开启」→ 恢复运行。
  3. 关闭软件 → 出现「Kairos 正在关闭」遮罩 → 数秒内窗口关闭；再启动无残留；活动监视器无遗留子进程。
  4. 关闭时若卡在慢 tick → 最多 5s 后强制退出。
- 观测检查：`budget-state.json` 的 `balanceCny` 随回复减少；设置页改余额后文件同步更新。

## 进度记录

- [x] T1 shared 契约（budget_exhausted / KairosBudgetRuntime / KairosRuntimeState.budget / set_budget）— 2026-05-30
- [x] T2 agent-core 余额 + 扣减 + 中断（budget-store + scheduler canStartTick + runner abort + controller 接入/setBudget/shutdown，含单测）— 2026-05-30
- [x] T3 desktop main（kairos-ipc set_budget 分派 + before-quit 重写 + preload/global onShuttingDown，含单测）— 2026-05-30
- [x] T4 desktop renderer（设置页额度开关+余额输入 + Kairos 页额度胶囊/耗尽文案 + ShutdownOverlay，含单测）— 2026-05-30
- [x] T5 文档与 history（kairos-autonomous-mode / 设置页规范 / current-module-map / history）— 2026-05-30

## 决策记录

- 2026-05-30：额度最终采用**单一余额模型**（一个开关 + 一个 `balanceCny`，运行时直接扣减，余额=用户能看到/能改的"还能花多少"），取代初版"上限+已消耗+清空已消耗"钱包模型。币种固定 CNY，tick 边界检查。来源：与用户多轮确认（"UI 显示的就是当前剩余的钱，可随时修改，判断这个数不能为 0，运行时不断消耗减少"）。
- 2026-05-30：**余额（含开关）存运行态文件 `memory/budget-state.json`，不进 `preferences.json`/`settings.json`**。理由：余额是 Kairos 每跑一次就回写的高频运行态数据，放配置文件会触发配置热重载、与用户手动编辑打架，概念上也把"配置"和"运行时变化的数"混在一起。`budget-state.json` 同样满足用户"额度作为 json 字段、运行时检查是否≤0"的诉求。`config/schema.ts` 因此不改。来源：与用户确认。
- 2026-05-30：去掉"清空已消耗"按钮与 `reset_budget` 控制——充值即直接把余额改大；恢复运行需用户手动「开启」（不自动恢复）。（D1）
- 2026-05-30：耗尽**不自动恢复**——耗尽时 `runtimeState.enabled=false` + `state="budget_exhausted"` 且写 `preferences.enabled=false`，用户把余额改 >0 后需**手动**重新开启。用 `state` 区分"被动耗尽暂停"与"主动停止"，并在 set_budget 后做耗尽态清理。
- 2026-05-30：退出用 `before-quit` + `preventDefault` + renderer 遮罩 + `controller.shutdown()`（abort+stop+flush），5s 超时 `app.exit(0)` 强退。修复现有 async before-quit 不被等待的 bug。
- 2026-05-30：澄清 Kairos 无独立 OS 进程——它是 main 进程内的 `QueueProcessor` 循环；"强制杀进程"转化为"停循环 + abort in-flight 请求 + 超时强退"。
