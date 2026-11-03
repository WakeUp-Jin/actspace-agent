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

### 步骤 2：S2 后台 Bash

- **操作**：按 `s2-background-bash.md` 第 1–3 步做（第 4 步「登记表只管 Bash」按计划放到 S3）：
  - 日志进会话目录 `sessions-v2/<id>/bash-log/bash_<uuid>.log`；日志 id 就是转后台后的 `taskId`。
  - 沙箱 `TMPDIR` 仍在 `<tmpRoot>/bash-v2/<进程随机目录>/`。
  - 前台命令有结果后立刻删日志（成功、失败、取消前中止都删），超长输出照旧先存成 artifact。
  - Harness 卸载只删沙箱临时目录。
  - 单会话 50MB 清理，在新日志创建后、后台任务结束后检查；被删的后台任务写 `background/task` `prune`，`task_output` 显示 `log pruned`。
  - 端口创建时清扫超过 1 天、不属于当前进程的临时目录。
  - 后台上限 8 → 5。
  - 转后台结果带 `actspace.context.trace`。
  - `task_output` 支持 `since`，末尾写 `log_size` / `next_offset`。
  - 完成通知 `<summary>` 后加 `<output_path>`。
  - bash 描述里的可写目录一句改为 `the workspace and the temp directory are writable`。
- **影响文件**：
  - tool-shell：`bash-log.ts`（新）、`node-ports.ts`、`plugin.ts`、`manifest.ts`、`index.ts`；
  - background-tasks：`types.ts`、`registry.ts`、`notification.ts`；
  - tool-background-tasks：`tools.ts`；
  - 宿主：`apps/desktop/src/main/runtime-v2/tool-host-services.ts`、`packages/host/agent-host/src/node-ports/tool-host-services.ts`；
  - runtime：`default-harness.ts`、`manifests.ts`、`agent-runtime-plugin.ts`、`cordis.yml`（脚本生成）；
  - 契约矩阵（脚本生成）；
  - 测试：tool-shell `node-ports.test.ts`、background-tasks `registry.test.ts`、tool-background-tasks `lifecycle.test.ts`、runtime `plugin-catalog.test.ts`、desktop `runtime-v2-output-reference-flow.test.ts`。
- **决定**：
  - 日志路径规则（会话 ID 校验、`bash_<小写 uuid>.log`）在 tool-shell 的 `bash-log.ts` 里写一份，不让 tool-shell 依赖 session-transcript。两边的注释互相指向，读取放行仍由 `isBashLogReadPath` 判定。
  - shell-tools 的 `HostPort.createPorts` 增加第三个参数 `{ dataRoot }`，由插件从 `actspace.host.session` 读取后传入。`actspace.host.session` 加进 Harness 共享服务名单（`DEFAULT_HARNESS_SHARED_SERVICES`），shell-tools 才能在 manifest 里声明注入它。`agent-runtime` 的 inject 因此不再单独追加这个服务。
  - 被清理的日志只为「本进程的任务，或 Journal 里有 `start` 记录的任务」写 `prune`，同一任务只写一次。退出时被杀的前台残留日志从来不是任务，只删文件、不写事件。
  - `since` 的负数由工具 schema 拒绝（`minimum: 0`），工具里不再重复校验。
  - 清扫临时目录放在 `createNodeBashToolPorts` 里，由 shell-tools 插件 `apply` 调 `createPorts` 时触发（异步、失败只打日志）。为防止其他进程的清扫删掉当前进程长时间没用的临时目录，每条命令前都重新 `mkdir`。
- **验证**：
  - `pnpm --filter @actspace/tool-shell test` 118 passed，新增 6 个用例：前台日志删除、后台日志位置 / trace / dispose 后保留、上限 5、50MB 清理顺序与运行中不删、清扫、`since` 多字节对齐。
  - background-tasks 11 passed：新增 `<output_path>` 与 `since` 透传、`prune` 只写一次（含上个进程的任务、非任务日志不写）。
  - tool-background-tasks 5 passed：新增 `since`、`log_size` / `next_offset`、`log pruned`、负数被 schema 拒绝。
  - runtime 102 passed。
  - `pnpm typecheck`、`pnpm -r --no-bail --if-present test`、`pnpm test`（全量，desktop 2666 passed / 7 skipped）、`pnpm check:packages`、`check:desktop-build-graph`、`check:ipc-channels`、`check:docs`、`check:current-docs`、`pnpm --filter @actspace/desktop build` 全部 exit 0。

### 步骤 3：S3 子智能体核心

- **操作**：按 `s3-subagent-core.md` 第 1–7 步做，另含 S2 第 4 步「登记表只管 Bash」。
  - 删除旧的一次性实现：`provider.ts`、`publication.ts`、`descriptor.ts`、`agent-tool.ts`、`explore-tool.ts`、`tool-plugin.ts`、`terminal-result.ts` 及其测试。
  - 新增 `SubagentManager`（`manager.ts`），实现 `SubagentHostPort`：
    - 创建（同步 / 后台，同步超时转后台）、`send_message`（续派 / 插话；发给兄弟或父会话）、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`；
    - 上限 10，完成通知，唤醒空闲父会话，重启后 `recoverLost`。
  - 新增 `tools.ts`：六个工具的注册，`definitionVersion` 2。`tool-subagent` 改为注册这六个工具，并去掉对 background-tasks 的依赖。
  - 运行时：
    - `agent-runtime` 创建管理器：运行租约来自 `harnesses.acquireForScope` 加 `TaskLedger`，循环来自 `agent-factory.createSubagentLoop`；
    - `boot.ts` 把管理器的七个方法暴露成 `actspace.host.subagents`；
    - `ManagedRuns` 打开会话时先对账后台 Bash，再 `recoverLost`；
    - 释放顺序是先子智能体、再后台任务。
  - 能力与审批：
    - 子会话不带 `approvalBroker`，需要审批时返回设计 02 §5.2 的文字；
    - `backgroundAllowed: false`：子会话的 Bash 不能转后台，最多 10 分钟，超时报 `BASH_TIMEOUT`；
    - 读取父会话当前的会话授权，但不能新增授权；
    - `plan` / `agent` 两种模式的工具表都加入子智能体工具。
  - 模型（子智能体完成，主智能体审过 diff 并复跑）：
    - 删除 explore 用途、路由和 adapter，以及设置字段 `taskModels.exploreModel`、`taskBindings.explore`、`thinking.explore`、`agent.exploreModelId`；
    - 新增设置 `subagentDefaultModel`，`layersVersion` 从 2 升到 3，迁移时删掉 explore 值，新字段从空开始；
    - `actspace.host.models.subagentDefaultModel()` 每次调用都现读设置。
  - 通知与清单：
    - 完成通知走 `subagent_notification`，消息走 `agent_message`；
    - 新包 `context/context-subagents`：主会话有运行中的子智能体时写设计 02 §6.4 的 supplement，没有时什么都不写；
    - 新包已加入模块表、插件清单和契约矩阵来源。
  - 同步清理：
    - 客户端：
      - `agent` 卡片按 `subagent/*` 填 `subagentKind` / `preset` / `description` / `activationCount` / `transcriptPath`，状态跟随最近一次激活；
      - 五个管理工具的行名照设计 05 §1，`send_message` 展开后显示消息原文；
      - 收件箱新的两种来源转成 `BackgroundNotice`。
    - IPC：新增 `interruptSubagent(sessionId, agentId)`（agent-service → registry → IPC）。
    - 统计：harness 统计按激活读 `subagent/activation`，老会话继续读 `delegation/*`。
    - `isIdleForReconfigure` 也不再被 `subagent_notification` 挡住；子智能体运行时禁止切换会话模式。
    - 服务名 `subagent.one-shot` 改为 `subagent.manager`；README 已重写。
- **影响文件**：
  - subagent：`manager.ts`、`tools.ts`、`types.ts`、`messages.ts`、`child-session.ts`、`preset.ts`、`plugin.ts`、`manifest.ts`、`index.ts`；
  - tool-subagent：`manifest.ts`、`plugin.ts`；
  - context-subagents（新包）；
  - shared：`runtime-v2/subagent-projection.ts`（新）、`session-selectors.ts`、`settings.ts`、`model-connections.ts`、`model-resolver.ts`、`desktop-bridge/contract.ts`、`runtime-v2/fixed-renderer.ts`、`harness-stats.ts`、`runtime-v2/projection.ts`；
  - runtime：`agent-runtime-plugin.ts`、`agent-factory-plugin.ts`、`managed-runs.ts`、`session-plugin.ts`、`startup/boot.ts`、`plugin-catalog.ts`；
  - tool-runtime：`prepared-execution.ts`、`runtime.ts`、`executor.ts`；
  - agent：`agent-form.ts`、`agent-mode-policy.ts`；
  - tool-shell：`node-ports.ts`；
  - background-tasks：`types.ts`、`registry.ts`、`notification.ts`、`tool-background-tasks/tools.ts`；
  - client：`tool-card.ts`、`chat.ts`、`stream-adapter.ts`、`stream-blocks.ts`；
  - agent-service：`application.ts`；
  - desktop main：模型 / 设置相关、`fixed-renderer-ipc.ts`、`runtime-registry.ts`、`harness-stats-projection.ts`；
  - `cordis-adapter/service-contract.ts`；
  - 生成物：契约矩阵、build graph、`tsconfig.build.json`；
  - 进程测试：`host-subagent-drain-process.test.mjs`。
- **决定**：
  - 投影没有放在 `subagent` 包的 `projection.ts` / `activation.ts` 里，而是放进 shared 的 `foldSubagentTree`：管理器、`list_agents`、上下文清单和界面都读这一份折叠。激活状态并入 `manager.ts`，内存里只留正在运行的激活。
  - `subagent/spawned` 多记 `toolNames`：创建时固定工具集，每次激活复用，子会话的提示词前缀保持稳定。
  - `allowedToolNames` 以最新一次绑定为准（`runtime.allowedToolNames(sessionId, "main:"+sessionId)`），取不到时退回已注册工具。
  - 设置里的默认模型如果不可用，就跟随父会话当前模型；`list_subagent_models` 的首行按此说明。
  - 重启补记的激活，`delivery` 写 `lost`。
  - 唤醒续派的 ledger 内容是 `{ kind: "background-wake" }`，TaskLedger 不为它写 `user/message`；第一轮以 `runTurn({ content: "", wake: true })` 开始。
  - 「收件箱里还有消息就再跑一轮，否则收尾」的判断和收尾放在同一个锁段里，避免续派打开一个还在关闭的子会话。
  - 上下文清单需要一个 Host 端口方法 `running(sessionId)`：Context 层没有会话和 Journal。
  - 设计 02 之外补了几条错误文字（未知 agent、会话不可用等），格式与设计里已有的文字一致；`list_agents` 里调用者自己用 `(you)` 标注，放在行尾。
  - 子会话照旧不向界面发 `session/event`（与改造前相同）。子 Agent 面板的实时显示归 S6。
  - 子会话的 Bash 超时错误码用 `BASH_TIMEOUT`。
  - 新卡片不填 `agentKind`（只给老会话用），界面按 `subagentKind` / `preset` 显示。
  - `getSubagents` 仍然按 `agent` 调用列：每个子智能体只有一次 `agent` 调用（续派走 `send_message`），所以已经是一个子智能体一行。
  - harness 统计每次激活写一行，`presetId` 为 `actspace.subagent.<preset>`；中断记为 aborted，`max_steps` 和 `lost` 记为失败。
  - `agent-runtime` 在构造时不读 `actspace.host.session`，创建子智能体时才读 `dataRoot`；`initialize` 照旧要求这个服务。
- **验证**：
  - subagent：13 个管理器集成用例加 1 个 lifecycle 用例，覆盖计划第 1 步的全部场景；「需要审批的命令返回 §5.2 文字」在 tool-runtime `runtime.test.ts` 里另加了一个用例。
  - 其余包：tool-subagent 2，context-subagents 4，runtime 102，tool-runtime 52 / runtime.test 42，agent 17，client 61（新增 `subagent-card.test.ts` 5 个），shared 188，background-tasks 12，context-engine 27，agent-service 68（新增 `subagent-interrupt.test.ts`），desktop-app 14，tool-shell 119，session-projection 24，desktop 2672 passed / 7 skipped（新增子智能体统计用例和 `subagent-default-model.test.ts`）——全部通过。
  - `pnpm test:agent-host:process` 7 个全部通过。
  - `pnpm -r --no-bail --if-present test` 无失败。
  - desktop / cli / web 的 typecheck 都是 0 个错误。
  - `check:packages`、`check:plugin-catalog`、`check:repo`、`check:desktop-build-graph`、`check:harness-events`、`check:renderer-bridge`、`check:ipc-channels`、`check:current-docs` 以及根目录全部 `test:*` 脚本都是 exit 0。

## 遇到的问题

- 步骤 1：`default-harness.test.ts` 里替换 Loop 的测试插件继承了 agent-factory 的 `provides`，新增服务后报 `Harness service missing: agent-factory/actspace.host-readable-files`。已在测试插件里补上该服务（替换实现必须提供全部声明的服务，这是契约本身的要求）。
- 步骤 1：desktop typecheck 报 `AgentLoopLiveEvent` 与 `AgentLiveEvent` 不兼容，原因是 `live-event.ts` 的 `inbox-claimed.source` 比 inbox 实际来源窄。已放宽为 `InboxSourceId`。

- 步骤 2：第一次全量测试 runtime 有 7 个失败（`shell-tools: Incompatible services contract actspace.host.session`）：Harness 只允许声明共享服务名单里的服务。已把 `actspace.host.session` 加进名单并重新生成 `cordis.yml`。
- 步骤 2：第一次 `pnpm test` 的 `test:contract-matrix` 报契约矩阵过期：矩阵是在 shell-tools manifest 加注入之前生成的。重新跑生成脚本后通过。

- 步骤 3：runtime 的 `agent-runtime-lifecycle.test.ts` 有 2 个失败，原因是构造时就读 `actspace.host.session`。已改为创建子智能体时再读。
- 步骤 3：`host-subagent-drain-process` 失败：测试还在用旧参数 `{ task }`。已改为 `{ description, prompt, background: false }`，按新行为验证排空时会等父会话和子智能体都结束。
- 步骤 3：`check:packages` 要求可加载的插件包有 lifecycle 测试。旧的已随旧实现删除，`subagent` 和 `context-subagents` 已各补一个。
- 步骤 3：第一次跑客户端新用例失败，原因是 shared 的 dist 没重新构建。重建后通过。

## 跳过或推迟的事项

- 客户端已在 S3 第 7 步把新 inbox 来源转成 `BackgroundNotice`；`BackgroundNoticeRow` / Web `EventRow` 的文字还没改，留给 S6。
- `isIdleForReconfigure`（`packages/core/agent-service/src/application.ts`）：S3 已同时排除 `subagent_notification`。`agent_message` 仍然算待办，因为它要唤醒会话。
- `HostReadableFiles` 跟随 Harness，重载后为空：S5 按计划从 `subagent/spawned` 恢复放行名单。
- 设置里的「子智能体默认模型」只有数据层，还没有写入口（settings 方法 / IPC）；`SubagentSection.tsx` 还留着 Explore 组和指向已删用途的文案：都归 S6。
- 子 Agent 面板的实时活动只在 `agent` 调用运行期间显示（后台创建后调用很快结束），面板改造归 S6。
