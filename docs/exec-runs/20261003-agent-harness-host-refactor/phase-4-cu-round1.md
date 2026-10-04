# P4 Computer Use 第一轮

日期：2026-10-04。执行模型 gpt-6.1-sol。应用 Actspace Dev actspace-agent-2067，bundle ID com.actspace.desktop.dev.w2067fa05。全部界面操作使用 cua 原生应用接口。未修改代码、重启应用或 Host、提交文件。

## 验收点

- U2a 设置导航、错误地址/配对码反馈、正确 WSS 配对。
- U2b 新会话选择远端 Host/workspace/model，发送后归属锁定。
- U2c 两次发送成功，统一列表有远端标签。
- U3a 远端不打开本机 Terminal/GitReview。
- U1v 浅深主题新增控件可读。

## 操作分组

1. 设置配对：错误地址、错误码、正确码，检查提示和连接卡片。
2. 会话任务：选择远端、两次发送、锁定、列表标签、Review 边界。
3. 主题差异：复用设置与会话路线。主线程要求暂停后，深色和 Terminal 留待复验。

## 逐项结果

| 验收点 | 状态 | 真实界面证据与边界 |
|---|---|---|
| U2a 设置入口/正确配对 | 通过 | 远端 Host 导航进入 Agent 服务器页；正确 WSS 和新测试码后显示 P4 Fixture 已连接。原码过期，授权 host pair 刷新后成功。 |
| U2a 错误反馈清楚 | 失败 | 错误地址和错误码展示原始英文 IPC/HostError 异常，缺少产品级中文反馈。 |
| U2b | 通过 | 选 P4 Fixture 后出现远端工作区和 test 模型；发送后会话运行位置/远端工作区在 AX 中 disabled。 |
| U2c | 通过 | hello 与 hello again 均得到 Mock ActSpace Agent response.；同一 New chat 会话，侧栏有 P4 Fixture 标签和远端工作区分组。 |
| U3a GitReview | 部分覆盖 | 点击 Review 后 AX 无变化，截图未打开 GitReview；按钮仍可用且无反馈属于界面缺陷。 |
| U3a Terminal | 未覆盖 | 未检查 Terminal 入口，不能声称整个 U3a 通过。 |
| U1v 浅色 | 部分覆盖 | 已连接设置页、远端会话控件/标签在浅色截图中可读；错误提示只有 AX 文本。 |
| U1v 深色 | 未覆盖 | 暂停前未切换主题。 |

## 缺陷复现

B1：设置 → 远端 Host → 名称 P4 Fixture → 地址 bad-address → 配对码 wrong-code → 配对并连接，显示 Error invoking remote method 'host-connections:add': TypeError: Invalid URL。改为正确测试 WSS、保留 wrong-code 再提交，显示 Error invoking remote method 'host-connections:add': HostError: Pairing code is invalid or expired。预期提供清楚的中文地址/配对码错误及下一步，避免方法名与异常类型。

B2：成功配对 → 创建远端会话 → 发送 hello → 点击输入框上方 Review。AX 无变化，截图没有面板或提示。预期远端不支持的本机审查入口隐藏或禁用，并给出适当说明。

## 截图证据

截图由 cua 原生返回，保留在本次验收工具记录中；没有使用未文档化的落盘 API。

- E1：工具“记录已连接状态并返回新会话”截图，浅色 Agent 服务器页，P4 Fixture 已连接卡片与 WSS 地址。
- E2：工具“记录远端会话关键状态证据”截图，同页两次 Mock 回复、侧栏远端标签、P4 Fixture/workspace/test 控件、Review；未出现 GitReview。

## 证明范围

Host 是真实独立进程和 TLS/WSS；模型显式 mock。成功证明 UI 到真实 Host 到 mock 模型路线，不证明真实 Provider。SSH、离线重连、后台恢复、远端审批、真实 Provider 均未验证。首次设置操作遇到 HMR 树失效，主线程暂停 renderer/Main 修改后路线稳定。

结束时停在 P4 Fixture 远端会话安全页面，应用和 Host 仍运行，等待修复后定向复验。
