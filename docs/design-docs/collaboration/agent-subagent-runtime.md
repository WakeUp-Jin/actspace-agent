# 子智能体运行规范

> 状态：已实施（2026-11-04，分支 `feat/subagent-background-redesign`，S1–S6；界面见 [05 界面与设置](../子智能体和后台任务设计规范/05-界面与设置设计规范.md)）。设计依据与逐字的模型可见文字见 [子智能体和后台任务设计规范](../子智能体和后台任务设计规范/README.md)（[01 决策](../子智能体和后台任务设计规范/01-设计决策.md)、[02 子智能体](../子智能体和后台任务设计规范/02-子智能体设计规范.md)、[04 外部子智能体](../子智能体和后台任务设计规范/04-外部子智能体设计规范.md)）；实际做了什么、与设计不同的地方见[执行过程](../../exec-runs/20261103-subagent-background-redesign/execution-process.md)。本文只写现状的结构与边界，不重复每一句工具描述。

公共契约见 [`agent-spec-agent-and-subagent.md`](../agent-plugin-runtime/agent-spec-agent-and-subagent.md)，实现位于 `packages/subagent/`（包表见 [`packages/subagent/README.md`](../../../packages/subagent/README.md)）。

## 定位

子智能体是主会话派出的、在自己子会话里工作的 Agent。`agent_id` 就是子会话 ID。参考 DeepSeek Harness 的运行模型（默认后台、可续聊、可写、预设与模型可选），再加 ActSpace 自己的「留痕」：子会话 transcript 路径全程交给主智能体，并进入上下文的活跃 / 睡眠路径。

旧的一次性、只读、不能续聊的实现和 `explore` 工具已删除；原 `agent-explore-subagent.md` 随之退役，由设计 02 取代。

## 工具

主会话（`agent` 模式）有七个工具，所属插件 `actspace.subagent`；`plan` 模式只有 `agent`、`agent_fork` 和管理类工具，`chat` 模式没有。

| 工具 | 作用 |
|---|---|
| `agent` | 创建子智能体。参数 `description`、`prompt`、`agent_preset`（`general` / `explore`）、`background`（默认 `true`）、`model`、`reasoning_effort` |
| `agent_fork` | 创建继承当前会话上下文的子智能体，沿用父的工具与模型（没有 `agent_preset`） |
| `send_message` | 给运行中的子智能体插话；给空闲的续派一轮；子智能体也能发给父会话和兄弟 |
| `wait_agent` | 等新输入到来（完成通知、`agent_message`、用户消息） |
| `list_agents` | 列出子智能体树：id、状态、transcript 路径 |
| `interrupt_agent` | 停止当前这一轮，之后还能续派（只有主会话有） |
| `list_subagent_models` | 列出设置里可用的模型与思考档位；不写进工具描述，避免模型列表变化破坏 prompt cache |

另有两个默认关闭的外部插件工具 `agent_codex`、`agent_claude_code`，见下文「外部子智能体」。

## 状态与事件

主会话 Journal 里只有两类事件，所有状态（列表、并发计数、面板）都从它们折叠出来（`@actspace/shared/runtime-v2` 的 `foldSubagentTree`），不另存：

- `subagent/spawned`：创建时一次，含 `agentId`、`callId`、`kind`、`preset`、`description`、`transcriptPath`、创建时固定的 `toolNames`，fork 另有 `inheritedThroughSeq`；
- `subagent/activation`：每次激活的 `start` 与 `settle`。激活是子智能体的一轮工作：创建一次，之后每次 `send_message` 续派又一次。

状态：`running`、`inactive`（空闲，可续派）、`closed`（外部子智能体结束后不能续派）。`settle` 的 `delivery` 为 `returned`（同步返回）、`notified`（通知）、`lost`（重启补记）。

老会话的 `delegation/*` 和 `background/task` 的 `kind: "agent"` 事件编解码器保留，只读显示，不转换；老会话的统计继续读 `delegation/*`。

## 子会话

子会话是普通的 v2 Session：`sessions-v2/<agent_id>/journal.jsonl`，头部 `lineage` 为 `origin: "delegation"`、`parentSessionId`、`parentCallId`、`delegationDepth: 1`（fork 另有 `inheritedThroughSeq`）。不能当作主会话通过恢复入口续跑，也不接受主会话的任务调度（AgentService 对子会话只读快照，不打开、不占写锁），续派走管理器自己的冷恢复：重新打开子会话，补上未正常结束的 `turn/end`，再按首次激活的路径取运行租约和 Ledger。工具集沿用创建时固定的那份，保持子会话提示词前缀稳定。

## 能力与权限

| 预设 | 工具 |
|---|---|
| `general` | 父会话创建时所在模式允许的工具，去掉委派类、`task_*`、`present`、`plugin_manager`、`harness_inspect` 等；加上 `send_message`、`list_agents`、`wait_agent`。可写文件、跑命令 |
| `explore` | `read_file`、`list_directory`、`grep`、`glob` 加上面三个消息类工具 |
| fork | 与父会话完全相同的工具列表（为了命中缓存）；不该用的在执行时拦下，返回 `Subagents cannot use <name>.` |

- 深度固定 1：子会话里委派工具执行时被拦。每个主会话最多 10 个**正在运行**的子智能体（同步加后台、含外部，空闲的不算）。
- 子智能体**不弹审批**：工具环境没有审批代理，需要审批的操作直接失败，返回「需要用户批准，子智能体无法请求」的说明文字。权限模式每次激活从父会话读取并写进子会话；会话授权只读父会话的（工具环境的 `sessionGrantOwner` 指向父会话主智能体），不能新增；沙箱照常。
- 子会话里的 Bash 不转后台，最多 10 分钟，超时报 `BASH_TIMEOUT`。
- 在 `plan` 模式下创建的 `general` 只拿到 `plan` 模式的工具，天然只读。

## 模型

一次激活的模型：调用参数 `model` > 设置 `subagentDefaultModel` > 父会话当前的模型与思考档位。设置只有这一项，第一项「跟随主智能体」；旧的 explore 用途（`taskModels.exploreModel` 等）已删除，旧值不迁移，设置 schema 的 `layersVersion` 升到 3。默认模型不可用时退回跟随父会话。`agent_fork` 不给 `model` 时用父会话的模型与档位，不读这项设置，续派也一样。

## 留痕与通知

- **transcript**：就是子会话自己的 `sessions-v2/<agent_id>/transcript.md`，不另写一份；启动时先写出头部，此后每走完一步增量重写，细节见[会话记录 Markdown](../agent-runtime/agent-session-transcript.md)。路径在四处交给主智能体：同步结果、后台启动返回、`list_agents`、完成通知。读取免审批。
- **活跃路径**：`agent` / `agent_fork` 的工具结果带 `actspace.context.trace`，上下文引擎登记成活跃路径，之后照常按「一个压缩周期内没读过就转入睡眠」处理。
- **完成通知**：后台激活结束时，主会话收件箱收到 `<subagent_notification>`（来源 `subagent_notification`），带状态、一句 summary、transcript 路径和最多 8KB 的结论；主会话空闲则唤醒。子智能体之间或发给父会话的消息是 `<agent_message>`（来源 `agent_message`）。
- **运行中清单**：新上下文来源 [`context-subagents`](../../../packages/context/context-subagents) 每轮写一段「运行中的子智能体」清单，压缩或重启后模型仍知道谁在跑；没有运行中的就不写。fork 不带这段。
- 任务消息末尾追加固定说明：最终回复只写结论和关键证据，不能向用户提问或请求审批，并行的写任务各改各的文件。

## Fork

`agent_fork` 复用侧边对话的复制机制：按边界把父会话事件原样复制进子会话（seq 不变），边界是本轮里最后一个完整的步骤（只去掉包含 fork 调用的那一步），再追加 `turn/end`（`reason: "forked"`）。子智能体看到的是父模型当时看到的上下文，系统提示词、工具、模型都与父会话相同，所以第一次请求能命中父会话的 prompt cache（进程测试用录制型 fake LLM 逐项比对过）。真实模型上的缓存命中还没在 Electron 里验过。

## 外部子智能体

`@actspace/subagent-codex`（`agent_codex`）、`@actspace/subagent-claude-code`（`agent_claude_code`）是两个**默认关闭**的会话插件，在 扩展 › 插件 里开启（标题分别是「Codex 子智能体」「Claude Code」）。

- 用本机已装的 CLI（登录 shell 里 `command -v` 找，找不到就不注册工具），不打包可执行文件；
- 一次调用就是一个进程、一轮，**不续聊**，结束后状态 `closed`；`send_message` 给它返回错误；
- 用 CLI **自己的权限与模型设置**，不走 ActSpace 的审批和沙箱（开启插件就是授权）；Codex 默认 `approvalPolicy: never`、`sandbox: workspace-write`，Claude Code 默认 `permissionMode: dontAsk`，在插件设置里改；
- 不另存留痕，返回 CLI 原生的会话 JSONL 路径（Codex 的 rollout 文件、`~/.claude/projects/…/<id>.jsonl`），这个文件按精确路径免审批读取，每次从主会话的子智能体投影判断，重启后无需恢复；
- 与本地子智能体共用并发上限、事件、通知和 `list_agents`；应用退出时杀进程，重开后补 `lost`。

CLI 启动失败（没装、没登录、进程退出、启动超时）直接返回工具错误，不登记子智能体。

## 生命周期

- 同步等待最多 30 分钟，之后转后台继续跑；后台激活没有时长上限（可 `interrupt_agent`）；单次激活最多 1000 步。
- 用户停止主会话这一轮：同步等待中的子智能体一起中断，后台的不受影响。
- Host 关闭时先停子智能体、再停后台任务。重启打开会话时，有 `start` 没有 `settle` 的激活补写 `lost` 并通知主会话；`local` / `fork` 之后仍可续派，外部子智能体变 `closed`。
- 子会话照旧不向界面发 `session/event`，右侧「子 Agent」面板从父会话 Journal 与子会话投影读取。

## 界面

对话卡片、右侧「子 Agent」面板、设置与插件页的行为见[设计 05](../子智能体和后台任务设计规范/05-界面与设置设计规范.md)。后台 Bash 见[后台任务](agent-background-tasks.md)。

## 已知边界

- 真实模型下 fork 的缓存命中、Electron 里的完整流程（含外部子智能体免审批读取）尚未实机验收。
- Claude Code 对很长的目录名会截断加哈希，路径编码没有照做，路径可能对不上。
- Host 被强杀时外部 CLI 子进程可能残留，下次启动只补 `lost`，不清理进程。
- 本机 `codex` 命令若是损坏的安装，登录 shell 会先找到它，导致启动失败，需用户自行修复。
