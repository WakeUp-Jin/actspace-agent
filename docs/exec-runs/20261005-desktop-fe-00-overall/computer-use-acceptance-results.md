# Desktop 前端重构 Computer Use 验收结果

- 日期：2026-10-07。
- 状态：本轮可执行的真实桌面验收与恢复已收束；94个编号均有判定，40通过、9不通过（含待复核候选）、43未完整覆盖、2范围外。没有全部通过，缺前提/证据的分支需后续复验；仅记录问题，未修复。
- 当前版本：main `d7eb04315a31bba0da258408314f1762fe5bae87`，并发合入Space演示/其他工作；Composer.tsx、ComposerPalette.tsx相对17:34指纹发生变化，其余已采样输入框源码指纹一致。此前main d5f1bf3e + dirty Composer证据按当时版本保留；首次基线main为f1a28c2f，见 [computer-use-baseline.json](computer-use-baseline.json) / [版本快照](computer-use-version-snapshots.json)。
- 职责：只验收和记录，不修复、不改产品代码、不提交/推送。
- Computer Use 执行者：gpt-6.1-sol。
- 首次环境：既有 Electron / 平时数据目录，应用身份 `Actspace Dev actspace-agent-2067`，Vite 5173。
- 当次用户纠正：直接使用现有平时数据Electron，不再默认切临时数据。修改设置先记原值、验后恢复；文件/Git用临时fixture。
- 隔离main检出曾为版本稳定准备，用户纠正后不再用其启动验收；真实应用始终来自用户main工作区，早期含已有dirty Composer，现已由其他工作提交并更新至d7eb0431，按实际操作版本记录。
- 62 个专项、3 个建议、25 个去重冒烟、4 个规范补充，共 94 个编号。

## 执行过程

- 启动前核实 main、源码改动与既有应用/端口。没有修改源码。
- Sol已完成现有真实窗口只读基线，逐项记录见 [computer-use-g1-results.md](computer-use-g1-results.md)；用户纠正后不再执行mock，持续真实桌面记录见 [computer-use-desktop-results.md](computer-use-desktop-results.md)。
- 其他工作在验收期间新增 main 文档提交 `d5f1bf3e`；基线产品源码 SHA256 未变。现有证据保留其操作时 HEAD，后续证据标注新 HEAD + 同一 dirty Composer 版本。
- 当前原生应用已按 bundle ID 绑定，只验用户已启动的真实Electron。用户纠正前的Chrome/IAB探索仅保留为历史记录，不再继续，也不计为桌面通过。
- CUA原生完整界面树读取单次约61秒；工具等待不视为应用无响应。后续已验证系统原生AX只读观察约一秒，Sol可用真实OS鼠标/键盘及AXPress补CUA缺能力，保留操作方式和实际截图；不注入DOM/业务状态。
- 后续其他任务继续改动 Composer.tsx、ComposerPalette.tsx、ModelPicker.tsx 及相应测试/规范；本任务没有改产品源码。操作版本需结合 [computer-use-version-snapshots.json](computer-use-version-snapshots.json)，涉及 Composer 的结论不直接拼成同一源码版本的一次完整通过。
- 后续操作全部在当前Electron及其系统文件对话框进行；不执行浏览器mock路线。
- 后续main并发更新至d7eb0431（Space演示合入），应用重载后侧栏出现Space/Actor新界面；本验收没有进入新功能范围、没有修改源码或提交。原验收文档与截图也被其他工作提交，当前仅继续追加验收记录；按操作时HEAD/指纹分段，不把不同版本拼成当前全版本通过。

## 版本差异与运行时线索

- 验收早期既有 ComposerInput/ComposerToolbar 改动使 inline 模型按钮常显；这些改动现已被其他工作提交到main，后续Composer又发生变化。相关规范差异按时段单独标注，不能自动归为重构回归。
- 启动前既有日志出现 task-command `Session is not writable`；这是运行时线索，尚未经本次 UI 复现确认。

## 本轮覆盖结论

94个来源编号均已有判定：40通过、9不通过（含待复核候选）、43未完整覆盖、2范围外。真实桌面范围为92项；未覆盖项中已有通过子项仍逐项保留，不意味着没有操作，也不能升级整项通过。计划12没有专项，归入去重冒烟。执行按D1–D7真实桌面路线分组，判定始终回到原编号。

- 已确认的实际失败：CU-B03 Review外部修改未自动更新、CU-B08断开智谱后实际搜索工具仍列出该provider、CU-B12新建工作树首发仍本机原目录、CU-B13新快捷键正常重启后丢失。只确认可见行为，未定位成因；B12属于交接已知缺口。
- 其余7条有效观察/候选：B01、B05、B06、B07、B09、B10、B11。分别保留可访问性时序、键盘工具/前台或请求约束等限制；不视为已确认根因。B02/B04已撤销，历史观察保留。
- 远端Host缺前提的15项：13-A2、14-A7、15-A1–A8、09-P3-3、09-P4-1/P4-2/P4-5、R18。除此之外，未覆盖主要包括unknown提交恢复、真实JS堆手动GC采样、读屏/音频、压缩瞬间队列、部分键盘/hover/文件筛选及特殊视觉矩阵，具体按下表。
- 浏览器项13-A6、10-B1明确范围外。真实桌面内扩展入口R12只验页面打开，不继续浏览器交互。
- 证据跨main多个提交及已有Composer改动，均按当次版本标注；不能把40项通过解释为当前d7版本一次完整发布验收通过。本轮仅验收，不实施或委派任何修复。

## 逐项结果

| 编号 | 状态 | 现象 / 子项覆盖 | 验证层 / 环境 | 证据 |
| --- | --- | --- | --- | --- |
| 10-A1 | 通过 | 真实审批分别拒绝/批准：第一轮切B/A后拒绝显示Denied并正常结束；第二轮切B/A后运行工具卡Running/侧栏运行中，等待审批消失，队列引导启用。第二轮长工具自然exit0/desktop-queue-ok，之后队列顺序续发；进程自然清理 | 真实 Computer Use + journal/PID辅助 / E-U，仅fixture | [审批现场](screenshots/computer-use/desktop/task-start.png)、[拒绝结束](screenshots/computer-use/desktop/approval-denied.png)、[桌面记录](computer-use-desktop-results.md) |
| 10-A2 | 通过 | 真实终端创建→命令输出→关闭旧shell98382消失→重开新shell5020；新终端CtrlU清行独立echo hi输出hi。此前混合输入尝试单列，未升产品Bug | 真实 Computer Use + PID辅助 / E-U | [最终echo截图](screenshots/computer-use/desktop/terminal-echo-final.png)、[重开](screenshots/computer-use/desktop/terminal-reopened.png)、[进程](computer-use-desktop-processes.json) |
| 10-A3 | 不通过 | Review保持未提交范围打开；12:25:44仅fixture sample.txt追加一行，随后未刷新观察仍只有sample-image.png，无sample.txt或新增行。后续范围切换不追认自动更新通过 | 真实 Computer Use + fixture diff辅助 / E-U | [更新后观察](screenshots/computer-use/desktop/review-auto-update.png)；CU-B03 |
| 11-A1 | 未覆盖 | preview.md HTTPS链接已真实点击；系统Chrome绑定显示既有页面，example.com目标URL尚未核实。停止外部窗口探索后返回Electron；未用点击替代成功判定 | 真实 Computer Use部分 / E-U | 桌面当场观察；目标URL缺证据 |
| 11-A2 | 通过 | 旧终端shell5020实际存在时正常AXClose唯一窗口→AXWindows0；父核shell5020消失、Electron40906仍在。真实Dock唯一Actspace AXDockItem AXPress→同40906窗口重开/输入与完整新建页可用，旧终端不自动恢复；非普通open或重启替代 | 真实 Computer Use + comm-only进程辅证 / E-U；main d7eb0431 | [进程前后](computer-use-desktop-processes.json)、[桌面Dock操作记录](computer-use-desktop-results.md) |
| 11-A3 | 通过 | 新建页工作区菜单→新建文件夹→输入desktop-created-1007（未触发字母跳转）→创建→系统选择未登记fixture/folder-parent→打开；当前工作区同名、侧栏AX同名节点。磁盘真实新目录存在，侧栏可见滚动复核另保留 | 真实 Computer Use + fixture目录存在辅助 / E-U，仅fixture | [创建完成](screenshots/computer-use/desktop/new-folder-created.png)、[桌面记录](computer-use-desktop-results.md) |
| 11-A4 | 未覆盖 | 验收A新终端shell77945与fixture Review实际打开后，真实应用菜单Quit Electron AXPress正常异步退出；主40906/helpers41017/41018/72765/PTY77945全部消失，存在的进程清理子项通过。Git实际Review短操作已结束、退出前无活动Git/BrowserBridge，运行中这两类清理缺前提；不捏造验证，完整项未覆盖。随后同main pnpm dev:log正常重启82922 | 真实 Computer Use + comm-only进程辅证 / E-U；真实菜单非SIGTERM | [退出前现场](screenshots/computer-use/desktop/before-quit-review-terminal.png)、[进程前后](computer-use-desktop-processes.json)、[桌面记录](computer-use-desktop-results.md) |
| 13-A1 | 通过 | 真实消息流式Thinking增长/正常完整结束；真实bash工具审批已运行，Running/日志/正常exit0与最终回复可见。批准/拒绝单列10A1实际通过 | 真实 Computer Use / E-U | [流式](screenshots/computer-use/desktop/stream-growing.png)、[完整结束](screenshots/computer-use/desktop/stream-complete.png)、[审批](screenshots/computer-use/desktop/task-second-start.png) |
| 13-A2 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 13-A3 | 未覆盖 | 英语辅助目标A1007实际开启后发短英文请求，最终仅英文无中文；prompt明确要求one short sentence in English，未能排除请求约束影响，保留CU-B09待复核而不定产品Bug。试听原配置实际点击无可见错误，未实际听到音频，不判TTS通过或失败。CUA已确认恢复原off及电商Harness解读目标 | 真实 Computer Use部分 + PID观察范围说明 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json)；CU-B09待复核 |
| 13-A4 | 通过 | 系统图片选择器实际选择/预览/移除/回焦，OS PNG剪贴板⌘V实际image.png附件且草稿焦点保留。现真实苹果拼音ni候选→Right选择尼→Space确认中文成功；Esc收候选未误发，A/B往返确认汉字草稿保留。图片粘贴、选择器和中文组字三类动作已真实覆盖；精细IME按键另列09P1-2，不替代其剩余范围 | 真实 Computer Use + OS剪贴板/输入源准备 / E-U | [IME中文确认](screenshots/computer-use/desktop/ime-chinese-space.png)、[真实图片粘贴](screenshots/computer-use/desktop/b-pasted-png.png)、[桌面记录](computer-use-desktop-results.md) |
| 13-A5 | 不通过 | 真实UI工具write_file关闭、AppSystem、快捷录制⌘ShiftK已生效，离开/重开通用仍K；正常真实Quit菜单退出→同main pnpm dev:log新PID82922重启后，快捷实际回原⌘ShiftSpace。新值未保留，CU-B13；重启前文件仍Space辅助一致。快捷/target现在原值，无额外修改；tool/theme已实际保留并恢复原值 | 真实 Computer Use + 持久化白名单辅助 / E-U；main d7eb0431，未修复 | [保存K](screenshots/computer-use/desktop/quick-shortcut-temp-saved.png)、[复开K](screenshots/computer-use/desktop/quick-shortcut-reopen.png)、[重启回Space](screenshots/computer-use/desktop/restart-shortcut-persistence.png)、[桌面记录](computer-use-desktop-results.md) |
| 13-A6 | 本轮范围外 | 用户明确不验浏览器；已有mock观察仅作历史补充，不计桌面端通过 | 浏览器历史记录 | [G1记录](computer-use-g1-results.md) |
| 14-A1 | 通过 | 第一轮真实160行输出中切B/A与⌘R，最终完整1–160且唯一prompt/空闲；之后独立custom真实输出中再次⌘R，最终长list+CUSTOM-CONNECTION-OK/Mermaid完整、唯一第13轮正文、空闲/发送禁用。第二次先前失败样本保留，不代替后来实际重载成功；重载实时delta暂不可见为交接已知行为 | 真实 Computer Use + 模型header辅助 / E-U | [第一轮完整](screenshots/computer-use/desktop/stream-complete.png)、[custom输出现场](screenshots/computer-use/desktop/custom-reply.png)、[custom重载](screenshots/computer-use/desktop/custom-output-reloaded.png)、[custom完整终态](screenshots/computer-use/desktop/custom-end.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A2 | 通过 | 第二轮真实审批pending切B回A后同命令卡片/等待审批保留，点运行后卡片Running、侧栏运行中，待审批标记消失；工具日志可见 | 真实 Computer Use / E-U | [第二轮审批](screenshots/computer-use/desktop/task-second-start.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A3 | 未覆盖 | 未获得真实提交acknowledgement unknown样本；此前provider任务失败已接纳用户消息，不能替提交未知。只读核对unknown为submit桥接无确认路径，停模型不保证进入；不注入localStorage、不全局断网或强杀用户当前app造前提，未知草稿恢复/同提交重发尚未实际验证 | 真实失败样本 + 只读前提核对 / E-U | [桌面记录](computer-use-desktop-results.md)、session-gateway.ts108–121，仅边界核对 |
| 14-A4 | 未覆盖 | 组字切换子项真实通过：B尼ni中ni尚未确认、候选打开→A原会话及空输入→回B，尼ni与候选网格保留，无误发或覆盖。尚无真实未确认提交样本，已有输入不被恢复草稿覆盖子项未验证，整项不拼通过 | 真实 Computer Use部分 / E-U | [组字切换返回新帧](screenshots/computer-use/desktop/ime-composing-switch-back.png)、[切A新帧](screenshots/computer-use/desktop/ime-composing-a-fresh.png)、[桌面记录](computer-use-desktop-results.md) |
| 14-A5 | 未覆盖 | 15轮fixture git-workspace真实新建→发送→实际唯一请求/回复正常结束→切A→只归档对应会话，fresh原生树核标题移除，生命周期子项通过。第4轮拒绝文本亦正常结束，验收helper marker等待过窄已纠正。实际Electron DevTools Console/MoreTabs可见Memory但AX无菜单标签，坐标路径遭前台变化/时序限制，零有效手动GC堆采样；JS堆不持续增长未验证，不以15归档或RSS替代 | 真实 Computer Use部分 / E-U，仅fixture；main d7eb0431 | [DevTools Memory入口](screenshots/computer-use/desktop/devtools-tabs-menu.png)、[首轮录屏](screenshots/computer-use/desktop/memory01-first-send.mov)、[桌面逐轮记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json) |
| 14-A6 | 未覆盖 | 专属folder内FOLDER-GC真实持久回复→从侧栏移除workspace/session matched0→精确验收A菜单重命名为桌面验收 A 1007 refresh，实际保存触发列表刷新→folder/session仍matched0，无残留徽标。真实UI移除/刷新子项通过；后台审批/队列是否重新拉取没有实际IPC观察，不单凭侧栏断言整项通过 | 真实 Computer Use部分 + 持久会话metadata辅助 / E-U，仅fixture | [桌面记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json) |
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
| 16-A2 | 未覆盖 | 图片Dialog已取消/通用页，实际尝试CG CmdF5无VoiceOver进程/字幕；CUA guard未发出后续动作，瞬时前台查询loginwindow176，停止物理键鼠。父紧接只读NSWorkspace前台为40906、VoiceOver仍无；不能确定锁屏或产品异常。未实际读到菜单/对话框/current项/关闭后触发按钮输出，不用普通AX名称替读屏，未判产品失败 | 真实 Computer Use启动尝试 + OS状态辅证 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json) |
| 16-A3 | 通过 | 真实Finder→OS鼠标拖入sample-image.png成功，B有图片缩略预览/移除及专属英文草稿→A新鲜图空输入无该附件→B图片/文字保留→设置外观→返回B深色下图片预览和原草稿仍正确。选择器/PNG粘贴子路线此前分别记录，不替代此次真实drag路径；A/B名称互换不影响草稿归属测试 | 真实 Computer Use / E-U，仅fixture | [拖入就绪](screenshots/computer-use/desktop/b-image-drag-ready.png)、[A隔离](screenshots/computer-use/desktop/drag-a-isolation.png)、[设置返回B](screenshots/computer-use/desktop/drag-b-settings-return-dark.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A4 | 未覆盖 | 当前main d7eb Memory01有效12.057秒视频覆盖居中草稿→运行队列/底部输入→唯一回复结束，14帧未见输入消失/闪动；689帧非空白扫描仅辅证。当前MEM11正常置前、真实CG点输入形成可见caret、核目标PID/AXTextArea后Return，草稿仍完整未发送；不再重复，工具/豆包输入源影响未排除，未能验证当前键盘首发后焦点；AXSend会聚焦发送按钮不能替代。早期键盘focus旧版本样本单列 | 真实 Computer Use部分 + 录屏 / E-U；main d7eb0431 | [有效首发录屏](screenshots/computer-use/desktop/memory01-first-send.mov)、[转场抽帧](screenshots/computer-use/desktop/memory01-send-contact-sheet.png)、[独立键盘首发](screenshots/computer-use/desktop/memory11-key-firstsend.png)、[运行时](computer-use-desktop-runtime.json) |
| 16-A5 | 通过 | 默认模型鼠标deepseek→Kimi立即保存/下拉关闭回焦，分步Up/Return恢复deepseek保存回焦。现quicktarget原指定已移除会话→实际选自动选择第一个项目→重新打开checkmark为自动，下拉位于底部时真实向上展开完整。鼠标/键盘Select路线和实际改值/复开/上翻均补齐。目标原值暂不可UI重选，最后正常Quit仅还原该字段再重启复核 | 真实 Computer Use / E-U；操作版本分段留证 | [改值复开上翻](screenshots/computer-use/desktop/quick-target-changed-reopen-up.png)、[桌面记录](computer-use-desktop-results.md)、[恢复待办](computer-use-desktop-runtime.json) |
| 16-A6 | 不通过 | 原CUA第一次Esc关Dialog、第二次Settings未退出；现图片配置Dialog新鲜观察/更换Key按钮焦点/前台40906条件下，独立CG Esc仍未关Dialog。补充具体键盘路径异常，工具影响尚未完全排除，不定位修复；CUA失活按正常重绑定恢复，不绕guard。后续用鼠标收Dialog | 真实 Computer Use / E-U；候选非根因结论 | [桌面记录](computer-use-desktop-results.md)；CU-B06待复核 |
| 16-A6b | 通过 | 自定义连接模型编辑草稿打开推理支持Select；Esc只关闭下拉，编辑器保持，焦点AXComboBox/推理支持。随后第二Esc退出编辑器且未保存临时能力草稿；第二Esc焦点HTML为补充观察，不属于本项Select保持表单预期 | 真实 Computer Use + OS只读焦点 / E-U | [嵌套Esc现场](screenshots/computer-use/desktop/reasoning-select-esc.png)、[桌面记录](computer-use-desktop-results.md) |
| 16-A6c | 通过 | A打开+→侧栏切B，+收起；A开Context→侧栏切B，Context收起，六桶数据已见。原handoff要求⌘N或侧栏，两类浮层均已真实侧栏切换通过。额外⌘N先CUA user-changed guard未发键、再独立CG无可见变化，仅补充尝试，不替原通过也不判产品Bug | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md)、[Context](screenshots/computer-use/desktop/context-open.png)、[额外⌘N尝试](screenshots/computer-use/desktop/palette-command-n-native.png) |
| 16-A7 | 通过 | 三处真实看过：Running执行轨迹停止细边框；字号14→15后实际hover重置灰底/准确tooltip，点击恢复14；A真实Explore记录打开子Agent详情，左箭头返回按钮清楚，点返回准确恢复单记录列表。Explore结果矛盾另记观察，不影响本项按钮外观范围 | 真实 Computer Use / E-U；main d7eb0431 | [停止](screenshots/computer-use/desktop/trajectory-running-stop-fresh.png)、[数值悬停](screenshots/computer-use/desktop/numeric-reset-target-hover.png)、[子Agent详情返回](screenshots/computer-use/desktop/subagent-detail-back.png)、[返回列表](screenshots/computer-use/desktop/subagent-back-list.png) |
| 09-P1-1 | 未覆盖 | 早期长文→一字→空与焦点/胶囊形态已观察；当前d7版1431字/200px内滚→真实物理Backspace1430，原生选区批量删除后1字/34px/caret。末Backspace未形成空状态，已清草稿恢复。批量删除不替代完整逐字删空节奏，瞬时光标全程不跳/不闪未验证，跨版本不拼整项通过 | 真实 Computer Use / E-U | [逐步记录](computer-use-desktop-results.md)、[一字截图](screenshots/computer-use/desktop/composer-one-char.png)、[删空](screenshots/computer-use/desktop/composer-empty.png) |
| 09-P1-2 | 不通过 | 苹果拼音真实候选已达：Space汉字确认、Enter仅提交组字未误发、Down/Up只操作候选、ShiftTab未切Plan；组字切换后候选/草稿保留。Slash中ni候选→单独CUA Esc后组字取消，但整个Slash面板也消失，违反只收候选预期；按键工具影响未排除，CU-B10待独立复核。验后原豆包输入源已恢复 | 真实 Computer Use + 原生输入源准备/恢复 / E-U | [Slash候选](screenshots/computer-use/desktop/ime-slash-pending.png)、[Esc后](screenshots/computer-use/desktop/ime-slash-esc.png)、[桌面记录](computer-use-desktop-results.md)；CU-B10 |
| 09-P1-3 | 通过 | fixture新建草稿实际选Plan/Chat并输入MODE-COLOR-DRAFT使箭头启用；浅/深各观察：Plan黄色chip/黄底发送，浅白箭头及深黑箭头均清楚；Chat绿色chip/发送清楚。四状态均真实截图，未发送模式草稿，最后清空/退出Chat/AppSystem恢复供重启验证。ShiftTab候选独立不感染本项颜色范围 | 真实 Computer Use / E-U；main d7eb0431 | [Plan浅](screenshots/computer-use/desktop/plan-light-chip-arrow.png)、[Plan深](screenshots/computer-use/desktop/plan-dark-chip-arrow.png)、[Chat浅](screenshots/computer-use/desktop/chat-light-chip-arrow.png)、[Chat深](screenshots/computer-use/desktop/chat-dark-chip-arrow.png) |
| 09-P2-1 | 通过 | 真实长任务期间5条队列，最多露4行/内部滚动；空草稿仍胶囊、不被托盘推成多行，原托盘位置稳定；待审批引导禁用，批准后可用 | 真实 Computer Use / E-U | [五条队列与胶囊](screenshots/computer-use/desktop/queue-five-pending.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P2-2 | 通过 | 第三轮真实运行中引导成功，1排队/1已引导与下一步读取/撤回；撤回恢复2排队；删除另一条后停止，空闲/1已暂停/继续发送按钮出现，进程55397/55399清理。继续后STEER-ONE唯一用户消息与回复，队列消失/发送禁用/空闲 | 真实 Computer Use + PID辅助 / E-U | [引导](screenshots/computer-use/desktop/queue-steered.png)、[撤回](screenshots/computer-use/desktop/queue-withdrawn.png)、[继续](screenshots/computer-use/desktop/queue-resume.png)、[进程](computer-use-desktop-processes.json) |
| 09-P2-3 | 未覆盖 | 实际sleep180运行两条FOCUS-QUEUE入队，计数首图标真实hover准确tooltip；AXFocus计数为前提后正常置前物理Tab，焦点↳引导且行按钮描边/实显/tooltip，进入行子项通过。ShiftTab未回计数，计数图标完整Tab聚焦显示路径仍未验证；不以hover/AXFocus替物理Tab全项，前台变化均安全skip | 真实 Computer Use部分 / E-U；main d7eb0431 | [计数hover](screenshots/computer-use/desktop/queue-count-hover.png)、[真实Tab行动作](screenshots/computer-use/desktop/queue-row-key-focus-actions.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-1 | 未覆盖 | 后续真实苹果拼音候选已达，通用组字与Slash按键另列13-A4/09-P1-2；当前dirty版模型已移出+，原+内中文搜索模型路线已不存在。不能用独立模型按钮或通用IME通过替完整旧路线 | 真实 Computer Use部分 + 版本差异 / E-U | [桌面记录](computer-use-desktop-results.md) |
| 09-P3-2 | 未覆盖 | 当前模型独立按钮，Thinking关闭后重开0/Effort禁用、验后已恢复1；本次实际Effort改Low后A第18轮请求10:05:30.067Z，运行记录prepared.defaults reasoning=true/reasoningEffort=low（此前high）符合新值。Effort已实际UI恢复High并截图checkmark；旧+模型两级Esc路线已移除，版本差异不拼原全项通过 | 真实 Computer Use部分 + 实际prepared request白名单 / E-U；非provider网络抓包 | [运行时](computer-use-desktop-runtime.json)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-3 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P3-4 | 未覆盖 | 实际Electron尺寸480×760，“+”上弹四项完整无裁切；真实最小高度下仍有上方空间，未触发+向下翻转分支。Chat Slash向下显示是不同浮层，不替代+翻转验收；用户排除浏览器，不使用极矮mock补通过 | 真实 Computer Use前提/部分 / E-U | [480菜单](screenshots/computer-use/desktop/palette-480.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P3-5 | 未覆盖 | 与16-A2同次真实VoiceOver启动尝试未取得进程/字幕或音频，组合框搜索名称、当前高亮行未实际听到或读屏输出确认；普通原生AX搜索框/高亮项不替读屏通过 | 真实 Computer Use启动尝试部分 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时读屏尝试](computer-use-desktop-runtime.json) |
| 09-P4-1 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P4-2 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P4-3 | 未覆盖 | 实际480×760新建fixture页工作区/分支/运行位置三菜单均完整无裁切，切触发器旧菜单收层，main/本机正确，无Host连接远端机器…可见；本机窄窗子项通过。Host空缺，真实Host子菜单未验证；窗口恢复1440×850 | 真实 Computer Use部分 / E-U；main d7eb0431 | [工作区](screenshots/computer-use/desktop/workspace-menu-480.png)、[分支](screenshots/computer-use/desktop/branch-menu-480.png)、[运行位置](screenshots/computer-use/desktop/location-menu-480.png)、[桌面记录](computer-use-desktop-results.md) |
| 09-P4-4 | 不通过 | 有提交fixture真实选新建工作树/main起点→无工具首发→唯一WORKTREE-READY完成；实际状态行main · 本机，没有actspace/… · 工作树。新session cwd仍原git-workspace、git worktree list仍仅原目录。已知接线缺口经实际路线确认，未修复 | 真实 Computer Use + runtime cwd/Git辅助 / E-U，仅fixture | [实际首发终态](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[工作树选择](screenshots/computer-use/desktop/worktree-new-target.png)、[运行时](computer-use-desktop-runtime.json)；CU-B12 |
| 09-P4-5 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| 09-P5-1 | 未覆盖 | P1–P4汇总：P2-1/P2-2真实通过；旧+模型路线版本差异及远端Host相关编号缺前提，剩余本机子项继续。因此不能把16项完整覆盖记通过 | 汇总，依据各原编号 | 各P1–P4行及[桌面记录](computer-use-desktop-results.md) |
| 09-P5-2 | 未覆盖 | 两现行规范已对照真实UI：常显独立模型/不进+、200px内滚/480stacked、Agent/Plan/Chat chip、三Git状态与禁用原因、本机main只读位置等通过子项；旧handoff +模型两级路线为版本差异；ShiftTab候选仍未排除工具影响，真实Host缺前提，+翻转受实际minHeight760未触发。文案/宽度/状态的剩余分支未覆盖，整体不拼通过 | 真实 Computer Use部分 + 规范对照 / E-U；main d7eb0431 | [桌面逐差异记录](computer-use-desktop-results.md)、相关94项分支证据 |
| 09-P6-1 | 未覆盖 | 真实PNG粘贴/系统选择器/Finder拖入、Slash过滤/键盘选择/点外关闭、A/B草稿附件与IME Enter/方向键等子项已验；Slash候选Esc同时关面板为CU-B10待复核。普通文件drop能力口径差异保留；真实unknown提交恢复缺样本，完整复合路线未覆盖 | 跨真实 Computer Use子项 / E-U | [桌面记录](computer-use-desktop-results.md)、各IME/图片/Slash证据；CU-B10 |
| 17-A1 | 不通过 | 六页既有值可见显示正常；子Agent Explore 的AX Value为 deepseek:deepseek-flash（不可用），截图只显示deepseek-flash。可访问性值与通用/模型连接显示不一致；未据此判模型服务不可用 | 真实 Computer Use / E-U，main + 当时dirty Composer | [G1逐页记录](computer-use-g1-results.md)、[子Agent截图](screenshots/computer-use/g1/electron-subagent.png) |
| 17-A2 | 通过 | 默认会话模型真实改custom Haiku、工具write_file关闭，正常Quit→同main数据目录pnpm dev:log重启，新PID82922界面仍Haiku/工具关闭5of6，改动实际保留。随后UI模型恢复deepseek-flash/工具开启，父白名单与原值一致 | 真实 Computer Use + 持久化恢复布尔辅助 / E-U；main d7eb0431 | [重启模型](screenshots/computer-use/desktop/restart-general-persistence.png)、[重启工具](screenshots/computer-use/desktop/restart-tool-persistence.png)、[运行时](computer-use-desktop-runtime.json) |
| 17-A3 | 通过 | 真实已有custom连接检测刚刚通过，使用Haiku真实回复/长正文Mermaid正常结束；连接名称UI编辑为cheaprouter.cc [acceptance]保存，正常Quit→同数据目录重启后名称与可用状态保留。之后实际UI改回cheaprouter.cc，Key/BaseURL/模型未改。原要求新建或编辑为OR，编辑路线完整 | 真实 Computer Use + 实际request model辅助 / E-U；跨操作版本分别留证 | [真实回复](screenshots/computer-use/desktop/custom-end.png)、[重启连接保留](screenshots/computer-use/desktop/restart-connection-persistence.png)、[桌面记录](computer-use-desktop-results.md) |
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
| R08 | 未覆盖 | 真实运行中、等待审批、停止/结束回空闲已实观；既有任务failed无正文现象只属历史观察，当前无可确认failed-session/未配置状态点样本，不制造真实服务配置缺失，整项未覆盖。不能按选中绿色圆点推断运行状态 | 真实 Computer Use / E-U | [审批现场](screenshots/computer-use/desktop/task-start.png)、[桌面记录](computer-use-desktop-results.md) |
| R09 | 通过 | 置顶/取消置顶、重命名提交/回焦、复制ID与验收A一致、复制记录含验收prompt/reply均实际完成。现精确A菜单分叉→实际切入且PAGE/compact历史正确→当前分叉重命名桌面验收 fork 1007→切原A→按唯一fork标题归档，freshUI移除。原A现名桌面验收 A 1007 refresh；键盘不稳定另列16A1，不以其替鼠标菜单覆盖 | 真实 Computer Use + lineage辅助 / E-U，仅fixture会话 | [桌面记录](computer-use-desktop-results.md)、[运行时lineage](computer-use-desktop-runtime.json) |
| R10 | 通过 | 外部应用菜单实际列出目标；选择Finder，新窗口git-workspace中preview.md选中，AX核实fixture路径。此为代表位置实际操作 | 真实 Computer Use / E-U + 系统Finder | [桌面记录](computer-use-desktop-results.md)（系统路径观察） |
| R11 | 通过 | 提交历史真实Initial acceptance fixture/56a2cd38及准确文件差异；补备本地bare tracking后Review→审查范围→分支→main→acceptance-local/main，标签准确，正文暂无变更。两分支同commit所以无差异正确，未提交sample.txt未混入提交比较 | 真实 Computer Use + fixture Git辅助 / E-U，仅fixture | [提交历史](screenshots/computer-use/desktop/review-committed.png)、[本地分支比较](screenshots/computer-use/desktop/review-local-upstream-result.png)、[桌面记录](computer-use-desktop-results.md) |
| R12 | 通过 | 真实桌面扩展页Chrome浏览器连接UI实际可见，页面正常，无bridge缺方法；仅验桌面入口，不执行浏览器mock/扩展连接操作 | 真实 Computer Use / E-U | [桌面记录](computer-use-desktop-results.md) |
| R13 | 通过 | 真实设置更新页已打开，显示开发模式说明/构建disabled，无bridge错误；仅打开按原冒烟范围，不执行更新 | 真实 Computer Use / E-U | [更新页](screenshots/computer-use/desktop/update-open.png)、[桌面记录](computer-use-desktop-results.md) |
| R14 | 通过 | 精确git-workspace工作区菜单→归档全部，settled真实侧栏fixture整个组/验收A/WORKTREE会话消失，AX matched0，无残留；仅专用验收工作区，其他用户工作区未操作 | 真实 Computer Use / E-U，仅fixture；main d7eb0431 | [菜单](screenshots/computer-use/desktop/workspace-archive-all-menu.png)、[归档后](screenshots/computer-use/desktop/workspace-archive-all-after.png)、[桌面记录](computer-use-desktop-results.md) |
| R15 | 通过 | 第二轮真实待审批加入5条队列，引导按钮disabled；运行后第二条Q2上移变第一/Q1第二；编辑Q2从队列回填输入框、数量5→4、正文/焦点准确。工具自然exit0/desktop-queue-ok后按Q1,Q3,Q4,Q5,Q2-edited自动顺序发出，各唯一对应回复；第三轮引导→下一步读取→撤回实际恢复2排队、删除DELETE-TWO、停止→1已暂停；继续后STEER-ONE唯一消息/回复，队列消失空闲，全部动作实际覆盖 | 真实 Computer Use / E-U | [五条队列](screenshots/computer-use/desktop/queue-five-pending.png) |
| R16 | 未覆盖 | 实际Slash选compact→UI正在压缩上下文→结束“上下文已压缩 · 63条消息 · 6s”。实际journal start/summary/end齐全，记录边界约0.297s（UI总时长不同层，不据此判Bug）。此次followup仅填入、未在压缩中成功入队，禁引导原因/结束自动发送子项未覆盖；实际压缩事件阶段仅约0.297秒，未捕获所需队列中间态，不重复压缩或注入状态补通过 | 真实 Computer Use部分 + event时间白名单 / E-U；main d7eb0431 | [压缩](screenshots/computer-use/desktop/compact-start.png)、[运行时事件](computer-use-desktop-runtime.json)、[桌面记录](computer-use-desktop-results.md) |
| R17 | 未覆盖 | 真实普通回复词选中→批注评论保存/回焦、列表准确、编辑保存不反复弹回均已实际完成。后续正确Composer胶囊CG hover未取得可见卡，OS前台因素未排除；源正文标记误目标已校正，不判产品Bug。点击1条批注准确Automated选文/新评论，编辑保存收层，最后清验收批注；hover卡片分支仍未验证 | 真实 Computer Use部分 / E-U；操作版本分段留证 | [胶囊列表](screenshots/computer-use/desktop/annotation-capsule-click.png)、[桌面记录](computer-use-desktop-results.md) |
| R18 | 未覆盖 | Agent服务器页无已登记Host；已询问可用连接信息，其他路线继续 | 真实 Computer Use前提确认 / E-U | [G1 Host页记录](computer-use-g1-results.md) |
| R19 | 通过 | nonGit/无HEAD工作树禁用原因正确，正常Git实际切alt→main成功；顶部工作区环境→创建codex/acceptance-new实际成功并切入→main恢复。原R19范围为菜单/切分支/新建分支，已覆盖；工作树真实创建失败单独09-P4-4/CU-B12，不扩大本项范围 | 真实 Computer Use + fixture Git辅助 / E-U，仅fixture | [新建分支](screenshots/computer-use/desktop/new-branch-created.png)、[工作树首发](screenshots/computer-use/desktop/worktree-firstsend-after.png)、[桌面记录](computer-use-desktop-results.md)；CU-B12 |
| R20 | 未覆盖 | 真实本机图片选择/粘贴/拖入与预览已通过子项；普通sample.txt真实drop也出现胶囊，15交接只图片与当前图片picker/09拖文件规范有口径差异，暂不定新回归。后续图片picker系统OpenDialog→GoTo fixture路径，豆包/临时ABC下实际Return仍未确认，已取消回A并恢复原输入源，文件类型过滤未验证；真实远端缺Host，整体未覆盖 | 真实 Computer Use部分 + OS输入源准备/恢复 / E-U | [普通文件drop](screenshots/computer-use/desktop/b-text-file-drop.png)、[桌面记录](computer-use-desktop-results.md)、[运行时恢复](computer-use-desktop-runtime.json) |
| R21 | 通过 | 对话框初焦说明、空说明提交禁用；独立复核标准AX聚焦取消并SystemEvents核对→CG VK36 Return实际关闭且回焦提交或推送；此前CUA Return异常保留历史，不再判产品Bug。Esc关闭/回焦此前通过 | 真实 Computer Use + OS焦点只读 / E-U，仅fixture | [独立Return成功](screenshots/computer-use/desktop/git-cancel-independent-return.png)、[初始对话框](screenshots/computer-use/desktop/git-commit-dialog.png)、[桌面记录](computer-use-desktop-results.md)；CU-B04撤销 |
| R22 | 通过 | 范围菜单初焦最近一轮、Esc回范围按钮；鼠标切未暂存准确显示sample.txt/+1。跳转搜索过滤sample，Tab到候选→Enter选中并关闭，回焦跳转按钮；搜索框Enter未绑定不据此判Bug | 真实 Computer Use / E-U | [桌面逐步记录](computer-use-desktop-results.md) |
| R23 | 不通过 | 真实模型Mermaid回复打开全屏，初焦关闭；单独Esc后全屏仍在，快截图与新AX均焦点关闭预览，未关闭。工具按键影响未排除；鼠标点击关闭实际成功，新AX焦点回放大查看，关闭/回焦子项通过 | 真实 Computer Use / E-U | [Esc后现场](screenshots/computer-use/desktop/mermaid-esc.png)、[桌面记录](computer-use-desktop-results.md)；CU-B07待复核 |
| R24 | 通过 | 运行中首条更多菜单编辑可用/上移禁用，Esc关闭精确回焦该条更多按钮；第二条上移实际Q2到第一；编辑实际Q2移回输入框、数量5→4、正文和焦点准确。工具自然结束后按变更顺序实际续发全部消息、唯一回复；菜单上移/编辑和Esc回焦实际可用，第三轮删除DELETE-TWO成功；原清单两可用动作编辑/上移均实际完成，Esc回焦通过 | 真实 Computer Use / E-U | [五条队列](screenshots/computer-use/desktop/queue-five-pending.png) |
| R25 | 通过 | 通用→编辑Agent指令，实际主prompt仅追加无指令HTML注释验收marker→保存→重开实际尾部marker存在→仅删marker保存。私有原文备份与当前文件字节完全一致，原内容恢复，未打印/记录prompt原文 | 真实 Computer Use + 私有文件字节一致辅助 / E-U | [桌面记录](computer-use-desktop-results.md)、[运行时恢复布尔核对](computer-use-desktop-runtime.json) |
| V01 | 通过 | A真实23轮后独立Reload，首条为原第4轮，最近20页边界准确；确认Electron前台后真实OS滚动，fresh原生UI加载回第1–23轮且各唯一；随后实际发送第24 PAGE-AFTER-LOAD，界面唯一prompt/reply，正常结束空闲，无边界重复或丢失。原顺序要求现已补齐，不用compact后终态代替早页操作 | 真实 Computer Use + journal计数辅助 / E-U；main d7eb0431 | [独立加载后首轮](screenshots/computer-use/desktop/pagination-first-independent.png)、[桌面记录](computer-use-desktop-results.md)、[运行时](computer-use-desktop-runtime.json) |
| V02 | 未覆盖 | 模式Enter/回焦、Up循环、Skills Right子页/两项多选不收层、空搜索、Backspace返回、分层两次Esc已实际通过；当前版Skills→模型搜索→Context实际互斥通过。Left未返回、Tab因前台切换安全跳过，其他特殊禁用项/点外焦点分支仍未覆盖，不以多选代表全部 | 真实 Computer Use部分 + 原生焦点 / E-U | [多选](screenshots/computer-use/desktop/palette-skills-multiselect.png)、[空结果](screenshots/computer-use/desktop/palette-skills-empty-search.png)、[第二Esc](screenshots/computer-use/desktop/palette-second-esc.png)、[桌面记录](computer-use-desktop-results.md) |
| V03 | 未覆盖 | 单/多行、ShiftEnter、新建页至少两行、480工具栏stacked、200px内滚、附件/Skill/批注扩展、chip×聚焦Backspace退出/回焦已实际覆盖。最新专用Chat真实回复后仅Context<1%、无工作区/分支/本机行；名称实际点击无菜单/模式不变。其他模式/运行placeholder完整矩阵缺证据，跨版本部分证据不拼整项通过 | 真实 Computer Use部分 + OS AX辅助 / E-U | [Chat仅Context](screenshots/computer-use/desktop/chat-followup-context.png)、[桌面记录](computer-use-desktop-results.md)、[恢复](screenshots/computer-use/desktop/final-baseline-restored-shortcut.png) |
| V04 | 未覆盖 | 实际浅/深Composer及设置颜色翻转，System随OS false→true→false实际变深/浅且恢复；480×760输入工具栏stacked、+菜单、长文内滚/Chat范围与工作区/分支/运行位置3菜单完整且互斥。窄窗队列、Settings/Context特殊视觉分支未全部验证；窗口/主题已恢复 | 真实 Computer Use + 原生OS准备/恢复 / E-U | [System深](screenshots/computer-use/desktop/composer-480-system.png)、[System恢复浅/滚动](screenshots/computer-use/desktop/composer-480-long-system-light.png)、[桌面记录](computer-use-desktop-results.md) |

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
- 后续独立复核（main d7eb0431）：图片配置Dialog新鲜观察、焦点更换Key、前台40906条件下CG Escape仍未关闭Dialog，未修改Key；工具影响仍未充分排除。后续CUA提示失活，按正常重新绑定恢复，未绕过guard。原第二层Esc样本与此次第一层样本分别保留。
- 边界：真实CUA键盘失败路径，工具影响仍待排除；不推断源码原因，不修复。

### CU-B07（待复核）：Mermaid 全屏 Escape 未关闭

- 关联：R23；main d5f1bf3e + 已有dirty Composer，原因未知。
- 复现：验收A真实custom模型Mermaid回复→打开全屏，初焦关闭预览→单独Escape。
- 预期：全屏关闭，焦点返回打开预览按钮。
- 实际：快截图和新AX仍为全屏，焦点关闭预览，未关闭。
- 证据：[Esc后现场](screenshots/computer-use/desktop/mermaid-esc.png)、[桌面记录](computer-use-desktop-results.md)。
- 补充：鼠标关闭成功，freshAX回焦放大查看按钮；此子项通过，不抵消Esc失败候选。
- 后续独立复核（main d7eb0431）：重新实际放大Mermaid，fresh关闭预览焦点下CG Esc仍未关闭；随后实际鼠标关闭成功、焦点回放大查看，[复核截图](screenshots/computer-use/desktop/mermaid-independent-esc-settled.png)。工具因素尚未排除，不再重复该路径。
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
- 其余编号已逐项收束；未取得完整真实证据的子项明确保留未覆盖，后续需满足对应前提再复验。

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

### CU-B13：快捷键显示已生效但正常重启后未保留

- 关联：13-A5；main d7eb0431，实际用户数据目录，未修复。
- 复现：通用快速唤起录制⌘⇧K→显示已生效→外观页再回通用仍K，无第二保存按钮→实际Quit Electron菜单退出→同main工作区pnpm dev:log重启。
- 预期：重启后保留新快捷键K。
- 实际：新PID82922通用页显示原⌘⇧Space，保存新值没有持久化。此前仅白名单文件读取也一直为原Space。目标session与enabled未改，不混入默认目标改变。
- 证据：[保存K](screenshots/computer-use/desktop/quick-shortcut-temp-saved.png)、[重开K](screenshots/computer-use/desktop/quick-shortcut-reopen.png)、[重启Space](screenshots/computer-use/desktop/restart-shortcut-persistence.png)。
- 恢复：当前已自动回原快捷键/target，无额外设置写入。原因与引入版本未调查，统一后续修复。

## 最终恢复与交接

- 同main真实应用经过正常菜单Quit并以同工作区`pnpm dev:log`重启；最终PID9196/window20739，平时数据目录不变。原quickOpen target/快捷持久值已正确，无需最后写回settings。
- 重启后的真实UI确认默认/utility/Explore为deepseek-flash、快速唤起开启、⌘⇧Space生效、原已移除session自动降级；其他已修改值包括工具、浅色主题、连接名称、英语辅助、字体与Agent指令均恢复。原始配置白名单/智谱单条密文/原指令字节核对及OS浅色/豆包/VoiceOver关闭见[运行时记录](computer-use-desktop-runtime.json)。最新实际Chat请求prepared defaults为reasoning=true/effort=high，属于请求准备层，不冒充wire核验。
- 从空新建页对未选中的精确验收A与Desktop Chat验收归档，实际侧栏两个标题均消失，journal archived=true辅助一致；当前选中会话禁止归档为正常约定，没有新增Bug。原用户历史会话未用于归档清理。
- 应用保持运行，真实空新建页消息框可用：[最终现场](screenshots/computer-use/desktop/final-usable-app-test-objects-archived.png)、[模型原值](screenshots/computer-use/desktop/final-baseline-restored-general.png)、[快捷原值](screenshots/computer-use/desktop/final-baseline-restored-shortcut.png)。
- 本轮报告、截图和运行时辅助记录已保存；没有产品源码变更、修复、提交或推送。后续仅在满足未覆盖项前提后定向补验，修复属于另一个阶段。

## 2026-10-07 授权修复后定向复验

以下为后续修复结果，不改写上面原验收时的失败事实与覆盖统计。

| 原问题 / 项目 | 修复后结果 | 现象与依据 |
|---|---|---|
| CU-B03 / 10-A3 | 通过 | 同一真实Review面板无刷新、无切范围，外部追加与移除文本均自动更新，旧变更保留。 |
| CU-B08 / 17-A5 | 通过 | 同一会话不重启，真实搜索断开前tavily,zhipu，断开后仅tavily且成功；原凭据单条恢复并UI确认2/4。 |
| CU-B12 / 09-P4-4 | 通过 | 选择codex/acceptance-alt与新建工作树，首发实际cwd在新工作树；切换返回及正常重启后同会话bash仍在同目录/分支，原目录main不变。 |

[逐项真实桌面记录](../20261007-desktop-acceptance-b03-b08-b12/computer-use-results.md) · [执行摘要与边界](../20261007-desktop-acceptance-b03-b08-b12/execution-summary.md)。独立Created worktree过程块未新增，其它原问题仍保留原状态。
