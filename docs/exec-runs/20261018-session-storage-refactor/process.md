# 执行记录

- 2026-10-18：用户批准存储结构重构。审计发现 Journal 和 JSONL handle 各自复制、全量校验历史，物理层每批还全量编码生成 revision；先消除重复工作，再迁移历史消费者。保留共享目录的 Context 在途改动。
- P1：引入增量校验器和触及状态回滚；修复 JSONL handle 每批全量校验、编码与驻留重复正文。
- P2：增加 Host 文件历史范围读取、512 条 / 4 MiB 近期正文预算；只释放 durable 前缀。迁移 Context、Inbox、Todo、Task、Workspace、权限和 Runtime 热路径。发现 flush 会触发冷缓存整份读取，已移除。
- P3：Runtime 投影注册完成后封口，释放重放正文；重复证明保留最近 512 条。用量投影 version=2，Step 结算清理辅助记录。
- P4：生产者等待队列预算，写失败不推进 durable；Desktop artifact 引用发布前增加 fsync，与 Node 对齐。
- 首次新增回滚测试缺少 tool/result 必需 status，是 fixture 错误；补齐后运行。原有 Journal/事务、恢复、fork、Context、运行时测试通过。
- 十万事件实文件实验：完整写入、关闭重开、回读一致、续写 seq 连续，13.78 秒；驻留原始事件正文不超过 512 条 / 4 MiB。此结果不包含真实模型调用，不代表全部内存恒定。
