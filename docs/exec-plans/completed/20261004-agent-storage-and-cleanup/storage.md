# 存储契约与 Session 边界

状态：实施与自动化回归完成。真实界面使用链由应用验收补充。

## 模块和迁移

- `packages/session/storage`：新增中性契约；服务identity、会话revision、inspect/list/create/open；每会话handle提供read/append/flush/assertOwned/close，区分read/write。公共类型不含路径、字节偏移、文件锁。
- `packages/session/persistence`：收口为Session业务层，保留Handle/Store/Coordinator/WriteBehind和语义恢复。删除JSONL默认构造、layout、旧projection getter和类型函数袋。Store使用显式注入storage；fork的语义种子和artifact复制归这里。
- `packages/session/jsonl`：接收文件layout、writer lease、JSONL Provider及物理修复；真正通过Cordis提供存储能力，卸载遍历关闭所有handle并保留失败。
- `packages/session/projection-cache`：使用storage读取，不直接读取journal/checkpoint文件。按storage identity/revision、codec和projection版本失效；保留分页/工具查询索引。全局列表从同一后端重建，不能加载其他后端残余缓存。
- `packages/runtime/src/session`：显式装配Store和缓存，恢复/导出/列表/fork经过契约；失败也尝试关闭全部会话。
- 同批迁移所有consumer imports、package deps、loader、manifest、生命周期测试和文档。

## 契约

create只创建不存在的会话；open写入独占，read不占writer。append接纳与flush持久屏障分开；失败后阻断写入，close仍释放所有权。读handle提供一致快照；revision只在同一storage身份和session下比较。语义验证及中断恢复归Session，损坏检测/物理修复归backend。附件独立port，fork失败清理仅本次创建资源。提供者更换需受控重启，迁移另案。

## 实施与验证

- [x] S1 契约、JSONL Provider、纯Session接线；明确flush与失败关闭。
- [x] S2 冷读/索引/恢复/fork迁移，全链使用provider。
- [x] S3 独立内存后端与共用套件：重复create、readonly、顺序、writer冲突、flush、close重开、读取新revision、后端隔离、fork/恢复及释放失败。
- [x] S4 当前工作树依赖闭包重建、定向Session/Runtime/Host/CLI回归、同步规范。

先用临时目录验证磁盘行为，禁用真实用户数据。构建失败按最小模块边界修正，不回滚既有工作树；不为通过测试削弱包边界。物理损坏案例仅JSONL执行，内存不声称验证fsync。
