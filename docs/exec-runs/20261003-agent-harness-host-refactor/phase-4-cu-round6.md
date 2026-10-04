# P4 Computer Use 第六轮

2026-10-04，gpt-6.1-sol，固定生产构建，主 Desktop session97090，第二 Desktop session49897。仅授权隔离数据和本地可控 SSE fixture，未使用真实付费 Provider。未修改产品源码/构建。

## 验收点与路线

- R1：旧本机暂停队列继续与 /compact 定向复验。
- R2：双客户端同会话、跨端审批解除、背景会话审批提示。
- R3：主应用完整退出后远端任务继续，第二端批准，重开主端恢复。
- R4：待审批任务及一条队列期间正常 drain，批准后停机，重启后队列 paused 手动继续。
- R5：撤销第一设备即时失效且不取消任务，第二设备可完成。

分组：本机恢复和压缩 → 两端真实 UI 配对最终Host、同步审批 → 复用待审批任务覆盖退出、drain、撤销。关键状态与异常保留截图/AX，未测场景不标通过。

## 当前逐项结果

| 点 | 状态 | 真实覆盖 |
|---|---|---|
| R1 旧队列 | 通过 | 两个旧本机会话分别显示1条/2条排队、已暂停与继续发送。点击继续，原任务依次出现用户消息和夹具回复，没有重新输入/重发。 |
| R1 压缩 | 通过 | 返回上一轮压缩失败的本机会话，/compact Enter 后显示“上下文已压缩 · 10条消息 · 0s”。 |
| R2 | 未覆盖（第二端CU阻断） | 主端设置真实配对 P4 Final Host wss://127.0.0.1:52060/rpc，已连接。第二端表单填入同Host与独立一次性码后点击配对，CU失去窗口，未确认连接结果。 |
| R3 | 未覆盖 | 未退出主应用。 |
| R4 | 未覆盖 | 未 drain/停止最终Host。 |
| R5 | 未覆盖 | 未撤销设备。 |

## 关键证据

- “旧本机两条队列恢复完成证据”截图：原 U1 local Plan hello 与 U1 restarted Plan hello 两轮均完成。
- “夹具修复后压缩复验”截图：压缩10条消息成功。
- “主应用配对最终Host”AX：旧P4 Fixture保留，新增P4 Final Host已连接。

## 第二端阻断

使用精确路径 /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/node_modules/.pnpm/electron@39.8.10/node_modules/electron/dist/Electron.app 选中第二端；AX设置中的 prompts 路径为 desktop-second，确认是授权隔离客户端。bundle com.github.Electron 存在多个安装路径，首次bundle选择提示歧义，随后使用精确路径成功，未打开其它应用。

第二端设置 → 远端Host → 填名称/52060 WSS/独立一次性码 → 点击配对并连接后，cua报 noWindowsAvailable。listApps仍显示Electron运行；仅再进行一次精确路径getApp，报timeoutReached。第二端日志 /tmp/p4-second-desktop.log 读取为空。不能据此认定产品崩溃或配对失败；属于当前CU窗口/绑定阻断，已即时交回主线程检查。没有反复盲试。

当前主端和最终Host未退出/停止，原WSS52059未操作；等待第二端窗口恢复后再继续R2-R5。

## 独立身份第二端复试

主线程正常退出原默认 Electron，复制并 ad-hoc 签名独立测试 App com.actspace.p4.second，保留 desktop-second 数据（PID16873/session76906）。使用新bundle第一次getApp成功，设置prompts路径仍为desktop-second。原默认身份冲突因此不能作为已确认根因。

重新CLI获取一次性码，真实UI填写P4 Final Host、52060 WSS及码，点击配对并连接后，再次返回noWindowsAvailable（9.8秒）。未确认连接是否保存，未重复getApp或盲试。已即时交回主线程检查进程/registry。R2-R5仍未覆盖，主端与Host未操作。阻断发生在原生表单批量填写/提交后，尚不能区别CU原生输入、窗口状态或产品配对故障，不能直接判产品Bug。

## 环境钥匙串门禁诊断与停止

限定CU诊断：getState全surface没有显示SecurityAgent/钥匙串弹窗；getApp('SecurityAgent')返回Invalid app，未读取或输入密码、未操作凭据。主线程进程sample确定第二进程主线程阻塞在macOS Security/SecItemCopyMatching；此为主线程运行时证据，CU未独立确认弹窗内容。

主线程进一步将第二App可执行文件命名ActspaceP4Second并重新ad-hoc签名，重启session28922，路径/bundle不变、隔离数据保留。授权仅一次再试：CLI获取新配对码后，首次getApp(com.actspace.p4.second)即timeoutReached（16.7秒），没有进入表单，未提交新码。依限定停止全部额外重试。当前记录为环境钥匙串门禁，不认定产品双端功能失败。R2-R5未覆盖，需环境授权窗口恢复后续验收。

## 改用单 Desktop 与协议辅助的独立路线（进行中）

双Desktop R2保持未覆盖；重新界定R2仅检查主端后台会话提示，R3完整退出后由协议客户端批准、重开UI恢复，R4主UI+CLI drain，R5主UI撤销+协议辅助完成。协议辅助不作为双桌面通过证据。

主UI新建最终Host会话，选P4 Final Host、远端workspace/test，发送P4_TOOL。真实显示等待审批、Bash命令、拒绝/运行按钮。切到本机会话后，远端侧栏黄色状态与AX等待审批仍在；截图“后台远端会话审批提示证据”，代表侧栏提示通过，未声称额外全局提示。

返回远端会话时，侧栏仍等待审批、停止Agent，但审批按钮与工具块消失，消息区只显示P4_TOOL及空回复时间。AX“待审批远端任务时完整退出主应用”记录此异常。已交回主线程判断Session重开审批投影，不扩大猜测。随后按授权执行CmdQ完整退出主App，待独立协议辅助批准和主线程重启；R3尚未结束。

## R3 完成与审批回访 Bug 定向复现

主线程使用独立协议客户端 /tmp/p4-assist-approve.mjs，在主App完整退出期间批准隔离Host唯一待审批任务。运行时辅助结果：task4a8039e4-8b76-47db-a48d-26c58476626b/run8d3cbfed完成。主线程重开原主App session93776，原data/cert保留。

真实CU核验：重开自动进入原最终Host会话，显示P4_TOOL、2个工具结果、Edited1file/result.txt，侧栏空闲；设置中52060已连接，未手动重连。R3按修改后“单Desktop退出恢复+协议辅助批准”范围通过；第二Desktop批准分支仍未覆盖，不能称双桌面通过。

审批回访Bug再次复现：
1. 原最终Host同会话输入P4_TOOL，真实出现等待审批、拒绝/运行按钮。
2. 点击任一本机会话。
3. 点击回原最终Host会话。
实际：审批工具块和拒绝/运行按钮消失；侧栏仍等待审批，停止Agent按钮仍在；消息区显示第二个P4_TOOL及空回复时间。预期回访仍可对当前待审批任务做决定。
证据：截图“复现远端审批按钮回访消失”，以及发送前后AX。此问题已经两次真实复现，已及时交回主线程，按指令暂停。

最新状态：R1通过；R2后台侧栏提示代表检查通过、双Desktop审批同步未覆盖；R3修改后单Desktop+协议辅助通过；R4/R5未覆盖。主App与最终Host保持运行，第二个P4_TOOL保留待审批现场，未drain或撤销设备。
