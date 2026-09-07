# Agent 插件化 Runtime 重构设计

- [英语辅助学习插件设计](agent-english-learning.md)：已实施的独立能力插件，定义会话级双语提示词注入、英文朗读、Host 播放和固定桌面端入口；[执行计划](../../exec-plans/completed/20260906-actspace-english-learning/README.md)。

> 状态：v2 多包 Plugin Runtime、Cordis adapter、pi-ai adapter、Profile-first Boot 和 `apps/`/`packages/` 边界已经实现并通过自动化验证；真实 Provider、Chrome Extension、签名/公证和 Desktop DMG 仍是发布门禁（2026-08-30）。
>
> 本目录同时保存“研究证据”和“目标决策”。阅读时必须先看每份文档顶部的状态，不能用研究稿覆盖后续已确认决策，也不能把待评审字段当成实现规范。

> 变更提示（2026-08-29）：新增 [`agent-decision-dsh-native-plugin-runtime.md`](./agent-decision-dsh-native-plugin-runtime.md)，记录“完全信任同进程插件”前提下向 DSH-native `cordis.yml` + Include + Loader + `apply(ctx)` 迁移的提案。该提案已获方向确认，但仍待文档评审；在实现切换完成前，现有 Static Manifest/Composition 文档仍是当前代码事实。

> 变更提示（2026-08-29）：新增 [`agent-spec-dsh-plugin-assembly-and-agent-startup.md`](./agent-spec-dsh-plugin-assembly-and-agent-startup.md) 与独立执行计划，专门约束插件组装、Cordis Loader 启动、AgentLoop Service 和 `agent.followup()`。该规范/计划不修改既有核心重构计划的 P00/P04；实现完成后再统一同步相关计划状态。

> 变更提示（2026-08-29）：新增 [`agent-spec-cordis-event-abi-and-eventhub-retirement.md`](./agent-spec-cordis-event-abi-and-eventhub-retirement.md) 与独立执行计划，明确真实 Cordis `next()`/bail/parallel/contained emit 语义，并将 ActSpace 自定义 EventHub 定义为迁移临时层；迁移完成后删除其源码、导出、测试和调用点，不保留兼容 API。

> 变更提示（2026-08-29）：新增 [`agent-spec-dsh-runtime-as-plugin-composition.md`](./agent-spec-dsh-runtime-as-plugin-composition.md) 与 [`20260829-actspace-dsh-runtime-full-plugin-composition`](../../exec-plans/completed/20260829-actspace-dsh-runtime-full-plugin-composition/README.md)，定义最终目标：Session、LLM、Tools、Prompt、Agent、AgentLoop、Subagent 和 Headless Run 由 Cordis plugin tree 创建，固定 Bootstrap/Host 只负责启动边界和外部 capability。该规范已批准，Phase 1–6 自动化实施完成，真实宿主门禁待验收。

> 变更提示（2026-08-29）：新增 [`agent-spec-tool-name-contract.md`](./agent-spec-tool-name-contract.md) 与 [`20260829-actspace-tool-name-contract`](../../exec-plans/completed/20260829-actspace-tool-name-contract/README.md)，记录 DeepSeek 400 的根因和已完成的全量修复：模型/Provider/Runtime/Session 直接使用扁平 `name`，`pluginId` 独立保留为 ownership/provenance，具体 executor 不改。

> 变更提示（2026-08-29）：新增 [`agent-spec-core-cordis-services.md`](./agent-spec-core-cordis-services.md) 与 [`20260829-actspace-core-cordis-services`](../../exec-plans/completed/20260829-actspace-core-cordis-services/README.md)，定义并落地核心 Service ownership、Definition/Provider/Consumer seam 与 Runtime 收缩边界；Phase 1–5 已完成，真实 Provider/Desktop/Chrome 与发布制品仍属外部人工门禁。

> 变更提示（2026-08-29）：新增 Session Core/Persistence、Service Definition/Provider/Consumer、Profile/Bundle/Patch 和 Contract Matrix 四份后续规范及对应 P1/P2 execution plan。它们承接已完成的 P0，不重新定义 13 个 Session 事件、9 个 Loop 插入点、5 个通知、Cordis Event ABI、Agent Scope 或工具 executor；当前只建立可执行的下一阶段边界。

> 变更提示（2026-08-30）：新增 [`agent-target-session-persistence-projection-architecture.md`](./agent-target-session-persistence-projection-architecture.md) 与独立执行计划，冻结“Session Journal 唯一事实源、Pure Projection、统一 watermark、Session-bound Desktop Store、同源 Trajectory”的长期架构；不改变既有事件、工具 executor 或 JSONL 物理格式。

## 背景

ActSpace v1 已通过 `v1-final` tag 固定基线，v2 工作位于 `refactor-dsh-plugin` 分支。v2 允许重写后端内核，重点保留 ActSpace 已验证的具体工具行为，并采用 DSH 的 Cordis 运行时思想、Agent Core 行为规格和 Profile / Bundle / Patch 组合模式。

本轮研究使用以下源码快照：

- ActSpace：`refactor-dsh-plugin` 分支；
- DSH：`tmp/deepseek-harness` 的 `47f943859bef` 快照；
- 用户分析材料：`dsh的分析.md`，只作为研究线索，不作为源码事实来源。

`tmp/deepseek-harness` 被当前仓库的 `.gitignore` 排除。研究稿中的 DSH 源码路径和行号只对应上述快照；长期约束已经开始转写到本目录的决策和目标文档。

## 当前决策总账

第一次进入本专题先读 [v2 总体架构](./agent-target-overall-architecture.md)，需要确认决策等级时再读 [v2 已确认决策](./agent-decisions-v2-foundation.md)。当前状态如下：

| 主题 | 当前状态 | 入口 |
|---|---|---|
| Profile-first Runtime 精简 | 已执行；当前只保留 Headless 与 Desktop，RuntimeHandle/RuntimeFacade 已从生产导出和调用链移除 | [Profile-first Runtime 设计](./agent-decision-profile-first-headless-desktop.md) |
| v2 总体架构 | 产品范围和公共语义已确认，条件采用项已标注 | [v2 总体架构](./agent-target-overall-architecture.md) |
| DSH 机制事实 | 研究完成 | [DSH 架构研究](./agent-research-dsh-architecture.md) |
| ActSpace v1 现状 | 研究完成 | [ActSpace 当前后端研究](./agent-research-actspace-current-state.md) |
| 现有能力去留 | 研究判断已按确认结论更新 | [能力去留研究](./agent-research-capability-disposition.md) |
| Cordis 采用 | 精确锁版实现已落地；自动 admission/lifecycle 通过，签名 Desktop 外部门禁待验收 | [Cordis 采用决策](./agent-decision-cordis-adoption.md) |
| Agent Core 所有权 | 已确认 | [Agent Core 目标边界](./agent-target-agent-core.md) |
| 包结构与真实插件包化 | 已实现；`apps/`、领域 packages、真实 Entry 与边界 verifier 已通过 | [包结构与真实插件包规范](./agent-spec-package-layout-and-plugin-packaging.md) |
| Session / Context | 已确认；只使用 raw JSONL 文件 | [Session 与 Context 目标设计](./agent-target-session-and-context.md) |
| LLM / pi-ai | adapter 与自动契约已实现；真实 Provider 请求/resume 待验收 | [LLM Adapter 目标设计](./agent-target-llm-adapter.md) |
| Runtime / Composition / Host | Profile-first 已执行；managed ESM、restart-only、Headless/Desktop 各自持有一个 root 与 App Bundle Service | [Profile-first Runtime 决策](./agent-decision-profile-first-headless-desktop.md) |
| 公共 ABI / Protocol | 原有契约加上 DSH 事件、Cordis 插入面、Tool Runtime 边界和 Tool Name 契约 | [公共契约](#公共契约) |
| DSH-native 插件组装 | 实现完成候选；CLI run 的 DSH 路径已贯通，旧 composition 外壳仍待单独收口 | [DSH 风格插件组装与 Agent 启动规范](./agent-spec-dsh-plugin-assembly-and-agent-startup.md) |
| Cordis 事件 ABI | 已执行；领域包直接使用 Cordis Context，重复 EventHub 已删除 | [Cordis 原生事件 ABI 与 EventHub 退役规范](./agent-spec-cordis-event-abi-and-eventhub-retirement.md) |
| DSH-native Runtime 全量插件组装 | 已批准；Phase 1–6 自动化实施完成，真实 Provider、Electron/Chrome 和发行门禁待验收 | [Runtime 插件组装规范](./agent-spec-dsh-runtime-as-plugin-composition.md) |
| 核心 Cordis Service 化 | P0 已实现；P1-B 继续把 Definition/Provider/Consumer 提升为全域 ABI | [核心 Service 化规范](./agent-spec-core-cordis-services.md) |
| DSH 核心重构计划 | P0 实现与自动化验证已完成；遗留外部宿主门禁按执行摘要保留 | [DSH Agent Loop / Session / Tool Shell 计划](../../exec-plans/active/20260829-actspace-dsh-core-rebuild/README.md) |
| Session Core / Persistence | 目标设计已确认，P1-A 待实施 | [Session Core 分离规范](./agent-spec-session-core-persistence-separation.md) |
| Session 持久化与投影收敛 | 目标设计已确认，P00-P03 待实施 | [Session 持久化与投影架构](./agent-target-session-persistence-projection-architecture.md) |
| Service Definition / Provider / Consumer | 目标设计已确认，P1-B 待实施 | [Service 三层规范](./agent-spec-service-definition-provider-consumer.md) |
| Profile / Bundle / Patch | 目标设计已确认，P1-C 待实施 | [组合分层规范](./agent-spec-profile-bundle-patch-layering.md) |
| Contract Matrix | 目标设计已确认，P2 待实施 | [契约矩阵规范](./agent-spec-contract-matrix-generation.md) |
| Tool Name 全量切换计划 | 已完成；修复 namespaced 工具名进入 Provider wire 的问题 | [Tool Name 全量切换计划](../../exec-plans/completed/20260829-actspace-tool-name-contract/README.md) |
| 完整 v2 交付计划 | 历史交付记录；事件、Loop、Tool shell 和 CLI run 入口由新计划取代 | [v2 完整交付计划](../../exec-plans/active/20260822-actspace-v2-plugin-runtime/README.md) |

## 已确认与有条件确认方向

- 有条件采用 DSH 维护发布的 `@deepseek-ai/cordis` runtime family，精确锁版；不使用旧上游 Cordis，不自行 fork。
- ActSpace 按 DSH 领域包方式拆分 Agent Runtime；不建立 `vendor/`、`harness/` 或通用 `plugins/` 总目录。插件是独立 workspace package 的 Runtime ABI 身份，Session、LLM、Prompt、Tools 和 Agent Loop 都可以是核心语义插件。
- 不直接依赖 DSH Agent Core 包；DSH Agent Core 作为行为规格、实现参考和测试来源。
- ActSpace 拥有固定 Boot、Agent Core 领域契约、Session Format、Event Codec、Host 和插件 ABI。
- 完全替换旧 Session 和可变 Context 双真相，不迁移 v1 Session 数据。
- 有条件采用 pi-ai 作为 Provider wire/catalog engine，但隔离在 ActSpace LLM Adapter 后。
- 使用 Profile / Bundle / Patch 组合后端能力；Headless 与 Desktop 各自消费 BootedProfile Context，每个 Host 进程只 boot 一个 root。
- 不设计全局 Composition Generation；`ResolvedComposition` 只作为只读启动、诊断和 provenance 数据，各领域自己维护必要的 registration 或 snapshot。
- 前端在 v2 中不插件化，不执行后端插件携带的前端代码。
- 保留具体工具 executor、协议、安全检查和行为测试，不保留旧 ToolManager、ToolResult、bridge 和 UI 耦合。
- 删除 Kairos 和 fs-watch；保留 Browser Bridge 并适配新的 Host capability / tool plugin 边界。
- v2 只做一次完整产品切换；execution plan 可拆任务，但不交付缺少范围内能力的半成品版本。
- 插件只支持受信任同进程来源；不做市场、签名、自动更新和不可信执行。
- 主分发使用 managed ESM runtime；CLI run 默认 ephemeral，Desktop 默认 persistent；CLI chat 不再是当前生产入口。
- 配置与代码变化采用 restart-only；不设计在线 reconcile。
- 完整范围包括 main Agent、Agent / Explore 重写、one-shot Subagent、静态 Preset、Todo、Skills、Compaction、保留工具、Browser Bridge、Desktop 和 CLI。
- generic Workflow、continuable subagent、Preset StandingMount、live reload、Session zstd / SQLite 不进入 v2。

## 公共契约

| 契约 | 固定内容 |
|---|---|
| [插件 Runtime ABI](./agent-spec-plugin-runtime-abi.md) | manifest、identity、Entry / Service / Event、trust、Host ceiling、frontend、codec discovery、restart-only 和 lifecycle |
| [Session 格式](./agent-spec-session-format-v1.md) | raw JSONL、Header、Event Envelope、Surface、codec、repair、fork、compaction、writer lease 与 golden cases |
| [Tool Runtime ABI](./agent-spec-tool-runtime-abi.md) | definition / executor、prepared lease、validation、policy、approval、checkpoint、并发和 result |
| [DSH 风格 Session 事件模型](./agent-spec-dsh-event-model.md) | 13 种核心事件、持久化扩展、三平面、Envelope、顺序、恢复和旧事件删除 |
| [Agent Loop Cordis 插入面与通知面](./agent-spec-agent-loop-cordis-surface.md) | 9 个干预点、5 个主要通知、生命周期、scope、发布事务和 dispose |
| [Cordis 原生事件 ABI 与 EventHub 退役规范](./agent-spec-cordis-event-abi-and-eventhub-retirement.md) | `next()` waterfall、serial bail、parallel、contained emit、typed Events、scope 与 EventHub 删除清单 |
| [Agent Scope 模型](./agent-spec-agent-scope-model.md) | opaque identity、parent chain、注册可见性、事件准入、Agent carrier、生命周期所有权 |
| [Tool Runtime 内核与外壳边界](./agent-spec-tool-runtime-boundary.md) | 保留 ActSpace 工具实现，重写权限、审批、事件、进度和 Host 外壳 |
| [Tool Name 与 Plugin Namespace 契约](./agent-spec-tool-name-contract.md) | 模型可见扁平 `name`、独立 `pluginId`/`registrationId`、Provider wire、Session 和 projection 一致性 |
| [Runtime Projection](./agent-spec-runtime-projection.md) | Session / live / diagnostics 投影、generic Tool DTO、renderer allowlist、fallback 和 redaction |
| [Session 持久化与投影架构](./agent-target-session-persistence-projection-architecture.md) | Journal 唯一事实源、Projection Registry、统一 revision、Session Store、Context/Composer/Trajectory 消费边界 |
| [Prompt 与 Context Contributor](./agent-spec-prompt-context-contributors.md) | 动态来源、确定性排序、request snapshot、Skills、Host facts 和 Compaction 边界 |
| [Agent 与 Subagent](./agent-spec-agent-and-subagent.md) | Agent Registry、Scope、静态 Preset、main / Agent / Explore、one-shot Subagent 与 lineage |
| [Agent 测试策略](./agent-testing.md) | package contract、Cordis lifecycle、领域行为、Runtime/Host 集成与外部门禁分层 |
| [Session Core 与 Persistence Provider 分离](./agent-spec-session-core-persistence-separation.md) | live Session Core、backend-neutral persistence contract、JSONL Provider、flush/recovery 所有权 |
| [Service Definition / Provider / Consumer](./agent-spec-service-definition-provider-consumer.md) | 核心能力的 Definition、Provider、Consumer、manifest consistency 和 lifecycle ABI |
| [Profile / Bundle / Patch 分层](./agent-spec-profile-bundle-patch-layering.md) | 唯一 `ResolvedComposition/BootManifest`、Patch、Host ceiling、restart-only |
| [Agent Contract Matrix](./agent-spec-contract-matrix-generation.md) | 声明驱动、确定性生成、事件/Service/Composition/export 漂移门禁 |

公共契约把精确 TypeScript 名称、package 数量、平台锁 / `fsync` 算法、lease timeout、cache 和 attachment API 交给 execution plan，但不得改变上述行为语义。新的 DSH 事件、Agent Loop、Tool Shell 和 Tool Name 规范取代旧 Session 事件词汇、工具身份和 Agent Loop 顺序，并细化 Tool Runtime 的内核/外壳所有权；旧字段名只保留为研究背景，不作为本轮实施真源。P0 的事件、Loop、Tool、Scope 和 Cordis ABI 以已完成执行摘要为准；P1/P2 的实施边界、文件所有权和交接顺序以 [P1/P2 总计划](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md)及其子计划为准。插件组装、Cordis Loader 启动和 Agent 创建/恢复仍由[独立插件组装与 Agent 启动计划](../../exec-plans/active/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md)记录。

## 仍需验证

- Cordis 发布族的精确依赖、public exports/types、Loader/Include/Group/Timer、Effect cleanup、单实例、quiescent shutdown、离线 frozen install、managed ESM 和 portable Desktop 已通过；仍需在具备宿主能力的环境完成 DMG、签名/公证和真实 Electron reload/quit/flush。
- pi-ai 的 adapter、route/proxy 契约、结构化错误、usage、abort、secret redaction 和 activation lifecycle 已通过自动测试；仍需配置真实 Provider 后执行 managed CLI request/resume。
- Browser Bridge 静态协议、Extension contract 和 Go tests 已通过；ActSpace Native Messaging manifest 正常但 local RPC socket 仍 offline。ChatGPT/Codex Chrome Extension 已启用且其 Native Host 正确，但控制通道尚未建立；需恢复 Chrome 控制后 reload 当前 `browser-bridge/apps/chrome-extension` 并执行一条只读 Browser action。

这些是发布证据边界，不是待重新选择的架构方向。门禁失败时按 ADR 回退，不使用私有 API 或修改依赖源码绕过。

## 阅读顺序

### 进入目标设计

1. [v2 总体架构](./agent-target-overall-architecture.md)
2. [v2 已确认决策](./agent-decisions-v2-foundation.md)
3. [DSH-native 启动规范](./agent-decision-dsh-native-plugin-runtime.md)（待评审提案）
4. [Cordis 采用决策](./agent-decision-cordis-adoption.md)
5. [Agent Core 目标边界](./agent-target-agent-core.md)
6. [Session 与 Context 目标设计](./agent-target-session-and-context.md)
7. [LLM Adapter 目标设计](./agent-target-llm-adapter.md)
8. [Runtime 与 Composition 目标设计](./agent-target-runtime-architecture.md)
9. [插件 Runtime ABI](./agent-spec-plugin-runtime-abi.md)
10. [DSH 风格 Session 事件模型](./agent-spec-dsh-event-model.md)
11. [Agent Loop Cordis 插入面与通知面](./agent-spec-agent-loop-cordis-surface.md)
12. [Tool Runtime 内核与外壳边界](./agent-spec-tool-runtime-boundary.md)
13. [Agent Scope 模型](./agent-spec-agent-scope-model.md)
14. [Tool Name 与 Plugin Namespace 契约](./agent-spec-tool-name-contract.md)
15. [DSH 风格插件组装与 Agent 启动规范](./agent-spec-dsh-plugin-assembly-and-agent-startup.md)
16. [DSH 风格 Runtime 插件组装规范](./agent-spec-dsh-runtime-as-plugin-composition.md)
17. [核心 Cordis Service 化与能力 seam 规范](./agent-spec-core-cordis-services.md)
18. [Session Core 与 Persistence Provider 分离规范](./agent-spec-session-core-persistence-separation.md)
19. [Session 持久化与投影架构](./agent-target-session-persistence-projection-architecture.md)
20. [Service Definition / Provider / Consumer 分层规范](./agent-spec-service-definition-provider-consumer.md)
21. [Profile / Bundle / Patch 分层规范](./agent-spec-profile-bundle-patch-layering.md)
22. [Agent Contract Matrix 自动生成规范](./agent-spec-contract-matrix-generation.md)
23. [Session 格式公共契约（物理格式背景）](./agent-spec-session-format-v1.md)
24. [Tool Runtime 公共契约（内核 ABI 背景）](./agent-spec-tool-runtime-abi.md)
25. [Runtime Projection 公共契约](./agent-spec-runtime-projection.md)
26. [Prompt 与 Context Contributor 公共契约](./agent-spec-prompt-context-contributors.md)
27. [Agent 与 Subagent 公共契约](./agent-spec-agent-and-subagent.md)
28. [包结构与真实插件包规范](./agent-spec-package-layout-and-plugin-packaging.md)
29. [Agent 测试策略](./agent-testing.md)

### 复核研究证据

1. [DSH 架构研究](./agent-research-dsh-architecture.md)
2. [ActSpace 当前后端研究](./agent-research-actspace-current-state.md)
3. [能力去留研究](./agent-research-capability-disposition.md)

不要从能力去留表倒推 DSH 的设计；也不要让旧研究稿中尚未确认的建议覆盖后续决策文档。

## 文档等级

| 等级 | 含义 | 使用方式 |
|---|---|---|
| 研究事实 | 能由固定源码快照、测试或仓库文档证明 | 用来复核机制，源码变化时重查 |
| 研究判断 | 基于事实给出的迁移建议 | 后续决策可以取代 |
| 已确认 | 用户已经确认的方向和所有权 | execution plan 必须遵守 |
| 有条件确认 | 方向已经选择，但兼容性/制品门禁必须通过 | 门禁失败时重开评审，不做私有绕过 |
| 待评审 | 只有问题、约束和触发条件 | 本轮产品范围已无此类项；未来新增时不得提前固化 |

## 与实施的边界

本目录不记录任务排期、提交拆分或执行进度。覆盖完整产品范围的 [总 execution plan](../../exec-plans/active/20260822-actspace-v2-plugin-runtime/README.md)、负责包结构切换的 [包拆分与真实插件包化计划](../../exec-plans/active/20260824-actspace-v2-package-layout-and-plugin-packaging/README.md)，以及当前阶段的 [P1/P2 总计划](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md) 已经生成；执行状态、文件所有权、验证证据和回滚记录以对应计划及 `docs/exec-runs/` 为准。

任何实施 plan 都必须：

- 引用本目录的明确决策版本；
- 把数据删除、依赖安装和包迁移写成可回退的独立动作；
- 允许内部任务独立验证和合并，但只在完整范围验收通过后做一次产品切换；
- 给出 Node、Electron、Session golden contract、工具行为和 Host Adapter 的验证门禁；
- 不把“内部任务完成”解释成“可以交付缺少范围内能力的半成品 v2”。
