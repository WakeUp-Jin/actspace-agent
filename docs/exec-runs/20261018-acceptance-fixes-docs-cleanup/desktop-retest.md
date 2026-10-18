# Desktop 定向诊断与复验

日期：2026-10-18。初始源码基线 `a13f8a1ee10eed387da575d80ac000cc844f2bff`。指定 gpt-6.1-sol 执行交互；本子任务只诊断/验收、不修改产品源码和正式测试、不提交。主智能体负责修复。与[前轮报告](../20261018-recent-features-acceptance/desktop-acceptance.md)、[真实连接补验](../20261018-recent-features-acceptance/real-provider-acceptance.md)分开，旧截图仅作复现线索。

## 验收点

| 编号 | 检查内容与预期 | 当前结果 |
| --- | --- | --- |
| RT01 | 历史会话482px，侧栏/右面板收起；Composer外框、状态行及Context浮层左右边缘在视口内，浮层跟随有效anchor；测量实际超宽元素和祖先链 | 通过；工程+原生关键状态，见DG2 |
| RT02 | 480/482/600px与常宽、浅/深主题复用路线；初始/历史会话、有无用量及长模型名代表组合，侧栏/右面板开关；Context关闭/重开/完整面板、输入发送与状态浮层/焦点可用 | 未覆盖（部分已验证）；四尺寸工程矩阵及原生482历史通过，其余组合未遍历 |
| RT03 | DA02修后：/tmp别名工作区实际文件路径/private/tmp，write/edit后仍有本轮改动卡；单/多文件、同轮临时创建删除过滤及第N轮Review正常 | 未覆盖（核心DA02复验通过）；新write/edit双文件卡与刷新通过，单文件/临时过滤/第N轮Review未重跑 |
| RT04 | DA03修后：有已知首chunk的普通/Thinking历史，刷新/重开后轨迹TTFT/生成/TPS有依据；缺计时旧历史保持未知，usage不重复；长历史分页不依赖全量chunk回传 | 未覆盖（核心DA03复验通过）；真实Thinking历史刷新后计时通过，其他子项未扩验 |

## 操作分组

1. **DG1 工程几何诊断**：独立renderer端口5186，仓库现有`long-session`/`turn-deliverables`/`empty`样例，通过真实UI入口进入会话、关闭侧栏、开Context。测量getBoundingClientRect、scrollWidth、computedStyle与祖先链，保留几何JSON/截图。只读DOM工程检查，不是原生CU或真实持久化证据，覆盖RT01并准备RT02。
2. **DG2 修后布局复验**：复用DG1尺寸与主题，核对修前失败几何；隔离Electron原生CU复验关键480/482状态、Context和输入/焦点，保留窗口全图，覆盖RT01/RT02。
3. **DG3 修后文件路径与历史统计**：沿用安全隔离fixture或专用临时workspace/session，不读用户Key或其他业务会话；实际文件操作→轮尾卡→Review，实际历史→轨迹详情→刷新/重开，覆盖RT03/RT04。需要真实Provider时只在已授权测试会话内使用，先与父任务确认启动身份及数据边界。

## 环境与证据边界

- 8765既有服务不访问、不停止；本子任务仅管理自己创建的进程。
- 可复用旧隔离根`/tmp/actspace-20261018-recent-desktop`，fixture清单标记stopped=true；不默认恢复、不复制用户凭据。
- 工程证据暂存Git忽略目录`tmp/codex-acceptance/20261018-fixes/desktop/`，最终记录明确原生/工程方法。
- 本轮新截图与原始计量不改旧证据。

## 执行结果

### DG1：DA01 修前工程定位

独立 Vite 5186；自持 Electron 远程调试9337，仅用旧隔离 data。旧fixture没有恢复，历史统计来自持久化会话。现有浏览器 mock 无累计统计，482px未复现，不能用它替代有统计现场。

真实 Electron DOM 在482CSS模拟视口复现：`.composer-status-row` 的 `min-width:auto` 将隐式grid轨道撑到514.8125px；统计按钮169.789/165.531px且nowrap，尾部区域381.453px。外层隐藏溢出容器出现 `scrollLeft=39`，所以main x=-39、footer与Context anchor x=-21；不是侧栏宽度或负margin。Context max-width虽466px，依然跟随负坐标anchor越界。

临时运行时CSS探针（测完立即恢复，未改源码）将状态行min-width设0后，footer回到x18/446px、main x0/482px且scrollLeft0；仅给footer设min-width0仍保留超宽panel。定位和数据已交主智能体，由其修复状态行收缩与统计换行。

证据：本地忽略目录 `tmp/codex-acceptance/20261018-fixes/desktop/` 下 `electron-geometry-before.json`、`electron-context-before-482.png`、`intrinsic-audit.json`、`geometry-baseline.json`。这些是工程DOM/截图证据。`native-context-482-first.png` 是原生截图但OS窗口仍宽、内容为工程模拟482CSS视口，且HMR关闭了popup；不作为真正482px窗口/浮层通过证据。

自持Electron会话64772已原生CmdQ并退出码0；下一轮通过Electron BrowserWindow.setBounds设置实际窗口，再用Native CU检查。

## 清理

- 自持renderer5186（session56025）最终主动CtrlC，退出码130/SIGINT为人为清理；自持Electron64772、38740、真实data3139均正常CmdQ，退出码0。短暂默认Electron页也已CmdQ。
- 真实data本轮没有更改Key、连接、权限、Thinking或全局设置；仅专用Main测试会话新增一轮文件操作，临时文件和journal保留作证据。未查看其他业务会话正文。未启动fixture，不需要停止它。
- 既有8765服务未停止/重启/访问；临时工程浏览器context已关闭。前台06:43:41Z交回Web验收代理。自持5186/9337最终无监听（见本轮清理检查）。

### DG2：DA01 修后复验

主智能体修复后，使用Electron `BrowserWindow.setBounds`调整实际窗口（不是CDP viewport模拟），旧隔离会话Residual session 07保有3轮5步/480 tok/13333 tok/s统计。四尺寸工程结果如下；所有main及外层隐藏容器x=0、scrollLeft=0、scrollWidth=clientWidth，Context与footer同边界。

| 实际CSS宽度 | footer/Context x、宽度 | 状态行高度 | 结果 |
| --- | --- | --- | --- |
| 480 | 18、444px | 54px | 通过 |
| 482 | 18、446px | 54px | 通过 |
| 600 | 32、536px | 28px | 通过 |
| 1440 | 280、880px | 28px | 通过；无多余换行 |

Native CU随后查看真实482窗口，Context标题/分类/数值与底部Composer均完整，统计两行没有相互遮挡。原生截图 `tmp/codex-acceptance/20261018-fixes/desktop/native-fixed-context-482.png`（本地截图，不随仓库分发；964×1722物理像素）。工程测量为同目录 `fixed-{480,482,600,1440}.json`及PNG。只覆盖当前浅色历史及实际统计/fixture-alternate模型；深色、长模型名、右面板及侧栏展开组合未重跑，不声称全矩阵通过。初始mock三场景四尺寸几何另存`mock-fixed-baseline.json`，没有累计统计，不能替代上述历史现场。

首次工程launcher等待close使用默认30秒导致验证进程自行结束，后续选择接口短暂启动默认Electron介绍页；该页未涉及业务数据且已关闭，修正临时验证launcher timeout=0后重跑并取得上述有效证据。原生调用耗时约60秒/观察，非产品延迟。有效隔离实例38740于06:32:34Z原生CmdQ，退出码0。

### DG3：DA02 真实alias工作区新轮

使用本轮已获授权的app-managed真实默认data及既有deepseek-flash连接，不读取/复制/显示原始Key。主智能体确认依赖与Electron构建完成后，启动自持实例（renderer5186），仅打开`RealAcceptance-20261018-Main`（session `075e242e-606b-4912-bd23-df3572ab2f7d`，cwd `/tmp/actspace-real-20261018-88xbant8/workspace`）。旧工具结果未回写，旧缺卡仍属于历史事实，不能拿旧卡签修后通过。

06:35:40Z经Native CU发送一轮：edit_file将`acceptance-one.txt`第一行v2改为v3-retest，write_file创建两行`acceptance-retest.txt`，present两文件，不运行Bash、不访问其他文件。完成后新第7轮显示“已编辑2个文件 +3 -1”，其中acceptance-one为+1/-1、acceptance-retest为+2/-0；两个present交付卡也正常。轨迹新工具结果为`Updated acceptance-one.txt`与`Created acceptance-retest.txt`，活动上下文仍以/private/tmp物理路径标识，证明是同一alias现场的新结果。

随后CmdR，原生AX仍保留同轮两文件卡与两个present，累计仍7轮17步、135K tok（无刷新重复）。本轮核心DA02已通过。证据`tmp/codex-acceptance/20261018-fixes/desktop/native-da02-new-card.png`（本地截图，不随仓库分发）。单文件卡、同轮临时创建删除过滤、第N轮Review在本次窄范围修复未重跑；不以此前canonical路线替代这轮alias子项。新metadata字段的工程合同由filesystem-write别名工作区回归测试验证；本报告不把原生文本直接等同原始metadata字段，未额外读取新一轮原始Journal。

### DG3：DA03 真实Thinking历史计时

在同一Main会话，本次进程重启且CmdR之后进入执行轨迹，点第2轮Thinking助手行，概述显示114 tok（推理52、内容62）；请求计时恢复为：开始12:52:56.915、总992毫秒、首token527毫秒、生成465毫秒、吞吐245.2 tok/s。114÷0.465=245.16，格式化后与UI一致，也与前轮已保存的白名单脱敏journal对账相符。此处是真实历史轨迹入口，未借用用量弹窗作为轨迹证据。

核心DA03通过，证据`tmp/codex-acceptance/20261018-fixes/desktop/native-da03-history-timing.png`（本地截图，不随仓库分发）。普通OFF历史详情、未知计时旧数据、长历史翻页及这轮usage严格数值去重未扩验；源码可见slim仍剔除定稿chunk并补firstTokenAt，但源码结论不算上述界面子项通过。

## 本轮结论与边界

DA01、DA02、DA03三个缺陷的定向关键复现路线均已复验通过，未发现新的确证Bug。RT01通过；RT02/03/04由于清单含更广组合，均保留“未覆盖（部分已验证）”并在逐点表列出已验证范围。原始缺陷与前轮未覆盖记录保留，不改写为历史上一直通过。主智能体负责修复代码与自动化门禁，本子任务没有修改产品源码或正式测试、没有提交。
