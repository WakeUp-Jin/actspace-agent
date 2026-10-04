# P5 Computer Use 第一轮验收（中途报告）

状态：**本地路线已完成；远端路线因 macOS 锁屏暂停，U1 部分覆盖、U2–U5 通过、U6–U9 未覆盖。P5 不标记完成。** 已确认产品 Bug：**0**。测试夹具问题与工具限制单独记录，不计入产品 Bug。

执行日期：2026-10-04，真实 Electron；验收子智能体明确使用 `gpt-6.1-sol`。用户授权仅验收与记录问题；本轮无产品代码修复、无 commit/push。

Scope: real Electron `com.actspace.desktop.dev.w2067fa05`, fresh `/tmp/actspace-p5-cu/desktop-data`, controlled local Provider `http://127.0.0.1:56870/v1`. No product source edits, no commit. All UI actions used cua_repl native app APIs.

## 验收点与路线

先按子项确定范围，再按三个场景路线执行；分组不缩减 U1–U9。

1. 设置与本地任务：添加本机 Provider 与模型、设置性能面板/默认/轻量模型→普通流式→同会话 Plan/Agent→队列/插入/模型时机→审批允许/拒绝→取消/重发→子任务/压缩→正常退出重开。已完成 U2–U5 与 U1 的本地设置子项。
2. 远端与文件：连接本机测试 Host→创建远端会话→上传/失败重试/结果→断开/恢复/丢回执。尚未开始实际配对，U6–U7 未覆盖。
3. 生命周期与维护：远端运行中正常退出→重开恢复→第二客户端审批→正常维护/强停/blocked。U8–U9 未覆盖。

所有截图绝对路径前缀为 `/tmp/actspace-p5-cu/`；临时目录不保证长期保留。父子终态、模型配置和队列消费的后台资料仅作为日志辅助，真实 UI 结果来自 `cua_repl`。

## 逐子项结果

| Item | Result | Real CU evidence and limits |
|---|---|---|
| U1 non-sensitive settings/preferences | PASS | Enabled performance panel; normal Cmd+Q then same-data relaunch; UI still on. `u1-settings-reopened.png`. |
| U1 Provider/model/default/utility persistence | PASS | Added custom OpenAI Chat service, discovered and selected p5-test/p5-alternate; later set default/utility p5-test; after relaunch UI shows both p5-test and composer works. `u1-settings-reopened.png`. Parent's before/after settings equality is auxiliary. |
| U1 Host connection persistence | UNCOVERED | Pair route started but Mac locked before form input. |
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
| U6-U9 | UNCOVERED | Awaiting unlock, then remote route. |

## Fixture issues (not product Bugs)

1. First P5_STREAM_HOLD did not match fixture hold condition; it completed normally before mode restriction check. Parent fixed test fixture and re-ran real sustained stream. Earlier completion was not reported as Bug.
2. Corrected indefinite stream had no heartbeat and hit approximately 5 minute body idle timeout; parent journal ended failed/terminated. Queue paused and recovered. Parent added 10s SSE heartbeat; new insertion hold completed correctly.
3. Initial default/utility selectors were unconfigured although composer had local models; title fell back to local selected model. Both explicitly set p5-test before U5 and reboot; no real external Provider used.

## Operational limitation

Native AX, screenshot and combined observation each take approximately 61 seconds; combined AX+screenshot reduces two captures to one. A fresh combined capture represents state taken near call start, so release confirmation sometimes requires a following capture. No blind grouped action after changed indices; invalid ID after model switch was refreshed.

At remote pair form action, cua_repl returned: `The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.` Parent notified; dependent UI work paused. No Host form data entry or pairing completed in this call. Need user manual unlock; avoid count as product failure.

Confirmed product Bugs so far: none.


## 恢复执行入口

用户手动解锁 Mac 后，复用同一主 Desktop 身份和隔离数据；不要打开用户安装版或操作旧 P4 数据。当前主 Desktop 位于设置→远端 Host 的空配对表单。由主智能体生成新的一次性配对码后，经 UI 输入名称 P5 Remote 和 `wss://localhost:52171/rpc`，避免沿用过期码。之后按 U6–U9 逐子项覆盖，并在 U8 正常退出重开后补 U1 Host 连接持久化。第二 Desktop `com.actspace.p5.peer`、主 Host 和独立 blocked Host 均由主智能体准备并维护；停启、注入丢回执、上传失败和 maintenance 由主智能体协议辅助触发，CU 子智能体独占 UI 观察与交互。

本报告为中途证据，不作为全阶段签收；没有移动计划目录，没有修改计划完成状态。
