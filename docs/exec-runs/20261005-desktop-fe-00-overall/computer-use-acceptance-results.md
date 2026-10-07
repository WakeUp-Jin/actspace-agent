# Desktop 前端重构 Computer Use 验收结果

- 日期：2026-10-07。
- 状态：执行中；用户明确只验当前已启动的真实桌面端。浏览器后续验收取消，尚未全部验收。已登记10个有效问题/候选；CU-B02经规范核对、CU-B04经独立原生按键复核撤销候选，原观察保留。CU-B05–B07及CU-B10/B11工具按键影响仍待排除，CU-B09请求语言约束影响待复核；均未修复。
- 当前版本：main `d5f1bf3eb1f51346789349d57a06f17c18d64cd9` + 已有未提交工作区改动；17:00再次核对产品源码SHA256相对15:40无变化。首次基线main为 `f1a28c2f`，基线见 [computer-use-baseline.json](computer-use-baseline.json)。
- 职责：只验收和记录，不修复、不改产品代码、不提交/推送。
- Computer Use 执行者：gpt-6.1-sol。
- 首次环境：既有 Electron / 平时数据目录，应用身份 `Actspace Dev actspace-agent-2067`，Vite 5173。
- 当次用户纠正：直接使用现有平时数据Electron，不再默认切临时数据。修改设置先记原值、验后恢复；文件/Git用临时fixture。
- 隔离main检出曾为版本稳定准备，用户纠正后不再用其启动验收；当前真实应用来自main工作区+已有dirty Composer，精确标注操作版本。
- 62 个专项、3 个建议、25 个去重冒烟、4 个规范补充，共 94 个编号。

## 执行过程

- 启动前核实 main、源码改动与既有应用/端口。没有修改源码。
- Sol已完成现有真实窗口只读基线，逐项记录见 [computer-use-g1-results.md](computer-use-g1-results.md)；用户纠正后不再执行mock，持续真实桌面记录见 [computer-use-desktop-results.md](computer-use-desktop-results.md)。
- 其他工作在验收期间新增 main 文档提交 `d5f1bf3e`；基线产品源码 SHA256 未变。现有证据保留其操作时 HEAD，后续证据标注新 HEAD + 同一 dirty Composer 版本。
- 当前原生应用已按 bundle ID 绑定，只验用户已启动的真实Electron。用户纠正前的Chrome/IAB探索仅保留为历史记录，不再继续，也不计为桌面通过。
- CUA原生完整界面树读取单次约61秒；工具等待不视为应用无响应。后续已验证系统原生AX只读观察约一秒，Sol可用真实OS鼠标/键盘及AXPress补CUA缺能力，保留操作方式和实际截图；不注入DOM/业务状态。
- 后续其他任务继续改动 Composer.tsx、ComposerPalette.tsx、ModelPicker.tsx 及相应测试/规范；本任务没有改产品源码。操作版本需结合 [computer-use-version-snapshots.json](computer-use-version-snapshots.json)，涉及 Composer 的结论不直接拼成同一源码版本的一次完整通过。
- 后续操作全部在当前Electron及其系统文件对话框进行；不执行浏览器mock路线。

## 版本差异与运行时线索

- 当前 ComposerInput/ComposerToolbar 未提交改动使 inline 模型按钮常显；保留用户改动，相关规范差异单独标注，不能自动归为重构回归。
- 启动前既有日志出现 task-command `Session is not writable`；这是运行时线索，尚未经本次 UI 复现确认。

## 逐项结果

| 编号 | 状态 | 现象 / 子项覆盖 | 验证层 / 环境 | 证据 |
| --- | --- | --- | --- | --- |
| 10-A1 | 通过 | 真实审批分别拒绝/批准：第一轮切B/A后拒绝显示Denied并正常结束；第二轮切B/A后运行工具卡Running/侧栏运行中，等待审批消失，队列引导启用。第二轮长工具自然exit0/desktop-queue-ok，之后队列顺序续发；进程自然清理 | 真实 Computer Use + journal/PID辅助 / E-U，仅fixture | [审批现场](screenshots/computer-use/desktop/task-start.png)、[拒绝结束](screenshots/computer-use/desktop/approval-denied.png)、[桌面记录](computer-use-desktop-results.md) |
| 10-A2 | 通过 | 真实终端创建→命令输出→关闭旧shell98382消失→重开新shell5020；新终端CtrlU清行独立echo hi输出hi。此前混合输入尝试单列，未升产品Bug | 真实 Computer Use + PID辅助 / E-U | [最终echo截图](screenshots/computer-use/desktop/terminal-echo-final.png)、[重开](screenshots/computer-use/desktop/terminal-reopened.png)、[进程](computer-use-desktop-processes.json) |
| 10-A3 | 不通过 | Review保持未提交范围打开；12:25:44仅fixture sample.txt追加一行，随后未刷新观察仍只有sample-image.png，无sample.txt或新增行。后续范围切换不追认自动更新通过 | 真实 Computer Use + fixture diff辅助 / E-U | [更新后观察](screenshots/computer-use/desktop/review-auto-update.png)；CU-B03 |
| 11-A1 | 未覆盖 | preview.md HTTPS链接已真实点击；系统Chrome绑定显示既有页面，example.com目标URL尚未核实。停止外部窗口探索后返回Electron；未用点击替代成功判定 | 真实 Computer Use部分 / E-U | 桌面当场观察；目标URL缺证据 |
| 11-A2 | 待执行 | — | — | — |
| 11-A3 | 通过 | 新建页工作区菜单→新建文件夹→输入desktop-created-1007（未触发字母跳转）→创建→系统选择未登记fixture/folder-parent→打开；当前工作区同名、侧栏AX同名节点。磁盘真实新目录存在，侧栏可见滚动复核另保留 | 真实 Computer Use + fixture目录存在辅助 / E-U，仅fixture | [创建完成](screenshots/computer-use/desktop/new-folder-created.png)、[桌面记录](computer-use-desktop-results.md) |
| 11-A4 | 待执行 | — | — | — |
| 13-A1 | 通过 | 真实消息流式Thinking增长/正常完整结束；真实bash工具审批已运行，Running/日志/正常exit0与最终回复可见。批准/拒绝单列10A1实际通过 | 真实 Computer Use / E-U | [流式](screenshots/computer-use/desktop/stream-growing.png)、[完整结束](screenshots/computer-use/desktop/stream-complete.png)、[审批](screenshots/computer-use/desktop/task-second-start.png) |
| 13-A2 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 13-A3 | 未覆盖 | 英语辅助目标A1007实际开启后发短英文请求，最终仅英文无中文；prompt明确要求one short sentence in English，未能排除请求约束影响，保留CU-B09待复核而不定产品Bug。试听原配置实际点击无可见错误，未实际听到音频，不判TTS通过或失败。CUA已确认恢复原off及电商Harness解读目标 | 真实 Computer Use部分 + PID观察范围说明 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json)；CU-B09待复核 |
| 13-A4 | 通过 | 系统图片选择器实际选择/预览/移除/回焦，OS PNG剪贴板⌘V实际image.png附件且草稿焦点保留。现真实苹果拼音ni候选→Right选择尼→Space确认中文成功；Esc收候选未误发，A/B往返确认汉字草稿保留。图片粘贴、选择器和中文组字三类动作已真实覆盖；精细IME按键另列09P1-2，不替代其剩余范围 | 真实 Computer Use + OS剪贴板/输入源准备 / E-U | [IME中文确认](screenshots/computer-use/desktop/ime-chinese-space.png)、[真实图片粘贴](screenshots/computer-use/desktop/b-pasted-png.png)、[桌面记录](computer-use-desktop-results.md) |
| 13-A5 | 待执行 | — | — | — |
| 13-A6 | 本轮范围外 | 用户明确不验浏览器；已有mock观察仅作历史补充，不计桌面端通过 | 浏览器历史记录 | [G1记录](computer-use-g1-results.md) |
| 14-A1 | 通过 | 第一轮真实160行输出中切B/A与⌘R，最终完整1–160且唯一prompt/空闲；之后独立custom真实输出中再次⌘R，最终长list+CUSTOM-CONNECTION-OK/Mermaid完整、唯一第13轮正文、空闲/发送禁用。第二次先前失败样本保留，不代替后来实际重载成功；重载实时delta暂不可见为交接已知行为 | 真实 Computer Use + 模型header辅助 / E-U | [第一轮完整](screenshots/computer-use/desktop/stream-complete.png)、[custom输出现场](screenshots/computer-use/desktop/custom-reply.png)、[custom重载](screenshots/computer-use/desktop/custom-output-reloaded.png)、[custom完整终态](screenshots/computer-use/desktop/custom-end.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A2 | 通过 | 第二轮真实审批pending切B回A后同命令卡片/等待审批保留，点运行后卡片Running、侧栏运行中，待审批标记消失；工具日志可见 | 真实 Computer Use / E-U | [第二轮审批](screenshots/computer-use/desktop/task-second-start.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A3 | 未覆盖 | 未获得真实提交acknowledgement unknown样本；此前provider任务失败已接纳用户消息，不能替提交未知。只读核对unknown为submit桥接无确认路径，停模型不保证进入；不注入localStorage、不全局断网或强杀用户当前app造前提，未知草稿恢复/同提交重发尚未实际验证 | 真实失败样本 + 只读前提核对 / E-U | [桌面记录](computer-use-desktop-results.md)、session-gateway.ts108–121，仅边界核对 |
| 14-A4 | 未覆盖 | 组字切换子项真实通过：B尼ni中ni尚未确认、候选打开→A原会话及空输入→回B，尼ni与候选网格保留，无误发或覆盖。尚无真实未确认提交样本，已有输入不被恢复草稿覆盖子项未验证，整项不拼通过 | 真实 Computer Use部分 / E-U | [组字切换返回新帧](screenshots/computer-use/desktop/ime-composing-switch-back.png)、[切A新帧](screenshots/computer-use/desktop/ime-composing-a-fresh.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A5 | 待执行 | — | — | — |
| 14-A6 | 待执行 | — | — | — |
| 14-A7 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A1 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A2 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A3 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A4 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A5 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A6 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A7 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A8 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 15-A9 | 通过 | 系统选择器实际打开nonGit隐藏分支；无HEAD显示main、worktree禁用“需要先创建提交”；正常仓库实际main→codex/acceptance-alt成功选中→main恢复。三态均真实界面覆盖 | 真实 Computer Use / E-U，仅fixture | [非Git](screenshots/computer-use/desktop/non-git-location.png)、[无HEAD](screenshots/computer-use/desktop/no-head-location.png)、[正常切分支](screenshots/computer-use/desktop/git-branch-selected-alt.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A1 | 不通过 | 首次ShiftF10初焦置顶→↓Return成功重命名并提交回标题；其后两次新菜单同样↓Return实际置顶，未进入重命名。键盘移项不稳定，工具影响尚不能排除；鼠标重命名输入取消标题→Esc，标题保持桌面验收A1007且焦点回标题，取消子项通过 | 真实 Computer Use / E-U，仅验收A | [重命名完成](screenshots/computer-use/desktop/sidebar-renamed.png)、[桌面记录](computer-use-desktop-results.md)；CU-B05待复核 |
| 16-A2 | 待执行 | — | — | — |
| 16-A3 | 通过 | 真实Finder→OS鼠标拖入sample-image.png成功，B有图片缩略预览/移除及专属英文草稿→A新鲜图空输入无该附件→B图片/文字保留→设置外观→返回B深色下图片预览和原草稿仍正确。选择器/PNG粘贴子路线此前分别记录，不替代此次真实drag路径；A/B名称互换不影响草稿归属测试 | 真实 Computer Use / E-U，仅fixture | [拖入就绪](screenshots/computer-use/desktop/b-image-drag-ready.png)、[A隔离](screenshots/computer-use/desktop/drag-a-isolation.png)、[设置返回B](screenshots/computer-use/desktop/drag-b-settings-return-dark.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A4 | 执行中 | 真实新建工作树请求首发后输入空且AXTextArea消息输入焦点保留；此前首发完成态也保留caret。父子消息延迟使20秒录屏仅捕获首发前草稿，未覆盖转场，瞬时不闪仍待同batch录屏补验 | 真实 Computer Use部分 + OS录屏范围说明 / E-U | [此次终态](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[录屏](screenshots/computer-use/desktop/first-worktree-send.mov)、[运行时](computer-use-desktop-runtime.json) |
| 16-A5 | 执行中 | 默认模型鼠标从deepseek-flash选Kimi K2.6，显示已保存、下拉关闭且焦点回默认模型按钮；分步打开→Up聚焦deepseek-flash→Return恢复/保存/回焦通过；批量时序差异未判Bug，底部快捷目标三项完整可见但此尺寸向下、上翻未触发；Esc仅收下拉/仍通用页/回焦。快捷目标改值、重开与上翻仍待 | 真实 Computer Use / E-U | [底部下拉](screenshots/computer-use/desktop/settings-bottom-select.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A6 | 不通过 | 图片生成配置打开，第一Esc关闭Dialog、仍通用设置并回焦编辑按钮；单独第二Esc后仍通用页/focus同按钮，未退出设置。工具按键影响待复核 | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md)；CU-B06待复核 |
| 16-A6b | 通过 | 自定义连接模型编辑草稿打开推理支持Select；Esc只关闭下拉，编辑器保持，焦点AXComboBox/推理支持。随后第二Esc退出编辑器且未保存临时能力草稿；第二Esc焦点HTML为补充观察，不属于本项Select保持表单预期 | 真实 Computer Use + OS只读焦点 / E-U | [嵌套Esc现场](screenshots/computer-use/desktop/reasoning-select-esc.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A6c | 通过 | A打开+→侧栏切B，+收起；A开Context→侧栏切B，Context收起，六桶数据已见。原handoff要求⌘N或侧栏，两类浮层均已真实侧栏切换通过。额外⌘N先CUA user-changed guard未发键、再独立CG无可见变化，仅补充尝试，不替原通过也不判产品Bug | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md)、[Context](screenshots/computer-use/desktop/context-open.png)、[额外⌘N尝试](screenshots/computer-use/desktop/palette-command-n-native.png) |
| 16-A7 | 执行中 | sleep180真实Running期间打开执行轨迹，右上停止按钮细边框视觉已实际观察，未点击以保留队列现场。设置数值重置hover与子Agent详情返回两处继续，代表一处不拼三处全通过 | 真实 Computer Use部分 / E-U | [运行轨迹停止](screenshots/computer-use/desktop/trajectory-running-stop-fresh.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P1-1 | 执行中 | 已覆盖形态与焦点：長文18重复句折行/内滚→删至“折”仍多行→删空胶囊/发送禁用。瞬时光标不跳/不闪因61s观察未完整验证 | 真实 Computer Use / E-U | [逐步记录](computer-use-desktop-results.md)、[一字截图](screenshots/computer-use/desktop/composer-one-char.png)、[删空](screenshots/computer-use/desktop/composer-empty.png) |
| 09-P1-2 | 不通过 | 苹果拼音真实候选已达：Space汉字确认、Enter仅提交组字未误发、Down/Up只操作候选、ShiftTab未切Plan；组字切换后候选/草稿保留。Slash中ni候选→单独CUA Esc后组字取消，但整个Slash面板也消失，违反只收候选预期；按键工具影响未排除，CU-B10待独立复核。验后原豆包输入源已恢复 | 真实 Computer Use + 原生输入源准备/恢复 / E-U | [Slash候选](screenshots/computer-use/desktop/ime-slash-pending.png)、[Esc后](screenshots/computer-use/desktop/ime-slash-esc.png)、[桌面记录](computer-use-desktop-results.md)；CU-B10 |
| 09-P1-3 | 待执行 | — | — | — |
| 09-P2-1 | 通过 | 真实长任务期间5条队列，最多露4行/内部滚动；空草稿仍胶囊、不被托盘推成多行，原托盘位置稳定；待审批引导禁用，批准后可用 | 真实 Computer Use / E-U | [五条队列与胶囊](screenshots/computer-use/desktop/queue-five-pending.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P2-2 | 通过 | 第三轮真实运行中引导成功，1排队/1已引导与下一步读取/撤回；撤回恢复2排队；删除另一条后停止，空闲/1已暂停/继续发送按钮出现，进程55397/55399清理。继续后STEER-ONE唯一用户消息与回复，队列消失/发送禁用/空闲 | 真实 Computer Use + PID辅助 / E-U | [引导](screenshots/computer-use/desktop/queue-steered.png)、[撤回](screenshots/computer-use/desktop/queue-withdrawn.png)、[继续](screenshots/computer-use/desktop/queue-resume.png)、[进程](computer-use-desktop-processes.json) |
| 09-P2-3 | 执行中 | 真实第18轮任务/四条PAGE队列已出现。Tab尝试遭用户前台切换，跳过或落在非托盘路线，不记通过/失败；已确认Electron消息框Tab到+，不替托盘首图标计数与队列行按钮显现。需要实际目标前台的完整路径 | 真实 Computer Use部分 + 工具前台边界 / E-U | [四条队列](screenshots/computer-use/desktop/queue-tab-four.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-1 | 未覆盖 | 后续真实苹果拼音候选已达，通用组字与Slash按键另列13-A4/09-P1-2；当前dirty版模型已移出+，原+内中文搜索模型路线已不存在。不能用独立模型按钮或通用IME通过替完整旧路线 | 真实 Computer Use部分 + 版本差异 / E-U | [桌面记录](computer-use-desktop-results.md) |
| 09-P3-2 | 执行中 | 当前模型独立按钮，Thinking关闭后重开0/Effort禁用、验后已恢复1；本次实际Effort改Low后A第18轮请求10:05:30.067Z，运行记录prepared.defaults reasoning=true/reasoningEffort=low（此前high）符合新值。实际UI操作仍待完整checkpoint；旧+模型两级Esc路线已移除，版本差异不拼原全项通过 | 真实 Computer Use部分 + 实际prepared request白名单 / E-U；非provider网络抓包 | [运行时](computer-use-desktop-runtime.json)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-3 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P3-4 | 未覆盖 | 实际Electron尺寸480×760，“+”上弹四项完整无裁切；真实最小高度下仍有上方空间，未触发+向下翻转分支。Chat Slash向下显示是不同浮层，不替代+翻转验收；用户排除浏览器，不使用极矮mock补通过 | 真实 Computer Use前提/部分 / E-U | [480菜单](screenshots/computer-use/desktop/palette-480.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-5 | 待执行 | — | — | — |
| 09-P4-1 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P4-2 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P4-3 | 执行中 | 实际480×760+菜单完整；恢复普通宽窗后实际nonGit运行位置菜单本机/连接远端机器/工作树禁用正确。尚需480下工作区/分支/运行位置逐菜单布局核对；真实Host子菜单缺前提 | 真实 Computer Use部分 / E-U | [480+](screenshots/computer-use/desktop/palette-480.png)、[非Git运行菜单](screenshots/computer-use/desktop/non-git-location.png) |
| 09-P4-4 | 不通过 | 有提交fixture真实选新建工作树/main起点→无工具首发→唯一WORKTREE-READY完成；实际状态行main · 本机，没有actspace/… · 工作树。新session cwd仍原git-workspace、git worktree list仍仅原目录。已知接线缺口经实际路线确认，未修复 | 真实 Computer Use + runtime cwd/Git辅助 / E-U，仅fixture | [实际首发终态](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[工作树选择](screenshots/computer-use/desktop/worktree-new-target.png)、[运行时](computer-use-desktop-runtime.json)；CU-B12 |
| 09-P4-5 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P5-1 | 未覆盖 | P1–P4汇总：P2-1/P2-2真实通过；旧+模型路线版本差异及远端Host相关编号缺前提，剩余本机子项继续。因此不能把16项完整覆盖记通过 | 汇总，依据各原编号 | 各P1–P4行及[桌面记录](computer-use-desktop-results.md) |
| 09-P5-2 | 待执行 | — | — | — |
| 09-P6-1 | 执行中 | IME Enter/方向键/ShiftTab正常子项，Slash候选Esc同时关面板为CU-B10待复核；真实PNG粘贴、系统选择器、Finder图片拖入、Slash过滤/键盘选择/点外关闭已实际覆盖，A/B草稿附件部分已验。普通文件本机能力与真实发送失败恢复范围仍继续，不以provider已接纳失败替unknown恢复 | 跨真实 Computer Use子项 / E-U | [桌面记录](computer-use-desktop-results.md)、各IME/图片/Slash证据；CU-B10 |
| 17-A1 | 不通过 | 六页既有值可见显示正常；子Agent Explore 的AX Value为 deepseek:deepseek-flash（不可用），截图只显示deepseek-flash。可访问性值与通用/模型连接显示不一致；未据此判模型服务不可用 | 真实 Computer Use / E-U，main + 当时dirty Composer | [G1逐页记录](computer-use-g1-results.md)、[子Agent截图](screenshots/computer-use/g1/electron-subagent.png) |
| 17-A2 | 执行中 | 默认模型UI实际改Kimi K2.6保存，文件白名单核对一致；随后分步键盘恢复deepseek-flash。工具开关、再次改默认并重启保留尚待，Select保存不代替持久化 | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md) |
| 17-A3 | 执行中 | cheaprouter.cc真实检测更新刚刚通过；使用其Haiku真实回复包含CUSTOM-CONNECTION-OK/Mermaid，运行中重载后完整/唯一/空闲。已实际保存连接名称cheaprouter.cc [acceptance]，标题/名称更新且已保存；Key/BaseURL/模型未改。正常退出重启保留仍待，之后UI恢复原名cheaprouter.cc；原步骤新建或编辑为OR | 真实 Computer Use + request model白名单辅助 / E-U | [custom完整回复](screenshots/computer-use/desktop/custom-end.png)、[运行时](computer-use-desktop-runtime.json)、[桌面记录](computer-use-desktop-results.md) |
| 17-A4 | 通过 | 实际搜索回复Python文档标题与准确docs.python.org/3/；展开Worked显示Web search completed/Fetched准确URL，无未配置Key错误。真实generate_image n=1/1024显示Generated1image artifact，点Open右面板实际白底红圆，图片生成成功且无未配置Key错误 | 真实 Computer Use + journal工具status辅助 / E-U | [搜索完成](screenshots/computer-use/desktop/search-tools-complete.png)、[真实生成图](screenshots/computer-use/desktop/imagegen-preview.png)、[桌面记录](computer-use-desktop-results.md) |
| 17-A5 | 不通过 | 智谱zhipu真实断开，搜索2/4→1/4，仅Tavily已连接/智谱连接按钮；随后实际中国查询web_search completed，工具结果Providers行仍tavily,zhipu（08:21:20Z），与断开前08:15:24Z相同。模型Thinking提及providers仅旁证，判定依据实际tool result白名单。最后正常退出仅恢复zhipu加密条目再UI确认，原因未定位 | 真实 Computer Use + 实际工具结果provider白名单 / E-U | [已断开](screenshots/computer-use/desktop/zhipu-disconnected.png)、[运行时provider](computer-use-desktop-runtime.json)、[桌面记录](computer-use-desktop-results.md)；CU-B08 |
| 10-B1 | 本轮范围外 | 用户明确不验浏览器；已有fixture证据仅作历史补充，不计桌面端通过 | 浏览器历史记录 | screenshots/computer-use/g1 |
| 11-B1 | 未覆盖 | 平时目录84个会话的当前索引未发现 workspaceRoot/.git 为文件的现存worktree样本；缺实际旧worktree会话前提。普通Git目录不代替旧会话兼容 | 只读运行时前提核对 / E-U-H | 会话索引仅抽取workspaceRoot并检查.git类型；未读出消息或凭据 |
| 11-B2 | 未覆盖 | 没有专用验收远端仓库与创建PR授权；未创建真实PR。此建议不计入专项通过率 | 前提缺失 | 原交接建议项要求真实remote/gh与创建PR条件 |
| R01 | 通过 | 新建真实发送唯一验收就绪/正常结束；后续独立长回复两截图8秒Thinking文本增长，输出中切换/重载后完整1–160唯一回复/空闲。流式以实际Thinking增长为证据，不要求额外final文字增长 | 真实 Computer Use + journal辅助 / E-U | [流式初](screenshots/computer-use/desktop/stream-early.png)、[流式增长](screenshots/computer-use/desktop/stream-growing.png)、[完整结束](screenshots/computer-use/desktop/stream-complete.png) |
| R02 | 通过 | A→新建B输入未发草稿→A→B实际往返，A原请求/唯一回复独立，B草稿保留；此为当次会话切换，不证明重启持久化 | 真实 Computer Use / E-U，main + dirty Composer | [真实桌面阶段记录](computer-use-desktop-results.md) |
| R03 | 通过 | 现有真实桌面通用/外观/模型/搜索/工具/子Agent六页均实际打开，页面切换与已有值可见；17A1模型可访问性差异单列，不影响本项基础导航 | 真实 Computer Use / E-U | [初始真实桌面设置记录](computer-use-g1-results.md) |
| R04 | 通过 | 真实UI开终端并执行printf正确输出desktop-terminal-ok；echo $$可用、cwd为fixture git-workspace | 真实 Computer Use / E-U + PID辅助 | [重开终端](screenshots/computer-use/desktop/terminal-reopened.png)、[进程](computer-use-desktop-processes.json) |
| R05 | 通过 | 真实Review打开，原未提交范围正确显示sample-image.png；切未暂存后sample.txt/+1/准确新增时间行显示。自动更新失败单列10-A3，不以手动取数追认 | 真实 Computer Use / E-U | [Review初始截图](screenshots/computer-use/desktop/review-initial.png)、[桌面逐步记录](computer-use-desktop-results.md) |
| R06 | 通过 | 文件树加载fixture三个文件；preview.md渲染与查看源码切换成功，标题/链接/TS代码色块可见。文件Mermaid代码块不代替R23回复全屏专项 | 真实 Computer Use / E-U | [Markdown预览](screenshots/computer-use/desktop/file-preview-markdown.png)、[桌面记录](computer-use-desktop-results.md) |
| R07 | 通过 | 真实Slash列表出现、baoyu查询过滤、键盘选择技能后胶囊出现/文本清查询，关闭正常；再次打开后真实点外关闭且焦点到AXWebArea。仅草稿未发送技能，不把文件附件观察替Skills选择 | 真实 Computer Use / E-U | [Slash过滤](screenshots/computer-use/desktop/slash-skill-filter.png)、[选技能](screenshots/computer-use/desktop/slash-skill-selected.png)、[点外](screenshots/computer-use/desktop/slash-outside.png)、[桌面记录](computer-use-desktop-results.md) |
| R08 | 执行中 | 首轮/长回复结束AX空闲；真实侧栏等待审批、批准后运行中均实观，停止/结束回空闲。失败/未配置状态仍待；不能仅按选中绿点推断运行 | 真实 Computer Use / E-U | [审批现场](screenshots/computer-use/desktop/task-start.png)、[桌面记录](computer-use-desktop-results.md) |
| R09 | 执行中 | 置顶/取消置顶实际可用；真实重命名提交/回焦已覆盖。键盘路径不稳定单列16A1；复制ID实际点击后pbpaste与验收A ID完全匹配、菜单关闭回标题；复制记录实际点击，pbpaste含验收prompt/reply标记=true；分叉/归档继续 | 真实 Computer Use / E-U，仅fixture会话 | [桌面记录](computer-use-desktop-results.md) |
| R10 | 通过 | 外部应用菜单实际列出目标；选择Finder，新窗口git-workspace中preview.md选中，AX核实fixture路径。此为代表位置实际操作 | 真实 Computer Use / E-U + 系统Finder | [桌面记录](computer-use-desktop-results.md)（系统路径观察） |
| R11 | 通过 | 提交历史真实Initial acceptance fixture/56a2cd38及准确文件差异；补备本地bare tracking后Review→审查范围→分支→main→acceptance-local/main，标签准确，正文暂无变更。两分支同commit所以无差异正确，未提交sample.txt未混入提交比较 | 真实 Computer Use + fixture Git辅助 / E-U，仅fixture | [提交历史](screenshots/computer-use/desktop/review-committed.png)、[本地分支比较](screenshots/computer-use/desktop/review-local-upstream-result.png)、[桌面记录](computer-use-desktop-results.md) |
| R12 | 通过 | 真实桌面扩展页Chrome浏览器连接UI实际可见，页面正常，无bridge缺方法；仅验桌面入口，不执行浏览器mock/扩展连接操作 | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md) |
| R13 | 通过 | 真实设置更新页已打开，显示开发模式说明/构建disabled，无bridge错误；仅打开按原冒烟范围，不执行更新 | 真实 Computer Use / E-U | [更新页](screenshots/computer-use/desktop/update-open.png)、[桌面记录](computer-use-desktop-results.md) |
| R14 | 待执行 | — | — | — |
| R15 | 通过 | 第二轮真实待审批加入5条队列，引导按钮disabled；运行后第二条Q2上移变第一/Q1第二；编辑Q2从队列回填输入框、数量5→4、正文/焦点准确。工具自然exit0/desktop-queue-ok后按Q1,Q3,Q4,Q5,Q2-edited自动顺序发出，各唯一对应回复；第三轮引导→下一步读取→撤回实际恢复2排队、删除DELETE-TWO、停止→1已暂停；继续后STEER-ONE唯一消息/回复，队列消失空闲，全部动作实际覆盖 | 真实 Computer Use / E-U | [五条队列](screenshots/computer-use/desktop/queue-five-pending.png) |
| R16 | 待执行 | — | — | — |
| R17 | 执行中 | 实际双击普通正文选中CONNECTION→回复选区操作→添加到对话→评论Desktop annotation acceptance保存，回焦输入；打开1条批注列表显示准确选文/评论。实际编辑并保存准确，未异常反复弹回；验后清除批注。hover卡片仍待，不能以列表替hover | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md) |
| R18 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| R19 | 通过 | nonGit/无HEAD工作树禁用原因正确，正常Git实际切alt→main成功；顶部工作区环境→创建codex/acceptance-new实际成功并切入→main恢复。原R19范围为菜单/切分支/新建分支，已覆盖；工作树真实创建失败单独09-P4-4/CU-B12，不扩大本项范围 | 真实 Computer Use + fixture Git辅助 / E-U，仅fixture | [新建分支](screenshots/computer-use/desktop/new-branch-created.png)、[工作树首发](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[桌面记录](computer-use-desktop-results.md)；CU-B12 |
| R20 | 执行中 | 本机真实图片选择/粘贴/拖入及预览成功；额外Finder拖sample.txt后出现普通文件胶囊，未发送且已移除。15交接“只收图片”与当前规范仅明确图片选择器过滤、09-P6“拖文件”存在口径差异，暂不定新回归；远端缺Host仍未覆盖。图片选择器过滤需单独核对 | 真实 Computer Use部分 + 验收文档口径核对 / E-U | [普通文件拖入](screenshots/computer-use/desktop/b-text-file-drop.png)、[桌面记录](computer-use-desktop-results.md) |
| R21 | 通过 | 对话框初焦说明、空说明提交禁用；独立复核标准AX聚焦取消并SystemEvents核对→CG VK36 Return实际关闭且回焦提交或推送；此前CUA Return异常保留历史，不再判产品Bug。Esc关闭/回焦此前通过 | 真实 Computer Use + OS焦点只读 / E-U，仅fixture | [独立Return成功](screenshots/computer-use/desktop/git-cancel-independent-return.png)、[初始对话框](screenshots/computer-use/desktop/git-commit-dialog.png)、[桌面记录](computer-use-desktop-results.md)；CU-B04撤销 |
| R22 | 通过 | 范围菜单初焦最近一轮、Esc回范围按钮；鼠标切未暂存准确显示sample.txt/+1。跳转搜索过滤sample，Tab到候选→Enter选中并关闭，回焦跳转按钮；搜索框Enter未绑定不据此判Bug | 真实 Computer Use / E-U | [桌面逐步记录](computer-use-desktop-results.md) |
| R23 | 不通过 | 真实模型Mermaid回复打开全屏，初焦关闭；单独Esc后全屏仍在，快截图与新AX均焦点关闭预览，未关闭。工具按键影响未排除；鼠标点击关闭实际成功，新AX焦点回放大查看，关闭/回焦子项通过 | 真实 Computer Use / E-U | [Esc后现场](screenshots/computer-use/desktop/mermaid-esc.png)、[桌面记录](computer-use-desktop-results.md)；CU-B07待复核 |
| R24 | 通过 | 运行中首条更多菜单编辑可用/上移禁用，Esc关闭精确回焦该条更多按钮；第二条上移实际Q2到第一；编辑实际Q2移回输入框、数量5→4、正文和焦点准确。工具自然结束后按变更顺序实际续发全部消息、唯一回复；菜单上移/编辑和Esc回焦实际可用，第三轮删除DELETE-TWO成功；原清单两可用动作编辑/上移均实际完成，Esc回焦通过 | 真实 Computer Use / E-U | [五条队列](screenshots/computer-use/desktop/queue-five-pending.png) |
| R25 | 通过 | 通用→编辑Agent指令，实际主prompt仅追加无指令HTML注释验收marker→保存→重开实际尾部marker存在→仅删marker保存。私有原文备份与当前文件字节完全一致，原内容恢复，未打印/记录prompt原文 | 真实 Computer Use + 私有文件字节一致辅助 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时恢复布尔核对](computer-use-desktop-runtime.json) |
| V01 | 待执行 | — | — | — |
| V02 | 执行中 | A/B模式Enter选择/回焦已验；现B+首行Up循环Skills→Right子页→Enter选agently-mail→Down/Enter选baoyu-design，两勾选/两胶囊且面板保留；zz搜索空结果，清搜索Backspace回主页；Right→Esc仅回主页→Esc关闭回消息框，真实OS焦点核对。两Skill只草稿未执行。当前dirty模型独立常显且不进+符合更新规范；Tab/左键/点外不抢焦/浮层互斥等子项继续 | 真实 Computer Use部分 + 原生焦点 / E-U | [多选](screenshots/computer-use/desktop/palette-skills-multiselect.png)、[空结果](screenshots/computer-use/desktop/palette-skills-empty-search.png)、[第二Esc](screenshots/computer-use/desktop/palette-second-esc.png)、[桌面记录](computer-use-desktop-results.md) |
| V03 | 执行中 | Plan×聚焦Backspace退出Agent并回输入；空textarea Backspace保持Plan符合规范，撤销CU-B02。真实480新建输入至少两行/工具栏stacked、AX消息textarea高度200px及内部滚动条、ShiftEnter两行未发送；Chat实际Slash仅compact/status无Skills。附件/Skill扩展已见，更多模式/运行状态继续 | 真实 Computer Use部分 + OS AX辅助 / E-U | [200px滚动](screenshots/computer-use/desktop/composer-480-long-system-light.png)、[ShiftEnter](screenshots/computer-use/desktop/composer-480-shift-enter.png)、[Chat范围](screenshots/computer-use/desktop/chat-slash-480.png)、[chip退出](screenshots/computer-use/desktop/chip-backspace-correct.png) |
| V04 | 执行中 | 真实浅/深主题Composer及设置颜色翻转；App跟随系统时OS false→true→false，实际Electron变深→变浅，OS已恢复原false。480×760右预览可关闭，关闭后Composer工具栏stacked、+四项完整，长文本内部滚动/Chat范围可读。设置/队列/Context等剩余窄窗特殊状态继续 | 真实 Computer Use + 原生OS准备/恢复 / E-U | [System深](screenshots/computer-use/desktop/composer-480-system.png)、[System恢复浅/滚动](screenshots/computer-use/desktop/composer-480-long-system-light.png)、[桌面记录](computer-use-desktop-results.md) |

## Bug 汇总

发现后立即登记，继续其余可执行路线；全部验收结束后统一交接，不在本轮修复。

### CU-B01：Explore 模型可访问性值与可见显示不一致

- 关联：17-A1；原因与引入版本未知。
- 复现：平时数据目录→设置→通用（Explore为deepseek-flash）→模型（DeepSeek已连接）→子Agent→读取Explore组合框原生可访问性值。
- 预期：可访问性值与可见所选模型及可用状态一致。
- 实际：AX Value为 `deepseek:deepseek-flash（不可用）`；[截图](screenshots/computer-use/g1/electron-subagent.png)仅显示 `deepseek-flash`。服务未调用，此证据只支持可访问性/显示不一致。后续返回子Agent页AX已显示deepseek-flash，时序上恢复正常，初始异常仍保留。
- 环境/版本：E-U，main f1a28c2f→d5f1bf3e，操作时已有dirty Composer；[阶段记录](computer-use-g1-results.md)。未修复。

### CU-B02（撤销误判）：空 textarea Backspace 保留 Plan

- 关联：V03；原真实观察保留，未修复产品代码。
- 原操作：消息输入框为空且焦点在 textarea 时按 Backspace，Plan chip仍在。
- 规范核对：[当前输入框规范](../../design-docs/frontend/front-聊天输入框规范.md)第105/180行及09原交接第22行，均要求焦点在 chip / × 内时按 Backspace 退出，并未要求空 textarea Backspace 退出。
- 结论：原操作未满足验收前提，不能判产品 Bug；撤销 CU-B02，V03回到执行中，补验 chip / × 聚焦的实际按键路线。此为纠正验收判定，未实施修复。

### CU-B03：Review 未自动显示外部文件变更

- 关联：10-A3；当前main d5f1bf3e + 已有dirty Composer；原因和引入版本未知。
- 复现：打开验收git-workspace的Review未提交范围，原有sample-image.png未跟踪；保持面板打开，父智能体12:25:44给该仓库sample.txt追加唯一一行；不刷新、不改范围，后续仅Esc收起范围菜单后观察。
- 预期：sample.txt及新增行自动出现。
- 实际：实际截图和AX仍只有sample-image.png，没有sample.txt或时间标记。fixture git diff确认新增一行。[更新后观察](screenshots/computer-use/desktop/review-auto-update.png)。
- 边界：后续切到未暂存范围后实际显示sample.txt/+1和准确新增时间行，证明重新取数可用，不能替代本项自动更新；不以CUA读取等待判应用耗时。不修复。

### CU-B04（撤销候选）：CUA Return 未激活取消，独立原生按键已通过

- 关联：R21；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：验收fixture Review→提交或推送菜单→对话框，初焦提交说明；空说明提交按钮禁用；Tab到取消，按Return。
- 预期：取消对话框关闭，焦点回提交或推送按钮。
- 实际：Return后AX仍有对话框，焦点仍为取消；随后Escape正常关闭并回到触发按钮。
- 证据：[提交对话框](screenshots/computer-use/desktop/git-commit-dialog.png)、[桌面逐项记录](computer-use-desktop-results.md)。
- 证据边界：真实CUA键盘操作的失败观察。尚不能排除按键工具影响，未据此推断源码缺陷；同轮侧栏ShiftF10菜单的Return能打开重命名，作为按键可工作旁证。保留为后续人工/独立按键复核项，不修复。

- 后续独立复核：标准AX聚焦取消、SystemEvents确认焦点，真实CoreGraphics VK36 Return关闭对话框，回焦提交或推送。实际桌面路径通过，撤销产品Bug候选；不修复，原CUA观察保留为工具路径差异。[复核证据](screenshots/computer-use/desktop/git-cancel-independent-return.png)。

### CU-B05（待复核）：侧栏 ShiftF10 后方向键移项不稳定

- 关联：16-A1；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：验收A标题聚焦→ShiftF10菜单初焦置顶→↓→Return。
- 实际：首次进入重命名、提交桌面验收A1007并回焦标题；其后两次菜单新鲜AX同为初焦置顶，同样按键实际执行置顶，未进入重命名。
- 预期：↓选重命名、Return打开编辑。
- 补充覆盖：鼠标打开重命名→输入取消标题→Esc，实际标题未改且焦点回标题；该取消路径通过，不抵消键盘移项问题。
- 证据边界：真实CUA键盘路径不稳定，工具影响未排除，不推断源码原因；置顶/取消真实可用，未修改用户历史会话。不修复，继续鼠标入口Esc与其他验收。

### CU-B06（待复核）：关闭设置对话框后第二次 Esc 未退出设置

- 关联：16-A6；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：通用→编辑图片生成服务配置→Escape关闭对话框→单独再次Escape。
- 预期：第一次只关闭对话框，第二次退出设置。
- 实际：第一次正常关闭并回焦编辑图片生成服务配置；第二次AX无变化，仍通用页、焦点同按钮。Key安全保存未回显，未改服务配置。
- 边界：真实CUA键盘失败路径，工具影响仍待排除；不推断源码原因，不修复。

### CU-B07（待复核）：Mermaid 全屏 Escape 未关闭

- 关联：R23；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：验收A真实custom模型Mermaid回复→打开全屏，初焦关闭预览→单独Escape。
- 预期：全屏关闭，焦点返回打开预览按钮。
- 实际：快截图和新AX仍为全屏，焦点关闭预览，未关闭。
- 证据：[Esc后现场](screenshots/computer-use/desktop/mermaid-esc.png)、[桌面记录](computer-use-desktop-results.md)。
- 补充：鼠标关闭成功，freshAX回焦放大查看按钮；此子项通过，不抵消Esc失败候选。
- 边界：工具按键影响未排除，保留独立复核候选，不推断源码缺陷，不修复。

### CU-B08：搜索服务断开后实际调用仍使用智谱

- 关联：17-A5；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：搜索设置智谱已连接→实际断开，界面从2/4到1/4、智谱变连接按钮，仅Tavily连接→返回验收A发中国查询。
- 预期：实际搜索不再使用智谱通道。
- 实际：断开后web_search completed，实际工具输出的Providers行仍为tavily,zhipu（2026-10-07T08:21:20.063Z）；断开前08:15:24.359Z也为两者。
- 证据：[断开界面](screenshots/computer-use/desktop/zhipu-disconnected.png)、[脱敏provider白名单](computer-use-desktop-runtime.json)。依据实际tool result，不以Thinking叙述推断provider。 只读核对 `packages/tools/web-tools/src/node-ports.ts:125–135`：Providers仅加入存在非空搜索结果的outcome.provider，不是可用服务目录；此核对只确认验收证据含义，不定位断开失效原因。
- 边界：原因/缓存或环境传播机制未定位；不修复。最后正常退出后只恢复baseline中zhipu加密条目并重启UI确认。

### CU-B09（待复核）：英语辅助开启后本次回复只有英文

- 关联：13-A3；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：扩展英语辅助原off/目标电商Harness解读→目标验收A1007→开启→返回A发送短英文请求。
- 预期：英文中文对照输出，朗读英文。
- 实际：最终回复只有英文、没有中文；回扩展目标A1007和绿on保持，状态“双语已开启·等待新回答”，停止播放禁用。
- 证据：[真实回复](screenshots/computer-use/desktop/english-reply.png)、[目标和开关](screenshots/computer-use/desktop/english-detail-after.png)、[试听后](screenshots/computer-use/desktop/tts-after.png)。
- 边界：该次prompt明确要求one short sentence in English，可能有请求语言约束影响，保留候选而非推断产品原因。试听原配置实际点击后无可见错误；20/30秒PID采样未捕获afplay、journal无speech/english事件type仅为观察范围，不据此单判TTS失败。无listen工具不声称听到；恢复原off/目标，不定位、不修复。

### CU-B10（待复核）：IME 候选 Escape 同时关闭 Slash 面板

- 关联：09-P1-2 / 09-P6-1；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：验收B消息框输入 `/` 出现 Slash → 原生苹果拼音输入 ni 出现候选 → Down/Up/Return仅作用组字为 `/尼` 且空匹配面板保留 → 再输入 ni 出现候选 → 单独 CUA `app.pressKey('Escape')`。
- 预期：仅取消本次IME组字，Slash面板不被应用快捷键关闭。
- 实际：组字取消回 `/尼`，同时整个Slash面板消失。原生OS AX精确匹配“没有匹配的功能或 Skills”为0，截图支持面板关闭。
- 证据：[候选现场](screenshots/computer-use/desktop/ime-slash-pending.png)、[Esc后](screenshots/computer-use/desktop/ime-slash-esc.png)、[桌面记录](computer-use-desktop-results.md)。
- 边界：此为单次CUA按键路径，独立CoreGraphics VK53尚未复核，不排除工具影响，不推断源码原因，不修复。原豆包输入源已真实恢复；其余确认/方向键/ShiftTab通过子项仍保留。

### 已知行为 CU-OBS02：重载后的实时文本暂不可见

- 关联14-A1：真实长回复Thinking输出中⌘R，run和停止按钮恢复，但先前文本消失，显示Operating Space/Expanding。[重载现场](screenshots/computer-use/desktop/stream-reloaded.png)。
- 14原交接已注明恢复run丢弃实时delta、结束才显示完整，这是已知行为；不据此登记新回归。最终已现场核对完整1–160、唯一prompt、空闲；后续独立custom请求已实际输出中重载并完整结束，14-A1该子步骤补覆盖。

### 旁支观察 CU-OBS03：普通未发送草稿在渲染重载后未保留

- A执行⌘R后切B，B原普通未发送草稿为空placeholder。R02仅证明重载前当次切换草稿保留，不涵盖重载持久化。
- 当前[输入框规范](../../design-docs/frontend/front-聊天输入框规范.md)明确草稿仅当前应用期间保留，刷新后不保证恢复。因此此普通草稿重载现象符合允许边界，不列Bug；14-A4的IME/未确认提交恢复子项仍独立。

### 旁支观察 CU-OBS04：任务失败后界面仅 Worked，无正文或显式错误

- A关闭Thinking后独立第二次长请求，journal turn/end=failed，无request/header/assistant/message；实际UI唯一prompt下只有Worked，无正文或显式错误。
- [现场](screenshots/computer-use/desktop/second-failed-no-body.png)。只记录实际现象，不定位原因；该任务已接纳失败，不等于14-A3提交结果未知。原14-A1第二次输出中重载未覆盖。

### 旁支观察 CU-OBS01：旧回复耗时文字

- 项目情况概览旧回复末尾显示 `Worked for 25338m 54s`。可见侧栏为空闲且无停止按钮；当前仅AX观察，尚无关键截图，不推断其运行状态或原因。

### CU-B11（规范差异候选）：新建 Chat 输入框 ShiftTab 未切 Plan

- 关联：09-P5-2、V03；原09-P1-3只验颜色，不能据此判该编号失败。
- 前提/操作：实际B新建Chat，无IME候选，freshAX确认消息输入框，再CUA点击输入后单独ShiftTab。
- 现象：Chat仍在，OS AX焦点移到顶部“打开面板”AXCheckBox，未切到Plan；截图mode-shift-tab-focused.png。
- 对照：当前聊天输入框规范131写Initial composer ShiftTab切Plan。该次实际操作与字面约定不同，但键盘工具影响与Chat适用范围仍待明确，不定位原因、不修复。
- 不作缺陷：Chat新建页无Context符合规范131；只有实际Chat follow-up才要求仅Context状态行。

### CU-B12（已知边界的实际失败）：新建工作树首发仍进入本机原目录

- 关联：09-P4-4、R19。
- 操作：有HEAD的git-workspace新建页选“新建工作树”/起点main，输入无工具短请求并实际Enter。
- 预期：实际创建工作树，状态行actspace/… · 工作树，悬停包含原工作区/起点。
- 实际：唯一WORKTREE-READY成功回复，输入空/焦点保留，但状态行为main · 本机。session a92b153d-19fb-4243-bed6-0f06dd2e83b2 header cwd为原git-workspace；git worktree list仅原目录。
- 证据：[选择](screenshots/computer-use/desktop/worktree-new-target.png)、[首发完成](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[运行时白名单](computer-use-desktop-runtime.json)。
- 边界：原交接已列接线缺口，本次是实际失败确认，不称新引入回归；不定位、不修复。

## 未覆盖与阻塞

- Agent服务器页实际无已登记Host，15个依赖真实Host的编号暂记未覆盖；已向用户询问连接信息，若补充则重新执行对应路线。
- 真实桌面本机路线继续，不以等待Host信息为由停止验收；浏览器范围已取消。
- 其他项目仍在执行，后续按实际限制补齐。

## 历史中断交接（启动隔离实例的安排已被用户纠正取消）

- 用户界面中断本轮后，Sol状态为interrupted，没有继续交互或退出既有应用。旧Electron PID40906仍运行；本轮未切T数据、未实施修复。
- main d5f1bf3e隔离检出已完成：`/Users/wakeup-jin/.codex/worktrees/desktop-fe-acceptance/actspace-agent`。下次从该main提交继续，准备依赖与专属runtime后执行G2–G9；不要把并发dirty Composer与干净main片段拼成一次全通过。
- G1子报告尚未把其后全部浏览器操作回填；已落盘17张关键截图，原生/IAB分别命名。父账保留子智能体已回传的逐步观察。复合13-A6仍执行中，不能称全部验收完成。

- 接续：原中断来自工具层turn_aborted事件；用户明确继续后恢复同一Sol子智能体，准备main隔离检出依赖，不重新开始已完成基线。

### 接续启动准备

- 隔离main检出依赖安装：`pnpm install --frozen-lockfile`成功，未改锁文件。
- 首次`build:deps:dev`阻塞：agent-service测试引用的`@actspace/boot`、`@actspace/composition`、`@actspace/session-jsonl`缺少类型产物。先按既有package scripts构建这些依赖闭包，无源码修复。
- 这属于启动环境记录，不计为Computer Use项通过。

## 用户纠正后真实桌面接续

- 仅现有`pnpm dev:log`实例：appId `com.actspace.desktop.dev.w2067fa05`，PID40906，数据目录平时ActSpace，主工作区main d5f1bf3e + 现有dirty Composer。
- Sol已取消浏览器操作与旧应用退出指令，直接按设置/Composer/两会话→文件/Git/终端→IME/附件→真实任务/审批/队列→服务→恢复/读屏→生命周期的路线继续。
- 原清单94个来源编号中2个浏览器项本轮范围外，其余92项保留逐项结果；未操作项仍为待执行。

- 真实桌面进度：Sol通过“添加工作区”→系统打开对话框→⌘⇧G输入路径→打开，验收fixture git-workspace已加入侧栏并创建空New chat。新建页显示工作区/分支/运行位置及deepseek-flash；首发仍待执行。这是实际Electron交互，不是browser或源码推断。

- 终端输入旁支观察：原生CUA首次paste echo hi显示重复输入与hiecho hi；typeText echo hi截图输出echo hi。新终端CtrlU清行后printf正常输出desktop-terminal-ok，echo $$为5020。原尝试成因未知，不据此判IPC失败；保留原截图terminal-echo-hi.png。

### 已取消隔离路线的清理

- 之前准备但从未启动的managed worktree已确认无本地改动，并用Codex archive_worktree归档。list_artifacts确认其为archived_worktree，可恢复；当前用户main工作区与真实Electron未受此操作影响。

### IME前提补充

- 系统原生TIS只读清单确认已安装苹果简体拼音，当前为豆包拼音。此前Latin输入仍为真实尝试失败，不能据此推断机器缺中文输入法；安全输入现场准备临时选苹果拼音后由Sol用真实按键复验，再恢复原源。此清单不计候选或IME通过。

- 后续实际OS临时选苹果拼音后，Sol已真实看到候选、Space确认汉字、Enter/上下/ShiftTab、组字切换及Slash候选路径；结果回填13-A4/14-A4/09-P1-2，Slash Esc候选问题为CU-B10。完成后原豆包输入源TIS恢复返回0且当前源核对一致，未留输入源修改。


### 普通文件拖入的验收口径说明（继续执行中）

- 真实 Finder 拖入 sample.txt 后本机 Composer 显示普通文件胶囊，草稿保留；未发送，随后移除。图片拖入路径已真实通过。
- 15 交接回归写“本机会话附件只收图片”；当前聊天输入框规范 Image 入口明确的是原生图片选择器扩展名过滤，并未明确普通文件拖放必须拒绝；09-P6 则要求“拖文件进来”保持拆分前行为。
- 因缺少统一的拖放拒绝约定和拆分前真实证据，此处保留实际现象/口径差异，不新增确定Bug，不把09-P6直接判回归。R20图片选择器子项与远端能力仍按各自范围继续验。
