# Context / SQLite 联合执行过程

## 启动

2026-10-11 用户批准六项决策与实施计划。基线 fix/context_manager_v1，HEAD 2cbb634f，保留原有未提交工作和恢复 stash。文件指纹保存于本地 artifacts/context-sqlite/implementation-baseline.json。

主智能体负责实现、定位和修复；最终 Computer Use 只委派 gpt-6.1-sol。当前尚未进入界面验收。

## 查询基础与引擎清单

- U-08/U-10：保留原断言先复现，修复 indexed/fallback 的 UTC 规范化与 resetAt 比较；62 项初始回归通过，四项 TODO 已移除。旧库修复依赖 schema 9 重建，尚不签收迁移性能。
- T2：新增单 Session descriptor，Provider 持写锁时提供可验证 append-only epoch；Runtime 仍以 durable 水位截断。Provider 13 项、Runtime 定向 3 项通过，未知同大小覆盖撤销证明。
- T3：schema 9 空库建索引；按批提交关联状态与 cursor。构建表隔离 published 的 FTS/rollup，完整后原子发布。故障测试覆盖两个中断点，已提交游标保留且旧统计仍可读。Usage Worker/Service 64 项通过。
- 调度改为有界并发等待者、共享 Session 同步任务和逐命令公平队列（前台最多连续 4 次）；原 64 项继续通过。并发专项和规模性能尚待验证。
- T4：已注册 workspace 不等待全历史扫描；发现过程异步有界读取、退出可中断，Agent 工具环境仍从 Session 解析 workspace。尚待启动/权限专项测试。
- T5：稳定来源 key、当前投影缓存、实例 generation、请求 manifest、实际模型容量及压缩策略阈值已加入；引擎 22 项通过。模型输入被改写时标不可比较，不能伪造来源。大记录预算与 Loop 回归尚待验证。

证据保存于本地 artifacts/context-sqlite/ 的 t1–t5 日志。当前进入 Context 历史索引与门面接线；没有启动 Computer Use。

## T6–T8 实施与阶段验证

- schema 9 增加独立 Context 请求/清单/事件/统计投影、building generation 和批次 cursor。共享 Worker 按前台最多四批后轮到后台一批调度；取消单个等待者不破坏共享同步。
- 面板门面已接入真实 current projection + 单 Session history；当前/历史独立版本、条件响应、分页与 UTF-8 全文分段已接通。历史只保存最近两份清单元数据，保留消息类型及轨迹身份，不保存正文。
- renderer 可见时单在途刷新，隐藏释放消费者，历史追平无需新消息；新增 context-pagination mock，覆盖加载更多、错误/重试和全文分页。
- 73 条 read-model 回归通过；另追加 bulk/逐行语义等价、回滚及历史轨迹元数据回归，正在执行。Context engine 23、Loop 37、Runtime 56 条通过；Desktop 全量 1754 通过、1 超时、2 跳过，超时文件独立复跑 5 条通过，保留并行失败记录。
- 包边界、IPC、renderer bridge、主题/token 检查通过；Electron 39.8.10 browser-process 探针通过 Provider Worker、SQLite Worker、FTS5 与 fallback。开发布局探针不代表最终安装包。
- Context 真 JSONL/Runtime/Worker 联合基准：600 请求 × 3 Sessions、621 当前条目，单 Session 查询未枚举全库；完成后热探测读 0 事件，关闭消费者后读 0 事件；与 Usage 冷同步并发的 current p95 约 5.4ms。主响应约 171KiB、条件响应均值 237B。首次 descriptor/Worker 初始化约 293ms，单独报告。
- 性能尚未签收。S 初测 1k/5k 追加 p95 332/1853ms；批量汇总初版被 SQLite 的 GROUP BY 覆盖索引选择拖慢，已用 rowid 范围约束修正并保存前后样本。页缓存固定 32MiB、WAL 自动 checkpoint 16MiB 的后续复测仍未满足 250ms。U-01/U-06 保持失败；M/L/XL 规模任务运行中，不能把热查询达标解释为冷同步达标。
- Computer Use 尚未启动；隔离 loopback provider 与 workspace 已准备，不读取真实用户配置，也不把受控 provider 当作外部模型 API 验收。

## T8–T9 集成与真实界面（继续执行）

- 全仓 typecheck、build 通过。全仓 test 首次发现 contract matrix 生成文档过期，按当前源码重新生成后该检查通过；随后 Desktop 并行全量为 1743 通过、13 失败、2 跳过，并伴随一个超时后清理异常。失败主要为 5s/30s 超时；不能记作全仓通过。7 个失败文件与新 Composer/布局测试共 9 文件串行复跑 100 条通过。原始并行失败日志保留在 `artifacts/context-sqlite/t8-repo-test-regenerated.log`。
- 生产依赖部署使用 pnpm deploy --prod --legacy --offline；在该目录运行 stock Electron browser-process 探针，Provider Worker、SQLite Worker、FTS5 和两个 fallback 均通过。只证明部署依赖/入口可用，不代表签名安装包验收。证据 `t9-prod-deploy.log`、`t9-prod-package.log`。
- 委派 gpt-6.1-sol 执行 CU。mock 发现 Composer 仍从旧请求数据读取，新增轻量当前投影刷新 hook，前台单在途、隐藏停止、会话迟到丢弃；100 条串行回归包括此 hook。mock 定向复验两处均 ≈78.4K / 200K、39%。
- 真实 Electron 使用固定构建和隔离数据，避免 watch 重载干扰操作。首次切换启动方式时旧 Host lease 尚未过期，任务排队；正常退出、lease 到期后重开，真实队列恢复。未删除锁文件或手改 Journal。
- 真实 Loop 经 loopback HTTP fixture 完成 bash 审批、write_file、输出持久化；CU 现场观察面板从约 6K 到 6.3K、工具调用/结果各两条、统计追平，无需重开面板。工具行成功定位同 callId 的轨迹。
- CU 完成切模型、手动压缩、压缩后再请求：模型事件标明推导来源，摘要独立分类，趋势显示压缩，未知回收量不伪造。两个 fixture 模型容量相同，因此不能签收容量变化。
- C-02：内部 seq=-1 哨兵暴露在进度文案；已改为 0 起的已处理记录计数，等待新构建 CU 复验。各点证据持续写入 [Computer Use](computer-use.md)，部分覆盖不能签收整个 C/E 点。
- M 基准（批量优化前构建）1,221,000→1,341,000 activities：冷重建 34.21 分钟；page/FTS/cursor 热 p95 76.08/81.62/67.32ms；1k/5k 追加 p95 2034.61/15085.89ms，仍失败。该结果用于前后版本诊断，不代表最终构建达标。L 最终构建冷同步与 XL SQL 长跑继续，不能提前签收。


## 定向修复与资源观察（2026-10-11 晚）

- C-02/C-04 小 Electron 复验通过：同步进度没有负数，历史回退 Composer/面板同为19%。C-03 resetAt 已索引数据查询回归先失败后修复，76条 read-model 用例通过；真实 UI Usage0/Context720，下一请求Usage120/Context840。
- 查询库 owner 局部故障时，小 Electron 仍可发请求，Usage/Context 明确回退；正常退出恢复 owner 后标签消失、数值一致。首次整目录故障导致启动失败，不计入查询故障通过。详见 Computer Use 报告。
- C-05 窄窗表格反向键盘焦点裁切已修复，10条 UI 回归通过；C-06 新建/首次提交不应等待历史导航索引已修复，6条回归通过，Desktop类型与renderer固定构建通过。CU逐点复验继续。
- XL合成SQL 10m/10k 完成：同步55.64分钟，热activity/FTS/cursor/statistics p95为2.78/2.57/2.73/15.67ms；loop p95/p99为12.04/14.30ms，max133.82ms。此结果不覆盖真实Journal、Electron或CU。
- M真实Electron Usage冷同步期间Main loop p95/p99为351.8/472.4ms、max1305ms，明确失败；取消后冷catalog结束，后续idle样本恢复约14/15ms，不能抹去同步阶段阻塞。保存cu-m-cancel.json及每次启动独立metrics。
- M fixture含1,341,000 activities/1,000基准Session，另增610个合法历史Session用于连续分页；真实Electron与Node基准codec digest不同，需要实际重建，不能称暖库。兼容表结构准备不代表产品迁移通过。基准的Harness main选择与Electron Host contract不一致，首次新任务被保护机制阻断；需备份隔离fixture的harness-state并正常初始化，保留全部Session和SQLite事实。
- L真实Journal长跑仍在进行，原始日志l-journal.log未结束前不签收。U-01/U-06及M同步资源门槛保持失败。

## 2026-10-12 定向复验与设置入口修复

- M 合法历史 610 条由 CU 连续翻过13页，页边界无重复/遗漏，跨工作区打开正文与轨迹正确。兼容 Harness 初始化后首条请求完成；模型容量32768→65536，面板32.8K/18%→65.5K/9%，Composer一致，C-06及容量变化分项通过。
- C-07：live capability 异常隔离到 current 状态，不阻断 SQLite 历史；新增失败回归后10条 Context read-model 测试通过，main构建通过。真实异常态尚未复验，不能以受控测试签收。
- C-08：实际 Main CPU profile 指向快捷键设置挂载的旧全量列表；profile 中14.3秒位于 applyUsage、3秒 snapshotSessionJson、2.6秒 immutableState。IPC list-sessions 单次约286.5秒。已改按需 SessionSearch，不在通用页初始化读取会话。定向34条用例、Desktop类型及renderer构建通过。profile、构建、测试位于 artifacts/context-sqlite/c08-* 与 cu-m-main-before-c08.cpuprofile。
- M Usage 当前完成巨型 Session 的输入读取，仍在原子发布；Journal events 与 activities 数量口径不同，不能把读取229万事件解释成134万activities被重复扫描。发布阶段仍有整 Session 事务，虽内部256行分批让出事件循环，不能据此声称其他查询可插入这个事务。该公平调度边界继续保留为未达设计项。

- C-08实机复验：进入General、按需搜索/下一页/选择、禁用/恢复均通过；实际Main loop p95/p99约12.75/14.17ms，30秒profile约29.87秒idle，没有legacy list-sessions。启动max433ms与旧慢组保留。
- C-09：EXPLAIN证实building复制误用session逻辑索引，每256行重复排序，已在SELECT页边界与INSERT SELECT两处约束rowid范围；M只读5页探针projection每批0.45–2.8秒降至0.4–3ms，activity约120–177ms降至2ms；两版行边界相同。重新构建后77条后端回归通过。M大Session342000活动/2394000seq实际发布，但CU随后仍报Worker超时，保留失败并仅正常重试一次。尚不能将超时确定归因于checkpoint。
- L原长跑在2614/5000 published时发送SIGINT，保留building/cursor后使用C-09构建续跑；没有清库或改水位。原冷任务和续跑分别记录，后者不能当最终版本完整冷重建。
- C-10：CU重启后目标丢失，检查无fixture种子重置。新增实际settings.json和重新load回归失败，确认v4序列化仍用旧metadata.shortcuts。修复后settings characterization/controller/选择器共46条通过；待CU重开复验。


### 2026-10-12 小库补验

- C-05窄窗浅深键盘焦点、C-10指定会话设置正常重启后保留，由gpt-6.1-sol实际复验通过。持久化文件独立核对。
- 新增create-context-acceptance-fixture.mjs，只允许隔离临时目录：生成600个合法历史request，最近两个manifest各621条；全部事件经过core codec校验。明确为合成历史事实，不是provider实际调用。CU通过真实IPC完成200→400→600→621分页，总量稳定、末页停止；500请求/200事件截断提示与历史全文不可用状态正确。
- 补验C3时受控provider把runtime_context当最后用户，工具分支未触发；修正测试夹具，保持同端口继续复验，不把该夹具问题记作产品工具故障。

## 2026-10-12 00:45–01:10 性能隔离与补验

- C11让有界普通Journal追加采用MEMORY临时空间，重建/metadata和查询仍FILE。77条后端通过；并发样本S465k→585k，1k/5k p95约758/3915ms，首次标题12449ms，不与其他负载组直接作A/B。
- C12删除私有building表的七个页面排序/筛选索引，保留身份/Session/关联索引与正式表全部查询索引。schema9旧building cursor不失效；在重启恢复回归中注入旧索引，重开后仍正确发布且旧索引消失。最新Usage67+Context10=77通过；Desktop类型与Main构建通过。
- 为独立测量，L在3066/5000正常已提交边界停止；M由gpt-6.1-sol记录583/1612后正常退出。C12独立S585k→705k基准各20次，1k/5k p95 358.12/1753.86ms，首次标题7423.25ms，Main loop p95/p99/max 11.11/11.64/23.74ms。U01/U06仍失败。
- 单次带SQL计时样本705k→710k显示标题临时聚合约8717ms；尾部SQL计数不是完整采样，不能将其总和当完整阶段拆分。Native采样同时看到SQL/序列化/WAL开销。
- C12恢复M后实际CU观察605/1612，证明已提交进度继续，尚无最终结果。L未恢复，不冒称最终L验收。
- Chat允许web/generate_image由agent-mode-policy源码确认；默认maxAttempts=1，所以429终态失败不属于自动重试Bug。CU实际验证失败未重复累计、hold/release切会话无串入、切回自动追平、停止后无迟到完成。
- Small隔离workspace新增109943B惰性规则，真实请求加载后CU从64KiB第一页翻至末页并看到完整结尾；测试后仅删除该新建规则文件。浅深×宽/约483px空态四种补验通过。浏览器IAB原表面消失，Chrome auth不支持，mock剩余矩阵保持未覆盖，没有改用脚本冒充CU。
- 性能结构调整建议单独落performance-review.md为待审材料；未实施新schema/Runtime查询端口，原计划active。
- 本轮收尾：gpt-6.1-sol记录M最终742/1612、1113072个事件，证据m-design-review-stop-ax.txt，随后正常CmdQ退出M与Small。停止测试负载是为设计复核，不是用户取消或验收通过；L保留3066/5000。最新Desktop类型、文档检查、git diff --check通过，逐点CU仍保留M超时失败与剩余未覆盖项。

## 2026-10-12 用户取舍后的验收续行

用户明确同意先不做预先统计、不追求5000条追加250ms，也不启动发布结构重构；保留压力边界，重点验正常操作与大历史下可用性。已同步联合设计、主计划、两个验收矩阵和U清单；未改业务代码。指定gpt-6.1-sol子智能体恢复CU，M继续使用原隔离库与已提交进度，provider复用原55011/55012。首次尝试启动provider端口占用立即退出，核验原PID11063为已有fixture且release成功，无替换/杀进程。

### 日常复测与M最终结果

- 既有710,000活动/100会话查询链路，1/5条追加各20次p95为7.97/7.80ms，最终710,120条，只读取7/35新增事件。与M Electron并行，未称隔离A/B；首次标题8.92秒保留已接受限制。
- M正常普通请求120Token、两轮工具请求各360Token，合计4次真实fixture工具调用。CU观察当前Context、切会话及后台追平正常；Main中间采样p95/p99约12.71/12.88ms，启动max349ms单列。
- M已完成1613会话发布，0building；生成器1,341,000请求+真实小会话2/7个requestId=1,341,009，工具4次。只读SQL合计174,331,080tokens、已知费用1341美元、9次费用未知，CU实际最终界面与之吻合。证据m-normal-final-counts.json；取消/重启跨多构建，不将本轮耗时当完整冷重建。
- Small新增9events合法历史fixture验证旧请求缺模型容量：真实IPC中分母/比例未知，未猜容量；真实新消息改变revision后已读原文清除并可重读。原生鼠标横滚尝试无实效，仍不代签。
- L仅准备专用app、受控provider配置和610条合法可见历史，尚未启动时不算验收通过；原5000基准Session及已发布水位未改。

### L日常路径与本轮收尾

- L通过实际普通回复、审批pwd/write_file与Context更新；追加普通消息后累计600Token。首次目录5611会话完成后搜索0000→清空→0609、跨工作区正文正确，返回当前会话不串入。Usage取消一次明确提示，重试后进度继续；离页聊天正常，回页续行。完整最终统计未完成。
- 首次目录处理触发Node→Desktop codec合法校验，不能把原Node已发布3066/5000当Desktop无需重校验。没有篡改codec或水位。主端结束本轮隔离压力负载并保留已提交进度；不将停止解释为全部验收通过，也不把此前性能建议恢复为执行任务。
- M成功截图另存m-normal-final-usage-*；m-final-usage-*曾被本轮新结果覆盖，旧C09超时仍以原日志/文字证据保留，不再指旧文件名证明旧截图。
- L Main阶段采样heap峰值306.75MiB，loop p95/p99 12.66/13.09ms，启动max376.70ms单列。Small峰值60.60MiB。没有把这段样本当L完整冷重建或长期GC门槛通过。
- 原生mock宿主CU AX/截图约61秒，真实Small/L通常不到1秒。仅新增浅色宽/窄错误可读性，其他未覆盖按矩阵保留；不能以工具慢推断产品冻结。

收尾进程核对：L、Small、Mock exec均exit0；专用provider55011/55012与mock Vite5197确认PID后停止，未影响其他服务。L终止前CU94/5611与只读新Desktop codec94会话一致，仍有旧Node published2972会话；未把新旧codec总和当全部完成。

## 2026-10-12 19:56起：继续补齐剩余验收

用户再次要求继续；三项性能结构优化仍暂缓，本轮不再因大库耗时长主动停止。启动原L与Small隔离数据，不重新seed、不改水位；代码指纹相对上轮无业务变化。gpt-6.1-sol继续负责CU，L重开后实际105/5611超过上轮94，保持统计运行；主端每10秒只读记录进度、Main/子进程内存与响应，证据l-completion-samples.jsonl。

- 首次压缩故障注入未触发：真实COMPACTION_SYSTEM已改为“You are a context summarization agent.”，测试HTTP provider只识别旧句。修正测试夹具识别并新增实际提示词回归；原实现同断言exit1，修正后exit0。未修改产品压缩逻辑。原误触发成功压缩明确保留，不当故障通过。
- 重新注入后真实/compact失败，按钮重试成功。正常记录由1次旧成功+本轮误注入成功1+重试成功1组成3次；失败不伪增成功次数。
- Small专用临时故障宿主在Runtime读取当前投影处抛错，面板明确显示最近请求来源，历史统计/趋势/事件继续；一次原文请求改为过期revision，经真实后端校验拒绝，界面显示错误，再点击成功。该证据是受控故障的真实IPC/界面，不冒称自然竞态复现。
- 新增JSONL真实writer fsync闸门测试：字节确已写入文件但尚未fsync，单/批量descriptor等待writer确认，旧durable cursor返回空，确认后只读新增且appendOnlyToken保持。JSONL14条通过。不是Agent运行中CU，因此原CU缺口仍需分层说明。
- Desktop全量串行首轮1759通过/5失败/2跳过；5失败集中在旧四舍五入/未知容量/搜索回调契约断言，非旧并行超时。只更新3个测试文件及1个已知容量为空的对照用例；定向128条通过，继续全量串行复验。不把旧13条并行失败抹除或说原默认并行已通过。

- 全量串行最终219文件通过/1跳过，1765用例通过/2跳过，508.93秒；默认并行命令另行复测，不混写结果。
- 整体IPC错误态CU暴露C-15：单行truncate让内部通道名遮住原因。修成中文摘要+折叠原始详情+不收缩重试按钮；11条面板回归、renderer构建及类型/theme/token/bridge检查通过。仅重建renderer并重开Small，L后端进程持续运行；L尚载入旧renderer，最终需说明版本边界。
- 独立Python逐行读取全部L Journal核对请求/用量/工具/日期/模型/服务商，不使用产品投影或SQL累计作为真值；与L重建并行，因此该时间段明确存在额外磁盘和CPU负载。

- 真实Agent fsync CU完成：物理assistant批次234–236已写而未确认时，descriptor等待，Usage1680不变；释放后1800仅增加一次。CU开关只在Small临时宿主，产品代码无持久化旁路。
- C-15四组合及门控Retry复验通过；Usage四组合暴露C-16，技术错误直出且窄窗重试按钮换行，修成中文摘要/可展开详情/按钮不换行。7条Usage测试及renderer/typecheck通过，保留用户取消原提示。Small重开加载修复，L持续运行不重启。
- 新增仅隔离宿主启用的资源探针，统计Usage Worker消息类型/SQL读取与聚合次数，不写查询正文；可明确请求Main与Worker各自GC后采样，用于补空闲可见/关闭消费者/内存增长验收。

- 资源探针GC实验失败：inspector回调内disconnect后Main/Worker采样均停止，线程样本停在V8/inspector等待。另一次运行时setFlags+新vm上下文取gc的独立试验也未完成；只终止这两个隔离Small进程，L未触碰。隐藏测量作废并保留证据；移除GC触发后重启Small，63.82秒隐藏状态日志持续更新且查询计数增量为0。此前可见空闲104.65秒及General77.60秒测量有效。
- 独立Electron从启动传入--js-flags=--expose-gc，使用Main/Worker各自globalThis.gc完成后，双方定时器正常运行并退出；日志gc-main-smoke.log、gc-startup-smoke.log。此为测量工具验证，尚不等于产品长期内存通过。

## 2026-10-12 用户取消大库并收尾

用户明确取消510万条L最终验收；gpt-6.1-sol正常退出Large，退出前2878/5611会话、19,490,695记录。Small/Mock也退出；主端停止专用Vite，保留数据、派生库、截图和进度。L最终SQL核对脚本未执行，不补写通过。

Small1000次完整面板查询p95 2.40–4.36ms，GC后Main约+1.51MiB、Worker稳定，未定性为产品泄漏或通过长期门槛。停止L后默认并行测试1731通过/34失败/2跳过（9文件，214.54秒）；因此撤销仅以L负载解释超时的推断，保留独立测试稳定性问题。

最后补验普通7/30天时，主端误向Small会话stdin发送Ctrl-C，CU随后看到默认Electron壳。该次证据作废，是验收操作错误，未修改产品；重新以隔离env和明确宿主启动后定向复验。没有重新启动L。
