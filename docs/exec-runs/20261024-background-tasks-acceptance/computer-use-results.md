# 后台任务 Computer Use 验收结果

日期：2026-10-24。执行模型：`gpt-6.1-sol`。基线：`40320e0b38f3f18b36e1a0905b979b7733a4cba4`（合入目标 `ce19e4d6`）。本轮仅验收、排查和记录，未修改产品源码、测试或自动化脚本，未提交或推送。

12 个验收点均已执行：**9 通过、3 失败（A1、A4、A11，均含已通过子项）、0 未覆盖**。三个失败分别关联 BGT-001、BGT-002、BGT-003；不能据此签收全部功能。

## 环境与证据边界

- 原生：本轮完整构建后的 Electron `file://.../apps/desktop/dist/index.html`，应用 `Actspace Dev actspace-agent-2067`，bundle ID `com.actspace.desktop.dev.w2067fa05`。真实模型 `deepseek:deepseek-flash`，真实 Bash、真实子智能体。
- 隔离目录：`tmp/codex-acceptance/20261024-background-tasks/{profile,workspace}`。只使用本轮新建的两个父会话及其子会话，未操作用户已有真实会话或原始配置。工作区 README 为公开后台任务设计文档副本；模型任务仅只读该文件或执行受控 echo/printf/sleep/exit。
- Mock：独立 renderer `http://127.0.0.1:5424/?mock=background-tasks`，通过本轮新建 Chrome tab 验证。Mock 仅证明渲染/交互，不证明真实调度、子会话或模型调用。
- 所有应用交互均经 `mcp__cua_repl`。原生未以 CDP 冒充。构建、Journal、日志、确定性探针与测试为主智能体提供的补充证据，不代替真实交互。
- 下文截图统一位于 `tmp/codex-acceptance/20261024-background-tasks/`，均为**本地截图，不随仓库分发**。JSON/日志亦为本地过程证据，不保证其他克隆可用。

## 验收点与结果

| 验收点 | 结果 | 实际覆盖与证据 |
| --- | --- | --- |
| A1 后台 Bash 立即返回、运行到成功/失败 | **失败，部分通过** | 两个 `blockMs=0` 命令立即返回 task ID，真实进程分别 exit 0/7，通知和最终持久卡正确。但运行期间流式卡提前显示 `Ran`，见 BGT-001。`g2-bash-running.png`、`g4-bash-live-start.png` → `g4-bash-durable-running.png`；最终 `g4-native-dark-final-cards.png` 为 Ran/Failed。 |
| A2 完成自动唤醒、通知展开、无伪用户/重复 | **通过** | 首会话空闲后两个 Bash 各到一条完成/失败通知；展开可读 task ID、status、exit summary、output。界面没有新增伪用户消息，Journal 对应 background wake/claim；读取结果没有导致额外通知。`g2-bash-notifications.png`、`g2-first-bash-journal-evidence.json`。 |
| A3 后台 agent 立即返回、实时右侧对话/轨迹、父通知 | **通过** | 首次 agent 启动约 3 秒返回，后续专用只读 agent 约 1 秒返回；打开真实右侧对话看 read_file 卡片及最终文本增长，再看真实轨迹。暂停场景额外捕获运行中轨迹继续增加，完成后父会话可消费通知。`g3-agent-live-dialogue.png`、`g3-agent-live-trajectory.png`、`g3-paused-agent-trajectory.png`。 |
| A4 task_list 元数据、状态和会话归属 | **失败，部分通过** | 本会话 list 返回 ID/kind/status/description/started_at，另一新会话 list 返回 0；跨会话 output 正确拒绝 Unknown background task，无数据泄露。但生产工具实际 `failure.code=BACKGROUND_TASK_FAILED`，不符合约定 `TASK_NOT_FOUND`，见 BGT-002。`g2-session-ownership.png`；第二会话 Journal seq114/183 为运行时补证。模型自行解释的错误码不作证据。 |
| A5 task_output 的 Bash/agent 进度与非消费语义 | **通过** | Bash running 输出 TOOLS_STARTED 和 output_path；agent running 输出 steps=2、tool_calls=1、recent read_file。随后真实完成通知仍到达，output 查询未吞通知。首会话对应工具展开结果及 `g2-g3-journal-evidence.json`。 |
| A6 task_wait 超时、完成和去重 | **通过** | 同一个 90 秒 Bash：wait 1 秒返回 timed_out/still_running=1；后续 wait 120 秒返回 completed/exit0/TOOLS_DONE。wait 已交付终态后未再出现重复完成通知；Journal settle 为 delivery=wait，该任务没有完成通知 enqueue/claim。首会话工具结果、`g2-g3-journal-evidence.json`。 |
| A7 task_stop 停止且不再唤醒 | **通过** | Bash 120 秒命令启动约 1.26 秒即 stopped，output 只有 STOP_STARTED，无 MUST_NOT_RUN；另一会话后台 agent stop 后 output 同为 stopped。后续观察无对应完成通知/自动新轮，Journal delivery=stopped。`g3-agent-stopped.png`、`g2-g3-journal-evidence.json`、`g4-before-quit-journal-evidence.json`。 |
| A8 停主会话不停后台、暂停不唤醒、下次消息消费 | **通过** | 同轮启动 Bash + 长只读 agent，再点原生“停止 Agent”。父回合 aborted，子轨迹继续执行，两后台均完成；父会话保持静止，直到下一条真实用户消息才各领取一次通知。`g3-paused-agent-trajectory.png` → `g3-paused-completed-no-wake.png` → `g3-resumed-consumes-both.png`；Journal seq6905–6919 补证。 |
| A9 轨迹后台任务清单从运行到结束 | **通过** | 实际轨迹上下文的 background-tasks 条目显示任务 ID/kind/描述/start；全部结束后的下一回合显示 `No background tasks are running.`。`g2-context-running.png`、`g4-context-all-ended.png`。 |
| A10 正常退出/重启的 lost 语义 | **通过** | Bash 180 秒 + 长只读 agent 运行时 Cmd+Q，进程正常 exit0；主智能体以完全相同 profile/workspace/dist 重启。两任务记 lost，未自动开新轮，未被当成成功；发下一条真实消息才消费两条 lost，activeOnly list 为 0。原生卡显示 Cancelled/已停止，并非直接显示 lost 字样。`g4-restart-idle-lost.png` → `g4-restart-lost-consumed.png`、`g4-restart-journal-evidence.json`。 |
| A11 浅/深主题与窄窗交互 | **失败，部分通过** | Mock 双主题 480×900 通知展开/折叠、键盘 Return 已验。真实主卡/通知在深/浅 832 logical 窄窗可读，但右侧面板自动关闭且点击卡或打开面板按钮均无法重开。约 1101 logical 的实际 390 宽面板在浅/深主题可读，浅色对话/轨迹及深色轨迹切换正常；800 logical 深色 overlay 可读、能切轨迹及关闭重开。832 的断档为 BGT-003，详见边界证据。 |
| A12 前台委派回归与 codec 日志 | **通过（注明日志观察）** | 第二会话 `background=false` 只读 agent，父回合等待结果再完成，卡片不标后台，真实右侧对话显示子任务结果。`g4-foreground-regression.png`。主侧未见 background codec/unknown-event 错误；首次退出末尾出现一次 `Agent service is closed`，进程 exit0，无界面故障证据，不宣称日志零错误。 |

以上“通过”限定在明确执行的代表路径。没有额外签收并发上限、8KB 精确边界、wait 中断、所有组件位置或流式性能。

## 操作路线与关键复现

### G1：Mock 卡片与通知

在同一 mock 页面连续检查 Bash/agent 状态、完成通知展开和收起，再切深色、窄到 480×900，切浅色复用同一路线。键盘 Return 可折叠 agent 通知。Mock 没有真实子会话，不以它签收右侧真实轨迹。

证据：`g1-mock-light.png`、`g1-mock-dark.png`、`g1-mock-dark-expanded.png`、`g1-mock-dark-480.png`、`g1-mock-light-480.png`。

### G2：真实 Bash、查询工具与归属

首会话 `86e526a9-9f9e-473f-8fa8-edd4694f29ff`（CU-A1 后台隔离验收任务）：

1. 依次后台执行 `printf BG_SUCCESS_START; sleep 35; echo BG_SUCCESS_DONE` 与 `printf BG_FAILURE_START; sleep 35; exit 7`，父只回 task ID，不查询/等待。成功任务 `bash_1f11cf67-65f6-4978-a844-92487a673b16`，失败任务 `bash_aec0e76b-6568-4da3-89cd-dcede0de59db`。
2. 在运行中观察卡片，完成后观察两个独立通知并展开。截图 10:17:22 已写 Ran；Journal 真正 settle 时间分别 10:17:46.894 和 10:17:56.533，排除截图时已完成的解释。
3. 后台执行 `echo TOOLS_STARTED; sleep 90; echo TOOLS_DONE`，依次 list、output、wait(1)，再在下一轮 wait(120)。真实工具输出分别 running、timed_out 和 completed。
4. 新建第二父会话 `45aa499f-1779-4c9e-9328-d56f519f0b84`，list(false) 为空，再 output 首会话成功 ID，确认拒绝。实际错误码由 Journal 与真实打包 Harness 探针补证，详见 BGT-002。

### G3：真实子智能体、停止与暂停

子任务只读工作区 README，按指定 offset/limit 串行 read_file，以足够执行时间现场观察右侧对话/轨迹。模型偶有为读到尾部增加少量只读调用，本轮不据此评估严格指令遵循；实际始终限定该公开文件。

- agent 输出进度场景：`agent_6c2ae479-bec3-4ad9-8f55-d7912b353cda`，首次 output 时运行中，随后完成自动唤醒。
- 现场对话场景：`agent_18fe841a-3700-410f-bffd-e44809e8a397`，子会话 `4535e7a3-70ab-43d4-b3f2-61ca04fb7348`。
- Bash stop：`echo STOP_STARTED; sleep 120; echo MUST_NOT_RUN`，启动后立即 task_stop，再 output，只有首段输出。agent stop：`agent_6a238a92-56a8-45d8-9008-d8d3cc6e9704`，终态 stopped。
- 暂停场景：Bash `echo PAUSE_STARTED; sleep 60; echo PAUSE_DONE` 与 agent `agent_971849df-ef32-478f-abc3-cb86f72c1ea2` 同时运行，父继续长文以便点停。停止后子轨迹仍运行；两后台于 10:25:12.109 / 10:25:16.067 完成。Journal 从父 aborted 到新用户消息之间无新 turn，后两通知各 claim 一次且无 opensTurn。输入下一条消息后需通过暂停队列“继续发送”，最终消费两项 completed，PAUSE_DONE 存在。

### G4：持久投影、重启、前台回归与视觉

长 Bash 刚返回 ID 的流式卡显示 Ran；同一父回合结束转持久投影后恢复 Running，固化 BGT-001 的投影差异。该场景不等自然结束，而与运行中的只读 agent 一起用于正常退出/重启。

退出前任务 `bash_4890829b-fba7-4d08-85c9-6803d201a1dc` 与 `agent_41ee4519-0089-4d40-8840-89b420502771` 均运行。原生 Cmd+Q 后进程正常退出。相同环境重启后 Journal seq1106/1108 为 lost，界面不自动继续；下一消息仅消费 lost，不假定原任务成功。随后 `task_list(activeOnly=true)` 为 0。

前台回归在第二会话调用 `agent(background=false)` 只读 README 1–8 行，观察父等待及右侧完成内容。视觉检查复用已完成的会话，不新增模型任务。

真实主会话视觉证据：`g4-native-dark-final-cards.png`、`g4-native-dark-narrow.png`、`g4-native-dark-narrow-notice.png`、`g4-native-light-narrow-notice.png`。原尺寸截图 2880×1707；窄窗截图 1664×1520 physical，约 832×760 logical，不能把 native 该尺寸声称为 480 CSS。480×900 仅为 mock。

右侧面板补查复用已经完成的 CU-LIVE 子会话，不发送新模型任务：

1. 浅色原尺寸打开真实对话后，缩到 1664×1520 physical（832 logical）。侧栏与右面板自动收起。再次点击 CU-LIVE 卡与右上“打开面板”，AX 仍 Value=0，界面没有右面板。`g4-native-light-narrow-panel-attempt.png` 记录失败；`g4-native-light-narrow-agent-dialogue.png` 这个早期文件名虽含 dialogue，图中没有右面板，**不能当面板可用证据**。
2. 放宽到 2202×1520 physical（约 1101 logical），再次点击打开，真实面板出现，宽度 AX 为 390。可滚动读最终总结，并切换轨迹。证据 `g4-native-light-1101-agent-dialogue.png`、`g4-native-light-1101-agent-trajectory.png`。切深色复用同一子会话，面板和轨迹可读，证据 `g4-native-dark-1101-agent-trajectory.png`。
3. 缩到 1600×1520 physical（800 logical），改用 overlay，内容实际占约 640 logical 宽。对话可读，切换轨迹成功，关闭浮层后点击打开可重开。证据 `g4-native-dark-800-agent-overlay.png`、`g4-native-dark-800-agent-trajectory.png`。未逐像素扫完整区间；821–879 的区间解释来自主侧源码核对，不冒充每个尺寸均实测。

## 问题与交接

- **BGT-001 / P2 / A1**：运行中 Bash 的流式卡提前 Ran，父回合结束后持久卡恢复 Running，最终成功/失败卡正确。用户会被运行期间的完成提示误导。复现、时间证据、根因及修复方案见 [缺陷](bugs.md) 与 [修复交接](repair-handoff.md)。
- **BGT-002 / P3 / A4**：跨会话隔离正确，但实际生产打包 Harness 将 TASK_NOT_FOUND 改成 BACKGROUND_TASK_FAILED，影响调用者按码分类。真实界面只展示 Unknown background task；错误码证据来自原始 Journal 与主侧确定性打包边界探针。详见相同交接文档。
- **BGT-003 / A11**：832 logical 窄窗时右侧子任务面板被立即关闭，正常打开入口无效；800 overlay 与约 1101 docked 均正常。用户在该尺寸无法查看后台子任务。主侧确认共享布局紧凑阈值 820 小于 main560+right320=880，问题在本功能前的 `72dd0a45` 已存在；根因和方案见相同交接文档，不将其声称为本次功能新增回归。
- 退出期 `Agent service is closed` 作为日志观察保留，未发现关联界面故障，不据此新增产品缺陷或宣称已定位。

本轮不修复。修复后应定向复验 A1 的实时→持久→成功/失败、A4 的真实生产打包跨会话错误码，以及 A11 的紧凑/并排布局边界；不得仅凭未打包单元测试关闭问题。

## 收尾

已完成的后台任务均已结束、停止或在重启后记 lost；重启后的活动任务列表为 0。Mock 恢复跟随系统主题/默认 viewport，关闭本轮创建 tab `1531332328`；后续 inventory 确认不存在。右侧面板补查由主智能体以相同 profile/workspace/dist 再次启动，仅打开已有完成子会话。补查结束再次恢复跟随系统主题与 2880×1707 窗口，原生 Cmd+Q，最终 inventory 确认专属 App 与本轮 mock tab 均不存在。未遗留本轮新建运行任务。renderer 与隔离凭据副本由主智能体清理。

主侧最终确认：启动 session `13626` 正常 exit0，主 PID `74189` 已退出，mock 端口 `5424` 无监听；唯一隔离 `profile/secrets.json` 副本已删除，原用户凭据保留。这部分为主侧进程/文件核对，区别于上述 Computer Use inventory。
