## 约定

- `dsh/` = `deepseek-harness/packages/subagent/`（服务层 `dsh/subagent/src/`，工具层 `dsh/tool-subagent/src/`、`dsh/tool-subagent-control/src/`）
- `oc/` = `opencode/packages/core/src/`
- 核实说明：`opencode/specs/v2/{tools,session}.md` 里**没有**子智能体专章（grep `subagent` 无命中），opencode 的作者意图证据只能取自工具描述、`services/site/src/docs/content/{agents,tools,permissions}.mdx` 与 agent 定义；dsh 有 `deepseek-harness/docs/subsystems/subagent.md` 与各包 README。

---

# 一、deepseek-harness（dsh）

**1. 一句话**：子智能体是**一个受管理的独立 Session / 独立 Agent**（本地）或**一次外部执行**（acp/codex/claude-code/sdk），统一由 `SubagentManager` 的 "activation" 概念承载。证据：`dsh/subagent/src/manager.ts:913`（本地用 `ctx.agents.create`）、`:905`（冷恢复用 `agents.resume`）；`dsh/subagent/src/types.ts:30-44`（activation = provider + request + delivery）。

**2. 层次**：模型工具 `subagent`/`send_message`/`interrupt_agent`/`list_agents`（`dsh/tool-subagent/src/index.ts:325`、`dsh/tool-subagent-control/src/index.ts`）→ 服务 `SubagentRuntime.startActivation`（`subagent/src/index.ts:271-286`，按 provider 是否实现 `prepareContinuable` 分流 `startLocal`/`startExternal`）→ `SubagentManager`（`manager.ts:379`、`:483`、`:739` materialize）→ 运行时实体：本地 `Agent`+`Session`，或 provider 的 `start()` 外部进程。目录发现走父会话自有投影 `catalog.ts` / `list-children.ts`。

**3. 派发与上下文**：本地的两种 provider 把"继承"做成产品级开关——spawn 不带种子（`subagent-spawn-in-process/src/index.ts:46,50-54`），fork 只播种到最后一个 `turn/end` 的父日志前缀（`subagent-fork-in-process/src/index.ts:46-53,72-78`）。system prompt / 工具集不由派发参数裁剪，而由 **preset 组合**决定：显式 preset 则 `presets.mount`，否则 `composeFrom(parent.ctx)` 继承父的当前代（`subagent/src/child-agent.ts:186-218`）；再叠加一条 `subagent:delegation` runtime context（`:171-175,205-209`）。模型默认继承父的最新请求路由（`child-agent.ts:98-119`），要开放选择才在工具上开 `modelSelection`，且先查会话授权策略再用 `llm` 预检（`tool-subagent/src/index.ts:292-313`）。

**4. 通信与生命周期**：**能运行中通信**——`send_message` 对运行中的目标走 `agent.steer`（下一步边界生效），空闲目标走 `followup` 开新一轮（`manager.ts:626-627`），且只允许"相邻"血缘（`:549-573`、`:713-722`）。**能取消**但只是"停当前一轮"：本地 `agent.cancel({kind},{keepInbox:true})`，外部则 `controller.abort` 并 dispose（`manager.ts:221-227`）。完成**异步通知**：`notifySettlement` 在清理与释放槽位后，把 `subagent-settled` 消息投给父，父空闲用 queue、忙用 steer（`manager.ts:1206-1218`；消息构造 `continuation-messages.ts:140-160`）。工具本身**从不等待**（`dsh/tool-subagent/src/index.ts:332` 只返回 childId），程序化等待由 `delivery:'caller'` 的 workflow/rallph 承担（`types.ts:42-43`）。

**5. 并发与嵌套**：两道闸门。深度 `maxDepth` 默认 1（`subagent/src/index.ts:196`），深度持久化在会话头且单调（`depth.ts:28-36`、`child-agent.ts:49-58,152`），到顶时**工具仍可见**、只注入一段"别调了，自己做"的上下文并以 error 拒绝（`tool-subagent/src/index.ts:377-389`）；容量 `maxActiveSubagents` 默认 8，按"顶级父共享一个池"计（`subagent/src/index.ts:197`、`manager.ts:744`、`activation.ts:24`），满员不排队而是直接拒绝（README.md:57）。**运行级超时未找到**，只有 dispose/shutdown grace（`subagent-acp/src/run.ts:390`、`subagent-dsh-sdk/src/index.ts:80`）。

**6. 权限**：在派发点**冻结**——审批策略一律钉成 `'never'`，只继承父会话显式设置的 sandbox override，并把结果作为 `source:'delegation'` 事件写进子会话日志（`child-agent.ts:230-255,266-279`）。所以子智能体**不能升级权限、也不能弹审批**，只能在 runtime context 里被告知"说明限制并交回父"（`:171-175`）。可派发的 preset 另有 `allowedAgentPresets` 白名单（`tool-subagent/src/index.ts:101`）。

**7. 作者意图**：作者把"委派是否继承上下文"当成要给模型讲清楚的语义，工具描述随 `inheritsParentContext` 改写（`tool-subagent/src/index.ts:117-141`）；系统提示只留一段共用指引，要求**并行发起、然后结束本轮而不是 sleep/轮询**（`:363-376`）；深度到顶时明确"carry out the work directly"（`:387-388`）；量级约束写在 workflow 工具上——"只在用户明确要求 workflow 或大规模多智能体编排时用；一两次委派用普通 subagent"（`deepseek-harness/packages/workflow/tool-workflow/src/index.ts:329`）。

---

# 二、opencode

**1. 一句话**：子智能体是**一个带 `parentID` 的普通子会话**，模型通过同一个 `subagent` 工具"开会话 + 投 prompt"，同步性由一个参数决定（默认前台阻塞，`background:true` 立即返回）。证据：`oc/session/session.ts:288-318`（`create` 只多一个 `parentID`）；`oc/tool/plugin/subagent.ts:229-256`。

**2. 层次**：工具 `oc/tool/plugin/subagent.ts:106-268` → **两个已有服务**：`Session`（create/prompt/interrupt/synthetic，`oc/session/session.ts:133,210,243,244`）与 `Job`（`oc/job.ts:120-129` 的 block/background/cancel）→ 中间还有一层薄适配 `SubagentJob`（`oc/session/subagent-job.ts:45-67`：把"子会话 resume"包成 `type:"subagent"` 的 Job，并带恢复信息 `oc/job/recovery.ts:11-17`）→ 完成投递 `oc/session/subagent-completion.ts:21-46`。**没有独立的服务层抽象**：子智能体不拥有自己的生命周期对象，它就是"会话 + 一条 Job"。

**3. 派发与上下文**：子会话**从空上下文开始**（`oc/tool/plugin/subagent.ts:208-211` 只在 prompt 前加一行 `You are a subagent spawned by another session.`；`services/site/.../agents.mdx:118`）。裁剪靠 **agent 定义**而不是派发参数：子会话带 `agent`，工具集 = `registry.snapshot(Permission.merge(agent.permissions, session.permissions))`（`oc/session/context.ts:133-139`，过滤逻辑 `oc/tool.ts:333-340`），system prompt 取该 agent 的 `system`（`oc/plugin/agent.ts:78` 给 explore 专属提示）。模型优先级 `参数 override → agent.model → parent.model`（`oc/tool/plugin/subagent.ts:184`）；续聊换 agent 时同步换模型（`:171-182`）。

**4. 通信与生命周期**：**运行中可通信**——再调 `subagent` 并带 `sessionID`，走 `sessions.prompt`，默认 delivery 是 `steer`（`oc/session/session.ts:165`），即步边界插入；但**没有独立的 send/interrupt/list 工具**，取消只发生在"前台调用被中断"时，`sessions.interrupt + jobs.cancel` 一起做（`oc/tool/plugin/subagent.ts:234-240`）。完成通知是向**父会话**写一条 `synthetic` 消息（`oc/session/subagent-completion.ts:37-44`），父空闲时由 `session.ts:323` 的 wake 拉起新一轮。会话按 `子会话 id` 复用：Job id 就是子会话 id（`oc/session/subagent-job.ts:48`），所以"重启后续聊/恢复"天然落在会话上。

**5. 并发与嵌套**：深度取 `experimental.subagent_depth`，默认 1，沿 `parentID` 链计数，超限**直接报错**且不给上下文提示（`oc/tool/plugin/subagent.ts:123-139`；`packages/schema/src/config/experimental.ts:44-46`）。内置 `general`、`explore` 都显式 `subagent:* deny`，即出厂即禁止嵌套（`oc/plugin/agent.ts:70,91`）。**并发上限未找到**；`jobs.block` 不接受超时参数（`oc/tool/plugin/subagent.ts:234`），**运行超时未找到**。

**6. 权限**：权限动作就叫 `subagent`，资源是被派发的 agent id，`assert` 失败即 `Subagent denied`（`oc/tool/plugin/subagent.ts:144-151`）；同一规则还用于**裁剪工具描述里的可用子智能体清单**（`:282-305`），所以"看不到"和"调不动"是同一个权限源。子会话**用自己的 agent 权限**（`services/site/.../agents.mdx:118`、`permissions.mdx:268`），同时会话层继承父的 `metadata/permissions` 作为附加约束（`oc/session/session.ts:311-314`）。子任务的审批仍走正常 permission 流程（可 `ask`），没有 dsh 那种"冻结成 never"。

**7. 作者意图**：默认前台、只有独立工作才后台（`subagent.ts:61` "Use background only for independent work…"），后台返回里连写三段"不要 sleep/poll/重复工作"，并给出"想追加指令就用同一个 sessionID 再调一次"（`:23-27`）；参数说明把 `model` 收紧为"用户没明确要求就别设"（`:37-40`），把 agent 目录做成"按权限动态追加的 Available subagents 列表"（`:296-305`）。

---

# 三、四个项目的关键差异

| 维度 | dsh | opencode | codex | kimi-code |
|---|---|---|---|---|
| 子智能体是什么 | 受管 activation（本地 Agent/Session 或外部运行时） | 带 `parentID` 的普通会话 + 一条 Job | 同进程另一条会话线程，树里有路径 | 后台 task + 独立 Agent scope |
| 结果如何回父 | **一律异步**：工具只回 id，结果靠完成通知；等待交给 caller/workflow | 默认**前台阻塞**返回终稿，`background` 才异步 | 邮箱投递（`MESSAGE`/`NEW_TASK`/`FINAL_ANSWER`） | task 通知（XML），默认前台 |
| 运行中通信 | 独立 `send_message`，双向（子→父、父→子），steer 到步边界 | 折叠进 `subagent` 的 `sessionID`，无独立通道 | 统一邮箱，`trigger_turn` 一个布尔区分派发/通知 | 普通子智能体**不可寻址**，运行中通信只在实验性 Tower |
| 控制面 | send/interrupt/list 三件套 + 血缘分权 | 只有取消（前台被中断时），无列表 | send/followup/wait/interrupt | Agent/WaitFor/TaskList/TaskOutput/TaskStop |
| 权限 | 派发点**冻结**（approval 钉死 never），子不能弹审批 | 子用自己的 agent 权限，仍可 `ask` 用户 | 自带审批通道 | 白名单 + 自有权限 |
| 可换后端 | 是（spawn/fork/acp/codex/claude-code/dsh-sdk 同一工具面） | 否，都是同进程子会话 | 否 | 否 |

**最本质的差别是"结果在不在工具返回里"**。dsh 把委派做成**发布-订阅**：`startActivation` 返回即"已受理"，父要么结束本轮等通知，要么显式声明 `delivery:'caller'` 去 await——这也是它敢把"并行派发 + 不轮询"写进系统提示的前提。opencode 与 kimi-code 把委派做成**函数调用**：前台就是同步等值返回，后台才切入 task/Job 语义；代价是"前台等太久要不要转后台"这种状态迁移必须显式建模（opencode 的 `backgrounded` 分支、kimi 的 `detached`）。codex 则把"派发"和"通知"都归约成同一封邮件，最统一但也最不像函数调用。

**第二个差别是"子智能体到底是什么对象"**。dsh 为它造了新名词（activation + provider + catalog 投影），honest 的代价是代码量最大（管理器 1500 行）；opencode 坚持"零新抽象"，复用 Session + Job，因此**没有**独立的列表、没有旁路收件箱、没有跨 provider 能力协商；codex/kimi 各自选了"树/邮箱"和"task 服务"两种既有抽象来寄生。

**第三个差别是嵌套的表达方式**。dsh 与 opencode 默认都是 1 层，但 dsh 把上限做成**运行时叙述**（工具仍可见，注入"到顶了，自己做"，运行期再拒绝），opencode 与 kimi 都是**直接报错**（`Subagent depth limit reached`）。dsh 还额外叠了 `maxActiveSubagents=8` 的容量闸门，这一点另外三个项目都没有对等物（未找到）。