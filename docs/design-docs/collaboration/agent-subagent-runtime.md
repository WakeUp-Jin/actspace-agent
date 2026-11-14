# 子智能体运行规范

> 子智能体运行时的唯一现行规范。任务登记表、`task_*` 工具和通知的通用部分见[后台任务](agent-background-tasks.md)；界面见 [front-子Agent与后台任务规范](../frontend/front-子Agent与后台任务规范.md)；transcript 的格式与写入时机见[会话记录 Markdown](../agent-runtime/agent-session-transcript.md)。
>
> 模型可见的英文（工具描述、参数说明、返回与错误文字、追加在任务后的说明）只有一份，在 `packages/subagent/subagent/src/messages.ts`。本文只写结构、边界和原因，不抄原文。实现在 `packages/subagent/`，包表见 [`packages/subagent/README.md`](../../../packages/subagent/README.md)。

## 定位

子智能体是主会话派出的、在自己子会话里工作的 Agent，`agent_id` 就是子会话 ID。它是主智能体的「临时上下文窗口」：做完就结束，不管理生命周期，需要时再开一个。所以默认同步（调用等结果）、不续派、可写；没有单独的 `explore` 工具，它是 `agent` 的只读预设。

控制权不转移：子智能体只交回一个结果（同步调用的返回，或后台的一条完成通知），怎么用、接着做什么由主智能体决定；子智能体失败或被停，主会话这一轮照常继续。它的对话不并入主会话。

运行模型参考 DeepSeek Harness（可写、预设与模型可选）。ActSpace 自己加的是「留痕」：子会话 transcript 的路径全程交给主智能体，并进入上下文的活跃 / 睡眠路径，主智能体需要时去读执行细节，不必只相信最后那段结论。

## 工具

主会话在 `plan` 和 `agent` 模式下有四个子智能体工具，`chat` 模式没有。工具由 Harness 插件 `actspace.subagent-tools`（包 `@actspace/tool-subagent`）注册，只做转发；调度在 Host 侧的 `SubagentManager`（插件 `actspace.subagent`，Host 端口 `actspace.host.subagents`）。四个工具都声明 `declared-safe`，同一步里的多个调用并行。

| 工具 | 作用 |
|---|---|
| `agent` | 创建子智能体。参数 `description`（1–60 字符的短标签，给列表和界面用）、`prompt`、`agent_preset`（`general` / `explore`，默认 `general`）、`background`（默认 `false`）、`model`、`reasoning_effort` |
| `agent_fork` | 创建继承当前会话上下文的子智能体，沿用父会话的工具与模型；参数同 `agent`，没有 `agent_preset` |
| `send_message` | 给运行中的子智能体补充信息，或子智能体给父会话发消息，见下 |
| `list_subagent_models` | 列出可用的模型与思考档位，以及当前的默认模型。单独做成工具、不写进 `agent` 的描述：模型列表一变描述就变，会破坏 prompt cache |

`send_message` 只有两个方向：

- 主会话 → 自己**运行中**的子智能体：写进子会话收件箱，下一步开头读到。子智能体走完最后一步之后、收尾之前到的消息会让它再跑一轮；再晚就按已结束处理，返回错误并提示开新的。发给外部子智能体、不认识的 ID、自己，都返回错误。
- 子智能体 → 父会话：写进父会话收件箱，父会话空闲则唤醒。发给兄弟返回 `SIBLING_MESSAGE_BLOCKED`。
- 消息在收件箱里是 `<agent_message from="<发送方 agent_id>" relation="parent | child">`，来源 `agent_message`。
- 描述里写明用法约束：只用来补充事实或纠正目标，不要用来催它停下或马上交结果；没有时间限制，信任它跑完。

没有 `wait_agent`、`list_agents`、`interrupt_agent`：要结果用同步调用；转后台的子智能体用 `task_list` / `task_output` / `task_stop` 管理（`taskId` 就是 `agent_id`，见[后台任务](agent-background-tasks.md)）。同步子智能体运行时父会话正在等它，不在任务清单里，也不能用 `task_stop` 停，只有用户能在界面停。

另有两个默认关闭的外部插件工具 `agent_codex`、`agent_claude_code`，见「外部子智能体」。

## 状态与事件

| 名词 | 取值 |
|---|---|
| 种类 `kind` | `local`（`agent` 创建）、`fork`（`agent_fork`）、`codex`、`claude-code`（外部） |
| 预设 `preset` | 只有 `local` 有：`general`、`explore` |
| 状态 | `running`、`closed`（已结束，不能再给它任务或消息） |
| 激活结果 `status` | `completed`、`interrupted`、`failed`、`max_steps`、`lost` |
| 交付 `delivery` | `returned`（同步调用带回结果）、`notified`（登记表发了完成通知）、`stopped`（`task_stop` 或用户停止，停止结果就是交付）、`lost`（没有人被告知：退出重启、编辑重发回退） |

主会话 Journal 里只有两类事件，所有状态（列表、并发计数、面板）都从它们折叠出来（`@actspace/shared/runtime-v2` 的 `foldSubagentTree`），不另存；内存里只有正在运行的子智能体。

- `subagent/spawned`：创建时一次，含 `agentId`、`callId`、`kind`、`preset`、`description`、`transcriptPath`、`createdAt`；本地与 fork 另有创建时固定的 `toolNames`，fork 另有 `inheritedThroughSeq`。
- `subagent/activation`：`op: "start"`（`activationId`、`trigger: "spawn"`、`callId`、`background`、`model`、`reasoningEffort`、`startedAt`）与 `op: "settle"`（`status`、`summary`、最多 8KB 的 `result`、`resultTruncated`、`delivery`、`endedAt`）。每个子智能体只有一次激活。

老会话的 `delegation/*`、旧格式 `background/task` `kind: "agent"`、`subagent_notification`、`trigger: "message"`、`delivery: "wait"` 的编解码器保留，只读显示，不转换；老会话里 `inactive` 的子智能体按已结束显示；老会话的统计继续读 `delegation/*`。

## 后台登记

后台子智能体（`background: true`，或同步等满 30 分钟后）登记进后台任务登记表（`BackgroundTaskRegistry`）：`kind: "agent"`，`taskId = agentId`，带 transcript 路径和种类标签；输出是 transcript 尾部，停止就是中断激活。登记在 `subagent/*` 开始事件写完之后。登记表统一负责完成通知、`task_*` 工具、重启后标 `lost`；子智能体管理器只负责跑子会话，不自己投递通知。同步调用不登记（父会话正在等它，结果由工具调用带回）。

## 子会话

子会话是普通的 v2 Session：`sessions-v2/<agent_id>/journal.jsonl`，头部 `lineage` 为 `origin: "delegation"`、`parentSessionId`、`parentCallId`、`delegationDepth: 1`（fork 另有 `inheritedThroughSeq`），`createdWith.presetId` 是 `actspace.subagent.` 加 `general`、`explore` 或 `fork`。`local` 子会话不继承父会话的对话，开头只有任务消息。不能当作主会话通过恢复入口续跑，也不接受主会话的任务调度（AgentService 对子会话只读快照，不打开、不占写锁）；子会话由管理器自己按激活路径取运行租约和 Ledger 来跑。

运行租约取在调用方那次运行所用的 Harness 组合上。子智能体的 Agent Scope 从这份租约派生，只管注册可见性和资源归属，不是权限边界；工作区、权限模式、工具上限和取消都是显式传入的，见 [Agent Scope 模型](../agent-plugin-runtime/agent-spec-agent-scope-model.md)。

## 能力与权限

| 预设 | 工具 |
|---|---|
| `general` | 父会话创建时所在模式允许、且已注册的工具，去掉 `agent`、`agent_fork`、`agent_codex`、`agent_claude_code`、`list_subagent_models`、`task_*`、`present`、`plugin_manager`、`harness_inspect`，加上 `send_message`。可写文件、跑命令 |
| `explore` | `read_file`、`list_directory`、`grep`、`glob` 加 `send_message` |
| fork | 与父会话完全相同的工具列表（为了命中缓存）；上面去掉的那些在执行时拦下，返回 `Subagents cannot use <name>.` |

- 工具列表在创建时算好，记在 `subagent/spawned` 的 `toolNames` 里，之后不变（子会话的提示词前缀因此稳定）。发给模型的工具定义和执行时的放行检查用同一份：按名字调用列表外的工具会被 Tool Runtime 拒绝（`TOOL_SCOPE_DENIED`）。预设和调用参数只能收窄权限，不能扩大；两个预设写死在 `packages/subagent/subagent/src/preset.ts`，没有可注册的预设表。
- 深度固定 1：子会话里委派工具执行时被拦。每个主会话最多 10 个**正在运行**的子智能体（同步加后台、含外部），超出返回上限错误；后台 Bash 另有 5 个的上限，两者分开计。
- 子智能体**不弹审批**：工具环境没有审批代理。需要审批的操作，`auto-review` 模式下先交给替我审批，没批或在其他模式下直接失败（`APPROVAL_REQUIRED`），结果文字说明「需要用户批准，子智能体无法请求」，让它报告给父会话。出沙箱请求（`require_escalated`）在非 `full-access` 下也是一次审批，同样失败。
- 权限模式每次激活从父会话读取，并在子会话写一条 `permission/mode-set`，回放时能看出它在什么模式下跑。会话授权只读父会话的（工具环境的 `sessionGrantOwner` 指向父会话主智能体），不能新增；沙箱照常。
- 子会话里的 Bash 不转后台，最多 10 分钟，超时报 `BASH_TIMEOUT`：后台任务只属于主会话。
- 在 `plan` 模式下创建的 `general` 只拿到 `plan` 模式的工具，天然只读。

## 模型

一次激活用哪个模型，依次取：

1. 调用参数 `model`：必须在 `list_subagent_models` 列出的模型里，否则返回 `UNKNOWN_MODEL` 并提示先列模型。
2. 设置「子智能体默认模型」`subagentDefaultModel`：空着或已不可用就跳过。
3. 父会话**当前**的模型、思考开关与档位。

`reasoning_effort` 不给时用所选模型的默认档位，走第 3 条时连档位一起跟父会话；所选模型不支持这个档位返回 `UNKNOWN_EFFORT`。`agent_fork` 跳过第 2 条：换模型就丢了缓存。

可用模型由 Host 端口 `actspace.host.models` 提供（`listUsableModels()`、`subagentDefaultModel()`）：Desktop 取设置里可用的聊天模型，CLI 只有当前模型。外部子智能体的模型不在这里列。

设置只有这一项，第一项「跟随主智能体」。旧设置里的探索模型（`taskModels.exploreModel`）在升级时丢弃，不带到这一项（设置的 `layersVersion` 2 → 3）：旧值多半是便宜的探索模型，带过来会让可写的 `general` 默认跑在弱模型上。

## 留痕与通知

- **transcript**：就是子会话自己的 `sessions-v2/<agent_id>/transcript.md`，不另写一份；启动时先写出头部和任务消息，此后每走完一步重写。路径在四处交给主智能体：同步结果、后台启动返回、`task_list`（后台子智能体）、完成通知。读取免审批。
- **活跃路径**：`agent` / `agent_fork` 的工具结果带 `actspace.context.trace`，上下文引擎登记成活跃路径，之后照常按「一个压缩周期内没读过就转入睡眠」处理。登记要求文件存在，所以 transcript 必须在工具返回之前写出。
- **结果**：同步调用的结果和通知里的结论最多 8KB（UTF-8），截断时注明全文在 transcript。
- **完成通知**：后台子智能体结束时，由登记表给主会话收件箱放 `<task_notification>`（`<kind>agent</kind>`，来源 `task_notification`，通知类型 `subagent`），带状态、一句 summary、`<description>`、`<transcript>` 路径和原文不转义的 `<closing_message>`；主会话空闲则唤醒。版式在 `packages/background-tasks/background-tasks/src/notification.ts`。子智能体最后一个动作是给父会话发消息时，`<closing_message>` 换成一句 `<note>`，说明结论已在那条消息里。`task_stop` 与用户停止不发完成通知。
- **运行中清单**：运行中的后台子智能体和后台 Bash 一起列在 [`context-background-tasks`](../../../packages/context/context-background-tasks) 每轮写的清单里（带 transcript 路径），压缩或重启后模型仍知道谁在跑；同步子智能体不进清单，fork 不带这段。
- **任务说明**：任务消息末尾追加固定说明：最终回复只写结论和关键证据，不能向用户提问或请求审批，并行的写任务各改各的文件（`explore` 没有最后一句）。`local` 子智能体不注册主会话专属的提示词扩展。

## Fork

`agent_fork` 复用侧边对话的复制机制，让子智能体从父模型当时看到的上下文开始：

1. **边界**：在包含这次调用的那一轮里，取调用所在步骤之前最后一个 `step/end`；调用在本轮第一步时，取这一步 `step/start` 的前一个事件。边界内每个工具调用都有结果，能拼成合法上下文。DeepSeek Harness 切在最后一个 `turn/end`，ActSpace 多带上本轮已完成的步骤。
2. **复制**：父会话 `[0..边界]` 的事件原样复制进子会话，seq 不变，头部写 `inheritedThroughSeq`。上下文引擎状态是事件溯源的，压缩摘要、活跃 / 睡眠路径随之继承。
3. **补齐**：复制来的那一轮没有结束，在子会话追加 `turn/end`（`reason: "forked"`），丢掉复制来的父会话待读通知，再开始子智能体自己的第一轮；它留在被切那一轮的 Agent 模式里。
4. **保住缓存**：子会话按主会话的方式组装：同一套系统提示词来源（含父会话注册的主会话提示词扩展）、同一份工具列表、同一个模型与思考设置（没给 `model` 时），并共用父会话的 scratch 目录。所以深度限制在执行时拦，不从工具列表里删。

第一次请求因此能命中父会话的 prompt cache：`scripts/test/host-subagent-fork-cache-process.test.mjs` 用录制型 fake LLM 逐项比对系统提示词、工具定义、模型和边界之前的消息。其余同 `local`：深度 1、并发计数、通知；transcript 跳过继承段，头部指回父会话。

## 外部子智能体

`@actspace/subagent-codex`（`agent_codex`）、`@actspace/subagent-claude-code`（`agent_claude_code`）是两个**默认关闭**的会话插件，在 扩展 › 插件 里开启（标题分别是「Codex 子智能体」「Claude Code」）。工具只在 `agent` 模式出现，参数 `description`、`prompt`、`background`、`model`（原样传给 CLI，不给就用 CLI 自己的默认）。

- **用本机的 CLI**，不打包可执行文件，不加 npm 依赖。在登录 shell 里 `command -v` 查找（从 Dock 启动的 Electron 拿不到终端的 `PATH`），结果缓存到插件重载；找不到就不注册工具，插件页显示原因。
- **一次调用就是一个进程、一轮**，不续聊，结束后状态 `closed`；`send_message` 给它返回错误。
- **用 CLI 自己的权限与模型设置**，不走 ActSpace 的审批和沙箱，子进程继承用户环境（需要 CLI 自己的登录信息）：开启插件就是授权。Codex 默认 `approvalPolicy: never`、`sandbox: workspace-write`，Claude Code 默认 `permissionMode: dontAsk`（没授权的操作直接拒绝，不弹），只在插件设置里改，不跟随 ActSpace 的权限模式。
- **不另存留痕**，返回 CLI 原生的会话 JSONL 路径。只有这一个文件按精确路径免审批读取（不是整个目录），每次从主会话的子智能体投影判断，重启后无需恢复。JSONL 单行可能很长，读文件工具按行截断，读起来不如 `transcript.md` 顺；面板里也只显示结果，不显示轨迹。
- 与本地子智能体共用并发上限、事件、后台登记、通知和 `task_*`；应用退出时杀进程，重开后补 `lost`。

| | Codex | Claude Code |
|---|---|---|
| 启动 | `codex app-server`，stdio 上的 JSON-RPC：`initialize` → `thread/start` → `turn/start` | `claude -p --output-format stream-json --verbose --session-id <uuid> --permission-mode <模式>`，`prompt` 走 stdin |
| 记录路径 | `thread/start` 返回的 `thread.path`。开**非临时**线程（`ephemeral: false`），临时线程不留记录 | ActSpace 先生成 `session_id`，启动前就知道路径：`~/.claude/projects/<编码后的 cwd>/<session_id>.jsonl`，编码是把真实路径里非字母数字的字符换成 `-` |
| 最终回复 | 最后一条 `agentMessage` | `type: "result"` 的 `result`，`is_error` 决定成败 |
| 停止 | `turn/interrupt`，2 秒没结束就杀进程 | `SIGTERM`，2 秒后 `SIGKILL` |

Codex 服务端发来的请求（审批、向用户提问等）一律拒绝；默认的 `approvalPolicy: never` 下不会有审批请求，这是防用户改了设置。

工具返回前最多等 10 秒让记录文件出现，这样路径能登记进活跃路径；超时仍返回路径并注明文件还不存在，这次不登记。CLI 启动失败（没装、没登录、进程退出、启动超时）直接返回工具错误，不登记子智能体；运行中失败（退出码非 0、流里报错）是 `failed`，summary 带 CLI 的错误首行。

## 生命周期

- 创建：检查不过（调用方不是主会话、模型或档位不可用、到了并发上限、fork 找不到边界）或子会话建不起来，直接返回工具错误，不写 `subagent/*` 事件。
- 同步等待最多 30 分钟，之后转后台继续跑（登记进后台任务登记表）；后台激活没有时长上限（可 `task_stop`）；单次激活最多 1000 步。
- 收尾：子会话的循环停稳后，主会话写 `settle` 并落盘，transcript 头部更新为终态，然后才交付（同步调用返回，或登记表发通知）。同步调用返回时，子会话、Scope 和运行租约都已释放。
- 停止：`task_stop`（后台）或用户在「子 Agent」面板停止。后台的都走登记表：`task_stop` 不再通知，用户停止则模型下一步被告知是用户停的（不唤醒）；同步的由面板直接中断，父会话那次调用返回被用户停止的结果。
- 用户停止主会话这一轮：同步等待中的子智能体一起中断，后台的不受影响。
- 编辑重发回退：主会话的子智能体全部停掉，已登记的走登记表 `stop(…, "rewind")`，不通知，`delivery: "lost"`。
- 退出：先关登记表（停掉后台任务，不写结果），再关管理器；退出造成的结束不写事件。重启打开会话时，登记表对账：后台子智能体标 `lost` 并通知主会话（不唤醒）；管理器的 `recoverLost` 只给子智能体树补写 `lost`。`lost` 的子智能体不能继续，要继续就开新的。
- 子会话照旧不向界面发 `session/event`，右侧「子 Agent」面板从父会话 Journal 与子会话投影读取。

## 界面

对话卡片、右侧「子 Agent」面板和「后台任务」面板见 [front-子Agent与后台任务规范](../frontend/front-子Agent与后台任务规范.md)；「子智能体默认模型」见 [front-设置页规范](../frontend/front-设置页规范.md)的「模型 › 用途」与「子 Agent」。两个外部插件的设置项定义在 `apps/desktop/src/renderer/components/extensions/plugin-settings.ts`，存在 `settings.tools.externalSubagents`。

## 排除的方案

- **保留 `explore` 工具，或加 `plan` 预设**：一个工具加预设就够；`plan` 模式下创建的 `general` 已经只读。
- **续派、`wait_agent`、`list_agents`、`interrupt_agent`、`task_wait`**：子智能体是临时上下文窗口，不管生命周期。
- **另写一份留痕文件**：transcript 就是留痕。
- **结构化输出、ACP**：没有调用方。
- **嵌套委派**：深度固定 1。
- **把控制权交给子智能体（handoff）、常驻的自主 Agent、Workflow / DAG 编排**：子智能体只是一次有终点的委派。
- **fork 时把委派工具从工具列表里删掉**：工具列表一变就用不上父会话的缓存。
- **把「后台任务」和「子 Agent」两个面板合并**：子 Agent 面板要看轨迹，和 Bash 输出差别大。

## 已知边界

- 真实模型下 fork 的缓存命中、Electron 里的完整流程（含外部子智能体免审批读取）尚未实机验收。
- Claude Code 对很长的目录名会截断加哈希，路径编码没有照做，路径可能对不上。
- Host 被强杀时外部 CLI 子进程可能残留，下次启动只补 `lost`，不清理进程。
- 本机 `codex` 命令若是损坏的安装，登录 shell 会先找到它，导致启动失败，需用户自行修复。
