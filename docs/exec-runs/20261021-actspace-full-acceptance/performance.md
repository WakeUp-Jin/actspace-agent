# 性能验收记录

执行中。T1/T2 已有真实 DeepSeek 长输出与资源样本，T3 长历史和独立 F9/T4 已有专项证据，T5 大文本、diff 与终端也已执行并发现 BUG-014。各负载仍按未完成子步骤保留缺口，不以空闲资源、微基准或不同分支结果签收整项。

## 2026-10-22 定向微基准

命令：`TRAJECTORY_PERF=1 pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-streaming-perf.test.ts`。本轮实际执行，5项通过；此前全包测试跳过的这5项已单独补跑。版本为主仓库 HEAD `00d6b763` 加当前未提交实现，产品源码与初始快照一致。

这是测试夹具下的轨迹投影/构建成本测量，含3次预热、30次采样；不是浏览器或Electron完整渲染帧，不包含真实Provider、绘制、交互延迟和进程资源采样，不能代替T1–T5，也不能据此宣称相对main的提升。

| 夹具 | 节点 / chunk数 | total p50 | total p95 |
| --- | --- | --- | --- |
| full | 2242 / 10 | 11.646 ms | 13.436 ms |
| full | 4232 / 2000 | 13.709 ms | 14.257 ms |
| split | 2272 / 40 | 0.220 ms | 0.335 ms |
| split | 4232 / 2000 | 0.239 ms | 0.329 ms |
| settled rebuild | 2000 chunks | 10.279 ms | 11.369 ms |

`total`沿用测试自身统计口径；full的各阶段独立采样，不能把阶段分位数直接相加。split的阶段取自同一批递增帧，各阶段分位数也不等于总量的分位数。原始输出：`tmp/codex-acceptance/20261021-actspace-full-acceptance/trajectory-perf-20261022.log`（本地证据，不随仓库分发）。

## 真实 Electron / DeepSeek 长回复 T1、T2

版本为主仓库固定 dist + 当前未提交实现；独立 profile，不发送仓库内容或用户私有资料。真实会话 afdee290-31bc-4a89-9250-a62517dcee32。方法为 gpt-6.1-sol 的 Playwright Electron/CDP，非原生 AX；逐项见[Electron报告](cu-electron-20261022.md)。

| 轮次 | 正文总字符 | 汉字 | 结束事实 |
| --- | --- | --- | --- |
| 1 | 10709 | 6287 | 正常 stop；流式中 A→历史→A |
| 2 | 10498 | 6067 | 正常 stop；流式鼠标滚动 |
| 3 | 9472 | 5130 | 正常 stop；480px/深色设置往返 |
| 4 | 10619 | 6133 | 用户停止，aborted；刷新后部分内容一致 |
| 5 | 10315 | 8724 | 显式继续暂停队列后正常 stop，达到8k–12k中文规模 |

前3轮总字符达到规模但汉字不足，已如实区分；第5轮补足汉字规模。第1轮可见表格/代码/列表，未按DOM虚拟化挂载字数冒充全文长度。真实停止、刷新保留和显式继续有功能证据；尚未逐轮同时完成全部 A→B→A/滚动/停止专项，也没有完整逐帧文本比对，因此 T1/T2 整体仍为部分覆盖。

采样原始文件为证据根 stage1/electron-cdp-20261022/metrics.jsonl；Electron app.getAppMetrics 的 workingSetSize（KiB，沿用API字段，非独立ps核对）与CDP JSHeapUsedSize，未强制GC，不是全程峰值或标准化CPU基准。主进程88356、renderer88405；UTC时间如下。

| 相位 / UTC | main CPU% / 工作集KiB | renderer CPU% / 工作集KiB | heap MiB |
| --- | --- | --- | --- |
| 第1轮流式 00:25:43.860 | 0.96 / 206640 | 2.71 / 281552 | 81.06 |
| 第1轮结束后 00:26:41.372 | 0.10 / 147376 | 0.38 / 171968 | 23.01 |
| 第2轮流式滚动 00:27:40.127 | 0.99 / 219888 | 3.52 / 309344 | 60.40 |
| 三轮结束后首次 00:29:27.940 | 0.16 / 120720 | 0.13 / 145888 | 29.75 |
| 首次+30秒 00:29:57.948 | 0.05 / 113776 | 0.03 / 118960 | 30.21 |
| 首次+120秒 00:31:27.947 | 0.07 / 109680 | 0.09 / 114016 | 30.11 |

第三轮实际结束00:28:36.906，首次闲置采样晚约51秒，不当成结束0秒；缺同阶段完整基线，不能据此断言无内存泄漏或优于main。观察期工作集回落，heap闲置约30MiB。原始正文统计 real-five-rounds-summary.json、停止/完成及主题截图同目录。

## T3 / T4执行入口

T3采用独立生成的100轮/1000工具关联一致Journal，2901事件；Electron已实际连续加载4次更早页并看到第1轮，近期轨迹虚拟行约37–38，工具参数/结果/Schema、100轮 Context、Usage 分页及 reload 无重复累计已有实际证据，见 Electron 专项。分页后真实新增第101轮也已观察。后续只读投影15页2820事件已逐seq与持久ID对账，无丢重；Journal另有103个chunk按投影策略剔除，已逐messageId核对定稿存在。后续独立真实Runtime会话补275明细、100活跃路径与136558字节规则原文，界面实际读取各至少两页并对账；不能与100轮历史拼成同一会话，也不等同12000项服务压力。旧批首次/重复查询完整同阶段耗时当时仍缺；后续H/Usage及C独立原生增量见文末，整项其他缺口仍保留。

F9/T4仅独立 feat/side-chat 实现的真实Runtime + 受控HTTP：主与两侧同时running、独立停止、收起重开和超过cell上限恢复已观察；下节另有120秒三路持续正文流证据，仍不是主仓库最终整合版，详见[独立F9报告](side-chat-20261022.md)。


## T4独立实现持续流补证

主智能体按Journal逐Run复核后，原“第一侧7片段”已排除为取错最后一轮的统计问题。120秒窗口三路完成正文均有序：主1183、第一侧1183、第二侧1182，100ms/片段受控HTTP Provider；并非只keepalive，完整过程及旧任务恢复边界见[独立F9报告](side-chat-20261022.md)。固定sibling dist，主76320/renderer76385。

| 时间相位 | main CPU% / 工作集KiB | renderer CPU% / 工作集KiB |
| --- | --- | --- |
| before（00:51:20Z） | 4.34 / 289248 | 2.77 / 162864 |
| 30秒 | 0.86 / 179904 | 6.41 / 261360 |
| 75秒 | 0.94 / 158112 | 5.45 / 265296 |
| 120秒 | 0.42 / 137504 | 5.34 / 253376 |
| release约1秒后 | 3.59 / 271744 | 4.66 / 265120 |

Electron API瞬时值，非峰值。performance.memory始终返回29,400,000 bytes，可能受精度/缓存限制，不把常值当精确内存稳定证据；未强制GC。此轮各UI组合未同时完成，结束后30/120秒未采样，最终整合版缺失，T4整体仍部分覆盖。

## T5：真实工作台大文本、diff与持续终端

固定主仓库dist，隔离工作区/profile，真实Electron/CDP，无Provider。详见[工作台报告](desktop-workbench-20261022.md)，不是原生AX。

| 操作/相位 | 实际观察 |
| --- | --- |
| 5,250,000字节文本首次打开 | 1223ms |
| Markdown→大文本三次 | 1779 / 1883 / 1405ms；反向110 / 112 / 323ms |
| 关闭大文本 | 2754ms |
| 大文本资源采样 | main113280KiB RSS；renderer592480KiB RSS，heap30245424字节（未手动GC），DOM79636节点 |
| 6000删/6000增diff | 一文件模式可读，首51行显示；没有纯diff响应耗时，不虚构达标线 |
| 20000行终端输出时切Tab | 32–49ms；持续600×0.05s输出时切换57ms，resize调用10ms（非完整布局耗时） |
| 关两个终端 | 38 / 31ms；shell37898/39069均消失 |
| 终端关闭后 | main96896KiB，renderer110384KiB；晚期闲置main76576/renderer86304KiB |

大文本三次切回均超过计划的一秒观察线，登记BUG-014；不把闭合2754ms夸大为超过三秒冻结。renderer生命周期峰值836096KiB，但晚期闲置明显回落，未确认泄漏。源码分块高亮已存在，性能根因需要trace，未改产品。原始large-performance/terminal-load/terminal-close/idle-final JSON保留时间戳与PID。

## 十二会话完整生命周期与显式 GC（14-A5）

真实 Electron、同一隔离 profile、受控 HTTP Provider，12次完整“新建→实际回复→切回锚点→归档”，全部归档后从侧栏消失。基线及第3/6/9/12次分别使用 CDP `HeapProfiler.collectGarbage` 后调用 `Runtime.getHeapUsage`；此方法明确区别于 DevTools Memory 手工点击。

| 已完成会话数 | GC后 used JS heap（bytes） |
| --- | ---: |
| 0 | 14840552 |
| 3 | 15855292 |
| 6 | 16388936 |
| 9 | 16909232 |
| 12 | 17607500 |

本窗口末期仍上升，未验证预热后收敛；单凭这些样本也不能确认泄漏。不能以12条短受控回复替代T1/T2真实长输出，不能把RSS回落当JS堆收敛。证据为 `tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/14-A5-lifecycle.json`（本地过程产物，具体证据目录以专项报告为准）；最终闲置采样另见[Electron专项](cu-electron-20261022.md)。


## T1/T2 真实 DeepSeek 有限补验（2026-10-22 12:20–12:35）

方法为固定 dist 的真实 Electron/CDP，独立 linked profile，同一 main51004/renderer51076。仅复用既有 deepseek-flash，关闭编辑/写入/Bash/浏览器/图片生成分析；提示仅虚构城市科普，不读取仓库或用户资料。本批共4个主回复请求，未追加凑数请求。证据目录 `tmp/codex-acceptance/20261021-actspace-full-acceptance/stage1/electron-cdp-20261022/`，前缀 T12。

|验收点|结果|实际步骤与边界|
|---|---|---|
|T1目标规模与T2三轮实际长负载|规模如实记录|第一篇UI停止后4249汉字，显式继续5495，逻辑合计9744但为两条；第二篇7015，第三篇6095。混排总字符分别4890/6483/8426/7321。T1允许提前结束记录实际规模；T2三轮长回复不另强加每条8k门槛。Journal-final保存全文、seq及持久ID。|
|T2 流式会话切换/滚动|通过|三轮实际A→B（RESTART_CONNECTION_OK）→A，mouse wheel上下滚动；首篇续写另复测。stream-switch-scroll资源样本保留。|
|T2 停止/暂停/继续|部分覆盖|第一轮实际停止后Stopped；后续消息进入暂停队列，点击“继续发送”才恢复请求。r1-stop、resume-stream证据。第二、三轮未执行该轮停止/继续专项，不能把一次泛化三轮。资源标签r1-continue-start/stream/end实际上处于暂停队列，不作为流式或结束采样。|
|T1/T2 阶段资源|部分通过|baseline、各轮流式/结束、最终闲置；app.getAppMetrics记录PID/CPU/工作集KiB，CDP Runtime.getHeapUsage字节，均未强制GC。r3-start采样主进程evaluate报“Resulting promise was garbage collected”，发送已实际开始，经UI stop=1核对未重发；改用ps CPU/RSS+既有CDP。第三轮独立开始采样缺失。|
|F5 主消息代码标记|通过|第三篇实际代码块含字面“1. 一级示例”“  - 子项示例”，pre内li/ul/ol计数0；main-code-final截图与final-dom。|
|未闭合→闭合代码/表格|未覆盖完整过渡|有真实流式快照及最终闭合代码/表格，但没有同一块未闭合与闭合双时点精确采样，不以最终截图代签。|
|长回复复制处理器|通过（方法限定）|真实点击最后“复制回复”，临时拦截renderer navigator.clipboard.writeText并finally恢复；捕获7321字符与最后Journal全文逐字相等。不触系统剪贴板，不代签系统复制。|
|最终消息持久映射|部分通过|Journal seq5323/11594/20469/26797对应四个真实持久messageId；最终DOM最后回复data-assistant-message-id=v2-26797。最后全文通过复制处理器与Journal对账，其余三条未逐字核对最终DOM。|
|16-A7 停止tooltip（范围更正）|不作为验收要求|本批仅Composer停止hover，不能代签轨迹专用位置；原清单要求交接外观，没有停止tooltip门槛。后续真实主轨迹专用停止已有hover/边框证据，细边框缺失登记BUG-028。|
|主/子工具结构事件|未覆盖|本批纯文本且工具关闭，没有工具或子委派样本。|

四条持久ID依次为 d381ae62-d957-4277-a47e-f3afe563ae51、48e0c5ce-d3f1-41b3-a9d2-c7cba9e343f8、18391b03-54f1-44ff-aff6-b2c517364b97、0e5692f1-0180-41bd-8077-f01db176c5db。资源原始文件T12-new-resource.json保留完整CPU/内存及时间；未从有限波动推断泄漏或堆收敛。

最终闲置补记：idle-start main/renderer RSS110768/154848KiB，heap36567776B；30秒109952/114912KiB，heap39558272B；最终至少120秒窗口99248/95792KiB，heap37936376B，CPU各0.3%。由于工具往返，最终实际较idle-start约155秒，不把标签120当精确120秒。全部未手动GC。六项工具开关已按原值恢复true，T12-restored.json；本批随后CLOSE正常退出。


## 同实例三轮36会话生命周期补证

[补批逐点结果](host-git-followup-20261022.md)使用新隔离profile、同main3919/renderer4021，连续三轮各12次真实UI新建→受控HTTP短回复→回锚点→hover归档；36个唯一会话均完成且已归档。每轮后同方法CDP collectGarbage/Runtime.getHeapUsage，非人工DevTools点击。

| 已完成会话数 | GC后used JS heap（bytes） | 较上轮增量（bytes） |
| --- | ---: | ---: |
| 0 | 11216324 | — |
| 12 | 14841984 | 3625660 |
| 24 | 15492544 | 650560 |
| 36 | 15760920 | 268376 |

增量缩小，末轮仍增长；有限三轮不能证明收敛，也不能确认泄漏。此批与之前12会话不同PID/初始profile，不拼成48次连续曲线，也不作为真实长输出T1/T2的替代。原始memory-samples.json保留每个会话ID、归档与完成事实、PID及CPU/内存。终态main/helpers/PTY/writer逐PID退出、63320无监听，见queue-memory/cleanup-final.json。


## T1/T2原始相位复核（2026-10-22）

[只读复核](host-git-followup-20261022.md)确认旧批第三轮结束至首个idle锚点51.034秒，后两点实际为结束后81.042/171.041秒；达标8724汉字第5篇发生在全部六个旧资源样本之后，不能挪用样本。后批三轮切换/滚动均已有，停止/继续仅第一轮；r3-start仍缺。后批idle30相对锚点30.038秒，idle120标签实际154.368秒。各PID/渠道保留，不能跨批拼成完整相位，不为补字数无限新增请求。原始审计见本地final-three/t12-raw-phase-audit.json。


## T1/T2 §8 固定预算补批终态（2026-10-22 14:19–14:45）

验收点：同一main/renderer的三条连续逻辑长回复；每轮流式A→B→A、鼠标滚动、UI停止→Paused队列→显式继续→完成；baseline、start/stream/stop/resume/end及最终闲置资源；真实持久ID/Journal内容映射；恢复设置并正常退出。按启动和工具关闭→顺序三轮交互及定时采样→只读对账→正常退出分组。方法是固定dist的真实Electron/Playwright CDP，非native AX；仅原已授权DeepSeek文本模型，虚构科普，不读取文件或调用工具。独立profile/workspace在证据目录内。全程main44290、renderer44390，未手动GC。

证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/t12-final-budget-20261022/`。本批实际6次真实文本请求（1条准备/暖启动+5条正式请求），没有超出7次预算；第7次未发。只改tmp与本报告，产品/dist/coverage未改。

| 子点 | 实际步骤及终态 | 证据 |
| --- | --- | --- |
| 暖启动（不计正式轮） | 第1请求正常完成，8214字符/5938汉字。runner误等“停止”而实际aria名为“停止 Agent”，60秒超时；本条仅准备/暖启动，不计停止/继续覆盖。脚本错误不报产品Bug。 | blocked.json、r1-complete-late.json/png；assistant seq6803，f376aa78-1e92-403e-93c6-adc572db4ccc。 |
| 正式逻辑轮1（UI提示第2轮） | 流式A→B→A、实际mouse wheel上下；切换事件stillStreaming=1。实际点“停止 Agent”→Stopped；输入续写进入暂停队列，点“继续发送”后正常完成。停止片段1402字符/1053汉字、续写6909字符/4458汉字；它们是两条持久消息，不合成单条达标输出。通过该轮交互专项。 | r2-stream/stopped/paused/complete.json/png；seq8940/14404，finishReason分别aborted/stop。 |
| 正式逻辑轮2（UI提示第3轮） | 同上实际A→B→A、滚动、停止、暂停队列和显式继续。停止片段1424字符/1043汉字；续写5295字符/3508汉字。通过该轮交互专项。 | r3-stream/stopped/paused/complete.json/png；seq16592/20409，aborted/stop。 |
| 正式逻辑轮3（UI提示第4轮） | 第6请求在流式时完成A→B→A及mouse wheel；事件stillStreaming=1。随后runner把undefined的t12Seed.A传给投影查询，报path argument undefined，故没有执行停止和续写。回复自然完成，5963字符/4222汉字；正确sessionId查询确认turn6/6完成、activeTurn/Step=null、stop/continue均0。该轮长输出/切换/滚动通过，停止/继续未执行，不能签收整轮专项。 | r4-stream资源、progress.json；r4-after-natural-completion-corrected.json/png；seq25565，1a851fdc-7148-4429-8fdb-6e89d93e9ec7，finishReason=stop。 |
| 三轮专项总判定 | 正式三轮切换/滚动均已执行；只两轮完整停止/暂停/显式继续。临时runner另一次lastRound参数未声明，在发送前立即失败，没有新增请求。工具错误不是产品Bug。余1请求不足以补齐已完成轮的停止+续写组合，未追加调用。T2仍部分未覆盖。 | progress.json完整次数/事件；result.json保留错误终态，不把该文件名当全部成功。 |
| 持久内容/ID | 本profile同一session de17adba-ac1c-4d02-916d-f9d1a1e9f54e，共6条assistant/message；每条projection内容数组与Journal文本JSON完全相等，持久ID、requestId、finishReason与seq逐项映射。最终projection tools=0。正文长度按Journal text part统计，不以模型自称八千字、reasoning或虚拟化DOM挂载长度凑数。 | journal-summary.json、projection-journal-compare.json。用户user/message事件本身只含messageId/agentRunId，不存content，比较器对用户行的false是模式边界，不代表已观察正文丢失；assistant六行均true。最终DOM非每条逐字复制校验，保留该边界。 |

采样渠道为macOS `/bin/ps` 的瞬时CPU%/RSS KiB与CDP `Runtime.getHeapUsage` usedSize bytes；未手动GC。resources.json保留所有时间戳、PID、采样耗时与错误数组，不能当全程峰值或性能改进基准。start阶段在每轮发送前实际读取；resume标签位于显式点击继续前的暂停态，不冒称恢复后的stream读数（恢复后有真实stop按钮与最终完成观察，但未单独采恢复中资源）。

| 相位（UTC） | main CPU% / RSS KiB | renderer CPU% / RSS KiB | renderer heap used bytes |
| --- | --- | --- | ---: |
| baseline 06:19:52.089 | 0.0 / 115104 | 0.0 / 93760 | 11545232 |
| 轮1 start 06:22:18.549 | 34.2 / 180416 | 4.1 / 150736 | 23040516 |
| 轮1 stream 06:22:32.464 | 20.2 / 276208 | 58.8 / 301328 | 41881804 |
| 轮1 stop 06:22:33.866 | 29.7 / 311664 | 31.9 / 344448 | 62909644 |
| 轮1 resume前 06:22:34.716 | 31.0 / 315296 | 9.4 / 314320 | 51161072 |
| 轮1 complete 06:23:06.557 | 56.8 / 324880 | 33.2 / 299616 | 74262140 |
| 轮2 start 06:23:06.939 | 80.7 / 333984 | 34.6 / 302304 | 31300188 |
| 轮2 stream 06:23:20.174 | 10.5 / 303392 | 66.2 / 285056 | 38355232 |
| 轮2 stop 06:23:21.481 | 62.2 / 326432 | 57.2 / 346224 | 69666852 |
| 轮2 resume前 06:23:22.495 | 38.7 / 340432 | 11.2 / 314944 | 68603668 |
| 轮2 complete 06:23:49.531 | 70.5 / 320608 | 57.2 / 291952 | 46079960 |
| 轮3 start 06:27:57.394 | 0.1 / 111648 | 0.0 / 118784 | 34989360 |
| 轮3 stream 06:28:11.627 | 13.4 / 273424 | 64.8 / 287072 | 41866200 |

两轮完成后的自动定时窗口从06:23:50.083锚点开始，final-end-0、30、120样本同PID，后两点实际距锚点30.086/120.081秒，原始resources.json/progress.json保留；该窗口发生在第三正式轮之前，不能当三轮全结束后的窗口。

第三轮在06:29:49.276已确认自然完成；其第一条事后资源读数是06:30:36.934，晚于完成确认约47秒，不能称即时结束0秒。后续`r4-natural-end-30/120`标签实际距该锚点60.884/163.396秒，按真实时间记录。随后另开严格定时的延迟稳定窗口，06:35:12.883为窗口0，+30.003/120.003秒读取；这一窗口距完成确认已约324秒，不补即时结束阶段。

| 延迟稳定窗口 | main CPU% / RSS KiB | renderer CPU% / RSS KiB | renderer heap bytes |
| --- | --- | --- | ---: |
| 窗口0 06:35:12.883 | 0.1 / 103936 | 0.0 / 118112 | 34706356 |
| +30.003秒 | 0.1 / 109712 | 0.0 / 119520 | 36962160 |
| +120.003秒 | 0.1 / 99552 | 0.0 / 110672 | 35820540 |

post-run-stability.json与resources.json保存精确间隔。有限样本不证明收敛或泄漏；第三正式轮缺stop/resume、即时完成相位及恢复中stream样本，T1/T2整体仍部分覆盖。本批未达到单条8k汉字的事实照实保留，T1允许提前结束；不因此追加凑字数请求，也不否定已观察的长输出。

清理：先`app.quit`正常退出；main44290、renderer44390及utility44333/44334逐PID均absent。profile/settings.json已从本轮启动前快照精确恢复（包括工具禁用列表、快捷键、systemPromptPath、maxOutputTokens、thinking.chat），mode0600；本批未启动Provider/PTY/新监听端口。cleanup-pre.json、cleanup-app-quit.json、cleanup-final.json保存原始结果；原六项工具及其它初始配置不遗留本批变更。没有触碰用户profile、其它实例或共享服务，无产品修改、提交或推送。


## T3/T5 最后有限补测索引

[真实 Electron 逐项报告及27行原始计时/资源表](cu-electron-20261022.md)补正常新启动首次进入534.37ms、暖重复149.65/129.14ms；五页真实历史分页163.71–211.67ms，已加载早期/近期49.07–75.02ms；Usage筛选/刷新59.70–100.09ms。计时从实际UI操作到指定可见条件及双RAF，含自动化传输，不能当纯绘制耗时；Usage结束条件不独立证明后台重建完全结束。Context fallback计时和首次统计查询仍未被这一批签收。

T5真实Review +6000/-6000，文件列表到diff两轮79.82/125.32ms、resize32.84/48.86ms、关闭64.31/64.97ms；本样本均低于1秒，但大文本已确认BUG-014仍保留，不能据此宣布整个工作台性能通过。该批使用app.getAppMetrics的working set KiB及CPU采样，不能改名RSS；分别保留main/renderer PID，未GC。无新增Provider请求，所有自有实例正常关闭。


## T3 Context 正常重开 fallback 查询补测

同固定构建、自有profile副本正常重开，main14290。点击上下文用量→完整上下文→“上下文趋势”可见并双RAF：首次1399.07ms、关闭再开157.61ms。RPC旁证为last-request/stale、revision0、history ready；这是fallback UI耗时，不代签活跃current或纯绘制耗时。首次单样本超过1秒暂记查询性能观察，没有可复现无响应或冻结证据，不据此登记确定Bug。采样使用app.getAppMetrics CPU/workingSet KiB，未GC，不能改称ps RSS。原始D10-compact-fallback-timing.json及截图、详细过程见[Electron专项末节](cu-electron-20261022.md)。本批3次本地HTTP用于真实压缩链路，不含商业请求；自有PID6542/14290/6502及44359/44360监听均已清理并由主智能体复核。


## T1/T2 遗漏操作与相位的单次本地补批（2026-10-22 15:21–15:24）

验收点先列：真实Runtime流式→UI停止→Stopped；续写进入暂停队列且不发请求→显式继续→正常结束；同一main/renderer的baseline、开始/流式/停止/暂停/恢复中/即时结束/闲置30与120秒资源；持久ID及正文与Journal对账；正常清理。按隔离启动→一次连续交互→自动定时采样和只读对账→退出分组。先读上节方法/缺口，仅tmp runner使用已创建对象的sessionId并作非空string检查，消除旧t12Seed.A大小写错误；不改产品或dist，不重跑已通过的三轮会话切换。

方法为固定主仓库dist、真实Electron/Playwright CDP（非native AX）、全新自有profile/workspace、回环HTTP合成Provider。只进行这一次补批，2次本地文本请求，无商业请求。Provider通过OpenAI兼容SSE向真实Runtime逐80字符/70ms发送确定性虚构科普正文，不注入DOM、projection或Journal。模型/凭据仅本地synthetic；共24个工具名禁用（包含原六项工具），Runtime最终tools=0。独立main43729、renderer43789，全批不变；不拼旧main44290/renderer44390曲线，也不把这次本地负载写成DeepSeek第三轮已完成。

证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/t12-local-gap-20261022/`，完整runner为run.mjs，fixture.json记录driver/端口/session/profile。该session为9f163706-5e8d-4c33-b5bb-68e4ce9315ed。

| 子点 | 实际结果/状态 | 证据 |
| --- | --- | --- |
| 流式停止 | 通过（本地Provider）。实际UI发送LOCAL_STOP_PASS，正文增长后点精确aria“停止 Agent”；Stopped出现，持久消息finishReason=aborted，已收2080字符/1762汉字。 | stream.json/png、stopped.json/png、events.json。 |
| 暂停队列 | 通过。UI输入LOCAL_RESUME_PASS并Enter；队列显示“已暂停”“继续发送”。等待400ms期间HTTP请求数仍为1；仅点击“继续发送”后第2请求开始。 | paused.json/png、events.json paused-no-request、provider-requests.json。 |
| 显式继续及正常结束 | 通过。点击后真实第二个activeTurn/activeStep，恢复截图已有LOCAL_LOOPBACK_2_BEGIN和78个DOM正文字符、停止按钮可用；随后9302字符/7905汉字正常完成，finishReason=stop。最终turn2/2、activeTurn/Step=null、pendingInbox=[]、tools=0。 | resume-stream.json/png、complete.json/png、final-projection.json、journal-events.json。 |
| 恢复中资源 | 通过（恢复早期）。resume-stream在第二个请求收到后约4ms开始采样；截图/投影证明activeTurn而非暂停态。该样本处于首片段，不冒称恢复后的长规模峰值。 | resources.json、resume-stream.json/png；第二请求07:22:03.151Z，采样07:22:03.155Z。 |
| 即时结束及自动闲置样本 | 通过（本地Provider）。最终assistant/message于07:22:11.539Z落Journal，UI停止按钮消失后07:22:11.577Z开始end-immediate，晚38ms；同PID定时30/120秒，事件实测30051/120044ms（包括采样写盘耗时），采样起点分别+30003/+120000ms。 | resources.json、events.json、complete.json、final.json。 |
| 正文与持久ID | 通过。两条assistant逐messageId/requestId/turnId/seq与Journal映射，最终projection内容数组完全相等；与Provider实际已送正文也逐字相等，首尾与SHA256保存，2个唯一消息/请求。未以模型自称字数、usage或虚拟DOM长度替代正文统计。 | content-journal-compare.json、provider-requests.json、journal-events.json、final-projection.json。 |
| 覆盖边界 | 本次补齐本地真实Runtime操作链与同PID采样方法，不补签上节DeepSeek第三正式轮停止/续写，不拼成“同PID三轮DeepSeek完整相位”。正文是合成重复科普，不代表真实LLM理解、真实模型性能、长时间压力或泄漏结论。没有新增产品Bug；旧runner错误仍为采证设施问题。 | 本节与上一节分别保留，不删除原始观察。 |

采样渠道严格区分：CPU为macOS `/bin/ps` 的%cpu，内存为同命令RSS KiB（resident set size，非Electron workingSetSize）；renderer heap为CDP `Runtime.getHeapUsage` usedSize bytes。没有手动GC；所有资源样本errors=[]。baseline取启动/创建后首次值，尚有启动CPU负载，不作为稳定闲置基线。main JS heap没有启用额外inspector，本批未取得，不用renderer heap代替main heap。以下均为有限时点，不是峰值。

| 相位（UTC） | main CPU% / RSS KiB | renderer CPU% / RSS KiB | renderer JS heap used bytes |
| --- | --- | --- | ---: |
| baseline 07:21:59.888 | 103.7 / 322560 | 23.5 / 144720 | 11480724 |
| 发送前 07:21:59.989 | 86.5 / 321792 | 28.3 / 136384 | 11773564 |
| 运行流式 07:22:01.953 | 4.4 / 335520 | 35.5 / 198832 | 20743864 |
| 停止后 07:22:02.240 | 25.6 / 306848 | 26.2 / 221936 | 33624436 |
| 暂停队列 07:22:02.491 | 34.7 / 302528 | 22.9 / 232112 | 16389176 |
| 点击继续前 07:22:03.042 | 8.9 / 282752 | 4.2 / 232336 | 18382220 |
| 恢复早期流式 07:22:03.155 | 21.3 / 307888 | 17.8 / 233872 | 23475148 |
| 结束即时 07:22:11.577 | 4.1 / 261600 | 21.2 / 264800 | 46397756 |
| 结束+30秒 07:22:41.580 | 0.0 / 163328 | 0.0 / 144592 | 14780912 |
| 结束+120秒 07:24:11.577 | 0.0 / 167872 | 0.0 / 123472 | 16771024 |

持久映射：

| seq | messageId | requestId | finishReason | 正文字符 / 汉字 |
| ---: | --- | --- | --- | ---: |
| 39 | 3097798f-6789-4e36-83d6-07a77ea75bee | cdb0ff0f-4882-4f37-ab58-7224a45119e9 | aborted | 2080 / 1762 |
| 169 | f792e9a7-e3b4-49ba-8925-31a77eb484e9 | b06ae666-86b7-422f-b8f0-8f7d2b08459d | stop | 9302 / 7905 |

清理：实际`app.quit`正常退出，Provider server.closeAllConnections/close后driver自然exit0；main43729、GPU43756、utility43757、renderer43789、driver43728逐PID均absent，回环55726无监听。cleanup-before.json、cleanup-final.json和退出后独立ps/lsof的cleanup-external-proof.json保留证据。没有PTY、Host或新浏览器；没有读取/修改用户profile、旧profile、他人Electron或共享服务。本profile从零创建，只有本地synthetic凭据，旧商业批设置已保持其原先恢复状态；未改产品/dist/coverage、未提交或推送。


## T1/T2 DeepSeek 停止/暂停/继续的严格两请求补批（2026-10-22 19:26–19:30）

验收子点：真实DeepSeek流式时UI停止→Stopped；续写只进入暂停队列；显式继续→正常完成；同一main/renderer的baseline、发送前、流式、停止、暂停、继续、结束即时及+30/+120秒资源；持久ID、流式正文、Journal与projection逐字对账；原隔离配置恢复与进程清理。按配置快照/启动→一次连续操作→定时采样/只读对账→退出四组执行，没有重做旧三轮A→B→A或滚动。

方法：gpt-6.1-sol执行固定dist真实Electron/Playwright CDP，非native AX。沿用此前获授权的隔离profile `t12-final-budget-20261022/profile` 和原测试会话 `de17adba-ac1c-4d02-916d-f9d1a1e9f54e`，原workspace仍在自有验收tmp内；凭据由产品原链读取，harness只stat确认secrets.json存在，未打开或输出Key。未新建外部服务/Provider。该profile启动前settings按原字节留快照；本批临时关闭24工具及搜索/Fetch能力、使用tmp虚构科普system prompt、thinking.chat=off、输出上限16000，结束后原字节精确恢复。没有读取其原配置指向的用户system prompt。配置渠道与旧轮次不完全相同，不能用来比较性能改进。

证据根：`tmp/codex-acceptance/20261021-actspace-full-acceptance/t12-deepseek-stop-gap-20261022/`。runner为run.mjs；fixture.json、events.json、resources.json保留入口、PID和时间。全程main94514、renderer94564，不拼接旧PID曲线。两次真实商业主请求，均deepseek-flash、attempt=1：request/header seq25576和27547；没有第三次UI发送或凑字数重试。复用已有标题“T12 Final A”，没有新建会话或标题修改动作/新增title事件；自动标题未独立网络拦截计数。这里的两次计数由Runtime request/header与唯一requestId验证，未做独立TLS/HTTP抓包，不把本session主请求计数冒充全局网络计数。

| 子点 | 步骤、预期与实际终态 | 证据 |
| --- | --- | --- |
| 流式停止 | 通过本次补充逻辑轮。UI Enter发送虚构科普；新正文增长后点击精确aria“停止 Agent”；Stopped可见，队列pause事件seq27534，assistant/message seq27536 finishReason=aborted。实际持久正文1708字符/1177汉字。 | stream.json/png、stopped.json/png、events.json、journal-delta.json。 |
| 暂停队列、不自动发出 | 通过。UI输入续写并Enter；截图显示唯一待发内容、“已暂停”“继续发送”。继续前约1007ms观察activeTurnId/activeStepId均null；已完成assistant数量仍1。projection.pendingInbox=[]是这一投影的边界，不拿它否定真实队列UI；第二request/header只在显式resume事件后出现。 | paused.json/png；events.json paused-no-active-request；Journal queue resume seq27541、第二header seq27547。 |
| 显式继续、正常结束 | 通过。实际点“继续发送”，turnCount从7升8，activeTurn/Step非空；随后第二条正常完成，finishReason=stop。续写5141字符/3538汉字；最终turn8/8、activeTurn/Step=null、pendingInbox=[]、tools=0，停止/继续按钮退出运行状态。 | resume-stream.json/png、complete.json/png、final-projection.json。 |
| 恢复相位资源边界 | 已取得点击继续后真实activeTurn的早期样本，不能叫恢复后的正文流式样本。原始label为resume-stream，但此时DOM最后一条仍是已停止消息，旧live turn DOM id转为持久v2 id，runner条件因此提前成立；本报告将其准确解释为“恢复请求早期（尚无新正文）”。第二条后续实际流式由Journal连续assistant-delta与正常最终正文证明；其正文流式期间未另采资源，不重复请求补点。 | resources.json 11:27:02.527Z；resume-stream.json activity及assistantDOM；journal-delta.json。采证标签偏早是harness边界，不记产品Bug。 |
| 即时结束与闲置窗口 | 通过。最终assistant/message于11:27:27.250Z落Journal；即时样本11:27:27.519Z，晚269ms。自动定时+30.003/+120.002秒启动采样；所有10样本同main/renderer，errors=[]。 | resources.json、events.json、integrity-extended.json。 |
| 正文完整性和ID | 通过。两条消息各自assistant-delta拼接正文=最终Journal text=projection content中的正文，逐字相等；两个chunkIndex序列均从0连续无缺口，消息1957/3677个chunk（含reasoning），两个唯一requestId/messageId。最终完整content数组也分别Journal=projection。首尾、SHA256、seq/turnId映射保留。未以虚拟DOM挂载长度、reasoning或模型自称八千字计算正文。 | content-journal-compare.json、integrity-extended.json、journal-delta.json、final-projection.json。 |
| reasoning观察 | 停止条曾有1679字符reasoning-delta，但aborted最终content只有text，所以该条reasoning流与最终content不相等；续写条reasoning相等。正文及最终Journal/projection content一致。这里只记录边界，不据此宣称reasoning持久化已签收或新增确定Bug，未扩大追查。 | integrity-extended.json第一行chunkReasoningExactFinalJournal=false，journal-delta.json。 |
| 范围终态 | 补齐真实DeepSeek停止/暂停/显式继续、同PID本次相位、即时/定时闲置及正文对账原子项。原第三正式轮自然完成而未停止的历史事实不改写；这是同会话正常重开后的一个补充逻辑轮，不能冒称原同实例连续三轮均完整覆盖。恢复后的长正文流式资源仍未独立取到；单条未达8k–12k中文目标，按T1提前结束规则保留实际规模，不追加调用。没有代签F9整合T4、堆收敛、泄漏或全平台性能。 | 与上文14:19–14:45批及15:21–15:24本地批分开保留。 |

CPU为macOS `/bin/ps` 的%cpu；RSS为同命令resident set size KiB，非Electron working set。renderer JS heap为CDP `Runtime.getHeapUsage` usedSize bytes，未手动GC；没有main heap inspector，不用renderer heap代替main heap。启动后baseline仍有启动负载，不是稳定闲置基线，以下有限时点均非峰值。

| 相位（UTC） | main CPU% / RSS KiB | renderer CPU% / RSS KiB | renderer heap used bytes |
| --- | --- | --- | ---: |
| 启动后baseline 11:26:44.671 | 122.3 / 497792 | 21.1 / 285456 | 24461296 |
| 发送前 11:26:45.043 | 81.5 / 477984 | 13.1 / 282432 | 31927088 |
| 首请求正文流式 11:26:59.535 | 39.2 / 297872 | 42.5 / 302352 | 55928256 |
| 停止后 11:27:00.298 | 74.2 / 373472 | 56.0 / 327216 | 56643040 |
| 暂停队列 11:27:00.891 | 66.0 / 394608 | 19.4 / 311776 | 54620308 |
| 点击继续前 11:27:02.269 | 46.8 / 397984 | 0.5 / 288880 | 62816976 |
| 恢复请求早期（尚无新正文） 11:27:02.527 | 64.3 / 417920 | 32.6 / 336416 | 39457628 |
| 结束即时 11:27:27.519 | 60.6 / 348576 | 45.8 / 306992 | 99391716 |
| 结束+30秒 11:27:57.522 | 0.6 / 136864 | 0.2 / 147424 | 25646936 |
| 结束+120秒 11:29:27.521 | 0.8 / 107808 | 1.1 / 139360 | 24459348 |

| seq | messageId | requestId | finishReason | 正文字符 / 汉字 |
| ---: | --- | --- | --- | ---: |
| 27536 | 44a69ae0-2639-4f5d-94b3-ae7f188cfc01 | 59985b9f-5185-477f-a586-b1627339273b | aborted | 1708 / 1177 |
| 31226 | 13bd456c-0856-4270-9e8f-78469b85f812 | b2ae9767-e173-481f-bb52-8db597d0875c | stop | 5141 / 3538 |

清理已完成：实际app.quit正常退出，driver自然exit0。driver94513、main94514、GPU94541、utility94542、renderer94564逐PID均absent；本批调试端口50105无监听。settings与启动前Buffer字节精确相等、mode0600，恢复全部原工具及初始thinking/输出上限/systemPromptPath/快捷键等；secrets未写入。未启动Provider、Host、PTY或新浏览器，无其它自有服务待清理。cleanup-before.json、cleanup-final.json、退出后独立ps/lsof的cleanup-external-proof.json保留证据。本批只新增tmp证据/runner并追加本报告，未改产品/dist/coverage、用户profile或他人实例，未提交、推送或发起修复讨论。


## T3 历史/Usage 原生首次与重复查询（2026-10-24）

[当前冻结构建补证](performance-query-evidence-20261024.md)为实际Sol/high原生路线：H两次手动进入140.0/117.8ms（启动已缓存，非冷首读），五次后端分页210.1/132.9/168.6/305.8/174.0ms直至202条、最早/近期往返两次；Usage新query首次478.3、重挂载重复280.4ms，两组搜索246.7/316.8、清空293.7/306.9、页2 79.8/108.0、刷新74.1/95.5ms。均为真实事件到100ms完成状态采样的上界，含搜索防抖，不是绘制或SLA；新generatedAt排除旧缓存。对应CPU/RSS/heap前后样本、冻结2721条、源/副本Journal不变与清理均已记录。无新模型请求或确认Bug。

本节时点C仍待，后续[Context独立原生补验](performance-context-evidence-20261024.md)已完成两组明细/原文/路径查询及同阶段入口64.2/65.6ms；原始基准纠错、事件→完成状态、CPU/RSS/heap及清理分开保留。G0真实进入Memory且Collect garbage可用，只签方法可达性；G1已准备，14-A5尚无本批手动GC执行/收敛结论。原T1/T2/T4及其他有限窗口边界继续有效，F7-03/P2-P01不提前通过。


## T3-C 当前原生查询补证（2026-10-24）

[Context原生查询与资源主审](performance-context-evidence-20261024.md)完成两组278明细、两页65535B规则section原文及路径12→32→52/后端cache50→100，均按当前scope、唯一性、hash、settled核对。当前Context重挂首次/重复64.2/65.6ms；冷fallback和任务装配分别报告，不混算纯查询。仅1次本地HTTP、无新Bug；112原文件、源Journal与2721冻结条目不变，运行副本原前缀保持，仅正常追加。应用/observer/Provider均已结束并释放桌面。103/165通过、0失败、62未完成不变；G1独立有限手动GC已准备，尚未启动。

[剩余62项逐编号只读审计](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/remaining-dispatch-audit-high/report.md)已对齐coverage集合，给出8组路线；C类方法/权限/设备待核对不自动等于整项外部blocked。先G1，再按合法原生能力门和独立本机夹具补缺；Host/iPhone/未交付整合等各自前提保留。[14-A3 receipt门审计](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/receipt-gate-preflight-high/report.md)确认原项是本地Desktop IPC unknown后重启，WS代理可准备远端辅助但不能代签本地；随机race或停Provider不构成确定性接纳回执门。Goal继续active，不提交或推送。


## 原生手动GC主审增量（2026-10-24）

[14-A5真实手动GC证据](performance-memory-evidence-20261024.md)完成2预热+12原生生命周期，阶段0/4/8/12同anchor的used heap为11,729,328→13,810,344→15,048,228→15,530,824B，增量2,081,016/1,237,884/482,596B。没有预热后平台，14-A5仍未覆盖；不追加循环、不断言泄漏、不用RSS或不同PID拼接签收。28次HTTP全是本地，2721冻结条目无漂移；observer/应用/Provider均已结束。详见主审的采样时刻、CPU/RSS、原生恢复和执行异常边界。103/165通过、0失败、62未完成不变；下一批有限09菜单几何原生验收已独占桌面。
