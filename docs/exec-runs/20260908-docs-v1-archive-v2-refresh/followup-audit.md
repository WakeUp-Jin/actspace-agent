# exec-plans 与 design-docs 后续复核

日期：2026-09-09。范围：复核剩余计划、识别重复规范与正文漂移；仅改文档和现有生成器的文档产物，不改产品代码或其他任务的 fixture。

## 本次已清理

- P2 Contract Matrix 虽有历史 G2 通过记录和已勾选清单，但源码复核显示语义 validator 与负向 fixtures 不完整。刷新过期产物后保留 active，并恢复原计划未完成的语义任务。
- 初始 10 个 active 入口逐项复核。中文界面任务自行归档后，补跑全仓 typecheck/test 均通过，Context 的 G1 解除阻塞并移入 completed；最终剩余 8 个 active 入口。P1/P2 的 G1/G2 缺口仍保留。
- 更新 Context 和基础组件计划的真实剩余工作。Context 的旧阻塞已变化，基础组件并非完全未开始。
- Context 的 Request Model Facts、容量优先级和 bucket 数据契约集中到原有 Token Usage / Context Projection 主规范；面板文档保留布局、数字格式和临时模型选择。
- Service 三层规范成为当前契约入口；P0 核心 Service 文档保留原位置和历史推导。同步真实 `session.store` ID、已有 metadata 校验与仍需核对的具体类导出。
- 修正 DSH 事件模型的 seq 起点：从 0 开始，与现有 Session Format v1 和实现一致。未改变事件格式、源码或历史数据。

## 计划逐项结论

| 计划 | 处理 | 依据与实际下一步 |
|---|---|---|
| [P2 Contract Matrix](../../exec-plans/active/20260829-actspace-p2-contract-matrix/README.md) | 保留 active | 2 个现有测试与刷新后的字节 `--check` 通过；inject/provide、sourceRef、composition digest 负向探针均未被 validator 拒绝，原计划语义任务未完整实现。 |
| [Cordis 最终验收](../../exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md) | 保留 active | P05 的 deterministic retry/error CLI/process fixture 仍未闭环；seq 文档冲突已校准，不改写旧摘要的 BLOCKED 结果。 |
| [P1/P2 总计划](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md) | 保留 active | G1 fresh/resume、tool/no-tool、retry/error/abort、flush/dispose 和跨包证据仍缺完整签收；G2 区分已实现的字节漂移检查与尚缺的语义门禁。 |
| [P1-A Session Core / Persistence](../../exec-plans/active/20260829-actspace-p1-session-core-persistence/README.md) | 保留 active | SessionHandle 已依赖 backend-neutral driver；CLI persist/resume 与生产接线仍需独立 G1 交接。 |
| [P1-B Service Roles](../../exec-plans/active/20260829-actspace-p1-service-roles/README.md) | 保留 active | 三层 metadata 已实现，不能据此证明所有 Consumer 已脱离 Provider 私有实现；逐项核对真实 Service ID、exports、inject/provide 与生产消费链。 |
| [P1-C Profile / Bundle / Patch](../../exec-plans/active/20260829-actspace-p1-profile-bundle-patch/README.md) | 保留 active | schema/digest/transport 已实现；restart-only、失败清理和 one-shot 回归仍需 G1。 |
| [Session 持久化与投影](../../exec-plans/active/20260830-actspace-session-persistence-projection/README.md) | 保留 active | 基础通道和首批消费者已实现；Conversation 最终 durable Surface 映射、剩余消费者与集成验收尚未完成。 |
| [Context 模型事实](../../exec-plans/completed/20260901-actspace-context-model-facts/README.md) | 已归档 completed | P00/P01 完成；中文界面任务收口后，本次重跑全仓 typecheck/test 通过（Desktop 97 文件、651 用例）。仅余 G2 人工项。 |
| [前端基础组件](../../exec-plans/active/frontend-ui-components-foundation.md) | 保留 active | 已有 Tooltip/HoverCard/Sheet；Button、IconButton、DropdownMenu、Switch、Textarea、Tabs 与业务迁移尚未完成。 |
| 日常主界面中文统一（独立任务） | 保持独立任务状态 | 状态以该独立计划为准，本轮不修改其代码和验收结果；归档后同步链接。 |

P1-A/B/C/P2 的共同证据位于 [P1/P2 联合执行摘要](../20260829-actspace-p1-session-core-persistence/execution-summary.md)。目录沿用最早执行的 P1-A slug；不为整理而搬移执行记录，也不复制四份相同摘要。

本次由文档整理执行的移动：`docs/exec-plans/active/20260901-actspace-context-model-facts/` → `docs/exec-plans/completed/20260901-actspace-context-model-facts/`，共 README、P00、P01 三个文件。所有引用及 README 指向仍 active 的 Session Projection 计划的相对链接已修复。中文界面计划的归档由该独立任务完成，本轮只同步引用和最终目录计数。

P2 继续核对原验收条款后确认语义检查缺口，最终保留原 active 路径。回退此次移动时逆向移动 Context 三个计划文件、恢复本次引用与状态即可，不覆盖其他任务内容。

## design-docs 合并与精简清单

初始复核时有 90 份 Markdown；中文界面任务新增一份设计后，最终为 91 份。此次重点减少重复的规范来源，不以删除文件数量作为完成标准。下表区分本次已调整的阅读归属与尚未执行的内容合并。

| 文档组 | 归属与处理 | 本次状态 |
|---|---|---|
| [核心 Cordis Service](../../design-docs/agent-plugin-runtime/agent-spec-core-cordis-services.md) + [Service 三层](../../design-docs/agent-plugin-runtime/agent-spec-service-definition-provider-consumer.md) | 当前术语、ownership、生命周期与 ABI 以三层规范为入口；P0 文档保留各领域职责、取舍和历史 append 示意。后续如再缩短 P0，先迁入独有的领域边界，不直接拼成一份五百多行的重复文档。 | 已明确主从、修正文档事实；未删除 P0 原文。 |
| [Token Usage / Context Projection](../../design-docs/model-context/agent-token-usage-and-context-state.md) + [Context 面板与 Composer](../../design-docs/model-context/agent-context-model-facts-and-composer.md) | 前者维护事件、request model facts、bucket 与容量来源；后者维护交互与模型选择。清除旧 `request/snapshot` / `llm/usage` 作为默认 Loop 事件的说法。 | 已集中重复数据契约并原位校准；两条原入口保留。 |
| [工具预览规范](../../design-docs/tool-system/agent-tool-preview-design-guidelines.md) + [工具流式修复设计](../../design-docs/frontend/front-agent-tool-stream-rendering.md) | 建议把当前参数占位、prepared/started/finished、同 callId 合并、终态优先、回放一致性集中到工具预览；修复设计继续保存诊断与实施背景。 | 待下一批。需同时核对旧 extractor 路径、edit 参数渐进预览、Delete 默认审批、Subagent 面板位置等正文与新实现的冲突，不能只复制新段落。 |
| [设置中心总规范](../../design-docs/frontend/front-设置中心重构规范.md) + [模型设置](../../design-docs/frontend/front-模型设置页面-Maka重做规范.md) + [Usage 更新](../../design-docs/frontend/front-usage-statistics-refresh.md) | 总规范保留导航、设置壳层、数据所有权、保存与安全。6.3 的模型路由细节归模型子规范；6.7 的统计页面细节归 Usage 子规范。7.3 查询模型和 8.9 存储边界需分别与 Usage 数据规范对齐；12 节实施阶段改为已完成计划入口。 | 待下一批。总规范约 1,200 行，不建议把两份子规范再并回总规范；迁移时保留子规范目前没有的内容。 |
| [Session / Context 目标背景](../../design-docs/agent-plugin-runtime/agent-target-session-and-context.md) + [Session Format v1](../../design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md) + [DSH 事件模型](../../design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md) | 格式规范维护 envelope、seq、recovery；事件模型维护当前事件词汇与顺序；目标背景保留分层推导。目标文档中的旧 request/llm 事件不能继续作为当前范例。 | 已修复 seq 冲突；其余跨文档示例仍待逐项校准，不合成一份大规范。 |
| [DSH-native 早期决策](../../design-docs/agent-plugin-runtime/agent-decision-dsh-native-plugin-runtime.md) + [全量插件组装背景](../../design-docs/agent-plugin-runtime/agent-spec-dsh-runtime-as-plugin-composition.md) + [Profile-first 决策](../../design-docs/agent-plugin-runtime/agent-decision-profile-first-headless-desktop.md) | 保留各自决策时点、被否决方案与替代关系；统一从 Runtime 导航的历史区进入。 | 保留原位；这些是不同阶段的决策证据，不建议再次合并或建立 archive/v2。 |

其他组保持分工：总体架构 / Runtime 生命周期、Plugin ABI / package layout / generated matrix、Review 功能 / 大 diff 性能、Workspace 执行根 / Environment Git 操作、主题 / 视觉语言 / Tailwind / 基础组件，不因名称接近就合并。它们分别回答不同问题。Member/Room/Team 已精简为未来产品稿；早期视觉原型和已退役分析观测入口按上一批决定原位保留。

## 检查与边界

- `pnpm test:contract-matrix`：2/2 通过。
- `pnpm run gen:contract-matrix --check`：首次失败；只读比较确认差异来自 7 个 package 的 exports/dependencies 和 sourceDigest。使用原生成器刷新双产物后通过，未改生成器或 allowlist。
- `pnpm -r --if-present typecheck`：首次失败于独立中文界面任务的 `apps/desktop/src/renderer/test/fixtures/chinese-ui-preview.tsx:25`，`ComposerReviewSummary` 不接受 `state` 字段。旧 ProviderSettings 错误不再出现；该任务自行修复并归档后，本次重跑全仓 typecheck/test 均通过。未修改其他任务 fixture，Context 因 G1 补齐而归档。
- P2 只读内存探针：plugin inject/provide 不一致、不存在的相对 sourceRef、无效 composition digest 均得到空 error 列表。结合 `validateRows()` / `parseComposition()` 源码，确认原计划要求尚未完整实现；未修改产品代码或添加测试。
- 文档检查和引用验证结果记录在本任务执行摘要的 2026-09-09 补充中。

本次不运行真实 Provider、Electron 或发行制品验收。completed 的含义仍是计划实现完成；不能据此宣称所有宿主场景或后续新增插件都完成验收。剩余较大合并工作按上表保留明确去向，不删除知识文档。
