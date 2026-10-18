# Session 存储重构执行摘要

2026-10-18：P1–P5 代码与本轮自动化完成。沿用 `codex/context-incremental-design`；共享目录中的 Context Step / 面板改动予以保留，未覆盖其设计与实现。

## 交付结果

1. Session JSONL + 托管附件继续保存完整会话事实。Agent 运行与恢复不新增 SQLite 依赖；历史查询服务继续使用已有派生索引。
2. Journal / JSONL 写入改为增量校验与追加，校验、事务或 Surface 失败原子回退。已结算关系只保留去重身份，不留完整过程数据。
3. 持久 Session 默认保留最近 512 条、4 MiB 序列化正文预算；只释放 durable 事件，文件字节索引支持显式范围回读。完整历史、序号和旧 JSONL 格式兼容。
4. Inbox / Todo / Workspace / 权限 / 消息去重使用当前内存投影；Task 基于当前快照处理增量；Context Reducer / Disclosure / Supplements 不再每步复制和扫描完整历史。Runtime `flush` 不再预热整份冷历史缓存。
5. Runtime Projection 封口后不持有第二份历史正文，保留近期重复证明和未完成事务；Usage v2 在 Step 结束清理纠正缓存，累计 Token 与费用继续正确累加。
6. 写入队列提供生产者背压；Desktop artifact 在 fsync 正文、元数据和目录后返回引用，与 Node 路径一致。

## 模块职责

| 层 | 拥有的数据 | 读取与恢复 |
| --- | --- | --- |
| Session Journal / Persistence | 接纳与 durable 水位、当前 Surface、增量校验和当前业务投影 | 内存当前状态；缺失历史由文件 provider 回读 |
| Session Storage / JSONL | 完整 JSONL、writer lease、文件 fd 与可重建位置索引 | 原格式兼容；损坏报错；不使用 SQL |
| Artifact Store | 带归属、摘要与大小的正式附件及正文 | 按 Session 授权，fork 复制改写；不作为缓存删除 |
| Runtime / Context | 当前执行与模型输入状态 | 增量事件或当前投影；压缩独立于事件缓存淘汰 |
| SQLite 历史查询 | 前端历史、搜索、统计等派生读模型 | 保持既有索引追赶及失效协议；无唯一业务事实 |
| 全局设置 / 凭据 | 原有领域 JSON/JSONL 与专用凭据记录 | 不搬到任意一个聊天 Session；本轮不改变格式 |

## 自动化证据

- Runtime 依赖闭包构建：`pnpm --filter @actspace/runtime... build` 通过，包含修改的生产包类型检查。
- 15 个相关后端包：合计 **353 项**测试通过。包括事务回滚、增量校验、持久化失败、恢复、fork/附件复制、Context 与 Runtime 联动。收尾按修改包定向复验，数量按最后一次结果去重。
- Desktop artifact：`pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-artifact-store.test.ts`，3 项通过。
- Electron main 类型检查：`pnpm --filter @actspace/desktop exec tsc --noEmit -p tsconfig.electron.json` 通过。
- 普通追加规模：Journal 的 100,000 条输入恰好调用 100,000 次 codec 校验，再追加一条只增加一次；不依靠耗时阈值判断性能正确性。
- 实文件规模：`ACTSPACE_STORAGE_SCALE=100000 pnpm --filter @actspace/session-persistence exec vitest run --globals src/test/bounded-history.test.ts` 通过，测试体约 **13.78 秒**。覆盖写入、预算内驻留、完整回读、关闭重开、继续追加，未创建 SQLite。
- 新增定向证据：慢磁盘满队列等待；未完成 compaction 在旧正文释放后仍正确提交；旧 JSONL 空行/中文回读；`flush` 不调用冷历史 inspect；已知零费用和 Step fallback 不重复累计。
- `git diff --check` 通过。
- 全库 `pnpm check:docs` **未通过**：未修改的归档文件 `docs/exec-plans/completed/20261005-desktop-frontend-refactor/00-总执行计划.md:4` 指向缺失的 `docs/desktop-frontend-refactor/demo/`。本轮新文档的本地链接单独核对。

复验后端包命令：

```sh
pnpm -r --filter @actspace/session-journal --filter @actspace/session-jsonl --filter @actspace/session-persistence --filter @actspace/session-projection --filter @actspace/session-projection-cache --filter @actspace/core-agent --filter @actspace/core-agent-loop --filter @actspace/context-engine --filter @actspace/context-disclosure --filter @actspace/context-compaction --filter @actspace/tools-todo-tools --filter @actspace/agent-service --filter @actspace/subagent --filter @actspace/english-learning --filter @actspace/runtime test
```

## 使用边界与人工验证

- 512 条 / 4 MiB 只约束近期事件的序列化正文；不是整个进程内存上限。当前 Context、业务记录、历史工具视图、去重 ID、文件位置索引仍有各自开销；没有删除业务数据来制造固定内存数字。
- 未保存事件和事务可超过窗口预算。单个大记录可以超过读取页预算；应保留它而非截断。调用方需等待 append Promise 才能利用背压，不能用无限并发提交冒充有界生产者。
- 冷打开的 inspect 和显式全量导出仍可能暂时加载完整日志；本轮不新增文件检查点。同步范围回读发生在 Host，常规执行使用当前内存投影；未宣称异步流式冷恢复。
- 自定义 codec 若声明依赖完整 `previous` 的关系校验，仍按其契约显式读取历史；内置 codec 不走该分支。
- 本轮未进行真实 Provider 调用、真实 Electron 界面或断电测试。自动化 fsync/故障注入不能等同于实机断电验收。
- 接手后可在测试数据目录创建多轮含工具/压缩的会话，重启后检查标题、模式、Todo、当前上下文、附件、旧历史分页；删除测试目录内派生 SQLite 后继续恢复并查询。不要以用户真实数据做删除实验。

## 回退

仅代码回退即可，JSONL 与 artifact 格式未变化。Usage checkpoint 版本不匹配时丢弃派生状态重建，不需要转换或删除事实文件。

## 后续联合 Computer Use 验收

2026-10-18 已补充真实 Electron 联合验收：工具Step刷新、压缩后下一请求、移除隔离SQLite后的恢复与继续执行已有证据；发现压缩中取消入口禁用、自动失败终态无持续提示两项前端问题。部分恢复/路径边界仍未覆盖，不能据此声明全部通过。详见 [联合验收摘要](../20261018-context-storage-cu/execution-summary.md) 与 [问题记录](../20261018-context-storage-cu/issues.md)。本段是后续验收结果，不改写上文实施时点的自动化证据。
