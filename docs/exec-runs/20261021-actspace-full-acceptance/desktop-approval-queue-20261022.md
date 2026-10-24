# Desktop 审批与队列专项（2026-10-22）

状态：终态；已完成可达专项，限制项逐项保留未覆盖。方法为固定 dist 的独立 Electron + Playwright UI/CDP，不是原生 AX/IME/VoiceOver。仅回环受控 Provider，不代表商业模型审核质量。隔离 profile 与 fixture 位于 `tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-approval-queue-20261022/`，主进程 62974。

## 验收点与路线

1. P2-D08/D09、10-A1、13-A1：默认审批、允许/拒绝、完整工具后续与全权限。
2. 14-A2、R24：等待审批切换返回、状态徽标、正常重启恢复；可达授权入口及隔离/撤销。
3. P2-D05、09-P2-1/2/3、R15：五条队列、滚动、引导/撤回、上移/编辑/删除、停止与显式继续、键盘焦点。
4. R16：正常压缩入口与队列交互；自动审批受控允许/拒绝/错误/接管。

按默认审批→队列→权限模式→持久化/授权→自动审批与压缩路线批量执行。

## 已完成结果

|验收点|结果|实际操作与证据|
|---|---|---|
|10-A1、13-A1 默认工具审批|通过|发送 FIXTURE_BASH_PAIR approval allow；真实 Runtime 首次 printf acceptance-1 出现等待确认，点击运行执行成功；第二次 acceptance-2 再次询问，点击拒绝后正常结束。只允许本次未授权下一次。`evidence/approval-pending.png`|
|P2-D08/D09 子点：全权限模式|通过|会话权限模式→完全权限；发送 FIXTURE_BASH_PAIR full access，两次 bash 1秒内完成，无待审批卡，正常最终响应；随后 UI 恢复自动模式，新请求重新出现待审批，证明恢复生效。|
|09-P2-1 五条排队|通过（视觉滚动后续补）|受控流式 HOLD 运行时连续发送五条，全部排队且输入框清空。`evidence/queue-five.png`|
|09-P2-2、R15 队列操作与顺序|通过|第三条上移；引导后显示下一步读取，撤回恢复；编辑第三条从托盘移至输入框，再提交追加；删除第五条。停止后出现已暂停/继续发送；显式继续后按 ITEM1、ITEM2、ITEM4、EDITED3 实际各执行一次，无重复。`evidence/queue-paused.png`|
|09-P2-3、R24 键盘与焦点|未完成|继续实际验证。|
|14-A2 切换与重启、授权细分、R16、自动审批|未完成|继续实际验证，不能以上述基础结果代替。|

原始 Provider 请求记录为本目录 `requests.jsonl`；不记录 Authorization。所有命令仅无害 printf；未改产品、未重建、未提交。

### 重启生命周期与默认模式恢复

- 等待审批时新建会话再返回，原卡和侧栏待审批徽标保持；`evidence/pending-return.png`。
- 正常 app.close 退出主进程62974，重启主进程94335：历史保留，原活动轮结束，无待审批卡/徽标；`evidence/restart-no-pending.png`。这是正常退出取消活动任务的生命周期事实，不认定审批丢失Bug。
- 新请求先处于已暂停，显式继续发送后重新出现逐次审批，默认模式保持有效；分别拒绝两次后正常最终响应。
- 自建Provider初次重启重置callId，后续一轮报Duplicate tool call fixture-2；属于fixture缺陷，改用时间戳唯一起始ID后重试，不归产品Bug。

P2-D08/D09为复合范围，整体仍未覆盖，不能由已通过子点推断整体通过。

### 精确授权与14-A2

- 14-A2 子步骤通过：读取专用 outside/a.txt 产生审批，切换新建会话后返回，卡片与徽标保留；点击“本会话允许”，两次相同read_file均完成，最终响应与用量360tok，待审批徽标消失。证据 `exact-session-grant.png`、`exact-reuse-complete.png`。
- exact 会话授权及同轮复用通过。目录树授权不在审批卡暴露（源码旁证，不算UI通过）；当前权限菜单实际只有自动/替我审批/完全权限，没有授权列表/撤销入口，继续检查重启与新会话隔离。

### 授权持久化与自动审批（真实UI、受控结论）

- exact持久化通过：正常退出94335并启动32863，同会话再次两次读取outside/a.txt，无卡完成360tok。
- 会话隔离通过：新建另一会话读同路径，重新出现审批；`session-isolation.png`。该会话两次拒绝后正常结束。
- 自动审批配置仅在隔离profile把autoReview绑定回环模型；不是商业模型能力。UI选择替我审批，受控approved=true使两次bash自动完成360tok，`auto-allow.png`。
- 受控approved=false回落人工卡；点击运行接管第一条，第二条仍重新审批并拒绝，正常完成；`auto-deny-takeover.png`。
- 受控审核服务400错误回落人工卡，两次拒绝均可继续正常结束；`auto-error.png`。

### 压缩与队列、键盘

- R16子点通过：正常输入/compact，23条消息压缩完成；增加普通新轮后再次/compact，受控summary-hold使真实压缩保持。期间排入5条，所有引导按钮disabled=true。`compact-queue.png`。释放summary后自动按COMPACT QUEUE1–5各执行一次，托盘清空；`compact-drained.png`。
- 09-P2-1滚动通过：队列UL实际scrollHeight180/clientHeight144，恰四行可视，第五行聚焦后scrollTop36。
- R24键盘子点通过：第五条⋯用Enter打开、Escape关闭，下一次稳定观察焦点回到该更多操作按钮；`queue-keyboard-escape.png`。首个瞬时观察aria=null，不能据此认定最终失焦。
- 09-P2-3原生VoiceOver未覆盖：本次CDP无法等同屏幕阅读器。

## 终态补充与原编号结论

- prefix通过：node --version真实卡显示“本会话允许 node”，点击后两次均完成、360tok，`prefix-pending.png`。这也是版本查询授权适用入口。
- query搜索入口通过：grep专用outside目录产生搜索审批，“本会话允许”后第二次同目录搜索无需再询问，最终360tok，`query-pending.png`。
- 自动审批模型/思考UI通过：设置→模型→自动审批模型，实际打开模型选择与关/低/高/最高菜单，选择高。后续自动审核请求记录reasoning=high。此前关配置的审核记录为disabled。完成后UI切回自动模式停止审核；默认/替我审批切换均实际可用。
- R16禁用原因通过：真实压缩时悬停禁用引导按钮外壳，tooltip明确显示“压缩中不能引导，完成后会自动发送”；`compact-tooltip.png`。
- 09-P2-3可达子点通过：第一行图标role=img、aria-label“2 条排队，当前运行结束后依次发送”，可聚焦；Tab移至禁用引导外壳，再Tab至删除排队消息1。VoiceOver仍未覆盖。

|原编号|终态|范围与限制|
|---|---|---|
|P2-D05|未覆盖（复合项）|本专项流式/工具/停止/显式继续/重启后暂停、队列顺序子点通过；未覆盖全部失败恢复情形。|
|P2-D08|未覆盖（复合项）|default/full-access/once/deny、exact复用/重启/会话隔离、query搜索、node版本prefix通过；subtree独立授权和撤销UI未覆盖。|
|P2-D09|未覆盖（复合项）|启停/配置/高思考请求、受控允许/拒绝/400错误/人工接管通过；未运行商业真实Provider，不代表其判定能力；Host能力硬边界未新增专项。|
|10-A1|通过|本地真实工具审批允许/拒绝及最终响应。|
|13-A1|通过（本专项链路）|新会话真实流式→审批→工具→日志/完成。|
|14-A2|通过|待审批切走返回、获批后徽标消失及完成。|
|09-P2-1|通过|5条队列、4行144px滚动、输入清空。|
|09-P2-2、R15|通过|引导/撤回/上移/编辑/删除/停止显式继续与实际执行顺序。|
|09-P2-3|未覆盖（复合项）|计数图标/Tab/按钮已验证；原生VoiceOver未覆盖。|
|R16|通过（手动压缩入口）|正常/compact、压缩期引导禁用原因、完成后自动依序发送；未制造自动阈值压缩。|
|R24|通过|⋯编辑/上移真实生效，键盘Enter打开及Esc稳定回焦。|

### 授权边界依据

`apps/desktop/src/renderer/components/messages/ApprovalParts.tsx:122`明确仅挑exact建议，subtree由权限服务判断、不在审批卡暴露；`packages/tools/filesystem-read/src/plugin.ts`、`filesystem-search/src/plugin.ts`确有subtree建议生成，因此不是“不适用”，是当前可见审批UI未能验到独立目录树授权。撤销协议存在于`packages/shared/src/desktop-bridge/contract.ts:117`及`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts:217`；当前renderer非mock/test搜索无revokeGrant/sessionGrants使用，不用API代签UI，因此撤销未覆盖。query命令适用规则由`packages/tools/shell-tools/src/command-prefix.ts`定义，已实际版本查询prefix和grep搜索，但其余查询程序未逐个宣称通过。

### 清理与证据

最终空闲主32863/renderer33038，CPU0.44%/0.34%，workingSet151024/130240KB；`final-idle.png`，无排队/待审批。主实例与受控服务随后正常关闭，进程退出核对见清理记录。原始Provider、请求日志、隔离profile保留在tmp，不输出真实Key。额外Git路线属于另一验收agent，本专项未扩展；workbench分支UI疑点已按父复核更正为底层正确、UI上下文需复核。

清理核对：ps针对32863/33038/94335/62974无输出；44331/44332无监听，自己实例与Provider均已退出。

## P2-D08 唯一有限协议补验终态（11:35）

验收点先列：①读取持久化有效grant，公开revokeGrant后同工具重新审批并拒绝不执行；②切换专用workspace后command_prefix撤销、同命令重新审批并拒绝不执行。按exact撤销→prefix工作区切换两组执行。方法为固定dist真实Electron/CDP、公开preload协议+真实UI发送/拒绝，不是撤销UI验收。未改产品或构建，未使用商业Provider。

- 通过：公开 `sessions.getProjectionSnapshot({sessionId}).snapshot.sessionGrants` 读到exact grant `a1602010-c92a-4e46-8a4f-58eadcd19975`（会话44891050…）及command_prefix grant `810a22b6-e41b-4eca-894b-6dc7bc6648ed`（会话af117b89…）。均为此前真实审批持久化授权，未伪造。初始证据 `evidence/revoke-before.json`。
- 通过（公开协议）：`sessions.revokeGrant` 对真实exact ID返回ok:true；真实UI原会话发送FIXTURE_EXACT，读取同一个outside/a.txt重新出现“本会话允许/允许/拒绝”。两次受控read_file均UI拒绝。Journal seq286 grant-revoked，seq299/309 asked，seq301/311 tool/result均denied,user-denied，没有该批tool/started。证据 `revoke-exact-reapproval.png`、`revoke-protocol-journal.json`。
- 通过（公开协议）：通过公开workspaces.createFolder在专用fixture内创建并注册prefix-workspace-switch，再 `sessions.setWorkspace({sessionId,workspaceRoot})` 返回ok:true。切换后snapshot仅剩原grep exact，node command_prefix已移除；Journal seq391真实grant-revoked。真实UI同会话发送FIXTURE_PREFIX，node --version重新请求审批，两次均UI拒绝，seq406/416均denied,user-denied，没有该批tool/started。证据 `prefix-after-workspace.json`、`prefix-workspace-reapproval.png`、`revoke-protocol-journal.json`。
- 操作纠正：首次传未注册目录被拒；createFolder注册后仅传workspaceId仍被当前实现拒绝（实现读取workspaceRoot），改传已注册workspaceRoot成功。不是授权绕过，也未据此新增产品Bug。所有目录均为本批专用fixture范围。
- 最终grant列表见 `revoke-final-grants.json`：exact读取授权消失、node prefix授权消失，另一grep exact保留；没有把所有授权都清空来骗通过。两会话为辨识本批操作通过公开rename改为Revoke Exact Acceptance与Workspace Prefix Acceptance。

P2-D08新增两个行为子步骤通过；撤销UI、独立subtree及未枚举查询程序等仍未覆盖，复合项不整体改为通过。新Electron main40230正常关闭，Provider44331/控制44332正常SIGINT关闭，ps/lsof无这些PID/监听；关闭本profile遗留driver readline进程。证据和隔离profile保留，无产品修改。


## 2026-10-23 P2-D09 Host 能力硬边界补验

[真实 Host 专项](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/host-capability-auto-review-20261023/report.md) H1–H4通过，明确区分插件准入、必需 Agent 形态与 scope 工具可见性三个门禁；自动审批不能提供 Host 未装配的能力。真实配对鉴权 WebSocket、生产 Runtime 与受控 HTTP，非 Desktop/商业替代证据。结合此前 UI 启停、模型思考、允许/拒绝/错误回落及用户接管和商业审核有限补批，原P2-D09范围补齐通过。历史章节的未覆盖描述保留为当时事实。
