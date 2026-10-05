# 服务接口、实现与消费者

2026-10-04 校准。三者是职责边界，不要求每个服务额外创建三份包装对象。

- 接口定义调用语义、失败和生命周期约束；调用者依赖接口，不依赖某个 JSONL、SDK 或默认 Loop 实现。
- 提供者通过 Cordis Service / Behavior 发布服务，拥有 listener、timer、进程、注册与 disposer。
- 消费者声明 inject，只读取所需能力；不能通过中央万能容器绕过依赖边界。

当前生产机制是 Static Manifest + Codec discovery + Cordis Loader。`defineServiceProvider`、`defineServiceConsumer` 及其私有 graph validator 已删除，因为没有生产消费者。不会给所有 class 套一层新框架。

`ACTSPACE_SERVICE_IDS/DEFINITIONS/ROLE_METADATA` 是稳定名称及审计目录，不能据此宣称服务已激活；实际 required-service 校验和 Cordis settlement 才决定就绪。元数据与 manifest 不一致应修正来源，不能把目录当作第二套能力系统。

存储是具体例子：`SessionStorage` 定义 inspect/list/create/open/flush 等语义；JSONL Provider 负责锁、编码、fsync 和物理修复；SessionStore 负责接纳、恢复、fork 和水位；调用方不读取 journal.jsonl 路径。内存 Provider 独立验证接口，不承诺数据库事务和持久性。

卸载意味着资源停止并释放，而不只是删掉服务名称。只读观察 emit 不阻塞提交；持久化屏障直接 await 能力方法，不能靠通知完成。

相关：[存储边界](agent-spec-session-core-persistence-separation.md)、[启动链](agent-spec-dsh-plugin-assembly-and-agent-startup.md)、[包规范](agent-spec-package-layout-and-plugin-packaging.md)、[生成矩阵](agent-contract-matrix.generated.md)。
