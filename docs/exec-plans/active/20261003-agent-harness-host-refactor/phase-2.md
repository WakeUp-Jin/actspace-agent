# P2 接入计划：共同应用操作与真实 Run 生命周期

状态：2026-10-03 P2 阶段验收通过，T1–T6 已签收。工程回归与 GPT-6.1 Sol 真实 Electron 验收范围见摘要；FileReference 无现有 UI 入口，后端契约已验证，不将其称为界面通过。可开始讨论 P3，尚未授权 P3 实施。

依据：[总计划](README.md)、[已确认决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)、[P1 执行摘要](../../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)。当前源码基线为 P1 commit `99d1847`。实现与验证证据见 [P2 摘要](../../../exec-runs/20261003-agent-harness-host-refactor/phase-2-summary.md)，暂停交接见 [待办记录](../../../exec-runs/20261003-agent-harness-host-refactor/phase-2-pause-handoff.md)。

## 1. P2 的完成结果

Desktop 和 Headless 使用同一套会话与任务操作。Session 保留历史，每个实际开始的 Run 从对应 Harness 获取租约、创建运行实例，并在收尾时释放。任务接纳、去重、排队、取消和恢复由 Host 内的模块管理，客户端不推进执行队列。

必须通过真实默认 Loop 的运行回归，并用不同 Loop 实现验证可替换契约。同一 Session 后续 Run 选择开始时的当前组合，子 Run 独立选择自身 Harness；不是只在 mock 上调用 acquire/release。

P3 仍负责面向用户/Agent 的 Patch 准备、审批、启用与回退；P4 负责 WSS/SSH、配对和连接恢复协议。P2 不引入网络服务和手机前端。不以增加一个通用 Facade 代替职责迁移。

## 2. 当前代码与目标迁移

| 当前源码 | 核对到的行为 | P2 建议 |
| --- | --- | --- |
| `packages/desktop-app/src/service.ts` | create/resume/fork 都 attach；自身持有 activeRuns、modeTransitions 等集合；runTurn 等完整执行结束 | 保留桌面应用适配，提取共同会话/任务操作；会话操作不创建 Loop；运行互斥只有一个所有者 |
| `packages/headless/src/runner.ts` | 直接写标题/模式 Journal、attach/followup、flush，并返回 SessionHandle | 收敛为共同服务的单次工作流；等待特定任务、导出结果；不持有 Loop/Session writer |
| `packages/runtime/src/runtime/run-controller.ts` | 按 sessionId 缓存 assembly；存在直调 Loop 和 AgentLoopService 两条路径 | 迁移为单一任务调度与 Run 持有逻辑；核对所有消费者后删除重复路径 |
| `packages/core/agent-loop/src/service.ts` | attach 创建长期 assembly；followup 先串联 Promise，获得执行机会才入 Inbox | 跨 Run 的队列/注册移出；Loop 插件只提供单次运行工厂与控制契约 |
| `packages/runtime/src/runtime/agent-factory-plugin.ts` | 直接 new AgentLoop，捕获根级 llm/tools/prompt/compaction，按 Session 发布 scope | 从租约选中的组合解析运行工厂和服务，创建 Run scope；不能只给旧全局 factory 套租约 |
| `packages/subagent/src/provider.ts` | 从父 scope 派生子 scope，调用固定 createLoop；墙钟定时器控制时长 | 任务归属/权限/取消仍关联父 Run；策略 scope 属于子 Harness 租约，不能继承父 Harness 策略 |
| `apps/desktop/src/renderer/session/message-queue.ts`、`App.tsx` | 队列只在 renderer 内存；结束后由 continueQueue 推进；含上移、编辑、steer、停止暂停、/compact | 调度状态迁到 Host，保留交互；renderer 保留未提交草稿和展示状态 |
| `packages/core/agent/src/inbox.ts` | enqueue/claim 写 Journal，但 enqueue 本身不 flush，也不核对重复 messageId 的内容 | Inbox 继续表示输入消费，不充当完整的持久任务管理器 |
| `packages/session/persistence/src/session.ts`、`coordinator.ts`、`packages/session/jsonl/src/jsonl-writer.ts` | append 与 durable barrier 分离；底层 append 有 fsync | 复用 Journal 和 flush，不另建任务数据库；回执与调度都必须在接纳记录 flush 成功之后 |

该迁移超过 8 个文件，且涉及 Desktop IPC/renderer 行为和持久数据。不能作为只修改 boot 的小接线任务验收。

## 3. 建议的模块关系

```text
Desktop 适配 / Headless 工作流
              |
       共同应用操作插件
         /           \
  会话操作模块       任务管理模块（Journal 投影 + 调度 + Run 句柄）
        |                  |                  |
 Session 存储/投影    P1 Harness 租约       取消/预算/关闭协调
                            |
                     组合内运行工厂
                            |
                    单次 Loop + Run scope
```

共同应用操作和任务管理分别维护职责，可在同一包分模块，不能把所有状态塞进单个 service.ts。建议新增 `packages/agent-service/` 作为共同应用插件；运行契约放在其独立 contracts 模块，由插件工厂以结构化契约实现。runtime 只负责 Host/Profile 组装，desktop-app/headless 消费公开入口，不形成 runtime 与领域包的反向依赖。

具体依赖图在下一轮文件级审阅中验证；是否为运行契约单独成包由真实依赖决定，不用包数限制模块化。

## 4. 任务与 Run 语义（概念、接纳、去重与基本队列操作已确认）

| 对象 | 建议语义 |
| --- | --- |
| Session | 长期会话事实与持久任务记录，不拥有长期 Loop |
| Task | 已接纳的工作请求，拥有稳定 taskId；可触发新 Run，也可被当前 Run 作为补充输入消费 |
| Run | 一次实际执行尝试，使用现有 agentRunId；启动时绑定 Harness 身份 |
| Turn/Step | 保留当前 Loop 的 turnId、stepId；默认实现目前一次 runTurn 生成一个 turnId，不因此要求所有替代 Loop 内部相同 |
| Steer | 同一队列中请求的消费方式：指定当前 agentRunId 在可接收点读取，不是另一套任务对象 |

已确认：一份待处理输入队列、两种消费方式。普通排队输入在轮到时触发新 Run；指定插入的输入由明确的当前 Run 在可接收点消费。指定插入、撤回指定、运行结束前未被读取，都保留原 taskId，不创建替代 Task，不终结旧 Task 再生成新 Task。撤回成功仅清除消费目标；Run 结束后未读输入清除目标并恢复普通排队资格，停止或失败时队列保持暂停。已消费输入不能撤回或再次启动；Host 持久记录消费归属，重复操作不造成二次领取。

每个请求最多被一个 Run 领取，一个 Run 可以消费初始请求及多条补充输入。领取不等于需求完成；运行中断也不自动将已领取输入重放。排队期间不创建 Loop、不绑定 Harness；新 Run 开始时选择当前组合，补充输入沿用当前 Run 的组合。Task/Run 区分不意味着增加两层服务。此决定取代“撤回 steer 再创建关联新 Task”的先前建议。


已确认接纳与去重规则：Host 持久保存任务及提交标识后才回复已接纳，持久化明确失败则不启动执行。客户端在首次发送前生成并保留 submissionId，网络重试沿用；同一会话同标识同消息内容返回原任务及其当前状态，内容不同则报冲突。用户主动再次发送相同文字属于新提交，生成新标识。去重记录随 Session Journal 保留，不设置短期 TTL；任务完成后重试仍返回原任务，删除会话才结束该作用域。去重比较消息内容（含随消息提交的附件/引用），不比较实时模型等运行配置；重试期间配置变化不能被误判为提交内容冲突。

已确认配置取值时机：队列只保存消息内容，不为每条消息冻结模型等运行配置。消息真正交给执行器时读取当前配置，普通排队与运行中插入遵循同一规则。请求身份、顺序、消费目标等是队列管理元数据，不是随消息保存的运行配置。删除“区分默认与显式配置、比较配置兼容性、不兼容就拒绝插入”的建议。实际采用的配置可在执行记录中留痕，不倒写成排队消息的提交条件。

这一规则不改变 Harness 实现的生命周期：当前 Run 仍持有原组合，模型等运行选项读取当前配置不等于替换正在执行的 Loop/插件实现。配置取值与正在进行的模型调用、预算及权限控制如何衔接，在运行契约中明确，不能把“读取当前配置”实现成中途重启调用、重置预算或自动放宽权限。

已确认模式边界：同一 Session 支持在 Run 之间切换 Chat/Plan/Agent；新 Run 开始时读取当前模式，本次 Run 内固定，运行中的补充输入沿用该模式。运行中不允许切换模式，不增加热切换实现。模型和推理设置在输入实际被消费时读取，用于之后的模型请求，不重启正在进行的请求。模式变更与启动由同一会话调度顺序协调，避免检查空闲后启动的竞态；模式变更仍须满足 workspace 和权限约束。仅存在未领取的普通队列输入不应当作活跃 Run，队列暂停时可先修改模式再继续。

回执未明确时，客户端显示正在确认提交结果并使用原标识查询/重试，不直接生成新任务。此保证只覆盖提交去重，不承诺外部工具副作用可自动安全重试。具体回执建议包含 taskId、sessionId、durableSeq 与当前状态，字段在接口审阅时定稿。

以下基本队列操作规则已确认：

同一 Session 同时只执行一个 Run；该 Run 可消费指定的补充输入，其他输入等待；不同 Session 可并行。按接纳顺序推进；上移只调整未领取的普通排队输入，Host 持久保存顺序。删除取消未领取输入并保留记录。编辑先撤回排队任务，再将内容放回输入框，重新发送生成新提交和新 Task；不原地修改已接纳请求内容。队列操作与输入领取由 Host 排序：撤回先成功则不执行；领取先成功则拒绝撤回编辑，不自动停止或重复创建任务。过期队列 revision 返回冲突与最新状态，客户端刷新，不用旧列表覆盖新状态。持久记录是事实来源，内存队列只是可重建索引。

接纳和输入 materialization 不做两份独立必需记录的跨文件事务：任务接纳记录保存完整消息内容；领取时再把它投到 Inbox/用户消息。稳定 messageId 防止崩溃边界重复展示或重复接纳。

取消/steer 面向 taskId/agentRunId，拒绝过期操作命中新 Run。停止指定 Run 的同时暂停后续队列，运行失败同样暂停；用户点击“继续”才放行。暂停期间新提交仍进入暂停队列，不隐式恢复执行。/compact 作为同一会话串行的管理操作，占用同一调度槽，不能插入运行，也不伪装成 Loop Run。

恢复时旧 Run 保持 interrupted；排队任务转为等待用户确认，不自动执行。已确认：中断后手动继续，在原 Session 建立关联原任务的新 Task/Run，旧 Run 保持已中断，不恢复旧 Loop 内存、不自动重放结果未知的工具；失败后的继续同样建立关联新任务。尚未开始的任务继续时重新放行原 Task，启动时创建 Run。旧版本没有任务事件的 Session 正常读取，不伪造历史接纳回执。

## 5. 三类生命周期的具体边界

- Host：持有存储、配置/凭据解析、共享基础能力、共同服务和 Harness 管理器。
- Harness：持有该组合的运行工厂、服务实现、策略与配置。不能从 root.get 重新读到新组合的可变服务。
- Run：持有 Loop、取消信号、预算、Inbox 消费与临时资源；所有结束路径先停止工作、记录终态，再释放运行资源和租约。持久化失败必须显示失败/恢复阻断，不能返回已持久完成。

父子关系不等于 scope 继承。子 Run 从自己的 Harness 租约派生作用域，父 Run 的权限上限、workspace 边界、任务归属和取消信号通过明确输入传入，不能让父策略监听器因 scope 父链自动进入子 Run。

审批等待暂停执行时长预算；多个同时等待的审批用计数/区间汇总，不能重复扣除暂停时间。绝对 deadline 不暂停，过期后撤销待审批并拒绝迟到批准。排队不消耗执行预算，但已设绝对 deadline 的任务到期不可启动。取消和等待状态通过服务调用确认，通知事件不承担必须成功的持久写入。

正常重配置先检查未完成任务并暂缓；显式退出按既有关闭产品约定取消/排空后释放。必须先结束运行并归还租约，再等待 Harness manager.close，最后关闭 Host root；避免 close 等待租约而持有者等待 root 关闭的死锁。

## 6. P1 与生产组合之间的缺口

P1 目前固定产物和 Loader 的验收使用可枚举 ESM fixture；当前生产 factory 直接依赖默认 AgentLoop，Profile 也混装 Host 与执行服务。不能声明 P2 只加三次 lease 调用就已接通。

建议把“默认内置运行组合的最小产物构建及 Host/Harness 分类”作为 P2 的明确前置交付：复用既有构建工具，产出默认实现可加载的固定闭包；不做任意 npm 插件的通用打包器。P3 再扩展到用户修改后的 Patch 产物与启用流程。此项相较 P1 原文的“内置产物迁移属于 P3”为明确的阶段调整，用户已在本轮范围审阅中认可。

最脆弱假设是根级工具/Prompt/LLM 服务可以直接作为共享能力复用。如果其中持有组合可变策略或注册表，就必须迁入 Harness；只有经检查兼容、与组合无关的 Host 能力可共享。不能通过把所有包标为 sharedModules 来绕过固定闭包。

## 7. 建议实施顺序与阶段验收

以下是 P2 内部的集成顺序，不分别声称可独立发布；P2 作为一个可用的迁移切片验收。

1. 定共同任务/Run/工厂契约和 Journal 事件，明确去重、接纳 barrier、恢复与 fork 规则。
2. 分类 Host/Harness 服务，构建默认固定组合；默认 Loop 实现运行工厂契约，证明两种 Loop 可同时运行且不共享实例状态。
3. 迁移任务管理：先持久接纳，再入队；实际开始 acquire；收尾 release；模式/压缩等冲突统一排序。
4. 接入主 Run 与子 Run，迁移预算/取消/审批等待；移除 Session 长期 assembly 和两套运行管理状态。
5. Desktop/Headless 接共同服务，迁移 renderer 队列与 IPC，保留功能和输出契约。
6. 跑回归、真实 Electron/CLI 和断点故障测试，核对旧接口消费者后删除重复路径，更新对应文档。

验收必须包含：

- 新建/恢复/fork 不创建 Loop；开始 Run 才创建，结束释放一次，Session 历史连续。
- 并发重复提交、同 ID 不同内容、flush 失败、回执丢失后重试、终态落盘失败。
- 排队后修改模型配置，实际传递时采用最新配置；重试同提交不因配置变化冲突，插入不做消息级配置兼容检查。
- 同一 Session 先完成 Plan Run，再切换为 Agent 启动后续 Run；运行中切换被拒绝，补充输入不改变模式；暂停队列改模式后继续使用新模式。
- 等待任务在启用新组合后开始使用新组合；同会话后续 Run、不同 Session 并存、子 Harness 独立选择；失败候选不影响旧运行。
- 插入/撤回/运行结束清除指定均保留同一 taskId；消费与撤回竞争只产生一次领取，已领取但未完成不自动归队。
- delayed cancel/steer/approval 不能命中后续 Run；并行审批、执行预算、deadline 与父子取消完整覆盖。
- 进程在接纳/启动/工具副作用/终态持久化边界中断后，不自动续跑、不盲目重放工具。
- 队列停止暂停、失败暂停、继续、上移、编辑、删除、steer/撤回、未读 steer 归队、/compact、后台会话及窗口重载。
- 模式、模型、thinking/reasoning、技能/引用/附件、标题、压缩、审批/grant、子 Agent、历史/投影与 CLI JSONL/退出码兼容。

既有回归入口：core-agent-loop 的 service/steer/auto-compaction/composer-references/output-references；desktop-app 的 lifecycle/session-title；subagent provider；runtime 的 session-projection/tool-composition/subagent-session/desktop-fork；Desktop app-message-queue 与 runtime-v2-* IPC；CLI runtime-v2/host-parity/approval 及进程 SIGINT smoke。最终文件级计划须将每项映射到具体测试与命令。

真实 UI 验收先列上述覆盖点，再按“队列/运行控制”“审批/预算”“会话恢复”路线分组；每项标注通过/失败/未覆盖。源码与 mock 不能代替真实 Electron 验收。

## 8. 数据与回退边界

不重写或删除旧 Journal。新任务事件由明确插件 owner/codec 管理，codec 必须在读取 Session 前可用。fork 继承内容与必要模式事实，不把父会话任务队列、去重身份、审批和 Run 状态当作子会话活动任务。

添加事件不自动等于旧二进制可读：若 required codec 不存在，回退后可能只读/拒绝加载。最终计划必须验证旧读取器行为；默认不删除新增事件以“回退”。代码回退与用户数据可读性分别验收，无法向后读时保留备份和支持新 codec 的读取版本。

P2 无新增云账号、密钥或第三方网络服务要求。自动化使用已有 mock；真实模型/Browser 验收使用已有配置并独立记录，不能以假数据结果声称真实环境通过。

## 9. 执行前剩余技术细化

范围、任务身份、内容队列、去重、恢复、模式与运行配置的产品边界已确认。目前没有需要用户继续选择的产品行为；以下由实施方根据现有源码补齐，不将常规技术字段变成逐项审批：

1. 文件级任务与依赖图：列出 Host/Harness 服务归属、共同应用插件与运行契约位置，以及旧入口消费者的替换路径。
2. 持久化契约：定稿事件 owner/codec、接纳/领取/终态 barrier、队列 revision、fork 过滤或归属隔离，列出崩溃恢复与旧数据读取证据。
3. 运行接线：明确配置消费边界、运行工厂、父子权限与取消、审批预算、终态失败和租约清理顺序。
4. 验收映射：每项行为对应自动化测试、命令和真实 Electron/CLI 验收点，补齐回退步骤。

补齐后按用户先前“没有剩余讨论即可开始”的授权推进。若源码验证暴露必须改变已确认产品行为或数据安全边界的问题，再提出具体差异，不默默扩大范围。

## 10. 范围确认记录

用户认可 P2 包含 Desktop renderer 队列控制权迁至 Host，以及默认内置 Harness 的最小固定产物接线。保留现有队列交互，不扩展 UI 布局或手机前端；通用插件打包、Patch 审批与在线启用仍归 P3。这是最初的范围确认记录；后续契约确认与执行授权状态以本文开头和第 9 节为准。

## 11. 文件级执行清单

依赖方向：desktop-app/headless → agent-service → session-persistence/session-journal/shared。agent-service 通过结构化运行端口调用组合内工厂，不依赖 runtime 或具体 AgentLoop；runtime 注入 P1 租约获取与 Session 访问。core-agent-loop 实现运行端口，不能反向依赖应用调度。Host 能力留在 root：存储、凭据、网络/进程/文件能力与配置读取。工具注册表、Prompt 贡献、Loop 工厂、compaction 策略归 Harness；主子 Run 的取消/预算和临时 scope 归 Run。

- [x] T1 `packages/agent-service/src/{contracts,task-events,task-ledger}.ts`：内容任务及单会话串行持久操作。采用插件命名空间 required 事件；接纳、领取、终态、队列变化分别 flush 后可见。事件均携带 owning sessionId；fork 保留历史事件序号，但不投影父会话调度状态。`submit(submissionId, content)` 去重；`designate/withdraw/cancel/move` 带 queue revision；`start/claim/finish/recover` 是运行所有者的内部操作。flush 失败阻断该实例后续 mutation/ack，须重新读取持久状态恢复。
- [x] T2 `packages/agent-service/src/{run-manager,execution-budget}.ts`：按 Session 调度，工厂创建前获取租约，任何收尾路径等待运行停止、持久终态、资源销毁后 release；dispose 关闭接纳并取消运行。执行配置由 Host 在消费边界读取；模式固定。预算使用注入时钟，审批等待计数去重，deadline 单独计算。
- [x] T3 `packages/runtime/src/{boot,profiles/composition,runtime/agent-factory-plugin,runtime/agent-runtime-plugin}.ts` 与 `packages/runtime/cordis.yml`：列举并固定默认产物闭包，拆 Host/组合服务；启动时准备并启用默认组合，Run 工厂仅从租约解析。`packages/core/agent-loop/src/{loop,service}.ts` 去除跨 Run 队列所有权，接入安全点领取与配置刷新；`packages/subagent/src/provider.ts` 独立获取子 Harness，同时保留父权限上限与取消关联。
- [x] T4 `packages/agent-service/src/{service,plugin,manifest,codec}.ts`：共同会话/任务操作插件；codec 纯入口先于行为和 Session 读取。`packages/desktop-app/src/service.ts` 与 `packages/headless/src/runner.ts` 迁入共同操作；`packages/runtime/src/runtime/{run-controller,session-controller}.ts` 删除长期 assembly 缓存和重复运行状态。Session 创建、恢复和 fork 不创建 Loop；CLI ephemeral 回执明确不提供跨进程 durability。
- [x] T5 `packages/shared/src/` 的 Runtime IPC 契约、`apps/desktop/src/main/runtime-v2/{fixed-renderer-ipc,runtime-registry}.ts`、preload 与 `apps/desktop/src/renderer/{App,session/message-queue}.tsx`（队列模块实际为 `.ts`）：Host 接纳后展示 taskId，客户端只持草稿/提交中状态，删除 continueQueue 执行权。运行配置通过独立更新操作同步，不进入队列内容；CLI `apps/cli/src/runtime-v2/run.ts` 保留 JSONL/退出码/导出。
- [x] T6 回归与删除：检索旧 attach/followup/rebuild 消费者后删除迁移路径；更新当前架构设计、history、learning、执行摘要。默认产品接通之前，新基础模块通过独立测试验证，不宣称 P2 完成。

### 持久契约与事件分发

`plugin/actspace.agent-service/task` v1 required codec 表示接纳/指定/取消/领取，`plugin/actspace.agent-service/run` 表示启动/终态，`plugin/actspace.agent-service/queue` 表示暂停/排序/恢复。稳定 taskId 同时作为 messageId；submissionId 仅在 owning Session 去重。队列 revision 取本插件最后成功提交事件 seq，读取不可提前暴露未 flush 的 mutation。Run 启动事件记录 harnessId/generationId/revision 和实际配置，不进入提交内容。输入领取与 user surface 在同一 Journal 批次内记录，flush 后才送给执行器。

持久操作直接 await 服务，不通过 observer 完成。队列/Run 更新通知使用 `@mode emit`，异常隔离，状态从快照重新读取；策略干预保持既有 waterfall/serial/bail 声明，不将各模式互换。终态落盘失败阻断该会话继续，释放资源仍执行，但不能发出持久成功回执。

### 验证与回退

T1/T2：`pnpm --filter @actspace/agent-service test`、`pnpm --filter @actspace/agent-service build`；真实临时 SessionStore 验证重开、fork、落盘前 gate、失败阻断，替代工厂验证 single claim、最新配置和租约清理。T3/T4：`pnpm --filter @actspace/runtime... build` 后执行 core-agent-loop、runtime、subagent、desktop-app、headless 各包 test，P1 boot/adapter 回归。T5/T6：Desktop test/typecheck/build、CLI test 与 `pnpm test:agent-cli:process`；`pnpm check:docs` 和 `git diff --check`。

Computer Use 验收点：U1 同会话 Plan→Agent、运行中禁切；U2 排队/上移/编辑/删除/暂停/继续；U3 指定插入/撤回/未读归队；U4 后台会话与窗口重载保持队列；U5 审批与停止；U6 恢复历史不自动执行、附件/引用与结果可读。操作按“会话模式与队列”（U1–U3）、“后台与重载恢复”（U4/U6）、“审批和中断”（U5/U6）分组，在关键状态保留截图和运行证据，逐点报告。

回退按 T6→T1 的消费者反向撤销本次代码变更；不删除或重写用户 Journal。新增 required codec 会让旧读取器拒绝继续执行，必须在 fixture 验证这一边界，保留支持 codec 的读取版本；不将源码回退称为数据兼容。测试仅使用临时数据，不迁移真实用户历史。
