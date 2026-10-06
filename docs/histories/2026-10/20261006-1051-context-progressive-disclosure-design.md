## [2026-10-06 10:51] | Task: 整理上下文渐进式披露设计

### Execution Context

- Agent ID：主智能体 /root
- Base Model：未提供具体模型标识
- Runtime：Codex desktop

### User Query

用户确认渐进式披露流程，要求画流程图并整理设计；后续确认 Context/LLM 输入数据结构与插件拆分，要求分别整理为独立文档。

### Changes Overview

- 新建设计文档，记录内容与状态分工、两种路径入口、三层披露、按压缩周期读取计数、睡眠与唤醒规则，并包含流程图与实例。
- 后续讨论确认：成功读取只计数，活跃与睡眠统一在下次成功压缩后调整；同步流程图、示例与验证要求。
- 同步设计总索引。专题目录按用户明确要求创建，例外于默认避免单文档专题目录的建议。
- 明确流程已确认但尚未实现，列出后续实现计划需要确定的工程细节。
- 新增用户指定名称的数据结构规范和插件拆分规范，包含类型、关系图、转换流程、Cordis 生命周期、Session 兼容边界和验收要求；同步早期原则文档，避免保留废弃公共模型。
- 最终讨论收口：活跃仅允许文件，上限 100，按周期读取次数排序；原始历史直接引用 Journal，不生成摘录；补齐 AGENTS 刷新、模型 Prompt 扩展及临时插槽边界。
- 按用户要求拉取官方 OpenCode，核对当前与上游压缩指令，新增固定提交来源、MIT 许可及适配规范；按用户最终决定完整保留 `Relevant Files` 章节，允许摘要与独立维护的路径列表重复。
- 仅修改文档，无运行时代码变化；后续按用户要求完成设计复核并新增 P1–P4 执行计划及共享实施契约；尚未执行计划或改写当前实现规范。

### Design Intent

将已确认决策保存为可追溯的设计依据，保持第一版简单有效，避免将渐进式披露扩展为复杂资源管理系统。

### Files Modified

- `docs/design-docs/上下文管理引擎设计/agent-progressive-disclosure.md`
- `docs/design-docs/上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md`
- `docs/design-docs/上下文管理引擎设计/上下文管理引擎的插件拆分和上下文的插件拆分.md`
- `docs/design-docs/上下文管理引擎设计/agent-plugin-design-principles.md`
- `docs/design-docs/上下文管理引擎设计/agent-compaction-prompt.md`
- `docs/design-docs/index.md`
- `docs/exec-plans/completed/20261006-context-management-engine/`：总计划、共享契约与四阶段子计划。
- `docs/exec-plans/README.md`
- 本 history。

### Verification

- `pnpm check:docs` 通过；`git diff --check` 通过。
- 本次仅设计整理，不涉及代码变更后的学习文档要求。

### Implementation Follow-up（2026-10-06）

用户随后授权“开始执行计划”。P1–P4 已实现：统一 Context/LlmInput 转换、六来源与作用域扩展、纯插件 Codec/动态补充、OpenCode 模板、唯一压缩协调器、周期路径计数和睡眠 artifact、JSONL Host 历史路径、fork 与读取缓存兼容。现有 Session 事实与 Surface 未迁移；旧 JSONL 字节不变测试通过。

全仓类型检查、构建和契约/包边界检查通过。全量测试首次在所有桌面断言通过后遇到无关 HoverCard teardown 异步错误；定向与桌面全量复跑通过，未隐去首次失败。CLI 真进程 12/12 通过。真实 Electron 隔离实例因没有 provider，只验证可达入口与空态，U1–U8 全链路保留未覆盖。

实现入口和完整验证边界见[执行摘要](../../exec-runs/20261006-context-management-engine/execution-summary.md)。计划已移入 completed；没有提交或推送。派生状态幂等恢复符合可迁移、有深度、有陷阱三项学习条件，已整理[学习速记](../../learnings/2026-10/20261006-recoverable-derived-state.md)。

### Real Desktop Acceptance Follow-up（2026-10-06）

用户授权复用模型配置到隔离实例、临时日志及真实桌面验收，只记录Bug。gpt-6.1-sol执行Computer Use，主Agent核对Context、LlmInput、prepared和Journal：35请求/53快照一致；4次手动、1次自动压缩及附件、模式、停止、重启、fork有真实证据。确认7项问题和2项候选，Provider自动重试、压缩失败/取消及英语开启后行为仍未覆盖，未修复。

[逐项验收和复现](../../exec-runs/20261006-context-management-engine/real-desktop-acceptance-20261006.md)、[实际值证据](../../exec-runs/20261006-context-management-engine/real-desktop-data-evidence-20261006.md)供后续统一修复。阈值恢复80%，实例关闭；6个临时插桩文件按原字节恢复，helper源码与生成文件删除，runtime闭包和Harness重建、docs检查通过。没有提交或推送。本轮只观测与撤除诊断，没有额外业务代码变更，不新增学习文档。

## 2026-10-06 真实验收缺陷修复

用户批准修复 B2/B3/B4/B5/B6/B8/B9，并继续真实桌面和数据复验。

- Task 聚合快照与 Journal 单条大小限制分离；单条 envelope 验证回滚不再误封锁 Ledger，真实持久失败仍阻断。
- 披露识别 read_file 行号路径；统一排除睡眠索引，记录索引路径身份及空观察事实；成功压缩恢复水位使用对应事务完成点，避免旧周期读取重新计数。
- SessionStorage 增加可选 journalPath，JSONL 包装透传，Context Host 保持存储中立。
- 英语扩展目标使用 Session 生命周期，明确 main 来源可见性，连续主 Run 保留开关状态。
- 压缩预算来自实际 prepared 模型容量，缓存桶只计一次，比例与输出预留空间分别作为上限。
- 增加红→绿回归、原故障数据副本恢复，以及旧格式索引恢复测试；更新设计规范、契约矩阵和执行记录。

真实复验和最终状态见 `docs/exec-runs/20261006-context-acceptance-bugfix/`；本段不替代逐项验收结果。学习记录新增“单条记录限制与累计投影”的区别，命中可迁移与易踩坑两项。

复验另发现B10：进程中断后快速重启，临时写锁失败被AgentService缓存，保护期结束仍无法重试。仅清除尚未取得Session的typed写锁失败缓存；已取得Session或持久化/恢复失败仍阻断。新增并发重试、drain和持久化阻断覆盖，保留原始B1候选不强行归因。

同类核查进一步确认HarnessControl也会永久保留启动时未取得SelectionStore写锁的错误。补现有独占gate内的初始锁重试，仅恢复持久选择；保持真实日志、artifact、Host契约和持久失败阻断。真实双Host锁争用回归通过，HarnessControl23项通过，纳入B10。

最终定向复验：227项测试通过；19次真实请求三阶段转换一致。长会话累计1141480字节、重启后原排队任务只接受一次并完成；子会话计数不重复、父状态不变。阈值恢复80%，源码与最终构建撤除probe。计划移入completed，详细覆盖与剩余候选见[修复摘要](../../exec-runs/20261006-context-acceptance-bugfix/execution-summary.md)。
