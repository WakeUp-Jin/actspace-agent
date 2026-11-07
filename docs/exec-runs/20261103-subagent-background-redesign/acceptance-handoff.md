# 子智能体与后台任务改造验收交接

- **代码位置**：主仓库目录 `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent`，分支 `feat/subagent-background-redesign`。S1–S6 各一个本地提交，**未推送**。这次没有开 worktree。
- **计划**：`docs/exec-plans/completed/20261103-subagent-background-redesign/README.md`
- **设计**：`docs/design-docs/子智能体和后台任务设计规范/`（02 §10、03 §4、04 §6、05 §5 的验收表合在下面）
- **执行过程**：`execution-process.md`（同目录），与设计不同的地方都写在各步骤的「决定」里。
- **状态**：已完成（2026-11-04）。首轮 12 通过、5 失败、6 部分覆盖；三个缺陷修复后复验 X1/X4/X6/X8/X21 全部通过，合计 17 通过、0 失败、6 部分覆盖。逐点结果见 `acceptance-results.md`（原始记录已清理，见 git 历史） 和文末「修复后复验结果」；下文原始清单保留为覆盖依据。

## 约束

- 只验收，不改源码、测试或配置；不 `git commit` / `push`。
- 原生 Computer Use 与真实 Electron 的 Playwright/CDP 均可使用，按场景选择（用户 2026-11-04 补充）。结果里逐项写明实际方式，不能把自动化写成原生操作。
- 证据（截图、日志）放在 `tmp/codex-acceptance/20261103-subagent-background-redesign/`。截图文件名带编号，例如 `X4-second-round.png`。
- 启动方式按 `docs/FRONTEND_VERIFICATION.md`「Electron」一节：在仓库根运行 `pnpm dev`，Computer Use 用启动日志里 `[dev-runtime]` 给出的 `appName` / `appId`。需要模型连接，用用户已有的 DeepSeek 连接即可。

## 准备

- **外部 CLI**：本机 `/opt/homebrew/bin/codex` 是坏的（npm 包缺 vendor 二进制），登录 shell 会先找到它，Codex 插件会报启动失败。本轮只验收，不改 PATH 或 CLI 安装；先真实执行一次，记录环境错误和界面处理，成功链路记「未覆盖」。2026-11-04 复查插件使用的 `/bin/zsh -lc` 确实先找到该坏路径；nvm 下另一份 Codex 0.163.0 不代表插件实际调用成功。Claude Code 当前解析到 `/opt/homebrew/bin/claude`，版本 2.1.318，仍需真实插件执行。
- **插件开关**：扩展 › 插件里「Codex 子智能体」「Claude Code」默认关闭。开关和插件设置（Codex 审批策略 / 沙箱、Claude Code 权限模式）都是**重启应用后生效**，界面上分别提示「重启后开启」「设置已更改，重启后生效。」。
- **老会话**：本机已有的带 `agent` / `explore` 委派的老会话（`delegation/*` 事件）留着，X13 要用。

## 用户能感知到的变化

1. **对话卡片**：`agent` / `agent_fork` / `agent_codex` / `agent_claude_code` 都是同一种卡片，种类文字是「通用 / 探索 / Fork / Codex / Claude Code」，后台运行带「后台」标签，第二行是模型和最终回复首行；没有最终回复时写怎么结束的（「已中断」「中断（应用退出）」「达到步数上限」）。点卡片打开右侧「子 Agent」并选中它。
2. **管理工具行**：`send_message` 是一行「发消息给 ‹描述›」，展开看消息原文；`interrupt_agent` 是「停止 ‹描述›」；点描述打开该子智能体。`wait_agent` / `list_agents` / `list_subagent_models` 是「等待子智能体」「查看子智能体」「查看可选模型」。
3. **通知分隔行**：子智能体完成是「子智能体 ‹描述› 已完成 / 已中断 / 失败 / 达到步数上限 / 中断（应用退出）」，子智能体来信是「‹描述› 发来消息」。展开看结论或信的正文（不是原始 XML），下面有「打开子智能体」。
4. **右侧「子 Agent」面板**：一个子智能体一行，分「运行中 / 其他」两组；行内是状态（运行中 / 空闲 / 已中断 / 失败 / 已结束）、种类、模型、「第 N 轮」（>1 时）、开始时间；运行中的行有停止按钮。详情：本地和 Fork 有对话 / 轨迹切换，Fork 顶部写「从主会话 #N 分出」且只显示分出之后的内容；Codex / Claude Code 只有最终回复和原生记录文件（复制路径、在 Finder 中显示）。
5. **右侧「后台任务」面板**：只有 Bash。
6. **设置**：模型 › 用途多一行「子智能体」，默认「跟随主智能体」；设置 › 子 Agent 说明两个预设与并发上限 10，链接到模型设置。扩展 › 插件多两个外部子智能体插件，没装 CLI 时写不可用原因。
7. **轨迹与统计**：父轨迹里每次派出 / 续派各一行，指向同一个子会话；Harness 统计 › 运行按种类 / 预设统计子智能体次数与耗时。

浏览器 mock 截图（本地文件，`.png` 不进 git）：`screenshots/` 下 `u1`–`u6`，`-l-` 浅色、`-d-` 深色。mock 场景：`?mock=subagent-trajectory`、`?mock=background-tasks`。

## 请验收方执行

| # | 对应设计 | 步骤 | 预期 |
| --- | --- | --- | --- |
| X1 | A1、A3、U1 | 新会话里让主 Agent 同时派三个子智能体：一个探索（读 `packages/subagent/src` 总结工具）、一个通用后台（统计 `packages/` 下包数量）、一个 Fork（复核刚才的结论） | 三张卡片：描述、种类（探索 / 通用 / Fork）、「后台」标签；工具结果立即返回 id 和 transcript 路径；完成时逐个出现「子智能体 ‹描述› 已完成」分隔行，主会话空闲时被唤醒并继续回答 |
| X2 | A1、A2 | X1 进行中，让主 Agent 用 `read_file` 读某个子智能体的 transcript 路径 | 不弹审批；能看到已完成的步骤，进行中的工具写着 `→ running`；路径出现在 Context 面板「路径」里 |
| X3 | U1 | 展开一条完成通知，点「打开子智能体」 | 展开后是结论正文，不是 XML；右侧「子 Agent」打开并选中它 |
| X4 | A6、U2 | 对一个空闲子智能体让主 Agent `send_message` 追问 | 对话里一行「发消息给 ‹描述›」，展开有消息原文，点描述打开它；面板那一行显示「第 2 轮」；transcript 在原文件后追加 |
| X5 | U2 | 再派一个会跑久一点的通用后台子智能体，在面板列表点它的停止按钮；再派一个，进详情点底部「停止」 | 都变「已中断」；卡片「已停止 · 已中断」；主会话收到「子智能体 ‹描述› 已中断」 |
| X6 | A5 | 派通用子智能体在工作区写一个文件、跑一次 `ls`；再让它跑一个需要审批的命令（如工作区外写入） | 写入和 `ls` 成功；需要审批的命令直接失败，结果里说明原因，**不弹**审批窗 |
| X7 | A4 | 让主 Agent 用 `background: false` 派一个探索子智能体 | 卡片无「后台」标签；工具结果里直接带结论和 transcript 路径（30 分钟转后台不验） |
| X8 | A7 | 子智能体运行中退出应用，重新打开进入该会话 | 收到「子智能体 ‹描述› 中断（应用退出）」；卡片「已停止 · 中断（应用退出）」，不是「失败」；列表「已中断」；`send_message` 能让它继续 |
| X9 | A9、U6 | 设置 › 模型 › 用途「子智能体」看默认值；改成另一个模型后再派一个子智能体；再让主 Agent 调 `list_subagent_models` 并用 `model` 参数指定一个 | 默认「跟随主智能体」，此时卡片模型 = 主会话当前模型；改设置后新卡片用设置的模型；`model` 参数优先；「查看可选模型」一行列出可用模型 |
| X10 | U3、A10 | 打开 X1 的 Fork 详情，切对话 / 轨迹；在「使用统计」或该 fork 首个请求的用量里看缓存 | 顶部「从主会话 #N 分出」；对话和轨迹都只有分出之后的内容；首个请求缓存命中 token 接近父会话上一请求的输入 token（S4 推迟的真实检查） |
| X11 | A11 | 派两个子智能体，让其中一个用 `send_message` 发给另一个，再让一个发给父会话（父会话此时空闲） | 兄弟收到 `<agent_message relation="sibling">`（看它的 transcript）；父会话被唤醒，对话出现「‹描述› 发来消息」，展开是信的正文 |
| X12 | U5 | 后台跑一个 Bash（`sleep 20 && echo done`），打开右侧「后台任务」 | 只有 Bash，没有子智能体 |
| X13 | A12 | 打开一个本机老会话（带旧 `agent` / `explore` 委派） | 能打开；卡片种类是 Agent / Explore；面板列出这些委派，完成的显示「已结束」，没收尾的显示「已中断」 |
| X14 | E1、U6 | 扩展 › 插件看两个外部插件；把 `claude` 暂时移出 PATH 再看一次（不方便就只看现状） | 默认关闭；说明写用本机 CLI 和 CLI 自己的权限；找不到命令时写「不可用：本机没有找到 … 命令」；这时即使打开开关、重启，会话里也没有对应工具 |
| X15 | E2、U4 | 打开「Codex 子智能体」并重启应用，新会话里让主 Agent 用 `agent_codex` 后台做一件小事（列出 `packages/subagent` 下的包） | 工具结果返回 `~/.codex/sessions/…/rollout-…-<threadId>.jsonl`，`read_file` 读它不弹审批；完成通知带最终回复；详情只有结果和记录文件（复制、在 Finder 中显示），没有轨迹切换 |
| X16 | E3 | 打开「Claude Code」并重启应用，用 `agent_claude_code` 同步做同样的事 | 返回最终回复和 `~/.claude/projects/…/<uuid>.jsonl` |
| X17 | E4、E5 | 外部子智能体运行中让主 Agent `interrupt_agent`；之后再 `send_message` 给它 | 进程结束，卡片「已停止」；`send_message` 返回不能续聊的错误 |
| X18 | E6 | 让主 Agent 读 `~/.codex` 或 `~/.claude` 下另一个文件 | 仍弹工作区外审批 |
| X19 | B-A1、B-A2、B-A3 | 前台跑 `ls`；后台跑 `sleep 5 && echo hi`（`blockMs: 0`），完成后让主 Agent 读通知里的路径 | 前台不在会话目录 `bash-log/` 留文件；后台返回会话目录下的 `output_path`，进入 Context「路径」，读它不弹审批；完成通知带 `<output_path>` |
| X20 | B-A4 | 后台跑一个持续输出的命令（每秒 echo 一行中文），让主 Agent 连续两次 `task_output` 带 `since` | 第二次只返回新增部分，中文没有被切断 |
| X21 | B-A5 | 后台 Bash 运行中退出应用，重开 | 通知行「后台任务 · Bash: … · 已失联」，日志文件还在、能读 |
| X22 | 05 §4 | X1–X11 之后看主会话轨迹，再看设置 › Harness 统计 › 运行 | 每次派出、续派各一行，续派那行指向同一个子会话；运行页按种类 / 预设列出子智能体次数与耗时 |
| X23 | U7 | 切深色主题，复看对话卡片、通知行、子 Agent 列表与详情（含 Fork、Codex）、后台任务面板、设置两页、插件页 | 文字、边框、状态图标清楚，没有浅色残留 |

B-A6（日志超 50MB 删最早的）、B-A7（第 6 个后台任务）、B-A8（崩溃残留目录清理）、A8（第 11 个子智能体）只做了单测，不需要在 Electron 里造。

## 已知问题与未覆盖

- 卡片第二行和列表都是单行截断，最终回复里的 Markdown 标记（`**…**`、反引号）原样显示，这是改造前就有的行为，没动。
- 应用退出中断（lost）的通知展开后是 summary 原文（给模型看的英文句子），因为这种通知没有结论段。
- 同步子智能体超过 30 分钟转后台只有单测。
- Claude Code 对很长的目录名会截断加哈希，ActSpace 没照做，极长路径的工作区里记录路径可能对不上。
- Host 被强杀时外部 CLI 子进程可能残留，下次启动只补 `lost`，不清理进程。

## 结果怎么写

在本文件末尾追加「验收结果（日期、执行者）」一节，按编号逐项写：通过 / 失败 / 部分覆盖 / 未覆盖、方式（原生 CU / Playwright / CDP）、证据文件名；失败项写复现步骤和实际现象。

## 验收结果（2026-11-04，Codex 主智能体 / gpt-6.1-sol 交互子智能体）

目标为 `feat/subagent-background-redesign`，HEAD `07f853da`。本轮只验收，未修复、未修改源码或测试、未提交或推送。

本轮两次 `pnpm dev:log` 均完成依赖、Runtime Harness、Electron main/preload 构建，并记录 `runtime v2 ready`。开发应用身份为 `Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`。这只证明构建和运行时启动，不代表界面验收通过。

**阻塞 CU-ENV-01**：原生 `mcp__cua_repl` 的 `cua.getState()` 能发现运行中的应用；按显示名称 `getApp()` 返回 `Invalid app`，按 bundle ID、完整 `.app` 路径连接均超时并发生 kernel reset。停止并重启本轮开发应用、重置 CU 内核后，最后一次 bundle ID 连接仍在 60 秒后超时。尚不能确定工具绑定失败的根因，不能将其判定为产品 Bug。未获得窗口 AX 树或截图，未创建验收会话、发送模型请求或更改 UI 设置；没有使用 Playwright/CDP 替代原生交互。

| 验收点 | 结果 | 方法与证据 |
| --- | --- | --- |
| X1 | 未覆盖 | 原生 CU 连接受 CU-ENV-01 阻塞 |
| X2 | 未覆盖 | 同上 |
| X3 | 未覆盖 | 同上 |
| X4 | 未覆盖 | 同上 |
| X5 | 未覆盖 | 同上 |
| X6 | 未覆盖 | 同上 |
| X7 | 未覆盖 | 同上 |
| X8 | 未覆盖 | 同上 |
| X9 | 未覆盖 | 同上 |
| X10 | 未覆盖 | 同上 |
| X11 | 未覆盖 | 同上 |
| X12 | 未覆盖 | 同上 |
| X13 | 未覆盖 | 同上 |
| X14 | 未覆盖 | 同上 |
| X15 | 未覆盖 | 同上；未执行外部 CLI |
| X16 | 未覆盖 | 同上；未执行外部 CLI |
| X17 | 未覆盖 | 同上 |
| X18 | 未覆盖 | 同上 |
| X19 | 未覆盖 | 同上 |
| X20 | 未覆盖 | 同上 |
| X21 | 未覆盖 | 同上 |
| X22 | 未覆盖 | 同上 |
| X23 | 未覆盖 | 同上 |

本地证据（不随仓库分发）：`tmp/codex-acceptance/20261103-subagent-background-redesign/cu-report.md`、`startup-first.log`、`startup-retry.log`。无界面截图。

另外，重启日志中观察到旧会话 `SESSION_WRITER_LOCKED`。源码 `packages/session/session-persistence-jsonl/src/writer-lease.ts` 的接管条件要求旧进程已退出且心跳超过默认 30 秒；因此快速重启后旧锁仍可能被拒绝接管。这是日志及源码线索，未通过 CU 复现、未证明属于本分支回归，未修复或删除锁。

收尾：停止了本轮启动的两次开发进程；无验收设置变更需要恢复。后续需要原生 CU 能连接该应用后，重新执行上述验收点；本轮不能提供产品通过或失败结论。

## 继续验收结果（2026-11-04，后续轮次）

用户要求继续后，原生 CU 的空数据、Finder 对照和 accessibility 启动诊断仍未解除主窗口连接超时。按用户明确允许的组合方式，由 `gpt-6.1-sol` 使用 Playwright/CDP 操作真实 Electron 完成部分功能验收；这不属于原生 CU 通过。

**最新逐点状态及缺陷以 `acceptance-results.md`（原始记录已清理，见 git 历史） 为准**，上节全未覆盖是首次受阻轮次的历史记录。最新 23 点共 12 项通过、5 项失败、6 项部分覆盖（部分点内部仍有未验子项）：X1/X8/X21 通知行缺失（BUG-01，P2，通知已消费但展示只接受空闲唤醒）；X4 空闲子智能体续聊失败（BUG-02，P1，与当前 Runtime 已持有的会话写锁冲突）；X6 父会话已授予 Bash 前缀权限仍不被子智能体消费（BUG-03，P2）。Codex 成功链路因本机 Homebrew vendor ENOENT 阻塞；Claude Code、Fork 缓存及多项本地/后台交互已有真实证据。报告包含复现、源码位置、Journal 序号、证据文件及尚未定位的原因边界。

没有修复或改动源码、测试，没有提交或推送；仅补充验收记录。最终重启已确认恢复浅色主题、跟随主智能体、两外部插件关闭且无待重启提示；本轮应用及开发服务已退出，保留验收会话和仅该会话的测试授权供另一个修复会话接手。文档检查通过。

## 修复后复验

三个缺陷已在本地修复（见[执行过程](execution-process.md)步骤 7），单测与全量测试通过。请重新构建（依赖包、Runtime Harness、Electron main/preload）后，在 Electron 里复验下面五点；其余已通过的点不用重做。

| 点 | 缺陷 | 复验步骤 | 期望 |
|---|---|---|---|
| X1 | BUG-01 | 让主会话一边继续干活（如连续读几个文件），一边有后台子智能体在这期间完成 | 每个完成的子智能体在这一轮里出现一行通知，位置是主智能体读到它的地方；这一轮有工具时这行在「Worked for」过程组里，不另开一轮；展开能看结论、能打开子智能体 |
| X4 | BUG-02 | 同步派出一个子智能体，等它结束（空闲）后让主智能体用 `send_message` 续派；再对后台派出、已空闲的子智能体续派一次 | 两次续派都成功启动第二轮，列表显示「第 2 轮」；日志里没有 `SESSION_WRITER_LOCKED`；子会话目录在子智能体空闲时没有残留 `.writer-lock` |
| X6 | BUG-03 | 主会话里对某个 Bash 前缀（如 `ls`）选「本会话允许」，再让子智能体执行该前缀的命令，以及一个没授权的命令 | 已授权前缀直接执行；没授权的命令失败并返回「需要用户批准，子智能体无法请求」的说明；主会话授权列表没有子智能体新增的项 |
| X8 | BUG-01 | 留一个运行中的后台子智能体，正常退出并重开，然后在该会话发一条新消息 | 新这一轮里出现「中断（应用退出）」通知行，位置在主智能体读到它的地方 |
| X21 | BUG-01 | 后台 Bash 运行中退出应用，重开后在该会话发一条新消息（可与 X8 同一次退出） | 新这一轮里出现「后台任务 · Bash: … · 已失联」通知行；日志文件还在、能读 |

结果写在本节下面，格式同「结果怎么写」。Codex 成功链路仍被本机 `/opt/homebrew/bin/codex`（缺 vendor 二进制）挡住，修好或删掉这份安装后再验 X14；它不是本分支缺陷。

### 修复后复验结果（2026-11-04，d5dffac4）

已重新构建依赖、Runtime Harness、Electron main/preload，全部退出 0。由 `gpt-6.1-sol` 使用 **Playwright/CDP 操作真实 Electron**；主智能体独立核查 Journal、transcript、写锁与进程。本轮没有重试原生 CU，不将 CDP 标记为原生 CU 通过。

| 点 | 结果 | 方法与证据 |
| --- | --- | --- |
| X1 | 通过 | CDP：父运行中消费的完成通知在本轮 Worked for 中出现，展开结论、打开子智能体和 reload 后投影均通过。`X1-live-notice-expanded.png`、`X1-open-child.png`、`X1-persisted-notice-expanded.png`；Journal claim `3087` 无 opensTurn。 |
| X4 | 通过 | CDP：同步及后台各一个空闲子智能体续派成功，两个原 id 均「空闲 / 第 2 轮」；独立核实原 transcript 追加、空闲时无 `.writer-lock`，没有写锁错误。`X4-sync-bg-round2-list.png`、`x4-transcript-findings.json`。 |
| X6 | 通过 | CDP：父真实审批授予 ls 本会话前缀，子 ls 消费同一 grant 成功；pwd 直接 denied，说明无法请求用户批准；授权前后仅原 ls，子无新增授权。`X6-child-ls-success-pwd-denied.png`、`X6-grants-before-child.png`、`X6-grants-after-child.png`、`x6-permission-findings.json`。 |
| X8 | 通过 | CDP + 标准退出重启：退出前 child 运行，重开卡片「已停止 · 中断（应用退出）」；新消息后 Worked for 内出现中断通知，展开英文摘要。`X8-restored-card-list-before-message.png`、`X8-recovery-child-notice-expanded.png`。 |
| X21 | 通过 | CDP + 同次重启：新消息轮内有 Bash 已失联通知，原日志无审批读取成功，保留退出前标记。`X8-X21-recovery-notices-expanded.png`、`X21-preserved-log-read.png`、`x8-x21-restart-findings.json`。 |

本轮证据位于本地忽略目录 `tmp/codex-acceptance/20261103-subagent-background-redesign/postfix-d5dffac4/`。父会话 `3e5cf08e-21eb-4d70-8bf6-5bfa915c13b4`。完整步骤、子 id、Journal 序号、构建与观察边界见 `acceptance-results.md`（原始记录已清理，见 git 历史） 末尾「修复后 Electron 复验」。五点修复范围全部通过，未发现新的相关缺陷；其余部分覆盖项目保持原缺口，未将 Web / Codex 成功链路写成通过。

最终确认浅色、跟随主智能体、两外部插件关闭；仅新验收父会话保留 ls 工作区前缀授权，无全局授权，无工作区测试文件。应用标准退出 0，renderer 主动停止；5173 / 9227 无监听，测试 sleep 无残留。本轮仅补充验收记录，没有修源码、测试或配置，没有提交或推送。
