# 真实桌面 Computer Use 验收记录

## 身份与边界

- 2026-10-07；真实 `pnpm dev:log` Electron，bundle ID `com.actspace.desktop.dev.w2067fa05`，显示名 `Actspace Dev actspace-agent-2067`，父智能体核对 PID 40906。
- 主工作区 main `d5f1bf3e` + 操作时已有 dirty Composer。并发输入框变更产生的规范版本差异不自动归为重构回归。
- 用户纠正后只操作上述现有 Electron；未退出、未重启、未切隔离检出，不再操作 Chrome/IAB。历史浏览器证据不计真实桌面通过。
- 产品代码/用户历史会话未修改。新增验收工作区为 `/var/folders/h6/wv0phjfx6pb36n57tb4d9sww0000gn/T/actspace-fe-acceptance-9omqvkkf/git-workspace`。
- 此前交互由原生 CUA 执行；后续已授权可用 OS 原生 AX/鼠标键盘 fallback，均需实际观察且单独注明，不使用DOM/业务state注入。原生 HTML 的合并 AX+截图观察约 62 秒；单截图再 AX 约 122 秒，系统打开对话框约 1–2 秒。该等待是工具观察成本，不能据此判产品响应耗时。

## 本段验收点与路线

验收点：R01/13-A1/16-A4 首发、流式和结束；R02 两会话消息归属；09-P1-1 折行、删一字、删空；16-A6c/V02/V03 浮层和模式；16-A1/R09 侧栏键盘菜单与复制；16-A5/A6/A6b 设置 Select/Esc。按 fixture 新建 A/B → Composer 与侧栏 → 设置代表入口连续检查。复合条目的未验证子项单列，不以代表入口代替整项。

## 逐项结果（持续补充）

| 编号 | 状态 | 实际操作与现象 | 证据/边界 |
| --- | --- | --- | --- |
| fixture 前提 | 通过 | 添加工作区→原生打开对话框→⌘⇧G→输入 fixture 绝对路径→打开。侧栏新增 git-workspace 并自动创建空 New chat，出现工作区/分支/运行位置选择。首轮 paste 未更改 GoTo 路径，按新 AX setValue 确认后成功。 | 实际原生 UI；不涉及产品仓库文件 |
| R01 | 通过 | A 输入并 Enter 发送“这是桌面验收，只回复验收就绪，不执行工具”。第一次 AX 显示 1 条排队即将发送、输入已清空；下一次截图/AX显示唯一回复“验收就绪”，会话空闲、输入空、发送禁用。 | [完成态](screenshots/computer-use/desktop/first-send-pending.png)；文件名 pending，但实际截图为完成态。短请求的逐字流式被 61 秒观察等待错过。父智能体 journal 1 user/message、3 assistant/chunk、1 assistant/message、1 turn/end 仅运行时佐证，不替代 UI 流式 |
| 13-A1 | 通过 | 首发正常、后续160行真实 Thinking 文本现场增长、真实工具审批及完成终态均已实际覆盖。 | stream-early/growing、task-start/approval-denied；不要求额外强制 final 正文逐字增长 |
| 16-A4 | 通过（可观察焦点）；瞬时不闪待补 | 输入后焦点消息输入框；Enter 后输入清空且焦点仍在输入框；完成页焦点仍在输入框，截图可见 caret。 | 完成态 screenshot；CUA 观察间隔无法判断瞬时闪动/DOM 重建，复合全项不能称全通过 |
| R02 | 通过 | 在 fixture 点击“在工作区中新建会话”得 B 空页；输入未发送“B会话未发送草稿”，切 A 显示原请求/唯一回复且输入空；切 B 消息空、草稿准确保留；再切 A回复正确。 | 仅当次 A/B 切换；B未真实发送，不能证明 B持久化/重启恢复 |
| 09-P1-1 | 通过（形态/焦点）；瞬时不闪待补 | A 粘贴重复长句18次，真实多行与内部滚动条；selectText 选中除首字外正文后 BackSpace，剩“折”，仍多行；再 BackSpace清空回胶囊、发送禁用；三个状态 AX焦点均在消息输入框，删空截图有 caret。 | [长文](screenshots/computer-use/desktop/composer-long.png)、[一字](screenshots/computer-use/desktop/composer-one-char.png)、[删空](screenshots/computer-use/desktop/composer-empty.png)。⌘Home/⌘⇧End首次选区尝试仅删末标点，未据此判产品Bug；瞬时光标不跳/不闪不在61秒观察能力内 |
| R08 空闲点 | 未覆盖（补充观察） | 完成AX明确“会话状态：空闲”；选中A截图点为绿色，非选中空B为灰。不能仅按绿色预判运行状态Bug。 | 同场景截图；运行中/失败/未配置尚未完成 |
| 16-A6c | 通过（侧栏切换两类浮层）；⌘N未覆盖 | A 开“+”切 B，菜单消失；A 打开 Context（~6K/1M，六桶数据）切 B，Context消失。 | [Context](screenshots/computer-use/desktop/context-open.png)；⌘N路径仍待补，不称整项通过 |
| V02 模式入口/Enter/回焦 | 通过（子项）；整体未覆盖 | A 已有消息“+”初焦 Plan，Enter选择，菜单关闭、Plan chip/规划placeholder，回焦消息输入框；B空会话“+”Plan/Chat，↓Enter选择Chat，chip/“问点什么…”与回焦。 | [加号](screenshots/computer-use/desktop/plus-menu.png)、[Plan](screenshots/computer-use/desktop/plan-chip.png)、[Chat](screenshots/computer-use/desktop/chat-empty-session.png)。A仅Plan、B Plan/Chat及模型独立常显是当前dirty版本实际可达差异；其余键盘/搜索/Skills/互斥子项未覆盖 |
| V03 模式 chip/placeholder | 通过（鼠标退出等子项）；整体失败/未覆盖 | Plan/Chat名称AX为文本，×有退出按钮。鼠标×实际退出；A回“继续追问…”，B回Agent并恢复工作区选择。Chat空页没有运行位置/Context行。 | 同上；名称鼠标点击本身未验，尺寸/附件/真实运行placeholder尚未覆盖 |
| CU-OBS02 / V03 空输入Backspace | 观察（非Bug） | A Plan模式，消息输入空，点击输入框并单独Backspace；新AX无变化，仍Plan chip、规划placeholder，焦点输入框。规范front-聊天输入框规范.md105/180与09handoff22要求焦点chip内/×时Backspace退出，不是空textarea；原前提错误，撤候选。×退出可用，chip焦点Backspace待补。 | Plan截图+实际Backspace后AX无变化；版本/原因未知，不修复不调查 |
| 16-A1 / CU-B05 | 失败（重复键盘移项）；提交/Esc子项通过 | 标题聚焦ShiftF10初焦置顶；首轮↓Enter打开重命名，输入“桌面验收 A 1007”Enter成功且回焦标题。其后两轮新鲜菜单初焦置顶，↓Enter实际执行置顶而未进重命名；操作/工具影响待复核。鼠标重命名输入取消标题后Esc，原名不变且回焦标题。 | [重命名后](screenshots/computer-use/desktop/sidebar-renamed.png)。一次paste clipboard读取超时仅工具限制；重复菜单键盘不稳定不查根因 |
| R09 | 通过（置顶/取消/重命名/复制ID/记录子项）；整体未覆盖 | A置顶进入已置顶区，取消后回fixture组；重命名和Esc取消如上。右键→复制→复制ID菜单关闭回标题，父智能体pbpaste白名单比对fixture会话ID精确一致=true。 | 真实copy动作+运行时剪贴板比对；记录复制亦实际点击，父智能体白名单核对 contains_fixture_prompt/reply/nonempty 均 true；分叉、归档后续补验，不称整项通过 |
| 16-A5 | 通过（默认模型鼠标/键盘及底部Esc子项）；整体未覆盖 | 原默认deepseek-flash；打开Select初焦当前项，鼠标Kimi K2.6后已保存、关闭且回焦Select。分步重新打开→Up焦点deepseek-flash→单独Return成功恢复原值并已保存。底部快捷目标原指定会话/已移除会话，打开三项后Esc仅收Select且回焦目标。 | [底部Select](screenshots/computer-use/desktop/settings-bottom-select.png)仅此窗口视觉截图（screencapture窗口15182）；此尺寸向下展开且完整可见，上翻分支/快捷目标改值与重启未覆盖。批量打开/Up/Return曾未改值，分步通过，不据时序差异判产品Bug |
| 16-A6 / CU-B06 | 失败（第二Esc退出设置）；第一Esc通过 | 通用→图片生成配置Dialog，初焦更换Key，已保存Key无回显；第一Esc关闭Dialog且保留通用页、焦点回编辑图片生成配置。单独第二Esc后AX无变化，仍通用页且相同焦点，没有返回应用。 | 两次Esc分开真实执行；不改Key/服务。回复风格编辑区Esc收起编辑层但AX焦点HTML，作为补充不等同Dialog。工具按键影响待复核 |
| 16-A6b | 通过 | cheaprouter Haiku编辑器→临时手动能力→能力来源手动→推理支持Select含未知/支持/不支持；Esc仅收下拉，编辑器仍开且回焦推理支持；第二Esc退出编辑器回连接详情，未保存临时草稿。 | [Esc后](screenshots/computer-use/desktop/reasoning-select-esc.png)及SystemEvents只读焦点AXComboBox推理支持；第二层回焦HTML，作为观察 |
| 17-A2 | 未覆盖（已覆盖即时默认模型保存/恢复） | defaultChat DeepSeek→鼠标Kimi K2.6，父白名单读盘确认已存kimi:kimi-k2.6；键盘恢复DeepSeek，父核对baseline恢复。 | 文件持久化是运行时佐证，重启UI保留尚未实际验，不称全通过 |
| R04 | 通过 | 真实右面板空态→终端；先显示正在读取本机Shell环境，后zsh/input焦点，prompt fixture git-workspace main。printf输出desktop-terminal-ok，echo $$输出PID，最终独立echo hi输出hi。 | [输出复核](screenshots/computer-use/desktop/terminal-reopened.png)、[echo hi](screenshots/computer-use/desktop/terminal-echo-final.png) |
| 10-A2 | 通过 | 新建终端→echo hi→关闭Tab→再开新终端→清行typeText echo hi→Return，正常输出hi。旧PID98382，关闭后旧shell消失（父智能体运行时佐证），新PID5020由UI输出和父智能体核对。 | 初次paste/typeText混合显示hiecho hi/echo hi的异常尝试保留于[初次](screenshots/computer-use/desktop/terminal-echo-hi.png)，原因未知，最终最小独立复核正常，不升级为IPC故障 |
| R06 | 通过（文件树与Markdown代表） | 工作区文件树加载preview.md/sample-image.png/sample.txt；打开preview.md渲染标题/链接/TS代码色，切源码显示对应Markdown，切回预览正常。 | [Markdown预览](screenshots/computer-use/desktop/file-preview-markdown.png)；过滤/图片预览等不由本项代表检查覆盖 |
| R10 | 通过（Finder代表） | preview.md外部打开菜单列VS Code/Cursor上次/Finder/Terminal/iTerm2；点击Finder，新Finder git-workspace窗口选中preview.md，AX显示准确fixture绝对URL。 | 仅Finder代表，不声称其他编辑器逐一通过；初次Finder绑定先捕获既有下载窗口，随后新窗口确认成功 |
| 11-A1 | 未覆盖（目标URL未核实） | 点击Markdown里的https://example.com/；原生Chrome初始状态显示既有AIAPI窗口，未核实example.com目标。返回Electron仍原会话/本地renderer主URL，无主窗口跳转。 | 停止系统浏览器探索；不得将实际点击等同于目标URL通过。无浏览器mock操作 |
| R05 | 通过（基本打开与代表状态） | Review打开，未提交范围出现sample-image.png初始未跟踪变更；选择未暂存后sample.txt/+1及父智能体追加的准确文本行显示。 | [初始Review](screenshots/computer-use/desktop/review-initial.png)、提交对话框背景差异；不覆盖自动更新 |
| 10-A3 / CU-B03 | 失败 | Review未提交范围保持打开，父智能体12:25:44追加fixture sample.txt唯一行；仅Esc收菜单，未刷新未切范围；其后AX/截图仍只有sample-image.png，无sample.txt/新行。切未暂存才出现新行。 | [未自动更新](screenshots/computer-use/desktop/review-auto-update.png)；追加行`desktop review automatic update 2026-10-07T04:25:44.415515+00:00`。不查原因/不修复 |
| R22 | 通过（范围/跳转/回焦） | 范围菜单含最近一轮/未提交/未暂存/已暂存/已提交/分支，初焦最近一轮；Esc回范围按钮。鼠标选未暂存刷新sample.txt；跳转浮层初焦搜索，输入sample过滤，Tab到sample.txt按钮→Enter关闭回焦跳转按钮。 | 搜索框直接Enter未选按钮，不按未约定快捷方式判Bug；其他范围内容在R11补验 |
| R21 / CU-B04 | 失败（Enter取消）；其余子项通过 | fixture提交菜单→提交或推送；初焦空提交说明，提交/提交并推送disabled。Tab焦点取消；Return后AX无变化仍取消焦点、对话框仍开。Esc正常关闭，回焦提交或推送按钮。 | [提交对话框](screenshots/computer-use/desktop/git-commit-dialog.png)。未提交/未推送；键盘取消候选问题原因未知，工具按键影响未排除，不调查 |
| R11 | 通过（历史）；分支比较未覆盖前提待补 | 已提交→最近提交Initial acceptance fixture，help 56a2cd38；点击显示preview.md +12/sample.txt baseline +1。分支入口显示没有本地分支设置远程跟踪分支。 | [历史菜单](screenshots/computer-use/desktop/review-committed.png)、重命名截图背景为初始提交差异。父智能体后补fixture本地bare tracking，待UI补验 |

| 10-A1 | 通过 | A真实bash审批，命令sleep 600; echo desktop-queue-ok。首轮拒绝→Denied卡→正常回复user-denied/未运行并空闲。第二轮批准→Running→命令自然结束exit0/desktop-queue-ok，正常回复且空闲。 | [审批](screenshots/computer-use/desktop/task-start.png)、[拒绝结束](screenshots/computer-use/desktop/approval-denied.png)、[第二轮审批](screenshots/computer-use/desktop/task-second-start.png)。首轮中文typeText只输入ASCII为工具边界；第二轮英文完整真实发送。父PID辅助zsh37355/sleep37357，只是佐证 |
| 14-A2 | 通过 | 第二轮等待审批，切B原草稿/空消息正确，回A同一命令与cwd卡保留；点击运行后等待审批标记消失，侧栏运行中、工具Running、队列引导恢复可用。 | 同一第二轮真实路径，不用首轮拒绝拼接批准。cwd /private/var/.../git-workspace等价fixture路径 |
| 09-P2-1 / 队列形态 | 通过 | 待审批真实连续发送Q1至Q5，AX数量5，截图仅四行与内部滚动条；待审批全部引导disabled，批准后全部引导可用。 | [五条队列](screenshots/computer-use/desktop/queue-five-pending.png)，视觉四行/内部滚动，空输入仍胶囊且未被托盘推成多行；hover/Tab属于09-P2-3待补 |
| R15 | 通过 | 第二条菜单上移→Q2第一、Q1第二；编辑Q2移回输入且数量5→4、正确正文/焦点。替换Q2-edited后Enter重入尾端，5条。自然结束后唯一用户消息/回复按Q1,Q3,Q4,Q5,Q2-edited顺序发送。 | 首轮引导点击时element invalid，freshAX证实自然结束；第三轮安全sleep另补：引导→下一步读取/撤回；撤回→2条排队；删除第二条→1条；停止→空闲/已暂停/继续发送；继续→唯一STEER-ONE消息/回复，队列消失。[引导](screenshots/computer-use/desktop/queue-steered.png)、[撤回](screenshots/computer-use/desktop/queue-withdrawn.png)、[继续结束](screenshots/computer-use/desktop/queue-resume.png)。父14:17:04核任务PID55397/55399消失（运行时辅证）；未按估计时刻判停止耗时 |
| R24 | 通过 | 首条菜单编辑可用/上移disabled；Esc关闭回该条更多按钮。第二条上移可用实际生效；编辑可用且移回输入。 | 菜单可用动作即编辑/上移，均实际完成，Esc回焦通过；禁用状态为补充 |

| 14-A1 | 通过 | 真实160行请求，Thinking早/8秒后截图正文增长；运行中切B视觉空页+原草稿，回A仍运行，Thinking到编号53–57；⌘R后run/停止恢复，实时delta暂不显示，仅Operating Space；结束回A完整正文AX1–160连续，唯一prompt/回复，空闲。 | [早期](screenshots/computer-use/desktop/stream-early.png)、[增长](screenshots/computer-use/desktop/stream-growing.png)、[切B](screenshots/computer-use/desktop/stream-switch-attempt.png)、[回A](screenshots/computer-use/desktop/stream-back-a.png)、[重载](screenshots/computer-use/desktop/stream-reloaded.png)、[完成尾](screenshots/computer-use/desktop/stream-complete.png)。灰Thinking增长不冒充final正文流式；另一次custom请求实际输出长正文中截图停按钮、⌘R，最终完整正文/唯一第13轮prompt及CUSTOM-CONNECTION-OK/Mermaid恢复，独立输出中重载补通过。重载delta丢失是交接已知行为，不升新Bug |
| CU-OBS03 | 观察 | B未发送草稿在A的renderer重载后回B变空；不是当次切换丢失，未按14-A4未知提交/IME恢复标准自动升Bug。 | 实际AX空placeholder；front-聊天输入框规范.md 第61行明确草稿仅应用运行期间，关闭/刷新不保证恢复；允许边界，不是Bug |
| 13-A4 / 14-A4 / 09-P1-2 / 09-P3-1 IME部分 | 未覆盖 | 点击B输入，CtrlSpace+n+i实际得到Latin ni，无候选；一次绑定SystemUIServer入口5秒timeoutReached。没有真实中文组字候选，不计IME通过。 | 工具/输入源可达边界，不用typeText中文替代IME；CtrlA清除曾只删i，后setValue空成功，不据按键时序判产品Bug |
| 16-A3 / R07 附件 | 通过（文件选择/预览/切换设置保留子项）；整体未覆盖 | B加号图片→真实原生Open。用⌘⇧G准确sample-image.png路径定位→Open，附件预览/移除按钮，回焦输入。点击预览右面板正确图片。输入英文B attachment draft acceptance→A，无B附件进A输入；回B图片/正文准确；设置往返再次保持两者。 | 图片78KB PNG，路径fixture。原生row/doubleclick未选中，路径入口成功。剪贴板粘图与跨app拖图未覆盖；当前CUA paste接口仅text/md/html，没有写图片剪贴板接口，不凭文件选择替粘图/拖图 |

| 09-P3-2 模型选项 | 通过（Thinking UI子项）；整体未覆盖 | A独立模型按钮→DeepSeek编辑选项，Thinking原1，点击关闭后重新打开为0且Effort Low/High/Max disabled；再点击恢复，重新打开确认Thinking1、Effort恢复可用。Esc收整个模型层。 | Effort未改选；实际请求参数未有UI暴露，不能按Thinking表象或持久值代替。模型独立入口/一级收层为当前dirty版本差异 |
| CU-OBS04 / R08失败呈现 | 观察；失败状态明确显示子项未覆盖 | Thinking0后发送第二次80行请求。最终UI仅唯一prompt+Worked，无正文、无显式错误，空输入/发送禁用，侧栏A点绿。 | [失败后](screenshots/computer-use/desktop/second-failed-no-body.png)；父journal白名单turn/end reason=failed佐证，已经接纳user/message，非14-A3未知提交、不要求尚未持久化草稿回填；原因未调查 |
| 14-A1 第二次输出中重载 | 通过（后续独立请求补验） | 最初80行请求失败保留；后续custom请求真实长正文输出且停止按钮可见时⌘R，最终完整正文/唯一prompt/正常结束、三节点图恢复。 | [输出中](screenshots/computer-use/desktop/custom-reply.png)、[立即重载](screenshots/computer-use/desktop/custom-output-reloaded.png)、[完成](screenshots/computer-use/desktop/custom-end.png)；立即快图仍旧布局，下一终态已右面板关闭说明重载生效 |

| 13-A4 图片paste | 通过（图片子项）；整体未覆盖IME | B先实际移除selector来源sample-image.png，父仅系统剪贴板准备fixture PNGf 78069bytes；输入保持focus后原生⌘V，新image.png附件预览/移除按钮出现，英文草稿不变、focus仍消息输入。 | [粘贴图片](screenshots/computer-use/desktop/b-pasted-png.png)；原生Electron粘贴路径，无业务state注入。IME仍未覆盖，拖入未验 |

| 17-A3 | 通过（检测/实际回复）；编辑保存与重启待补 | 既有cheaprouter.cc自定义连接真实测试从10月1日通过变刚刚通过；会话选Haiku，发CUSTOM短答+Mermaid无工具请求。因前失败队列暂停，点击继续发送后真实长正文+marker+Mermaid完整回复。 | custom-end.png；父仅runtime核实际模型Haiku佐证。取消编辑草稿不代替本项保存连接，待非敏感名称保存及最终重启 |
| CU-OBS05 | 观察 | 会话手选Haiku后renderer重载，控件回默认deepseek-flash；实际该次runtime请求Haiku。 | 不自动定Bug，不调查 |
| R23 / CU-B07 | 失败（Esc）；鼠标关闭/回焦通过 | 真三节点Mermaid点击放大，全屏初焦关闭；单独Esc后快图+freshAX仍全屏/关闭焦点。鼠标关闭成功回焦放大查看。 | [Esc仍开](screenshots/computer-use/desktop/mermaid-esc.png)；工具按键影响未排除，原因未知 |

| R17 | 通过（添加/编辑/不弹回子项）；悬停未覆盖 | 双击普通正文实际选中CONNECTION→选区菜单添加到对话→评论Desktop annotation acceptance保存回焦输入；胶囊列表准确显示文本/评论；再编辑为Desktop annotation edited保存收层，观察期间无反复弹回。最后清空验收草稿批注。 | 原生CUA实际双击选择，不用DOM Selection；hover未实际进行 |
| 17-A3 保存连接 | 通过（即时保存）；重启未覆盖 | 编辑名称原cheaprouter.cc→cheaprouter.cc [acceptance]→保存，标题/名称更新且已保存提示。 | 无Key/BaseURL/模型敏感字段变更；最终重启验保留后UI恢复原名 |

| 17-A4 | 通过 | 真联网搜索Python官方文档→UI工具Web search completed/Fetched→回复标题/准确URL；真generate_image一张白底红圆→Generated1image→Open后右面板准确显示图，正常结束，无未配置Key错误。 | [搜索](screenshots/computer-use/desktop/search-tools-complete.png)、[图片](screenshots/computer-use/desktop/imagegen-preview.png)；父仅工具completed辅证。图片为Session artifact，未写fixture为工具路径边界 |
| 17-A5 / CU-B08 | 失败（断开后仍调用） | 搜索原2/4智谱/Tavily已连接；管理智谱→断开，UI变1/4、智谱连接按钮。之后实际中国馆查询，Thinking/最终正常结果，但实际web_search Providers仍tavily,zhipu。 | [断开](screenshots/computer-use/desktop/zhipu-disconnected.png)、[调用过程](screenshots/computer-use/desktop/extensions-current.png)。父仅result Providers行白名单确认仍zhipu、磁盘zhipuKey不存在；非模型猜测。最后正常退出仅恢复zhipu加密记录，待UI确认恢复，不查原因 |
| R12 | 通过（桌面入口） | 扩展能力页Chrome浏览器连接UI显示开始连接/连接详情/高级选项，无bridge降级/缺方法。 | [桌面入口](screenshots/computer-use/desktop/extensions-open.png)；未进行Chrome连接/browser操作，不声称连接成功 |
| R13 | 通过 | 设置更新页正常打开，准确本地源码路径/当前进程/开发模式说明，构建更新disabled，无bridge报错。 | [更新页](screenshots/computer-use/desktop/update-open.png)，未构建/更新 |

| 13-A3 | 未覆盖（实际双语/听到未满足）；已恢复原配置 | 记录原off/电商Harness解读，真实改目标A开on后发送英文一句话请求，最终仅英文；prompt限制English，不能据此断言双语产品失败。回扩展仍on/A及等待新回答，停止播放disabled。一次已保存MiniMax配置试听实际点击，未显式错误，听觉不可用。最终UI恢复off/电商Harness解读。 | english-reply/detail-after、tts-after截图；未实际听到，父采样窗口未见afplay不证明未播放；不反复同一路线 |

本文件为持续记录；未列的主清单项未因本段缩减范围。


### 后续真实苹果拼音补验（保留此前工具未覆盖记录）

父仅使用OS TIS切到已安装苹果拼音，Sol通过CUA物理字母/键盘实际交互；候选使用已核实Electron屏幕矩形合成截图，不模拟composition。

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| 13-A4 | 通过 | 原生PNG粘贴子项见前文；此次真实苹果拼音ni候选、Space确认汉字尼、未误发送，补齐IME子项。 | ime-ni-candidates、ime-chinese-space；不以typeText中文替代IME |
| 14-A4 | 第一子路径通过；未知提交恢复子路径未覆盖 | B草稿尼+未确认ni候选→A，新鲜图显示A既有正文/空输入→B，尼ni与候选网格仍保留，无恢复覆盖/误发。 | ime-composing-a-fresh.png、ime-composing-switch-back.png。旧ime-composing-a.png为转场旧帧，不作A状态证据。安全真实bridge未知接纳样本尚无，provider失败不等价unknown |
| 09-P1-2 | 不通过候选（Slash Esc）；其他已验子路径通过 | ni候选真实出现；Return只组字不发送；Space确认汉字；分别Down/Up和ShiftTab在候选存在时未翻历史/切Plan。Slash输入/→ni→Down/Up/Return后/尼，列表仍为空匹配；再ni候选→单独Esc，取消组字回/尼，但Slash面板同时消失。 | ime-up-down-shifttab、ime-slash-return、ime-slash-pending、ime-slash-esc；OS AX精确空匹配文字matched=0。工具按键影响未排除，不查根因 |
| V03 / 09-P1-3 chip Backspace | 通过子项；撤销原CU-B02 | Plan chip的×实际聚焦后Backspace，退出Plan回Agent/消息输入焦点。原空textarea Backspace保持Plan符合当前规范，不是Bug。 | chip-backspace-correct.png；规范105/180与09handoff22要求chip/×内焦点 |


| R07 | 通过 | 真Slash /列表含功能/Skills，/baoyu过滤到唯一技能→Down/Return选中baoyu-design，query清空并胶囊出现；移除验收技能后/重新打开，真实OS点击Electron空白处关闭，焦点AXWebArea未抢回输入。 | slash-root-open、slash-skill-filter/selected、slash-outside；不发送技能、不改启用设置 |
| V02 Skills/键盘 | 通过子项；其他特殊浮层/禁用项未因此通过 | +主页面首Plan，Up循环至末Skills→Right子页；Enter agently-mail→Down/Enter baoyu-design，面板保持开，两勾选/两胶囊；zz搜索无结果；清搜索再Backspace回主页；Right→Esc回主页→Esc关闭，AXTextArea消息输入框焦点。最终两技能均移除。 | palette-up-wrap、palette-skills-multiselect、palette-skills-empty-search、palette-backspace-root、palette-first/second-esc |
| 16-A6c | 通过（原要求or路径）；⌘N补充未覆盖 | 前文+与Context分别通过A→B侧栏切换收层，满足原“⌘N或侧栏切换”。此次⌘N先CUAguard未发出，重绑后CUA单次仍无可观察变化；只记录尝试不升产品Bug。 | palette-command-n-fresh；不以CG事件发出当通过 |

| 16-A3 | 通过（后续真实拖入补齐） | Finder专用fixture窗口真实sample-image.png拖入B，消息出现预览/移除，英文草稿保留；B→A确认A空输入无该附件→B恢复；设置外观→返回B图片与原草稿仍在。最后移除。 | b-image-drag-ready、drag-a-isolation、drag-b-settings-return-dark；CUA drag坐标转换windowNotFound，规范CoreGraphics实际OS拖入成功，不用文件路径/业务state注入 |
| R20 本机普通文件drop / 09-P6-1补充 | 观察/验收口径差异；远端未覆盖 | 图片移除后，Finder真实选择sample.txt，文件名源AX1184,362,w70,h18；规范原生拖到消息框600,480，UI出现普通文件胶囊sample.txt，草稿保留，AX已附加文件/移除确认。未发送，随后移除。 | b-text-file-drop.png；与本机仅图片预期不同，原因/版本未知，不修复 |
| V04 主题进行中 | 浅/深设置及Composer视觉通过子项 | 原浅色/默认强调色/14px和13px；真实选深色，设置与B Composer颜色翻转、文字可读；后选跟随系统，OS原light下实际UI浅。 | appearance-original/dark、drag-b-settings-return-dark、appearance-system-light；System动态和480仍执行中，最终恢复原浅色 |

| V03 窄窗与多行 | 通过子项 | 实际480x760、右panel关闭后新建输入54px≥两行/工具条stacked；70次英文长草稿AX高度200px、真实内部滚动条；替换短文ShiftEnter得到两行无发送。Chat绿色chip/发送箭头/空placeholder问点什么正确。 | composer-480-stacked、composer-480-long-system-light、composer-480-shift-enter、composer-480-chat；非DOM测量，OS AX实际尺寸 |
| V04 System跟随 | 通过子项；完整主题页面组合未因代表场景全通过 | 原Light，选System→OS原false实际浅→父OS真实dark=true实际深→恢复false实际回浅。暂System保留待最终重启持久化，再restore原Light。窗口请求恢复1440x859，OS实际返回1440x850，原11,44未改。 | composer-480-system、composer-480-long-system-light；OS准备不注入业务主题 |
| 09-P3-4 | 正常最小窗通过；翻转分支未覆盖 | 480x760真实+完整上弹无裁切，当前可达尺寸上方足够未触发向下翻转。 | palette-480；Chat Slash向下不替+翻转 |
| 09-P5-2 / V03 ShiftTab补充 | 规范差异候选；不计09-P1-3失败 | freshCUA AX消息输入243焦点→实际click243→ShiftTab，Chat仍在，焦点到顶部打开面板AXCheckBox。 | mode-shift-tab-focused；工具按键影响未排除，不查根因 |
| V03 Chat Context | 新建空Chat子状态已观察，持久Chat状态行未覆盖 | 空B Chat /列表仅compact/status无Skills；选status清query但没有Context弹层/状态行。新建Chat无Context符合规范131；持久follow-up独立待验，不自动升Bug。 | chat-slash-480、chat-context-480-after |

| 15-A9 nonGit / R19禁用原因 / 09-P4-3无Host本机 | 通过子项 | 新建页工作区菜单使用已有文件夹→系统实际non-git路径确认→本机行无分支控件；运行位置有本机、连接远端机器…，新建工作树禁用且原因“当前工作区不是可用的Git仓库”。 | non-git-location.png，OS AX选择分支matched0；有提交/无HEAD与Host组仍独立 |

| 15-A9 | 通过 | 三真实系统目录分别non-git无分支；no-head显示symbolic main；有提交git-workspace主菜单main→codex/acceptance-alt实际标签更新→main恢复。 | non-git-location、no-head-location、git-branch-selected-alt；系统路径使用标准AX文本字段+独立CG Return，CUA paste/Return在该OS弹窗有工具异常不判产品 |
| R19 | 菜单/切分支及两禁用原因通过；新建分支未覆盖 | nonGit新工作树禁用明确原因，noHEAD禁用需要先创建提交；正常Git新工作树从main创建可选且UI目标新建工作树。当前新建页分支菜单仅两既有分支，没有新建分支入口；后续其它Git入口补。 | git-branch-menu、worktree-new-target；实际创建/首发09-P4-4执行中 |


### 本机 Git / 工作区后续补验

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| R19 | 通过 | 查看工作区环境→main→创建并切换新分支，输入codex/acceptance-new后实际创建、标签更新；随后菜单选main恢复。前文三类Git菜单/禁用原因均真实覆盖。 | git-create-branch相关截图；父仅白名单确认分支存在/main恢复。实际工作树创建属于09-P4-4单列 |
| 09-P4-4 | 不通过（已有文档接线缺口） | 新建页正常Git main→新建工作树目标→短请求WORKTREE-READY真实首发/正常回复结束。进入持久会话后实际状态仍main · 本机，未显示新工作树。 | 保留worktree首发/结束截图；UI验收现象，原因不定位；不扩大至R19 |
| 11-A3 | 通过 | 新建页工作区菜单→新建文件夹，实际输入desktop-created-1007名称不触发菜单字母导航；创建后系统选择folder-parent作为父目录，实际工作区标签新名称。 | 新folder截图；父只读确认folder-parent/desktop-created-1007真实存在且为空 |
| R11 | 通过（后续补齐分支比较） | Review→审查范围→分支→main → acceptance-local/main，面板准确标签与暂无变更。未提交sample.txt不混入分支已提交范围。前文真实初始提交历史差异已覆盖。 | review-branch-menu.png、review-local-upstream-result.png；fixture本地bare tracking同初始commit，无线上访问 |

| R21 独立键盘补验 | 通过；撤销CU-B04产品候选 | 同一提交对话框空说明/提交disabled，AXFocused取消按钮后独立CG VK36 Return实际关闭，焦点回提交或推送。 | git-cancel-independent-return.png；原CUA Return未关保留历史工具路径，独立系统Return成功，不再列产品Bug |
| 09-P3-2 Effort | 通过（UI/真实prepared请求参数子项）；旧两级路线版本差异 | Thinking保持true，独立模型按钮→编辑选项→Low实际选中，再真实发送安全sleep180任务。父仅白名单读取该轮request/context prepared.defaults.reasoning=true/reasoningEffort=low，之前high。 | queue-tab-task-start.png；prepared请求参数不等价provider wire抓包。Thinking已改/恢复见前文，最终Effort恢复原High |
| 09-P2-3 当前补验 | 执行中；前台冲突尝试不计产品失败 | A第18轮安全sleep180待审批时四条PAGE续问真实入队；首图标AXImage含4条数量。CG hover/Tab尝试期间OS前台先VS Code后QQ，未确认Electron前台，未落到目标不计通过/失败。随后标准AXPress批准真实任务。 | queue-tab-four.png；删除误合成其它窗口截图，后续物理动作前核frontmost，只在40906时发送 |


### 后续分页、压缩及新版现场（main d7eb043）

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| R25 | 通过 | 通用 Agent Instructions 打开真实主prompt编辑器，只在末尾追加无指令验收注释，保存复开确认marker，再只删该注释保存。父白名单哈希确认原文逐字节恢复。 | agent-instructions-editor；标准原生AX编辑UI，不覆盖产品源码，不展示Key |
| 16-A7 停止视觉 | 通过子项；重置hover/子Agent返回仍待 | 真实sleep180 Running时切执行轨迹，停止按钮为明确可见的原生风格按钮；返回对话，不点击停止，该任务自然结束。 | trajectory-running-stop-fresh.png；只此子项 |
| V01 | 20轮重载边界通过子项；早页加载/追加尚待 | A实际22轮后独立CmdR，UI加载消息，再显示第3轮为首条，符合最近20轮边界。四条PAGE续问已实际看到尾部唯一回复。 | pagination相关截图；运行时22user/22end仅辅证，不代替早页UI |
| R16 | 基本压缩通过；期间队列禁用/结束续发未覆盖 | 实际输入/compact，选择真实Slash compact项目，UI正在压缩上下文；6秒后“上下文已压缩 · 63条消息 · 6s”。压缩期仅填入followup，尚未成功发送，不能冒充期间队列。 | compact-start.png；main d7eb043，相比此前证据Composer版本改变 |

| V01 后续独立补齐 | 通过 | 独立Reload后第23轮样本首导航为旧第4轮（最近20轮）；确认40906前台后真实滚屏，未发送/未再压缩，fresh原生CUA AX恢复第1–23轮，每轮唯一。真实点击首轮显示唯一原始prompt/reply。随后真实再发PAGE-AFTER-LOAD第24轮，唯一prompt/reply正常追加并空闲。 | pagination-first-independent.png、devtools-tabs-menu.png（第24轮）；只原生UI，不以journal计数冒充 |
| 14-A5 | 执行中；Memory采样当前未覆盖 | 应用标准View→ToggleDevTools实际打开Console。MoreTabs菜单视觉有Memory，但40906 AX无该菜单标签；原生坐标点击遇用户前台切走安全skip，键盘Down/Return未选到Memory。CUA实际Close关闭后继续15真实fixture新建/发送/归档。 | devtools截图；不以Console/RSS替JS堆，无调试根因/执行Console脚本。第一轮录屏仅专属窗口15182。 |
| 17-A2 待重启值 | 即时保存通过；重启待 | 默认会话模型deepseek-flash→claude-haiku-4-5-20251001，Select保存，后fixture新建页及真实请求使用该型号。父仅读盘确认绑定custom Haiku；最后重启验证后UI恢复。 | memory01-ready.png；工具开关仍待实际改 |

### Memory 生命周期第 1–5 轮 checkpoint（当前 main d7eb043）

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| 14-A5 生命周期 | 5/15 真实新建、发送、结束、归档已完成；继续执行 | 均侧栏 git-workspace 专属新建入口，唯一 MEM-01 至 MEM-05 prompt，真实发送按钮→唯一完成回复/停止消失→切 A→按当次实际完整标题归档→侧栏目标移除。MEM-04 回复 I can't discuss that.，属于真实完成样本。 | memory01-first-send.mov、memory01/02/03/05-end.png、memory-current-stall.png（实际 MEM04 完成）；原验收 helper 只等待 marker 过窄，纠正为唯一 prompt+回复控件+空闲，不列产品 Bug/性能失败。未注入 session/业务 state。 |
| 16-A4 当前版键盘补验 | 焦点/转场部分未覆盖 | MEM05 标准 AXFocus 后系统读焦点消息 AXTextArea，确认前台后独立 CG Return；前后焦点仍消息框，但窗口保留完整草稿，未形成消息。随后用户切前台即停止 CG，再 AXPress 发送完成。 | memory05-keyboard-firstsend.png、memory05-firstsend-settled.png；不能把 AXFocus 当真实 caret，不判产品 Bug。Memory01 视频仅证明当前版实际可见转场不闪，AXSend 焦点不替键盘首发焦点。 |
| 14-A5 Memory 手动 GC | 未覆盖（第 5 轮后仍未取值） | 真实 View→Toggle Developer Tools 打开 Console→More Tabs 视觉 Memory。纯视觉坐标菜单出现有延迟，独立 CG 点击时多次 frontmost 已变，安全跳过；没有实际进入 Memory/GC/堆值。 | memory-menu-stable.png、devtools-current-five.png；不以 Console 线索或 RSS 代替 JS 堆趋势。后 10/15 轮若入口可达再补。 |

| 14-A5 第 15 轮完成 | 生命周期子项通过；GC 堆趋势未覆盖 | MEM-01 至 MEM-15 全部通过真实侧栏 fixture 新建→标准原生输入/发送→唯一自有 prompt+完成回复/空闲→切 A→按当次实际标题归档→侧栏移除。第 8 轮自动标题晚于回复出现，等实际标题后才归档，不操作泛 New chat 用户会话。 | memory01–15-end 实际截图（MEM04见memory-current-stall）；15轮全部UI完成。第5/10/15轮未取得有效Memory/手动GC样本，不能宣称JS堆不增长，14-A5整项仍未覆盖。 |
| 16-A4 MEM11独立物理补验 | 当前键盘首发转场焦点未覆盖，具体现象保留 | fresh原生AX消息框360,452,w452,h54，正常置前40906→CG click550,480→CG Return；截图有真实caret、完整草稿、发送箭头启用，AX焦点消息输入框；未实际submit。随后AX发送完成第11轮。 | memory11-key-firstsend.png；工具/豆包输入源影响未排除，不用此候选定产品根因，不反复。 |

### 状态释放与侧栏后续 checkpoint

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| 14-A6 | UI路径通过；后台无残留请求未覆盖 | desktop-created-1007真实新建/首发Reply FOLDER-GC only/唯一回复结束；其工作区菜单从侧栏移除→folder与FOLDER-GC AX matched0；精确A会话AXShowMenu→重命名为桌面验收 A 1007 refresh并Return保存→两者仍matched0、侧栏无其审批/队列徽标。 | folder-gc-session-complete、folder-gc-after-remove、folder-after-other-rename；父仅读metadata确认folder session88672708…1user/1end。后台审批/队列调用无IPC观察，不以界面消失声称后台绝无请求。 |
| R09 分叉/归档 | 通过（补齐整项） | A refresh真实会话菜单分叉→第二同名会话出现/切入，原PAGE/compact末尾内容正确；依据当前选中分叉位置468与精确标题标准AXShowMenu→改名桌面验收 fork 1007，当前header更新；切原A后按唯一fork标题归档，侧栏目标移除。前文置顶/取消/重命名/复制ID/记录已实际覆盖。 | session-fork-created.png；父仅读lineage确认a3b749db…parent19311285…originfork。误CUA坐标曾打开New chat菜单，精确菜单Description识别后仅Esc关闭，未改用户会话。 |

### 设置持久化待测值与辅助能力 checkpoint（main d7eb043）

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| 17-A2 工具开关 | 即时保存通过；正常重启待 | 工具页写入文件由开改关，显示5/6与已保存；父白名单disabledTools=['write_file']，原[]。保留到最终重启后UI恢复。 | tools-writefile-off-persist.png；默认Haiku同样待重启 |
| 13-A5 快捷键 | 即时UI通过；磁盘/重启尚待 | 通用录制快速唤起快捷键→实际⌘⇧K，显示已生效；离开至外观再回通用仍K，无第二保存按钮。原⌘⇧Space，enabled及原已移除会话target均未改。父白名单文件仍原快捷键，分层保留差异。 | quick-shortcut-temp-saved.png、quick-shortcut-reopen.png；不定位原因、不凭UI推断落盘 |
| 16-A7 数值重置hover | 通过子项 | 外观界面字号14→15，标准AX读真实重置坐标后实际CG hover：灰底且tooltip“重置 界面字号”；AXPress重置恢复14。 | numeric-reset-target-hover.png；停止视觉已前文覆盖，子Agent详情返回仍待 |
| 16-A6 独立Esc补验 | 不通过候选保留，工具影响仍未排除 | fresh图片配置Dialog、焦点更换Key、前台40906，独立CG Esc未关闭；截图/AX仍Dialog。正常CUA重新绑定后点取消实际关闭。第一层未由本次CG关闭，未拼第二Esc完整通过。 | settings-independent-esc1-settled.png；不展示Key、不定位根因，CU-B06原第二Esc历史现象仍保留 |
| 16-A2 / 09-P3-5 | 未覆盖（实际读屏输出缺前提） | 通用现场实际CG CmdF5尝试系统VoiceOver；未观察字幕/听觉输出，进程只读未见VoiceOver。CUA快捷尝试被user-changed guard挡住未发出。随后前台读取涉及loginwindow，停止物理动作，不绕guard。 | voiceover-attempt-after.png；普通AX名称不替读屏，未声称听见/朗读通过。OS原始VoiceOver关闭基线，后续可达再补 |

| 09-P1-3 | 通过 | 同一fixture新建草稿实际选Plan/Chat，保持MODE-COLOR-DRAFT使箭头启用；System浅色和深色分别观察：Plan黄色chip/黄底发送、浅色白箭头及深色黑箭头均清晰；Chat绿色chip/绿色发送箭头清晰。未发送模式草稿，最后清空并退出Chat。 | plan-light-chip-arrow.png、plan-dark-chip-arrow.png、chat-dark-chip-arrow.png、chat-light-chip-arrow.png；System已恢复作为重启待测值。 |
| 09-P5-2 | 部分通过/差异与缺前提明确 | 当前两份规范对照实际已走UI：常显独立模型与不进+符合当前并发版本；长输入200px内滚、480尺寸stacked、Agent/Plan/Chat chip、三Git状态与原因、本机位置/main标签均已真实观察。旧handoff的+模型两级路线属于版本差异；ShiftTab工具路径候选仍待独立复核；Host空缺真实远端，+翻转分支真实桌面minHeight760未触发。 | 对应前文逐项截图；非静态测试代替通过，不把旧路线差异直接当新回归。 |

| 16-A7 后续详情返回 | 通过（补齐整项） | A真实请求Explore只读fixture sample.txt，实际子Agent列表生成记录；点击该记录详情可见真实读文件/摘要，左箭头返回按钮清晰，点击后准确回单记录列表。停止视觉、数值重置hover分别已覆盖，三处齐备。 | subagent-running.png、subagent-detail-back.png、subagent-back-list.png；并未静态设置页替详情。 |
| CU-OBS 子Agent状态 | 记录现象，不定位 | 同一次主任务卡显示Explore·DURABILITY_BLOCKED/失败，主回复声明未成功读取；子Agent详情却含Read sample.txt及短摘要，列表标失败。 | 同三图；不根据摘要推真实执行成功、不修复或调查引入版本。 |

| R23 独立Esc复核 | 不通过候选保留；鼠标关闭/回焦通过 | 原第13轮实际Mermaid图表AXScrollToVisible→放大查看，fresh预览/关闭预览焦点与前台40906下独立CG Esc仍不关；之后AXPress关闭预览实际收层，焦点回放大查看。 | mermaid-independent-esc-settled.png；CU-B07现象进一步保留，但系统输入工具因素未排除，不定位产品原因、不反复。 |

| 09-P2-3 后续真实补验 | hover/进入行按钮通过；计数Tab焦点未覆盖 | 新safe sleep180批准运行，实际两条FOCUS-QUEUE排队；首计数图标CG hover显示“2条排队，当前运行结束后依次发送”。AXFocus计数为前提，正常置前真实Tab后焦点↳引导，行按钮显现/描边与tooltip“让Agent在下一步看到这条消息”；后ShiftTab未观察回计数，不能冒充计数Tab路径。 | queue-count-hover.png、queue-row-key-focus-actions.png；中途前台变化CG安全skip，不当产品Bug。任务自然结束不追认剩余焦点。 |
| 09-P4-3 480本机菜单 | 通过子项；Host部分未覆盖 | 实际AXSize480×760，新建fixture页分别打开工作区/分支/运行位置菜单，三菜单均完整在窗口内；切另触发器旧菜单收，main本机选中正确，无Host时连接远端机器…可见。 | workspace-menu-480.png、branch-menu-480.png、location-menu-480.png；Host为空，真实Host子菜单缺前提；窗口随后恢复1440×850。 |
| V04 480运行队列 | 未覆盖此分支 | sleep180实际运行期480resize时右侧终端浮层占满窄窗；收右面板后任务已自然完成，未捕获窄窗运行队列布局。 | queue-480-running.png仅终端，不计队列通过；不重复长任务。 |

| 09-P3-2 原值恢复 | 完成 | A的deepseek选项实际点击High，截图checkmark在High/Thinking开；原High已恢复。新建页原先High不等价A原值，故单独在A执行。 | effort-high-restored.png；并未发送额外模型请求。 |
| R14 | 通过 | git-workspace精确AXShowMenu并核菜单来源→归档全部；settled侧栏fixture组、A refresh、WORKTREE-READY及其空验收草稿会话全部移除，精确matched0。自动回产品仓库新建空页，未发送/修改产品会话。 | workspace-archive-all-menu.png、workspace-archive-all-after.png；仅验收工作区对象，归档可恢复。 |

| 11-A2 | 通过 | 标准窗口AXCloseButton实际关窗，窗口数0；父comm-only核旧终端5020消失而40906仍存活。系统Dock实际唯一Actspace应用AXDockItem→AXPress重开，同40906新窗口20043显示正常空页/输入可用，无旧PTY自动恢复。 | dock-reopen-window.png；重开窗口bounds15,33,1440×863，后续只用新window。 |
| 11-A4 退出准备 | 已建立新清理现场，尚待正常Quit | 归档页精确自身A唯一标签与同Y唯一恢复按钮恢复验收A，打开该fixture会话右面板新建终端；不恢复其它用户历史对象。 | dock-reopen-a-restored.png；旧R14归档事实保留，验收A最后再次归档。 |
| 11-A4 before-Q | 新退出现场完成 | 新窗口20043中精确恢复验收A，新建终端1，再点击Review真实显示fixture图片变更；应用菜单实际存在Quit Electron，AXActions含AXPress/AXPick。通知父取PID树后执行该真实菜单，不使用kill。 | before-quit-review-terminal.png；配置待重启值System、默认custom Haiku、write_file关闭、cheaprouter.cc [acceptance]、UI快捷⌘⇧K；Effort原High已恢复。 |
| 11-A4 正常退出首尝试 | 尚未退出，继续真实菜单入口 | 隐藏菜单树唯一Quit Electron AXPress返回success，但fresh ps仍40906/77945存在，窗口仍在；不以action success冒充退出。 | before-quit-review-terminal.png；随后打开实际应用菜单再尝试，不SIGTERM。 |
| 11-A4 菜单Quit终态 | 通过当前有进程分支 | 同一次Quit Electron AXPress后异步关闭：首秒进程仍在，后freshAX仅root/窗口消失，ps40906/77945均空。父核完整helper树。 | 不以AXPress返回值替退出；Review短Git已结束、Bridge未活动，未构造长驻Git/Bridge样本。 |

### 正常重启持久化与恢复（新PID82922/window20069）

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| 17-A2 | 通过 | 同main同目录pnpm dev:log正常重启，默认Haiku仍选中，工具写入文件仍关闭/5of6。随后UI默认模型Select选deepseek-flash、工具写入文件开恢复原值。 | restart-general-persistence.png、restart-tool-persistence.png；父读盘仅辅证。 |
| 17-A3 | 通过（补齐重启） | 自定义连接cheaprouter.cc [acceptance]重启后仍名称/可用，之前检测/真实Haiku回复已覆盖；UI编辑名称→cheaprouter.cc保存恢复。 | restart-connection-persistence.png；不改Key/BaseURL/模型。 |
| 13-A5 | 不通过 CU-B13 | 外观System/工具write_file关闭在重启后保留；快捷退出前UI录制⌘⇧K已生效且复开仍K，重启后却回⌘⇧Space已生效。原target/enable未动。 | restart-theme-persistence.png、restart-shortcut-persistence.png与此前quick-shortcut-temp-saved/reopen；不诊断原因。 |
| 原值恢复 | UI已执行；最终核对续 | 默认deepseek-flash、write_file开、主题浅色、连接原名cheaprouter.cc已UI恢复；快捷/原已移除会话target自动恢复基线。父只恢复zhipu单条密文，UI搜索智谱已连接/2of4，其他secret保留。 | restart-search-restored.png；Thinking1/EffortHigh、字体14/code13、OS浅色/豆包、英语off/原target、R25prompt原文均前文已恢复。 |
| 16-A5 后续底部Select | 通过（补齐） | 快速唤起原指定已移除会话，实际改自动选择第一个项目，重新打开当前checkmark自动；当前布局更低，Select实际上翻且完整可见。物理Esc前台其它app安全skip，不计失败；之前代表位置Esc已覆盖。 | quick-target-change-menu.png、quick-target-changed-reopen-up.png；原target最后正常退出后父仅必要时恢复，重启UI核原占位。 |
| R17 当前版补验 | 点击卡/编辑/清理通过；hover仍未覆盖 | 真实双击自有回复词Automated→添加到对话→评论保存；精准胶囊1条批注CGhover已发但截图未见卡，不能把事件发出当通过。实际点击胶囊展开卡，选文Automated与评论Desktop hover acceptance准确，编辑Desktop hover edited保存收层后清批注/草稿。 | annotation-capsule-hover.png、annotation-capsule-click.png；前台/OS事件因素未完全排除，不诊断。错误source标记hover不计要求结果。 |
| R20 图片筛选补验 | 未覆盖筛选分支；既有选图片成功保留 | 实际+图片打开OS选择器；GoTofolder标准AXPathSet fixture路径、CG Return及原生AXConfirm均未完成目录进入，临时ABC后一次仍未完成，取消回应用，父恢复豆包。 | picker-file-types-abc.png；不据静态filter宣称通过，不重试系统限制。 |
| V02 补验 | 互斥通过；Left/Tab仍未覆盖 | 实际Skills子面板→模型搜索（Skills收）→Context（模型收）；Left在搜索combo前提未返回，Tab另一前台safe skip，不当产品失败。 | palette-left-tab-before.png、palette-mutual-context.png；旧模型两级路线版本差异仍单列。 |
| 09-P1-1 当前版视频补验 | 删除与缩高部分通过；逐字删空完整路线未覆盖 | 标准UI1431字长稿200px内滚，实际物理click/Backspace后1430字。CmdA未有效选区，随后标准原生AXSelectedTextRange保留最后1字符→Backspace，实际缩34px/caret；最后Backspace后安全AX仍1字符，未冒充空；UI清草稿恢复。 | delete-video-long-before.png、delete-video-one-after.png、delete-one-char-shrink.png；录制尝试三个Popen PID返回，但磁盘实际未生成mov，不能作为视频证据；批量选区删除不代替原逐字节奏/全路线，瞬时视频未实际落盘，不能解析或据此判通过。 |


### 最后可执行分支与收束（PID82922）

| 编号 | 结果 | 实际操作与现象 | 证据与边界 |
|---|---|---|---|
| V03 持久Chat后续 | 通过子项；整项未覆盖 | fixture专属新Chat实际首发唯一CHAT-CONTEXT-READY完成；后续只显示Context<1%，无workspace/分支/本机目标。实际Context打开/收起正常；精确Chat名称物理点击后仍Chat且无选择菜单，名称不可点符合当前规范。 | chat-followup-context.png、chat-context-open.png、chat-name-click-unchanged.png。模式chip与正确×Backspace此前已覆盖；所有模式运行中placeholder未逐一取得现场，整项不拼通过。会话a4b5694f-a5c6-4419-a8f0-597241bb9810，仅验收fixture。 |
| R08 最终边界 | 整项未覆盖 | 已实见idle/pending/running；当前A先前failed轮后已有成功轮，不能拿其旧失败当当前失败状态点。未构造删除用户Key/清空模型前提。 | 早期通用配置状态点截图为显示补充；真实failed-session及对应未配置分支无充分实际样本，留未覆盖。 |
| 验收对象归档准备 | 未归档，重启后继续 | 当前选中Chat/A行实际归档菜单disabled、描述当前会话无法归档，AXPress不改变。父只读规范补充当前选中行本应禁止归档，故不列Bug；后续先空新建页再精确未选中验收对象归档。 | final-chat-archive-state.png、final-a-archive-disabled.png；未动用户历史对象。 |
| 最终正常Quit | 已实际退出 | 唯一Quit Electron菜单AXPress后fresh ps82922/82959/82960/83033全部消失，nativeAX仅root，已通知父同dev:log正常重启。 | 不用SIGTERM。原quickOpen磁盘整体与baseline一致，父无必要时不写字段；重启仍需UI核原已移除会话target。 |


### 最终恢复核对与现场清理完成（PID9196/window20739）

| 项目 | 终态 | 实际操作与证据 |
|---|---|---|
| 正常重启 | 完成 | 同main同目录dev:log重启后CUA重新绑定，真实窗口20739，bounds15,33,1440×853；不沿用旧窗口坐标。 |
| 精确归档 | 完成 | 先点击新建会话回空页，未选中A refresh/Chat各AXShowMenu→唯一归档。异步完成后精确标题matched0。父journal仅辅证对应19311285…与a4b5694f…已archived，未操作用户历史对象。当前选中行禁止归档是正常前提，前一disabled观察不列Bug。 |
| 最后快捷目标恢复 | 完成 | 通用页真实截图显示快速唤起开、⌘⇧Space已生效、打开目标指定会话、默认会话已移除的会话（将自动降级）；临时UI automatic已恢复。父确认磁盘始终baseline，此次没有改写settings字段。 | 
| 默认模型与最终可用应用 | 完成 | 通用页默认/轻量/Explore均deepseek-flash；返回应用后空新建页消息输入框可见，A/Chat精确标题均matched0，应用保持运行未发送产品repo请求。 |

证据：final-baseline-restored-general.png、final-baseline-restored-shortcut.png、final-usable-app-test-objects-archived.png。此前defaultChat、tools、外观Light、连接原名、搜索zhipu、快捷与target、Thinking/Effort、prompt、英语开关/target、字体、OS外观/输入源均已恢复；读屏未启用。本轮仅验收记录，不修复、不定位根因、不提交或推送。不存在的long-input影片不列证据，所有实际键盘/焦点/瞬时未覆盖保留边界。
