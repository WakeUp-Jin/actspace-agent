# 后台任务修复定向 Computer Use 复验

日期：2026-10-24。执行模型：`gpt-6.1-sol`。仅验收、排查与记录，没有修改产品代码、编写自动化脚本或提交推送。

本轮基于 HEAD `40320e0b` 上用户未提交的三项修复 WIP，由主智能体完整重建 Desktop 与 Runtime Harness。原生 Electron 加载生产 `file://.../apps/desktop/dist/index.html`，使用真实 deepseek-flash。本轮没有以浏览器 mock 替代真实任务。

隔离实例：`Actspace Dev actspace-agent-2067`，App ID `com.actspace.desktop.dev.w2067fa05`。独立 profile/workspace 与截图位于 `tmp/codex-acceptance/20261024-background-tasks-retest-2105/`；没有使用原用户真实会话。命令仅受控 echo/sleep/exit，子 Agent 只读公开 README。

## 验收点与操作分组

- R1：后台 Bash 启动器返回后父仍活动时显示 Running；父结束而任务未结束时仍 Running；真实成功/失败终态正确；另检查任务先结束、父仍流式的实时终态边界。
- R2：第二个新会话列表为空，针对首会话实际 task ID 的 output/wait/stop 均拒绝，并核对精确错误码。
- R3：真实子 Agent 面板在约 800、832、900/1100 logical 宽度能打开，切换对话/轨迹，关闭再打开；浅深代表检查。
- R4：前台 Bash、完成通知、wait 去重、stop 回归。

G1 在首会话连续执行真实 Bash、等待、停止与只读子任务；随后第二会话执行跨会话工具。G2 复用已结束子任务检查主题与窗口，不重复核心调度路线。

## 逐项结果

| 验收点 | 当前结果 | 真实界面与运行时证据 |
| --- | --- | --- |
| R1 | **部分失败** | 原提前 Ran 已修：两条 120 秒任务在启动器返回、父仍 Thinking/有停止按钮时均 Running；父结束且任务仍运行时也均 Running。成功/失败通知正确。但短任务结束后父仍活动时，原生 AX 仍报告该命令 Running，实时终态延迟保留。 |
| R2 | **通过** | 第二新会话 task_list 返回 0；真实工具执行记录中 output/wait/stop 均为 Unknown background task。主侧 Journal 三条 failure.code 均为 TASK_NOT_FOUND。 |
| R3 | **通过（本轮指定代表场景）** | 手动解锁后，真实完成子 Agent 在浅色 800/832 logical 浮层、深色 832 logical 浮层及深色 900 logical 并排面板可打开详情、切换对话/轨迹、关闭重开。未把工程边界测试或旧轮截图当作本轮界面通过。 |
| R4 | **通过** | 前台 echo 为 Ran；20 秒任务 task_wait 返回 completed/exit0；120 秒任务立即 task_stop 后 output 仍 stopped 且只有 START；只读 Agent 完成并出现真实通知。主侧 Journal 确认等待/停止各无通知，普通完成各仅一条通知。卡片同步问题归 R1。 |

### R1 现场复现与证据精度

首会话：`99791cc5-1fa2-4d07-8da4-cc3554c4ffa4`。

1. `echo RETEST_SUCCESS_START; sleep 120; echo RETEST_SUCCESS_DONE`，`blockMs=0`，任务 `bash_b9fb316e-7010-465d-8c6e-66ebc8d6e4b4`。
2. `echo RETEST_FAILURE_START; sleep 120; exit 7`，`blockMs=0`，任务 `bash_d99a4ea6-c357-47d4-9567-cd7b9a206ee1`。
3. 父收到两 ID 后继续说明再结束。`r1-launchers-returned-running.png` 含两个 Running 卡、Thinking 与停止按钮；`r1-parent-ended-running.png` 记录父结束后的 Running。主侧 Journal 对照：任务启动 21:11:01.556 / 21:11:15.229，父结束 21:11:23.502，任务随后才于约 21:13:01 / 21:13:15 结束。
4. 自动通知分别为已完成 exit0、失败 exit7。`r1-parent-streaming-running.png` 实际已是父结束的输出末尾且没有卡，不能用作流式卡状态证据。
5. 短任务补查 `echo RETEST_SHORT2_START; sleep 2; echo RETEST_SHORT2_DONE`，`blockMs=0`，返回后父继续约 2000 字说明。任务 `bash_c10a0f48-f94d-4ec6-97a8-73b8e30cf45d`。

短任务主侧 Journal：21:17:09.136 start，21:17:11.161 completed/exit0。21:17:18.667 对应现场 CUA 调用中原生 AX 仍有完整按钮 label `Running Running echo RETEST_SHORT2_START; sleep 2; echo RETEST_SHORT2_DONE 后台`，同时有 `会话状态：运行中` 与 `停止 Agent`。这是 **真实 Computer Use AX + Journal** 对照，证明父活动期间卡状态尚未进入终态。对应 `r1-short2-settled-parent-active-running.png` 因滚动位置使卡位于输入框下方，不可仅凭图片声称卡可见。后续父结束并报告真实完成。没有继续重复短任务。

影响：原 BGT-001 的“任务仍运行就提前显示 Ran”修复成立；任务先完成而父仍流式时仍延迟显示 Running，不能签收完整实时状态一致性。根因与方案由主侧记录，本执行者未修复。

### R2 跨会话访问

第二会话 UI 名称：`R2跨会话隔离复验：顺序调用四个任务工具`，21:35 完成。针对首会话已知任务 `bash_b9fb316e-7010-465d-8c6e-66ebc8d6e4b4` 依次执行 `task_list`、`task_output`、`task_wait(timeoutSeconds=1)`、`task_stop(reason="R2 isolation test")`。

展开 Worked 真实执行区可见列表 0，以及三个工具各自的 Unknown background task。`r2-cross-session-three-denials.png` 支持此界面结论。请求中误用了 includeCompleted 参数，模型按实际 schema 使用 `activeOnly=false, limit=20`；不把不存在的参数当接口覆盖。

主侧 Journal 佐证：第二父会话 `9c729a72-f847-478b-8486-12ac039b1156`，seq207 列表 0；seq261 / 315 / 372 的 output / wait / stop 三条 `failure.code` 均为 `TASK_NOT_FOUND`，因此原 BGT-002 的精确错误码修复通过。错误码来自真实运行时记录，非模型报告。

### R3 子 Agent 面板定向复验

用户手动解锁后继续同一隔离实例和已完成的 `agent_a0b39ce5-626e-4713-ab8e-42b282d92f6a`，没有新发模型任务。按已有清单复用完成详情路线：打开列表项 → 对话 → 执行轨迹 → 关闭面板 → 重开列表和详情。

| 子验收点 | 结果 | 本轮原生界面证据 |
| --- | --- | --- |
| 浅色 800 logical 浮层对话/轨迹 | 通过 | 前一执行者保存 `r3-light-800-dialogue.png`、`r3-light-800-trajectory.png`。 |
| 浅色 832 logical 浮层对话/轨迹 | 通过 | 前一执行者保存 `r3-light-832-dialogue.png`、`r3-light-832-trajectory.png`。 |
| 深色 832×856 logical 浮层 | 通过 | 1664×1712 physical；设置 AX 确认为深色 Value=1。真实列表项打开详情，查看执行轨迹切换至“返回对话” Value=1、执行轨迹时间线；关闭后可重开。`r3-dark-832-dialogue.png`、`r3-dark-832-trajectory.png`。 |
| 深色 900×856 logical 并排面板 | 通过 | 原生拖拽调整至 1800×1712 physical；AX 出现“调整预览面板宽度”，对话详情、轨迹时间线均打开；关闭后重开列表项再次显示详情和“查看执行轨迹” Value=0。`r3-900-dialogue.png`、`r3-900-trajectory.png`、`r3-900-reopened.png`。 |
| 主题与窗口恢复、退出 | 通过 | 设置“跟随系统” Value=1；恢复截图经 sips 确认 2880×1712 physical，即 1440×856 logical。`r3-restored-system-1440.png`。Cmd+Q 正常退出后 CUA 应用 inventory 已无 `com.actspace.desktop.dev.w2067fa05`。 |

本节是实际 Computer Use 交互与 AX 观察；尺寸由本轮截图文件读取核对。没有扩展声称精确 820 等边界、1100 或所有主题/尺寸组合均逐一验过。接手执行者仅补完深色832、深色900与收尾；浅色图片由同轮前一执行者提供。

### R4 回归

- 前台：`echo RETEST_FOREGROUND`，`blockMs=5000`，显示 Ran，未登记后台 ID。
- 等待：`bash_15ba49f1-7457-49c6-bab7-1d31435ec586`，`echo RETEST_WAIT_START; sleep 20; echo RETEST_WAIT_DONE`，立即 task_wait；真实执行区返回 `wait_status: completed`、`status: completed`、`exit_code:0`、START/DONE，开始 21:32:02.955、结束 21:32:22.982。
- 停止：`bash_5ec0fa9b-5453-4192-9a29-09a6ef0a8e5a`，`echo RETEST_STOP_START; sleep 120; echo RETEST_STOP_DONE`，立即 task_stop，随后 task_output 返回 stopped，只有 START，无 DONE。
- 子 Agent：`agent_a0b39ce5-626e-4713-ab8e-42b282d92f6a`，child `0a69a196-6ad5-4206-87ba-d5d2aacd38ca`，只读 README 前 16 行并总结，完成通知在主会话出现，右侧列表显示“已结束 · 1”。

`r4-wait-completed-stop-running.png` 同屏记录 wait completed 返回与 stop 启动 Running；它还显示 wait 的卡仍 Running，符合 R1 剩余同步问题。首次等待命令在验收中断期间审批超时，UI Denied/Approval timed out，未产生 task ID；同命令重试获批准后才开始，不误报为后台调度故障。

主侧 Journal 已确认 wait seq4833 `delivery=wait`、stop seq4957 `delivery=stopped`，两任务均 `enqueue=0 / claim=0`；停止后 output 只有 START。普通 success/failure、两条 short、只读 agent 各 `enqueue=1 / claim=1`，空闲通知 `opensTurn=true`。因此等待/停止没有额外完成唤醒，普通完成没有重复领取。

## 本地证据与收尾

上述图片均为 **本地截图，不随仓库分发**，根目录为 `tmp/codex-acceptance/20261024-background-tasks-retest-2105/`。截图文件名不替代画面、AX 或 Journal 的实际内容；误抓的输出末尾图明确不承担中间态证明。

21:35 后准备 R3 曾被系统锁屏阻塞，CUA 返回：`The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.` 用户手动解锁后已完成上列 R3 代表场景。最终恢复跟随系统主题与原窗口尺寸并正常退出专属 App；CUA inventory 确认退出。主侧随后确认进程退出、启动会话退出码 0，并已删除隔离 profile 的凭据副本；原凭据保留，详情见 `final-cleanup.json`。
