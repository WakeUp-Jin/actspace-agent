# Agent 重构收尾：职责与文档清理

用户希望核心与扩展解耦后继续清除多余适配、理清目录，并退役过时文档；histories和learnings保留。

本批删除Runtime的Headless空转发，ManagedRuns去除重复Session缓存及Loop/Inbox外观，应用操作直连Task/Run服务；自动标题成为desktop-app包内Cordis行为，辅助文本调用独立复用。Runtime源码按startup/session/harness分目录并同步构建、导出、契约和测试。已有Session driver/provider边界保留，不以新增包数替代模块化。

合并Harness/Host最终决定与P1–P5验收索引，退役3份重复历史设计和14份交接/验收轮次，3份旧页保留Git回溯入口。原有813个history/learning文件hash未变；用户其他前端与产品文档WIP未混入。

自动化：typecheck/build、相关85项隔离测试、Desktop隔离全套1008项、CLI/Host/recovery进程、CLI分发产物smoke、事件/包边界/文档门禁通过。原工作区Desktop批注HoverCard存在时序不稳定，保留记录；不冒充全仓默认test一次全绿。Computer Use由gpt-6.1-sol完成A1/A3/A4/A5/A6，A2精确30秒竞争未实际覆盖，单测补证；无确认新Bug。详情见[执行摘要](../../exec-runs/20261004-agent-refactor-cleanup/execution-summary.md)。

本次涉及可迁移的通知时序与插件资源所有权，已记录[学习说明](../../learnings/2026-10/notification-plugin-lifecycle.md)。未提交、未推送；其他功能专题及旧计划尚未逐项审计，不能宣称全仓冗余全部清除。
