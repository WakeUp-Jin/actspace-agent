# DeepSeek Harness 架构研究

> **状态**：研究基线，已完成当前快照的源码审计；不是 ActSpace v2 目标架构，也不是实施计划。
>
> **研究快照**：`tmp/deepseek-harness`，Git commit `47f943859bef60e4160492346772ded9b24f765a`（短哈希 `47f943859bef`）。
>
> **研究日期**：2026-08-22。
>
> **证据口径**：结论以该快照中的实现源码、包声明和本地 vendor 修改记录为准。文中路径均相对 ActSpace 仓库根目录，并附源码行号。DSH 自己明确处于 pre-release 阶段，允许拒绝旧的磁盘格式，因此这里记录的是一个精确快照，而不是稳定兼容承诺（`tmp/deepseek-harness/packages/core/session/src/types.ts:34-56`）。

## 1. 研究范围与阅读方式

本文排除了各 Provider 的业务细节和大多数具体工具实现，研究的是它们共同依赖的运行骨架：

- Cordis 的插件生命周期、依赖注入、事件和资源回收；
- Loader / Include / HMR 与 Profile / Bundle / Patch 的部署组合；
- Agent、Session、SystemPrompt、LLM、Tools、Scope、Preset 形成的核心语义链；
- Persistence、Compaction、Approval、Subagent、Workflow 等可选能力缝；
- Host、Client、Dynamic Cordis 三套扩展体系及其边界。

每个主题尽量固定区分三类结论：

- **源码事实**：该快照实际做了什么；
- **ActSpace 可借鉴机制**：机制层面的价值，不等于已经选定目标设计；
- **不可直接照搬 / 风险**：实现前提、已知缺口或与 ActSpace 当前约束不一致的地方。

这里的“可借鉴”不表示需要复制 DSH 的包拆分、API 名字或磁盘格式；“风险”也不表示机制没有价值，而是说明复制代码不能自动获得相同性质。

## 2. 总体判断：DSH 不是“一个插件系统”，而是五层共同工作

DSH 的实际结构不能只概括为“Cordis 加一些 Agent 插件”。完整运行链至少有五层：

1. **固定引导层**：先创建 Cordis `Context`、安装 Loader、挂 Include，再做全树激活审计。加载插件的机制本身不能由普通插件加载（Host 启动见 `tmp/deepseek-harness/packages/boot/app-boot/src/index.ts:727-801`；Client 的同类引导例外见 `tmp/deepseek-harness/packages/client/modules/src/client/index.ts:1-9`）。
2. **部署组合层**：Profile 按顺序选择 Bundle patch，再叠加 profile / home / CLI patch，最终得到 Loader entry tree（`tmp/deepseek-harness/packages/boot/app-boot/src/profile.ts:357-419`）。
3. **Agent 语义层**：AgentLoop 驱动 Turn / Step，Session 记录事实，SystemPrompt 和 Tools 组装一次具体模型边界，LLM 适配器执行请求。
4. **可选能力层**：持久化、压缩、审批、子 Agent、Workflow 都通过独立 Service Definition / Provider / Consumer 组合，不是 AgentLoop 内部硬编码。
5. **产品呈现层**：Web Client 自己拥有一棵 Cordis 树和一套浏览器模块系统；动态 Cordis 又在静态 Host / Client 体系之上提供模型编写代码的运行时。

因此，“除了具体插件，其他都可以复用”的准确含义只能是复用这些层之间的契约思想。DSH 的行为还依赖它维护的 Cordis fork、Profile 组合规则、Session 事件格式和 Web boot 协议；这些并不是可独立摘取的一组工具函数。

## 3. Cordis 运行底座

### 3.1 Context：能力视图与生命周期入口

**源码事实**

`Context` 同时提供插件挂载、Service 读取、事件、`inject`、`effect`、隔离与拦截等入口；根 Context 会预装 Fiber、Reflect、Registry、Events 和 Logger 等框架服务（`tmp/deepseek-harness/vendor/cordis/src/context.ts:16-40`、`tmp/deepseek-harness/vendor/cordis/src/context.ts:70-83`）。子 Context 通过原型链继承父视图；`isolate()` 创建的是服务解析 realm / namespace，而不是新进程或权限沙箱（`tmp/deepseek-harness/vendor/cordis/src/context.ts:90-125`）。

Context 的价值不在“把对象都挂到 `ctx` 上”，而在于每次读取和注册都可追踪到当前 Fiber，从而把依赖、资源所有权和卸载联系起来。

**ActSpace 可借鉴机制**

- 让一个作用域对象同时承担能力查找和资源归属，避免插件拿到无主的全局单例；
- 子上下文继承父能力，但局部注册可以覆盖全局能力；
- 服务访问发生在可追踪调用边界，运行时可知道“谁依赖了谁”。

**不可直接照搬 / 风险**

- `Context` 隔离是名称解析隔离，不是安全隔离；不可信代码拿到危险 Service 仍可执行危险操作；
- DSH 大量依赖 TypeScript module augmentation 扩充 `Context`，规模扩大后会形成全局类型命名空间和字符串 Service 名的耦合；
- Context 同时承担较多职责，若没有明确的 Host Adapter 边界，插件容易绕过更上层的产品权限模型。

### 3.2 Service 与 Inject：依赖可用性驱动激活

**源码事实**

Service 注册由当前 Effect 拥有；同一 realm 中重复提供同名 Service 会失败，并通知依赖它的 Fiber 刷新（`tmp/deepseek-harness/vendor/cordis/src/reflect.ts:267-304`）。读取 Service 时，Reflect 会检查调用方是否声明注入，并沿父 realm 查找（`tmp/deepseek-harness/vendor/cordis/src/reflect.ts:144-167`）。

`ctx.inject(required, callback)` 不是一次性的“拿到依赖后调用”：依赖出现时运行，依赖消失或替换时卸载原回调，再在新依赖上重建（`tmp/deepseek-harness/vendor/cordis/src/registry.ts:164-185`、`tmp/deepseek-harness/vendor/cordis/src/reflect.ts:314-335`）。因此 DSH 多处强调 Loader entry 的排列顺序不承载激活语义，真正的顺序来自 Service 可用性（`tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml:12-13`）。

**ActSpace 可借鉴机制**

- 把“能力是否可用”作为插件激活条件，而不是依赖配置文件行序；
- Provider 热替换时，Consumer 的旧资源与新资源有结构化重建路径；
- Definition / Provider / Consumer 可独立变化，适合 LLM、Persistence、Subagent 等真正存在多实现的能力。

**不可直接照搬 / 风险**

- 未满足的 inject 会让 Fiber 长期 `PENDING`；DSH 依赖启动后的全树 sweep 才把它转换成可见失败，而不是依赖超时（Host：`tmp/deepseek-harness/packages/boot/app-boot/src/index.ts:651-725`；Client：`tmp/deepseek-harness/packages/client/web/src/boot.tsx:210-236`）；
- Service 名、注入声明和实际访问之间仍可能漂移，必须保留启动审计和诊断；
- 所有 Provider 都放在同一进程时，可替换性不等于故障隔离或权限隔离。

### 3.3 Fiber 与 Effect：插件实例和资源所有权

**源码事实**

每次插件挂载形成一个 Fiber。Fiber 有 `PENDING`、`LOADING`、`ACTIVE`、`FAILED`、`UNLOADING`、`DISPOSED` 状态，并持有配置、依赖和 Effect（`tmp/deepseek-harness/vendor/cordis/src/fiber.ts:139-203`）。依赖满足后，Fiber 才运行插件；依赖变化会触发刷新（`tmp/deepseek-harness/vendor/cordis/src/fiber.ts:299-319`）。

Fiber uid 由 registry 分配，用来标识一个 Fiber 对象；dispose 后该 uid 会被清空。config-only `fiber.update()` 可以在同一个 uid 上 restart，因此 uid 不是“每次激活的代际号”。Consumer 的 dependency epoch 会纳入 Provider Fiber uid，用于发现依赖实现集合发生变化并触发重建（`tmp/deepseek-harness/vendor/cordis/src/registry.ts:195-208`、`tmp/deepseek-harness/vendor/cordis/src/fiber.ts:184-194`、`tmp/deepseek-harness/vendor/cordis/src/fiber.ts:234-268`、`tmp/deepseek-harness/vendor/cordis/src/fiber.ts:611-638`）。

Effect 把 setup 和 cleanup 绑定到所有者 Fiber，卸载时按结构化顺序回收。DSH 的 vendored fork 特别修复了可重入 setup / dispose、异步 cleanup、卸载期间继续注册 Effect 等边缘问题（实现见 `tmp/deepseek-harness/vendor/cordis/src/fiber.ts:402-520`；本地修改说明见 `tmp/deepseek-harness/vendor/README.md:38-43`）。

**ActSpace 可借鉴机制**

- 每一项事件监听、工具注册、Prompt 贡献、定时器和子插件都必须有同一个可等待的所有者；
- 卸载不是“删掉注册表一行”，而是等待该实例拥有的异步工作进入静止状态；
- 插件更新必须定义明确的停止、启动和恢复边界；DSH Loader 会在候选模块导入成功后先卸载旧实例，再启动候选，候选启动失败时尝试重启旧插件，因此只能描述为 last-good 恢复路径，不能描述为新旧实例无缝切换。

**不可直接照搬 / 风险**

- 正确的可重入卸载非常复杂。DSH 对 upstream Cordis 做了大量本地加固，直接使用 npm 上游版本不保证具有同样语义；
- Fiber 是进程内生命周期单元，不是线程、进程或权限容器；
- Effect 只会清理通过它登记的资源。插件自行创建的全局监听、未跟踪 Promise 或外部进程不会自动被 Cordis 找到。

### 3.4 Event：实时控制面，不等于事实日志

**源码事实**

Cordis 提供并行 `emit`、顺序 `serial` 和可改写值的 `waterfall` 等事件模式；waterfall listener 不调用 `next()` 就会截断后续链（`tmp/deepseek-harness/vendor/cordis/src/events.ts:125-130`、`tmp/deepseek-harness/vendor/cordis/src/events.ts:177-243`）。通过 `ctx.on` 注册的 listener 是 Effect，Fiber 卸载时会注销（`tmp/deepseek-harness/vendor/cordis/src/events.ts:245-259`）。

DSH 把这些事件主要用于当前运行的控制和观察，例如 `agent/pre-step`、`agent/request`、`tools/pre-execute`；已经发生且必须重放的事实则进入 Session，而不是假设事件总线可重放。

**ActSpace 可借鉴机制**

- 明确区分通知、顺序协调、值改写和可否决链，不用一个含义模糊的 EventEmitter 承担所有语义；
- listener 的生命周期跟随插件实例；
- 实时控制事件和可恢复事实使用不同载体。

**不可直接照搬 / 风险**

- waterfall 的“未调用 `next()` 即否决”很强但不直观，错误 listener 可静默截断后续机制；
- listener 顺序会成为行为的一部分，若缺少顺序契约和调试信息，插件组合很难解释；
- 进程内事件参数通常是借用对象，不能当作跨进程、持久化或不可信输入边界。

## 4. Loader、Include 与 HMR：部署树如何成为活的 Fiber 树

### 4.1 Loader：Entry 到 Fiber 的事务边界

**源码事实**

Loader 管理有稳定 id 的配置 Entry，并把模块导入结果挂成 Fiber。涉及模块名、inject 或 group 的 replacement 时，它先导入候选模块；导入成功后卸载旧 Fiber，再启动候选 Fiber。候选启动失败时，Loader 尝试用旧 plugin 和旧 config 重启原 Entry（`tmp/deepseek-harness/vendor/loader/src/config/entry.ts:141-246`）。这是 teardown-first replacement 加 restart-old rollback，不是候选实例完整激活后再切换旧实例。

启动不以“Loader Promise 已结束”作为成功，而会检查每个 Entry 是否有 Fiber，以及 Fiber 是否为 `ACTIVE`；fiberless import、`FAILED` 和未满足依赖的 `PENDING` 都会汇总失败（`tmp/deepseek-harness/packages/boot/app-boot/src/index.ts:651-725`）。

**ActSpace 可借鉴机制**

- Entry 身份、插件模块、运行实例三者分开；
- 模块候选在卸载旧实例前完成导入校验，启动失败后有重启旧插件的恢复路径；
- 启动成功必须基于全树激活事实，而不是“没有抛出顶层异常”。

**不可直接照搬 / 风险**

- Loader replacement 会中断旧实例，且重启旧插件也可能失败；它不提供零停机切换或外部副作用事务回滚；
- Loader 依赖 Cordis Fiber 的精确 update / dispose 语义，不能单独复制；
- 动态导入失败可能留下没有 Fiber 的 Entry，因此任何控制台或配置 UI 都应区分“配置存在”和“实例运行”；
- Node 模块身份、pnpm 安装布局、源码面与构建产物面都会影响 Loader 实际导入的代码。

### 4.2 Include：补丁组合与子树事务

**源码事实**

Include 读取 Entry 列表，对 clone 应用 patch，再更新子树；只有 parse、validate、patch 和子树 reconcile 全部成功后，才提交缓存内容与数据（`tmp/deepseek-harness/vendor/include/src/index.ts:240-321`）。同一个 Include 的所有 tree mutation 被串行化，因为 Group update 本身不可重入（`tmp/deepseek-harness/vendor/include/src/index.ts:174-229`）。

补丁以稳定 `id` 定位行；同一 patch list 中后续补丁可以命中先前插入的行。找不到目标会告警并跳过；`config` 是整值替换，不做深合并（`tmp/deepseek-harness/vendor/include/src/index.ts:43-128`）。

**ActSpace 可借鉴机制**

- 配置组合使用一个规范化 patch 算法，启动、dump 和热更新不各自重写；
- 候选文档和当前生效文档分离，失败时继续运行 last-good；
- patch identity 使用稳定 id，不依赖数组位置。

**不可直接照搬 / 风险**

- “目标不存在只告警”会把拼写错误变成部分生效的配置；
- `config` 整体替换降低合并歧义，但要求每个后层完整重述配置，遗漏字段会意外丢失默认外的前层设置；
- `!!js` 允许部署配置执行表达式；base bundle 直接读取 `process.env` 和 `process.cwd()`（`tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml:148-175`），因此该配置格式属于可信代码面，不是普通用户数据面。

### 4.3 HMR：模块缓存更新，不是新的生命周期模型

**源码事实**

HMR 监听模块与配置变化，清除 Node ESM / CJS 缓存后重新导入，并在失败时尝试恢复旧模块和插件（`tmp/deepseek-harness/vendor/hmr/src/index.ts:445-547`）。配置 HMR 最终仍进入 Include / Loader 的串行事务；HMR 本身没有绕开 Fiber 生命周期。DSH 还对精确配置文件监听、初始扫描抑制和失败广播做了本地修改（`tmp/deepseek-harness/vendor/README.md:40-47`）。

**ActSpace 可借鉴机制**

- HMR 只负责发现新候选和使模块身份更新，真正的提交 / 回滚仍由统一生命周期管理；
- 模块内容变化与插件集合变化分开处理；
- 热更新失败应保留 last-good 实例，并留下可观察的失败事实。

**不可直接照搬 / 风险**

- Node ESM / CJS 缓存处理高度依赖运行时细节，升级 Node、打包器或 Electron 都可能改变行为；
- HMR 无法回滚插件已经写出的外部副作用；
- DSH 的保证来自 vendor fork 上多项互相配合的修复，不是安装 Cordis HMR 包即可获得。

## 5. Profile、Bundle、Patch：DSH 的组合产品模型

**源码事实**

Profile 是一个带 manifest 的目录，其 `dsh.profile.bundles` 按顺序列出 Bundle 包；每个 Bundle 通过 `dsh.bundle.patch` 指向 patch 文件。找不到 Bundle 或 Bundle 未声明 patch 都会失败（`tmp/deepseek-harness/packages/boot/app-boot/src/profile.ts:357-402`）。所有层在空 root 上用同一个 `applyEntryPatches` 组合成最终 Entry 列表（`tmp/deepseek-harness/packages/boot/app-boot/src/profile.ts:405-419`）。

base bundle 不是“小内核”。它一次插入 LLM、Session、Agent、Persistence、Approval、Sandbox、Tools、SystemPrompt、AgentLoop 等大量默认包，是一个有明确产品取向的发行组合（`tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml:1-15`、`tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml:24-205`、`tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml:424-437`）。

**ActSpace 可借鉴机制**

- 把“有哪些能力”作为版本化部署数据，而不是散落在启动代码的条件分支；
- Bundle 表达一组可复用的组合增量，Profile 表达产品 / 用户选择，Patch 表达最后覆盖；
- dump 出来的有效配置与真正 boot 使用同一算法，利于审计和复现。

**不可直接照搬 / 风险**

- 在 DSH 中，Profile / Bundle / Patch 不是可晚补的外围功能，而是静态插件如何进入系统的主路径；附件把它放到第三阶段，会丢掉 DSH 设计成立的组合前提；
- 多层 patch 叠加会产生目标 id 漂移、整配置覆盖和顺序依赖；
- DSH 的 base bundle 绑定自己的产品能力和包拓扑，不能视作 ActSpace 的通用核心清单。

## 6. Agent 与 AgentLoop：生命周期身份和执行机器是两件事

### 6.1 Agent Registry：发布、所有权与因果归属

**源码事实**

`AgentRegistry` 保存 live Agent，Agent 的创建由注册的 `AgentFactory` 提供；当前实现由 AgentLoop 包提供工厂（`tmp/deepseek-harness/packages/core/agent/src/index.ts:245-260`、`tmp/deepseek-harness/packages/core/agent/src/index.ts:390-429`）。异步创建先完成 setup，再发布 Agent；失败时不暴露半初始化实例（`tmp/deepseek-harness/packages/core/agent/src/index.ts:450-508`）。

DSH 明确分开四种关系：

- **runtime owner**：哪个 live Agent 的 Context 创建并拥有子 Agent；
- **scope parent**：能力查找链上的父 Scope；
- **durable lineage**：Session header 的 `parentSession` 等可恢复关系；
- **initiator**：`AsyncLocalStorage` 中当前同进程异步调用链的因果发起者。

源码直接说明 runtime owner 独立于 durable lineage，并且 initiator 只是因果归属，不是存活证明或授权（`tmp/deepseek-harness/packages/core/agent/src/index.ts:221-260`、`tmp/deepseek-harness/packages/core/agent/src/index.ts:459-468`）。

**ActSpace 可借鉴机制**

- 构造、setup、发布、运行、销毁是有提交点的生命周期；
- 运行时所有权、能力继承、历史父子关系和权限授权不能复用同一个 `parentId`；
- Agent 的公开注册必须晚于关键能力组合完成。

**不可直接照搬 / 风险**

- AsyncLocalStorage 只在同进程异步链中可靠，跨 worker、进程、持久化和 wire 都必须显式传 identity；
- Agent 与 Session 共用 id 是 DSH 的具体约束（注册时强校验，`tmp/deepseek-harness/packages/core/agent/src/index.ts:474-482`），不是 Agent 架构的普遍定律；
- 复杂的发布 / 回滚顺序依赖精确 disposer identity，容易被看似无害的 wrapper 破坏。

### 6.2 Turn / Step：AgentLoop 的真实边界

**源码事实**

Turn 在第一次 claim 之前先记录 `turn/start`。`preStep` claim inbox、组装 prompt / tools、投影动态上下文，再运行可否决的 `agent/pre-step`（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:225-266`）。如果第一批消息被移除或改写为空，Turn 可以没有任何模型请求，但仍会有 start / end 边界（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:271-276`）。

一个 Step 记录 `step/start`，把本步输入写入 Session，构建请求、消费流、记录 assistant message，并执行模型产生的工具调用；有工具结果时可以进入下一 Step（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:279-399`）。所有退出路径最终写 `turn/end`，失败和取消也成为结构化结束原因（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:302-329`）。

**ActSpace 可借鉴机制**

- Turn 是一次驱动占用和 durable commit / recovery 边界，Step 是一次模型请求及其顶层工具调用；
- 每个可取消、可失败的路径都有配对结束事实；
- pre-step 是上下文、队列与策略进入模型之前的统一协作点。

**不可直接照搬 / 风险**

- “Turn = 一次完整用户任务”只是产品层近似；源码允许零 Step Turn，也允许 inbox 注入使一个 Turn 包含后续工作；
- DSH AgentLoop 的事件格式、retry 协议和工具调度彼此耦合，不能只复制 while-loop；
- 实时 chunk 全量入日志可能带来体积、隐私和性能成本，必须连同持久化策略理解。

## 7. Session：追加事实、Surface 与模型历史

**源码事实**

`Session` 是普通的 event-sourced class，不是 Cordis Service。它维护 append-only log、不可变 Header 和一个增量 SurfaceManager（`tmp/deepseek-harness/packages/core/session/src/index.ts:417-447`）。seed / restore 会验证 lossless JSON、连续 `seq` 和 Surface 转换；`seq` 永远等于 log length（`tmp/deepseek-harness/packages/core/session/src/index.ts:499-566`）。

`append()` 先快照并验证 event，再同步 push 到内存 log。事件一旦进入 log 就是逻辑提交；observer 异常逐个隔离，不改变提交结果。但热路径明确不等待 I/O，Persistence 在后台缓冲（`tmp/deepseek-harness/packages/core/session/src/index.ts:569-655`）。

模型历史不是 raw log 的简单过滤。每个 message-producing event 声明 `surfaceOp`；`deriveMessages()` 遍历当前 Surface。Compaction 的 replace 会让旧节点继续留在 raw log 中，但不再进入模型历史（`tmp/deepseek-harness/packages/core/session/src/index.ts:701-747`、`tmp/deepseek-harness/packages/core/session/src/surface.ts:1-19`）。

SurfaceManager 的 `replaceGeneration` 只在成功提交 positional replacement 时递增，普通 append 不会改变它；它是 replacement cache invalidation counter，不是 Session 或整个 Surface 的通用版本号（`tmp/deepseek-harness/packages/core/session/src/surface.ts:136-164`、`tmp/deepseek-harness/packages/core/session/src/surface.ts:361-370`、`tmp/deepseek-harness/packages/core/session/src/surface.ts:431-435`）。

`request/header` 保存一次请求边界的有效 model config、system prompt 和 tool schemas，只在初始 / 恢复 / 变化时追加；`request/context` 保存 route 与 context window 的变化（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:458-493`）。

**ActSpace 可借鉴机制**

- 分离 immutable raw facts、model-visible Surface 和由 Surface 派生的 Messages；
- 任何真正进入模型历史的动态内容都有可重放的 Surface event；
- 请求边界保存“模型实际看到的有效快照”，而不是只保存配置引用。

**不可直接照搬 / 风险**

- `Session.append` 的“durable source of truth”是逻辑语义，不代表此时已经 fsync；附件把 Live / Durable 只分成两层会遮蔽内存提交与物理持久化之间的窗口；
- `request/header` 能证明某次请求使用了什么，不能单独证明是哪个插件版本贡献了它；插件 provenance 需要另外的组合 / 生命周期事实；
- 事件 schema 和 Surface 替换规则是长期兼容面。DSH 当前格式仍是 pre-release v0，可拒绝不兼容日志；
- 全量 raw log 保存模型输入、工具输出和 chunks，天然是敏感数据集合。

## 8. SystemPrompt：静态 System 与动态 Runtime Context 分轨

**源码事实**

SystemPrompt 同时管理四类输入：有序 section、动态 context、tool schema provider 和变量。Section 与 PromptContext 是两套注册表，重复名称分别失败（`tmp/deepseek-harness/packages/core/system-prompt/src/index.ts:52-120`）。组装时按 Scope 合并，最近 Scope 覆盖同名全局项；收集 tool schemas、排序 section / context，再经过 `system-prompt/assemble` waterfall（`tmp/deepseek-harness/packages/core/system-prompt/src/index.ts:457-542`）。

最终 system prompt 由 section 渲染。动态 context 不直接拼成 system string，而是在 pre-step 后通过 `RuntimeContextProjection` 形成 `user` role snapshot；只有内容变化或清空时才追加，并带来源 section 信息（`tmp/deepseek-harness/packages/core/agent-loop/src/runtime-context.ts:24-75`、`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:225-239`）。

**ActSpace 可借鉴机制**

- 把稳定身份 / 规则与随运行变化的事实分轨；
- 每个贡献有名称、顺序、Scope 和 Effect owner，卸载后不会残留字符串；
- 动态上下文变化进入 Session，可解释模型何时开始或停止看到某项事实。

**不可直接照搬 / 风险**

- 附件把 dynamic context 列为普通 Prompt Section，这是错误的；两者角色、持久化方式和 message role 都不同；
- 数字 `order` 是全局协调面，插件多时会出现隐式编号协议；
- waterfall 可以改写最终 assembly，若没有 provenance 记录，仅看 request/header 无法反推出贡献链。

## 9. LLM：Adapter 注册与精确请求快照

**源码事实**

LLM 包定义 provider-neutral 的 Message、StreamChunk、ToolSchema 和 GenerateOptions 词汇（`tmp/deepseek-harness/packages/llm/llm/src/types.ts:1-5`、`tmp/deepseek-harness/packages/llm/llm/src/types.ts:283-317`）。Adapter 按 provider / model route 注册；重复 route 失败（`tmp/deepseek-harness/packages/llm/llm/src/index.ts:280-395`）。

`prepareCall()` 解析准确 model capability / defaults，捕获 exact `AdapterRegistration`、resolved frozen config、retry policy 和调用上下文，并返回绑定的 one-shot `PreparedLlmCall`。即使 HMR 在日志记录和真正 dispatch 之间替换 Adapter，同一次请求仍使用同一份解析结果；这不等于深拷贝 Adapter 对象内部的所有可变状态（`tmp/deepseek-harness/packages/llm/llm/src/index.ts:154-171`、`tmp/deepseek-harness/packages/llm/llm/src/index.ts:771-813`）。Adapter 抛出的 Provider 错误会归一为 terminal stream chunk；Consumer / middleware 自己的失败仍保持 throw，避免混淆责任边界（`tmp/deepseek-harness/packages/llm/llm/src/index.ts:838-926`）。

AgentLoop 在收到 error / aborted finish 后，通过 `agent/request-error` waterfall 决定是否重试（`tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:339-370`）。

**ActSpace 可借鉴机制**

- AgentLoop 只依赖规范化消息和流协议，不直接 import Provider SDK；
- 一次请求先 resolve，再冻结 route、defaults、prompt 和 tools，防止热更新造成半新半旧；
- Provider failure 与调用者 / middleware failure 分开建模。

**不可直接照搬 / 风险**

- 统一协议只能覆盖交集和显式扩展，Provider 特有能力仍需要 capability 描述；
- StreamChunk 规范、Tool Schema 和 replay state 会成为核心兼容面；
- 重试发生在 Agent 语义层，必须同时考虑已提交 chunks、取消和 Provider 是否产生外部计费，不能视作普通函数重试。

## 10. Tools：注册、可见性、策略和执行调度

**源码事实**

ToolRuntime 的定义包含参数 schema、规范化输出、render / presentation metadata、execute 和 finalizer；执行管道有 `pre-execute`、`execute`、`post-execute`、`result`、`change` 等事件（`tmp/deepseek-harness/packages/core/tools/src/index.ts:137-247`）。

工具可以全局或按 Scope 注册；同名的最近 Scope 项覆盖全局项。Restriction 沿 Scope 链求交，局部上下文不能扩宽祖先限制（`tmp/deepseek-harness/packages/core/tools/src/index.ts:1031-1193`）。只有明确声明 `concurrencySafe === true` 的工具才允许并行，否则视作 exclusive（`tmp/deepseek-harness/packages/core/tools/src/index.ts:1270-1285`）。

执行阶段依次物化参数、运行 pre hook、审批和 guard，再进入带取消融合的 execute，等待 body 静止后执行 post、finalizer 和 result observer（`tmp/deepseek-harness/packages/core/tools/src/index.ts:1328-1675`）。

这里没有提供与 `PreparedLlmCall` 完全等价的整调用 registration lease：staged path 会提前保存 finalizer，但在审批后 dispatch body 时再次按名称解析工具实现（`tmp/deepseek-harness/packages/core/tools/src/index.ts:1364-1418`、`tmp/deepseek-harness/packages/core/tools/src/index.ts:1532-1550`）。因此“同一次工具调用从准备到执行绝不跨注册”若成为 ActSpace 不变量，需要由 ActSpace Tool Runtime 额外实现，不能声称 DSH 已经完整提供。

但是，模型一次返回多个顶层 tool call 时，exclusive barrier、并发窗口以及 durable `tool/call` / `tool/result` 的模型顺序由 AgentLoop 的 scheduler 管理。即使 body 并发，结果和上下文仍按模型顺序提交；取消后会 drain 已开始调用，并为未开始调用生成 skipped 结果（`tmp/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:1-10`、`tmp/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:112-288`）。

**ActSpace 可借鉴机制**

- 具体工具 body 与注册、可见性、审批、并发、取消、呈现和 durable commit 分离；
- Scope restriction 单调收窄，子层不能自行放宽祖先限制；
- ToolRuntime 负责单调用策略，AgentLoop scheduler 负责一批顶层调用的确定性提交顺序；
- 具体工具保留的可行性来自稳定 ToolDefinition / execution contract，而不是保留旧 ToolRuntime 全部实现。

**不可直接照搬 / 风险**

- 附件把 Session 的 `tool/result` 记录归给 ToolRuntime；实际 durable call / result 由 AgentLoop scheduler 追加；
- `concurrencySafe` 只是插件作者声明，错误声明会产生真实竞态；
- post hook 可替换、阻断结果或追加上下文，组合顺序会显著改变模型所见事实；
- Cordis 自动卸载只能清理已登记的工具和 finalizer，不能撤销工具已经造成的文件、网络或进程副作用。

## 11. Scope 与 Preset：能力可见性和组合实例

### 11.1 Scope

**源码事实**

DSH Scope 使用 opaque `ScopeKey` 与可绑定父链；绑定时检查循环（`tmp/deepseek-harness/packages/core/scope/src/index.ts:14-82`）。`createScope()` 创建一个持有 scoped Context 的 Cordis Fiber，dispose 会清理该 Scope 内的 Effect（`tmp/deepseek-harness/packages/core/scope/src/index.ts:93-146`）。Scope-aware Store 合并 global 与 scope layers，最近层覆盖同名项（`tmp/deepseek-harness/packages/core/scope/src/store.ts:152-266`）。

Scope 事件只向匹配 key 及其祖先链传播（`tmp/deepseek-harness/packages/core/scope/src/index.ts:158-185`）。但只有显式使用 DSH Scope Store / scopeTarget 的能力才受这条链约束；普通 Cordis Service 和任意全局状态不会自动隔离。

**ActSpace 可借鉴机制**

- 把能力视图、事件路由和资源 owner 绑定到同一个 Agent Scope；
- shadow 用于替换，restriction 用于单调收窄，两者语义分开；
- Scope identity 使用 opaque key，不把用户可控字符串当作权限凭证。

**不可直接照搬 / 风险**

- Scope 不是安全沙箱，也不是所有插件天然遵守的隔离；
- Scope parent 是能力查找关系，不应自动等同于 Session lineage 或 Agent owner；
- 一个插件若直接注册全局 Service、使用进程全局变量或绕过 scope-aware registry，仍会跨 Agent 可见。

### 11.2 Preset

**源码事实**

Preset 不是为每个 Agent 重跑一次 Cordis 配置。`AgentPresets` 为每个 preset id 维护 single-flight 的 standing mount；多个 Agent 把自己的 Scope parent 绑定到同一个 standing Scope（`tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts:241-287`）。

组合文件 stamp 变化后，Preset 移除当前 standing pointer，并为后续加入者创建新的 StandingMount；已经加入的 Agent 继续使用旧 mount。这里的“generation”只是 Preset 内部的 standing-mount 代际，没有公开数值 generation 或全局 manager。当前源码明确有 TODO：旧 mount 在进程生命周期内不会按最后一个 Agent 离开而回收（`tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts:490-533`）。

子 Agent 不是按 preset id 重新解析，而是绑定到父 Agent 正在使用的同一个 StandingMount，以保证其工具和 Prompt 与父历史一致（`tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts:290-324`）。随后再在 child Scope 中加 persona 和 restriction（`tmp/deepseek-harness/packages/subagent/subagent/src/child-agent.ts:141-175`）。

DSH 没有统一的 Composition Generation 组件。Cordis Fiber、Loader Entry、Preset StandingMount、Session `replaceGeneration` 和 one-shot prepared LLM call 分别拥有自己的身份或一致性边界，不能合并推导成一个 Runtime 全局代际协议。

**ActSpace 可借鉴机制**

- Preset 表达可共享、带 standing-mount 代际的能力组合，Agent 只加入某一已结算实例；
- 配置文件更新不偷换运行中 Agent 的能力视图；
- 子 Agent 继承父 Agent 的精确 StandingMount，再叠加自己的局部限制。

**不可直接照搬 / 风险**

- 附件的 `Global -> Preset -> Parent Agent -> Child Agent` 线性图过于简单；父 Agent 的临时局部注册不会因“子 Agent”关系自动成为子 Scope 的父层；
- standing mount 中的插件对象和 watchers 被多个 Agent 共享，插件内部可变状态必须明确是共享还是 scoped；
- 当前旧 StandingMount 回收未完成，频繁编辑组合文件会累积活子树。

## 12. Persistence：逻辑提交与物理耐久之间的桥

**源码事实**

SessionPersistence 定义 create、append、load / inspect / prepare、readFrom 等存储缝，Session 本身不依赖具体后端（`tmp/deepseek-harness/packages/session/session-persistence/src/index.ts:78-221`）。写入采用 per-session write-behind：按序缓冲，后台失败保留原 batch，显式 `flush()` 才是调用方可等待的 durability barrier（`tmp/deepseek-harness/packages/session/session-persistence/src/write-behind.ts:18-71`、`tmp/deepseek-harness/packages/session/session-persistence/src/write-behind.ts:138-157`）。

Checkpoint policy 在发起模型请求前、执行顶层有副作用工具前和 pre-step 边界执行 flush，并且失败关闭（`tmp/deepseek-harness/packages/session/session-checkpoint-policy/src/index.ts:20-82`）。这减少“模型 / 工具已经向外发生，但前序事实仍只在内存”的窗口。

冷恢复会检查未闭合 Turn / Tool。对已启动但无结果的工具，修复事件区分 `TOOL_NOT_STARTED` 和 `TOOL_OUTCOME_UNKNOWN`，后者明确不能盲目重试（`tmp/deepseek-harness/packages/core/session/src/repair.ts:1-27`、`tmp/deepseek-harness/packages/core/session/src/repair.ts:89-132`）。Persistence coordinator 只对冷 Session 做 repair，并拒绝修复仍 live-open 的 Session（`tmp/deepseek-harness/packages/session/session-persistence/src/coordinator.ts:891-984`）。未知且非 ignorable 的必需事件类型会拒绝读取（`tmp/deepseek-harness/packages/session/session-persistence/src/coordinator.ts:1051-1065`）。

**ActSpace 可借鉴机制**

- 明确三种时点：内存 append 提交、后台写入、显式 durability checkpoint；
- 在不可重放的外部动作前建立持久化屏障；
- crash repair 不伪造工具成功，保留“结果未知”这一事实；
- 存储后端可替换，但 canonical event / repair 语义保持在上层。

**不可直接照搬 / 风险**

- JSONL / SQLite Provider 可替换不代表日志格式自由变化；Session event schema 才是兼容核心；
- write-behind 必然存在进程崩溃窗口，checkpoint 只能缩小而不能消灭；
- crash repair 需要工具幂等性、外部操作 id 或人工判断配合，单靠日志无法推断外部世界状态。

## 13. Compaction：保留 raw history，改写 model Surface

**源码事实**

Compaction 核心包只定义 engine、trigger 和 policy seam；基础自动策略通过 `agent/pre-step` 触发，并可在 context overflow 后仅当 Surface replacement generation 真正前进时重试请求（`tmp/deepseek-harness/packages/compaction/compaction/src/index.ts:87-169`、`tmp/deepseek-harness/packages/compaction/compaction-basic/src/index.ts:126-223`）。

一次 compaction 选择一个连续 Surface 区域，校验不能拆开 tool-call / tool-result 配对，写 durable `compaction/start`，生成摘要后重新校验选区未变化，再 append replacement Surface event 和 `compaction/end`，最后可执行 persistence flush（`tmp/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:137-254`、`tmp/deepseek-harness/packages/compaction/compaction-basic/src/region.ts:314-335`）。

另有独立的 tool-result pruner，不调用模型也可用 replacement event 缩减旧工具结果（`tmp/deepseek-harness/packages/compaction/compaction-tool-result-pruner/src/index.ts:124-183`）。

**ActSpace 可借鉴机制**

- 压缩不删除事实，而是追加一个显式、可审计的 Surface 替换；
- 选择、摘要、重校验、提交和 flush 构成事务，避免摘要期间历史变化后错误覆盖；
- 语义摘要和机械裁剪是不同 Provider。

**不可直接照搬 / 风险**

- 保留 raw log 意味着磁盘和隐私成本不会因模型上下文变短而消失；
- 摘要会丢失语义细节，replacement provenance 必须可检查；
- tool-call / result 配对、动态上下文 snapshot 等 Surface 规则与 Session schema 紧密耦合。

## 14. Approval：动作审批，不是通用插件安全边界

**源码事实**

UserApproval 是一个可选能力缝。一次 request 必须发生在 open Turn 中，先 append `approval/asked`，无论允许、拒绝、取消或不可用都 append 配对的 `approval/decided`；唯一 grant 是 `allowed-once`（`tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:34-102`、`tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:239-275`）。

策略为 `ask` 或 `never`。没有 answerer、answerer 抛错、返回非法值都会归一为 `unavailable`；取消为 `cancelled`，都不是授权（`tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:298-344`）。ToolRuntime 如果发现需要审批但 Service 缺失或失败，同样 fail closed（`tmp/deepseek-harness/packages/core/tools/src/index.ts:1678-1728`）。

Dynamic Cordis 的 Client half 激活另有一套 package / version approval 流程；Host-only dynamic package 可以直接完成 Host 激活（`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:823-880`）。这不是 UserApproval Service 自动覆盖的通用代码加载审批。

**ActSpace 可借鉴机制**

- 决策请求和结果成对进入事实日志，授权只绑定一个具体 action；
- 缺失交互面与异常都失败关闭；
- 权限策略变化本身持久化，并通过动态上下文告知模型。

**不可直接照搬 / 风险**

- 附件把 Approval 描述成动态插件加载的统一安全层，不符合源码；工具动作审批与动态 Client 激活审批是两个机制；
- 用户同意某个 Client package 不会把 `node:vm` 变成安全边界，也不限制 Host Service 本身的权限；
- 审批只能决定是否尝试动作，不能保证动作实现正确、可撤销或无越权路径。

## 15. Subagent：Provider seam、独立 Session 与四种关系

**源码事实**

Subagent 核心包定义命名 Provider registry、one-shot / continuable runtime，以及 follow-up、interrupt、report 等控制面；具体 spawn / resume 由 Provider 包实现（`tmp/deepseek-harness/packages/subagent/subagent/src/index.ts:1-29`、`tmp/deepseek-harness/packages/subagent/subagent/src/index.ts:170-309`）。核心注释明确这是 same-process trusted boundary，不是远程权限协议。

child Session header 记录 `parentSession`、delegation depth、seed boundary 和实际 preset，保证冷读时可恢复 lineage 与组合身份（`tmp/deepseek-harness/packages/subagent/subagent/src/child-agent.ts:85-119`）。child 先加入父 Agent 的同一 Preset StandingMount，再安装自己的 delegation context、persona 和 tool restriction（`tmp/deepseek-harness/packages/subagent/subagent/src/child-agent.ts:141-175`）。具体 `spawn-in-process` Provider 创建 fresh child Session，不自动把父模型上下文当作共享可变内存（`tmp/deepseek-harness/packages/subagent/subagent-spawn-in-process/src/index.ts:1-64`）。

**ActSpace 可借鉴机制**

- Subagent Definition、Provider 和 tool / UI Consumer 分开；
- child 有自己的 Session 与 durable lineage，运行时 owner 负责 teardown；
- composition inheritance 绑定父 Agent 的精确 Preset StandingMount，permission restriction 再单调收窄；
- continuable handle 是显式能力，不假设所有 Provider 都支持 follow-up / interrupt。

**不可直接照搬 / 风险**

- runtime owner、scope parent、durable parentSession 和 initiator 不能混为一个“父 Agent”；
- same-process Provider 可借用对象和 Context，不能直接作为跨进程协议；
- child 是否 seed 父历史是 Provider / creation request 的语义，不能从 `parentSession` 自动推导。

## 16. Workflow：编排能力缝与一个 Worker Provider

**源码事实**

Workflow 核心包只定义 `WorkflowEngine.start()`、typed failure、run handle 和 `workflow/start|phase|log|agent-start|agent-end|end` 观察事件。事件 listener 的异常被隔离，执行结果仍由 run holder 拥有（`tmp/deepseek-harness/packages/workflow/workflow/src/index.ts:1-4`、`tmp/deepseek-harness/packages/workflow/workflow/src/index.ts:31-186`）。

一个具体 Provider 在 fresh worker thread 中执行模型编写的脚本，并把 `agent()` 调用桥接回 Host Subagent service。源码明确说明 worker 避免同步脚本阻塞 Host 并允许强制终止，但 escapable `vm` 只是 containment，不是 security boundary（`tmp/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts:1-6`、`tmp/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts:133-201`）。

**ActSpace 可借鉴机制**

- AgentLoop 不内置复杂 Workflow DSL；Workflow 是可替换 Provider；
- run handle、观察事件和最终结果分开，observer 不能改变结果所有权；
- worker 线程用于阻塞隔离和强制终止，安全声明保持诚实。

**不可直接照搬 / 风险**

- Worker 和 `vm` 都不等于恶意代码沙箱；
- Workflow 脚本可大规模启动 Subagent，必须有并发、总量、取消和 teardown 上限；DSH Provider 将这些作为配置（`tmp/deepseek-harness/packages/workflow/workflow-worker-thread/src/index.ts:31-49`）；
- Workflow 是 DSH 的可选 Provider，不应因其存在就推断 AgentLoop 必须支持脚本编排。

## 17. Host / Client 与三套扩展体系

DSH 中至少有三套名字相似但职责不同的扩展体系。它们共享 Cordis 生命周期思想，却不是同一个加载器。

### 17.1 体系一：静态 Host 插件

**源码事实**

Profile / Bundle / Patch 产生 Host Loader Entry，Loader 导入 Node package 的插件面并挂成 Fiber。Host 插件运行在主进程信任域，可提供 Service、监听事件、注册工具，也可声明 `dsh.client` 让 Web 侧发现对应 Client half。

Host boot 的固定代码先创建 `new Context()`、安装 Loader、挂 Include、等待 tree settlement，最后 sweep Entry 激活状态（`tmp/deepseek-harness/packages/boot/app-boot/src/index.ts:727-801`）。所以“所有东西都是普通插件”并不严格成立：引导器、Loader 和配置解释器是受信任的框架底座。

### 17.2 体系二：静态 Client 插件

**源码事实**

Web Host 扫描当前 active Host Loader entries。包的 `package.json` 若声明 `dsh.client.platform: web`，还必须导出 `./client` bundle；声明格式错误或 bundle 缺失会在 Web 组合时失败，而不是静默跳过（`tmp/deepseek-harness/packages/client/modules/src/index.ts:46-142`、`tmp/deepseek-harness/packages/client/modules/src/index.ts:177-249`、`tmp/deepseek-harness/packages/client/modules/src/index.ts:332-400`）。

Host 把 Client graph 注入页面，并按内容 hash 提供 bundle。插件集合的 metadata verdict 缓存到重启；bundle 内容变化才走 rebuilt / HMR（`tmp/deepseek-harness/packages/client/modules/src/index.ts:1-20`、`tmp/deepseek-harness/packages/client/modules/src/index.ts:268-317`）。

浏览器先由 shell kernel 构造 `ClientModuleSystem`，再创建独立的 `new Context()` 和 Client Loader。原因是“加载插件的模块系统不能由它自己加载”（`tmp/deepseek-harness/packages/client/modules/src/client/index.ts:1-33`、`tmp/deepseek-harness/packages/client/web/src/boot.tsx:97-168`）。Client Entry 也依赖 inject 激活，并在 boot 后 sweep 所有 Entry；`PENDING` Client 插件会让 Web boot fail loud（`tmp/deepseek-harness/packages/client/web/src/boot.tsx:185-236`）。

**ActSpace 可借鉴机制**

- Host / Client 是两个运行时、两棵 Context / Fiber 树和两个构建产物；
- package identity 可把双面插件关联起来，但每一面独立声明依赖和生命周期；
- Client boot graph 有内容 revision、依赖边和统一激活审计。

**不可直接照搬 / 风险**

- DSH Web 不支持“Host 插件正常加载，但其已声明的 Client half 只记日志并忽略”这一语义。只要 active Host package 声明 `dsh.client`，Client bundle 就是 Web 组合契约的一部分；
- Headless 部署天然没有 Web Client plane，但这不同于 Web 部署中选择性忽略某个 Client half；
- Client 模块系统使用自建 lazy CJS factory、classic script 和同步 `require` 语义，并明确把 factory cycle 视为失败（`tmp/deepseek-harness/packages/client/modules/src/client/system.ts:53-177`），不能直接套到现有 Electron / Vite 前端而假设构建边界不变。

### 17.3 体系三：Dynamic Cordis

**源码事实**

Dynamic Cordis 是静态系统之上的产品能力。模型通过 `cordis_define` 创建 immutable Package source，通过 `cordis_run` 激活精确版本，再用 `cordis_stop` 或 `cordis_undefine` 管理实例；define 只做参数 / 语法检查和记录，不执行代码（`tmp/deepseek-harness/packages/extensions/tool-cordis/src/index.ts:148-238`）。

Host runner 的 registry 是 process-local，并以 Session id 校验 definition ownership；每个 Plugin 最多一个 active run（`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:123-201`、`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:1219-1249`）。Host source 在受限 facade 中求值，最终仍挂到 root 下的 `cordis-dynamic` group Fiber；停止时 dispose Fiber（`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:883-915`、`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:1219-1239`）。

Host sandbox 禁用常见 Node global 并引导代码通过 Service，但源码明确承认 host-realm helper 是逃逸路径，`node:vm` 不是 containment；timeout 也只限制同步求值，async body 可逃逸（`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/sandbox.ts:1-10`、`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/sandbox.ts:216-237`）。

Client source 由浏览器 runner 取回，以 `new Function` 在独立 closure / facade 中求值，再以 `dyn/<pluginId>` 注册进现有 Client module table 和 Loader，因此仍获得 Fiber cleanup 和 inject parking（`tmp/deepseek-harness/packages/extensions/cordis-client-runner/src/client/evaluator.ts:160-221`、`tmp/deepseek-harness/packages/extensions/cordis-client-runner/src/client/runtime.ts:1-14`、`tmp/deepseek-harness/packages/extensions/cordis-client-runner/src/client/runtime.ts:155-180`）。页面刷新后 Client dynamic package 默认不自动恢复；Host 进程内仍可能保有 definition（`tmp/deepseek-harness/packages/extensions/cordis-client-runner/src/client/index.ts:1-10`）。

**ActSpace 可借鉴机制**

- “定义 immutable source version”和“激活某个版本”分开；
- 动态代码不发明第二套注册表，而是经过 guard 后进入同一 Fiber / Effect 生命周期；
- Plugin id、Package id、Run id 分开，能够识别版本与 stale activation；
- Host / Client half 独立结算，跨面调用只传 JSON。

**不可直接照搬 / 风险**

- Dynamic Cordis 不是静态插件加载器的别名，也不是普通 Profile plugin 的 HMR；
- definition 和版本主要在进程内，重启会丢失；Client 页面刷新也不自动重放；
- ownership 只限制谁可以管理 definition。Host half 挂在 root dynamic group，若注册全局能力，仍可能影响同进程其他 Session；
- `node:vm`、浏览器 `new Function` 和 facade 都是协作式约束，不是恶意代码安全边界；
- Dynamic Client approval 是单独产品流程，不能替代 Host capability 权限或通用工具审批。

## 18. 四个状态平面：比 Live / Durable 二分更准确

附件提出 Live Plane / Durable Plane 的方向是对的，但 DSH 源码实际至少需要四个平面才能解释故障与恢复：

| 平面 | 典型内容 | 权威性与生命周期 |
|---|---|---|
| Live control | Cordis Event、Fiber state、inbox、pending approval、正在运行的 tool body | 当前进程协调事实；通常不可重放 |
| Logical fact log | `Session.append()` 后的 event 与 Surface metadata | 已在内存逻辑提交；observer 不能撤销，但未必已落盘 |
| Model request snapshot | `request/header`、`request/context`、`deriveMessages()` 的具体边界 | 证明某次请求实际使用的配置、system、tools 与历史投影 |
| Physical durability | Persistence backend 已确认的有序前缀、flush checkpoint、cold repair | 进程崩溃后可恢复的事实边界 |

这四层之间的关键转换是：

1. 实时控制决定是否允许某件事发生；
2. `Session.append` 把结果变成不可变逻辑事实；
3. Surface 与 request snapshot 说明模型实际看到什么；
4. write-behind / flush 决定进程崩溃后能恢复到哪里。

**ActSpace 可借鉴机制**：任何重构研究都应分别回答“现在发生什么”“内存中已经承诺什么”“模型实际看到了什么”“磁盘上能恢复什么”，避免用一个 `messages` 数组或一个 EventEmitter 同时承担四种责任。

**不可直接照搬 / 风险**：DSH 自己也不是所有 provenance 都在 request snapshot 中。例如 `request/header` 记录有效工具 schema，却不记录贡献该 schema 的静态插件 package revision；完整可解释性仍需要组合与生命周期证据。

## 19. 对附件《dsh 的分析》的主要校正

以下不是否定附件的整体方向，而是用源码收紧容易影响后续设计判断的表述。

| 附件表述 | 源码校正 | 关键证据 |
|---|---|---|
| `Turn = 一次完整的用户任务过程` | Turn 是一次驱动占用和 durable 边界。它在 claim 前打开，允许零 Step，也可因 next-step inbox 包含后续工作。 | `tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:245-329` |
| ToolRuntime 负责“记录结果” | ToolRuntime 负责单工具执行管道；AgentLoop 的 tool-call scheduler 负责顶层 `tool/call` / `tool/result` 的 durable 顺序。 | `tmp/deepseek-harness/packages/core/tools/src/index.ts:1328-1675`；`tmp/deepseek-harness/packages/core/agent-loop/src/tool-calls.ts:112-288` |
| Session Log 一旦 append 就等同于 Durable Plane | append 是不可撤销的内存逻辑提交，热路径明确不等 I/O；Persistence write-behind 与 flush checkpoint 才决定物理耐久。 | `tmp/deepseek-harness/packages/core/session/src/index.ts:569-655`；`tmp/deepseek-harness/packages/session/session-persistence/src/write-behind.ts:18-71` |
| dynamic context 是 Prompt Section 的一种 | 静态 section 渲染到 system；dynamic context 经 RuntimeContextProjection 作为 `user` role snapshot 进入 Surface，并在变化 / 清空时追加。 | `tmp/deepseek-harness/packages/core/system-prompt/src/index.ts:457-542`；`tmp/deepseek-harness/packages/core/agent-loop/src/runtime-context.ts:24-75` |
| 子 Agent 直接继承父 Agent Scope 的能力 | 子 Agent 加入父 Agent 当前 preset 的同一 StandingMount，再有自己的 child Scope。父 Agent 的任意 agent-local 注册不会因 lineage 自动继承。 | `tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts:290-324`；`tmp/deepseek-harness/packages/subagent/subagent/src/child-agent.ts:141-175` |
| Preset 是可以后加的外围能力 | 在 DSH 中 Preset 是 Agent 如何加入部署组合的核心路径；它共享 StandingMount，并处理领域内一致性，不是每 Agent 的配置便利层。 | `tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts:241-324` |
| `request/header` 可以解释“为什么某工具出现” | 它能证明该请求边界确实包含某 schema，但不能单独证明哪个插件版本贡献了它；provenance 需要组合 / lifecycle 事实。 | `tmp/deepseek-harness/packages/core/agent-loop/src/agent.ts:458-493` |
| Approval 是动态代码加载的统一安全决策层 | UserApproval 保护具体 action / tool ask；Dynamic Cordis 的 Client activation 有另一套 approval。Host-only dynamic half 不经过通用 UserApproval。 | `tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:239-344`；`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/index.ts:823-880` |
| Profile / Bundle / Patch 是第三阶段外围能力 | 对 DSH 而言它们就是静态插件树的部署来源；若研究其插件加载，不能把组合语义从核心机制中拿掉。 | `tmp/deepseek-harness/packages/boot/app-boot/src/profile.ts:357-419` |
| Dynamic Cordis 等同于普通 Cordis 动态 mount | 它是额外的会话归属、immutable version、Host / Client runner、approval 和 inspect 产品协议；普通静态插件仍由 Profile + Loader 管理。 | `tmp/deepseek-harness/packages/extensions/tool-cordis/src/index.ts:148-327` |
| Scope 就等于安全隔离 | Scope 只约束使用 scope-aware registry / dispatch 的能力；Cordis isolate、Scope 和 `node:vm` 都不是权限或进程边界。 | `tmp/deepseek-harness/packages/core/scope/src/store.ts:152-266`；`tmp/deepseek-harness/packages/extensions/cordis-host-runner/src/sandbox.ts:1-10` |

附件中以下判断则被源码支持，应保留：

- Cordis 管生命周期，DSH 定义 Agent 语义；
- raw Session log 与模型可见 Surface 分离；
- LLM Provider 经规范化 seam 进入 AgentLoop；
- Dynamic Cordis 定义与运行分离，版本 immutable；
- VM 不是安全边界，动态定义主要在进程内；
- 具体工具实现可以与 ToolRuntime / AgentLoop 的平台机制分开评估。

## 20. 可借鉴机制清单与直接复制风险

这一节只汇总研究结论，不给出 ActSpace v2 API 或实施顺序。

| 机制 | ActSpace 可借鉴的性质 | 不能随代码自动复制的前提 |
|---|---|---|
| Fiber + Effect | 插件实例拥有全部注册与异步 cleanup，可等待卸载 | DSH vendor fork 的可重入生命周期修复 |
| Service + Inject | 能力可用性驱动激活，Provider 替换触发 Consumer 重建 | 全树启动审计、明确 Service identity、同进程故障边界 |
| Loader replacement + rollback | 候选模块先导入，旧实例随后卸载；候选启动失败时尝试重启旧插件 | 不是零停机切换，旧插件恢复也可能失败，外部副作用不可回滚 |
| Canonical patch composition | boot、dump、HMR 使用同一组合语义 | patch target 漂移、整配置替换、可信 `!!js` 配置面 |
| Agent publication lifecycle | setup 完成后才公开 live Agent | 精确 owner / disposer 顺序和跨边界 identity |
| Session + Surface | raw facts、model history、request snapshot 分离 | 事件 schema 兼容、敏感数据治理、持久化窗口 |
| Prompt section + dynamic context | 稳定规则与运行事实分轨，贡献可按 Scope 卸载 | order 协调、waterfall provenance、role 语义 |
| Prepared LLM call | 一次请求绑定精确 Adapter / defaults 快照 | Provider capability 差异、流协议长期兼容 |
| Tool Definition / Runtime / scheduler 分层 | 可保留具体工具 body，同时替换平台注册、策略和调度 | 并发声明真实性、外部副作用、结果 commit 规则 |
| Scope + monotonic restriction | 最近层覆盖、祖先限制不可放宽 | 只对主动采用 scope-aware API 的代码生效 |
| Preset StandingMount | 多 Agent 共享结算组合，运行中不被文件更新偷换 | 共享可变状态、旧 mount 回收 |
| Write-behind + checkpoint | 低延迟 append 与关键外部动作前的耐久屏障兼得 | 崩溃窗口和 outcome-unknown 仍然存在 |
| Surface compaction | 不改旧事实，用 replacement 控制模型窗口 | 摘要丢失、存储不缩小、Surface 规则复杂 |
| Approval audit pair | 决策与结果可重放，缺失交互 fail closed | 不是代码沙箱，也不能替代 capability 限制 |
| Subagent seam | Provider 可替换、child Session 独立、lineage 显式 | owner / scope / lineage / initiator 必须分开 |
| Workflow seam | 编排从 AgentLoop 解耦，worker 可强制终止 | Worker / VM 不是安全边界 |
| Host / Client 双树 | 两个运行时独立生命周期和依赖审计 | 现有前端构建、IPC 与产品兼容策略不同 |
| Dynamic Cordis version / run identity | definition、package version、activation 分离 | process-local、跨 Session 污染、动态代码不可信 |

## 21. 研究结论

1. DSH 最值得研究的不是“所有功能都做成插件”，而是把 **组合身份、依赖激活、资源所有权、Agent 事实、模型边界和物理耐久** 分开后，再用明确的转换点连接起来。
2. Cordis 的核心价值是 Fiber / Effect / Inject 共同形成的可卸载依赖图；只复制 `ctx.plugin()` 或 Service registry 得不到这一性质。
3. Session / Surface / request snapshot 是 DSH Agent 语义的中心。AgentLoop、Tool scheduler、Compaction、Approval 和 Persistence 都围绕这条事实链协作。
4. Scope 是能力可见性机制，不是安全边界；Preset 使用领域内 StandingMount 保持组合一致性，不是每 Session 重挂插件，也不是全局 Composition Generation。
5. DSH 的静态 Host、静态 Client、Dynamic Cordis 是三套不同扩展系统。尤其在 Web 模式下，DSH 把声明过的 Client half 视为组合契约，不提供“后端加载、前端忽略”的现成语义。
6. Dynamic Cordis 展示了 immutable package、run identity 和统一 lifecycle 的价值，也同时暴露了 process-local、root-scope、VM 非安全边界和刷新不恢复等限制。
7. DSH 的很多强保证来自 vendored Cordis / Loader / Include / HMR 的本地补丁。任何复用判断都必须以这些实际差异为依据，而不能只对照 upstream Cordis 文档或 npm 包名（`tmp/deepseek-harness/vendor/README.md:1-5`、`tmp/deepseek-harness/vendor/README.md:29-50`）。

本文至此只建立 DSH 当前实现的可信研究基线。ActSpace 目标边界、兼容承诺、保留的具体工具、前端非插件化策略和 ContextManager 如何进入模型上下文，属于后续设计文档的决策内容，不在本研究稿中预设答案。
