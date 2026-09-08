# ActSpace v2 P00：契约地基与 ESM Runtime 隔离岛

状态：已完成

父计划：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/README.md`

依赖：无

消费者：P01 Cordis 准入、P02 pi-ai 准入、P03 Trusted Boot 与 Composition，以及后续 Session、Agent、Tool、Host 子计划

exec-run slug：`actspace-v2-p00-contracts-and-esm-island`

## 目标

建立一个与现有 CommonJS Agent Core 并存的 `@actspace/agent-runtime` ESM NodeNext 隔离岛，并在 `@actspace/shared/runtime-v2` 下提供不携带 Cordis、pi-ai 或旧 Session 类型的 JSON-safe Host DTO。P00 完成后，后续工作可以在新包内编译和测试，但 v1 默认 Runtime、Desktop 启动路径和旧 SessionEvent 仍保持原状。

## 范围

包含：

- 新增 `packages/agent-runtime` workspace package，固定包名 `@actspace/agent-runtime`。
- 固定 `type: "module"`、TypeScript `module: "NodeNext"`、`moduleResolution: "NodeNext"`、`strict: true`、`target: "ES2022"`。
- 在 `packages/shared/src/runtime-v2/` 建立命名空间入口和 Host DTO。
- 为 `@actspace/shared/runtime-v2` 增加独立 package export，不改变根入口的 v1 导出形态。
- 建立新包的 typecheck、Vitest 和公共边界测试。
- 固定 P01-P03 共用的 Host kind、capability ceiling、request context 和诊断 DTO 名称。

不包含：

- 不引入 Cordis 或 pi-ai 依赖；依赖准入分别由 P01、P02 负责。
- 不实现 `RuntimeHandle`、Agent Loop、Session writer、Tool executor、Prompt contributor 或 Host Adapter。
- 不修改旧 `SessionEvent`、`RuntimeStreamEvent`、`SessionMeta`、旧 IPC channel 或现有 `packages/agent-core` 构建模式。
- 不切换 Desktop、CLI `run` 或 CLI `chat` 的默认 Runtime。
- 不删除 Kairos、fs-watch 或任何 v1 生产代码。

## 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PLANS_GUIDE.md`
- `docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `packages/shared/tsconfig.json`
- `packages/agent-core/package.json`
- `packages/agent-core/tsconfig.json`
- `pnpm-workspace.yaml`

## 当前基线

- workspace 通过 `packages/*` 自动发现包；当前没有 `packages/agent-runtime`。
- `@actspace/shared` 和 `@actspace/agent-core` 的生产输出是 CommonJS，`@actspace/agent-core/tsconfig.json` 当前 `strict` 为 `false`。
- `@actspace/shared` 根入口导出旧 Session、IPC 和跨进程类型；其 `session.ts` 中的 `SessionEvent` 是 v1 事实，不得被 v2 DTO 替换或扩展成双真相。
- 当前 shared package 只有根 export 和 `session-selectors` export，没有 `runtime-v2` 子路径。
- 现有 Desktop、CLI 和 Agent Core 仍通过 `@actspace/shared` 消费旧契约；P00 只增加隔离入口，不改变这些消费者。

## 输入契约

P00 必须遵守以下已确认语义：

- 新 Runtime package 的公共边界不能暴露 Cordis `Context`、`Fiber`、`Service` 或 pi-ai 类型。
- Host DTO 必须是 JSON-safe、可序列化、可脱敏的值对象；不能包含函数、class instance、Symbol、文件句柄、Secret 或 Electron 对象。
- Host capability ceiling 只表示 ActSpace 受信任插件的 admission/capability-handle 限制，不宣称 OS 沙箱或恶意代码隔离。
- v2 DTO 必须使用 `RuntimeV2` 命名空间，避免和旧 `SessionEvent`、`RuntimeStreamEvent` 同名或结构复用。

## 输出契约

### `@actspace/shared/runtime-v2`

实现文件：

- `packages/shared/src/runtime-v2/host-dto.ts`
- `packages/shared/src/runtime-v2/index.ts`
- `packages/shared/src/runtime-v2/test/host-dto.test.ts`
- `packages/shared/package.json` 的 `runtime-v2` export

固定导出类型：

- `RuntimeV2HostKind`：`"desktop" | "cli-run" | "cli-chat"`。
- `RuntimeV2HostCapability`：`"filesystem.read" | "filesystem.write" | "network" | "browser" | "tty" | "approval" | "credential" | "renderer" | "process"`。
- `RuntimeV2HostCapabilityCeiling`：只读 capability 数组，不能用可变全局 Map。
- `RuntimeV2HostDescriptor`：`hostKind`、`capabilityCeiling`、`runtimeContract`、`invocationId` 四个必需字段，以及可选的非敏感 `workspaceRef`。
- `RuntimeV2HostRequestContext`：`requestId`、`host`、可选 `sessionId`、可选 `agentRunId`。
- `RuntimeV2DiagnosticSeverity`：`"info" | "warning" | "error"`。
- `RuntimeV2DiagnosticCode`：`"HOST_CAPABILITY_MISMATCH" | "FRONTEND_INCOMPATIBLE" | "PLUGIN_CONFLICT" | "PLUGIN_SKIPPED" | "MISSING_SERVICE" | "SESSION_CODEC_UNAVAILABLE" | "RESTART_REQUIRED" | "SHUTDOWN_INCOMPLETE"`。
- `RuntimeV2HostDiagnostic`：`code`、`severity`、`message`、`origin`，以及可选的 `pluginId`、`entryId`、`details`；`details` 只能包含 JSON scalar。

`packages/shared/src/runtime-v2/index.ts` 只重导出上述 DTO。不得从该入口导出 Cordis、pi-ai、旧 SessionEvent 或 Agent Runtime class。

### `@actspace/agent-runtime`

实现文件：

- `packages/agent-runtime/package.json`
- `packages/agent-runtime/tsconfig.json`
- `packages/agent-runtime/vitest.config.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/test/package-boundary.test.ts`

P00 阶段 `src/index.ts` 只重导出 `@actspace/shared/runtime-v2` 的 DTO 类型和 `RuntimeV2HostRequestContext`，不导出 `RuntimeHandle`、Cordis root 或任何未实现的运行时 class。包必须能独立执行 `typecheck` 和测试。

## 允许修改

- `packages/agent-runtime/package.json`
- `packages/agent-runtime/tsconfig.json`
- `packages/agent-runtime/vitest.config.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/test/package-boundary.test.ts`
- `packages/shared/package.json`
- `packages/shared/src/runtime-v2/host-dto.ts`
- `packages/shared/src/runtime-v2/index.ts`
- `packages/shared/src/runtime-v2/test/host-dto.test.ts`
- `pnpm-lock.yaml` 仅在新增 workspace package 需要更新时修改

## 禁止修改

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts` 的既有 v1 导出
- `packages/agent-core/**`
- `apps/desktop/**`
- `apps/cli/**`
- `plugins/**`
- 根 `package.json` 的现有脚本语义
- 任意 v1 Session 数据或用户数据目录

## 任务与测试

### P00.1：创建 ESM package 边界

在 `packages/agent-runtime/package.json` 写入精确的 `name`、`type`、`main`、`types`、`exports`、`build`、`typecheck` 和 `test` 字段；`exports` 只提供 ESM `import` 和类型入口。`tsconfig.json` 必须使用 `NodeNext`、`strict: true`、`rootDir: "src"`、`outDir: "dist"`、`types: ["node"]`。

测试：`packages/agent-runtime/src/test/package-boundary.test.ts` 检查 package metadata、构建产物为 ESM、根入口不存在 `RuntimeHandle` 和 Cordis/pi-ai import。

### P00.2：建立 runtime-v2 Host DTO

在 `host-dto.ts` 实现上述固定类型，并用 `satisfies` 或显式纯函数保证 DTO 只接受 JSON-safe 值。`host-dto.test.ts` 覆盖三种 Host kind、capability ceiling 只减语义、诊断脱敏字段和 JSON round-trip。

测试：`pnpm --filter @actspace/shared exec vitest run src/runtime-v2/test/host-dto.test.ts`。

### P00.3：增加 shared 子路径导出

在 `packages/shared/package.json` 增加 `runtime-v2` 的 types/require/default 映射，确认现有根入口和 `session-selectors` export 不变。构建后分别用 `import("@actspace/shared/runtime-v2")` 和现有 v1 consumer 做解析测试。

### P00.4：锁定隔离边界

运行仓库级静态检查，确认 `packages/shared/src/runtime-v2/**` 不出现 `SessionEvent`、Cordis、pi-ai、Electron 和 Secret 类型依赖，`packages/agent-runtime/src/index.ts` 不暴露完整 RuntimeHandle。

## 并行边界

- P00 是 P01、P02、P03 的唯一共同前置，P01 与 P02 在 P00 完成后可以并行。
- P00 不修改 v1 运行路径，因此与现有 v1 修复可以并行，但共享 `packages/shared/package.json` 时必须串行合并。
- P03 只能消费 P00 已锁定的 DTO 名称，不得在自己的文件中重新定义 Host DTO。

## 失败停线与回退

- `NodeNext`、strict 编译或 ESM package export 无法在当前 Node 目标运行时成立时，停止 P00，不把 CommonJS fallback 写入新包；记录具体编译或加载错误后回到 v2 设计评审。
- shared 子路径导出破坏现有 v1 consumer 时，只回退 `runtime-v2` export 和新目录，不修改旧 export 以“修复”兼容性。
- DTO 出现 Secret、Cordis、pi-ai 或 Electron 引用时，停止后续计划，删除未发布的新 DTO 文件并保留 v1 数据与代码不变。
- P00 不改变默认启动，因此回退只涉及新增 package、shared 子路径和 lockfile；不得使用 destructive Git 操作覆盖用户已有改动。

## 验证命令

```bash
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/shared exec vitest run src/runtime-v2/test/host-dto.test.ts
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime exec vitest run src/test/package-boundary.test.ts
pnpm check:docs
pnpm check:repo
pnpm check:secrets
git diff --check
```

预期结果：所有命令退出码为 0；旧 shared、agent-core、desktop 和 CLI 测试无需修改即可继续通过。

## 完成标准

- `@actspace/agent-runtime` 能以 NodeNext strict ESM 独立构建和测试。
- `@actspace/shared/runtime-v2` 能被解析，且旧 root/session-selectors export 行为不变。
- 固定的 `RuntimeV2Host*` 类型通过 JSON round-trip 和脱敏测试。
- 新包根入口没有 `RuntimeHandle`、Cordis、pi-ai 或旧 SessionEvent 公共导出。
- P01、P02、P03 可以直接引用本计划中的路径和类型，不再发明平行 DTO。

## 进度

- [x] P00.1：创建 `@actspace/agent-runtime` ESM NodeNext package。
- [x] P00.2：实现 `runtime-v2` Host DTO 和测试。
- [x] P00.3：增加 shared 子路径 export。
- [x] P00.4：完成隔离边界和全仓验证。

## 决策记录

- 2026-08-22：新 Runtime 采用独立 `packages/agent-runtime`，不把 Cordis 静态导入旧 CommonJS `packages/agent-core`。
- 2026-08-22：跨进程 v2 DTO 置于 `@actspace/shared/runtime-v2` 命名空间，旧 `SessionEvent` 保持只读历史边界。
- 2026-08-22：P00 不发布完整 RuntimeHandle，避免在 Agent、Session、Tool 和 Host 语义尚未实现时形成半成品公共 API。
- 2026-08-22：`RuntimeV2HostCapabilityCeiling` 通过纯函数执行只减约束；请求增加宿主未授予的能力时直接拒绝。
- 2026-08-22：P00 实现与边界验收完成；锁定版本的依赖树恢复验证保留在 exec-run 风险记录中，并继续作为 P01 fresh-install 门禁的一部分。
