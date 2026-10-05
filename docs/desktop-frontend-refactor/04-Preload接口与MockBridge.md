# 04 Preload 接口与 Mock Bridge

> 范围：`apps/desktop/src/preload/index.ts`（623 行）、`src/global.d.ts`（319 行）、`renderer/remote-hosts.d.ts`、renderer 中所有 `window.actspace*` 调用、App 中的浏览器 mock 分支、测试中的手写 bridge。
> 目标：bridge 只有一份类型契约；renderer 通过按域分组的 `api/` 访问；浏览器 mock 模式保留，改成注入式 mock bridge。
> 已拍板：D5（保留 mock 模式，改为注入式）。
> 迁移去向：`docs/design-docs/frontend/front-preload-bridge与mock规范.md`（新建），`docs/FRONTEND_VERIFICATION.md` 补「浏览器 mock 模式」一节。

## 1. 现状

### 1.1 三处手写，彼此不受约束

| 位置 | 内容 | 约束 |
| --- | --- | --- |
| `@actspace/shared` | channel 常量（FIXED 约 142、DESKTOP 20、DESKTOP_SHELL 10、HOST_IPC、PERFORMANCE…） | 只有字符串，没有入参 / 出参类型 |
| `preload/index.ts` | `FIXED_RENDERER_INVOKE_CHANNELS` 短别名表（`:176-312`）+ `exposeInMainWorld("actspace", {...})`（`:318`）+ `exposeInMainWorld("actspaceHosts", {...})`（`:611`） | 130 处 `as Promise<...>` 强转；没有 `satisfies Window["actspace"]` |
| `global.d.ts` | `Window["actspace"]` 约 118 个成员，**126 处 `?:`** | 与 preload 无编译期关联 |
| `renderer/remote-hosts.d.ts` | `Window["actspaceHosts"]`，`call(...)` 返回 `Promise<unknown>` | renderer 处处 `as HostDescription` 强转 |

后果：

- preload 少暴露一个方法、改了参数，TS 不报错，运行时 `undefined is not a function`。
- 大量成员标成可选，是为了让测试少 stub 几个方法。renderer 于是到处写 `window.actspace.xxx?.(...)` 或 `if (!window.actspace.xxx) return`。在 Electron 下这些分支永远不会走，等于死代码。它们还掩盖了「这个功能在某种环境下真的不可用」和「只是类型偷懒」之间的区别。
- 同一个 channel 有三个名字：常量名、channel 字符串、短别名（`"agent:task-command"`）。

### 1.2 renderer 直接调用面

- `window.actspace`：349 处，分布在 49 个文件（SettingsPage 42、App 80、ProviderSettings 20、ModelSettings 14、Composer 13…）。
- `window.actspaceHosts`：19 处。
- 业务组件直接拿 IPC，无法在组件测试中按域替换，只能整体伪造 `window.actspace`。

### 1.3 浏览器 mock 模式（当前实现）

- `App.tsx:76` `hasActspaceBridge()`，App 内 40 处分支，App 外 0 处。
- 无 bridge 时：
  - `createLocalEmptySession`（`:245`）/ `createLocalForkSession`（`:285`）在内存中造会话。
  - `localSessionRecords` state 保存这些假会话。
  - `agentRunResult` state（5 处）只在这条路径上有值，但它进入了正文合并（`:2157`）、context 计算（`:2208/2212`）、`isSessionReady`（`:2308`）。
- 其他组件（Settings、Sidebar 等）没有 mock 分支，无 bridge 时直接报错或空白。
- `docs/FRONTEND_VERIFICATION.md:58` 的约定：「没有 Electron preload 时，页面不应该白屏……或只在测试 / 显式 demo harness 中使用 mock bridge」。当前实现违反这条：mock 逻辑写在生产 App 里，而且只覆盖了 App 的一部分。

### 1.4 测试里的 bridge

36 个 renderer 测试文件各自手写 `window.actspace = {...}` 或 `vi.stubGlobal`，每个只 stub 用到的几个方法。这也是 `global.d.ts` 大量可选成员的原因之一。

## 2. 目标

```text
@actspace/shared
  desktop-bridge/contract.ts        ← 唯一契约：channel + input + output（+ 事件）
        │
        ├──▶ main/ipc/registry.ts   (01：按 contract 注册 handler)
        ├──▶ preload/index.ts       (按 contract 生成方法，satisfies DesktopBridge)
        └──▶ renderer/api/*.ts      (按域封装，组件只 import 这里)
                    │
                    └── bridge 来源：window.actspace（Electron）或 createMockBridge()（浏览器 / 测试）
```

### 2.1 契约

```ts
// packages/shared/src/desktop-bridge/contract.ts
export const desktopBridgeContract = {
  sessions: {
    listPage:      invoke<ListSessionPageInput, SessionPage>(CH.listSessionPage),
    getPage:       invoke<GetSessionPageInput, SessionPageEnvelope>(CH.getSessionPage),
    rename:        invoke<RenameSessionInput, void>(CH.renameSession),
    // ...
  },
  tasks: {
    command:       invoke<TaskCommand, TaskCommandResult>(CH.taskCommand),
    submit:        invoke<SubmitTaskInput, TaskSubmissionResult>(CH.submitTask),
    abort:         invoke<AbortAgentRunInput, boolean>(CH.abortAgentRun),
  },
  workspaces: { ... },
  review:     { ... },
  terminal:   { ... },
  settings:   { ... },
  skills:     { ... },
  extensions: { ... },
  dialogs:    { selectFiles: ..., selectImages: ..., selectWorkspaceDirectory: ... },
  app:        { bootstrap: ..., performance: ..., localUpdate: ... },
  events: {
    agentStream:      event<AgentStreamEvent>(CH.agentStream),
    sessionLive:      event<SessionLiveEvent>(CH.sessionLive),
    terminal:         event<TerminalEvent>(CH.terminalEvent),
    reviewChanged:    event<ReviewChangedEvent>(CH.reviewChanged),
    // ...
  },
} as const;

export type DesktopBridge = BridgeOf<typeof desktopBridgeContract>;   // 由 contract 推导，全部必选
```

- **全部必选**。某个能力只在部分环境存在（比如 `getPathForFile` 依赖 Electron 的 `webUtils`），在契约里显式建模为 `capabilities.filePaths: boolean`，不靠方法是否存在来判断。
- Host bridge 同样纳入契约（`hosts` 域），`call` 改为按 method 区分返回类型：

  ```ts
  call<M extends HostMethod>(hostId: string, method: M, params: HostParams<M>): Promise<HostResult<M>>;
  ```

  `host.describe` 返回 `HostDescription`，renderer 不再写 `as HostDescription`。

- 按域分组后，preload 只暴露一个全局：`window.actspace = { sessions, tasks, ..., hosts, events }`。`actspaceHosts` 合并进来（兼容期保留别名）。

### 2.2 preload

```ts
// preload/index.ts（目标约 120 行）
import { desktopBridgeContract, type DesktopBridge } from "@actspace/shared/desktop-bridge";
import { buildBridge } from "./build-bridge";          // 遍历 contract，invoke → ipcRenderer.invoke，event → ipcRenderer.on + 返回取消函数

const bridge = buildBridge(desktopBridgeContract, ipcRenderer) satisfies DesktopBridge;
contextBridge.exposeInMainWorld("actspace", { ...bridge, getPathForFile: (f: File) => webUtils.getPathForFile(f) });
```

- 删除短别名表（`:176-312`）和 130 处 `as Promise<...>`。
- 删除 preload 中的 `projectChatWindow` / `projectChatEvents` / `createMessageBlocks` import（01 §P1-7）。
- 事件订阅统一返回取消函数，不再出现「有的返回 unsubscribe、有的返回 void」。

### 2.3 renderer/api

```ts
// renderer/api/bridge.ts
let current: DesktopBridge | undefined;
export function installBridge(bridge: DesktopBridge): void { current = bridge; }
export function bridge(): DesktopBridge {
  if (!current) throw new Error("Desktop bridge not installed");
  return current;
}

// renderer/api/sessions.ts
export const sessionsApi = {
  listPage: (input: ListSessionPageInput) => bridge().sessions.listPage(input),
  // 需要时在这里做 renderer 侧的轻量适配（错误归一、默认参数），不做业务
};
```

- 组件和 hook 只 import `api/*`，禁止直接写 `window.actspace`（用 ESLint `no-restricted-properties` 或一个 grep 检查拦截）。
- `main.tsx` 启动时：

  ```ts
  if (window.actspace) installBridge(window.actspace);
  else if (import.meta.env.DEV) installBridge((await import("./mock/create-mock-bridge")).createMockBridge());
  else renderFatal("Desktop bridge missing");
  ```

- 生产构建不包含 mock 代码（动态 import + `import.meta.env.DEV` 分支会被 tree-shake；在 `check:bundle` 或构建产物 grep 中验证）。

### 2.4 注入式 Mock Bridge

```text
renderer/mock/
  create-mock-bridge.ts     ← 返回完整 DesktopBridge；内部是内存数据库
  mock-db.ts                ← sessions / workspaces / settings / hosts 的内存表
  scenarios/                ← 可选场景：empty、long-session、streaming、remote-host-offline、approval-pending …
  stream-player.ts          ← 按脚本回放 agentStream 事件，验证流式 UI
```

- 场景通过 URL 选择：`http://127.0.0.1:5173/?mock=streaming`。默认 `empty`。
- `createLocalEmptySession` / `createLocalForkSession` 的逻辑搬进 `mock-db`，App 中的 40 处 `hasActspaceBridge()` 分支全部删除。
- `agentRunResult` state 删除：mock 下的会话也通过 `sessions.getPage` 返回 envelope，走和 Electron 一样的路径。
- 远端 Host 也有 mock：`scenarios/remote-host.ts` 提供一台 connected、一台 offline、一台 revoked 的 Host，供 06 的运行位置菜单做视觉验证。
- 这符合 `FRONTEND_VERIFICATION.md:58`：mock 只存在于显式 demo 边界（`renderer/mock/`，dev only），生产 App 不含假数据。

### 2.5 测试

```ts
// renderer/test/helpers/bridge.ts
export function setupBridge(overrides?: DeepPartial<DesktopBridge>, scenario: MockScenario = "empty"): MockBridgeHandle
```

- 基于同一个 `createMockBridge`，测试只覆盖关心的方法，其余方法有合理默认实现。
- 36 个测试文件的手写 stub 逐步迁移（08 有清单）。
- 因为契约全部必选，`DeepPartial` 只出现在测试 helper 的参数上，不污染生产类型。

## 3. 域划分（初稿）

按现有 `global.d.ts` 成员归类，实施时以 contract 为准：

| 域 | 主要成员 | 主要调用方 |
| --- | --- | --- |
| `app` | bootstrap、performance、localUpdate、openExternal（经 01 的白名单） | App、Settings |
| `sessions` | listPage、getPage、create、rename、pin、archive、fork、delete、quickOpen | App、Sidebar |
| `tasks` | command、submit、abort、listPendingApprovals、submitApproval | App、ApprovalParts |
| `workspaces` | list、create、setVisibility、gitContext、openInIde、listDir、readFile、statFile | App、右侧面板 |
| `review` | summary、diff、stage、commit、createPr | Review 面板 |
| `terminal` | create、write、resize、dispose | Terminal |
| `dialogs` | selectFiles、selectImages、selectWorkspaceDirectory、importComposerImage | Composer、Sidebar |
| `settings` | get、update、providers、models、customConnections、systemPrompt、search | SettingsPage 等 |
| `skills` | list、install、uninstall | Composer、Settings |
| `extensions` | browserBridge 系列 | ExtensionsPage |
| `visualize` | convertReply、list | 消息区 |
| `hosts` | list、add、remove、reconnect、activate、call、preview、download | `target/host-directory`（03） |
| `events` | agentStream、sessionLive、terminal、reviewChanged、hostsChanged、hostEvent、uploadProgress | 各 store |

english-learning 相关 channel 是否仍在使用，实施前先查一遍（07 已列为待核实）。

## 4. 实施步骤

| 步骤 | 内容 | 验证 |
| --- | --- | --- |
| S1 | 在 shared 定义 contract 与 `DesktopBridge` 类型；先只覆盖当前 preload 实际暴露的方法 | `tsc` |
| S2 | preload 改为 `buildBridge(contract) satisfies DesktopBridge`；删短别名表；保留旧的扁平方法名作为兼容层（一轮） | `runtime-v2-preload-bundle.test.ts`；Electron 启动冒烟 |
| S3 | `global.d.ts` 改为 `actspace: DesktopBridge`，删除手写声明与 `remote-hosts.d.ts` | `tsc` 报出的所有 `?.` 调用逐个改为直接调用 |
| S4 | `renderer/api/*` + `installBridge`；按域迁移调用方，先 App，再 Settings 系列，再其余 | grep `window.actspace` 只剩 `main.tsx` 和 `api/bridge.ts` |
| S5 | `renderer/mock/` + 场景；删除 App 中 40 处 `hasActspaceBridge()`、`createLocal*Session`、`localSessionRecords`、`agentRunResult` | `pnpm dev:renderer` 打开 `?mock=empty / streaming / remote-host` 三个场景无白屏 |
| S6 | 测试 helper `setupBridge`；迁移 36 个手写 stub | 测试全绿；`global.d.ts` 不再有可选成员 |
| S7 | 删除兼容层（扁平方法名、`actspaceHosts` 别名）；加 `no-restricted-properties` 检查 | CI |

## 5. 验收

- `global.d.ts` 中 `Window["actspace"]` 没有手写成员，只有 `DesktopBridge`；没有可选成员（`capabilities` 除外）。
- preload 中 `as Promise<` 出现 0 次。
- renderer 中 `window.actspace` 只出现在 `main.tsx`、`api/bridge.ts`。
- `App.tsx` 中 `hasActspaceBridge` 出现 0 次。
- 生产构建产物中搜不到 `create-mock-bridge` / 场景数据。
- 浏览器 `pnpm dev:renderer`：三个 mock 场景可用，Settings 页在 mock 下可打开（当前会报错）。

## 6. 开放问题（2026-10-05 已拍板）

1. contract 放 **`@actspace/shared`**。
2. 兼容层**只保留一个提交周期**：S2 引入，S7 删除，中间不发版。
3. mock 场景**只做 dev 场景**，不引入 Story 工具。
