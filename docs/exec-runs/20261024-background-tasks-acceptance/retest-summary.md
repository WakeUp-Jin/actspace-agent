# 后台任务缺陷修复复验

日期：2026-10-24。用户要求修复后再次测试，沿用验收与排查边界，不修改实现。

## 基线与方法

- HEAD 仍为 `40320e0b38f3f18b36e1a0905b979b7733a4cba4`；本次修复为未提交工作区改动，不将 HEAD 本身称为已修复提交。
- 冻结 10 个已有改动/新文件的 SHA-256，记录于本地 `tmp/codex-acceptance/20261024-background-tasks-retest-2105/source-baseline.json`；不覆盖、移动或清理用户代码。
- 主智能体核对当前差异，执行构建、定向测试、类型检查和 Journal/制品检查；`gpt-6.1-sol` 子智能体通过原生 Computer Use 操作专属 Electron。
- 新隔离 profile/workspace 位于上述本地证据目录，真实模型与 Bash/子 Agent；当前生产 renderer，未用 mock 代替真实能力。
- 本轮完整 `pnpm --filter @actspace/desktop build` 成功，包括 Runtime default Harness；21:06:17 本轮 Runtime ready，主进程 PID 17659，应用 `Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`。
- 本轮实际 profile Harness artifact 为 `sha256-b5172718964573958e63e94682c4964a491f0d29cb1dc9464bcd940b59416131`，包含 `isBackgroundTaskError`，不再使用 `instanceof BackgroundTaskError`。身份摘录保存在 `artifact-identity.json`。

## 验收点与操作路线

| 点 | 预期 |
| --- | --- |
| R1 / BGT-001 | Bash 启动器返回后、父回合仍流式时保持 Running；父回合结束且任务仍运行时不倒退；最终成功/失败正确。额外检查任务先结束、父回合仍流式时能否更新终态。 |
| R2 / BGT-002 | 第二会话对首会话任务 output/stop/wait 均拒绝并返回 TASK_NOT_FOUND，不泄露任务；普通错误和非法参数维持原约定。 |
| R3 / BGT-003 | 800、832 的浮层与 900 逻辑像素的并排子详情可打开、对话/轨迹切换、关闭重开；浅深主题代表检查。900 用于检查紧邻 880 下限的并排状态，不声称本轮逐一验证 1100 或所有尺寸。 |
| R4 相关回归 | 前台 Bash、完成通知、wait 去重和停止任务保持正确。 |

1. 真实工具路线：在新会话发起受控后台 Bash，连续观察 live/durable/final；执行只读子 Agent 作为详情素材；另一新会话检查归属错误；穿插通知、wait、stop 和前台命令，保留关键截图与原始工具结果的脱敏 Journal 摘录。
2. 窗口路线：复用本轮已完成子会话，在多个尺寸与主题验证面板、切换和关闭，不为每个视觉子项重复新建任务。还原主题与窗口后正常退出。

## 本轮工程检查

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @actspace/desktop build` | 通过 |
| `pnpm --filter @actspace/client --filter @actspace/background-tasks --filter @actspace/tools-background-tasks test` | 通过，48 + 8 + 4 = 60 项 |
| `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/workbench-modules.test.tsx src/renderer/test/workbench-responsive.test.tsx src/renderer/test/bash-run-block-tooltip.test.tsx src/renderer/test/live-run-store.test.ts src/renderer/test/transcript.test.ts` | 通过，65 项 |
| `pnpm --filter @actspace/desktop typecheck` | 通过 |

合计 **125 项定向测试**，不是全仓测试。本轮没有重复验证修复方 history 声称的全量 2021 项 Desktop 测试，也不将其当作本轮结果。构建后直接加载真实 Host registry 与 default Harness 的无文件实现改动探针，output/stop/wait 未知 ID 均返回 TASK_NOT_FOUND，空 ID 返回 INVALID_ARGUMENTS；结果见本地 `bundled-error-probe.json`。此探针作为制品边界证据，不计入 125 项测试。

## 结果

复验完成：**4 个定向验收点中，R2/R3/R4 通过，R1 部分失败**。三个原缺陷中，错误码与窄窗问题修复通过；状态问题原触发已修，另一个实时终态边界仍失败。原生交互与覆盖结果见 [Computer Use 复验](retest-computer-use-results.md)。本轮不是重跑首轮全部 12 项；原始首轮报告保持历史结论，不覆盖旧证据。

| 缺陷 / 回归 | 当前结论 | 证据 |
| --- | --- | --- |
| BGT-001 / R1 | 原提前 Ran 修复通过；任务中途结束后的实时终态仍延迟，部分失败 | 原生 Running 卡、AX 与真实 Journal 的时间交叉核对，详见下文 |
| BGT-002 / R2 | 修复通过 | 第二父会话 `9c729a72-f847-478b-8486-12ac039b1156`：seq207 list=0；seq261/315/372 的 output/wait/stop 实际 failure.code 均为 TASK_NOT_FOUND，原生执行区也显示拒绝 |
| BGT-003 / R3 | 修复通过，限本轮代表场景 | 用户解锁后实际验证浅色 800/832 浮层、深色 832 浮层与深色 900 并排详情；对话/轨迹切换及关闭重开正常。832 原失败点实际可打开；原生截图与 AX 见逐项报告 |
| R4 | 通过 | 前台 echo；wait completed 且 delivery=wait、enqueue/claim 都为0；stop 后仅 START，delivery=stopped、enqueue/claim 都为0；成功/失败/只读 Agent 通知各入队与领取一次 |

R4 中等待返回后的卡片依然可能因 R1 的同一同步问题保持 Running，已归入 R1，没有把它忽略或重复算作独立缺陷。R3 使用本轮真实窗口操作签收，主题/尺寸组合范围见逐项报告。当前没有“全部修复通过”的结论。

### R1 尚需跟进的实时终态同步

上次“启动器刚返回便提前 Ran”的触发已改善：真实双后台命令在父回合 active 时都保持 Running，父回合结束后仍 Running，实际成功/失败后持久卡与通知正确。

但另一方向仍存在状态延迟：后台任务先完成、父回合仍在流式时，live 卡仍显示 Running。修复方 history 已注明这一局限，本轮也实际触发，不能因已知而豁免：

- `bash_c10a0f48-f94d-4ec6-97a8-73b8e30cf45d`，受控 `echo RETEST_SHORT2_START; sleep 2; echo RETEST_SHORT2_DONE`。
- 首父会话 `99791cc5-1fa2-4d07-8da4-cc3554c4ffa4` Journal：seq2924 于 21:17:09.136 启动，seq3179 于 21:17:11.161 完成，exit0；父回合 seq4349 到 21:17:19.151 才结束。
- Computer Use 同次原生 AX/截图观测约 21:17:18，仍有该命令的 Running 与父停止/运行中标志。`r1-short2-settled-parent-active-running.png` 的文件时间为 21:17:18.667，落在上述窗口内；滚动令卡片在截图可见区外，因此**截图本身不证明卡片状态**，卡状态来自同次原生 AX 现场观测，见逐项报告原文。父回合结束后持久卡才显示终态。
- 首次 short 场景未及时捕获运行中卡，不用该结束后截图声称此边界通过。没有用模型口头描述或任务耗时推算替代实际 UI/Journal。

源码解释：本次 helper 保留的是启动器返回时的 `preview.status=running`。`packages/client/src/live/stream-adapter.ts:148` 创建 preview；`live-run.ts:252` 存入工具状态后，没有接收任务 settle 来刷新该 preview。与此同时 `packages/client/src/sessions/chat.ts:674` 已能从持久 `background/task` 生成终态，但 `apps/desktop/src/renderer/session/transcript.ts:34` 会隐藏当前 streaming run 的 durable 块，继续显示 live 卡，直到父回合结束。故仅修 helper 不能令中途完成的后台卡及时更新。

后续修复建议（本轮不实施）：在共享投影/合并边界按稳定 callId/taskId 合并最新后台任务事实，使正在显示的 live 卡跟随 completed/failed/stopped/lost；或者让后台状态更新进入 live store，二者选一个权威来源。不要通过整块切换成 durable 而丢失仍生成的正文，也不要等父回合结束或重新引入“工具 finished 即 success”。补回归时必须让 settle 发生在父 run active 期间，再断言可见卡终态、正文仍增长、同一 DOM 身份无重复；已有只把终态预先传给 `toolPreview()` 的测试不能覆盖这条更新链。真实复验覆盖成功/失败及停止，再核对通知去重。

## 收尾与证据边界

- 已恢复专属实例为跟随系统主题与原窗口 1440×856 logical，Computer Use 正常 Cmd+Q。主侧确认原进程 PID 17659 不存在，启动会话退出码 0。
- 22:18:43 再核对 HEAD 与 10 个冻结文件 SHA-256，全部未变；本轮没有修改产品实现或测试，没有提交推送。
- 仅删除隔离 profile 的 `secrets.json` 凭据副本；原用户凭据仍在。Journal、截图和检查日志保留在本地证据目录；清理记录为 `final-cleanup.json`。
- 本轮日志未再出现首轮 OBS-001 的 `Agent service is closed`。启动时有 Chromium Shared Dictionary/cache 创建失败，期间有 macOS 菜单诊断；本轮未观察到与任务验收相关的界面失败，不把这些日志单独签为新产品 Bug，也不声称全局无日志告警。
