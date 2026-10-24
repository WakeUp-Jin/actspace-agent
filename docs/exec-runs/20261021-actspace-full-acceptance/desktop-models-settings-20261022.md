# 独立模型设置验收（2026-10-22）

状态：本文件所列有限批次终态；未执行项逐项保留未覆盖，不代表整组通过。固定 dist、真实 Electron UI/CDP，不是原生 AX/IME/VoiceOver。独立 profile、fixture、合成 Provider 与证据均在 `tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-models-settings-20261022/`。模型请求使用回环44341；12:01补批次曾打开复制的Kimi详情而自动显示余额，是否产生新请求或计费没有网络日志证明，详见文末操作边界偏差，不计验收通过。凭据未输出，未改产品、共享构建或用户提示词。

## 验收点与路线

验收点为 F1-01–12、P2-D16、R25、17-A5。操作按模型字段及用途、连接错误与删除、模型移除生命周期与重启三条路线分组；分组不替代逐项覆盖。

## 已执行子步骤

- DeepSeek 内置连接名称 input disabled=true；模型整行展开、显示更多。上下文128K、输入价格0.77、显示名 Acceptance Flash 经失焦保存并正常重启仍保持。输出价格首次输入1.88在重启后读到1.2，因此不把首次输出价保存签收；重新明确失焦后UI为1.88，未再次重启。此差异缺少首次失焦链路证据，不定产品Bug。见 model-overrides.png、model-persist-recheck.png。
- 内置模型移除后立即撤销，覆盖字段与用途绑定恢复。五种用途选择器实际逐个打开并Esc关闭，见 purpose-five.png。
- 自定义中转 OpenAI Chat，回环 `/models` 返回 fixture-main/fixture-alternate；初始均未选、无自动添加，全选后“添加2个”实际添加。见 custom-fetch-empty-selection.png。
- 自定义名称 Models Local、倍率非法oops失焦恢复1；改0.5正常重启保持。代理not-url显示“代理地址无效”，未保存；删除第一步显示再次确认，返回列表取消后连接仍在。见 delete-armed-invalid-proxy.png。后续真实两步确认删除成功，见 connection-deleted.png；删除后未再重启，不签收删除重启持久化。
- 轻量任务选 fixture-main 后真实发送；requests.jsonl 中 request1792636640494 model=fixture-main,isTitle=true，下一请求1792636640495 model=deepseek-flash,reasoning=high。标题用途与主请求分离有真实HTTP证据；未完成用量对账。
- 移除在用 fixture-main，提示轻量任务改跟随会话默认；超过撤销窗口后模型消失、用途回退；正常重启仍消失。见 remove-timeout.png、restart-undo-window.png。未测精确8秒边界。
- 移除 fixture-alternate 后同次操作立即正常 app.close；重启 main61309 后该模型仍在，未提交移除被保留；连接倍率0.5仍在。见 restart-undo-window.png。
- 通用页显示用户共享提示词绝对路径，仅观察未编辑，见 general-prompt-boundary.png。AgentInstructionsSection.tsx:69–103为路径说明和内容编辑器，没有改路径入口；不能通过当前设置入口隔离到副本，R25保留未覆盖。

## 原编号终态

| 验收点 | 状态 | 本批证据与未覆盖原因 |
|---|---|---|
| F1-01 | 未覆盖 | 本批新隔离profile不是旧版本迁移场景；不重复其他报告迁移证据。 |
| F1-02 | 未覆盖 | 本批只合成自定义Provider；官方真实Key、取消半成品和商业服务边界未验。 |
| F1-03 | 未覆盖 | 回环自定义连接、协议、非法代理提示通过；未知/日期版本、完整字段优先级及真实代理未验。 |
| F1-04 | 未覆盖 | 内置名只读、名称/倍率重启、非法倍率、非法代理、删除取消及确认通过；全部字段、Key取消保存、删除重启组合未全覆盖。 |
| F1-05 | 未覆盖 | 展开、更多、名称/上下文/输入价格重启保持通过；四层来源与全部恢复组合未验，输出价格首次保存不签收。 |
| F1-06 | 未覆盖 | 五用途入口、轻量任务选择、移除回退和重启通过；五用途逐一选择/跟随/重启组合未验。 |
| F1-07 | 未覆盖 | 标题fixture-main与主请求deepseek-flash/high真实路由通过；explore、看图、全用途用量对账未验。自动审批见独立审批专项，不冒充本批执行。 |
| F1-08 | 未覆盖 | 五用途菜单Esc关闭通过；Composer完整搜索/键盘/边界未验。 |
| F1-09 | 未覆盖 | 倍率0.5字段保存通过，未做实际费用和商业余额对账。 |
| F1-10 | 未覆盖 | 合成连接初始不选、全选、添加2个通过；全协议/失败fallback/完整键盘分支未验。 |
| F1-11 | 未覆盖 | 本批未执行完整手动添加分类路线。 |
| F1-12 | 未覆盖 | 内置移除撤销、在用模型超时回退持久化、正常退出撤销窗口保留通过；连续移除、精确计时与重新获取组合未验。 |
| P2-D16 | 未覆盖 | 本批模型字段非法值/取消/重启子点有证据；全部设置页所有开关行为不在本批完成。 |
| R25 | 未覆盖 | 当前UI无提示词路径改写入口且路径仍共享；不写原文件，不以改profile或API代签设置入口。 |
| 17-A5 | 未覆盖 | 本批合成Provider只实现LLM协议，未配置可真实调用及断开的搜索服务；未动用户服务。 |

## 清理与剩余边界

本批 Electron main18717、61309均已退出；Provider正常SIGINT关闭，44341无监听，ps/lsof实际核对为空。原始profile/fixture/请求日志/截图保留作为证据，不删除。

仍真正可执行但本批未执行的独立路线：完整手动添加/Composer键盘分支、连续移除与精确8秒计时、独立搜索服务断开调用、explore/看图用途HTTP和用量对账；需要另开明确路线，不以普通菜单已选替代。真实官方端点、原生VoiceOver及共享提示词安全隔离仍缺前提。没有新增已确认产品Bug。


## 有限补验终态（11:25）

补验点先定为 explore/inspect_image 用途与用量、连续移除/重新获取、17-A5搜索禁用请求与恢复、R17批注编辑；后追加14-A3/A4非IME恢复，以及D08协议边界。按用途运行、模型生命周期、搜索与批注、提交恢复四组执行。仍为真实Electron/CDP，非原生系统自动化。

| 子点 | 结果 | 实际步骤与证据 |
|---|---|---|
| F1-07 explore HTTP | 通过（受控） | Provider仅新增受控explore工具脚本；真实UI发送FIXTURE_EXPLORE，实际父工具→子Agent→父完成。请求1792638466405 task为只读子任务，model=deepseek-flash,reasoning=high；与当前explore绑定一致。UI子Agent完成，explore-complete.png。该会话继承主仓库workspace，工具只读且合成回复无文件操作；未写产品。 |
| F1-07 explore用量 | 未覆盖（子点已有实证） | 父轮UI240tok=两次父请求各120tok；HTTP另有子请求120tok，未找到并完成子用量与全局统计归集对账，不宣称父轮包含子用量。 |
| F1-07 inspect_image | 未覆盖 | 从真实添加菜单点图片，Electron原生文件对话框未产生Playwright filechooser事件，等待5秒超时；正常关闭自己的实例退出对话框。未用内部artifact写入或API代签UI上传；没有发出图片分析请求。 |
| F1-12连续移除/重新获取 | 通过（所列子步骤） | 新建隔离回环连接、实际全选添加2个；连续移除fixture-main与fixture-alternate，等8.5秒后UI空模型，再获取两项初始未选，全选添加2个恢复。continuous-remove.png、continuous-readd.png。精确8秒临界与中间撤销组合仍未验。 |
| 17-A5 enabled排除/恢复 | 通过（替代子步骤，非断开Key） | 隔离profile中真实UI关闭DeepSeek/智谱/Tavily三个搜索通道enabled，不动Key；发送受控web_search实际工具调用，Journal seq68call/seq70result失败WEB_SEARCH_NOT_CONFIGURED，明确无配置来源，随后UI恢复三个enabled=true。search-channels-disabled.png、search-disabled-request.png、search-channels-restored.png及supplement-journal-extract.json。 |
| 17-A5断开凭据与真实服务恢复调用 | 未覆盖 | 设置只提供Key与enabled，无自定义端点；packages/tools/web-tools/src/node-ports.ts:79/83/87/91固定官方URL，无法将合成服务绑定回环。未删除真实Key或请求恢复后的商业服务。启用排除不是断开凭据，不将原复合项签收。 |
| R17批注卡编辑 | 通过（所列子步骤） | 对完成回复真实鼠标三击选区，等待浮层后点添加到对话→1条批注→编辑第1条→填评论→Tab/Esc→重开卡显示评论“验收评论已编辑”。annotation-edited.png。之后清空验收批注。 |
| 14-A3/A4非IME pending恢复 | 通过（存储注入方法） | 按pending-submission.ts格式向独立profile localStorage写可追踪记录pending-acceptance-20261022，正常重启后显示“上次提交尚未确认，再次发送将核对同一次提交”及原草稿，无自动发送。pending-storage-restart.png。不是实际网络未知故障注入。 |
| 14-A3/A4原样发送/去重 | 通过（所列子步骤） | 真实Enter再发，Journal仅1个accept使用原submissionId、1个user/message。重新注入同已接受ID再正常重启，记录自动清理且草稿空，没有第二次user/message。supplement-journal-extract.json包含精简可追踪事件。未以第二次API提交代签UI重发。 |
| 14-A3/A4已有输入保护 | 通过（会话切换子点） | 输入EXISTING_INPUT_KEEP后注入不同pending草稿；真实新建会话后切回，输入仍为EXISTING_INPUT_KEEP，pending未覆盖。pending-existing-input.png。真实IME与断网时序仍未覆盖。 |
| P2-D08 revokeGrant/workspace-prefix | 未覆盖 | 可达preload sessions.revokeGrant，fixed-renderer-ipc.ts:217–225协议存在；当前模型profile没有专设授权grant，且没有renderer撤销UI。没有通过伪造grant或无效ID调用声称实际撤销通过；本批未重开审批路线验证撤销后再请求/换workspace。仅源码与运行时接口存在性，不是行为验收。 |

综合状态仍按上表F1/P2复合项保留未覆盖，本补验只扩大明确通过的子步骤。没有新确认产品Bug。所有新增操作均为验收fixture/独立profile；合成provider补丁不改产品。补验Electron main83151/11643/13804/17181正常关闭，回环44341 Provider正常SIGINT退出；ps/lsof无这些Electron PID或监听。已关闭遗留本批driver readline进程，证据保留。仍真正缺项为inspect_image原生上传前提、explore子用量归集、商业搜索断开/恢复、D08专设grant撤销与workspace切换、真实IME；没有继续扩展普通UI路线。

## 模型设置有限补批次终态（12:01）

本批先列验收点：F1-04连接字段重启/删除重启；F1-05思考、上下文与两价格显式blur覆盖、重启、目录恢复；F1-06五用途选择/跟随/切页/重启/还原；F1-08键盘与空搜索/Esc；16-A5真实Select键盘提交；F1-10受控HTTP错误；09-P3-2真实思考参数。按同详情页字段→用途批量→集中重启→目录恢复→删除后重启执行，未改coverage或产品。

| 点 | 本批终态 | 实际证据与边界 |
|---|---|---|
| F1-04自定义连接字段 | 通过（所列子点） | 专用连接改名Fields Persist Local；协议实际切OpenAI Responses再回OpenAI Chat；服务地址填回环末尾斜杠后规范化为http://127.0.0.1:44341/v1；代理清空；倍率0.5。均失焦保存。正常关闭69687→重启94302，逐字段读回名称/地址/空代理/倍率和OpenAI Chat。fields-before-restart.png、fields-restarted.png/json。没有声称合法代理连通，只有清空分支；协议切换只验证设置保存，不证明Responses端到端协议。 |
| F1-04删除重启 | 通过（所列子点） | 用途恢复后两步确认删除专用连接，正常关闭7642→重启12413，连接与其3模型均消失，其他连接保留；connection-deletion-restarted.png/json。DeepSeek回环连接仍保留。 |
| F1-05覆盖重启 | 通过（所列子点） | DeepSeek合成路由模型默认思考低、上下文256K、输入0.91/输出2.34，每项明确Tab失焦并等待保存；正常重启94302读回一致，model-explicit-blur.png、model-restarted.json/png。 |
| F1-05目录恢复 | 通过（代表模型） | 在同回环自定义连接手动添加目录精确识别openai/gpt-4.1，仅配置元数据，未请求该商业模型。目录原上下文1047576、倍率0.5后入1/出4；覆盖200K/7/9，正常重启7642仍一致；UI“已修改/恢复”两入口实际点击，读回1047576/1/4，“已×0.5”重现。catalog-original.json、catalog-overrides-restarted.json、catalog-overrides-restore-controls.png、catalog-restored.json/png。该模型不支持思考，思考恢复目录组合不签收；DeepSeek当前无目录匹配，仅显示名称有恢复入口，其他字段无目录恢复可操作。 |
| F1-05来源代表 | 通过（运行时旁证） | 真实UI识别说明、未知模型说明、已修改/恢复、已×0.5均观察。公开modelConnections.list精简存effective-sources-representative.json：DeepSeek字段user/provider混合、fixture-alternate unknown、fixture-main input/thinking user、openai/gpt-4.1 catalog exact。这是公开运行时来源旁证，不把四层所有优先级排列签收。 |
| F1-06五用途 | 通过（所列组合） | 会话默认选fixture-main；轻量/自动审批/explore/看图逐项选fixture-main、切通用再回模型读回，然后跟随并切页读回。轻量首轮250ms读值过早为跟随，随后800ms复验选中fixture-main与跟随均读回，未把过早读值当产品Bug。会话默认没有跟随自己选项，设计范围内不做。最终五项同选fixture-main，正常重启94302五项均读回；purpose-selected-follow.json、purpose-all-fixture-before-restart.png、purpose-five-restarted.png。fixture-main最初不支持图片未进入看图列表，经真实UI勾图片能力后才可选，仅合成配置，不证明图片推理质量。 |
| F1-06恢复原值 | 通过 | 会话默认/自动审批/explore回Acceptance Flash高，轻量/看图跟随；模型字段回本批初始128K/0.77/1.88/高、显示名Acceptance Flash；最后删除后重启12413五用途仍与初始一致。purposes-original-restored.png、connection-deletion-restarted.json。 |
| F1-08用途键盘/空搜索/Esc | 部分通过，复合未覆盖 | 空搜索无匹配、Esc回焦轻量任务触发器通过；Tab到真实行→Enter选择fixture-main并读回，再恢复跟随，purpose-keyboard.json。搜索框实测ArrowDown不移动选项，ArrowUp未单独验，焦点仍“搜索模型”；源码PurposePicker.tsx:82–110是普通input+PickerRow，无方向键处理，本批不声称↑↓Enter箭头组合通过。 |
| F1-08 Composer | 部分通过，复合未覆盖 | 真实搜索空态、Esc关闭；等待400ms后焦点回.model-button，composer-search-empty.png、composer-escape-stable-focus.json。早先立即采样focus=body是异步中间态，不定回焦Bug。搜索fixture-main后Tab到真实model-select-button、Enter选择并关闭；实测ArrowDown从搜索框未完成列表导航，ArrowUp未单独验，不声称箭头组合通过。 |
| 16-A5 Select键盘 | 通过（默认思考代表） | 默认思考焦点Enter打开，ArrowDown后等待150ms再Enter，低→高成功并回焦“默认思考”。未等待渲染的快速连按读到旧值，调整观察时序后通过，非产品Bug。不是所有Select全量验收。 |
| 09-P3-2思考档位HTTP | 通过（受控） | fixture-main真实UI配置低/高档；Composer“编辑选项”显示Low/High，选High后真实发送FIXTURE_EFFORT_HIGH_ACCEPTANCE，HTTP request1792640573261 model=fixture-main,reasoning=high，UI完成120tok。requests.jsonl。不是不存在的档位，也不代表商业推理质量。 |
| F1-10错误/fallback | 部分通过，复合未覆盖 | 自己隔离DeepSeek地址临时回环44343，先未监听产生明确网络错误，再自建HTTP500服务，真实获取显示“服务端出错（HTTP500）”并自动展开手动添加，official-loopback-models-failure.png、official-loopback-http500.png。没有目录fallback弹窗可签收，当前deepseek-flash无目录match；未修改产品固定端点。地址恢复44341。自定义实际请求仅OpenAI Chat兼容，Anthropic/Responses不假称协议通过。 |

### 验收边界偏差（不计通过，不是产品Bug）

寻找目录恢复代表时，打开隔离profile复制的真实Kimi详情，UI自动呈现余额信息，未另读Key或主动调用余额。这不符合本批“禁止新商业请求”的路线约束。立即停止该路线并告知主审，不再打开其他复制的商业连接；随后目录恢复代表改为回环自定义连接内仅配置的openai/gpt-4.1。该余额不计任何验收通过。当前仅有UI余额呈现证据，未保存网络响应/访问日志，不能确认本次网络请求是否命中缓存，更不能确认计费；按可能触发新商业请求记录，未继续取证触发余额。没有暴露或修改用户原Key。

### 还原与清理

五用途和DeepSeek模型字段已回本批初始值；专用新增连接按验收目标删除且重启确认。DeepSeek地址恢复http://127.0.0.1:44341/v1，未改用户profile或共享prompt。当前会话曾选的已删fixture模型只属隔离profile历史，不是用户会话。正常关闭本批Electron69687/94302/7642/12413；回环Provider44341、HTTP500服务44343已SIGINT退出；ps/lsof确认这些PID与监听为空，遗留driver readline亦关闭。原始证据保留。剩余缺项明确是全协议端到端、目录思考恢复全组合、四层优先级全排列、两种模型菜单方向键导航以及真实商业/原生边界；不继续扩展路线。

## 有限 UI 缺口批次终态（2026-10-22 12:25）

验收点先列为：F1-11四类手动添加反馈与字段/键盘；F1-12连续移除中间撤销、离开详情提交及8秒前后；F1-08搜索空态/分组/选中状态/屏幕边界与键盘设计；09-P3-2当前编辑选项层级/Esc回焦；V02浮层互斥；R07技能选择/多选/键盘循环；F1-10安全受控加载态与键盘代表。实际分为专用连接生命周期、Composer菜单/技能、回环延迟获取三组。仍是固定dist的真实Electron/CDP，不是原生AX/IME/VoiceOver；未访问任何商业连接详情或发出商业模型请求。

| 点 | 终态 | 实际结果与证据（本报告同名tmp/evidence） |
|---|---|---|
| F1-11精确目录/变体/未知/重复 | 通过（所列子点） | 专用Finite UI Local：openai/gpt-4.1显示精确识别；openai/gpt-4.1-20261022显示按GPT-4.1填写及“不是它”；未知显示未识别并允许填64K；重复精确ID显示已在列表、添加禁用。manual-four-classes.json/png。仅配置元数据，无商业模型请求。 |
| F1-11修改ID/名称、Enter/Esc | 通过 | 未知ID从unknown-acceptance-before改为unknown-acceptance-after，名称Unknown Local；精确/变体分别命名Exact Local/Variant Local；真实Enter添加，重复及另一个新草稿Esc关闭未添加。相同证据含最终3模型。 |
| F1-12连续移除/中间撤销 | 通过 | 添加Timer a/b/c，连续移除a/b后撤销恢复b，a已提交；其后c继续移除。remove-timestamps.json中middle-b-undone显示b/c两模型、无撤销条；非只观察最终空态。 |
| F1-12约8秒前后 | 通过（非机械毫秒临界） | c移除04:15:04.616Z，04:15:08.625Z仍有撤销，04:15:13.350Z撤销消失；真实时间差约4.0/8.7秒。remove-before8s.png、remove-after8s.png与remove-timestamps.json。 |
| F1-12离开详情提交 | 通过 | b移除04:15:13.506Z后立即返回模型页再进入专用连接，04:15:13.575Z无撤销且空列表。remove-timestamps.json。最后两步确认删除专用连接，未留下新增模型。 |
| F1-08空态/分组/边界 | 通过（代表Composer） | NO_MATCH_FINITE显示没有匹配；DeepSeek/Moonshot/OpenRouter/cheaprouter.cc分组可见，仅菜单元数据不打开真实连接详情；480×800视口菜单rect x102 y159 w244 h292，完全在视口内。model-empty-finite.png、model-boundary.json/png。 |
| F1-08已选禁用与方向键 | 未覆盖原复合要求；当前设计范围已核实 | Composer当前已选Acceptance Flash带选中样式，按钮disabled=false（model-boundary.json），不冒称“已选禁用”通过。ModelPicker.tsx与PurposePicker.tsx普通搜索+按钮没有ArrowUp/Down列表导航处理；Tab/Enter代表已在上一批实测，未把未定义箭头行为报Bug。获取模型对话框已添加禁用组合本批未再验，不以Composer选中状态替代。 |
| 09-P3-2当前模型选项/Esc | 通过（当前设计） | 编辑deepseek-flash选项后主菜单/选项各1，单次Esc两者关闭，400ms后焦点回.model-button；options-before-escape.png、options-escape.json。对照front-聊天输入框规范.md:111–118，当前要求Esc关闭回模型按钮；旧“+→模型两次Esc”路径已被替换，不登记Bug、不沿用一次只关Options假设。未修改任何选项值。 |
| V02运行位置/+ /模型 | 通过（所列连续切换） | 新建页打开运行位置→直接点+，旧运行菜单消失且+打开；直接点模型，+消失且模型打开。popover-mutual.json保留逐步正文；运行菜单本身未标data-composer-floating，因此不用计数0错误宣称没打开。 |
| V02 Context→模型 | 通过（代表转换） | 回既有受控会话打开上下文用量—，再直接点模型，Context正文消失、model-menu=1；context-model-mutual.json。未逐一穷举全部两两反向组合。 |
| R07技能列表/过滤/多选/循环 | 通过（安全选择子点） | 真实/菜单32项，ArrowUp从plan循环到末项actspace-plugin-development，ArrowDown回plan；/write Enter真实选择，/read搜索同时命中描述中的plan等，首次Enter选首项Plan属正确过滤行为，随后退出Plan并明确点击read行。最终write/read两chip同时可见；skills-keyboard.json、skills-two-selected.png。之后逐一移除并清空草稿，无发送、无执行技能、无修改用户技能文件。 |
| F1-10加载/键盘代表 | 通过（所列子点；全键盘复合仍未覆盖） | 自建回环44345延迟2.5秒/models，隔离DeepSeek地址临时切入；真实聚焦获取按钮Enter触发，250ms显示正在获取，完成出现2模型选择框。键盘Space全选，已选2个，Tab到首checkbox，Esc取消不添加。fetch-loading.png、fetch-loading-keyboard.json。未通过全部键盘路径提交添加，因此不声称全键盘复合通过；未构造官方fallback或商业请求。地址随后显式blur恢复44341。 |

本批无新确认产品Bug。临时Finite UI Local已两步确认删除；五用途及Acceptance Flash模型字段没有修改，仍为本批初始值。回环延迟获取未添加任何模型，服务地址恢复http://127.0.0.1:44341/v1，finite-restored.png。技能chip/Plan/草稿均已清空，当前会话workspace没有改动。剩余未覆盖明确为获取列表已添加禁用组合、全键盘提交全路径、所有浮层双向穷举及原生/商业边界；不扩大路线。

清理核验：本批Electron main29992正常关闭，ps无该PID；Provider44341与延迟服务44345已SIGINT结束，lsof无监听。app.close后仍保留的独占driver29991已TERM结束，未触碰其他Electron/用户实例。证据与隔离profile保留供复核。

## 普通 UI 有限缺口批次终态（2026-10-22 12:35）

本批验收点：F2-01/02三个独立统计入口完整关闭/内部/回焦矩阵；F4-01现有真实只读子会话过滤；R08运行/失败/未配置状态；V03 Chat及运行中placeholder/chip；F1-10获取列表已添加禁用；F1-08现行键盘要求。按统计浮层、列表与受控运行、模型设置执行；追加R25仅使用全新空profile。未改产品/dist/coverage，无新商业请求或真实连接详情访问。

| 点 | 最终结果 | 本批实际子步骤/证据与尚余点 |
|---|---|---|
| F2-01 Context | 通过（本行关闭矩阵） | 上下文用量—真实打开→重复点击关闭；内部点保持；分别点textarea、状态行、消息正文、侧栏工作区标题，原浮层关闭（点状态行转开“会话统计”，不把新浮层误认原浮层未关）；Esc等待400ms焦点回上下文触发器；新建会话后收起。popover-matrix.json逐动作保留。该会话上下文模型容量为—仍能读估算分类，无伪造完整模型容量。 |
| F2-02累计统计/回复尾用量 | 通过（本行交互矩阵） | 两种入口独立执行同完整矩阵：重复关闭、内部保持、四处点外、Esc各回自身按钮、切新会话收起。累计840tok=700未缓存输入+140输出；末轮120tok=100+20，模型fixture-main。popover-matrix.json。主题/窄窗已有其他报告，不用本矩阵冒充新主题验收。 |
| F4-01普通侧栏/搜索/归档排除 | 通过（所列子点），复合未覆盖 | 自己profile已有实际explore子会话e52ae2a2-c12f-4dd0-b9cb-9bb27f7a9c86，父a7c491b7-135b-41ef-b3bf-0e398a12593f。普通侧栏只有父；真实侧栏FTS词Fixture找到父，Report无结果，不要求任意子串或子内容一定命中父。归档UI暂无归档会话，无子混入。session-readonly-ids.json保留父分页items、group hasMore=false及getSubagents真实transcriptRef；session-search-terms.json、archive-readonly-check.json。 |
| F4-01分页/quick-open/重建 | 未覆盖 | 当前开始仅1父，后加受控任务后2父，limit50无nextCursor、group hasMore=false，真实UI无下一页；未额外准备超过页大小的会话，故未签分页。真实CDP按Meta+Shift+Space未触发OS全局快捷键，仅1窗口；没有调用quickOpen公开协议冒充真实快捷唤起。原生全局快捷键安全控制尚未实际执行，quick-open仍待验。独立派生副本索引重建本批未做，这是可准备但尚未执行的路线，不称永久环境障碍。 |
| R08运行中/失败/未配置 | 通过（当前实例代表） | Chat真实发送FIXTURE_HOLD_CHAT_PLACEHOLDER，运行点弹层“运行中/Agent正在执行当前轮次”，DOM border-operational旋转圈；正常停止后显式继续发送FINITE_CONTROLLED_FAILURE到自建44346 terminal-error，实际HTTP400显示失败，点状态点显示“最近一轮执行失败或需要处理”，DOM bg-danger。新空profile通用图片生成/MiniMax未配置为off空心border-line-strong、中性文字rgb(103,103,98)。running-chat-status.png、chat-running.json、failed-status.png/json、unconfigured-status.png/json。没有将HTTP错误当卡死。 |
| V03 Chat/运行中/chip | 通过（所列缺口） | 当前固定dist真实+面板Chat可达，不属不可执行F9未来版本；进入时placeholder“问点什么…”，名称span不在button内；运行中“继续追问，运行中发送会进入队列…”；停止后点独立“退出Chat模式”回Agent，placeholder“继续追问…”，稳定焦点TEXTAREA。chat-running.json保留DOM与状态。既有Plan与布局矩阵不重复。 |
| F1-10已添加禁用 | 通过 | 从44341实际获取，选择并添加fixture-main，再次获取显示已添加/aria-checked=true/aria-disabled=true；这是aria禁用checkbox而非native disabled属性，截图及DOM精确记录。Esc取消后从详情移除fixture-main并离开详情提交；随后公开list中已无fixture-main。fetched-already-disabled.png/json。未要求额外全协议穷举。 |
| F1-08键盘定义与实测 | 通过计划所要求的键盘选择子点 | 本批Composer/用途搜索框分别真实↓↑Enter，焦点均留搜索input、菜单未关、不选择；composer-arrows.json/purpose-arrows.json。现行front-聊天输入框规范§111–118模型菜单未规定Arrow导航；front-模型设置规范§269要求搜索/返回/保存/取消/删除支持键盘，未指定Arrow。与主审核对后采用已实证Tab到行+Enter选择、Esc回焦作为当前定义键盘代表，不报Arrow Bug，也不以源码无处理免验。获取弹窗已添加禁用已独立补实证，Composer选中可再点不应混为禁用要求。 |
| R25隔离自有提示词 | 通过（编辑/保存/切页/正常重启/还原） | 全新ACTSPACE_DATA_DIR r25-empty-profile，不复制设置/Key且不配置Provider。启动后settings.general.agentInstructions.systemPromptPath与realpath均在该profile/prompts/main-agent.md（默认原74字节），先备份original-main-agent.md。真实通用→编辑Agent指令→R25_ACCEPTANCE_OWN_PROFILE_ONLY→保存→外观再通用重开读回；正常关闭82480并重启88442仍读回，随后真实UI恢复原文件并保存，磁盘逐字节相等。r25-page-reopen.json/png、r25-restarted.json/png；未触碰共享prompt。 |

本批未发现新确认产品Bug。HTTP失败服务与模型地址只在自己隔离profile修改，结束已恢复44341；fixture-main已移除，五用途/原模型字段未改，Chat已退回Agent，未留下待运行任务。新增受控会话4cd7d845-7c49-45c1-9ccf-f30a3889713a仅是验收历史；未写主仓库文件。F4分页/真实quick-open/索引重建是真实仍待做子步骤；代表组件不追加无界穷举门槛。此前F1-04/F1-06等表中“未穷举全协议/所有排列”属于范围说明，不是计划额外失败门槛。

清理完成：本批正式Electron64518、R25的82480/88442均app.close正常退出；首次未保留stdin的启动62547仅作为驱动启动过程问题已TERM退出，不计验收。Provider62473（44341）与terminal-error44346均SIGINT退出，lsof无监听。残留独占readline驱动64497/82479/88415已TERM结束，ps核对上述PID全空；未触碰其他Agent或用户Electron。

## F4/F6 分页与派生索引有限补批终态（2026-10-22）

先列验收点：55个普通会话及2 delegation子记录的初页/更多页/FTS分页/归档过滤；quick-open现有入口；完整应用启动旧SQLite/最新cursor派生副本后的恢复、相同ID/统计与Journal不变；可安全追加时补跨日筛选。按会话列表、派生索引、独立时间副本三组执行。均固定主dist、全新自有profile，无Provider配置、无商业请求；真实Electron/CDP与公开IPC装配分开标记。

### 数据与方法

f4-profile基于自己无Key的R25空profile设置，不复制商业连接/秘密。自己的2个真实普通父Journal和1个已完成explore child原样复制；该child再仅重映射sessionId为第二子记录，保留delegation lineage，明确第二个不是新真实模型委派。另公开sessions.create创建55个F4PARENT 000–054普通会话，无请求、无文件工具。共57普通+2子、59份Journal。f4-fixture-provenance.json记录自有源路径/哈希与重映射方法，f4-created.json保存55个公开创建ID。两个子ID为e52ae2a2-c12f-4dd0-b9cb-9bb27f7a9c86与32fd99f3-82ea-4527-8c49-aab465e51f6e；父a7c491b7-135b-41ef-b3bf-0e398a12593f保留可发现。

| 点 | 终态 | 实际结果与证据 |
|---|---|---|
| F4-01普通初页/分页 | 通过 | 真实侧栏初始6项，展开到首批10，点加载更多→16，展开20，再连续加载/展开至30/40/50，最终57普通会话；2子均未混入。f4-ui-pages.json保存每步标题数量/时间；f4-ui-final-ids.json为DOM data-session-id精确57ID，f4-all-pages.png。公开listPage limit50仍按工作区分组10条且hasMore=true，本次不将组内10与搜索50混淆。 |
| F4-01搜索分页/父可发现 | 通过 | 真实搜索完整FTS词F4PARENT，首屏50，点下一页后5，f4-search-archive-protocol.json保存UI文本、首屏50ID与cursor。另在时间副本公开恢复2子归档标记后，真实搜索Fixture仅列两普通父（4cd7d845…/a7c491b7…），不列正文同含Fixture的子，f4-child-search-fixture.json/png。完整词检索，不要求任意substring。 |
| F4-01归档过滤 | 失败：BUG-024（协议可构造状态） | 公开sessions.archive将2普通和2子设archived=true；真实归档UI同页显示New chat/1次运行两条、F4PARENT001与000两条。f4-archive-ui.png/json、f4-archive-row-dom.json保留实际四行。DOM不含ID，映射依据是ArchivedChatsSection.tsx:39–40直接按sessions.list({archived:true})顺序渲染；f4-archived-ids.json legacy数组依次为32fd99f3…子、e52ae2a2…子、32f79622-566a-41e3-8689-891bf493c3bc普通、b390a064-80f4-4fb0-bace-684505edbdd0普通，isChildSession明确true/true/false/false。未声称正常产品UI自然能归档子，只证明公开协议可构造/历史状态下归档入口未过滤。建议归档查询/呈现使用普通列表相同lineage过滤，不修产品。 |
| F4-01 quick-open | 未覆盖 | 当前app真实Application Menu运行时清单无quick-open项目（f4-application-menu.json），现有设置仅快捷键/打开目标配置，不是执行唤起入口。此前CDP快捷键不产生OS全局事件，本批未重复无效探针，未调用协议代签UI。真实原生全局快捷键仍需安全控制前提。 |
| F4/F6旧SQLite恢复 | 通过（完整应用/真实UI结果） | 正常关闭f4-profile后完整复制为f4-rebuild-profile；仅派生usage-read-model.sqlite中的usage_activity删除13行、PRAGMA user_version降9，保留472条index_state；另写v1空rows且throughJournalSeq最新的旧cache/reset。正常启动完整应用，SQLite恢复schema10、13行、59 catalog，UI全部11请求/1080tok=900入+180出，与基线相同。f4-rebuild-preparation.json、f4-usage-baseline.json/png、f4-rebuild-ui.json/png、f4-rebuild-integrity.json。 |
| F4/F6重启/同ID/不重计 | 通过 | 再正常关闭/启动，统计summary精确相等（含费用0.0009031999999999999），仍13activity/11request/1080tok；普通ID与归档前57减去2普通归档后的55ID集合完全相同；59 Journal SHA256全部不变。f4-rebuild-normal-restart.json、f4-rebuild-comparison.json。真实UI恢复后Fixture搜索仍发现两普通父，f4-rebuild-search-ui.json/png。 |
| F6构建/同步过程提示 | 未覆盖过程瞬态；加载与恢复已有实证 | 启动窗口实际显示正在加载会话，最终统计正常；在统计页前挂DOM MutationObserver监测检查/同步/重建/查询文案，本次phases=[]，59个小Journal处理很快，未捕获统计重建提示，不能用最终截图代签过程。未人为延迟产品或伪造DOM。可用更大合法Journal副本继续验此明确子点。 |
| 旧JSON cache完整应用升级 | 未覆盖该分支 | 同副本的global-usage-index.json在完整应用SQLite默认路径后仍version1，不能宣称JSON缓存已被实际消费或升级；本批通过的是SQLite路径。此前reliability独立UsageSourceCache服务升级证据仍属服务级，不冒充本次UI分支。 |
| F6-03跨日时间筛选 | 通过（合成时间代表） | 另完整自有副本f6-time-profile，删除其派生数据库/cache重建；将普通父4cd7d845…所有合法ISO时间整体前移2天，将a7c491b7…父及两个lineage child整族前移9天，保留事件序号/相对因果顺序；其余55空会话不产生请求。真实UI分别点24小时/7天/全部得到0请求0tok、2请求0tok（1error+1aborted）、11请求1080tok；f6-time-preparation.json记录原/改哈希与shiftDays，f6-time-ui.json保留每次UI与公开数值，f6-time-total.png。当前实现为滚动24小时/7天，不宣称自然日零点或真实等待跨日。 |

整体F4仍因BUG-024失败及quick-open未覆盖不能全签；分页、搜索及SQLite重建明确子点已补完。未额外设置穷举门槛。本批新问题只交主审统一编号，未讨论/修改产品。所有profile、Journal时间变体、数据库/cache修改仅自有tmp；原始自有源Journal与f4-rebuild的59份Journal哈希保持。f6变体后公开恢复2子归档用于搜索是有意协议数据操作，不与SQLite重建不写Journal结论混用。

补充入口与版本界定：quick-open当前实现存在OS全局快捷键入口，apps/desktop/src/main/index.ts:172–178注册globalShortcut、显示/聚焦主窗并requestQuickOpen；fixed-renderer-ipc.ts:342–347发事件，App.tsx:1074–1107消费并选择目标。当前Application Menu没有独立唤起项，设置里是配置入口；不把未实现的菜单动作新增为要求，未覆盖的是现有全局快捷键真实触发，不是产品缺入口Bug。

本批固定产物：desktop package版本0.1.0；实际启动依赖Electron39.8.10。四次完整应用main PID依次98989（f4基线）、24439（旧派生索引恢复）、36635（相同派生副本正常再启动）、34556（独立合成时间副本）；均同固定dist，未重建。main/index.js SHA256=2371c74c302744f80a6b2842908b38e78b3c25954fbb15a3d6d19de2b89bc67c，dist/index.html SHA256=600823bd5ae530bec878d07ad0022a4b331f3e7eb0b8928d0f852099e18b2f6c。版本为package/依赖与产物标识，不冒称另读运行时app.getVersion。

合成时间分组：2天前普通会话贡献2请求（失败1、中止1）/0 Token；9天前父子族贡献9请求/1080 Token；合计11请求/1080 Token。原自有源目录3份Journal最终SHA256与复制前完全一致，f4-original-source-hashes-final.json；f4-rebuild 59份Journal两次应用启动前后也全相同。

清理终态：四个Electron main均正常app.close，ps已无98989/24439/36635/34556；app.close后残留独占readline驱动98987/24418/36608/34543已TERM，最终ps同样为空。本批没有启动Provider服务。保留profile与证据供复核；未操作用户/其他agent实例，未改coverage/产品/dist。

## 最后模型目录 / 图片用途 / 首启有限补批终态（2026-10-22）

验收点先列：A1 目录可识别且支持思考模型的真实UI覆盖/恢复；A2 user/provider/catalog/unknown四层代表的公开list与UI值对账；A3 /models context/price优先级及可选合法代理；B1 自有合法PNG经公开Host导入/提交成为持久artifact；B2 inspect_image真实Runtime工具结果、用途模型/档位/图像格式HTTP；B3 图片UI预览和正常重启恢复；C1 空profile首启目录/bootstrap、无模型与重启历史。按模型详情、图片任务/重启、清理三组执行。固定dist，独立全新final-media-profile，没有复制任何真实商业连接/秘密，没有商业模型或生成请求。

| 点 | 终态 | 实证 |
|---|---|---|
| F1-05目录思考覆盖/恢复 | 通过 | 自有FinalMediaLocal回环连接，真实UI手动添加精确识别openai/o3-mini，目录默认思考中；真实Select中→高，出现已修改/恢复，公开list thinking.default=high/source=user；点恢复→中、overrides=null/source=catalog。final-catalog-thinking-user.json/png与final-catalog-thinking-restored.json/png。仅配置元数据，未向官方端点请求模型。 |
| F1-05四层代表 | 通过（代表，不声称全排列） | user：o3思考高；provider：o3上下文123456、价格入7/出11；catalog：o3-mini默认思考中/200K及o3名称与maxOutput；unknown：fixture-unknown上下文/价格空且UI不在模型目录中。final-thinking-user.json、final-catalog-thinking-restored.json、final-layer-ui.json、final-model-state.json。o3 UI输入123456/7/11与list一致。provider思考恢复回provider中，另用无providerFacts的o3-mini独立证明恢复目录，未混为一层。 |
| F1-03 Provider metadata优先级 | 通过（所列代表） | 真实GET /v1/models返回o3 context_length123456、pricing.prompt0.000007/completion0.000011，有效值转换为每百万7/11并覆盖目录200000/2/8；来源provider。o3 Mini无providerFacts仍来自catalog。原始final-media-http.jsonl保存HTTP body与时刻，final-model-state.json/详情UI值保存配置结果。 |
| F1-03合法代理代表 | 通过 | 真实UI代理字段填http://127.0.0.1:44348，Tab失焦保存，再点获取可用模型，真实弹窗4项已添加；仅回环代理允许CONNECT127.0.0.1:44347，其余目标403。final-proxy-http.jsonl记录2026-10-22T05:02:25.186Z CONNECT，Provider日志同次GET/models；final-proxy-ui.json/png保存proxy enabled/url与弹窗。随后UI清空代理Tab保存。非商业外网代理，不声称其他代理协议均通过。 |
| B合法attachment/artifact持久化 | 通过（公开协议装配） | 自生成2×2 PNG 74bytes，经真实公开dialogs.importComposerImage→tasks.submit导入，非手写artifact记录；返回prepared artifact 7ee60457-1b0d-4c99-80d7-e5d5cc725da0、mediaType image/png。Session dbd0aa7d-94a4-44a8-b14e-1e01917fc1af。final-media-submission.json保留公开返回，final-owned-2px.png为原图；artifacts-v2元数据包含owner session与user-attachment、字节SHA256 f61eb2acfd02f7a571aa5df0c35ae878fb96d6b9c0eb9c3b0beefa70df111865。不冒充原生文件选择/剪贴板。 |
| B inspect_image用途真实HTTP | 通过（受控Provider） | 重启后同session同artifact，工具inspect_image实际completed，modelOutput含image_inspection_result status success。真实视觉POST model=fixture-vision，content含image_url data:image/png;base64；该模型无思考档位，JSON无reasoning_effort。再将用途绑定同回环连接的openai/o3、thinking=high，正常重启后实际视觉POST model=openai/o3、reasoning_effort=high并携同PNG，工具success。final-media-http.jsonl、final-media-request-summary.json、final-media-high-config.json、final-media-final-projection.json。受控视觉回复仅证明接线/数据格式，不代签商业视觉质量。 |
| B工具结果/图片UI/重启恢复 | 通过 | 真实UI展开Worked for 1s显示Inspected image artifact…；真实点击Preview message image打开图片预览，DOM naturalWidth/Height=2/2且complete=true。三次启动同profile历史/attachment保留，第三次正常重启后再次预览。final-media-tool-expanded.png、final-media-high-tool.png、final-media-preview-after-restart.json/png、final-media-preview-third-start.png。artifact字节及元数据正常重启前后哈希相同，final-media-artifact-integrity.json equal=true。 |
| B真实generate_image artifact | 未覆盖 | 全新无商业凭据profile不存在既有真实生成产物，不跨用户目录取产物，不请求商业生成；本批合法用户图片attachment不是generate_image产物，不能代签该分支。 |
| P2-D01首启/bootstrap/重启 | 通过（所列代表） | main57964首次启动全新自有dataDir，窗口先正在加载会话，后暂无会话/未连接模型；公开连接list为空，未给默认商业Key。真实目录创建settings/workspaces/prompts/tmp等，final-media-files-before-close.json列目录，final-bootstrap-state.json保存真实bootstrap IPC。main76497/85664正常重启恢复同session历史及图片。final-bootstrap-no-model.png保存未配置提示；无模型完整输入禁发交互沿用此前unconfigured-status.json/png代表，本批不把空输入截图单独声称完整发送路径通过。 |

### 配置生命周期观察（候选，不确认根因）

首次main57964由无模型状态启动，公开modelConnections.create/addModels与updatePurposes成功；新session创建前chat=custom-779e4a0b/fixture-main，vision=同连接fixture-vision，list有效input含image。2026-10-22T04:59:29Z首个图片任务中，main实际POST fixture-main并调用inspect_image，但工具返回Image inspection is not configured for this Host.，未发视觉HTTP；final-media-first-projection.json与HTTP原文保留。正常关闭重启main76497后，同session/同持久artifact/相同vision配置，05:01:12Z后工具调用发fixture-vision实际视觉HTTP并success；final-media-second-projection.json与final-media-config-before-vision-effort.json保存状态。

受控Provider最初把任何历史tool消息当成本轮已执行，导致重启后第一次follow-up直接文字回复（无工具/视觉请求），属于fixture脚本问题，已保留日志；改成仅最后消息为tool才回复，随后的真实工具链成功，不把前一次文字成功当识图通过。第一次常量PNG无法解码亦属fixture输入问题，改为自行生成合法PNG后导入成功，不报产品Bug。最初公开create误传非契约protocol=openai-chat导致模型定义不在有效view，纠正为保存后的合法openai-completions并移除/重加自有模型后全部有效，属验收装配偏差，不报产品Bug。

影响观察范围：仅本批“启动时无可用vision→运行中配置vision→首次识图”路径重启前不可用、重启后可用；未声称所有运行中模型变更失效。主聊天模型在同进程配置后已真实请求fixture-main，与图像Host可用性形成差异。现行模型规范要求用途可选择、保存成功更新列表，未查到明确要求看图Host必须运行中即时生效的独立条款，因此保留生命周期观察/预期不确定性，交主审判断，不强签已确认产品Bug。源码tool-host-services.ts的createPorts解析并捕获resolveImageInspectionModel结果，是候选定位而非已确认根因。推荐如产品要求即时生效，在执行时解析最新vision模型/端口或可靠失效重建；回归用空profile配置、配置替换/清除以及重启对照，仅建议、不修产品。

### 恢复与清理

UI思考覆盖均恢复原目录/provider值，UI代理清空；公开用途恢复本批初始chat/vision null，utility/autoReview off未改；删除本批唯一专用FinalMediaLocal及5模型，final-clean-restored-view.json确认connections=[]和初始五用途。历史/合法artifact保留供复核。无共享prompt或用户数据修改，无产品/dist/coverage变更。

Electron main57964→76497→85664均正常app.close；自有driver57941/76496/85663残留readline后TERM；Provider61171/77654/85049迭代实例与proxy80131均退出，44347/44348无监听。final-media-cleanup.json保存ps/端口空结果。仍未覆盖仅原生图片选择、真实商业识图/生成及上述生命周期预期确认；本批所有可执行目标已给终态，不继续扩大组合。

## P2-D21 Todo / present 独立有限补批终态（2026-10-22）

验收点：真实Runtime todo_write→todo_read，Desktop Todo投影与状态/数量；present自有文件交付卡与打开；Journal/磁盘对账；正常重启历史恢复；仅当前UI已有安全插件入口的范围确认。分工具运行、UI/持久层对账、正常重启三组。新todo-profile空profile，只配置TodoLocal→127.0.0.1:44349合成Provider，不复制真实Key，不发商业请求。当前工具schema取自todo-tools/src/todo-tool.ts及filesystem-read/src/plugin.ts，未改产品。

| 子点 | 终态 | 实证 |
|---|---|---|
| Todo真实更新/读取 | 通过 | 受控Provider连续发真实工具调用todo_write→todo_read→present，Runtime实际执行，非IPC直接注入Todo投影。write三项pending/in_progress/completed，read返回相同3个持久UUID、revision1、completedCount1与activeForm Checking projection。todo-http.jsonl保留四次真实主请求及工具返回；todo-submission.json记录session9522bd42-ef16-4556-afaa-732d6508f248和公开task回执。 |
| Desktop Todo投影 | 通过 | 真实UI显示1 of 3 To-dos Completed，以及Acceptance queued/running/finished task，运行项activeForm Checking projection可见。todo-present-ui.png、todo-projection-before-restart.json。公开snapshot.todos与实际工具read三UUID/状态一致。 |
| present交付卡/文件预览 | 通过 | 唯一present目标是自有tmp/todo-workspace/delivery.md；工具completed返回Presented…，真实UI独立交付卡显示delivery.md与Owned acceptance deliverable。点卡片实际覆盖按钮“在侧边栏预览…”打开Markdown预览，看到Owned Todo Deliverable和P2-D21 loopback acceptance only.正文。todo-present-open-file.png、todo-open-file-ui.json。最初点击文本span被同卡片合法overlay button拦截，改用真实aria按钮后成功，不报产品Bug。 |
| 磁盘/Journal对账 | 通过 | 自有交付文件SHA256=1b4f3536d2fc2095828288f24e5a2ddc45311242d4ae1f9096480829b87ac2a1，present前后/重启后正文与哈希不变。todo-disk-journal-before.json保存工具与Todo相关真实Journal记录及原始文件文本；todo-disk-journal-after.json明确整个Journal哈希变化，未谎称不变。todo-restart-comparison.json进一步证明原seq0–47完整前缀哈希不变，只追加正常关闭session/end-seed seq48，Todo/工具投影精确相等。 |
| 正常重启恢复 | 通过 | main98059正常关闭→main4274，同一session真实侧栏打开后，Todo三状态/数量、activeForm、回复和delivery.md交付卡全部恢复。todo-present-restarted.png、todo-restarted-ui.json、todo-projection-after-restart.json。未为恢复重新执行工具，也未直接改Journal。 |
| 插件启停/恢复的当前UI范围 | 未覆盖通用插件启停；当前无该管理入口 | 真实扩展UI只有能力/Skills/MCP；点MCP显示“MCP暂未接入”，todo-extension-scope.png。ExtensionsPage.tsx与CapabilitiesSection.tsx对应当前能力Chrome/英语辅助及Skills管理，没有通用Runtime插件启停开关。既有Skills启停不冒称通用插件装配开关，本批不重复Skills扫描、不添加MCP/退役fs-watch、不触发外部能力连接。若主表将其保留为Runtime现有装配协议项，应由该协议专项证据覆盖，不用当前UI截图代签。 |

范围说明：尝试新建session直接使用未注册tmp工作区被公开接口正确拒绝workspaceRoot is not registered；随后用本profile默认已注册仓库workspace，仅present指向其下自有tmp文件，未执行任何仓库写工具/外部文件。所有新增文件均在专用tmp，Todo只写本profile Session Journal。通知/消息入口不是本次补批目标，未补做、不以本次Todo/present通过代签整条D21。

恢复清理：chat用途恢复初始null，删除唯一TodoLocal及模型，五用途回空profile初始值，历史留存。main98059/4274均正常app.close；独占readline driver98058/4271已TERM，Provider98014/99970已退出，44349无监听，todo-cleanup.json的ps/port为空。无商业请求，无产品/dist/coverage修改。本批有限可执行子点全部终态；未发现需新增编号的确定Bug。

## F1-07 图片用途全局用量只读对账终态（2026-10-22）

验收点先列：已有视觉HTTP/Runtime请求ID与Journal/公开统计逐项对账、真实全局统计页用量及unknown费用语义。按只读证据解析、真实统计页、清理一组连续路线执行。启动原自有final-media-profile main10302，不启动Provider、不发模型请求、不直接修改Journal；只读取现有历史与真实使用统计页，正常退出。OBS-001与本项保持独立。

| 子点 | 终态 | 事实与证据 |
|---|---|---|
| 主请求逐ID对账 | 通过（7个主请求） | final-media-usage-reconciliation.json逐条列7个requestId、stepId、headerSeq、HTTP时刻、Journal step/end usage与全局activityId；Journal 7ID集合与公开统计7ID精确相同，每项100入20出/120tok，共840。HTTP body未携Runtime requestId，因此HTTP→Journal映射明确采用同模型顺序+时间，不伪称服务端读取同一ID。原始final-media-usage-journal-events.json与final-media-http.jsonl保留。 |
| 全局视觉请求/用量复合对账 | 未通过对账，差额待主审判定设计/缺陷 | 原始Provider日志9次POST，其中fixture-main7、fixture-vision1、openai/o3 high1。受控Provider固定实现对每次POST返回usage100入20出，预期这9次服务调用共1080tok；这是Provider源码固定响应值，不声称日志已单独抓取原始响应wire。两次视觉实际工具success已证实，但Journal只有7个主request/header及step/end，没有视觉独立requestId；全局公开activity只7请求/840tok和3工具，真实UI亦只7请求/840tok（入700/出140），模型分布仅fixture-main。差额2请求/240tok，不能将“路由成功”代签“视觉全局统计完整”。final-media-usage-ui-api.json/png、final-media-usage-reconciliation.json。未为差额再次发请求。 |
| unknown费用语义 | 通过（现有7条记录） | UI总费用显示费用未知/7次请求缺少费用依据，每行费用未知；activity.summary.costUsd=null、costUnavailableCount7；costSummary已知金额sum0但knownCostRequestCount0/unknownCostRequestCount7，不能把该sum0解释为免费。Journal主usage.cost=null且costProvenance basis unknown/model-price-unavailable。旧statistics兼容汇总costUsd0不是UI免费承诺，两API语义原样保存。视觉o3本身在此前配置有provider价格，本次视觉行根本未进入全局，不能宣称其费用已正确计入。 |

逐ID主请求：69bcadad-2b7a-4b56-9c9a-2196a1358ee9、63e52ec8-d05e-48a2-a9c4-b95f8c25eab5、65b25ef1-1552-4468-8ad4-4d4acd5e88cd、5d446cf7-ee8b-4fc5-9998-b61453433488、ca3ed81f-de5a-44f8-9dc0-5a422dff44d8、9b0d624e-e332-4315-8fae-69f762efca88、c404fd0f-ba2c-42b3-b7e4-7c98b8be457c。视觉两项requestId=null是缺失事实，不伪造标识。推荐若设计要求统计覆盖Host内视觉LLM，则让该调度产出可追踪请求生命周期/usage，随后回归主/视觉逐ID各计一次；仅建议，未定位确认根因、未修产品，主审统一判定编号。

本补项只开启统计明细与全部时间范围（自有profile）；无原始Journal手工修改，正常关闭的生命周期追加不等同验收注入。main10302正常app.close，driver10279已TERM，final-media-usage-cleanup.json ps为空。Provider未启动，新增模型请求0。F1-07路由模型/档位/图片格式已通过，但全局视觉用量对账因明确差额不能整项签收；不扩大路线。

## F1-02 官方模板创建 / 错误恢复有限补批终态（2026-10-22）

先列点：官方模板实际UI选择/Key/连接；草稿取消返回无半成品；成功后空详情/自动选择弹窗且初始不勾不入库；合成401与网络失败无残留；恢复/models成功并显式添加1项。按创建取消、错误恢复两条路线执行。新official-profile空profile、固定dist、真实Electron/CDP。选官方OpenAI代表；其高级设置在连接前公开服务地址输入框可改回环，全部请求只到127.0.0.1:44350，不向api.openai.com发合成Key，不使用真实Key。无API代替UI创建步骤。

| 子点 | 终态 | 实际结果与证据 |
|---|---|---|
| 官方模板/草稿取消返回 | 通过 | 真实UI设置→模型→添加连接→OpenAI，填合成Key，展开高级设置改回环；点返回添加连接，公开list connections=[]，重新选OpenAI Key输入为空。official-template-draft.png（密码掩码）、official-template-draft-cancel.json。未点击连接就无保存对象/网络请求。 |
| 401错误/无半成品 | 通过 | UI连接前服务地址已为回环44350；受控/models返回401，UI显示API Key无效或认证方式不被接受（HTTP401），停留创建页，list仍空。official-template-401.png/json与official-template-http.jsonl。 |
| 网络失败/无半成品 | 通过 | 将同UI地址改为已核实无监听的127.0.0.1:44351，点连接，显示网络请求失败，请检查服务地址，list仍空；official-template-network-failure.png/json。只本机拒绝连接，不冒称DNS/代理全分支。 |
| 恢复/空详情/自动弹窗/初始不勾 | 通过 | 回环服务恢复success，UI地址改回44350点连接，真实创建openai-f392da38，模板official、协议OpenAI Responses；空详情显示还没有模型，同时自动弹选择窗口，GPT-4.1 aria-checked=false、还没选；公开连接models=[]。official-template-created-unselected.png/json。/models原始返回gpt-4.1及未知fixture-official-second，官方模板与目录交集只展示可识别1项，未要求未知项也出现。 |
| 取消选择/返回无自动入库 | 通过 | 取消弹窗，公开models仍[]；返回模型列表显示OpenAI/OpenAI Responses/0个模型。official-template-picker-cancel.json、official-template-empty-connection-list.png。这个空连接是用户已经明确连接成功保存的有效对象，不误称未提交半成品；取消仅取消模型添加。 |
| 成功显式添加一项 | 通过 | 重入同连接→获取可用模型→真实勾选GPT-4.1→点击添加1个，详情仅1个模型，公开view精确gpt-4.1（context64K/provider、目录价格2/8）；official-template-explicit-added.png/json。Provider日志只有GET/models，没有模型推理调用。 |

范围与方法：代表官方OpenAI模板的实际UI全路线已覆盖，不扩为所有官方协议/商业认证成功；没有读取余额型连接。静态入口依据ConnectionSetupPage.tsx：官方服务高级设置保留可编辑baseUrl；连接先probe，成功create空models并带probe转详情，实际UI与其相符。本批未用公开API创建或修改连接，仅list作对账。过程里自动化曾用错误按钮定位文本等待超时，以及两步删除确认跨工具调用超过3秒复原，按实际按钮名/同次调用纠正，属于验收操作问题，不报产品Bug。

恢复清理：真实UI两步删除唯一OpenAI专用连接及1模型，official-template-clean-view.json确认connections=[]、五用途回空profile初始值。main24896正常app.close，独占driver24873已TERM，Provider24834退出，44350无监听，official-template-cleanup.json ps/port为空。原始JSON/关键截图保留同evidence/official-template-*，无产品/dist/coverage修改、无商业请求。本有限批全部所列子点终态通过，无新Bug。


## P2-D07 文件卡与 P2-D17 既有生成图片有限补验（2026-10-22 13:38，终态）

验收点：①真实 Runtime 文件读/搜索/列举/写/编辑与磁盘、Journal 对账；②Desktop 变更摘要与交付卡点击预览；③实际契约允许的参数及大输出引用/回读；④既有 generate_image artifact 真实 UI 预览、不新增生成请求。操作分为自有工作区文件工具链、大输出受控任务、只读生成图片副本三组。固定 dist、独立 files-profile、仅回环 Provider 44352，Electron/CDP；公开 sessions/tasks IPC 装配任务不冒充自然语言手工提交，审批、卡片及预览为真实 UI 操作。

| 验收点 | 终态 | 结果与证据（同 evidence/） |
|---|---|---|
| P2-D07 Runtime read/grep/glob/list/write/edit | 通过 | session e474c3c9-c1a6-499e-9be5-52f2c875ce2b 真实完成 write_file→read_file→edit_file→read_file→grep→glob→list_directory→present。仅 files-workspace；change.md 最终 `# Acceptance File\n\nAFTER line\n`，工具参数/结果与磁盘逐项记录 files-disk-journal.json、files-http.jsonl、files-projection.json。 |
| Desktop 变更摘要 | 通过（代表） | 展开 Worked for，显示 Write change.md +3、Edit change.md +1 -1、Read/Grep/Glob/Listed/Presented；files-change-tools-ui.png。此处检查工具变更摘要，不声称所有文件类型或 Review 全矩阵。 |
| 交付卡与真实内容 | 通过 | 新独立 session ed19e0fb-8b4c-4c58-9d8a-7747477a97f5 实际 Runtime present 完成，Journal call files_0/result completed；回复下方 change.md/Changed owned fixture 卡，真实点击“在侧边栏预览 change.md”，Markdown 呈现 Acceptance File / AFTER line，与磁盘一致。files-delivery-card.png、files-delivery-preview.png、files-delivery-final.json及该 session Journal。 |
| path/file_path 别名 | 当前 schema 不支持，非未验失败 | filesystem-read/write/search plugin.ts 的 read_file/write_file/edit_file 均 canonical path，additionalProperties=false，无 file_path 别名；未虚构或发送不支持参数。当前合法 path 已由真实调用覆盖。 |
| 大输出阈值及引用回读 | 通过（UI 结果展开 + Runtime 定位回读） | shell node ports 契约 INLINE_OUTPUT_CHARS=8000、磁盘上限5MiB、回读上限64000。真实 bash `cat long-output.txt`，UI“一次运行”批准后 40534 字节写 text/plain artifact aea318c2-8193-40c7-a6dd-770124db7291，字节 SHA 与输入均 2e488b1f8fb45c193bb54a337ac7db231e954e657c45d3c718050fa2b637d1f7。真实点 Ran cat 的结果展开看到截断提示，随后实际 read_file artifact offset498 limit8，UI批准自有artifact访问，真实点 Read 结果看到 LONG_OUTPUT_END。files-long-projection.json、files-long-result.png、files-long-tail-ui.png/json。原生“Bash output actions”菜单由实际点击打开但 CDP 不提供原生菜单项，系统打开完整文件未覆盖；不把结果展开等同原生文件打开。 |
| P2-D17 既有 generate_image 图片预览 | 通过（只读副本） | 从先前验收隔离 desktop-long-linked-profile-20261022 仅复制 owner session 34f723b4-c237-468f-b727-c5a535308ed7 Journal 与 artifact 28ab84ef-3b20-43be-a2a0-9659a7a40562 的字节/metadata；没有复制设置/Key、没有新增推理或生成请求。公开元数据 owner plugin actspace.image-generation/name generate_image，534436 bytes。真实 UI 选历史会话，点 Open artifact，图片 complete=true、naturalWidth/Height=1024/1024。files-generated-preview.png/json。源3文件 SHA 前后完全一致，files-image-copy-provenance.json / files-image-source-final-hashes.json。此项只签已有图片加载预览，不代签原生系统打开或本批商业生成。 |

过程偏差：首工具链末尾 Python shell 表达式被分类器拒绝，fixture 错误假设已生成文本artifact导致 Provider退出；前8项工具已完成，后以安全 cat 任务完成大输出。失败任务后一次继续发送显示 provider_disconnected，无商业请求，随后新独立 present 任务成功；这些事实保留在 Journal/HTTP，不将受控服务退出登记为产品Bug。一次 setWorkspace 准备误传 workspaceId 被公开接口拒绝，改用真实契约 workspaceRoot 后成功，无产品修改。UI Worked for32s 含等待人工审批，不据此判定卡死。

恢复/清理：通过公开配置接口清除仅本批专用连接 custom-6ddb4c8c、chat恢复null，files-clean-view.json connections=[]且五用途回空profile初始值。main47800正常 app.close；driver47793 TERM、Provider57493 SIGINT，files-cleanup.json 确认 PID 无存活/44352 无监听。自有 fixture 与原始证据保留；源用户/原验收 profile 的3文件不变。无产品/dist/coverage变更，无新商业请求。本有限批所列可执行点均有终态；原生系统打开保留未覆盖，其他未穷举组合未当作新增门槛。


## 16-A3 附件草稿状态隔离有限补验（2026-10-22，终态）

验收点：A文字+PNG→B→A→设置→A，A文字/图片/预览保持，B不混入A附件。按准备合法附件、会话切换、设置往返三段同路线执行。原 V03 Chat/运行态证据不重复。全新 draft-profile、固定 dist、真实 Electron/CDP（main93078），无任何Provider/Key、无模型请求。公开 sessions.create 仅准备 A/B；文字输入、导航、预览均操作真实UI。PNG 使用自有2×2有效PNG，经 textarea.dispatchEvent(new ClipboardEvent('paste',{clipboardData:DataTransfer(File)})) 进入当前 Composer 的真实 pasteImages→dialogs.importComposerImage→附件状态链；事件 isTrusted=false/defaultPrevented=true，draft-paste-method.json。因此不冒充系统剪贴板或原生拖放。

| 子点 | 终态 | 实测与证据 |
|---|---|---|
| A文字与图片草稿建立 | 通过（合成paste链） | textarea填 DRAFT_A_ONLY_20261022，出现“预览附加图片 draft-owned-2px.png”按钮。draft-A-initial.png、draft-sessions.json、draft-paste-method.json。 |
| A→B不混入 | 通过 | B初始文字空、图片按钮0；另填独立DRAFT_B_ONLY_20261022，后续B保持该文字且图片0。draft-B-isolated.png、draft-stable-AB.json。 |
| B→A文字/图片/预览保持 | 通过 | 页面稳定后A仍DRAFT_A_ONLY_20261022、图片按钮1；真实点预览，img complete=true、naturalWidth/Height2×2。draft-A-return-preview.png、draft-stable-AB.json、draft-switch-AB.json imgs字段。 |
| A→设置→A保持 | 通过 | 真实打开设置通用页，没有编辑任何设置，真实“返回应用”；A文字原样、图片按钮1，再点预览2×2完整加载。draft-settings.png、draft-after-settings-preview.png、draft-after-settings.json。 |
| 原生拖入/系统粘贴 | 未覆盖 | 本批只补状态隔离范围；合成ClipboardEvent不能证明OS剪贴板、Finder拖入或原生文件选择行为。16-A3若按原“拖入”方法整行签收，应保留此方法子点，而不能再称附件草稿无法建立。 |
| P2-D06 附件/工具详情交替 | 本批未覆盖 | 新空profile无Runtime工具详情，未为可选项另加Provider/工具调用。既有files-long-tail-ui已单独验证工具结果展开，不能冒称本批附件与工具详情交替。 |

读取时序记录：首次B→A紧跟click的立即inputValue/count曾读到切换前B状态；后续预览按钮自动等待后正常。再次以等待页面稳定300ms重复A/B/A，各自文字/图片状态一致（draft-stable-AB.json），不将过渡态瞬时读取错误报产品Bug。draft-switch-AB.json的A即时字段不作最终判据，imgs和稳定JSON区分保留。

恢复清理：实际移除A专用附件并清空A/B草稿，设置仅查看未更改；draft-clean-state.json确认connections=[]、五用途初始值、当前草稿空/无附件。main93078正常app.close，driver93076已TERM，draft-cleanup.json ps为空；无Provider启动。只保留自有profile与证据，无商业请求、无产品/dist/coverage修改，无新Bug。


## F1-10 / P2-D16 / F1-01 有限增量（2026-10-22，终态）

验收点先列：F1-10真实键盘添加与成功空列表目录回退；P2-D16一个设置连续修改/非法值/重启恢复；F1-01 v1–v4 fixture完整Electron迁移备份和二次启动。分为模型创建添加、通用设置、四版迁移启动三组。固定dist，独立increment-profile与electron-migration-v1..v4；只有回环44353合成Key，无商业调用、无产品修改。

| 子点 | 终态 | 证据与结果 |
|---|---|---|
| F1-10成功空列表catalog fallback | 通过 | 真实UI添加官方OpenAI，连接前高级服务地址改127.0.0.1:44353/v1；Provider成功返回data=[]。弹窗明确“OpenAI没有返回模型列表，下面是模型目录里它的48个模型”。increment-catalog-fallback.png、increment-http.jsonl。符合model-connections-service.ts成功但空列表及catalogProvider契约；HTTP错误不会fallback，不再沿用旧假设。 |
| F1-10真实键盘提交代表 | 通过 | 聚焦真实GPT-4.1 checkbox后键盘Space勾选、聚焦添加1个按钮后Enter提交；公开list确认唯一gpt-4.1、来源catalog、context1047576、价格2/8。increment-keyboard-added.json。焦点由自动化focus定位，键盘完成勾选/提交；不冒称整个创建路径全键盘。 |
| P2-D16连续修改/非法/重启 | 通过（代表） | 通用默认温度原空，真实UI连续0.3 Enter失焦→0.7 Enter失焦；非法3显示“温度需在0–2之间”，随后恢复0.7并正常退出。新main27303重启读回0.7。increment-settings-change.json、increment-invalid-temperature.png、increment-restart.json。最终恢复空值，删除专用连接；不是全设置穷举。 |
| F1-01 v1–v4完整应用迁移 | 通过（无凭据fixture范围） | 直接复制仓库test/fixtures/settings/v1..v4.json到独立目录，未改原fixture；完整Electron各启动两次，实际设置模型页截图和公开list。四版均迁为layersVersion2，二次settings字节hash不变；对应原版backup.json逐字节一致，v2/v3 backup.sha256均核对正确。increment-migration.json、increment-migration-summary.json、increment-migration-v1..v4-0/1.png。 |
| 旧用途/附加Key/计费迁移 | 通过已有fixture内容；OS旧凭据未覆盖 | v1默认Kimi及explore旧Pro→Flash；v2默认Kimi；v3默认Flash/utilityKimi；v4默认Flash/utilityKimi/exploreKimiCode，各公开view与持久bindings可对账。迁移后credentialId/billingMode旧字段均无残留。仅当前fixture实际含字段的迁移代表，不将缺失字段当作曾存在又删除的证据；此前SettingsStore计费层fixture结果可复用，未新增OS safeStorage加密旧凭据样本，因此该真实OS凭据分支仍未覆盖。 |

迁移PID依次v1 29103/29294，v2 29461/29623，v3 29786/29948，v4 30108/30270。每次app.close正常退出，未打开复制商业连接详情或触发模型任务。迁移只读模型列表页不产生余额请求。源fixture无密钥，本批不装配外网凭据。

清理：设置温度恢复原null，专用openai-9c748adb连接删除；主实例16827/27303正常退出，driver16820/27298终止，Provider16784退出；increment-cleanup.json所有相关PID与44353监听为空。四版迁移进程均已关闭，副本/JSON/截图保留。本有限批不扩展其他功能、不改coverage；无新确定Bug。P2-D06可选附件/工具交替本批无现成同profile样本，未为其额外请求Provider。


## 09-P5-2 / P2-D06 最后有限UI批（终态）

验收点：注册工作区Agent新建页完整placeholder逐字对照；已有worktree状态键盘来源提示；自有PNG附件预览与已有工具详情交替两次。按新建页及同会话附件/工具历史两组执行。复用无连接files-profile，固定dist/main38500，无Provider/新模型请求。

| 子点 | 终态 | 结果/证据 |
|---|---|---|
| 09-P5-2 Agent新建页placeholder | 通过 | 已注册Acceptance Files工作区真实新建页textarea完整为“描述你要做的事，@ 引用文件，/ 调用命令”，与front-聊天输入框规范.md 218行逐字相同。last-placeholder.json/png。 |
| worktree状态键盘来源提示 | 未覆盖 | 当前自有files-profile没有worktree会话；其他agent既有worktree profile不在本批实例，未复制或启动他人profile，未重跑创建。保留精确缺口，不将普通本机标签代签worktree来源提示。 |
| P2-D06 图片/工具内容切换代表 | 通过 | session7e08967a-86ad-4ec9-a0bc-a34d05e94d22真实既有read_file历史；自有2×2PNG以合成ClipboardEvent经实际paste链附加，草稿P2-D06_OWN_ATTACHMENT_DRAFT。真实附件预览→Esc→Read结果→附件预览→Esc→Read结果，两次图像均complete2×2；工具均为同会话aea318c2…artifact的498–505，展开见LONG_OUTPUT_END，无内容归属错位。第二次点击工具按钮先收起原已展开内容，再点一次恢复展开，属于切换按钮语义，不报错位。last-detail-alternation.json、last-detail-image-0/1.png、last-detail-tool-0/1.png、last-detail-tool-second-open.png/json。 |

方法边界：合成paste不代签原生系统粘贴/拖放；工具使用既有真实Runtime历史，无新请求。移除附件前按钮需hover显现，初次直接点击被图片按钮遮挡，hover后真实移除成功；不作为产品Bug。最后图片数0、文字空；未改settings。main38500正常app.close、driver38484终止，last-cleanup.json ps为空，Provider未启动。无产品/dist/coverage修改；本有限路线停止，不扩展。


## worktree 键盘来源提示定向复验（终态）

经主审授权复用已结束任务的desktop-git-20261022/desktop-data，无请求/Provider。真实打开c5e4acce-434e-49cb-8a19-128122437320（actspace/63390151）历史。工作树DOM为SPAN，title“原工作区：committed · 基于 feature-fixture”，tabIndex=-1，无tabIndex属性。点击输入框后实际Tab32次记录activeElement，前三个依次+、模型、发送，随后直接权限/轮统计/累计/context，跳过分支与工作树标签，无法以键盘焦点显示来源。last-worktree-keyboard.json/png、last-worktree-reverse-tab.json、last-worktree-hover.png。反向Shift+Tab因Composer键盘处理停留输入框，不用此路线单独推断。

结果：09-P4-4/09-P5来源提示的键盘focus子点失败候选，明确违反现规范front-workspace-git-worktree-context.md:281“工作树hover/focus显示原Workspace和base branch”；ComposerStatusRow.tsx:134仅title span可解释实际不可达。建议由主审编号：使事实标签保持只读但可Tab聚焦，并用共享tooltip提供同样来源信息，回归键盘Tab/hover和焦点顺序。本批不修。main45907正常关闭、driver45901终止，last-worktree-cleanup.json无进程。


## 2026-10-23 看图配置生命周期修复关闭

OBS-001 已确认为 BUG-038，Desktop 端口改为调用时解析当前看图配置，修前3红/修后3绿及关联4文件16项、类型/构建通过。真实原生同会话原图 V1–V5（首次、替换、移除视觉模型后拒绝、添加恢复、正常重启）均通过，HTTP 与 Journal 对账；初始配置/图片为公开 IPC 前置，不冒称原生完整首次建连。详见 [BUG-038](bugs/BUG-038.md) 和本地 `tmp/codex-acceptance/20261022-acceptance-bugfix/bug038-native/report.md`。用途计费等其余原列缺口继续保留。
