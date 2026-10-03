# P2 最终 Computer Use 补验

2026-10-03，执行模型 GPT-6.1 Sol。本报告新增本地夹具真实 Electron 证据，不改写前两份报告的历史结果。只验收、只读源码/Journal/日志、写文档；没有修改产品源码、测试、依赖、summary或plan，没有提交/push。

## 验收点与操作路线

- G1：新 PNG 选取、提交、运行完成；历史附件/响应可读、预览可打开。
- G2：文件引用入口与完整提交结果；如果当前无产品入口，保留源码证据；另验明确支持的回复选区批注引用，区分两种内容。
- G3：运行中 `/compact` 排队、停止后暂停、继续完成与结果可读。
- G4：最终主进程重启后，停止等待 Run 与普通后续消息的简短回归（后续追加）。

路线一复用主会话：添加 PNG→提交→结果/预览→选择最新回复→添加到对话→填写测试批注→提交→结果及已发送批注内容。路线二建立 heartbeat 等待 Run→输入 `/compact`→停止→检查暂停→继续→压缩完成。源码先确认入口，静态证据不替代 UI。关键状态保留 CUA AX/截图，Journal仅辅助校验持久事实。

## 环境

Electron bundle `com.actspace.desktop.dev.w2067fa05`，renderer `127.0.0.1:5173`；独立数据 `/tmp/actspace-p2-electron-data`，主 Session `e4cd4fff-2175-470a-81f8-4fd14e7c4568`，Plan 模式。本轮前三项使用 Runtime `eaa5bfec-3793-4146-adf8-5b2549a76d3b`，dev session7245；日志 `/tmp/actspace-p2-fix-dev.log`。本机 SSE夹具 `127.0.0.1:18763`，PID25498/session54356，已支持Files API、审批intent和UUID。不读取真实凭据、不调用真实Provider、不修改权限模式/grant。

测试 PNG `/tmp/actspace-p2-attachment.png` 为67字节1px图片；不以此证明真实模型图像理解。`/compact`摘要夹具因历史包含“等待”触发heartbeat，本轮仅创建唯一release控制文件放行，结束后删除；未改fixture源码。摘要为固定测试文字，链路完成不证明摘要质量。

## 按点结果

| 子项 | 结果 | 真实UI及辅助证据 |
| --- | --- | --- |
| G1.1 新 PNG 选取/接纳/提交 | 通过 | plus图片→原生选择器选合法PNG，Composer显示已附加图片，提交“P2 新PNG完成验收”；seq224 accept，original有1PNG无其他引用，prepared artifact `19d4a7ce-99d3-4675-9d0b-6824840df5ed`。 |
| G1.2 新图片 Task 完成及响应可读 | 通过 | 真实截图及AX显示新PNG消息/附件和“P2 本地测试响应。”，sidebar空闲；Task `25cc0c2c-a9e6-4562-9434-40a939c6a857`，Run `agent-run-1791026126865-1`，seq225/226 start/claim，236 completed。 |
| G1.3 历史新PNG预览 | 通过 | 点击新消息 Preview image；右侧selected PNG tab、图像“预览图片”。仅此测试图片；旧Task的环境失败仍保留历史，不声称旧Task成功重试。 |
| G2.1 文件引用选择入口与提交 | 未覆盖UI；当前无生成入口 | 详见源码依据。主线程认可后端IPC专项作为兼容证据，但不能填为真实UI通过。前轮测试文件预览通过仍不是FileReference提交。 |
| G2.2 回复选区批注引用建立 | 通过 | 最新回复拖选“2 本地测试响应”→回复选区菜单“添加到对话”→1条批注→填评论“P2 引用批注验收评论”→保存。 |
| G2.3 批注引用提交/结果/原文评论可读 | 通过 | 提交“P2 回复批注引用提交验收”，新响应可读、sidebar空闲；打开历史1条批注面板显示选中文本和评论。seq237 original responseAnnotations保存源 `v2-233`、offset1–9、选区/评论，prepared为response-excerpt；seq249 completed。 |
| G3.1 运行中compact入队 | 通过 | “等待：compact队列兼容验收”运行中输入/compact，AX 1条排队、当前运行结束后依次发送、/compact命令，没有插入入口；seq258 accept Task `4426e142-d515-464f-967a-121ca384fb45`。 |
| G3.2 停止后compact仍暂停 | 通过 | 点击停止后截图/AX Stopped、sidebar空闲、1条排队已暂停/继续发送；seq259pause、263cancelled/structuredaborted，compact当时没有operation-start。 |
| G3.3 继续compact完成/结果可读 | 通过 | 点击继续后队列消失；放行夹具后截图/AX“上下文已压缩·30条消息·2m9s”，sidebar空闲，无reload。seq264resume、265operation-start，266–269压缩事务，270operation-finish completed。摘要是固定测试文字。 |

前三类共9子项：8通过、1项无当前UI入口而未覆盖；0个新增确认产品Bug。文件引用提交与批注引用明确分开，后者不是前者的替代通过。

## 文件引用不可达的源码依据（只读）

- `apps/desktop/src/renderer/components/Composer.tsx:89/115`仅声明可携带FileReference；`createSendOptions` 1101–1117实际只创建模型/模式/skills与图片、responseAnnotations，没有fileReferences state/选择或赋值。对renderer的FileReference/fileReferences全量rg结果仅声明、队列/拒绝恢复/发送透传，未发现生成路径。
- `apps/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`负责文件树与打开预览；当前测试文件预览只见外部应用等动作，无引用提交。没有用普通路径文本或@文本冒充结构化FileReference。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts:886–907`验证文件引用、937生成fileReferenceBlocks，说明后端契约存在；它不提供UI选取入口。
- 真正可达的批注入口为 `components/messages/ResponseSelectionMenu.tsx`：同一assistant回复选区→添加到对话；`ResponseAnnotationCommentPopover.tsx`保存评论；Composer把responseAnnotations加入发送参数。本轮用这条真实路径完整提交。

## 关键观察与工具限制

截图保留在CUA工具输出，未另存本地图片文件。FU-E01新PNG历史+响应截图；FU-E02新PNG预览AX；FU-E03选区菜单、1条批注与评论输入AX；FU-E04已发送批注面板选中文本/评论与结果AX；FU-E05compact停止后暂停截图；FU-E06上下文已压缩截图。

原生选择器关闭后批量最后的滚动动作曾返回AX invalidUIElement，前面的提交已成功；后续fresh AX/截图及Journal确认，只提交一次。首次拖选用展示缩放后的坐标误选跨消息，无引用被提交；核对原生截图2880×1712后使用正确尺度，成功选择单回复。上述是Computer Use工具因素，不算产品Bug。

## 最终重启回归

最终Runtime `0902f73b-567b-4af0-8fb4-907a819cd299`，dev session `17050`，日志 `/tmp/actspace-p2-final-dev-2.log`。主线程完整重启；先前强制退出后的writer lock自然过期后再次启动，没有删锁。最终日志 `SESSION_WRITER_LOCKED` 和 `ended without a Loop result` 均0次。

| 子项 | 结果 | 真实UI及辅助证据 |
| --- | --- | --- |
| G4.1 最终新进程等待→停止→暂停 | 通过 | 新Run有效等待，sidebar运行中、Plan disabled、停止可用；加入普通后续后点击fresh停止，未reload最终消息Stopped、sidebar空闲、普通1条排队已暂停/继续发送。seq271接纳等待，272start Harness generation `ca0e1d80-0646-4ecf-b690-621297de17c9`，279接纳后续，280pause、284cancelled/result.reason aborted。 |
| G4.2 停止后普通队列继续与响应 | 通过 | 点击继续后队列消失，随后fresh AX/截图显示“最终进程普通后续smoke”下P2本地测试响应，sidebar空闲。seq285resume、286start新Run `4fd1f5af-eeea-4c84-9792-954e4844a0c8`、297completed；原Run取消结果没有影响此后续Run。 |

FU-E07最终新进程停止后AX：Stopped、空闲、已暂停；FU-E08最终后续响应截图与AX。首次批量加入后续后点击旧停止索引实际展开摘要，Journal只accept而无pause；刷新索引后正确点击停止，不把错误动作声称为取消成功。CUA应用changed保护曾阻止一次输入，重新绑定后才执行，未生成重复Task。

最终共11子项：10通过、1项因当前FileReference没有UI生成入口而未覆盖；0新增确认产品Bug。后端FileReference兼容测试属于自动化证据；真实Provider图像理解、摘要质量、Chrome/制品等外部验证仍不属于本轮。

验收到此停止。dev17050与fixture54356/PID25498继续运行，主Session空闲、无pending，Plan模式，release文件不存在。没有修改summary/plan或产品，未提交/push。
