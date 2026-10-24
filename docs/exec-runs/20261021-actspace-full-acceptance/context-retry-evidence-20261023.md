# Context 历史错误与原生手动重试证据

2026-10-23。实际配置 `gpt-6.1-sol` / `high` 的子智能体完成 CR1–4；主智能体审阅 AX、失败/恢复截图、时序及事实完整性证据，接受本批结果。本报告补齐 P2-D10 的历史读取错误与手动成功重试，经独立只读核对当前原行与引用范围，P2-D10聚合项已签收；不把另一个计划的全部矩阵反向添加为本行门槛，也不声称覆盖未列明的额外步骤。

## 验收点、路线与结果

| 验收点 | 实际结果 |
| --- | --- |
| CR1 健康基线 | 正确原生应用和 R14 THREE 会话，历史自然 syncing→ready，3轮/3步/0压缩/360 Token；最近请求输入57项，模型容量64K，约7.1K/11%。未装配 current 时明确标注最近请求来源。 |
| CR2 错误及失败重试 | 只暂移自有终态 Journal，同一原生 Context 显示读取失败与展开详情；源仍不可用时点击重试 A，反馈仍为错误。 |
| CR3 恢复后手动成功重试 | 确认 A 请求已空闲后恢复原文件，紧接原生点击新 AX 中的重试 B。1485ms 内错误消失、57项恢复；当时历史仍同步中101/101，不将后续统计 ready 提前记为该时点。 |
| CR4 完整性及环境恢复 | 原生 Review→Context 往返正常，初始布局、空草稿恢复。原 Journal inode/281221字节/SHA不变，held路径不存在；Provider仍8请求、pending0，2721源码/制品状态条目无漂移。 |

操作分为健康基线、一次有效可逆故障与连续 A/B 重试、原生往返及恢复三段；逐点 AX/PNG、原始时间及完整性清单见[High 原生报告](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-native-high/report.md)。所有点击、错误展开和页面导航均为原生 CU；CDP仅提供只读辅助观察，未调用、替换或包裹产品 Context API。

## 点击因果与方法边界

该 Journal sourceError 是正常返回的错误状态，源码下一自然轮询为读取结束后5000ms。只读 V8 闭包观察每次重新取得作用域镜像：A在15:41:08.853Z为active/retryRequested、08.861Z为空闲/timer240；原文件09.224Z恢复；B原生派发09.226–09.298Z，随后09.302Z为active/retryRequested、09.338Z为空闲/timer242。A/B的pending均false，期间没有第三次active阶段。

原生恢复状态 U 为15:41:10.211Z，距A派发前界仅1485ms，早于保守的 A开始+5000ms边界。结合已确认的空闲状态、实际接受的原生点击及重试标志，本次恢复不能由自然轮询抢先解释。采样时刻不是精确IPC起止；U仅证明错误消失和内容恢复，完整历史统计在后续检查中另核对。

第一窗口因观察器缓存旧V8作用域镜像而中止：15:38:38.609Z暂移、15:39:01.838Z立即恢复，未点击重试。原始证据保留，既不计产品失败，也不计有效成功因果。主侧验证修正后的timer实际变化后才放行一次新窗口，没有无变化循环故障。

原文读取来自内存text map，暂移磁盘源不构成该入口I/O故障。本批不声称验过原文磁盘I/O错误，也不代签其他revision/cursor步骤。[独立时序审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-retry-audit-high/report.md)与原生结果分别保留；[最终原范围审查](../../../tmp/codex-acceptance/20261021-actspace-full-acceptance/parallel-20261023/context-scope-high/report.md)逐项核对原行及引用链，纠正初审将另一联合计划C4当作当前门槛的过强表述，支持P2-D10聚合签收。未发生过的stale恢复UI不写成通过。

## 版本与清理

HEAD为00d6b763及未提交改动，冻结构建SHA256为56bbfa4f1162e0118cf11587c0570aea37ee49ee1ed201f7ac0fcd809b956eda。原生实例PID76528，目标session为70371c27-885c-4943-8a23-cac10a1ebdc3；原Journal inode63236599，SHA256为fd01a50822fa82d435861716dbe4ec09c5c7fa2ea3e73770f8a3f7aa73ec8fb4。

子智能体释放桌面后，主侧先正常结束已恢复的故障controller，再正常关闭应用；确认PID76528/78103及已自行结束的只读sampler87230均不存在后结束driver。没有提交或推送。Goal继续active，后续按原编号推进；本批回填时165项为101通过、0失败、64部分或未覆盖，49条Bug中48关闭。
