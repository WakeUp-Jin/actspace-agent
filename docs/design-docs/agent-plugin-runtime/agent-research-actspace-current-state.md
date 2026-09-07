# ActSpace v1 后端现状研究

> 状态：v1 研究快照，不是当前实现、目标架构、重构方案或已批准决策
>
> 快照日期：2026-08-22
>
> 源码基线：`9366c1910a3b`（分支 `refactor-dsh-plugin`，该提交可由 tag `v1-final` 定位）
>
> 后续决策：本文中的 v1 事实继续有效；关于 Cordis、Agent Core、Session、LLM、Runtime、Kairos 和 fs-watch 的去留判断，已由 [v2 已确认决策](./agent-decisions-v2-foundation.md) 及相邻目标文档取代。

## 1. 研究目的与边界

本文回答的是“ActSpace v1 现在实际上如何工作、哪些边界真实存在、耦合集中在哪里”，为后续插件化设计提供可复核的现状基线。

本文刻意不回答以下问题：

- 最终应该采用什么插件模型；
- 哪些能力最终保留、删除或插件化；
- profile、bundle、patch 等概念应如何映射到 ActSpace；
- 重构阶段、迁移顺序、兼容周期和交付时间；
- 前端是否、何时以及以什么形式插件化。

文中使用两类表述：

- **事实**：可以从当前源码、包清单或静态扫描直接验证；
- **推断**：由多个事实共同支持的工程判断，仍需在设计阶段讨论和验证。

因此，“可迁移资产”“风险”“设计约束”等词只表示研究结论，不表示团队已经批准对应取舍。

## 2. 快照、范围与量化口径

### 2.1 纳入范围

本轮覆盖：

- `packages/agent-runtime`：v1 Runtime、Agent Loop、Context、Tools、LLM、Persistence、Skills、Kairos；
- `packages/shared`：会话事件、工具预览、设置和现有插件协议；
- `packages/desktop`：Electron Main、Preload、Renderer、Runtime Host Adapter、插件进程服务；
- `packages/agent-cli`：同一 Runtime 的 CLI Host Adapter；
- `browser-bridge` 与 `plugins/fs-watch`：当前仓库中名为 plugins 的两个独立二进制子项目。

本轮主要采用源码静态审计和文本量化，没有把桌面端手工验收、真实模型调用或插件进程运行结果作为事实依据。动态行为仍可能补充或修正静态推断。

### 2.2 行数与引用计数口径

下文 LOC 是物理行数，包含空行和注释，只用于判断体量，不代表复杂度或代码质量。生产源码统计排除了路径中的 `test` 目录：

| 范围 | 生产 TS/TSX 文件 | 物理 LOC |
| --- | ---: | ---: |
| `packages/agent-runtime/src` | - | 31,587 |
| `packages/desktop/src` | - | 47,256 |
| `packages/shared/src` | - | 5,390 |
| 具体工具实现 `agent-core/src/tools/tools/**` | 62 | **8,851** |
| Kairos 直接实现 `agent-core/src/kairos/**` | 29 | 5,768 |
| LLM 直接实现 `agent-core/src/llm/**` | 16 | 2,804 |

`-` 表示本轮只记录了总行数，没有把文件数作为结论使用。

“Kairos 引用文件”按生产 TS/TSX 文件内出现 `kairos` 文本统计，共 80 个文件：

| 区域 | 引用文件数 |
| --- | ---: |
| `agent-core` | 36 |
| `desktop`（含 renderer） | 34 |
| `shared` | 10 |

该数字包括 import、类型、配置、事件名和 UI 文案等，不等同于 80 个运行时调用点；它衡量的是改动波及面。

## 3. 当前包与宿主拓扑

### 3.1 包依赖

当前主链路是：

```text
packages/desktop ──> packages/agent-runtime ──> packages/shared
packages/agent-cli ──> packages/agent-runtime ──> packages/shared

packages/agent-runtime ──socket──> browser-bridge
packages/desktop ──file/process contract──> plugins/fs-watch
```

**事实：** 在 v1 快照中，Desktop 和 CLI 都不各自实现 Agent Loop，而是通过 Host Adapter 调用旧 `agent-core` 的同一个 Runtime。v2 目标边界见相邻 target 文档。

- [Desktop Host Adapter](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/desktop-agent-runtime.ts#L37)
- [CLI Host Adapter](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-cli/src/runtime-adapter.ts#L36)
- [Runtime 入口](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L63)

`browser-bridge` 是独立 Go module，`plugins/fs-watch` 是独立 Rust crate；它们不是 pnpm workspace 中可以被旧 Runtime 动态 import 的普通 TypeScript 包。

### 3.2 宿主边界

[`AgentRuntimeHost`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L21) 一类端口把以下宿主能力传入 Runtime：

- 上下文加载；
- 模型解析；
- 运行事件接收；
- 工具审批；
- 工作区准备；
- 会话标题等宿主钩子。

**事实：** 这是一个真实的 host-neutral 边界，Desktop 与 CLI 已经证明同一执行核心可以被两个宿主使用。

**推断：** 该边界是后续设计可复用的结构资产，但它目前仍是“每次运行由固定代码装配一组依赖”，没有插件发现、激活、停用、依赖解析或资源回收协议，不能直接等同于插件内核。

## 4. Runtime 与 Agent Loop

### 4.1 Runtime 生命周期

[`DefaultAgentRuntime`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L75) 负责一个用户请求从开始到结束的外层生命周期：

1. 同一 session 同时只允许一个 active run，并提供 abort/dispose；
2. 准备 workspace，解析上下文和模型；
3. 创建 ContextManager、LLM、ToolManager 等运行依赖；
4. 在进入 Loop 前先写入用户消息和准备事件；
5. 通过 bridge 运行 Agent；
6. 正常完成后批量写入派生的 SessionEvents；
7. 发出终态事件，调用标题钩子，并在 `finally` 中 dispose ToolManager。

源码证据集中在 [run 管理](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L78)、[依赖装配](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L139)、[预写入事件](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L228)、[执行与结果持久化](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L284) 和 [终态清理](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L342)。

**事实：** Runtime 已经拥有清晰的请求级 abort 和 ToolManager 销毁点。

**推断：** 生命周期目前只覆盖 Runtime 自己显式创建的对象。若未来存在运行期可装卸扩展，当前源码没有为扩展资源提供独立作用域、反向顺序回收、激活失败回滚或所有权追踪。

### 4.2 Loop 的真实语义

[`runAgentLoop`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts#L57) 包含单轮 LLM、流式事件、工具调用、压缩和重试。其核心状态是一个可变的 `context.messages` 数组：

- steering 消息直接追加；
- 压缩后直接替换消息；
- assistant 消息和 tool result 直接追加；
- 下一次 LLM 调用继续读取该数组。

Loop 的默认上限和重试参数在 [循环配置](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts#L50) 中固定，失败重试、退避和失败消息清理位于 [LLM 调用段](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts#L145)。

**事实：** 当前 Loop 中的一次“turn”更接近“一次模型调用以及由该响应触发的工具调用”，而不是完整用户请求。

**事实：** 同一批工具调用只有两种调度模式：逐个执行，或整体 `Promise.all` 并行；没有按工具副作用、互斥资源或 barrier 进行分组的通用调度协议，见 [工具调用执行](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts#L342)。

**事实：** 每次 LLM 调用前会构造包含 system、messages、tools 和 options 的请求快照，见 [request snapshot](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts#L417)。

**推断：** Loop 本身是相对可辨认的执行核心，但它与可变 ContextManager、具体 ToolManager、事件形状和 bridge 紧密配合。只替换入口装配而不处理这些内部契约，并不会自然得到可组合的插件运行时。

### 4.3 Bridge 是第二条高密度路径

[`engine/bridge.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/bridge.ts) 单文件 2,164 LOC，同时承担：

- 将新 AgentEvent 映射到旧 RuntimeStreamEvent；
- 工具输入预览和工具专用展示字段；
- browser 数据脱敏；
- todo、后台 bash、subagent、usage、trace 等特殊事件处理；
- Agent 完成后，从最终 messages 再构造 SessionEvents。

文件开头已经明确它是新旧协议之间的 bridge，见 [桥接职责说明](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/bridge.ts#L1)。执行完成后的 SessionEvent 转换在 [runAgentWithBridge](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/bridge.ts#L155) 和 [buildSessionEvents](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/bridge.ts#L587)。

**推断：** Bridge 不是单纯的格式适配器，它包含大量产品语义和持久化投影逻辑。任何改变工具、事件或会话模型的设计，都需要把它视为核心耦合点，而不是只修改 Runtime/Loop。

## 5. Context 与 Prompt 装配

### 5.1 ContextManager 的所有权

[`ContextManager`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/manager.ts#L73) 同时持有：

- SystemPrompt 模块集合；
- 可选长期记忆；
- ConversationContext；
- 压缩配置；
- 暴露给模型的工具定义；
- 会话文件路径和 token usage 分桶。

ConversationContext 在构造阶段读取 `session.jsonl` 并投影成 messages，见 [ConversationContext](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/modules/conversation.ts#L53)。压缩会把原 messages 替换成合成的摘要消息和指针，见 [conversation compress](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/modules/conversation.ts#L97)。

**事实：** 持久层的事实单元是 SessionEvent，而 Loop 实际消费和修改的是 ContextManager 内存中的 messages。两者不是同一个对象，也不是每一步同步写入。

**推断：** 当前系统存在“持久 SessionEvent”与“运行期可变 messages”两套真相表示。正常完成时 bridge 尝试重新投影两者；异常退出时，两者可能停在不同阶段。

### 5.2 SystemPrompt 模块

[`SystemPrompt`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/modules/system-prompt.ts#L20) 以 `Map` 保存 prompt segment，支持注册、更新、启停和移除。ContextManager 按 stability 排序后拼接 segment，见 [prompt 排序](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/manager.ts#L277)。

**事实：** `registerSegment` 返回 `void`，同 id 使用 `Map.set` 静默覆盖；注册方不会得到 disposer，也没有 segment 所有权信息。

**推断：** 这已经具有“按模块拼 Prompt”的雏形，但还不是扩展注册协议。动态来源加入后，重复 id、卸载清理和失败回滚无法仅靠当前 API 可靠处理。

### 5.3 ContextLoader 的硬编码集成

[`loadRuntimeContext`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/context-loader.ts#L31) 直接装配：

- `AGENTS.md` 等仓库指令；
- Kairos inbox handoff；
- Browser prompt；
- Skills catalog；
- 不同 agent mode 的 prompt。

Kairos、Browser 和 Skills 都由 Runtime 固定路径主动查询或注入，而不是由能力自身通过统一贡献点注册。

**推断：** ContextManager 本身可以保留为上下文组织机制的研究对象，但当前 ContextLoader 体现的是固定产品装配。两者需要在概念上区分，避免把“上下文管理能力”与“现有所有硬编码集成”一起视为不可拆整体。

## 6. 工具体系与主要可迁移资产

### 6.1 当前注册与执行链

[`createToolManager`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/index.ts#L173) 手工枚举并注册文件、搜索、bash、todo、browser、image、agent/explore 等工具；能力开关也在这里以条件分支决定。

[`ToolManager`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/manager.ts#L34) 用 Map 保存工具，负责：

- definition/spec 到内部工具的注册；
- progressive disclosure 的组启停；
- 调度器连接；
- tool disposer 的统一清理。

[`ToolScheduler`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/scheduler.ts#L103) 执行 permission、approval、handler、post-process 流水线，并包含 Kairos guard 以及 bash、agent 等工具专用后处理。

### 6.2 工具契约并非纯后端契约

[`ToolDefinitionSpec`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/types.ts#L17) 除名称、描述、schema、executor 外，还携带：

- `previewKind`；
- provider exposure；
- progressive group；
- Kairos path extraction。

[`ToolResult`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/internal-tools.ts#L28) 直接包含来自 `shared` 的 artifact、SessionEvent、UI preview、subagent 和持久化相关字段。

**事实：** 工具定义和结果不仅描述“如何调用后端函数”，还同时承载模型暴露、审批、持久化、桌面预览和 Kairos 安全策略。

**事实：** ToolManager 的两个注册入口最终都使用 `Map.set`；重复工具名会静默替换，而不是报告冲突，见 [registerFromSpec/register](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/manager.ts#L71)。

**推断：** 当前 ToolManager 是可工作的产品注册表，但注册冲突、贡献者身份、覆盖策略和卸载所有权不满足通用动态扩展的可审计要求。

### 6.3 8,851 LOC 工具实现的边界

`packages/agent-runtime/src/tools/tools/**` 中排除测试后的具体实现共有 **62 个文件、8,851 LOC**。这些代码包含：

- 文件、目录、搜索和文本修改语义；
- bash/进程生命周期、后台任务和输出处理；
- browser bridge 客户端与协议适配；
- 图片读取/生成接口；
- todo、agent、explore 等具体执行行为；
- 输入校验、路径边界、超时、取消和错误处理；
- 与上述行为配套的测试资产（测试 LOC 未计入 8,851）。

**推断：** 这批“已经验证具体工具如何工作”的实现是当前后端最显著的可迁移资产。这里的“可迁移”不等于原样搬运，也不表示 ToolManager、ToolScheduler、ToolResult、preview contract 和 agent/explore runner 都应保持不变。尤其 agent/explore runner 反向依赖 ContextManager 与旧 Loop，需要单独评估其边界。

换言之，需要区分两层：

| 层次 | 当前内容 | 研究判断 |
| --- | --- | --- |
| 具体工具行为 | 文件、bash、browser、image 等执行细节和安全校验 | 主要可迁移资产 |
| 工具编排契约 | 注册表、调度、结果、UI preview、Kairos guard、SessionEvent 映射 | 与现有内核和前端强耦合，不能因“保留工具”而默认全部保留 |

该表是资产边界判断，不是最终保留清单。

## 7. LLM 层

### 7.1 当前抽象

[`LLMService`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/types.ts#L188) 提供统一的流式调用接口，消息、工具、usage 和 LLM event 也集中定义在同一类型模块。Factory 按 API protocol 创建 Anthropic、OpenAI Chat Completions、OpenAI Responses 或 mock 实现，见 [`createLLMService`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/factory.ts#L16)。

[`provider-adapter.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/provider-adapter.ts#L4) 负责不同 provider 的 header 和 request 参数差异，[`provider-transport.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/provider-transport.ts#L9) 负责代理 transport 和缓存。

**事实：** Factory 的封闭 switch 面向协议实现，而非可以从外部注册的 provider 插件；新增协议仍需修改 core factory。

**事实：** Loop 有自己的重试与退避，provider SDK 配置也暴露重试能力，因此重试控制分布在两个层次。

**推断：** 2,804 LOC 的协议适配、流式解析、usage 和 transport 代码是另一组可复用资产；但“由谁拥有重试、错误归一化和可观测性”在当前层次间不够单一，后续设计不能只把 factory switch 改成 registry 就认为边界已经完成。

## 8. 会话持久化、恢复与投影

### 8.1 JSONL 与事件 schema

[`appendSessionEvents`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/jsonl.ts) 将 SessionEvent 批量追加到 JSONL。解析时，格式错误的行会被跳过并记录错误；结构看似合法的记录再由 shared normalization 处理。

[`isSessionEvent`](../../../packages/shared/src/session-selectors.ts#L23) 只粗略检查 id、sessionId、runId、schemaVersion、type、timestamp 和 payload 的外形，没有对已知 event type 及其 payload 做严格判别。工具预览 guard 也只检查 `kind` 是字符串。

[`SessionEventType`](../../../packages/shared/src/session.ts#L158) 和 [`ToolPreviewKind`](../../../packages/shared/src/session.ts#L465) 则是封闭 TypeScript union，其中直接包含 Kairos 事件与现有工具预览类型。

**事实：** 编译期类型是封闭的，运行期接纳又相对宽松。

**推断：** 这会形成一种不对称：未知事件可能通过粗校验进入系统，但下游 switch 未必认识它。对动态扩展和跨版本回放而言，“能读入”不等于“能安全投影或展示”。

### 8.2 正常完成与崩溃边界

Runtime 在 Loop 前先持久化用户事件，Agent 正常完成后才调用 [`writeSessionResult`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/session-store.ts#L260) 批量追加从 messages 派生的事件。恢复逻辑会读取 JSONL、记录解析/恢复错误并尽量继续，见 [`recoverSession`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/recovery.ts#L35)。

**事实：** SessionEvent 没有单调递增的 `seq` 字段；当前提交路径也没有在执行有副作用工具前先写 durable tool-call intent，再在执行后写对应 result 的通用协议。

**推断：** 进程若在工具执行期间崩溃，持久记录可能只能证明用户请求已开始，无法稳定区分：

- 工具尚未开始；
- 工具已经开始但未完成；
- 外部副作用已经发生但结果尚未持久化。

这是恢复语义风险，不代表现有正常完成路径不能工作。它在引入可重试、可恢复或第三方扩展时会变得更重要。

### 8.3 Fork 与侧车状态

[`forkSession`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/session-store.ts#L68) 会复制整个 session 目录，并递归改写若干已知 path key 和 sessionId。Context state 另存为 sidecar，见 [context-state persistence](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/session-store.ts#L358)。

**推断：** 当前 fork 正确性依赖 core 知道哪些字段和文件需要改写。扩展若产生私有持久状态，现有机制没有声明式 schema、复制策略或迁移钩子承载它。

## 9. Skills 机制

### 9.1 发现与遮蔽

[`loadSkillsRegistry`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/registry.ts#L19) 扫描项目、数据目录和用户目录中的多组 roots，按 priority 排序并采用 first-win 去重，同时产生 shadow diagnostics。默认优先级从项目 `.actspace`、`.agents`、`.claude` 逐步到数据目录和用户目录。

[`renderSkillsCatalog`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/catalog.ts#L16) 把已发现 Skills 渲染为 XML catalog，指导模型按需读取 `SKILL.md`。Desktop 的 [`skills-service`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/skills-service.ts#L1) 另外提供列表、安装和卸载能力，并与 Kairos whitelist 设置相连。

### 9.2 Skills 与运行时插件的区别

**事实：** Skills 的核心是文件发现、优先级/遮蔽、prompt catalog 和按需读取；每次 Runtime 上下文加载时从文件系统重新构建 catalog。

**事实：** Skill 本身没有代码模块激活、依赖注入、事件订阅、资源 disposer 或运行期卸载协议。

**推断：** Skills 已经提供成熟的多来源发现和冲突可见性语义，这些机制值得作为后续研究输入；但在当前源码中，Skill 是上下文内容系统，不是通用后端插件系统。

## 10. Kairos 的横切耦合

### 10.1 直接体量

Kairos 在 `agent-core/src/kairos/**` 中有 29 个生产文件、5,768 LOC。[`createKairosController`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/kairos/controller.ts#L229) 聚合 scheduler、storage、memory、brief、compression、tools、inbox 和 notifications 等完整子系统。

[`kairos/runner.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/kairos/runner.ts) 直接使用现有 Loop、ContextManager 和 ToolManager；它不是仅通过 Runtime Host Port 调用主内核的独立叶子模块。

### 10.2 跨层引用

除 Kairos 自身目录外，当前耦合还分布在：

- ContextLoader：注入主 Agent 的 Kairos inbox handoff；
- ToolScheduler：Kairos path guard 和专用分支；
- Shared：Kairos SessionEvent、settings 和 DTO；
- Desktop Main：bootstrap、IPC、生命周期和通知；
- Preload：单独的 `window.kairos` bridge；
- Renderer：Kairos 页面、设置、状态和会话展示；
- Skills service：Kairos whitelist 联动。

量化上，共有 80 个生产 TS/TSX 文件包含 `kairos` 引用，其中 34 个位于 Desktop、10 个位于 Shared。这比 5,768 LOC 的直接模块体量更能说明其横切性质。

源码入口包括：

- [Kairos Controller](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/kairos/controller.ts#L1)
- [ContextLoader handoff](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/context-loader.ts#L38)
- [ToolScheduler Kairos 分支](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/scheduler.ts#L155)
- [Desktop bootstrap](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/kairos-bootstrap.ts)
- [Desktop IPC](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/kairos-ipc.ts)
- [Shared SessionEvent union](../../../packages/shared/src/session.ts#L158)

**推断：** Kairos 当前不是一个可以通过移动目录就完整抽离的叶子能力。删除它需要覆盖 prompt、tool safety、session schema、IPC 和 UI 的完整横切面。其 v2 去留已在后续决策中确定为 Delete；本文只保留删除范围的现状证据。

## 11. Desktop、IPC 与固定前端边界

### 11.1 固定契约链

当前桌面链路是：

```text
Agent Core event/result
  -> Desktop Host Adapter
  -> 固定 Electron IPC channel / shared DTO
  -> 固定 Preload API
  -> React store / MessageBlock projection
  -> 固定 Renderer 组件
```

Desktop Host Adapter 将 RuntimeStreamEvent 发往固定的 `agent:stream` channel，见 [event sink](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/desktop-agent-runtime.ts#L83)。[`preload/index.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/preload/index.ts#L210) 显式枚举 IPC 方法，并分别暴露 `window.actspace` 与 `window.kairos` API。

Renderer 的 [`ConversationView`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/renderer/components/ConversationView.tsx#L176) 对现有 MessageBlock 类型做固定分支；shared 的 [`session-selectors`](../../../packages/shared/src/session-selectors.ts#L85) 再把 SessionEvent 与 ToolUiPreview 投影成这些 block。

### 11.2 当前前端兼容能力

**事实：** 当前前端没有插件 manifest、动态路由、动态设置页、动态导航、远程组件、slot registry 或 UI contribution 协议。

**事实：** 现有 generic tool 展示可以承接已经被 core/shared 归一化为通用 `tool` block 的内容，但 `ToolPreviewKind` 和专用 preview union 仍由 shared 固定定义；未知 kind 即使通过宽松运行时 guard，下游也没有完整的默认归一化保证。

**推断：** 在“前端先保持固定”的约束下，后端扩展只能可靠使用当前已经存在的通用展示、日志和设置能力。任何专用页面、专用交互、导航入口或专用 preview 都仍需修改并发布 Desktop 前端。

**推断：** 当前也没有“后端能力已加载，但其前端 contribution 被忽略并记录日志”的统一协商协议。后续若选择这种兼容策略，需要把它作为新的宿主契约讨论；它不是 v1 已有行为。

这一结论说明的是现状边界，不是在要求前端插件化。

## 12. 当前 `plugins/` 到底是什么

### 12.1 Shared 中的明确定义

v1 快照中的 shared plugin contract 直接说明：当时 Plugin 是独立二进制进程，由 main process 负责安装、启动、守护和退出；Skills 是另一套机制。该文件已随 v1 集成退役，v2 以 Plugin Runtime ABI 重新定义边界。

该文件定义的是 fs-watch 和 browser-bridge 的专用状态、配置与 IPC contract，没有定义通用插件 manifest、模块入口或贡献点。

### 12.2 fs-watch

[`fs-watch-service.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/plugins/fs-watch-service.ts#L1) 有 711 LOC，负责：

- 安装并定位 Rust binary；
- 生成/同步配套 Skill；
- spawn、restart、stop 和健康检查；
- 读取 heartbeat、JSONL 事件和配置文件；
- 把状态暴露给 Desktop IPC。

其协议由文件、JSONL 和 heartbeat 组成，见 [`plugins/fs-watch/README.md`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/plugins/fs-watch/README.md)。

### 12.3 browser-bridge

[`browser-bridge-service.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/browser-bridge-service.ts#L1) 有 406 LOC，负责安装 CLI、注册 Chrome Native Messaging Host、doctor/capabilities 检查和 socket 路径管理。

Agent Core 中的 browser 工具通过专用 Unix socket 客户端访问它；Chrome Extension 与 Native Host 协议见 [`browser-bridge/README.md`](../../../browser-bridge/README.md)。

### 12.4 研究结论

**事实：** 两个现有 plugin 使用不同协议、不同进程管理方式和不同集成路径：browser-bridge 是 Native Messaging + socket，fs-watch 是 binary + 文件/heartbeat contract。

**事实：** 它们由 Desktop 或 Agent Core 中的专用服务硬编码接入，没有统一 manifest discovery、in-process module activation、service injection、事件订阅、依赖图、作用域资源或通用 unload。

**推断：** 当前 `plugins/` 更准确地表示“仓库内独立二进制扩展项目的归档位置和产品称谓”，不是一个通用 **in-process 插件系统**。不能因为目录名已经叫 plugins，就假定新后端能力已经有可复用的插件内核。

**推断：** Browser Bridge 的协议与实现仍是 v2 迁移资产；fs-watch 的历史实现只作为研究证据保留，后续决策已经确定不迁移它。研究结论同时否定“现有机制已经通用化”。

## 13. 耦合热点量化

以下指标用于定位研究重点，不用于给模块打质量分：

| 热点 | 量化结果 | 说明 |
| --- | ---: | --- |
| 具体工具实现 | 8,851 LOC / 62 文件 | 最大的一组明确可辨认后端行为资产 |
| Kairos 直接模块 | 5,768 LOC / 29 文件 | 自身已是完整子系统 |
| Kairos 跨层引用 | 80 个生产文件 | 36 core、34 desktop、10 shared，显示横切面 |
| LLM 层 | 2,804 LOC / 16 文件 | 多协议、流式解析与 transport 资产 |
| Agent bridge | 2,164 LOC / 1 文件 | 事件、preview、持久化投影集中 |
| Desktop main index | 2,586 LOC / 1 文件 | Electron 生命周期和大量 IPC 装配集中 |
| Renderer App | 2,495 LOC / 1 文件 | 产品状态、路由和桌面装配集中 |
| Shared session schema | 994 LOC / 1 文件 | 事件与 UI preview 的封闭公共契约 |
| ConversationView | 1,055 LOC / 1 文件 | 会话展示分支集中 |
| fs-watch service | 711 LOC / 1 文件 | 专用二进制生命周期协议 |
| Runtime | 588 LOC / 1 文件 | 请求级生命周期与 host ports |
| Agent Loop | 520 LOC / 1 文件 | 模型/工具循环核心 |
| Preload | 512 LOC / 1 文件 | 固定 IPC API 面 |
| ToolScheduler | 465 LOC / 1 文件 | 权限、审批、Kairos 与后处理耦合 |
| browser-bridge service | 406 LOC / 1 文件 | 专用安装、doctor 与 socket 集成 |
| ContextManager | 327 LOC / 1 文件 | prompt/messages/usage/compaction 聚合 |
| ToolManager | 222 LOC / 1 文件 | 注册、分组、调度和 disposer |

补充文本扫描显示，`desktop/main/index.ts` 中约有 114 个 `ipcMain.handle/on` 匹配，`preload/index.ts` 中约有 134 个 `ipcRenderer.invoke` 匹配。该数字是文本匹配，不是去重后的 API 数；它只说明固定 IPC 面较宽，不应作为精确接口计数。

## 14. 关键风险

### 14.1 术语误导风险

把现有 `plugins/` 误认为通用插件内核，会低估 discovery、lifecycle、dependency、scope、capability、conflict 和 unload 等基础契约缺口。

### 14.2 “保留工具”等同于“保留工具内核”的风险

具体工具实现有很高迁移价值，但当前工具契约同时携带 UI、SessionEvent、Kairos 和 provider 信息。若不区分行为资产与编排契约，会把 v1 的横切耦合一起固化。

### 14.3 双重状态与崩溃恢复风险

运行中 messages 与持久 SessionEvent 分离，工具副作用又没有通用 durable intent/result 边界。扩展加载、自动重试或恢复会放大“状态看起来恢复，但外部副作用不确定”的问题。

### 14.4 动态注册冲突与资源泄漏风险

Prompt segment 和 ToolManager 都允许同名 `Map.set` 覆盖。ToolManager 虽有 disposer，但注册 API 没有贡献者/作用域模型；Prompt segment 没有 disposer。动态加载时很难解释谁覆盖谁、卸载谁的资源。

### 14.5 重试与并发所有权风险

Loop 与 provider 层都具备重试控制，工具并行只有全串行/全并行两档。第三方能力若包含非幂等副作用，模糊的重试和并发边界会直接影响正确性。

### 14.6 事件前向兼容风险

编译期 union 封闭、运行时 guard 宽松、Renderer projection 固定。未知事件可能被读入却无法稳定展示、回放或迁移。

### 14.7 Kairos 抽离范围低估风险

Kairos 不只是一组目录内代码，而是跨 Context、Tools、Session、Desktop IPC、Renderer 和 Skills。仅统计直接 LOC 会明显低估变化面。

### 14.8 固定前端兼容风险

后端能力可加载不代表用户可理解、可配置或可操作。当前 generic 工具展示能覆盖一部分后端能力，但专用 UI contribution 没有协商和降级协议。

### 14.9 外部二进制安全边界风险

fs-watch 和 browser-bridge 都涉及安装、spawn、文件/socket 协议和宿主权限。它们的专用实现已有相应检查，但当前没有一套可复用于任意第三方二进制的声明式权限、完整性和 capability contract。

## 15. 事实、推断与未决问题汇总

### 15.1 已由源码确认的事实

- Desktop 与 CLI 共享同一个 Agent Runtime，并通过不同 Host Adapter 注入宿主能力；
- Runtime、Loop、ContextManager、ToolManager、LLMService 都已形成可辨认模块边界；
- 当前核心装配仍由固定代码完成，不是动态模块系统；
- 具体工具实现约 8,851 LOC，是后端中体量最大且边界相对可辨认的行为资产；
- SessionEvent 持久化与运行期 messages 是两种表示，最终结果由 bridge 再投影；
- Skills 是文件/prompt 发现机制，不是可执行插件生命周期；
- Kairos 在 core、shared、desktop 和 renderer 之间横切；
- Desktop IPC、Preload、shared DTO 和 Renderer 分支是固定前端边界；
- 当前 `plugins/` 是两个专用外部二进制协议，不是通用 in-process 插件系统。

### 15.2 由事实支持、仍待设计验证的推断

- Host Adapter、具体工具和 Skills discovery 是重构资产；LLM 已进一步确定为 ActSpace LLM seam 后采用 pi-ai，并保留仍不可替代的代理和错误语义；这些都不能原样统称为插件内核；
- ToolManager/SystemPrompt 的注册 API 缺少动态扩展所需的冲突与所有权语义；
- Bridge、SessionEvent 和 Tool preview 是重构中不可绕开的隐性核心；
- Kairos 的删除成本主要来自横切集成，不只是 5,768 LOC 的目录移除；
- 前端保持固定是可讨论的产品约束，但后端扩展必须受限于已有 generic surface，或明确声明不可展示的 capability；
- 现有持久化足以支持当前正常流程，但对 crash-safe 副作用恢复和未知扩展状态缺乏明确协议。

### 15.3 后续设计必须回答、本文不作答的问题

- 插件 manifest 的最小身份、版本、依赖、激活单位和作用域最终 schema 是什么；
- 插件贡献点与 core service 的边界如何定义；
- 已确认采用 profile、bundle、patch 组合后端能力；其最终 schema 以及与用户设置、项目配置和 Session snapshot 的关联仍需确定；
- 工具、prompt、LLM、hook、后台服务分别需要什么注册冲突和 disposer 语义；
- SessionEvent 如何支持稳定排序、恢复、未知事件和插件私有状态；
- 固定前端如何声明它能消费的 capability，无法消费时如何被用户看见；
- 外部二进制插件与 in-process 模块是否属于同一种插件，或只是共享上层管理面；
- Agent/Explore 等复合能力的最终归属是什么。Kairos 和 fs-watch 已确认删除，不再属于开放项。

这些问题是研究产出的设计输入，不构成实施清单。

## 16. 源码证据索引

| 主题 | 主要证据 | 支持的事实 |
| --- | --- | --- |
| Runtime | [`runtime/agent-runtime.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts) | 请求生命周期、host ports、持久化顺序、abort/dispose |
| Desktop Host | [`desktop-agent-runtime.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/desktop-agent-runtime.ts) | Desktop 对同一 Runtime 的上下文、模型、事件、审批适配 |
| CLI Host | [`runtime-adapter.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-cli/src/runtime-adapter.ts) | CLI 对同一 Runtime 的适配 |
| Loop | [`engine/loop.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/loop.ts) | LLM turn、重试、messages 变更、工具串并行、request snapshot |
| Agent | [`engine/agent.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/agent.ts) | Loop 与 ContextManager 的组合 |
| Bridge | [`engine/bridge.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/engine/bridge.ts) | 新旧事件桥接、preview、SessionEvent 重建 |
| Context | [`context/manager.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/manager.ts) | prompt、messages、tools、compaction、usage 所有权 |
| Conversation | [`modules/conversation.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/modules/conversation.ts) | SessionEvent 到 messages 的加载与压缩替换 |
| Prompt | [`modules/system-prompt.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/modules/system-prompt.ts) | segment Map、更新、启停、移除、覆盖行为 |
| Context 装配 | [`runtime/context-loader.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/context-loader.ts) | AGENTS、Kairos、Browser、Skills、mode 的固定注入 |
| 工具装配 | [`tools/index.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/index.ts) | 工具手工枚举和条件注册 |
| 工具注册 | [`tools/manager.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/manager.ts) | registry、progressive group、scheduler、disposer |
| 工具调度 | [`tools/scheduler.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/scheduler.ts) | permission、approval、handler、Kairos、后处理 |
| 工具类型 | [`tools/types.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/types.ts) | spec、runtime dependency、preview、Kairos 字段 |
| 工具结果 | [`internal-tools.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/internal-tools.ts) | ToolResult 与 UI、SessionEvent、artifact、subagent 耦合 |
| LLM | [`llm/types.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/types.ts), [`llm/factory.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/factory.ts) | 统一接口与封闭协议 factory |
| Provider | [`provider-adapter.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/provider-adapter.ts), [`provider-transport.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/provider-transport.ts) | provider 差异、代理 transport 和缓存 |
| JSONL | [`persistence/jsonl.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/jsonl.ts) | 追加、解析错误、normalize |
| Session Store | [`persistence/session-store.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/session-store.ts) | fork、结果写入、context sidecar |
| Recovery | [`persistence/recovery.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/recovery.ts) | 宽容恢复与错误收集 |
| Session schema | [`shared/session.ts`](../../../packages/shared/src/session.ts) | 封闭事件和 preview union、无 seq |
| Session projection | [`session-selectors.ts`](../../../packages/shared/src/session-selectors.ts) | 宽松运行时 guard、MessageBlock 投影 |
| Skills discovery | [`skills/registry.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/registry.ts) | roots、优先级、first-win、shadow diagnostics |
| Skills catalog | [`skills/catalog.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/catalog.ts) | prompt catalog 和按需读取模型 |
| Skills Desktop | [`skills-service.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/skills-service.ts) | 列表、安装、卸载、Kairos whitelist 联动 |
| Kairos | [`kairos/controller.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/kairos/controller.ts), [`kairos/runner.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/kairos/runner.ts) | 完整子系统及对旧 Loop/Tools 的依赖 |
| Kairos Desktop | [`kairos-bootstrap.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/kairos-bootstrap.ts), [`kairos-ipc.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/kairos-ipc.ts) | Desktop 生命周期与固定 IPC |
| Preload | [`preload/index.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/preload/index.ts) | 固定 `window.actspace` / `window.kairos` API |
| Renderer | [`ConversationView.tsx`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/renderer/components/ConversationView.tsx) | 固定 MessageBlock 展示分支 |
| 当前 Plugin 类型 | v1 shared plugin contract（已退役） | 独立二进制定义和两个专用 contract |
| fs-watch | [`fs-watch-service.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/plugins/fs-watch-service.ts), [`README`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/plugins/fs-watch/README.md) | binary、Skill、heartbeat、JSONL 专用生命周期 |
| browser-bridge | [`browser-bridge-service.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/desktop/src/main/browser-bridge-service.ts), [`README`](../../../browser-bridge/README.md) | Native Messaging、CLI、doctor、socket 专用集成 |
