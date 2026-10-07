# 13 Preload 与 Mock Bridge 执行计划

> 状态：**已完成，待验收**（2026-10-06），按 [00](00-总执行计划.md) 的顺序执行；进度见本文「进度记录」和 00 §11。
> 总计划：[00 总执行计划](00-总执行计划.md)。执行顺序第 4 位：在 10、11、12 之后，14 之前。
> 设计来源：[04 Preload 接口与 Mock Bridge](../../../desktop-frontend-refactor/04-Preload接口与MockBridge.md) S1–S7；合并 [01](../../../desktop-frontend-refactor/01-安全与IPC收口.md) S6（统一 IPC 注册器和入参校验）、[08](../../../desktop-frontend-refactor/08-测试与验证整理.md) §3.3（手写 stub 迁移）和 §5（验证矩阵写入 `FRONTEND_VERIFICATION.md`）。
> 执行记录：`docs/exec-runs/20261005-desktop-fe-13-preload-bridge/`。
> 路径缩写：`R` = `apps/desktop/src/renderer`，`M` = `apps/desktop/src/main`，`P` = `apps/desktop/src/preload`，`S` = `packages/shared/src`。行号基于 2026-10-05，动手前重新核对。

## 目标

- Renderer、Preload、Main 三方只认一份 `DesktopBridge` 契约，它定义在 `@actspace/shared`。
- Preload 只做转发。
- Main 通过统一的注册器注册 IPC，高风险 channel 校验入参。
- Renderer 只经由 `R/api/*` 访问 bridge。
- 浏览器 mock 模式改成注入式 mock bridge，App 中不再有 `hasActspaceBridge()` 分支。
- 测试统一使用 `setupBridge()`。

## 范围

### 包含

04 的 S1–S7；01 的 S6；08 的 §3.3、§5。

### 不包含

| 项 | 原因 |
| --- | --- |
| channel 审计脚本，删除 `projection-ipc` 和 DESKTOP / DESKTOP_SHELL 常量 | 已在 10 / 11 完成 |
| 状态层改造 | 14 |
| 远端路由下沉 | 15 |

## 背景（2026-10-05 实测）

**Preload**
- `P/index.ts` 共 623 行，暴露 `actspace`（`exposeInMainWorld` 在 :318）和 `actspaceHosts`（:611-623，约 11 个方法）两个全局对象。
- 短别名表 `FIXED_RENDERER_INVOKE_CHANNELS` 在 :175-186，共 10 条（11 的核实报告记的是 142 个 channel，两者口径不同：142 包含字面量 channel。T0 重新统计并写明口径）；`invokeFixedRenderer` 在 :312-316。另有大量字面量 channel，例如 `"session:create"`。
- `as Promise<` 共 130 处。
- Preload 中有投影逻辑，不是纯转发：
  - :4 导入 `projectChatWindow` / `projectChatEvents`（来自 `@actspace/client/sessions`）；
  - :5 导入 `createMessageBlocks`；
  - createSession / forkSession 在 :405-433 做投影。
- Preload 由 esbuild 打成 cjs。`M/test/runtime-v2-preload-bundle.test.ts` 断言产物里不出现 `require("@actspace/...")`，所以契约必须被打进 bundle。

**类型声明**
- `apps/desktop/src/global.d.ts` 共 319 行，其中 126 个可选成员。
- `R/remote-hosts.d.ts` 共 18 行，`actspaceHosts?:` 整体可选。

**Renderer 调用面**
- `window.actspace` 在生产代码中 332 处，分布在 46 个文件，其中 App.tsx 77 处、SettingsPage 42 处。
- `window.actspaceHosts` 19 处。
- `hasActspaceBridge` 定义在 App.tsx:76，只在 App 中使用，共 40 处。
- `createLocalEmptySession` 在 :245，`createLocalForkSession` 在 :285，`localSessionRecords` 在 :842，`agentRunResult` 在 :843。其中 **`setAgentRunResult` 没有写入点**，`agentRunResult` 疑似死状态。

**「方法是否存在」检查**
- SettingsPage :83 / :87 / :91 / :95 的四个 `has*Bridge`。
- `settings/browser-bridge-settings-shared.ts:7`、`extensions/SkillsSection.tsx:14`。
- 内联的 `if (!window.actspace.xxx) return` 约 40 处。
- `appearance/apply.ts:18/25` 用 `typeof window.actspace?.setNativeTheme === "function"` 做浏览器兜底。

**Main 注册**
- 各文件各有一个局部 `handle` 包装：

| 文件 | 调用次数 |
| --- | --- |
| `fixed-renderer-ipc.ts:112` | 约 114 |
| `desktop-shell-ipc.ts:56` | 约 43 |
| `remote-hosts/ipc.ts:8` | 约 9 |
| `english-learning-ipc.ts:9` | 约 9 |
| `main/index.ts` | 约 4 |

- `performance-ipc.ts` 直接调用 `ipcMain` 2 次。
- `terminal-ipc.ts` 和 `projection-ipc.ts` 已在 10 中删除。

**channel 常量**
- `S/runtime-v2/fixed-renderer.ts`、`S/runtime-v2/desktop-shell.ts`、`S/performance.ts`、`S/english-learning.ts`、`S/host-protocol/`（`HOST_IPC`）。
- `S/ipc.ts`（612 行）只有输入输出类型。

**接线点**
- shared 用子路径导出。新增子路径时，要同时改 shared 的 `package.json` exports、`apps/desktop/vite.config.mts` 的 alias、`apps/desktop/vitest.config.ts` 的 alias（alias 必须写在 `@actspace/shared` 之前）。
- tsconfig 的 `@actspace/shared/*` 通配已经覆盖，不用改。
- `tsconfig.electron.json` 走 dist，需要先 build shared。

**入口与 mock**
- `R/main.tsx` 目前只有 `if (window.actspace) …classList.add("is-electron")`。
- 没有显式的 mock 开关：当前靠 `window.actspace` 为 `undefined` 隐式进入 mock。
- 仓库里**没有 eslint**。

**测试**
- 手写 stub（`window.actspace =`、`defineProperty`、`stubGlobal`）共 35 个文件，其中 5 个是 `R/test/fixtures/*-preview.tsx`。
- 另有 3 个测试 stub `actspaceHosts`：host-feedback、app-remote-host-refresh、remoteArtifact。
- 测试 setup 在 `R/test/setup.ts`，已有 TooltipProvider 包装和 ResizeObserverMock。

## 决策记录

| 日期 | 决定 | 原因 |
| --- | --- | --- |
| 2026-10-05 | 契约放 `S/desktop-bridge/`，子路径 `@actspace/shared/desktop-bridge` | 已拍板（04-1） |
| 2026-10-05 | 兼容层只保留一个提交周期：T3 引入，T10 删除 | 已拍板（04-2） |
| 2026-10-05 | mock 只做 dev 场景，不引入 Story 工具 | 已拍板（04-3） |
| 2026-10-05 | 入参校验用手写 guard，放在 `M/ipc/guards.ts`，**只在 main 使用**；契约中不放 guard 代码 | 已拍板不引入 zod（01-3）；guard 不进 renderer bundle |
| 2026-10-05 | Preload 中的投影逻辑（createSession / forkSession 调用 `projectChatWindow`）移到 `R/api/sessions.ts`，Preload 只转发原始结果 | Preload 只做转发；renderer 已经依赖 `@actspace/client` |
| 2026-10-05 | 用脚本 `scripts/check-renderer-bridge-access.mjs` 代替 eslint 的 `no-restricted-properties` | 仓库没有 eslint，不为此引入 |
| 2026-10-05 | mock 注入条件为 `import.meta.env.DEV && !window.actspace`；生产构建缺少 bridge 时显示致命错误页 | 生产包不含 mock；Electron dev 有 preload，不受影响 |

## 契约形态

```ts
// S/desktop-bridge/contract.ts
export const desktopBridgeContract = {
  sessions: {
    create: invoke<CreateSessionInput, CreateSessionOutput>(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession),
    // …
  },
  hosts: { list: invoke<void, HostListItem[]>(HOST_IPC.list), onChanged: event<HostChangedEvent>(HOST_IPC.changed) },
  // 域划分见 04 §3：sessions、tasks、approvals、workspace、review、terminal、settings、providers、models、
  // speech、englishLearning、browser、performance、updates、hosts、shell、appearance
} as const;
export type DesktopBridge = BridgeOf<typeof desktopBridgeContract>;
```

- channel 字符串只从现有常量取，不新造。
- `actspaceHosts` 并入 `hosts` 域，`window.actspaceHosts` 作为兼容别名保留到 T10。

## 实施步骤

| # | 文件 | 改动 | 测试 / 验证 |
| --- | --- | --- | --- |
| T0 | `docs/exec-runs/…/execution-process.md` | 把基线清单写进执行记录：手写 stub 测试文件清单（35 个）、`window.actspace` 调用计数、preload 全部 channel（含字面量）、`setAgentRunResult` 写入点 grep 结果 | 只是记录 |
| T1 | 新增 `S/desktop-bridge/{contract,types,index}.ts`；`packages/shared/package.json` exports 加 `./desktop-bridge`；`apps/desktop/vite.config.mts`、`apps/desktop/vitest.config.ts` 加 alias | 定义 `invoke` / `event` / `BridgeOf` 和全部域，只覆盖 preload 现在实际暴露的方法 | `pnpm --filter @actspace/shared typecheck`；新增 `S/test/desktop-bridge-contract.test.ts`：channel 值无重复；用 `expectTypeOf` 断言 `DesktopBridge` 覆盖 `global.d.ts` 中 `Window["actspace"]` 的全部成员名 |
| T2 | 新增 `M/ipc/registry.ts`、`M/ipc/guards.ts` | 注册器 `registerContract(contract, handlers, { guards })`：统一做 sender 校验（调用 11 的 `assertTrustedSender`）、guard 校验、错误包装。为高风险 channel 写 guard：openExternal、工作区文件读写、终端创建 / 写入、工作区路径、设置写入、Host 配对 | 新增 `M/test/ipc-registry.test.ts`：非信任 sender 被拒；guard 失败时抛出带 channel 名的错误且不调用 handler；新增 `M/test/ipc-guards.test.ts`：每个 guard 至少有合法 / 非法各一个用例 |
| T3 | `M/runtime-v2/fixed-renderer-ipc.ts`、`desktop-shell-ipc.ts`、`remote-hosts/ipc.ts`、`english-learning-ipc.ts`、`performance-ipc.ts`、`M/index.ts` | 6 处局部 `handle` 包装改用 `registerContract`，逐文件提交 | 每个文件提交后运行 `pnpm --filter @actspace/desktop test`，对应 main 测试通过 |
| T4 | 新增 `P/build-bridge.ts`；改写 `P/index.ts` | `buildBridge(desktopBridgeContract) satisfies DesktopBridge`；删除短别名表和 130 处 `as Promise<`；删除 :4-5 的投影 import，createSession / forkSession 直接返回原始 projection；保留旧的扁平方法名和 `actspaceHosts`（兼容层） | `pnpm --filter @actspace/desktop test -- runtime-v2-preload-bundle`；`pnpm --filter @actspace/desktop typecheck`；Electron 启动冒烟（见 00「能做的验收」） |
| T5 | 新增 `R/api/sessions.ts` | 承接 T4 移出的投影：调用 bridge 后执行 `projectChatWindow` / `createMessageBlocks`，返回与原来相同的结构 | 新增 `R/test/api-sessions.test.ts`：同一个 projection 输入，输出与旧 preload 实现一致（用旧实现的结果做对照快照） |
| T6 | `apps/desktop/src/global.d.ts`；删除 `R/remote-hosts.d.ts` | 改为 `actspace: DesktopBridge`，所有成员必选；按 tsc 报错逐个删除 `?.` 和「方法是否存在」检查（SettingsPage 的四个 `has*Bridge`、`hasBrowserBridge`、`hasSkillsBridge`、约 40 处内联检查）。`appearance/apply.ts` 的浏览器兜底改由 mock bridge 提供 `setNativeTheme` 空实现 | `pnpm --filter @actspace/desktop typecheck` 通过；`grep -rnE "window\.actspace\?\.\|!window\.actspace\." apps/desktop/src/renderer --include=*.ts --include=*.tsx` 只剩 `main.tsx` |
| T7 | 新增 `R/api/bridge.ts`（`installBridge` / `getBridge`）和 `R/api/<域>.ts`；迁移调用方 | 按域迁移：先 App，再 Settings 系列，再其余。每个域一个提交 | 每次提交运行 `pnpm --filter @actspace/desktop test`；新增 `scripts/check-renderer-bridge-access.mjs`，根 `package.json` 加 `check:renderer-bridge`：`window.actspace` 和 `actspaceHosts` 只允许出现在 `main.tsx`、`api/bridge.ts`、`mock/**`、`test/**`；脚本带单测 `scripts/test/renderer-bridge-access.test.mjs` |
| T8 | 新增 `R/mock/{install-mock-bridge,create-mock-bridge}.ts` 和 `R/mock/scenarios/{empty,streaming,long-session,approval-pending,remote-host}.ts`；改 `R/main.tsx`、`R/App.tsx` | `main.tsx`：在 `applyAppearance` 和 `createRoot` 之前，当 `import.meta.env.DEV && !window.actspace` 时动态 import mock 并 `installBridge`，场景取 `?mock=`，默认 `empty`；生产缺 bridge 时显示致命错误页。App 删除 40 处 `hasActspaceBridge()`、`createLocalEmptySession`、`createLocalForkSession`、`localSessionRecords`、`agentRunResult`（先确认无写入点）。**这是 08 §5 验证矩阵依赖的 mock 场景** | 新增 `R/test/main-bridge-install.test.ts`：生产模式缺 bridge 时渲染致命错误；DEV 模式注入 mock。浏览器检查：`pnpm --filter @actspace/desktop dev:renderer` 后，用 headless Chrome 截图 `?mock=empty`、`?mock=streaming`、`?mock=remote-host`，均无白屏、控制台无报错。`pnpm --filter @actspace/desktop build` 后 `grep -r "create-mock-bridge\|mock/scenarios" apps/desktop/dist` 为空（产物目录按构建配置核对） |
| T9 | 新增 `R/test/helpers/bridge.ts`（`setupBridge(overrides, scenario?)`）；`R/test/setup.ts` 的 afterEach 中清理；迁移 30 个测试和 5 个 fixture | 先迁 6 个 `app-*` 测试，再迁 Settings 系列，其余每批 5–8 个文件一个提交 | `pnpm --filter @actspace/desktop test` 全绿；`grep -rnE "window\.actspace\s*=\|defineProperty\(window, ?\"actspace\"\|stubGlobal\(\"actspace" apps/desktop/src` 为 0 |
| T10 | `P/index.ts`、`R/api/bridge.ts`、根 `package.json`、`scripts/check-ipc-channels.mjs`（11 T8） | 删除兼容层（扁平方法名、`actspaceHosts` 别名）；把 `check:renderer-bridge` 加进根 `test` 脚本；`check-ipc-channels` 改为以 `desktopBridgeContract` 为准：契约中的每个 channel 都必须在 main 中注册，main 注册了但契约里没有的 channel 一律失败（11 T8 的约定） | `pnpm --filter @actspace/desktop typecheck && pnpm --filter @actspace/desktop test`；`pnpm check:renderer-bridge`；`pnpm check:ipc-channels`，以及更新后的 `scripts/test/ipc-channels.test.mjs` |
| T11 | `docs/FRONTEND_VERIFICATION.md`；新增 `docs/design-docs/frontend/front-preload-bridge与mock规范.md` | 写入 mock 场景表（`?mock=` 的 5 个场景各自覆盖什么）和 08 §5 的验证矩阵；规范写契约位置、新增 channel 的步骤、guard 约定、mock 场景约定 | `pnpm check:current-docs` |

## 验证方式

```bash
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-tokens
pnpm check:renderer-bridge      # T7 之后
pnpm check:current-docs         # T11
```

- **浏览器 mock**：5 个场景各截一张图，存进执行记录目录。
- **Electron**：启动冒烟，打开会话、发送、终端、设置页各看一次。具体方式见 00「能做的验收」。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 126 个可选成员改成必选后 tsc 报出大量错误 | T6 一个提交内处理完；先 T1 让契约覆盖全部成员，再切类型 |
| 投影从 preload 移走后数据结构有细微差异 | T5 用旧实现的输出做对照测试 |
| shared 子路径 alias 漏改，运行时才报错 | T1 同时改 vite、vitest、exports 三处；T4 后 Electron 冒烟 |
| guard 过严，误拒合法调用 | guard 只校验类型和形状，不校验业务规则；每个 guard 都有合法输入用例；Electron 冒烟走一遍常用路径 |
| 兼容层漏删 | T10 的 `check:renderer-bridge` 和 typecheck 卡住 |
| mock 进入生产包 | T8 构建后 grep 产物 |

**回滚**：T1–T3 只新增模块、切换注册方式，可单独 revert；T4–T6 要连同 T5 一起 revert；T8 可单独 revert，App 的 mock 分支会恢复。

## 进度记录

- [x] T0–T11（2026-10-06）。执行顺序调整（T6 → T8 → T9 → T6b → T9h → T7 → T10 → T11）、偏差和复核处理见执行记录；交接见 `docs/exec-runs/20261005-desktop-fe-13-preload-bridge/acceptance-handoff.md`。

## 执行模式

连续执行（见 00）。

## 执行文档

`docs/exec-runs/20261005-desktop-fe-13-preload-bridge/`：`execution-process.md`、`execution-summary.md`、`acceptance-handoff.md`。验收重点：Electron 中各功能区冒烟（会话、终端、Review、设置各页、远端 Host、语音 / 英语学习），以及浏览器 5 个 mock 场景。
