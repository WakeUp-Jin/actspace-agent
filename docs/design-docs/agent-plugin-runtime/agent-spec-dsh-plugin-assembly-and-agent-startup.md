# 插件组装与任务执行链

2026-10-04 按当前源码校准。本文只追踪生产入口；领域契约由各专题维护。

## 启动、选择和执行是三个时间点

1. CLI run、Desktop、独立 Host 分别选取 headless、desktop、host Profile，调用 `bootProfileRuntime()`。
2. Boot 发现 codec、注入 Host ports，经 `bootDshCordis()` 挂载受控 `cordis.yml`，等待 required services 就绪。
3. `AgentRuntimeService` 组装 Host 调度器与 HarnessControl；后者恢复选择或发布默认固定产物。恢复失败保留 Host 诊断和维护入口，阻断新 Run。
4. 客户端提交内容，`AgentApplication.submitTask()` → `ManagedRuns.service` → `AgentService` → `TaskLedger`。接收回执与执行结束分离。
5. `SessionRunManager` 消费队列时读取配置，获取当时选中的 Harness lease，通过 `agent.run-factory` 创建 Run。Run 固定本次组合；后续任务可以选择新组合。
6. Run 完成后提交终态，释放 instance/lease；Headless 等待 settlement 后返回通用 outcome/value。Desktop 通过 task snapshot、durable projection 和 live stream 展示结果。

## Host 和 Harness

Host 持有 Session、存储、调度、审批和连接生命周期。Harness 持有可替换的 Loop、工具、Prompt、上下文和模型执行策略。Host + Harness 组合成可运行应用；同一 Session 不等于同一个长寿命 Loop。

生产 Host 声明是 `runtime/src/profiles/composition.ts` 的 `TRUSTED_LOADER_ENTRIES`，文件载体为 `runtime/cordis.yml`；Boot 校验 id/name/inject 一致性。Harness 构建和准入共用 `runtime/src/harness/default-harness-definition.ts`；构建脚本不再另列一份插件集合。

HarnessControl 的生产生命周期仍由 `agent-runtime` 行为持有。独立 `harness-control/plugin` 为可选装配入口，不与当前生产路径同时挂载；它不是另一个选择状态所有者。

## 用户任务与通知

用户输入统一进入 TaskLedger。插入当前 Run 是 pending Task 的 designation；撤回 designation 后仍是同一排队内容。队列不保存模型配置快照，消费时才读取配置。同 Session 闲置时可以切换 Chat/Plan/Agent；不支持执行中换模式或 Loop。

`/compact` 是同队列的调度操作：空闲执行、忙碌排队、pending 可取消，不作为普通模型提示。其终态及 compacted/error 结果持久化在 Task 事件中；不必为了操作构造 Run。

后台工具通知仍可使用领域 Inbox，不能因用户队列迁移删除其 codec 或通知职责。

Cordis emit 仅通知事实变化；订阅端重新读取快照。通知失败不能撤回 durable commit。干预事件的 waterfall/serial 等模式按公开 `@mode` 契约使用，不再造第二套事件总线。

## 资源与证据

Session 通过 `session.store` 使用 `session.storage`，生产 JSONL Provider 和测试内存 Provider 实现同一契约。关闭必须等待资源静止，失败继续尝试其他资源并报告；超时只结束等待，不意味着资源已经释放。

实现入口：`runtime/src/startup/boot.ts`、`runtime/src/harness/managed-runs.ts`、`agent-service/src/{application,service,run-manager,task-ledger}.ts`。

继续阅读：[Runtime 生命周期](agent-target-runtime-architecture.md)、[存储边界](agent-spec-session-core-persistence-separation.md)、[重构决定](agent-harness-host-refactor-decisions.md)、[测试策略](agent-testing.md)。测试与实际 UI/Provider/发行制品验收分别记录。
