# T3 历史与 Usage 原生查询补验（2026-10-24）

本批实际以 `gpt-6.1-sol`、`reasoning_effort="high"`、`fork_turns="none"` 执行原生 Computer Use；主智能体审查逐点报告、关键截图、当前状态与时序。H1/H2/U1/U2所列子点通过，没有新确认 Bug；F7-03、P2-P01仍未完成。G0仅确认真实手动GC按钮可达，14-A5仍缺执行及收敛结论。

## 版本、输入与方法

主仓库 `fix/settings-model-select` / HEAD `00d6b763` 加未提交状态；298个源码条目摘要 `24a1e8a4c1c7c68d3e1fc92bedc08fdc44a60c51460456758db895eca484c926`、2423个构建条目摘要 `56bbfa4f1162e0118cf11587c0570aea37ee49ee1ed201f7ac0fcd809b956eda`，最终逐文件2721条无漂移。独立profile-history/main50861/renderer50905，静态file renderer、CDP52611仅被动观测。无并发构建、测试或其他性能采样；不发送模型请求。

固定H会话 `acceptance-long-history-100x10-linked`，100合成关联轮与既有1真实轮，101请求、1000工具调用/结果；不是100轮真实LLM。Journal 1,751,557字节、SHA256 `e410683d7a8fb3447df6e5583f2cfaedfadbf925a35f4bfe64f1fef36ce5ceec`，源和运行副本最终均完全不变。新profile不复制SQLite缓存或secrets；应用启动自动选择H并读过40条，故H1是已有启动缓存下首次手动进入/重复进入，不冒称本批冷首读。此前冷读证据保留原方法与版本。

操作前列H1/H2/U1/U2/G0验收点，再按历史→Usage→DevTools入口→恢复分组。[子智能体逐点报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/performance-native-20261024/native-evidence/report.md)含38条动作与16张关键截图。真实原生点击/键盘/滚轮驱动业务，CDP只读当前React树/DOM与heap，不调用业务API、不修改输入/滚动、不触发GC。

## 子点与完成依据

| 子点 | 主审结论与范围 |
| --- | --- |
| H1 | 空白导航→H首次手动进入和重复，正确会话/近期正文、40条已加载，loading=false/error=null；已在启动后缓存 |
| H2 | 五次真实上滚后80/120/160/200/202，earlierLoading=false、error=null，最终hasEarlier=false；最早Question1与近期V01_OK往返两次均有真实可见截图。第二组为已加载导航，不称重复后端分页 |
| U1 | 首次及返回后设置保留Usage而重挂载，分别新generatedAt、loading=false/error=null，101模型请求/1101活动/10行/111页；readModel可选且本批null，不以它伪造ready门槛 |
| U2 | 搜索acceptance-model→清空→页2→刷新两组，包含200ms防抖后对应新query；过滤100请求，清空1101活动，页2行ID两次相同，刷新保留页2 |
| G0 | 原生View→Toggle Developer Tools→Memory，AX确认enabled Collect garbage；未点击GC、无堆快照或新生命周期循环，仅前置通过 |

## 耗时与资源

被动监听isTrusted事件，以页面performance.now为起点，每100ms读取current React root及DOM；表中为首次采样到匹配完成状态的时间上界，不是IPC耗时、绘制帧或性能SLA。Usage额外要求新generatedAt不早于事件墙钟估算，且查询结果、页码、loading/error均匹配；搜索包含防抖。每秒只读ps CPU%/RSS KiB和CDP heap usedSize bytes，取事件前与完成后最近资源样本，具体偏移及PID见 [timing-reviewed.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/performance-native-20261024/timing-reviewed.json)。资源是该时点样本，不是全程峰值；ps CPU不是单次动作的独立CPU成本。Observer调用往返中位约3ms，保留原始开销。

| 操作 | 事件→完成采样上界 ms | main CPU% / RSS KiB 前→后 | renderer CPU% / RSS KiB 前→后 | heap bytes 前→后 |
| --- | ---: | --- | --- | --- |
| H manual entry first | 140.0 | 0.2 / 103632 → 17.9 / 118624 | 0.7 / 115136 → 64.7 / 146336 | 11635764 → 23109068 |
| H manual entry repeat | 117.8 | 0.3 / 104464 → 34.5 / 137920 | 0.8 / 116480 → 60.4 / 169184 | 21695940 → 32517432 |
| H backend page 1 | 210.1 | 0.1 / 100976 → 18.7 / 114736 | 0.6 / 104000 → 15.8 / 166736 | 14726624 → 28793364 |
| H backend page 2 | 132.9 | 0.5 / 95232 → 5.2 / 123296 | 2.8 / 113888 → 19.1 / 175344 | 17722644 → 39575976 |
| H backend page 3 | 168.6 | 0.2 / 119616 → 27.5 / 119360 | 6.2 / 135056 → 15.5 / 191280 | 21120040 → 59582560 |
| H backend page 4 | 305.8 | 0.4 / 118448 → 34.0 / 141280 | 8.6 / 147328 → 69.1 / 224416 | 24510964 → 65028956 |
| H backend page 5 | 174.0 | 1.3 / 141216 → 29.7 / 125136 | 27.4 / 164032 → 43.2 / 219232 | 27930740 → 65999016 |
| U first entry | 478.3 | 5.0 / 97040 → 8.8 / 153424 | 2.6 / 106896 → 1.8 / 125440 | 14695420 → 15157148 |
| U repeat remount | 280.4 | 0.2 / 105040 → 7.1 / 119936 | 6.2 / 118704 → 15.4 / 159200 | 28639056 → 32827980 |
| U search first | 246.7 | 0.2 / 106608 → 5.0 / 132000 | 0.6 / 87232 → 1.7 / 160560 | 33636440 → 30749380 |
| U clear first | 293.7 | 0.2 / 93392 → 5.5 / 141088 | 1.6 / 93920 → 2.5 / 169424 | 31047208 → 19015628 |
| U page2 first | 79.8 | 0.2 / 127680 → 8.4 / 134496 | 0.9 / 154768 → 2.1 / 128624 | 19257276 → 18013044 |
| U refresh first | 74.1 | 4.9 / 115392 → 4.7 / 134768 | 4.3 / 101328 → 0.8 / 116256 | 18634568 → 18803252 |
| U reset page1 | 86.9 | 0.2 / 135952 → 8.0 / 138064 | 1.0 / 117920 → 0.9 / 125072 | 19012104 → 18862252 |
| U search repeat | 316.8 | 0.6 / 112096 → 1.9 / 136848 | 0.8 / 91328 → 5.1 / 155152 | 18721124 → 18314932 |
| U clear repeat | 306.9 | 0.5 / 126832 → 10.0 / 138672 | 1.0 / 96816 → 1.6 / 126176 | 18583040 → 19241744 |
| U page2 repeat | 108.0 | 0.2 / 140304 → 11.3 / 133984 | 1.0 / 121648 → 2.2 / 119408 | 19456648 → 18737112 |
| U refresh repeat | 95.5 | 0.3 / 134128 → 21.5 / 134576 | 0.9 / 113888 → 1.4 / 114016 | 19035460 → 19077920 |

初步草稿曾把U1重挂载时65.5ms出现的旧缓存当完成；主审以新generatedAt剔除，该数不用于结论。实际重复查询280.4ms。原始草稿仅保留方法纠错痕迹，正式数据以timing-reviewed.json为准。尚未从这些单次有限样本推断p95、普遍无卡顿或优于main。

## 清理与剩余工作

Usage查询清空、明细恢复off、DevTools真实关闭、空输入/主题/尺寸恢复后释放桌面；主侧停止被动观察，应用于UTC 16:43:32.329正常退出code0/signalnull，main/renderer均消失。[post-integrity.json](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/performance-native-20261024/post-integrity.json)记录2721冻结条目、两份Journal及退出核对。

Context current明细/原文/路径的首次/重复查询另用原110次read_file会话副本，不拼成H的同会话；手动GC已可达，可开展独立有限验证。商业T1/T2完整相位与尚未交付最终整合T4等原缺口继续保留；本补批不改变165项103通过、0失败、62部分或未覆盖（62.4%），Goal保持active。
