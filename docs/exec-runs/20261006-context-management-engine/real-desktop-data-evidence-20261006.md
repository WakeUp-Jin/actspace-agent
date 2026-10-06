# 真实 Context 与模型输入验收证据

2026-10-06。主 Agent 对真实 Electron 请求进行独立日志核对；Computer Use 逐项结果见 [桌面验收记录](./real-desktop-acceptance-20261006.md)。本轮验收已完成取证；发现的问题未修复，不代表整体功能通过。

## 观测链路

临时日志只在 `ACTSPACE_CONTEXT_ACCEPTANCE_LOG` 有值时启用，未改变转换、模型参数、持久化或压缩策略。Context、toLlmInput 返回值、prepare 后实际请求分别捕获，用 requestId 关联；压缩用 compactionId 关联。凭据字段不记录。

- 完整本机临时值：`/tmp/context-real-acceptance-values.jsonl`。
- 逐请求核对：`/tmp/context-real-acceptance-data-checks.json`。
- Journal 快照独立核对：`/tmp/context-real-acceptance-snapshot-checks.json`。
- 数据目录：`/tmp/actspace-context-real-acceptance-logged-20261006`。
- 临时目录证据不保证长期留存；关键数值、标识与复现步骤在此和桌面报告内保留。

## 普通请求及模式

截至首两次压缩，10 次真实请求三阶段对应一致：messages、工具定义、options 显式值、requestId、sessionId 与 route 对应正确。prepare 将 `deepseek:deepseek-flash` 解析为 `deepseek-flash` 并补充默认参数，实际容量为 1,000,000。Journal `request/context` 与 prepare 后 system、消息及工具逐字段一致。

分页读取会话 `09bea104-e3ca-4a5a-b428-49fb8fff5c2e`：

| 请求 | 实际数据 |
| --- | --- |
| `e2ddad45-d705-4d47-8e0d-9b4955576705` | Agent，18 个工具；workspace AGENTS.md 与 Skill fixture marker 均在 system。 |
| `8d4c31b6-b90e-45dd-bea5-a1f2bf200c9d` | 同一 turn 第二步，file-001 读取计数 2；两个 tool-call 与两个 tool-result ID 保持配对；navigation 锚定第二个结果 seq 398 后。 |
| `61cd1723-2412-445a-8edc-191fc1ebe80c` | Chat，2 个工具 generate_image/web；新 system 不含 workspace/Skill 来源。旧历史仍保留。 |
| `f7be023f-1341-4724-aed0-74c94b64c697` | Plan，10 个只读/规划工具，workspace/Skill 来源恢复。 |
| `a2753e73-6f2a-4cf1-a7a9-9d1dafbf3ba3` | Agent，18 个工具及相应来源恢复。 |

两个分页步骤的 system 正文相同（12,618 字符）。路径导航和运行状态作为带 `<runtime_context>` 标记的 user 消息按锚点补充；Context.status 未作为整个对象发送。这里验证的是前缀/消息位置，没有测量 provider 缓存命中。

## 压缩与披露

首压缩 `956cb9f0-e992-45cd-af65-eb8059a1d1c9`：摘要保留 Relevant Files；candidate→start→summary→surface/replaced→end→applied 顺序完整，成功后下一请求 cycle=1、读取计数归零。原 Journal 仍保留所有压缩前事件。

发现工具分页输出的路径抽取失败（见桌面报告 B2）：虽然读取 manifest 返回 106 个文件路径，candidate 仅有 file-001、file-002、manifest 共3个。随后通过真实用户正文列出106个绝对路径继续独立验收排名，不把这条补充路线视为工具输出路径采集通过。

第二次压缩 `ec6ff62d-5c6c-4208-a39f-8ac3cb497f9a`：candidate=107 个真实文件；applied active=100；其余7个进入一个睡眠索引，大小877 bytes，artifactId=`2bab2cc1-f736-409c-85e6-843b1878f61f`。后续请求 `f7f82a9e-fb10-4683-91d2-092d21f65526` cycle=2，active100/sleeping7、计数均0。文件均通过 Host 文件验证，不含目录。

此周期所有读取计数为0，按既定并列顺序得到 active file-003 至 file-102；sleeping 为 file-001、file-002、manifest、file-103 至 file-106。实际索引正文包含且仅包含上述7个文件，导航仅展示活跃文件及单个索引入口。

原历史引用未出现在 candidate/导航；后续真实 Host 诊断确认包装存储未通过类型判断（见 B3）。

## B2：带行号工具输出未保留路径（已确认）

关联 A7。读取 manifest 的真实工具结果格式为 `    92|/Users/.../file-092.txt`，106条均已进入压缩前 Context.conversation。首次压缩 candidate 只有3个路径，说明路径采集未覆盖这些结果。

复现：在真实 Agent 会话分9页 read_file manifest（每页13行），然后 `/compact`；检查 compaction candidate 和后续 navigation。期望保留106个文件引用并生成睡眠索引；实际只保留直接读取过的 file-001、file-002、manifest。第二次以用户正文直接给106个路径可登记107个文件，证明文件存在性验证及排名路线可用。

源码定位：`packages/context/src/disclosure/paths.ts` 的 collectPathHints 要求路径前缀为起始、空白、引号、反引号或左括号，不接受 `|`。这是对真实失败的源码解释，不是以静态检查代替实机测试。建议严重性 P2。未修复。

## B3：压缩没有提供原 Journal 引用（已确认）

关联 A9。首两次压缩的 candidate 和导航均没有原 Journal 路径；`sessions-v2/09bea104-e3ca-4a5a-b428-49fb8fff5c2e/journal.jsonl` 实际存在、压缩前事件仍在。

源码与运行值：`packages/runtime/src/harness/context-host.ts` 中 historyPath 要求 `store.storage instanceof JsonlSessionStorage`。实际 Cordis 插件 `packages/session/jsonl/src/plugin.ts` 提供 JsonlSessionStorageService 包装，通过其 `.storage` 持有 JSONL 实现；该判断跳过此实例的正常存储。重启后第四次压缩 `f998720c-acf1-4186-b8d6-4f6bf2c698f6` 捕获真实 Host 值：hasSessions=true、ephemeral=false、storageClass=JsonlSessionStorageService、isJsonlStorage=false；确认就是包装服务未通过 instanceof 判断。建议严重性 P2。未修复。

## 睡眠读取中间态

请求 `03e41da2-a67a-4f4e-8403-80e706a26990`：cycle=2，active100/sleeping7；file-106 的 visibility 仍 sleeping，readsInCycle=1。索引读取成功，索引自身没有作为普通引用加入 paths，也没有读取热度。UI 对工作区外索引要求正常审批，本次允许后返回正文。

截至此处12次请求的独立对照还包含 Surface 节点与模型消息的角色、正文及 callId 保留检查，均一致；原结构中的 tool-result 正常转换为 LLM tool 消息，摘要对象按既有规则转为 JSON 文本。

## 下一周期恢复与 B4：旧睡眠索引被重新收集（已确认）

第三次压缩 `060ae0c1-9610-4abf-8a27-408778871cbe`，applied seq1849。下一请求 `188c70c3-81a5-40dd-b588-4a1efbd0d1e9` cycle=3，file-106 已为 active 且 readsInCycle=0；延迟到压缩才恢复的行为通过。

但本次同时把上一周期的索引文件 `artifacts-v2/2bab2cc1-f736-409c-85e6-843b1878f61f` 加入普通 active。当前实际 active=2（file-106 和旧索引）、sleeping=106；旧路径未读且非新路径本轮进入睡眠是策略行为，不把活跃未填满100视为Bug。

B4 关联 A9，建议 P2。复现：登记107个文件→压缩得到100 active/7 sleeping→模型正常 read_file 读取睡眠索引→再次 `/compact`→发短请求查看导航。期望索引仅作入口，不进入普通路径状态或新索引。实际旧索引作为普通活跃引用列出，后续可形成索引套索引。

源码解释：`packages/context/src/disclosure/plugin.ts` 的 observe 对 indexArtifacts 路径做排除，但 prepare 收集 conversation/result 路径时没有排除已知索引。读取当步未加热/登记，到了压缩阶段被重新收集。未修复。

## 压缩后重读与权限拒绝

请求 `e8c75334-32bc-40eb-a776-990ea4a782f6`：第三次压缩后再次读取 file-001，真实正文返回，sleeping 路径 readsInCycle=1；读取缓存没有用压缩前的 unchanged 结果代替正文。

权限拒绝 tool/result seq2312、callId=`call_00_4ua3P7VWVw4IcGams6na4981`，status=denied、isError=true、正文 `user-denied`。后续请求 `874d738b-60aa-476c-9632-1615819c91b6` 中拒绝文件没有加入 paths，原计数不变；工具调用和拒绝结果按相同 callId 成对转换。这里是明确的工具权限拒绝，不是 provider 自动重试。

## A11：正常重启恢复

17:13 正常 GUI 退出，17:14:19 同一数据目录启动新进程 PID89695，BOOT_READY，无 Harness 恢复错误。首请求 `ed5ffc69-0193-46fe-8714-2c9412f53a3c` 在17:17:18开始、17:17:20完成“恢复验收正常”。

将该请求的独立 Context 与退出前 `8ea6dab0-d35d-4229-9ff8-95ebe1930996` 比较：109条路径状态逐字段相同（active3/sleeping106）；cycle=3 相同；所有读取计数、addedCycle、lastReadAt、owners相同；sleepingDirectory 类型化引用和解析路径相同。原 Journal 字节前缀完整保留。没有重复摘要或重复计数。

首轮旧目录的静默暂停 B1 在本次正常重启没有复现。CUA 工具调用的约62秒返回耗时不能视为截图已经等待62秒：发送即刻快照短暂排队，后端2秒完成，不能据此增加调度阻塞Bug。

## A12 与 B5：fork 隔离成立，旧索引事件被重新计数（已确认）

子 Session `95fd4c1c-5035-45ee-a58e-285a7f52cd8e`，lineage parentSessionId=`09bea104-e3ca-4a5a-b428-49fb8fff5c2e`、parentBoundarySeq=2649、origin=fork。子请求 `261e5db1-3495-40d7-b412-5f737da66be4` → `e96fbf89-caad-4e64-925f-e9ad6014c332` 正常读取 file-002，计数变1；父 Journal bytes 与 fork 前基线完全相同。子 Context 的 sleepingDirectory artifactId=`23e25e01-e2c8-4d47-a8f9-b40ba11480ab`，解析到子可用的独立资源。

B5 / P2：首次子 Context 在新工具调用前，旧睡眠索引 `2bab2cc1-f736-409c-85e6-843b1878f61f` 已出现 readsInCycle=1，而继承前为0。子 Journal seq2658 新追加 fact，sourceSeq=1609、callId=`call_01_42AdK0GAxF7jr7pene2Q2369`，time 为09:02:13（父cycle2的索引读取），被重放计入当前cycle4。

复现：父会话曾读取睡眠索引→再成功压缩清零→fork→子首个短请求→比较父与子 Context.readsInCycle。期望只继承当前周期计数，忽略旧索引读取；实际被排除的历史索引结果在子恢复时变成新 fact。

源码解释：fork 对类型化 index artifact 引用重映射，但历史 tool/result.detail 的普通路径仍指向旧索引。ProgressiveDisclosure.hydrate 重扫历史结果，observe 通过重映射后的 artifact 路径判断索引，未识别原路径；该事件之前没有 fact/processed 标记，因而错误重新登记和计数。本例同时带有 B4 产生的旧索引普通路径，保留完整前置步骤，不把简化场景声称已复现。未修复。

因此 A12 的父子写隔离、子文件读取通过，但热度继承整体不能判通过。

回父会话请求 `350a0f8b-1d56-4f55-b03a-ac2a935b430b`：cycle4，active3/sleeping107，当前读取计数全部为0；子会话的 file-002=1 和旧索引=1 均未写入父状态。父子写隔离再次得到实际请求确认。

## A3：真实切换模型

请求 `66747568-a2c8-4d03-aab9-6427fc7ccf7e`，Context.request 与 LlmInput 均为 `kimi:kimi-k2.6`，prepare 正常解析 `kimi-k2.6`，容量256,000。system、历史消息、supplement与工具在转换中一致，容量不是沿用前一DeepSeek的1M。

显式记录合法 prepare 差异：输入 options 为 `{cacheRetention:"short", reasoning:false}`，prepare 为 `{cacheRetention:"short"}`。Host adapter 对不支持推理的模型删除无用 reasoning 字段（legacy-llm-adapter 的 capabilities.reasoning=false 分支），不是转换器丢字段；原 Context→LlmInput 仍逐字段相同。后端真实dispatch结果和UI容量由Computer Use报告确认。

## 完整转换核查补充

截至24次真实请求，独立重建system sections/modelFacts的排序和渲染结果均与LlmInput一致；动态supplement均在完整工具结果批次之后。逐节点角色、正文、callId、工具schema、请求标识、显式options和持久快照亦一致。这里检查转换正确性，不能代替路径收集、扩展生命周期等功能验收。附件特殊块将单独核对，不用普通文本检查代替。

## B6：英语辅助学习无法开启（已确认界面失败）

Computer Use在扩展页面选父主会话后开启，界面仍off，并显示“无法更改目标会话，请刷新列表后重试。”按提示刷新列表并再次点击仍失败。dev日志有3次 `english-learning:set-target` handler 的通用操作失败；请求 `df28c99c-4796-4573-8fee-7f0b7aa22bee` 的Context.system没有英语来源。建议P2，未修复。

原异常在IPC catch中被替换为通用错误，当前日志不能确认具体抛错位置。源码核查发现 enableSession 要求agent.registry中存在main Agent；resumeMainSession只恢复Session并initialize任务调度快照，真实Agent随Run创建和释放。因此闲置会话与来源绑定生命周期是否匹配是修复时优先核查点，此项属于源码推断，不写作已捕获的根因。启用被阻断，开启后目标作用域、关闭移除和语音不能判通过。

## A1：真实图片附件

请求 `c8233729-608a-4dd9-b953-bc013aa3cf9d`，Kimi K2.6。Context用户节点保留text和artifact，图片artifactId=`8fa4d201-4690-4ea2-bdad-004e3e20efd1`、mediaType=image/png、label=fixture-image.png；LlmInput对应image块保留同artifactId、mimeType和alt，prepare相同。

实际artifact264bytes，sha256=`e5bb7281d874fed7cceb34fca055ba8b770f576fff52a1aed7bc5c40a8a23401`。原文字只要求识别左右颜色，没有透露答案。Journal seq3048的真实provider回复“左半为绿色，右半为蓝色。”与fixture一致。图片在Session和模型输入中的身份保留、实际视觉处理均得到证据；文本附件另行验收。

## A6：连续摘要输入核对

四次串行手动压缩分别选取23、5、6、15个Surface节点。实际compaction-prepared均只有system/user两条消息、tools为空。第2至第4轮的前次摘要在 `<prior-summary>` 数据区域各出现一次，在 `<conversation>` 新内容区域出现零次；摘要Surface对象按既有规则JSON化，因此按转义后正文比较。四轮模板均包含Relevant Files，四份生成结果也都保留该部分。未用字符串中Prompt规则举例的标签数量判断重复。

文本附件请求 `8d36cbba-738c-45af-957a-e0368f626dc4`：Chat，tools2。Context用户节点保留artifactId=`aad6bbc6-ddcc-4b04-8323-46067724d6c1`、mediaType=text/plain、label=notes.txt及208字符正文；LlmInput转换为 `<attached_file name="notes.txt" media_type="text/plain">` 文本块，原正文和换行保持，prepare一致。Journal seq3646回复对应“Read file-001 twice and file-002 once”及只读验收流程，全程没有工具调用。文本附件和前次图片均纳入逐块转换核查，目前26请求无差异。

## A5：运行中停止

长响应请求 `f7af04e3-1251-4563-b705-7663ed2d295f` 已产生真实assistant/chunk，点击停止后Journal seq6133 assistant/message finishReason=aborted、6134 step/end reason=aborted、6135 turn/end reason=aborted、6136 Run outcome=cancelled。终态assistant/message content为空，遵循当前停止行为；此前chunk仍在Journal。未有工具调用，未产生压缩applied，也未推进cycle4。该行为是用户停止，不是Provider重试；后续继续发送另行检查。

停止后新请求 `1d6ef55f-09bc-46ed-a22b-ef2e8c7835c9` 已被接收并stream，最后user在Context/LlmInput明确为“CUA-A5-CONTINUE...只回复停止后继续正常”。但实际reasoning-delta持续讨论旧A5-STOP的5000句任务并纠结两条user指令；截至观察约6K字符仍未终态，不能把开始stream当作短任务完成通过。旧停止任务user保留，aborted assistant未追加到Surface；新转换没有丢失最新user。此为 B7 行为候选：停止后新任务受旧未完成指令影响；仍可能与模型响应行为有关，未认定转换缺陷。终态由Computer Use报告补充。

终态更新：继续请求最终Journal seq11682 finishReason=stop，text为“停止后继续正常”，11685 Run outcome=completed。输出5539 tokens，其中reasoning5534；因此停止和再次发送完成通过。B7仅保留为长推理延迟/旧停止指令影响的候选，不能写成继续功能失效或未最终完成；也没有第二次取消成功证据。

空会话 `91c127aa-d287-4034-bd26-daa333e4187f` 手动压缩：实际Context.conversation.entries=0，region=null。Journal仅task提交/接收/完成seq0–2，没有candidate、core压缩事务或applied；无compaction-prepared摘要请求。空操作不推进周期，真实界面反馈由Computer Use报告补充。失败或取消压缩的实际UI事务仍单独标注覆盖。

## B8：累计Task投影超过单记录限制后阻断发送（已确认）

关联A10，建议P1。新Chat `91c127aa-d287-4034-bd26-daa333e4187f` 在50%配置下先完成两个短请求与63118字符大文本（请求 `a769e4e1-8790-4803-8921-c57d0da56bfa`，实际input28272/cache512/output39，未达48K内部阈值）。再提交126K字符安全文本，界面显示“提交尚未确认”并保留草稿，侧栏空闲；同一标识核对仍失败。未产生新LLM请求，不能算自动压缩已经验证。

新task accept事件seq254已出现在Journal，单条715129bytes，content original/prepared合计714618bytes，低于1MiB；包括此前63K任务在内，历史各task content累计1094046bytes，高于1MiB。dev日志 `submit-task` 报 `TaskError:DURABILITY_BLOCKED`，cause为 `Session record exceeds the 1 MiB JSON limit.`，栈定位到 `projectTasks`。

源码解释：`packages/agent-service/src/task-projection.ts` 将累计TaskSnapshot交给 `snapshotSessionJson`，该函数的1MiB限制适用于整个投影。TaskLedger.#commit 在appendMany后计算投影再flush；投影抛错后标记blocked，返回的旧snapshot仍revision253。故本例不是单个输入event超限，是累计投影超限。seq254是否已满足完整durability不以可读磁盘记录代替flush保证；保存故障会话，不删除记录、不恢复写入、不修复。自动触发另开新Chat验证。

## A10与B9：真实自动压缩成功，但比例使用固定容量（已确认）

独立新Chat `d7505639-0b4e-40de-a5ac-e01ee78c9b84`，Kimi K2.6，真实prepared.contextWindow=256000。通过UI设阈值50%，两个短请求后发送60000个单字符“验”（请求 `b114bd5a-90c4-4099-9cd7-54574f99f2df`），实际usage.inputTokens=60148、cacheReadTokens=512、outputTokens=54，总计约60714 tokens，约为窗口23.7%。UI显示约24%，回复“自动压缩大文本完成。”

实际自动事务 `465585a7-5f4b-4eb2-a5e7-0bfe7d30fec3`：candidate seq520→core start521/summary522/replaced523/end524→applied525→run completed526。摘要保留Relevant Files，与手动共用协调器；用户此步没有发送 `/compact`。

B9 / P2：设置描述为“仅Chat模式：上下文占用达到该比例时压缩历史”，但50%配置在24%占用便触发。`packages/compaction/src/policy.ts` 固定contextLimitTokens=128000/reserve16000，50%内部阈值为48000，没有使用该请求256000模型容量。运行值和UI均支持比例不符。cacheReadTokens未被compactionUsage计入是另一个源码疑点，本例仅512cache不影响提前触发结论，未单独复现大量缓存导致延后，不增列确认Bug。未修复。

## 最终核对范围与复验入口

自动压缩后请求 `d497eed6-c1c9-4bc5-87b0-b0add16b8529`：Context.cycle=1，active0/sleeping0，摘要进入Surface和LlmInput，回复“自动压缩后继续正常。”；没有重复applied。独立设置文件确认阈值恢复0.8。

35次真实模型请求逐字段/逐块转换核查无差异，53份Journal快照（包括fork继承副本）与prepared一致；4次手动+1次自动压缩均保留Relevant Files。合法模型能力归一化已单列，未测量provider cache命中率。元数据核对结果持久保存为[逐请求值核对JSON](./real-desktop-value-checks-20261006.json)，完整本机临时日志仅用于复现，没有整份prompt复制到仓库。

确认问题B2–B6、B8、B9共7项；B1与B7为候选/观察。真实自动重试、压缩失败/取消、英语开启后的作用域与关闭/语音未覆盖；空压缩无明确UI反馈，数据no-op已确认。修复时按报告复现步骤和requestId定向复验，不能用本轮转换通过替代功能通过。

## 临时诊断撤除

Computer Use通过正常GUI退出本worktree实例；主进程与dev:log/watch链路已结束。6个插桩文件逐一按验收前备份字节恢复并验证sha256，删除临时acceptance-log源码和生成helper。保留原有P1–P4实现和其他工作树修改。

`pnpm --filter @actspace/runtime... build`通过，默认Harness重新生成35个ESM文件；受影响src/dist已无临时日志符号或环境变量。`pnpm check:docs`和`git diff --check`通过。正常退出引发watch子进程SIGTERM/ELIFECYCLE是dev链路关闭结果，未列作产品启动失败。报告、元数据JSON、临时日志和隔离故障会话保留；没有修复、提交或推送。
