# 子智能体轨迹验收交接

- **代码位置**：主仓库目录 `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent`，分支 `fix/settings-model-select`，**未提交**。这次没有开 worktree。分支上还有其他计划的未提交改动，验收时保持原样。
- **计划**：`docs/exec-plans/completed/20261021-subagent-trajectory.md`
- **执行摘要**：`execution-summary.md`（同目录）
- **状态**：可以交给验收（2026-10-21）。自动化测试和浏览器 mock 已通过，Electron 真实会话还没验。

## 约束

- 只验收，不改源码、测试或配置；不 `git commit` / `push`。
- 优先用原生 Computer Use。做不到的项改用 Playwright 或 CDP，并在结果里逐项写明用了哪种方式，不能把自动化写成原生操作。
- 证据（截图、日志）放在 `tmp/codex-acceptance/20261021-subagent-trajectory/`。截图文件名带编号，例如 `E3-panel-trajectory.png`。
- 启动方式按 `docs/FRONTEND_VERIFICATION.md`「Electron」一节：在仓库根运行 `pnpm dev`，Computer Use 用启动日志里 `[dev-runtime]` 给出的 `appName` / `appId`。需要模型连接，用用户已有的 DeepSeek 连接即可。

## 用户能感知到的变化

1. **父轨迹**：主 Agent 委派子智能体（`agent` 工具）后，切到轨迹视图，这次委派**只占一行** `agent`。子智能体自己调的 `read_file`、`grep` 等**不再**以「子工具」平铺在父列表里，也不再出现「子工具：正在加载…」之类的提示条。
2. **详情入口**：点 `agent` 这一行，右侧详情「概述」页在「状态」下面多一栏「子智能体」，显示名称（取委派参数里的 description）和一个「查看轨迹」小按钮。普通工具行没有这一栏。
3. **右侧面板**：点「查看轨迹」后，右侧打开「子 Agent」Tab，直接定位到这个子智能体，停在**轨迹页**。
   - 标题行依次是：返回箭头 → 对话 / 轨迹切换图标 → 头像 → 标题。
   - 切换图标和主会话标题前的那个一样：看轨迹时是对话气泡图标（提示「返回对话」），看对话时是波形图标（提示「查看执行轨迹」）。
4. **窄面板**：右侧面板里的子轨迹点某一行，详情从**下半部分**弹出（不是从右边），点中的行会自动滚到可见位置。面板不会自动变宽。
5. 从「子 Agent」列表手动点进某个子智能体时，默认看**对话**页（和以前一样）。

## 准备数据

在 Electron 里新建一个会话，让主 Agent 委派一次只读探索。例如：

> 用 explore 子智能体读一下 packages/subagent/src 目录，总结它提供哪些工具，再告诉我结论。

要拿到一次**运行中**和一次**已完成**的状态，最好让子智能体跑久一点（读的文件多一些）。

## 请验收方执行

| # | 步骤 | 预期 |
| --- | --- | --- |
| E1 | 子智能体**运行中**，在主会话切到轨迹视图（标题前的波形图标） | 委派只有一行 `agent`；列表里没有子智能体的 read_file / grep 等行；没有「子工具」提示条 |
| E2 | 点 `agent` 行，看详情「概述」 | 「状态」下有「子智能体」一栏：名称 + 「查看轨迹」按钮。再点一个普通工具行（如 bash / read_file），这一栏不出现 |
| E3 | 点「查看轨迹」 | 右侧打开「子 Agent」Tab，标题是这个子智能体，内容是它自己的轨迹（用户任务、助手消息、读工具） |
| E4 | 子智能体仍在运行时，停在右侧子轨迹上观察 10–30 秒 | 新的工具调用 / 助手消息陆续出现，不需要手动刷新 |
| E5 | 在右侧子轨迹里点靠下的一行 | 详情从面板下半部分弹出；点中的行仍可见，没被详情挡住；详情里参数、结果正确；点 × 关闭 |
| E6 | 点标题行的切换图标 | 切到对话页，显示子智能体的执行记录（消息流）；再点切回轨迹 |
| E7 | 点返回箭头回列表，再手动点这个子智能体 | 默认进对话页 |
| E8 | 子智能体**完成后**，重复 E1–E3 | 父轨迹仍只有一行；子轨迹完整，最后一条是结论 |
| E9 | 关掉应用重新打开，进入这个会话，重复 E2–E3 | 重开后入口仍在，子轨迹能加载出来 |
| E10 | 把窗口拉窄（约 480px 宽），在右侧子轨迹点一行；再切换浅色 / 深色主题各看一次 | 详情仍从下半部分弹出，不变成盖住表格的右侧抽屉；两种主题下文字、边框清楚 |
| E11 | 主会话的 Context 面板里点某条记录「跳到轨迹」（此时右侧子轨迹不要开着也行） | 只有中间的主轨迹跳转定位，右侧子轨迹不受影响 |

## 已知问题与未覆盖

- 窗口很矮时，子轨迹详情只占面板 56% 高，概述各分区会被压扁（主轨迹也是这样，与 DSH 一致），不算缺陷。
- 子智能体不能再委派，所以子轨迹里不会出现 `agent` 行，不需要验孙级跳转。
- 侧栏不显示子会话、没有会话层级面包屑：不在本次范围。

## 结果怎么写

在本文件末尾追加「验收结果（日期、执行者）」一节，按编号逐项写：通过 / 失败 / 部分覆盖、方式（原生 CU / Playwright / CDP）、证据文件名；失败项写复现步骤和实际现象。


## 验收结果（2026-10-22，Computer Use 子智能体）

原生CU准确实例绑定受工具阻塞（见总执行目录 cu-models-20261022.md），本轮全部为 **Chrome浏览器mock交互**：`?mock=subagent-trajectory`。以下原E编号的真实Electron要求均保留“未覆盖”；另列已通过的mock子步骤，不把fixture当真实委派/恢复。

操作路线：父轨迹→agent/普通bash概述对比→右侧子轨迹→靠下grep详情→对话/返回列表→默认对话→浅深480px→Context完整面板/跳主轨迹/回子Tab。截图前缀 `tmp/codex-acceptance/20261021-subagent-trajectory/20261022-mock-`。

| 编号 | 状态 | mock已验证与剩余 | 证据后缀 |
| --- | --- | --- | --- |
| E1 | 未覆盖 | 完成fixture父列表一行agent，没有子工具平铺/加载条；真实运行中未验 | E2-agent.png |
| E2 | 未覆盖 | mock agent概述状态下名称/查看轨迹入口；普通bash概述无子智能体栏；真实未验 | E2-agent.png，AX |
| E3 | 未覆盖 | mock点击直接进入子Agent Tab与轨迹，任务/助手/7读工具可见，标题正确；真实未验 | E5-bottom-detail.png |
| E4 | 未覆盖 | fixture已完成，不能证明运行中10–30秒持续更新 | 无 |
| E5 | 未覆盖 | mock点击靠下grep后下半详情、所选行在详情上方仍可见、参数pattern/path与结果Found48匹配、×可关，宽度390未自动变宽；真实未验 | E5-bottom-detail.png |
| E6 | 未覆盖 | mock切对话显示正在加载执行记录，再可切回轨迹；mock transcript空是已知边界，没签收消息流 | AX |
| E7 | 未覆盖 | mock返回列表再进默认对话，显示加载执行记录；真实未验 | AX |
| E8 | 未覆盖 | 完成fixture父agent一行、子轨迹完整末尾结论；没有真实运行→完成过渡 | E5-bottom-detail.png |
| E9 | 未覆盖 | 未退出/重启Electron；fixture刷新不能证明持久化 | 原生工具阻塞 |
| E10 | 未覆盖 | mock480×900浅/深两次靠下grep，下半详情未变侧抽屉，选中行可见、文字边框可读；真实窗口未验 | E10-light-480.png、E10-dark-480.png |
| E11 | 未覆盖 | mock Context→完整面板和子Tab共存，点在轨迹中打开仅主区进入轨迹；回子Tab仍原子任务与轨迹。Context为通用fixture，与子轨迹样例条目不匹配，不能证明精确记录定位，更不能签收真实 | E11-context-return-child.png |

主题原跟随系统，结束已恢复；viewport reset。普通侧栏仅父会话在本fixture可见（只能证明该位置，不能代表搜索/分页/重建）。无本轮确认产品Bug。F3真实消息流、F4完整发现入口、F5列表、运行恢复均未覆盖。

## 真实Electron阶段结果（2026-10-22，继续执行中）

方式为Playwright/CDP真实Electron+真实DeepSeek+真实Runtime委派，不是原生AX。生产dist，独立desktop-long-linked-profile-20261022。父session `61fdc5af-c584-4389-a344-262f6bdce1b6`，子session `f3fcd8e3-c052-4585-ae08-172f6796fe8d`；Journal lineage origin=delegation，父callId `call_00_Pv1AoUTejtX07kbgmzb77416`。仅读取隔离fixture工作区三份样例文件，无写入/外部内容。当前版本实际委派工具名为explore，非旧表字面agent；按委派语义验收。证据目录为总执行tmp目录stage1/electron-cdp-20261022/。

| 编号 | 状态 | 已执行子步骤、证据及边界 |
|---|---|---|
| E1 | 通过 | 真运行中父表一条explore，父自有read_file/list_directory保留，子read_file未平铺，无子工具加载条。f8-E1-running.png、f8-running-parent.txt。 |
| E2 | 通过（委派子项） | explore概述状态下有子智能体与查看轨迹入口，f8-E2-explore.png。普通工具对照本轮继续补，不用mock代签。 |
| E3 | 通过 | 在右侧查看子智能体轨迹直接进入子Agent Tab与子轨迹；用户、助手、三次read_file和list_directory可见，f8-E3-child-trajectory.png。 |
| E4 | 未覆盖 | 首次真实子任务15秒结束，进入右轨迹时已完成；不把静态已完成状态写实时10–30秒通过。后续补运行观察。 |
| E5 | 通过 | 点靠下sample.html行，详情从右栏下半弹出，选中行仍在上方，参数sample.html/返回HTML一致；×关闭。f8-E5-child-detail.png，已实际查看截图。 |
| E6 | 通过 | 子轨迹切对话，真实完整执行消息流与列表可见，切回轨迹正常，f8-E6-child-conversation.png。 |
| E7 | 通过 | 返回列表再点子任务默认对话，f8-E7-default-conversation.png。 |
| E8 | 通过 | 完成后仍一条explore；子轨迹四工具及最终中文结论完整，父会话另有综合总结。父随后自行复核CSV/HTML是父工具，非重复平铺子工具。 |
| E9 | 未覆盖 | 本组正常退出重启尚未执行，继续补。 |
| E10 | 通过（浅色） | 真480×900重新点sample.html，选中行可见，下半详情不侧抽屉，f8-E10-light-480.png，实际查看截图。深色截图已保存f8-E10-dark-480.png，视觉复核继续；主题已恢复跟随系统，尺寸1280×900。 |
| E11 | 通过（打开主轨迹/保持子状态） | 新建Context Tab、真实68条输入与三条活跃路径；在轨迹中打开，再返回子Tab仍子轨迹/原工具；f8-E11-return-child.png。精确条目定位尚未逐一核对。 |

关联F3：真实任务卡由运行中变已完成；子对话完整可读，无静态mock替代，10–30秒增量观察和读取故障分支仍未覆盖。F4：普通侧栏可见父会话与合成历史，不显示该只读子会话；搜索/快速打开/归档/重建继续。F5：真实子对话DOM有42处ul/ol，截图含最终正文；浅深样式与主/子嵌套标记逐项继续，不只凭DOM数量签收。F6：T3历史100请求/1000Token/1100日志与刷新结果已落总执行cu-electron-20261022.md。

### 实时与对照补测

- E2普通工具对照通过：主表README read_file概述没有子智能体查看轨迹按钮（计数0），f8-E2-ordinary.png。
- E4已验证真实增量：第二次explore要求较长教学结论，停在子轨迹无需手动刷新，文本从8659字符增长到14171并最终完成；f8-E4-start.txt/png与f8-E4-after10.txt/png。最后一条采样命令显式等待10秒；首末证据时间01:08:25.856Z→01:10:34.051Z（128秒），因此保留“10–30秒窗口精确采样未覆盖”，不把文件名after10误当首末仅10秒。观察到助手思考/正文真实增长，工具已先执行完成；第二任务结论完成后父继续综合输出。F3实时助手消息更新子项通过，工具增量期间未逐条截图，读取故障分支仍未覆盖。
- E10深色已实际查看f8-E10-dark-480.png：选中sample.html行在下半详情上方，文字/边界可读，非右抽屉。浅深均已交互验证；已恢复跟随系统。

- E9补测通过：正常关闭Electron38555并确认PID消失，再同profile正常启动Electron31342；进入原父会话，打开explore概述→在右侧查看子智能体轨迹，两个真实轨迹表恢复。f8-E9-restarted.png。未以reload代替本次退出重启。


## 汇总复核（2026-10-22，主智能体）

按原 E1–E11 的行为要求汇总，同一固定构建下允许不同样本分别证明子步骤。E1/E2/E3/E5/E6/E7/E8/E9/E10的真实Electron结果沿用上文；本节补齐 E4、E11，**E1–E11 均通过**。这仅签收本交接范围，不代表全项目或侧边对话最终整合通过。

| 编号 | 最终状态 | 方法、证据与边界 |
| --- | --- | --- |
| E4 | 通过 | 真实Electron+Runtime+本地受控Provider，同一脚本20.173秒，无手动刷新；子轨迹从仅用户行到系统/轮次/Context/助手0–29片段，前后均运行中。证据为总执行tmp目录 `stage1/electron-cdp-20261022/E4-trajectory20.json`、before/after.png及rowids/Journal。另有上文真实DeepSeek128秒增长；受控样本未触发新增工具，不声称该20秒内也新增工具。原文“工具调用 / 助手消息”按已有助手更新判定，不额外要求两类同时出现。 |
| E11 | 通过 | 旧 `f8-E11-return-child.png` 及原操作记录证明Context跳主轨迹后右栏仍为原只读Explore与README/sample.csv/sample.html工具记录；新 `E11-specific-ref.json`、`E11-specific-journal.json`、`E11-specific-selected.png`证明实际具体工具结果trajectoryRef.callId与主轨迹data-current/aria-selected和Journal匹配。同固定构建合并两项行为证据；原清单没有要求同一次采样的scroll数值完全一致。 |

上述补证方法均为Playwright/Electron CDP，不称原生AX；不涉及系统剪贴板，不改产品。最后一次临时实例正常关闭、settings恢复，完整过程与误停共享本地Provider后恢复的工具操作偏差见[总执行交互报告](../20261021-actspace-full-acceptance/cu-electron-20261022.md)。该偏差发生在前一轮独立流结束后的清理，未拼接到E4证据。F3子对话流式等待观察、读取故障fallback、多子滚动及侧边对话整合属于其他验收点，继续按台账记录。
