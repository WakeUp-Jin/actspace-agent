# Electron 自动交互验收 2026-10-22（进行中）

方法：bundled Playwright `_electron` 控制真实 Electron/preload/IPC；不是原生AX Computer Use，不代签VoiceOver、IME、系统对话框。驱动仅写tmp验收目录，产品代码未改。原用户devPID61739未操作。驱动PID88354，Electron88356，renderer88405；固定`apps/desktop/dist/index.html`，清除VITE_DEV_SERVER_URL/ELECTRON_RUN_AS_NODE，独立`desktop-long-profile-20261022`。此profile合成长历史工具ID不匹配，不据此评价产品工具关联。

验收点：F1连接详情/模型字段/持久化与恢复、真实目录/手动添加反馈、移除撤销；F2 Context/统计/本轮用量开关；T1/T2真实长输出与切换滚动/停止/指标；后续linkedprofile的T3历史/Context/Usage。路线：设置模型→新建纯Chat三轮真实公共知识长文→流式中Context/切换/滚动→完成闲置采样→后续历史。

证据目录：`tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/`。

| 点 | 结果 | 实测子步骤与边界 |
|---|---|---|
| F1-04内置名称/失焦/持久化 | 通过 | DeepSeek名称disabled；上下文1M→512K失焦显示已保存，reload后返回应用，重入模型详情仍512K，恢复1M。Key全程password未读取未输出。model-context-saved.png。连接删除/新Key保存未执行。 |
| F1-05模型卡 | 通过 | 展开deepseek-flash显示上下文/思考/输入输出价；显示更多出现名称、最大输出、缓存价、档位和输入类型；上下文变更与恢复实测。四层来源全组合未覆盖。 |
| F1-09官方余额 | 通过 | 真实DeepSeek余额自动加载有值，无密钥输出；仅余额读取，不代表其他供应商或所有错误分支。 |
| F1-10真实官方获取子项 | 通过 | 从DeepSeek获取可用模型，真实列表仅DeepSeek-V4-Pro，初始“还没选”；搜索随机词空态、清空恢复、全选1和添加1计数正确；Esc取消，未添加。real-provider-picker.png。其他供应商真实获取未覆盖。 |
| F1-11手动反馈子项 | 通过 | 重复deepseek-flash“这个模型已经在列表里了”且添加禁用；日期claude-haiku-4-5-20251001识别Haiku4.5、预填200K；unknown明确没认出来、可不填添加；Esc关闭。manual-date-recognition.png。未提交未知模型，不覆盖Enter实际持久化。 |
| F1-12移除撤销 | 通过 | 移除唯一deepseek-flash显示默认用途需重新选择，8秒内撤销恢复；之后新Chat仍使用deepseek-flash。超时/退出/连续移除未覆盖。 |
| F2-01圆环 | 通过 | 真实流式中重复点同按钮关闭、输入框点击关闭、Esc关闭、侧栏点击关闭；切去合成历史再回真实流式会话可操作，未串线。Context快照573/1M对应当次请求输入，不把生成正文累计当实时输入容量。context-stream.png。完整内部操作/焦点恢复未覆盖。 |
| F2-02会话统计 | 通过 | 第2轮显示2轮2步、模型用时1分33秒/TTFT0.6秒/TPS170；打开前Context关闭；Esc可关闭。 |
| F2视觉 | 通过 | 480×900浅色和深色Context截图，标题左33px可见；context-light-480.png、context-dark-480.png。仅Context代表，其他浮层未代签。主题测试原值跟随系统，后续需恢复。 |
| F2本轮用量浮层 | 未覆盖 | 流式第2轮尝试点第1轮用量被后续消息/粘性提示遮挡，未强制点击；需完成后正常滚动定向复验，不能凭DOM存在算通过。 |

## 真实Provider T1/T2初步结果

会话`afdee290-31bc-4a89-9250-a62517dcee32`，隔离纯Chat，无工具调用，不发送仓库内容；DeepSeek真实请求。三轮公共知识长文均finishReason=stop（正常完成），不是用户停止。Journal精确数值见real-three-rounds-summary.json：正文总字符10709/10498/9472，汉字6287/6067/5130，故达到8k–12k字符但未达到8k汉字。第1轮可见DOM9465字符，3表格、4pre、31列表（正文含要求外额外表/代码）；UI虚拟化可能仅挂载当前轮，不能用body总长当全部历史。

- 第1轮流式中切换到合成历史再回真实会话，返回时仍运行且正文继续；未见正文串线。
- 第2轮真实鼠标滚轮向上、截图round2-scroll.png；流式仍有停止按钮，无强制DOM滚动。
- 第3轮流式中480px切换设置深色并返回，完成正文及累计49.1K tok显示；未把设置页短暂CPU“—”当故障。
- 三轮结束截图three-rounds-complete.png；round1-complete.png及visible文本辅助。未做截图逐帧性能测量，不能据此断言无掉帧。

| 相位 | main CPU% /工作集KiB | renderer CPU% /工作集KiB | renderer heap MiB（未强制GC） |
|---|---|---|---|
| 第1轮流式 00:25:43Z | 0.96 /206640 | 2.71 /281552 | 81.1 |
| 第1轮结束后 00:26:41Z | 0.10 /147376 | 0.38 /171968 | 23.0 |
| 第2轮流式滚动 00:27:40Z | 0.99 /219888 | 3.52 /309344 | 60.4 |
| 三轮结束后首次 00:29:27Z | 0.16 /120720 | 0.13 /145888 | 29.8 |
| 上述首次+30秒 | 0.05 /113776 | 0.03 /118960 | 30.2 |

指标来自Electron app.getAppMetrics与CDP Performance，非峰值/非全程采样，CPU为采样区间值；首次闲置样本距实际第三轮结束约51秒，不冒称精确结束0秒。120秒样本待补。停止/停止后重开、T3及完整94点历史仍继续，不能称全部验收完成。

## 完成补测与边界（2026-10-22）

| 子步骤 | 结果 | 实测与证据 |
|---|---|---|
| F1获取弹窗Esc焦点 | 失败 | 两次正常Esc均关闭弹窗，但activeElement为BODY而非获取按钮；picker-esc-focus.json。建议核对对话框卸载/restoreFocus与触发器ref；交主智能体统一登记，不修复。 |
| F2本轮用量最终回复 | 通过 | 完成后正常点第5轮36.9K tok按钮，显示36914 tok、deepseek/flash、79.2%缓存及估算费用；Esc、点击输入框关闭。turn-usage-popup.png。此前流式遮挡尝试不作为缺陷。 |
| F2完整Context及内部操作 | 通过 | 完整面板显示5轮5步、86K累计、当前估算/实际分开；点击当前用户条目进入主轨迹与详情，原始内容显示实际第5轮提示。context-raw-current-input.png。纯Chat无路径记录，不代签路径分页。 |
| F2主题恢复 | 通过 | 浅深480px完成后恢复原值跟随系统，1280×900；旧独立实例正常关闭。 |
| T1补充中文规模 | 通过 | 第5轮正常完成10315总字符/8724汉字，达到至少8500汉字补充目标；real-five-rounds-summary.json、real-long-8724-hanzi.png。前三轮规模不足汉字目标仍保留原数值。 |
| T2用户停止及恢复 | 通过 | 第4轮finish=aborted，10619总字符/6133汉字；UI显示Stopped。刷新后部分结尾一致；新提示进入暂停队列，点击继续发送后第5轮完成。user-stopped.png。 |
| T2闲置120秒 | 通过 | 首次闲置样本+120秒（距第3轮实际完成约171秒）main0.066%/109680KiB，renderer0.090%/114016KiB，heap30.11MiB未GC。metrics.jsonl。样本不证明峰值或长期无泄漏。 |

## T3：关联正确的100轮／1000工具历史

正常关闭旧实例后启动独立desktop-long-linked-profile-20261022，sessionId acceptance-long-history-100x10-linked；Electron38555、renderer38774。固定生产dist，同一profile未并发启动。Journal为合成历史，声明/调用/结果ID匹配，不冒称真实Provider。首次自动进会话没有计时；新会话再返回缓存会话105.10ms，近期轨迹打开130.12ms。早期快照IPC17ms仅补充，不代替UI耗时。

| 子步骤 | 结果 | 实测与证据 |
|---|---|---|
| 近期与早期分页 | 通过 | 初始近期89–100轮可见；轨迹加载更早依次61/41/21/1轮，四次观测460.83/409.19/414.40/431.19ms均含人为300ms等待，不冒称纯渲染延迟。各次虚拟表37–38挂载行；t3-pagination.json、t3-recent-history.png、t3-earliest-history.png。 |
| 早期工具关联详情 | 通过 | 点第1轮第1条read_file，参数fixture-1-1.txt、结果File output 1-1；结果与Schema标签可切，关闭详情正常。t3-tool-result.png、t3-tool-schema.png。未逐条核验1000工具。 |
| Context规模与边界 | 通过 | 完整Context显示100轮100步/累计1K Token、最近请求估算46、实际0，工具Schema可读；t3-context-100.png。种子无来源明细/路径记录，原文与路径分页未覆盖；4秒等待使用了错误标题定位，不计性能。 |
| Usage历史计数 | 通过 | 异步加载后100请求、1000 Token、1100请求/工具日志，100次未知费用未丢请求；acceptance-model聚合100/1000，read_file工具聚合可进入。首个51.64ms读到占位，不能记为完成查询耗时。 |
| Usage搜索/分页/刷新 | 通过 | 搜索随机词显示没有符合筛选条件的记录；清空恢复，下一页11–20/1100；reload后重新进入仍100请求/1000 Token/1100日志，未重复累计。t3-usage-page2.png、t3-usage-reload.png。其余日期/状态组合未覆盖。 |
| 资源样本 | 通过 | T3查询后main38555 CPU0.13%/88896KiB，renderer38774 CPU0.05%/81376KiB；heap13937624字节（13.29MiB，未GC）；t3-metrics.json。非峰值，不用小样本断言无增长。 |

一次PTY长行被终端输入长度限制截断，外连同实例CDP核对后恢复原driver输入（Ctrl-U），没有重启或重复profile；这是验收工具输入边界，不记产品故障。

## 主UI旧编号增量（真实Electron，2026-10-22）

此组验收点：设置逐页与安全状态、会话管理/搜索、Composer斜杠菜单和多行/草稿、历史统计；操作路线设置→父对话→侧栏→统计。文件/Review/终端另由工作台验收者承担。证据仍为electron-cdp-20261022目录。

| 原编号 | 状态 | 已完成子步骤与仍未覆盖 |
|---|---|---|
| R07 | 未覆盖 | 真Composer输入/显示功能及Skills加载；随机过滤无结果；/plan+↓+Enter清空命令并焦点回消息框；/agent恢复，Esc关闭。R07-slash-no-match.png。Skill具体选择/多选/鼠标/完整键盘环尚未覆盖。 |
| R09 | 未覆盖 | 真侧栏右键置顶→取消、重命名Acceptance UI Rename→Enter→恢复原名，均通过。当前活动会话归档禁用且说明“当前会话无法归档”，符合SessionRow.tsx规则，不报Bug。非活动100轮历史归档→设置归档页仅该历史→恢复→侧栏重新出现，R09-archived-history.png。复制/分叉未覆盖，不用菜单存在签收。 |
| R13 | 通过 | 真更新页正常进入，有本地源码/安装目标/非packaged说明及隔离日志路径，无bridge缺方法报错；R13-update.png。没有触发构建更新。 |
| R25 | 未覆盖 | Agent指令显示用户共享路径Library/Application Support/actspace/prompts/main-agent.md，profile复制未隔离该绝对路径；避免写用户原文件，本轮只读，不签收修改/恢复。 |
| V03 | 未覆盖 | 消息“验收草稿甲”Shift+Enter+中文乙变两行，无发送/运行；切100轮会话输入另一草稿，再回父会话原两行保持，通过。未用DOM输入冒充中文IME，chip/200px/附件等剩余。 |
| V04 | 未覆盖 | 真实480 Context浅深、480子轨迹下半详情浅深均通过，主题恢复跟随系统；System随OS切换/其余位置/原生焦点未全测。 |
| P2-D03 | 未覆盖 | 新建隔离会话、真实自动命名、置顶取消/重命名恢复/归档恢复、多会话草稿通过；拖拽/分组/未读与审批态组合剩余。 |
| P2-D04 | 未覆盖 | 多行Shift+Enter不发送、斜杠过滤/Plan-Agent切换/Esc通过；中文IME/系统粘贴未用DOM代签，附件与批注剩余。 |
| P2-D16 | 未覆盖 | 真通用、外观、模型、搜索与网页读取、工具、子Agent、统计、归档、更新逐页进入；Host由另一验收者执行。settings-各页.txt与R13-update.png。模型失焦保存和主题恢复见前文；非法值/取消/每个开关的行为影响未全测。 |
| P2-D18 | 未覆盖 | 通用显示MiniMax已配置、快捷唤起已生效；没有调用朗读或系统级快捷键，不能用显示状态签收。 |
| P2-D21 | 未覆盖 | 真会话注入技能目录，slash可加载本地Skills；实际catalog按需读取/缺文件/Todo/present/启停恢复未全测。 |
| F4-01 | 未覆盖 | 普通侧栏只父+合成历史，不出现两个真实delegation子会话；搜索README返回父，子专属“只读教学写作任务”无结果；归档列表只手动归档的历史，无子会话。快速唤起/索引重建/分页剩余。混合连续子串“读取README”无结果，而README可找到；源码检索确认FTS5 MATCH/toFtsQuery检索语义，不直接当字符串includes缺陷。 |
| F6-01/03 | 未覆盖 | 旧100合成请求/1000Token未知价保留；真实两次委派后111请求、103861Token、1124日志、已知费用$0.03另100未知，缓存61184；f6-after-real-delegations.png。日/周/全部切换可操作，先占位后异步数据，没把占位当查询完成。Journal聚合见f6-journal-aggregate.json；完整筛选/重建升级剩余。 |

服务前提只读确认：搜索DeepSeek/智谱/Tavily已连接，TinyFish/Exa未连接；图片生成gpt-image-2中转已配置；MiniMax语音已配置；Key未读取/输出。真实服务调用与仅配置状态分开，状态不代替服务成功。

### 实际服务与原编号子点结果（2026-10-22 09:35）

| 原编号/子点 | 结果 | 方法与证据 |
|---|---|---|
| 17-A4 联网搜索 | 通过 | 真实Electron发送最小服务任务，web_search只调用一次，W3C HTML standard返回5个来源结果，含Tavily、官方https://www.w3.org/html及WHATWG；耗时2.19秒。D17-search-success.png、D17-search-detail.txt。 |
| 17-A4 图片生成 | 通过（工具服务） | 同任务generate_image一次，返回Generated1/1 image与artifactId28ab84ef-3b20-43be-a2a0-9659a7a40562，模型报告1024×1024；无未配置Key错误。D17-generate-success.png/detail.txt。未仅凭模型描述签收图片内容，实际预览待验。 |
| 13-A3 开启/目标/双语 | 通过 | 扩展→英语辅助学习原关闭，打开后目标W3C搜索与蓝色圆形图标生成，状态双语已开启。发英文短句，实际回复英文+中文对应句；speech-state-samples.json包含目标/开启状态，无Key。 |
| 13-A3 实际听到朗读 | 未覆盖 | 本工具无系统音频监听/回传能力；采样时已idle、queued0、error=null，未捕获playing，不能用idle或双语回复冒充听到朗读。继续检查可得运行证据并恢复开关。 |
| R09 置顶取消 | 通过 | 真实侧栏右键置顶后菜单变取消置顶，再取消；原会话保持。 |
| R09 重命名恢复 | 通过 | 侧栏重命名输入Acceptance UI Rename并Enter，标题更改；再次改回原名称并Enter。 |
| R09 归档恢复 | 通过 | 非当前100轮历史归档→归档页显示100次运行/正确工作区→恢复→原侧栏再次出现；当前会话归档按设计禁用，未强制点击。R09-archived-history.png。 |
| R07 斜杠过滤/命令选择/Esc | 通过 | 随机过滤无结果；/plan+↓+Enter、/agent+Enter正确清空命令并回消息框；再次/后Esc关且焦点消息框。仅命令代表，不代签所有Skills选择。 |
| V03/P2-D04 Shift+Enter | 通过 | 两行中文草稿值精确为甲\n乙，未触发发送；并非IME合成测试。 |
| P2-D03 多会话草稿 | 通过 | 父会话两行草稿→历史会话另写独立草稿→回父原两行保持，无串入；父草稿已清空，历史独立草稿尚待清理。 |
| F6 Journal对账 | 通过 | 全profile逐assistant/message聚合111请求，input23029/output19648/cache61184、总103861，工具1013，故Usage日志111+1013=1124；未知成本100、已知合计$0.029653404，与UI111/103861/1124/$0.03/另100未知一致。f6-journal-aggregate.json。 |
| F8 E9 | 通过 | 正常退出38555后新进程31342恢复同父与子轨迹，详见原handoff E9补测。 |

剩余主UI优先：Composer+分组/Skill真实选择/模式chip与键盘；复制/分叉/归档全部；回复批注/Mermaid；图像预览与看图、语音运行反馈和恢复；F4快速唤起与重建；V01分页后新增。审批/队列专项已交另一验收者，不重复执行。原生IME/VoiceOver/系统音频不能用DOM代签。

### 主UI增量原编号（2026-10-22 09:59）

方法：当前固定dist真实Electron、隔离linked profile、Playwright/CDP；不代表原生AX。

| 原编号/子点 | 结果 | 实际操作与证据 |
|---|---|---|
| V01 分页后新增 | 通过（交互子点） | 100轮历史先向上滚动出现早期第80轮等内容，再真实发送“这是历史分页追加验收，请仅回复 V01_OK，不调用工具。”；最终V01_OK、101轮101步，近期第90–100轮及新增消息可见；再向上出现64–84连续历史。V01-earlier-page-before-new.png、V01-new-complete.png。未以可见窗口替代全Journal逐ID去重对账。原历史独立草稿发送前已清空。 |
| 16-A1 Shift+F10/重命名/Esc回焦 | 通过 | 聚焦100轮侧栏行→Shift+F10打开菜单→方向键进入重命名→输入框获焦→Esc取消且焦点回同会话BUTTON。16-A1-focus.json。 |
| 09P1-1 多行删到一字再空 | 通过 | 新会话输入12行，textarea高200px；全选键入“字”变54px；Backspace清空仍54px，未留下200px空白。composer-firstsend-focus.json及现场尺寸采样。 |
| 16-A4 新会话首次发送焦点 | 通过（键盘路径） | 新建后填写短请求并Enter，100ms和真实完成KEYBOARD_FOCUS_OK后焦点均TEXTAREA/消息输入框；16-A4-enter-focus.json。鼠标点击发送路径焦点跟随发送/停止按钮，与键盘路径分开记录；未据此报缺陷。DOM节点身份未额外采样，不签收节点未重建。 |

当前后续：Composer其余点、十余会话发送/归档及GC资源、Thinking真实参数、隔离工具设置重启、F1新增连接/Key取消保存/受控HTTP与移除回退。原生IME/VoiceOver/音频观察仍为工具能力限制，不重复无效尝试。覆盖总索引由主智能体同步，本代理不改coverage/bugs索引。

09-P1-1布局补核：高度不是布局判据。真实再次12行→Meta+A输入x→Backspace，`.composer-body[data-layout]`依次stacked→stacked→inline，故一字时仍保持多行，清空才回胶囊；09-P1-1-layout-recheck.json。16-A1本轮ShiftF10/Esc回焦通过，Enter改名/恢复见前述R09；菜单首项初始焦点和所有嵌套层误关边界未逐一签收。

### F1自定义连接真实HTTP增量（2026-10-22 10:13）

| 子点 | 结果 | 操作与证据 |
|---|---|---|
| 自定义连接新增 | 通过 | 模型→添加连接→自定义中转→OpenAI Chat，回环HTTP受控Provider44321/v1、合成fixture凭据，经UI连接真实请求/models，返回fixture-main/fixture-alternate两项。没有输出真实密钥。 |
| 获取选择并添加 | 通过 | 勾fixture-main后按钮从添加所选变“添加1个”，点击后连接实际有1模型，Composer选项新增fixture-main。异步保存完成后核实，不凭点击即时截图签收。 |
| 实际HTTP发送 | 通过（受控Provider） | 新fixture工作区会话选fixture-main发Only reply CUSTOM_HTTP_OK.，真实Runtime/HTTP返回Fixture completed: fixture-main.，120tok、1轮1步；F1-custom-real-http-reply.png。LLM内容受控，不冒称真实外部Provider。 |
| Key取消/替换/检测及正常重启 | 未覆盖（后续执行） | 当前已保存合成凭据；密码输入未读值。尚未用本增量代签取消和重启。 |

受控连接属于当前独立linked profile，接下来按原值恢复/删除；不修改用户原dev profile。

F1继续：合成Key编辑→取消后草稿清空；重新输入fixture合成Key→保存，异步完成后草稿清空，重新获取实际成功且状态已连接（不读取原Key）。手动添加fixture-alternate，识别稳定后Enter提交，模型数1→2；刚填后立即Enter时尚未稳定未提交，等待后Enter成功，未把首次早按当通过。将仅本新增连接地址改未监听44320/v1并失焦保存→获取：状态连接失败、明确网络失败文案、自动展开手动添加，原2模型仍在；F1-fetch-failure-fallback.png。随后取消手动区并恢复44321/v1原值。此为自定义获取失败回退，不代签官方端点失败（未拦截真实官方请求）。

### 设置Esc原子点（2026-10-22 10:40）

| 原编号/子点 | 结果 | 实际证据 |
|---|---|---|
| 16-A6b Select只关自身 | 通过（协议Select代表） | 自定义连接展开fixture-main编辑/显示更多，默认思考因无档位禁用，未强点；改用同表单协议Select，打开→Esc后data-state=closed，模型编辑和设置均仍在。16-A6b-select-escape.png。推理支持专门Select未启用，不泛化签收。 |
| 16-A6 第一次Esc | 通过 | 当前设置获取可用模型对话框打开→Esc，dialog=0而设置仍1。 |
| 16-A6 第二次Esc及焦点 | 失败 | 连续第二次Esc后设置仍在（再次读取一致），焦点BODY；未按验收点退出设置/回正确焦点。16-A6-escape.json。事实交主智能体登记，不修改产品。与此前获取框Esc后BODY观察一致，但这里独立记录第二次退出未发生。 |

### Composer与真实Mermaid增量（2026-10-22，本轮续验）

方法仍为固定dist真实Electron CDP。验收点和操作分组分开：先当前会话+菜单/Skills/切会话/多行组合，后独立真实DeepSeek Mermaid回复。未触碰产品代码。

| 原编号/原子点 | 结果 | 操作、实际值与证据 |
|---|---|---|
| V02 Skills搜索空结果 | 通过 | 搜索zzzz-no-skill显示“没有匹配的 Skills。”；恢复read后有匹配。 |
| V02 Skills键盘选择/多选 | 通过 | 搜索read，↓+Enter选learn，菜单保留；鼠标追加read，两项pill同时存在。随后逐项×移除，草稿恢复。V02-skill-multiselect.json/png。仅Enter代表，Tab、循环跳禁用未代签。 |
| V02 Skills两级Esc/回焦 | 通过 | 子级第一次Esc回根搜索；第二次Esc后250ms消息框TEXTAREA获焦、菜单关闭。即时BODY是未稳定中间态，未作为缺陷。 |
| V02 点外关闭不抢消息框焦点 | 通过（空白区代表） | 点会话主区空白后菜单0，active BODY，未强抢到消息框；不代表点击其他输入框全部情况。 |
| 16-A6c 侧栏切换关闭+ | 通过 | CUSTOM_HTTP_OK开+后点不同FOCUS_OK，根搜索0、会话确变。 |
| 16-A6c 侧栏切换关闭Context | 通过 | FOCUS_OK开Context后点CUSTOM_HTTP_OK，系统提示词等Context内容0。 |
| 16-A6c Cmd+N | 未覆盖 | Playwright Meta+n在+搜索聚焦时未新建，当前会话与菜单仍在；未把此CDP快捷键当原生全局快捷键结论，侧栏路径独立通过。V02-V03-16A6c-extra.json。 |
| V03 200px内部滚动 | 通过 | 16行输入textarea clientHeight200、scrollHeight354、overflowY auto、composer-body stacked；清空恢复。V02-V03-16A6c-extra.json。 |
| R23 真实Mermaid生成/放大 | 通过 | 真实DeepSeek无工具回复有效flowchart，页面实际渲染开始→检查→完成；放大出现Mermaid图表预览dialog。R23-mermaid-fullscreen.png。 |
| R23 Esc关闭 | 失败 | 预览打开后Escape，250/300ms及跨调用后dialog仍1，焦点关闭预览；再次打开有限复核同结果。R23-escape.json。不是模型内容或原生AX推断。 |
| R23 点击关闭/回焦 | 通过 | 点击关闭预览后dialog0，焦点回“放大查看”按钮。Esc路径失败不遮掉点击关闭通过。 |

V02/V03仍按复合项未覆盖：↑↓循环/跳禁用、Tab、←/Backspace、所有浮层互斥、附件/引用与模式placeholder组合尚未全部执行；不把代表点合并成整项通过。R17转普通文字回复执行。

R17有限检查：真实回复文本可选中并出现“添加到对话”瞬时浮层，但在连续鼠标选择后的第二次定位浮层已随选区变化消失，未能稳定进入批注编辑卡片；因此R17保持未覆盖，不把短暂浮层当通过。未报告为产品缺陷，证据仅为现场观察。

R23复核结论：同一Mermaid预览再次打开后Escape，等待300ms仍dialog=1且焦点“关闭预览”；点击明确“关闭预览”后dialog=0且焦点回“放大查看”。证据R23-escape.json、R23-mermaid-fullscreen.png；已交BUG-019。

剩余边界：V02的Tab/左右/Backspace/跳禁用与全模式互斥、V03附件与引用chip/窄窗全组合、R17稳定批注卡片仍未覆盖；原生IME/VoiceOver/系统音频仍受工具能力限制。暂不把运行时/DOM观察代签这些项目。

### 三个有限批次实执行（2026-10-22 11:04–11:15）

验收点：14-A5十二次完整生命周期及分阶段资源；17-A2模型/工具、13-A5工具/外观/快捷键正常退出重启保留与恢复；17-A3自定义连接重启后实际HTTP；V01只读分页ID对账。分组为生命周期→设置写入/正常退出/同profile重启→只读分页，未重复V01发送。

| 原子点 | 结果 | 实际操作和证据 |
|---|---|---|
| 14-A5 十二次新建发送归档 | 通过 | fixture-workspace连续12会话，UI新建→选fixture-main→发Acceptance lifecycle N→实际HTTP回复Fixture completed: fixture-main.→切回CUSTOM_HTTP_OK→悬停新行归档→行消失。第1次脚本定位归档按钮未hover而超时，观察后hover归档成功；第2–12连续成功。首ID58eb5480-85a4-43cc-a91e-7adbe9eae2e1；其余11ID见14-A5-lifecycle.json，全部archived=true；14-A5-after12.png。标题异步生成时采到New chat，不误判最终命名。 |
| 14-A5 分阶段GC资源 | 通过（CDP方法） | 同阶段baseline及累计3/6/9/12时HeapProfiler.collectGarbage，Runtime.getHeapUsage+Electron app.getAppMetrics记录main/renderer PID CPU/内存。是CDP明确GC，非DevTools Memory人工点击。 |
| 14-A5 堆收敛 | 未覆盖（观察未收敛） | GC后usedSize依次14,840,552→15,855,292→16,388,936→16,909,232→17,607,500字节，末期仍上升，12次窗口不能证明预热后收敛，亦不能凭此断言泄漏。采样完整见14-A5-lifecycle.json，不用RSS替代JS堆。 |
| 17-A2 默认模型/工具重启持久化 | 通过 | 原会话默认deepseek-flash高、列出目录true。UI改fixture-main、列出目录false→driver CLOSE正常退出PID74860→同固定dist/profile重启PID90833；设置页模型fixture-main、工具列目录aria-checked=false。settings-before-normal-restart.txt、settings-after-restart-tools.txt、models-after-restart.txt。 |
| 13-A5 外观/快捷键重启持久化 | 通过（保存路径） | 跟随系统→深色，原⌘⇧Space→录制⌘⇧J，改后显示已生效；同次正常重启后documentElement.data-theme=dark且录制按钮仍⌘⇧J。shortcut-before/after-restart.txt。未实际从其他App触发全局快捷键，不代签该能力。未出现revision冲突。 |
| 17-A3 连接重启保留/检测/发送 | 通过（真实HTTP受控Provider） | 原本新增自定义中转重启后仍2模型/已连接；获取可用模型真实HTTP返回fixture-main/alternate均已添加；新会话RESTART_CONNECTION_OK实际回复Fixture completed: fixture-main.。17-A3-after-restart-real-http.png。非真实外部LLM。 |
| 上述设置恢复 | 通过（UI恢复） | 列出目录恢复true、主题跟随系统、快捷键恢复默认⌘⇧Space、会话默认deepseek-flash高；settings-restored-final.txt。仅独立linked profile，用户dev未动。恢复值再次重启复核尚未做。 |
| V01 全分页seq/消息ID/轮ID对账 | 通过（只读运行时事实） | getProjectionSnapshot按beforeSeq翻15页，2820事件/2820唯一seq，无重复/意外seq；Journal2923事件差103 assistant/chunk。101 user、101 assistant、1000tool call、1000result、101turn start/end全部存在；各页seq对应data.turnId/messageId与Journal无字段差异。V01-runtime-pages.json、V01-runtime-ID-comparison.json。不是全UI最终状态签收；此前实际分页后新增交互独立证据保留。 |
| V01 getObservation历史翻页 | 未覆盖（接口行为边界） | 同参数读取仅85事件、beforeSeq无继续游标；未将其最新观察窗口当全历史。完整历史闭环使用getProjectionSnapshot，不隐去这一路差异。 |

启动工具记录：首次恢复忘记PTY，stdin EOF后无法交互，未修改设置；仅终止本次PID69885并确认退出后以PTY重新启动74860，未重复持有profile。后续正常CLOSE→90833用于持久化证明。没有读取或输出真实Key。

### 有限 Composer、会话与重启补验（2026-10-22 续）

| 原编号/子点 | 结果 | 操作与证据 |
|---|---|---|
| V02 Composer菜单循环/互斥 | 通过（已覆盖行为） | “+”根级↓连续循环 Plan→图片→Skills→Plan；Skills →进入子层、←返回根；根级搜索框打开“+”时点模型按钮，搜索仍可见且“+”根搜索项为0，记录浮层互斥。 |
| V02 选择/Tab返回焦点 | 通过 | Tab选中当前Plan后菜单关闭、返回消息框。Plan placeholder为“描述要规划的改动…”。 |
| V02 Backspace离开chip | 通过 | 空消息框Backspace保留Plan chip符合源码设计，不是chip内Backspace验收点。聚焦“退出Plan”chip控件后Backspace，chip移除、焦点回消息输入框；点×同样退出，placeholder改为“继续追问…”。不登记Bug。 |
| 17-A2 / 17-A3 / 13-A5 正常重启持久化 | 通过 | 修改工具、外观、快捷键、默认模型并正常退出，以同一隔离profile重启，设置保持且无revision冲突；受控连接在重启后重新获取/HTTP回复成功。原值随后已恢复。见 17-A2/A3/13-A5 行的截图和文本证据文件。 |
| 14-A5 十二个会话的堆观察 | 未覆盖（窗口内仍上升） | 12个会话均完成新建→实际受控HTTP回复→切回锚点→归档。CDP `HeapProfiler.collectGarbage` 后 renderer used JS heap 基线14.84MB，第3/6/9/12次为15.86/16.39/16.91/17.61MB；本窗口末期没有收敛证据。采样不能单独证明泄漏。 |
| V01 分页后全历史ID核对 | 通过（事件/ID对账） | `getProjectionSnapshot` 按 `beforeSeq` 读取15页，2820事件与2820唯一seq相符。101 user、101 assistant、1000 tool call、1000 result、101 turn start/end 的持久ID和关联字段均与Journal一致，无缺失/重复。Journal另有103个assistant/chunk事件；按`slimHistoryWindow`策略不暴露在该投影，已逐chunk核对其定稿`messageId`存在（`V01-chunk-policy-check.json`）。getObservation只有85条窗口且不给继续游标，单独保留未覆盖，不与完整投影混同。 |

### V02/V03键盘续验及V01口径查证

- V02根菜单↓实测Plan→图片→Skills→Plan循环；Skills上按→进入搜索Skills，←返回根；空子层Backspace返回根。Tab选择当前Plan后菜单关闭、焦点消息框。这些已真实交互通过；禁用项跳过本现场根菜单无禁用项，未构造。
- V03 Plan名称是span非按钮（结构只读核实）；×退出Plan实际恢复Agent，placeholder“继续追问…”且回焦消息框。Plan placeholder“描述要规划的改动…”。**Backspace语义是chip内**：focus“退出Plan模式”按钮→Backspace，chip消失、消息框获焦，通过。空消息框Backspace不退出Plan属不同设计边界，不是Bug。
- V02互斥代表：+开时点击模型按钮，根搜索count0；不是所有运行位置组合通过。
- V01缺103chunk已查证：`packages/runtime/src/session/session-controller.ts:310–342`的slimHistoryWindow明确剔除已有assistant/message定稿的assistant/chunk；本Journal103/103 chunk.messageId均有定稿、未完成0，V01-chunk-policy-check.json。排除该设计流事件后持久投影集合准确匹配，不只凭差数推断。
- 分叉尝试：当前RESTART_CONNECTION_OK首轮“分叉会话”menuitem有aria-disabled=true，实际点击被禁用阻止；不强制，不把禁用直接报Bug，也不签收成功分叉。

### 后续有限UI尝试与剩余能力边界（11:15–11:21）

| 原编号/子点 | 结果 | 实际尝试与边界 |
|---|---|---|
| 16-A5 唤起目标Select | 通过（打开/取消代表）；选择提交未覆盖 | 通用底部鼠标打开，实际三个选项自动选择第一个项目/指定工作区/指定会话；↑+Esc关闭保留指定会话。Space+↑+Enter后仍指定会话，未证明更改提交；再次鼠标选原指定会话。未用结果未变签收键盘选择成功。 |
| 16-A5 默认模型选择 | 通过（鼠标） | 用途从deepseek高→fixture-main，再选deepseek-flash高恢复；真实状态读回。键盘与上翻布局未完整执行。 |
| R08 空闲状态点 | 通过 | 侧栏空闲点点击显示“空闲/可以开始下一轮对话”。运行中/审批状态由其他专项，不借此合并通过。 |
| R12 浏览器入口 | 通过（入口/详情） | 扩展→Chrome浏览器→连接详情展开：组件未安装/扩展等待连接/Agent等待接入。R12-browser-entry.txt。未点开始连接避免登记组件改变现场；真实扩展专项另代理负责。 |
| 16-A7 tooltip | 未覆盖 | 悬停Plus700ms现场只取得先前状态点/会话tooltip，未捕获Plus目标tooltip，不能签收该按钮，未继续循环尝试。 |
| R20 本机图片入口 | 通过（入口触发）；系统选择未覆盖 | Plus→图片实际触发，DOM无input[type=file]；系统选择器无法通过当前CDP操作，未选择用户文件。类型过滤/系统对话框未覆盖，不用DOM模拟当原生选择。 |
| 16-A3 拖图A/B草稿与恢复 | 未覆盖 | 上述图片入口走原生选择，本现场未注入假drag/drop，也未选用户文件，未建立图片草稿前提；不能拿此前纯文本A/B草稿代签图片。 |
| 09-P1-3 Plan/Chat浅深 | 未覆盖 | Plan入口已实际验证（Tab选择与chip恢复），Chat入口未确认。尝试/chat误当命令，实际发送无私密内容给DeepSeek，完成回复指出命令不可用，无工具调用；发现后检查停止时已完成。此为验收操作偏差，不作为Chat模式通过。 |
| 09-P3-2 Effort参数 | 未覆盖 | 现deepseek-flash高确有档位；此前只读用途档位和改默认模型不是“下一次实际请求参数”证据。本轮不再追加Provider任务，未借其他请求代签。 |
| 09-P3-4 矮窗口翻转 | 未覆盖 | 当前未做矮窗口菜单开向采样；已有480px宽Context和轨迹证据不代替高度翻转。 |

14-A5最终补采：同一profile正常重启90833并完成设置/菜单路线后再次明确CDP GC，usedSize17,549,708、totalSize19,005,440字节，14-A5-final-GC-idle.json。这是**重启后的实例**，不能与74860的12次连续采样混成同实例回落证明；末期收敛仍未覆盖。未构造更多付费压力任务。

待继续可达的细分项仍与工具限制分开：V02禁用项/全部浮层互斥、V03附件/引用/窄窗全组合、16-A5键盘提交/上翻、16-A7目标tooltip、R17批注编辑、有效非首轮fork、09-P3-4矮窗、F2全外部关闭点/F5主子嵌套浅深/F8 E11精确定位仍可用既有现场再操作；原生IME/VoiceOver/系统音频/系统图片对话框当前控制能力受限。主表由主智能体维护，不把未做写成通过。

09-P3-4补尝试：真实BrowserWindow.setBounds(900×520)被当前应用最小尺寸约束，实际innerHeight仍760；Plus菜单top483/bottom618，在760内未裁剪，09-P3-4-short-window.png。故只验证最小允许高度下可见，不冒称520px翻转。窗口随后恢复1200×900，消息草稿清空；final-idle-GC-2.json为同90833实例后续闲置/明确GC采样。

清理完成：90833已driver CLOSE正常退出，ps确认90833/74860/69885均不存在；原用户dev实例未触碰。当前消息草稿已清空、窗口恢复1200×900，工具/主题/快捷键/默认模型恢复如上。重启后同90833两次GC usedSize17,549,708（11:20:30）→17,650,440（11:21:35），间隔65秒含有限菜单/窗口操作；不是纯闲置泄漏试验，未证明回落或收敛。

### 最后一次限定无付费请求收尾（固定dist/profile，PID31431）

前实例90833已在新调度消息到达前正常关闭，按主智能体确认仅重启一次同隔离profile。验收点为F6时间/模型筛选与统计分组、F4父子文本检索、F7复制边界、F8-E11定位、F5主子浅深；未新增模型请求。

| 点 | 结果 | 实际操作及边界 |
|---|---|---|
| F6 日/周/全部 | 通过（控件交互代表） | 使用统计实际点24小时→7天→全部；本profile记录同日，不能据同值证明跨日范围过滤正确。起初role精确定位超时，改实际文字入口成功，不记录产品Bug。 |
| F6 模型文本筛选/清空 | 通过 | 输入fixture-main后列表1–10/14，显示fixture-main；清空恢复1148日志。F6-filter-model-final.txt。 |
| F6 服务商/模型分组 | 通过（统计页入口） | 打开服务商2，显示default114次/deepseek19次；打开模型3并保存F6-provider-model-tabs.txt，返回请求日志。**不是连接/会话字段组合过滤通过**；当前只有“按模型或工具筛选”文本入口，未建立独立连接/会话筛选操作。 |
| F4 README检索 | 通过 | 搜索会话入口填README，侧栏匹配父会话“读取README并检查fixture工作区三文件用途比较”；F4-parent-search-final.txt。 |
| F4 Gruber检索 | 通过（已存在父正文）；子专属文本未覆盖 | 250ms仍正在搜索，1200ms后稳定命中同父会话，F4-child-text-search-stable-final.txt。父正文也含Gruber，故不能据此证明子专属正文索引/过滤，未误签。清空搜索恢复侧栏。 |
| F7 完成回复复制 | 未覆盖（共享剪贴板边界） | 当前真实回复存在“复制回复”入口，但本轮未修改或读取共享系统剪贴板；没有协调独占窗口，不以点击/按钮存在代替内容对账。 |
| F8-E11 原文→工具详情→子状态 | 通过（对应工具/子轨迹）；精确定位未覆盖 | Context完整上下文初始重建0/4693，等待后最近输入20项；点击末端工具结果打开第一轮explore详情，结果内容对应三文件比较、Schema explore、开始08:50:39.798/15秒；再点“在右侧查看子智能体轨迹”，右侧Explore已完成并显示README/sample.csv/sample.html读取。E11-selected-explore-final.txt、F5-child-final.txt。未取得同一持久条目ID和高亮/滚动定位证明，因此E11精确定位仍不签全通过。 |
| F5 主/子轨迹浅深 | 通过（双栏框架/文字）；嵌套列表视觉未覆盖 | 实际外观切深色→浅色→跟随系统恢复，主/子双栏均可读、Explore已完成；F5-main-child-dark-final.png、F5-main-child-light-final.png。DOM有26嵌套list，但截图处于轨迹摘要行，未展开列表原文，不能拿DOM存在签收嵌套列表marker/缩进视觉。 |
| 09-P3-2 Effort实际参数 | 未覆盖 | 现deepseek-flash有档位，但本限定收尾禁止新增商业请求，未将无档位作为理由，也未用默认显示代签下一请求参数。 |

本节结果覆盖前文“后续执行/待继续”的对应点；仍未覆盖的细分项保留，不把整组写通过。没有新增产品缺陷。原生IME/VoiceOver/系统音频可听验证/系统文件选择器仍是能力限制；官方凭据端点失败/超时、精确条目定位、图片A/B、完整键盘Select及嵌套列表视觉是尚无充分交互证据的细分项，二者不混称。

最终GC：PID31431的final-finite-route-GC.json记录usedSize22,561,780、totalSize24,920,064及main/renderer CPU/RSS；另留30秒无操作后明确GC的final-finite-route-idle30-GC.json。这个重启实例不拼接到74860十二会话曲线，不声称内存收敛。

收尾清理确认：PID31431正常driver CLOSE，ps已无该进程；搜索空串、主题跟随系统，未新增草稿/真实请求。30秒idle等待完成后，首次GC脚本因前调用局部cd句柄不跨eval而报undefined；随即新建CDP句柄采样成功，期间未UI操作，故记录实际略长于30秒的闲置窗口，不伪称精确30秒。共享fixture Provider由主智能体创建/持有（76591/44321），本子智能体未创建新的Provider，故未擅停其共享服务。


### 最后有限补验：正文列表、专属检索、复制边界、Context 定位（2026-10-22 11:43）

方法：固定 dist、同一隔离 linked profile，Playwright Electron/CDP 真实交互；未发新模型请求。证据均在 `tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/`。不代签原生 AX、系统剪贴板。

|验收点|终态|实际操作与证据|
|---|---|---|
|F5 主对话正文无序/有序/嵌套列表|通过|回到真实主回复正文，检查列表标记与嵌套；assistant 正文可见 ul/ol，嵌套层级存在。不是轨迹摘要。见 F5-body-nested-system.png、F5-body-ordered-light.png、F5-body-ordered-dark.png。|
|F5 右侧子 Agent 对话正文三类列表、浅深主题|通过|打开子 Agent 的对话正文（aria-label 子 Agent 执行内容），message-flow 中 ul=20、ol=1、nested=17；无序 list-style-type=disc，父/子项 x=1072.59/1096.19，实际缩进约23.6px。浅深关键截图 F5-body-nested-light.png、F5-body-nested-dark.png、F5-body-ordered-light.png、F5-body-ordered-dark.png；结束恢复 system。|
|F4 子 Journal 专属词普通搜索|通过（排除子会话）|只读比较父61fdc5af…与子f3fcd8e3…全文，classification 在子 Journal、父全文不存在；真实搜索 classification 稳定显示“没有匹配的本机会话”。证据 F4-child-exclusive-words.json、F4-exclusive-classification-search.txt。未把父也含的 Gruber 当专属词。计划要求普通搜索不混入子会话；无命中符合此预期，不登记Bug。|
|F4 专属词结果快速打开|未覆盖|上述普通搜索无结果，无可点击目标；不以其他父词命中代签子词定位。|
|F7 主回复/代码复制输出对账|未覆盖|源码确认该入口调用 renderer navigator.clipboard.writeText；仅拦截 Electron main clipboard.writeText 不能保证截住 Chromium 写入。为不触共享系统剪贴板，未点击复制，亦未用DOM文本冒充复制处理器输出。需可安全截获 renderer clipboard 的隔离能力或独占剪贴板前提。|
|F2 消息区外部关闭与Esc回焦|部分通过/部分未覆盖|消息输入区点击后 Context 关闭；Esc即时焦点 BODY，250ms后回到上下文用量按钮，不能称回 Composer。F2-external-focus-final.json。状态行/侧栏本轮未新增独立证据，沿用此前逐项结果。|
|F2 回复尾部用量窄窗|通过（system代表）/浅深未覆盖|700×900真实窗口点击尾部用量并保留 F2-turn-usage-narrow-system.png，随后恢复1200×900。右面板遮罩曾拦截点击，关闭面板后成功。此截图不代签浅深各自覆盖。|
|F8 E11 Context→轨迹精确持久ID|部分通过/精确来源未覆盖|点击上下文工具结果后，再点击“在轨迹中打开”，DOM data-current=true 与 aria-selected=true 均为父会话 record:assistant:763136bc-f4ec-4fc6-be62-56bfd57e9183；该ID只读核对 Journal seq4683 assistant/message 确实存在。点击前轨迹 current 是 tool:call_00_BBa1H1NhkE7N9s8HxbBk1540（Journal seq733/737）。由于未在同一采样里取得 Context 按钮所绑定的预期定位ID，不能据此断言准确/错误定位；完整E11仍未覆盖。证据 E11-persistent-selected-final.json/png、E11-journal-id-final.json。|
|F8 子轨迹前后会话ID保持|未覆盖（本轮）|本次精确ID采样发生在父Context/父轨迹，不能代签子轨迹稳定性；此前子会话交互证据保留，不扩大结论。|

清理：本轮 Electron PID52077 已通过驱动 CLOSE 正常结束，ps确认进程不存在。未启动/停止用户dev实例，未改产品、coverage或配置源码；主题已恢复system，窗口恢复1200×900。至此按分配的有限批次结束，不继续扩展路线。

### 最后有限批次补验：输入、浮层、菜单与复制边界（2026-10-22）

|验收点|结果|证据/边界|
|---|---|---|
|F5 代码块内 `-`/`1.` 不误渲染为列表|未覆盖|本轮既有真实回复未找到可确认的代码块标记样本；未新增请求，不能代签。|
|V02 与 Context 互斥|通过|“+”面板与 Context 互斥采样：打开“+”后 context=0；再打开 Context 后 context=1、menu=0。`final-plus-context-mutual.json`。根菜单无禁用项，跳禁用仍未覆盖。|
|V03/09-P1-1 输入节点、删空、光标|通过|同一 textarea 节点保持不变；三行起始 selection=11，替换为一字后 pos=1，Backspace 后 pos=0、len=0。`final-input-node-caret.json`。未代签视觉闪动。|
|16-A1 Shift+F10 首项焦点/Enter/Esc|部分通过|对真实侧栏会话 Shift+F10 后 activeElement 为 menuitem“置顶”；↓/Enter 进入重命名输入，Esc 后原会话按钮恢复。`final-shiftf10.json`。提交路径本轮未重命名，首项可见焦点通过。|
|16-A5 Select 键盘提交/底部上翻|未覆盖|固定 profile 当前主 Composer 可见“本机”，但本轮未进入设置页 Select，避免误改恢复值；此前 Space+↑+Enter 未改变值，故仍不签收。|
|R09 非首轮真实分叉|未覆盖|已有侧栏菜单能看到“分叉”，本轮未执行新分叉以避免新增会话状态；不以菜单存在代签归属与内容。|
|F2 外部点击与 480 窄窗用量|部分通过|“+”/Context 互斥和输入点击已采样；480px system 主题打开用量浮层并截图 `final-f2-480-system.png`，恢复 1200px。浅/深 480 本轮未覆盖，状态行/侧栏全部外点仍不能合并为整项通过。|
|16-A7 tooltip|未覆盖|本轮未捕获流式停止、数值重置、子 Agent 返回三目标 tooltip；不以旧状态点 tooltip 代签。|
|F7 复制处理器输出|通过（边界限定）|临时在 renderer 运行时替换 `navigator.clipboard.writeText`，点击真实“复制回复”，捕获长度181并与 message-flow 文本对账；立即恢复原函数，未触系统剪贴板。证据 `final-copy-handler.json`。这是处理器输出验证，不是系统剪贴板验收。|

本批实例已 CLOSE；未改产品源码、coverage 或配置。

### 明确缺口有限补验终态（2026-10-22 12:14）

方法：PID20061、既有 linked 隔离profile、固定dist，真实Electron/CDP。未发起任何商业或fixture Provider请求，未触剪贴板。先列F5/R09/16-A7/F2-02，再按正文、会话、用量路线执行。

|子点|状态|步骤、实际结果与证据|
|---|---|---|
|F5-01 子消息代码块标记|通过|只读Journal发现子会话2e9e1afe…真实assistant正文含`1. 一级有序\n  1. 看起来像子项`及`1. 父项\n  - 子项（错）`。从父会话右面板进入第二个Explore对话正文，实际滚到代码块。两段位于pre/code，内部li/ul/ol=0，字面标记保留；非轨迹摘要。`F5-code-child-final.json/png`。|
|F5-01 主消息代码块标记|未覆盖|当前父回复只有列表及行内代码，没有同类fenced标记样本；不把子结果代签主消息。未新增模型请求。|
|R09 真实分叉创建/内容归属|通过（创建与持久对账）|在两轮父会话61fdc5af…侧栏ShiftF10→分叉。首次异步结果未立刻出现，有限复核又点击一次，最终产生1d88567b…与52ebb54a…两个独立Journal；均lineage.parentSessionId=61fdc5af…、origin=fork、boundarySeq4692，8条user/assistant消息内容和ID逐项与父一致。`R09-fork-created.txt`、`R09-fork-session-list.json`、`R09-fork-journal-check.json`、`R09-fork-content-summary.json`。|
|R09 分叉后返回/界面归档|未覆盖（具体可见性障碍）|点击后正文保持父标题与完整内容；两个分叉可经只读sessions.list看到，但侧栏展开后仍只有原父data-session-id，reload后仍未出现分叉行，因此无对应可点击返回/归档菜单目标。未把同名父行当分叉。为清理本批产物，经IPC archive将两个测试分叉归档成功（`R09-fork-cleanup-IPC.json`），此清理不代签UI归档。该可见性事实交主审，不自行定根因。|
|16-A7 子详情返回tooltip|通过|真实第二个Explore详情，hover“返回子Agent列表”800ms，role=tooltip文本为“返回”。`16A7-child-return-tooltip.json`。|
|16-A7 数值重置tooltip|通过|外观界面字号原14px，增大一次使重置可见，hover700ms，tooltip为“重置 界面字号”；点击重置回14px。`16A7-reset-tooltip.json`。|
|16-A7 流式轨迹停止tooltip|未覆盖|本现场所有会话空闲；本批明确不新增Provider请求，未有现成流式任务可悬停，未以静态按钮或别处tooltip代签。|
|F2-02 480px浅色用量内部与裁切|通过（回复尾部用量代表）|外观实际选浅色→返回→窗口480×900→第二轮尾部6.5K用量。内部点击“本轮用量”保持打开。dialog rect x164 y337.5 w300 h235.5，right464<480、bottom573<864；数据6487tok及费用完整。`F2-usage-480-light.json/png`。信息型面板未有另一个内部功能按钮，未虚构操作。|
|F2-02 480px深色用量内部与裁切|通过（回复尾部用量代表）|实际切深色重复打开，内部点击不关闭；相同dialog边界完整，截图核对未裁切。`F2-usage-480-dark.json/png`。累计统计浮层的全子点不由该代表代签。|

09-P1-1上批节点采样精确边界：在已有会话textarea填入三行（长度11，含显式换行），保存节点引用，selection=11；Ctrl/Meta+A后实际insertText一字，sameNode=true/selection=1；Backspace删空，sameNode=true/selection=0。证据`final-input-node-caret.json`。它证明三行→一字→空无节点替换及采样时caret正确；没有逐字长文自动折行过程的连续节点/光标记录，不能升级为全程无闪或长文折行全部通过。16-A4本批不新增首发，未签新建首发节点。

清理：两个本批分叉通过IPC归档；草稿为空；主题恢复跟随系统、字号14px、窗口1200×900。本批驱动CLOSE正常退出，PID20061后续ps确认不存在。没有修改产品代码、coverage或dist。


## T1/T2 真实 DeepSeek 有限补验（2026-10-22 12:20–12:35）

方法为固定 dist 的真实 Electron/CDP，独立 linked profile，同一 main51004/renderer51076。仅复用既有 deepseek-flash，关闭编辑/写入/Bash/浏览器/图片生成分析；提示仅虚构城市科普，不读取仓库或用户资料。本批共4个主回复请求，未追加凑数请求。证据目录 `tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/`，前缀 T12。

|验收点|结果|实际步骤与边界|
|---|---|---|
|T1 三轮8k–12k汉字|未覆盖目标规模|第一篇UI停止后4249汉字，显式继续5495，逻辑合计9744但为两条；第二篇7015，第三篇6095。混排总字符分别4890/6483/8426/7321，不冒称汉字达标。Journal-final保存全文、seq及持久ID。|
|T2 流式会话切换/滚动|通过|三轮实际A→B（RESTART_CONNECTION_OK）→A，mouse wheel上下滚动；首篇续写另复测。stream-switch-scroll资源样本保留。|
|T2 停止/暂停/继续|通过|实际停止后Stopped；后续消息进入暂停队列，点击“继续发送”才恢复请求。r1-stop、resume-stream证据。资源标签r1-continue-start/stream/end实际上处于暂停队列，不作为流式或结束采样。|
|T1/T2 阶段资源|部分通过|baseline、各轮流式/结束、最终闲置；app.getAppMetrics记录PID/CPU/工作集KiB，CDP Runtime.getHeapUsage字节，均未强制GC。r3-start采样主进程evaluate报“Resulting promise was garbage collected”，发送已实际开始，经UI stop=1核对未重发；改用ps CPU/RSS+既有CDP。第三轮独立开始采样缺失。|
|F5 主消息代码标记|通过|第三篇实际代码块含字面“1. 一级示例”“  - 子项示例”，pre内li/ul/ol计数0；main-code-final截图与final-dom。|
|未闭合→闭合代码/表格|未覆盖完整过渡|有真实流式快照及最终闭合代码/表格，但没有同一块未闭合与闭合双时点精确采样，不以最终截图代签。|
|长回复复制处理器|通过（方法限定）|真实点击最后“复制回复”，临时拦截renderer navigator.clipboard.writeText并finally恢复；捕获7321字符与最后Journal全文逐字相等。不触系统剪贴板，不代签系统复制。|
|最终消息持久映射|部分通过|Journal seq5323/11594/20469/26797对应四个真实持久messageId；最终DOM最后回复data-assistant-message-id=v2-26797。最后全文通过复制处理器与Journal对账，其余三条未逐字核对最终DOM。|
|16-A7 停止tooltip|未覆盖|真实流式hover并留stop-tooltip截图/正文，未取得可核验tooltip文本；不以hover动作本身判通过。|
|主/子工具结构事件|未覆盖|本批纯文本且工具关闭，没有工具或子委派样本。|

四条持久ID依次为 d381ae62-d957-4277-a47e-f3afe563ae51、48e0c5ce-d3f1-41b3-a9d2-c7cba9e343f8、18391b03-54f1-44ff-aff6-b2c517364b97、0e5692f1-0180-41bd-8077-f01db176c5db。资源原始文件T12-new-resource.json保留完整CPU/内存及时间；未从有限波动推断泄漏或堆收敛。

最终闲置补记：idle-start main/renderer RSS110768/154848KiB，heap36567776B；30秒109952/114912KiB，heap39558272B；最终至少120秒窗口99248/95792KiB，heap37936376B，CPU各0.3%。由于工具往返，最终实际较idle-start约155秒，不把标签120当精确120秒。全部未手动GC。六项工具开关已按原值恢复true，T12-restored.json；本批随后CLOSE正常退出。


## 本地受控补验：Context与子轨迹（2026-10-22 12:39起）

验收点：E4严格20秒增量；E11具体行trajectoryRef→selected/Journal；F3多子切换与安全故障；Context浏览器fixture重试/同步/明细与路径分页/原文两chunk。分组先固定dist真实Electron已有会话定位，再本地HTTP受控explore流式，另用独立headless Chromium的显式context-pagination mock。没有商业请求，不改产品/dist/coverage。

已执行：真实E11点击“在轨迹中查看：工具结果”且正文≈22，读取组件entries中对应tool-result trajectoryRef，callId=call_01_p5XjTq13Q2eohEC9vfz14177；点击后data-current与aria-selected均为同callId，data-event-seq734，Journal tool/call734与result739匹配。E11-specific-ref.json、E11-specific-journal.json、E11-specific-selected.png。**具体行定位通过；子轨迹前后选择/滚动保持仍未覆盖**。generic latest按钮未用于这次判断。

浏览器mock已实际初始读取失败→重试→ready（中间syncing瞬间未单独捕获），明细100→300→670；睡眠1284路径首次读取失败→重试显示12个DOM行。context-mock-failed/retry/page300、context-entries670、context-path-failed/retry文本证据。此为mock交互，不能代签真实Runtime12000项；路径下一页与原文两chunk仍继续。

### 本地受控批次终态（2026-10-22）

|子点|状态|实际证据与精确边界|
|---|---|---|
|F3 子对话运行中等待（原E4方法更正）|失败候选，交主审登记|`E4-strict20.json` 同一调用 before=04:44:57.265Z→after=04:45:17.268Z，20.003秒。before右侧已打开唯一任务 CHILD_STREAM read-only fixture result，显示 Explore·运行中、等待执行…、0片段；after显示40片段且已完成。真实子Journal 8aeb66df-46b1-4389-8d7b-5bc25eb96420 的chunk从04:44:34.075Z持续至04:45:14.142Z（40秒）；before时流已运行23秒却未显示已有片段，未达到运行中实时正文预期。`E4-journal-events.json`、`E4-strict20.png`、`E4-final.png`。任务视图在before之前打开，但未独立记录打开时刻，也未同采样读取selected持久ID；不声称视图已打开23秒。唯一子任务Journal header关联parent e0ce8f51-939f-4106-bdfe-0a7541029ad0、parentCallId fixture-2，origin=delegation；受控HTTP响应经真实Runtime委派，无商业请求。|
|F8 E11 具体条目精确定位|通过|`E11-specific-ref.json`中≈22工具结果entry trajectoryRef.callId=call_01_p5XjTq13Q2eohEC9vfz14177，实际点击其“在轨迹中查看”后data-current及aria-selected同callId、seq734；Journal call734/result739对账。不是generic latest。|
|F8 E11 子轨迹选择/滚动保持|未覆盖|本次精确定位采样未同时保存子轨迹前后selected/scroll/sessionId，不能用父目标正确代签。|
|F3 多子切换/失败取消/只读与故障fallback|未覆盖（本批）|本批只创建一个只读explore子任务，已有运行→完成与Journal lineage；没有实际构造多子切换、失败、取消、transcript临时空/读取错误/retry耗尽。未注入preload故障或改产品；这是未执行子场景，不称环境工具阻塞，也不以源码替代。|
|Context 初次失败→重试→ready|通过（browser mock）|实际UI重试后ready，`context-mock-failed.txt`、`context-mock-retry.txt`；syncing瞬态未独立捕获，因此同步中状态仍未覆盖。|
|Context entry分页|通过（browser mock）|实际加载更多100→300→500→670，670为基础50+extra620；`context-mock-page300.txt`、`context-entries670.txt`。不冒称真实Runtime12000项。|
|Context sleeping路径错误/重试/分页|通过（browser mock）|首次读取失败→重试12/1284，再连续6次“再显示20项”到132/1284，`context-path-failed.txt`、`context-path-retry.txt`、`context-path-pagination-final.txt`。证明实际UI跨初100范围的展示分页，不宣称所有1284逐项完整。|
|Context 原文两chunk|通过（browser mock）|实际点“演示工具 520”→读取原文→下一页原文，分别显示“这是显式演示工具的原文第一段。”与“这是原文第二段。”，`context-source-chunk1.txt`、`context-source-chunk2.txt`。两次展示不是全文拼接完整性证明。|

mock补验使用独立headless Chromium，入口http://127.0.0.1:5173/?mock=context-pagination；源服务未由本批启动/关闭。选择器首次误把带空格标题写成无空格，后依据实际正文修正；路径按钮亦按可见完整accessible name修正。未把选择器超时当产品缺陷，全部browser均finally关闭。

清理与工具操作异常：本批Electron PID29287通过app.close正常退出；独立Provider44351 PID26366已TERM；ps确认两者不存在。隔离settings.json与本批备份cmp字节一致，未输出凭据。清理时误读取共享web-controlled/provider-ready.json发送TERM，误停原44321/44322 Provider（既有PID76591）；随即用原provider.mjs原样恢复，当前PID43561、端口44321/44322正常监听，exec29242保留供其他验收引用。影响为清理工具调用前后短窗口（未采精确秒级停机时刻），不是产品故障；E4此前04:44–45已结束且全程使用独立44351，因此不拼接受影响序列。没有停止Host或用户dev实例，没有修改产品/dist/coverage。此有限批次结束。

### E4方法纠正与明确子轨迹复验

原`E4-strict20`是右侧子**对话**，不能签轨迹E4；上表已改F3候选。随后同固定dist/profile、仅44351本地Provider延长80秒，实际点击右侧“查看执行轨迹”进入表格，保存`E4-trajectory20-before.png`与after.png、`E4-trajectory20.json`。

**E4严格窗口通过**：同一脚本20.173秒，before表格仅用户行，after新增系统提示词、第1轮、上下文条目与助手0–29片段；两样任务均运行中。随后只读DOM采样`E4-trajectory20-rowids.json`：child session211cba5d-335d-43ad-a39d-13faa7a0bf0e，assistant持久ID6f0d8311-331a-469f-8f64-1b6aac7edd7d，data-running=true、request-status=running。`E4-trajectory20-journal.json`保存header lineage及事件序列。该样本纯文本无工具请求，工具步骤增长未覆盖；不把表格出现新增助手行当工具执行。

E11同现场再次实际具体工具结果定位：`E11-current-specific.json`保存组件entry的trajectoryRef.callId=fixture-2，点击后父selected/data-current同a4e3b8e2-729e-448f-8deb-94023a613f57:record:tool:fixture-2、seq14。子跳转前采样`E11-child-before-context.json`，点击Context目标后点回“子Agent”Tab实际先看到列表，`E11-child-after-tab.txt`；`E11-child-after-context.json`的rows仍属于父轨迹，不能用其证明子selected/scroll。故**父精确定位通过；子选择/滚动保持仍未覆盖**，此次采样入口偏差明确保留，不冒签。

F3-03补验（同一最后实例，无新请求）：进入既有父61fdc5af…的子列表，实际连续第一短任务→返回列表→第二教学任务→返回列表→第一短任务，三次正文尾部依次为用途推断结论/“正文字数约6300”/相同用途推断结论，无串内容。`F3-multiple-child-switch.json`；只读Journal映射`F3-multiple-child-journal-map.json`：短任务f3fcd8e3-c052-4585-ae08-172f6796fe8d，教学任务2e9e1afe-e2be-44dd-8371-ee332c38f161。**多个已完成子项切换与返回列表通过**；采样未取得组件selection ref且未存各子滚动偏移，故逐ID UI直接属性/滚动恢复/重开仍未覆盖。映射文件另含两条此前归档fork，origin=fork不当作delegation子任务。

F3-02失败/取消/空记录/读错/retry耗尽：本批没有安全自然错误样本；未删除真实Journal或拦截preload伪造错误。要验真实故障fallback仍需独立可恢复的故障Journal副本/受控协议错误场景，本批未构造，保持未覆盖，不用正常样本代签。原对话等待候选缺当时公开transcript API同时间返回，不能区分IPC与绘制层。

最终清理复核：80秒本地任务正常完成，保存`E4-trajectory20-final.txt`。最后Electron PID53631经CLOSE正常退出，ps无该PID；本批44351 Provider PID53602已TERM，原共享44321/22 PID43561保持。隔离settings再次从原备份恢复；无商业请求、无剪贴板操作、无产品/dist/coverage改动。本批至此终态。

## F7闭合过渡/F3自然RPC有限补验（2026-10-22 13:03–13:08）

验收点先列：F7同一主回复代码未闭合→闭合、表格追加→结束，正常退出/重开全文与持久ID；F3打开后至少两poll的UI/RPC/Journal同时间对照。按一个本地Markdown回复场景、一个自然explore、最后重开分组。固定dist、原linked隔离profile，暂时将四文本用途绑定自有44351 fixture-main，结束恢复字节备份；不商业调用、不系统剪贴板、不改产品/coverage。

|子点|结果|实际证据|
|---|---|---|
|F7-01 同回复未闭合代码→闭合|通过（本地受控HTTP真实Runtime）|第二次受控回复脚本内连续采样：F7-stage-open-code at05:04:54.551Z，Provider仅已发开围栏+两行字面标记、pre存在/table0；21.160秒后open-table，围栏已闭并出现一行表；再21.143秒closed出现甲/乙两行及结束。三组JSON保存完整main DOM、正文，三张PNG。未闭合pre保持1./-字面、无列表误渲染。第一轮F7-markdown-open采晚已闭代码，不作此通过依据。|
|F7-01 表格未结束→结束|通过（受控追加边界）|同一消息open-table阶段只有甲行，closed阶段增加乙行和结束段，table始终一个，DOM无重复；Markdown表格无独立闭合符，本项准确表述为流式尚未结束的表→后续行/段完成，不虚构table围栏。|
|F7 正常重启持久全文|通过|session876ef54f-50ed-4e64-86df-5be979c60c0a，Journal assistant seq16/messageId25e2ce59-540d-4263-b48c-0bccbffd9f83，原文5524字符。正常CLOSE82456后重开94698，实际点同会话，DOM v2-16/渲染正文5490字符与关闭前逐字相等；公开projection snapshot消息原文与Journal5524字逐字相等，含同messageId。`F7-journal-final.json`、`F7-final-before-restart.json`、`F7-reopened-projection-dom.json`、`F7-persistence-check.json/png`（重开截图实际文件F7-reopened.png）。未通过复制或系统剪贴板取值。|
|F3 自然流式等待候选复核|本次通过实时更新，旧候选保留|child d04c381d-abd5-4bff-ac3f-722a4f30d417，parent92778431-1ad0-4840-97bf-1cd3a3702fce，call fixture-6。详情打开后2.5秒已有0–3片段。05:06:31.316Z公开getSubAgentTranscript返回2事件，Journal39chunk、UI到38；2.009秒后仍2事件但正文增长，Journal41chunk、UI到40。`F3-natural-rpc-ui.json`保存完整RPC/ref/UI与同阶段Journal计数；没有等待执行，不能复现此前候选，也不据一次正常样本抹去旧事实。80秒任务正常完成，F3-natural-final.txt。|

E11口径纠正：只读观察旧`f8-E11-return-child.png`，中间主轨迹已跳到回复详情，右侧仍原只读Explore已完成子任务，README/sample.csv/sample.html工具行可见。与同固定构建新具体trajectoryRef→selected/Journal证据合并，**原E11“主轨迹定位、右侧子不受影响”通过**。原清单没有同采样scroll字节一致门槛；此前额外加严的“子scroll未覆盖”不应阻挡E11原项。此结论基于旧真实截图/步骤与新精确ID独立子步骤，不冒称新样本同时间全字段采样。

剩余边界：F3-03不同子滚动位置切回恢复规则尚未采样；F3-02可丢弃fault profile移走/截断child Journal路线尚未执行（可执行的新故障副本前提，不称工具不能）。本批未扩大到故障副本。原生IME/VoiceOver/系统音频边界不变。

清理：82456与94698均CLOSE正常结束；自有Provider82400 TERM；linked settings从原备份恢复。原共享43561 Provider44321/22保留。无用户dev或Host关闭，无源码/dist/coverage改变。

## F3滚动规则与真实故障副本补验（2026-10-22 13:10起）

验收点：F3-03两子不同滚动→另一子/列表→原子→正常启动；F3-02可丢弃副本Journal缺失→真实RPC/UI重试→耗尽Markdown fallback→恢复。按已有两子场景与单一缺失文件故障分组，不发模型请求，不动原linked Journal。

|子点|结果|实际步骤与证据|
|---|---|---|
|F3-03 两子不同滚动/切回内容|通过（实际规则）|原linked实例1605，短任务f3fcd8e3…实际wheel到scrollTop700（3826高），回列表后教学任务2e9e1afe…到1600（17612高），再回短任务为0；父main保持3630。三次末端内容正确，`F3-scroll-switch.json`。实际规则是重进详情从顶部开始，不要求未承诺的滚动数值保持，不据此报Bug。|
|F3-03 正常启动后可重进|通过（副本启动边界）|正常关闭1605后复制自己profile的settings/secrets/workspaces与sessions-v2到全新desktop-cu-fault-profile；正常启动15525，重新进入同父/短子，正文完整且从顶部显示，`F3-fault-baseline.txt`、`F3-reopen-scroll.json`。这是复制持久数据的新隔离profile启动，非声称原profile窗口选择自动持久化。|
|F3-02 真实transcript读错与重试|通过|停15525后仅将fault副本短child journal.jsonl改名journal.acceptance-backup.jsonl，原linked不动。启动18715实际进入同子，首样与7秒后均“执行记录暂不可用，正在重试。/正在加载执行记录…”。公开getSubAgentTranscript真实拒绝ENOENT，文件路径确指fault副本；`F3-fault-missing-journal.json/png`，无preload拦截。|
|F3-02 重试耗尽Markdown摘要|通过|继续等待超过源码20次×1秒重试窗口，错误/加载文案消失，显示该短任务原Markdown摘要：三文件用途、嵌套列表、分类结论；aside li=47。`F3-fault-retry-end.txt/png`，实际不是另一教学子正文。未出现永久空白。|
|F3-02 临时空、取消、失败状态|未覆盖|本次只构造缺文件读错，不将其代签空数组返回、运行取消或Provider失败。没有循环试不同损坏形式。|

恢复复核：停18715，原样将fault备份改回journal.jsonl，再正常重开同fault profile为24056，公开RPC返回17事件、实际子正文完整，scrollTop0；`F3-fault-restored.json/png`。fault恢复Journal与原linked SHA256相等（F3-fault-restoration-check.json），备份名已消除，没有触及原业务文件。随后CLOSE24056；ps确认本批1605/15525/18715/24056全部退出。本批未启动Provider，无请求、无剪贴板、无产品/dist/coverage编辑，故障副本已恢复可读状态并保留作证据。

## F3-01/P2-D12受控委派终态批（2026-10-22 13:21–13:25）

验收点先列：真实只读工具/助手中间态→父继续；受控Provider失败；当前UI取消及子Run终态；只读write拒绝/磁盘；合法空delta。分组正常委派→失败/取消→写入边界。使用自有fault隔离profile固定dist、44351回环HTTP，四文本用途临时fixture-main，结束恢复settings；不商业调用、不改产品。

|子点|结果|实际步骤与证据|
|---|---|---|
|F3-01 只读工具中间态+助手增量|通过|实际explore task CHILD_READ，子Runtime真实read_file README.md；右侧正文显示Read README.md，主状态“正在思考·刚读取README.md”，2秒后片段1–2，再10秒后1–12。`F3-normal-read-stream.json/png`；正常40秒结束子已完成，父继续第2步回复Fixture completed，`F3-normal-read-complete.txt`。对应父5cdfa7c0…/子26be67a2…，`F3-read-failure-journals.json`含真实call/result与lineage。|
|F3-01 受控Provider失败|通过|实际explore CHILD_FAILURE，子HTTP400，UI状态“失败”并展示400 fixture_error；父收到结果继续回复，未卡运行。`F3-provider-failure.txt/png`及同Journal文件；父1907cbb5…/子a5f4bbf6…。|
|P2-D12 UI取消与子清理|通过（父取消语义）|运行中可达入口只有父Composer“停止Agent”，未发现独立子取消。实际hover tooltip“停止Agent”后点击，子显示“已停止”及Stopped。公开getSubagents为aborted；父be150a5d…turn/end aborted、run finish cancelled，子8521bd75…step/end/turn/end aborted、run finish cancelled、child-terminal均落盘。`F3-cancel-entry.json`、`F3-cancel-after.json`、`F3-cancel-projection.json`、`F3-cancel-journal.json`。read_file已结束，取消的是后续HTTP流，无在途长工具可证明强制工具进程清理，保持该边界。|
|P2-D12 explore写入边界|通过|受控Provider向真实子返回write_file acceptance-readonly-probe.txt；Runtime tool/result status=denied，明确“write_file is not visible in this Agent scope. No tools in this batch were executed.”，UI显示Denied write；磁盘文件不存在。`F3-readonly-write.txt/png`、`F3-readonly-journal-disk.json`。这是Agent scope可见性拒绝，不伪称文件系统权限层拒绝或工具已执行。|
|合法空delta与空消息|部分通过|正常子流第一delta content为空字符串，之后39个文本片段，未崩溃且正文正常；fixture脚本保留此合法HTTP。未在空delta独占时点采样DOM，所以“空占位不误显示”单独仍未覆盖，不把后续正常状态升级瞬态通过。|
|16-A7 停止tooltip|部分通过|当前Composer停止Agent hover实际role=tooltip为“停止Agent”（F3-cancel-after.json）。若原点要求轨迹表专用停止按钮，本代表不能代签该特殊位置。|

本批Provider仅真实HTTP响应受控，Runtime委派、工具、Journal与UI均真实；`cu-subagent-final-requests.jsonl`无Authorization。原linked profile未操作。本批31371通过CLOSE正常退出，44351自有Provider31282 TERM，fault settings从cu-fault-settings-backup.json原样恢复；没有删除用户会话或停止原共享Host/Provider。

## Context/轨迹最后有限批（2026-10-22）

验收点：P2-D11轨迹筛选、请求/工具事实与未知、具体来源定位；P2-D10真实大历史明细/原文/路径至少两页；F7-02已完成块两时点稳定。按100轮/1000工具linked历史→已有真实双子父会话两组执行。固定dist、隔离linked profile，真实Electron/CDP，无模型请求、无preload拦截、无系统剪贴板。

|子点|结果|实际步骤与证据|
|---|---|---|
|P2-D11 真实UI筛选/工具详情|通过|选acceptance-long-history-100x10-linked（现101轮，包含先前V01真实追加），轨迹搜索fixture-100-10，点击工具。实际read_file fixture-100-10.txt、完成、返回File output 100-10，Schema与耗时0ms可见。D10-trajectory-filter.json、D10-tool-detail.txt。100×10主体是合成Journal，不冒充100轮真实Provider。|
|P2-D11 有事实请求|通过|请求#101为此前真实DeepSeek请求：输入71295、缓存6016、输出4；总1.84秒、TTFT1.82秒、生成23ms、173.9tok/s。D10-request-real-facts.txt。未在本批重发。|
|P2-D11 未知事实|部分通过|合成请求#100有TTFT1ms、总1ms，吞吐量显示“时长过短”，没有伪造数值。D10-request-missing-facts.txt文件名不准确：此样本并非缺TTFT。没有找到安全既有“TTFT与吞吐量均缺失”请求，故该组合未覆盖，不把工具0ms当模型TTFT。|
|P2-D11 具体来源→精确定位|通过|已有真实父61fdc5af…Context首个工具结果“在轨迹中查看”点击，DOM selected/current持久recordId含call_01_p5XjTq13Q2eohEC9vfz14177，行eventSeq734、read_file sample.html，和此前Journal734/739对账一致。D10-context-navigation.json/png。此样本不额外代签右侧子窗口状态。|
|P2-D10 大历史Context真实状态|通过（状态观察）|100×1000历史Context为最近请求输入回退、0明细、无路径；D11-large-context-first.txt。实际数据没有当前Context来源，不能仅凭Journal规模声称UI12000项。|
|P2-D10 明细展开|通过（现有规模）|真实双子父会话显示72项最近输入、会话内容20、工具21。实际点击“再显示8项”至20条来源行和“再显示9项”至21工具。D11-real-context-expanded.txt/png。是前端隐藏行展开，不是后端游标两页，不能声称分页去重通过。|
|P2-D10 自然索引同步→ready|通过|首次真实UI出现“历史索引同步中（4693/4693）”，D11-real-parent-context.txt；随后同会话同步提示消失。公开describeContextPanel返回history ready、indexed/target4692、disclosure unavailable、contextRevision0、entriesPage total72/truncatedfalse。D11-real-panel-response.json。截图D11-real-context-syncing.png为稍后采样，不能单靠文件名证明仍同步。|
|P2-D10 entry/source/path各至少两页、游标无重复|未覆盖（明确数据前提）|linked当前Context无来源；真实父仅72项、最近请求回退，disclosure unavailable且UI“读取原文”按钮0、无路径记录。原文/路径没有第二页入口；本批未重写Journal或注入preload凑数。此前browser mock620/1284和服务12000证据保持各自方法，不合并为真实Runtime大历史UI通过。自然读取错误/重试未出现，本批不构造。|
|F7-02 完成DOM稳定代表|通过（有限代表）|已完成父轨迹/工具条目同DOM取17个非空测试/消息/轨迹元素，两次间隔2秒，全文与标识数组完全相等。F7-02-completed-dom-stability.json。覆盖静止完成轨迹/工具代表，不外推所有Markdown/流式排列或绘制帧无闪。|

本批没有新增商业请求或修改产品/dist/coverage。随后正常CLOSE仅本批Electron主PID45974；共享44321/22 Provider43561保留，原用户dev实例不动。没有修改设置或产生新草稿。

## F3故障隔离/合法空delta有限收尾（2026-10-22 13:34–13:41）

先更正上一节主计划编号：**P2-D10=Context、P2-D11=轨迹**，该节已换回正确编号；保留原证据文件D10/D11文件名前缀以免破坏链接，文件名不作为主计划分类依据，事实未变。

验收点：缺child Journal重试时切健康子项错误隔离；合法header-only transcript空数组；恢复重开；空delta独占窗口DOM与后续正文。分组为可丢弃fault副本停机改文件→缺失/空/恢复正常启动，再独立回环Provider正常委派。原linked及业务Journal未修改，无商业请求。

|子点|结果|步骤与证据|
|---|---|---|
|F3-02 重试期间切健康子项不串错误|通过|仅fault短子f3fcd8e3…Journal临时改名。Electron64810进入父61fd…短子，1.5秒时确为“执行记录暂不可用，正在重试/正在加载”；立即回子列表进入健康长子2e9e1afe…，1.5秒后14711字符正确教学正文，末尾约6300字，未带错误文案。F3-fault-switch-isolation.json、F3-fault-switch-error.png、F3-fault-switch-healthy.png。此次没有重新等待20遍摘要窗口。|
|F3-02 合法空transcript|通过（持久空、有摘要）|停64810，在同可丢弃短子副本仅保留原合法Journal头记录，备份完整文件不动。真实Runtime68874公开getSubAgentTranscript返回0事件；初始UI正在加载，稍后自然重试完回父记录原Markdown摘要，未抛读取错误、无另一子内容。F3-header-only-empty.json/png。此样本是持久空，不能代签运行中暂空→后来非空。|
|F3-02 空transcript且无摘要|未覆盖（准确数据约束）|现有父已完成Explore结果持久含summary；header-only只改变子副本，不会消除父摘要。为造无摘要还需修改父工具结果语义，本批没有继续改父Journal、伪造preload或扩大故障类型，因此保留该组合。|
|F3-02 恢复文件正常重开|通过|停68874，将完整backup原样恢复，正常重开71564；同短子公开RPC17事件、实际UI3903字符且无错误。F3-switch-restored-rpc.json、F3-switch-restored-ui.txt。最终恢复Journal SHA256与未动原linked完全相等，F3-final-restoration.json。|
|F3-01 合法空delta独占窗口|通过（真实本地HTTP）|临时fixture-main绑定44353，真实explore CHILD_READ先read_file，再SSE空content停留10秒。Provider实际emptySentAt1792647623504；同调用子详情打开并等待2.2秒，DOM采样1792647626585（空后3.081秒），仍running，右栏只有用户任务和Read README.md，没有空助手气泡/大白块。F3-empty-delta-window.json/png、F3-empty-delta-timing.json。截图目视核对；单纯data-message-id选择器0并不作为唯一判断。|
|F3-01 空后正常内容/父继续|通过|同运行随后两段真实SSE文本+完成正文显示，子已完成，父第2步完成。F3-empty-delta-complete.txt；cu-empty-core.mjs保留空流及10秒等待，cu-empty-requests.jsonl不记录Authorization。没有将这次本地模型响应冒称真实商业Provider。|

清理：64810/68874/71564/74049均正常CLOSE，独立Provider73868（44353）TERM；ps逐PID确认均不在。fault settings与本批cu-empty-settings-backup.json字节相同；短child Journal与原linked SHA256相同。仅新增临时验收文件/报告，不改产品、dist、coverage，不碰共享剪贴板或共享43561 Provider。

## P2-D10 current Context真实生产与分页补验（2026-10-22 13:43–13:48）

验收点先列：固定制品生产者链；新真实工具会话current来源；entries两页/原文两段/路径两页；完成后与正常重开无装配边界。源码只作入口依据，UI与公开RPC分别记录。

只读链：`packages/context/engine/src/plugin.ts:getProjection/readEntry`查询Harness内存instances；`engine.ts:reconcile`提交current、`content-manifest.ts`生成稳定key/fullTextAvailable（conversation例外）；`packages/context/disclosure/src/plugin.ts:observe/hydrate`收read_file结构化actspace.context.file结果并建立路径；`packages/agent-service/src/application.ts:169`通过ManagedRuns.inspectCapability读取既有Harness projection。`apps/desktop/src/main/runtime-v2/context-panel-service.ts:describe/#projection`不恢复会话或发起装配，projection缺失就last-request/unavailable，原老历史fallback不据此报Bug。对应固定dist的engine/dist/plugin.js与agent-service/dist/application.js具同路径；未重建。

全新自有profile desktop-cu-context-current-profile-20261022、workspace `/tmp/actspace-cu-context-current-20261022`，110个短item文本及136558字节无敏感AGENTS，回环44355 fixture-main。唯一新会话dbab985d-94a1-4d45-abfe-5762b8fe8d45，真实Runtime批量110 read_file完成、第二步回复；仅HTTP模型响应受控，不商业、不改旧Journal。

|子点|结果|证据与边界|
|---|---|---|
|current来源/披露实际生成|通过|公开describeContextPanel为current-context/ready、revision5、275entries、disclosure ready周期0/活跃100睡眠10；UI当前上下文与路径计数一致。D10-current-new-panel.json、D10-current-ui-first.txt/png。真实Journal573事件，110工具result completed，结构化path对应自有文件。|
|真实UI entries至少两页|通过（275规模）|实际“加载更多明细（共275项）”200→275，类别由conversation200变完整222、规则1/工具21/Skills25等。随后同版本公开分页200+75，key唯一275、无重叠。D10-current-entry-pages.json。首次辅助RPC使用早期索引未就绪revision得到stale；UI真实加载已成功，刷新公开版本后对账，不把旧版本拒绝报Bug。不是12000项或所有275行同时可见的宣称。|
|真实UI路径两页|通过（活跃100）|点击显示活跃→平铺，12行；连续再显示两次到52，越过首50页，截图D10-current-path-first/second.png。相同currentVersion公开page50+50、唯一path ID100；游标/条目均保存D10-current-path-pages.json。睡眠只有10，不声称睡眠第二页。|
|真实UI原文两段|通过|规则→host/workspace-instructions→读取原文→下一页原文；两段各65535 UTF-8字节，nextOffset65535/131070，分别DOM全文与对应RPC完全相等，无字节重叠。D10-current-source-pages.json、D10-current-source-validation.json、D10-current-source-first/second.png。仅自有规则内容；后续尚有第三段，本点要求两段已满足。|
|完成后current持续|通过|同实例任务完成后仍current-context/ready revision5，D10-current-after-complete.json；不将“仅运行中”误作必要条件。|
|正常重开不主动装配|通过（即时状态观察）|CLOSE82359后同profile正常重开88174，无新请求；首次describe current unavailable/revision0/disclosure unavailable/entries0，D10-current-reopen-no-assembly.json。首样历史索引尚未就绪，不能由这一样本声称最终last-request已经ready；内存current不被只读查询重建，与生产链一致。|
|错误/重试/syncing与12000规模|未覆盖本真实批|没有自然读取故障；未注入preload或修改Journal。此批275entries/110paths的真实Runtime/UI证据与既有mock/12000服务证据分开。|

清理：82359、88174正常CLOSE；44355自有Provider82056 TERM并确认退出。全新fixture数据保留证据，未改旧profile设置/凭据或产品/dist/coverage，没有系统剪贴板。

## F3自然空内容/轨迹停止视觉最小批（2026-10-22 13:51）

验收点：无工具子请求空SSE保持25秒、无summary时公开transcript/UI是否为空与后续恢复；同运行主轨迹toolbar停止的细边框/hover。复用自有fault profile，独立44357，单次真实explore；没有商业请求或Journal编辑。

|子点|结果|步骤与证据|
|---|---|---|
|F3-02 无摘要、助手暂空→正文自动恢复|通过（实际语义）|父e477275f…/子90c1687a…，子不先用read_file，空content后保持25秒。空后2.538秒与22.373秒均running、hasSummary=false；UI仅任务，不显示永久空白/其他子内容。后续同HTTP流正文自动出现、子completed，RPC包含user_message/assistant_message/llm_usage。F3-empty25-observation.json、F3-empty25-before/after.png、F3-empty25-complete.json、F3-empty25-boundary.json。|
|F3-02 自然0事件transcript、无摘要重试|未覆盖（已实测具体约束）|两时点公开RPC始终1条user_message，而非0。Journal seq3任务user/message在空SSE之前已落盘（05:51:02.376 vs空流05:51:02.410）。对应task-ledger.ts:#claimEvents先写任务，client/sessions/chat.ts:projectChatEvents保留可见user节点，projectSubagentTranscript在此基础加chunk。因此等待空助手25秒不能自然触发0事件重试分支；本批不伪造RPC或改父/子Journal消除任务。已有header-only故障副本可证明持久空+有摘要，但不代签本组合。|
|16-A7 运行中主轨迹停止hover|部分通过/细边框失败候选|真实点击主“查看执行轨迹”，toolbar“停止”可见、34×20；hover文字rgb129,133,140→15,17,21，背景透明→rgba(38,49,72,.06)，可见反馈正常。computed border始终0px none；截图16-A7-trajectory-stop-hover.png目视无细边框。F3-empty25-observation.json保存normal/hover。源码trajectory.css:.tjb-action border:0与观察一致。若原点要求细边框，此子点失败；没有tooltip不是失败条件，也不将Composer代表代签。交主审统一登记，不改产品。|

清理：91741正常CLOSE、Provider91336:44357 TERM，ps确认均退出；fault settings与cu-empty25-settings-backup.json字节一致。无新草稿或在途运行、共享服务未停止。本批没有产品/dist/coverage编辑。

### 本批 P2-D11 缺性能事实边界补注

- **未覆盖**：本批收到补充点时 Electron 与 Provider 已正常结束；未为补点新增请求或重开。只读核对 `tmp/codex-acceptance/20261021-actspace-full-acceptance/cu-empty25-core.mjs:81/83`，完成 chunk 明确附带 usage。本批未观察缺 TTFT/吞吐量事实时的真实轨迹详情 UI，不以合成历史或 transcript 的 llm_usage 事件代签该子点。

## T3/T5/D11 最后有限普通补测（2026-10-22 14:05–14:20）

方法：固定 dist 的真实 Electron/CDP、自有 linked/fault/workbench profile；无模型请求、无剪贴板。T3 数据是100轮1000工具合成历史加既有第101轮，不冒称实际LLM负载。执行顺序为历史/Usage→大diff→新启动首开修正采样→既有失败请求详情。

|验收子点|状态|步骤与证据边界|
|---|---|---|
|T3 正常新启动首次进入|通过|搜索唯一标题后，计时从点击开始到会话消息 Answer 100 可见再双requestAnimationFrame。534.37ms；不是清系统缓存的冷读。T3-ui-newstart-first.json。|
|T3 重复进入|通过|后退再点唯一标题，Answer 100可见+双RAF；149.65/129.14ms。T3-ui-finite-timings.json。|
|T3 向前真实UI分页|通过|点击概览加载更早，等aria-rowcount改变、加载态消失、滚到页顶再双RAF；五页163.71/179.96/196.95/211.67/196.64ms，最终Question 1可见并截图。首次旧脚本错误终点已废弃，不算产品超时。|
|T3 已加载早期/近期切换|通过|实际scrollTop到顶/底，Question 1/V01_OK可见+双RAF；早期64.64/49.07ms，近期75.02/65.54ms。T3-scroll-finite.json。不是重新后端分页计时。|
|T3 Usage筛选/刷新|部分通过|7天/全部各2次，等待请求数非占位及双RAF；刷新等待按钮非disabled及双RAF。T3-usage-ui-finite.json/png。此结束条件证明UI反馈，不能独立证明后台重建完全结束；首次设置页进入到首个查询完成未计时。|
|T3 Context fallback计时|未覆盖|本批未再打开current profile；已有正常重开current unavailable事实可复用，但无本批UI反馈耗时。275current两页证据独立，不挪作fallback计时。|
|T5 纯大diff两轮|通过|真实Review未提交+6000/-6000；文件列表→diff原文original 0可见+双RAF；窗口1000×700/1400×900变更后同原文可见+双RAF；关闭Review到关闭按钮detached+双RAF。原始JSON在workbench/evidence/T5-large-diff-finite.json。两轮均无>1s候选。尺寸恢复原工作台常用1400×900；未新建shell。|
|P2-D11 缺首token事实|通过|只读筛linked、fault及approval既有Journal；单看step/end会漏，改查delegation/tool失败事件，选择既有真实HTTP400子请求。父1907cbb5-54d7-4e4d-a035-e41bafaec84f→Subagent failed→查看轨迹→子助手“—”详情；child a5f4bbf6-c7e5-4d55-af52-ec4aec662ac0、request bb101796-86f7-4a67-a7e2-f247f8321358。总时长9ms、状态失败、0tok；首token/生成/吞吐量均显示“首 token 时间不可用”，没有数值。D11-real-failed-unknown-timing-ui.json/png。这里0tok是Runtime失败记录实际值，不称usage完全缺失；后者仍未覆盖。|

计时采用Node performance.now，包含Playwright调用传输与UI等待；不是纯渲染微基准。双RAF是本批布局稳定近似条件，不保证所有异步后台已闲置。以下资源为Electron app.getAppMetrics采样的workingSetSize(KiB)，不是ps RSS；CPU是工具采样区间percentCPUUsage，并非峰值，未GC。不得将working set换名RSS。

|操作|ms|main PID / CPU% / working set KiB|renderer PID / CPU% / working set KiB|
|---|---:|---|---|
|enter-warm-1|149.65|14114 / 0.402 / 149024|14124 / 1.402 / 186464|
|enter-warm-2|129.14|14114 / 2.300 / 155392|14124 / 8.555 / 219056|
|open-trajectory-first|114.69|14114 / 0.250 / 155440|14124 / 6.038 / 258160|
|new-start-first-enter|534.37|42195 / 5.053 / 260784|42259 / 2.428 / 190320|
|first-page-1|163.71|42195 / 1.087 / 255904|42259 / 8.934 / 279872|
|first-page-2|179.96|42195 / 1.398 / 261792|42259 / 11.411 / 311520|
|first-page-3|196.95|42195 / 0.692 / 267936|42259 / 5.982 / 318496|
|first-page-4|211.67|42195 / 1.160 / 253392|42259 / 10.563 / 375200|
|first-page-5|196.64|42195 / 0.971 / 252976|42259 / 13.986 / 412352|
|recent-0|75.02|14114 / 0.136 / 91392|14124 / 0.275 / 119280|
|early-0|64.64|14114 / 0.446 / 92048|14124 / 20.803 / 175408|
|recent-1|65.54|14114 / 0.296 / 92096|14124 / 2.353 / 176160|
|early-1|49.07|14114 / 0.407 / 92144|14124 / 3.608 / 178176|
|7 天-0|59.70|14114 / 0.090 / 98288|14124 / 0.223 / 111824|
|全部-0|65.13|14114 / 0.381 / 98480|14124 / 1.357 / 114624|
|refresh-0|99.26|14114 / 1.319 / 113008|14124 / 1.375 / 120464|
|7 天-1|65.70|14114 / 0.355 / 113056|14124 / 0.748 / 121120|
|全部-1|64.35|14114 / 0.426 / 113088|14124 / 0.977 / 121712|
|refresh-1|100.09|14114 / 0.945 / 117760|14124 / 1.154 / 119600|
|to-file-list-0|54.18|31431 / 0.068 / 143168|31442 / 0.095 / 127264|
|to-large-0|79.82|31431 / 0.376 / 143216|31442 / 2.540 / 144448|
|resize-0|32.84|31431 / 0.391 / 143808|31442 / 0.360 / 144464|
|close-0|64.31|31431 / 0.637 / 144592|31442 / 1.327 / 146400|
|to-file-list-1|87.98|31431 / 0.113 / 126480|31442 / 0.357 / 119600|
|to-large-1|125.32|31431 / 0.912 / 133280|31442 / 8.125 / 159216|
|resize-1|48.86|31431 / 1.155 / 136912|31442 / 4.740 / 164064|
|close-1|64.97|31431 / 0.403 / 137072|31442 / 1.295 / 165104|

清理：首次非TTY驱动stdin关闭而残留的自有Electron13126已TERM；之后14114/31431/42195/44584均正常CLOSE，最终ps五PID均不存在。未启动Provider、无新增请求；无产品/dist/coverage修改。旧脚本一次错误重复定位、一次尺寸outerHeight条件不适用于实际窗口未计性能失败，已限定修正并保留本节有效样本。

### Context 仍余真实错误恢复/压缩全链路的最小前提（本批不调用）

- 历史只读Context缺current是设计降级，不能用它制造错误。真正entry/source/path错误恢复需要自有活跃Harness已有current snapshot后，让公开Context实际读取返回合法retryable错误；当前loopback LLM控制并不能控制Context读取，且禁止preload/RPC伪造。可以在仅可丢弃profile副本中安全移动当前内容存储来探测自然读错，但需先确认内容实际是否仅内存、磁盘故障会否触发该入口，否则不能承诺能构造。
- 压缩全链路需真实Runtime达到当前模型context阈值且出现可执行压缩入口/事件，受控Provider正确上报用量并确认当前context model容量；现275entries占用不证明跨过阈值。本批不改模型容量/阈值、不追加请求凑负载。最小后续路线是独立profile一条受控会话累积自有安全文本到实际阈值→触发真实压缩→对账压缩事件/保留近期消息及Context变更；若当前Chat-only自动压缩或Agent无手动入口，应按实际模式记录，不以服务12000项代签。

### F3-02 与 Context 后续最小路线只读评估补注

- F3 既有父取消样本并非无摘要：`F3-cancel-projection.json` 的父session `be150a5d-9155-4590-8bd4-a19126cf7c75` 对 child `8521bd75-d0f9-4279-9e1b-d11ca57051e3` 明确 `state=completed, summary=null`；`F3-cancel-after.json` 为子已停止且含23个流片段；子Journal141124 bytes，含assistant/chunk、assistant/message、step/end和tool/result。故不是“hasSummary=false”的可用父子来源，不能用header-only副本冒称自然临时空transcript。
- 另外本批真实失败子 `a5f4bbf6-c7e5-4d55-af52-ec4aec662ac0` 不是零事件：Journal记录assistant/message finishReason=failed、usage 0/0以及step/end、task/run事件；UI也有真实用户任务和运行信息。因此也不能直接复制并清空它来代表真实0事件；那将改变本次要验的事件事实。F3-02自然空delta25秒采样子已有user_message一条的事实不变。可保留的无摘要/0事件路线需要先找到自然父投影中实际 `hasSummary=false` 的子，且确认仅对可丢弃profile副本能故障隔离该子Journal而不改父声明；当前只读搜索没有找到满足条件的既有样本，故不执行损坏注入。
- D11其他profile只读筛选覆盖自有fault与approval-queue隔离目录，仅选出失败委派用于UI实测；未发现更合适的无usage正常或取消样本。失败请求detail上的“首token时间不可用”已经真实展示；完整usage缺失时的UI仍未覆盖。

### 最终本批执行过程修正说明

T3第一次启动时会话列表因读取暂失败，实际点击的是重试后进入的暖profile；故该组初始两次149.65/129.14ms按“暖重复进入”记录，不能称首次启动。其后使用唯一标题与会话正文 `Answer 100` 作为条件，在同一固定profile新启动后实测首次534.37ms。初次错误使用日志文本词/工具名作为分页加载条件会落在旧正文，且第一次scroll等待选择器曾严格匹配到隐藏消息；这些尝试不纳入原始性能值。改为点击 `点击加载更早的历史`、观察表格 `aria-rowcount` 更新、等 `data-earlier-history` loading态消失及首轮正文出现后，取得163.71–211.67ms五页有效样本。

### P2-D10 Runtime 压缩与读取恢复补验（2026-10-22 15:00–15:07）

本批验收点：手动压缩真实链路、压缩前后容量/来源/revision、摘要与近期消息持久身份、读取错误自然构造条件、正常重开 fallback UI 首次/重复耗时。路线：复制自有 current profile → 同固定 dist 的真实 Electron/CDP + 自有回环 Provider → 普通短轮装配 → `/compact` + summary-hold → 释放 → 下一普通短轮装配 → 正常退出重开计时。没有商业请求；3 次 HTTP 请求（2 普通、1 summary），未改模型容量、压缩阈值、产品或 dist。

独立副本：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-context-compact-20261022/profile`；只把其既有 fixture connection 改到本批 44359，控制44360。原 current/linked profile 未动。会话 `dbab985d-94a1-4d45-abfe-5762b8fe8d45`。以下证据均在 `tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/`。

|子验收点|终态|方法与事实/证据|
|---|---|---|
|P2-D10 手动压缩真实链路|通过|实际 textarea 输入 `/compact`，UI“正在压缩上下文”；本地真实 HTTP summary-hold 后释放，UI“上下文已压缩 · 114 条消息 · 18s”。Journal seq593/594/595/596 为 start/summary/surface-replaced/end，同 compactionId `0942a614-cebe-4e75-bcb4-374d218e1612`，duration17500ms。`D10-compact-held.json/png`、`D10-compact-after.json/png`、`D10-compact-journal.json`。|
|P2-D10 当前来源/revision/估算与摘要|通过|压缩前 current-context/ready revision3，28410估算token、277项；压缩刚完成未重新装配时仍 revision3/28410，统计压缩次数已1。下一真实短轮后 revision5，21822token、57项，summary70/conversation51；disclosure cycle0→1，active100保持、sleeping10→11。记录时点差异，未把即时旧快照隐去。`D10-compact-before.json/png`、`D10-compact-reassembled.json/png`。|
|P2-D10 容量事实|通过（未知呈现）|fixture-main 无 contextWindow/autoCompactAtTokens事实，RPC均null，UI容量“—”；未造固定容量。没有覆盖已知容量自动阈值触发。|
|P2-D10 摘要与近期保留身份|通过（实际规则）|新摘要messageId `compaction-3a6377ea-d372-4723-8843-7a46725323aa` 对应seq595 surface replace；压缩前最近assistant `e0d581ff-a6f1-49e5-b634-ca61e5a17f87`仍为conversation，新增B user `7c4b1f3a-cfe3-4655-b4fe-4f7cb8f61e9f`/assistant `65a646f6-c10d-450c-8d2f-b993e5ba7bcf`均与Journal吻合。A user已纳入摘要，不声称整轮全部保留。`D10-compact-retained-message-ids.json`。|
|P2-D10 原文真实读取错误→重试恢复|未覆盖（明确生产链条件）|只读确认 ContextPanelService.ts:84–101 从 cached view/projection校验revision/generation后调用readContextEntryText；context engine plugin.ts:25–28 直接从实例内存view的 describeContextContent.text map读取。当前 snapshot 原文不再读源文件，移动/截断自有源文件不能自然触发该原文读取I/O错误。未进行无效文件破坏，未伪造RPC/preload或主动传错revision冒充UI。最小下一条件：实际装配/切换造成自然 stale revision 窗口且UI仍可点击旧行，或产品支持真实可触发的原文读取失败源；现有数据不保证可达。此处是具体数据/时序前提，不是原生工具限制。|
|T3 Context fallback UI 首次/重复|通过（实际耗时）|正常新进程PID14290，点击上下文用量→完整上下文→“上下文趋势”可见+双RAF为终点；首次1399.07ms、关闭再开157.61ms。RPC旁证 last-request/stale revision0/history ready，非current；未把RPC耗时作为UI。`D10-compact-fallback-timing.json`含main/renderer app metrics（workingSet KiB、CPU，非ps RSS、未GC）；`D10-compact-restart-fallback.png`。首次>1秒为性能观察，不自动判断泄漏或根因。|

剩余边界：自动阈值压缩未制造；真实原文读取错误/重试恢复尚缺上述自然失效时序；压缩摘要语义质量是固定受控内容，只证明真实压缩执行、投影与持久化链路。现有275项current/原文两段、真实分页证据仍独立，不冒称12000项。第一次完整上下文定位误用 getByText 导致30秒定位超时，改为真实aria button后成功；这是验收脚本入口错误，不是产品失败。

清理：本批两个 Electron 均通过 CLOSE 正常退出，Provider SIGINT退出；PID6542/14290/6502及44359/44360监听复核均不存在。隔离副本保留证据，未写回原配置；无活动请求、未触共享剪贴板。

### 原生 CUA 现时可用性有限复核（2026-10-22 15:09–15:11）

本批验收点：正确固定构建实例绑定；原生截图/一次无副作用菜单开关；绑定成功后才进行系统外观随动和合法自有PNG原生文件选择。实际分组为 inventory/身份→唯一绑定→可用才继续交互。无商业请求、无产品/dist修改、无系统凭据面板操作。

|验收点|结果|实际步骤与证据|
|---|---|---|
|原生工具 inventory|通过（能力清单）|本轮 `await cua.getState()` 成功，列出原生应用和Chrome；其中用户dev实例为 Actspace Dev actspace-agent-2067 / com.actspace.desktop.dev.w2067fa05，未绑定/操作该实例。清单成功不等于本批实例可控。|
|本批正确实例身份|通过（运行时/进程检查）|唯一新实例PID21062，固定 `apps/desktop/dist-electron/main/index.js` + `apps/desktop/dist/index.html`，全新丢弃profile；app.getName=ActSpace Native Recheck 20261022，env/app配置ID=com.actspace.acceptance.native20261022。实际可执行Electron.app的CFBundleIdentifier仍为com.github.Electron；配置AppUserModelId不能冒称macOS bundleID已改变。`desktop-cu-native-recheck-20261022/identity.json`。|
|正确实例原生绑定|未覆盖（当前工具拒绝）|唯一调用 `let nativeRecheckApp = await cua.getApp("ActSpace Native Recheck 20261022");`，立即返回 `Invalid app: ActSpace Native Recheck 20261022`。发生于2026-10-22约07:10 UTC，07:10:44Z补采时间/ps。没有取得handle，未重试bundle/path、更未绑定通用Electron。此结果仅证明当前name入口拒绝，不能凭此确定同bundle多实例就是根因。|
|原生截图/无副作用菜单开关|未覆盖|前置目标handle获取失败；没有用CDP截图或模拟事件代签。|
|真实系统外观随动|未覆盖|依赖原生正确实例可控，本轮前置失败；未改系统外观。|
|自有PNG原生文件选择|未覆盖|依赖原生正确实例可控，本轮前置失败；未触其他应用或系统选择器。|

当前 CUA 入口说明提供 getApp(name/bundleID/path)，未暴露PID或windowID绑定API。未试不受支持参数，也未复制/改签Electron.app或绕过工具拒绝。证据：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-native-recheck-20261022/native-binding-result.json`；准确区分运行时appName/envID与实际bundle身份。下次最小前提为CUA能识别此唯一实例的名称或提供可按PID/窗口安全选择的入口。

清理：仅本批PID21062通过CLOSE正常退出，ps复核不存在；全新profile没有模型请求、没有打开文件或共享剪贴板操作。用户dev实例未触碰。

### P2-D09 真实商业 Provider 自动审批独立子项（2026-10-22 15:13–15:20）

验收点：启用自动审批、既有DeepSeek真实审核结果、单一无害工具执行/Journal/UI一致、隔离设置恢复与进程清理。路线：复制自有linked profile，公开settings.getV4/updateV4配置；主会话/utility/explore都指向回环fixture-main，autoReview单独绑定原有`deepseek:deepseek-flash`，DeepSeek baseUrl保持原null（官方默认），未读取/提取Key或绕过safeStorage。以公开sessions.create建立自有fixture-workspace测试会话，再公开setPermissionMode启用auto-review，实际Composer提交。新workspace未注册被拒后使用已有自有fixture-workspace，未改用户工作区注册。

|子点|结果|实际证据|
|---|---|---|
|自动审批启用与独立商业审核路由|通过|会话 `67d54bae-cc7e-4cec-959b-05ed75783471` Journal seq1 permission/mode-set=auto-review。公开settings捕获autoReview=deepseek:deepseek-flash，主/utility/explore=本地fixture-main；本地Provider日志只有2个主请求，isReview未走本地服务。首次临时配置选错fixture定义，尚未发送请求前已改正，DeepSeek官方连接恢复后才提交。`evidence/routing-facts.json`。|
|真实审核接受|通过（路由+真实结果联合证据）|工具唯一命令 `printf 'acceptance-auto-review'`。Journal seq17 approvalMode=auto，approvalReason=`User explicitly requested this exact one-time printf command, which is harmless and within scope.`；与auto-review源码真实llm.prepareAsync(routeId:auto-review)→JSON decision解析路径一致，主fixture无此文本。无人工点击批准。仅一次商业审核；没有另发拒绝/错误商业样例。未独立抓取TLS响应或商业账单，不据此声称账户计费已对账。|
|实际副作用及安全范围|通过|seq15 bash同callId `fixture-1792653227193`，seq17 completed，exit0、sandboxed=true、15ms，stdout正好acceptance-auto-review，cwd为本验收自有fixture-workspace。未读取文件/仓库资料、未新增工具调用、未创建结果文件。`evidence/review-journal.json`。|
|UI最终完成|通过|真实UI自动结束为Fixture completed，用量240tok、1轮2步；截图及DOM `evidence/real-review-completed.png`、`real-review-ui.json`。|
|商业拒绝/错误→人工接管|未覆盖（本批未发生）|本次审核接受，未消耗第二次商业请求制造拒绝/错误；既有受控true/false/400证据保持独立，不能代签商业拒绝。|
|恢复/清理|通过|公开updateV4恢复本批models原值并返回ok；临时完整settings备份删除，无Key输出。Electron29327通过CLOSE退出；provider29023 SIGINT退出；driver29326在Electron退出后readline进程仍存活，随后仅对该自有driver TERM清理。不触用户dev。|

本批证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-real-autoreview-20261022/`。本地路线没有验证真实Host授权/能力硬边界，保持独立未覆盖口径。未改产品、dist或coverage。


## 14-A5 独立有限内存确认（2026-10-22 15:44 CST）

验收点与分组：①新profile固定生产dist、仅回环Provider、同main/renderer PID；②预热后逐轮真实UI新建→发送极短文本→收到真实HTTP回复→切回锚点→hover归档→行消失；③各轮同5秒空闲后CDP collectGarbage，采JS heap与ps RSS/CPU；④预算和清理。按预热→连续生命周期采样→只读对账→关闭分组，不用分组通过代替子点。

方法是**真实Electron/CDP自动交互**，不是原生AX，也不是人工DevTools GC。`file:///.../apps/desktop/dist/index.html`固定制品，无重建；本批新profile仅复制此前隔离settings/workspace登记，不复制真实secrets；通过公开modelConnections.update加入合成`fixture-only`，连接仅127.0.0.1:44461，未使用商业Provider。初次缺合成凭据时模型菜单无匹配，尚未发送请求；关闭后用同一可丢弃profile重开，加入合成凭据并reload；**下列基线及全部负载始终main56805/renderer56857**，无再reload/换PID。初期定位新建按钮一次使用错误名称超时，改为exact“新建会话”；这是自动化定位更正，不记产品问题。

| 验收子点 | 状态 | 事实及证据 |
|---|---|---|
| 新隔离profile、固定dist、同PID与本地流量 | 通过 | `desktop-cu-14a5-confirm-20261022/driver.mjs`、provider*.mjs；全部采样metrics同56805/56857。 |
| 六轮每轮12个完整生命周期 | 未覆盖（预算执行偏差） | 预热实际2个主请求，已占总预算；故严格守最多72主请求，测量执行12/12/12/12/12/10，共70个，不把末轮称等规模12。前五轮每12完整通过、末轮10完整通过。预热一条锚点保留、一条已归档；最终公开sessions.list({archived:true})有71条，均agentRunCount=1；非归档仅锚点。未为了补两次超预算追加请求。 |
| 同阶段CDP GC/heap/ps样本 | 通过 | 每轮切回同锚点，空闲5秒，HeapProfiler.collectGarbage→Runtime.getHeapUsage→app.getAppMetrics→ps。`evidence/memory-six-rounds.json`保存原始值，`ui-memory-round.mjs`保存操作与条件；CPU是采样瞬时值，不承诺全空闲。 |
| heap收敛结论 | 未覆盖（本窗口未见平台） | 五个等规模12轮加一个10轮，GC后usedSize每次仍增；增量不单调下降。没有足够证据认定收敛，也不据此认定泄漏；不同PID旧结果不拼接。严格六轮等规模确认尚差末轮2次，但本批预算已用尽，不追加。 |
| 请求数对账 | 通过 | requests.jsonl：总144次HTTP=72主+72自动标题，其中预热2主+2标题、测量70主+70标题；utility=null仍发生自动标题，逐笔记录而未隐去。只发送无敏感短文本。 |
| 正常清理 | 通过 | Electron CLOSE后main/renderer均消失；driver readline保持stdin的进程用SIGINT/TERM结束，44461/44462均无监听。未改产品、dist、coverage、performance。 |

下表累计数排除2条预热；RSS为ps KiB，CPU为ps%，主/renderer依次。时间UTC。各样本均明确GC；不以RSS代替JS heap。

| 轮 | 累计测量生命周期 | UTC时间 | used heap B | 较上次 B | RSS KiB 主/renderer | CPU% 主/renderer | 累计主/标题请求 |
|---|---:|---|---:|---:|---|---|---|
| 0 | 0 | 2026-10-22T07:37:41.998Z | 12,565,204 | — | 161728 / 140208 | 0.1 / 0.1 | 2 / 2 |
| 1 | 12 | 2026-10-22T07:38:26.929Z | 15,358,628 | +2,793,424 | 320096 / 162992 | 1.1 / 1.0 | 14 / 14 |
| 2 | 24 | 2026-10-22T07:39:21.486Z | 15,659,016 | +300,388 | 337616 / 158416 | 2.1 / 27.4 | 26 / 26 |
| 3 | 36 | 2026-10-22T07:39:58.149Z | 15,872,548 | +213,532 | 333760 / 156144 | 1.6 / 1.7 | 38 / 38 |
| 4 | 48 | 2026-10-22T07:41:18.284Z | 15,983,328 | +110,780 | 344240 / 152480 | 2.4 / 1.3 | 50 / 50 |
| 5 | 60 | 2026-10-22T07:42:03.750Z | 16,246,380 | +263,052 | 371056 / 156144 | 2.4 / 0.9 | 62 / 62 |
| 6 | 70 | 2026-10-22T07:42:42.517Z | 16,348,032 | +101,652 | 341616 / 155760 | 1.9 / 15.4 | 72 / 72 |

证据目录：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-14a5-confirm-20261022/`，关键文件`evidence/memory-six-rounds.json`、`evidence/archived-sessions.json`、`evidence/final-anchor.png`、`evidence/ui-memory-round.mjs`、`requests.jsonl`。本批没有新增Bug结论；仅保留GC后仍增长的有限观察。


## P2-D11 完整 usage 缺失有限真实 Runtime 补验（2026-10-22）

验收点：①成功SSE正文且全部frame无usage；②真实Journal事实是否保持缺失；③主轨迹请求详情TTFT/生成/吞吐/Token及用量页；④请求预算与清理。按新隔离配置→一次发送→轨迹详情与Journal对账→关闭分组。方法为**固定dist真实Electron/CDP**，无原生AX复试；不注入projection/Journal/preload。

| 子点 | 结果 | 实际步骤、事实与证据 |
|---|---|---|
| 本地HTTP成功正文、usage全字段省略 | 通过 | 新profile `desktop-cu-no-usage-20261022/profile`，公开modelConnections.update仅合成fixture-only；127.0.0.1:44465。UI发送“Acceptance no usage: reply with harmless text.”；Provider先content、500ms后content、stop、DONE，全frame无usage。实际请求body存`http-bodies.jsonl`，不含Authorization；响应frame存`http-responses.jsonl`，usagePropertyPresent=false。无商业请求。 |
| Runtime完整usage缺失目标形成 | 未覆盖（Runtime补零，目标未形成） | session `4660b8e7-34c7-4b9e-86af-4bb1a696229e`，request `93b72d2c-1c3c-434e-bed0-8be07c33d6ea`；Journal seq14 assistant/message与seq15 step/end均usage inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens=0，reasoningTokens=null、cost=null，source=provider-reported。未修改这些事实。`evidence/journal-facts.json`。这是缺usage被归一为provider-reported零的事实候选，交主审；不能将该结果签作缺失未知态通过。 |
| UI主轨迹请求详情/用量与Journal一致 | 通过（零值呈现事实） | 点击“查看执行轨迹”→“请求 #1”，概述显示完成、输入0 tok/输出0 tok、总526ms/首token24ms/生成502ms/吞吐0.0tok/s；再真实点“用量”，本次与累计均各0 tok。两个助手chunk时间05.913Z与06.414Z，request/context05.889Z、assistant/message06.415Z，支持真实计时约24/502/526ms；没有理由要求TTFT未知，因为运行时已观察到chunk。`evidence/request-detail.png/.txt`、`usage-tab.png/.txt`。 |
| “全部usage未知”UI呈现 | 未覆盖 | 当前合法成功响应已省略usage，但Runtime归一为零后UI不再取得完整缺失；最多预算2主请求，本批1主+1自动标题已足以确认此路径，不追加同构重复。最小前提是Runtime保留真实“未报告usage”事实，不能靠修改Journal或伪造projection凑状态。 |
| 预算/清理 | 通过 | 1主请求+1本地自动标题，全部无usage。main69540固定生产renderer，Electron CLOSE正常退出；driver readline随后SIGINT退出，Provider69382停止，ps/pgrep及44465监听均为空。未改产品/dist/coverage。 |

首个等待器因正文、标题、侧栏标题同文而strict-match报多元素；已确认真实正文并直接进入轨迹，不重新发送，属于定位脚本边界。证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-no-usage-20261022/`。当前推荐方向仅作为主审后续定位线索：检查Provider适配层缺usage的缺失/零值与provenance保留；本批不修复、不推断UI根因。


## P2-D15 输出背压用户行为：最终只读证据复核（2026-10-22）

验收点先列：①有限大量/持续输出期间界面仍可操作；②切终端/会话、关闭/重开时输出归属与marker；③活动输出子进程及shell清理；④源码机制旁证与证据边界。路线为读取原计划→工作台/Host原始证据→当前源码→逐点映射；本批未启动应用/子进程，未新增模型请求，也未改产品/dist/coverage。计划P2-D15原文只要求“输出背压”，不要求极限压力、直接订阅计数或内部pause命中计数；这些不作为新增完成门槛。

| 子点 | 结果 | 已有真实证据与本次复核 |
|---|---|---|
| 有限持续输出中可响应用户操作 | 通过（复用真实Electron/CDP证据） | 工作台报告D15/T5记录20000行及持续600×sleep.05，切终端32–49ms/持续输出中切换57ms；`desktop-workbench-20261022/evidence/terminal-load.json`真实保存六次终端切换49/37/44/38/37/32ms。更强独立行为证据是Host queue-memory有限6000条循环、每条约530B、sleep5ms，已输出至QM_OUTPUT_002654时真实Control+c成功，KeyboardInterrupt后UI输入QM_AFTER_INTERRUPT继续执行。`host-git-followup-20261022/queue-memory/terminal-proof.json`的before/afterInterrupt保存实际屏幕，writer28527消失而shell27902仍在。该持续大输出+可中断/继续输入满足本计划有限用户行为，不声称极限吞吐或内部pause一定命中。 |
| 20000行终点marker的独立证据边界 | 未覆盖（本次未独立核实终点） | 原工作台报告文字称LOAD-020000，但本次打开`terminal-load.png`实际为选中的终端2，显示SECOND_SHELL=39069，不是终端1的LOAD终点；`terminal-load.json`只存timings/metrics。因此本次不以该图签20000终点，也不否定原执行观察。背压行为结论有上述独立持续输出/中断/关闭证据支撑，不依赖该终点截图。 |
| 切会话/工作区后归属及marker保留 | 通过（原有独立子步骤） | Host closeout的A/B/C三个session/两个专用workspace分别持有不同终端，返回A/B marker仍可读，PID/CWD匹配；`closeout/terminal-ownership.json`与terminal-a/b/c-return.png。不声称该跨会话样本同时正在20000行输出。 |
| 活动输出关闭→重开可用、无旧输出混入 | 通过 | queue-memory第二有限输出writer32384在QM_CLOSE_OUTPUT_001465附近仍运行时真实点击关闭；terminal.list空，shell31084与writer32384均消失。重开shell33562，UI输出QM_FINAL_SHELL=33562且没有旧流；`terminal-proof.json`的beforeActiveClose/afterActiveCloseProcesses/finalScreen与terminal-active-close.png、terminal-final-reopened.png。这覆盖关闭消费者与重建终端后的用户可见输出隔离，不要求未设计的“关闭后恢复已关闭旧shell全历史”。 |
| 正常退出无本轮孤儿 | 通过（复用清理证据） | queue-memory/cleanup-final.json及Host报告：main3919/helpers3958/3959/4021、shell27902/31084/33562、writer28527/32384逐PID退出后均无残留；Provider63320关闭。另工作台terminal-close.json记录37898/39069关闭后均消失。 |
| 当前源码机制旁证 | 只读，不独立代签UI | TerminalRenderView.tsx data事件在terminal.write回调后ack，unmount unsubscribe/detach/dispose；terminal-session-service.ts输出16ms批次、32KiB IPC块、256KiB未ack暂停/64KiB恢复、128KiB replay上限；detach清unacked并resume，关闭terminateProcessTree后dispose。与已有行为相符，但不据源码宣称本次测到内部pause或0订阅。 |

终态判断：**P2-D15“输出背压”的有限macOS真实用户行为已有充分证据，可按该子点通过；不再把“完整背压极限/直接订阅计数未量测”当原计划缺口。** 20000终点截图自身不足保留为证据边界，不扩大为整个背压未覆盖。各原始动作来自既有独立隔离Electron/CDP执行，本批只是只读复核，非新native验证、非跨平台签收。既有实例已清理，本批未启动任何进程，停止追加测试并等待主审。


## V04 480px 浅/深视觉、状态与焦点有限补验（2026-10-22）

验收点：Composer中文/空输入和发送运行态；设置外观窄屏布局/选中状态/Esc；+菜单边界/Esc；队列运行/暂停与菜单Esc；Context文字/边界/Esc。先读coverage V04及既有480 Context/子轨迹证据，只补五个代表场景，不代签System随OS/IME/VoiceOver。分组：同480窄窗浅色Composer/设置/菜单→一次本地hold建立队列/Context→深色复用→停止/恢复/清理。方法为固定dist真实Electron/CDP，main81373；本批没有运行系统拒绝的ActspaceDev路径。

证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-cu-v04-20261022/`，原始焦点/rect/text为`evidence/v04.json`。BrowserWindow480×900，DOM480×864，deviceScaleFactor2，截图960×1728不误当960CSS宽。全程仅127.0.0.1:44467/44468、合成fixture-only，无商业。

| 子点 | 结果 | 实际步骤及证据 |
|---|---|---|
| Composer浅/深480视觉与输入状态 | 通过 | 中文草稿真实输入，浅色有文发送enabled，运行空输入显示停止，有草稿则“加入队列”；深色中文不裁切，底部模型/运行位置仍可读。DOM scrollWidth480，浅色textarea实际focus后Esc仍TEXTAREA“消息输入框”。composer-light.png、composer-dark.png；未把停止按钮在有草稿被加入队列替换误报缺按钮。 |
| 设置浅/深480布局与主题选中 | 通过（外观代表） | 实际侧栏设置→外观→浅/深选择，主题卡片/文字/强调色/字号可读；窄屏导航横向滚动，正文独立纵滚，并非页面内容裁切。settings-light.png、settings-dark.png。只验外观代表，不称所有设置页均逐一480检查。 |
| 设置Esc退出/回焦 | 未覆盖（不构成既有第二Esc路线复核） | 两主题单次Esc后即时仍在外观页，activeElement为主题BUTTON（aria-label浅色/深色），后真实点返回应用成功。本批没有完成BUG-018的原第二Esc路线与稳定等待，不加强或推翻既有记录。 |
| +菜单浅/深480视觉 | 通过 | 实际打开Plan/Chat/图片/Skills菜单，浅色dialog x61/y233/w358/h163，全部在480×864内；深色同入口文字可读。menu-light.png、menu-dark.png。 |
| +菜单Esc回焦 | 未覆盖（即时BODY、未等待稳定） | 两主题Escape后直接采activeElement=BODY，没有显式卸载/setTimeout/rAF等待；预期应回textarea，不是+按钮。浅色v04.json，深色menuEsc。稳定回焦尚不能签失败，见本节时序更正。 |
| 队列浅/深480视觉、运行状态及菜单 | 通过 | UI发送V04 local hold（真实Runtime/HTTP），再UI发送V04 queued draft入队但未执行。两主题显示队列文字/引导/删除/更多，运行中停止按钮可用，菜单有编辑/上移。queue-light.png、queue-dark.png、queue-menu-light.png、queue-menu-dark.png。清空草稿后真实点停止，显示Stopped/已暂停/继续发送，queue-paused-dark.png；没有为覆盖暂停在浅色再发请求。 |
| 队列菜单Esc回焦 | 未覆盖（即时BODY、未等待稳定） | 两主题更多菜单Esc后直接采BODY，未显式等待菜单卸载/焦点恢复。v04.json只证明即时状态，稳定回焦未判定。 |
| Context浅/深480视觉/状态 | 通过 | 两主题实际点上下文用量—，current≈19.9K/未知容量，分类文字可读。浅深dialog均x18/y349/w444/h271，right462/bottom620在DOM480×864内；context-light.png、context-dark.png。无容量事实正确为—，未伪造占比总量。 |
| Context Esc回焦 | 浅色即时回触发；稳定时序未覆盖 | 浅色Esc后直接采BUTTON“上下文用量—”；深色设置返回序列后直接采BODY；均未等待卸载/定时回焦，不能从即时BODY签稳定失败，更不推主题根因。v04.json保存即时事实。 |
| System随OS、原生IME/VoiceOver | 未覆盖 | 本批CDP只实际选择浅/深并恢复跟随系统，未有原生OS外观/输入法/朗读观测能力，不代签。 |
| 恢复与清理 | 通过 | 停止真实hold，删除排队消息、清空中文草稿，实际UI主题恢复跟随系统。requests.jsonl仅1主+1本地标题，队列未变第二主请求。Electron CLOSE后main81373消失，driver readline SIGINT结束，Provider停止，pgrep与44467/44468监听为空；未改产品/dist/coverage。 |

有限自动化定位说明：初始480侧栏收起，直接定位设置按钮超时后按可见展开侧栏入口进入；主题是带span的主题选择卡，不是role button文字，改用实际可见浅/深span点击。一次TTY长指令在执行前截断，Ctrl-U清除后由tmp文件执行，未新增请求。截图已人工视觉检查代表settings-dark/composer-dark/queue-light/context-dark；其余同路线图片与DOM采样保留。焦点失败只交事实主审，不在验收中讨论或修产品；本批结束。


### V04 焦点时序只读更正（同批，无新启动）

查现有tmp脚本与工具记录：浅色+、浅色队列、深色+、深色队列、浅/深Context，均是`await page.keyboard.press('Escape')`后立即`page.evaluate(activeElement)`，**显式等待0ms**；没有`waitForTimeout`、rAF、菜单`hidden/detached`断言，也没有记录采样时间差。Playwright按键await仅保证按键派发完成，不保证Radix卸载与延后回焦全部完成。故BODY是即时采样，存在时序误报风险，以上表已更正为稳定回焦未覆盖，不能据此登记稳定焦点Bug。+面板规范预期是回textarea，已更正原“回+按钮”的错误比较对象。

浮层关闭的确认边界：浅色+之后composer.box panels=[]，证明后续已无dialog/menu，但在此之前脚本**主动textarea.focus**，所以不能用该后续状态补证自动回焦；其他菜单/Context没有逐个明确hidden/detached确认，后续点击成功只证明路线继续，不证明即时采样时已完成卸载。设置浅/深Esc后同样没有显式定时等待；即时仍外观页面及主题按钮，不作为独立稳定失败复核，既有BUG-018的历史证据不由本批加强。稳定检查的最小下一步为同场景Escape后等待目标浮层hidden/detached和一次可核验的延后焦点稳定采样；本次按指令不重启/不请求，保留未覆盖。


## V04 唯一有限稳定焦点收尾（2026-10-22）

验收点：480px浅/深各+面板→textarea、Context→自身trigger、队列更多→自身trigger；均确认面板可见且焦点在内，真实Escape后等待hidden/detached→2rAF+500ms→采activeElement/isConnected→再500ms复采。分组：浅+→1本地hold建立队列→浅Context/队列→设置往返切深→深+、Context、队列→删除/停止/恢复。固定dist真实Electron/CDP main97073，新隔离profile，非原生AX；无商业/系统剪贴板。

所有入口先真实trigger.click；面板匹配`page.locator('[role="dialog"],[role="menu"]').last()`并等visible，再对该面板内部`button,[role="menuitem"],input,[tabindex="0"]`第一个节点调用Playwright locator.focus()，不是Tab，也不是点击内部按钮。+焦点INPUT搜索，队列焦点DIV编辑，Context焦点BUTTON“查看完整上下文”。**Context从未点击“查看完整上下文”**，所以未进入完整Context新面板；超时后DOM仍唯一aria-label“上下文用量”、data-state=open的原Popover。清理采用其“关闭上下文”按钮。没有把完整面板与原Popover混同。

| 主题/入口 | 状态 | 卸载与稳定采样 |
|---|---|---|
| light / plus | 通过 | hidden在Escape后4ms；首次采样+537ms、复采+1041ms，均TEXTAREA / 消息输入框，isConnected=true。 |
| light / context | 未覆盖（第一Esc层级未排除Tooltip） | 等待hidden 30000ms超时；原上下文用量dialog仍open/visible，焦点BUTTON查看完整上下文。 |
| light / queue | 通过 | hidden在Escape后4ms；首次采样+536ms、复采+1039ms，均BUTTON / 更多操作：排队消息 1，isConnected=true。 |
| dark / plus | 通过 | hidden在Escape后3ms；首次采样+525ms、复采+1027ms，均TEXTAREA / 消息输入框，isConnected=true。 |
| dark / context | 未覆盖（第一Esc层级未排除Tooltip） | 等待hidden 30000ms超时；原上下文用量dialog仍open/visible，焦点BUTTON查看完整上下文。 |
| dark / queue | 通过 | hidden在Escape后2ms；首次采样+525ms、复采+1029ms，均BUTTON / 更多操作：排队消息 1，isConnected=true。 |

Context浅色失败前已由同一testFocus方法确认panel可见并聚焦内部，再按Escape；因函数在hidden等待抛出，before局部值未自动返回，原始操作脚本可核对，失败后保存state及截图。深色增加before落盘，`before-dark-context.json`明确focusInside=true、BUTTON查看完整上下文；失败后`stable-focus.json`保存data-state=open、visible=true、isConnected=true。两次均等待30秒，不是即时BODY误报，也不推断主题根因。第一Esc后Popover仍开这一事实保留，但未记录其前后Tooltip状态，不能排除第一Esc仅关闭最上层Tooltip；未执行第二Esc或无Tooltip焦点对照，因此Popover关闭/返回trigger稳定结果仍未确认，不能签关闭失败。

证据：`desktop-cu-v04-focus-20261022/evidence/stable-focus.json`含4个通过的完整before/escapeAt/hiddenAt/双采样及2个失败后状态；`focus-method.mjs`保存实际方法，`before-dark-context.json`、context-light/dark-escape-timeout.png；`final.json`保存恢复与请求对账。+和队列原即时BODY采样**不能算稳定失败**，本批稳定通过取代前批该缺口。

清理：仅1主+1本地自动标题，queued消息未执行为第二请求；先删除队列、清草稿、UI停止hold、主题恢复跟随系统。Electron CLOSE、driver SIGINT、Provider正常停止；ps main97073/pgrep自有路径均无残留，44471/44472无监听。没有改产品/dist/coverage或新增商业请求。System随OS/原生IME/VoiceOver仍未覆盖。本批结束，不再重复同构焦点测试。


V04 Context层级只读更正：本批每次只发一次Escape，未采`role=tooltip`前后存在性，也未在无Tooltip按钮焦点上对照；“查看完整上下文”内部按钮具Tooltip，符合最上层Esc规则的可能性尚未排除。30秒Popover保持打开只能证明第一Esc后状态，不证明该Esc按设计应关闭Popover。两个Context行改为**未覆盖/未确认**；没有第二Esc记录。实例已经清理，按指令不重启、不发请求。+及队列4点稳定通过不变；下一步前提仅需明确最上Tooltip是否存在或同现场第二Esc层级，无须新增模型。

## V04 Context Tooltip层级判据补齐（纯静态复用，2026-10-22）

验收点为浅/深480px各一次真实Tab到内部按钮→记录Tooltip/Dialog栈→逐层Escape→Popover卸载后两次稳定回焦；复用`desktop-cu-v04-focus-20261022/profile`既有Stopped会话与固定dist，main6155，未启动Provider/未建队列/未发任何请求。不重复+与队列。

| 子点 | 状态 | 实际结果 |
|---|---|---|
| 浅色Context层级与回焦 | 通过 | 点击trigger后焦点DIV“上下文用量”；真实Tab一次到BUTTON“查看完整上下文”，等800ms，Dialog radix-:r2v:与Tooltip radix-:r30:均visible，tooltip instant-open。第一次Esc后500ms仅Tooltip消失，原同ID Dialog仍open、焦点仍内部按钮；第二Esc后500ms Dialog消失，回BUTTON“上下文用量 —”。确认hidden→2rAF+500ms采样1792668935786→再500ms采样1792668936289，均trigger且isConnected=true。 |
| 深色Context层级与回焦 | 通过 | 设置往返切深，重复同一真实Tab路线；Dialog radix-:r4f:与Tooltip radix-:r4g:均visible。第一Esc仅关Tooltip；第二Esc关同ID Dialog，回自身trigger。hidden→2rAF+500ms采样1792668957055→再500ms1792668957560，均BUTTON上下文用量—、isConnected=true。 |
| 旧候选更正 | 通过解释层级，不登记Bug | 前批聚焦内部按钮后只按第一Esc，未排除Tooltip，因此不能把Popover仍开判失败。本批实际Tooltip栈证明其最上层规则可解释该现象；Context两主题的层级关闭与稳定回焦缺口已由本批补齐。没有点击“查看完整上下文”，未切新面板。 |
| 恢复/清理 | 通过 | UI恢复跟随系统，CLOSE退出Electron6155，driver SIGINT结束，ps/pgrep无自有残留。未起Provider；requests.jsonl仍旧2行（上一批1主+1标题），无新增请求。OS随动/IME/VO未代签，未改产品/dist/coverage。 |

原始证据同目录`evidence/context-layer.json`保存opened/before/first/second/after/stable完整time/activeElement/isConnected与role栈；`context-layer-light/dark-before.png`及after.png；`context-layer-method.mjs`。本批结束。
