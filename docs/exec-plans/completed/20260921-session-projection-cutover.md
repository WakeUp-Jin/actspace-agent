# Session 投影一次性切换

状态：实现与自动化验证完成；真实 Electron 验收受本机安装缺失阻塞。用户已批准整体实施，并要求删除被替代、未使用和兼容用途代码；不拆成多次交付。

## 目标与边界

Journal 保持唯一 Session 事实源。生产读取接入统一 Host Projection Registry，领域事实按 key 计算、缓存和传输；Chat、Trajectory、Tool Card 保持各自客户端展示模型。Surface append/replace、事务有效性、未知 codec、Session 身份与水位不得丢失。accepted 与 durable 水位继续分离；缓存不得把未落盘事件当成持久事实。

范围：Session projection/cache、Runtime Session 读取、Desktop IPC/preload、Client Session store 和展示投影。删除本链路被替代的实现及兼容 fallback。保留用户数据，不修改官网工作，不引入 Goal producer、不提交或推送。

必读：REPO_COLLAB_GUIDE、ARCHITECTURE、CODING_BEHAVIOR、FRONTEND_VERIFICATION、Session 持久化事实源与投影架构、20260920-session-event-persistence 执行摘要。

## 实施与验证

- [x] 统一 Registry 的事实 definitions、状态 checkpoint、事务与水位驱动，接入生产 Runtime；验证增量与重放一致、失败不污染状态。
- [x] 接通可删除持久缓存与尾部读取；验证版本变化、损坏、日志截断、冷读与重建。
- [x] 接通事件窗口与领域值变更传输，迁移客户端展示投影；验证分页、重连、旧响应、流式与 Surface replacement。
- [x] 删除被替代的旧路径，更新设计、执行记录、history 和学习文档；运行相关单测、构建、类型、包边界和文档检查，并尝试真实 Electron 验收。

失败时不切回双轨兼容实现；保留执行记录并修复新路径。任何无法完成的验收须在摘要中明确，不把自动化通过等同于 Provider 或桌面人工验收。

最终结果见[执行摘要](../../exec-runs/20260921-session-projection-cutover/execution-summary.md)。Electron 已尝试，未启动成功；未完成项不视作已通过。
