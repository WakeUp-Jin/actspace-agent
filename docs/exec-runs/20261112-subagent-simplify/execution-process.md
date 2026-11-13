# 子智能体简化：临时上下文窗口 + 并入后台任务 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261112-subagent-simplify.md`
- **执行模式**：交互（用户授权直接完成，不审阅计划）
- **开始时间**：2026-11-12 10:30
- **结束时间**：2026-11-12 20:40

## 执行时间线

### 步骤 1：M1 登记表与任务工具

- **操作**：`BackgroundTaskKind` 加 `agent`；`BackgroundTaskSource` 加 `agent: { transcriptPath, label }`；开始事件带 `transcriptPath`；通知格式 `kind: "agent"` 时带 `<description>`、`<transcript>`、`<closing_message>`（原文，不转义）或 `<note>`；收件箱 notice 的 kind 映射成 `subagent`，界面沿用原来的子智能体通知行。删 `task_wait` 和登记表的 `wait`；`reconcile` 只认带 `transcriptPath` 的新格式 `agent` 开始事件，老的没有 transcript 的不归它收尾。`stopByUser` 给模型留一条「用户停止了」的通知，不唤醒。
- **影响文件**：`packages/background-tasks/background-tasks/src/{registry,types,notification}.ts`、`packages/background-tasks/tool-background-tasks/src/{tools,manifest}.ts` 及测试。
- **决定**：老日志里的 `delivery: "wait"` 仍要能读，编解码器保留这个值，只是不再产生。
- **验证**：`@actspace/background-tasks` 13、`@actspace/tool-background-tasks` 3 个用例通过。

### 步骤 2：M2 子智能体管理器与工具

- **操作**：重写 `SubagentManager`：`background` 默认 `false`；后台调用在写完 `subagent/*` 事件后登记，同步调用等满 30 分钟由计时器登记（登记失败按 `rewind` 停掉）；激活结束映射成登记表状态（`interrupted → stopped`，`max_steps` / `lost → failed`）；删 `waitForInput`、`listAgents`、`interrupt`、`running`、续派和唤醒轮；新增 `stopByUser`（已登记的走登记表，同步的直接中断并等结果）；`stopAll` 对已登记的走登记表 `stop(…, "rewind")`；`recoverLost` 只补写 `lost`。`send_message`：子智能体只能发给父会话，主会话只能发给运行中且没在收尾的子智能体。`messages.ts` 文字按 R6 / R7 改。
- **影响文件**：`packages/subagent/subagent/src/{manager,messages,tools,preset}.ts`、`package.json`、`tsconfig.build.json`、`src/test/{manager,external}.test.ts`；`packages/subagent/tool-subagent/src/manifest.ts` 与测试；`subagent-codex`、`subagent-claude-code` 的 lifecycle 测试。
- **决定**：退出原因 `host-shutdown` 和管理器关闭时的结束不写日志，交给下次启动的 `reconcile` / `recoverLost`；新增结算投递值 `stopped`（`SUBAGENT_DELIVERIES` 与核心编解码器）。
- **验证**：`@actspace/subagent` 30 个用例（完成通知原文、同步与转后台、取消、插话、结束后拒收、`task_stop`、两种 `stopByUser`、编辑重发、退出与重启 `lost`、上限、只能发给父会话、note、transcript 尾部、模型、fork）通过。

### 步骤 3：M3 上下文、装配、application

- **操作**：删 `packages/context/context-subagents` 包及 context-engine、runtime 插件目录、契约矩阵来源表、runtime 依赖里的引用；`context-background-tasks` 的子智能体行带 transcript 路径，结尾改为「不要重复启动；每个结束都会通知；task_stop 停止」。runtime 把登记表传给管理器，先关登记表再关管理器；`boot.ts` 的端口只剩五个方法；`application.ts` 的 `interruptSubagent` 改调 `stopByUser`，忙碌判断用 `runningCount`。
- **影响文件**：`packages/context/context-background-tasks/src/source.ts`、`packages/context/context-engine/src/modules.ts`、`packages/core/runtime/src/{harness/agent-runtime-plugin,startup/boot,plugin-catalog}.ts`、`packages/core/agent-service/src/application.ts`、`scripts/contract-matrix/source-registry.mjs`、`pnpm-lock.yaml` 及各自测试。
- **问题**：runtime 测试报找不到 `@actspace/context-subagents`，是 dist 旧了，`pnpm build:deps` 后通过；`tool-composition` 超时是断言仍期待 `subagents` 种类导致清理卡住，改断言后通过。`default-harness` 的续派用例改成「结束后发消息返回 `SUBAGENT_CLOSED`」。
- **验证**：context-engine 34、context-assembly 6、context-background-tasks 5、runtime 126、agent-service 77、session-journal 117 个用例通过。

### 步骤 4：M4 shared / client / 界面

- **操作**：`SUBAGENT_STATUSES` 改为 `running` / `closed`，列表状态去掉 `idle`（老会话不活动的子智能体算「已结束」）；激活状态标签加「已停止」。通知行同时认新的 `<task_notification>`（结论原文）和老的 `<subagent_notification>`（结论转义）。`task_stop` 停子智能体的工具行读作「停止 ‹描述›」，可点开子智能体；停 Bash 时是普通行。桌面 mock 场景 `background-tasks`、`subagent-trajectory` 改成新流程（登记事件、`task_notification`、运行中插话与来信、`task_stop`，没有续派）；统计 fixture 的 `list_agents` 换成 `task_list`（Context 面板 fixture 保留老会话的「子 Agent 清单更新」行，覆盖老来源的标签）；`RightPanel` 子 Agent 面板说明改为「每个做完一件事就结束」。
- **影响文件**：`packages/util/shared/src/{subagent-labels,runtime-v2/subagents,session/events,session/tool-preview,subagent-projection}.ts`、`packages/client/client/src/sessions/{subagent-list,tool-card,chat}.ts`、`apps/desktop/src/renderer/components/{RightPanel,messages/BackgroundNoticeRow,messages/ToolLogLine,conversation/render-message}.tsx`、`apps/desktop/src/renderer/mock/**`、相关测试。
- **验证**：shared 251、client 93、desktop 全量、web 141 个用例通过；`pnpm typecheck`、`pnpm lint` 通过。

### 步骤 5：M5 文档

- **操作**：`01-设计决策` 加「2026-11-12 简化」R1–R12；02–05、README、`agent-subagent-runtime.md`、`agent-background-tasks.md`、`front-子Agent与后台任务规范.md` 按现状重写受影响的章节；其他引用删掉的工具或来源的规范、包 README 同步；重新生成契约矩阵；更新日志、history。
- **验证**：见执行摘要。

### 步骤 6：M6 全量

- **操作**：`pnpm typecheck`、`pnpm lint`、`pnpm test`、各项 `check:*`。
- **问题**：新 worktree 没有 `apps/cli/dist`，进程级 Host 测试找不到 CLI，先 `pnpm --filter "@actspace/agent-cli..." build`；`@actspace/python-runtime` 的 `locate` 用例在 main（eec93876）上同样失败，与本分支无关，没有改。
- **验证**：除上面这个已有失败外全部通过。

## 遇到的问题

- 运行时 harness 测试用的是构建产物，改包后要先 `pnpm build:deps`。
- 老会话里的事件（`subagent_notification`、`trigger: "message"`、`delivery: "wait"`、多次激活）只读展示，不迁移；解析和投影代码保留了这些分支并注明是老会话。
