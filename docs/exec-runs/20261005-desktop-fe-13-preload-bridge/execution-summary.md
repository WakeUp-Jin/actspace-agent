# 13 Preload 与 Mock Bridge — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/13-Preload与MockBridge执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-13-preload-bridge/execution-process.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T11 全部完成，另有一个处理只读复核发现的提交。真实桌面端的行为应当不变；变化在浏览器开发模式（App 换成注入的 mock bridge）和非桌面环境（显示致命页，不再白屏或降级）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 契约（T1） | `packages/shared/src/desktop-bridge/` | 22 个域、160 个 channel（invoke 148 / send 1 / event 11），外加 2 个 local；5 种 spec，`BridgeOf` 推导签名；channel 全部来自 4 组常量 |
| 注册器与 guard（T2、T3） | `main/ipc/registry.ts`、`main/ipc/guards.ts`、5 个 IPC 文件 | sender 校验 → guard → middleware → handler；22 个高风险 channel 有 guard，拒绝时抛 `IpcInputError`「原因 (channel)」；远端路由、远端拒绝、英语学习错误收口放进 middleware |
| preload 按契约生成（T4） | `preload/index.ts`、`shared/desktop-bridge/build-bridge.ts` | 623 行 → 约 30 行；bundle 633 KB → 38 KB；只暴露 `window.actspace` |
| 会话投影移到 renderer（T5） | `renderer/api/sessions.ts` | `createSession` / `forkSession` / `getSession` / `getSessionToolDetail` 的投影，与旧 preload 输出做了 `toEqual` 对照 |
| 类型与存在检查（T6、T6b） | `global.d.ts`、44 个 renderer 文件 | `actspace: DesktopBridge` 全部必选；删除约 220 处可选链、存在检查、`has*Bridge` 和「当前环境不支持」降级分支 |
| `api/<域>`（T7） | `renderer/api/` 21 个域文件 + 约 60 个调用方 | 组件只 import `api/<域>`；`hosts.call` 改为单对象 `{ hostId, method, params }` |
| mock bridge（T8） | `renderer/mock/`、`bridge-bootstrap.ts`、`main.tsx`、`App.tsx` | 内存 bridge + 5 个 `?mock=` 场景；App 删除全部无 bridge 分支和死状态 `agentRunResult`；生产包不含 mock |
| 测试打底（T9、T9h） | `renderer/test/helpers/bridge.ts`、约 50 个测试和 5 个 fixture | `setupBridge({ "域.成员": fn })` 以默认 mock 为底；`setup.ts` 每个用例前后统一安装和重置 |
| 删除兼容层与审计（T10） | `shared/desktop-bridge/legacy.ts`（删除）、`scripts/check-ipc-channels.mjs`、`scripts/check-renderer-bridge-access.mjs` | IPC 审计以契约为准；`check:renderer-bridge` 禁止入口以外直接访问 `window.actspace` 和导入 `api/bridge`，已接入根 `pnpm test` |
| 文档（T11） | `docs/design-docs/frontend/front-preload-bridge与mock规范.md`、`docs/FRONTEND_VERIFICATION.md` | 规范 8 节；mock 场景表；重构期验证矩阵 |

## 偏差

- **T1**：类型断言放在 `renderer/test/desktop-bridge-contract-types.test.ts`，而不是计划写的 shared 测试，因为 shared 的 tsconfig 排除了测试目录，tsc 不会检查那里的断言。
- **T2**：没有用 `registerContract(contract, handlers)` 一次性注册，改为注册器加逐个 `ipc.handle(spec, handler)`。原因：160 个 channel 分散在 5 个文件，逐个注册时 diff 基本是一行换一行。类型约束和职责与计划一致。
- **T3**：契约收紧出参类型后，暴露了 16 处类型不一致，都在类型层面修正，运行时返回值不变。其中共享类型 `QuickOpenRequest` 从 `{ requestId }` 改为 `{ requestedAt }`，对齐 main 实际的负载。
- **T4 + T5**：合并为一个提交，否则中间提交的 App 不可用。`buildBridge` 从 preload 移到 shared，preload 和 mock 共用同一份实现。
- **执行顺序**：T6 只切类型；删除存在检查（T6b）挪到 T8、T9 之后，因为这些检查在 mock 和 `setupBridge` 落地之前还在承担兜底。T7 放在 T6b 之后。
- **T7**：按调用方分批提交（5 个提交），不是按域，因为一个文件常常同时用到多个域。
- **T9h**：T9 的验收 grep 漏掉了 `(window as …).actspace` 写法，补迁移了 9 个测试文件。T7 的审计脚本把这种写法也覆盖了。
- **T9**：两个预览 fixture 原本就缺 `TooltipProvider`，渲染报错，顺手补上。
- **复核后**：
  - mock 的 Host 重连和移除改为按连接 id 匹配；
  - 删除终端视图的死分支；
  - 审计增加 `api/bridge` 导入规则；
  - `ensureBridge` 失败时显示致命页。

## 人工验证指引

### 必须验证

1. **Electron 各功能区冒烟**
   - 验证方式：
     - 新建会话并发送一条消息，等流式输出结束；
     - 切换、置顶、重命名、归档、分叉会话，右键「复制会话记录」；
     - 打开终端，输入命令；
     - 打开 Review，看 diff；
     - 设置 10 页逐个打开，改一个开关；
     - 「远端 Host」页配对或重连一台真实 Host；
     - 在通用页配置语音，打开英语辅助学习。
   - 预期结果：都和重构前一致；没有「当前环境不支持 / 尚未加载」类提示；控制台没有 `is not a function`。
2. **远端 Host 真实路径**
   - 验证方式：连接一台真实 Host，在 Host 上新建会话，读远端文件引用，预览并下载产物。
   - 预期结果：正常。`hosts.call` 的入参形状变了，mock 没有实现这部分，单测也只覆盖了转发。
3. **浏览器 mock 的 5 个场景**
   - 验证方式：`pnpm --filter @actspace/desktop dev:renderer`，依次打开 `?mock=empty|streaming|long-session|approval-pending|remote-host`。
   - 预期结果：与 `docs/FRONTEND_VERIFICATION.md` 场景表一致。

### 建议验证

- 在生产构建的 renderer 里直接用浏览器打开 `dist/index.html`，应显示「无法连接桌面服务」致命页。

## Agent 已完成的验证

- shared / desktop typecheck 通过。
- 测试：
  - desktop：文件 145 通过 / 1 失败 / 1 跳过，用例 1098 / 1 / 2。唯一失败是基线中已知的 `workspace-git-context-service`。与 12 结束时相比，多 7 个文件、57 个用例。
  - shared：19 个文件、148 个用例通过。
- 脚本检查：`check:ipc-channels`（契约 160 个 channel）、`ipc-channels.test.mjs`（12）、`check:renderer-bridge`（287 个文件）、`test:renderer-bridge`（6）、frontend-tokens、frontend-theme、current-docs 通过。
- 变异验证：
  - 契约类型错误会被 typecheck 拦住；
  - 两个审计脚本用违规代码反向验证：T7 前的 renderer 报 238 处；临时加一行 `api/bridge` 导入会报错；
  - mock Host 的修复退回后，新用例失败。
- 生产包：grep 不到 mock 相关字符串，能 grep 到 `Desktop bridge missing`。
- Electron CDP（真实 preload，临时数据目录）：
  - 22 个冻结域，没有扁平名，也没有 `actspaceHosts`；
  - 新建、复制记录、分叉会话正常；
  - 终端经 IPC 回显，也能从界面打开；
  - guard 拒绝非法终端输入；
  - `hosts.call` 单对象入参能到达 main；
  - 设置 10 页、语音 / 英语学习区块、Review 面板、Host 配对表单校验都正常。
- 浏览器 mock：5 个场景、5 个预览 fixture 都截图检查过，控制台没有 error；`?mock=remote-host` 下 Host 重连、移除正常。
- Sonnet 只读复核：没有发现运行时回归；修了 5 条，4 条说明后不改（见执行记录「复核处理」）。

## 已知风险和遗留事项

- `hosts.call` 的返回仍是 `unknown`。按 method 区分返回类型，要先在 host-protocol 补一张方法类型表，属于协议层改动（C3），本计划不做。
- mock 没有实现 `hosts.call` / `preview` / `download`、`terminal.create`、worktree 创建，调用会 reject。远端 Host 工作区在 mock 里显示为「等待 Host …」。
- 全量测试偶发未处理错误 `window is not defined`：约 3/7 次出现，来自 `ResponseAnnotationPill` 的 HoverCard 定时器。在本计划起点 05ffe370 上也能复现，与本计划无关，用例计数不受影响。
- `ConversationView`「当前环境不支持可视化转换。」和 `TurnOutputArtifacts`「当前环境不支持会话图片预览。」实际是 `!sessionId` 分支，文案措辞过时，没有改。
- `check-ipc-channels` 不剥注释，也不检查重复注册（重复注册在运行时会直接抛错）。`check:renderer-bridge` 认不出动态拼接的属性名。
- `docs/exec-runs/…/tools/` 下的两个 codemod 依赖已删除的 `legacy.js`，不能再运行，保留作为执行记录。
- 学习文档：`docs/learnings/2026-10/20261006-single-contract-bridge.md`。

## 后续建议

- 进入 14（状态层）。08 §5 验证矩阵里标 `*` 的单测，在 14–16 中随各计划补上。
