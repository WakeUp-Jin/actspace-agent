# Preload bridge 与 Mock 规范

> 状态：现行规范（2026-10-06，Desktop 前端重构计划 13 落地后）。
> 设计来源：[04 Preload 接口与 MockBridge](../../desktop-frontend-refactor/04-Preload接口与MockBridge.md)；执行记录见 [13 执行过程](../../exec-runs/20261005-desktop-fe-13-preload-bridge/execution-process.md)。
> 验证方式（mock 场景表、验证矩阵）见 [前端验证约定](../../FRONTEND_VERIFICATION.md)。

renderer 与 Electron main 之间只有一条通道：`window.actspace`。它的全部成员由一份契约生成，preload、main、mock 和测试都以这份契约为准。

## 1. 结构

| 位置 | 作用 |
| --- | --- |
| `packages/shared/src/desktop-bridge/contract.ts` | **契约**：`desktopBridgeContract`，22 个域，每个成员一条 spec。唯一事实来源 |
| `packages/shared/src/desktop-bridge/types.ts` | spec 构造函数（`invoke` / `invokeWithDefault` / `event` / `send` / `local`）与类型推导（`BridgeOf`、`SpecInput`、`SpecOutput`、`SpecPayload`） |
| `packages/shared/src/desktop-bridge/build-bridge.ts` | `buildBridge(contract, transport, locals)`：按契约生成冻结的 bridge 对象。preload 和 mock 共用 |
| `apps/desktop/src/preload/index.ts` | 用 `ipcRenderer` 作为 transport 调 `buildBridge`，`exposeInMainWorld("actspace", bridge)`。不写任何业务逻辑 |
| `apps/desktop/src/main/ipc/registry.ts` | `createIpcRegistrar`：`ipc.handle(contract.域.成员, handler)` / `ipc.on(...)`，统一做 sender 校验、guard、middleware、错误包装 |
| `apps/desktop/src/main/ipc/guards.ts` | `IPC_INPUT_GUARDS`：channel → 入参 guard，注册器按 channel 自动套用 |
| `apps/desktop/src/renderer/api/bridge.ts` | renderer 访问 bridge 的唯一入口：`getBridge()`、`hasPreloadBridge()`、`installBridge()`、`domainApi()` |
| `apps/desktop/src/renderer/api/<域>.ts` | 每个域一个转发对象，如 `sessionsApi`、`hostsApi`、`eventsApi`（文件名用短横线：`quick-open.ts`、`english-learning.ts`、`browser-bridge.ts`） |
| `apps/desktop/src/renderer/api/sessions.ts` | 另含会话投影：`createSession`、`forkSession`、`getSession`、`getSessionToolDetail` 在 renderer 里把原始 projection 转成 UI 形状 |
| `apps/desktop/src/renderer/mock/` | 浏览器开发模式与测试用的完整 mock bridge |
| `apps/desktop/src/renderer/test/helpers/bridge.ts` | 测试打桩：`setupBridge`、`overrideBridge`、`resetBridge` |

## 2. 契约约定

- 成员按业务域分组：`app`、`sessions`、`workspaces`、`hosts`、`settings`……事件统一放在 `events` 域。
- channel 字符串只来自 shared 的常量表（`RUNTIME_V2_FIXED_RENDERER_CHANNELS`、`PERFORMANCE_CHANNELS`、`ENGLISH_LEARNING_CHANNELS`、`HOST_IPC`），契约里不写字面量。
- 五种 spec：

| 构造函数 | 方向 | 生成的方法 | 说明 |
| --- | --- | --- | --- |
| `invoke<I, O>(channel)` | renderer → main，有返回 | `(input: I) => Promise<O>` | `I = void` 时无参 |
| `invokeWithDefault<I, O>(channel, default)` | 同上 | `(input?: I) => Promise<O>` | 不传入参时用默认值，如 `sessions.listPage()` |
| `event<P>(channel, defaultPayload?)` | main → renderer | `(listener) => unsubscribe` | main 发送空 payload 时，listener 拿到默认值 |
| `send<I>(channel)` | renderer → main，无返回 | `(input: I) => void` | 目前只有 `appearance.setNativeTheme` |
| `local<F>()` | 不经 IPC | 由 preload / mock 提供实现 | 只用于必须在 preload 里同步完成的能力：`dialogs.getPathForFile`（`webUtils`）、`appearance.setUiZoom`（`webFrame`） |

- `buildBridge` 缺少某个 `local` 实现时直接抛错，不暴露调用即崩的成员。
- bridge 对象及每个域都是冻结的；没有扁平别名，也没有 `window.actspaceHosts`。

## 3. renderer 访问约定

- 组件、hook、store 只 import `api/<域>`，例如 `import { hostsApi } from "../api/hosts"`，再调用 `hostsApi.call({ hostId, method, params })`。
- `window.actspace` 只允许出现在 `main.tsx`、`api/bridge.ts`、`mock/**`、`test/**`。`pnpm check:renderer-bridge` 负责拦截，已接入根 `pnpm test`。它能识别成员访问、可选链、`(window as X).actspace`、下标访问和解构。同一脚本还检查 `api/bridge` 的导入：只有 `api/**`、`main.tsx`、`bridge-bootstrap.ts`、`mock/**`、`test/**` 可以导入它，业务代码不能绕过 `api/<域>` 直接用 `getBridge()`。
- 不做 bridge 存在检查：不写 `window.actspace?.x`、`if (!bridge.x) return`，也不写「当前环境不支持」之类的降级分支。bridge 要么完整，要么启动阶段就进入致命错误页（见 §6）。
- `domainApi(domain)` 在**调用时**才取 `getBridge()`，所以测试替换 bridge 后不需要重新 import 模块。

## 4. 新增一个 IPC 能力

1. **channel 常量**：在对应常量表里加 key 和 channel 字符串。
2. **契约成员**：在 `desktopBridgeContract` 的合适域里加一行，例如 `archive: invoke<S.SessionArchiveInput, S.SessionArchiveResult>(CH.archiveSession)`。新域需要同时新增 `renderer/api/<域>.ts`（`export const <域>Api = domainApi("<域>")`）。
3. **main 注册**：
   - invoke 成员：`ipc.handle(contract.域.成员, (input, event) => …)`，入参和出参类型由契约推导；
   - send 成员：`ipc.on(contract.域.成员, (input, event) => …)`，`input` 是 `unknown`，listener 自己校验；
   - event 成员：main 用常量 `webContents.send(CONST.key, payload)` 发送。
4. **guard**：入参涉及路径、文件、终端、设置写入或远端 Host 时，在 `IPC_INPUT_GUARDS` 里加 guard，并在 `apps/desktop/src/main/test/ipc-guards.test.ts` 补一个合法输入和一个非法输入（见 §5）。
5. **mock**：在 `mock/handlers.ts` 的默认实现里补上，或明确不补。不补时，调用会 reject `Mock bridge does not implement 域.成员`。
6. **调用方**：通过 `<域>Api.成员` 使用。
7. **检查**：`pnpm check:ipc-channels` 以契约为准，下列情况都会失败：
   - 契约里的 invoke / send 没有在 main 注册，或 event 没有由 main 发送；
   - main 注册或发送了契约之外的 channel，或方向与类别不符；
   - 常量表里有契约没用到的 channel；
   - preload 不按契约生成，或绕过契约直接引用 channel。

   另外跑 `pnpm --filter @actspace/desktop typecheck` 和 `pnpm --filter @actspace/desktop test`。

不要在 preload 里加方法、做投影或写业务判断。需要转换返回值时，放在 `renderer/api/<域>.ts` 里，参考 `api/sessions.ts` 的投影函数。

新能力涉及打开外部链接、新开窗口或工作区路径时，还要遵守 [SECURITY](../../SECURITY.md) 的「外部打开白名单」「导航防护」「工作区访问入口」。

## 5. Guard 约定

- 注册器的处理顺序：sender 校验（`assertTrustedSender`）→ guard → middleware → handler。
  - 非信任 sender 发来的 invoke 被拒，guard 和 handler 都不执行；
  - send 成员遇到非信任 sender 时静默忽略。
- guard 只检查类型和形状，不做业务判断。可选字段放行 `null`，因为 handler 统一用 `??` 兜底。
- guard 拒绝时抛 `IpcInputError`，消息格式为「原因 (channel)」，例如 `Invalid terminal input (runtime-v2:fixed-renderer:terminal-write)`。
- handler 抛出非 Error 值时，注册器把它包成 Error，因为 Electron 只能序列化 Error。Error 原样透传，不改原有文案。
- guard 按 channel 查表，与在哪个文件注册无关，所以迁移注册位置不会漏掉 guard。`apps/desktop/src/main/test/ipc-guards.test.ts` 断言用例表的 channel 集合等于 `IPC_INPUT_GUARDS`。

## 6. 启动与 mock 注入

- `main.tsx` 先调用 `ensureBridge()`（`bridge-bootstrap.ts`）：
  - preload 已暴露 bridge → `electron`；
  - 开发模式（`import.meta.env.DEV`）→ 动态 import `mock/install-mock-bridge`，按 `?mock=<场景>` 注入，返回 `mock`；生产构建不包含 mock 代码；
  - 其余情况 → `missing`，渲染「无法连接桌面服务 / Desktop bridge missing」致命页，不渲染 App。
- App 没有 mock 分支：浏览器里跑的是同一套 App 代码，只是 bridge 换成了 mock。

## 7. Mock bridge 约定

- `createMockBridge({ scenario?, handlers? })` 用同一个 `buildBridge(desktopBridgeContract, …)` 生成 bridge，只是把 transport 换成内存实现：
  - invoke 查 handler 表；
  - event 走本地事件总线，`clock.emit("hostsChanged", hosts)` 推送；
  - send 调 handler；
  - local 成员取 handler 里的同名实现。
- handler 按三层合并：默认实现（`mock/handlers.ts`）← 场景覆盖 ← 调用方覆盖。没有实现的成员调用时 reject，不静默返回空值。
- 数据放在 `mock-db.ts` 的内存表。会话按消息列表保存，读取时投影成和 Electron 同形的 `RuntimeV2DesktopSessionProjection` / `Observation`；远端会话 id 与 main 的 `remoteSessionKey` 同格式。
- `MockClock` 提供 `db`、`bridge`（合并覆盖后的 bridge，一个 handler 需要调另一个成员时经它调用）、`emit`、`schedule`。`dispose()` 清理计时器和订阅。
- **场景**（`mock/scenarios/`）：
  - 场景只写种子数据，必要时覆盖少量 handler，例如流式场景在首次 `getPage` 时开始回放；
  - 时间戳固定（`seed.ts`），保证截图稳定；
  - 新增场景：加进 `MockScenario` 类型和 `MOCK_SCENARIOS`，在场景文件顶部写一行说明它覆盖什么，并同步更新[前端验证约定](../../FRONTEND_VERIFICATION.md)的场景表；
  - mock 不是产品状态的证明：真实文件系统、持久化、远端 Host、模型调用只能在 Electron 下验证。

## 8. 测试约定

- `test/setup.ts` 在每个 renderer 用例前装一个默认 mock bridge，用例后 `resetBridge()`。
- 用例里用 `setupBridge(overrides, scenario?)` 替换 bridge：
  - `overrides` 的键是契约路径，如 `{ "sessions.list": async () => [...], "events.hostsChanged": () => () => {} }`；
  - 参数类型按契约推断；
  - 值必须是函数，`undefined` 会直接报错，不要用 `undefined` 模拟「成员缺失」，因为 bridge 不存在缺失成员。
- 渲染后再换实现，用 `overrideBridge(overrides)`。已建立的事件订阅不受影响。
- 推事件、读写内存表，用 `setupBridge` 返回的 `emit` 和 `db`。
- 不要直接给 `window.actspace` 赋值或 `delete`。只有 `test/main-bridge-install.test.ts` 模拟 preload 注入时例外。
