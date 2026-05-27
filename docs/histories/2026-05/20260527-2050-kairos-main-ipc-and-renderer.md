# 2026-05-27 20:50 — Kairos plan 6 落盘：main IPC 与 Renderer KairosPage

## 背景

接续 plan 5（controller + scheduler + runner）。本轮把 `KairosController` 接入主进程并桥接到 renderer，让用户能在新的 Kairos 页里实时看到 tick / tool / sleep 事件流，并直接编辑 4 份配置文件。

## 变更范围

### `@actspace/shared`

- `kairos-contracts.ts` 追加 4 个 IPC 契约：`KairosReadConfigRequest/Response`、`KairosWriteConfigRequest/Response`、`KairosControlResponse`，以及把 `window.kairos` 整套 API surface 凝固成 `KairosBridgeApi` 接口，让 preload、global.d.ts、useKairos 三处单一 source of truth。

### `@actspace/agent-core`

- 顶层 `src/index.ts` re-export `./kairos`，main 进程一处 import 就能拿到 controller + schema parser。
- `kairos/index.ts` 追加导出 `parsePreferences / parsePathsConfig / parseBlocklist`，给 main 端 `write-config` 校验用。
- engine 层无修改。

### `@actspace/desktop` — main 进程

- **新增** `src/main/kairos-bootstrap.ts`：
  - `ensureKairosScaffolding(kairosRoot)`：幂等创建 `config/` `memory/short-term/` `observe/watch-manifests/` `briefs/tasks/` `notes/`；缺失时落盘 `preferences.json` / `paths.json` / `blocklist.json` / `rule.md` 缺省值（`enabled=false`）。
  - `createKairosLlm()`：复用 `buildLLMConfig + createLLMService`，沿用主 Agent 同款 provider。
  - `createKairosToolManagerFactory(workspaceRoot)`：返回 `(config) => ToolManager`，把 `config.blocklist.toolsDenied` 合并进 `disabledTools`；controller 之后会在工厂返回的 manager 上注册 Sleep。

- **新增** `src/main/kairos-ipc.ts`：
  - 注册 5 个 invoke handler：`kairos:get-state` / `kairos:get-events-recent` / `kairos:control` / `kairos:read-config` / `kairos:write-config`。
  - 控制通道穷尽枚举 `start/stop/wake_now/reset_today`，未知 type 直接 throw。
  - 写盘走「JSON.parse → schema parse → tmp + rename → controller.reloadConfig()」流水；rule.md 跳过 JSON 校验。校验失败 throw 让 invoke 端拿到 rejected Promise。
  - main → renderer 推送 `kairos:event` / `kairos:state` 走 50 ms debounce 攒批：tick 内瞬间 10+ 个 event 也只触发一次 webContents.send loop，避免 Electron IPC 抖动。

- `src/main/index.ts`：
  - 新增 `ensureKairosController(roots)` lazy 单例：第一次进 `whenReady` 时初始化 controller + 挂 IPC handle，`before-quit` 关闭时 dispose。
  - `agent:run-turn` handler 用 try/finally 包住：开头调 `controller?.notifyMainAgentTurnStart()`、退出（含异常路径）调 `notifyMainAgentTurnEnd()`，让 Kairos 收到主 Agent 的礼让信号。controller 未初始化时为 noop，主路径零影响。

### `@actspace/desktop` — preload + global.d.ts

- `preload/index.ts` 额外 `contextBridge.exposeInMainWorld("kairos", bridge)`，逐字段对齐 `KairosBridgeApi`；`onEvent` / `onState` 返回 disposer，方便 renderer cleanup。
- `global.d.ts` 给 `Window` 追加 `kairos?: KairosBridgeApi`，可选属性能让纯网页 mock 模式平滑跳过。

### `@actspace/desktop` — renderer

- **新增** `state/useKairos.ts`：
  - 不引入 zustand / mobx；保持现有 `useState + useCallback` 风格。
  - 首次 mount 调 `bridge.getState() + getEventsRecent`，订阅 stream；事件流上限 500 条，超出裁掉最早；rows 用 `aggregateKairosEvents(events)` `useMemo` 派生。
  - 暴露 `control / readConfig / writeConfig / selectRow / refresh`，错误 surface 到 `error` 字段。

- **新增** `pages/KairosPage.tsx`：
  - `KairosHeader`：状态条 + tick/tool/sleep 计数 + 4 颗按钮（开启/暂停/立即唤醒/重置今日），睡眠期实时倒计时（每秒刷新）。
  - `KairosEventTable`：时间/类型/状态/摘要/耗时五列，倒序展示，键盘可达，selected 行有高亮 token。
  - `KairosEventDetailPanel`：右侧 `<pre>` 渲染 row.relatedEventIds 命中的原始 SessionEvent JSON。
  - `KairosConfigTab`：4 个 tab 共用 raw textarea + 保存/恢复按钮；只读字段标 file 名；保存成功显示绿条，失败显示红条（错误来自 main schema parse）。

- `components/WorkbenchLayout.tsx`：把 `view === "kairos"` 分支的 PlaceholderView 换成 `<KairosPage />`。Sidebar 入口已存在，无需改导航。
- `styles.css` 追加 ~330 行 Kairos token：复用项目变量配色与 8px radius、12 px 表格字号、表格行按 row.kind 微调色相，刻意避免引入 Tailwind。

## 测试与验证

- `src/renderer/test/kairos-page.test.tsx` 新增 7 个测试：
  - bridge 缺席降级到 unavailable 卡片。
  - 默认空 state 渲染 + 暂无事件提示。
  - 点击「开启」调 `control({ type: "start" })`。
  - tick + reply 两条事件聚合后表格按 kind 着色；选中 reply 行后右侧详情包含 `stopReason`。
  - readConfig 拿到正文 → paste 编辑 → 点保存 → 调 writeConfig 并显示「已保存」。
  - writeConfig throw 时 alert 包含 `Invalid JSON`。
  - 推送 `kairos:state` 后 header 立即从 `Stopped` 切到 `Ticking` 并更新计数。
- `pnpm test` 全包：agent-core 375/375、desktop 40/40、shared 测试通过。
- `pnpm typecheck` monorepo 三个包均 Done。
- `ReadLints` 对全部新增/修改文件零错误。

## 务实简化（与 plan 对比）

1. **Notes Tab 暂不实现** —— plan 明确 v1 不做，沿用决策。
2. **不引入 router / zustand / Monaco** —— 现有项目无这些依赖，强行加入会污染基础设施。view 切换沿用 Sidebar 的 `view` state；config 编辑用原生 textarea，main 端 schema 兜底。
3. **`kairos:get-events-recent` 暂不回退 jsonl** —— ring buffer 200 条对首屏已足。`hasMore: false` 显式告诉 renderer 当前能拿到的就是这些，避免假阳性"还能加载"。后续 e2e 阶段再补磁盘倒序读。
4. **main IPC 单测跳过** —— desktop 包 vitest 只扫 `.tsx`，没有 Node IPC mock 基础设施；plan §7 已注明"如项目有 main 侧测试基础设施"再写。e2e 实机验证留给 plan 7。
5. **`before-quit` 关 Kairos** —— 用 `app.on("before-quit", ...)` 而非加 IPC 关停接口，简单且对用户透明。

## 已知遗留 / 给 plan 7 的接口

- KairosPage 当前没接 toast 系统，错误显示是行内红条；e2e 阶段如做完整 UX，可考虑迁到全局 toast。
- `notifyMainAgentTurnStart/End` 的 5s cooldown 完全由 controller 内部处理，main 这边不感知。
- `controller.start()` 在 `whenReady` 时被无条件调用：preferences.enabled=false 时 controller 自己会进 `stopped`，不会真正起 tick；renderer 点开启时再走 reloadConfig 改 enabled=true 即可。
