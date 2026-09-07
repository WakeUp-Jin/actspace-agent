## [2026-08-22 09:17] | Task: 梳理 v2 插件化 Runtime 研究与确认决策

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 在开始目标设计和重构计划前，完整研究 DeepSeek Harness，再审计 ActSpace 当前后端；保留具体工具实现作为主要迁移资产，前端首轮不插件化，Kairos 不进入 v2 基础包。

### 🛠 Changes Overview

**Scope:** `docs`

**Key Actions:**

- **研究入口**：新增 `agent-plugin-runtime` 专题，登记研究范围、阅读顺序、结论等级和后续 ADR。
- **DSH 审计**：按固定源码快照梳理 Cordis、配置组合、Agent 事实模型、持久化和 Host / Client 扩展体系，并校正此前分析中的关键误读。
- **ActSpace 审计**：记录当前 Runtime、Context、Tools、LLM、Session、Skills、Desktop、外部进程插件和 Kairos 的事实边界与耦合热点。
- **能力处置**：形成 Keep / Adapt / Rewrite / Delete / Defer 矩阵，明确“保留工具实现”不等于保留旧 ToolManager、事件或 UI preview 契约。
- **确认决策**：新增 v2 决策总账，确认自研 ActSpace Agent Core、完全替换 Session、统一 RuntimeHandle / Host Adapter / Profile-Bundle-Patch 方向，并有条件确认采用 DSH Cordis 发布族和通过 ActSpace Adapter 采用 pi-ai。
- **总体架构**：新增面向新读者的 v2 总设计入口，用分层图、启动流、单次 Turn / Step 流和 Session 真相模型解释完整目标，并明确每个 Host 进程只 boot 一个 RuntimeHandle 实例。
- **目标规范**：分别记录 Agent Core、Session 与 Context、LLM Adapter、Runtime 与 Composition 的目标边界；随后用六份公共契约收口插件 ABI、raw JSONL、Tool、Projection、Prompt / Context 和 Agent / Subagent 语义。
- **设计收口**：关闭原 `OPEN-01` 至 `OPEN-10`。v2 限定受信任同进程插件、managed ESM 主分发、restart-only、固定前端、`frontend.required` fail-closed、raw JSONL Session、CLI run 默认 ephemeral，以及 Desktop / CLI chat 默认 persistent。
- **完整切换**：确认 v2 只做一次产品切换。实施可以拆成可验证任务，但 main Agent durable Inbox、Agent / Explore、one-shot Subagent、静态 Preset、Todo、Skills、Compaction、保留工具、Browser Bridge、Desktop 和 CLI 全部完成前，不把中间状态作为半成品 v2 交付。
- **产品非目标**：确认不实现插件市场、签名、自动更新、不可信代码隔离、strict SEA 主分发、在线 reconcile、generic Workflow、continuable / background Subagent、Preset StandingMount、live reload、Session zstd 或 SQLite。
- **插件 ABI**：新增 Static Manifest / Codec Module / Behavior Entry 分离、全量可信已安装 Codec 预发现、稳定 identity、Patch miss、Host ceiling、Effect-owned lifecycle、Startup Validation、RuntimeHandle 和 shutdown 公共契约；明确同进程 ceiling 不是安全沙箱。
- **Session 格式**：固定 `<session-root>/<session-id>/journal.jsonl`，Header 首行、每事件一行；定义 Event Envelope、Surface、required / ignorable codec、browse-only access state、writer lease、checkpoint、repair、fork、compaction 和 golden acceptance cases。
- **Tool 与投影**：固定 definition / executor、prepared execution lease、validation / policy / approval / checkpoint / body / ordered commit，以及 Durable Session Projection、Live Progress、Runtime Diagnostics、generic Tool DTO、renderer allowlist 和 fallback。
- **Prompt 与 Agent**：固定 Contributor 来源与确定性排序、logical request snapshot、Skills / Host facts / Compaction 边界；固定 main Agent durable Inbox、Agent / Explore 共用 one-shot Subagent seam、child Session lineage、工具收窄、级联取消、Todo durable events 和有序发布补偿回滚。
- **条件采用边界**：Cordis 与 pi-ai 仍需 compatibility proof，但这是采用证据门禁，不是尚未选择的产品方向；失败时重开 ADR，不以私有 API、修改依赖源码或全局代理污染绕过。
- **删除范围**：确认 Kairos 和 fs-watch 不迁移到 v2；Browser Bridge 和具体工具行为继续作为迁移资产。
- **研究纠偏**：修正 DSH Loader 被误述为 candidate-activation-first 的问题；实际只是先导入候选模块，随后卸载旧实例并启动候选，失败后尝试重启旧插件。
- **抽象收缩**：确认 DSH 没有全局 Composition Generation；删除 Runtime 顶层代际管理，保留只读 `ResolvedComposition` / `BootManifest`，并把一致性责任分别交给 Loader、Preset、Session、LLM、Tools 与 Prompt。
- **启动语义**：将目标架构中的 activation audit 统一表述为 Boot-owned Startup Validation，并区分 Loader settlement、Fiber 激活检查和 ActSpace Base Profile 能力检查。
- **调用一致性**：明确 one-shot LLM call 捕获 exact Adapter registration，并为 ActSpace Tool Runtime 增加 prepared execution / lease 目标，避免审批前后混用不同工具注册。
- **评审闭环**：补齐 request candidate -> PreparedCall -> durable snapshot -> checkpoint -> dispatch 顺序、Adapter activation lease，以及在线 reconcile 后的健康验证、previous-tree 恢复和 restart-only 兜底。
- **刷新与租约**：补齐 reconcile 前 admission gate，禁止新工作观察半配置树；所有 PreparedCall 未 dispatch 失败路径显式释放 lease，Session header 只记录创建时 provenance。
- **完整执行计划**：新增一个总控入口和 P00-P15 共 16 个内部工作包，覆盖 ESM 契约岛、Cordis / pi-ai 准入、Trusted Boot、Session、LLM、Tools、Projection、Prompt、Agent、Desktop、CLI 与最终切换；内部拆分不构成分阶段产品交付。
- **施工隔离**：固定 `@actspace/agent-runtime` ESM package、`@actspace/shared/runtime-v2` Host DTO 和独立 `sessions-v2/` 数据根；P00-P14 保留 v1 默认入口，P15 是唯一产品切换点。
- **执行门禁**：为每个工作包写清允许/禁止路径、输入输出契约、故障注入、验证命令、exec-run 和回退边界；Cordis / pi-ai compatibility proof 是 P01 / P02 的硬门禁。
- **退役与回滚**：最终切换删除旧 Agent Core、Kairos、fs-watch、SEA 与候选开关，但不自动删除旧 Session 或插件用户数据；真实工具副作用发生后只承诺代码回退，不承诺外部状态事务回滚。
- **导航同步**：更新仓库架构入口、Agent 文档入口和设计文档索引；研究稿不替代现有已落地设计。

### 🧠 Design Intent (Why)

v2 允许重写整个后端，直接从实现计划开始会把参考系统的产品选择、框架机制和 ActSpace 现有资产混在一起。本轮先固定可复核的研究基线，把源码事实、项目判断和待决策问题分开，后续 ADR 与目标规范才能逐项收敛。

### 📁 Files Modified

- `docs/ARCHITECTURE.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/agent-plugin-runtime/README.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-overall-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-agent-core.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-session-and-context.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-llm-adapter.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-prompt-context-contributors.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md`
- `docs/design-docs/agent-plugin-runtime/agent-research-dsh-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-research-actspace-current-state.md`
- `docs/design-docs/agent-plugin-runtime/agent-research-capability-disposition.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/README.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p00-contracts-and-esm-island.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p01-cordis-admission.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p02-pi-ai-admission.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p03-trusted-boot-and-composition.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-04-session-journal-and-persistence.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-05-llm-service-and-adapters.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-06-tool-runtime.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-07-runtime-projection.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-08-prompt-skills-and-compaction.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-09-built-in-tools-and-browser.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-10-main-agent-loop-inbox-and-todo.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-11-one-shot-subagent.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-12-base-profile-and-runtime-handle.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-13-desktop-host-and-fixed-renderer.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-14-cli-hosts-and-managed-esm.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-15-cutover-and-legacy-retirement.md`

### ✅ Validation

- DSH 架构研究稿的 152 处源码引用、51 个源码文件均存在且行号有效。
- 本轮涉及的 20 份 Markdown 文档共 219 个相对链接有效。
- 六份公共契约中的 5 个 JSON 示例全部可解析。
- v2 总体架构的 4 张 Mermaid 图完成启动时序、运行事实流和决策状态的交叉审查。
- `pnpm check:docs`
- `pnpm check:repo`
- `pnpm check:secrets`
- `git diff --check`
