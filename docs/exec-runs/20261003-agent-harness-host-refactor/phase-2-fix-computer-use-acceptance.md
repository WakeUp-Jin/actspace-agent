# P2 修复后 Computer Use 复验

日期：2026-10-03。执行模型：GPT-6.1 Sol。范围仅为真实 Electron UI 复验与文档；本执行者没有修改产品源码、测试、依赖，没有提交或 push。测试夹具与真实 Provider 验证明确分开。

## 验收点与操作分组

- F1：稳定等待 Run 中加入补充并指定，然后停止；无需重载，最终消息为 Stopped、会话非失败、普通队列已暂停；Journal 取消结果为结构化 aborted，主进程无原 IPC 错误。
- F2：暂停普通队列点击继续，后续 Task 正常执行，结果在 UI 可读。
- F3：上轮已接纳 PNG 的执行、历史图片预览与结果可读；分别报告原 Task 与含图历史后续请求，不能互相替代。
- F4：纯测试文件选取、引用提交及结果可读；预览文件不能替代引用提交。

路线一：原会话两条暂停任务继续，覆盖 F2 及 F3 原 PNG 执行/历史预览；保留响应、预览 AX 与 Journal。路线二：同会话建立 heartbeat 等待，加入补充、指定、停止，覆盖 F1；保留中间指定事实、不重载最终 UI 与 Run 结果。随后继续归队补充，复查 F2 及含图片历史的请求。路线三：右侧工作区文件打开 gitignored tmp 纯测试文件，有限检查 F4；保留文件预览 AX/截图。没有重复旧 U1–U6 或扩展主题验收。

## 环境与证据边界

- 完整重启后的 Runtime：`eaa5bfec-3793-4146-adf8-5b2549a76d3b`，2026-10-03 18:27:57 启动；dev session `7245`，日志 `/tmp/actspace-p2-fix-dev.log`。
- Electron bundle：`com.actspace.desktop.dev.w2067fa05`；renderer `127.0.0.1:5173`；独立数据目录 `/tmp/actspace-p2-electron-data`。
- 主 Session：`e4cd4fff-2175-470a-81f8-4fd14e7c4568`，Plan 模式。Journal：`/tmp/actspace-p2-electron-data/sessions-v2/e4cd4fff-2175-470a-81f8-4fd14e7c4568/journal.jsonl`。
- 使用本机 HTTP SSE 模型夹具 `127.0.0.1:18763`、假凭据，没有真实 Provider 调用。夹具已含 bash intent 与每请求 UUID；本轮主线程补齐 `/files` multipart API 并重启夹具，当前监听 PID `25498`。
- 先前 PNG 和首次等待 Run 的 `fetch failed` 来自夹具不支持图片上传 `/files`，不是产品 Bug。修正后同一会话含图片历史的请求可完成。
- UI 唯一使用 CUA；AX 调用约 60 秒，动作后的首 AX 有时仍是中间状态。本轮同时保留截图及之后 fresh AX，不将首快照当终态。截图在 CUA 工具输出中，未保存独立本地图片文件；下方记录足够定位观察。

## 逐点结果

| 验收子项 | 结果 | 真实 UI 证据与辅助持久证据 |
| --- | --- | --- |
| F1.1 稳定等待与指定补充 | 通过 | UI sidebar 运行中、Plan disabled、停止可用；“修复取消未读补充”加入队列并点击插入。seq197 start，204 accept，205 designate；Run `f0a15d7f-a80d-4010-b982-045a031744f5`。 |
| F1.2 停止后不重载最终状态 | 通过 | 点击停止后截图显示 1 条普通排队/已暂停；后续 fresh AX sidebar 空闲、消息 Stopped、普通删除/更多和继续发送，已插入/撤回消失。全程没有 reload。 |
| F1.3 取消结构化结果与错误消失 | 通过（UI + Journal/日志辅助） | seq206 pause；207 assistant finishReason aborted；208 step/end aborted；209 turn/end aborted；210 finish outcome cancelled，result.reason aborted、steps1、finalText空。该区间无 agent/error，整个新main日志 `ended without a Loop result` 出现0次。 |
| F2 暂停普通队列继续 | 通过 | 初始未读补充乙恢复后 UI 返回 P2 本地测试响应；取消复验归队补充继续后亦返回响应、sidebar 空闲。seq170及223 completed；后者 Run `1b427470-1bdf-4d58-b702-3792b36dc2d4`。 |
| F3.1 原 PNG Task 执行结果 | 未覆盖成功结果（夹具阻断） | 原 Task `bd13b4c5-5fbb-4be0-9565-3fa6465279ad`已由 UI 继续并启动，seq171/172；seq180 network fetch failed、181 failed，原 PNG 消息显示 Worked。原因已确认是夹具缺 `/files`。没有实际通过 UI 重试该原 Task，不将后续结果改写为原 Task 成功。 |
| F3.2 历史 PNG 预览可打开 | 通过（本图片） | 点击 Preview message image actspace-p2-attachment.png 后，AX 右侧 selected PNG tab + 图像“预览图片”；1px 测试 PNG 不用于检验复杂图像内容。 |
| F3.3 含图历史后续请求/结果可读 | 通过（补充证据） | 修正夹具后继续归队补充，UI 响应可读；seq218 request/context 保留 PNG image block，seq223 completed。证明含图片历史可上传并正常返回，不代替原 PNG Task 重试或真实模型图像理解。 |
| F4.1 纯测试文件选取/预览 | 通过 | 右侧新建对象→工作区文件→过滤→tmp→actspace-p2-file-reference.txt，AX/截图显示完整文字“P2 file reference acceptance fixture. No personal data.”。 |
| F4.2 文件引用提交/结果可读 | 未覆盖 | 文件预览路线没有明确引用提交控件；未把打开预览、普通文字路径或源码字段当引用成功。限定探索后停止。 |

结果共 9 个子项：7 通过、2 未覆盖成功链路，0 个本轮确认产品失败。F3 原任务确实发生环境失败，其成功结果仍需复验；F4 引用提交仍需独立覆盖。

## 关键观察记录

- FX-E01：停止前 full AX：sidebar 运行中、Plan disabled、停止 Agent；队列“修复取消未读补充”与插入按钮。Journal seq204–205支持该输入被指定。
- FX-E02：停止调用截图：普通 1 条排队、已暂停、继续发送，补充仍在队列；首 AX 同调用仍处 disabled stop/已插入收尾，不能据它判断最终缺陷。
- FX-E03：后续 fresh AX，未重载：sidebar 会话状态空闲；最新等待消息 Stopped；1 条排队、已暂停、继续发送；补充仅普通删除/更多，无撤回。seq210 已持久化结构化取消。
- FX-E04：继续后 AX sidebar 空闲，新补充下显示 P2 本地测试响应；seq220响应、223 completed，218含图片历史。
- FX-E05：右侧 PNG tab 与图像预览 AX；随后工作区文件截图显示测试文件的完整内容与路径 `tmp/actspace-p2-file-reference.txt`。

## CU-B01 与收尾

CU-B01 在本轮指定输入后主动取消场景中已通过真实 UI 复验：正常取消没有走原 IPC 异常路径，最终 sidebar 空闲且 Stopped，队列即时归为普通暂停。此结论仅覆盖本次正常取消；checkpoint 持久化失败等异常分支的自动化由主线程单独记录，不冒充 UI 已覆盖。

没有新增确认产品 Bug。F3 原 PNG Task 成功重试、F4 引用提交/结果及真实 Provider 验证仍有剩余范围。验收到此停止，不进行产品修复。

保持 dev 与本地夹具运行；主会话空闲、当前无待发任务，Plan 模式；右侧保留 PNG/测试文件预览。`/tmp/actspace-p2-release`不存在。纯测试引用文件保留在 gitignored tmp，便于后续接续。
