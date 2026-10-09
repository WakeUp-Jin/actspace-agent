# Review 文件监听资源测试结果

2026-10-08，用户要求先测试，不修改产品实现。结论对应当前工作区实际编译模块和真实 Electron main69765；不是浏览器 mock。此前三项修复的功能通过不能替代本轮资源测量。

## 当前结论

没有在本轮负载中测到大量内存持续增长或应用卡死；测到了高频 ignored 构建产物写入引起的重复查询和 CPU 开销。后台对照确认：切离工作区且关闭Review后，旧根连续构建仍产生平均31.46%单核CPU（主要为renderer），是可复现的无关界面工作；停止负载后恢复约1.09%。因此有定向CPU优化价值，不能因此认定大量内存泄漏。没有实施修复。

## 真实桌面测量

16GiB内存、10逻辑核，macOS26.3。真实主进程及renderer/GPU/network共四进程，top每秒采样；CPU100%为一个逻辑核，不是整机100%。内存为top MEM足迹之和，可能含共享部分，适合作同进程组比较；不是ps RSS。短命Git进程、写入脚本、Vite/tsc未计入这个常驻进程CPU，不能将其称全部开销。

夹具含10,001个tracked文件、20,000个ignored依赖文件，Review只有一个tracked差异。普通保存每秒写一个tracked文件；压力负载向ignored dist目录20文件/50ms写入，实测约374次/秒，含采样器启动/收尾。

| 场景 | 样本秒数 | 平均CPU（单核百分比） | 最高CPU | 平均/最高内存足迹MiB |
|---|---:|---:|---:|---:|
| Review打开空闲 | 30 | 1.12% | 16.1% | 1067 / 1068 |
| 普通编辑，每秒保存一次 | 20 | 12.35% | 19.5% | 1208 / 1232 |
| ignored构建目录持续写入 | 40 | 43.82% | 50.2% | 1209 / 1243 |
| 停止高频写入后 | 30 | 1.25% | 12.3% | 1026 / 1130 |
| 切到另一个工作区、Review关闭，空闲 | 20 | 0.84% | 9.3% | 1066 / 1067 |
| 上述状态，旧根ignored目录持续写入 | 60 | 31.46% | 37.8% | 1077 / 1080 |
| 停止旧根写入后 | 20 | 1.09% | 14.8% | 1011 / 1077 |

高频写入期间main从782到794MiB、renderer从225到228MiB，GPU从空闲54MiB升到175MiB等，GPU分配波动贡献了主要峰值增量。停止后GPU回54MiB，main793MiB；没有据此认定内存泄漏。原应用已有约1GiB总足迹，本轮没有测全新启动和旧实现A/B，不能将全部绝对占用归因监听。

压力期间真实界面的差异文件折叠/展开成功，无此次观察可见卡顿；操作工具耗时不等同于应用精确交互延迟。[真实交互记录](computer-use-results.md)。

## 切走后的实际影响

真实UI已切到actspace-agent/main、本机空新建页，Review关闭，随后只向临时large-repo的ignored dist写入。父60秒级样本期间子智能体没有UI操作。平均CPU31.46%，renderer从约0%升至约30%，main约1%，GPU接近0%。足迹仅约1066→1077MiB；停止后CPU1.09%，renderer足迹229→152MiB。

源码中App的reviewChanged订阅未筛选workspace，每次调用refreshReviewSummary；ReviewCoordinator对各根分别失效缓存，所以旧根通知不必每次导致当前根执行Git。本轮背景main很低、renderer明显升高，与当前摘要反复请求/状态更新相符。尚未执行renderer函数级profiler，因此不将具体React组件耗时当作已定位事实。之前“监听一直保留可能导致大量资源”的推测收窄为：保留本身未测出大量内存，但旧根高频变更会造成可测后台界面开销。

## 组件对照

直接加载未改动的compiled ReviewWorkspaceWatcher、ReviewCoordinator和ReviewGitEngine；写入临时仓库，采用现有150ms合并。测试脚本在临时目录执行，不改产品源码或构建产物。第一次连续进程对照：

| 模式，20秒ignored写入 | 写入次数 | 原始事件 | 通知/查询 | Git命令 | 该Node进程平均CPU |
|---|---:|---:|---:|---:|---:|
| 不监听 | 7580 | 0 | 0 / 0 | 0 | 12.03% |
| 只监听并合并通知 | 7640 | 7841 | 130 / 0 | 0 | 11.41% |
| 监听并查询真实Git | 7660 | 7813 | 128 / 128 | 640 | 12.71% |

这张表的CPU包括写文件脚本工作，不包括Git子进程；不能将12%左右称监听开销。只监听与不监听差异在噪声范围，没测出明显内存增长；释放后额外保留JS heap约0.15MiB。查询模式瞬时RSS峰值66.3MiB，GC后额外heap约0.71MiB。

补做新进程对照，用`/usr/bin/time -l`覆盖进程及其已等待子进程CPU：不监听34.34秒消耗0.60 user+1.83 sys=2.43 CPU秒；监听并查询34.35秒消耗3.22 user+15.25 sys=18.47 CPU秒。主要负载均20秒，后者额外约16 CPU秒，约相当该负载阶段0.8个核。此数字是组件完整流水线对照，不与真实桌面常驻进程CPU直接相加，不能称精确整机总开销。

30个监听根、总3,000子目录组件测试：保留的JS heap增量约数十KiB，没有明显RSS上升；dispose后根数30→0。没有通过UI逐个访问30个工作区，也没测内核内存或小时级泄漏。

## 证据与复现边界

- [测试点和分组](test-plan.md)、[真实交互](computer-use-results.md)。
- `component-benchmark.json`为第一次三组连续组件数据；`component-no-watch.json`和`component-watch-and-query.json`为time新进程复测；`many-workspaces.json`为独立多根测量。
- `*-idle.json`、`review-churn.json`、`review-recovery.json`、`ordinary-save.json`含每秒四进程数据；`environment.json`记录版本、硬件、夹具和源码hash。
- `component-benchmark.cjs`、`native-probe.py`仅为测量工件；复用时必须先调整当前仓库compiled路径、真实main PID与fixture manifest，禁止盲目向真实项目写入。原执行脚本、raw top输出和夹具保留在本轮临时目录。
- 未测试打包生产版、多小时持续增长、几十个真实UI工作区和完整大型项目构建；本轮结果不证明所有规模都无性能问题。

## 收尾

测试负载已全部停止，唯一tracked文件恢复夹具原改动。没有模型请求、没有创建会话，没有修改产品源码或构建文件。临时large-repo与误选dist登记没有会话，侧栏没有可操作的对应行；父使用既有compiled workspace-registry的setWorkspaceHidden仅隐藏两项，断言其它条目与默认workspace均未变，见restoration.json。此为metadata恢复，不冒称真实UI隐藏验证。真实应用留在actspace-agent空新建页、Review关闭且可用。夹具和原始测量工件保留在临时目录，不删除用户任何文件。
