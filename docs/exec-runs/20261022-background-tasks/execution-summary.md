# 后台任务 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261022-background-tasks.md`
- **执行过程**：`docs/exec-runs/20261022-background-tasks/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（代码与自动化验证）；Electron 人工验收待做
- **分支**：`feat/background-tasks`（worktree `../actspace-agent-background-tasks`，基于 00d6b763，未提交）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 统一后台任务登记表 | `packages/background-tasks/` | Host 服务 `actspace.host.background-tasks`；通知去重、wait、stop、lost、`background/task` 事件 |
| 收件箱与 Loop | `packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts` | 通知 `notice` / `opensTurn`；回合末有通知续一步；中断不丢通知；`wake` 回合 |
| 空闲唤醒 | `packages/agent-service/src/{run-manager,task-ledger,service}.ts`、`packages/runtime/src/harness/*` | 唤醒任务 `{kind:"background-wake"}`，不写 `user/message`；停止后暂停不唤醒 |
| 四个任务工具 | `packages/tools/background-tasks/` | `task_list` / `task_output` / `task_stop` / `task_wait`；删除 `bash_output` / `bash_kill` |
| Bash 接入 | `packages/tools/shell-tools/` | 后台命令登记到 Host；`output_match` 走登记表 |
| 后台子智能体 | `packages/subagent/` | `background: true`，`launch()`，并发 4，与父中断解耦 |
| 任务清单上下文 | `packages/context/background-tasks/` | 每轮开始写运行中任务；全部结束写收尾文本 |
| 前端 | `packages/client/src/{sessions,live}/`、`packages/shared/src/session*.ts`、`apps/desktop/src/renderer/components/{messages,conversation}/`、`apps/web/src/` | 「后台」标签；`BackgroundNoticeRow` 唤醒分隔行；跳过唤醒任务；删除 `bash_task_update` |
| 浏览器 mock | `apps/desktop/src/renderer/mock/scenarios/background-tasks.ts`、`mock-db.ts` | `?mock=background-tasks`；mock-db 支持原始 journal 事件 |

## 人工验证指引

### 必须验证（Electron，需要模型 Key）

1. **后台 Bash 自动唤醒**
   - 验证方式：让 Agent 后台运行 `sleep 20 && echo done`（`blockMs: 0`），等回合结束。
   - 预期结果：约 20 秒后会话自动开一轮，开头是「⟲ 后台任务 · Bash: … · 已完成」分隔行，点开能看到 `<task_notification>` 原文；原 Bash 卡片有「后台」标签，状态从运行中变为成功。
2. **后台子 Agent**
   - 验证方式：让 Agent 用 `agent` 且 `background: true` 调研一个问题。
   - 预期结果：主回合立即结束；子 Agent 卡片有「后台」标签、状态运行中，右侧子 Agent 面板可见运行；完成后自动开一轮，回复引用子 Agent 结论，卡片变「已完成」。
3. **停止后不唤醒**
   - 验证方式：后台任务运行中点停止主会话，等任务结束；再发一条消息。
   - 预期结果：任务继续运行；结束后不自动开新一轮；新消息那一轮里 Agent 能看到通知内容。
4. **四个任务工具**
   - 验证方式：让 Agent 依次调用 `task_list`、`task_output`、`task_wait`（短超时）、`task_stop`。
   - 预期结果：输出含 `task_id/kind/status/description/started_at`；`task_wait` 超时返回 `timed_out` 与仍在运行的任务；停掉的任务之后不再出现完成通知或唤醒。
5. **轨迹上下文**
   - 验证方式：有后台任务运行时打开轨迹面板；任务全部结束后再发一条消息。
   - 预期结果：出现「后台任务 · 后台任务清单 · 已加载」行；结束后下一轮出现「已更新」，内容为 `No background tasks are running.`

### 建议验证

1. **重启后 lost**：后台任务运行时退出应用再打开会话，卡片显示取消态，下一轮 Agent 收到「失去联系」提醒，不自动唤醒。
2. **观测**：`logs/latest-dev.log` 无 `background/task` codec 报错。

## Agent 已完成的验证

- `pnpm typecheck` 全量通过。
- 定向测试：background-tasks 8、tools-background-tasks 3、context-background-tasks 4、shell-tools 98、subagent 15、runtime 63、agent-service 39、agent-host 55、core-agent 17、core-agent-loop 49、context-engine 25、session-projection 20、session-journal 20、shared 179、client 26、web 101、desktop 1900（2 文件 skipped，与改动前一致）。
- `test:package-boundaries`、`test:harness-events`、`test:frontend-tokens`、`check:frontend-tokens` 通过。
- 浏览器 mock `?mock=background-tasks` 浅 / 深主题截图：「后台」标签、Bash 成功 / 运行中、Agent 已完成、两条唤醒分隔行与展开原文显示正常。
- `pnpm test` 全链逐项跑完：
  - `test:current-docs` 只剩 worktree 环境问题（见下方风险），没有本次新增的断链。
  - `test:contract-matrix` 首次失败：`scripts/contract-matrix/source-registry.mjs` 漏了三个新包；`apps/web`、`auto-review` 在主分支就已漏登。补齐后重新生成矩阵，通过。
  - `check:renderer-bridge`、`test:renderer-bridge`、`check:harness-events`、`test:harness-events`、`test:harness-recovery`、`check:ipc-channels`、`test:ipc-channels`、`test:frontend-tokens` 通过。
  - `test:agent-host:process` 通过；前提是 `pnpm --filter @actspace/agent-cli build`，新 worktree 没有 CLI dist。
  - `pnpm -r test`：56 个非 desktop 包全部通过。desktop 在全量并行时有 3 个用例超时（`app-streaming-user-message` 两个、`session-ipc-budget` 一个），单独复跑 52/52 通过，desktop 单独整包 1900 通过。

## 已知风险和遗留事项

- `test:current-docs` 在新 worktree 中报 345 条断链：均为 `.gitignore` 忽略的截图 / 录屏证据（worktree 未带这些文件）及主仓库已存在的 `desktop-frontend-refactor/demo/` 链接；本次改动没有新增断链。主仓库合并后应在原 checkout 复跑。
- 与 `fix/settings-model-select` 上未提交的子 Agent 轨迹改动有重叠文件（`chat.ts`、`tool-card.ts`、`AgentRunBlock.tsx` 等），合并时解冲突（用户 2026-10-22 决定）。
- 分隔行展开按钮是原生 `<button>`，已登记进 `scripts/native-button-baseline.json`（与压缩分隔行同理）。
- 没有 settle 事实的旧 Journal 中后台 Bash 卡片显示为运行中（设计已接受）。

## 后续建议

- 子智能体工具扩展（Bash / 编辑）与审批冒泡、统一「后台任务」面板留到后续单独讨论。
