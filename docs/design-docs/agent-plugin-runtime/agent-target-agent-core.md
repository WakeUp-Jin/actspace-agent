# ActSpace v2 Agent Core 目标边界

> 状态：核心所有权、产品范围、行为不变量、公共语义和 DSH 风格领域包边界已确认；启动与应用职责已按 Profile-first 原位校准；精确 API 以当前 exports 和 execution plan 的实施状态为准。
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
  - Host lifecycle / App Service boundary
  - TaskLedger / Run scheduling / Harness lease

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
| Agent Registry | unpublished setup、live identity、live identity、父子 Scope 和资源登记 | 默认 Loop 的具体 Turn/Step 算法 |
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

明确标记为 ephemeral 的 Profile 可以关闭 crash durability，但必须在 Session provenance、应用结果和诊断中暴露，不得与 persistent Session 混用。

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

## 8. Tool 与 Prompt 公共顺序

Tool Runtime 固定遵循：捕获 registration、参数验证、pre-policy、Host approval、不可绕过 guard、durability checkpoint、body、post/finalizer、按模型顺序提交 Journal。普通 waterfall hook 不能绕过 Session admission、approval outcome、checkpoint 或 invariant validator。

Prompt / Context Contributor 固定按 composition layer、numeric order、stable contributor id 排序；重复 id 失败。Request Assembly 必须保留用户与 workspace instructions、Agent descriptor、Skills、workspace facts、Host sandbox / approval / browser capabilities，并删除 v1 autonomous handoff 与旧 conversation 所有权。

详细契约见：

- [Tool Runtime 公共契约](./agent-spec-tool-runtime-abi.md)；
- [Prompt 与 Context Contributor 公共契约](./agent-spec-prompt-context-contributors.md)。

## 模块导航

当前目录与包规则见[包规范](agent-spec-package-layout-and-plugin-packaging.md)。Host/Harness/Run 组合与生命周期见[重构决定](agent-harness-host-refactor-decisions.md)，完整生产链见[启动链](agent-spec-dsh-plugin-assembly-and-agent-startup.md)。不再重复未来包清单或旧迁移步骤。
