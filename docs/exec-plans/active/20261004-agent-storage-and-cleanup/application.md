# 任务入口与旧接口清理

状态：代码及自动化回归完成；真实 Computer Use 主链路已覆盖并修复复验，剩余子项见执行摘要。

- [x] A1 `agent-service/application`、Runtime managed-runs、headless、CLI统一通用Task/Run终态；等待settlement释放，任意合法JSON结果不要求默认Loop reason。
- [x] A2 Desktop App、fixed-renderer-ipc/preload/shared统一submitTask与Host观察，保留标题、附件回滚、流式先于receipt、reload、迟到取消不误停下一Run和停止后队列暂停。
- [x] A3 `/compact`变为共同应用操作，空闲立即调度、忙碌进入原队列、支持取消，不能作为普通模型提示。
- [x] A4 按审计C01–C14逐项删除无消费者API及测试依赖；保留任务/通知不同职责、lease和Host/Harness隔离。
- [x] A5 验证shutdown失败重试、所有session关闭失败释放、recovery/committed后Client增量。

验证：非默认RunFactory覆盖completed/cancelled/failed；定向Host/Headless/CLI/renderer回归、三入口构建与process/package smoke。新增首发/队列/取消/compact/reload UI逐项清单后委派Sol Computer Use。通过真实Task snapshot/receipt断言，禁止新API mock偷偷转调旧API保活。
