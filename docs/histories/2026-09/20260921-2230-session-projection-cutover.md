# Session Projection 生产链路统一

用户要求核对 DSH 的 Journal / Host Registry / disposable cache / Client raw window 分层，并一次性优化 ActSpace，删除被替代、未使用和兼容代码。

本次把通用 Session facts 注册到 Host Projection Registry，以 SessionReadModel 驱动生产读取；新增可删除的 checkpoint 与 Journal 字节偏移缓存；IPC 传输 facts 和 raw event window，Client 分别构建 Chat、Trajectory、Tool Card。删除旧 browse index、Main 展示投影、revision observer 和旧 cache helpers，保留仍被恢复与 compaction 使用的运行时投影。没有引入无 producer 的 Goal 空壳。

补齐 reducer 状态不可变约束、失败工具终态、后台 Bash task 的结构化 detail、完整复制与分页读取边界。跨包回归 fixture 改为明确的 testing export，替代 src/test 深引用。更新当前架构、相关设计、验收脚本和执行记录。

验证结果及 Electron 环境阻塞见[执行摘要](../../exec-runs/20260921-session-projection-cutover/execution-summary.md)。学习记录：[共享事实，不必共享视图](../../learnings/2026-09/20260921-session-facts-and-views.md)。

本次未提交或推送，未清理用户 Session 数据。
