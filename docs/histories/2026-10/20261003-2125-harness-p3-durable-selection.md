# P3：Harness 可替换基础与持久选择

## 用户诉求

执行已审阅的 P3：为未来 Harness 自进化提供模块化替换基础，解耦后保持核心清晰；不实现源码修改、自进化评估或审批产品入口。保持 P2 的会话、Run、队列和取消行为。

## 主要改动

- 新增独立 harness-control 包，复用 composition/boot/Cordis，不建立第二套执行框架。
- Patch replace/insert 从固定产物清单导出行为，补服务/事件契约、配置验证、共享白名单与 Host 指纹。
- Host 独立授权，持久选择 JSONL、writer lease、fsync、CAS、幂等、恢复阻断及受授权内置恢复。
- 主 Run/子 Run/压缩及能力查询异步获取租约；旧 Run 保留组合，后续 Run 可换 Loop。
- 新执行摘要保存在原有配置 JSON 中，保留严格 P2 task codec 的 harness 对象格式。
- 同步架构、生命周期与执行计划；新增事件检查器、故障进程 fixture 和学习笔记。
- 验收修复：Host 恢复阻断不再永久封死尚未领取的内容队列，维护恢复后可手动继续；窗口重载从 Host 快照恢复普通运行状态和原 Run 停止目标，并防止过期快照复活已结束任务。

## 验证及边界

自动化与真实界面验收逐项见 [P3 记录](../../exec-runs/20261003-agent-harness-host-refactor/phase-3-summary.md)。Computer Use 委派 gpt-6.1-sol，使用本地测试模型；不宣称真实 Provider、远端 Host 或发布签名已验收。

本次命中“可迁移、有深度、有陷阱、有模式”，新增 [持久选择学习笔记](../../learnings/2026-10/20261003-harness-durable-selection.md)。P4/P5 与自进化产品功能保持后续范围。未提交、推送或清理用户文件。
