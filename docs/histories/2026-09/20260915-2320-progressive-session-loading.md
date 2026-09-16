# 会话与长历史按需加载

用户希望启动时先显示会话摘要，每个文件夹十条、点击 Show more 再取下一页；只有选中会话才读取消息，长会话十回合分页，轨迹点击后加载。

已实现 Runtime 派生浏览索引、摘要/消息/大工具详情分页 IPC、Sidebar 真分页、消息加载/重试/锚点保持、切换响应隔离和近期页面缓存、轨迹按需。保留完整 Journal 给恢复、模型、导出和完整复制；批量归档先读取完整摘要。

主要文件：Runtime session-browse-index/session-controller，Desktop App service，shared IPC/projection，Desktop fixed-renderer-ipc/session-projection，App/Sidebar/ConversationView/TrajectoryView/desktop-session-bridge。

验证：Runtime 浏览专项最终 5 项通过；Desktop focused 103 项通过、2 个既有断言未通过；早期依赖构建、Renderer/Electron 构建和 typecheck 通过。最终 typecheck 被同时进行的子 Agent 改动阻塞，详情见[执行摘要](../../exec-runs/20260915-progressive-session-loading/execution-summary.md)。真实隔离 Electron 已观察首屏，后续分页点击/轨迹与大规模真实数据仍需验收。

学习记录：[分页要限制哪一层的工作量](../../learnings/2026-09/20260915-real-pagination.md)。未提交或推送。
