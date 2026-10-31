# 子智能体与后台任务 Computer Use 验收过程

- 日期：2026-10-24（Asia/Shanghai）。
- 用户目标：对刚提交的子智能体和后台任务管理功能执行自动化 Computer Use 验收。
- 基线：`40320e0b38f3f18b36e1a0905b979b7733a4cba4`，目标功能提交 `ce19e4d6`；开始时工作区干净，分支 `fix/settings-model-select`。
- 范围：验收和记录问题，不修改产品代码，不提交或推送。
- 分工：主智能体确认范围、准备隔离环境、运行定向检查和核对持久化；`gpt-6.1-sol` 子智能体使用 Computer Use 操作界面、记录逐项结果。

## 验收点

| 编号 | 检查内容与预期 |
| --- | --- |
| A1 | 后台 Bash 立即返回，卡片从运行中更新为成功或失败。 |
| A2 | Bash 完成后自动唤醒；通知分隔行可展开，无伪用户消息和重复通知。 |
| A3 | 后台子智能体立即返回，右侧对话与轨迹可观察进展；完成后更新状态并通知父会话。 |
| A4 | `task_list` 正确列出任务、状态和会话归属。 |
| A5 | `task_output` 可读 Bash 输出与子智能体进度，读取不吞掉完成通知。 |
| A6 | `task_wait` 超时、完成结果与通知去重正确。 |
| A7 | `task_stop` 能停止任务，之后不再自动唤醒。 |
| A8 | 停止主会话后后台任务继续，通知保留到恢复或下一次消息。 |
| A9 | 轨迹中的后台任务清单随运行和结束更新。 |
| A10 | 正常退出重启后，未完成任务标记失联，不误报完成或自动唤醒。 |
| A11 | 浅色、深色与窄窗口下，卡片、通知、子智能体面板可读可操作。 |
| A12 | 前台委派行为正常，日志无新增后台任务编解码错误。 |

## 操作分组

1. G1：独立浏览器 mock 场景，连续检查后台标签、终态、通知展开，再复用路线检查主题和窄窗；覆盖 A1/A2/A11 的视觉子项，保留关键截图。mock 不证明真实调度或子会话内容。
2. G2：真实 Electron 新建测试会话，后台执行无副作用 Bash，检查返回、运行状态、输出、等待、停止与自动唤醒；覆盖 A1/A2/A4/A5/A6/A7，保留运行中、终态、工具输出、通知截图及 Journal 佐证。
3. G3：真实 Electron 后台委派，只读取隔离工作区样例；查看子对话和轨迹，检查主会话停止、通知保留、清单上下文与前台委派回归；覆盖 A3/A5/A8/A9/A12。
4. G4：专属应用正常退出和同 profile 重启，检查未完成任务恢复；复用关键卡片与面板检查真实主题和窄窗；覆盖 A10/A11，并复核日志与残留任务。

## 环境准备

- 已执行 `pnpm --filter @actspace/desktop build`，退出码 0。包含 Runtime 依赖、固定 Harness、renderer 和 main/preload 构建；不使用旧制品签收。
- 独立数据与工作区位于 `tmp/codex-acceptance/20261024-background-tasks/{profile,workspace}`。使用现有已配置模型的独立配置副本，凭据不输出、不写入报告；用户原 profile 不修改。
- 原生应用：`Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`，Electron 39.8.10。首次主进程 PID 33066。
- 真实实例加载当前生产 renderer 制品；mock 独立启动于 `http://127.0.0.1:5424/?mock=background-tasks`。
- 原生 Computer Use inventory 可用；开始时没有运行中的 ActSpace/Electron。
- 启动时 Chromium 报 Shared Dictionary/cache 目录初始化错误；Runtime 已 ready。是否影响验收以实际界面结果为准，不将其当作后台任务缺陷。
- `pnpm --filter @actspace/background-tasks --filter @actspace/tools-background-tasks --filter @actspace/context-background-tasks --filter @actspace/subagent test`：退出码 0，分别 8 / 3 / 4 / 15 项通过，共 30 项。
- `pnpm --filter @actspace/agent-service exec vitest run src/test/background-wake.test.ts`：退出码 0，5 项通过。
- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/conversation-turns.test.ts src/renderer/test/bash-run-block-tooltip.test.tsx src/renderer/test/transcript.test.ts src/renderer/test/live-run-store.test.ts`：退出码 0，44 项通过。
- `pnpm --filter @actspace/desktop typecheck`：退出码 0。
- 定向测试共 79 项通过；这部分是工程证据，不代替 Computer Use 验收。

## G1/G2 阶段证据

- 子智能体已完成 mock 浅色的两条通知展开，观察后台 Agent 已完成、Bash 成功及运行中；开始真实 Electron 后确认生产 `file://` 制品与隔离工作区。
- 首个真实测试父会话：`86e526a9-9f9e-473f-8fa8-edd4694f29ff`。
- 主智能体只读核对该会话 Journal：后台成功任务 `bash_1f11cf67-65f6-4978-a844-92487a673b16` 于 10:17:11.845 登记，10:17:46.894 完成，退出码 0；原回合 seq285 已结束，随后 seq287 通知入队、seq288 完成记录 `delivery=notified`、seq293 领取通知 `opensTurn=true`。这是持久事件证据；界面最终结果由 Computer Use 单独记录。

## G2/G3 交互与持久事件交叉核对

- Bash 成功/失败与两个后台 Agent 的正常完成通知均只入队、领取各一次；闲时领取含 `opensTurn=true`，没有对应的伪 `user/message`。
- Bash `task_wait` 先返回超时，随后长等待实际取得退出码 0 的终态，settle 为 `delivery=wait`；没有再发完成通知。`task_output` 读取 Agent 进度后，Agent 完成通知仍正常入队和领取。
- `task_stop` 分别停止 Bash 与 Agent，settle 都为 `status=stopped, delivery=stopped`，没有完成通知。
- 第二个真实会话 `45aa499f-1779-4c9e-9328-d56f519f0b84` 的 `task_list` 为 0，查询第一个会话的任务返回 Unknown background task；隔离语义通过。进一步读取 seq183 工具结果发现实际 code 为 `BACKGROUND_TASK_FAILED`，与设计约定 `TASK_NOT_FOUND` 不同；不把模型解释错误码当作原始工具证据。
- 停止父回合后，真实子智能体轨迹仍继续读取。父 Journal seq6905 为 aborted，Bash/Agent 分别于 10:25:12.109 / 10:25:16.067 完成并入队；没有自动新回合。随后真实用户消息 seq6916、turn/start seq6917 后，两通知才分别在 seq6918/6919 领取，各一次，且没有 `opensTurn`。
- 本地脱敏摘录：`tmp/codex-acceptance/20261024-background-tasks/g2-g3-journal-evidence.json`。只保留任务、通知、回合和 task 工具元数据，不保留请求快照或凭据。
- 发现 BGT-001：实时卡片在后台 Bash 未结束时显示 `Ran`；同一父回合结束后持久投影恢复 `Running`。记录于 [缺陷清单](bugs.md)，未修复。
- 后续确定性探针确认 BGT-002：实际 Harness artifact 内联另一份 `BackgroundTaskError`，不能通过 instanceof 识别 Host 错误。相同 Host registry 与未知 ID，经未打包工具返回 TASK_NOT_FOUND，经本轮实际打包工具返回 BACKGROUND_TASK_FAILED。已有同模块测试不覆盖此边界。

## G4 退出重启

- Computer Use 在第二个会话启动 Bash `bash_4890829b-fba7-4d08-85c9-6803d201a1dc` 与 Agent `agent_41ee4519-0089-4d40-8840-89b420502771`，运行期间原生 Cmd+Q 退出。专属应用从 inventory 消失，原主进程 33066 结束，启动命令退出码 0；Journal 两任务均只有 start、没有 settle。
- 主智能体使用完全相同的 profile、workspace 与当前 dist 重启，无重建或切换配置。新主进程 52361，10:33:02.910 Runtime ready。
- Journal 在 10:33:03.861 / .864 为两任务补 `status=lost, delivery=lost`（seq1106/1108），分别入队失联通知（1107/1109）。直到用户消息 seq1113 与 turn/start seq1114 才领取（1115/1116），未出现自动唤醒。
- 退出前快照：本地 `g4-before-quit-journal-evidence.json`；界面结果与主题覆盖见 Computer Use 报告。
- 失联后原生卡片分别显示 Cancelled / 已停止，未显示成功；lost 的精确信息在下一条用户消息领取后可见。脱敏事件摘录：本地 `g4-restart-journal-evidence.json`。
- 日志没有发现后台任务事件编解码/未知事件错误。首次正常退出末尾有一次 `Agent service is closed` 的 task-command handler 异常，随后仍 exit 0，已单列为 OBS-001；不将本轮日志描述成零错误。

## 中断后补查与修复交接

- 用户补充要求：不修复 Bug，但排查、总结并给出方案，供其他模型实施。新增 [修复交接](repair-handoff.md)，覆盖 BGT-001/BGT-002/BGT-003 根因、建议范围、自动化回归与真实复验；OBS-001 保留候选解释和下一步排查路径，未假称根因已证实。
- 中断后确认 HEAD 仍为原基线，产品文件没有修改。旧专属实例和 renderer 已不在运行；仅为剩余视觉检查，以相同 profile/workspace/dist 启动实例，不重跑已通过的模型任务。
- 真实浅/深主题与窄窗的卡片、通知已检查；右侧子智能体面板另用现有完成子会话定向补查。mock 的 480 像素覆盖与真实 Electron 约 832 逻辑像素覆盖分别记录，不相互替代。

## 最终边界检查与收尾

- 真实约 832 逻辑像素窗口，点击子智能体卡片或工具栏均不能打开右栏，记录 BGT-003。源码中 compact 阈值 820 与主区/右栏最低宽之和 880 不一致；相关代码早于本次功能，是既有共享布局缺陷。
- Computer Use 实际对照：800 逻辑像素的深色覆盖层可打开、对话/轨迹切换、关闭再打开；约 1101 逻辑像素的浅色对话/轨迹与深色轨迹可在并排右栏显示。未把其他尺寸或其他主题/面板组合称为逐一验证。
- 最终 A1/A4/A11 失败，其余 9 项通过；共 12 个已定义验收点均执行。额外未签收项目单列在摘要与逐项报告中。
- 子智能体恢复原生跟随系统主题与原 2880×1707 窗口后正常 Cmd+Q；inventory 显示专属应用和本轮 mock tab 均已消失。主侧确认最后启动命令退出码 0，主进程 74189 已退出。
- 本轮 mock 端口 5424 已无监听；仅删除隔离 profile 的 `secrets.json` 凭据副本，保留原用户凭据文件及本地 Journal/截图供追溯，不输出任何密钥。
- 最终 HEAD 与初始基线一致，没有 tracked 文件修改；只新增本目录五份 Markdown 验收/交接文档，没有产品代码、测试或脚本修改，没有提交或推送。

所有图片和日志均为本地证据，不随仓库分发。最终逐项结果见 [Computer Use 结果](computer-use-results.md) 和 [验收摘要](execution-summary.md)。
