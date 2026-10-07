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
