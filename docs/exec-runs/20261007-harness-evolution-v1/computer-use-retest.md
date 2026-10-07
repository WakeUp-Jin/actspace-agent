# Harness 自进化 V1 Computer Use 定向复验

日期：2026-10-07。执行模型：gpt-6.1-sol。真实 Electron：`Actspace Dev 990b-cfb4` / `com.actspace.desktop.dev.wcfb43fb6`，窗口 URL `127.0.0.1:5195/`。隔离数据 `/tmp/actspace-evolution-acceptance/data`，工作区 `/tmp/actspace-evolution-acceptance/project`。

本轮重点补齐上轮启用后 Composer 选择与实际进程重启持久化。未修改源码、未读取或复制凭据、未发送模型请求。测试附加 Skill 已移除，结束时官方来源已恢复 on。

## 验收点

1. 官方 Skill 来源显示官方、初始开启、无卸载入口。
2. 来源关闭后 Composer 隐藏；开启后 Composer 可选择并显示附加标签。
3. 来源关闭后完整停止并重启同一隔离实例，关闭状态保持；结束恢复开启。
4. 若有可用模型，新增简单文本处理工具、审批、下一消息调用。

## 操作分组

- 扩展与 Composer：扩展 → Skills → 搜索 `actspace-plugin-development`，观察来源与开关；返回原 New chat → 加号 → Skills → 点击官方条目，确认选择与附加标签；移除附加标签，返回扩展关闭来源。
- 重启与恢复：主线程完整停止旧 dev 并重新启动相同 app/data/workspace/port；重新绑定 Electron → 扩展 → Skills → 搜索官方条目，观察 off，再点击恢复 on。
- 模型流程：入口即显示未连接模型、发送按钮禁用，故不执行；未尝试接入生产凭据。

## 逐项结果

| 验收点 | 结果 | 实际证据与边界 |
| --- | --- | --- |
| 1. 官方来源、默认开启、不可卸载入口 | 通过（界面层） | 本轮首次管理页 AX `80 text actspace-plugin-development 官方 · actspace-official@1`，`85 switch ... Value: on`；截图显示官方徽标、开启开关，无卸载按钮。默认状态沿用已恢复的隔离数据，真正初始默认值依据上轮记录；未绕过 UI 尝试底层卸载。 |
| 2a. 关闭后 Composer 隐藏 | 上轮通过，本轮未重复 | 上轮 `computer-use-acceptance.md` 3a 记录完整禁用菜单无官方条目。本轮按主线程要求优先补缺口，不能称本轮重新验证此项。 |
| 2b. 开启后 Composer 可选择 | 通过 | Skills 菜单 AX `179 ... actspace-plugin-development ... OFFICIAL, Value: 0`；点击后变 `Value: 1`，新增 `184 container 已选择的 Skill actspace-plugin-development` 和 `186 button 移除 Skill ...`。关键截图显示官方条目勾选及 Composer 附加标签。随后 Escape、移除标签。仅验证名称及界面选择，内部 ID 未作 GUI 验证。 |
| 3. 实际重启 off 持久化与恢复 | 通过 | 重启前点击后 AX `85 switch ... Value: off`。主线程完整停止旧 dev、重启同隔离实例；日志 `/tmp/actspace-evolution-retest-restart.log` 输出 Vite ready 5195 与相同 dev-runtime appId。重新 `cua.getApp` 返回相同 Electron 身份、URL5195；重新进入管理页，AX `85 switch ... Value: off`，截图显示灰色关闭开关。最后点击后 AX `Value: on`，确认恢复。 |
| 4. 真实模型新增工具 → 审批 → 下一消息调用 | 未覆盖 | 重启前后窗口均显示 `未连接模型`，发送按钮 disabled，提示 `暂无可用模型，请在设置中连接服务商`。未读取/复制生产凭据。工程自动化不计入本项真实 GUI 通过。 |

## 证据与限制

关键截图与逐步 AX 保存于本轮 `mcp__cua_repl` 工具输出：官方开启卡片、Composer 官方条目选中并附加、重启后官方关闭卡片。未生成独立仓库图片文件。实际进程停止/启动由主线程执行并确认；子智能体负责重启前后真实窗口交互证据。

CUA 每次观察约 61–63 秒，均成功，没有反复读取失败或焦点错窗。此次未发现明确 GUI Bug。模型工具闭环仍是剩余人工/真实服务商验收门槛。
