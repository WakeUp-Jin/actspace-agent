# P2-D13 右栏验收证据复核

2026-10-23 按原验收点逐项复核已有交互与修后证据，不新增产品要求，不将源码或自动化测试代签真实界面。当前 P2-D13 通过；初始失败及首轮修后失败继续保留。

| 原要求 | 已执行结果与证据 |
| --- | --- |
| 文件树、文本/Markdown/CSV/HTML/图片，源码/预览 | [真实 Electron 工作台](desktop-workbench-20261022.md)逐类打开；Markdown 渲染与源码、CSV 中文表格与原文、HTML sandbox 与源码、PNG 加载均通过。该批为 Electron UI/CDP，非原生 AX。 |
| 刷新、文件失效及重新加载 | 初始删除文件静默保留旧快照为 [BUG-044](bugs/BUG-044.md)。修后第二轮 [R44-1–4 原生报告](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/bug044-native/report.md)全部通过：旧内容有明确提示、显式重读显示不存在、恢复原字节后树重开恢复正文、对照文件不误标。首轮重读正文被旧 Tab 覆盖的失败保留，已补集成回归修复。 |
| Tab 开关、切换、尺寸保持 | 工作台五文件切换/关闭与实际窗口 resize 通过；[RP-3](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/right-panel-remaining-native-20261023/report.md)真实拖动右栏390→500、正常 CmdQ、同 profile 重开仍500，并恢复390。文件 Tab 当前不承诺跨启动恢复，不新增此门槛。R44-4 已关闭本批 Tab 并从树重开。 |
| 系统打开及外链 | [R10 Finder 原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/system-finder-native-20261023/report.md)确认精确目标文件；[S1 原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/native-accessibility-system-20261023/report.md)确认预览 HTTPS 链接进入系统 Chrome，主窗口 URL 与数量不变。只签已执行 Finder 代表，不声称所有外部编辑器均已逐一验证。 |
| 文件与子 Agent/Context/Review/终端隔离 | [子轨迹 E1–E11](../20261021-subagent-trajectory/acceptance-handoff.md)含 Context 跳主轨迹不改变右侧子轨迹；[BUG-023 原生 C23-1](../../../tmp/codex-acceptance/20261022-acceptance-bugfix/c-current-native-20261023/report.md)通过 A/B 文件、独立目标 Tab、Review 与刷新归属；[BUG-031](bugs/BUG-031.md)通过 A/B/A 环境与独立终端 cwd/分支。RP-4 正常重开后聊天、Review、Context 可用，R44-4 完成夹具和界面恢复。 |
| 大文本体验 | [BUG-014](bugs/BUG-014.md)已有修前/修后同样本性能和真实原生浅深/窄窗、复制与实际滚动证据，已关闭。性能总项其他负载仍按原编号保留，不据此签收全部性能。 |

BUG-044 第二轮使用当前 renderer 构建、隔离 profile，原生操作模型为 `gpt-6.1-sol`；文件删除与恢复由主代理受控执行。原68字节 SHA256 为 `8d0cf1ad572d6c21dbf8a7dae41a3c6aa017288f6a6499f4544a112da1f226a0`，恢复时间08:10:11.232 UTC。System 与390px右栏已恢复，本批文件 Tab 已关闭。目录替换、符号链接及临时 IPC 异常是单独自动化回归，未冒称原生覆盖。
