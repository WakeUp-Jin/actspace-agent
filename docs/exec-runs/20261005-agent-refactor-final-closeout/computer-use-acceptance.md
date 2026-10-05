# Computer Use 验收（进行中）

执行模型：gpt-6.1-sol。真实 Electron 原生交互；未使用内部 API 注入。2026-10-05。

## 环境与边界

- 初始验收fixture：`/tmp/actspace-final-closeout-cu-02`；主要复验fixture：`/tmp/actspace-final-closeout-cu-03`，均仅 synthetic credential。
- 规范启动：`sh /tmp/actspace-final-closeout-cu-02/start-desktop.sh`，日志含构建屏障成功和 `[dev-runtime]`。
- appId：`com.actspace.desktop.dev.w2067fa05`，appName：`Actspace Dev actspace-agent-2067`。
- 初始新会话未选工作区；通过 Composer 工作区 → 使用已有文件夹 → 原生 Go To Folder 输入 `/tmp/actspace-final-closeout-cu-02/workspace` → 打开。发送前隔离目录已明确选定。
- 本次仅操作测试会话，没有修改真实 SSH 配置，没有在 Downloads 发任务。
- Electron AX 观测约 62 秒/次；原生目录选择器约 1 秒/次。

## 验收点与操作分组

下表逐行定义验收点。操作分组为：本地设置与输入（CU1–CU3）；繁忙队列与压缩恢复（CU4–CU6）；远端连接与任务文件（CU7）；复用主要状态检查浅深主题（CU8）。组内按导航路线连续操作，关键中间状态和终态均需观察。模型请求/运行日志仅作辅助，不代替 UI。

## 逐项结果

| 子项 | 状态 | 操作与预期 | 证据与说明 |
| --- | --- | --- | --- |
| CU1.1 | PASS | 规范命令启动隔离 Desktop | 规范启动构建成功；真实窗口首屏正常；原生目录选择器选定隔离 workspace。AX 显示模型 fixture-alternate 和本机 Mac。 |
| CU1.2 | PASS | 设置中选模型/修改无敏感测试项、保存 Host 连接，Cmd+Q 后重开 | 设置测试显示名/默认fixture-main/WSS连接保存，Cmd+Q同数据重开均保持；原Session历史恢复，维护恢复后真实点击继续，10:06 CU1.2 resumed完成第7轮，id9唯一。期间shared指纹变化触发保护并经生产维护API恢复，明确非无维护升级恢复证明。 |
| CU2.1 | PASS | 新 Session 发送 hold 流式任务再 release | 08:49 首段 Fixture streaming; waiting for release.、运行中、停止按钮；control release 后 08:50 完整回复 Fixture completed: fixture-alternate.、空闲、正文清空、发送禁用。用户消息/回复各一条。请求 id2 是 Run；id1标题旧分类误报已在03修正，过程可追溯。 |
| CU2.2 | PASS | running 时点击停止 | 08:52 发送 CU2.2 FIXTURE_HOLD cancellation；08:53 点击停止，UI 显示 Stopped、空闲、发送禁用。辅助日志 Run 请求 id3，停止后无后续请求。 |
| CU2.3 | PASS | 同 Session idle Plan→Agent 分别发送；running 查看模式入口 | 03环境同Session Plan和Agent分别发送；Plan输入提示继续完善方案，移除Plan后Agent任务运行；运行中添加菜单Agent/Plan/Chat均disabled。请求id3/id4分别唯一。 |
| CU2.4 | PASS | 队列等待时切换模型，再消费 | hold期间排A/B，上移B，队列暂停时切fixture-alternate并继续；id5 B、id6 A实际使用新模型，旧id4未重启。UI回复顺序B/A。 |
| CU2.5 | PASS | 选择 fixture 模型支持的推理档位并发送 | 03环境模型编辑选High后发送CU2.5，UI完成回复；实际Run请求id2 reasoning=high。标题id1已正确isTitle=true。 |
| CU3.1 | PASS | 原生选择有效 PNG | 原生visible.png有效32x32蓝黄棋盘，Composer缩略与右侧预览清晰可见、preview enabled；移除后重新添加正常，正文保留。旧valid CRC无效仅fixture。 |
| CU3.2 | PASS | 带正文/PNG 发送 | 原生选PNG带正文发送；10:37有效visible.png带正文唯一发送完成，用户消息/回复各一条，id10 hasImage=true且有效32x32图，成功后正文附件清空。旧invalid valid.png过程保留于下文。 |
| CU3.3 | PASS（修后） | 原生选择超出应用当前大小限制的 PNG | 修前业务错误误显示提交未知，已修。10:34复验明确附件准备失败/草稿已保留/20MiB；正文与visible保留，无自动重试或Provider请求。移除oversized后10:37正文+visible唯一完成，草稿清空。 |
| CU3.4 | PASS | 回复批注加正文，在上传失败或离线拒绝场景提交 | 回复真实选区添加到对话/评论；上传失败后正文+PNG+批注保留，展开确认原文和评论；upload-ok点击一次13:56唯一第15轮，草稿清空。畸形ID未伪造UI。 |
| CU3.5 | PASS | UI 选择/移除 acceptance-fixture，新会话对照 | 14:57选中芯片后完成，Run40 hasSkill=true；真实移除后干净新会话15:00无芯片且完成，Run42 hasSkill=false、catalog仍true，排除历史污染。 |
| CU4.1 | PASS | hold 时连续入队两条并调整顺序 | 心跳hold排A/B，B上移、插入后撤回；release13:12原Run完成，B/A按UI顺序各唯一完成。 |
| CU4.2 | PASS（撤回分支） | 队列内容插入当前 Run，再撤回指定 | UI插入B显示下一步读取、撤回回唯一队列；Journal同task6e9ddd52 accept→move→designate Run→designate null，无副本。未覆盖实际消费插入分支。 |
| CU4.3 | PASS（修后复验） | 队列编辑回填 Composer、修改再发送 | 14:35新正文+visible+批注入暂停队列，Reload仍1文件·1引用；编辑后蓝黄PNG、正文、评论均保留。改正文重排→继续，14:42唯一完成且用户轮次含图/批注。旧Task撤回无claim，新Task唯一执行，Provider38唯一；原失败见过程记录。 |
| CU4.4 | PASS | 删除 pending 条目 | paused队列B/A；编辑A回填后删除B，UI B消失，继续只执行A edited，Provider20唯一，B未执行。 |
| CU4.5 | PASS | 停止活动任务，观察暂停，再手动继续 | 13:14hold/pending→点击停止→Stopped、空闲、pending已暂停/继续；手动继续13:18唯一回复，队列消失。 |
| CU4.6 | PASS | running+pending 时 Reload | running+pending B/A真实CmdR，仍running/停止Agent，B/A均恢复；release后原Run和pending各唯一。 |
| CU5.1 | PASS | 新本机会话 `/compact` | 14:51直接命令后显示“对话还很短，暂时不需要压缩”，空历史/空Composer、未出现普通用户文本轮次。 |
| CU5.2 | PASS | 足够历史 compact，hold→release | 03环境5轮历史/compact；进度正在压缩上下文、发送disabled；control release后上下文已压缩8条消息1m28s，空闲。旧fixture将summary历史FIXTURE_HOLD误当Runhold，明确是fixture碰撞，非产品失败。 |
| CU5.3 | PASS | summary-error 后切 summary-ok，点击重试 | summary-error UI压缩失败/重试；summary-ok点重试直接已压缩30条0s，无继续动作。 |
| CU5.4 | PASS | busy 时排 compact→取消→重新排队→release | busy排compact→删除命令消失→重排1条→release13:27原Run完成、已压缩4条0s、空闲，无永久暂停；原取消新执行Journal辅证。 |
| CU6.1 | PASS | 用户授权SystemEvents菜单AXPress辅助，CU输入/观察 | 18:08空Session发title-hold消息，19.024s内手动改名CU6.1 native manual wins；release后页首/侧栏保持手动标题。Journal唯一手动title-set、自动请求取消，无覆盖。此前工具限制未覆盖记录保留。 |
| CU6.2 | PASS | 流式过程中 Reload 再终态 | hold首段期间CmdR，原用户消息/轮次唯一；release13:12首段+completed完整回复唯一，pending B/A各唯一。远端分页轮次窗口另有说明。 |
| CU7.1 | PASS | WSS 配对、新建远端 Session | WSS CU isolated host新建远端Session，UI选择Fixture Remote绝对路径/private/tmp/actspace-final-closeout-cu-03/remote-workspace；侧栏与本地workspace并列且带Host标签。 |
| CU7.2 | PASS | 远端任务触发审批，批准后完成 | 10:54 CU7.2 FIXTURE_TOOL实际等待pwd审批，Run后完成360Token，Edited 1 file result.txt，回复唯一；右侧真实预览Fixture result.。 |
| CU7.3 | PASS | 新任务待审批时取消 | 11:24 retest待审批pwd点击停止→审批消失/空闲；Journal93acf6cd cancelled、fixture17 denied/aborted、无后续write。旧审批超时轮不计取消证据。 |
| CU7.4 | PASS | 远端 hold 任务期间关闭 Desktop，重开并 release | 心跳fixture修后第8轮heartbeat真实CmdQ重开同running/停止Agent，立即release→13:02完整首段+completed回复、空闲，无重新提交；旧SSE超时轮不计PASS。 |
| CU7.5 | PASS | 远端离线时编辑草稿并查看发送/停止/审批 | idle离线UI Host未就绪、草稿可编辑/model/send禁用；另pwd审批离线拒绝/运行/停止Agent均disabled，草稿可编辑。未自动发送。 |
| CU7.6 | PASS | 恢复连接并一次发送草稿 | online后设置显示已连接，显式重新连接返回，草稿保留/send enabled未自动发；点击一次13:35唯一回复，清空草稿。 |
| CU7.7 | PASS | 远端附件上传注入失败，再恢复重试 | upload-error拒绝显示Fixture temporary upload failure；正文/visible/批注评论保留，Provider35/Journal308无接纳；upload-ok一次提交13:56完成。 |
| CU7.8 | PASS | 远端完成文件结果，预览并主动保存 | 产物卡片右键打开真实保存对话框，位置03隔离root，改名cu7-8-saved-result.txt后保存；UI返回预览，磁盘文件0600/16字节Fixture result.。预览阶段无本地保存，保存为显式选择。 |
| CU7.9 | PASS（测试装配） | SSH 配置入口建立本机 fixture 连接、关闭连接 | 10:44真实UI配对closeout-fixture:49730显示已连接；新增calls02:44:18和sshd Accepted publickey。UI移除连接后消失、sshd disconnected by user，Host PID69875仍存活。测试入口仅给真实ssh追加-F隔离配置，未改真实~/.ssh；不能宣称产品提供configFile入口。 |
| CU8.1 | PASS | 浅色 Composer/队列/审批/Host设置代表状态 | 实际截图观察无截断，输入焦点与菜单焦点可见；禁用插入/上移和可用编辑有区分，设置表单完整。 |
| CU8.2 | PASS | 深色 Composer/队列/审批/Host设置代表状态 | 切深色后表单焦点边框清楚，审批/队列浮层可读，禁用项区分、布局正常。代表位置检查，不宣称逐页遍历。 |

## 已观察证据

真实截图已由 Computer Use 工具展示：08:48 新会话 workspace 首屏；08:50 流式终态。AX 中间状态和上述逐项记录来自当场观察，不由日志推断。

辅助日志：`/tmp/actspace-final-closeout-cu-02/desktop.log`、`provider-requests.jsonl`。

## 初始fixture问题（已修复，保留过程）

1. id1 标题请求被记录为 isTitle=false；标题可能使用 developer role。影响 CU6.1 title-hold 路线，暂缓。
2. 未选择 Skill 的 id2/id3 hasSkill=true；目录 description 包含标记使布尔误计。影响 CU3.5，暂缓。

当前报告不是整项目完成声明。其余子项继续验收。

## 03 环境进展（09:37）

- 新root：`/tmp/actspace-final-closeout-cu-03`，Electron PID 21624，规范重建后启动；同appId。原生目录选择器明确输入03/workspace。
- CU1.2进行中：设置显示名称保存为CU synthetic tester（明确已保存）；默认模型选fixture-main；原生WSS配对连接CU isolated host成功显示已连接。待重开持久化/续聊。
- CU7.1进行中：WSS已配对，地址wss://127.0.0.1:64172/rpc；远端新Session与列表归属待验证。
- CU4.1部分观察：hold时连续排A/B，更多操作→上移B，UI队列B/A；AX观测每次62秒导致hold超过运行期限，状态失败、队列暂停；继续后B/A各一次。尚缺release路线，未签收CU4.1。
- CU4.5部分观察：超时失败后pending暂停、手动继续唯一消费；尚缺点击停止触发，未签收。
- CU3.1部分观察：原生valid.png附加，但预览disabled和空白块；主智能体确认fixture PNG IDAT CRC无效，已提供visible.png待复验。发送后消息预览可打开右侧tab，但空白图。未签收预览通过。
- 09:37正常Cmd+Q退出当前绑定Desktop，准备同数据带SSH测试装配重开；未管理其他应用进程。

## 新确认的 fixture 问题

- 03 summary请求id7历史包含FIXTURE_HOLD而误hold；control release解除并实际观察完成。新fixture源码已分离Run/title/summary控制，03运行中的旧Provider未替换。
- 旧valid.png 68字节IDAT CRC无效。可见有效替代图`/tmp/actspace-final-closeout-cu-03/visible.png`已由主智能体生成；CU3.1视觉路线待用其复验。

## 同03数据重开观察（09:42–09:51）

- 规范重开PID80431；真实窗口恢复原会话全部6轮历史、压缩块和附件消息，无重复历史。
- 设置显示名称CU synthetic tester保留；默认模型fixture-main显示于Composer；WSS CU isolated host自动恢复已连接。没有显示synthetic credential。
- 原会话仍保留paused queue状态，发送CU1.2 resumed session进入1条已暂停队列。点击继续后仍需核验实际完成，CU1.2尚未全项签收。
- SSH真实UI输入CU isolated SSH、closeout-fixture、Host端口49730、正常CLI新配对码，点击配对显示连接未成功。ssh_config.calls仅有主智能体先前探针，sshd无新增连接。主智能体定位定制Electron拒绝NODE_OPTIONS --require，属于fixture测试装配失败，CU7.9未覆盖成功；将用测试入口preload修正后复验。未修改真实~/.ssh。
- 09:51正常Cmd+Q退出，等待修正测试装配重开。

## 03 专用 SSH 装配后观察（09:54–10:03）

- 点击暂停队列继续仍未执行；主智能体通过Journal与Harness指纹核对定位：shared cordis-adapter旧产物指纹与重建后不同，resume立即pause符合恢复保护。不是UI按钮未触发。保留会话，待生产维护API受控恢复后UI复验。
- SSH再次由真实UI输入别名/49730/新CLI pair code，配对显示SSH登录失败。
- `/tmp/actspace-final-closeout-cu-03/ssh-fixture/ssh_config.calls`新增`2026-10-05T02:01:59.528Z`，sshd新增真实连接与`Authentication refused: bad ownership or modes for directory /private/tmp`。证明UI连接到达真实ssh/sshd；尚未成功，不签收CU7.9。
- 主智能体将仅对隔离回环sshd修正StrictModes，并受控恢复synthetic Harness状态。真实SSH配置/系统sshd未修改。
- 10:03正常Cmd+Q退出，等待同数据重开。

## 附件当前状态（10:13）

有效visible预览已通过；正文CU3.3 preserved body、visible与oversized保留在Composer，提交未知提示待修。有效图最终发送尚待补证（此前id8只能证明传输，图片无效）。

## 附件修后复验（10:34–10:37）

同数据重开后失败草稿没有跨退出恢复，本轮原生重新选visible及oversized并输入正文。修后明确拒绝与同次草稿保留通过；删除oversized后第8轮CU3.3 retest preserved body[visible.png]唯一完成、fixture-main回复、正文附件清空，Provider新请求含有效图片。CU3.2有效图发送证据补齐。

## 远端 WSS 路线（10:54）

真实新建远端Session，Host与隔离远端工作区归属明确。工具pwd审批中拒绝/运行操作可见，批准后完成并生成result.txt；点击产物打开右侧tab，正文Fixture result.清晰可见。CU7.8保存动作尚待覆盖，不能仅凭预览签收。

## 远端取消与关闭现场（11:24–11:30）

CU7.3首次待审批因服务端stream中断拖到10分钟期限，已自然终态，不能作为取消通过。重新发送retest，在真实pwd待审批状态点击停止Agent，审批卡片消失、空闲，未批准；辅助取消Journal待主智能体核对。停止后新CU7.4消息进入暂停队列，点击继续才运行，首段Fixture streaming; waiting for release.、停止按钮和第4轮均已观察。11:30正常Cmd+Q退出仅本轮Desktop，Host/Provider保持，等待main重建后同数据重开完成CU7.4。

12:28仅重建electron后同03数据重开。CU7.4旧hold在主线程暂停期间超时，不能签运行恢复，将重新形成hold。

12:31第5轮CU7.4 retest FIXTURE_HOLD经暂停队列继续后明确运行首段；12:32真实Cmd+Q退出，等待立即同数据重开保持hold。

## 队列文本分支（12:37–12:43）

远端SSE无流量5分钟终止，主智能体Journal确认，不按10分钟Run期限理解。paused B/A排序→Reload保持→编辑A回填Composer（原条目撤回）→删除B→修改A edited重排→继续唯一完成第6轮。CU4.3仅正文分支，附件/批注未覆盖。Reload当前页曾4轮，随后首轮再次出现且恢复6轮，属于远端分页窗口，未见历史丢失。CU7.4已证明running重连/请求唯一，但未及时release终态，仍待短路线补齐。

CU7.4 final短路线再观察重开running/同消息，但release前仍遇SSE五分钟terminated；不签全项PASS。主智能体准备Provider SSE注释心跳和同端口重启以修正fixture限制。CU工具一次CmdQ报native pipe closed，重新getApp确认主进程72358仍活后再次正常CmdQ。当前暂停依赖Provider路线，不修改产品超时。

## fixture同端口恢复与CU7.4完成（13:02）

03 Provider/Host同端口resume保留设置、凭据、journal，Host指纹保护由主智能体生产recoverBuiltin维护revision2恢复。新版Provider每20秒SSE注释心跳（测试装配，不改产品超时），Run/title/summary控制隔离。heartbeat任务实际运行→正常CmdQ→重开同第8轮running→release→完整首段与completed回复唯一、空闲。请求id22辅助唯一，CU7.4全项PASS。

## 队列插入撤回与Reload（13:04–13:12）

心跳Run首段→排A/B→B上移→CmdR恢复running与B/A→B插入显示1条排队/1条已插入、下一步读取→撤回显示2条排队B/A→release原Run完整回复、B/A各完成一次、空闲。CU4.2已覆盖撤回回队列分支，同Task身份待Journal辅助；未消费插入分支不声称验证。

## 批注与远端上传失败（13:50–13:56）

截图真实三击回复选区→添加到对话→批注评论CU3.4 preserved annotation，正文CU3.4 CU7.7 preserved body，原生visible PNG。upload-error点击提交显示Fixture temporary upload failure，三类草稿保留；展开批注确认原文和评论完整。Provider仍35，Journal截至308未接纳。upload-ok后一次点击发送，第15轮批注胶囊+正文[visible.png]与回复各唯一，Composer三类清空。

## CU4.3远端附件编辑失败（14:12）

复现：hold中真实选择已完成回复→批注评论CU4.3 queue annotation；正文CU4.3 attachment annotation queue；原生visible.png（UI三者明确）→加入队列→主动停止Stopped→更多编辑。正文与批注评论回填，PNG完全消失（AX无已附加文件，截图Composer仅批注/正文）。队列此前也仅1引用不显示图。Journal331原Task9ab72d19接纳，336取消活动Run，337编辑撤回。主智能体确认original保存uploadIds、renderer仅读attachments根因；未重添图掩盖，等待修后定向复验。

14:15独立新会话路线遭Vite HMR刷新/AX ID失效，主智能体确认正在修CU4.3 renderer投影及回填；不判草稿跨HMR丢失产品Bug。旧失败Task已取消，修后需新三类队列复验。

## CU4.3 修后定向复验（14:35–14:43）

同03数据正常CmdQ后加载新main。真实选区添加评论CU4.3 repaired annotation，正文CU4.3 repaired three payload，原生选择visible.png。入暂停队列显示1个文件·1条引用；CmdR后仍保留。编辑撤回后Composer截图可见蓝黄棋盘，AX有附加visible、原正文；展开批注显示原引用与评论。未重选图片，正文改为edited再入队。继续后唯一第5轮正文edited[visible.png]、1条批注、图片预览、Fixture completed、空Composer/无队列。辅助Journal338接纳旧82cbd607，339取消无claim；340新1ad52aa5唯一接纳，341resume至353finish，Provider38唯一。真实UI签收PASS，原14:12失败证据保留。

## CU5.1 短历史命令（14:51）

真实本机新会话输入/compact并Return：显示对话还很短，暂时不需要压缩；未作为普通用户文本出现在历史，输入框清空。UI签收PASS。

## CU3.5 Skill 选择与取消（14:55–15:01）

菜单Skills真实选择acceptance-fixture，Composer显示已选择Skill及移除按钮；发送selected skill完成，Run40正文标记true。点击移除再新建同隔离本机workspace会话，Composer无Skill，发送deselected clean control完成；Run42正文标记false、catalogtrue，避免旧历史误判。标题39/41独立不计用户请求。PASS。

## CU8 双主题代表状态（15:30–15:46）

浅色（跟随系统实际浅色）：待审批pwd卡片、1 pending Composer、禁用插入、队列菜单编辑/禁用上移、文本输入焦点均真实观察；Host设置连接卡片及名称/WSS/地址/配对码/按钮无截断。切显式深色，Host名称输入聚焦截图见清楚边框与文本对比。原审批等待达10m自然stale并Fixture后续完成，不记主题问题；新dark retest审批+pending+菜单截图验证深色对应状态、禁用视觉可区分，随后删除pending并主动停止。两主题均PASS，仅代表上述位置，不宣称逐页遍历。

CU3.5补核：15:27回原selected Skill会话（0be10706）发same session removed，Composer无芯片、完成；Provider49正文Skill=false/catalog=true，同会话选择确已清空。

## CU6.1 标题竞争操作限制（15:08–15:50）

先/compact建立空本机Session，预演侧栏右键第二项重命名与自动选中输入，typeText+Enter普通改名成功（CU6.1 rename rehearsal）。竞争第1轮Down导航不进入自绘菜单；第2/3轮按截图坐标批量发送/右键/点击/typeText亦未进入重命名。均立即title-release，辅助Journal仅自动title-set，没有手动title-set，因此不计PASS，不判产品失败。普通菜单再验证截图2048×1226与窗口1440×862/X15/Y33换算坐标仍误点到远端条目；每次可靠AX/截图约62秒，超过标题30秒期限，暂明确未覆盖。

16:00第4轮尝试显式getAXState({emit:true})：一次普通菜单仅2.37s，但新会话/准备/发送后菜单均61–63s，快观测不可复现。正文CU6.1 title AX final完成；菜单返回时已超过30s，因此未用超时后改名冒充竞争，已title-release并关闭菜单。最终当前34/35 PASS，CU6.1仍未覆盖（工具限制），无活动Run/pending，环境保持供辅助核对。

## CU6.1 用户授权原生辅助最终复验（18:08–18:10）

用户针对SystemEvents辅助原生菜单的具体下一步回复继续，主智能体确认授权。仅核对并操作bundle com.actspace.desktop.dev.w2067fa05/PID31857，无其他应用读取或操作。CU创建本机隔离workspace空Session，/compact不触发标题，正文authorized native race；title-hold后CU发送/右键，SystemEvents按真实菜单AXMenuItem name重命名执行AXPress，CU typeText/Enter保存手动标题。未修改30秒期限、未内部API注入。release后CU截图确认页首/侧栏CU6.1 native manual wins、正文完成。Session940fe0b5接纳10:08:37.796Z，手动title-set10:08:56.820Z（19.024s），唯一手动写入、pending自动标题被取消，Provider57标题/58Run。辅助证据cu-title-race-evidence.json。CU6.1签收PASS，当前35/35通过。

额外CmdR持久核验返回chrome-error://chromewebdata/，已通知主智能体核对Vite服务；这是追加环境问题，不用该错误声称标题持久验证通过。前述真实释放后UI和Journal竞争证据独立成立。环境保留等待辅助核证。

18:12追加环境核对：主智能体确认Vite5173停止、Electron ERR_CONNECTION_REFUSED，Host仍活；恢复同源码renderer后原生CmdR重新进入相同Session，页首与侧栏仍CU6.1 native manual wins、原正文/回复完整、空Composer。持久标题真实UI补核通过，非产品缺陷。
