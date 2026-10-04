# P4 Computer Use 第三轮

2026-10-04，gpt-6.1-sol；Actspace Dev actspace-agent-2067。界面均为 cua 原生操作。真实独立 TLS/WSS Host + 本地可控 SSE Provider 夹具，不是外部真实 Provider 验收。新 host-data-round3 数据根；旧轮 Session 不在该数据根，不作为产品丢失缺陷。

## 验收点

- R4a Agent 模式图片与文件菜单选择 result.txt，发送后用户附件和夹具回复。
- R4b 超限/读取失败不提交，正文附件保留，可修正重试。
- R4c Bash 审批、write_file、输出卡片/回复链接纯文本预览、保存。
- R5 离线历史、草稿编辑、发送禁用、自动重连与恢复发送。
- R6 P4_SLOW 停止后继续发送。

## 路线分组

1. 附件路线：新建远端会话、普通文件发送、超限拒绝与保留。
2. 工具输出路线：P4_TOOL → Bash 审批 → 输出卡片 → 回复链接 → 保存。
3. 离线与停止路线：另建会话避免超限 pending 干扰，建立历史与草稿、stop/serve、恢复手动发送、P4_SLOW。

## 逐点结果

| 点 | 状态 | 实际证据和边界 |
|---|---|---|
| R4a 普通文件入口/选择/发送 | 通过 | 菜单为图片与文件，系统 Go To setValue result.txt 完整路径，附件进入输入框；发送后用户消息有 Attached file result.txt / Host 上传路径，夹具回复0工具结果。没有独立用户附件卡片，内部路径直接显示登记为改善项。 |
| R4b 不提交/保留 | 部分通过 | 21MiB too-large.txt 发送后未新增用户轮次，正文 keep draft R4b 和附件保留。错误却显示提交尚未确认，未说明20MiB限制。 |
| R4b 修正重试 | 失败 | AX 移除 too-large.txt 点击后附件仍在；再次发送仍 pending，未新增消息。保留此会话待修复。读取失败场景未覆盖。 |
| R4c 审批/写入 | 通过 | P4_TOOL 出现运行Bash命令的拒绝/运行审批；点运行后出现2工具结果、Edited 1 file、result.txt。真实文件内容为 P4 remote result: approval and write_file verified. |
| R4c 文件卡片/链接预览 | 通过 | 输出文件卡片和回复查看 result.txt 链接均打开右侧纯文本 result.txt，显示上述内容。 |
| R4c 保存 | 通过，路径范围有限 | 右键卡片打开保存远端文件系统弹窗。测试者将全路径填入保存为字段，macOS保存成 workspace/:tmp:p4-cu-saved-result.txt；与 result.txt SHA256 相同。证明保存成功；指定 /tmp 路径未覆盖，此误用不判产品Bug。 |
| R5 离线/重连 | 通过 | 新会话 R5 initial history 回复成功，输入草稿后CLI stop；历史保留、R5 offline draft edited 可编辑，模型和发送 disabled；同配置重启后自动恢复，草稿不自动发送，手动发送只出现1次并得到夹具回复。 |
| R6 停止后继续 | 部分覆盖 | 发送P4_SLOW后出现运行中/停止Agent；点击停止后发送R6 after stop成功。但P4_SLOW也出现完整夹具回复，无法证明12秒窗口内有效中断；中断验收未确认，需定向复验。 |

## 缺陷复现

B1：输入 keep draft R4b，图片与文件选择授权21MiB too-large.txt，发送。界面误报“提交尚未确认，再次发送将核对同一次提交”。预期明确超限拒绝，不创建 pending 提交。

B2：上述失败状态点击移除 too-large.txt，附件仍存在；再发送仍 pending。预期允许移除/修改并以修正草稿重试。没有重复盲试。

附件消息直接将注入文本与Host内部路径展示；主线程登记为改善项，暂不阻断功能。

## 关键截图与证据

截图在本轮 cua 工具记录：

- 验收输出文件卡片纯文本预览：P4_TOOL、2工具结果、Edited 1 file、右侧文本内容；上方附件内部路径。
- 触发超限发送检查保留状态 / 确认超限失败后附件可修正性：pending错误、too-large.txt和保留正文。
- 验证离线历史与可编辑草稿：历史存在，离线提示，edited草稿，禁用发送。

AX另有审批出现、链接预览、自动重连和手动发送单次消息证据。保存后的只读hash核验两文件均为 3f1a16dcbcfde18d659a41070cdccdf0a984296ad483bc1fb8a638cd1a18593a。

## 最终环境

仅管理授权隔离主Host：stop --force后以同host.json serve重启。新的 exec sessionId 86265，PID 79877，Host 0ff3c796-6ac7-43dd-bfba-f69d651d68d1，127.0.0.1:52059 ready。SSH Host PID78823未操作。应用仍运行，停在R5/R6会话空闲状态；超限失败会话保留。未进入SSH下一轮，未修改产品代码或提交。

原生AX每次约60秒，使12秒P4_SLOW中断窗口难以观察；没有将终点回复成功代替中断通过。R4b及R6剩余点需修复后定向复验。
