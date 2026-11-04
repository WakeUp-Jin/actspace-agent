# 桌面端验收结果（2026-11-04）

目标：`feat/subagent-background-redesign`，HEAD `07f853da`。本轮只验收与定位，没有修复、修改源码或测试，没有提交或推送。交互由 `gpt-6.1-sol` 子智能体执行，主智能体核查源码及 Journal。

## 方法、范围与操作路线

验收点沿用 [acceptance-handoff.md](acceptance-handoff.md) 的 X1–X23，完整预期以该表为准。用户明确允许组合使用原生 Computer Use 与真实 Electron CDP。原生 Computer Use 能发现开发应用，但连接主窗口反复超时；目前功能交互使用 **Playwright/CDP 连接真实 Electron**，通过界面点击和输入触发，没有 mock 或直接调用 IPC。逐项注明实际方法，不能将 CDP 结果称为原生 CU 通过。

本轮操作分组如下；分组不替代逐点覆盖结果：

1. 新会话并行派出探索、通用、Fork，连续检查卡片、列表、transcript、续聊、Fork 对话及轨迹，覆盖 X1、X2、X4、X6、X10 的部分子项；保留三卡片、续聊和 Fork 截图。
2. 在同一会话验证同步探索、后台 Bash、模型列表，再进入设置和插件页，覆盖 X7、X9、X14、X19 的部分子项；保留模型、插件和 Bash 完成通知截图。
3. 切深色复看卡片、列表、模型、子 Agent 设置、插件页，检查 X23 的对应视觉子项；保留关键截图，结束恢复浅色。

第二轮继续按路线补验：在新会话组合检查列表/详情停止、同步派出、后台 Bash 的面板及日志/中文增量；随后检查旧委派、父轨迹与运行统计，再进入空闲完成通知、Context 与模型设置场景。第二轮父会话为 `b7576904-53ee-45a6-977d-d92ee5ae7501`；空闲通知场景为 `081c7a32-d469-40bc-8b39-45c35f2d8045`。这些仍是真实 Electron CDP 交互，Journal 为独立运行时佐证。

第三轮按三个连续场景补验：①同时保留运行中的本地子智能体/Bash 后正常退出并重开，检查 lost、日志和同 id 续派（X8/X21，并复用轨迹覆盖 X22）；②开启两外部插件后重启，同父会话检查 Codex 真实启动错误、Claude 同步/后台/停止、记录免审批与旁边文件审批、Context 路径（X14–X18）；③工作区临时文件/父授权/子继承（X6），随后复用既有会话检查 Context 与深色代表状态（X2/X19/X23）。不为各验收点重复创建同类场景。

使用正常用户数据和已有 `deepseek:deepseek-flash` 连接。父会话为 `ba57e417-c356-481f-b2ca-5ac0f34d9adf`，标题「CU验收：并行派出三个只读子智能体」。仓库工作区未显示，实际在默认工作区执行自包含只读题目代替仓库扫描，不能据此签收仓库扫描能力。

启动前已完成当前依赖、Runtime Harness、Electron main/preload 构建。启动成功仅作为环境证据，不计入交互通过。

## 逐点结果

以下有执行的项目均为真实 Electron CDP；Journal 和源码只用于原因核查。复合点有任何未验子项，均不标记整体通过。

| 点 | 结果 | 实际结果、缺口与本地证据 |
| --- | --- | --- |
| X1 | 失败（部分子项通过） | CDP：三类并行后台任务创建、描述/种类/后台/模型/最终回复首行、右侧空闲列表通过。Journal 工具结果 seq `465/467/469` 在子任务完成前即返回 id 与完整 transcript 路径，见 `spawn-results-findings.json`。父运行期间完成时没有逐条完成通知分隔行，BUG-01；空闲唤醒另见 X3。`CDP-X1-three-agents.png`。 |
| X2 | 部分覆盖 | `read_file` 读探索 transcript 无审批，早期内容为 `_No messages yet._`；Context 完整详情已显示本地 transcript 路径及说明/未读状态；未捕获进行中的 `→ running` 工具标记。`R2-X2-local-context-path.png`。 |
| X3 | 通过 | CDP：较长子任务于父回合结束 12.8 秒后完成，自动开启唤醒回合（Journal seq `1196/1198/1203/1204`，claim 有 `opensTurn:true`）。实际点击「子智能体 CU延迟完成通知 已完成」分隔行，展开是结论正文而非 XML；点击「打开子智能体」后右侧选中正确详情。`R2-X3-idle-notice-expanded.png`、`R2-X3-child-open.png`、`idle-notice-findings.json`。最初短任务在父回合结束前完成，不计作空闲测试通过。 |
| X4 | 失败 | 正确 id 的 `send_message` 两次失败，未进入第 2 轮；「发消息给 CU通用」工具行可见。BUG-02。`CDP-X4-followup.png` 为失败后会话状态；精确错误见 Journal。 |
| X5 | 通过 | CDP：分别从列表停止「CU停止列表」、从详情底部停止「CU停止详情」；两张卡片均「已停止 · 已中断」，终态列表均为「已中断」，父会话收到中断通知。`R2-X5-final-stopped-list.png` 为终态；`R2-X5-stopped.png` 是第二项列表仍运行中的异步中间帧，不作为终态证据。 |
| X6 | 失败（写入/拒绝子项通过） | CDP：general `6d350af9…` 用 `write_file` 创建工作区测试文件成功，可用文件工具读取；无授权 Bash 与工作区外命令直接 `APPROVAL_REQUIRED`，未弹窗。随后父会话经真实 UI 授予工作区 `ls` 前缀授权（seq `7304`），父命令成功 `7307`，新 general `bde5fd15…` 同命令仍 denied（子 seq `79/80`），BUG-03。父 `agent` 返回 completed 仅代表子回合结束，不代表内部命令成功。测试文件已由父经精确删除审批清理（seq `7618`），独立核实不存在。`workspace-permission-findings.json`。 |
| X7 | 通过 | CDP：同步探索返回 `3+4=7`，卡片没有后台标签；真实工具调用 `background:false`，结果同时带结论与完整 transcript 路径，第二轮 Journal seq `1853/1860`。 |
| X8 | 失败（续聊子项通过） | CDP + 正常退出/重启真实 Electron：子会话 `4b4dd217-1144-4c91-9c64-665a40436b33` 在退出前运行，重开后 Journal settle 为 lost（seq `7186`）；`send_message` 成功续派同 id（`7604/7607`），第 2 轮完成 `7901`，原 transcript 末尾追加。重开后缺少「中断（应用退出）」独立通知行，下一用户回合消费 lost 后仍无该行，归入 BUG-01；续派后面板显示同 id「空闲 / 第 2 轮」。续派前卡片第二行的完整中文状态证据不足，不单独判通过。`R2-X8-X21-running-before-quit.png`、`R2-X8-after-continuation.png`、`restart-findings.json`。 |
| X9 | 通过 | CDP：默认「跟随主智能体」及卡片模型相符，「查看可选模型」真实调用可用；临时设置 Kimi K2.6 后，不传 model 的新任务使用 `kimi:kimi-k2.6`，显式指定的任务使用 `deepseek:deepseek-flash`，两项均完成。UI 卡片及 Journal start seq `2001/1999` 相符；已恢复「跟随主智能体」。`CDP-X9-default-model.png`、`CDP-X9-subagent-settings.png`、`R2-X9-model-cards.png`、`model-precedence-findings.json`。 |
| X10 | 通过 | CDP：Fork 顶部「从主会话 #5 分出」，对话/轨迹切换及只显示分出之后内容通过。另以真实请求 Journal 核查缓存：父上一请求输入 `8654+128=8782` token，Fork 首请求命中 `8704` token（约 99.1%，均为 provider-reported）；不是使用统计 UI 的直接读数。`CDP-X10-fork-detail.png`、`CDP-X10-fork-trajectory.png`、`fork-cache-findings.json`。 |
| X11 | 通过 | CDP：父通知「X11发送方 发来消息」展开后是来信正文，点「打开子智能体」选中发送方；父空闲时被唤醒并回复 ACK。独立读取接收方 transcript 可见兄弟来信与 ACK，Journal 明确 `relation="sibling"`，父 claim 有 `opensTurn:true`。`R2-X11-parent-message.png`、`R2-X11-sender-detail.png`、`message-routing-findings.json`。最初误用 `actspace.main` 返回 UNKNOWN_AGENT，模型用实际父 id 自纠成功，不记作投递 Bug。 |
| X12 | 通过 | CDP：从 Bash 工具块「后台」入口打开右侧后台任务，列表/详情只有 Bash；本地子智能体位于独立的「子 Agent」面板。详情可见中文实时输出、工作目录、沙箱状态与停止入口。`R2-X12-bash-list.png`、`R2-X12-bash-detail.png`。 |
| X13 | 部分覆盖 | CDP 只读打开老会话「查看pi-durable设计」，可读历史 Agent/delegation 轨迹；Journal seq `2708/2709` 确为旧 completed 委派。未找到旧 Explore 或未收尾样本；未完整签收旧卡片及列表的全部状态，不以首屏恢复代替兼容性通过。 |
| X14 | 部分覆盖 | 两个外部插件初始均关闭，文案说明本机 CLI 及其自身权限；通过 UI 开启并重启后工具实际可调用（X15/X16）。未制造命令完全缺失场景、未修改 PATH，因此 missing-command 文案与不注册工具分支未覆盖。`CDP-X14-plugins.png`、`R2-X14-plugins-enabled-before-restart.png`、`R2-X14-plugins-active-after-restart.png`。 |
| X15 | 部分覆盖（成功链路环境阻塞） | CDP：开启插件并真实重启，工具已加载；父会话 `29667876-3bac-43e2-a722-e015aed44cf1` 实际调用 `agent_codex` seq `619`，结果 `623` 返回 `SUBAGENT_FAILED` / Homebrew vendor 可执行文件 `ENOENT`。错误传达子项通过；未产生原生记录，成功通知、免审批读记录、复制/Finder 及 Codex 专用详情仍未覆盖。未改 PATH、安装或源码。`R2-X15-codex-error.png`、`external-cli-preflight.log`、`codex-cli-findings.json`。 |
| X16 | 通过（自包含任务） | CDP：`agent_claude_code(background:false)` 真实执行 `6×7`，返回最终回复 `42` 与 `~/.claude/projects/…/3fbce9da-25ee-4ff1-b5af-0ffa214c550d.jsonl`，实际文件存在。详情仅结果和原生记录，无对话/轨迹切换；精确 `read_file` 读取记录没有审批。父 Journal `1983/1988`。以算术替代默认工作区不存在的仓库列包，不签收仓库访问能力。`R2-X16-claude-detail.png`、`claude-cli-findings.json`。 |
| X17 | 部分覆盖（Claude 执行通过） | CDP：后台 Claude `3d7de5f5-acd8-4fda-8ec4-0a2306271b6d` 运行后调用 `interrupt_agent`，Journal seq `4396/4398/4404` 确认中断；随后 `send_message` seq `4450/4452` 返回 `SUBAGENT_CLOSED`，说明外部子智能体不能收信。独立进程检查无原生 session id 对应 CLI 残留。卡片中文终态「已停止」已见 `R2-X17-stopped.png`；Codex 变体因 X15 环境阻塞未覆盖。`claude-cli-findings.json`。 |
| X18 | 通过 | CDP：刚派出 Claude 的精确原生 jsonl 可免审批读取；同会话读 `~/.codex/version.json` 实际出现工作区外「读取」审批，截图后拒绝，没有扩大到父目录授权。Context 完整详情显示原生记录路径及已读/新状态。`R2-X18-context-paths-loaded.png`、`R2-X18-read-scope-approval.png`、`claude-cli-findings.json`。 |
| X19 | 通过 | CDP：`sleep 15 && echo CU_done` 经真实审批 UI 点击「运行」后后台完成，空闲父会话被唤醒；展开通知含会话 `bash-log` 下的 output_path 和 `CU_done`。第二轮 `read_file` 读输出日志没有再弹审批，实际读到中文行（Journal seq `3033/3035`、`3953/3955`）。另在外部验收父会话前台执行 `ls`（seq `7301/7307`）后，独立检查 `bash-log/` 为空，未产生前台日志；后台 Context 完整详情也显示 `bash-log/…log` 及「Background Bash log」说明、读 2 状态，见 `R2-X19-bash-context-dark.png`。模型回复声称 Bash「无需审批」不准确，实际界面确有审批。`CDP-X19-bash-notice.png`、`round2-journal-findings.json`。 |
| X20 | 通过 | CDP 触发真实持续中文输出及 `task_output`：首次返回「中文第1行」，`next_offset:14`；第二次带 `since:14`，仅返回「中文第2行」，`next_offset:28`，没有重复或乱码。第二轮 Journal 调用/结果 seq `2487/2489`、`2579/2581`，见 `round2-journal-findings.json`。 |
| X21 | 失败（日志保留通过） | CDP + 正常退出/重启：900 秒 Bash 在退出前运行，重开后 Journal settle lost（seq `7184`），日志仍在；`read_file` seq `7523/7528` 无审批读到 `X21-before-exit`。失联通知已入队并于新用户回合消费（`7185/7193`），无 `opensTurn`；CDP 检查无第二个 900 秒任务「已失联」通知行，归入 BUG-01；`task_list(activeOnly:false)` 返回 0；从旧工具块打开面板明确提示「应用重启前启动的命令不会出现在这里」，与内存 registry 未重建历史一致，见 `R2-X23-dark-bash-panel.png`。该面板提示本身不另列 Bug。不能以仍可见的首个已完成 Bash 通知代替本次 lost 通知。`restart-findings.json`。 |
| X22 | 通过 | CDP：父轨迹可见真实派出；恢复会话的第 11 轮 `send_message` 详情显示原 id `4b4dd217…`，点击「在右侧查看子智能体轨迹」后选中该子会话，其第 2 轮包含父来信与恢复回复，验证同会话续派跳转。Harness 统计 › 运行按种类显示通用 4 次/平均 7.72s、探索 3 次/平均 1.72s、旧 Agent 2 次/平均 1m42s、Fork 1 次/平均 3.84s（该截图时的快照）。`R2-X22-recovery-followup-trajectory.png`、`R2-X22-followup-child-trajectory.png`、`R2-X22-runtime-stats.png`。 |
| X23 | 部分覆盖 | 深色下卡片、列表、模型、子 Agent 设置和插件页已观察；另补 Fork 详情、本地完成通知、Claude 原生记录详情及 Bash 面板空态，没有明显浅色残留。新 Bash `bash_92a01f98…` 输出详情显示「深色验收输出」及退出 0，文字/状态/边框正常。Codex 正常详情受环境阻塞未覆盖，其余为代表状态检查，不声称所有卡片逐个复验。`CDP-X23-dark-*.png`、`R2-X23-dark-fork.png`、`R2-X23-dark-local-notice.png`、`R2-X23-dark-external-detail.png`、`R2-X23-dark-bash-panel.png`（仅空态）、`R2-X23-dark-bash-output.png`（新任务输出详情）。 |

汇总：23 个复合验收点中，**12 项通过、5 项失败、6 项部分覆盖**。失败点对应下述 3 类缺陷；部分覆盖仍含明确未验子项，不构成整个分支通过。Codex 成功链路是现有本机 CLI 环境阻塞，与产品缺陷分开记录。

## BUG-01：非空闲唤醒的通知被隐藏，完成和退出恢复缺少分隔行（P2，X1 / X8 / X21）

复现：在新会话同时派出探索、通用后台、Fork，让它们在父 Agent 尚在运行时完成；等三张卡片与右侧列表进入完成/空闲状态，检查主会话（包括展开工具过程）。

预期：交接 X1 及设计 U1 要求分别出现「子智能体 ‹描述› 已完成」通知分隔行。实际：三张卡片和结果存在，逐条完成通知行缺失。

**已证实原因是展示条件与验收规范不一致。** 父 Journal 中通知已经入队并被消费：通用 settle/enqueue/claim 为 seq `544/545/553`，探索为 `622/623/924`，Fork 为 `863/864/925`，target 均为 `next-step`，claim 没有 `opensTurn`。这不是后台投递丢失。

源码链路：`packages/core/agent-loop/src/loop.ts:138` 只在空闲唤醒首步设置 `opensTurn`；`packages/client/client/src/sessions/chat.ts:123` 只为 `opensTurn === true` 投影 backgroundNotice；`packages/util/shared/src/session-selectors.ts:480` 明确将其余收件箱通知隐藏。因此运行中消费的完成通知不会形成分隔行。当前设计/验收表没有限定仅空闲唤醒时显示，需由修复会话处理这处契约差异。

证据：`CDP-X1-three-agents.png` 及 `journal-findings.json`。截图呈现卡片/列表状态，通知缺失由交互检查与 Journal/投影链路共同支持。

退出恢复补验也触发同一展示缺口：正常退出前运行中的 Bash 和本地子智能体，在重开时分别 settle lost（seq `7184/7186`），enqueue `7185/7187`。源码恢复只入队、不唤醒（`packages/background-tasks/background-tasks/src/registry.ts:143`、`packages/subagent/subagent/src/manager.ts:354`）；下一用户回合 claim `7193/7194` 均没有 `opensTurn`，被上述投影条件隐藏。CDP 检查缺少 X8「中断（应用退出）」和 X21「已失联」独立通知行。恢复状态和数据本身存在：X8 同 id 成功第 2 轮，X21 日志可读；这是显示契约问题，不是恢复数据丢失。证据 `restart-findings.json`、`R2-X8-X21-after-restart.png`、`R2-X8-after-continuation.png`。

## BUG-02：空闲子智能体续聊被当前 Runtime 写锁拒绝（P1，X4）

复现：让通用子智能体完成 `17×23=391`；完成后向正确 id `1ea4aa5c-717f-4ef4-9bc9-90e9640a1014` 发送「391 加 9 是多少」，再次重试。

预期：同一子会话进入第 2 轮，原 transcript 追加。实际：两次 `send_message` 均失败，子智能体未进入第 2 轮。父 Journal 的调用/结果分别为 seq `1636/1640`、`1914/1916`，错误为 `SUBAGENT_FAILED`：

```text
Session 1ea4aa5c-717f-4ef4-9bc9-90e9640a1014 is owned by runtime f30e2416-d29d-4e9e-8d99-038ae753aab5 pid 40828.
```

**已证实的直接原因：续聊再次申请写句柄，与同一当前 Runtime 持有的有效 lease 冲突。** `packages/subagent/subagent/src/manager.ts:395` 直接 `store.open(view.agentId)`；`packages/session/session-persistence/src/session-store.ts:39` 每次按 write 打开；`packages/session/session-persistence-jsonl/src/writer-lease.ts:70` 在持有进程存活或心跳未过期时拒绝第二次开写。失败发生在新 activation 持久化和执行之前。

现场 owner 的 runtime/pid 与当前进程一致，心跳持续更新；acquiredAt 为 `2026-11-04T04:34:49.014Z`，晚于首轮 settle `04:34:48.944Z`。因此本例不能归因为旧进程残留或快速重启的 30 秒保护期。首轮收尾本身包含 `child.close()`；究竟哪个调用在 settle 后重新打开并持有子会话尚未最终定位，不能直接断言是首轮忘记释放锁。

第二轮在新启动的 Runtime、新会话与新子智能体再次复现：`43320e67-1246-492d-97b2-ce92411cec7f` 首轮完成于 `05:14:47.250Z`，当前 Runtime `0af7cd5c-4cb6-4c76-a057-2cb158013c9c` / pid `46905` 于 `05:14:47.362Z` 重新持有 lease。随后两次续聊均失败（父会话 `081c7a32-d469-40bc-8b39-45c35f2d8045`，工具调用/结果 seq `3629/3631`、`4240/4242`）。这补充了跨两次启动可复现的证据，见 `followup-round2-findings.json`；没有通过重启、删锁或改数据绕过失败。

影响边界：并非所有空闲续派必然失败。X11 场景中，兄弟向已空闲的接收方 `9f1b224f-5498-4e42-844e-d58368223cd7` 发信，成功重新激活同一子会话（发送方 Journal seq `11158`，接收方 seq `4166/4172`）；该场景没有同样的有效写锁冲突。尚需定位触发子会话被另一调用重新持有的条件。

证据：`journal-findings.json` 保存两次工具参数/错误和现场 owner 摘要；`CDP-X4-followup.png` 显示失败后的会话反馈及列表状态，并非原始错误全文截图。未删除锁、未改会话数据、未修复。

## BUG-03：子智能体没有消费父会话已授予的 Bash 前缀授权（P2，X6）

复现：在父会话 `29667876-3bac-43e2-a722-e015aed44cf1` 的默认权限模式下执行 `ls cu-acceptance-x6.tmp`，在真实审批 UI 选择仅当前会话、当前工作区的 `ls` 前缀授权；随后派一个新 general，用同 cwd、同命令执行一次。未切换全局或 full-access 权限。

预期：设计 02 §5.2 明确要求子智能体只读继承父会话授权，不能自行新增。实际：父 Journal seq `7304` 写入有效 `command_prefix:["ls"]` / cwdRoot 默认工作区授权，父工具 seq `7307` 成功（`approvalMode:session`）；新子会话 `bde5fd15-4d16-450e-baa7-14a210ff456b` 的 seq `79/80` 仍返回 `APPROVAL_REQUIRED`，没有执行 `ls`。父 `agent` 工具 completed 是回合完成状态，不应误记成内部命令成功。

**已证实的直接原因：禁止新增授权的开关同时禁止了消费已有授权。** `packages/core/runtime/src/harness/agent-factory-plugin.ts:173` 设置 `sessionGrantCapability:false`，虽在后续回调提供父会话 `activeGrants`，但 `packages/core/tool-runtime/src/prepared-execution.ts:543` 在匹配进程授权之前因该开关直接返回。之后没有审批 broker，按预期返回不能申请审批。另有修复时需核查的匹配约束：`packages/core/tool-runtime/src/permission/grants.ts:24` 要求授权的 sessionId、agentId 等于当前调用，父授权身份与子调用身份不同；仅打开布尔开关未必足以实现继承。本轮未改任何权限代码。

无授权 Bash 的首次拒绝本身符合现有策略（`packages/shell/tool-shell/src/plugin.ts:84` 在默认模式要求 ask），不单列 Bug。问题是在真实授予父前缀权限后仍无法复用。工作区 `write_file` 成功、需要审批命令直接失败的边界分别通过。证据 `workspace-permission-findings.json` 包含父 grant、成功结果和子精确拒绝；测试文件已由父按单文件审批删除，未遗留。

## 原生 Computer Use 限制

阻塞编号 CU-ENV-01：目标应用为 `Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`。inventory 正常；按名称返回 Invalid app，按 bundle ID 和完整路径连接主窗口超时并重置内核。Finder 对照连接成功；空数据和临时 `--force-renderer-accessibility` 启动均未解除目标超时。系统目录选择器打开时曾成功连接原生 Open 对话框，但后续主窗口操作仍超时。

这表明原生工具并非全面不可用，但目标主窗口 AX 绑定的具体原因未定位，不能认定为本分支产品 Bug。未绕过工具对原生应用的访问约束；实际功能结论来自上述独立标记的 CDP 路径。

## 证据与恢复

本地证据目录：`tmp/codex-acceptance/20261103-subagent-background-redesign/`（被 Git 忽略，不随仓库分发）。包含上述截图、`cu-report.md`、`cdp-report.md`、`journal-findings.json` 和启动日志；本报告保留关键复现与诊断，便于其他会话接手。

最终重启后，真实 UI 已确认原浅色主题、子智能体模型「跟随主智能体」、两外部插件均关闭且没有待重启提示。证据 `R2-final-restart-light.png`、`R2-final-restart-model-follow-main.png`、`R2-final-restart-plugins-off.png`。目录选择器期间误加入的 Documents 工作区已通过「从侧栏移除」撤销入口，未删除实际目录。验收父会话保留供修复会话查看；新建的专用验收父会话保留仅该会话/工作区的 `ls` 前缀授权，用于复现 BUG-03，没有增加全局权限。临时测试文件已删除。本轮 Electron 通过标准退出，进程 exit 0；renderer 经 Ctrl-C 停止（SIGINT / exit 130 是主动停止）。独立检查本轮应用/Claude 进程无残留，5173/9227 均不再监听，插件配置 false/false，临时文件不存在，见 `cleanup-findings.json`。

保留的缺口以逐点表为准，主要包括 Codex 成功链路、进行中 transcript 工具标记、旧 Explore/未收尾委派样本及对应特殊主题状态。本报告不构成整个分支验收通过。

文档交付验证：`pnpm check:docs` 通过，`git diff --check` 通过。Git 变更范围仅本验收报告与交接文档，HEAD 仍为 `07f853da`；未修复或提交。
