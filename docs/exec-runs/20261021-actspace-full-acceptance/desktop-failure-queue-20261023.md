# P2-D05：故障后队列暂停与显式继续补验

2026-10-23，当前构建隔离 Electron，Computer Use 执行者 `gpt-6.1-sol`。逐项原生报告与关键截图、HTTP、Journal：[本地证据](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/desktop-failure-queue-native-20261023/report.md)。

| 验收点 | 结果与依据 |
| --- | --- |
| D5-1 失败前保留队列 | 通过：实际主请求等待 HTTP 返回时原生发送 ONE、TWO，UI 显示两项；标题 HTTP 单独计数。 |
| D5-2 终止错误后暂停 | 通过：真实 HTTP 400 后错误可见、队列两项暂停；相隔约40.6秒的两个只读 HTTP 快照均无新增请求。 |
| D5-3 显式继续仅消费一次 | 通过：原生点击继续一次，ONE、TWO 各一个 HTTP 请求；Journal 仅各一条 user/message、queue claim 和 completed Run，失败消息没有重放。 |
| D5-4 设置与场景恢复 | 通过：原生恢复原 Provider 地址及原完成会话，Composer 为空，面板关闭。 |

P2-D05 其余步骤按原范围汇总：[审批队列专项](desktop-approval-queue-20261022.md)覆盖允许/拒绝、运行中五条队列上移/引导/撤回/编辑/删除、停止继续、压缩期间排空；[后续批次](host-git-followup-20261022.md)覆盖流式与待审批正常退出重启、恢复为停止/暂停后显式继续、审批拒绝且不重放；[BUG-025](bugs/BUG-025.md)补撤回回队首的修后原生与 HTTP/Journal 顺序；[真实 DeepSeek](cu-electron-20261022.md)保留停止、reload、继续证据。结合本批终止错误后的显式恢复，P2-D05 勾选通过。原生 Cmd+R 的特殊时序仍在历史 14-A1 单列，不用本行扩大宣称。
