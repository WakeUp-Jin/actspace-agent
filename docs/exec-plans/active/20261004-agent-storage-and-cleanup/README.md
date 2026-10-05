# Agent 重构第二轮清理

状态：实施完成，验收部分通过，保留未覆盖子项。2026-10-04 用户批准执行；2026-10-05 完成本轮修复复验。详见执行摘要，不声明所有 UI 子项通过。

依据：[代码审计](../../../design-docs/agent-plugin-runtime/agent-refactor-code-cleanup-review.md)、[文档审计](../../../design-docs/agent-plugin-runtime/agent-refactor-docs-cleanup-review.md)。以当前未提交工作树为基线；保护前端工作台等无关修改，保护 histories/learnings，不提交、不操作用户数据。

## 分批执行

1. [存储契约与 Session 边界](storage.md)：公共读写、冷读、fork、恢复、释放；JSONL 和内存同契约验证。
2. [任务入口与旧接口清理](application.md)：通用 Run 结果、本地持久提交、排队 compact、退役接口闭包。
3. [文档与装配检查](documentation.md)：修正当前规范和矩阵、收拢旧计划，完整验证。

各批同步受影响文档，不等待最后统一修正。执行过程与验收结果见[记录](../../../exec-runs/20261004-agent-storage-and-cleanup/execution-process.md)、[摘要](../../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)。

## 完成边界

不实现自进化工作流、运行中换 Loop、手机前端、SQL生产适配与迁移。独立内存后端证明契约无文件依赖，不证明数据库持久性。已有JSONL格式与配置保持可读。删除旧API时同步全部仓库消费者，不保留无期限兼容层。

每批定向测试→依赖闭包构建→类型检查；末尾包/事件/文档/矩阵检查、CLI与Host进程检查。UI变更列逐项验收点并由gpt-6.1-sol子智能体执行Computer Use，静态测试不冒充实机。
