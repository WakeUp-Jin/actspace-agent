# P4 Computer Use 第八轮

2026-10-04，gpt-6.1-sol，仅真实 Electron UI。主 Desktop `com.actspace.desktop.dev.w2067fa05`、desktop-data；第二 Desktop `com.actspace.p4.second`、desktop-second；Host `wss://127.0.0.1:52060/rpc`，可控本地 SSE Provider。未修改产品代码、构建、提交、Journal 或钥匙串权限。

## 验收点与操作分组

- C1：两个真实 Desktop 同 Host、同会话，消息、任务进度、结果一致。
- C2：两端同时待审批，一端决定后另一端解除，执行一次；分别由两端决定一轮。
- C3：关闭一端，Host 任务继续；重开恢复历史和任务状态。
- C4：WSS 移除后，历史与会话入口保留，原任务不取消。

分组：双端配对与历史入口 → 同会话同步和双向审批 → 慢任务关端恢复 → WSS 移除。第二端恢复阻塞后限定一次常规替代窗口路线；协议辅助单列，不能代替双 Desktop 通过。

## 最终逐点结果

| 点 | 状态 | 覆盖与证据 |
|---|---|---|
| C1 | 未覆盖；前置 UI 失败 | 第二端真实配对成功，但侧栏没有 Host 历史会话入口；主端新任务出现后仍无入口。第二端正常退出重开，首次 getApp 超时，不能认定同会话同步通过。 |
| C2 | 未覆盖 | 主端发送 `P4_TOOL round8 main decision`，待审批卡片可见；第二端尚未进入同会话。未批准、拒绝，也未声称只执行一次。 |
| C3 | 未覆盖 | 第二端真实 Cmd+Q 后主端审批仍保留；第二端重开卡在环境钥匙串读取，未验证恢复。本轮没有关闭主端。 |
| C4 历史保留 | 通过 | 主端在等待审批时移除 52060 WSS，返回原会话仍看到侧栏入口、4轮完成历史与本轮审批卡片；审批和停止按钮禁用。真实 UI 证据如下。 |
| C4 任务不取消 | 通过（协议辅助） | 主线程独立授权协议客户端确认移除后原 Run 仍等待审批，并批准后查询 completed；未验证移除后的主端收到结果，也未作为双端 UI 通过。 |

## 真实 UI 发现

1. 第二端设置中显示已连接，返回新建页、选择远端运行位置后，侧栏仍只有本机工作区，没有已有 Host 会话；主端创建新审批任务后仍不出现。证据 `/tmp/p4-cu-round8/second-no-history.png`。
2. 主端撤销后重新配对同 Host，当前会话恢复最新完成结果、远端工作区/模型与可操作审批，但侧栏仍显示离线，AX container 仍为 revoked。证据 `/tmp/p4-cu-round8/main-pending.png`。这是已确认展示矛盾；根因尚未通过 CU 确认。
3. 已添加 endpoint 输入新配对码点击配对，显示“这台服务器已经添加，请使用已有连接”；按撤销提示移除后使用同码，返回“配对码无效或已过期”。另取新码后成功。主线程源码与设备登记辅助确认重复添加已消费一次性码；本轮不修复。
4. WSS 移除后，当前远端会话运行位置显示“本机 Mac”，下方仍显示“远端 · 未就绪”；工作区、历史和禁用按钮仍为远端状态。仅记录文案矛盾，不声称路由到本机。

## 第二端重开阻塞

第二端本轮首次 getApp 和配对均成功。完成配对后真实 Cmd+Q 退出；主线程重开同 data 后，首次 `getApp('com.actspace.p4.second')` 超时 16.7 秒，即停止该路径，不重复盲试。`getState` 全 surface 未列出 SecurityAgent 或钥匙串授权窗口。主线程 read-only sample 确认主线程等待 SecItemCopyMatching / SecKeychainItemCopyContent，证据 `/tmp/p4-cu-round8/second-restart-sample.txt`。此为运行时辅助诊断，不作为产品双端失败的证据。

## 关键证据

- `/tmp/p4-cu-round8/main-pending.png`：主端待审批与侧栏离线矛盾。
- `/tmp/p4-cu-round8/second-no-history.png`：已选远端运行位置，但第二端缺已有会话入口。
- `/tmp/p4-cu-round8/wss-removed-history.png`：WSS 移除后的历史、当前审批和禁用状态。
- `/tmp/p4-cu-round8/wss-removed-history.ax.txt`：移除后完整 AX。
- `/tmp/p4-cu-round8/second-restart-sample.txt`：主线程钥匙串等待辅助证据。

## 限定同身份替代路线

主线程启动同一已授权开发应用 binary、独立 desktop-third 数据的进程（session20969），不修改产品或系统权限。CU `listApps` 只返回一个开发身份，没有可区分 windows/windowId；一次 getApp 原 bundle 仍绑定主端旧历史页。真实 Window 菜单只有一个 `actspace` 条目，没有可识别 third 的窗口入口。macOS CU 文档没有明确提供按进程或 windowId 选择的路径，因此未把主端对象误记成第二端。限定尝试后停止；C1/C2/C3 同时受第二端钥匙串门禁与第三端 CU 选择能力限制，仍未覆盖。

本轮 T7 仍未签收；C1/C2/C3 不以已有进程测试或单端协议完成代替。

## C4 辅助结果与交回

主线程独立协议客户端确认同 Session `4a8039e4-8b76-47db-a48d-26c58476626b` 的原 Run `634b9699-c67a-4e5c-8015-86d543b1f036` 在 WSS 移除后仍 waitingApproval；批准后查询 completed，前四个 Run 也保持 completed。此为协议/运行时辅助证据，和主端真实 UI 的历史保留组合覆盖 C4，不是双 Desktop 审批同步证据。未再追加 UI 操作。

终态：主端保留 WSS 移除后的原历史页；本轮待审批任务由独立协议辅助完成。第二端重开钥匙串阻塞；third 无可靠 CU 选择入口。交回主线程管理隔离进程与矩阵。本轮没有产品修复，新增 UI 发现待单独开发轮处理。
