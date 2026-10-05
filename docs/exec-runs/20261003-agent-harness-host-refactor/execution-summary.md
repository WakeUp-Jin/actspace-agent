# P1–P5 重构最终验收索引

状态：2026-10-04 原 P1–P5 批准范围验收完成。后续代码/文档清理单独执行，不沿用这里的通过结论。原阶段提交已存在；报告中的未提交/未推送措辞仅是当时快照。

- [P1 固定产物与组合](phase-1-summary.md)
- [P2 Task/Run](phase-2-summary.md)
- [P3 控制服务](phase-3-summary.md)
- [P4 完整覆盖矩阵](phase-4-acceptance-matrix.md)及[修复后定向证据](phase-4-cu-round10.md)
- [P5 工程结果](phase-5-summary.md)及下述合并 CU 结果。

## P5 验收来源

原第一轮完成本地 U1–U5，第二轮完成远端 U1/U6–U9，第三轮只复验 R1–R3。真实 Electron 由 gpt-6.1-sol 子智能体操作，主智能体提供本机 fixture、进程及协议辅助。以下是原证据的整理，本次没有重新执行这些操作。

所有 P5 截图前缀为 `/tmp/actspace-p5-cu/`，临时证据不保证长期存在。使用本机受控 Provider/Host，不代表真实云部署、外部付费 Provider 或手机 UI 验收。源码、日志、协议与真实 UI 的证据边界按各表保留。

## P5 本地验收

| Item | Result | Real CU evidence and limits |
|---|---|---|
| U1 non-sensitive settings/preferences | PASS | Enabled performance panel; normal Cmd+Q then same-data relaunch; UI still on. `u1-settings-reopened.png`. |
| U1 Provider/model/default/utility persistence | PASS | Added custom OpenAI Chat service, discovered and selected p5-test/p5-alternate; later set default/utility p5-test; after relaunch UI shows both p5-test and composer works. `u1-settings-reopened.png`. Parent's before/after settings equality is auxiliary. |
| U2 create/send/stream/title/result/duplicate/running | PASS | User sent normal local request; first live content and running/stop state captured `u2-local-result.png` (filename says result but is intermediate); final complete assistant, title change, idle, empty-input send restored `u2-local-terminal.png`. One user/assistant result, no repeat. |
| U3 same-session Plan then Agent | PASS | `/plan` chip selected, Plan sends; `/agent` after completion removes Plan chip. Same session. |
| U3 running mode restriction | PASS | Continuous Plan stream showed disabled remove Plan; typed /agent menu had no functional agent item while streaming. `u3-plan-stream.png` is first short fixture stream; fresh AX from second hold confirms restrictions. |
| U3 queued inputs/config timing | PASS with log auxiliary | Two messages queued while Plan hold; switched p5-alternate to p5-test; after fixture timeout queue paused, clicked continue and both messages completed using p5-test. UI confirms result; parent journal/provider requests confirm current model at dequeue. `u3-queue-resumed.png` intermediate. |
| U3 insertion/consumption | PASS with log auxiliary | New heartbeat hold, queue P5_STEER_ACTIVE, click insert; real UI 1 inserted/next step/read/withdraw `u3-steer-pending.png`; release consumed and result displayed, insertion tray disappeared. `u4-approval-pending.png` contains consumed result. Parent journal claim same Run and provider next request confirm actual consumption. |
| U4 approval allow | PASS | P5_TOOL pwd no_sandbox card run/reject, clicked run; Ran pwd and Write result.txt; complete result/artifact. `u4-approval-pending.png`; later AX completed. |
| U4 approval reject | PASS | Click reject -> Denied pwd, approval buttons disappear, fixture continued permissible write_file then terminal. `u4-rejected.png` is post-reject streaming intermediate; next AX shows completed. |
| U4 cancel | PASS | P5_HOLD -> stop -> Stopped, idle, empty-input send. `u4-cancelled.png`. Parent journal cancelled is auxiliary. |
| U4 resend after cancel | PASS | Enter new message went to paused queue (expected queue pause policy, not a Bug); clicked continue -> result completed, idle, send restored. `u4-resend-completed.png`. |
| U5 subtask progress/result/terminal | PASS | P5_CHILD_HOLD -> card thinking/running + automatic right child list running 1 `u5-child-progress.png`; opened transcript; released -> right child completed/result and parent final/idle `u5-child-terminal.png`. |
| U5 compaction progress/result/terminal | PASS | UI /compact -> compaction progress/summary text and stop disabled `u5-compaction-start.png`; release -> compacted 31 messages 1m31s `u5-compaction-completed.png`; P5_AFTER_COMPACT sent, completed and idle confirmed via fresh AX. `u5-compaction-terminal.png` remains another intermediate (release timing). |

## P5 远端验收

## 逐子项结果

| 验收子项 | 结果 | 真实 CU 与证据边界 |
| --- | --- | --- |
| U1 偏好、Provider、默认/轻量模型重启保持 | PASS（第一轮） | 见第一轮 U1，重启 UI 与非敏感设置快照。 |
| U1 Host 连接正常重启保持 | PASS，日志辅助 | main 正常 Cmd+Q→同数据/CA重开；自动回到 P5 Remote 同 session、模型可用、连接正常，无重新配对。`u8-normal-reopen-completed.png`。settings/remote-hosts/加密凭据 hash 前后相同仅日志辅助。 |
| U2–U5 全部子项 | PASS（第一轮） | 逐子项、复现与截图见第一轮；未使用本轮远端结果替代本地验证。 |
| U6 本地/远端混合列表、归属 | PASS | 创建真实远端 session `0c19905a-84fa-49ea-97b6-26ae51434f88`；侧栏 P5 Remote·workspace / New chat P5 Remote 与 Default workspace 本地会话并存；运行位置与工作区固定归属。`u7-upload-completed.png`。 |
| U6 断线禁发、草稿 | PASS | 输入 P5_OFFLINE_DRAFT 后主智能体 offline；UI 离线、Host 未就绪、模型与发送 disabled，草稿完整可编辑。`u6-offline-draft.png`。 |
| U6 重连状态与发送 | PASS | online 后自动恢复 P5 Remote/p5-test/发送可用；草稿保持，点击一次发送后最终回复与 idle。真实 AX；后台该任务只提交一次。 |
| U6 未确认提交去重 | PASS，协议辅助 | drop-ack 后 UI 显示“提交尚未确认”“同一标识核对”，草稿保留；重连显示唯一 user 和 running。点击一次核对后草稿与警告清空、Stop 恢复、未出现重复消息/队列。`u6-drop-ack-intermediate.png`、`u6-drop-ack-recovered.png`、`u6-drop-ack-retry.png`。后台重试仍同 submission/task/Run、仅 1 task，属于协议辅助。 |
| U7 附件上传 | PASS，日志辅助 | native Open panel 选择 P5 attachment.txt，发远端消息后真实文件卡与终态。`u7-upload-completed.png`；Host uploads artifact a39d… 的落点由协议辅助确认。 |
| U7 上传失败重试 | PASS | 注入 uploads.begin 临时失败：UI 显示 P5 injected temporary upload failure，消息与附件保留、未提交用户消息；恢复上传后重试一次、错误消失、最终回复/idle。`u7-upload-failure.png`、`u7-upload-retry.png`、`u7-upload-completed.png`。 |
| U7 结果访问、远端来源 | PASS，有限制 | 实际 P5_TOOL_REMOTE_MULTI/SECOND 写入 result.txt，点击 Open result.txt，右面板内容 P5 remote result verified.。`u7-remote-result-preview.png`。Host files.reference artifact 为协议辅助（u7-remote-result-artifact.json）。本机与 Host 夹具共用相同工作区 canonical path，CU 路径本身不能排除所有串读；没有把源码推断写成真实验证。 |
| U8 退出 Desktop 后远端任务继续 | PASS，协议辅助 | 运行中正常 Cmd+Q main/Peer；主智能体确认两个 Desktop 已退出、Host 同 Run 仍 running，Desktop 关闭期间 release 并 completed。u8-desktop-closed-running/completed.json 是协议辅助，真实退出用 CU。 |
| U8 重开恢复 | PASS | 同数据/CA重开自动恢复同远端 session，P5_STREAM_HOLD P5_DROP_ACK 唯一 user+最终回复、idle、输入空，无重复。`u8-normal-reopen-completed.png`。 |
| U8 双客户端审批不重复生效 | PASS，协议辅助 | main 发 P5_TOOL_REMOTE_SECOND；Peer 打开同 session 显示运行/拒绝卡并点击运行；main 回访卡消失、单一最终工具结果与 idle。`u8-peer-approval-pending.png`、`u8-main-approval-settled.png`。重复 approvals.decide 返回 CONFLICT，仅协议辅助，未声称 UI 并发双点击。 |
| U9 正常维护等待审批 | PASS，协议辅助 | pending 时正常 stop→draining；UI Host 未就绪/草稿可编辑、审批运行仍可用；处理审批后完成，Host 正常退出、同数据重启恢复 final/idle。`u9-draining-pending.png`、`u9-drain-reopened-result.png`。真实 status/PID/退出由主智能体日志辅助。 |
| U9 正常维护等待运行任务 | PASS，协议辅助 | P5_HOLD P5_DRAIN_ACTIVE running 时 normal stop，UI 原任务仍 running/Operating Space、Stop 可见，Host 未就绪/草稿可编辑。`u9-draining-active.png`；release 后真实最终回复/idle，`u9-drain-active-completed.png`。后台正常退出 exit 0、同 data 重启 ready 与 Run completed 为辅助。 |
| U9 强停终态与安全禁发 | PASS，协议辅助 | P5_HOLD P5_FORCE_ACTIVE running 后 force；真实 UI Stopped/idle，归属离线、Host 未就绪、模型/发送 disabled。`u9-force-offline.png`；同 data 重启自动连接、保留 Stopped、错误自动清除，`u9-force-recovered.png`。后台 journal aborted/恢复 interrupted 为辅助。错误提示另列 FAIL。 |
| U9 blocked 状态反馈/禁发 | PASS，协议辅助 | 独立 P5 Blocked 配对已连接；新建运行位置选该 Host，输入 P5_BLOCKED_DRAFT 保留、Host 未就绪、发送 disabled。`u9-blocked-confirmed.png`；blocked/harness-recovery 诊断为协议辅助。锁归属/截止细节由真实进程测试覆盖。 |
| 配对失败的根因提示 | FAIL：Bug 1 | safeStorage 不可用误提示地址/网络/服务，详见下文。 |
| 强停断线的用户错误提示 | FAIL：Bug 2 | 一次真实 AX 原始 IPC/错误类泄露，重连自动清除，详见下文。 |
| 切换不可用 Host 的选择归属展示 | 原误报已撤回 | 两台夹具实际配置相同工作区名称/路径与模型；截图不能证明显示了旧 Host 数据。新增不同工作区/模型的组件回归测试通过；真实 CU 显示与当时 Host 配置一致。 |

## Bug：P2，本机凭据加密不可用时误报网络连接失败

复现：fresh 临时 Desktop 身份 `com.actspace.p5.peer` →设置→远端 Host→输入有效 WSS 地址与未过期配对码→配对。Host `auth.pair` 已成功，随后 Electron safeStorage 保存凭据遇到 `System credential encryption unavailable`，macOS `errKCAuthFailed(-25293)`。

预期：界面说明本机凭据加密/钥匙串不可用，提示相应环境处理；避免引导用户反复修改服务器地址、网络或重复消耗配对码。

实际：真实 CU 表单显示“连接未成功，请检查服务器地址、网络和服务器运行状态后重试。” 后端根因为 safeStorage。没有把 keychain 环境障碍算作连接协议失败；缺陷限于错误提示映射。

证据：当时真实 CU AX 文案摘录 `/tmp/actspace-p5-cu/bug1-ax-excerpt.txt`（摘录而非原始全量 dump，该失败没有独立截图）；主进程与 Host 观测辅助。只读源码 `apps/desktop/src/renderer/components/settings/HostConnectionsSettings.tsx:6-17` 无 safeStorage 分支，落到通用网络错误。使用已有授权 runtime 身份与同 fresh P5 数据后真实配对/多端审批成功。未修复产品源码。

## Bug：P2，强停断线时显示原始 IPC 错误

复现：main 同远端会话发送 P5_HOLD P5_FORCE_ACTIVE →任务 running→主智能体 force 停 Host→CU fresh AX 观察。

预期：说明远端连接已断开/任务已停止，给出有意义的恢复操作。

实际：任务 Stopped 与安全禁发正确，但真实 AX 同时显示 `Error invoking remote method 'runtime-v2:fixed:session:get-page': HostDisconnectedError: Host connection lost; mutation acknowledgement may be unknown`，以及“重试”按钮。面向用户的信息暴露 IPC handler 和内部错误类。同 data Host 重启后错误自动消失，没有手动点重试。

证据：`/tmp/actspace-p5-cu/bug2-ax-excerpt.txt` 是当时 CU 输出摘录，非原始全量 dump。`u9-force-offline.png` 取样较早，只支持 Stopped/离线/禁发，**不支持错误 banner 的可视截图**；`u9-force-recovered.png` 支持恢复状态。只读源码辅助：`apps/desktop/src/renderer/App.tsx:1330` 将 error.message 交给界面，`apps/desktop/src/renderer/components/ConversationView.tsx:1117` 显示 browse.messageError。未修复产品源码。

## B3 已撤回：测试 Host 配置同名，误判为旧 Host 数据

最初观察：选择 P5 Blocked 后，工作区仍显示 `P5 Remote`，模型显示 p5-test，发送禁用。截图为 `u9-blocked-confirmed.png`。

2026-10-04 修复前复核：主 Host 和 blocked Host 的配置都发布同一个 `main` 工作区，名称均为 `P5 Remote`、路径相同；defaultModel 均为 `fixture/p5-test`。`HostRpc.host.describe` 即使 blocked 也正常返回本 Host 配置。因而截图与目标 Host 的实际配置相符，不能证明跨 Host 状态残留。撤回原 B3，未修改 Host 切换产品逻辑。

新增 `host-feedback.test.tsx` 使用不同工作区名称/路径与模型，真实渲染 `useRemoteTarget + Composer`，从 ready 切到 blocked 后显示目标 Host 自身的工作区与模型，保留草稿并拒绝提交；原生产代码即可通过。此证据是组件自动化，不冒充新增 Computer Use。

## 夹具与工具限制

- 首次主端配对失败是测试代理把 Buffer 以 binary frame 转发，Host 按协议拒绝；主智能体只改 `/tmp` 代理为 text，配对成功。不是产品 Bug。
- 第二端新临时应用身份的 safeStorage/钥匙串环境阻塞，经 fixture runtime 身份调整继续；不触碰用户钥匙串、不降低加密保护。
- 一次配对操作返回 CU `-10005 noWindowsAvailable`，但重绑定后 UI 已连接；明确区分工具窗口失效与产品操作结果。
- Native AX/截图约 61 秒；关键截图在取样开始时生成，短流式终态再以 fresh AX 确认。一般回复 result.txt 是 fixture 链接，未登记前不进行缺失误报。
- 没有真实外部 Provider、云部署或手机 Web 验收。远端 Review 的本地 shell 不可用仅日志出现，UI 未展示入口/错误，不计 Bug。

## 覆盖结论与交接

第二轮确认 U1–U9 覆盖与 B1/B2 缺陷；这两项已在下述第三轮复验通过。B3 误报撤回。表格保留原轮次观察，不将修复前现象当成当前未解决问题。

边界：双客户端 UI 验证的是 Peer 处理后 main 同步终态，重复决定拒绝来自协议辅助，没有声称 UI 同时点击竞态。远端结果读取 UI+artifact 证据明确，但共享 canonical 工作区的夹具不能单靠路径排除所有串读。正常退出后任务继续依赖真实 Host 快照辅助，退出与重开界面由 CU 实验观察。真实外部 Provider/云部署/手机 Web 不在本轮范围。

保留 main 在 P5 Blocked 新建草稿场景便于复查；两个 Peer 已正常退出。切到 blocked 时工作区仍显示旧 P5 Remote 路径、模型仍显示 p5-test，但发送禁用，未进行任何提交；原归属展示 Bug 3 已撤回：这些正是 blocked Host 配置发布的名称与模型。`u9-blocked-draft.png` 实际为选错菜单后的 P5 Remote 空页，不作为 blocked 通过证据；真实通过使用 `u9-blocked-confirmed.png`。

报告本身完成 `git diff --check`；没有产品源码改动、无 commit/push。

## P5 修复后定向复验

# P5 Computer Use 第三轮：修复定向复验

2026-10-04，`gpt-6.1-sol` 子智能体执行真实 Electron Computer Use。**R1–R3 通过，无新增产品 Bug。** 原 U1–U9 逐子项覆盖沿用第一、第二轮，不在本轮重新宣称全套执行。没有产品代码修改、commit 或 push。

## 验收点与操作分组

- R1：本机凭据存储失败提示明确指向钥匙串/密钥环，保留名称、地址与安全输入，不误报网络。
- R2：真实远端长任务强停后的 Stopped、离线、禁发与恢复；真实读取断线后的用户文案、重试和恢复，无 IPC/internal/mutation 文案。
- R3：ready 与 blocked Host 发布不同工作区名称、路径与模型时，切换显示目标配置、保留草稿并禁发。

按两组执行：远端任务→强停→重连→读取故障→重试→不同 Host 切换；设置→fresh 隔离 Peer→一次配对存储失败。执行前已向用户列出验收点与分组，现场因 R1 单独身份启动调整路线，不缩减范围。

## 环境与证据边界

主 Desktop 正常 Cmd+Q 后以 `ACTSPACE_DATA_DIR=/tmp/actspace-p5-cu/desktop-data`、本轮 CA 经 `pnpm dev:log` 构建屏障重启。`logs/dev-round3.log` 记录构建成功、0 errors、`com.actspace.desktop.dev.w2067fa05`；真实窗口 renderer 为 5173。Peer 使用原失败身份 `com.actspace.p5.peer` 与全新 `/tmp/actspace-p5-cu/r1-round3-data`，同轮 main/preload 与 renderer。未操作用户真实设置/凭据，未修改钥匙串，未关闭 TLS 或加密保护。

所有证据前缀 `/tmp/actspace-p5-cu/`；临时目录不保证长期保留。CU 原生 AX/截图调用约 61 秒，截图取样可能早于 AX，因而错误 banner 明确以 AX 为证，不能把较早截图当 banner 截图。

## 逐项结果

| 点 | 结果 | 实际操作与证据 |
| --- | --- | --- |
| R1 本机存储错误 | PASS，真实 CU+日志辅助 | fresh Peer→设置/远端 Host→有效本机 WSS 与新配对码→一次点击配对。自然出现 `System credential encryption is unavailable`/`errKCAuthFailed -25293`（日志辅助）；真实 AX 和截图明确“本机凭据存储不可用…检查系统钥匙串或密钥环…若配对码已被使用，请重新生成”。名称 P5 R1 Storage、地址与安全输入保留。`r1-round3-pair.png`、`r1-round3-pair-ax.txt`；`logs/r1-round3-peer.log`。本轮只验证自然出现的加密不可用；其他加密/解密异常仍为组件自动化覆盖。 |
| R2 自然强停安全状态 | PASS，真实 CU+CLI辅助 | UI 提交 `P5_HOLD P5_R2_ROUND3`，已有 paused 队列先点继续发送，真实 running/Stop 出现后 CLI force Host。真实 UI Stopped、离线、Host 未就绪、模型/发送 disabled。`r2-round3-offline.png`、`r2-round3-offline-ax.txt`；`logs/r2-round3-force.log`。此自然强停没有复现原错误 banner，不能据此单独证明文案转换。 |
| R2 读取断线用户文案 | PASS，真实 CU，故障代理辅助 | 单纯离线切换/刷新走缓存，无 banner。仅改 `/tmp` 代理新增 one-shot `/drop-read`：在真实 `sessions.page` 请求时关闭 WebSocket并暂时阻止重连，未注入 renderer 函数或伪造页面。UI 从本地切回远端后 AX 显示“远端连接已断开，暂时无法加载会话。连接恢复后将自动刷新，也可点击重试。”与重试按钮，无内部名。`r2-round3-injected-read-error-ax.txt` 支持文案；同名 png 取样较早不支持 banner 可视证据。`proxy-events.jsonl` 的 dropRead 与 main 日志为辅助。 |
| R2 手动重试与恢复 | PASS，真实 CU | 离线点重试后返回已缓存历史、banner 清除；online 与同数据 Host ready 后连接自动恢复。后续运行位置选择显示 P5 Remote、原工作区路径与 p5-test。新强停任务唯一 user、Stopped 恢复，没有重新提交或重复任务。离线刷新期间旧缓存暂时缺新终态，连接恢复后重新同步；未误报数据丢失。 |
| R3 不同 Host 校准 | PASS，真实 CU+配置辅助 | 临时 blocked Host 配置改为工作区 `P5 Blocked Distinct`、独立 `/tmp/actspace-p5-cu/blocked-workspace`、默认 `fixture/p5-alternate`；同 dataRoot 重启报告 blocked。新建页先选 ready Host，真实显示 P5 Remote/原路径/p5-test；输入草稿再选 P5 Blocked，真实显示 Distinct/独立 canonical path/p5-alternate、草稿 `P5_R3_DISTINCT_DRAFT` 完整，Host 未就绪且发送 disabled。`r3-round3-distinct-blocked.png`、`r3-round3-distinct-blocked-ax.txt`、`logs/blocked-round3.log`。原 B3 撤回结论保持。 |

## 收尾与范围

原 U1–U9 已有覆盖，没有开发遗漏由本轮 CU 新增发现。B1 的自然本机加密不可用、B2 的真实传输读取断线与 retry 均已实机确认修复；R3 补充区别配置，校准原夹具误报。无新产品 Bug。

没有真实外部 Provider、云部署、手机 Web、新旧 Harness 升级恢复或 UI 同时双点击竞态验证；这些不是本轮新增通过项，沿用既有范围边界。第二轮结果访问共享 canonical path 的限制也未被本轮改写。

主 Desktop 保留不同 blocked Host 的未提交草稿；主 Host ready，blocked Host blocked，代理 online 且一次读取故障已消费。R1 Peer 完成后正常退出；其 fresh 数据仅位于本轮临时目录。本轮不改计划签收状态，由主线程结合计划门禁维护。
