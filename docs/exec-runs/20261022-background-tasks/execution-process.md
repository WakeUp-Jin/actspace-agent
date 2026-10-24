# 后台任务 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261022-background-tasks.md`
- **执行模式**：交互
- **开始时间**：2026-10-22
- **结束时间**：2026-10-22

## 执行时间线

### 步骤 0：调研与设计

- **操作**：阅读 Kimi Code `agent-core-v2/src/agent/task/` 与 OpenCode `packages/core/src/job.ts`，对照现有 bash 后台、收件箱、AgentService 调度；与用户逐项确认 D1–D10。
- **影响文件**：`docs/design-docs/collaboration/agent-background-tasks.md`、`docs/exec-plans/completed/20261022-background-tasks.md`、`docs/exec-plans/README.md`。
- **决定**：空闲唤醒采用不写 `user/message` 的唤醒任务，避免 synthetic 用户消息进入聊天。

### 步骤 1：T1–T4 契约、登记表、收件箱与唤醒

- **操作**：`background/task` codec；`@actspace/background-tasks` 登记表（通知去重、wait、stop、reconcile lost、dispose 不写 settle）；收件箱 `notice` / `opensTurn` / `hasPendingNotifications`；Loop 回合末看通知、中断不丢通知、`wake` 回合；`SessionRunManager.wake()` 与唤醒任务。
- **验证**：background-tasks 8、core-agent-loop 49、agent-service 39、session-journal 20、session-projection 20 测试通过。
- **决定**：唤醒任务失败后 `#wakeSuspended`，直到用户提交或恢复，避免失败循环。

### 步骤 2：T5–T8 工具、Bash、后台子智能体、上下文插件

- **操作**：新包 `@actspace/tools-background-tasks`（四个工具）与 `@actspace/context-background-tasks`；shell-tools 删除 `bash_output` / `bash_kill`，后台命令登记到 Host，`output_match` 走登记表；子智能体 `launch()` 与 `background` 参数；`application.ts` / CLI host 忙碌判断改用登记表；`cordis.yml`、Harness 条目、AgentForm（shell-tools v3、新成员 `actspace.background-tasks`）、模式白名单同步。
- **验证**：tools-background-tasks 3、context-background-tasks 4、shell-tools 98、subagent 15、runtime 63、agent-host 55、core-agent 17、context-engine 25；`test:package-boundaries`、`test:harness-events` 通过；契约矩阵重新生成。

### 步骤 3：T9 前端

- **操作**：`background_notice` 块与 `BackgroundNoticeRow`；`groupMessagesIntoTurns` 以通知开启 `user: null` 轮次；卡片「后台」标签与真实状态；Loop 唤醒回合的 `inbox-claimed` 带 notice 与正文 → live `background_notice_claimed`；队列 / 运行中用户块 / Web 跳过唤醒任务；轨迹「后台任务」分类；删除 `bash_task_update`；mock 场景 `background-tasks`。
- **验证**：shared 179、client 26、desktop 1900、web 101、core-agent-loop 49；token 检查；浏览器 mock 浅 / 深截图。
- **决定**：分隔行展开开关用原生 button 并登记基线（同压缩分隔行）。

### 步骤 4：T10 收尾

- **操作**：更新 lifecycle、subagent runtime、subprocess 指南、forms/modes、tool-name 契约、plugin 边界、右侧终端、DSH 轨迹规范、技术债、发布说明、histories；设计文档转为当前事实；计划移到 `completed/`。
- **验证**：`pnpm typecheck` 通过；`pnpm test` 在 `test:current-docs` 因 worktree 缺少被忽略的截图证据而失败（非本次引入），其余链路单独跑完，结果见执行摘要。

## 遇到的问题

- 新 worktree 缺少 dist，vitest 无法解析 `@actspace/shared/runtime-v2`：先跑 `pnpm run typecheck:contracts`。
- `cordis.yml` 与 `TRUSTED_LOADER_ENTRIES` 不一致导致 Cordis 启动失败：两处同步加入 `actspace.host.background-tasks`。
- 新工具包测试名需为 `lifecycle.test.ts`（包边界检查要求）。
- `test:contract-matrix` 要求 `source-registry.mjs` 手工登记包与 manifest：补三个新包，顺带补主分支漏登的 `apps/web`、`auto-review`。
- `test:agent-host:process` 需要先构建 `apps/cli`（`@actspace/agent-cli`）。
- 全量并行下 desktop 有 3 个用例超时，单独复跑通过。
- 浏览器 mock 的 snapshot 与 `activeMessageIds` 没收录收件箱领取的 surface 消息，分隔行被过滤：mock-db 补上。
- worktree 中 `test:current-docs` 因 `.gitignore` 忽略的截图证据缺失而失败。

## 跳过或推迟的事项
