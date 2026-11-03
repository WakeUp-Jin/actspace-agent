# S3 子智能体核心

## 目标

把一次性、只读、同步为主的子智能体改成设计 [02](../../../design-docs/子智能体和后台任务设计规范/02-子智能体设计规范.md) 的样子：一个 `agent` 工具 + 预设、默认后台、能续派能插话、可写、不弹审批、继承父会话权限、模型可选、四个管理工具与 `list_subagent_models`、上限 10、重启后可续派、自己的完成通知与运行中清单、全程留痕。删除 `explore` 工具与 explore 用途。

## 范围

- 包含：设计 02 除 §8（fork，S4）以外的全部；S2 第 4 步「登记表只管 Bash」；设置里 explore 用途换成「子智能体默认模型」的数据层与迁移。
- 不包含：fork（S4）、外部后端（S5）、界面（S6；本子计划只保证 IPC 与投影数据正确）。

## 必读

- 设计 02 全文；S1 的事件、收件箱来源、trace 登记、`refresh`、`actspace.host.models`
- `packages/subagent/subagent/src/`：`provider.ts`、`preset.ts`、`child-session.ts`、`terminal-result.ts`、`descriptor.ts`、`plugin.ts`、`tool-plugin.ts`、`publication.ts`、`agent-tool.ts`、`explore-tool.ts`
- `packages/subagent/tool-subagent/src/plugin.ts`、`manifest.ts`
- `packages/core/runtime/src/harness/agent-runtime-plugin.ts`（`acquireRun`、`createBuiltInPresets`，第 36 行）、`agent-factory-plugin.ts`（`createLoop` 约第 116 行的 subagent 分支、`toolEnvironmentFor`、`createSubagentLoop` 约第 218 行、`createSources`、`PURPOSE_ROUTE_IDS` 第 25 行）
- `packages/core/tool-runtime/src/prepared-execution.ts`（`#requestApproval`）
- `packages/core/agent/src/agent-mode-policy.ts`、`agent-form.ts`（第 27–28 行）、`inbox.ts`
- `packages/core/agent-loop/src/loop.ts`（第 144、369–374、580–582 行：收件箱、子会话步数）
- `packages/core/runtime/src/{plugin-catalog.ts,manifests.ts,startup/boot.ts,harness/default-harness.ts,session/session-plugin.ts,profiles/base.bundle.ts}`
- DSH：`tmp/deepseek-harness/packages/subagent/subagent/src/{manager.ts,activation.ts,continuation-messages.ts,control.ts}`、`tool-subagent/src/index.ts`、`tool-subagent-control/src/*`

## 步骤

### 1. 先写集成测试（红）

在 `packages/subagent/subagent/src/test/` 新增，用现有测试替身（fake LLM、内存 store）：

- 创建（后台）→ 立即返回 id 与路径、transcript 已存在 → 子会话跑两步 → 每步后 transcript 更新 → 结束 → 父收件箱有 `<subagent_notification>`；
- 同步：返回结果；同步超时（测试里把 30 分钟注入成小值）转后台；
- 空闲后 `send_message` → 第二次激活 → transcript 追加 `## Message from`；
- 运行中 `send_message` → 下一步开头收到；最后一步之后、收尾之前收到 → 转为续派不丢；
- `interrupt_agent` → `interrupted` → 再 `send_message` 能继续；
- 重启：有 `start` 无 `settle` → 打开父会话补 `lost` 与通知 → 续派成功；
- 第 11 个返回上限错误；
- `general` 写文件成功；需要审批的命令返回设计 02 §5.2 的文字且不调用审批；
- 子智能体发给兄弟、发给父（父空闲时被唤醒）；
- 老会话（只有 `delegation/*`）投影仍得到原来的子智能体列表。

### 2. 子智能体服务

`packages/subagent/subagent/src/` 重写为：

| 文件 | 内容 |
|---|---|
| `types.ts` | `SubagentRecord`（agentId、kind、preset、description、transcriptPath、model、status、activations）等 |
| `projection.ts` | 从父会话 `subagent/spawned` / `subagent/activation`（以及老会话的 `delegation/*`，只读）投影出子智能体列表；并发计数、`list_agents`、面板、上下文来源都用它 |
| `manager.ts` | `SubagentManager`：`spawn`、`sendMessage`、`interrupt`、`list`、`waitForInput`、`recoverLost`；每个主会话一份运行中激活表；10 个上限在 `spawn` / 续派入口检查 |
| `activation.ts` | 一次激活：打开或创建子会话 → 写 `permission/mode-set` → `acquireRun`（`TaskLedger.open` → `registerExternalLedger` → `submit({ continuationOf })` → `start` → `createLoop` → `runTurn`）→ 每个 `step/end` 调 transcript `refresh` → 收尾写 `settle`、投递结果（同步返回或通知） |
| `messages.ts` | 设计 02 §2、§6.2、§7 里的全部模型可见文字（逐字），集中一处 |
| `preset.ts` | `general` / `explore` 的工具集计算（设计 02 §5.1） |

- 删除：`explore-tool.ts`、`agent-tool.ts`、`descriptor.ts` 中的 explore 描述、`provider.ts` 的 readOnly 抛错与内容后缀「Subagent execution boundary: …」、`publication.ts` 的 `repairSubagentPublications`（新事件不需要补父链接；老会话只读）。`terminal-result.ts` 按新 `status` 改写。
- 续派打开子会话用 `store.open`，不用 `sessions.resume`；上次没收尾的轮次先走主会话同一套恢复流程补 `turn/end`。
- `agent_id` 即 `childSessionId`；子会话头部 `lineage` 照设计 02 §4.2。
- 结果与通知里最终回复用 `truncateUtf8(…, 8 * 1024)`（从 background-tasks 移来）。
- 子智能体不再调用后台任务登记表；做 S2 第 4 步（登记表、通知、上下文来源收窄为 Bash，`task_*` 描述去掉 agent）。

### 3. 工具

`packages/subagent/tool-subagent/src/`：注册 `agent`、`send_message`、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`。参数、描述、返回文字逐字照设计 02 §2（从 `messages.ts` 取）。`agent` 与后续 S4 的 `agent_fork` 的结果 detail 带 `actspace.context.trace`。manifest `contributions.tools` 同步；`display` 文案改为「子智能体」。

`wait_agent`：等调用者自己会话的收件箱出现新条目（`hasPendingNotifications`）或超时；不消费条目。

### 4. 能力与审批

`packages/core/runtime/src/harness/agent-factory-plugin.ts` 的 subagent 分支：

- `approvalBroker: undefined`；`sessionGrantCapability: false`；`sessionGrants` 改为读父会话当前的会话授权（只读）。
- 权限模式取子会话里本次激活写入的 `permission/mode-set`（与父会话一致）。
- 工具集 = `preset.ts` 计算结果；`bindAgentScope` + `allowedToolNames`。
- 子会话的 Bash 不转后台：shell 工具执行上下文带 `backgroundAllowed: false`（新字段），`node-ports.ts` 见到它时忽略 `blockMs`、等到结束，超过 10 分钟杀掉并返回 `Bash timed out after 10 minutes in a subagent and was killed.`。
- `createSources`：子会话不加 `context-subagents`（主会话才有）。

`packages/core/tool-runtime/src/prepared-execution.ts`：没有 `approvalBroker` 时 `APPROVAL_REQUIRED` 的结果文字改为设计 02 §5.2 原文；`auto-review` 先审的顺序不变。

`packages/core/agent/src/agent-mode-policy.ts`：

- `plan`：去掉 `explore`，加 `agent`、`agent_fork`、`send_message`、`wait_agent`、`list_agents`、`interrupt_agent`、`list_subagent_models`。
- `agent`：去掉 `explore`，加上同一组（`agent_fork` 在 S4 注册前不可见也无妨）以及 S5 的 `agent_codex`、`agent_claude_code`（未注册时自然不出现）。

`agent-form.ts` 第 27–28 行、`plugin-catalog.ts`、`composition.ts`、`base.bundle.ts`、`manifests.ts`、`default-harness.ts`、`session-plugin.ts`、`boot.ts`：去掉 `explore` 工具与 `actspace.explore` 预设的登记，`actspace.host.subagents` 改为由 `SubagentManager` 提供。生成文件（`cordis.yml`、契约矩阵、构建图）用脚本重新生成。

### 5. 模型

- 解析顺序照设计 02 §3，放在 `activation.ts`；父会话当前模型从 `this.runs.configuration(parentSessionId)` 取（`agent-runtime-plugin.ts` 里 `acquireRun` 已有入口）。
- `model` 不在 `actspace.host.models.listUsableModels()` 里：返回错误 `Unknown model <key>. Call list_subagent_models to see the available models.`
- 删除 explore 用途与路由：
  - `packages/util/shared/src/model-connections.ts`（`PurposeId` / `PURPOSE_IDS`）、`model-resolver.ts`（`ModelPurpose`）、`settings.ts`；
  - `apps/desktop/src/main/model-store-service.ts`（第 22 行附近）、`model-connections-service.ts`、`model-runtime-service.ts`（第 128–142 行）；
  - `apps/desktop/src/main/settings/{defaults.ts,sanitize.ts,migrations.ts,model-layers-migration.ts,facades/general.ts}`；
  - `apps/desktop/src/main/runtime-v2/{legacy-llm-adapter.ts,model-port.ts,desktop-host-adapter.ts}`（第 127–130 行 explore 路由）；
  - `packages/host/desktop-app/src/complete-text.ts`（第 7 行）；
  - `agent-factory-plugin.ts` 的 `PURPOSE_ROUTE_IDS`。
- 新设置 `subagentDefaultModel: string | null`（ModelKey），默认 `null`；`migrations.ts` 新增一步：删掉 `taskModels.exploreModel` / `taskBindings.explore`，**不**把值带到新字段；`sanitize.ts` 校验新字段；`desktop-host-adapter.ts` 的 `subagentDefaultModel()` 读它。

### 6. 通知、唤醒与清单

- 完成通知走 `MainAgentInbox.enqueue(text, { source: "subagent_notification" })`；父会话空闲时复用现有后台任务唤醒（`background-wake`）。
- `agent_message` 同样入目标会话收件箱；目标是父会话且空闲时唤醒。
- 新包 `packages/context/context-subagents`（照 `context-background-tasks` 的结构：`manifest.ts`、`plugin.ts`、`source.ts`、README、测试）：主会话有运行中子智能体时写设计 02 §6.4 的 supplement；加入插件清单与默认组合。
- `recoverLost`：Host 打开父会话时调用（挂在现有后台任务 lost 处理的同一时机）。

### 7. 同步清理

- `packages/client/client/src/sessions/{tool-card.ts,chat.ts}`、`live/{stream-blocks.ts,stream-adapter.ts,live-run.ts,subagent-activity.ts}`：工具名 `explore` 删除，`agent` 的消息块按新事件填 `subagentKind`、`preset`、`description`、`activationCount`、`transcriptPath`；`send_message` 等五个工具的卡片名；收件箱两种新来源转成 `BackgroundNotice`。
- `packages/util/shared/src/session-selectors.ts`（第 277–284 行）、`runtime-v2/projection.ts`（第 319–320 行）、`harness-stats.ts`（第 316 行）。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（第 74–75、657–684 行）：`getSubagents` 改为按子智能体返回（用 `projection.ts`）；新增 `interruptSubagent(sessionId, agentId)` IPC，登记到 IPC 通道清单（`check:ipc-channels`）。
- `harness-stats-projection.ts`（第 135、465–487 行）、`harness-stats-query.ts`（第 363–390 行）、`usage-catalog-projection.ts`（第 35 行）：子智能体统计改读 `subagent/activation`，老会话继续读 `delegation/*`。
- `packages/core/agent-service/src/application.ts`、`packages/host/agent-host/src/lifecycle.ts`（第 109 行）、`apps/cli/src/runtime-v2/host.ts`（第 45 行）、`packages/composition/cordis-adapter/src/service-contract.ts`（第 50、150、161 行）、`packages/context/prompt/src/extensions.ts`（第 16–17 行）：跟着服务名、预设与工具名改。

## 验证

- 第 1 步全部测试转绿。
- `pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/tool-subagent test`、`pnpm --filter @actspace/context-subagents test`、`pnpm --filter @actspace/runtime test`、`pnpm --filter @actspace/tool-runtime test`、`pnpm --filter @actspace/agent test`、`pnpm --filter @actspace/client test`、`pnpm --filter @actspace/shared test`。
- `pnpm --filter @actspace/desktop test`：设置迁移（旧 explore 值被删、新字段为空）、IPC、统计投影。
- `pnpm test:agent-host:process`（含 `host-subagent-drain-process`，按新行为更新）。
- 统一验证命令。

## 回滚

revert 本提交（与 S1、S2 一起）。设置迁移删掉的 explore 字段不会恢复，旧代码按「未设置」处理。
