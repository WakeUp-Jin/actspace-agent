# Kairos Main IPC 与 Renderer 桥接

## 目标

把 `KairosController` 接入主进程并桥接到 renderer 的 `KairosPage`：

- main 进程：单例化 KairosController + 注册 `kairos:*` IPC handlers + 在主 Agent runTurn 前后 emit wake/done 信号；
- preload：在 contextBridge 暴露 `window.kairos` API，含 `getState` / `getEventsRecent` / `control` / `subscribe`；
- renderer：实现 `KairosPage` 页面骨架与左右双栏布局，使用 `aggregateKairosEvents` 渲染事件表，4 个 tabs（preferences / paths / blocklist / rule.md）支持读写编辑，状态栏与控制按钮联动；
- 全流程：用户在 KairosPage 点"开启 Kairos" → main 实例化 controller → ring buffer / jsonl 中事件流式推到 renderer → user 在主 chat 发 message → Kairos 中断 → 主 Agent 回复完 5s 后 Kairos 重新 tick。

## 范围

- 包含：
  - `packages/desktop/electron/kairos-ipc.ts`（新增，main 进程 IPC 注册）
  - `packages/desktop/electron/main.ts`（修改：初始化 KairosController + 注入到 IPC + 注入到主 Agent runTurn 钩子）
  - `packages/desktop/electron/preload.ts`（修改：暴露 `window.kairos`）
  - `packages/desktop/src/renderer/types/global.d.ts`（修改：声明 `window.kairos`）
  - `packages/desktop/src/renderer/pages/KairosPage.tsx`（新增）
  - `packages/desktop/src/renderer/pages/kairos/`（新增子组件目录）
    - `KairosHeader.tsx` / `KairosEventTable.tsx` / `KairosEventDetailPanel.tsx`
    - `tabs/PreferencesTab.tsx` / `PathsTab.tsx` / `BlocklistTab.tsx` / `RuleMdTab.tsx`
    - `tabs/NotesTab.tsx`（只读，列出 notes 目录文件）
  - `packages/desktop/src/renderer/state/kairos-store.ts`（新增，Zustand/MobX 与现有风格一致；订阅 IPC 事件并合流到本地 state）
  - 现有 `App.tsx`：注册 `/kairos` 路由（或对应导航入口）
  - 上述模块前端单测（vitest + @testing-library/react，覆盖纯函数 + 关键组件渲染）
- 不包含：
  - controller / runner / scheduler / context / config / observe / briefs 业务逻辑（已在前置 plan 完成）
  - 笔记编辑、pin 等 v2 功能
  - 主题、动画微调（保持与现有 actspace 全局样式一致）

## 依赖关系

- 依赖（必须前置完成）：
  - `kairos_shared_contracts`
  - `kairos_config_and_tool_guard`
  - `kairos_short_term_memory`
  - `kairos_observe_and_briefs`
  - `kairos_controller_runner`
- 产出给：`kairos_e2e_and_docs_sync`

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-kairos-autonomous-mode.md` 的「IPC 契约」「Renderer 渲染规范」「与主 Agent 的交互边界」三章
- `docs/FRONTEND.md` + `docs/FRONTEND_VERIFICATION.md`（前端验证规范）
- `packages/desktop/electron/main.ts`（理解现有 main 启动序列）
- `packages/desktop/electron/preload.ts`（理解现有 API 暴露风格）
- `packages/desktop/src/renderer/App.tsx`（理解现有路由 / 导航 / 主题接入）
- `packages/desktop/src/renderer/components/messages/*`（参考现有事件渲染风格）
- `back-code/heartclaw/apps/web` 中 Kairos 页面（仅参考交互，不要直接抄）

## 背景

- 相关代码路径：
  - `packages/desktop/electron/` 现有 IPC 模块
  - `packages/desktop/src/renderer/state/` 现有 store 风格
- 已知约束：
  - IPC 双向通信走 invoke/handle；事件流走 webContents.send + `ipcRenderer.on`。
  - main → renderer 推 SessionEvent 不允许超过 60 fps（debounce 50ms）。
  - Tailwind 全局样式已就位，直接用现有 token；不引入新设计 token。
  - KairosPage 长时未打开时 controller 仍在运行；打开时 renderer 必须能从 ring buffer + jsonl 还原最近 200 条事件。

## 设计方案

### 1. IPC 通道契约

`packages/shared/src/kairos-contracts.ts`（plan 1 已建）已定义请求/响应类型。本 plan 不引入新 type，只实现 handler。

| Channel | 方向 | Request | Response |
|---|---|---|---|
| `kairos:get-state` | invoke | none | `KairosRuntimeState` |
| `kairos:get-events-recent` | invoke | `{ limit?, before? }` | `{ events: SessionEvent[]; hasMore: boolean }` |
| `kairos:control` | invoke | `KairosControl` | `{ ok: true }` |
| `kairos:read-config` | invoke | `{ name: "preferences"|"paths"|"blocklist"|"rule" }` | `{ content: string }` |
| `kairos:write-config` | invoke | `{ name; content: string }` | `{ ok: true }`（schema 校验失败 throw） |
| `kairos:event` | send (main→renderer) | none | `SessionEvent` |
| `kairos:state` | send (main→renderer) | none | `KairosRuntimeState` |

`read-config` 返回原始文件文本（JSON 或 markdown），让 renderer 直接显示/编辑；保存时 `write-config` 在 main 端做 schema 校验。

### 2. main 进程注册（`electron/kairos-ipc.ts`）

```ts
export function registerKairosIpc(opts: {
  controller: KairosController;
  kairosRoot: string;
}): { dispose: () => void };
```

实现：

- `ipcMain.handle("kairos:get-state", () => controller.getState())`
- `ipcMain.handle("kairos:get-events-recent", (_, { limit=200, before }) => {
    const fromRing = controller.getRingBuffer().tail(limit);
    if (!before && fromRing.length >= limit) return { events: fromRing, hasMore: true };
    // 回退到 short-memory-store 倒序加载，跨日 segment 直到攒满 limit 或读完
    ...
  })`
- `ipcMain.handle("kairos:control", (_, ctrl) => switch ctrl.type { ... })`
- `ipcMain.handle("kairos:read-config", ...)`
- `ipcMain.handle("kairos:write-config", (_, { name, content }) => {
    // 1. 写到磁盘前用对应 schema parse
    // 2. 通过 fs.writeFile atomic 写
    // 3. config watcher 会自动触发 reload；这里不主动 reload
  })`
- 事件桥接：`controller.on("event", e => mainWindow.webContents.send("kairos:event", e))` + 同 `state`，debounce 50ms。

### 3. main.ts 初始化

在 `app.whenReady()` 后：

```ts
const kairosRoot = path.join(app.getPath("userData"), "kairos");
await ensureKairosScaffolding(kairosRoot);              // 缺目录则建 + 写默认 config
const controller = await createKairos({ kairosRoot, llm, toolManagerFactory, contextWindow });
registerKairosIpc({ controller, kairosRoot });

// 主 Agent 集成
mainAgentSession.on("turnStart", () => controller.notifyMainAgentTurnStart());
mainAgentSession.on("turnEnd",   () => controller.notifyMainAgentTurnEnd());
```

`ensureKairosScaffolding` 实现：

- 检查 `config/preferences.json` 等是否存在，缺则写一份带 `enabled=false` 的最小默认
- 创建 `memory/short-term/<YYYY-MM>/` / `briefs/tasks/` / `observe/watch-manifest/` 等目录
- 不动已有内容

### 4. preload + global.d.ts

```ts
// preload.ts
contextBridge.exposeInMainWorld("kairos", {
  getState: () => ipcRenderer.invoke("kairos:get-state"),
  getEventsRecent: (req) => ipcRenderer.invoke("kairos:get-events-recent", req),
  control: (ctrl) => ipcRenderer.invoke("kairos:control", ctrl),
  readConfig: (req) => ipcRenderer.invoke("kairos:read-config", req),
  writeConfig: (req) => ipcRenderer.invoke("kairos:write-config", req),
  onEvent: (listener) => {
    const wrap = (_, e) => listener(e);
    ipcRenderer.on("kairos:event", wrap);
    return () => ipcRenderer.removeListener("kairos:event", wrap);
  },
  onState: (listener) => { ...同上... },
});
```

`global.d.ts` 中声明 `interface Window { kairos: KairosBridge }`，`KairosBridge` 类型从 `@actspace/shared` import。

### 5. Renderer store（`state/kairos-store.ts`）

```ts
export const useKairosStore = create((set, get) => ({
  state: null as KairosRuntimeState | null,
  events: [] as SessionEvent[],
  rows: [] as KairosEventRow[],
  selectedRowId: null as string | null,
  loading: { events: false, state: false },

  init: async () => {
    const [state, recent] = await Promise.all([window.kairos.getState(), window.kairos.getEventsRecent({ limit: 200 })]);
    const rows = aggregateKairosEvents(recent.events);
    set({ state, events: recent.events, rows });
    window.kairos.onState(s => set({ state: s }));
    window.kairos.onEvent(e => {
      const events = [...get().events, e].slice(-500);    // 内存上限 500
      set({ events, rows: aggregateKairosEvents(events) });
    });
  },

  control: async (ctrl) => { await window.kairos.control(ctrl); },
  selectRow: (id) => set({ selectedRowId: id }),
}));
```

### 6. KairosPage 布局

```
+----------------------------------------------------------+
| KairosHeader                                             |
| "Kairos | 状态: Sleeping (Sleep 06:38)"   [开启] [唤醒]   |
+--------------------------+-------------------------------+
| KairosEventTable         | KairosEventDetailPanel        |
| time | kind | summary    | (right panel)                 |
| ...rows...               | - Raw SessionEvent list       |
|                          | - tool args / result          |
+--------------------------+-------------------------------+
| Tabs: [preferences] [paths] [blocklist] [rule.md] [notes]|
| <tab content>                                            |
+----------------------------------------------------------+
```

- 左侧表格点击行 → `selectRow(id)` → 右侧详情显示该 row 关联的 SessionEvent 全部字段。
- header `[开启] [唤醒]` 根据 state 切换显示（enabled=false 显示"开启"；enabled=true 显示"暂停"和"立即唤醒"）。
- 4 个配置 tab：左侧 schema 自动表单 + 右侧原始 JSON 文本编辑器（Monaco 或简易 textarea，选取与项目风格一致的现有组件）；保存按钮调用 `writeConfig`。schema 校验失败时弹 toast 显示错误。
- `rule.md` tab：纯 markdown textarea + 预览。
- `notes` tab：只读列表，点击文件名 → 右侧 markdown 渲染；初版用 `kairos:read-config` 的扩展 `{ name: "notes/<relpath>" }` 或新增 `kairos:read-note` 通道（若新增，需在 plan 1 contracts 中追加；本 plan 内**选择不扩展 contracts**，notes 列表通过 `kairos:get-state` 暂时返回为空数组；v1.1 再实现）。

### 7. 测试

- `aggregateKairosEvents` 已在 plan 1 测过，renderer 仅消费。
- 组件测试：
  - `KairosEventTable.test.tsx`：给定 fixtures 行，断言每个 kind 的图标/文本/状态 class 正确
  - `KairosHeader.test.tsx`：state 不同 phase 时按钮文本正确
  - `PreferencesTab.test.tsx`：表单 onChange + onSave 正确触发 writeConfig
- IPC 集成（main 测）：
  - `kairos-ipc.test.ts`（如项目有 main 侧测试基础设施）：mock controller，断言 `get-state` 返回 controller.getState()；`write-config` invalid JSON throw
- 端到端浏览器 mock（按 `docs/FRONTEND_VERIFICATION.md`）：
  - 用一组 fake events fixture，把 store 的 `init()` 走完后 KairosPage 应渲染对应行数
  - 点击行 → 详情面板出现对应 SessionEvent JSON

## 任务拆分

- [ ] Step 1：新建 `electron/kairos-ipc.ts`，按 §2 注册全部 handlers + 桥接 event/state（含 50ms debounce）。
- [ ] Step 2：修改 `electron/main.ts`：插入 `ensureKairosScaffolding` + 创建 controller + 注册 IPC + 桥接主 Agent 钩子（`turnStart`/`turnEnd`）。如主 Agent 当前没有这两事件，则同步小改造 emit 出来。
- [ ] Step 3：修改 `electron/preload.ts` + `renderer/types/global.d.ts`，暴露 `window.kairos`。
- [ ] Step 4：新建 `renderer/state/kairos-store.ts`，按 §5 写完 store；写一份 store 单测（mock window.kairos）。
- [ ] Step 5：新建 `renderer/pages/KairosPage.tsx` + `kairos/KairosHeader.tsx` + `KairosEventTable.tsx` + `KairosEventDetailPanel.tsx`；接入 store；写表格+详情的组件单测。
- [ ] Step 6：新建 4 个配置 Tab 组件：`PreferencesTab` / `PathsTab` / `BlocklistTab` / `RuleMdTab`；每个 Tab 含"读 → 编辑 → 保存"循环；写 `PreferencesTab.test.tsx`（其它 Tab 测试可酌情简化）。
- [ ] Step 7：在 `App.tsx`（或对应路由表）注册 `/kairos` 路由 + 在侧栏/导航增加入口；按现有设计风格放置图标 + label。
- [ ] Step 8：浏览器 mock 流程跑通：手工 fixture 注入 events → KairosPage 渲染表格 + 切换 Tab + 编辑保存配置；记录 `docs/histories/<month>/<timestamp>-kairos-main-ipc-and-renderer.md`。
- [ ] Step 9：在 dev electron 实机跑一次：开启 Kairos → 5s 内看到第一次 tick → user 在主 chat 发一句 → KairosPage 显示 `sleep_interrupted` 行；按 `docs/FRONTEND_VERIFICATION.md` 记录验收。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop test`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm typecheck`
- 手工检查：
  - 启动 dev 应用（`pnpm dev:log`），访问 KairosPage：
    - 默认状态：enabled=false，按"开启"后 5s 内出现第一行 `tick` + 若干 `tool_call` + `sleep_start`
    - 主 chat 发消息 → KairosPage 显示 `sleep_interrupted` → 主 Agent 完成后再 5s 出现下一个 tick
    - 编辑 `preferences.json` 把 enabled 设为 false 保存 → controller 停止 → header 状态变 `stopped`
    - 编辑 `paths.json` 加一个新 watch 路径 → 下一次 tick 后 KairosEventTable 出现该路径的 added 行
- 观测检查：
  - `<userData>/kairos/memory/short-term/...jsonl` 实时增长
  - dev tools network/IPC 面板没有红色错误

## 风险

- 风险：main → renderer 的事件推送频率过高导致 UI 卡顿。
- 缓解：debounce 50ms，前端 store 上限 500 条；超出时丢最早。

- 风险：用户在 KairosPage 直接编辑 JSON 写出非法格式。
- 缓解：write-config handler 在 main 端 zod parse；失败时 throw 到 invoke → renderer 弹 toast；磁盘原文件不动。

- 风险：主 Agent 没有 `turnStart`/`turnEnd` 事件，需要本 plan 改造。
- 缓解：若不存在，最小改动在 engine/agent.ts 中加 emit；保持向后兼容（无监听则空操作）。本 plan Step 2 时确认是否需要这次小改造。

- 风险：4 个配置 Tab 在初版直接给 raw JSON 编辑体验差。
- 缓解：v1 提供"基础表单 + JSON 文本"两栏；JSON 文本作为兜底，保证 schema 改变时无需更新 Tab；后续 v1.1 再优化纯表单体验。

## 决策记录

- 2026-05-27：v1 不实现 `kairos:read-note`，notes Tab 暂为占位。原因：避免本 plan 范围继续扩张；笔记读取走与配置同模式即可，留到 v1.1 单独迭代。
- 2026-05-27：IPC event 推送做 50ms debounce 而不是逐条 flush。原因：tick 内有时会瞬间产 10+ event（assistant + 多 tool_call + tool_result），逐条 send 在 Electron 上有明显卡顿；50ms 内攒批一次发出对 UX 无感。
- 2026-05-27：KairosPage 直接消费 `aggregateKairosEvents` 不在 store 层做更复杂的派生。原因：保持 store 简单，派生函数从 shared 来；未来若需要排序/筛选另写 selector 而不是改 aggregator。
