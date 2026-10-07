## 2026-10-06 02:08 | Task: Desktop 前端重构 13：Preload 与 Mock Bridge

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-13`。
- 状态：完成，已交给验收。
- Runtime 补充：子分支 `refactor/desktop-fe-13`，squash 回 `refactor/desktop-frontend`。Electron 检查用 CDP，浏览器 mock 检查用独立 profile 的 headless Chrome。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第四份是 13：Renderer、Preload、Main 只认 `@actspace/shared` 中的一份 `DesktopBridge` 契约，main 用统一注册器并校验高风险入参，renderer 只经 `api/*` 访问 bridge，浏览器 mock 改为注入式，测试统一用 `setupBridge()`。

### 主要改动

- **契约**：`packages/shared/src/desktop-bridge/` 新增契约，22 个域、160 个 channel，外加 2 个 local。
  - 5 种 spec：`invoke` / `invokeWithDefault` / `event` / `send` / `local`。
  - `BridgeOf` 由 spec 推导方法签名。
  - `buildBridge` 按契约生成冻结对象，preload 和 mock 共用。
- **main**：
  - `ipc/registry.ts` 统一做 sender 校验 → 入参 guard → middleware → handler；
  - `ipc/guards.ts` 按 channel 为 22 个高风险入口（文件、路径、终端、设置写入、Host）配 guard；
  - 5 个 IPC 文件全部改为 `ipc.handle(contract.域.成员, …)`。
- **preload**：从 623 行减到约 30 行，只剩 `buildBridge` + `exposeInMainWorld("actspace", bridge)`，bundle 从 633 KB 降到 38 KB。
  - 会话投影（4 个方法）移到 `renderer/api/sessions.ts`。
  - 删除 `window.actspaceHosts` 和扁平别名。
- **renderer**：
  - `global.d.ts` 改为 `actspace: DesktopBridge`，成员全部必选；
  - 删除约 220 处可选链、存在检查、`has*Bridge` 和「当前环境不支持」降级分支；
  - 组件只 import 21 个 `api/<域>`；
  - `check:renderer-bridge` 禁止在入口以外直接访问 `window.actspace`、导入 `api/bridge`，已接入根 `pnpm test`。
- **mock**：
  - `renderer/mock/` 是完整的内存 bridge，提供 5 个 `?mock=` 场景；
  - `main.tsx` 先 `ensureBridge()`：Electron 用 preload，dev 动态注入 mock，否则显示致命页；
  - App 删除全部浏览器 mock 分支，生产包不含 mock 代码。
- **测试**：35 + 9 个手写 stub 文件改为 `setupBridge({ "域.成员": fn })`，以默认 mock 为底。
- **审计**：`check:ipc-channels` 改为以契约为准，检查 main 注册、事件发送、方向、常量和 preload 生成方式。
- **文档**：新增 `docs/design-docs/frontend/front-preload-bridge与mock规范.md`；`FRONTEND_VERIFICATION.md` 补 mock 场景表和重构期验证矩阵。

### 设计动机

preload、`global.d.ts`、main 三处各自手写，互不约束：少暴露一个方法或改了参数，编译期不报错，运行时才出 `undefined is not a function`；大量可选成员让 renderer 到处写永远不会走的兜底分支。

### 学习沉淀

- [进程边界的接口只写一份：从契约生成各端](../../learnings/2026-10/20261006-single-contract-bridge.md)：可选成员让类型检查失明；grep 门槛漏掉写法变体；类型断言放在 tsconfig 排除的目录里不会被检查。

### 文件

- `packages/shared/src/desktop-bridge/`、`packages/shared/src/settings.ts`（`QuickOpenRequest`）、`packages/shared/package.json`
- `apps/desktop/src/main/ipc/`、`main/runtime-v2/*-ipc.ts`、`main/remote-hosts/ipc.ts`、`main/english-learning-ipc.ts`、`main/performance-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/api/`、`mock/`、`bridge-bootstrap.ts`、`main.tsx`、`global.d.ts`、`App.tsx` 与约 60 个组件 / hook 文件、`test/helpers/bridge.ts` 与约 50 个测试文件
- `scripts/check-ipc-channels.mjs`、`scripts/check-renderer-bridge-access.mjs` 及测试，根 `package.json`
- `docs/design-docs/frontend/`、`docs/FRONTEND_VERIFICATION.md`、`docs/exec-runs/20261005-desktop-fe-13-preload-bridge/`
