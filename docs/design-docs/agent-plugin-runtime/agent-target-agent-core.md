# ActSpace v2 Agent Core 目标边界

> 状态：核心所有权、产品范围、行为不变量、公共语义和 DSH 风格领域包边界已确认；文中的 RuntimeHandle 术语已由 Profile-first 决策中的 `BootedProfile` 与 App Bundle Service 替代。精确 TypeScript 名称与字段实现留给 execution plan。
>
> 本文定义“什么必须由 ActSpace 拥有”和“什么允许由插件替换”，不定义实施顺序。

## 1. 决策

ActSpace v2 不直接依赖以下 DSH Agent Core 包：

- `@deepseek-ai/dsh-scope`；
- `@deepseek-ai/dsh-session`；
- `@deepseek-ai/dsh-system-prompt`；
- `@deepseek-ai/dsh-tools`；
- `@deepseek-ai/dsh-agent`；
- `@deepseek-ai/dsh-agent-loop`；
- `@deepseek-ai/dsh-llm`。

DSH Agent Core 是参考实现、行为规格和测试来源，不是 ActSpace 的产品语义依赖。ActSpace 在 DSH Cordis runtime family 上实现自己的 Agent Core，并拥有 Session、Host、插件 ABI 和兼容性。

这组 DSH 能力也不应笼统称为“全部是普通插件”：`dsh-scope` 是库级作用域原语；`dsh-llm` 既定义词汇与 Adapter seam，也提供可由 Loader 装载的 LLM Runtime Service；`dsh-agent-loop` 则是默认 Agent 实现插件。ActSpace 应同样区分稳定领域契约、库原语、Cordis Service 和可替换 Provider。

## 2. Trusted Boot、Core 原语与 Provider

```text
ActSpace Trusted Boot
  - Plugin ABI / contract version
  - Root Context / ResolvedComposition manifest
  - Loader settlement / Startup Validation
  - Diagnostics / shutdown
  - RuntimeHandle boundary

ActSpace Core Primitives and Providers
  - Scope primitive / scope-aware registry rules
  - Session Journal / Persistence / Event Codec compatibility
  - System Prompt / Request Assembly
  - Tool Runtime
  - LLM Registry / Adapter
  - Agent Registry
  - Agent Loop
```

Trusted Boot 不提供具体工具、Provider、Prompt 或产品工作流，也不维护全局 Composition Generation。Scope 等领域原语由 ActSpace 定义；以 Cordis Service 形式提供的 Core Provider 可以替换，但 Base Profile 必须提供完整默认组合。“可替换”不意味着运行时可以在缺失 required provider 时继续假装健康。

## 3. 模块职责

| 模块 | ActSpace v2 职责 | 不再承担 |
|---|---|---|
| Scope | opaque identity、父子 chain、layered registry、ancestor visibility/shadow、event carrier、scope-owned quiescent disposal | 权限沙箱、任意 Cordis Service 继承承诺、standing generation API |
| Session | append-only facts、Surface、request snapshot、flush、resume、fork 和 recovery | Renderer state、副本式 Trace、可变 Context messages |
| System Prompt | section、动态 context、tool schema 的确定性组装 | Conversation 所有权和 secret 解析 |
| Tool Runtime | definition registry、参数验证、策略、审批 seam、prepared execution lease、staged execution、结果归一化 | 具体 Desktop preview、v1 autonomous 分支、静态全局注册 |
| LLM | 稳定 Message/Stream/Failure/Usage 契约、Provider registry、one-shot PreparedCall | Provider SDK 类型泄漏和 Session 持久化 |
| Agent Registry | unpublished setup、live identity、main Agent durable Inbox、create/resume/dispose | 默认 Loop 的具体 Turn/Step 算法 |
| Agent Loop | Turn/Step 驱动、请求组装、工具调度、终止和恢复事实 | Host UI、stdout、进程退出和物理存储编码 |

## 4. 必须保留的行为不变量

### 4.1 逻辑请求可重建

每次 Agent Loop 发出的逻辑 LLM 请求，其 messages、system、tools 和 call config 必须能从 Adapter dispatch 前的 Session 日志前缀重建。

凭据、`AbortSignal`、代理对象、HTTP headers 和 Provider 最终 wire payload 不进入 Session。它们由 Host credential resolver 和 Adapter 在调用时补齐。

### 4.2 稳定 Turn、Step 和 Tool 关系

- Turn 和 Step 必须有明确开始、结束和 interrupted/error 事实；
- tool call 必须在 body dispatch 前写入 Journal；
- tool result 必须引用对应 call，并保持模型调用顺序；
- 不要求“所有 call 先写完再写所有 result”，滚动并行池可以交错 start，但关系和提交顺序必须稳定；
- invariant validator 是 Session Core 内部、不可关闭的 admission 边界，不能只靠 TypeScript 类型或普通插件推定日志合法；Boot 另行检查 Base Profile capability 完整性。

### 4.3 有界并行、有序提交

只有明确声明 concurrency-safe 的工具 body 可以并行。参数物化、policy、approval、pre/post middleware、`tool/result`、additional context 和 concludes-turn 等提交阶段保持模型 tool-call 顺序。

未知、未声明、动态失效或会修改共享资源的工具默认 exclusive。并行分类是 fail-closed 的能力声明，不是性能提示。

### 4.4 副作用前 durability checkpoint

持久化 Runtime Profile 必须装载 durability checkpoint policy：

- LLM Adapter dispatch 前 flush 完整请求前缀；
- 顶层工具 body 前 flush 已记录的 tool call；
- 下一 Step 前 flush 上一步已提交结果。

checkpoint 失败时禁止下游模型请求或工具副作用。该语义不承诺 exactly-once；崩溃恢复仍需区分 not-started 和 outcome-unknown。

明确标记为 ephemeral 的 Profile 可以关闭 crash durability，但必须在 RuntimeHandle 和诊断中暴露，不得与 persistent Session 混用。

### 4.5 所有贡献均有生命周期所有者

Prompt section、Tool definition、LLM route、event listener、timer、watcher、subprocess 和子插件都必须由 activation Effect 拥有，并提供可等待 disposer。插件不得绕过 API 写入静态全局 Registry。

卸载完成的定义是资源进入静止状态，不只是 Registry 中查不到一个名字。

### 4.6 完整构造后发布 Agent

Agent factory 必须先在 unpublished scope 中完成 awaited setup，再通过同步、顺序明确、可回滚的 publication transaction 发布 Session 和 Agent。

成功观察者不能看到半配置 Agent。若部分通知已经送达后发生失败，回滚必须发出配对 disposal；这不是数据库意义的跨事件原子事务。

### 4.7 Compaction 不破坏原始事实

Compaction 只能追加 summary、replacement 和结束事实来改变未来模型 Surface。它不能删除、覆写或偷偷重排原始 Session events。

### 4.8 单次 LLM 调用绑定同一 Adapter registration

每次调用通过 one-shot PreparedCall 捕获同一个 Adapter registration，使 exact-model resolution、defaults、request header、retry policy 和最终 dispatch 不跨 Provider replacement 混用。PreparedCall 同时持有 registration-scoped activation lease；旧 registration 进入 draining 后不再接收新调用，相关 Fiber disposer 必须等待既有 dispatch / stream 完成或按策略协作取消后，才能释放 SDK client、proxy 和其他资源。下一次调用由 LLM Service 重新解析当前 route 和 registration，不依赖全局 Composition Generation。

### 4.9 单次 Tool 调用绑定同一 execution registration

Tool call 在参数物化、policy、approval、body dispatch 和 result finalization 之间不能切换到另一份同名工具实现。Tool Runtime 应建立 prepared execution / execution lease，捕获本次 definition、policy、middleware chain 和 executor registration。

插件卸载或 Runtime shutdown 遇到 in-flight call 时，只能按契约等待完成、协作取消并写入终止事实，或拒绝开始新调用；不能让旧定义通过审批后由新注册的 body 执行。最终 lease 类型名和超时数值可以在 execution plan 中细化。

## 5. 现有资产如何进入新 Core

“保留工具实现”只覆盖这些资产：

- executor 的核心算法；
- 外部命令、HTTP、socket 和文件协议；
- 路径、防误写、输出上限、脱敏和错误分类；
- 经过验证的行为测试与 fixtures。

以下旧边界明确不保留：

- 集中式 `createToolManager()` 枚举；
- 旧 `ToolManager` / `ToolScheduler` 所有权结构；
- `ToolResult` 中的 SessionEvent、v1 autonomous 字段、Desktop preview 和 provider runtime bag；
- 旧 bridge 从可变 messages 反向生成 Session events；
- 工具对 Desktop approval UI 或 renderer component 的直接知识。

Browser Bridge 作为 Host capability 保留；Agent/Explore、Todo 等复合工具需要按新 Session、Scope 和 Agent seam 重写，不能按普通 executor 搬迁。

## 6. ContextManager 的替代

旧 ContextManager 同时拥有 conversation、Prompt、Tools、压缩和 usage，形成运行期 messages 与持久 SessionEvent 两套真相。v2 不保留该所有权模型。

新的 Request Assembly 每一步执行：

1. 从 Session Surface 派生模型历史；
2. 从当前 Agent scope 读取 Prompt、Tool 和 Context contributors；
3. 形成包含 route、model、messages、system、tools 和 call config 的逻辑 request candidate；
4. 由 LLM Service 创建 one-shot PreparedCall，解析 exact Adapter registration、model defaults 和 retry policy；
5. 用 candidate 与 PreparedCall 的 resolved metadata 形成不可变逻辑 request snapshot，并先写入 Session；
6. 通过 durability checkpoint 后，才 dispatch 同一个 PreparedCall。

步骤 4 之后必须由调用边界用 `try/finally` 管理 activation lease：snapshot append、checkpoint、pre-dispatch abort 或其他异常都 release/cancel；dispatch 后由 stream settle 释放。不能让一次未发出的请求阻塞旧 Adapter 卸载。

Context 仍可以是一个领域概念，但不能再拥有独立、可变且未持久化的 conversation 真相。

## 7. v2 完整 Agent 产品范围

v2 的一次完整切换必须同时提供：

- main Agent 与默认 Agent Loop；
- 现有 `Agent` / `Explore` 能力的重写；
- 一个统一的 synchronous one-shot Subagent seam；
- 启动时解析的静态 Agent Preset descriptor；
- 独立 child Session、parent lineage、受限 Scope、工具子集、级联取消和结构化结果；
- Todo durable events、Skills、Compaction 和全部确认保留的工具；
- Desktop、CLI run、CLI chat 的同语义入口与稳定投影。

`Agent` 与 `Explore` 不是两套子代理内核：它们是同一个 one-shot Subagent provider 的不同静态 descriptor。Explore 默认只获得只读探索工具；通用 Agent 获得由父 Scope 和 Host ceiling 共同限制的工具子集。

v2 明确不实现：

- generic Workflow engine；
- detached / background / continuable subagent；
- continuation queue、跨进程 child activation 恢复或 child 多次续跑；
- Preset StandingMount、旧 preset generation 保留或 live preset reload；
- Agent Room / Team 等更高层产品协作形态的 v2 重写。

这些能力未来可以基于稳定的 Agent、Session 和 Scope 契约另立设计，但不能成为 v2 完整交付无限延期的隐含范围。

详细契约见 [Agent 与 Subagent 公共契约](./agent-spec-agent-and-subagent.md)。

## 8. Tool 与 Prompt 公共顺序

Tool Runtime 固定遵循：捕获 registration、参数验证、pre-policy、Host approval、不可绕过 guard、durability checkpoint、body、post/finalizer、按模型顺序提交 Journal。普通 waterfall hook 不能绕过 Session admission、approval outcome、checkpoint 或 invariant validator。

Prompt / Context Contributor 固定按 composition layer、numeric order、stable contributor id 排序；重复 id 失败。Request Assembly 必须保留用户与 workspace instructions、Agent descriptor、Skills、workspace facts、Host sandbox / approval / browser capabilities，并删除 v1 autonomous handoff 与旧 conversation 所有权。

详细契约见：

- [Tool Runtime 公共契约](./agent-spec-tool-runtime-abi.md)；
- [Prompt 与 Context Contributor 公共契约](./agent-spec-prompt-context-contributors.md)。

## 9. Package 策略

ActSpace v2 采用 DSH 风格的领域包结构，但不复制 DSH 的 `vendor/`，也不建立一个承载全部实现的单一 ESM Runtime Core package。

固定分组为：

- Harness 基座：`cordis-adapter`、`boot`、`bundle`、`composition`、`diagnostics` 和薄 `runtime` facade；
- Agent 核心语义：`core`、`session`、`llm`、`context`、`prompt`、`tools`、`subagent`、`compaction`；
- Host / 展示边界：`host`、`client`、`shared`；
- 测试与通用基础设施：`test-support`、`util`。

不建立通用 `plugins/` 目录。每个可装载、可替换或可独立验证的领域包都是真实 workspace package，并通过独立的 Static Manifest、Codec Entry（如需要）和 Behavior Entry 参与 Cordis Loader。Session、LLM、Prompt、Agent Loop 是默认 Profile 中的核心语义插件，不属于插件系统之外的特殊代码。

具体工具按 `tools/core-tools`、`tools/browser-tools` 等领域包组织；Browser Bridge 作为独立 Host capability 放在顶层 `browser-bridge/`，不作为同进程 TypeScript 插件伪装接入。

详细目录、manifest、codec、behavior、依赖和迁移规则见 [包结构与真实插件包规范](./agent-spec-package-layout-and-plugin-packaging.md)。

## 10. 实施时细化

以下内容可以在 execution plan 中选择具体机械表达，但不得改变上文语义：

- Agent Registry、Scope、Inbox 和 Subagent 接口的精确 TypeScript 方法名；
- internal event carrier 和 layered registry 的数据结构；
- lease timeout、协作取消和 forced shutdown 的具体数值；
- 各领域 package 的精确 npm 名称、版本策略和最终字段命名；
- cache、projection checkpoint 和内部测试 fixture 的文件布局。
