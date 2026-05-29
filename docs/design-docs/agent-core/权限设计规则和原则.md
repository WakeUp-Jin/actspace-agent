# Agent 权限设计规则和原则

## 当前状态

状态：设计原则草案，作为后续工具权限审核面板和 Bash 工具权限流程的事实来源。

相关实施计划：

- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/exec-plans/completed/actspace-tool-permission-scheduler-plan.md`
- `docs/exec-plans/completed/actspace-bash-tool-plan.md`
- `docs/exec-plans/completed/actspace-bash-approval-ui-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md`
- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md`

## 设计目标

Agent 可以替用户执行本地工具，但用户必须始终知道高风险动作是什么、为什么要做、会影响哪里，并能在关键点暂停、批准、拒绝或收窄授权。

权限系统的目标不是把 Agent 变成不能行动的只读助手，而是给 Agent 一个可解释、可恢复、可审计的行动边界。

## 核心原则

### 1. 权限是调度层能力，不是单个工具的私有逻辑

每个工具可以提供自己的 `checkPermissions`，用于参数清洗、风险识别和硬拒绝。但“是否需要用户审核”“审核如何暂停和恢复”“审核结果如何记录”必须由统一的工具调度层负责。

这样可以避免 Bash、Edit、Write、网络工具各自实现一套审批流程，导致状态、UI 和日志无法统一。

### 2. 工具先验证，再请求审核，最后执行

一次非只读工具调用应遵循稳定状态机：

```text
validating -> awaiting_approval -> scheduled -> executing -> success/error/cancelled
```

状态含义：

- `validating`：解析参数，调用工具自身 `checkPermissions`，生成清洗后的参数、风险等级和说明。
- `awaiting_approval`：调度层发现该调用需要用户决策，暂停执行并向 UI 发出审核请求。
- `scheduled`：权限已满足，进入执行队列。
- `executing`：调用工具 executor。
- `success/error/cancelled`：以结构化结果结束，回填给 Agent 上下文。

任何状态变化都应该有稳定的 `toolCallId` 和时间戳，避免重复执行和恢复丢失。

### 3. 只读优先自动化，写入与外部影响默认可审核

工具必须声明 `isReadOnly`。

- 只读工具默认不需要审核，可以并行执行。
- 非只读工具默认进入审核策略判断。
- 写类工具（`write_file` / `edit_file` / `bash`）的路径必须经 `guardWorkspacePath` 守卫，越过工作区边界即拒绝。

只读不是“绝对安全”的代名词，它只是调度策略的一个输入。

**读边界放开（2026-05-29）**：读取类工具（`read_file` / `grep` / `glob` / `list_directory`）已**主动放开 workspace 边界**，改用 `resolveReadablePath`（只解析、不越界检查）。这是为支持上下文压缩——模型要回读 `<userData>/tmp` 的 bash 落盘文件与 `<userData>/sessions` 的完整历史（见 `context-compression.md`「读边界放开」）。代价是主 Agent 理论上可读任意本机文件，后续以「敏感路径 blocklist + 按需读审核」收口（`tech-debt-tracker.md`），而非恢复硬边界。Kairos 调用路径不受影响，仍在 scheduler 层按 `allowedRoots + blocklist` 双校验。

### 4. 硬拒绝和可审核风险必须分开

权限验证结果至少要区分两类风险：

- 硬拒绝：明显危险、无法解释或无法安全解析的调用。例如空命令、控制字符、Unicode 伪空白、危险删除系统路径、不可解析参数。
- 可审核：存在副作用但意图清楚、范围可见、用户可以做出有效判断的调用。例如运行测试、安装依赖、修改工作区文件、执行明确前缀的命令。

硬拒绝不应该进入审核面板，因为用户无法从 UI 中安全补救这类输入。审核面板只处理“用户能理解并授权”的动作。

### 5. 审核请求必须面向人类可判断

审核面板显示的不是原始 JSON 参数堆，而是可读的行动摘要。

每个审核请求至少包含：

- 工具名和动作类型。
- 人类可读说明。
- 影响范围，例如工作目录、目标文件、命令前缀、外部域名。
- 风险原因。
- 原始参数的可展开详情。
- 可执行的用户动作：允许一次、拒绝、允许本会话内相似操作。

对于 Bash，摘要应优先呈现“命令执行说明 + 前缀简写”，展开后再显示完整命令和输出。

### 6. 授权必须窄、可见、可撤销

“允许相似操作”只能在会话级生效，首版不做全局永久授权。

允许规则必须尽量窄：

- Bash：按工具名、命令前缀、工作目录和风险规则组合匹配。
- 文件写入：按工具名、工作区内路径范围和操作类型匹配。
- 网络工具：按工具名、域名和方法匹配。

UI 必须让用户看见当前授权来自哪条规则。后续应提供撤销入口。

### 7. Renderer 只做审核交互，不获得执行能力

Electron renderer 不能直接执行工具、访问文件系统或读取密钥。

审核流程中：

- `agent-core` 负责工具状态机、权限结果和执行。
- `main` 负责连接 Agent runtime、session、IPC 和本地持久化。
- `preload` 只暴露最小、类型化的审核 API。
- `renderer` 只展示审核请求并提交用户决策。

用户点击允许后，仍由 main/agent-core 恢复执行，而不是 renderer 执行工具。

### 8. 审核等待必须可取消、可超时、可恢复

Agent loop 进入 `awaiting_approval` 后不能忙等，也不能无限悬挂。

首版规则：

- 用户拒绝后，工具调用以 `cancelled` 结束，Agent 收到清晰的取消结果。
- 用户长时间无响应后，工具调用以 `cancelled` 或 `expired` 结束。
- 同一个审核请求的重复 approve/deny 必须幂等。
- 会话切换、窗口刷新或进程恢复时，不能静默继续执行曾经等待审核的高风险工具。

### 9. 权限记录要可审计，但默认避免泄露敏感信息

审核事件应写入 session 或本地运行日志，至少记录：

- `toolCallId`
- 工具名
- 状态变化
- 风险原因
- 用户决策
- 决策时间

日志不应默认记录密钥、完整环境变量或不可公开的长输出。Bash 命令和工具参数可能包含敏感片段，后续需要接入脱敏规则。

### 10. 工具输出进入上下文前必须裁剪

权限审核解决“能不能执行”，不解决“执行结果是否适合完整回填”。

工具执行成功后，输出仍应经过 render result 和 OutputTruncator，再进入 LLM 上下文。大输出应保留头尾、生成摘要或写入临时文件供按需读取，避免污染上下文和拖垮后续推理。

具体策略见 `context-compression.md`：非 bash 工具走 flash 摘要（失败时退化为头尾确定性截断），bash 工具走「流式落盘 + 头部截断 + 文件路径回填」，被裁剪的输出都带显式压缩/截断标记并告知模型如何回读完整内容。

## Bash 权限特别规则

Bash 是首个需要权限系统完整设计的高风险工具。

首版 Bash 应遵守：

- `checkPermissions` 和 executor 分离。
- 空命令、控制字符、Unicode 伪空白直接拒绝。
- `rm/rmdir` 关键路径和通配符删除直接拒绝。
- `eval/source/exec` 等 eval-like 调用默认拒绝，只有精确安全例外可以放行。
- timeout 参数必须清洗到安全范围。
- 只读命令可自动通过，但要按子命令细分，例如 `git status` 与 `git push` 不能等价。
- 多段命令需要逐段检查，不能只看第一段。

Bash UI 应和普通工具执行消息保持一致：未展开时像 Read 一样是轻量行；展开后只有一个命令输出容器，里面展示具体命令和输出，不再嵌套第二层命令框。

## 被排除的方案

- 不在每个工具组件里单独实现审批状态机。
- 不让 renderer 执行工具或持有执行权限。
- 不做首版全局永久授权。
- 不把硬拒绝命令交给用户点“继续执行”。
- 不用纯黑名单代替权限模型。
- 不把大段工具输出不裁剪地回填到上下文。

## 从本设计派生计划的规则

任何权限相关 execution plan 都必须写清：

- 消费本设计中的哪些原则。
- 是否新增或修改 shared 契约。
- 哪些工具状态会持久化。
- 用户可以做哪些审核动作。
- 如何处理拒绝、超时、重复决策和会话恢复。
- 如何验证 renderer 不具备直接执行能力。
- 如何验证敏感信息不会进入 UI、session 或日志的不合适位置。
