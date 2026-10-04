# P4 Computer Use 第四轮

2026-10-04，gpt-6.1-sol，Actspace Dev actspace-agent-2067 / com.actspace.desktop.dev.w2067fa05。固定构建 file:// 页面，无 Vite/HMR；原生 cua 真实交互。真实WSS/SSH隧道和Host，本地可控SSE测试Provider，不证明外部真实Provider或模型理解附件。

## 验收点

- Q1 超限21MiB拒绝为清楚中文20MiB限制，无pending误报，正文/附件保留，移除后成功重试。
- Q2 result.txt新发送有独立附件卡片、不显示host-uploads注入，发送成功。
- Q3 P4_SLOW有效取消，之后继续发送成功。
- Q4 SSH设置添加真实隧道并配对，新SSH会话P4_TOOL审批及真实写入，WSS同时存在。
- Q5 SSH移除只去连接，不影响主WSS和Host进程。

## 操作分组

1. WSS已有会话附件：超限选择/发送/保留/移除/重试 → 普通result文件新发送。关键截图为超限中文提示与新附件卡片。
2. 长任务：P4_SLOW → 真实停止按钮 → Stopped → 新消息队列 → 继续发送。截图保留Stopped与暂停队列。
3. SSH：设置选择SSH、别名/端口/测试码配对 → 新SSH会话审批工具 → 回设置移除SSH → read-only核验进程。截图保留双连接、SSH工具结果、移除后WSS。

## 逐项结果

| 点 | 状态 | 真实证据 |
|---|---|---|
| Q1 | 通过 | too-large.txt发送提示“附件必须是普通文件，单个文件不能超过 20 MiB。”；正文Q1 retained draft及附件保留，无pending；移除后正文提交成功得到夹具回复。首次连点移除+发送仍旧状态，单独移除观察后成功，未出现恢复回填。 |
| Q2 | 通过 | Q2 attachment card新消息有独立result.txt卡片，Message attachments AX结构；用户正文为Q2 attachment card[result.txt]，没有host-uploads或read_file注入；夹具回复成功。旧历史保持旧结构。 |
| Q3 | 通过 | P4_SLOW启动运行中；真实点击停止后空闲，最新该轮显示Stopped，未获得完整夹具回复；再次发送进入已暂停队列，点继续发送后成功。240秒夹具窗口内完成停止。 |
| Q4 | 通过 | 设置SSH隧道，别名actspace-p4-cu，Host端口57734，授权测试码配对，双卡片都已连接；新P4 SSH Fixture会话P4_TOOL出现Bash审批，点运行后2工具结果、Edited1file/result.txt。真实文件只读核验内容为P4 remote result: approval and write_file verified. |
| Q5 | 通过 | 点击SSH卡片移除连接后仅P4 Fixture WSS卡片仍已连接；pgrep核验主Host PID90809、SSH Host PID90811均仍运行。没有停止/重启Host。 |

## 关键证据

cua工具记录截图：

- 检查明确超限拒绝：中文20MiB提示、too-large附件与保留正文。
- 验收发送后的独立附件卡片：result.txt卡片、新用户消息无内部路径。
- 验收有效停止后继续发送：最新P4_SLOW为Stopped，后续消息暂停队列；之后AX确认继续发送回复。
- 记录WSS与SSH共同存在：P4 Fixture WSS / P4 SSH Fixture SSH均已连接。
- 完成SSH审批与真实写文件：SSH侧栏标签、2工具结果、Edited1file/result.txt。
- 确认仅移除SSH连接：仅WSS已连接卡片。

SSH端口原生setValue曾使number字段为空，改为click/Cmd+A/typeText 57734后正确提交。普通文件选择时原生pipe一次关闭，重新getApp恢复GoTo状态后继续；非产品故障。

## 覆盖边界与结束状态

本轮仅Q1-Q5。U1本地代表回归、U4多端、U6维护暂停/撤销不由本轮替代；未测试真实商业Provider/用户资料。SSH远端工作区选择器前缀为夹具返回的P4 Fixture，而Host/侧栏为P4 SSH Fixture，不作为路由缺陷。

应用停在Host设置页，主WSS连接保留；SSH连接按Q5已移除，两个Host进程仍运行。未修改产品、未build、未提交；报告是本轮唯一文件变更。
