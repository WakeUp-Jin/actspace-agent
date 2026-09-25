# 审批重载恢复与 Chat fork 写锁修复

状态：已完成，2026-09-26。审批恢复、writer 接管及附件独立副本修复均有实机通过证据。

2026-09-26 已完成续修：用户确认附件采用独立副本方案。审批恢复与纯文本 fork 已实机通过；本轮补齐分叉点前制品复制、结构化引用替换、失败清理及带附件 fork 的实机复验。旧失败子会话保留，不自动改写历史数据。

## 范围与根因

- pending approval 的主进程状态仍在，但 Renderer 重载只恢复侧栏标记，没有恢复卡片与运行身份。
- Desktop fork 直接持有 Store 创建的写句柄；Session Controller 不拥有它，首次发送 resume 重复申请 writer lease。
- 保留现有 Settings、审批卡与 Chat UI 的未提交修改，不扩大到 Grant 管理、URL 重试或压缩验收。

## 实施与门禁

1. 添加加载时已有审批和真实持久化 fork 的回归，先观察失败。
2. 通过现有 pending IPC 恢复运行身份和工具预览；复用流事件更新、终止、停止行为，防止过期查询复活卡片与历史重复。
3. fork 释放临时持久化句柄，再经 Controller resume/flush 接管，保留 preset、lineage、通知与关闭语义。
4. 定向测试、类型检查、文档检查；Computer Use 连续验收 reload→拒绝/停止、Chat fork→首次发送。

## 风险与回滚

仅恢复主进程仍待处理的审批，不把旧 Journal 请求当成新的授权。恢复的 Renderer 状态不执行工具、不自动审批。fork 不删除锁文件、不绕过单 writer；按正常 close/reopen 接管。

执行记录：[过程](../../exec-runs/20260925-approval-reload-chat-fork-fixes/execution-process.md)、[摘要](../../exec-runs/20260925-approval-reload-chat-fork-fixes/execution-summary.md)。

最终验证：持久化 45 项、制品 3 项、writer 回归 1 项通过；Desktop 类型检查、Electron 构建与带附件 fork 连续实机批次通过。完整权限矩阵和长上下文压缩属于原批次未验范围，不随本计划关闭。
