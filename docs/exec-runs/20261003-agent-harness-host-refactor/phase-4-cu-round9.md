# P4 Computer Use 第九轮

2026-10-04，gpt-6.1-sol，真实 Electron UI；未修改产品代码、build、Journal 或钥匙串。主 `com.actspace.desktop.dev.w2067fa05` / desktop-data；第二 `com.actspace.p4.second` / desktop-fourth；WSS 52060，隔离本地测试 Provider。

## 验收点与分组

- C1：两真实 Desktop 同 Host、同 Session，双向用户消息、任务进度和完成结果一致。
- C2：两端同时待审批，分别由第二端、主端各决定一轮，另一端解除等待；执行一次。
- C3：主 Desktop 正常完全退出，第二端批准并看到完成；主重开自动连接，恢复原会话历史和完成状态。
- C4：WSS 移除历史/任务边界沿用第八轮，若补充变体单列。
- C5：两个 Host 具有相同 SessionId 与工作区目录时，真实 UI 路由和更新隔离（准备中）。

路线分组：配对并保存首次列表缺陷 → 常规 Cmd+R renderer 刷新后双端同会话同步/双向审批 → 主退出、第二完成、主自动恢复 → 同 ID 双 Host 隔离。

## 逐点结果

| 点 | 状态 | 证据与边界 |
|---|---|---|
| C1 | 通过（本轮新消息/进度/结果） | 第二发送 `P4_TOOL round9 second decision`，主看到相同用户消息和审批；主发送 `P4_TOOL round9 main decision`，第二看到相同消息和审批。完成后两端都空闲，第二决定轮均 Worked 2m / 60 Token / 2 工具结果，主决定轮均 Worked 10s / 60 Token / 2 工具结果 / Edited 1 file。主实际观察 Ran pwd、Write result.txt 中间状态。旧分页边界历史展示差异另列。 |
| C2 | 通过（UI + Journal 辅助） | 两轮均先观察两端同时待审批，只在指定一端点运行，另一端审批卡片消失且完成结果一致。主线程辅助 Journal 计数：Run `587dead4-f76b-4f7b-a316-236a9655cf8f` 和 `9cec88b1-e613-40c8-bda3-5afe7c55807d` 各 bash 1、write_file 1、各 result 1、finish 1；单次执行结论不是仅凭 UI。 |
| C3 | 通过 | 主正常 Cmd+Q，随后 CU listApps 主应用消失，主线程确认进程退出；Run `ba67bebe-face-425f-9f2f-714dd4960ec3` 留在审批。第二真实点击运行，看到完成/空闲/Worked 51s/60 Token/2 结果。主同 data 重开首次 getApp 即自动连接并打开原会话，完整恢复该用户消息和相同完成结果；未重新配对或 Cmd+R。 |
| C4 | 沿用第八轮 | 本轮未重复移除；不声称新覆盖。 |
| C5 | 通过（fixture 修正后真实 UI） | WSS 52062 / 独立 HostId `234a5167-e8d4-4a2e-9360-5c6c3d517990`，同 SessionId `4a8039e4-8b76-47db-a48d-26c58476626b`、同工作区目录。两个 Host 组独立；peer 发问候完成，final 不出现该问候。peer 改名 Peer isolate 后 final 仍 New chat；final 改名 Final isolate 后 peer 保留 Peer isolate。切换两历史及运行位置标签正确，无串入。 |

## 预修复缺陷与常规恢复路线

第二首次配对显示已连接，返回应用仍只有本机工作区，没有远端组；证据 `second-first-pair-no-group.png` 和 `.ax.txt`。正常 Cmd+R 后出现 P4 Final WSS · workspace 并自动打开已有 New chat；此绕过允许继续 C1/C2/C3，不代表首次加载缺陷修复。主重新添加后也需正常 Cmd+R 才出现远端组。

旧主应用最初可读取 AX/截图，但点击与快捷键无可见反馈；一次正常 Cmd+Q 后主线程确认旧进程自行退出，在 TERM 前已不存在。重开同 desktop-data 后可正常操作。此恢复准备步骤不算 C3；C3 另起新任务完整执行正常退出和恢复路线。第二始终保持进程，不触发本轮已知钥匙串重开门禁。

两端旧历史分页边界展示不一致：主首次刷新首可见 03:44 回复片段为 Worked 1s / 40 Token，第二保留完整轮为 Worked 3m42s / 60 Token。C3 重开后主首可见变为 09:40 round8 回复片段（没有该用户消息），Worked 1s / 40 Token；第二完整 round8 为 Worked 8m36s / 60 Token。仅记录边界历史投影差异，未推定根因或所有统计受影响。

## 关键证据

目录 `/tmp/p4-cu-round9`：

- `second-first-pair-no-group.png` / `.ax.txt`：首次配对没有远端会话组。
- `second-pending.png` / `.ax.txt`、`main-pending.png` / `.ax.txt`：第二发起任务两端待审批。
- `main-second-approved.png`、`second-second-approved.png`：第二批准后双端完成。
- `main-main-pending.png`、`second-main-pending.png`：主发起任务两端待审批。
- `main-main-approved.png` / `.ax.txt`、`second-main-approved.png` / `.ax.txt`：主批准后双端结果；AX 同时保留旧边界历史数字差异。
- `main-before-exit.png`：C3 主退出前等待审批。
- `second-completed-main-closed.png` / `.ax.txt`：主完全退出期间第二批准并完成。
- `main-restarted-auto-history.png` / `.ax.txt`：主重开自动连接、历史和完成状态恢复；同时记录旧历史边界差异。

本轮 C1/C2/C3 已补齐真实双 Desktop 覆盖；首次配对列表等已知产品缺陷尚未修复，T7 签收仍需修复后定向复验。

## C5 fixture 纠正与最终通过

`peer-page-error.png`：顶部会话详情请求出现 get-page 错误。`peer-command-error.png` / `.ax.txt`：peer 普通发送失败、草稿保留，以及两个 Host 独立会话入口与位置标签。正常 final→peer 左键切换短暂未显示错误并可读复制历史；失败的更新操作不能用于证明隔离。主线程随后确认复制夹具误包含源 Host 活跃 `.writer-lock`；单 writer 保护按设计拒绝操作。仅删除 peer 副本中的复制锁，源 Host 与 Journal 未动；同 peer 进程缓存失败的 openSession Promise，因此需停止仅 peer 夹具并等锁过期后重开。此为 fixture 纠正，不是产品修复或绕过源租约。

Peer 重开后真实设置显示自动已连接，无点击重连；原草稿点击发送成功，出现 `P4 peer same id isolated greeting` 和 0 工具结果 / 20 Token 完成。分别通过右键重命名两 Host 会话，另一个标题不变；正常切换 final 历史无 peer 新消息，peer 历史保留其新消息且位置标签相符。顶部 peer 详情再次点击没有 get-page 错误。最终证据 `same-id-final-isolated.png` / `.ax.txt`、`same-id-peer-isolated.png` / `.ax.txt`。C5 最终通过，之前错误归 fixture 初始化，不记产品 Bug。

预修复 CU 未覆盖项已完成本轮所列路线；停止 UI 操作。用户随后要求当前仅验收，将修复交给 Astra；本轮没有产品修复。首次配对列表、重配标签、重复配对耗码、移除位置文案和历史分页边界差异仍保留修复与定向复验门禁。完整来源与后续进程检查发现见 [Bug 交接](phase-4-bug-handoff.md)。
