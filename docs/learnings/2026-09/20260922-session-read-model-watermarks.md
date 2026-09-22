# 事件日志读模型的水位与增量折叠

本轮 Session 统一改造暴露了两个可迁移的工程规律。

第一，事件是否“同一批”不能替代实体自己的版本。`todo/write` 的 event-level revision 只描述批次，真正决定某个 Todo 是否应该被接受的是 item revision。把批次当成实体版本会让部分更新覆盖未出现在事件里的条目；把 `todoId + item revision` 作为 canonical merge key，才能让 full replay 和 incremental apply 得到相同结果。

第二，读模型必须携带自己的水位。accepted、durable、projection、window 和 index generation 代表不同的完整性边界，不能用一个 `throughSeq` 伪装所有状态。客户端遇到 equal-seq 同值可以幂等丢弃，equal-seq 冲突必须 resync；历史 Window 的更早水位也不能覆盖完整 Session facts。

这套模式适用于任何 append-only Agent Journal：完整事实 projection、跨实体 summary index 和有限展示 window 都可以删除重建，但不能反过来成为恢复事实源。
