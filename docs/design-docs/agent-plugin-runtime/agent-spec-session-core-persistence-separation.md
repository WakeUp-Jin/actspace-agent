# Session 业务与存储后端边界

本规范描述当前实现。它替代早期新增 `session-core` 包、将 write-behind 放进 JSONL Provider 的方案。实施及验收进度见[第二轮清理计划](../../exec-plans/completed/20261004-agent-storage-and-cleanup/README.md)；接口落地不等于整个清理计划或应用验收已完成。

## 1. 依赖与所有权

| 模块 | 职责 |
| --- | --- |
| `@actspace/session-journal` | 事件、Codec、顺序和关系校验、Surface、语义 replay |
| `@actspace/session-storage` | 不含文件路径的存储契约；提供一致快照、写入所有权与持久化屏障 |
| `@actspace/session-persistence` | SessionStore、Handle、Coordinator、write-behind、业务恢复和 fork；显式注入存储 |
| `@actspace/session-jsonl` | JSONL 生产实现；文件布局、writer、fsync、文件租约和物理修复 |
| `@actspace/session-projection` | 投影注册、fold、checkpoint；不持有存储 |
| `@actspace/session-projection-cache` | 通过存储契约重建冷读投影、分页和工具索引 |
| `runtime/session` | 把 Session 业务接入 Host 的会话列表、观察、导出及生命周期 |

名称暂保留 `session-persistence`，避免仅为命名迁移全部消费者；它是 Session 业务实现，并非 JSONL 的别名。业务包的生产依赖不包含 JSONL。后端实现不反向依赖 SessionStore。

Host Cordis 树装配：`session.journal` → `session.storage` → `session.store` → `session.runtime`。实际 JSONL Service 同时注入 Host 数据根目录与 Journal registry。替换 Harness 不会替换或关闭存储 Provider。

## 2. 公共存储契约

以 `packages/session/storage/src/index.ts` 为接口来源：

- Provider：`identity`、`inspect(sessionId)`、`listSessionIds()`、`create(header)`、`open(sessionId, access)`、`discard(handle)`、`close()`。
- 会话 Handle：`header`、`access`、`read()`、`append(events)`、`flush()`、`assertOwned()`、`close()`。
- 快照：`revision`、`header`、`events`、`integrity`、可选 `problem`。
- 可选轻量描述：`querySource` / `querySources` 返回必要 Header 字段、完整前缀 seq 与 Provider 不透明 stamp；Runtime 对打开的 Session 额外以 durableSeq 限定。此能力不返回完整语义 snapshot。Runtime 对调用者返回 `{ sources, failedSessionIds }`，逐会话隔离不可读描述符，并附加独立 codecSetDigest；Provider 未实现查询加速时返回 null，由目录调用者走原 Session 路径。
- 可选查询加速：`readEventBatch(sessionId, { cursor?, throughSeq })`，返回有界 `events`、不透明 `cursor` 与 `done`；不参与恢复、写入或 flush，cursor 只能由同一 Provider/Session 解释。

`inspect` 一次返回快照和 revision，不另造一次 stat 后再 read 的公共时序。revision 是不透明值，只能在同一 Provider identity、同一 Session 下比较；调用者不得解释为文件偏移或数据库版本号。

`create` 不覆盖已有会话。读 Handle 固定创建时的快照，不阻塞 writer；写 Handle 独占所有权。`discard` 只接受本 Provider 当前持有的写 Handle，用于创建或 fork 失败清理，不是任意会话删除 API。JSONL 在租约内先移走目录，再释放和清理，避免误删同 ID 的后来创建者。

公开接口不含文件路径、字节偏移、锁文件、SQL 查询或数据库连接。JSONL 的物理诊断和修复 API 属于后端专用维护能力，不由通用业务层模拟。

## 3. 接纳、持久化与关闭

Journal 接纳的事件不等于已经持久化。Coordinator 持有 write-behind；在需要持久确认时依次等待 Provider `append` 与 `flush`，成功后才推进 durable 水位和发送 flush 通知。JSONL 的 append 已执行 fsync；独立内存测试实现到 flush 才发布可检查快照，验证业务层没有省略屏障。

持久化失败阻断该 Session 的后续写入，不通过吞错推进水位。关闭时即使最后的 checkpoint、flush 或某个资源释放失败，仍尝试关闭该会话的 driver 和其他会话，保留聚合错误。关闭与通知不构成第二套事件事实源。

`session/event`、`session/flush` 使用 Cordis 通知；重要写入与持久屏障通过明确的 await 调用完成，不依赖通知监听器返回值。

## 4. 恢复、fork 与附件

物理损坏检测和 JSONL 有效前缀修复归 JSONL；任务中断、未结束轮次和语义恢复事件归 Session 业务层。恢复提交事件是 `recovery/committed`。

SessionStore 读取父快照，计算合法 fork 种子，预留子会话的 writer，再复制必要附件并重写引用，追加种子并 flush。失败时清理本次新建的附件与子会话，不能清理父会话。附件通过独立 artifact port 访问，不要求未来数据库保存二进制内容。

临时 fork Handle 由调用者关闭；应用随后通过 Runtime controller 打开正式 Handle，从而统一观察与退出时的生命周期所有权。

## 5. 冷读与缓存

冷读、列表、分页、导出和 fork 都经过选中的 Provider。缓存以 Provider identity、Session revision、Codec digest、projection stateVersions 判定能否复用。缓存保存逻辑事件索引，不把 JSONL 字节偏移暴露给 Runtime。

缓存最多保留 3 份完整事件快照，并按序列化字符估算的 16 MiB 预算淘汰；这是保留缓存预算，不是读取过程峰值内存上限。

Session 详情冷读仍读取完整一致快照；revision 未变时复用语义投影。Usage 派生索引使用新增的有界 `readEventBatch`，JSONL Provider 负责在独立 Worker 中解析并校验连续前缀；Main 与通用 Runtime 不解释物理 cursor。旧磁盘 checkpoint 和全局列表缓存不再作为当前真源，全局列表从当前 Provider 重建。此实现简化了后端边界，但不承诺大历史冷读性能与旧文件索引相同；后续优化应在该契约内测量，不能让通用层重新绕过 Provider 读文件。

## 6. 替换与验证边界

生产后端仍为 JSONL。`session-storage/testing` 提供独立内存后端，共用契约用例覆盖重复创建、writer 冲突、只读快照、连续事件、flush、关闭重开及受控 discard；Runtime 的独立用例验证无文件依赖的列表、分页、导出、fork 和恢复。

内存通过不代表验证了 SQLite/MySQL 的事务或崩溃持久性。更换生产后端采用受控停机、配置变更与重新启动；数据迁移和多 Host 并发执行不在本轮范围。

## 7. 接纳、通知与恢复的不变量

生产者（Loop、TaskLedger、Todo、审批、Subagent）直接 append 事实。append 校验、分配连续 seq、交付唯一持久化端口后发布 `session/event`；该通知表示已接纳，不能据此立即冷读磁盘或宣称 fsync。appendMany 先验证整批；接纳后入队失败保留事实并阻断后续写入/副作用，不自动重放业务。

acceptedSeq 与 durableSeq 分离；空日志前缀为 -1，临时会话的 durableSeq 为 null。flush 固定目标前缀，未知目标拒绝，允许实际写过目标。持久模式缺失或重复权威消费者应在发布前失败，临时模式必须明确选择。

`session/created` 在 live 注册完成后通知，恢复 seed 不逐条重发历史事件；`session/disposed` 报告关闭尝试结果。观察者异常各自诊断，不阻断其他观察者，也不递归写入失败的 Session。

`session.checkpoint.flush` 是必需 awaited Service：LLM dispatch、tool body、下一步和最终 settlement 各自等待检查点；处理器缺失或失败阻断副作用。shutdown 排空 Run、Session 后再释放存储和插件树。JSONL lease 只在实现层检验，业务层不读取锁文件。

创建/恢复失败释放已取得资源；fork 只写新后缀，不重新发送历史通知。中断工具的 outcome-unknown 保守保留，不能自动重试。压缩以追加 summary/replacement 改变未来上下文，失败不提交半事务。历史事实不删除，用户数据不因本次清理迁移。
