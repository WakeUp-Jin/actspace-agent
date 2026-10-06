# 上下文引擎真实验收问题修复

状态：已完成。原7项确认问题与复验新增B10已修复；227项定向测试、真实Electron及19次请求数据复验通过。未覆盖边界和候选见[执行摘要](../../exec-runs/20261006-context-acceptance-bugfix/execution-summary.md)。

## 目标和边界

修复[真实桌面验收](../../exec-runs/20261006-context-management-engine/real-desktop-acceptance-20261006.md)确认的 B2、B3、B4、B5、B6、B8、B9，调查 B1、B7 候选。用户已要求开始修复；按仓库改代码前确认具体方案的要求，本页作为一次性范围确认。执行后按阶段推进，不逐个问题重复确认。

保留现有 Session header、core event、Surface 和 Context → LlmInput 主链；补充插件内部能力与可选字段，不迁移或改写历史 Journal。保留当前未提交实现、验收现场和原始模型配置。预计修改超过 5 个文件，包含下面明确列出的内部共享接口调整；不新增产品功能或设置页面，不提交、推送、发布。

## 修复顺序和依据

| 顺序 | 问题和当前证据 | 修复方向 | 完成标准 |
| --- | --- | --- | --- |
| 1 | B8：`projectTasks()` 对累计 TaskSnapshot 调用 `snapshotSessionJson()`，误触单记录 1 MiB 限制；单个合法事件已 append，投影失败使 Ledger 阻塞 | 分离聚合投影不可变快照与单记录大小验证。保留事件 JSON、安全和大小校验；核查其他调用点，避免修复扩大单事件入口。检查事件写入前拒绝与提交后恢复语义 | 多个各自合法的事件累计超过 1 MiB 后可继续提交、重开和执行；单条超限仍拒绝；重试不重复提交。用原故障 Journal 的副本验证恢复 |
| 2 | B2：路径抽取正则不接受 `read_file` 的 `行号\|路径` 前缀，106 条明确引用仅保留直接读取的 3 条 | 识别真实工具输出格式，继续通过 normalizeFile 校验、去重和排除目录 | 真实分页工具输出保留文件引用；绝对/相对路径与普通文本回归；不存在路径和目录不进入 active |
| 2 | B3：Host 只识别具体 `JsonlSessionStorage`，真实 Cordis 服务为 `JsonlSessionStorageService` | 在存储/Host 边界提供原 Journal 路径的可选能力，由包装服务透传；披露插件不依赖具体存储类 | 真实 Cordis 装载后有原 Journal 路径及历史范围；内存会话保持无路径；不生成摘录文件 |
| 2 | B4：observe 排除索引，prepare 却重新收集同一索引为普通文件 | 统一工具观察、摘要和历史抽取的候选过滤，按索引身份及规范路径排除导航索引；已有错误派生状态只做可重放纠正 | 连续压缩、读取索引、再次压缩后，索引只作为入口；active 上限 100、只含文件，睡眠目录不自我嵌套 |
| 2 | B5：fork 重映射 typed artifact，旧工具正文路径未映射；恢复重扫把先前被忽略的索引读取计入新周期 | 固定已处理事件的持久恢复边界，覆盖零引用观察结果；结合压缩提交边界与索引身份，确保历史事件不跨周期重新计数。兼容旧状态事件，避免跳过尚未处理的新工具结果 | 重启/fork 首次组装不增加旧周期计数；子会话新读取只计一次；父会话不变；睡眠文件本周期只计数、下次压缩才恢复 active |
| 3 | B6：闲置目标会话英语开关真实失败；源码依赖 registry 中短生命周期 Agent，但验收未记录内部异常 | 先记录目标 Session、Agent 存活和注册/释放顺序确认原因。确认后将目标选择维持在 Session 生命周期，由每个主 Run 按 Session 读取来源，关闭功能或释放 Session 时撤销。Prompt 扩展仍隔离 Session 和 Agent 作用域 | 闲置会话可开启；跨连续 Run 持续注入；关闭/切换立即撤销；另一会话、子 Agent 无泄漏；仅对实际注入且完成的回复处理语音 |
| 4 | B9：压缩策略固定 128K 并减 16K，Kimi 256K 在设置 50% 时约 24% 已触发 | 从实际 prepared request 传入容量和规范化使用量，替代固定容量。核查公共 usage 的缓存语义，避免漏算或双算。比例阈值按容量计算，预留输出空间作为独立上限，即 `min(floor(capacity × ratio), capacity − reserve)`；缺容量不猜值、不自动触发，手动压缩可用 | 256K/其他容量、切模型、缓存命中均按实际事实判断；低于阈值不触发、达到阈值触发；失败/取消不推进披露周期 |

B6 已由真实 Cordis root、打开的 Session 与空 Agent registry 复现确认；改为 Session 绑定后，闲置开启及连续两次主 Run 的真实请求均正确注入。

## 明确允许调整的接口与文件范围

- `packages/agent-service/src/task-projection.ts`、Ledger 相关验证与测试；必要时在 `packages/session/journal` 区分 JSON 快照与单记录校验能力。持久结构不变。
- `packages/context/src/disclosure/*`、`state.ts`、Codec 与测试：候选过滤和恢复水位。新增状态字段必须可选并兼容已有事件；不改既有 core 事件含义。
- `packages/runtime/src/harness/context-host.ts` 与 Session storage/JSONL 包装边界：可选原 Journal 路径能力及真实服务集成测试。
- `packages/english-learning`、`packages/prompt/src/extensions.ts`、Runtime 接线与相关测试：Session 目标和 Run 绑定生命周期。这是内部共享接口调整，不取消 Agent 作用域隔离。
- `packages/core/agent-loop`、`packages/context/src/compaction.ts`、`packages/compaction`：自动压缩预算携带实际模型容量及规范化用量，手动/自动继续复用一个协调入口。
- 同步相关设计、契约矩阵、执行记录与 history。修改构建产物遵循现有生成流程。

## 复验中追加的确认问题

B10：重启首次获取写锁失败后，AgentService永久缓存rejected Promise，锁过期后仍无法重试。按已批准的恢复排障范围，新增service.ts及生命周期回归；仅释放未获取Session的typed SESSION_WRITER_LOCKED缓存，保留其余持久化/恢复失败的阻断。不修改租约时长或删除锁。复验继续确认HarnessControl启动也永久保留未取得SelectionStore写锁的失败，因此补service.ts与真实双Host租约回归；仅在独占gate内重新取得首次写锁并恢复原选择，artifact/契约/持久化失败继续阻断。

## 两个候选问题

- B1：用旧隔离目录副本核查暂停事件、持久 Harness 身份与运行入口；新构建需确认实际装载的是新 Harness，不能用旧持久 Bundle 误验。若仍无法复现，明确保留未确认，不修改暂停策略。
- B7：核对停止、后续用户消息、任务选择和实际 LlmInput。既有证据显示最新用户消息正确且最终完成，尚不能把模型长推理归为转换缺陷。只有得到调度/输入错误证据才修相应代码，不删除历史来掩盖问题。

## 分组验证与交付

先为每个确定根因建立可失败的回归用例，再修复并运行对应包测试。随后构建 Runtime 依赖闭包，运行受影响包类型检查、契约/文档检查及 diff 检查。核查同类调用点，逐项记录同类缺陷或安全理由。

真实复验通过 `pnpm dev:log` 启动 Electron，使用新的隔离数据目录及现有模型配置；旧故障数据保留，恢复试验使用副本。主 Agent 负责修复和 Context/LlmInput/Journal 数据核对；按 AGENTS 由明确指定的 `gpt-6.1-sol` 子智能体负责 Computer Use。

| 操作组 | 验收点 | 证据 |
| --- | --- | --- |
| 长会话提交与恢复 | B8：累计超限、后续消息、重启；B1：暂停入口调查 | UI 提交状态、TaskSnapshot revision、事件 seq、真实 request、故障副本恢复结果 |
| 文件引用、连续压缩、重启和 fork | B2–B5：分页路径、100 上限、索引过滤、Journal 引用、周期计数与父子隔离 | Context.status、LlmInput 尾部、candidate/applied/fact、索引正文、父子 Journal |
| 英语开关与连续 Run | B6：闲置开启、两轮请求、关闭、切换、其他会话隔离 | 开关状态和错误、来源注册生命周期、system 实际值、完成事件和队列状态 |
| 模型容量与停止后续 | B9：设置比例前后、阈值前后、实际容量；B7：停止后短请求 | prepared 模型容量、usage、触发判定、compaction 事件、最后 user 和最终回复 |

结果按 B 编号逐项标记通过、失败或未覆盖；自动测试、真实操作与推断分开。继续核对 Context → LlmInput → prepared request，确保管理状态不进入正文、动态导航不改系统前缀、消息/工具调用/附件保持有效。

临时日志不输出凭据；验收后撤除，保留脱敏证据。执行记录放在 `docs/exec-runs/20261006-context-acceptance-bugfix/`。回退只撤销本轮补丁，保留 Codec 兼容及原 Journal，不以清空数据解决恢复问题。

## 进度

- [x] 对照验收证据复核源码与影响范围。
- [x] 具体方案确认。
- [x] B8 修复与回归。
- [x] B2–B5 修复与回归。
- [x] B6 运行时定位、修复与回归。
- [x] B9 修复与回归；B1/B7 调查结论。
- [x] 真实桌面与数据复验、文档和交付。
- [x] B10 Session与Harness首次临时写锁失败重试及回归。
