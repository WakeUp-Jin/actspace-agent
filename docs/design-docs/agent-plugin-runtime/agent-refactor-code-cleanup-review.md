# 本次重构收尾：代码与目录清理结果

2026-10-04：第二轮实施中，代码已接线；最终验证、Computer Use 和剩余问题统一见[执行摘要](../../exec-runs/20261004-agent-storage-and-cleanup/execution-summary.md)。此页替代执行前建议，不把旧审计行号继续当当前源码。

目标来源：[Harness/Host 决定](agent-harness-host-refactor-decisions.md)；配套[文档清理](agent-refactor-docs-cleanup-review.md)。模块化和可替换性优先于包数量，精简的是重复事实、无消费者接口和混杂职责。生产仍用 JSONL，SQLite/MySQL、数据迁移、自进化具体工作流和手机 Web 另案。

2026-10-05 更新：旧 activate 协议、空生命周期、无消费者局部符号和重复规范已清理，根目录与逐路径处置已结算，隔离快照自动化通过。下面是 10-04 的审计背景；新增结果和 35/35 CU 签收以[最终收尾摘要](../../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)为准，本次批准范围已完成；不把保留项解释为已证明全仓无冗余。

## 当前链路

```text
Desktop / CLI run / CLI host
  → bootProfileRuntime → Cordis Host tree
  → session.storage → SessionStore → session.runtime
  → 应用服务 submitTask → TaskLedger → SessionRunManager
  → HarnessControl / lease → RunFactory → Loop

Headless submit-and-wait → Task settlement → 通用 outcome/value
Session write → Coordinator / write-behind → storage handle append/flush
Session cold read / list / fork / recovery → 同一 storage Provider
```

Runtime 按 startup/session/harness 组织；中性 `session-storage` 不依赖文件后端；`session-persistence` 保留 Session 业务，JSONL 拥有物理布局/租约/修复。具体契约以[存储规范](agent-spec-session-core-persistence-separation.md)为准。

## 原审计项处置

| 审计 ID | 实施结果 |
| --- | --- |
| R1 | 通用 Run outcome/value 贯穿 ManagedRuns、Headless、CLI；任意 JSON 不再强制默认 Loop reason；等待 settlement 和租约释放 |
| R2 | 本地首发统一 submitTask receipt 与快照观察；同一 submissionId 重试，标题从接纳入口触发；测试不再用新 mock 转调旧 runAgent |
| R3 | `/compact` 使用同一 Task 队列的 operation，忙时等待、pending 可取消、结果持久化；删除手动 compact 平行 RPC/IPC |
| C01–C03 | 删除空 Bundle、createDefaultComposition、旧 trusted boot activation、bootProfile/BootedProfile 和转发入口 |
| C04–C06 | 删除无消费者 runtime aliases、空 service bag、空释放包装、RestartController、恒空会话集合与无效状态方法 |
| C07–C10 | 删除旧 enqueue/steer/cancel 别名和完整 IPC/preload/types 闭包、旧 queue mutation、Client facade、无效 approval fallback 与外层 keepPending 参数 |
| C11–C14 | 删除重复 projection getter/实现、JSONL 函数袋、persistence types 占位、无调用恢复方法；换为真实 Host storage Service |
| F1 | shutdown 并发共享同次等待；失败可重试，超时不重新启动仍在运行的清理 |
| F2 | 一个 Session append/flush 失败也尝试关闭该 writer 和其他 Session；聚合错误；Host 退出先 drain 执行、封口会话，再释放 Cordis 树 |
| F3 | Client 使用真实 recovery/committed 事务终点，补增量回归 |

SessionStore create/open/fork 共用绑定函数，各自保留数据校验、子会话预留和附件失败清理。JSONL Provider close 等待在途 create/open 再关闭 handles。冷读缓存最多保留3份、16MiB序列化估算预算，变化时完整读取/重放；不宣称峰值内存或大历史性能无成本。

## 装配与边界取舍

默认 Harness 清单和固定制品构建共用 `default-harness-definition.ts`，消除同层两份手工工具列表。Host `cordis.yml` 与受信任 transport 清单继续互验：二者承担配置和准入职责，未为少一份声明取消保护。

HarnessControl 仍是独立包；主要生产路径由 AgentRuntimeService 构造并持有它。包的可选 Cordis plugin 供其他装配使用，不与 class 路径同时激活。不把强行合并插件入口视为本轮完成条件，也不声称独立 plugin 已进入默认 Host tree。

通用 Provider/Consumer 图 helpers 退役；有用的服务集合一致性进入真实 `validatePluginManifest`，按所有 behavior 的集合核对，支持多 behavior。中央 metadata 仍是阅读目录，不能证明所有消费者和实际激活。矩阵覆盖及限制见[生成规范](agent-spec-contract-matrix-generation.md)。

## 明确保留的职责

| 模块对 | 各自职责，不能因看似重复合并 |
| --- | --- |
| TaskLedger / SessionRunManager | durable 事实与 revision / 执行占位、AbortController、预算及 join；live校验与replay校验分别保护不同入口 |
| HarnessControl / HarnessGenerations | 授权、选择持久化、恢复 / 实例、租约与释放 |
| Journal / Handle / Coordinator / Writer / Lease | 事实验证 / live生命周期 / 接纳与持久化水位 / 文件写入 / 跨进程排他 |
| Host LLM / Harness LLM | 标题等辅助请求 / 当前执行组合请求，不因模块相同就合并实例 |
| MainAgentInbox / TaskLedger | 后台工具通知 / 用户持久任务；Loop 的 notifyAgent 仍 enqueue task_notification |
| Projection Registry / Cache / Client 三读模型 | 领域折叠 / 可重建冷读索引 / 不同展示目的 |
| Host RPC 与 Desktop 附件/审批 adapter | 网络信任边界、上传及重连 / 本机磁盘与界面生命周期；可共用语义，不能直接互相依赖整包 |

10-05 已删除 Inbox 的 status、旧 steer/next-turn 写入参数与无消费者 claim options；历史 codec 不因没有新写入就删除。ManagedRuns.#states 是同步观察缓存，RunManager.#active 是 acquire 前占位，也不能简单按“多一份状态”删除。

## 验证和保护

构建、单测、进程、打包和 Computer Use 分开登记在本轮摘要。第一批证据不冒充本轮复验。测试迁移断言真实 Task/Run/Storage 行为，不为保留已删除的架构添加兼容壳。

本轮基于已有脏工作树，初始内容哈希记录于临时基线。保护既有前端工作台/产品设计、histories/learnings、设置和用户数据；不提交、不推送。最终统计比较本轮开始的工作树，不将此前改动算作本轮收益。

本次覆盖三条生产链及上述闭包，不宣称整个仓库每个函数均无冗余。独立产品功能、全部工具/provider 和其他前端专题不在逐行清理范围。
