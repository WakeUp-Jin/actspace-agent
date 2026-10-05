# P2 Computer Use 验收与暂停记录

日期：2026-10-03。验收执行者：GPT-6.1 Sol。状态：首轮锁屏暂停后，用户手动解锁并授权补验；补验已收尾暂停。仍有附件结果/引用未覆盖，不作为 P2 完成声明。

本轮仅操作独立测试 Electron 和测试夹具、只读 Journal/日志并写验收文档；没有修改源码、测试、依赖，没有提交或 push。既有 dirty tree 保留。

## 范围与环境

依据：`phase-2.md`、`agent-task-run-lifecycle.md`、`FRONTEND_VERIFICATION.md`。真实 Electron 主进程已完整重启，runtimeInstanceId 为 `7ef6ce89-f00b-43d6-a966-acb84cbba89e`；开发应用 `Actspace Dev actspace-agent-2067`，bundle ID `com.actspace.desktop.dev.w2067fa05`，renderer `127.0.0.1:5173`。

- 独立数据：`/tmp/actspace-p2-electron-data`。
- 本地 HTTP SSE 模型夹具：`/tmp/actspace-p2-model.py`，`127.0.0.1:18763`，假凭据。没有真实 Provider 调用。
- 主测试 Session：`e4cd4fff-2175-470a-81f8-4fd14e7c4568`。
- 审批尝试 Session：`4e1e606e-41ca-4758-87e9-a1bb30d88d30`。
- Journal：上述数据目录的 `sessions-v2/<sessionId>/journal.jsonl`。
- dev 日志：`/tmp/actspace-p2-dev2.log`；dev session `66529`，fixture session `49270`。

本地夹具结果只证明真实 Electron / preload / IPC / Host / Run / 持久队列链路。本轮未验证真实模型服务、Chrome Extension 或发布制品。没有颜色修改，未扩展主题视觉验收。

## 验收点与操作分组

先确定覆盖范围：

- U1：同会话 Plan→Agent；运行中禁止切模式；暂停队列可改模式后继续。
- U2：排队；上移；编辑撤回旧 Task 并回填；重新发送生成新 Task；删除待发 Task；暂停阻止自动开始；继续按顺序执行。
- U3：指定当前 Run；撤回仍是同 Task；实际安全点消费；结束前未读恢复普通队列；停止后保持暂停。
- U4：后台会话运行/输入状态；窗口重载保存队列；轨迹切换草稿；Host 自动下一 Run 的实时 UI 状态。
- U5：审批等待；允许一次非敏感测试命令后恢复；停止当前 Run 并暂停后续队列。
- U6：历史与结果可读；恢复不自动重放；附件与引用留存/结果可读。

操作按场景组合：

1. 原会话暂停队列：复用乙→甲顺序，编辑甲、重发、继续，核对两个 Run 与结果。覆盖 U1 的既有模式证据及 U2；保留 AX 与 Journal 序号。
2. 原会话等待 Run：加入补充甲、指定、撤回、再指定、停止；进入轨迹再返回并重载；删除待发补充甲。覆盖 U2/U3/U4/U5/U6 的相关子项；保留停止前后 AX、Journal 和日志。
3. 新会话审批：提交审批测试，再计划切回原会话检查后台更新、进入附件/引用入口。覆盖 U4/U5/U6；此路线在后台切换动作被 Mac 锁屏阻断，后续停止。

## 逐点结果

“通过”只用于真实 UI 已观察的具体子项。Journal 和自动化仅为辅助；一个子项通过不代表整个 U 类别通过。

| 子项 | 结果 | 真实 UI 证据与限制 |
| --- | --- | --- |
| U1.1 同会话 Plan→Agent | 通过（前序接续证据） | 前序真实 UI 已切 Plan 完成后切 Agent；本轮窗口仍能读到两轮历史。Journal seq16 配置 `plan`，seq30 配置 `agent`。本轮没有重复操作模式菜单。 |
| U1.2 运行中禁切模式 | 通过（前序接续证据） | 前序真实 UI 已观察运行中模式选项 disabled；本轮没有重复菜单检查。 |
| U1.3 暂停队列改模式后继续 | 未覆盖 | 本轮复用了已处于 Agent 模式的暂停队列继续，未更改模式；收尾前锁屏阻断。 |
| U2.1 运行中排队 | 通过 | 输入“补充插入甲”并 Enter 后 AX 显示 `1 条排队 / 当前运行结束后依次发送`。 |
| U2.2 上移顺序 | 通过（含前序动作） | 本轮初始 AX 为乙→甲；前序新 main 点击乙上移。Journal seq44 `move`，beforeTaskId 指向旧甲。继续后 UI 历史乙在甲前。 |
| U2.3 编辑回填与旧 Task 取消 | 通过 | 点击甲的编辑，AX 从2条变1条，输入框 Value=`排队甲`；Journal seq45 取消 `93556516-caf8-4904-bb60-51877e05b2ac`。 |
| U2.4 重新发送生成新 Task | 通过 | 点击发送后仍暂停，AX恢复2条；seq46新Task `58d269d9-a076-4692-a73f-f382fce3783d`，未修改旧已接纳内容。 |
| U2.5 暂停/继续与顺序推进 | 通过 | 暂停期间重发没有解除暂停；点击继续后先乙运行，随后甲结果可读。seq47 resume、48/59乙start/finish、60/71甲start/finish。新 main 的自动下一 Run 可进入且 UI 最终空闲。 |
| U2.6 删除未领取输入 | 通过 | 重载后点击删除补充甲并进入新会话；seq89取消 `e64c1a10-3794-48f5-8b09-701a5c3a059c`，没有此Task的claim/start。 |
| U3.1 指定当前 Run | 通过 | 点击插入后 AX `1 条已插入 / 补充插入甲 下一步读取 / 撤回`；seq81指定当前Run。 |
| U3.2 撤回保留同 Task | 通过 | 点击撤回后 AX恢复 `1 条排队` 与插入/删除按钮；seq82同taskId，runId=null；再次指定seq83仍同Task。 |
| U3.3 实际安全点消费 | 未覆盖 | 等待夹具保持当前模型请求，以便操作；指定输入尚未被读取就停止。没有用自动化替代真实消费。 |
| U3.4 结束前未读归回普通队列 | 通过（重载后） | 停止后窗口重载，AX显示同内容 `1 条排队 / 已暂停`、插入指定标识消失；该Task没有claim。未重载时最初快照仍显示下一步读取，未单独确认最终即时归队刷新。 |
| U4.1 窗口重载保存队列 | 通过 | Cmd+R后再取完整AX：历史可读，补充甲1条普通排队且暂停，输入框空，侧栏空闲。 |
| U4.2 后台会话运行/输入恢复 | 未覆盖（尝试阻断） | 新会话提交审批测试后点击原会话，CUA返回Mac已锁屏，无法确认切换成功或后台UI更新。 |
| U4.3 轨迹切换草稿保留 | 未覆盖 | 实际切换轨迹并返回，但输入框当时无草稿；不能声称草稿场景通过。 |
| U4.4 停止/自动下一Run实时队列状态 | 部分通过 | 自动继续乙→甲及停止显示已暂停均通过；取消Run侧栏暂态失败为CU-B01线索；未读归队最终即时通知未单独确认。 |
| U5.1 审批等待与一次允许 | 未覆盖（尝试无效） | 已真实UI提交“审批测试”，但未见审批卡片。只读Journal发现fixture缺少bash必填intent，准备阶段INVALID_ARGUMENTS，未到审批；没有批准任何权限。 |
| U5.2 停止当前 Run / 后续暂停 | 通过，伴随CU-B01 | 点击停止后AX显示已暂停，停止按钮disabled。seq84 pause、88 finish cancelled；重载后后续Task仍未执行。 |
| U6.1 历史与普通结果可读 | 通过 | 真实窗口读到Plan/Agent历史和乙/甲响应；截图显示乙→甲结果，重载后仍可读。 |
| U6.2 恢复不自动执行/重放 | 通过（本场景） | 主进程前序重启后暂停恢复；本轮窗口重载后仍暂停，不生成新Run；已领取等待任务保持Stopped。仅覆盖本轮测试数据，不推及所有崩溃边界。 |
| U6.3 附件/引用与结果可读 | 未覆盖 | 已列入第三路线，尚未进入附件/引用入口时Mac锁屏；未通过真实UI建立附件Task。 |

以上表格保留首轮结果；补验后的最终覆盖状态以文末“解锁后补验”表为准。

## 关键证据摘录

AX 原生索引会随刷新变化，以下只记录文本和场景，不作为可复用选择器。截图保留在本轮 Computer Use 工具结果中；没有另存截图文件。

- E01 初始：`2 条排队 / 已暂停 / 继续发送`，乙在甲前。
- E02 编辑后：`1 条排队 / 已暂停`，输入框 `排队甲`。
- E03 继续：侧栏运行中，乙进入消息历史，剩余甲显示普通队列；后续截图显示乙、甲各有“P2 本地测试响应。”；完整AX侧栏空闲。
- E04 指定：`1 条已插入 / 补充插入甲 下一步读取 / 撤回`；撤回后恢复普通队列；seq80–83均为同taskId。
- E05 停止即时：`已暂停 / 继续发送`，停止按钮disabled；此时尚在收尾，仍显示已插入。
- E06 后续轨迹：侧栏“会话状态：失败”；返回对话显示“Stopped”。重载后的下一份完整AX侧栏空闲、普通队列暂停。
- E07 阻断：CUA返回 `The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing.` 不再操作UI。

Journal 支持是持久化事实，不等于UI证据：主Session seq45/46编辑旧取消新接纳；seq47–71两个串行Run；seq80–83指定/撤回同Task；seq84暂停、88 cancelled；seq89删除。审批Session seq12为 `INVALID_ARGUMENTS`，字段 `$/intent`，seq21 Run completed。没有执行 `printf p2-acceptance`。

## Bug / 待确认线索

### CU-B01 — 停止取消经 IPC 异常路径，侧栏暂态显示失败

- 最新状态（2026-10-03 修复后）：正常取消场景已通过真实 Electron UI 复验；不重载最终 Stopped、侧栏空闲、普通队列暂停，Journal structured aborted，原 IPC 错误未出现。详见[修复后 Computer Use 复验](phase-2-fix-computer-use-acceptance.md)。以下保留修复前复现事实，不表示当前仍未修复。

- 优先级：P2（待Astra确认及修复，不作为数据损坏）。分类：真实产品线索；UI现象及IPC错误已观察，最终语义/影响待确认。
- 复现：新main原Session启动“等待：插入停止验收”；加入并指定补充甲；点击停止；进入轨迹；返回对话/重载观察。
- 预期：用户停止形成可区分的取消状态；主请求收尾不将正常取消当作异常失败；未读Task保留且暂停。
- 实际：Journal Run outcome=`cancelled`, result=null；dev日志run-agent handler报 `Task fbc3088f-c3cb-44a9-9794-6ef06658324c ended without a Loop result: cancelled`，栈在`ManagedRuns.run`。轨迹时侧栏标失败，消息显示Stopped；重载后侧栏又空闲。队列暂停与持久化符合预期。
- 证据：E05/E06；主Session seq84/88；`/tmp/actspace-p2-dev2.log`最后的run-agent错误。不能用第一次停止快照判断最终归队已刷新；重载后的归队已实际确认。
- 修复建议：审阅取消Run的返回契约、ManagedRuns对result=null的处理、renderer完成/错误状态映射；补正常停止和延迟收尾UI回归。仅建议，未改实现。

没有确认第二个产品Bug。前序无heartbeat夹具约5分钟超时属于夹具因素，不归产品Bug；旧主进程与renderer热更新不同步的观察不能当新main缺陷。

## 限制与交接

审批fixture缺少bash必填intent，是测试输入问题；未改fixture源码、未更改安全模式/扩大grant。Mac锁屏是外部阻断，按用户要求收尾暂停，不等待解锁。

待后续补验：U1.3暂停改模式；U3.3实际消费；U3.4未读归队即时刷新；U4.2后台输入/运行恢复；U4.3轨迹草稿；U5.1有效审批等待/一次允许/恢复；U6.3附件/引用；真实Provider独立门禁。自动化通过项不能填入这些UI空缺。

收尾保持dev和fixture进程，不重启、不修复。主Session已停止，待发补充甲已取消；审批尝试Session的Journal已完成（UI最终结果未观察）。`/tmp/actspace-p2-release`不存在。构建TS2345和Desktop全量未解决项由[暂停交接](execution-summary.md)记录，不属于本UI报告的产品Bug结论。

## 解锁后补验（2026-10-03）

用户手动解锁并明确继续验收。保留首轮记录，以下新增证据没有回填成首轮已通过。dev与Electron仍是同一进程/runtime。唯一临时模型夹具补了bash必填`intent`（只读核对`packages/tools/shell-tools/src/plugin.ts`的schema），并将固定tool callId改为每请求UUID，以避免历史callId冲突；只重启fixture，最终session为`26529`。没有修改产品源码、测试、依赖或安全模式/grant。

补验路线：先有效审批与后台/草稿往返，再暂停改Plan继续与安全点消费，最后停止未读输入的即时归队、原生文件选择及PNG接纳。不追加主题或配置验收。

| 补验子项 | 最终结果 | 新增真实UI与持久证据 |
| --- | --- | --- |
| U1.3 暂停改模式后继续 | 通过 | 主Session暂停提交“暂停队列改Plan验收”，菜单Plan可选，选Plan后继续；UI显示Plan标记及响应。seq90接纳、93 start配置plan、104 completed。 |
| U3.3 实际安全点消费 | 通过 | “等待：实际插入消费”运行中将“实际消费补充甲”指定，释放本地SSE等待后后台运行结束；回切UI两条输入/响应可读。seq114 designate和118 claim相同taskId `c7f0f34b-a5a4-46f5-b8ab-6390a82fdc9e`、相同Run；seq127 completed steps2，没有新建第二Run。 |
| U3.4 未读归队最终即时刷新 | 通过 | 新等待Run指定“未读归队补充乙”后停止，首快照仍处收尾；不重载打开plus的下一AX已为Stopped、1条普通排队、已暂停，撤回标记消失。seq149 accept、150 designate、151 pause、155 cancelled；Task `ee9b5ae0-574e-4c11-bb41-d9e8770d0d89`无claim。没有CU-B02。 |
| U4.2 后台状态/输入恢复 | 通过（本场景） | 有效审批运行后切原会话，后台侧栏等待审批；原会话草稿在切回审批再回原会话后保留；批准后后台侧栏空闲。安全点消费也在后台完成，回切后结果可读。不推及所有后台延迟stop竞态。 |
| U4.3 轨迹草稿 | 通过 | 原会话填“P2 轨迹切换草稿”，进入轨迹再返回，AX Value完整保留；随后跨会话回切仍保留，没有发送。 |
| U4.4 停止实时状态 | 通过队列刷新，CU-B01仍在 | 终态后真实UI普通队列与暂停符合Host事实，但侧栏仍标失败且消息Stopped；不重载得到最终证据。 |
| U5.1 有效审批/一次允许/恢复 | 通过 | 新Session `38cbc6ee-9628-406c-ad42-6b4858538e7d`显示intent、`printf p2-acceptance`、拒绝/运行；只点一次运行，没有宽泛grant；后台空闲后回切显示结果响应。seq15 tool/result completed exit0 sandboxed=true输出p2-acceptance；seq24 Run completed。 |
| U6.3a 图片选取/Task接纳 | 通过 | 原生文件选择器选本轮`/tmp/actspace-p2-attachment.png`；提交后UI暂停队列第二项“P2 图片附件验收 1 个文件”。seq156 accept的original只有PNG、prepared保存image/png artifact `20820614-d8e7-40fe-8958-8a005ff666eb`。 |
| U6.3b 附件执行结果/预览、文件引用 | 未覆盖 | PNG任务留在暂停队列，没有启动/结果，不能宣称完整附件链通过；未进入独立文件引用入口。 |

补验证据：

- E08 后台侧栏等待审批，回切卡片显示用途、命令和两个审批按钮；批准一次后响应可读。
- E09 轨迹往返及跨会话回切后的输入框Value=`P2 轨迹切换草稿`。
- E10 暂停队列Plan继续及安全点消费后的两条结果。
- E11 不重载停止最终AX：Stopped、侧栏失败、1条排队/已暂停、普通删除/更多按钮。
- E12 PNG提交后AX：2条排队/已暂停，第二项带1个文件；seq156只接纳1个PNG。

CU-B01再次复现：等待“即时归队二”的Task `9d1d0402-f408-4510-9b80-a4dcf9f155b9`、Run `agent-run-1791021308640-6`取消；seq155 outcome=cancelled/result=null，dev日志再次报`ended without a Loop result: cancelled`，最终侧栏失败、消息Stopped。优先级P2，产品现象可复现，具体取消返回语义及修复由Astra确认。未发现CU-B02或第二个确认产品Bug。

夹具/工具限制不归产品Bug：复用旧审批Session曾因固定p2-bash ID重复失败，改UUID后新Session有效通过；首次“即时归队”测试忘记复位release已正常结束，复位后另建稳定等待完成真正复验；原生paste读剪贴板timeout，改AX setValue成功；曾通过图片入口选择txt，仅作入口尝试并移除，最终Task只含合法PNG。没有用这些因素宣称产品失败。

最终停止点：原Session2条待处理输入均暂停（未读补充乙、PNG任务），无活跃Run；Plan模式保留。审批成功Session空闲；旧审批失败Session作为fixture错误历史保留。dev session66529、fixture session26529均保留，release文件不存在。剩余UI门禁为附件运行结果/预览与文件引用；真实Provider、Chrome、制品等外部门禁保持未验证。仅验收Markdown更新，未提交/push。
