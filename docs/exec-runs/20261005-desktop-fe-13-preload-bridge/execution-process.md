# 13 Preload 与 Mock Bridge — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/13-Preload与MockBridge执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-13`，从 `refactor/desktop-frontend@05ffe370`（12 的 squash 提交）拉出
- **开始时间**：2026-10-06 02:08
- **结束时间**：2026-10-06

## 执行时间线

### T0：启动与基线清单

- 12 的 squash 提交 `05ffe370` 已登记到 12 的交接和 00 §11。
- **Preload**（`P/index.ts`，623 行）：
  - 两个全局：`actspace`（151 个成员）、`actspaceHosts`（11 个成员）。
  - 短别名表 `FIXED_RENDERER_INVOKE_CHANNELS` 共 **134** 条（`:175-310`），全部映射到 `RUNTIME_V2_FIXED_RENDERER_CHANNELS`。计划背景里写的「10 条」是笔误。口径：`RUNTIME_V2_FIXED_RENDERER_CHANNELS` 常量共 142 个 channel，其中 134 个经短别名 invoke，另外 8 个是事件或 send（`reviewChanged`、`terminalEvent`、`quickOpenRequested`、`settingsChangedV4`、`agentStream`、`sessionLiveEvent`、`appShuttingDown`、`setNativeTheme`）。preload 没有真正的字面量 channel，`"session:create"` 这类字符串只是短别名。
  - 直接 `ipcRenderer.invoke` 14 处（performance 2、english-learning 4、hosts 8），`ipcRenderer.on` 11 处，`ipcRenderer.send` 1 处（`setNativeTheme`）。
  - `as Promise<` 130 处。
  - 不走 IPC 的成员：`getPathForFile`（`webUtils`）、`setUiZoom`（`webFrame`）。
  - **投影逻辑不止计划写的两处**：`createSession`、`forkSession`、`getSession` 调 `projectChatWindow`；`getSessionToolDetail` 调 `createMessageBlocks(projectChatEvents(...))`。共 4 个方法，renderer 调用点各 1 处（`App.tsx` 3 处、`ConversationView.tsx` 1 处）。
  - 参数改写：`listSessionPage` / `listSessions` / `createSession` / `listPendingApprovals` 传 `input ?? {}`；`listSkills` 默认 `{}`；`actspaceHosts.call(hostId, method, params)` 打包成对象；`onShuttingDown` 没有 payload 时补 `{ reason: "normal" }`。
- **类型**：`global.d.ts` 319 行，可选成员 125 个；`R/remote-hosts.d.ts` 存在。`HOST_METHODS` 只有方法名，没有按方法区分的参数 / 返回类型；renderer 生产代码中 `as Host*` 强转 1 处。
- **Renderer 调用面**（不含 `test/`）：`window.actspace` 332 处 / 46 个文件；`window.actspaceHosts` 18 处；`hasActspaceBridge` 在 App 中 40 处。
- **`agentRunResult`**：`setAgentRunResult` 共 5 处，**全部是 `setAgentRunResult(null)`**，没有写入非空值的地方；读取点 4 处（`:2163`、`:2214`、`:2218`、`:2314`）。确认是死状态，T8 删除。
- **Main 注册**：
  - `fixed-renderer-ipc.ts` 局部 `handle` 111 次，包装里有远端路由（`createSession` 带 `hostId`、远端审批、远端会话 id）和 `mergeList`；
  - `desktop-shell-ipc.ts` 23 次，包装里拒绝远端会话 / Host 输入；
  - `remote-hosts/ipc.ts` 8 次，`english-learning-ipc.ts` 4 次，`performance-ipc.ts` 直接 `ipcMain` 2 次；
  - `main/index.ts` 现在**没有** IPC 注册（计划写的约 4 处已在 11 之前移走），T3 不涉及它。
  - 所以注册器除了 sender 校验和 guard，还需要一个按文件提供的包装钩子，承接这两段远端逻辑。
- **测试 stub**：按计划的 grep（`window.actspace =` / `defineProperty(window, "actspace"` / `stubGlobal("actspace"`）共 **35** 个文件，与计划一致；另有若干文件只在 afterEach 里 `delete window.actspace`，`composer.test.tsx` 用 `Partial<typeof window.actspace>` 类型。stub `actspaceHosts` 的 3 个：`app-remote-host-refresh`、`host-feedback`、`remoteArtifact`。

#### 实施顺序上的调整（不改设计）

- **T4 与 T5 合并为一个提交。** 投影移出 preload 之后，4 个调用点必须同一提交改走 `R/api/sessions.ts`，否则中间提交里 App 拿到的是原始 projection。计划「回滚」一节本来就要求 T4–T6 连同 T5 一起 revert。对照测试照常写。
- **`R/api/bridge.ts`（`installBridge` / `getBridge`）提前到 T4 引入。** `R/api/sessions.ts` 需要它；T7 再把其余域迁过去。
- **兼容层的类型。** 契约按域分组（`sessions.create` 等），而现有 332 处调用点是扁平名。T6 把 `Window["actspace"]` 改成必选类型时，T7 还没迁移，所以 T6 用 `DesktopBridge & LegacyFlatBridge`。`LegacyFlatBridge` 由 shared 中的扁平名映射表推导，T10 连同映射表一起删除。T1 的「覆盖 global.d.ts 全部成员名」相应落实为：`global.d.ts` 的每个成员名都在映射表中（或是 4 个已移到 renderer 的投影方法），映射表的每个目标都是契约中存在的方法。

### T1：契约模块

- 新增 `S/desktop-bridge/`：
  - `types.ts`：四种描述 `invoke` / `event` / `send` / `local`，外加 `invokeWithDefault`（preload 原来补 `{}` 的 5 个调用：`approvals.listPending`、`sessions.listPage`、`sessions.list`、`sessions.create`、`skills.list`）和 `event(channel, defaultPayload)`（`events.shuttingDown` 补 `{ reason: "normal" }`）。`BridgeOf` 由描述推导方法签名：入参 `void` 时无参，入参含 `undefined` 或有默认值时可选；事件返回取消函数。
  - `contract.ts`：22 个域（T4 冒烟时核对更正，原记为 23），共 162 个成员（151 + `actspaceHosts` 11）。channel 全部取自现有 4 组常量，正好覆盖全部 160 个 channel，外加 2 个 `local`（`dialogs.getPathForFile`、`appearance.setUiZoom`）。
  - `legacy.ts`：旧扁平名 → `[域, 成员]` 映射（`actspace` 147 个、`actspaceHosts` 10 个），以及推导出的 `LegacyFlatBridge` / `LegacyHostsBridge`。4 个投影方法和 `hosts.call` 的签名单独声明。T10 删除。
- 域划分以设计 04 §3 的初稿为基础，按实际成员做了细化（04 §3 写明「实施时以 contract 为准」）：
  - 所有事件集中在 `events` 域（与 04 一致）。
  - 04 中的 `settings` 拆成 `settings` / `providers` / `models` / `quickOpen`；`app` 拆出 `performance` / `updates` / `usage`。
  - 新增 `approvals` / `appearance` / `englishLearning`；04 的 `extensions` 命名为 `browserBridge`。
- 4 个投影方法在契约里是**原始返回**：`sessions.create` / `fork` 返回 `RuntimeV2DesktopSessionProjection`，`sessions.get` 返回 `… | null`，`sessions.getToolDetail` 返回结构类型 `DesktopToolDetailPage`（`{ snapshot, journal }`，两个字段的类型本来就在 shared `runtime-v2`）。shared 不再需要 `@actspace/desktop-app`。
- `hosts.call` 的返回仍是 `unknown`，原因是 `HOST_METHODS` 只有方法名。设计 04 想要按 method 区分返回类型，这需要先在 host-protocol 补一张方法类型表，属于协议层改动，本计划不做，记入交接。
- `getPathForFile` 的参数用最小结构 `DesktopFileHandle`（`name`、`size`），因为 shared 的 `lib` 没有 DOM。
- 接线：`packages/shared/package.json` 的 exports 加 `./desktop-bridge`；`vite.config.mts`、`vitest.config.ts` 的 alias 加在 `@actspace/shared` 之前。
- **测试**：
  - `S/test/desktop-bridge-contract.test.ts`（6 个用例）：channel 无重复；channel 集合与 4 组常量**完全相等**；`local` 只有 2 个；默认入参和默认 payload 与旧 preload 一致；映射表的每个目标都存在；映射表 + 4 个投影方法 + `hosts.call` 恰好覆盖全部成员各一次。
  - **偏离**：计划把 `expectTypeOf` 断言写在 shared 测试里，但 shared 的 tsconfig 排除了 `src/**/test`，tsc 不会检查这些断言。所以类型断言放在 `R/test/desktop-bridge-contract-types.test.ts`，renderer tsconfig 会检查它。内容包括：`Window["actspace"]` / `Window["actspaceHosts"]` 的每个成员名都在兼容类型中；兼容类型可以赋给 `Required<旧声明>`；抽查 6 个推导签名。
  - **变异验证**：把 `tasks.abort` 的出参改成 `string`，再删掉 `submitTask` 的映射，desktop typecheck 报 3 个错误（缺成员、不可赋值、返回类型不符）；恢复后通过。
- **验证结果**：
  - shared typecheck 通过；shared vitest 18 个文件 / 144 个用例全部通过。
  - desktop typecheck 通过。
  - desktop vitest：文件 139 通过 / 1 失败 / 1 跳过，用例 1044 / 1 / 2，比基线多 1 个文件、3 个用例；唯一失败仍是已知的 `workspace-git-context-service`。
  - `check:ipc-channels`（160 个 channel）、`check:frontend-tokens`、`check:frontend-theme`、`check:current-docs` 全部通过。

### T2：main 端注册器与 guard

- `M/ipc/registry.ts`：`createIpcRegistrar({ getWindow, untrustedMessage?, middleware?, guards? })`，返回 `handle(spec, handler)`、`on(spec, listener)`、`channels` 和 `dispose()`。
  - `handle`：依次做 sender 校验（11 的 `assertTrustedSender`）、guard、middleware、handler。guard 拒绝时抛 `IpcInputError`，消息为「原因 (channel)」。handler 抛出非 Error 值时包成 Error，因为 Electron 只能序列化 Error；Error 原样透传，不改现有文案。
  - `on`：用于 send 成员。非信任 sender 静默忽略，与现有 `setNativeTheme` 的行为一致。
  - `middleware` 就是 T0 记下的「按文件包装钩子」：fixed-renderer 的远端路由、desktop-shell 的远端拒绝、english-learning 的错误文案收口都放在这里。
- **偏离（形态）**：计划写的是 `registerContract(contract, handlers, { guards })`，一次传入整份 handler 对象。实际改成注册器加逐个 `handle(spec, handler)`。原因：
  - 160 个 channel 分散在 5 个文件，每个文件只注册契约的一部分。
  - 逐个 `handle` 时，T3 每个文件的 diff 基本是一行换一行（`handle(CH.x, (_event, input: T) => …)` → `ipc.handle(contract.d.x, (input) => …)`），不必把 900 多行的文件重排成对象字面量。
  - handler 的入参和出参类型仍由契约约束（`SpecInput` / `SpecOutput`）。
  - 职责不变：sender 校验、guard、错误包装都在注册器里统一完成。
- `M/ipc/guards.ts`：`IPC_INPUT_GUARDS` 是 channel → guard 的表，注册器按 channel 自动套用，迁移到哪个文件注册都不会漏。guard 只看类型和形状；可选字段放行 `null`（handler 都用 `??` 兜底）。共 22 个 channel：
  - 工作区文件读取：`readFile`、`statFile`、`listDir`、`sessions.readArtifact`。
  - 工作区路径：`createFolder`、`openInIde`、`setVisibility`、`getGitContext`、`sessions.setWorkspace`、`dialogs.selectWorkspaceDirectory`。
  - 终端：`create`、`write`。
  - 设置写入：`settings.update`、`updateV4`、`writeSystemPrompt`。
  - Host：`add`（配对）、`remove`、`reconnect`、`activate`、`preview`、`download`、`call`。`remote-hosts/ipc.ts` 里原有的内联校验搬了过来，拒绝原因沿用原文案，T3 删除内联重复。
- **openExternal 不需要 guard**：renderer 没有对应的 channel。外链只经 `window-security.ts` 的导航拦截走 `openExternalSafely`，不在 IPC 面上。
- `tsconfig.electron.json` 只 include 明确列出的入口，所以注册器和 guard 在 T3 被 main 引用之前不会被 `typecheck` 覆盖。本步用一个临时 tsconfig（继承 electron 配置，只 include 新文件和测试）单独检查，0 错误，检查完已删除。
- **测试**：
  - `M/test/ipc-registry.test.ts`（7 个用例）：非信任 sender 被拒，且 guard 和 handler 都不执行；guard 拒绝时抛 `IpcInputError`，消息带 channel，handler 不执行；handler 拿到入参和 event；middleware 可以短路，也可以包住 handler；非 Error 被包成 Error；send 成员忽略非信任 sender；`dispose` 清空。
  - `M/test/ipc-guards.test.ts`（23 个用例）：断言用例表与 `IPC_INPUT_GUARDS` 的 channel 集合相等；每个 guard 至少有一个合法输入和一个非法输入。

### T3：main 注册改走注册器（逐文件提交）

- **审计脚本先行（随 T3a 提交）**：`check-ipc-channels` 原先只认 `handle(常量.key)`，迁移后 `ipc.handle(contract.域.成员)` 会被判为未注册。新增 `parseContract`，从契约源码解析「域.成员 → channel」（支持 `as CH` 别名），main 中引用契约的 `handle(` / `.on(` 按此解析。`.on(` 只在契约引用上放开，避免把 `win.on("closed")` 这类事件名当成 channel。T10 再整体改成以契约为准。`ipc-channels.test.mjs` 新增 2 个用例，共 8 个。
- **T3a `performance-ipc.ts`**：两个 `ipcMain.handle` 改为 `ipc.handle(contract.performance.*)`，局部 `authorize` 删除，sender 校验交给注册器，`dispose` 改为调 `ipc.dispose()`。注册器的 handler 是 async，所以 `performance-ipc.test.ts` 的同步断言改为 `await … rejects / resolves`，断言内容不变。
- **T3b `english-learning-ipc.ts`**：4 个 handler 改为 `ipc.handle(contract.englishLearning.*)`。原包装里「所有错误统一成『英语辅助学习操作失败…』」改由 middleware 承担，非信任 sender 的文案通过 `untrustedMessage` 保留。`setTarget` 的内联校验留在 handler 里，因为它的文案会被 middleware 统一替换，不适合放进共享 guard。现有测试无需改动，直接通过。
- **T3c `remote-hosts/ipc.ts`**：8 个 handler 改为 `ipc.handle(contract.hosts.*)`。删除内联的形状校验（T2 已搬进 `guards.ts`，拒绝原因文案不变，消息末尾多了 channel）。`hosts.call` 的方法白名单和「握手、配对只能由 main 发起」也随之移进 guard。handler 拿到的是契约类型，`as AddHostInput` / `as HostMethod` 强转删除。新增 `M/test/remote-host-ipc.test.ts`：配对方法被拒，缺 endpoint 被拒，`activate(1)` 被拒，以上三种情况都不会调到 registry；合法调用正常转发；非信任 sender 被拒；`dispose` 清空。
- **T3d `desktop-shell-ipc.ts`**：23 个 handler 用一次性 codemod（`/tmp/codemod-handle.mjs`，不入库）改写：channel 常量按契约解析为 `contract.域.成员`；参数从 `(_event, input: T)` 改为 `(input)`，用到 event 的改为 `(input, event)`；入参类型改由契约推导，原来的 9 个入参类型 import 随之删除。「远端会话拒绝」从包装函数移到 middleware，文案不变。
  - 契约的出参类型约束暴露了一处：`copyGitApplyCommand` 中 `if (!loaded.ok) return loaded` 在这里不收窄，tsc 认为可能返回成功分支。改成 `loaded.ok === false` 后通过。返回的仍是同一个对象，`currentGeneration` 照常透传，运行时行为不变。
  - 执行顺序有一处细微变化：guard 现在先于远端拒绝执行。远端会话的入参只要形状合法，仍会被 middleware 拒绝；形状非法时，报错从「远端不可用」变为 guard 的原因。两种情况都是拒绝。
  - `runtime-v2-desktop-shell-ipc.test.ts` 无需改动，直接通过。main 测试：文件 63 通过 / 1 失败（已知）/ 1 跳过，用例 420 / 1 / 1。
- **T3e `fixed-renderer-ipc.ts`**：111 个 handler 用同一 codemod 改写为 `ipc.handle(contract.域.成员)`，无未解析项。局部 `handle` 包装和 `channels` 数组删除，`registerFixedRendererSettings` / `registerFixedRendererHostCapabilities` 改为接收 `IpcRegistrar`。
  - 远端会话路由整体移入 middleware：带 `hostId` 的新建、`remote-approval:` 审批、`host:` 会话 id 转给 remote adapter，列表结果合并远端条目。逻辑和顺序与原包装一致。
  - `setNativeTheme` 改为 `ipc.on(contract.appearance.setNativeTheme, …)`，非信任 sender 静默忽略（与原 `isTrustedSender` 判断一致），`dispose` 只剩 `ipc.dispose()`。
  - 契约出参约束暴露了 16 处类型不一致，均为类型层面修正，不改运行时返回值：
    - 对象字面量被推断为 `ok: boolean`、`status: string`。为 `tasks.submit` 的提交过程，`providers.addCredential` / `updateCredential` / `testCredential` / `removeCredential`，`models.add` / `update` / `remove` 和 `toModelMutationResult` 标注了返回类型。
    - `providerBalance` 改为按 provider 泛型返回 `ProviderBalanceSnapshot & { provider: P }`，满足 `getDeepSeekBalance` / `getKimiBalance` 的特化快照类型。
    - `toModelMutationResult` 的 `references`：model-store 返回 `string[]`，实际只会是三个任务模型槽位名（`findReferences`），契约按槽位联合声明。原 preload 用 `as Promise<ModelMutationResult>` 收窄，这里改在一处用类型别名断言。
    - `models.listCatalog` / `reloadCatalog` 原来用 `(input = {})` 兜底，契约入参是必填的 `ModelsCatalogListInput`，改为 `input?.provider` / `input?.query`，兜底行为不变。
    - **`QuickOpenRequest` 共享类型修正**：声明是 `{ requestId: string }`，main 实际返回 `{ requestedAt }`。renderer 只判断有无（`App.tsx` 中 `if (!request …) return`），从不读字段。线上数据不变，只把共享类型改为 `{ requestedAt: string }` 以对齐实际负载。
  - main 测试：文件 63 / 1（已知）/ 1，用例 420 / 1 / 1。desktop 全量：文件 142 / 1（已知）/ 1，用例 1075 / 1 / 2。shared：18 个文件、144 个用例全部通过。IPC 审计 160 个 channel 通过。
- **T3f 其余 main 文件**：`grep ipcMain` 显示 main 中除 `ipc/registry.ts` 外已没有任何直接的 `ipcMain.handle` / `on`。`M/index.ts` 本来就不注册 IPC，不涉及。

### T4 + T5：preload 按契约生成，会话投影移到 renderer（合并为一个提交）

- **为什么合并**：T4 删掉 preload 里的投影后，`createSession` 等 4 个成员只能返回原始 projection，而 App 需要的是 SessionRecord。T5 的 `R/api/sessions.ts` 必须同时落地，否则中间提交的 App 不可用。计划「回滚」一节本来就要求 T4–T6 连同 T5 一起 revert。
- **`P/build-bridge.ts`**：
  - `buildBridge(contract, transport, locals)` 按 spec 生成各域：
    - invoke 只在入参缺失时补契约默认值；
    - event 补默认 payload，并返回取消订阅函数；
    - send 直接转发；
    - local 取 preload 提供的实现，缺实现时启动即抛错。
  - transport 抽成接口，单测用假实现替换 `ipcRenderer`。
  - 兼容层（T10 删除）：`buildLegacyFlatBridge` 按 `LEGACY_FLAT_MEMBERS` 把 147 个扁平名指向同一个契约函数；`buildLegacyHostsBridge` 保留 `actspaceHosts` 的 10 个成员和三参数的 `call`。
- **`P/index.ts`**：从 623 行改为 30 行。删除短别名表、130 多处 `as Promise<…>`、全部类型 import，以及 `@actspace/client/sessions` 和 `createMessageBlocks` 的投影 import。`window.actspace` 为「22 个契约域 + 147 个扁平名」，`window.actspaceHosts` 为兼容别名。preload bundle 从 633 KB 降到 49 KB（不再打包 client 的投影代码）。
- **`R/api/bridge.ts`**：`getBridge()`。兼容期 `Window["actspace"]` 仍是旧扁平声明，这里先断言为 `DesktopBridge`，T6 切换声明后去掉断言。T7 在此基础上补 `installBridge`。
- **`R/api/sessions.ts`**：`createSession` / `forkSession` / `getSession` / `getSessionToolDetail` 调用 `getBridge().sessions.*` 拿原始结果，再执行 `projectChatWindow` 或 `createMessageBlocks(projectChatEvents(…))`，返回结构与旧 preload 相同。
- **调用方**：`App.tsx` 的新建、复制会话记录、分叉 3 处，以及 `ConversationView.tsx` 的工具详情按需加载 1 处，改为调用 `api/sessions`。
  - 分叉前的「`forkSession` 是否存在」检查删除，该成员现在总是存在。
  - `ConversationView` 的存在检查收窄为 `!window.actspace`，保留无 bridge 浏览器模式下的旧行为，T8 有 mock 后删除。
- **类型**：
  - `global.d.ts` 删除这 4 个扁平声明，因为 preload 已不再提供。
  - `legacy.ts` 的 `LegacyFlatBridge` 不再并入 `LegacyProjectedMembers`。该类型保留，只给测试 stub 使用。
- **偏离（测试过渡）**：renderer 测试仍以扁平 stub 直接返回投影后的 SessionRecord / MessageBlock[]，涉及约 50 处、6 个文件。逐个改成返回 projection 属于 T9 的迁移范围，而且需要反向构造 projection，有失真风险。做法如下：
  - `R/test/setup.ts` 用 `vi.mock("../api/sessions")` 把 4 个函数接回这些扁平 stub，测试语义与迁移前完全一致。迁移前 preload 的投影本来就绕过了测试。
  - 新增 `R/test/legacy-session-stubs.ts`，提供带类型的访问器，替换 6 处 `window.actspace.getSession` 直接引用。
  - `deferred-tool-message` 的 5 处对象字面量加上 `as Window["actspace"]`。
  - 以上在 T9 一并删除。
- **测试**：
  - 新增 `P/test/build-bridge.test.ts`（7 个用例），覆盖：
    - 每个契约成员都是函数；
    - invoke 透传入参，缺省时补默认值（`sessions.create()` → `{}`）；
    - event 补默认 payload（`shuttingDown` → `{reason:"normal"}`），并返回取消订阅；
    - send 和 local 的行为；
    - 缺 local 实现时抛错；
    - 扁平名和 Host 名指向同一个契约函数，且不含 `createSession`；
    - `call` 三参数转成 `{hostId, method, params}`。
  - 新增 `R/test/api-sessions.test.ts`（4 个用例）：用 `vi.importActual` 绕开 setup 的 mock，测真实实现。同一份含用户消息、工具调用、工具结果和助手消息的 projection，输出与旧 preload 实现（原样保留在测试里）`toEqual`，并断言入参原样转给 bridge、空会话返回 null。
- **审计脚本**：`check-ipc-channels` 新增规则：preload 中出现 `buildBridge(desktopBridgeContract` 时，契约里的 channel 都算被 preload 引用。新增 1 个用例，共 9 个。
- **结果**：
  - desktop typecheck 0 错误。
  - desktop 全量测试：文件 144 通过 / 1 失败（已知）/ 1 跳过，用例 1086 / 1 / 2。
  - shared 测试 144 个全部通过；IPC 审计 160 个 channel 通过；`runtime-v2-preload-bundle` 通过（bundle 只 `require("electron")`）；frontend-tokens 和 frontend-theme 检查通过。
- **Electron 冒烟**（`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`，经 CDP）：
  - `window.actspace` 有 22 个域和 147 个扁平函数，4 个投影名不存在；`actspaceHosts` 有 11 个成员。
  - `app.getBootstrapState()` 与扁平 `getBootstrapState()` 结果一致。`sessions.listPage()` 不传入参也能返回（默认 `{}` 生效）。`settings.get` 和 `actspaceHosts.list` 正常。
  - 界面操作：
    - 点击「新建会话」：会话行 3 → 4，经 `api/sessions.createSession`；
    - 右键 →「复制 → 复制会话记录」：经 `getSession` 投影，拦截剪贴板后得到 `# New chat`，没有写入系统剪贴板；
    - 右键 →「分叉」：会话行 4 → 5；
    - 打开设置页正常渲染（截图 `screenshots/t4-electron-settings.png`）；
    - 全程无 `console.error`。
  - 终端：`terminal.create` → `attach` → `write("echo bridge-$((40+2))")`，`events.terminal` 收到 `attached` 和 `data` 事件且包含 `bridge-42`，`close` 返回 ok。
  - guard 走真实 IPC：`terminal.write({data: 1})` 被拒，报错 `IpcInputError: Invalid terminal input (runtime-v2:fixed-renderer:terminal-write)`。
  - 没有验证发送消息：临时数据目录没有连接模型，并且按约束不使用真实用户数据。
  - 首页截图 `screenshots/t4-electron-home.png`。

### T6：`window.actspace` 声明切到契约类型

- `global.d.ts` 从 309 行改为 11 行：`actspace: DesktopBridge & LegacyFlatBridge`，`actspaceHosts: LegacyHostsBridge`（必选）。删除 `R/remote-hosts.d.ts`。`R/api/bridge.ts` 去掉 T5 的临时断言。
- **tsc 只报了 11 个错误，全部在测试里**：
  - 9 处是对 bridge 成员赋值，契约成员是 readonly（preload 暴露的对象本来就是冻结的）。改为 `Object.assign(window.actspace, { … })`，运行时行为不变，T9 迁到 `setupBridge` 后消失。
  - 2 处在类型测试。`desktop-bridge-contract-types.test.ts` 按 T1 的预告，改为直接断言 `Window["actspace"]` 等于 `DesktopBridge & LegacyFlatBridge`、`Window["actspaceHosts"]` 等于 `LegacyHostsBridge`。
  - 业务代码 0 个错误：T1 已保证兼容层签名能赋给旧声明，旧的可选成员变成必选后，tsc 不会对多余的 `?.` 报错。
- **偏离（执行顺序）**：计划要求 T6 同时删掉 renderer 里约 220 处 `window.actspace?.`、成员存在检查和 `has*Bridge`。本提交只切类型，删除检查挪到 T9 之后（记为 T6b）。原因：
  - 这些检查目前在承担运行时兜底。65 个 tsx 测试中，54 个只给部分 stub（组件调用未 stub 的成员时靠 `?.` 跳过），11 个完全不设 bridge。浏览器 dev 模式在 T8 之前也没有 bridge。
  - 现在删掉检查，会让大量测试和 dev 模式直接抛 `is not a function`。修复办法正是 T8 的完整 mock bridge 加上 T9 的 `setupBridge`（以 mock 为底，再覆盖 stub）。
  - 新顺序：T6（类型）→ T8（mock bridge）→ T9（测试 `setupBridge`，setup 默认安装 mock）→ T6b（删检查，以 tsc 加 grep 验收）→ T7（`api/<域>` 迁移和 `check:renderer-bridge`）→ T10 → T11。最终状态与计划一致，只是顺序不同。
  - T7 放到 T6b 之后，迁移时就不必把存在检查搬进 `api/<域>`。
- 结果：desktop typecheck 0 错误；desktop 全量测试文件 144 通过 / 1 失败（已知）/ 1 跳过，用例 1085 / 1 / 2（类型测试由 3 个用例合并为 2 个）。

### T8：mock bridge 注入，App 删除浏览器 mock 分支

- **新增 `R/mock/`**（只在 dev 模式下动态加载）：
  - `fixtures.ts`：bootstrap、设置 v2/v4、provider、模型、更新状态等静态样例。
  - `mock-db.ts`：内存表。会话按消息列表保存，读取时投影成和 Electron 同形的 `RuntimeV2DesktopSessionProjection` / `Observation`；远端会话 id 与 main 的 `remoteSessionKey` 同格式。
  - `clock.ts` + `stream-player.ts`：事件总线和定时器（`dispose` 统一清理），按脚本回放 `agent_run_started → assistant_text_delta… → agent_run_finished`，`stop` 时发 `agent_run_aborted`。
  - `handlers.ts`：会话、任务、审批、设置、工作区、Host 等域的默认实现；未实现的成员调用时抛 `Mock bridge does not implement 域.成员`。
  - `scenarios/`：`empty` / `streaming` / `long-session`（40 轮）/ `approval-pending` / `remote-host`（connected、offline、revoked 三个 Host）。
  - `create-mock-bridge.ts`：按契约 channel 反查 handler，经 `buildBridge` 生成完整 bridge，兼容期另外加上扁平名和 `actspaceHosts`。handler 叠加顺序：默认 → 场景 → `options.handlers`（测试覆盖用）。
  - `install-mock-bridge.ts`：读取 `?mock=`，未知值警告后回退到 `empty`。
- **偏离（文件位置）**：计划 T4 把 `buildBridge` 放在 `P/build-bridge.ts`。为了让 mock 和 preload 共用同一个按契约生成的实现，移到 `S/desktop-bridge/build-bridge.ts`（`git mv`），单测同步移到 `S/test/desktop-bridge-build.test.ts`（7 个用例）。preload 改为从 `@actspace/shared/desktop-bridge` 导入；`check-ipc-channels` 的 `buildBridge(desktopBridgeContract` 规则仍然匹配。
- **注入**：
  - `R/api/bridge.ts` 新增 `installBridge(bridge, hosts)`。
  - 新增 `R/bridge-bootstrap.ts`：
    - 已有 `window.actspace` 时返回 `electron`；
    - 否则在字面量 `import.meta.env.DEV` 分支里动态 `import("./mock/install-mock-bridge")`；
    - 生产构建中没有 bridge 时，渲染「无法连接桌面服务 / Desktop bridge missing」提示页，不再白屏。
  - `main.tsx` 先 `ensureBridge()`，再应用外观并挂载 App（未使用顶层 await）。
- **App.tsx**：删除 `hasActspaceBridge`、`createLocalEmptySession`、`rewriteLocalSessionId`、`createLocalForkSession`、`localSessionRecords` 和只有 `setAgentRunResult(null)` 调用、没有读取方的 `agentRunResult` 状态，以及新建、置顶、重命名、归档、选择、批量归档中的无 bridge 分支。复制会话记录和分叉统一走 `api/sessions`。剩余的 `window.actspace.X` 存在检查留给 T6b。
- **测试**：
  - `app-session-actions.test.tsx` 原本依赖已删除的无 bridge 本地分支，改为安装 `createMockBridge()`，并 `vi.unmock("../api/sessions")`，走真实投影路径。
  - 新增 `R/test/mock-bridge.test.ts`（15 个用例）：契约成员齐全；未实现成员会拒绝；新建、重命名、分叉、列表；提交后流式输出并落盘；stop 中止；设置 revision 冲突；handler 覆盖；各场景数据一致；审批通过；streaming 场景在打开会话后才开始；离线 Host 提交被拒。
  - 新增 `R/test/main-bridge-install.test.ts`（4 个用例）：Electron bridge 不被覆盖；DEV + `?mock=remote-host` 安装全部成员；生产模式渲染提示页；DEV 下 `main.tsx` 能启动 App。
- **生产包检查**：`pnpm --filter @actspace/desktop build` 后，在 `dist` / `dist-electron` 中 grep `create-mock-bridge`、`mock/scenarios`、`install-mock-bridge`、`Mock bridge does not implement`、`浏览器 mock`、`mock-session`、`actspace-demo`，均无结果；能 grep 到 `Desktop bridge missing`。preload 48.5 KB。
- **浏览器验收**（`dev:renderer` 跑在 5199 端口，headless Chrome 使用独立 profile，经 CDP 操作；结束后已关闭两者）：
  - `?mock=empty`（`t8-mock-empty.png`）：0 行，侧栏和输入框正常。输入「你好 mock」并回车后，新会话出现，回复逐段流出并落盘（`t8-mock-empty-send.png`）。
  - `?mock=streaming`（`t8-mock-streaming.png`）：2 行，打开后开始流式输出，停止按钮出现。
  - `?mock=remote-host`（`t8-mock-remote-host.png`）：3 行，分别显示在「开发机 devbox」「actspace-demo」「GPU 服务器 · 离线」分组下，Host 选择器中有本机、devbox、GPU 服务器 · 离线、旧笔记本 · 离线。输入框显示「等待 Host 工作区 / Host 未就绪」，因为 mock 没有实现 `hosts.call` 的远端 RPC，这符合 mock 的边界。
  - `?mock=long-session`（`t8-mock-long-session.png`）：40 轮消息加代码块正常渲染。
  - `?mock=approval-pending`（`t8-mock-approval-pending.png`）：显示 Bash 审批卡片（`rm -rf …`、拒绝、运行）。点击「运行」后审批消失，回复落盘（`t8-mock-approval-resolved.png`）。
  - 以上每个场景控制台都没有 error / warning。
- **Electron 冒烟**（真实 preload，`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`）：`window.actspace` 为 object，无提示页，5 个会话行，「新建会话」按钮存在（`t8-electron-smoke.png`）。控制台只有已知的 Electron CSP 开发期警告（J1=A，本轮不加 CSP），没有 error。
- **结果**：
  - desktop typecheck 0 错误。
  - desktop 全量测试：文件 145 通过 / 1 失败（已知 `workspace-git-context-service`）/ 1 跳过，用例 1097 / 1 / 2。
  - shared 测试 19 个文件、151 个用例全部通过。
  - IPC 审计 160 个 channel 通过，审计脚本测试 9 个通过；frontend-tokens、frontend-theme、current-docs 检查通过。

### T9：测试与 fixture 改用 mock bridge 打底（7 个提交）

- **提交**：T9a `2cc02223`（6 个 `app-*` + chat-app-rejection）、T9b `23e2fb07`（Settings 系列 7 个）、T9c `aacf2847`（消息块 / 审批 8 个）、T9d `f383de89`（右侧面板 / 产物 6 个）、T9e `108dd4b7`（Host / 会话 api / 附件 5 个）、T9f `5a6cb809`（5 个预览 fixture）、T9g（删除兼容期 `api/sessions` mock，本节）。
- **测试辅助 `R/test/helpers/bridge.ts`**：
  - `setupBridge(overrides?, scenario?)`：先 `resetBridge`，再 `createMockBridge({ scenario, handlers })` + `installBridge`，返回句柄（`emit`、`db`）。
  - `overrideBridge(overrides)`：在当前实例上覆盖，用于用例中途替换。
  - `resetBridge()`：dispose 并删除 `window.actspace` / `window.actspaceHosts`。
  - `setup.ts` 每个用例前装默认实例、用例后重置，各测试文件里的 `afterEach(delete window.actspace)` / 保存还原逻辑全部删除。
- **设计：覆盖键用契约路径字符串**（`{ "sessions.list": fn }`），不用嵌套对象。原因：测试大量用 `{ ...baseStubs, getSession: … }` 组合 stub，扁平键的对象展开不会因为浅合并丢掉同域的其他成员。键类型 `BridgePath` 由契约推出，写错路径编译期报错，运行期 `toHandlers` 也会抛 `Unknown bridge path in test overrides`。入参按契约签名推断，返回值放宽为 `unknown`。
- **record 型用例**：较早的 UI 用例用 `SessionRecord` 描述会话。新增 `R/test/helpers/session-records.ts` 的 `projectRecord(read)`，用与 `sessions.getPage` fixture 相同的 `recordProjectionFixture` 把 record 投影成 bridge 返回的 projection，`api/sessions` 再投影回 UI 结构。`taskHostFixture` 的 `getSession` 选项改名 `getRecord`，同时喂 `sessions.get` 和 `sessions.getPage`。
- **mock 为测试做的改动**：
  - `MockBridgeHandle.override(handlers)`；handler 表改为可变，locals 按调用时查表。
  - `MockClock.bridge`：handler 内部可以经最终 bridge 调用其它成员。`sessions.listPage` 由 `sessions.list` 派生，测试覆盖 `sessions.list` 时侧栏分页跟着变。
  - 新增 `terminal.list` 默认实现（RightPanel 挂载时会调用）；`settings.updateV4` 默认实现按 namespace 浅合并并递增 revision、发 `settingsChanged`。
- **codemod**：`tools/migrate-bridge-stubs.mjs`（TS compiler API，读 shared 构建产物里的 `LEGACY_*` 表）。把 `window.actspace = {…}` / `defineProperty(window, "actspace", { value })` 改成 `setupBridge`，`Object.assign(window.actspace, …)` 改成 `overrideBridge`，顶层扁平键改为契约路径，并补导入；无法自动处理的写法打印「人工」清单。已知不处理：stub 对象上的属性读取（如 `api.setEnglishLearningTarget`）、`...original` 展开、函数返回的 stub 对象。这些都已手工改完。
- **随迁移改写的断言**（mock 默认值补上了原先 stub 缺失的成员，测试改走真实路径）：
  - settings-page 工具页 4 个用例：mock 提供 `settings.getV4` / `updateV4`，工具页走 v4 tools namespace，断言从 v2 `updateSettings({ agent: … })` 改为 `settings.updateV4({ namespace: "tools", patch: … })`。新增 `stubToolsV4` 维护可写快照。真实应用总有 v4，v2 回退分支由 T6b 删除。
  - app-streaming「keeps the selected model」：期望值改为 mock 的可用模型键；并补 `sessions.setWorkspace` stub（mock 对库里没有的会话会拒绝）。
  - api-sessions「不传 input」：mock 与 preload 走同一个 `buildBridge`，契约 `defaultInput` 会补 `{}`，断言从 `undefined` 改为 `{}`。
  - deferred-tool-message：stub 直接返回投影后的 `MessageBlock[]`，改为在该文件 mock `api/sessions` 的 `getSessionToolDetail`；原始 page → blocks 的投影由 api-sessions 覆盖。
  - host-feedback / remoteArtifact：`actspaceHosts.call(hostId, method, params)` 的 stub 改为契约的 `hosts.call({ hostId, method, params })`。
- **fixture**：五个预览改用 `setupBridge`。settings-preview 去掉「未建模成员返回空成功」的 Proxy，由 mock 默认 handler 兜底。english-learning / extensions 预览原先就因缺少 `TooltipProvider` 渲染报错（与本次迁移无关），顺手补上。无头 Chrome 截图：`t9-fixture-settings-preview-{general,model,tools,archived}.png`、`t9-fixture-model-settings-preview.png`、`t9-fixture-english-learning-preview.png`、`t9-fixture-extensions-preview.png`，控制台均无 error / warning。tool-experience-visual 没有对应 html 入口，只做了类型检查。
- **T9g**：删除 `setup.ts` 的兼容期 `vi.mock("../api/sessions")`、`R/test/legacy-session-stubs.ts`、`S/desktop-bridge/legacy.ts` 的 `LegacyProjectedMembers` 类型；api-sessions 改为直接导入。`LEGACY_PROJECTED_MEMBERS` 常量随 legacy.ts 在 T10 删除。
- **验收 grep**：`grep -rnE "window\.actspace\s*=|defineProperty\(window, ?\"actspace\"|stubGlobal\(\"actspace" apps/desktop/src` 剩 2 处，均不是手写 stub：
  - `R/api/bridge.ts` 的 `installBridge`：唯一的注入入口（T8 设计）。
  - `R/test/main-bridge-install.test.ts`：模拟 Electron preload 已暴露 bridge，验证 `ensureBridge` 不覆盖它。
- **结果**：desktop typecheck 0 错误；desktop 全量测试文件 145 通过 / 1 失败（已知 `workspace-git-context-service`）/ 1 跳过，用例 1097 / 1 / 2；shared 19 个文件 151 个用例通过；IPC 审计 160 个 channel、脚本测试 9 个通过；frontend-tokens、frontend-theme、current-docs 通过。

### T6b：删除 renderer 中 bridge 的可选链与存在检查

- 范围：renderer 非测试代码 44 个文件。删除 `window.actspace?.`、`window.actspace.X?.()`、`window.actspace.X!()`、`if (!window.actspace.X) return/throw`、`Boolean(window.actspace.X)` 和 `has*Bridge()` 系列（SettingsPage 4 个、`hasSkillsBridge`、`hasBrowserBridge`、`settingsV4Available`、`settingsV4Writable` 里的成员检查），以及只为「无 bridge」服务的分支：
  - 「仅桌面端可用 / 当前环境不支持…」的降级文案与早返回：文件树、OpenInApp 菜单、Skills、Chrome 浏览器连接、英语辅助学习、语音配置、模型连接、模型管理、本地更新、Agent 指令、归档会话、图片 / 附件选择、粘贴图片、终端桥接、变更审查、提交历史 / 分支比较。
  - SettingsPage 的 `previewSetKeyState`（浏览器预览模拟保存 Key）、`getSettingsV4?.() ?? null` 回退、`if (window.actspace.getSettings)` 包裹。
  - 相应的 `result?.` / `if (!result) throw "当前版本不支持…"`（只在可选调用返回 `undefined` 时成立），并把 `CustomConnectionModels.mutate`、`ProviderConnectionDetail.onRefreshModels`、`BrowserConnectPanel.action` 的入参类型去掉 `| undefined`。
  - 顺带删除同处的 `typeof window === "undefined"` 判断（renderer 只在浏览器里运行，测试是 jsdom）。
- 保留：真实业务判断（`!sessionId`、`!snapshot`、`!workspaceRoot`、安全路径校验等）；`R/bridge-bootstrap.ts:8 if (window.actspace) return "electron"`（判断 preload 是否已注入，属于注入入口）；`window.actspaceHosts` 的检查（App、ApprovalParts、HostConnectionsSettings 共 3 处），随 T10 删除 `actspaceHosts` 一起处理。
- 未做：工具页的 `settingsV4?.settings.tools… ?? settings.agent…` 不是 bridge 检查，而是 v4 快照加载完成前的显示值，保留。
- 测试调整（4 个文件）：
  - workspace-file-tree「bridge 不可用时降级」改为「列目录失败时显示『无法读取目录』」，本文件的 `installBridge` 改用 `setupBridge`。
  - right-panel-workspace 3 个用例原先把 `window.actspace` 设为 `undefined`，借降级文案断言树栏出现 / 收起；改为用默认 mock bridge，并以「过滤文件名」输入框作为树栏标记。
  - workbench-responsive 的手写 `window.actspace = {…}` 改为 `setupBridge`（缺少 `taskCommand` / `onSettingsChangedV4` 后直接抛错）。
- **发现 T9 遗漏**：T9 的验收 grep 只匹配 `window.actspace =`，漏掉了 `(window as {…}).actspace = …` / `delete (window as …).actspace` 写法。另有 9 个测试文件仍是手写 stub（agent-run-block、search-settings、file-diff-block、chat-presentation-recovery、appearance、workspace-chrome-controls、context-render-view、trajectory-render-view、composer）。它们目前能通过，因为手写对象覆盖了用到的成员或只做清理，但这违背 T9 的终态。另开 T9h 补迁移，验收 grep 也同时补上这种写法。
- 验收：`grep -rnE 'window\.actspace\?\.|!window\.actspace\.|window\.actspace\.[A-Za-z0-9]+(\?\.|!\()|Boolean\(window\.actspace' apps/desktop/src/renderer`（排除 test/）只剩 `bridge-bootstrap.ts:8`。desktop typecheck 0 错误；desktop 全量测试文件 145 / 1（已知）/ 1，用例 1097 / 1 / 2；IPC 审计、frontend-tokens、frontend-theme 通过。

### T9h：补迁移 T9 漏掉的 9 个测试文件

- 起因见 T6b：T9 的验收 grep 没覆盖 `(window as {…}).actspace = …` 和 `delete (window as …).actspace`。
- codemod 的 `isWindowMember` 改为先 `unwrap` 掉 `as` 和括号再判断 `window`，然后重跑。自动改写：agent-run-block（4 处）、chat-presentation-recovery、appearance、context-render-view（3 处）、trajectory-render-view。
- 人工处理：
  - composer：删除 `setPartialActspaceBridge` 包装，调用点直接用 `setupBridge`，再由 codemod 改写 13 个键。
  - workspace-chrome-controls：`installBridge(overrides)` 的参数类型改为 `BridgeOverrides`，调用点和断言里的 `bridge.createWorkspaceBranch` 等改为契约路径；删除 `originalActspace` 的保存与还原。
  - context-render-view：删除 `"sessions.describeContext": undefined`（原先用来模拟成员缺失）。该用例渲染时没有 `sessionId`，本来就不会调用 describeContext，断言含义不变。
  - 9 个文件里只做 `delete window.actspace` 的 `afterEach` / `finally` 全部删除（由 `setup.ts` 统一重置），并删掉不再使用的 `afterEach` 导入。
- 验收 grep（补上 T9 漏掉的写法）：`grep -rnE '\(window as [^)]*\)\.actspace(Hosts)?\s*=|delete \(window as [^)]*\)\.actspace|window\.actspace\s*=|defineProperty\(window, ?"actspace|stubGlobal\("actspace' apps/desktop/src/renderer` 只剩 `R/api/bridge.ts` 的 `installBridge`、`R/test/helpers/bridge.ts` 的 `resetBridge`，以及 `R/test/main-bridge-install.test.ts`（模拟 preload 注入，T9 已说明）。
- 结果：desktop typecheck 0 错误；desktop 全量测试文件 145 / 1（已知）/ 1，用例 1097 / 1 / 2。

### T7：renderer 改走 `api/<域>`（5 个提交）

- 计划写「每个域一个提交」，实际按调用方分批提交（先 App，再 Settings 系列，再其余），原因：一个文件往往同时用到多个域，按域拆会让同一文件跨多个提交、每个中间态都要人工对齐 import。每批提交都跑了 typecheck 和全量测试。
- **T7a**（951dc5ca）：`R/api/bridge.ts` 新增 `getBridge()`、`hasPreloadBridge()`、`domainApi(domain)`。`domainApi` 按 `desktopBridgeContract[domain]` 的成员生成冻结对象，每次调用时才取 `getBridge()`，所以测试里 `setupBridge` 换掉 bridge 后无需重新 import。新增 21 个 `R/api/<域>.ts`（`quick-open`、`english-learning`、`browser-bridge` 用短横线文件名），`api/sessions.ts` 补 `sessionsApi`。codemod `tools/migrate-renderer-api.mjs` 把 `window.actspace.<旧扁平名>` 和 `window.actspace.<域>.<成员>` 改为 `<域>Api.<成员>`，补齐或合并 import，裸引用列为人工项。App.tsx 改了 43 处；quick-open effect 改写后不再依赖 `workspaceRegistry`。
- **T7b**（57364487）：components/settings 与 components/extensions 共 17 个文件，全部由 codemod 完成。
- **T7c**（e62d3c7b）：appearance、Composer、ConversationView、messages、review、right-panel、workspace、session 投影。人工处理 5 处：
  - PerformancePanel 的 `const bridge = window.actspace`；
  - ConversationView 的 `!window.actspace`；
  - WorkspaceChromeControls 的 `push!` / `commitAndPush!`；
  - SessionProjectionContext 改为传 `{ getSessionProjectionSnapshot: sessionsApi.getProjectionSnapshot, onSessionLiveEvent: eventsApi.sessionLive }`；
  - main.tsx 与 bridge-bootstrap 改用 `hasPreloadBridge()`。
- **T7d**（24ccc613）：`window.actspaceHosts` 的 7 个调用方（App、ConversationView、Composer、ApprovalParts、HostConnectionsSettings、useRemoteTarget、remoteArtifact）改走 `hostsApi`；`onChanged` / `onEvent` / `onUploadProgress` 改走 `eventsApi.hostsChanged` / `hostEvent` / `hostUploadProgress`。`call(hostId, method, params)` 改为契约签名 `call({ hostId, method, params })`，IPC payload 本来就是这个对象，main 侧不变。删除 `if (window.actspaceHosts)` 等存在检查，包括 remoteArtifact「远端文件服务不可用。」和配对按钮的 `!window.actspaceHosts` 禁用条件。T6b 原计划把这几处留到 T10，但 T7 的审计规则要求 renderer 业务代码不再出现 `actspaceHosts`，所以提前到 T7。相关测试（host-feedback、app-remote-host-refresh、remoteArtifact）在 T9 已用契约路径打桩，无需改动，现在走的是真实调用路径。
- **T7e**（2f29f295）：新增 `scripts/check-renderer-bridge-access.mjs` 和根脚本 `check:renderer-bridge` / `test:renderer-bridge`。规则：`window.actspace` / `actspaceHosts` 只允许出现在 `main.tsx`、`api/bridge.ts`、`mock/**`、`test/**`。识别成员访问、可选链、`(window as X).actspace`（T9 漏掉的写法）、下标访问和解构；成员访问要求 `.` 前是标识符或右括号，避免把 `"~/.actspace/…"` 这类字符串算进去。单测 5 个，包含「仓库 renderer 通过」。用 998de128（T7 前）的 renderer 反向验证：脚本报 238 处。接入根 `test` 脚本按计划留到 T10。
- 结果：renderer 非测试代码里 `window.actspace` 只剩 `api/bridge.ts`，`actspaceHosts` 只剩 `api/bridge.ts` 的兼容写入。desktop typecheck 0 错误；desktop 全量测试文件 145 / 1（已知）/ 1，用例 1097 / 1 / 2；`check:renderer-bridge`（287 个文件）、`test:renderer-bridge`（5 个）、`check:ipc-channels`（160 个 channel）、frontend-tokens、frontend-theme 通过。
- **偶发未处理错误（非本计划引入）**：全量运行时，约 3/7 次出现 `ReferenceError: window is not defined`，栈在 `ResponseAnnotationPill.tsx` 的 `changeOpen → setOpen`，由 HoverCard 定时器在 jsdom 环境销毁后触发。单独跑 composer.test 6 次都没有出现。为确认来源，在临时 worktree 里检出计划 13 的起点 05ffe370（`refactor/desktop-fe-12` 的测试整理提交）跑了 4 次，其中 1 次复现（同一栈），说明问题在本计划之前就存在。用例计数不受影响。本计划不修，记入验收交接。

### T10：删除兼容层，IPC 审计以契约为准（2 个提交）

- **T10a**（b8bd88f9）删除兼容层：
  - preload 只 `exposeInMainWorld("actspace", bridge)`，不再附带旧扁平成员名，也不再暴露 `actspaceHosts`；
  - 删除 `S/desktop-bridge/legacy.ts`（`LEGACY_FLAT_MEMBERS`、`LEGACY_HOST_MEMBERS`、`LEGACY_PROJECTED_MEMBERS` 和两个 Legacy 类型），以及 `buildLegacyFlatBridge` / `buildLegacyHostsBridge`；
  - `global.d.ts` 的 `Window.actspace` 改为 `DesktopBridge`，删除 `actspaceHosts` 声明；
  - mock bridge 的句柄去掉 `hosts`，`MockDesktopBridge` 类型删除；`installBridge(bridge)` 只接收一个参数；`resetBridge` 不再删 `actspaceHosts`。
  - 测试：
    - shared 的「legacy 映射」两组删除，改为「hosts.call 以单个对象转发」；
    - mock-bridge 的「契约成员 + 扁平名」改为「只有契约成员」（域集合等于契约）；
    - main-bridge-install 断言 `window.actspace` 没有 `listSessionPage`、`window` 没有 `actspaceHosts`，Host 列表改走 `actspace.hosts.list()`；
    - 类型测试改为 `Window["actspace"]` 等于 `DesktopBridge`，并断言 `hosts.call` 的入参是 `HostCallInput`。
  - typecheck 改完类型后只报 1 处（类型测试本身），说明业务代码和测试已没有扁平名用法。
  - `docs/exec-runs/…/tools/` 下的两个 codemod 依赖已删除的 `legacy.js`，不能再运行。它们是一次性工具，保留作为执行记录。
- **T10b**（56578e77）`check-ipc-channels` 改为以契约为准：
  - `parseContract` 现在返回 `{ channel, kind }`（`invoke` / `invokeWithDefault` 归为 invoke，另有 send、event；local 跳过）。成员引用了不存在的常量 key 时抛错。
  - 失败条件：
    - 契约里的 invoke / send 成员没有在 main 注册；
    - event 成员没有由 main 发送；
    - main 注册或发送了契约之外的 channel；
    - 方向与类别不符（注册了 event，或发送了 invoke）；
    - 常量表里有契约没用到的 channel；
    - preload 没有用 `buildBridge(desktopBridgeContract, …)`，或绕过契约直接引用 channel。
  - 单测 12 个，每类失败各一例，另含「仓库通过」和「契约成员数等于常量数」。
  - 当前结果：契约 160 个 channel（invoke 148 / send 1 / event 11）。
  - 根 `test` 脚本加入 `pnpm check:renderer-bridge && pnpm test:renderer-bridge`。
- **浏览器 mock 冒烟**（Vite 5199 + headless Chrome，`?mock=remote-host`）：
  - `actspaceHosts` 不存在，`listSessionPage` 为 undefined，22 个域；
  - `hosts.list()` 返回 connected / offline / revoked；
  - 界面与 T8 截图一致（`screenshots/t10-mock-remote-host.png`）；
  - 唯一的 404 是 dev server 的 `/favicon.ico`。
- **Electron 冒烟**（真实 preload，`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`）：
  - `window.actspace` 有 22 个域、0 个扁平函数，对象已冻结，`actspaceHosts` 不存在。
  - `app.getBootstrapState`、`sessions.listPage()`（无入参）、`settings.get`、`hosts.list` 正常。
  - `hosts.call({ hostId: "nope", method: "host.describe", params: {} })` 到达 main，返回 `Host is offline`，说明单对象入参通过了 guard。
  - 点「新建会话」后会话数 0 → 1。
  - 设置 →「远端 Host」页正常渲染，「配对并连接」可用（`screenshots/t10-electron-host-settings.png`）。
  - 用非法地址提交配对，显示「请输入有效的服务器地址…」，Host 数仍为 0。没有联网。
  - 首页截图 `screenshots/t10-electron-home.png`。
  - Electron 日志里只有临时目录的 Chromium disk cache 报错和上面那次有意的 `Host is offline`。结束后已 pkill，`pgrep` 无残留。之前遗留的 Vite（49827）和 headless Chrome（51575）也已结束。
- 结果：
  - desktop typecheck 0 错误；
  - desktop 全量测试文件 145 / 1（已知）/ 1，用例 1097 / 1 / 2；
  - shared 19 个文件 148 个用例通过；
  - `check:ipc-channels`、`test:renderer-bridge`（5 个）、`check:renderer-bridge`、`check:current-docs` 通过。

### T11：规范与验证约定（a83d6c55）

- 新增 `docs/design-docs/frontend/front-preload-bridge与mock规范.md`，共 8 节：结构表、契约约定（5 种 spec）、renderer 访问约定、新增一个 IPC 能力的步骤、guard 约定、启动与 mock 注入、mock 约定、测试约定。已加入 `check-current-docs` 的 truth files（46 个）和 `design-docs/frontend/README.md`。
- `docs/FRONTEND_VERIFICATION.md`：
  - 重写浏览器 mock 一段；
  - 新增「浏览器 mock 场景」表：5 个 `?mock=` 场景，各自覆盖什么、不覆盖什么；
  - 新增「Desktop 前端重构期间的验证矩阵」（来自 08 §5）。尚未落地的单测标 `*`：transcript、app-earlier-history、run-target-readiness、run-location-menu、composer-ime、window-navigation、ui-layering。mock 未实现的远端行（`hosts.call` / `preview` / `download`）注明只能在 Electron 里验证；CSP 一行注明本轮不适用（J1=A）。
- `front-composer-slash-command.md` 里的 `listSkills` 改为 `skillsApi.list` / `skills.list`。
- 自查时更正了规范初稿的两处错误：
  - 示例 `archive` 的出参应为 `S.SessionArchiveResult`；
  - send 成员的 `input` 是 `unknown`，不是由契约推导的类型。
- 结果：`check:current-docs`（46 个 truth files）、`test:current-docs` 通过。

### 复核处理

Sonnet 只读子智能体复核 `05ffe370..HEAD`，没有发现 Electron 运行时回归，对照项都一致：
- 契约与旧 preload 的 channel 集合；
- 5 个默认入参和 `shuttingDown` 的默认 payload；
- `hosts.*` guard 与旧内联校验；
- 注册器的执行顺序、远端路由 middleware；
- 4 个投影方法的调用方。

处理如下：

| # | 发现 | 处理 |
| --- | --- | --- |
| 1 | mock 的 `hosts.reconnect` / `remove` 按 `hostId` 匹配，main 和 `HostConnectionsSettings` 传的是连接 `id`（`conn-gpu`）。`?mock=remote-host` 下点「重新连接 / 移除连接」没有效果，与验证约定里「Host 删除 / 重连后的列表」的说法不符 | **已修**：改为按 `host.id` 匹配。新增 mock-bridge 用例「按连接 id 重连和移除」，变异验证：退回旧实现后该用例失败。浏览器 `?mock=remote-host` 设置页实测：GPU 服务器重连后为 connected，移除旧笔记本后剩 2 张卡片（`screenshots/review-mock-host-reconnect-remove.png`） |
| 2 | `TerminalRenderView` 还留着 `if (!attach) { "当前桌面版本尚未加载终端桥接。" }` 死分支 | **已修**：删除，直接 `terminalApi.attach(…)` |
| 2b | 若干文件里 `const api = workspacesApi.x` 局部别名 | 不改：只是别名，已经没有存在检查，行为无差别 |
| 2c | `ConversationView`「当前环境不支持可视化转换。」、`TurnOutputArtifacts`「当前环境不支持会话图片预览。」 | 不改：这两处实际是 `!sessionId` 分支，不是 bridge 检查。文案措辞过时，改文案属于用户可见变化，不在本计划范围，记入交接 |
| 3 | `check:renderer-bridge` 只禁 `window.actspace`，业务代码仍可 `import { getBridge } from "../api/bridge"` 绕过 `api/<域>` | **已修**：同一脚本新增导入规则，只有 `api/**`、`main.tsx`、`bridge-bootstrap.ts`、`mock/**`、`test/**` 可以导入 `api/bridge`。新增 1 个用例（共 6 个）；在 `Sidebar.tsx` 临时加一行导入，脚本报错，恢复后通过。规范 §3 同步补充 |
| 4 | dev 模式下 mock 动态 import 失败时，`main.tsx` 留白屏并产生未处理的 rejection | **已修**：`ensureBridge()` 加 `.catch`，打印错误后渲染「无法连接桌面服务」页 |
| 5 | 规范 §4 / §5 和 `contract.ts` 注释用了未定义的缩写 `M/`、`R/` | **已修**：改为完整路径 |
| 6 | `check-ipc-channels` 不剥注释，注释掉的 `ipc.handle(contract.x.y…)` 仍算已注册；也不检查重复注册 | 不改：重复注册在运行时会直接抛错；注释误判风险低。记入交接 |
| 7 | `check:renderer-bridge` 认不出动态拼接的属性名（`window["act"+"space"]`、`Reflect.get`），也不扫 `.js` / `.jsx` | 不改：renderer 全部是 ts / tsx，故意绕过不在审计目标内 |

结果：
- shared / desktop typecheck 通过；
- desktop 全量测试文件 145 / 1（已知）/ 1，用例 1098 / 1 / 2（多 1 个 mock 用例）；
- `check:ipc-channels`、`check:renderer-bridge`、`test:renderer-bridge`（6 个）、frontend-tokens、frontend-theme、current-docs 通过。

### 收尾冒烟（Electron，真实 preload）

`pnpm --filter @actspace/desktop build` 后启动，`ACTSPACE_DATA_DIR=/tmp/actspace-cdp-data`，经 CDP 操作：
- **设置**：「通用、外观、远端 Host、模型、搜索、工具、子 Agent、使用统计、归档会话、更新」10 页逐个点开。`aria-current` 跟随切换，页面里没有「不支持 / 尚未加载 / is not a function / Mock bridge」字样（`screenshots/final-settings-*.png`）。「通用」里命中的「失败 / 不可用」是正常文案（「缺少 OpenRouter Key，调用会失败」「目标不可用时回到第一个项目」）。
- **语音 / 英语学习**：「通用」页的语音播放区块正常渲染，显示 MiniMax Key 未配置、模型 speech-2.8-turbo、语速 1.0×（`final-settings-speech-english.png`）。`englishLearning.getState()` 经真实 IPC 返回 `speechStatus: "unconfigured"`、`hasApiKey: false`。
- **Review**：打开右侧面板，Review 正常列出工作区的未提交改动（`final-panel-Review.png`）。
- **终端**：用「新建右侧面板对象 → 终端」打开「终端 1」，xterm 显示 shell 提示符（`final-panel-terminal.png`）。T4 已验证 `write`，`events.terminal` 回显。
- 控制台只有已知的 Electron CSP 开发期警告（J1=A）。Electron 日志里没有 error，只有 Chromium 临时目录的 disk cache 报错。结束后已 pkill，没有残留进程。
- 复核修复改到的 `TerminalRenderView` 和 `main.tsx` 不影响这轮冒烟的路径：前者只删了死分支，后者只加了失败兜底。两处都有单测覆盖。

### 收尾

- 执行摘要、验收交接、history 补全。
- 学习沉淀：命中「有模式 + 有陷阱 + 可迁移」，新增 `docs/learnings/2026-10/20261006-single-contract-bridge.md`（一份契约生成各端；可选成员让类型检查失明；grep 门槛漏写法；类型断言放在被排除的目录里不会被检查）。
