# Chat 控件与附件错误修复 — 执行摘要

- 状态：实现完成；真实 Electron 已通过已观察的控件隔离、UTF-8 中文错误、键盘移除与草稿重发、重启继续对话。完整附件/主题矩阵未全覆盖。
- 计划：用户已批准的两项局部修复；执行过程见 [execution-process.md](execution-process.md)。
- 代码：Chat 形态屏蔽开发入口；附件错误使用可序列化的发送前拒绝结果，不把校验失败写成运行失败。
- 已通过：8 个定向测试文件、76 项测试；Desktop typecheck；Renderer/Electron build；主题检查。
- 当前 UI 初验：Chat 顶栏/输入框没有工作区、分支、运行位置、Review；右栏菜单与启动器仅显示 Context 和可视化回复；Agent 原入口存在。
- 2026-09-25 晚间续验：中文错误保留正文和附件，Shift+Tab/Space 移除后清错并重发成功；浅/深色与半屏 Chat/Context 已观察。鼠标移除、其余错误码及全主题全组件矩阵仍未完全覆盖。完整证据见 [分组验收摘要](../20260925-permission-chat-batch-acceptance/execution-summary.md)。
- 未改动：权限判定、附件格式和大小限制、工作区归档关系、会话工具集。未提交或推送。
