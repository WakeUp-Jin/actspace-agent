# P4 Computer Use 第十轮（修复后复验）

2026-10-04，gpt-6.1-sol，真实 Electron UI。仅验收与记录，不修改产品代码、构建、Journal、钥匙串，不提交或推送。主 `com.actspace.desktop.dev.w2067fa05` / desktop-data；第二 `com.actspace.p4.second` / desktop-fifth，最后片段补验使用保留旧目录的 fresh desktop-sixth / desktop-seventh；root 在两旧应用正常 Cmd+Q 后启动最新构建与 Host。Final WSS 52060 / HostId `2ac7a3fb-ce2d-4178-b304-1de49a4fd0a7`；Peer 52062 / `234a5167-e8d4-4a2e-9360-5c6c3d517990`；本地隔离 Provider。

本轮 B1—B5 与 R1—R3 在表内限定范围通过真实 UI 验收，未发现新产品 Bug。B6 两项真实进程验收通过，本轮未重复其维护 UI 专项。不同地址与并发重复添加等自动化范围不扩写成 Computer Use 覆盖。

## 验收点与分组

- B1：首次配对立即出现已有远端会话；已展开列表分页刷新不收缩。
- B2：设备撤销、移除重配和中断后自动重连，侧栏与当前会话连接标签一致。
- B3：重复添加被拒，不消费配对码、不增设备；移除后相同码成功。
- B4：有草稿/待审批时移除 Host，保留历史、入口、草稿与远端归属，发送/审批/停止禁用；重新添加恢复。
- B5：双端完整轮统计一致、前翻不丢失；超大轮片段隐藏整轮统计、完整后恢复。
- R1：双 Desktop 各批准一轮，另一端解除等待。
- R2：主 Desktop 正常完全退出后第二完成，主重开自动恢复。
- R3：相同 SessionId 双 Host 标题、消息、路径路由隔离。
- B6：UI 补维护状态；CLI stop 证据独立记载，不能当 UI 通过。

操作分组：首次配对及现有长历史 → 分页与超大单轮 → 连接中断/撤销/重复添加与草稿审批移除 → 双向审批与退出恢复 → 双 Host 隔离、片段补充。仅关键状态保留截图，同场景批量检查。

## 逐点结果

| 点 | 状态 | 证据与边界 |
| --- | --- | --- |
| B1 首次配对 | 通过，真实 UI | fresh desktop-fifth 配对后返回应用立即出现 P4 Round10 Final 工作区和 Final isolate，无 Cmd+R。`second-first-pair.png` / `.ax.txt`。 |
| B1 分页保持 | 通过，真实 UI | root 真实 RPC 创建12个空会话作为夹具（创建不是 UI 证据）；second 点 Show more 后14入口。Final 正常 stop、start 触发连接刷新，paging01 与 Final 旧第二页仍保留，无需再次 Show more。`second-offline-expanded` / `second-auto-reconnected-expanded`。 |
| B2 自动重连 | 通过，真实 UI + root进程辅助 | stop 后两端侧栏和 current 位置均离线/未就绪；start 后自动恢复连接，second14入口保留。未点重新连接或 Cmd+R。 |
| B2 撤销重配 | 通过，真实 UI + root revoke辅助 | second 侧栏 AX revoked，设置设备授权已撤销；UI 移除、新码重配后 current 与14侧栏入口立即 connected，无刷新。`second-revoked`、`second-repaired-labels`。 |
| B5 旧长会话 | 通过（所观察轮次），真实 UI | 两端初始完整6轮一致：R4 queued after drain 20Token、P4_TOOL 4m30s/60、round8 8m36s/60、round9 second 2m/60、main 10s/60、exit 51s/60。second前翻补03:39的1m1s/60和03:44的3m42s/60，两轮均有用户消息，旧6轮保留。`main-initial-history`、`second-initial-history`、`second-older-history`。 |
| B5 超大单轮 | 通过，真实慢网络 UI + 协议辅助 | 正常Agent执行P4_LONG_TALL，193events、21请求、20工具结果、420Token。fresh seventh经透明本地代理首开，初始100event正常返回，beforeSeq81前翻仅延迟17.098秒：UI“正在加载更早消息…”，缺用户消息、无Token、无Worked for耗时；纯Worked工具入口保留。响应释放后用户消息、Worked for1s、420Token恢复，展开实际20个Write按钮，文件汇总由片段+12/-12恢复+20/-20。`second-slow-tall-initial`、`second-slow-tall-merged`、`second-slow-tall-full-tools`。协议逐页无遗漏/重复为root辅助，不代替UI证据。 |
| B3 | 通过，同地址 UI + root设备辅助 | 已登记 Host 新码重复添加拒绝，原连接已连接；辅助设备14/active12不变、码hash仍存在。随后UI移除并相同码配对成功，设备15/active13，码仅此时消费。`second-duplicate-rejected`、`second-same-code-repair.png`。不同地址与并发添加沿用本轮修复自动化，本次未CU逐一测试。 |
| B4 | 通过，真实 UI | Final待审批+草稿时移除，保留原9轮、侧栏入口、draft；位置远端·未连接，运行/拒绝/停止disabled。Enter不能提交，草稿不变；重新添加保留draft、待审批、运行按钮与Host名恢复。`second-removed-pending-draft`、`second-readded-pending-draft`。另在fresh sixth空闲tall会话输入草稿后移除，历史/入口/草稿保留，远端·未连接、Host未就绪；发送按钮disabled（AX标题“暂无可用模型，请在设置中连接服务商”）。`second-removed-idle-draft`。 |
| R1 | 通过，真实双端 UI + Journal辅助 | second批准轮两端3m6s/60，main批准轮两端21s/60，均先观察双端待审批、另一端随后解除；bash/write_file/results/finish各一次由rootJournal确认。`main-second-pending`、`second-approved-complete`、`main-second-approved-complete`、`main-main-pending.png`、`second-main-pending.png`、`main-main-approved`、`second-main-approved`。 |
| R2 | 通过，真实 UI +进程辅助 | main正常CmdQ，CU inventory消失、root确认PID完全退出；second批准第三轮并完成44s/60/2结果；main同数据重开首次getApp自动连接原Final会话、空闲及完成统计一致，无CmdR或重配。`main-before-normal-exit.png`、`second-completed-main-closed`、`main-auto-recovered-after-exit`。 |
| R3 | 通过，真实 UI +既有夹具身份辅助 | Peer新消息P4 round10 peer route unique greeting仅在Peer，Final无该消息且保留三round10审批轮；分别右键重命名Peer round10 isolate / Final round10 isolate，另一端标题保持。位置各自Host、工作区同路径。second同步Final新标题。`same-id-peer-isolated`、`same-id-final-isolated`。右键曾因更新后索引指向paging07，及时Escape未修改该夹具会话。 |
| B6 | 进程通过；本轮UI未覆盖专项 | root重跑blocked+外部writer-lock失败组合2/2通过，`blocked-process.log`；属于真实进程，不写成CU通过。维护UI沿用第七轮，不声称本轮逐项新验。 |

证据目录 `/tmp/p4-cu-round10`；以上证据标签同时有 `.png` 和 `.ax.txt`（无另述时）。本轮首次配对后未借 Cmd+R 绕过；后续主端两次 Cmd+R 专用于超大轮有界历史窗口观察。

## B3/B4 与回归复现路线

在second已有连接的Final里输入P4_TOOL round10 second approve remove draft；两端观察等待审批，second输入草稿不提交 → 进入设置用新码重复添加已登记Host，拒绝后由root只读查设备与配对码 → UI移除当前连接、返回原会话检查入口/历史/草稿/远端未连接及disabled，Enter不提交 → 重加相同码，返回原会话检查draft/审批恢复 → second点击运行，main同步完成。随后main输入P4_TOOL round10 main approves，观察两端待审批后main运行；第三轮main输入P4_TOOL round10 main exits second completes，main正常CmdQ后second运行，root确认main完全退出，再同数据重开查看自动恢复。

root辅助事实统一见 `/tmp/p4-cu-round10/auxiliary-evidence.json`，与截图来源区分。两端只连接隔离本地Provider，没有调用用户真实外部模型。

## B5 片段场景准备与来源边界

短正文P4_LONG在实时显示、切换、CmdR和同数据冷启动中均显示完整用户消息与420Token。只读源码确认ConversationView在内容不满窗口时自动requestEarlier，这属于正确行为。正常新建P4_LONG_TALL round10 oversized tall，20工具后输出80段正文；main及fresh sixth首次打开仍完整420Token/Worked1s（`second-sixth-tall-initial-full`）。main冷启动保留完整旧历史，结合启动offline日志、adapter离线读缓存、App合并保留更早历史，推断旧完整缓存可能优先恢复；该推断未以UI内部检查证明，不列产品Bug。fresh sixth完整说明未单独截到稳定片段，不能据此声称片段通过或失败。

最后复现路线：root启动隔离透明WSS代理52064，使用同一真实Final Host身份、TLS、Journal；只延迟带beforeSeq的sessions.page前翻请求，不修改响应、DOM或产品。fresh seventh在UI首次配对P4 Slow History，返回应用即有已有列表 → 首开列表最上方tall会话 → 当场保存初始AX与截图 → root提前release，实际hold17.098秒，未触发RPC超时 → 保存完整AX/截图 → 上滚并展开Worked，数到20个Write工具入口。初始片段确实缺user与整轮Token/耗时；完成后恢复用户、420Token、Worked for1s及全部工具。初始100events与前翻73events的seq无遗漏/重复由root真实RPC辅助确认；跨页未完成chunk保留导致逐页union173与全局slim172差一，属于协议有界保留，不是重复工具执行。

主端两次CmdR仅用于B5专用窗口观察，不影响B1 no-refresh证据。代理、设备与协议辅助详见`/tmp/p4-cu-round10/auxiliary-evidence.json`及`/tmp/p4-cu-round10/slow-proxy.log`；UI截图只证明其实际显示与操作结果。配对批次曾返回CU工具noWindowsAvailable，重新getApp后已连接、窗口正常；root进程与日志确认没有崩溃或Keychain阻断，此工具绑定竞态不列产品Bug。

结束时正常CmdQ退出seventh，root关闭验收代理；主桌面保持打开。desktop-fifth待审批草稿与desktop-sixth空闲离线草稿目录均保留，没有删除或修改系统凭据。
