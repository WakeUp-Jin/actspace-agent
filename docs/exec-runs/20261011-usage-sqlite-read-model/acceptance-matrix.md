# SQLite 使用统计验收矩阵

状态：用户要求暂停验收与修复，等待其他任务完成后按[统一验收计划](../../exec-plans/completed/20261011-usage-sqlite-acceptance.md)继续。真实UI报告见[Electron验收](electron-acceptance.md)，问题见[问题清单](acceptance-bugs.md)，历史测试与版本边界见[执行摘要](execution-summary.md)。通过项只表示表内明确范围。

## 工程与数据正确性

| 验收点 | 状态 | 证据与限制 |
| --- | --- | --- |
| Worker/Service分页、FTS、事务、水位、故障恢复、取消 | 通过58项定向自动测试 | `/tmp/usage-chunk-delete-final-tests.log`；不代替真实UI |
| JSONL批读、追加、cursor、截断、seq连续性、生命周期 | 通过12项 | `/tmp/usage-acceptance-only-provider.log` |
| Usage页面/历史搜索/IPC预算/workspace与browser admission | 通过26项 | `/tmp/usage-acceptance-only-desktop.log`；非全Desktop重跑 |
| Runtime durable水位与Provider能力转发 | 通过2项 | `/tmp/usage-acceptance-only-runtime.log`；真实临时Journal，未调用全局历史；原恢复路径不通过SQLite |
| Usage resetAt混合时区边界 | 失败，U-08 | 实际Service/Worker受控输入：reset之前的offset事件仍计入；fallback仅源码确认 |
| 历史目录混合时区排序 | 失败，U-10 | 实际SQLite Worker受控目录：更早offset时间排在更晚UTC时间前；跨页影响为推断 |
| Typecheck、Electron编译、IPC/build graph | 通过 | 最新日志列于执行摘要；162 channels/44 projects |
| 实际发布目录Browser进程加载Provider/SQLite/FTS/fallback | 通过探针 | `/tmp/usage-final-chunk-package.log`；不覆盖签名/DMG完整启动 |
| 仓库文档链接 | 失败，已有问题 | 本轮307条旧媒体链接，本次任务0条 |
| 验收模式不修改实现 | 当前核对通过 | `acceptance-only-source-baseline.json` 58文件哈希，无变化；该冻结阶段已结束；仅新增4个已知失败的TODO复现，业务实现未修 |

## 性能、资源与响应

| 验收点 | 状态 | 证据与限制 |
| --- | --- | --- |
| S/M旧JSON基线 | 已完成 | 全量JSON数据基线，与Journal冷投影工作量不同 |
| S/M/L真实Journal有界批读 | 通过已测路径 | 无变化读取0事件；追加只读取新事件；M/L各自独立报告 |
| M最新稳定热查询p95≤100ms | 通过已测条件 | Node page/FTS/cursor约19/17/13ms；真实Electron已有稳定IPC组通过，首次筛选成本单列 |
| L最新稳定热查询p95≤100ms | 稳定组通过，负载组失败保留 | 最新稳定约58/61/55ms，另负载组cursor140ms，不覆盖两组差异 |
| 追加≤5k活动同步查询p95≤250ms | 失败 | M20次1k/5k p95369/971ms |
| Main event-loop p95≤16ms、p99≤50ms | 已测Node组通过 | M12.04/12.47ms，L稳定11.13/13.53ms；区间max IPC不能当histogram百分位 |
| 堆/批次内存有界，热查询无持续线性增长 | 已测路径无持续增长；UI另验 | Node各规模堆采样GC回落，XL为合成SQL路径而非10mJournal/UI |
| IPC行数/字节预算 | 自动测试与已采样通过 | ≤500明细/1MiB；历史跨workspace共享原始页预算 |
| 冷重建与首次匹配可用性 | 成本已测，存在慢查询和超时记录 | M冷约35min、L旧冷约91min；S真实UI超时修复后待复验 |
| 冷同步离页再返回的计算成本 | 失败，U-09 | 真实S CU约190万事件未提交时导航导致取消/回滚，返回后从0重读 |
| 磁盘占用 | 已记录，无预先通过线 | L Journal14.60GiB/SQLite23.26GiB；是实测代价 |

## 真实 Computer Use

| 验收点 | 当前状态 |
| --- | --- |
| E1 首次打开、同步进度、窗口响应 | S首轮响应部分通过，结果失败；最新S停于39/100、3,632,951事件，未观察最终完成 |
| E2 搜索/清空/跨页/Tab/滚动 | fallback小数据搜索清空/Tab通过，跨页未覆盖；S大数据结果及M/L真实界面待统一验收 |
| E3 取消/失败/重试/fallback | S首轮取消/失败提示通过、恢复失败；小fixturefallback重试和Usage数据通过 |
| E4 历史搜索/分页/打开Session | fallback精确搜索并打开通过；S首轮首屏部分通过、搜索/更多失败；跨页待覆盖 |
| E5 浅深主题/窄窗/横向滚动 | fallback浅深约480CSSpx布局已查看；横向滚动未签收；大数据有结果态待覆盖 |
| E6 肉眼冻结与性能采样 | 已操作状态无冻结；小数据与同步/错误态不能代替M/L有结果交互 |

## 边界

首轮S失败不自动关闭，修复后的最新dist需实际复验。发现新Bug只记录，受影响点失败或未覆盖，继续独立路线；不修实现、不新增替代假数据声称真实产品通过。真实provider网络、远端Host、签名/DMG分发不属于本次本机读模型验证范围，未进行或未宣称。

暂停补充：U-08/U-10 普通与 fallback 共4个复现测试实际失败，已标 TODO 等待修复，不能计为通过。S冷同步31样本（约5分钟）Browser/Renderer RSS峰241.92/90.30MiB，4进程RSS合计峰375.83MiB，合计可能重复计算共享页；未覆盖最终有结果交互。
