# P5 Computer Use 第二轮验收

状态：**本轮规定的 U1–U9 功能验收点已覆盖。2026-10-04 修复复核确认 B1/B2 为真实问题、代码已修复待 Sol 复验；B3 因两台测试 Host 配置同名工作区/同模型而误报，已撤回。P5 不签收完成。** 详见 [修复记录](phase-5-feedback-fixes.md)。 本报告补充 [第一轮本地路线](phase-5-cu-round1.md)，不改写第一轮锁屏前的覆盖事实。执行日期 2026-10-04，真实 Electron UI 由 `gpt-6.1-sol` 子智能体经 `cua_repl` 独占操作；主智能体控制本机 Provider/Host/故障代理并提供日志、协议辅助。用户仅授权验收和记录 Bug，无产品源码修复、无 commit/push。

## 范围与路线

逐项检查 U1 Host 持久化、U6 混合列表/归属/断线/重连/提交去重、U7 上传/失败重试/远端结果、U8 正常退出持续运行/重开/多端审批、U9 正常维护等待任务与审批/强停/blocked。复用远端会话、文件与生命周期场景以减少导航，未缩减验收点。

主 Desktop `com.actspace.desktop.dev.w2067fa05`，数据 `/tmp/actspace-p5-cu/desktop-data`。本机测试 Provider `http://127.0.0.1:56870/v1`；模型 `p5-test`。Host 身份 `ec5e0bba-37e3-4448-8c30-becbda52dfe5`，代理 `wss://localhost:52171/rpc`。只信任本轮证书（启动 `NODE_EXTRA_CA_CERTS`），未关闭 TLS 验证。测试文件 `/tmp/actspace-p5-cu/attachment.txt`。第二 Desktop 使用 P5 `peer-data` 与本轮构建；为解决 macOS credential 环境问题，临时复用已获授权的 runtime 身份 `com.actspace.p4.second`，未复用或操作 P4 数据。

截图路径前缀为 `/tmp/actspace-p5-cu/`；该临时目录不保证长期保留。普通 fixture 文本中的 result.txt 链接不代表已生成产物，因此先真实运行 write_file，再验证登记后的文件。

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

规定 U1–U9 子项没有剩余未覆盖项；核心功能行为通过，B1/B2 两项错误反馈待修复后 CU 复验，B3 已撤回。第一轮 U2–U5 的证据仍以第一轮逐子项表为准。待 Sol 定向复验 B1/B2 后再决定签收，未移动执行计划、未修改完成勾选。

边界：双客户端 UI 验证的是 Peer 处理后 main 同步终态，重复决定拒绝来自协议辅助，没有声称 UI 同时点击竞态。远端结果读取 UI+artifact 证据明确，但共享 canonical 工作区的夹具不能单靠路径排除所有串读。正常退出后任务继续依赖真实 Host 快照辅助，退出与重开界面由 CU 实验观察。真实外部 Provider/云部署/手机 Web 不在本轮范围。

保留 main 在 P5 Blocked 新建草稿场景便于复查；两个 Peer 已正常退出。切到 blocked 时工作区仍显示旧 P5 Remote 路径、模型仍显示 p5-test，但发送禁用，未进行任何提交；原归属展示 Bug 3 已撤回：这些正是 blocked Host 配置发布的名称与模型。`u9-blocked-draft.png` 实际为选错菜单后的 P5 Remote 空页，不作为 blocked 通过证据；真实通过使用 `u9-blocked-confirmed.png`。

报告本身完成 `git diff --check`；没有产品源码改动、无 commit/push。
