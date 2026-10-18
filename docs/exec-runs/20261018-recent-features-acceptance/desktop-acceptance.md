# 最近功能 Desktop Computer Use 验收

日期：2026-10-18。执行者：指定 `gpt-6.1-sol` 子智能体。状态：本轮原生 Computer Use 已完成可执行路线并正常退出；最终结果如下。

用户随后授权已有真实连接的补验，独立记录于[真实连接补充验收](real-provider-acceptance.md)；本文件保留初轮受控Provider历史统计。

## 边界与环境

- 基线：`main` / `a13f8a1ee10eed387da575d80ac000cc844f2bff`，开始时 `git status --short` 为空。
- 范围：2026-10-11 至 10-18 合入 main 的 Desktop 功能。仅验收与记录，不修复，不修改源码/正式测试/既有文档，不提交推送。
- 本文件是唯一允许新增的验收文档。截图置于相邻 `screenshots/`，本地证据不随仓库分发。
- 必须使用本轮独立 `ACTSPACE_DATA_DIR`、workspace。不得读取或复制用户真实设置、会话和凭据；测试凭据只能为明确 synthetic fixture。
- 真实 Electron 入口来自启动日志 `[dev-runtime]` 的 appName/appId；浏览器 mock、真实 Electron、受控 Provider 和真实外部 Provider 的证据分别记录。
- 原生工具首次 `cua.getState()` 返回原生 apps，但浏览器清单报 `unsupported Codex auth method: apikey`。随后按 bundle ID 定向选择原生 app 成功。本子任务未使用 Playwright，也未操作 Web/官网子任务的浏览器标签。
- 本轮原生 `getApp(displayName)` 返回 Invalid app，改用日志内 bundle ID 成功：`com.actspace.desktop.dev.w2067fa05` / `Actspace Dev actspace-agent-2067`。已真实操作 Electron；浏览器清单认证错误不代表原生全局不可用。
- 隔离根 `/tmp/actspace-20261018-recent-desktop`，data为其 `desktop-data/`，workspace为其 `workspace/`；首屏 AX/截图确认只有此工作区。Provider为现成loopback fixture，synthetic credential，不是外部API。
- 旧验收结果仅作入口和缺项线索，不继承通过。MN01–MN04 要在当前基线复验。

## 逐项验收点与预期

状态用“通过 / 失败 / 未覆盖”。一个点仍有任一计划子项未执行时，整体标记“未覆盖（部分已验证）”；不得把子项通过等同整点通过。所有“原生”结果均来自当前版本真实 Electron UI，Provider 为隔离 synthetic fixture。

| 点 | 界面、状态、行为与预期 | 当前结果 / 证据 |
| --- | --- | --- |
| C01 | 新建空会话打开 Context：空态明确；有请求后 Composer、popup、完整面板模型容量和百分比同口径，五区块可达 | 通过：空会话完整Context明确提示“开始对话后，这里会列出喂给模型的上下文”；有请求时Composer/popup/完整面板均22%、≈7.2K/32.8K；五区块可达。见G4/G8、E04/E12/E21。 |
| C02 | 明细各分类（系统、规则、Skills、摘要、会话、工具）正确显示与筛选；用户/助手/工具调用/结果筛选可复原 | 未覆盖（部分已验证）：六分类计数可见；工具展开与原文、用户/助手/工具调用/结果多选筛选实际操作；未逐项展开系统/Skills与非空规则/摘要。见G4、E04。 |
| C03 | 超过500条明细连续加载，数量增长、末页无加载更多；分类总数与总token不随分页误变 | 未覆盖：当前85项，未装配>500合法数据；旧分页证据不继承。 |
| C04 | 非会话来源原文展开、下一页/末页正确；会话行能跳正确轨迹，缺记录有明确提示 | 未覆盖（部分已验证）：bash来源读取原文；用户行跳正确轨迹已验证。超长原文跨页、缺记录提示未覆盖。见G4、E04。 |
| C05 | 初始历史错误可重试恢复；revision变化主动刷新与stale拒绝后重读，不混入旧会话 | 未覆盖（部分已验证）：历史索引176/192→完成自动追平已观察；主动错误重试、revision/stale故障分支无安全现成装配。 |
| C06 | Usage/SQLite面板首次读取、分类/日期/搜索/状态过滤、分页、刷新正确；离页/重开可恢复，Context同期可用 | 未覆盖（部分已验证）：首次加载、日期四档、搜索/清空、四分类、刷新、离页再入、1页边界通过；首次USD基线后新增1→3条/360token。状态过滤、多页及故障恢复未覆盖。见G4、E11。 |
| B01 | 自动模式Bash审批显示三按钮和命令前缀范围；单次允许只执行本次，拒绝不执行 | 未覆盖（部分已验证）：无prefix建议时两按钮运行/拒绝实际生效；单次后下一条再次审批。带前缀第三按钮场景未具备。见G2、E01。 |
| B02 | 会话前缀授权后同前缀复用、不同前缀重新审批；授权不串会话 | 未覆盖：现成PAIR不带command prefix建议，未注入内部状态绕过UI。 |
| B03 | 完全权限连续两次普通Bash无审批且实际成功；硬拒绝仍拒绝 | 通过：完全权限实际连续执行printf1/2；管道硬拒绝仍被拒绝，轨迹有明确策略原因。见G2、E02/E07。 |
| B04 | 待审批时切完全权限：原卡消失、当前命令执行且只执行一次，后续自动；切回自动重新审批 | 通过：待审批切完全权限卡消失，当前printf1及后续printf2各出现一次成功结果；切回自动再PAIR重新审批。仅限该受控命令。见G2、E02。 |
| B05 | 待审批切会话后返回/刷新恢复正确；停止取消审批、无卡和残留任务；后台输出/终止可观察 | 通过：待审批刷新恢复、停止卡清除；BACKGROUND输出ready与kill结果可见；Residual07待审批→Residual06→返回，原审批卡及命令保持可操作。见G2/G8、E23。 |
| B06 | 权限说明准确、刷新/重开保持，会话隔离 | 通过：权限说明准确；Residual07完全权限在正常退出/进程重启后保持，Residual06始终自动；自动审批刷新保持已验。见G8、E27。 |
| S01 | 标题行搜索展开、查询、清空、Esc/关闭回触发器；点击外部失焦不抢焦点（MN04） | 通过：无匹配查询、键盘清空、Esc/关闭焦点回搜索按钮，点击外部Composer保留输入焦点；MN04本轮通过。见G5。 |
| S02 | 工作区/单列表/时间分组与过滤正确，默认每组5条及展开收起；需要处理分组在正确位置 | 通过：工作区/时间/单列表及过滤已操作；正常UI提交7会话，第7条显示当前会话+5普通会话与“展开其余1个会话”，展开/收起复原；待审批在时间分组顶部“需要处理1”。见G5/G8、E22/E24。 |
| S03 | 最近/手动排序、拖拽反馈、归档三态、取消归档、恢复默认正确，重开保持业务状态 | 未覆盖（部分已验证）：最近/手动选项、归档三态/取消归档/恢复默认已验；重启后手动排序设置及Residual05归档保持。原生drag多起点未观察插入线或次序变化，无法确认HTML5拖拽被工具触发，拖拽及拖后顺序持久化未覆盖，不据此报Bug。见G8、E28/E29。 |
| S04 | 新登记工作区即时出现，无需重启；移除最后项后无工作区禁发，选择有效项恢复 | 通过：原生文件选择器登记remote-workspace立即显示；移除最后登记项后有草稿仍禁发，重选有效目录后发送启用。历史会话恢复另列观察。见G5、E10/E15。 |
| S05 | 空registry创建普通默认工作区；已有项不补建；不擅自操作真实Documents或用户目录 | 未覆盖：使用现成显式registry，未执行安全重定向的默认Documents首次创建分支。 |
| T01 | 对话→轨迹→对话草稿保留，轨迹无Composer；表格/轮次/类型/时间轴和DSH参照有依据 | 未覆盖（部分已验证）：对话/轨迹往返保留草稿，轨迹无Composer，轮次/请求/类型/时间轴正常；无隔离DSH双页参照。见G3、E05/E07。 |
| T02 | 真实同session/recordId流式正文与详情在两时点增长；搜索新词、清空和折叠正确 | 通过：同request16两个时点正文及已打开详情增长，新增completed可搜索；Residual07搜索acceptance-1后清空恢复全部行，轮次/调用分别折叠为概述并可展开。见G3/G8、E06/E07/E25。 |
| T03 | Thinking默认展开及折叠状态、详情页签/JSON/参数结果Schema/关联跳转可用 | 未覆盖（部分已验证）：概述/预览/原始内容标签与工具参数结果可读、请求来源可见；无Thinking正文，未遍历Schema/全部关联跳转。 |
| T04 | 停止后恢复可编辑，部分正文保留；刷新/重开仍保留且不重复（MN02停止分支） | 通过：停止后正文保留、可编辑，CmdR及会话往返保持；Residual07部分正文+Stopped在正常退出/进程重启后单份保留，可粘贴草稿且发送启用（未发送，已清空）。MN02停止恢复分支通过。见G3/G8、E03/E05/E27。 |
| T05 | 立即失败与部分正文后失败的原因即时红色，刷新/重开一致且正文保留（MN01/MN02） | 未覆盖（部分已验证）：429失败即时显示，未刷新打开轨迹即红节点，MN01即时分支通过；无部分正文后失败fixture，刷新/重启失败矩阵未验。见G3、E13。 |
| T06 | 真实外部DeepSeek Thinking OFF/ON请求均完成 | 未覆盖：无本轮授权真实DeepSeek凭据，不把synthetic Provider当外部API成功。 |
| U01 | 会话统计模型用时、TTFT/TPS及重开口径一致；重试时间不漏计（MN03） | 未覆盖（部分已验证）：请求16显示TTFT64ms/总49.9s/生成49.9s/0.4tok/s；后续Usage49.95s一致。Journal独立对账、重试等待MN03未覆盖。见G3、E07。 |
| U02 | 本轮用量胶囊位置/新旧轮hover、弹窗provider/model/token/缓存/推理/费用明细正确，未知费用不伪零 | 未覆盖（部分已验证）：轮尾120tok胶囊弹窗provider/model、100输入20输出、缓存0、费用未知正确；新旧轮hover/推理费用组合未覆盖。见G3、E08。 |
| D01 | 单/多文件改动、折叠、行数、临时新建后删除过滤、hover diff和第N轮Review对应正确 | 未覆盖（部分已验证）：真实write_file后Write+1可展开内联diff；Review进入后明确提示非Gitworkspace。真实Git轮尾单/多文件卡与第N轮过滤未覆盖。见G6、E14。 |
| D02 | 真实present交付临时文件，名称/描述/图标/预览正确，改动开关不隐藏交付 | 未覆盖：现成Provider仅Markdown链接，不含真实present工具；未冒充交付卡。 |
| D03 | 临时文件默认打开/关联应用菜单/图标及Finder定位；必须观察系统最终状态，不能仅凭“已请求” | 未覆盖：未执行系统打开/关联应用/Finder；正文链接AX解析URL不证明点击行为，未判Bug。 |
| M01 | 模型列表发丝连接卡、状态文字圆点、模型开关正确；详情主标题/返回模型正确 | 通过：代表连接发丝卡、状态/服务主标题、返回模型、默认禁关已验；非默认fixture-alternate关闭后1/2，恢复后2/2。完整主题矩阵另由V01保留边界。见G1/G8、E16/E26。 |
| M02 | 添加连接各路由→配置→返回添加连接；模型编辑返回自身连接，键盘可达 | 通过：10条添加路由逐一进入配置并返回目录；编辑fixture-alternate后Tab聚焦“返回Acceptance Fixture”、Enter回所属连接，再返回模型列表。为代表性键盘路线，不声称所有控件逐一键盘遍历。见G1/G8、E26。 |
| W01 | 搜索与网页读取入口，五来源、并行聚合/费用说明可读；DeepSeek搜索/抓取默认关闭 | 通过：入口、五来源、聚合/去重/费用说明可读；缺Key下DS无已启用搜索，抓取off+disabled。真实搜索API未调用。见G1、E17/E18。 |
| W02 | 缺Key搜索/抓取不能启用；共享模型/搜索/抓取Key和更换影响说明明确，空输入不能保存 | 通过：无Key不能启用、共享模型/搜索/抓取Key及更换影响说明明确；安全输入为空，保存disabled。未输入/显示密钥。见G1。 |
| W03 | DeepSeek/智谱/Tavily来源独立启停，抓取独立；TinyFish/Exa未遍历则单列 | 未覆盖：仅全局联网开关开→关；未连接独立来源，没有来源/抓取启停组合证据。 |
| W04 | 设置保存后离页/重开保持；无真实Key不得声称外部搜索/抓取成功 | 未覆盖（部分已验证）：全局off保存后离页/返回保持；独立来源启停保存及完整进程重启未验。 |
| P01 | Space代表入口、Actor引用/审批/名册一条典型路线可用，标明纯前端演示边界 | 未覆盖：固定生产构建默认隐藏Space/dev mock属预期；浏览器原生认证受限且未另装安全mock实例。 |
| V01 | 复用Context/Usage/审批/轨迹/用量/交付/模型/搜索路线检查light和dark可读、颜色/焦点/浮层无明显错误 | 未覆盖（部分已验证）：常宽浅色审批/停止/设置，深色搜索/轨迹/用量/Context/侧栏；窄窗搜索浅深两主题通过。详见组合表；交付及完整矩阵未验。 |
| V02 | 约480px复用上述路线，检查滚动、按钮、弹层、表格横滚及键盘焦点；未遍历组合明确保留 | 失败：约482CSSpx浅色常规会话Composer/Context左缘越界，DA01；搜索浅深窄窗与Usage/轨迹代表路线已操作，完整矩阵未覆盖。见E11/E12/E13/E19。 |

## 操作分组与证据

1. **G1 无凭据首次启动→设置→模型→搜索→工作区**：先核对隔离workspace与正确应用身份；走M01/M02/W01/W02/S04/S05，记录首次默认项、缺Key禁用、返回路径；主题/窄窗先复用设置主路线。证据：首屏/缺Key/模型详情返回和480px。
2. **G2 新会话→自动审批→授权→权限切换→停止/恢复**：使用现成PAIR/TOOL/DENIED/BACKGROUND，覆盖B01–B06，并复用S02需要处理和T03工具详情。保留审批前、单次结果、切模式当前命令结果、停止后无卡/可输入、重开状态；工具执行一次由脱敏Journal补证。
3. **G3 同会话流式→轨迹→停止或失败→重开→统计**：使用现成hold/stream/failure fixture覆盖T01–T05/U01/U02，首尾证据必须同session/recordId；已有故障fixture读取真实用户设置的脚本禁止执行。真实外部Provider T06无凭据即未覆盖。停止与失败分开记录。
4. **G4 历史Context/SQLite→分类/分页/刷新→轨迹**：复用既有合法历史fixture覆盖C01–C06；长明细与原文分页现场记录中间页，不能以终点推断。错误/stale注入只通过已有fixture能力；无能力则说明原因。
5. **G5 侧栏→搜索/分组/排序/归档→登记临时目录**：覆盖S01–S04、MN04键盘焦点路线；归档/恢复默认只针对新隔离数据。证据含Esc后焦点、排序与归档前后、即时新增项。
6. **G6 轮尾改动→Review→交付→预览→系统应用**：覆盖D01–D03/U02；在测试临时文件上观察真正系统打开与Finder定位。若现成fixture仅renderer样例，明确UI mock边界。
7. **G7 复用主题/窄窗→Space代表路线→收尾**：覆盖V01/V02/P01，列实际“页面×主题×宽度”组合；保存最终状态，正常退出隔离实例，核对拥有的服务/后台任务清理。

按场景连续操作，不为每个点机械重复导航；关键中间状态当场观察。一个Bug只阻断受影响点，其余继续。

## 执行前准备事项（保留原计划，非当前待执行项）

- 完成本轮依赖/renderer/Electron构建，给出固定构建或稳定dev实例日志、appName/appId、renderer URL（若需mock）和PID归属。
- 独立data/workspace及只含隔离目录的workspace registry；默认Documents分支若验收需既有安全装配，不能指向真实用户目录。
- 可复用的现成agent-refactor fixture（PAIR/TOOL/HOLD/DENIED/BACKGROUND）；告诉我是否已有prefix/present/partial-failure/retry与Context>500合法历史装配。没有则先保留未覆盖，不编写新自动化。
- 若使用mock浏览器，为本子任务单独URL/标签；不得触碰Web/官网子任务标签。Chrome授权错误可能限制mock；原生app检查后决定。
- 无真实外部Provider凭据时，T06及实际搜索/抓取API调用保留未覆盖。

## 最终执行结果与复现路线

37点最终台账：**14点通过、1点失败、22点未覆盖**；其中14个未覆盖点含已验证子项，以上逐点文字是覆盖边界的唯一依据。数字不按操作分组计算，也不把单测或旧截图合入通过率。

### G1 设置、模型、搜索（原生）

1. 设置→模型：Acceptance Fixture卡显示中转站/OpenAI Chat/loopback/未测试；进入后主标题为连接名，左端返回模型；默认fixture-main禁止关闭，两个模型均启用。实际点返回回到列表。
2. 添加服务→依次选择Moonshot、DeepSeek、MiniMax、OpenAI、Anthropic、Z.AI、Xiaomi、火山方舟Coding Plan、OpenRouter、自定义服务，每条进入相应标题并点“返回添加连接”，目录恢复。全部未保存、未输入Key。
3. 搜索与网页读取：0/5连接，五来源及费用/并行去重说明；DeepSeek抓取off且disabled。点连接DeepSeek，空安全输入，共享模型/搜索/抓取和更换影响说明可读，保存disabled。全局联网开→关，已保存，离页返回保持off。
4. 常宽light/dark，以及约482CSSpx light/dark复用搜索路线；布局/文案/按钮可达，见E17/E18。

### G2 Bash（原生+现成Provider）

- 自动模式发送FIXTURE_BASH_PAIR：printf1审批点运行→Ran/exit0；printf2再次审批点拒绝→user-denied。无prefix建议，故只看到运行/拒绝两按钮，不把第三按钮记为通过。
- 再PAIR待审批时切完全权限，当前卡消失，Worked展开有printf1/2各一次成功。完全权限发送FIXTURE_BASH_DENIED仍显示硬拒绝；轨迹原因是管道/重定向无法安全分类。
- BACKGROUND显示后台运行→输出ready→bash_kill结果killed，轨迹含task notification。
- 切回自动再PAIR，审批重现；CmdR后仍待审批；停止后审批卡清除，可输入。停止后发新输入出现“已暂停/继续发送”，点击后执行一次。失败后的下一输入同样可通过此入口恢复。根据当前后端契约，发送新输入本身不解除暂停；该桌面行为不是Web WA01。

### G3 流式、停止、失败、统计（原生+现成Provider）

- 首次HOLD等首段“Fixture streaming; waiting for release.”，打开轨迹及同request14详情，停止后正文与详情保留。返回对话CmdR后仍见该正文+Stopped；后续切换会话返回也仍在。轨迹往返保留草稿。
- 第二次HOLD，request16同条记录与详情预览均只有首段（E06）；通过现成fixture control release解除hold，未刷新详情变为“首段+Fixture completed…”、状态已完成、20tok（E07）。搜索completed后该记录仍在。64ms TTFT，49.9s生成/总时间，0.4tok/s。49.9秒是人为fixture hold，不能当产品响应延迟；当前原生工具观察约0.1–1s。
- 现成control retry-next-run令下一请求返回429，UI即时显示错误；未刷新进入轨迹request17已有红色失败节点（E13）。当前fixture只产生首次失败，没有成功自动重试，因此不算MN03，且不覆盖部分正文后失败。
- 轮尾用量120tok弹窗显示fixture-alternate、输入100/输出20、缓存0、费用未知（E08）。

### G4 Context与Usage（原生、真实IPC/SQLite）

- 当前Context popup与完整面板22%、≈7.2K/32.8K；完整面板可见当前、统计、明细、趋势、事件。历史同步176/192→完成后统计7轮15步/1.7K正常，未注入错误。
- 明细85项：系统5、工具21、规则0、Skills27、摘要0、会话32。工具bash点展开，再读取原文；真实内容展开。会话用户/助手/工具调用/结果切换是多选，实际操作至单类结果；用户行跳轨迹到正确消息。未出现>500或原文下一页。
- Usage首次查询加载后0条（原始现场保留在本任务AX输出）。主智能体只读核对首次生成global-usage-reset.json，正式USD迁移政策规定从清空时间后新请求统计；不是点击重置、不是关闭recordUsage，也不修改reset文件补入历史。
- 基线后发普通请求再入/刷新：1请求120tok，后续累计3请求360tok。请求/服务商/模型/工具四分类，搜索无结果→清空，24h/7d/30d/全部均切过；离页返回状态保持。当前3条1页，上一页/下一页disabled。窄窗模型定价弹层未知值可读，Tab及ShiftTab回模型按钮焦点完整可见（E11）；未验证跨多页与右侧全部列键盘矩阵。

### G5 侧栏与工作区（原生）

- 搜索无匹配查询→键盘清空恢复；Esc及关闭按钮后焦点回搜索触发器。展开搜索后点击Composer，搜索关闭，焦点留Composer且能粘贴正文；MN04通过。
- 切工作区/按时间/单列表，手动/最近选项随分组正确出现，按时间手动禁用。归档一个非当前会话，隐藏状态不见；仅已归档出现且标记已归档，全部状态可见；取消归档后仅归档空态。恢复默认回工作区/最近/隐藏。初轮仅2会话；默认5条/更多与需要处理分组在G8补齐。
- 原生文件选择器选本轮remote-workspace，新登记立即进侧栏且新会话选中它（E10），无需重启。移除remote再移除最后workspace，新建页无工作区，有草稿仍disabled“请先选择工作区”（E15）。重新原生选择有效workspace后发送启用，未发送该草稿，已清空。
- **观察，不判Bug**：fixture最初registry路径为/tmp，原生选择同目录返回/private/tmp；重新登记后该工作区暂无会话（E20）。原始session数据未被本子任务删除，导航后退仍打开旧会话。该别名/fixture起点与会话归属契约未独立确定，不能把“发送门禁恢复”扩成“历史恢复通过”。

### G8 既定残项补验（原生，同一隔离数据）

父任务复核后恢复同fixture与固定Electron，只补既定残项，不重跑已通过全套。初次补验runner64930/PID52836；正常CmdQ退出且ps确认进程不存在后，父任务以session12378重开同一data/registry/workspace。

1. 新建空会话→打开右侧Context，明确空态提示（E21）；之后正常UI发送并命名Residual01–07，每条均有真实120tok受控回复，未内部注入会话。当前会话不占默认5个名额，因此第7条才出现“展开其余1个会话”；点击露出Residual01并变“收起”，收起后恢复隐藏（E22）。这是源码SESSION_GROUP_LIMIT=5的当前例外规则，不能误认默认显示6条为Bug。
2. Residual07发送PAIR到printf1待审批→切Residual06→返回07，审批仍在、命令不变（E23）。切按时间，顶部出现“需要处理1”及Residual07待审批（E24）。切完全权限后当前与下一命令成功，Residual06仍自动。
3. 视图切手动排序；在已观察窗口坐标上通过原生drag尝试会话标题、行空白与左缘，未观察插入线或排序变化（E28）。不能确认工具触发HTML5拖拽，故不签拖拽通过、不新报产品Bug。后续重启确认手动排序选项保持，但未产生新顺序，不能声称拖后顺序持久化。
4. 轨迹输入acceptance-1过滤→清空，所有原始行恢复；收起轮次出现“1个步骤/3个步骤”概述，重新展开；收起调用出现“1个工具调用·bash”概述（E25）。流增长仍沿用本轮先前同request16证据。
5. 模型fixture-alternate开关on→off（已开启1/2）→on（2/2）；默认fixture-main仍禁止关闭。点编辑alternate，Tab聚焦返回Acceptance Fixture、Enter回同名连接（E26），再点返回模型回卡片列表。未进入Key编辑。
6. Residual05在非当前状态归档。Residual07发送HOLD，首段出现后点停止，保存正文+Stopped（E27前图），正常CmdQ；父任务重开后同会话仍只有该首段和Stopped，权限完全保持。Residual06自动保持；Residual05在隐藏归档时不见，切仅归档显示“已归档”（E29）；手动排序仍Value1。回07粘贴草稿后发送可用，清空未发送，第二次原生CmdQ正常退出。

### G6 文件与交付边界

原生发送FIXTURE_TOOL，审批pwd后实际write_file result.txt，Worked展开Write +1，点开内联diff显示+Fixture result.。Review打开后明确“Current workspace is not a Git repository.”及暂无变更（E14）。这仅覆盖真实工具差异展示，不能代替Git轮尾卡。普通Fixture正文的“查看结果”（目标为result.txt）只是Markdown链接，AX标准解析URL不是点击回调结果；最终未点击，不报解析Bug，也不算present或系统打开。

### 主题、尺寸与证据组合

| 路线 | 浅色常宽 | 深色常宽 | 浅色约482px | 深色约482px |
| --- | --- | --- | --- | --- |
| 搜索/缺Key | 已验E17 | 已验E18 | 已验E18 | 已验E18 |
| 模型 | 详情/返回已验 | 卡片及添加返回已验 | 未逐项验 | 卡片代表E19 |
| Bash | 审批/权限已验E01/E02 | 未补完整 | pwd审批已验 | 未覆盖 |
| 轨迹/停止/失败 | 停止刷新已验E03 | 流增长/详情已验E06/E07 | 轨迹/即时失败E13/E19 | 未覆盖 |
| Context | popup/完整入口已验 | 来源全文/筛选E04 | popup失败DA01/E12 | 未覆盖 |
| Usage | 首次/刷新已验 | 新请求/分类已验 | 结果/焦点E11 | 未覆盖 |
| 轮用量 | 未补完整 | 胶囊/弹窗E08 | 未覆盖 | 未覆盖 |
| 侧栏/工作区 | 搜索/首次已验 | 过滤/新增E09/E10 | 无workspace门禁E15 | 未补完整 |
| 交付/系统打开/Space | 未覆盖 | 未覆盖 | 未覆盖 | 未覆盖 |

原窗口截图2880×1722（约1440CSS宽）；窄窗原生拖拽后964×1722（约482CSS宽，2×缩放）。窗口minWidth=480有源码依据。截图扩展名统一沿既定png命名；原生工具返回的压缩媒体仍可正常预览，未修改截图内容。

## 本轮新Bug

### DA01：约482px常规会话Context/Composer左侧越界

- 影响：受支持窄窗下Context弹层与Composer左边缘被裁；标题贴到窗口外缘，左侧边框/圆角不完整。仅阻断V02窄窗视觉，不阻断其他交互点。底部“本机”换行另记观察，不单列Bug。
- 复现：有历史会话→原生拖窗口至约482CSSpx→侧栏自动收起→点Composer底部22%上下文→关闭→再次点开；两次均出现（E12）。
- 预期：Composer和等宽Context浮层在视口内保留完整边距、内容和圆角。
- 实际：常宽正常；窄窗普通会话Composer及Context左缘出界。新建页窄窗Composer仍有完整左右边距（E15），有助区分场景。
- 证据：首次窄窗（本地证据：`screenshots/native-context-light-narrow.png`，不随仓库分发）、关闭再开（本地证据：`screenshots/native-context-narrow-reopened.png`，不随仓库分发），均为原生全窗截图；主智能体已独立查看图像确认。
- 只读定位：`apps/desktop/src/main/window-security.ts:24`支持minWidth480；`ContextPopup.tsx:13`宽跟随anchor，`:88`为avoidCollisions=false；`Composer.tsx:41`有窄窗宽度规则。
- 推断（未证实）：普通会话父布局或状态行最小内容宽可能撑宽Composer，浮层跟随anchor且不做碰撞修正；本轮未做DOM尺寸测量，不声明根因，不修复。

## 证据索引

所有文件位于相邻screenshots/，只列本子任务native前缀证据；其他子任务文件未由本子任务操作。

| 证据 | 文件/支持的关键状态 |
| --- | --- |
| E01 | native-bash-approval.png（本地证据：`screenshots/native-bash-approval.png`，不随仓库分发）：自动模式首条审批 |
| E02 | native-bash-full-switch-results.png（本地证据：`screenshots/native-bash-full-switch-results.png`，不随仓库分发）：待审批切完全权限后的两条结果 |
| E03 | native-stopped-body-reloaded.png（本地证据：`screenshots/native-stopped-body-reloaded.png`，不随仓库分发）：停止后CmdR正文仍在 |
| E04 | native-context-source-dark.png（本地证据：`screenshots/native-context-source-dark.png`，不随仓库分发）：Context来源原文 |
| E05 | native-trajectory-held-before.png（本地证据：`screenshots/native-trajectory-held-before.png`，不随仓库分发）：首次停止前的正文与详情 |
| E06 | native-stream-before-dark.png（本地证据：`screenshots/native-stream-before-dark.png`，不随仓库分发）：request16增长前 |
| E07 | native-stream-after-dark.png（本地证据：`screenshots/native-stream-after-dark.png`，不随仓库分发）：同request16正文/详情增长、计时 |
| E08 | native-turn-usage-dark.png（本地证据：`screenshots/native-turn-usage-dark.png`，不随仓库分发）：轮用量 |
| E09 | native-sidebar-archived-dark.png（本地证据：`screenshots/native-sidebar-archived-dark.png`，不随仓库分发）：仅归档筛选 |
| E10 | native-workspace-added-dark.png（本地证据：`screenshots/native-workspace-added-dark.png`，不随仓库分发）：新工作区即时显示 |
| E11 | native-usage-light-narrow-focus.png（本地证据：`screenshots/native-usage-light-narrow-focus.png`，不随仓库分发）：3请求360token、模型焦点 |
| E12 | native-context-light-narrow.png（本地证据：`screenshots/native-context-light-narrow.png`，不随仓库分发）、native-context-narrow-reopened.png（本地证据：`screenshots/native-context-narrow-reopened.png`，不随仓库分发）：DA01 |
| E13 | native-failure-immediate-light-narrow.png（本地证据：`screenshots/native-failure-immediate-light-narrow.png`，不随仓库分发）：request17即时红点 |
| E14 | native-review-nongit-light-narrow.png（本地证据：`screenshots/native-review-nongit-light-narrow.png`，不随仓库分发）：真实Review非Git提示；inline diff为现场AX |
| E15 | native-no-workspace-light-narrow.png（本地证据：`screenshots/native-no-workspace-light-narrow.png`，不随仓库分发）：有草稿无workspace禁发 |
| E16 | native-model-card-dark.png（本地证据：`screenshots/native-model-card-dark.png`，不随仓库分发）：连接卡 |
| E17 | native-search-no-key.png（本地证据：`screenshots/native-search-no-key.png`，不随仓库分发）：首次五来源/缺Key |
| E18 | native-search-dark.png（本地证据：`screenshots/native-search-dark.png`，不随仓库分发）、native-search-light-narrow.png（本地证据：`screenshots/native-search-light-narrow.png`，不随仓库分发）、native-search-dark-narrow.png（本地证据：`screenshots/native-search-dark-narrow.png`，不随仓库分发）：搜索主题尺寸复用 |
| E19 | native-trajectory-light-narrow.png（本地证据：`screenshots/native-trajectory-light-narrow.png`，不随仓库分发）、native-window-narrow-attempt.png（本地证据：`screenshots/native-window-narrow-attempt.png`，不随仓库分发）：窄窗轨迹/模型代表 |
| E20 | native-workspace-reregistered-empty.png（本地证据：`screenshots/native-workspace-reregistered-empty.png`，不随仓库分发）：别名重新登记后空列表观察 |
| E21 | native-residual-context-empty.png（本地证据：`screenshots/native-residual-context-empty.png`，不随仓库分发）：空Context明确提示 |
| E22 | native-residual-sidebar-five.png（本地证据：`screenshots/native-residual-sidebar-five.png`，不随仓库分发）：当前+5条及剩余1条；展开/收起中间态见原生AX |
| E23 | native-residual-approval-return.png（本地证据：`screenshots/native-residual-approval-return.png`，不随仓库分发）：跨会话返回原审批 |
| E24 | native-residual-attention-group.png（本地证据：`screenshots/native-residual-attention-group.png`，不随仓库分发）：需要处理分组 |
| E25 | native-residual-trajectory-fold.png（本地证据：`screenshots/native-residual-trajectory-fold.png`，不随仓库分发）：搜索清空后调用折叠 |
| E26 | native-residual-model-return.png（本地证据：`screenshots/native-residual-model-return.png`，不随仓库分发）：键盘返回所属连接、2/2恢复；开关off中间态为原生AX |
| E27 | native-residual-before-restart-stopped.png（本地证据：`screenshots/native-residual-before-restart-stopped.png`，不随仓库分发）、native-residual-after-restart-stopped.png（本地证据：`screenshots/native-residual-after-restart-stopped.png`，不随仓库分发）：跨进程停止正文保持 |
| E28 | native-residual-sidebar-before-drag.png（本地证据：`screenshots/native-residual-sidebar-before-drag.png`，不随仓库分发）、native-residual-sidebar-drag-attempt.png（本地证据：`screenshots/native-residual-sidebar-drag-attempt.png`，不随仓库分发）：原生拖拽尝试，无已确认次序变更 |
| E29 | native-residual-archive-reopened.png（本地证据：`screenshots/native-residual-archive-reopened.png`，不随仓库分发）：重启后仅归档仍含Residual05 |

部分路径以现场原生AX和任务工具记录为证，未保存磁盘截图的中间态不会伪造媒体链接。启动日志和Provider控制是工程辅助证据；不代替UI操作。

## 未覆盖原因与服务清理

- 缺现成安全数据/fixture：Context>500、超长原文跨页、stale/revision故障、prefix建议授权、partial-stream失败、真正自动重试等待、present、真实Git轮尾卡。
- 缺真实外部Provider凭据：DeepSeek Thinking OFF/ON、外部搜索与抓取；未读取用户Key，未尝试外部付费调用。
- 原生浏览器清单受apikey认证限制；本子任务原生Electron可用，未将限制描述为CU全局不可用。固定生产构建隐藏Space/dev mock是预期，未装额外mock实例。
- 默认Documents首次创建、DSH双页、系统打开/Finder、完整主题尺寸矩阵仍未覆盖。停止正文/权限/归档的进程重启在G8补齐；独立来源搜索设置的重启矩阵仍未覆盖。旧HMR现场未重造；旧证据不继承。
- 本子任务未创建服务。早期dev app PID32725及首轮固定app PID44933均原生CmdQ退出；后者ps确认不存在。补验由父任务恢复fixture supervisor52786/Host52787，固定runner64930/PID52836正常CmdQ退出且ps确认不存在；随后父runner12378重开同隔离环境，完成G8后已再次原生CmdQ退出，父任务确认runner12378退出码0。全程未自行另起Electron实例。
- 父任务已确认最终fixture stop返回stopped=true，Desktop及Web/Site共8个测试端口均无监听，cleanup.json已追加final。BACKGROUND工具已经bash_kill成功，所有审批均结束，无未处理运行。只保留隔离数据与本地证据，不清理/移动用户文件，不提交推送。
