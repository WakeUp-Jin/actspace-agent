# 后台任务：后台 Bash、后台子智能体与任务工具

> 设计依据见 [03 后台 Bash 设计规范](../子智能体和后台任务设计规范/03-后台Bash设计规范.md) 与 [01 决策](../子智能体和后台任务设计规范/01-设计决策.md)；实现记录见[执行过程](../../exec-runs/20261103-subagent-background-redesign/execution-process.md)。
>
> 登记表里有两种任务：后台 Bash（`kind: "bash"`）和后台子智能体（`kind: "agent"`，`taskId` 就是 `agent_id`）。子智能体自己的管理器、工具和事件见[子智能体运行规范](agent-subagent-runtime.md)；以后的生图、workflow 也按同样方式接入登记表。

## 要解决什么

1. 命令太久会转后台，但完成通知不能只躺在收件箱里等用户下次开口：Agent 要被叫醒。
2. Agent 需要统一的方式查看、停止后台命令和后台子智能体，并且在上下文压缩或隔了很久之后仍知道哪些在跑。
3. 日志要留得住：以前后台日志在临时目录，应用退出就删；现在随会话保留，路径交给模型并登记进活跃路径（留痕）。

## 结构

```text
Harness 侧                                   Host 侧
┌─────────────────────────────┐          ┌──────────────────────────────────┐
│ shell-tools: bash           │─register▶│ BackgroundTaskRegistry            │
│ subagent: 后台子智能体      │─register▶│                                   │
│ background-tasks: task_*    │─query───▶│  list / output / stop             │
│ context-background-tasks    │─list────▶│  通知去重 → 主 Agent 收件箱       │
└─────────────────────────────┘          │  journal: background/task 事件    │
                                         │  唤醒 → AgentService.wake()       │
                                         └──────────────────────────────────┘
```

- `BackgroundTaskRegistry`（`@actspace/background-tasks`）纯逻辑，每个会话一份视图；`kind` 为 `bash` 或 `agent`。任务来源（`BackgroundTaskSource`）自带 `done`、`output`、`stop`；子智能体来源还带 transcript 路径和种类标签。登记表统一负责完成通知、重启后标 `lost`、`task_*`；各来源只管自己怎么跑。所有查询带调用方 `sessionId`，跨会话返回 `TASK_NOT_FOUND`。作为 Host 端口 `actspace.host.background-tasks` 提供。
- `background/task` 事件有 `start`、`settle`、`prune` 三种 `op`。`settle` 的 `delivery` 记录结果怎么交给模型（`notified`、`stopped`、`lost`；`wait` 只在老会话里读到）。老会话里不带 transcript 路径的旧格式 `kind: "agent"` 记录只读，不参与对账，老会话的后台子智能体由 `delegation/*` 显示。
- 重启：会话打开时对账，有 `start` 没有 `settle` 的任务（含带 `transcriptPath` 的 `kind: "agent"`）补写 `lost` 并提醒模型（不唤醒）；子智能体的通知是 `Subagent <id> (<description>) was interrupted because the app exited. Its transcript shows how far it got; start a new subagent if the work still needs doing.`；子智能体管理器的 `recoverLost` 只给子智能体树补写 `lost`，不再通知。
- 并发：后台 Bash 最多 5 个，子智能体最多 10 个（同步加后台），分开计数。

## 日志（留痕）

| 项 | 规则 |
|---|---|
| 位置 | `sessions-v2/<sessionId>/bash-log/bash_<uuid>.log`；子智能体跑的 Bash 在子会话目录下。命令启动时分配的 `bash_<uuid>` 转后台后就是 `taskId` |
| 谁写 | ActSpace 进程从 stdout / stderr 追加写，单文件 5MB 上限，目录 `0700`、文件 `0600` |
| 读取 | 这个文件名格式的日志读取免审批；`bash-log` 目录本身不放行（判定在 `session-transcript` 的 `isBashLogReadPath`） |
| 前台命令 | 在 `blockMs` 内结束，结果生成后立即删日志（超过 8000 字的完整输出先复制成会话 artifact） |
| 转后台 | 日志保留，跟会话走，应用退出也不删；退出时进程被杀，重开后任务 `lost`，日志仍可读 |
| 单会话上限 | `bash-log/` 合计超过 50MB 时，从最早**已结束**的后台日志开始删，运行中的不删；写 `background/task` `prune`，`task_output` 与 transcript 标注 `log pruned` |

沙箱里命令的 `TMPDIR` 仍在系统临时目录 `<tmpRoot>/bash-v2/<进程随机目录>/`。Harness 卸载只删这个目录；崩溃残留的、不属于当前进程且超过 1 天的目录在下次启动时清掉。

转后台的 `bash` 结果带 `actspace.context.trace`，日志因此进入上下文的活跃路径（与子智能体 transcript 同一机制）。每个会话同时运行的后台 Bash 最多 5 个。子会话里的 Bash 不转后台。

## 工具

插件 `packages/background-tasks/tool-background-tasks`，权限一律 allow，`plan` 与 `agent` 模式都有。同时管 Bash 与后台子智能体，`taskId` 是 `bash_…` 或子智能体的 `agent_id`。

| 工具 | 作用 |
|---|---|
| `task_list` | 列出本会话的后台任务（Bash 与后台子智能体，子智能体带 transcript 路径），默认只列运行中的 |
| `task_output` | Bash：输出最后 32KB 与日志路径；参数 `since`（字节偏移，≥0，只对 Bash）只返回该位置之后的新内容（按 UTF-8 边界对齐），末尾写 `log_size`、`next_offset`。子智能体：transcript 尾部；描述写明一般不需要它（结束会通知，补充信息用 `send_message`），不在代码里拦 |
| `task_stop` | Bash：杀掉命令；子智能体：终止它（不能再继续）。返回的状态就是结果，之后不再发完成通知；已结束的返回当前状态 |

没有 `task_wait`：要结果就同步调用，或等完成通知。工具描述强调：完成会自动通知，不要靠 sleep 或反复 `task_output` 轮询。

## 通知与唤醒

- `<task_notification>` 是所有后台任务的完成通知，`<kind>` 为 `bash` 或 `agent`。Bash：`<summary>` 后带 `<output_path>`，结束时也把日志路径交给模型；超时转后台、完成通知内联输出尾部、`notifyOnOutput` 匹配通知保持不变。子智能体：带 `<description>`、`<transcript>` 和原文的 `<closing_message>`（格式见[设计 02 §6.2](../子智能体和后台任务设计规范/02-子智能体设计规范.md)）。收件箱来源 `task_notification`，通知类型：Bash 为 `bash`，子智能体为 `subagent`。
- 去重：`task_stop` 停掉的任务不再发通知，已入收件箱但未读的通知会被丢弃；`task_output` 只读，不改通知状态。用户在界面停止（`stopByUser`）同样不发完成通知，改为在模型下一步告知「用户停了它」（状态 `stopped`，不唤醒）。编辑重发回退用 `stop(…, "rewind")`，不通知。
- 唤醒：回合内收件箱有待读通知时不结束回合（仍受 `maxSteps` 约束）；回合被中断或失败时通知留到下次 Run；会话空闲时 Host 提交一个 `{ kind: "background-wake" }` 任务开新一轮（不写 `user/message`，第一步什么都没领到就直接结束、不调模型）。暂停中的会话不唤醒。
- 用户停止主会话不停止后台任务；Host 关闭时先关登记表，停止全部后台任务且不写结果（`host-shutdown`），重启后标 `lost`；之后才关子智能体管理器。关闭前一刻已经结束、通知和收尾记录还在写的任务，登记表等它写完才返回：Host 随后就关会话，只写了通知、没写收尾记录的任务重启后会再被标一次 `lost`。

## 上下文清单

`packages/context/context-background-tasks` 只对主 Agent 生效：每轮开始写一次「仍在运行的后台任务」清单（写绝对开始时间）；曾有过清单、现在全部结束则写 `No background tasks are running.`；从未有过则不写。清单列 Bash 与运行中的后台子智能体（带种类标签和 transcript 路径）；同步子智能体父会话正在等它，不进清单。原来单独的 `context-subagents` 已删除。

## 界面

- Bash 卡片只多一个「后台」标签，状态取 `background/task` 的 `settle`。
- Bash 通知在聊天里是一行细分隔行，可展开看通知原文：空闲唤醒的那一轮以它开头；运行中读到的留在这一轮里读到的位置，不另开一轮（领取事件只在开轮时写 `opensTurn: true`）。后台子智能体的完成通知（通知类型 `subagent`）不显示，结果看派发卡片；子智能体来信是来信卡片，见 [front-子Agent与后台任务规范 §2.1](../frontend/front-子Agent与后台任务规范.md#21-主会话里的子智能体)。
- 右侧「后台任务」面板只显示 Bash；后台子智能体只在「子 Agent」面板（面板的停止按钮对已登记的走 `stopByUser`）。

## 排除的方案

- 只靠通知、不给模型工具：用户确认要 list / output / stop（`wait` 在 2026-11-12 删除，要结果就同步调用）。
- 在代码里禁止 `task_output` 读子智能体：太严，描述约束就够。
- 用 synthetic user 消息直接作为唤醒 Run 的输入：会进聊天记录且与「任务通知不进聊天」的投影冲突。
- 每一步更新任务清单：与工具结果、完成通知重复，增加上下文开销。
