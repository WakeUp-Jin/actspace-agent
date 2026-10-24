# T3 Context 原生查询与资源补验（2026-10-24）

C0–C4及两组分页子点通过，没有新确认Bug；本记录补充F7-03/P2-P01，不签收其尚缺的商业相位或最终整合T4。实际执行者gpt-6.1-sol/high/none；主侧审查完整报告、关键JPEG与原始只读观测。

## 固定输入与方法

沿用H批同一冻结源码298条摘要24a1e8a4、构建2423条摘要56bbfa4f，最终2721文件无漂移。独立main78882/renderer78923、CDP53787、Provider78726/53788；静态file renderer，无HMR、重建、测试或并行重负载。原生交互由唯一子智能体驱动，CDP仅被动监听真实isTrusted事件、每100ms读取当前React树/DOM、每1s取ps与heap，不调用业务API、输入或GC。

独立C会话dbab985d-94a1-4d45-abfe-5762b8fe8d45原有110次真实read_file与110个文件，不拼接为H的百轮会话。源Journal1440083B、SHA256779ef9317ef205d077bc0a5497184bd15709cd592e2263d1ec141cee1940453b；AGENTS.md136558B。新profile仅合成本地凭据，不复制源SQLite或secrets；容量/autoCompact为null，未伪设64K或零压缩阈值。

原生只发一次“本轮仅回复 C_PERF_READY，不调用任何工具，不读写任何文件。”，本地HTTP恰好1次，无标题或商业请求。wire max_tokens=32768：pi-ai-stream.ts:74在缺显式request选项/模型上限时回退；不是已验证模型定义覆盖，准备中的general4096也不是wire值。

## 逐点主审

| 子点 | 结论与实际依据 |
| --- | --- |
| C0 | 冷开backend/last-request/stale及披露unavailable为合法fallback；history从重建到574/574。一次短任务后backend/current-context ready、history590/590、active100/sleeping10。发送→ready包含装配和请求，不能当纯查询 |
| C1a | 当前200/previous199/并集200，真实加载更多到current278唯一、previous277唯一、并集278=total；无cursor、paging=false/error=null。卸载后重新查询200→278同样通过 |
| C1b | 实际规则section key为["section","actspace.context-rules","host/workspace-instructions"]。两次真实读取各65535B，nextOffset65535/131070；DOM逐字等result、key/scope/revision匹配，result identity1→2；重复挂载后3→4且两页hash相同 |
| C2 | 活跃展开先grouped，然后flat DOM12/cache50/total100→32/cache50→52/cache100；两轮scope正确、IDs唯一且DOM等缓存前N，loaded/settled无错误。32是缓存内展开，52跨后端分页，不冒称100行均已显示 |
| C3 | 真实关闭Context Tab后当前树panelCandidates=0/context=null，AX旧对象移除；未保留旧DOM强引用，未直接测旧body.isConnected。重开entries200、texts空、path cache0，重新完成C1/C2；额外一次同阶段入口只到ready，无第三组分页或请求 |
| C4 | 原浅色/尺寸、空Composer、fixture-main保留，右栏关闭。最后产品动作UTC2026-10-23T17:05:38.727Z，观察结束17:05:39.464Z；之后释放桌面 |

[逐点原生报告与关键截图](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-performance-20261024/native-evidence/report.md)保留实际点击、AX及14张2880×1722 JPEG。缓存数、hash和scope由只读observer辅助，不声称截图单独证明。中文typeText最初不完整，发送前真实paste修正并核对全文，未多发请求；系统剪贴板由app.paste临时使用并恢复，未点击产品复制。

### 原文基准纠正

初稿误把AGENTS.md裸文件当规则section，预期hash不符后暂停该步判定。只读核对core-contributors.ts的{title,content}以及content-manifest.ts非字符串JSON.stringify，独立重建section138706B；这是验收基准错误，不是产品Bug。旧基准保留为superseded，正式基准见[expected-text-pages-section.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-performance-20261024/expected-text-pages-section.json)。

- offset0 SHA25644c25213afc0a937c5567991e44ba6e14fcc353395efaa1669b3c21f7c7d8c3f。
- offset65535 SHA2566bca97c52b66a13cf11f83c477bb18d31935aa937115857ba02035e5723e35bf。

currentVersion为b536cbbf81068f39af41b4678cf5b50ca46b12c33647309601780559b76ec566；entries/text revision为48df949684bf5fe1715aaef254e133dfe4ae3fd59ce5b5bb859fcc31648803a5，两者职责不同。路径scope使用目标session/currentVersion，原文scope使用entries revision，不要求两种revision相等。

## 采样耗时与资源

真实事件performance.now→首次匹配的coherent当前状态/DOM；只有loading/paging/error/history、目标版本及本次新结果全部匹配才结束。原文还要求正确hash/identity，路径要求展开数/缓存/唯一性。冷开last-request与当前重挂首次/重复分开，发送→ready亦单列。原始变化/周期UI746条、资源702条，observer RTT中位2.496ms。

表为100ms采样的完成时间上界，非IPC耗时、绘制帧、p95或SLA；ps CPU%不是独立动作CPU成本，资源仅取事件前/完成后的最近1s样本，不是峰值。精确偏移、PIDs与UTC见[timing-reviewed.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-performance-20261024/timing-reviewed.json)。无手动GC，heap回落不能代表收敛。

| Operation | Event | Sampled ms | main CPU/RSS KiB pre→post | renderer CPU/RSS KiB pre→post | heap bytes pre→post | resource offsets ms pre/post |
|---|---:|---:|---|---|---|---|
| C initial last-request history-ready | 2 | 1104.6 | 0.5/96320 → 0.9/183920 | 0.8/89824 → 2.4/118640 | 13271472 → 15097308 | -202.8/703.6 |
| C task send to current-context ready (includes assembly) | 33 | 1808.7 | 0.8/139056 → 0.5/259184 | 1.5/121520 → 1.5/211584 | 15833852 → 35335444 | -692.6/900.1 |
| C entries first | 34 | 38.7 | 1.7/127264 → 4.3/142688 | 2.2/105184 → 17.0/144928 | 19815784 → 17426412 | -664.2/299.8 |
| C text page1 first | 37 | 89.0 | 1.0/143504 → 6.5/147360 | 3.5/157280 → 2.8/153712 | 23256332 → 18836424 | -131.0/782.7 |
| C text page2 first | 38 | 69.1 | 1.1/126448 → 13.3/130416 | 2.3/141584 → 39.5/161280 | 18360900 → 17109112 | -850.5/84.8 |
| C paths first load/grouped12 | 39 | 79.5 | 0.8/124144 → 2.8/130224 | 2.2/146976 → 10.8/164656 | 25938020 → 29488940 | -536.4/484.1 |
| C paths first flat12 | 40 | 86.4 | 0.8/131840 → 19.6/131104 | 3.3/171248 → 3.2/174832 | 27160292 → 30440752 | -413.2/600.7 |
| C paths first flat32 cached | 41 | 42.0 | 0.5/131360 → 5.9/142592 | 17.7/159440 → 27.3/181296 | 18021916 → 21724084 | -568.6/391.2 |
| C paths first flat52 backend page | 42 | 70.2 | 1.1/106608 → 12.8/125840 | 3.8/129120 → 37.3/193328 | 25984112 → 35305508 | -966.0/0.0 |
| C unmount first | 43 | 86.7 | 1.2/116400 → 7.0/122096 | 3.6/183984 → 2.0/155872 | 32869536 → 35045476 | -213.4/802.7 |
| C current remount first | 44 | 64.2 | 0.2/113664 → 14.6/122800 | 0.7/107312 → 6.6/163920 | 43411184 → 17733480 | -351.4/588.6 |
| C entries repeat | 45 | 50.4 | 1.1/111440 → 4.8/120544 | 2.2/109200 → 17.4/142928 | 20776336 → 17522840 | -751.6/201.8 |
| C text page1 repeat | 48 | 79.5 | 5.1/114272 → 14.2/115744 | 2.4/121904 → 1.9/137232 | 29959160 → 19124324 | -41.9/891.8 |
| C text page2 repeat | 49 | 76.7 | 0.7/110512 → 4.6/119104 | 2.2/148416 → 20.0/159536 | 19873748 → 17938660 | -526.7/398.7 |
| C paths repeat load/grouped12 | 50 | 94.5 | 0.6/109712 → 5.5/118048 | 2.2/147328 → 27.7/161280 | 28648628 → 18006712 | -708.4/200.3 |
| C paths repeat flat12 | 51 | 70.7 | 0.7/123296 → 14.8/115248 | 3.4/158128 → 7.9/144528 | 19816324 → 22825752 | -731.8/234.0 |
| C paths repeat flat32 cached | 52 | 57.9 | 0.7/108288 → 14.5/118384 | 2.5/130096 → 5.9/169024 | 22676556 → 21374096 | -113.8/829.5 |
| C paths repeat flat52 backend page | 53 | 81.8 | 0.6/111936 → 11.5/120128 | 2.9/183984 → 28.4/199200 | 28582068 → 19567556 | -928.2/0.0 |
| C unmount second | 54 | 50.4 | 0.5/108880 → 9.8/121920 | 1.8/181504 → 3.5/174032 | 37433096 → 43497872 | -262.9/691.5 |
| C current remount repeat | 55 | 65.6 | 0.7/110624 → 6.6/117328 | 0.6/106912 → 34.2/152064 | 23926748 → 17009076 | -841.3/96.3 |
| C final panel close | 56 | 96.2 | 0.9/104656 → 1.4/111968 | 2.3/99616 → 7.3/132640 | 22410968 → 15673060 | -505.7/402.6 |

## 清理与范围

主侧停止observer并释放监听/对象后，应用UTC17:06:04.107Z正常exit0/signalnull；确认main78882/renderer78923退出后结束自有Provider/driver，78726亦不存在。原112个文件、源Journal及2721冻结条目逐字节/哈希无漂移；运行Journal2022964B，原1440083B前缀完全一致，仅追加seq575–591正常任务/请求/消息/关机事实。见[post-integrity.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-performance-20261024/post-integrity.json)。未修改产品代码/构建或用户资料。

后续G1绑定时发现同bundle默认Electron实例98233/98237：其启动时间UTC17:06:05，在本批业务应用退出后约1秒，命令无业务args、renderer为default_app.asar，对应释放后的工具绑定。它不属于上述性能观测和业务结果。主侧验证自有tmp可执行路径与来源后仅SIGTERM该默认实例，两个PID消失，G1业务15657/15697保持；[清理记录](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/memory-native-20261024/binding-cleanup.json)。此工具绑定/环境问题不记产品Bug，后续释放后不再调用getApp导致重新启动。

本增量不改变165项103通过、0失败、62部分或未覆盖（62.4%）。14-A5仍待独立原生手动GC窗口；商业恢复正文流式资源、原连续三轮完整相位及最终整合T4等缺口按原证据保留。Goal active，继续既有授权。
