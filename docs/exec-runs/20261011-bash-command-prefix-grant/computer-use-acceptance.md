# Bash prefix session grant：Computer Use 验收

日期：2026-10-11。执行者：gpt-6.1-sol 子智能体。未修改代码，未调用 provider，未操作真实会话，未启动或关闭 Electron。

## 验收点

- A1：审批卡展示「拒绝」「本会话允许 pnpm」「运行」，分别验证单次运行和拒绝。
- A2：会话授权提示涵盖项目脚本，说明执行环境沿用现有设置（按主智能体确认的已批准方案，不要求额外写“不保证沙箱”）。
- A3：会话授权按钮完成 mock resolve。
- A4：浅色、深色及 480px 窄窗无横向溢出，审批操作可见。
- A5：检查现有 Electron 可用性；真实授权复用、重启恢复、新会话隔离不能以 mock 证明。

## 操作分组

1. 在 `http://localhost:5173/?mock=approval-prefix` 桌面宽度观察卡片和提示，点击会话授权；刷新后分别点击运行和拒绝，保留结果截图。
2. 通过设置页切换深色，回到同一待审批场景；切 480×800，再切浅色，复用场景检查文字、按钮与布局，保留截图。
3. 只读观察已运行 Electron，确认窗口和源码所属 checkout，不操作真实会话。

## 逐项结果

| 点 | 结果 | 实际证据与边界 |
| --- | --- | --- |
| A1 | 通过（mock UI） | 三按钮均可见；运行后显示“命令已在 mock 中‘执行’，没有真正运行。”；拒绝后显示“已拒绝执行该命令。”。[待审批浅色](mock-pending-light.png)、[单次结果](mock-once-result.png)、[拒绝结果](mock-deny-result.png) |
| A2 | 通过（UI 属性观察） | CUA DOM 读取 button title 为“允许当前会话在当前工作区内运行符合规则的 pnpm 命令，包括项目脚本；执行环境沿用现有设置”。AX Help 相同。卡片另显示“真实环境”，其提示为“命令会在沙盒外运行，可以访问整台电脑的文件和网络”。未实际鼠标悬停截取 tooltip。 |
| A3 | 通过（mock UI） | 点击「本会话允许 pnpm」后审批卡消失，显示 mock 执行结果。[会话授权结果](mock-session-allowed.png)。不能证明真实 grant 创建或复用。 |
| A4 | 通过（mock UI） | 1280px 浅色/深色及 480×800 浅色/深色截图无审批按钮遮挡或溢出。480px 时 DOM `document.documentElement.scrollWidth === innerWidth === 480`，三个审批按钮右界均不超过 428px。[深色](mock-pending-dark.png)、[深色480](mock-pending-dark-480.png)、[浅色480](mock-pending-light-480.png)。结束已 reset viewport。 |
| A5 | 部分覆盖；真实链路未覆盖 | CUA 发现已有 `Actspace Dev 83a6-24b9` (`com.actspace.desktop.dev.w24b92665`) 正常窗口；AX 显示设置/使用统计页，renderer URL 为 `file:///Users/wakeup-jin/.codex/worktrees/83a6/actspace-agent/apps/desktop/dist/index.html`，属于另一 checkout。未改变现有窗口/会话。当前修改的真实审批 IPC、授权复用、重启恢复、新会话隔离全部未覆盖。 |

## 工具限制与缺陷

Chrome extension 浏览器创建失败：`unsupported Codex auth method: apikey`。改用 CUA IAB 隐藏标签完成 UI 交互；子智能体不支持 IAB visible。未以其他自动化技术绕过 CUA。

未发现本轮审批 UI 缺陷。mock 只能支持上述局部 UI 结论，真实行为需独立验证。
