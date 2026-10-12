# Computer Use 验收记录

状态：按用户调整后的验收边界恢复收尾；旧轮结果与失败记录保留。M 最终统计及 M/L 日常交互已完成；继续剩余验收；L 完整统计仍待验，计划未整体签收。执行者：指定 gpt-6.1-sol 子智能体。只操作验收界面，不修改业务源码。

## 验收点与路线

- C1：空、当前、仅历史会话的五区块，Composer 同口径和未知上限。
- C2：真实 Loop 输入、工具、完成及下一 step 的实时 Context。
- C3：用户、助手、工具筛选，普通行和最新类型的轨迹定位、缺失提示。
- C4：超过 500 明细、分类、非会话原文分页和 stale 恢复。
- C5：压缩、模型/模式切换、重试、比较、趋势、事件。
- C6：Usage 冷同步和 Context 同时使用，离页、取消、重开恢复。
- C7：切会话迟到、历史追平、故障重试、Usage 清零与会话累计。
- C8：浅深主题、常宽/480px、结果/空/加载/错误、键盘和滚动。
- E1–E6：完整继承 acceptance.md 引用的 Usage 首次同步、结果交互、状态恢复、历史查询、视觉尺寸及 M/L 真实流畅度清单。

分组：浏览器 mock 连续错误→重试→明细分页→原文→类型/轨迹→主题尺寸；隔离小 Electron 真实 Loop 和可执行 Usage；随后主智能体准备 M/L 后串行执行联合/历史路线；隔离故障由主智能体注入后再验。分组不替代逐点覆盖。

## 浏览器 mock 已观察

入口 `http://127.0.0.1:5197/?mock=context-pagination`，通过 cua_repl 的真实浏览器 UI 点击和 DOM 可见文本观察；不能证明真实 SQLite/IPC/Loop。

1. Composer 初始显示 0%，popup 为 ≈0 / 0 Token；打开完整 Context 显示 ≈78.4K / 200K、39%。已交主智能体，主智能体确认接线遗漏并修复。随后 reload 定向复验显示 Composer 39%、popup ≈78.4K / 200K，各分类同源；此 mock 差异已复验关闭，真实仍待验。
2. 完整面板具备当前上下文、会话统计、上下文明细、趋势、事件五区块。初始历史错误为“演示：历史索引暂不可用，请重试。”，会话统计显示 —，未冒充 0。
3. 点击重试后错误消失，统计变为 8 轮、47 步、1 次压缩、94.2% 缓存、累计 1.8M、$0.42。
4. 明细按 100→300→500→670 实际点击加载，最终加载更多按钮消失；总估算持续 ≈78.4K，工具最终 640 项、系统1、规则3、Skills2、摘要1、会话23。
5. 工具搜索“演示工具 0”只显示该行。展开并读取原文，第一页为“这是显式演示工具的原文第一段。”，下一页为“这是原文第二段。”，末页不再显示下一页按钮。
6. 用户类型筛选实际显示3行，并出现“在轨迹中打开最新用户”。点击最新用户打开轨迹详情，预览为第40轮；mock示例文案与轨迹fixture不同，不能据此签收同messageId定位。普通用户行已点击，但尚未完成缺失提示/正确目标验证。助手筛选补验显示4行及“在轨迹中打开最新助手”。工具调用操作前开发重载关闭了面板，未完成。
7. 浅色480×800截图现场观察：当前Context和明细均可读，无明显重叠；深色常宽截图现场观察同样可读。截图仅在工具输出中，尚未保存磁盘，不能引用不存在的媒体文件。
8. viewport切换和设置页返回后面板重新加载为100项，分页/筛选局部状态丢失；可恢复，但未判断为契约缺陷。

## 真实应用准备与限制

应用身份来自 `artifacts/context-sqlite/cu-dev.log`：`Actspace Dev actspace-agent-2067` / `com.actspace.desktop.dev.w2067fa05`。

`logs/desktop-v2.log` 的 2026-10-11T14:32:05.521Z `v2 data directories ready` 确认 dataRoot 为 `/tmp/actspace-context-cu-20261011/desktop-data`。只读核对该目录 workspaces.json：folder `/tmp/actspace-context-cu-20261011/workspace` 存在，但自动添加的 default 为 Downloads，不能误称所有workspace已隔离。

真实应用已通过 cua_repl 打开，显示空会话、fixture-alternate、workspace选择菜单中隔离folder。未成功发送任何请求。原生 getAXState/getScreenshot 每次约60–63秒；主智能体构建/HMR期间多次出现刚获取的元素ID失效、菜单关闭，输入仍空。此为工具/开发重载限制，不据此断言产品冻结。待稳定运行后继续。

## 当前逐点结论

| 点 | 当前结论 | 已覆盖与剩余 |
|---|---|---|
| C1 | 通过（约定覆盖范围） | 当前五区块/Composer同口径、真实新建空会话提示通过；仅历史请求来源与取整一致通过；未知上限真实IPC合法旧历史fixture通过 |
| C2 | 通过（小真实链路） | 输入→审批→bash→write_file→完成及下一请求自动更新；loopback provider，不是外部模型API |
| C3 | 通过（约定覆盖范围） | 四类mock筛选、真实普通bash行、真实最新用户/助手正确定位、mock缺失提示关闭通过；最新工具调用/结果真实定位通过（同write_file fixture-18） |
| C4 | 通过（约定覆盖范围） | mock670条和原文两页通过；受控合法历史真实IPC621条/分类/末页通过，历史无原文提示通过；真实Loop规则原文64KiB两页及末尾通过；revision变化主动清旧/重读通过，后端stale拒绝与重读恢复通过（后续受控真实后端证据） |
| C5 | 通过（约定覆盖范围） | 真实压缩、模型名/推导事件、比较/趋势更新通过；M容量32.8K→65.5K通过；合法历史趋势500/事件200截断提示通过；Chat→Agent→Plan→Agent及请求Context更新通过；单次429轨迹失败明确、未重复累计；自动重试成功不适用默认maxAttempts=1，非产品Bug；受控压缩失败→产品重试成功通过 |
| C6 | 部分通过（L剩余由用户取消） | M取消/重试/离页/重开继续、live Context保持通过；M日常交互/取消续跑及最终结果通过；L普通消息/工具/切换/取消/重试/离页返回继续通过，L重开恢复超越旧94水位通过；完整最终结果未验证通过  L剩余用户于2026-10-12明确取消，不作为本轮完成门槛；未验证通过 |
| C7 | 通过（约定覆盖范围） | 自动追平、C-02/C-03修复定向复验通过；owner故障/恢复通过；新建列表返回不抢选中通过，受控hold切会话release隔离/切回历史追平通过；受控停止后历史5轮5步360追平通过；真实未fsync尾部暂停累计保持旧值，释放后单次120增量通过（持久描述符等待由主端运行时证据确认） |
| C8 | 通过（约定覆盖范围） | mock错误/重试/浅窄深宽；真实浅深宽/约480px结果、滚动、C05双向键盘焦点修复通过；真实Context空态浅深×常宽/483px通过；真实Context加载浅深×宽窄通过；整体错误四组合原截断Bug保留，新版中文提示/展开换行定向复验通过；Usage独立loading四组合通过；整体error四组合C-16已修复定向复验：中文摘要、展开详情换行、重试完整，实际重试恢复通过 |
| E1 | 部分通过（L剩余由用户取消） | 真实小样本加载→结果/空态通过；M旧轮首次最终发布超时保留；本轮续跑最终结果与独立计数一致通过；L首次读取/取消恢复通过，最终结果用户于2026-10-12明确取消，不作为本轮完成门槛；未验证通过 |
| E2 | 部分通过（L剩余由用户取消） | 真实搜索/无匹配/清空、24h、状态、各Tab、刷新、单页禁用通过；M日志前后页、24h/全部、各Tab、搜索/清空/状态/刷新通过；鼠标拖横滚条双向实效通过（Small后续证据），键盘横滚通过；L最终全部及结果分页/筛选未验证通过；普通Small 7天/30天逐一结果已补验通过（均618请求/79,930Tokens）  L剩余用户于2026-10-12明确取消，不作为本轮完成门槛；未验证通过 |
| E3 | 部分通过（L剩余由用户取消） | owner SQLite单点故障下明确fallback、刷新/重试与真实请求可用；M取消/重试/离页反馈、重开继续、小库故障恢复提示消失通过；整体Context错误真实点击产品重试门控恢复通过  L剩余用户于2026-10-12明确取消，不作为本轮完成门槛；未验证通过 |
| E4 | 通过（约定覆盖范围） | 真实M 610项13页连续检索、跨workspace、短语/清空、正确正文轨迹通过；L目录首次合法重验后热搜0609、跨workspace正文、返回原真实会话Context通过；基准无Surface/旧Harness历史仅验证可读事实，不签可attach当前Harness |
| E5 | 通过（约定覆盖范围） | 真实Usage浅深宽/481px结果可读；双向键盘横滚通过；真实Context空态浅深×常宽/483px通过；Context加载矩阵通过；整体错误四组合中文提示/详情换行修复复验通过；鼠标拖横滚条双向实效通过（Small后续证据）；Usage独立loading四组合通过；整体error四组合C-16已修复定向复验：中文摘要、展开详情换行、重试完整，实际重试恢复通过 |
| E6 | 部分通过/仍有失败 | M General修复CU响应与主智能体采样改善；M旧轮发布超时保留；本轮M日常交互与最终统计通过，L大历史初验聊天/两工具/切换/Context/统计取消恢复可用；L完整最终结果未验证通过  L剩余用户于2026-10-12明确取消，不作为本轮完成门槛；未验证通过 |

性能U-01既有失败由主智能体报告；任何UI结果不覆盖性能结论。

## 固定构建小 Electron 第一轮

22:52:09 主智能体切换无watch固定构建，`context-acceptance-electron.cjs` 启动；CU确认 renderer 为 `file:///.../apps/desktop/dist/index.html`。重新核对 workspaces.json，default已改为测试workspace且仅一项。原生CU调用恢复约0.2–2秒，先前60秒不代表本轮UI性能。

- 新会话发送 FIXTURE_TOOL，出现自动标题，消息停留“1条排队，即将发送”，空闲、正文空。通过会话行重新打开仍未恢复。
- Settings通用默认模型/轻量模型显示未配置，但Composer fixture-alternate。通过正常UI将默认模型选为fixture-main，显示“已保存”；新会话发送 hello fixture仍停留队列。
- Usage首次打开可响应，显示0请求/0 Token、费用与缓存命中—；详细记录关闭，提示开启查看。此为小空态，只证明空态可读，不代签冷同步或M/L。
- 主智能体检查运行日志后定位为切换启动方式期间旧Harness Host锁保护期，非provider hold。按其安排，通过UI super+q正常退出，等待重启后复验队列恢复。根因属于主智能体运行时诊断，CU只证明上述可见行为。

截至此处，真实C2/C5尚未通过；退出动作已执行，重开最终恢复仍待观察。

## 固定构建重启后的真实链路

22:55:15 重启后，通过UI观察队列为“已暂停”，点击“继续发送”恢复第一条FIXTURE_TOOL并完成；再次发送FIXTURE_TOOL，实际出现pwd审批，点击“运行”，bash与write_file各完成一次。轨迹Result确认cwd为 `/private/tmp/actspace-context-cu-20261011/workspace`，write_file目标同隔离路径。

- C2：面板持续打开，观察内容≈24→27→244、当前≈6K/18%→≈6.3K/19%；工具调用2/结果2，统计2轮4步480。最近请求比较由第2轮步1自动更新为步3，趋势由#2到#4。真实Loop/Session/IPC通过；受控loopback provider，不是外部模型API。
- C1当前口径：popup≈6K/32.8K18%，完整面板同值；完成后Composer19%、完整≈6.3K/32.8K19%。五区块最终齐全。空/仅历史/未知上限仍未覆盖。
- C3真实普通工具行：点击Context“工具调用 bash≈39”，打开TOOL event31，payload pwd，Result含正确隔离cwd及exit0，同工具目标通过。
- C7历史追平：初始stats为—、同步进度显示`-1/19`，后23/25，停止输入后自动显示完整统计与趋势事件，无需重开。负数进度为C-02，主智能体修复待复验；不能把该显示缺陷记为通过。
- C5模型：通过Composer选择fixture-alternate，下一轮普通文本完成，当前模型变alternate、事件明确“模型已切换（根据请求推导）”。两个fixture同容量32768，因此容量变化尚未验证。
- C5压缩：输入/compact并Return，UI显示“上下文已压缩·9条消息·0s”、压缩1次、压缩事件。下一轮after compact完成后摘要独立1项≈56，内容≈270→48，总≈6.3K→6.2K，趋势出现✂压缩；未显示虚构回收0。失败重试/模式切换/截断仍未覆盖。
- E1小结果：Usage进入短暂“正在读取使用记录…”后得到5请求600tokens，费用未知且说明5次缺少依据。显示记录开启后日志7行（5模型+2工具），页1/1、上下页禁用。
- E2小结果：搜索no-match-cu-20261011显示无匹配和汇总0，清除恢复；服务商default5/600；模型main4/480、alternate1/120；工具bash1与write_file1；切24小时并刷新可响应；失败状态无匹配，清除恢复。小样本不覆盖跨页、M/L和横向滚动。

当前覆盖表以上述增量记录为准：C2主真实链路通过；C1/C3/C5/C7、E1/E2部分通过；C6/E3/E4/E5/E6仍未覆盖。全部剩余分项在最终报告保留，不能将部分通过升级为全项签收。

## 小 fixture 视觉、历史与清零补验

- 通过正常窗口边缘拖拽，将原生截图宽2880缩为962物理像素，按2x Retina约481 CSSpx；Context变浮层，浅/深上部与下部均可读，滚动到内容/趋势/事件可用，关闭浮层可恢复聊天。Tab焦点可达侧栏按钮。随后窗口恢复宽窗。
- Usage浅/深常宽与481px结果布局可读；窄窗表格存在超宽列，但原生scroll right实际纵向移动，本次未成功验证横滚，不能签通过。
- 历史搜索输入`"hello alternate"`，观察“正在搜索会话…”再命中当前会话；点击命中项后正文含hello alternate。no-match-cu-20261011得到“没有匹配的本机会话”，清空后提示消失。
- 新建空会话打开Context显示“开始对话后，这里会列出喂给模型的上下文。”，没有把未存在请求显示为真实0；此前暂停队列会话显示“当前没有可展示的上下文”，历史尚未追平时统计为—。这不是仅历史请求fixture，故仅历史仍未覆盖。
- 真实最新用户：先只选用户，点击“在轨迹中打开最新用户”，选中USER event82，详情为after compact/source81。真实最新助手：只选助手点击最新助手，选中ASSISTANT event89，详情Turn4 Step1/Request#6/fixture-alternate。两者均正确。
- C-03：主智能体在隔离data注入resetAt=2026-10-11T15:08:21.065Z（证据`artifacts/context-sqlite/cu-reset-injection.json`，没有改Journal）。UI正常刷新仍6请求720/日志8；离开Usage并返回同样旧值。主智能体确认已建索引热查询未应用reset边界，正在修复。Context累计仍720/4轮6步1压缩，但由于Usage未归零，联合要求失败待复验。不存在前端清零按钮，不声称执行过按钮清零。

实际截图证据位于`artifacts/context-sqlite/cu-evidence/`：real-usage-light.png、real-usage-dark.png、real-usage-481-light.png、real-usage-481-dark.png、real-context-481-light.png、real-context-481-light-bottom.png、real-context-481-dark.png、real-context-481-dark-bottom.png、real-history-empty.png、real-context-empty.png、real-context-latest-user.png、real-context-latest-assistant.png。上述均来自真实Electron CU；此前mock截图仅工具输出，不能混用为Electron证据。

## 23:13 新构建定向复验

- C-02：真实Context冷读观察“历史索引同步中（已处理0/94条记录）”，随后自动完成；不再显示-1。通过。
- C-03：先进入Usage，加载完成后0请求0Token/日志0；返回原Session，Context累计720/4轮6步1压缩保持。截图real-reset-usage-zero.png与real-reset-context-history.png。该结果为主智能体注入reset元数据+真实CU读结果，不代表前端存在清零按钮。通过。
- 新发送after reset verification成功完成，Context累计840/5轮7步1压缩，main≈6.3K19%与Composer19%一致；Usage仅1请求120、日志1，旧720未混入。真实新增记录与重建通过。
- C-04（主智能体已确认取整口径差异，修复待复验）：发请求前，Context注明“当前Context尚未加载，以下显示最近请求输入”，面板alternate≈6.2K/32.8K19%，Composer却18%（更早短暂20%）。历史来源说明通过，但两处同口径不能签收，截图real-reset-context-history.png。发新请求后恢复一致不能替代历史状态验证。
- 补充保存浏览器mock错误截图mock-context-error.jpg；此前mock覆盖记录依然只证明mock界面。

故障注入前已保存完整CU可访问状态`artifacts/context-sqlite/cu-evidence/real-before-fault-840-ax.txt`（840/5轮7步1压缩）及同名png；runtime采样由主智能体单独保存。按安排正常UI退出，等待隔离故障启动。

## owner SQLite 单点故障真实验收

主智能体首次将整个runtime-v2目录置为文件导致bootstrap退出；这次注入范围不成立，不能代表查询独立性，已恢复。随后仅将usage-read-model-owner.sqlite置为目录并保留备份，Journal及核心runtime不动。以下为后者实际CU结果。

- 启动成功、旧会话正文可读，侧栏明确“查询索引暂不可用，已从会话文件读取”。
- Context先显示同步0/108、统计—，随后保留840/5轮7步1压缩并明确“历史索引暂不可用，请重试”。点击重试后有界完成，仍错误提示与原累计，没有假零。
- Usage加载后明确“统计索引暂不可用，当前结果从会话记录读取。可刷新重试。”，结果1请求120、日志1；正常刷新后保持正确结果。
- 故障下发送during owner fault，fixture-main真实助手完成；Context自动追平960/6轮8步1压缩，仍明确历史索引错误。返回Usage经过正在刷新后追平2请求240、日志2，未混入reset前旧记录。
- C04历史来源定向复验：新构建重启无内存Context时，面板main≈6.2K19%与Composer19%一致，通过。未知上限的—仍未实际覆盖。

证据类型为真实Electron CU与截图：real-owner-fault-context.png、real-owner-fault-usage.png、real-owner-fault-request.png、real-owner-fault-usage-after-request.png（均位于artifacts/context-sqlite/cu-evidence/）。恢复后提示消失/数据保留尚待复验；E3故障降级/重试分项通过，取消/离页恢复仍未覆盖。

## 单点故障恢复与键盘横滚补验

主智能体恢复owner原文件并重启后，侧栏降级提示消失。打开正确的六轮会话，Context先同步0/122后自动完成，历史来源说明明确，累计960/6轮8步1压缩；Composer与面板均19%。Usage加载后2请求240、日志2，fallback提示消失。恢复通过，证据real-recovered-context.png、real-recovered-usage.png。

481 CSSpx真实窄窗下，表格区域scroll right及底部拖拽未产生横移（拖拽仅选择文字），因此鼠标/触控横滚仍未覆盖。点击模型按钮并Tab到会话、再Tab到Token，表格实际自动横移，Token/费用/耗时列进入视口，Token tooltip键盘可达；证据real-usage-keyboard-horizontal.png。反向Shift+Tab两次返回模型，焦点轮廓部分被表格左边裁切，未完全自动滚回，证据real-usage-keyboard-reverse-clipped.png；这是键盘反向焦点可见性待定位观察，不能把双向横滚签成全通过。窗口已恢复宽窗并正常UI退出。

## M 规模首轮：冷验证取消/离页

隔离data=/tmp/actspace-context-sqlite-m-20261011，runtime日志确认此sessionRoot。主智能体提供原1341000activities/1000sessions及新增610合法可见历史；规模来源属主智能体运行时事实，尚非UI最终结果证据。Node基准与Electron完整Harness codec digest不同，Electron需重新验证，不能将此轮称暖库/冷升级完成。

Usage初进24小时显示汇总—/暂无记录；切全部显示同步0/1610会话、已读取17920记录、取消按钮。点击取消后观察20992中间进度，随后明确“查询已取消，可刷新重试”，汇总—；重试重新同步0/1610、1792记录。同步中点击通用，最终进入通用；返回Usage保留已取消和重试入口。取消与离页有明确反馈，未伪装完成。截图m-sync-in-progress.png、m-sync-cancelled.png。原生工具调用14–25秒仅记录调用墙钟，应用响应性能结论须结合主智能体采样。

此轮Settings显示复制的默认模型不可用及small prompt路径；主智能体确认M synthetic secrets尚未预置，未发送请求。已正常UI退出，等待seed修正重启；M最终结果、历史连续分页、与Context并行仍未覆盖。

M provider补齐重启后，尚未打开Usage，侧栏与主正文一直“正在加载会话…”。搜索输入短语`"amber orchard"`可立即编辑，但保持“正在搜索会话…”，新建会话按钮点击无可见变化，无Composer可发送；已交主智能体定位，不据此签历史检索或M交互流畅度。主智能体另报告上一轮Main loop p95≈352ms/p99≈472ms显著失败，属于运行时采样证据，不能用CU工具时长替代。

## C06 新构建与 M 历史连续分页

旧现场完整AX最终确认短语结果与0609正文已返回；先前diff“无变化”不足以证明持续阻塞，后续以完整AX为准。截图m-before-c06-restart.png。主智能体采样list-page104/139秒仍作为独立性能问题。

C06修复后新建页面立即显示Composer，选择Default `/tmp/actspace-context-sqlite-m-20261011/cu-workspace`发送首条M live context first request，创建Session/自动标题，列表返回未抢到历史会话。但消息保持队列，无助手完成。主智能体定位克隆的Harness selection Host fingerprint不兼容，是fixture环境限制；本次不签首次发送成功，也不视为C06历史等待回归。

E4真实连续查询Visible：13页共610项，每页50（末页10），边界0609–0560、0559–0510、0509–0460、0459–0410、0409–0360、0359–0310、0309–0260、0259–0210、0209–0160、0159–0110、0109–0060、0059–0010、0009–0000；无缺口重复，末页无下一页。各页由真实UI AX逐页读取，记录m-history-pages.json。点击末页0000，正文body0/reply0；轨迹USER event2/ASSISTANT event3正文对应，截图m-history-0000-trajectory.png。此前0609与0000分别属于M Journal history与Default工作区，跨workspace检索与打开通过。

正文短语`"amber orchard"`命中0609等（标题不含短语），清空后结果消失。输入过一次不完整hard得到无匹配，随后setValue完整短语；不完整输入属于CU输入问题。E4标题/正文短语/无匹配/清空/跨workspace/超过500连续页/正确正文轨迹通过；旧benchmark的历史Context仅有受限fixture，仍不签可用。正常UI退出，等待主智能体修正隔离Harness selection后复验首次发送/C5。

## 兼容 Harness M live 与容量变化

主智能体仅备份fixture的旧harness-state，Electron正常初始化兼容选择，Journal/SQLite不改。CU新建全新Session，发送M compatible first request得到fixture-main助手完成，120tokens；列表刷新后仍选中新Session，C06首次发送/选中稳定通过。当前Context约6K/32.8K18%。Composer切fixture-alternate并发送M alternate capacity，助手完成，Context变约6K/65.5K9%，自动压缩阈值约49.5K，Composer9%，累计240/2轮2步；事件明确模型已切换（根据请求推导）。C5容量变化分项通过，证据m-capacity-change.png。

进入Usage初始仍汇总—/暂无记录，正常刷新后实际同步2/1612会话、已读11554记录。未点击取消，点击返回应用；中间进度35106，随后聊天Context正常显示alternate65.5K9%及240/2轮2步，选中未变。离页可能自动取消查询，需与重返/运行采样核对，不能称已完成并行冷同步。原生返回调用约10秒、后续完整AX约13秒，仅作为操作观察；主智能体正采Main CPU profile。

离页返回Usage自动开始同步2/1612，已读5888；其后保持页面运行，真实AX显示已读2297088事件、仍2/1612，证据m-sync-reentered-ax.txt。初步对照1341000activities怀疑超计数，主智能体纠正：UI读取记录是Journal events，总8548002，benchmark-0 targetSeq2394000；不能跨口径定重复扫描Bug。此项仅保留同步观察，不签完成。C05需要结果行，当前仍未复验。

## C08 重启前现场

固定新构建重启前，真实完整AX仍显示M Usage同步2/1612会话、已读取2297088记录，未显示最终结果。已保存m-before-c08-progress.png与m-before-c08-progress-ax.txt，随后通过正常Cmd+Q退出，通知主智能体启动新构建。C08通用设置按需搜索、C05反向键盘焦点等待定向复验；M最终结果与L规模仍未覆盖。

## C08 按需目标搜索定向复验

新固定构建中，进入通用设置正常呈现，无旧版全量重放等待。快速唤起打开目标选“指定会话”→打开选择器→搜索Visible，首屏50项（0000与0609–0561）→下一页0560–0511→选择0560。设置最终显示“指定会话 / 默认会话 Visible History 0560”，保存与分页选择通过，证据m-c08-target-selected.png。尚未实际按全局快捷键唤起；关闭启用后的选择器禁用态和未保存目标文案属于主智能体后续构建，当前未覆盖。

随后进入Usage全部，正常显示同步2/1612、已读取3记录及取消入口，保持页面供主智能体CPU采样，不取消不离页。M最终结果仍未完成，C05无结果行尚未复验。

C08补充新版CU通过：选择指定会话但未保存时，下拉正确显示“指定会话”；打开选择器后关闭快速唤起，搜索输入及结果移除，录制、目标下拉、选择会话按钮均disabled；恢复启用后入口重新可用，证据m-c08-disabled.png。随后进入Usage全部保持等待，不切页。重启后的目标回自动且聊天选中回旧排队Session，已交主智能体核对bootstrap种子影响，暂不据此定产品持久化Bug。

C08性能属主智能体运行时证据：Main loop p95/p99为12.75/14.17ms，30秒CPU profile约29.87秒idle，无legacy list-sessions；启动max433ms仍单列，不能抹去。C09 rowid seek探针改善不能替代M真实最终结果验收。

## C09 M 发布等待终态

保持同一Usage全部页面，进度2/1612、已读3→33，随后终态为错误：`Usage Worker timed out; retry after the current operation stops.` UI显示重试按钮、请求/Token/缓存—、费用未知，没有伪装最终零值。证据m-final-usage-ax.txt/png（final指观察到终态，并非成功）。M E1最终结果未获得；C05仍无明细行，未覆盖。错误已交主智能体定位，未擅自重试。

主智能体另确认C10：快捷键旧facade仅更新内存，v4文件保存旧metadata；上轮选中0560后重启回automatic确为持久化缺陷，已修并补重开回归，等待下一次CU重启复验。前述“bootstrap影响”仅当时待核对，不再作为解释。

## Small 独立应用 C05/C10 定向复验

主智能体另启Actspace Context Small（com.actspace.acceptance.contextsmall），原隔离小fixture数据；M应用保持后台同页，未退出。Small Usage24小时正确2请求240。约483 CSSpx窄窗，模型→Tab会话→Tab Token确实向右滚；ShiftTab两次回模型后完整文字及焦点轮廓均可见，深色与浅色分别通过。证据small-c05-dark-right.png、small-c05-dark-left.png、small-c05-light-left.png，C05已定向修复通过；鼠标横滚不据此签收。

C10搜索Fixture选择第一项Fixture automatic title，先显示保存中disabled，完成后恢复enabled且显示指定会话/该标题。离开到Usage再回General仍指定会话，并显示已保存指定会话，可搜索更换。已正常Cmd+Q仅退出Small，待主智能体读磁盘/重开后验重启保留；尚未签重启持久化。此轮未发送请求，不涉及Small Host兼容性验收。

C10重启CU闭环通过：再次重开Small并等“加载设置中”结束，General保持指定会话/已保存指定会话说明，证据small-c10-reopened-ax.txt。主智能体磁盘证据c10-persisted-target.json记录sessionId c8484d5a-a616-40b8-b6ab-3144d6abab64，属运行时证据，与CU分开。

C3尝试补真实最新工具：正确六轮工具会话当前历史Context已压缩，统计960/6轮8步1压缩，最近请求明细用户3/助手3/工具调用0/结果0；基准下拉只有最近请求/不对比。因此最新工具入口未实际可用，本项仍未覆盖，证据small-c3-compacted-no-tools-ax.txt；未用独立轨迹存在工具替代入口定位验收。Small已正常退出待受控C4fixture。

## 合法合成历史 C4/C5 真实 IPC 补验

验收点为621总量/连续分页/分类/末页/原文不可用与趋势事件截断；操作从侧栏已可见Context Large Legal Fixture直接打开，未重复搜索。该Session是主智能体经core codec验证的受控合成JSONL历史，不代表provider真实600次调用。

Context先0/4202同步后就绪，明确“当前Context尚未加载，以下显示最近请求输入”。最近第600轮，统计600轮600步78K。明细真实UI加载200→400→600→621，总估算始终≈19.2K/32.8K59%；末页加载更多消失，分类工具620+系统1。证据legal-200-ax.txt、legal-400-ax.txt、legal-600-ax.txt、legal-621-ax.txt。趋势/事件明确“展示最近500次请求、200个事件；会话统计包含全部历史”。工具fixture_tool_000展开明确“这一条没有可预览的内容”。C4真实>500/分类/末页及C5截断提示通过；stale、真实原文分页仍未覆盖（原文两页仅mock）。初始未加载popup容量—，历史就绪为32.8K，不代签真正未知容量。

## 最新工具与模式真实链路补验

原HTTP真实会话第7轮FIXTURE_TOOL仅助手120Token，主智能体确认provider误认runtime_context；修正fixture后仅再发一次第8轮，审批pwd→write_file隔离workspace/result.txt→助手完成360Token，未压缩。单选工具调用点击最新、单选工具结果点击最新，均选TOOL event159/write_file、Turn8 Step2、Source158/160；关联context fact callId fixture-18，C3最新两类型定位通过。证据small-c3-latest-call-ax.txt、small-c3-latest-result-ax.txt；多类型筛选可组合，需取消调用才是仅结果。

已开始Agent会话菜单仅Plan，无Chat，按产品支持边界另建空Chat。Chat普通请求成功，Context≈564/32.8K2%，web+generate_image两工具定义、0工具调用、120/1轮1步。退出Chat后chip消失、事件agent；选Plan发送普通请求成功，Context≈4.6K14%、10工具定义/27Skills、240/2轮2步，工具清单变化推导事件+模式plan。退出Plan成功，历史同步短暂统计—，未假零。证据small-chat-context-ax.txt、small-plan-context-ax.txt。C5模式UI/真实请求Context更新通过；两工具属于实际观察，产品契约由主智能体核对，未声称Chat必为零工具。

## 429失败与迟到响应隔离

主智能体注入单次429后发送retry acceptance。实际终态无助手正文、仅Worked；轨迹ASSISTANT event44“Assistant request failed”，run outcome failed，未观察到自动重试成功或按钮。证据small-retry-trajectory-ax.txt；不签自动重试通过，已交主智能体核对策略。

授权loopback /hold后发送late response acceptance；因前轮失败队列暂停，点击继续发送后明确“Fixture streaming; waiting for release”。streaming时切Context Large Legal Fixture，再/release；另一会话保持600轮600步78K、19.2K59%，无late正文串入。切回原会话late回复完成，历史57/62中间统计—后自动追平4轮4步360（前2成功240+late120，429失败未重复累计）。C7迟到隔离/完成后历史追平通过，证据small-late-other-ax.txt、small-late-return-ax.txt。停止消息分项未覆盖。M保持后台Usage未切页。

429契约核对：主智能体源码确认DEFAULT_LLM_RETRY_POLICY.maxAttempts=1且Desktop无覆盖，当前不自动重试。自动重试成功在当前默认配置不适用，不登记产品Bug；429失败/统计未重复与后续手动继续发送已CU覆盖。

C7停止补验通过：/hold→发送stop history acceptance→明确streaming→停止Agent，显示Stopped且空闲；/release后保持Stopped，无迟到完成回复。历史自动5轮5步360，停止请求实际输入0、累计未增加，证据small-stop-history-ax.txt。stale恢复/真实原文分页仍未覆盖，没有用源码或mock代签。

主智能体核对agent-mode-policy明确Chat允许web/generate_image，前述两工具定义与契约一致。为避免性能测量争抢磁盘，按主智能体安排记录M进度583/1612、已读4067492，正常Cmd+Q仅退出M，证据m-before-c12-pause-ax.txt；这是独立C12采样期间运行暂停，不是用户取消验收，最终M/L仍待恢复完成。

## Small 空态与真实规则原文分页补验

验收点：C8/E5 空态浅深主题、常宽及约483 CSSpx；C4 真实Loop规则原文超过64KiB、翻页、末页可达。路线：新建空会话保留四种状态→选择fixture-alternate发送普通文字→Context规则项读取原文→下一页→滚动末尾。

- Context空态四种主题/尺寸均实际观察，提示“开始对话后，这里会列出喂给模型的上下文。”可读，无重叠。证据 `artifacts/context-sqlite/cu-evidence/small-empty-light-wide.png`、`small-empty-light-narrow.png`、`small-empty-dark-wide.png`、`small-empty-dark-narrow.png`。仅签该公共Context空态，加载/错误全矩阵未覆盖。
- 主智能体在隔离workspace新建109943 bytes惰性AGENTS.md；CU新Agent会话发送 `long rule pagination acceptance`，真实Loop成功，规则27.9K、54项、累计120。是受控本地HTTP真实Loop/IPC，不是外部模型API或历史手工快照。
- 规则 `actspace.context-rules host/workspace-instructions`→读取原文：首段含 `Isolated Context pagination fixture`，显示“每段最多64KiB”和下一页；点击下一页起于1054行，下一页按钮消失；在原文区域滚动后实际看到1799行及 `END_CONTEXT_PAGINATION_FIXTURE`。C4真实原文分页通过。证据 `artifacts/context-sqlite/cu-evidence/small-rule-page1-ax.txt`、`small-rule-page2-ax.txt`、`small-rule-page2-end.png`。stale仍未覆盖。

M C12构建恢复：CU正常进入General再Usage，全部范围保持；实际进度605/1612，高于退出前583，确认持久cursor续跑，本轮已读取150351。保持同页不取消，最终结果仍待验。

## 本轮结束与剩余门禁

主智能体性能复核确认5k增量p95 1754ms、首次标题7.4s以及发布长事务缺口，记录于同目录performance-review.md。该信息是主端运行时/性能证据，不是CU测量。主端要求停止待改变实现的M/L负载。

CU保存M最新742/1612、已读取1,113,072条记录，证据 `artifacts/context-sqlite/cu-evidence/m-design-review-stop-ax.txt`；分别对明确bundle的M与Small执行正常CmdQ，随后只读进程检查未见验收主进程。本次为设计复核停止测试负载，不算用户取消、不算测试通过，持久水位保留供后续恢复。

本轮总体未通过最终验收。已经修复并定向闭环的界面缺陷不抹去原失败；M首次发布超时与增量性能阻断仍保留。当前逐点矩阵保留C1–C8、E1–E6全部范围。剩余未覆盖明确为：真实未知容量；stale恢复；默认maxAttempts=1之外的自动重试成功（当前配置不适用）；M全量最终结果/各Tab与跨页结果路线；L联合验收；完整加载/错误主题尺寸矩阵；鼠标横向滚动实效。真实Context/Usage与受控HTTPLoop证据均不得冒充外部模型API验证。

## 用户调整边界后的续验计划

用户已同意继续收尾：不做预先统计优化，不追求5000条追加250ms，不做大规模发布重构。此前压力测量、首次标题耗时和发布超时保留真实记录，不回写成通过；这些数字不再单独阻断本次收尾。仍检查正常聊天、几次工具调用、会话切换、打开统计，以及大量历史同步是否影响上述操作；反复超时或不能恢复仍是Bug。

补验点：

- C2/C6/E6：M后台同步期间普通请求、工具链、切会话与Context更新可完成且不串数据。
- C6/E1/E3：统计取消一次、恢复、离页返回和持久进度；终态结果或明确错误，反复超时/不能恢复交主端。
- E2：M最终结果主要各Tab、筛选、分页往返与刷新。
- C1/C4/C8/E5：Small可稳定构造的unknown/stale/加载错误视觉尺寸/鼠标横滚；未构造分项仍明确未覆盖。

操作分组：M同步→聊天与工具→切会话→统计取消恢复；M保持至终态→结果主要路线；独立Small剩余状态。已通过历史610项连续分页等不机械重跑。等待主端确认M/provider启动，不通过getApp自行启动未配置环境；不改业务代码。

### 调整边界后 M 日常路径第一组

CU进入Usage全部，进度753/1612；离页返回应用并新建会话发送普通文字成功120Token，再FIXTURE_TOOL审批pwd后Worked5s完成360Token；展开明确Ran pwd与Write /private/tmp/actspace-context-sqlite-m-20261011/cu-workspace/result.txt。Context当前6.3K/32.8K19%，2调用2结果；历史初始0/53与—，切Visible History0000正文正确再回原会话，自动追平2轮4步480，正文无串入。证据artifacts/context-sqlite/cu-evidence/m-normal-use-context-ax.txt。

返回Usage实际764/1613（新增会话计入），点击取消一次明确“查询已取消，可刷新重试。”与—/费用未知；点重试后787/1613、读取125929，确认恢复并前进。该组日常交互与取消恢复通过；尚未终态，不代签最终结果或整个同步期间持续后台运行。

M第二次FIXTURE_TOOL完成6s/360Token，真实pwd与write_file，切历史再回原会话正确，Context自动3轮7步840、4调用4结果、当前6.5K20%。两个链路共四次工具调用，未见日常UI冻结。返回Usage保持同步，最终结果继续待验。

### Small 未知容量与 revision 更新补验

主端新增合法9events历史fixture Context Unknown Capacity Fixture（缺contextModel，非外部模型调用）。CU搜索标题打开，历史同步完成后明确最近请求来源、当前≈12tokens无分母/占用比例，Composer—；popup≈12/— Token、已用—，未伪设0/32.8K。统计1轮1步130。C1未知上限通过；证据small-unknown-capacity-ax.txt/png。

真实会话普通请求重建当前Context，runtime-state展开→读取原文显示独立第二块文本；下一普通请求完成第7轮后独立原文块消失，读取原文按钮恢复；点击再次读取成功。C4 revision变更主动清旧与重读通过；未触发后端stale错误提示，不代签该分项。前轮停止导致队列暂停，点击继续发送后正常完成，非缺陷。


### 调整边界后的 M 最终结果

CU全部请求1,341,009、Token174,331,080（输入134,100,900、输出26,820,180）、已知费用$1,341.00另9次缺依据、缓存9.1%/13,410,000，与主端独立核对一致。主端DB1613published/0building属运行时证据。

UI日志1→2→1页（11–20/1,341,013）；服务商4、模型26、工具2（bash2/write_file2、失败0）。搜索无匹配→清空→bash2条；失败状态空结果→清空；24小时9请求1080Token→全部恢复→刷新一致。主要路线通过，不声称逐页遍历百万记录。证据artifacts/context-sqlite/cu-evidence/m-final-usage-ax.txt及m-final-usage.png。正常CmdQ退出且主端确认exit0，串行交接L。

Small约483CSSpx深色结果表格尝试鼠标水平滚轮未见偏移，不签鼠标横滚实效，也不据工具输入无效判产品缺陷；既有键盘横滚通过不变。

本轮M最终成功证据另存m-normal-final-usage-ax.txt/png；m-final-usage-ax.txt/png本轮曾写入新结果，不能继续作为旧超时截图引用。旧C09超时文字及日志保留，不重建旧截图，也不以本轮通过抹除旧失败。


### L 调整边界后的日常验收

应用com.actspace.acceptance.contextlarge / Actspace Context Large，主端日志确认data=/tmp/actspace-context-sqlite-l-20261011，隔离workspace同root/cu-workspace。基准5,101,000 activities、5000基准Session+610可见历史+1本轮新会话；Node codec需Desktop首次校验，不篡改水位。

- 新建按钮不等待“正在加载会话”，选择fixture-main发送普通文字立即创建并成功120Token；FIXTURE_TOOL审批pwd后Worked7s/360Token，实际Write /private/tmp/actspace-context-sqlite-l-20261011/cu-workspace/result.txt。受控HTTP真实Loop/IPC，不是外部模型API。
- Context≈6.3K/32.8K19%；历史0/53与—后自动追平2轮4步480、2调用2结果。证据artifacts/context-sqlite/cu-evidence/l-normal-context-ax.txt。
- Visible History0000首次搜索等待数分钟；主端确认目录新codec持续推进、无超时、Main loop约11–14ms，此为运行时检查。CU最终显示结果并正确打开body0/reply0；重新打开搜索、清空重搜Visible0609约1s内显示，跨workspace正文609正确；返回原真实新会话Context仍2轮4步480，无串入。
- Usage全部实际同步0/5611、读取514,304事件；取消明确“查询已取消，可刷新重试。”、汇总—及费用未知；重试重新开始，持久水位继续/离页/最终结果待下一观察。

### 独立原生 mock 壳的视觉补验

com.actspace.acceptance.contextmock仅loadURL127.0.0.1:5197/?mock=context-pagination，无真实preload/IPC，不能作为后端证据。浅色常宽与约483CSSpx窄窗，错误“演示：历史索引暂不可用，请重试。”与重试按钮可读，当前Context/分类/搜索未重叠。常宽证据mock-light-wide-error.png；窄窗截图仅工具输出，未保存磁盘。原生AX/截图每次约61秒工具延迟，按主端要求停止重复视觉循环，深错误/完整加载主题尺寸矩阵仍未覆盖。


L重试后离开Usage返回聊天，发送普通“L chat after statistics cancellation and retry”成功120Token，Context累计600；返回设置直接Usage全部自动继续2/5611、读取13,913，无新增错误。2/5611与先前0/5611读取514,304属不同Session阶段，数字不能横向直接判断丢水位，持久水位由主端核对。保持全部范围继续等待最终结果。此路线证明查询未阻止普通消息/Context与离页恢复，不把最终统计写成通过。


## 本轮收尾（用户调整验收边界后）

主端通知按本轮优先日常操作的取舍结束隔离压力负载。CU保存L全部时间正在同步94/5611、已读取655,701事件（不是activities总量），随后正常Cmd+Q。证据artifacts/context-sqlite/cu-evidence/l-normal-use-stop-ax.txt；之前恢复证据l-sync-recovered-ax.txt。此次退出不是用户点击取消验收、不是最终结果通过，L完整统计数字正确性继续待验。Small/Mock已正常退出。未修改业务源码，未commit/push。

### 最终逐点覆盖补充表

以下与开头矩阵共同构成完整范围；通过仅限明确实际观察的分项。

| 点 | 本轮最终判定 | 证据类型及未覆盖边界 |
|---|---|---|
| C1 | 已列场景通过 | 真实UI当前/空/仅历史同口径；旧历史合法fixture未知容量为—，无虚构容量；synthetic不冒充外部模型 |
| C2 | 通过 | 小/M/L受控HTTP真实Loop/工具/IPC；M4次工具、L2次工具；原生AX与实际隔离路径 |
| C3 | 已列定位通过 | 四类型筛选、普通行/最新用户助手工具、缺失提示；mock与真实证据分别记录 |
| C4 | 部分通过 | 真实621明细、64KiB原文两页/末尾、revision清旧重读通过；后端stale拒绝与重读恢复通过（后续受控真实后端证据） |
| C5 | 部分通过 | 压缩、32.8K→65.5K、支持模式切换、比较/趋势/事件截断通过；自动重试成功不适用默认maxAttempts=1，429失败/后续手动继续可用；受控压缩失败→产品重试成功通过（后续证据） |
| C6 | 部分通过 | M/L日常聊天/Context/切换及Usage取消重试、离页返回、M重开续跑通过；M最终结果通过；L完整结果与L重开续跑未覆盖 |
| C7 | 已列隔离恢复通过 | hold/release切会话、停止后历史追平、owner故障恢复、reset元数据注入后Usage/Context口径；故障注入为主端运行时操作，UI结果单列 |
| C8 | 部分通过 | 浅深结果、空态常宽/约480、键盘双向横滚；mock浅宽窄错误；完整加载/错误主题尺寸矩阵与鼠标横滚实效未覆盖 |
| E1 | 部分通过 | 小/M最终数值通过，M与独立SQLite核对一致；旧C09超时保留，最终续跑恢复；L完整最终统计未覆盖 |
| E2 | 主要结果路线通过/剩余未覆盖 | M各Tab、搜索/无匹配/清空、失败状态、24h/全部、前后页、刷新通过；7/30天逐一结果及鼠标横滚实效未覆盖，不声称百万逐页全遍历 |
| E3 | 已执行恢复通过 | 小库降级/重试/恢复，M取消/离页/重开恢复、L取消/重试/离页继续；L重开恢复未覆盖 |
| E4 | 已列历史路线通过 | M610项连续13页/FTS短语/清空/跨workspace/正确正文轨迹；L首次目录等待后热搜/跨workspace正文/返回原会话通过 |
| E5 | 部分通过 | 真实浅深宽窄结果/空态、keyboard；mock浅宽窄错误；完整错误/加载深主题尺寸矩阵与鼠标横滚未覆盖 |
| E6 | 日常可用性通过，完整规模结果部分 | M/L大历史背景普通消息、工具、切换、Context与统计取消恢复可用；Main runtime监测由主端提供并区分；旧压力数值保留，不因250ms阈值单独阻断；L完整结果未覆盖 |

本轮未观察到新的日常聊天/工具/切换冻结或无法恢复；不能据此抹除旧轮超时和性能记录。尚待验的主要门槛为L完整最终统计及数字核对。其他明确缺口为后端stale错误、受控压缩失败重试、完整加载/错误视觉矩阵、7/30天逐一结果与鼠标横滚实效；自动重试成功属于当前默认配置不适用。


## 继续剩余验收（2026-10-12 后续）

用户要求继续完成剩余项，三项优化仍暂缓，代码指纹无变化。验收点：L重开恢复超越94/5611并最终数字核对；L7天/30天、分页筛选及鼠标横滚；Small受控压缩失败→重试；加载/错误浅深×宽窄。后端stale错误仍按稳定可触发条件记录。

操作分组：先进入已隔离启动L的Usage全部持续运行，不因耗时主动退出；随后待主端启动Small，按故障恢复与视觉路线连续执行；L最终结果后连续验range/filter/page。主端负责注入与独立日志/数值核对，CU只操作UI、更新此文档。新证据使用独立文件名。

L重开后CU进入Usage全部，实际105/5611、读取76,922事件，超越上一轮94/5611，重开恢复通过。不同阶段事件计数不直接横向比较；保持运行等待最终。Small已进入原8轮真实工具/压缩会话，等主端summary-error注入。


### 受控压缩失败与产品重试

首轮summary-error没有匹配新系统提示词，/compact实际成功15条消息；主端定位为测试provider matcher旧句失效并补回归，不作产品失败。修正后，先普通消息成功120Token，/compact实际出现“正在压缩上下文/正在总结较早的消息”、输入禁用，随后明确“上下文压缩失败 · Compaction LLM failed:400...”及重试按钮。主端summary-ok恢复后点击产品重试，短暂队列中间态后自动成功“上下文已压缩·4条消息·0s”、错误消失。CU未点击继续发送，因为终态已自动完成。C5失败重试通过，故障注入为主端测试设施操作。
证据small-compact-error-20261012-ax.txt、small-compact-retry-success-20261012-ax.txt。Small正常CmdQ，等待主端专用故障宿主；L继续全部同步。


### Small 真实后端 stale 与 live 故障降级

主端专用控制宿主只改变隔离测试调用条件，不改业务源码。普通消息重建live后，runtime-state预览→主端stale-once→读取原文显示实际后端“Context revision stale; reload the panel”（带IPC调用前缀），再点读取原文成功显示独立全文且错误消失。C4 stale拒绝/恢复通过，证据small-stale-error-20261012-ax.txt。

主端live-error使实际readContextProjection抛错；关闭重开完整面板仍明确“当前Context尚未加载，以下显示最近请求输入。”，历史≈6.1K/32.8K19%、10轮14步3压缩累计1.7K，趋势/事件保留，不冒充live。证据small-live-error-fallback-20261012-ax.txt。故障操作与UI结果分别记录。


### 稳定 loading 视觉矩阵

主端panel-hold挂起实际面板请求；CU关开面板观察“正在读取上下文…”而非假零。深色常宽、深色约480 CSSpx、浅色常宽、浅色约487 CSSpx四组合均文字与顶部关闭控件可见、无遮挡；窄窗显示独立Context页。证据small-loading-dark-wide-20261012.png、small-loading-dark-narrow-20261012.png、small-loading-light-wide-20261012.png、small-loading-light-narrow-20261012.png。公共Context loading代表位置，不声称所有其他组件加载态逐一验证。L同页推进449/5611、2,485,266事件，持续等待最终。


### 整体错误视觉发现（修复前）

panel-hold撤销后自动恢复当前6.2K/32.8K19%、10轮14步3压缩1.7K，无需重试。主端panel-error令整体实际IPC抛错，四组合均有红色错误栏与可见重试按钮，但单行ellipsis只留下“Error invoking remote method runtime-v2:fixed-renderer...”前缀，中文原因不可见；AX包含完整原因。主端确认为可用性Bug，待修复复验，不能将四组合文字可读性写通过。证据small-error-light-narrow-20261012.png、small-error-light-wide-20261012.png、small-error-dark-wide-20261012.png、small-error-dark-narrow-20261012.png。Small正常CmdQ等待修复，L同步不动。


### 整体错误修复定向复验

Small新renderer在同受控panel-error条件下：浅深×常宽/约489CSSpx四组合常显中文“上下文读取失败，请重试。”，详情可展开全文换行，重试按钮保持可见。尺寸跨布局后详情局部折叠，再展开可用。旧截图与失败保留；新版证据small-error-fixed-dark-wide-20261012.png、small-error-fixed-dark-narrow-20261012.png、small-error-fixed-light-wide-20261012.png、small-error-fixed-light-narrow-20261012.png。错误文字可用性Bug视觉已关闭，待主端撤销故障后确认产品重试恢复。L同页推进646/5611、3,864,463事件。


### 故障撤销与鼠标横滚

panel-error撤销后面板自动恢复明确历史来源6.1K/32.8K19%、10轮14步3压缩1.7K；CU尝试旧重试ID时已失效，不能声称成功点击产品重试。自动恢复通过，产品按钮恢复待后续受控宿主。

Small浅色约489CSSpx Usage请求日志，鼠标向右滚轮调用未见实效，随后拖底部横滚条实际从时间/类型/对象列移动至Token/费用/耗时/状态列，再反向拖回左列。鼠标横滚实效通过，截图small-mouse-scroll-before-20261012.png、small-mouse-scroll-right-20261012.png、small-mouse-scroll-left-20261012.png。模型四列表在此宽度本身无需溢出，不把模型表假称横滚。Small正常CmdQ；L保持同步。


### 产品重试门控恢复

Small 新临时故障宿主保持整体错误，自动轮询不得撤销，只有 retry:true 能解除。CU在原真实会话打开完整Context，见中文错误与重试；实际点击产品重试后恢复明确历史来源6.1K/32.8K19%、10轮14步3压缩1.7K，错误消失。产品重试路径通过，故障条件与调用日志由主端另存。证据small-retry-gate-error-20261012-ax.txt、small-retry-gate-restored-20261012-ax.txt。

下一点为真实 assistant/message 字节已写入但未fsync的边界：旧统计→暂停期间不提前计数/仍可操作→主端释放→新统计。L仍全部同步，851/5611、5,299,668事件，本次不因耗时结束。Context加载/错误四组合已覆盖；Usage稳定加载/整体查询错误四组合仍待独立补验。


### 真实未 fsync 尾部边界

主端临时宿主在真实 assistant/message 字节写出、FileHandle.sync 完成之前暂停。CU普通无工具请求已见第11轮助手回复及停止Agent，轮/步11/15，压缩3，但累计仍1.7K旧值；界面尚可读取，不能据已显示回复声称落盘。主端独立记录seq234–236写出但descriptor请求等待、usage仍1680/14次、无重建。解除后CU末轮120Token、停止按钮消失、累计1.8K；主端精确1800/15次，单次增加120。CU与持久边界运行时证据分列，通过该受控真实Agent尾部场景，不把所有统计保持旧值误写通过。证据small-fsync-paused-20261012-ax.txt、small-fsync-restored-20261012-ax.txt。L继续同步1025/5611、6,517,842记录。


### Usage 独立 loading/error 四组合与 C-16

验收点为Usage加载说明/控件、错误原因/重试可读、撤销后实际刷新恢复；按loading主题尺寸矩阵→error同矩阵→刷新分组。Small专用临时宿主真实IPC开关由主端授权，CU只创建/删除acceptance-usage-hold/error控制文件，不改业务源码。Loading浅深×常宽/约489CSSpx四组合说明清楚、无数值假零；该宿主在查询正式建立前挂起，只有禁用刷新没有取消按钮，不签此注入条件取消控件（正常冷同步取消已有独立证据）。截图usage-loading-{light,dark}-{wide,narrow}-20261012.png。

Error四组合均明确未知统计而非假零，原因可换行读出，但直接露长IPC方法前缀；窄窗重试被挤成两行“重/试”。主端确认为C-16，待修复，不签错误控件视觉通过。截图usage-error-{light,dark}-{wide,narrow}-20261012.png。撤销error后CU实际点击顶部刷新恢复618请求（新增fsync单次请求），证据usage-error-refresh-restored-20261012-ax.txt。Small正常CmdQ等待C-16定向复验，L继续全部同步。

证据保存核对：usage-loading-dark-wide-20261012.png在故障切换后保存，内容实际已是error，不能作为loading截图。深宽loading此前工具现场已观察，后续将补独立recheck截图；其余三张loading正常。保留命名误差记录，不覆盖旧文件。


### C-16 定向闭环与深宽 loading 补图

Small新renderer真实IPC错误浅深×常宽/约489CSSpx四组合均显示“使用统计读取失败，请重试。”；默认收起的详情可展开并换行读出完整原因，重试按钮保持一行，不被挤掉。截图usage-error-fixed-{dark,light}-{wide,narrow}-20261012.png。撤销故障后CU实际点击产品重试，错误消失，恢复618请求、79,930Tokens、618次费用未知；证据usage-fixed-retry-restored-20261012-ax.txt。C-16复验通过，保留修复前失败。

真实Usage深宽loading另存usage-loading-dark-wide-recheck-20261012.png，已现场检查确为“正在读取使用记录…”和禁用刷新，补齐四组合截图；旧误命名文件仍保留，不作为loading证据。

后续资源验收点为Context空闲查询次数/资源、关闭面板转General后停止面板消费者、隐藏窗口后停止可见聊天轻量消费者。操作分组：原真实11轮会话Context读取ready后保持空闲60秒→按主端通知关闭面板并转General→隐藏窗口。CU只记录界面状态，精确次数/资源由主端无正文探针独立记录。L全部同步继续，不为该采样停止。


### 资源采样界面分组进展

CU完整Context ready后保持空闲；主端104.65秒探针记录21次面板条件请求/4935B、21次Composer读取/14826B，Worker消息、SQL读/聚合/写及Journal读取均0。随后CU关闭Context（无Composer浮层），进入General停留；主端77.6秒记录IPC、Worker、SQL及Journal全部0。以上次数为主端运行时证据，CU只确认操作路线与可见状态。接着CU返回原11轮真实会话，完整Context最近请求输入/56项ready后CmdH隐藏Small，等待窗口隐藏采样。L保持全部同步。

顶部C1–C5/C7/C8/E4/E5已按约定分项更新范围通过；默认maxAttempts=1之外自动重试成功明确不适用，不虚构额外异常要求。C6/E1/E2/E3/E6的L最终整库结果与7/30天、分页筛选仍待，不用界面矩阵闭环代替大库数字正确性。


隐藏采样无效：CmdH后Small探针文件不更新，CU getApp与既有句柄调用均约17–18秒超时，inventory仍运行。主端线程采样定位为临时验收探针inspector并发GC回调直接disconnect阻塞，非App Nap、非产品隐藏查询失败；本组不得用未更新文件声称应用层0查询。暂停Small重试，待主端修复临时探针重开后重跑。此前GC前可见空闲及General关闭消费者测量保留有效；L无此探针未受影响。


### 隐藏/恢复有效定向复验

主端移除临时GC探针重开Small，CU原真实11轮会话完整Context ready（11轮15步3压缩1.8K、最近请求输入56项）后CmdH隐藏，连续保持至少60秒，等主端结束通知才恢复。主端独立63.82秒start/end/delta探针时间持续更新，IPC、Worker消息、SQL读取/聚合/写入、Journal读取均0，CPU user619ms+system360ms；证据small-hidden-recheck-{start,end,delta}.json。此轮有效，替代上一无效隐藏测量，不抹去临时设施故障记录。

恢复getApp约1.66秒，完整Context仍明确历史最近请求输入6.2K/32.8K19%、11轮15步3压缩1.8K；Composer从启动暂态20%追平19%。CU点击工具区块Value变1，界面交互正常。无新增消息，因此验证恢复现有事实与显示追平，不声称隐藏期间新增请求。证据small-hide-before-recheck-20261012-ax.txt、small-hide-restored-recheck-20261012-ax.txt；恢复后正常CmdQ退出Small供主端独立内存测量（非CU）。L始终保持全部同步未停止。


### 注册 handler 资源测量的 CU sender 准备

Small completion-hot-host中CU进入Usage全部，结果618请求/79,930Tokens/618费用未知；返回原11轮真实会话打开完整Context，最近请求输入、第11轮步1、趋势与事件ready后保持窗口。CU仅完成两条正常产品读取路线，不重复调用20次；主端随后注册handler直接测量必须标运行时证据，不称CU或完整IPC传输。L持续同步未操作。


### 本轮结束与用户取消的 L 范围

用户于2026-10-12明确取消剩余约510万条 L 压力/整库验收，故 C6、E1、E3、E6 中依赖 L 最终整库数字、重建完成或大库最终结果的分项保留“未验证通过”，不作为本轮完成门槛；既有 M/Small 通过、L历史日常可用证据及失败证据均保留。

E2 的 7天/30天时间范围逐一UI结果在 Small 退出前仍未覆盖，属于独立普通统计缺口，不能借 L 取消转为通过；完整结果分页/筛选中的 L 专属部分同样按用户取消处理。无其他独立于 L 的新增实质缺口。

退出核对：Actspace Context Large、Actspace Context Small、Actspace Context Mock均已不在运行列表；未操作用户其他应用。


### E2 普通 7/30 天最终补验

验收点为7天、30天各自统计成功呈现与可连续切换；CU路线7天→30天→全部，无provider、不发消息。首次尝试被主端清理误向验收exec写Ctrl-C中断，随后默认壳被唤起；主端确认测试操作错误，非产品启动竞态。small-usage-7d-final-20261012-ax.txt为默认壳，不作统计证据，保留误录说明。

正确隔离宿主重开后，CU完整AX实见：7天618请求/79,930Tokens；30天刷新完成618请求/79,930Tokens；切回全部618请求/79,930Tokens、工具2，均费用未知618次，刷新可用。与主端独立SQL预期一致，但通过依据为上述真实UI读取。证据small-usage-7d-recheck-final-20261012-ax.txt、small-usage-30d-final-20261012-ax.txt、small-usage-all-final-20261012-ax.txt。Small随后正常CmdQ。普通E2独立缺口闭环；当前没有独立于用户取消L范围的实质未覆盖验收点。旧L取消、历史失败及设施错误不改为通过。
