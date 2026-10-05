# 清理后真实 Electron Computer Use 验收

2026-10-04，gpt-6.1-sol 子智能体执行。本轮完成；不沿用旧 P5 通过结论。A1/A3/A4/A5/A6通过，A2命名保持通过、未超时竞争子项CU未覆盖。

## 验收点与路线

- A1：本地新会话发送、流式、终态与自动标题。
- A2：首次回复期间手动重命名，后台标题完成后不覆盖。
- A3：队列与插入、取消和停止后继续，不重复执行。
- A4：同会话 Plan 后 Agent，运行中模式限制。
- A5：正常退出重开，设置保持且可继续发送。
- A6：本机 fixture 远端 Host 发送、审批、结果、断线重连。

按本地任务、正常重启、远端路线分组；运行中状态和终态单独观察。截图与 AX 为真实 UI，Provider release/Host 断线控制及日志为辅助，不能代替界面验证。

## 环境

全仓 build 主线程确认 exit0。首次 pnpm dev:log 被测试 Cordis 类型适配阻断，主线程修复后重新通过启动屏障。真实应用 com.actspace.desktop.dev.w2067fa05，ACTSPACE_DATA_DIR=/tmp/actspace-cleanup-cu/desktop-data，仅复制旧隔离 fixture settings/secrets；没有用户真实配置或钥匙串操作。Provider 56870，远端 Host 52270、WSS proxy 52271、控制 56872。证据前缀 /tmp/actspace-cleanup-cu/。Native 观察约61秒，短状态需要受控 hold。

## 逐项结果

| 点 | 结果 | 实际证据与边界 |
| --- | --- | --- |
| A1 | PASS | UI 创建 fresh session，发送 P5_STREAM_HOLD CLEANUP_A1，真实看到用户消息、首段、运行中和停止按钮。Provider release 后看到一份完整回复、空闲、发送恢复和自动标题；a1-terminal.png、a1-terminal-ax.txt。初次发送观察短暂空闲，随后完整 UI 明确运行，不误报异常。 |
| A2 | 部分 PASS / 竞争子项未覆盖 | 首次回复仍在流式时手动改名 Cleanup 手动标题 A2，release 后终态仍保持；a2-a3-terminal.*。但标题请求30秒超时短于native约61秒观察，未证明在标题请求未超时前改名的竞争；该子项仅主线程单测补证。 |
| A3 | PASS | 运行中排队 CLEANUP_A3_QUEUE_ONE→插入，UI 下一步读取；另排 CLEANUP_A3_DELETE 后点击删除，条目消失；release 后插入条目消费、唯一用户/回复、tray清空且空闲。a3-insert.*、a2-a3-terminal.*。另在Plan长流式加入 CLEANUP_A3_AFTER_STOP，Stop后Stopped/空闲/队列已暂停；切回Agent→继续发送，唯一消息及完整回复、tray清空。a3-stopped.*、a3-a4-terminal.*。 |
| A4 | PASS | 同会话选择Plan并发送；运行时移除Plan disabled，/agent菜单无功能模式选项（a4-running.*）；Stop后移除Plan切回Agent，继续队列成功终态（a3-a4-terminal.*）。Plan本轮以停止收尾，不声称自然完成。 |
| A5 | PASS | UI关闭性能面板→正常Cmd+Q→同数据/CA pnpm dev:log构建屏障重开；恢复同会话、手动标题、p5-test、性能面板不显示。再次发送 CLEANUP_A5_REOPEN 唯一回复且空闲（a5-reopened.*）；进入设置明确开关off。 |
| A6 | PASS | UI设置新配对 Cleanup Remote→新建页选Host，确认独立workspace/p5-test；P5_TOOL发送→审批卡→运行→Ran pwd/Write result.txt→完整回复、Edited 1 file→打开真实远端预览 P5 remote result verified.（a6-approval-result.*为中间、a6-result.*为终态/预览）。代理offline后离线、Host未就绪、模型/发送disabled，草稿保留（a6-offline.*）；online自动重连后恢复，点击一次发送草稿，唯一完整回复且空闲（a6-reconnected-terminal.*）。proxy控制为辅助，UI状态真实观察。 |

本轮无已确认产品 Bug。未进行真实付费 Provider、云部署或手机 UI 验收。无产品代码修改、commit、push。

## 收尾

真实 Electron 本地任务、正常退出重开、远端发送/审批/结果/断线重连路线完成。A2的30秒内标题请求竞争没有可靠CU证据，保留未覆盖，不能以源码或单测代替UI通过。截图/AX为临时证据，不保证长期存在；AX有部分diff，关联连续观察理解。一次文件工具卡元素在终态转换后失效，刷新AX使用终态artifact入口成功，不计产品Bug。重连首次观察仍离线，随后peer建立且UI自动恢复，未反复故障注入。

当前隔离应用保留远端完成会话与result.txt预览，代理online，草稿已消费；未操作用户真实数据。
