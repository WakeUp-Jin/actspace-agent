# 上下文管理引擎 V2：生命周期、模块状态与插件包拆分

状态：2026-10-11，代码、自动化与最终 `gpt-6.1-sol` Computer Use 已完成；写入型 UI 路线因 browse-only Session 未覆盖。执行模式：交互模式。

## 目标

将当前“每次请求创建并冻结 Context”的实现，演进为由 Harness 提供的长期 Context 管理引擎服务。引擎按 `Session + Agent 逻辑作用域` 管理可恢复的 Context 实例；每个上下文模块拥有自己的状态切片和插件包；模型调用前从一致状态捕获不可变 `LlmInput`；Session Journal 仍是事实和持久化权威；前端通过引擎提供的只读 Projection 读取当前 Context 与实际请求 Context。

完成后，单次 Run 内多个 Step 可以复用同一个 Context 逻辑身份；模型输出和工具结果在持久检查点后更新对应模块；Context 可以跨 Run 释放、重建和恢复；压缩、渐进式披露、Codec、Session、LLM Adapter 和前端展示保持清晰边界。

## 范围

### 包含

- 为 Context、ContextProjection、LlmInput、模块注册、作用域身份、状态 revision、事件提交和只读投影固定公共契约。
- 建立 Harness 生命周期内的 Context Management Engine 服务，以及按 `Session + Agent Scope` 隔离的实例注册、hydrate、reconcile、capture、release。
- 将上下文模块按 `packages/context/` 领域目录拆分为 engine、system、runtime、rules、skills、conversation、tools、disclosure、compaction 独立 workspace 包；保持历史 Codec owner 与事件可读性。
- 将模型/工具输出接到 Session 持久检查点之后的模块局部更新，支持增量水位、冷启动重放、失败阻断、过期异步结果丢弃和 Session/fork 隔离。
- 保持现有 Context 组装顺序、required/optional 来源语义、动态补充安全锚点、工具调用边界、压缩候选/core/applied、渐进式披露和 LLM Adapter 边界。
- 为当前 Context 和历史实际请求分别提供只读 Projection，保留 `contextWindow`、Context estimate、Provider usage 和 request snapshot 的既有含义。
- 编写后端单元、契约、集成、恢复和回归测试；编写独立的 Electron Computer Use 验收计划，由 `gpt-6.1-sol` 执行真实前端交互验收。

### 不包含

- 不在本计划中实现跨 Session 长期记忆、自动生成 Skill、工作流沉淀、质量修复 Agent 或模型驱动的 Context 评价。
- 不重写 Session Journal、Surface、Task/Run/Turn 语义、权限审批、工具执行、凭据存储或 Provider 协议。
- 不把 Context 的内部可变对象暴露给 renderer，不让前端直接修改 Context，不建立独立的 conversation 事实库。
- 不删除旧 Codec、旧事件 owner 或现有 request/context snapshot；旧的单包入口已由同一领域目录下的 `engine` 包替代。
- 不新增设置页或任意 Context entry 编辑能力；不把 Context estimate 当作 Provider usage。
- 不把 Computer Use 验收交给代码静态检查代替；不在验收子任务中直接修复发现的产品 Bug。

## 背景和依据

### 必读设计文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/PLANS_GUIDE.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md`
- `docs/design-docs/上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎的插件拆分和上下文的插件拆分.md`
- `docs/design-docs/上下文管理引擎设计/agent-progressive-disclosure.md`
- `docs/design-docs/上下文管理引擎设计/agent-compaction-prompt.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/01-总体设计与调用流程.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/02-生命周期与状态更新.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/03-插件包与职责边界.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/04-旧文档与源码漂移核对.md`

### 主要代码入口

- `packages/context/engine/src/{types,engine,instances,state,codec,plugin}.ts`
- `packages/context/{system,runtime,rules,skills,conversation,tools,disclosure,compaction}/src/`
- `packages/prompt/src/context-source-support.ts`、`packages/prompt/src/assembler.ts`
- `packages/context/compaction/src/` 与 `packages/context/engine/src/compaction.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/runtime/src/harness/agent-factory-plugin.ts`、`default-harness-definition.ts`、`default-harness.ts`
- `packages/session/storage`、`packages/session/journal`、`packages/session/persistence`
- `packages/shared/src/context-projection.ts`、`packages/shared/src/session.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `apps/desktop/src/main/runtime-v2/`、`apps/desktop/src/renderer/ContextPopup.tsx`、`apps/desktop/src/renderer/components/right-panel/context/ContextPanel.tsx`（2026-10-11 取代 ContextRenderView）

### 已知基线

- 当前长期 Context 契约位于 `packages/context/engine/src/types.ts`；Engine 持有实例，`LlmInput` 和 Host Projection 才是冻结的只读结果。
- 当前 Loop 的 `contextInput` 会在 Step 侧创建 `ContextEngine`，V2 需要引入长期服务和实例注册，同时保留兼容适配路径。
- 当前 Harness 已提供共享 `ContextInstanceRegistry`；每个 Step 仍可创建轻量 `ContextEngine` facade，但 facade 使用同一逻辑 Context 实例。
- 当前前端主要从 request/context snapshot 派生 ContextState；V2 增加当前 Context projection，但不删除历史请求 projection。
- 工作区已有大量与本计划无关的未提交改动。实施期间只修改计划明确列出的文件，保留其他改动，不做 broad staging、commit、push 或分支清理。

## 里程碑与任务

### P0：基线、契约和迁移矩阵

依赖：无。产物：冻结后的迁移矩阵、旧/新身份表和可执行文件范围。

- 对照当前源码固定 Context、Session、Scope、Run、LlmInput、Projection、Codec 的真实入口和调用关系。
- 固定 `ContextIdentity = sessionId + logicalAgentScopeId`、`RuntimeBinding = runId + harnessGeneration + scopeId`、`ContextRevision`、`JournalWatermark`、`SurfaceGeneration` 的字段含义和比较规则。
- 明确 acceptedSeq/durableSeq、插件状态事件、request snapshot、前端 Projection 的事实优先级。
- 建立旧 `actspace.context` owner、事件类型、Codec、manifest、package export 与 V2 目标包的映射；记录哪些可保留兼容别名、哪些只能在迁移完成后删除。
- 产出 P0 契约测试 fixture 目录和测试命令清单，不提前改生产实现。

验证：现有 Context、Prompt、Session、Compaction、Loop、Runtime 定向测试通过；新增迁移矩阵中每个入口有真实源码路径和责任人。

### P1：长期 Context 实例与公共契约

依赖：P0。允许修改：`packages/context/engine` 公共类型/engine/instances、Context manifest/export、对应 unit tests；不移动模块行为。

- 将长期 `ContextState`/`ContextInstance`、只读 `ContextView`/`ContextProjection`、单次 `LlmInput` 的语义分开；requestId/turnId/stepId 只属于调用捕获。
- 实现 Context registry：按 Session 与逻辑 Agent Scope 查找、创建、hydrate、绑定运行 Scope、释放和重建；并发同一 key 串行，不同 Session 可并行。
- 实现 capture：捕获 Context revision、各模块 revision、Journal 水位、Surface generation、配置/插件代际，转换只读取捕获值并深冻结 LlmInput。
- 增加过期异步结果检查；身份、binding generation、依赖 revision 不匹配时丢弃，不覆盖新版本。
- 保留旧 `getContext(request)` / `toLlmInput(context)` 的兼容适配器，明确它们内部调用长期实例 capture，而不是继续把 Context 定义成快照。

验证：Context identity/session isolation、跨 Step 复用、释放后 hydrate、并发串行、stale update、LlmInput immutable、retry reuse fixture。

### P2：模块状态 reducer、Session 事件与恢复

依赖：P1。允许修改：`packages/context/engine/src/state*`、模块状态/Codec、Session adapter、Loop/工具结果接线、相关 tests。

- 为 system/runtime/rules/skills/conversation/tools/disclosure 固定模块注册、owner、作用域、required/optional、刷新依赖和局部 reducer/project 接口。
- 模型输出和工具结果采用“Session append → awaited checkpoint → reconcile → 发布 Context revision”的顺序；流式 delta 仍走展示通道，不把未提交 delta 当正式会话事实。
- Conversation 从 Session Surface 增量同步；其他模块只解释自己拥有的状态；同一事件影响多个模块时各自 reducer，不互相写私有状态。
- 为插件状态事件提供 versioned Codec，继续保留 `plugin/actspace.context/...` 历史 owner 可解码；行为停用不能移除历史 Codec。
- 支持冷启动 replay、旧会话默认状态、fork 边界、持久失败阻断、缺失派生状态恢复和重复事件去重。
- 将 disclosure/compaction 的现有状态恢复接入长期 Context，不重做已验证的 100 条路径、周期和候选/core/applied 算法。

验证：Session accepted/durable、assistant/tool result update、old journal replay、fork isolation、failure recovery、codec compatibility、compaction/disclosure regression。

### P3：目标插件包与 Harness 装配

依赖：P1、P2。允许修改：`packages/context/*` 目标包、`packages/prompt` 来源桥接、`packages/context/compaction`、manifest、exports、默认 Harness 构建脚本和 package tests。

- 建立 `packages/context/engine`、`system`、`runtime`、`rules`、`skills`、`conversation`、`tools`、`disclosure`、`compaction` 独立 workspace 边界；公共契约由 engine 暴露，避免平行 contracts 包。
- 先迁移纯契约和一个模块，再逐个迁移来源；每个包保留 manifest、behavior entry、Codec entry（需要时）、owner 和 dispose 测试。
- 让 engine 只依赖 contracts 与基础服务，不 import 具体来源实现；模块通过公共契约注册，不新增平行 loader。
- 将当前 Prompt contributors 分配到目标模块，保留稳定排序和 required/optional 语义；英语学习等扩展通过来源接口接入。
- 将压缩策略作为引擎注册的策略插件，迁入 `packages/context/compaction`，保留摘要模板、许可证、provider/utility 路由和失败边界。
- 更新默认 Harness、纯 Codec discovery、ESM 闭包、package exports、contract matrix；证明旧事件仍可读、新行为只启用一次。

验证：package lifecycle、manifest/Codec discovery、duplicate registration、unload/reload、default Harness build、strict package cutover、legacy removal 检查（仅删除已经迁移且有兼容证据的入口）。

### P4：组装、Projection 与 Loop/Host 接线

依赖：P2、P3。允许修改：engine capture/assembly、Loop、Runtime Projection、Host IPC、Desktop Context UI 的数据接线和相关 tests；保持 UI 布局范围收敛。

- Loop 在一个 Run 的多个 Step 复用 Context logical identity；下一 Step 只 reconcile 新水位和已声明变化，模型切换在新请求边界重新 capture。
- 保留 system → runtime → rules → skills → conversation → tools → disclosure 的稳定输出顺序，补充仍在安全锚点插入。
- Engine 提供当前 Context Projection；Runtime/Host 通过只读端口查询或订阅，renderer 不接触 Context 实例。
- 前端同时支持“当前 Context”与“实际请求 Context”两种 basis，明确 revision、watermark、model/contextWindow、estimate、Provider usage 的差异。
- 保持 ContextPopup、右侧 Context 面板（ContextPanel）、Composer 的现有消费契约和主题/布局边界；不把新状态误投影成 user message。
- 加入关闭/重开 Session、无活跃 Run 的冷读、远端观察断开、旧会话无 V2 事件的投影兼容。

验证：Loop multi-step integration、model switch snapshot、tool batch boundary、current/request projection、IPC read-only、renderer tests、Electron smoke。

### P5：全量验证、Computer Use 验收和交付

依赖：P1–P4。执行前创建 `docs/exec-runs/20261011-context-management-engine-v2/` 的 `execution-process.md` 与 `execution-summary.md`。

- 按[测试与验收计划](test-acceptance-plan.md)运行后端单测、契约测试、集成测试、恢复测试、全仓检查和构建。
- 由 `gpt-6.1-sol` 按 Computer Use 分组执行真实 Electron 前端交互验收；验收子任务只记录证据，不修复产品代码。
- 主执行者根据失败项定位和修复，之后只对受影响验收点定向复验；报告逐项区分真实 UI、Journal/运行时证据、源码推断和未覆盖。
- 更新正式设计文档、README、执行过程/摘要、history；完成计划后移入 `completed/`，保留真实 Provider、Electron、签名制品等未覆盖门禁。

## 文件边界

### 初始允许修改

- `packages/context/`
- `packages/prompt/`
- `packages/context/compaction/`
- `packages/core/agent-loop/`
- `packages/runtime/src/harness/`
- `packages/runtime/src/projection/`
- `packages/session/`
- `packages/shared/src/context*`、`packages/shared/src/session*`
- `apps/desktop/src/main/runtime-v2/`
- `apps/desktop/src/renderer/ContextPopup.tsx`、`apps/desktop/src/renderer/components/right-panel/context/`、相关 projection selectors/tests
- 对应 `docs/design-docs/`、`docs/exec-runs/`、`docs/histories/`

### 明确禁止未经重新批准的范围扩展

- `browser-bridge/`、凭据/密钥、Provider 协议实现、Tool permission policy、Task/Run scheduler、非 Context 前端重构。
- 与现有 dirty worktree 相关的无关文件。

## 风险与回退

- **风险：长期 Context 与当前 Run Scope 混淆。** 缓解：P0 固定两套身份；所有异步更新带 binding generation；Run 结束只释放运行绑定。
- **风险：内存状态领先 Journal。** 缓解：只在 awaited durable checkpoint 后发布可继续使用的 revision；accepted/durable 分开测试。
- **风险：拆包导致旧 Session 无法读取。** 缓解：先保留旧 owner/Codec 与 manifest discovery；建立旧 Journal/fork fixture；行为停用不等于 Codec 删除。
- **风险：前端把“当前 Context”误认为“已发送输入”。** 缓解：Projection 带 basis、requestId、revision、watermark；真实请求仍从 request/context snapshot 读取。
- **风险：切片刷新出现跨插件循环或半成品。** 缓解：插件只能提交自有切片，engine 统一提交/排序/失败语义；测试 stale update、duplicate event 和 required/optional failure。
- **风险：Computer Use 发现问题后直接被验收代理修改。** 缓解：验收代理只执行并报告；主执行者负责修复，再定向复验。

最小回退路径：先停用新 Context behavior，保留旧 Codec 和 Journal；恢复兼容 request adapter 与现有 request/context projection；不删除已写入的插件事件、不重写用户 Session、不回退到第二套 conversation 存储。

## 验证入口

- 后端与前端自动化、Computer Use 验收点和操作分组见[测试与验收计划](test-acceptance-plan.md)。
- 执行过程与摘要在执行开始后创建于 `docs/exec-runs/20261011-context-management-engine-v2/`。
- 计划自审要求：所有任务都有文件范围、依赖、命令和预期证据；未获得用户进一步确认前不开始 P1 源码实施。

## 进度记录

- [x] 完成 V2 设计文档与架构漂移核对。
- [x] 完成执行阶段、文件范围、回退和验证边界梳理。
- [x] 完成后端测试与 Computer Use 验收计划。
- [x] 用户审阅并确认开始 P0/P1 实施。
- [x] 完成 P0 基线、P1 长期实例/capture 与 P2 reducer/reconcile 第一阶段。
- [x] 完成 P2 完整模块事件接线、P3 目标插件包迁移与 P4 Host/前端投影接线。
- [x] 在所有自动化检查完成后执行最终 `gpt-6.1-sol` Computer Use 验收；写入型路线因 browse-only Session 保留未覆盖证据。
- [x] 更新执行摘要并准备将计划移入 `completed/`。

## 决策记录

- 2026-10-11：采用交互模式；这是架构、持久化、包边界和前端投影同时变化的高风险任务，需要人在线逐阶段审阅。
- 2026-10-11：后端测试与前端 Computer Use 作为同一执行计划的两个验收轨道；静态/自动化证据不能替代真实 Electron 交互。
- 2026-10-11：Computer Use 验收默认委派 `gpt-6.1-sol`；不可用时记录限制，不静默切换模型。

## 执行文档

执行开始时创建：

- `docs/exec-runs/20261011-context-management-engine-v2/execution-process.md`
- `docs/exec-runs/20261011-context-management-engine-v2/execution-summary.md`

计划已完成；物理拆包、Runtime Projection、Host/IPC 接线、后端自动化和最终 Computer Use 报告均已形成证据。完成后的计划归档到 `docs/exec-plans/completed/`。
