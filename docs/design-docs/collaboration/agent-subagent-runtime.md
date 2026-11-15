# 子智能体运行规范

> 设计依据与逐字的模型可见文字见 [子智能体和后台任务设计规范](../子智能体和后台任务设计规范/README.md)（[01 决策](../子智能体和后台任务设计规范/01-设计决策.md)、[02 子智能体](../子智能体和后台任务设计规范/02-子智能体设计规范.md)、[04 外部子智能体](../子智能体和后台任务设计规范/04-外部子智能体设计规范.md)、[05 界面与设置](../子智能体和后台任务设计规范/05-界面与设置设计规范.md)）。本文只写现状的结构与边界，不重复每一句工具描述。

公共契约见 [`agent-spec-agent-and-subagent.md`](../agent-plugin-runtime/agent-spec-agent-and-subagent.md)，实现位于 `packages/subagent/`（包表见 [`packages/subagent/README.md`](../../../packages/subagent/README.md)）。

## 定位

子智能体是主会话派出的、在自己子会话里工作的 Agent。`agent_id` 就是子会话 ID。定位是主智能体的「临时上下文窗口」：做完就结束，不管理生命周期，需要时再开一个。参考 DeepSeek Harness 的运行模型（可写、预设与模型可选），再加 ActSpace 自己的「留痕」：子会话 transcript 路径全程交给主智能体，并进入上下文的活跃 / 睡眠路径。

子智能体默认同步（等结果）、不续派、可写；没有单独的 `explore` 工具，它是 `agent` 的只读预设。

## 工具

主会话（`agent` 模式）有四个子智能体工具，所属插件 `actspace.subagent`；`plan` 模式只有 `agent`、`agent_fork`、`list_subagent_models`，`chat` 模式没有。

| 工具 | 作用 |
|---|---|
| `agent` | 创建子智能体。参数 `description`、`prompt`、`agent_preset`（`general` / `explore`）、`background`（默认 `false`）、`model`（描述里带选模型引导）、`reasoning_effort`。同一步里的多个同步调用并行（`declared-safe`） |
| `agent_fork` | 创建继承当前会话上下文的子智能体，沿用父的工具与模型（没有 `agent_preset`） |
| `send_message` | 只有两个方向：主会话给自己**运行中**的子智能体插话；子智能体给父会话发消息（父会话空闲则唤醒）。兄弟之间不能互发；发给已结束的返回错误，提示开新的。描述写明用法约束：只补充事实或纠正目标，不要催它停下或交结果 |
| `list_subagent_models` | 列出设置里可用的模型与思考档位；不写进工具描述，避免模型列表变化破坏 prompt cache |

没有 `wait_agent`、`list_agents`、`interrupt_agent`：要结果用同步调用；转后台的子智能体用后台任务工具 `task_list` / `task_output` / `task_stop` 管理（`taskId` 就是 `agent_id`，见[后台任务](agent-background-tasks.md)）。

另有两个默认关闭的外部插件工具 `agent_codex`、`agent_claude_code`，见下文「外部子智能体」。

## 状态与事件

主会话 Journal 里只有两类事件，所有状态（列表、并发计数、面板）都从它们折叠出来（`@actspace/shared/runtime-v2` 的 `foldSubagentTree`），不另存：

- `subagent/spawned`：创建时一次，含 `agentId`、`callId`、`kind`、`preset`、`description`、`transcriptPath`、创建时固定的 `toolNames`，fork 另有 `inheritedThroughSeq`；
- `subagent/activation`：激活的 `start` 与 `settle`。每个子智能体只有一次激活（`trigger: "spawn"`），不续派。

状态：`running`、`closed`（已结束，不能再给它任务或消息）。`settle` 的 `delivery` 为 `returned`（同步返回）、`notified`（后台任务登记表通知）、`stopped`（`task_stop` 或用户停止，停止结果就是交付）、`lost`（重启补记、编辑重发回退，没有人被告知）。

老会话的 `delegation/*`、旧格式 `background/task` `kind: "agent"`、`subagent_notification`、`trigger: "message"`、`delivery: "wait"` 事件编解码器保留，只读显示，不转换；老会话里 `inactive` 的子智能体按已结束显示；老会话的统计继续读 `delegation/*`。

## 后台登记

后台子智能体（`background: true`，或同步等满 30 分钟后）登记进后台任务登记表（`BackgroundTaskRegistry`）：`kind: "agent"`，`taskId = agentId`，带 transcript 路径和种类标签；输出是 transcript 尾部，停止就是中断激活。登记表统一负责完成通知、`task_*` 工具、重启后标 `lost`；子智能体管理器只负责跑子会话。同步调用不登记（父会话正在等它）。

## 子会话

子会话是普通的 v2 Session：`sessions-v2/<agent_id>/journal.jsonl`，头部 `lineage` 为 `origin: "delegation"`、`parentSessionId`、`parentCallId`、`delegationDepth: 1`（fork 另有 `inheritedThroughSeq`）。不能当作主会话通过恢复入口续跑，也不接受主会话的任务调度（AgentService 对子会话只读快照，不打开、不占写锁）；子会话由管理器自己按激活路径取运行租约和 Ledger 来跑。工具集在创建时固定，保持子会话提示词前缀稳定。

## 能力与权限

| 预设 | 工具 |
|---|---|
| `general` | 父会话创建时所在模式允许的工具，去掉委派类、`task_*`、`present`、`plugin_manager`、`harness_inspect` 等；加上 `send_message`。可写文件、跑命令 |
| `explore` | `read_file`、`list_directory`、`grep`、`glob` 加 `send_message` |
| fork | 与父会话完全相同的工具列表（为了命中缓存）；不该用的在执行时拦下，返回 `Subagents cannot use <name>.` |

- 深度固定 1：子会话里委派工具执行时被拦。每个主会话最多 10 个**正在运行**的子智能体（同步加后台、含外部）；后台 Bash 另有 5 个的上限，两者分开计。
- 子智能体**不弹审批**：工具环境没有审批代理，需要审批的操作直接失败，返回「需要用户批准，子智能体无法请求」的说明文字。权限模式每次激活从父会话读取并写进子会话；会话授权只读父会话的（工具环境的 `sessionGrantOwner` 指向父会话主智能体），不能新增；沙箱照常。
- 子会话里的 Bash 不转后台，最多 10 分钟，超时报 `BASH_TIMEOUT`。
- 在 `plan` 模式下创建的 `general` 只拿到 `plan` 模式的工具，天然只读。

## 模型

一次激活的模型：调用参数 `model` > 设置 `subagentDefaultModel` > 父会话当前的模型与思考档位。设置只有这一项，第一项「跟随主智能体」；旧的 explore 用途（`taskModels.exploreModel` 等）已删除，旧值不迁移，设置 schema 的 `layersVersion` 升到 3。默认模型不可用时退回跟随父会话。`agent_fork` 不给 `model` 时用父会话的模型与档位，不读这项设置。

## 留痕与通知

- **transcript**：就是子会话自己的 `sessions-v2/<agent_id>/transcript.md`，不另写一份；启动时先写出头部，此后每走完一步增量重写，细节见[会话记录 Markdown](../agent-runtime/agent-session-transcript.md)。路径在四处交给主智能体：同步结果、后台启动返回、`task_list`（后台子智能体）、完成通知。读取免审批。
- **活跃路径**：`agent` / `agent_fork` 的工具结果带 `actspace.context.trace`，上下文引擎登记成活跃路径，之后照常按「一个压缩周期内没读过就转入睡眠」处理。
- **完成通知**：后台子智能体结束时，由后台任务登记表给主会话收件箱放 `<task_notification>`（`<kind>agent</kind>`，来源 `task_notification`，通知类型 `subagent`），带状态、一句 summary、`<description>`、`<transcript>` 路径和最多 8KB 的结论 `<closing_message>`（原文不转义）；主会话空闲则唤醒。`task_stop` 与用户停止不发完成通知。子智能体发给父会话的消息是 `<agent_message>`（来源 `agent_message`）。
- **运行中清单**：运行中的后台子智能体和后台 Bash 一起列在 [`context-background-tasks`](../../../packages/context/context-background-tasks) 每轮写的清单里（带 transcript 路径），压缩或重启后模型仍知道谁在跑；同步子智能体不进清单。`context-subagents` 已删除。fork 不带这段。
- 任务消息末尾追加固定说明：最终回复只写结论和关键证据，不能向用户提问或请求审批，并行的写任务各改各的文件。

## Fork

`agent_fork` 复用侧边对话的复制机制：按边界把父会话事件原样复制进子会话（seq 不变），边界是本轮里最后一个完整的步骤（只去掉包含 fork 调用的那一步），再追加 `turn/end`（`reason: "forked"`）。子智能体看到的是父模型当时看到的上下文，系统提示词、工具、模型都与父会话相同，所以第一次请求能命中父会话的 prompt cache（进程测试用录制型 fake LLM 逐项比对过）。真实模型上的缓存命中还没在 Electron 里验过。

## 外部子智能体

`@actspace/subagent-codex`（`agent_codex`）、`@actspace/subagent-claude-code`（`agent_claude_code`）是两个**默认关闭**的会话插件，在 扩展 › 插件 里开启（标题分别是「Codex 子智能体」「Claude Code」）。

- 用本机已装的 CLI（登录 shell 里 `command -v` 找，找不到就不注册工具），不打包可执行文件；
- 一次调用就是一个进程、一轮，**不续聊**，结束后状态 `closed`；`send_message` 给它返回错误；`background` 默认 `false`；
- 用 CLI **自己的权限与模型设置**，不走 ActSpace 的审批和沙箱（开启插件就是授权）；Codex 默认 `approvalPolicy: never`、`sandbox: workspace-write`，Claude Code 默认 `permissionMode: dontAsk`，在插件设置里改；
- 不另存留痕，返回 CLI 原生的会话 JSONL 路径（Codex 的 rollout 文件、`~/.claude/projects/…/<id>.jsonl`），这个文件按精确路径免审批读取，每次从主会话的子智能体投影判断，重启后无需恢复；
- 与本地子智能体共用并发上限、事件、后台登记、通知和 `task_*`；应用退出时杀进程，重开后补 `lost`。

CLI 启动失败（没装、没登录、进程退出、启动超时）直接返回工具错误，不登记子智能体。

## 生命周期

- 同步等待最多 30 分钟，之后转后台继续跑（登记进后台任务登记表）；后台激活没有时长上限（可 `task_stop`）；单次激活最多 1000 步。
- 停止：`task_stop`（后台）或用户在「子 Agent」面板停止。后台的都走登记表：`task_stop` 不再通知，用户停止则模型下一步被告知是用户停的（不唤醒）；同步的由面板直接中断，父会话那次调用返回被用户停止的结果。
- 用户停止主会话这一轮：同步等待中的子智能体一起中断，后台的不受影响。
- 编辑重发回退：主会话的子智能体全部停掉，已登记的走登记表 `stop(…, "rewind")`，不通知，`delivery: "lost"`。
- 退出：先关登记表（停掉后台任务，不写结果），再关管理器；退出造成的结束不写事件。重启打开会话时，登记表对账：后台子智能体标 `lost` 并通知主会话（不唤醒）；管理器的 `recoverLost` 只给子智能体树补写 `lost`。`lost` 的子智能体不能继续，要继续就开新的。
- 子会话照旧不向界面发 `session/event`，右侧「子 Agent」面板从父会话 Journal 与子会话投影读取。

## 界面

对话卡片、右侧「子 Agent」面板、设置与插件页的行为见[设计 05](../子智能体和后台任务设计规范/05-界面与设置设计规范.md)。后台 Bash 见[后台任务](agent-background-tasks.md)。

## 已知边界

- 真实模型下 fork 的缓存命中、Electron 里的完整流程（含外部子智能体免审批读取）尚未实机验收。
- Claude Code 对很长的目录名会截断加哈希，路径编码没有照做，路径可能对不上。
- Host 被强杀时外部 CLI 子进程可能残留，下次启动只补 `lost`，不清理进程。
- 本机 `codex` 命令若是损坏的安装，登录 shell 会先找到它，导致启动失败，需用户自行修复。
