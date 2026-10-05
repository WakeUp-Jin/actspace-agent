# Session 与 Context：分层理由

历史目标稿已收敛，2026-10-04。当前契约分别由[写入与恢复](agent-spec-session-core-persistence-separation.md)、[Session 格式](agent-spec-session-format-v1.md)、[事件模型](agent-spec-dsh-event-model.md)、[读取与投影](agent-session-three-read-models.md)、[Prompt/Context 贡献](agent-spec-prompt-context-contributors.md)维护，不在本页复制 schema。

Session Journal 是唯一运行事实源；Surface 从事实派生模型历史。Context 每步组装不可变请求，不维护第二份可变 conversation。

模型能看到的内容必须已经存在于 Surface，或进入本次 logical request snapshot。先 prepare 并解析模型/Adapter registration，再记录实际请求与 defaults，通过 durability barrier 后调用同一个 PreparedCall。凭据、代理对象、HTTP headers、AbortSignal 与 wire Base64 不持久化。

压缩通过追加 summary/replacement 改变未来模型视图，不删除旧事件；摘要失败不能提交半个压缩事务。工具 outcome-unknown 不自动重试。Codec 必须在行为启动前可用；未知 required 事件只读/导出，不能继续执行。

逻辑事实与物理编码独立：JSONL 是当前生产实现，完整存储契约允许未来 SQLite/MySQL Provider；本轮没有实现 SQL 或数据迁移。旧稿“唯一允许 JSONL、不允许新 backend”的长期约束已经取消。

Header provenance 记录创建时条件，不要求整个 Session 永久固定 Harness。每次 Run 固定其 lease；下一任务可用新的选择。fork 复制平衡逻辑前缀与 lineage，不复制进程对象或凭据。

历史 v1 importer 不在本轮范围；也不授权清理任何用户数据。原稿可通过 Git 历史回溯。
