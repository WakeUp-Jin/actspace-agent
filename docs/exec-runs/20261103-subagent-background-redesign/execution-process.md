# 子智能体与后台任务改造 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261103-subagent-background-redesign/README.md`
- **执行模式**：交互（连续执行）
- **开始时间**：2026-11-03
- **结束时间**：—

## 执行时间线

### 步骤 0：开工前基线

- **操作**：在分支 `子智能体功能完善`（ae5be208 之上，只有文档改动）跑 `pnpm typecheck`、`pnpm test`。
- **验证**：`pnpm typecheck` 通过。第一次 `pnpm test` 在 `test:contract-matrix` 失败：`agent-contract-matrix.generated.md` 在 main（ae5be208）上已过期，与本次改动无关（stash 后在干净 main 上同样失败）。用 `node scripts/contract-matrix/generate.mjs` 重新生成（2 行 digest 变化）后完整 `pnpm test` 通过，desktop 2663 passed / 7 skipped。此后以「全部通过」为基线。

### 步骤 1：S1 契约与留痕地基

- **操作**：按 `s1-contracts-and-traces.md` 第 1–7 步做了契约、留痕和端口，没有改任何工具行为：
  - 子智能体常量与 inbox 来源；
  - 两个新事件与 Bash prune；
  - `lineage.inheritedThroughSeq`；
  - inbox `source` / `senderId`；
  - 共享类型与投影；
  - 活跃路径 trace 登记；
  - 子 Agent transcript 每步重写所需的渲染与 `refresh`；
  - 宿主可读精确文件名单与 bash-log 路径判定；
  - `actspace.host.models` 端口。

  生成文件（`cordis.yml`、契约矩阵）只用脚本重新生成；桌面构建图重新生成后无变化。
- **影响文件**：
  - shared：`runtime-v2/subagents.ts`（新）、`runtime-v2/{index,projection,live-event}.ts`、`session.ts`、`model-connections.ts`；
  - session-journal：`core-codecs.ts`、`header.ts`；
  - agent：`inbox.ts`；
  - session-projection：`facts.ts`；
  - context-disclosure：`plugin.ts`；
  - session-transcript：`render.ts`、`plugin.ts`、`paths.ts`、`index.ts`；
  - tool-runtime：`permission/host-readable-files.ts`（新）、`permission/index.ts`；
  - runtime：`agent-factory-plugin.ts`、`default-harness.ts`、`manifests.ts`、`startup/boot.ts`、`cordis.yml`；
  - desktop：`model-port.ts`、`desktop-host-adapter.ts`；
  - cli：`runtime-v2/host.ts`、`runtime-v2/host-adapter.ts`；
  - 契约矩阵；
  - 各包测试。
- **决定**：
  - `pendingInbox` 投影的 stateVersion 从 2 升到 3（新增来源字段的过滤规则）。
  - `HostReadableFiles` 放在 tool-runtime，由 agent-factory 插件以 `actspace.host-readable-files` 提供，生命周期跟随 Harness。
  - `isBashLogReadPath` 放在 session-transcript 的 `paths.ts`（tool-runtime 不能依赖 session-transcript），在 runtime 的 `composeHostReadablePath` 里组合。
  - `UsableModelSummary.key` 用 `string`（`ModelKey` 是模板字面量，宿主侧不保证）。
  - 不提供端口的宿主由 boot 用 `EMPTY_MODELS_HOST_PORT` 兜底。
  - desktop 用 `listUsableModels("chat")`，因为没有 `"default"` 这个用途。
  - CLI 远程宿主（`host.ts`）和运行适配器（`host-adapter.ts`）都接上端口。
- **验证**：
  - 涉及包的 `pnpm --filter … test` 全部通过：shared 185、session-journal 42、session-projection 24、agent 17、agent-loop 64、context-disclosure 23、session-transcript 16、tool-runtime 52、runtime 102、client 56、agent-cli 16、desktop 2666 passed / 7 skipped。
  - `pnpm typecheck`、`pnpm test`（全量）、`pnpm check:packages`、`pnpm check:desktop-build-graph`、`pnpm check:ipc-channels`、`pnpm check:docs` 全部 exit 0。
  - 主智能体验收：逐个读了 36 个文件的 diff，确认 `isHostReadablePath` 只在读操作上放行、stateVersion 升级会触发投影缓存重建、boot 兜底空模型端口；复跑 `pnpm -r --no-bail --if-present test`、统一验证命令（含 `check:current-docs`、`pnpm --filter @actspace/desktop build`）全部 exit 0。

## 遇到的问题

- 步骤 1：`default-harness.test.ts` 里替换 Loop 的测试插件继承了 agent-factory 的 `provides`，新增服务后报 `Harness service missing: agent-factory/actspace.host-readable-files`。已在测试插件里补上该服务（替换实现必须提供全部声明的服务，这是契约本身的要求）。
- 步骤 1：desktop typecheck 报 `AgentLoopLiveEvent` 与 `AgentLiveEvent` 不兼容，原因是 `live-event.ts` 的 `inbox-claimed.source` 比 inbox 实际来源窄。已放宽为 `InboxSourceId`。

## 跳过或推迟的事项

- 客户端 `chat.ts` / `stream-adapter` 还没有把新 inbox 来源（`subagent_notification`、`agent_message`）转成 `BackgroundNotice`，`BackgroundNoticeRow` / Web `EventRow` 的文字也没改：留给 S3 第 7 步和 S6。
- `apps/desktop/src/main/application.ts:189` 的 `isIdleForReconfigure` 只排除 `task_notification` 来源：S3 开始写新来源时要一并处理。
- `HostReadableFiles` 跟随 Harness，重载后为空：S5 按计划从 `subagent/spawned` 恢复放行名单。
