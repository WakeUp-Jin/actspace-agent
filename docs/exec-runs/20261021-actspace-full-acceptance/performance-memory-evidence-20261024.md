# 14-A5 原生手动GC有限窗口主审（2026-10-24）

本批补齐了真实 DevTools Memory 手动GC方法与12次“新建→发送→归档”交互；**没有验证预热后堆收敛，14-A5仍未覆盖**。不据有限增长登记泄漏，不追加循环凑平台；本轮无新产品Bug。

## 版本、方法与隔离

实际执行子智能体 `context_performance_native_high` 为 `gpt-6.1-sol` / `high`，主智能体只做独立采样与证据审查。主进程15657、renderer15697，独立profile `parallel-20261023/memory-native-20261024/profile`、工作区 `/tmp/actspace-memory-native-20261024`；本机Provider55082、只读CDP55081。两次预热、12次测量，主任务14次+标题14次=28次真实本地HTTP，全部在预算内，无商业请求。

HEAD `00d6b763`，dirty源码298条SHA256 `24a1e8a4c1c7c68d3e1fc92bedc08fdc44a60c51460456758db895eca484c926`；制品2423条SHA256 `56bbfa4f1162e0118cf11587c0570aea37ee49ee1ed201f7ac0fcd809b956eda`。结束后逐文件复算，两组共2721条均无漂移。配置为新合成本地凭据，未复制用户Key。

原生打开View→Toggle Developer Tools→Memory，四阶段真正点击enabled的Collect garbage；没有调用CDP GC。每阶段保持同一预热anchor、唯一未归档侧栏项、空闲/无stop/无队列、同一DevTools布局；明确闲置至少5秒→点击→闲置至少5秒。12个测量session均有对应完成正文、返回anchor、原生归档与侧栏消失证据。14个Journal均1次request/header和turn/end，13个有归档事件，只有anchor未归档。

## 同阶段资源

确定性选择规则：取实际点击后至少5秒的第一条资源采样，不选择局部最低值。CPU为`ps %cpu`，RSS为同命令KiB；renderer heap为CDP `Runtime.getHeapUsage.usedSize`字节。它们是时点值，非峰值；动作/观察间隔不是GC耗时。observer为被动可信事件、当前树/DOM只读，100ms观测、约1秒资源采样；985条UI和862条资源记录，无错误，UI调用往返中位1.605ms。observer自身可能影响保留量，本批不外推未采样实例。

| 测量周期数 | 手动GC点击UTC | 资源采样UTC | 点击后秒 | GC后used heap（B） | 较上组增量（B） | main CPU / RSS KiB | renderer CPU / RSS KiB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 17:32:39.292 | 17:32:44.726 | 5.434 | 11,729,328 | — | 0.8% / 125488 | 1.4% / 110128 |
| 4 | 17:36:05.660 | 17:36:11.444 | 5.784 | 13,810,344 | 2,081,016 | 14.9% / 119264 | 1.3% / 92992 |
| 8 | 17:37:01.799 | 17:37:06.917 | 5.118 | 15,048,228 | 1,237,884 | 0.8% / 156560 | 1.1% / 127856 |
| 12 | 17:38:01.733 | 17:38:07.282 | 5.549 | 15,530,824 | 482,596 | 9.2% / 121408 | 0.3% / 120352 |

以上日期均2026-10-23 UTC，对应本地2026-10-24。增量缩小但末组仍上升，未见平台。RSS波动不能代替JS堆收敛；本样本也不能证明持续线性增长或具体保留根因。旧12/36/70会话窗口来自不同PID/方法，分别保留，不拼接趋势。短受控回复不替代T1/T2长流式或最终整合T4，F7-03/P2-P01不因此通过。

## 恢复与异常边界

最终回预热anchor，Composer空、无stop/队列，关闭DevTools，初终截图尺寸2880×1724、主题保持。最后原生操作UTC17:38:36.023；observer正常停止于17:39:27.558，应用17:39:35.484正常退出code0，Provider随后结束。主侧核对三个owned产品/Provider PID均不存在，driver在应用退出后才清理；桌面已释放。

执行前的同bundle默认Electron页由主侧核对为旧自有tmp实例，只清理该实例后按精确.app路径绑定真实业务窗口；基线在处理后建立。测量01一次误认anchor导致“当前会话无法归档”禁用，观察纠正后正常归档，未增加请求。两者不记产品Bug，原始事实保留。

## 证据

[原生逐点报告与截图目录](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/memory-native-20261024/native-evidence/report.md)覆盖G1a–d、四次真实按钮、12个session ID及恢复。[主审JSON](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/memory-native-20261024/reviewed-summary.json)包含固定采样规则、数值、请求账目、14个Journal哈希与版本复算。原始observations.jsonl、provider-requests.jsonl及app-exit.json同根。本结论不关闭14-A5或整体验收。

## 保留关系只读核对

原始Sol/high子智能体随后完成[源码及既有证据审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/memory-retention-audit-high/report.md)：renderer归档路径主动淘汰cell、草稿和任务快照，历史cell及terminal ID各有上限；主进程的Session句柄与ledger有独立生命周期，不能直接解释renderer heap。迟到事件重新建立renderer状态及轻量淘汰计数累计均是待证关系，未记录到本批实际对象保留，不据此登记泄漏或改代码。

少量指定Journal确认任务与标题终态先于归档，但不能恢复GC对象关系；该原生实例已正常退出，profile无法补回旧实例的retaining path。14-A5仍是未收敛、未签收；没有要求追加无限生命周期循环，也没有把这项本机证据缺口称为用户外部前置条件。
