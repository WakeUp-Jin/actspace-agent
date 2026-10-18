# CU-01 / CU-02 定向 Computer Use 复验

执行者：gpt-6.1-sol；2026-10-18。只验收，未改生产代码。应用为 `com.actspace.desktop.dev.w2067fa05`，工作区 `/tmp/actspace-context-storage-cu-20261018/workspace`；沿用隔离数据与本地受控Provider。应用交互全部使用CUA原生API，无CDP/DOM注入。控制Provider与更新隔离large-evidence.txt通过exec完成。

## 验收点

- R1：summary-hold下自动压缩，Stop启用；点击后运行停止、压缩状态退出、输入可继续。
- R2：summary-error下自动压缩失败，普通回合结束后失败和重试仍在；summary-ok后点重试，成功或跳过清除旧失败；复用其他会话检查提示不串会话。

## 操作分组

1. 在已有真实UI会话设置tool-ok、summary-ok、summary-hold，更新隔离文件版本后发送 `FIXTURE_LONG BUGFIX-R1 自动压缩取消复验`。保存压缩中Stop及点击后的终态；直接输入R2复用可继续输入验证。
2. summary-release、summary-error，更新隔离文件版本；发送 `FIXTURE_LONG BUGFIX-R2 自动失败保留复验`，通过“继续发送”恢复取消后的暂停队列。保存失败终态，切其他会话再切回；summary-ok后尝试重试。随后按主代理要求停止操作，不重复全套验收。

## 逐项结果

| 项目 | 结果 | 实际证据与边界 |
| --- | --- | --- |
| R1 自动压缩时Stop启用 | **通过** | UI显示“正在压缩上下文”；AX为“按钮 停止 Agent”，无disabled。[等待截图](evidence/bugfix-r1-hold.png)、[AX](evidence/bugfix-r1-hold-ax.txt)。仅自动压缩；独立手动/compact取消不在修复范围。 |
| R1 点击后停止、退出压缩 | **通过** | 点击当前AX Stop后截图中压缩卡片退出，Worked for2m29s，发送箭头恢复；下一次fresh AX确认会话空闲、无压缩卡片。[停止后](evidence/bugfix-r1-stopped.png)、[终态AX](evidence/bugfix-r1-final-ax.txt)。停止后同次AX仍有较早压缩状态，截图与下一次fresh AX共同确认终态。 |
| R1 可继续输入 | **通过** | 成功输入并发送R2；因取消后队列按既有语义暂停，点击“继续发送”后产生Provider30/31。不是输入冻结。主机另外确认seq868队列pause、869 turn/end reason aborted、870 run finish outcome cancelled，无新压缩摘要提交。该seq核对是主机证据。 |
| R2 run结束后失败+重试仍在 | **通过子项，限定failed终态** | Provider30普通请求、31摘要HTTP400；终态“上下文压缩失败 · Compaction LLM failed400”+重试持续可见。[截图](evidence/bugfix-r2-failure-retained.png)、[AX](evidence/bugfix-r2-failure-retained-ax.txt)。本次累计输入39176>32768，普通run因容量失败，**并非正常completed**。正常completed保留未由本轮CUA验证。 |
| R2 不串其他会话 | **通过现场子项，受HMR限制** | 切CU Long History180 turns后截图只显示该会话历史、无原失败提示。[其他会话](evidence/bugfix-r2-other-session.png)。同次AX为加载中，因此以截图判断已加载界面；不证明跨reload持久化。 |
| R2 返回原会话仍保留、点击重试后清除 | **未覆盖：并行HMR阻断** | 切回AX曾包含失败+重试，[返回AX](evidence/bugfix-r2-return-retained-ax.txt)；点击返回element ID no longer valid。随后[当前截图](evidence/bugfix-r2-before-retry.png)和[fresh AX](evidence/bugfix-r2-return-current-ax.txt)均无失败条，未成功点击重试。主机确认期间并行测试文件写入触发page reload，见下。不能定为切会话Bug，不能宣称重试成功或旧失败因成功被清除。 |

## 干扰与未覆盖

主代理核对 `logs/latest-dev.log`，20:29:40 page reload zz-probe-fields.test.ts、20:30:13 page reload zz-probe-dump/fields、20:31:11 page reload trajectory-real-journal.test.ts，来自其他开发者并行修改。此次失败提示存于会话内存状态，修复不承诺跨reload保留。该干扰使返回保留/重试链无法获得可靠CUA证据；未作产品Bug判断。

summary-ok控制已经设置，但没有成功点击重试，没有新增成功摘要证明。未用手动/compact冒充自动失败重试按钮链；未执行新会话或其他扩大场景。

结论：**CU-01所要求自动压缩取消链通过；CU-02的failed终态保留通过，完整R2部分覆盖**。正常completed终态与重试清除仍需无HMR窗口定向补验。主代理提供的自动化测试另记主报告，不替代本轮CUA未覆盖项。

应用起初按要求保留；收到主代理最新收尾指令后发送正常Cmd+Q退出。未改生产代码、未修复、未提交。
