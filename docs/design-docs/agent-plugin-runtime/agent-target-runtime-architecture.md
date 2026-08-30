# ActSpace v2 Runtime 与 Composition 目标设计

> 状态：历史目标基线，已被 [Profile-first Runtime 决策](./agent-decision-profile-first-headless-desktop.md) superseded。
>
> 本文保留 RuntimeHandle 时代的目标推导和取舍证据；当前实现不再使用 RuntimeHandle/RuntimeFacade，也不保留 CLI chat 生产入口。实现、入口和验收以 Profile-first 决策与执行记录为准。

## 1. 决策

ActSpace v2 使用同一套后端运行语义和 `RuntimeHandle` 契约服务三个 Host：

```text
Desktop Host Adapter ----+
CLI run Host Adapter ----+--> RuntimeHandle
CLI chat Host Adapter ---+
                              |-- drives ActSpace Agent semantic layer
                              `-- owns the booted Cordis root lifecycle
```

Host 负责交互和进程环境，RuntimeHandle 负责组合后的 Agent 能力与生命周期。任何 Host 都不得实现第二套 Agent Loop、Session 提交或 Tool policy。

上图表达的是统一契约，不是跨进程单例。Desktop、CLI run 和 CLI chat 通常各自在自己的 Host 进程中 boot 一个 RuntimeHandle 实例；同一 Host 进程不得为每个 Turn 重复创建 root Cordis。

DSH Profile / Bundle / Patch 的组合思想用于后端能力树，但 ActSpace 拥有 schema、命名、Host ceiling 和启动流程，不复用 `dsh-app-boot` 或 DSH headless bundle。

## 2. RuntimeHandle 所有权

RuntimeHandle 是一个进程级、可等待关闭的句柄，至少拥有这些行为边界：

- 当前 `ResolvedComposition` / `BootManifest` 只读快照和 diagnostics；
- create / resume main Session，以及 list / inspect 全部可读 Session；one-shot child 只允许 inspect / browse / export 和内部 repair；
- run turn、提交 main Agent durable steering / follow-up、abort 和 active Session guard；
- flush Session durability；
- 记录配置或插件代码变化产生的 `restartRequired`，并请求 Runtime restart；
- stop accepting new work；
- quiesce 领域运行资源并 dispose root Context。

最终方法名和 TypeScript shape 待 API 评审。确认的是所有权：Desktop/CLI 只能通过这个句柄驱动 Runtime，不能直接持有 Cordis root、Session writer 或具体 AgentLoop class。

RuntimeHandle 不拥有 `CompositionGenerationManager`、全局 active/retired generation 列表或跨领域引用计数。需要调用一致性的能力，在自己的领域内持有对应 snapshot、registration 或 lease。

## 3. Host Adapter

| Host | 拥有 | 不拥有 |
|---|---|---|
| Desktop | Electron IPC、窗口事件、审批 UI、workspace prepare、credential resolver、固定 renderer | Agent Loop、Session 事实、插件生命周期 |
| CLI run | argv/stdin、stdout/stderr、exit code、无头审批策略、signal | 第二套无头 Agent 内核 |
| CLI chat | TTY、交互审批、`/new`/`/resume`、session process lock | 独立持久化或 Loop |

保留当前 Host Adapter 的思想和用户可见语义，但替换旧 `createAgentHostRuntime()` 内部对 ContextManager、旧 Session 和闭合 ToolManager 的装配。

审批依旧由 Host 提供 Broker：Desktop 通过 IPC，chat 通过终端，run 根据 permission mode 自动决策或以稳定退出码报告 `APPROVAL_REQUIRED`。

## 4. Composition 模型

### 4.1 Profile

Profile 是用户或发行渠道选择的一套命名组合，至少声明：

- ordered Bundle list；
- Profile 自己的 patch；
- 安装的外部后端插件引用；
- Host compatibility 和 runtime contract range；
- credential refs，不含 secret。

### 4.2 Bundle

Bundle 是一组可分发插件代码和默认 patch。Bundle 不是运行时单例，也不拥有用户配置；它只为最终 Entry tree 提供有稳定 id 的默认行。

### 4.3 Patch

Patch 通过稳定 Entry id 替换、禁用或插入行。`config` 是整对象替换，不做隐式 deep merge。同一 patch list 后面的操作可以命中前面插入的 row。

Patch target、冲突和 miss 的规则由 [插件 Runtime ABI](./agent-spec-plugin-runtime-abi.md) 固定。无论 severity 如何，config dump 都必须显示结果和来源，不能静默让用户以为配置已经生效。

### 4.4 ResolvedComposition / BootManifest

Profile、Bundle 和 Patch 解析后产生不可变的 `ResolvedComposition` 或 `BootManifest` 值对象，供启动、config dump、诊断和 provenance 使用。它至少能描述 profile、bundle / plugin versions、patch digest、resolved Entry tree、Host ceiling 和 runtime contract version。

这个值对象是“本次解析出了什么”的证据，不是运行时生命周期组件。它不拥有 Fiber uid、旧实例、引用计数或卸载行为，也不把所有领域强制绑到同一个全局代际。

## 5. 组合顺序

v2 规范顺序为：

```text
empty root
  -> kernel/base bundle
  -> profile ordered bundles
  -> Host surface bundle (desktop / headless / interactive)
  -> profile patch
  -> user-home patch
  -> invocation patch
  -> Host capability ceiling
```

Host capability ceiling 是最后的只减层：它可以禁止浏览器、TTY、写权限、网络或 renderer capability，不能凭 patch 获得 Host 没有提供的权限。

启动、config dump 和 restart candidate 检查必须调用同一个 patch composer，避免“显示的配置”和“实际启动配置”使用不同算法。

## 6. Boot 流程

```mermaid
flowchart LR
  A["Outer argv / Desktop settings"] --> B["Profile resolver"]
  B --> C["Bundle resolver"]
  C --> D["Patch composer"]
  D --> E["Schema + trust validation"]
  E --> F["Host capability ceiling"]
  F --> G["ResolvedComposition / BootManifest"]
  G --> H["Cordis boot + Loader settlement"]
  H --> I["Startup Validation"]
  I --> J["RuntimeHandle"]
```

Loader settlement 自身若因 import、apply 或 reconcile 失败而 reject，启动立即失败；settlement 成功后，Startup Validation 再拒绝 enabled Entry 无 Fiber、Fiber `FAILED` / `PENDING` / 其他非 `ACTIVE` 状态，以及 Base Profile 必需 capability 缺失。Host 在验证通过前拿不到可运行句柄。

Startup Validation 是 Trusted Boot 内的启动检查，不是新的架构层或 Agent 协议。Loader/Fiber 激活完整性和 ActSpace Base Profile 能力完整性可以是同一启动流程中的两组检查，但诊断必须区分来源。

## 7. 各领域自己拥有一致性边界

ActSpace 不设计全局 `CompositionGenerationManager`。DSH 也没有这样一个统一组件；它分别在 Cordis、Loader、Preset、Session 和 LLM 中解决各自的一致性问题。把这些机制提升成全局代际，会迫使一个中央控制器理解所有插件、Session、请求和资源回收语义。

| 领域 | 一致性所有权 |
|---|---|
| Cordis | Fiber uid 标识一个插件 Fiber 对象；Fiber state 和 dependency epoch 管理激活与 Provider 变更。uid 不是每次 restart 的全局代际号。 |
| Loader / Include | 串行 reconcile Entry tree，并在自身配置与生命周期边界内执行失败恢复。 |
| Preset | v2 使用启动期静态 descriptor；不实现 standing-mount generation 或 live reload。 |
| Session | 用连续 seq 表达 Journal 事实，用 `replaceGeneration` 使 positional replacement 缓存失效；后者不代表全部 Surface mutation。 |
| LLM | one-shot PreparedCall 捕获 exact Adapter registration、已解析配置和 retry policy，并持有 activation lease 直到 stream settle；下一次调用重新解析当前 route。 |
| Tools | Prepared tool execution / execution lease 捕获本次 definition、policy、middleware 和 executor，避免审批前后或执行中混用两次注册。 |
| Prompt / Context | 每次 dispatch 前形成并持久化不可变 logical request snapshot，证明模型实际看到的内容。 |

Session resume 不以“全局 composition digest 必须完全相等”为总开关。恢复正确性由 Session 自己检查 required Event Codec、所需行为 Provider / Preset、durable request snapshot 和事件不变量；manifest digest 只提供 provenance 和诊断证据。

DSH Loader 的单个 Entry replacement 不是双实例零中断切换：它先导入候选模块，随后卸载旧实例并启动候选，失败时再尝试用旧插件恢复 Entry。该边界不保证外部副作用可回滚，也不能替代 LLM、Tools 或 Prompt 自己的调用一致性。v2 不把这条机制开放成在线刷新，所有配置和代码变化都要求 restart。

## 8. 固定前端

v2 前端不插件化：

- 后端插件不能向 renderer 发送、安装或执行 JavaScript、React component、CSS 或 HTML；
- Desktop 使用构建时 allowlist 的内置 renderer；
- 所有工具调用至少投影成通用状态、摘要、detail、artifact 和错误；
- 未知 `rendererId` 使用 generic fallback，并记录结构化诊断；
- 后端插件声明的 optional frontend contribution 被忽略并告警。

插件把前端声明为 required 而 Host 不支持时，该后端不激活。Profile 把它声明为 required capability 时 Boot 失败；optional Entry 则跳过并记录 incompatible diagnostic。任何情况下都不能执行插件前端代码。

## 9. CLI 语义

### CLI run

保持自动化入口的现有输出方向：一次 invocation 驱动一次 run，默认输出最终文本；`--json` 输出单个结果，`--jsonl` 输出 runtime events 加 final result；diagnostics 进入 stderr。

`run` 默认 ephemeral，不创建可 resume 的长期 Session；显式 `--persist` 才创建 persistent Session。输出或执行错误时，ephemeral Journal 仍应保留到 invocation 完成以满足同一次运行的恢复与审计语义，但结束后的保留策略由 Host 明确执行。

### CLI chat

一个进程只 boot 一次 RuntimeHandle；`/new` 和 `/resume` 切换 Session，不重复创建 root Cordis。保留跨进程 Session writer lock，避免 Desktop 与 CLI 同时写同一 Session。

CLI chat 与 Desktop 默认 persistent。

### Desktop

RuntimeHandle 由 Electron app lifecycle 拥有，不是每个 turn 创建一次。Renderer 只接收稳定投影事件，不能访问 Cordis Context。

## 10. Reload 与 HMR

v2 不采用 `cordis-plugin-hmr`，也不实现在线 config/plugin reconcile。配置或代码变化的唯一运行时语义是：

1. Runtime 内部、生命周期归属明确的普通 watcher 可以发现变化；
2. 同一个 composer 验证 restart candidate，并生成脱敏 diagnostic；
3. 当前 Runtime 继续使用启动时的 immutable `BootManifest`；
4. `RuntimeHandle` 暴露 `restartRequired`，由 Host 在安全时机走完整 shutdown 和 Boot；
5. 新进程重新执行 Loader settlement 与 Startup Validation，通过后才接受工作。

不再保留 fs-watch Rust 插件。未来若产品确实需要在线 reconcile，必须另立设计，覆盖 admission gate、post-validation、previous-tree recovery 和领域 lease；不能在 v2 实现中顺手开放。

## 11. Shutdown

旧 autonomous runtime 和 fs-watch 删除后，所有 Host 仍必须遵循同一关闭顺序：

1. 停止接受新 run、resume 和 restart request；
2. abort active turn，并等待已开始工具按策略 drain；
3. 解决或取消 pending approval；
4. flush Session writer；
5. quiesce Agent、watcher、timer、subprocess 和其他领域资源；
6. dispose root Cordis Context，并等待剩余 Fiber / Effect cleanup；
7. Host 再退出进程。

第一次 SIGINT/SIGTERM 执行有界 graceful shutdown；第二次信号可以强制退出，但必须输出未完成 flush 的诊断。Desktop app quit 同样等待 RuntimeHandle dispose，不能只触发异步清理后立即退出。

## 12. Distribution 边界

当前 CLI SEA 构建要求 standalone CommonJS bundle，不允许未解析 package import。动态 ESM Cordis 和可安装后端插件与此约束天然冲突。

v2 主发布形态确定为 managed runtime directory，支持 ESM dependencies、codec modules 和显式安装的受信任插件。strict standalone SEA 不属于 v2 主产品；未来若提供 builtin-only SEA，它只能包含编译时内置 Bundle，不承诺安装插件，并需要独立 ADR。

## 13. Diagnostics

RuntimeHandle 至少暴露：

- profile id、resolved manifest digest、来源层和当前 config revision；
- package/plugin version 与 resolved entry path；
- Entry enabled/disabled、Fiber uid/state 和 missing Services；
- startup validation、restart candidate、recovery 和 quiescence failure；
- ignored frontend contribution；
- Session compatibility/degraded reason；
- static Preset、in-flight LLM / Tool registration identity 等领域诊断；
- pending disposer、watcher、timer 和 subprocess；
- exact config dump，secret 已脱敏。

diagnostics 是 Host 展示和 CLI stderr 的来源，不进入 Agent 模型上下文，也不替代 durable Session facts。

## 14. 已固定契约与实施细节

公共语义已经分别固定在：

- [插件 Runtime ABI](./agent-spec-plugin-runtime-abi.md)；
- [Runtime Projection 公共契约](./agent-spec-runtime-projection.md)；
- [Tool Runtime 公共契约](./agent-spec-tool-runtime-abi.md)；
- [Agent 与 Subagent 公共契约](./agent-spec-agent-and-subagent.md)。

RuntimeHandle 的精确 TypeScript 方法名、capability vocabulary 的枚举拼写、watcher 实现和 Host restart UX 可以在 execution plan 中细化。实现不得加入在线 reconcile、StandingMount、可执行前端贡献或 strict SEA 插件加载。
