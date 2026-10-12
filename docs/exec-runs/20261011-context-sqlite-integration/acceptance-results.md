# Context / SQLite 联合验收结果

截至2026-10-12，**实现与本轮验收收尾，L剩余范围由用户明确取消；并非所有门槛通过**。范围见[验收计划](../../exec-plans/completed/20261011-context-sqlite-integration/acceptance.md)。所有“部分通过”只对右栏已列分项有效；其他分项为未覆盖，不代签整项。

## 工程与后端

| 点 | 结论 | 证据与边界 |
| --- | --- | --- |
| B1 | 后端通过 | engine23、Loop37；manifest与模型输入同源、分类/身份/容量、分页总量。真实长清单另属C4。 |
| B2 | 后端通过，实机部分通过 | engine/Loop/Runtime隔离与持久化回归；小Electron实际工具/下一步自动更新。所有重建竞态实机未逐一注入。 |
| B3 | 后端通过，实机部分通过 | 77条read-model包含prepared/旧快照/缺usage/重试去重；CU真实压缩、模型/模式切换与429失败已覆盖；默认maxAttempts=1，不声称自动重试成功。 |
| B4 | 部分通过 | JSONL14（含真实writer fsync闸门）、Runtime查询3；无变化0events、单Session不枚举、增量/替换/截断。真实Agent已在assistant批次物理写入后、fsync前暂停：descriptor等待且Usage保持1680，释放后1800，仅增加120；受控HTTP Provider。 |
| B5 | 部分通过，有性能缺口 | 原子批次/取消/重启/代际/故障/schema/reset回归通过；小Electron局部库故障恢复通过。大Session最终发布仍长事务，U-02/U-05/U-09未全部关闭。 |
| B6 | 后端通过 | U-08/U-10原4个失败断言去TODO；indexed/fallback正负offset、相等边界与稳定分页回归。 |
| B7 | 部分通过 | current/history独立、历史来源、live异常回退测试与CU历史状态；读面板不启动Run。能力inspection仍经Harness租约，不能称完全无恢复机制。 |
| B8 | 后端通过，实机部分通过 | IPC guards/gateway、分页revision/cursor、全文预算回归；开发/生产依赖布局Worker探针。未验证最终安装包及完整远端真实部署。 |
| B9 | 后端通过，实机部分通过 | 单在途/迟到/隐藏/条件返回回归，Context基准无变化0events、关闭0events，CU无新输入自动追平。长期多窗口空闲矩阵未全部覆盖。 |
| A1 | 后端通过 | Usage时间/过滤/FTS/币种/null/run去重，77条read-model；M真实大库最终统计已独立核对；L最终核对由用户取消。 |
| A2 | 部分通过 | 增量水位、替换、删除、坏源/恢复回归；实机未flush尾部及释放后仅一次更新已覆盖，见B4。 |
| A3 | 部分通过 | 后端故障/owner/恢复边界及小库CU；大库恢复最终结果未签收。 |
| A4 | 部分通过 | 真实Loop/Session/轨迹与610条合法历史通过；查询库局部故障期间仍发请求。L搜索、跨工作区正文和返回当前会话已通过。 |

日志在 `artifacts/context-sqlite/`，包括 `c12-read-model.log`（67/67）、`c12-context-read-model.log`（10/10）、`t8-*`、`c06-*`、`c07-*`、`c08-*`。CI式全量失败保留 `t8-repo-test-regenerated.log`，串行复跑另见 `t9-serial-retest.log`。不得合并成“全仓测试通过”。

## 性能与资源

| 点 | 结论 | 实测与边界 |
| --- | --- | --- |
| P1 批量增量 | **用户接受限制** | C12独立负载S 585k→705k，1k/5k各20次p95 358/1754ms；此前并发慢组与M批量优化前2035/15086ms均保留，均超过250ms。只读新增事件正确并不代表耗时通过。 |
| P1 首次复杂标题 | **用户接受限制** | C12独立负载S首次7.42秒，热p95 10.43ms；带计时定位样本聚合SQL约8.72秒。旧4.55秒组保留，首查必须单列。 |
| P1 热查询 | 部分通过 | 日常S page/FTS/cursor p95约6.11/6.47/4.71ms；M最终CU分页/各Tab/筛选通过，但非20次IPC热查询分位测量。M旧构建约76/82/67ms、XL合成SQL约2.78/2.57/2.73ms保留；不能代签最终L Electron。 |
| P1 冷重建 | 未签收 | M旧构建34.21分钟；L原冷任务被C-09修复续跑，不能混成最终冷时间。XL SQL10m55.64分钟，不是Journal。 |
| P2 Main响应 | 部分通过，保留失败 | M修复前p95/p99约352/472ms失败；C-08修复后12.75/14.17ms，启动max433ms单列，30秒profile约29.87秒idle，无legacy全量列表。本轮M最终12.71/12.86ms、L日常与同步样本12.66/13.09ms；各自启动max349/377ms单列，不代表L完整长期门槛通过。 |
| P2 内存/体积 | 部分通过 | Context621条主响应174854B、条件响应237B；并发current p95约5.4ms。XL Main/Worker heap约37.3/24.9MiB、共享进程RSS约164MiB。最终L GC后长期趋势未验证，用户已取消；Small 1000次查询观察见末节。 |
| 发布复杂度 | 修复待全链路复验 | C-09 M只读SQL探针：projection每256行原0.45–2.8秒，rowid范围后0.4–3ms，行边界相同。只证明这段查询，不等于发布事务/最终结果全部通过。 |

最新独立组：`s-c12-isolated-journal.json`、`s-c12-profiled-journal.json`、`c12-sql-statement-profile.json`；分析与本次不实施的结构建议见 [性能复核](performance-review.md)。2026-10-12用户接受上述批量追加与首次标题统计的耗时限制，不将原测试失败改为达标；日常少量新增、正常操作、热查询及恢复继续验收。

主要证据：`s-cache-journal.json`、`m-journal.json`、`xl-sql.json`、Context benchmark结果、`cu-m-before-c08-metrics.json`、`cu-m-c08-metrics.json`、前后CPU profile、`c09-publication-probe.json`、`l-before-c09-resume.json`。各样本版本与负载以执行过程为准，未剔除慢组。

## 2026-10-12 日常少量新增复测

沿真实JSONL→Runtime校验→Main→SQLite Worker链路，在已有710,000活动/100会话的隔离库中各追加1条和5条20次；最终710,120条。p95分别7.97ms/7.80ms，单次只读取7/35个新增事件，最终计数正确，无变化读取0事件。page/FTS/cursor热查询p95约6.11/6.47/4.71ms；Main heap采样峰值48.11MiB，loop p95/p99为11.20/11.33ms。该样本是查询链路，不代替CU，不含renderer；同期M Electron验收运行，不能当严格隔离A/B。首次标题仍8.92秒，按用户取舍保留。证据：`artifacts/context-sqlite/s-normal-increments.json`。

## Computer Use

执行者为指定 **gpt-6.1-sol** 子智能体；证据类型均在[CU报告](computer-use.md)区分。下表是汇总，不替代操作记录。

| 点 | 结论 | 已覆盖 / 未覆盖 |
| --- | --- | --- |
| C1 | 主要路径通过 | 空/当前/明确历史回退、五区块/Composer一致通过；旧历史缺模型容量的真实IPC路径已补验，分母/比例未知，未猜数。 |
| C2 | 通过（小真实链路） | 输入→审批→bash/write_file→持久化→助手完成→下一步实时更新；受控HTTP provider。 |
| C3 | 通过（约定覆盖范围） | 四类mock筛选、真实普通工具同callId、最新用户/助手、mock缺失提示；最新工具调用/结果真实定位同一write_file callId通过。 |
| C4 | 通过（约定覆盖范围） | mock670项、总量稳定、非会话全文两页；真实合法历史621项200→400→600→621分页及末页通过，历史全文不可用明确；真实Loop规则109943B原文两页/末尾已通过；revision变化后旧原文主动清除并可重读已补验；强制旧revision经真实后端拒绝→再次读取成功，已补受控故障CU。610条历史分页属于E4。 |
| C5 | 通过（约定覆盖范围） | 真实压缩/摘要/趋势/推导事件、模型容量32768→65536通过；合法历史600请求展示最近500请求/200事件的截断提示通过；Chat→Agent→Plan→Agent及请求Context更新通过；429失败明确且不重复统计；自动重试不适用于默认maxAttempts=1。 |
| C6 | M通过，L已执行部分通过、余项取消 | M离页/显式取消/重开后最终1613会话全部发布，统计与独立核对一致；当前Context可用，完成后自动追平。L取消→重试→离页聊天→回页继续通过；最终结果由用户取消，不签通过。 |
| C7 | 通过（约定覆盖范围） | 历史自动追平、小库故障恢复、Usage0/Context720→新请求120/840；reset由测试端注入，不声称存在清零按钮。hold/release期间切会话不串入，返回自动追平；停止后无迟到完成且累计未增加，实际通过。长期资源观察另见P2。 |
| C8 | 通过（约定覆盖范围） | 浅深、宽/481px、多处结果/错误/加载态；C-05浅深约483px反向键盘焦点复验通过，真实空态已补浅深×宽/483px；Context加载浅深×宽窄及自动恢复已补；整体错误态C-15修复后四组合及实际重试通过。Usage加载/错误浅深×宽窄均已补验，C-16修复后详情可读、重试不挤压且恢复成功。 |
| E1 | S/M通过，L已执行部分通过、余项取消 | 小真实库加载→结果/空态；M恢复后最终1,341,009请求与174,331,080tokens一致，9次未知费用明确；L最终结果由用户取消。 |
| E2 | 主要路径通过，L取消 | M日志1→2→1、4服务商/26模型/2工具、无匹配/清空/bash2条、失败状态空、24h9请求1080Token→全部恢复→刷新一致；Small约489px鼠标拖动横向滚动条右→左通过；键盘通过，wheel尝试未生效不计通过。 |
| E3 | 部分通过 | 小库owner故障→fallback→恢复提示消失、真实请求继续；M取消恢复最终结果通过；L取消恢复进度通过，最终结果由用户取消，未验证。 |
| E4 | 通过（约定覆盖范围） | M合法610条13页无重漏、跨workspace、标题/短语、清空、正确正文/轨迹通过；L首次目录处理后搜索0000→清空→0609、跨workspace正文正确，返回当前Context不串入。L未遍历全部历史页面，完整历史Context未覆盖。 |
| E5 | 通过（约定覆盖范围） | 浅深宽/481px结果布局通过；C-05反向焦点复验通过；加载/错误浅深×宽窄已补，C-16修复及实际重试通过；鼠标拖动横向滚动条左右通过。原误命名深宽loading截图实为error，已另存recheck补证，不用错图签通过。 |
| E6 | M通过，L已执行部分通过、余项取消 | M全量结果各Tab/分页和正常消息/工具/切会话通过；L实际普通回复与工具/Context已通过，首次目录处理完成后搜索/跨工作区正文通过，统计最终结果由用户取消。 |

## 问题与签收规则

U-01–U-10只在[原Bug清单](../20261011-usage-sqlite-read-model/acceptance-bugs.md)维护；C-01起见[联合Bug清单](acceptance-bugs.md)。用户明确接受的批量追加/首次复杂标题耗时标接受限制并保留原测量，其余未达门槛仍写失败；未操作的CU项只写未覆盖。计划按实现完成归档，验证边界保留。

## 本轮收尾边界

本轮按用户确认的日常体验优先取舍收尾，不再启动预先统计、批量追加性能或发布结构优化。L基准5,101,000条活动：实际聊天、工具、Context、首次目录完成后的搜索/跨工作区打开及取消恢复已通过；整库Usage最终结果仍未完成。主端结束本轮隔离压力负载，保留已提交水位，不将停止当作用户取消或最终验收成功。最终L、完整加载/错误视觉矩阵、强制stale错误等仍列未覆盖，主计划保持active。

L日常阶段Main heap采样峰值306.75MiB，loop p95/p99为12.66/13.09ms，启动max376.70ms单列。因未完成整库与长期GC观察，只报告阶段采样，不签完整P2。证据`l-normal-stop-runtime-metrics.json`、`l-normal-stop-progress.json`。

## 2026-10-12 晚间续验状态（覆盖前文收尾时点）

本轮已按用户要求恢复L并持续等待最终结果；前文“本轮收尾”是上一轮历史状态，不代表再次停止。独立逐行读取35,713,899个JSONL事件完成：5611会话、5,101,005请求、2工具、663,130,600 Token。`l-journal-oracle.json`与SQLite/产品查询无依赖；最终L统计尚在同步，不能提前签收。

Desktop全量串行1765通过/2跳过；默认并行复测1747通过/18失败/2跳过、1未处理异常，失败涉及9文件。同期L同步、JSONL独立核对和CU均运行，失败文件单独串行93/93通过；保留默认命令失败，不写全仓通过，不用放宽超时掩盖结果。

真实持久化闸门证据：`small-durable-before.json`、`small-durable-held.json`、`small-durable-after.json`。被暂停批次包含assistant/chunk、assistant/message、step/end，物理尾部已存在但尚未fsync。查询descriptor等待至释放后返回throughSeq236；Usage由1680到1800，未提前或重复累计。11轮/15步请求事实在暂停前已持久化，其先显示不属于用量提前计入。

## 可见、关闭与隐藏时的查询成本

隔离Small真实Electron，CU操作由gpt-6.1-sol完成，主端探针只计数、不记录正文。Context可见空闲104.65秒：21次面板条件请求共4935B、21次Composer读取共14826B；Worker消息、SQL读取/聚合/写入、Journal事件读取均为0。关闭面板并转General后77.60秒：相关IPC、Worker、SQL、Journal均为0。

重新启动后，打开Context再隐藏窗口63.82秒：相关IPC、Worker、SQL、Journal仍均为0；Main与Worker采样时间戳持续更新，进程CPU user618.85ms/system360.46ms，不能把未运行的探针误当零计算。证据`small-idle-*`、`small-closed-*`、`small-hidden-recheck-*`。CPU为全进程，非单个Context函数。

之前的隐藏测量因临时探针触发GC后阻塞而作废：日志停止更新，不作为产品无查询证据。移除该GC触发后重新运行；L从未加载这个探针。强制GC必须先在独立Electron进程验证，不将临时探针失败算成产品Bug或据此修改业务逻辑。

## 最终范围与检查状态（2026-10-12，覆盖前文阶段状态）

用户明确取消 L 剩余整库统计及建完后的界面验收；正常退出时2878/5611会话。C6/E1/E2/E3/E6以及A/P相关的L最终结果、完整冷时间、长期GC/稳定态磁盘均不再作为本轮门槛，也不标成通过。已完成M/Small和L日常交互证据保留。三项性能优化继续按已接受限制处理。

Small完整Context查询1000次、5组p95 2.40–4.36ms；Main GC后42.48→43.99MiB，Worker29.69MiB稳定。约1.51MiB增长原因未定位，保留观察，不能签长期内存不增长。测量通过真实Main注册handler，包含Service/Worker路径，不含renderer IPC传输，不算CU。证据`acceptance-hot-small-panel-1000-memory.json`。

L停止后默认Desktop并行再次1731通过/34失败/2跳过，9文件失败，214.54秒；仍存在超时/异步断言失败。串行1765通过/2跳过及先前失败文件93/93通过是各自运行结果，不代替默认并行通过。证据`completion-desktop-no-large-load.log`。实现归档不表示全仓检查全绿。

普通E2的7天/30天/全部已最终补验，均618请求/79,930Token，与Small只读SQL按日汇总一致，全部工具2；指定子智能体真实操作，证据见computer-use.md。最后Small正常退出。
