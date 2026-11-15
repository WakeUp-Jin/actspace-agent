# `@actspace/shared` 契约分层：拆大文件、划清桌面契约的归属

## 目标

`@actspace/shared` 被 45 个 workspace 包依赖，是全仓库最大的隐式耦合点。它的两个大文件 `ipc.ts`（1119 行）和 `session.ts`（1087 行）各自混着十来个主题的类型，根桶 `index.ts` 又把一切 `export *` 出去，所以任何后端包都能在不知情的情况下引用桌面端 IPC 契约。

做完这个计划后：

1. 两个大文件变成按主题分的目录（`src/ipc/`、`src/session/`），每个文件只讲一个主题，改一个 IPC 通道只动一个小文件；
2. 「桌面 IPC 契约只能被客户端表面（`apps/*`、`packages/client/*`、`packages/host/*`）引用」从事实变成机械检查，后端领域包以后也不会悄悄依赖上它；
3. 对外 API（根入口与现有子入口导出的符号集合）**完全不变**，461 个引用点一行不改，不与并行中的 PR 冲突。

## 状态

2026-11-09 立项，同日完成 P1（文件拆分 + 边界规则 + 文档），已随 #75 合入。P2 / P3 的评估未开始；当初要等的 #66 / #67 / #68 已在 2026-11-10 合入。

## 范围

**包含（P1，本轮）：**

- `packages/util/shared/src/ipc.ts` → `src/ipc/<主题>.ts` + `src/ipc/index.ts`。
- `packages/util/shared/src/session.ts` → `src/session/<主题>.ts` + `src/session/index.ts`。
- 去掉 `ipc.ts` 里对 `model-config` 的整块转出（根桶已直接导出同一组符号，转出是冗余的）。
- `scripts/check-package-boundaries.mjs` 新增规则：`packages/<capability>/*` 里不在客户端表面白名单的包，不得从 `@actspace/shared` 引用 `src/ipc/` 声明的符号；附测试。
- 同步 `packages/util/README.md`、`docs/ARCHITECTURE.md` 和设计文档里指向旧文件路径的说明。

**不包含：**

- 不改任何引用方的 import 语句；不新增子入口（`./ipc`、`./session`）——要不要加等 P1 落地后再看引用方的实际需求。
- 不把 `shared` 拆成多个 npm 包；不动 `runtime-v2/`、`host-protocol/`、`desktop-bridge/` 等已经分好目录的部分。
- 不改类型定义本身（字段、注释、可选性都原样搬），不借机修 lint 警告。

## 背景

- 相关文档：`packages/util/README.md`、`docs/ARCHITECTURE.md`「依赖方向」、`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`（把 `ipc.ts` 称作类型真源）。
- 相关代码路径：`packages/util/shared/src/{ipc,session}.ts`、`src/index.ts`、`scripts/check-package-boundaries.mjs`、`scripts/test/package-boundaries.test.mjs`。
- 现状数据（2026-11-09，`main@c01bbc2b`）：
  - 根桶 `@actspace/shared` 的引用文件 461 个：`apps/desktop` 389、`apps/web` 15、`packages/client` 14，其余后端包合计 43。
  - 后端包（`core` / `context` / `llm` / `session` / `subagent` / `host` / `harness-evolution` / `english-learning`）从根桶引用的符号里，来自 `ipc.ts` 和 `session.ts` 的为 **0**（`host/agent-host` 的测试引用了 `SessionListPage`，Host 是 `sessions.browse` 的服务端，属于客户端表面）。它们引用的是 `model-config`、`context-estimate`、`harness-stats`、`settings` 常量等。
  - `ipc.ts` 134 个导出，`session.ts` 54 个导出。
- 已知约束：
  - `tsconfig.base.json` 用 `moduleResolution: Node`，`./ipc` 会解析到 `./ipc/index.ts`；`dist/ipc.js` 变为 `dist/ipc/index.js`，仓库内没有任何地方直接引用这两个 dist 路径（`apps/desktop/vite.config.mts` 的别名只覆盖根入口和已有子入口）。
  - `pnpm check:current-docs` 会校验「当前真源」文档里的代码路径是否存在，所以设计文档里的 `shared/src/ipc.ts` 要同步改；histories / learnings / exec-runs 按规则不回头改。

## 风险

- 风险：`export *` 两处导出同名符号时 TS 会静默丢弃该名字。缓解：拆完后用 `tsc` 产出 `dist/index.d.ts`，对比拆分前后根入口的导出名集合必须完全相等（见验证方式）。
- 风险：主题划分有主观性，后来者不知道新类型该放哪。缓解：每个主题文件头部一行说明「这里放什么」，`packages/util/README.md` 列目录表。
- 风险：边界规则误伤。缓解：白名单按能力目录而不是包名写死，规则只看 `import { … } from "@actspace/shared"` 的具名导入和 `import("@actspace/shared").X`，不解析 `export *`；首次落地时仓库内违例应为 0。

## 里程碑

1. **P1 文件拆分 + 边界规则**（本轮，一个 PR）。
2. **P2 评估子入口与引用迁移**：看 `apps/desktop` 是否值得改成从 `@actspace/shared/ipc` 等子入口引用（意义主要在可读性，类型导入没有运行时代价），决定做或删掉这一项。
3. **P3 评估按归属拆包**：`shared` 里被后端包引用的部分（模型目录、上下文估算、Harness 统计）和只被客户端表面引用的部分（IPC、会话投影、设置快照）是否该成为两个包；这会改 45 个 `package.json`，必须在没有大 PR 并行时单独立项。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build && pnpm --filter @actspace/shared test`
  - 导出集合对比：拆分前后分别 `node -e 'console.log(Object.keys(require("./packages/util/shared/dist/index.js")).sort().join("\n"))' > /tmp/exports-{before,after}.txt` 再 `diff`；类型导出用 `dist/index.d.ts` 里的 `export *` 列表 + 各文件 `export type` 名字汇总对比。
  - `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm test:package-boundaries`、`pnpm check:docs`、`pnpm run test:current-docs`、`pnpm gen:contract-matrix --check`。
- 手工检查：`git diff --stat` 里 `packages/util/shared/src` 之外只应有脚本、测试和文档。

## 进度记录

- [x] 立项，确认没有并行 PR 触碰 `packages/util/shared/src`（#65 只改它的 `package.json`）。
- [x] `ipc.ts` 拆分（11 个主题文件，134 个导出名不变）。
- [x] `session.ts` 拆分（7 个主题文件，54 个导出名不变）。
- [x] 边界规则与测试（`check:packages` 新规则，真实仓库零违规，fixture 用例 1 个）。
- [x] 文档同步、验证（根入口运行时导出 193 = 193，类型级导出一致；全仓 typecheck、lint、check:packages、check:docs、契约矩阵、desktop / client / agent-host / web 测试通过）。已随 #75 合入。
- [ ] P2 / P3 评估：#75 与 #66 / #67 / #68 都已合入，可以开始。P3 仍要挑没有大 PR 并行的时候（见里程碑 3）。

## 决策记录

- 2026-11-09：P1 不改引用方、不加子入口。理由：#66（死代码清理）、#67（exhaustive-deps）、#68（Harness 插件解耦）同时开着，任何触碰 461 个引用点的改动都会和它们冲突；而文件拆分 + 规则落地本身已经把「归属」说清楚，引用方怎么 import 是下一步的事。
- 2026-11-09：边界规则做在 `check-package-boundaries.mjs` 而不是 Biome。理由：Biome 的 `noRestrictedImports` 只能按模块路径限制，这里要限制的是「从同一个模块引用的某一组符号」，需要读 `src/ipc/` 的导出清单。
- 2026-11-09：去掉 `ipc.ts` 对 `model-config` 的转出。理由：根桶 `index.ts` 已经 `export * from "./model-config"`，转出不增加任何对外符号；留着只会让人误以为模型目录是 IPC 契约的一部分（`docs/ARCHITECTURE.md` 原先就是这么写的，一并改掉）。

## 执行模式

- **交互模式**：架构层面的整理，每一步都可以单独审阅。

## 执行文档

- `docs/exec-runs/20261109-shared-contract-split/execution-process.md`
- `docs/exec-runs/20261109-shared-contract-split/execution-summary.md`
