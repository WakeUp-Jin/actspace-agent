# Bash 完全权限 Computer Use 验收

2026-10-17，执行者 gpt-6.1-sol。真实 Electron 应用为 `Actspace Dev 0b02-c54e` / `com.actspace.desktop.dev.wc54e2e15`，身份来自 `/tmp/actspace-bash-dev.log` 的 `[dev-runtime]`。数据和工作区隔离在 `/tmp/actspace-bash-cu-20261017/`。模型使用确定性 HTTP fixture，无真实模型凭据；这是实际 Electron/main/preload/IPC/工具执行链路验证，不是 renderer mock，也不证明真实模型服务可用。

## 验收点

- A1 自动模式 Bash 审批，允许后完成、拒绝后不执行。
- A2 完全权限连续两次 Bash 无审批并返回结果。
- A3 待审批切完全权限，原卡消失、当前命令执行一次，后续自动执行。
- A4 切回自动恢复审批，切会话不串权限。
- A5 硬拒绝仍生效；UI观察拒绝，单测证明无副作用。
- A6 长命令后台输出/终止，以及停止等待审批无残留。
- A7 权限说明一致，刷新保持模式。

## 操作分组

- G1：测试会话自动审批允许/拒绝 → 待审批切完全权限 → 连续命令 → 切回自动，覆盖 A1–A4。
- G2：同会话后台命令 → 输出 → 终止 → 停止待审批，覆盖 A6。
- G3：切会话 → 刷新 → 权限说明 → 硬拒绝，覆盖 A4/A5/A7。

## 初验覆盖（最终结果见下方复验）

| 点 | 结果 | 真实交互证据及边界 |
| --- | --- | --- |
| A1 | 未覆盖（已观察审批出现） | 发送 `FIXTURE_BASH_PAIR` 后出现 `printf acceptance-1`、运行/拒绝按钮和待审批状态；尚未操作允许/拒绝。 |
| A2 | 通过 | 完全权限发送第二轮 `FIXTURE_BASH_PAIR`，真实截图显示 Ran acceptance-1 / Running acceptance-2，无审批，随后空闲且 Worked for 1s。Journal fixture-5/6 均 completed（主智能体独立核实）。 |
| A3 | 初验失败，待修复后复验 | 首轮待审批切完全权限后卡片消失且最终回复完成，但展开 Worked 显示 Denied acceptance-1 / Ran acceptance-2。Journal fixture-2 在 expiresAt 前即 denied timeout；主智能体定位旧 expireAll 路径并修复，等待重启复验。不得把卡片消失或最终回复误判为当前命令成功。 |
| A4 | 未覆盖（已确认模式切回） | 菜单自动重新选中，但尚未发送新命令验证恢复审批，也未验证会话隔离。 |
| A5 | 未覆盖 | 尚未发送硬拒绝 fixture。 |
| A6 | 未覆盖 | 尚未执行后台/停止路线。 |
| A7 | 未覆盖（说明通过） | 自动/完全权限 tooltip 均为“完全权限扩大文件范围并自动批准通过策略检查的 Bash；沙箱和禁止规则仍生效，文件删除及敏感文件仍按策略审批”；刷新保持尚未验证。 |

会话 `bc2c5be5-a60e-4192-b4af-906d1e247d99`，标题 `Fixture automatic title`。关键截图已在 Computer Use 工具输出展示（审批卡及第二轮连续执行）；尚无仓库本地截图文件，不提供失效图片链接。

原生 AX/截图每次调用约60–66秒，首次发送后的 AX 曾落后于实际状态；后续结合截图和新 AX 再决策。该工具延迟不构成产品通过/失败依据。

## 最终覆盖与复验

脱敏运行时补证：[journal-evidence.json](journal-evidence.json)，仅含工具/权限事件。主智能体已在验收完成后清理隔离进程。

| 点 | 最终结果 | 真实交互与补证 |
| --- | --- | --- |
| A1 | 通过 | 自动模式PAIR第一条点运行，UI见Ran acceptance-1，第二条独立审批后点拒绝。Journal seq85/87/97/98：fixture-8 once/completed18ms，fixture-9 user-denied/denied。 |
| A2 | 通过 | 如上第二轮连续执行，无审批；fixture-5/6 completed。 |
| A3 | 修复后通过 | 主智能体移除旧expireAll并重启。第四轮PAIR待审批切full，卡消失，截图见Ran acceptance-1，终态空闲。Journal seq119 asked→121 full-access→122 aborted permission-mode-changed→124 fixture-11 completed84ms；fixture-12 completed57ms，各一个result。 |
| A4 | 通过 | 从full切回自动后新PAIR恢复审批。最后原会话设full，新建第二会话PAIR显示自动及审批；停止后返回原8轮会话，tooltip仍full，两会话空闲。 |
| A5 | 通过（UI拒绝） | full下DENIED展开后AX见Denied printf acceptance pipe cat。无副作用由主智能体单测证明，UI不独立证明无副作用。 |
| A6 | 通过 | BACKGROUND展开后UI见Ran printf ready;sleep30（后台运行中）、Ran bash_output、Ran bash_kill。Journal seq211 block_timeout，221 running且内容ready，232 killed/runtime1s。自动第8轮待审批停止，截图变Denied acceptance-1，无卡；刷新后空闲。Journal258 aborted、259 denied aborted、261 turn/end aborted。输出正文与kill状态由Journal补证，UI未展开输出正文。 |
| A7 | 通过 | 两种模式tooltip与目标一致。Cmd+R后自动保留，历史恢复、空闲无卡；也已观察Electron重启保留自动。 |

初验fixture-2在01:54:52 asked、expiresAt02:04:52，但02:01:18切换后即denied timeout。主智能体确认旧expireAll在更新模式前清理审批，是产品缺陷，不是自然超时或Computer Use慢。修复、回归由主智能体执行，本验收者未改产品代码。重启后同一路线定向复验通过。

最终关键截图还包括修复后当前命令运行、停止后无卡片、两会话及返回原会话。均为工具输出内的真实Electron截图，未保存成本地媒体文件。最终停在原会话full模式，两会话空闲，无后台任务或待审批；可由主智能体清理本次隔离进程。
