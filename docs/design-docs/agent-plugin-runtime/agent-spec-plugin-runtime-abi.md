# ActSpace v2 插件 Runtime ABI 设计规范

> 状态：v2 公共契约基线；其中 Host-facing `RuntimeHandle` 表述已被 [Profile-first Runtime 决策](./agent-decision-profile-first-headless-desktop.md) superseded，当前由 `BootedProfile` 与 Profile App Bundle Service 承担对应边界。
>
> 本文固定插件 Runtime 的信任边界、组合语义、生命周期和失败行为。字段名、TypeScript API、错误码与 JSON Schema 仍需在实现前做字段级评审，但不得改变本文已经确认的语义。
>
> 确认日期：2026-08-22。

## 1. 目标与适用范围

ActSpace v2 使用 DSH 维护发布的 `@deepseek-ai/cordis` 系列承载插件生命周期，在其上定义 ActSpace 自有的插件 ABI。该 ABI 服务于 Desktop 与 CLI headless Profile 的后端 Runtime，不进入 renderer，也不把 Cordis 类型暴露给 Host、Session 或 IPC。

本文只规范 v2 后端插件 Runtime：

- 哪些来源可以装载；
- 插件在执行代码前必须声明什么；
- Profile / Bundle / Patch 如何得到唯一的启动组合；
- 插件贡献如何注册、冲突、卸载和诊断；
- 固定前端、Host capability 和 Runtime restart 如何限制插件；
- Startup Validation、`RuntimeHandle` 和 shutdown 的共同语义。

Session 事件 payload、Tool、Prompt、LLM 和 Agent 的领域 ABI 由各自规范负责。它们必须服从本文的身份、生命周期和 Host ceiling，但不在本文中展开字段。

## 2. 固定所有权边界

| 层 | 拥有 | 不拥有 |
|---|---|---|
| Trusted Boot | 插件 ABI 版本、来源与信任校验、root Cordis Context、组合解析、Startup Validation、诊断、`RuntimeHandle` 发布与关闭 | 具体工具、Prompt、Provider 或产品工作流 |
| Cordis Runtime | Fiber、Service 依赖、Effect、激活与可等待卸载 | ActSpace Session 格式、Host 权限、安全沙箱或产品兼容策略 |
| ActSpace 领域 Provider | Session、Prompt、Tools、LLM、Agent Registry、Agent Loop 等领域语义 | 绕过 Trusted Boot 扩大 Host 能力 |
| Host Adapter | 进程环境、credential resolver、审批交互、TTY / IPC / stdout 和进程退出 | 第二套插件装载器、Agent Loop 或 Session writer |

普通插件不能替换 Trusted Boot、插件 ABI、Host ceiling 或 `RuntimeHandle` 边界。Base Profile 中的领域 Provider 可以替换，但不能无替代地缺失。

## 3. v2 信任模型与允许来源

v2 只执行**明确受信任、同进程**的后端插件代码。允许来源限定为：

| 来源 | 接纳条件 |
|---|---|
| ActSpace 内置插件 | 随应用制品发布，版本和内容进入构建 provenance |
| 本地路径插件 | 由用户或发行配置显式选择；启动时解析真实路径并记录内容身份，不从扫描目录自动执行未知代码 |
| npm 插件 | 使用精确包版本安装到 ActSpace 管理的 runtime directory，记录 lockfile integrity 和解析后的实际入口 |

“受信任”表示 ActSpace 或用户明确授权它与 Runtime 同进程执行，不表示代码已经被沙箱隔离。Cordis isolate、Context 或 Fiber 都不是安全沙箱。

v2 明确不支持：

- URL 直接装载、远程脚本和运行时下载后立即执行；
- 插件市场、签名信任链、自动更新和不可信发布者代码；
- 依靠 Cordis isolate 执行恶意或半可信代码；
- 把任意外部二进制声明成另一种 Cordis 插件入口。

Browser Bridge 等外部进程是由受信任的同进程 Provider 管理的 Host capability 资源。其进程、socket、文件和关闭责任归该 Provider 的 activation Effect，不形成第二套插件种类。

## 4. Static Manifest、Codec 与 Behavior 分离

每个插件包必须提供三个职责分离的入口。物理文件名和 module export 名称在字段级评审中确定。

| 部分 | 允许内容 | 禁止内容 | 装载时机 |
|---|---|---|---|
| Static Manifest | JSON-safe 身份、版本、契约范围、入口声明、Host / frontend 要求、配置 schema 和 codec 索引 | 执行函数、动态 getter、环境探测和副作用 | 任何插件行为代码之前 |
| Codec Module | Session durable event 的纯 schema、criticality、解码、投影和纯升级链 | 网络、文件写入、注册业务 Service、启动进程或依赖行为插件已激活 | Session decode 和行为激活之前 |
| Behavior Entry | 通过 ActSpace 领域 API 注册 Service、Tool、Prompt、LLM、Agent 等贡献 | module evaluation 顶层资源副作用、改写静态全局 Registry、扩大 Host ceiling、运行 renderer 代码 | trust、schema、contract、codec 和组合校验之后 |

启动顺序必须保证：

1. 根据 Profile / Bundle 的来源引用读取 Static Manifest，不 import Behavior Entry；
2. 完成来源、Static Manifest schema 和 `runtimeContract` 校验；
3. 解析 Profile / Bundle / Patch 和稳定 Entry tree，应用 Host ceiling，再校验最终 JSON-safe 配置、required capability 和身份冲突；
4. 从 Core 和全部显式登记、受信任且已安装插件的静态元数据中发现并验证 Codec Modules，形成可用 codec catalog；本次组合、Session header 与事件命名空间只确定所需子集，不能作为唯一发现来源，Behavior Entry 最终是否激活也不影响 codec 可用性；
5. 才允许 import、activate Behavior Entry；
6. Loader settlement 和 Startup Validation 全部通过后，才发布 `RuntimeHandle`。

Codec Module 与 Behavior Entry 分离是恢复前提，不是打包风格偏好。一个需要先激活行为代码才能读取其历史事件的插件不符合本 ABI。

Behavior module evaluation 必须是资源无副作用的：不得在顶层启动进程、打开 socket、创建 watcher / timer、注册全局 listener 或修改外部状态。所有资源获取和贡献注册只能发生在 activation Effect 内，才能进入统一的失败回滚与可等待回收。

Codec discovery 与 Behavior activation 是两条独立路径。一个 optional Entry 因 Host 或 frontend 不兼容而跳过 Behavior，或者曾写入事件的插件后来不再位于当前组合中，都不得因此失去读取既有 Session 事件所需的 codec。Session 引用的 codec 仍必须来自本文允许的显式安装可信来源并通过 `runtimeContract`、身份和纯度校验；Runtime 不扫描任意目录、不自动下载，也不因日志中出现 plugin id 就执行未知代码。无法取得 required codec 时按 Session 兼容规则阻止 resume / 新写入，但仍保留 raw browse / forensic export 能力。

## 5. Manifest 的语义 Schema

Static Manifest 至少表达以下字段组；这里固定语义，不固定最终字段拼写：

| 字段组 | 必须表达的语义 |
|---|---|
| Identity | 全局稳定 plugin id、发布版本、可诊断名称 |
| Runtime contract | 兼容的 ActSpace Runtime ABI 范围，以及不兼容时的 fail-closed 结果 |
| Entrypoints | Behavior Entry 与可选 Codec Module 的可解析模块位置 |
| Configuration | JSON-safe 配置 schema、默认值边界和 secret reference 位置 |
| Host requirements | required / optional Host capabilities；不能声明 Host 未提供的权限 |
| Frontend requirements | 无前端、optional contribution 或 required contribution |
| Contributions | 可用于启动前冲突检查和诊断的声明性 contribution 摘要 |

`runtimeContract` 是 ActSpace ABI 的兼容性声明，不等于 npm package version，也不等于 Cordis version。缺失、无法解析或与当前 Runtime 不相交时，插件不得尝试降级激活。

Manifest、Profile、Bundle、Patch 和用户配置都必须是 JSON-safe 数据。禁止函数、class instance、Symbol、动态表达式和 `!!js`。secret 只允许以 `credentialRef` 等不含明文的引用出现；解析后的凭据不得进入 config dump、Session 或 diagnostics。

## 6. 稳定身份与冲突规则

v2 至少有五类稳定身份：

- plugin id：标识发布和 durable event 命名空间；
- Entry id：标识组合树中的可 patch 激活行；
- Service id：标识领域 Service 契约；
- Event type id：标识 durable event，插件事件位于 `plugin/<plugin-id>/<event>` 命名空间；
- contribution id：标识 Tool、Prompt、LLM route、Preset 等领域贡献。

这些 id 必须满足：

- 同一解析范围内唯一，重复注册一律 fail-fast，禁止 `Map.set` 式静默覆盖；
- 诊断必须同时给出冲突双方的 plugin、Entry 和来源层 provenance；
- Entry id 在 Bundle、Patch 和 config dump 之间保持稳定，不能使用随机值或 Fiber uid；
- 发布版本、event schema version 与稳定 id 分离，升级版本不能隐式制造新身份；
- 只有领域契约明确声明的 shadow / override 机制可以改变可见性，普通注册冲突不能伪装成覆盖。

id 字符集、长度、大小写和保留命名空间在实现前字段级评审中固定。

## 7. Profile / Bundle / Patch 组合

三者职责固定如下：

- **Profile**：用户或发行渠道选择的命名配方，声明 ordered Bundles、Profile patch、外部插件引用、Host compatibility、runtime contract range 和 credential refs。
- **Bundle**：可分发的插件代码引用与默认 Entry 行集合；它不是运行实例，也不拥有用户配置。
- **Patch**：按稳定 Entry id 插入、禁用或整对象替换配置；`config` 不做隐式 deep merge。

v2 组合顺序固定为：

```text
empty root
  -> kernel/base bundle
  -> profile ordered bundles
  -> Host surface bundle
  -> profile patch
  -> user-home patch
  -> invocation patch
  -> Host capability ceiling
```

同一个 composer 必须同时服务启动、config dump 和诊断。解析结果形成不可变的 `ResolvedComposition` / `BootManifest`，至少记录 Profile、Bundle 与插件版本、patch digest、resolved Entry tree、来源层、Host ceiling 和 runtime contract。它只是本次解析证据，不拥有运行实例、Fiber 或全局 generation。

Patch target 不存在时绝不能静默成功。修改、禁用或锚定插入的 operation 默认是 required，target miss 使 Composition 解析失败；只有显式标记为 optional 的 operation 才允许跳过并产生带来源的 warning。config dump 必须展示每个 operation 的 applied / skipped / failed 结果。

## 8. Effect-owned Contribution

所有运行时贡献必须通过 ActSpace 领域注册 API 提交，并由创建它的 activation Effect 拥有。范围包括但不限于：

- Service、Tool definition / executor、Prompt / Context contributor、LLM route 和 Preset；
- Event listener、timer、watcher、subprocess、socket、临时目录和子插件；
- approval waiter、in-flight Tool / LLM lease 及其他异步任务。

每次注册必须返回或纳入可等待 disposer。插件进入 draining 后不得接收新工作；卸载完成意味着它拥有的任务和资源已经静止并完成必要 flush，而不只是 Registry 中查不到名称。

插件不得：

- 写入模块级可变 Registry；
- 在 disposer 返回后继续产生事件或持有 Host 资源；
- 把资源回收责任推给 `process.exit`；
- 通过另一个插件的私有对象绕开 Service / contribution 契约。

## 9. Host Capability Ceiling

Host 在 Boot 时提供 capability ceiling，Composition 的最后一步只能减少 ActSpace 领域 API 授予的能力，不能增加能力。插件和 Patch 均不能通过 ActSpace 配置或注入 handle 获得 Host 未提供的网络、文件写入、浏览器、TTY、审批交互、credential、renderer 或进程能力。

该 ceiling 是受信任插件的 admission 与 capability-handle 契约，不是对同进程恶意代码的 OS 安全边界。同进程插件仍可能直接调用 Node API；如果未来要抵御这类行为，必须另行引入进程隔离、系统权限和不可信代码协议，不能扩大本文的安全声明。

插件声明 required capability 而 Host 不具备时，该插件 Entry 不兼容：

- 若 Profile 或 Base capability 把该 Entry 视为 required，Startup Validation 失败，Runtime 不启动；
- 若该 Entry 是 optional，跳过整项行为激活并输出结构化诊断；
- 不允许在缺少 required capability 时做 degraded activation。

optional capability 缺失时，只能关闭明确标为 optional 的 contribution，且最终 manifest 和 diagnostics 必须反映实际能力。

## 10. 固定前端与 `frontend.required`

v2 renderer 不插件化。后端插件不能向 renderer 安装、发送或执行 JavaScript、React component、CSS 或 HTML。

- optional frontend contribution：忽略前端部分，允许后端在其他要求满足时激活，并记录诊断；
- `frontend.required=true`：固定前端 Host 将该插件判为不兼容，拒绝整项行为激活；
- required Entry 因此前端不兼容时 Boot 失败；optional Entry 则跳过并报告原因；
- 不存在“后端先激活、前端 required 但静默降级”的中间状态。

工具和 Agent 状态必须通过 ActSpace 固定投影契约进入前端。未知内置 renderer 使用 generic fallback；这不等于执行插件提供的 renderer。

## 11. Restart-only 生产基线

v2 生产 Runtime 只支持 restart-only：

- 插件安装、移除、升级、Behavior code 变化、Profile / Bundle / Patch 或生效配置变化，都不对当前 root Context 做在线 reconcile；
- Runtime 可以报告候选变化和 `restart required`，但当前 `ResolvedComposition` 与已激活贡献保持不变；
- 应用更新配置的唯一方式是完成有界 shutdown，再按完整 Boot 流程创建新的 root Context；
- 不启用 `cordis-plugin-hmr`，不提供 live reload、双实例零中断切换或 previous-tree 在线恢复承诺；
- 不引入全局 `CompositionGenerationManager` 或 StandingMount 来掩盖在线更新问题。

领域内的 PreparedCall、prepared Tool execution 和 request snapshot 仍用于保护一次已经开始的工作，但不构成在线刷新能力。

## 12. Startup Validation 与发布门禁

Trusted Boot 必须按顺序完成以下检查：

1. 来源在允许集合内，解析后的实际路径、版本和 integrity 与声明一致；
2. Static Manifest、配置和 `runtimeContract` 合法；
3. plugin / Entry / Service / Event / contribution identity 无非法冲突；
4. required Host 与 frontend capability 均可满足；
5. required Event Codec 在行为激活和 Session decode 前可用；
6. Cordis Loader settlement 成功；
7. enabled Entry 有对应 Fiber，且均为 `ACTIVE`，不存在 `FAILED`、`PENDING` 或其他非健康状态；
8. Base Profile 声明的 Session、Prompt、Tools、LLM、Agent Registry、Agent Loop 等 required Provider 完整；
9. diagnostics 和脱敏后的 BootManifest 可以生成。

任一步失败都不得向 Host 发布可运行 `RuntimeHandle`。disabled 或因 optional incompatibility 被明确跳过的 Entry 不参与 active Fiber 检查，但必须出现在 manifest 和 diagnostics 中。

## 13. `RuntimeHandle` 语义契约

每个 Host 进程只 boot 一个 Runtime 实例。Desktop、CLI run 和 CLI chat 共享同一 `RuntimeHandle` 语义，但通常各自在自己的进程中持有一个实例。

Runtime 内部生命周期是 `booting -> ready -> quiescing -> disposed`。Host 只在 `ready` 后拿到句柄；Boot 失败不会发布半可用句柄。`restartRequired` 是诊断状态，不是允许继续变更组合的生命周期状态。

`RuntimeHandle` 至少拥有以下语义能力，最终方法名留到 API 评审：

- 读取当前不可变 BootManifest、Host ceiling 和结构化 diagnostics；
- 创建、恢复可继续执行的 main Session，以及列出和检查全部可读 Session；一次性 child Session 只允许 inspect / browse / export，run / resume admission 必须拒绝；
- 启动 turn、向 main Agent 提交 `next-step` / `next-turn` durable input、订阅稳定 Runtime 投影事件、取消 active work；
- 执行 Session durability flush；
- 停止接收新工作、进入 quiescence 并完成可等待 dispose；
- 报告配置或插件变化需要 restart。

Host 不得通过句柄取得 Cordis root Context、Fiber、Session writer、插件实例或具体 AgentLoop class。

## 14. Diagnostics 契约

诊断至少覆盖：

- Profile、resolved manifest digest、config revision 和来源层；
- package / plugin version、实际入口、integrity 与 runtime contract；
- Entry enabled / disabled / skipped、Fiber state、缺失 Service 和冲突 provenance；
- ignored optional frontend、rejected required frontend 和 Host capability mismatch；
- Codec compatibility、Session degraded / blocked 原因；
- in-flight lease、pending disposer、watcher、timer、subprocess 和 quiescence failure；
- startup failure、restart-required reason 和 shutdown 未完成项；
- 脱敏后的 exact config dump。

diagnostics 是 Host UI 和 CLI stderr 的来源。它不进入模型上下文，不替代 durable Session facts，也不得包含 secret、Authorization header 或完整环境变量。

## 15. Shutdown 契约

所有 Host 遵循同一关闭顺序：

1. `RuntimeHandle` 进入 `quiescing`，拒绝新 run、resume 和配置变更；
2. 级联取消 active turn，并按领域策略等待已经 dispatch 的 Tool / LLM 工作 drain；
3. 解决或取消 pending approval；
4. flush Session writer；
5. quiesce Agent、watcher、timer、subprocess 和其他 Effect-owned 资源；
6. dispose root Cordis Context，并等待剩余 Fiber / Effect cleanup；
7. 标记 `disposed` 后，Host 才退出进程。

第一次退出信号执行有界 graceful shutdown。第二次信号可以强制退出，但必须先输出未完成 flush、lease 和 disposer 的诊断。Desktop app quit 同样必须等待 dispose 结果。

## 16. 明确不做

- 不支持不可信插件隔离、签名市场或自动更新。
- 不支持插件前端代码。
- 不支持生产 HMR、在线 reconcile、live reload 或零中断插件替换。
- 不把 Cordis Context、Fiber 或 Service object 作为公共 Host / IPC API。
- 不允许插件覆盖 Host ceiling、Trusted Boot 或稳定身份冲突规则。
- v2 主分发采用 managed ESM runtime；strict standalone SEA 不在 v2 范围内。

## 17. 实现前字段级评审清单

以下内容需要在首个 ABI implementation plan 前形成 JSON Schema、golden fixtures 和错误样例；它们不是重新选择架构方向：

- Manifest、Profile、Bundle、Patch、BootManifest 与 diagnostics 的精确字段名和 schema version；
- plugin / Entry / Service / Event / contribution id 的字符规则与保留命名空间；
- `runtimeContract` 的首个版本值、range 语法和兼容矩阵；
- Behavior / Codec module specifier、package exports 和 managed runtime directory 布局；
- Patch required miss 的 fatal 与 explicit optional miss 的 warning 的精确表示；
- optional Entry、required capability 和 skip reason 的精确表示；
- `RuntimeHandle` 方法、事件 DTO、状态枚举和稳定错误码；
- graceful shutdown timeout、第二次信号和强制终止的数值默认值；
- npm integrity、local-path content identity 和 config dump 的 canonical 编码。
