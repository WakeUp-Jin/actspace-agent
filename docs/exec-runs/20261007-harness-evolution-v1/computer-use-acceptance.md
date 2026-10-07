# V1 自进化 Computer Use 验收

日期：2026-10-07。执行模型：gpt-6.1-sol。仅操作真实 Electron 应用 `Actspace Dev 990b-cfb4`（bundle ID `com.actspace.desktop.dev.wcfb43fb6`），窗口 URL `127.0.0.1:5195/`。隔离数据目录 `/tmp/actspace-evolution-acceptance/data`，测试工作区 `/tmp/actspace-evolution-acceptance/project`。

未修改源码、未安装插件、未读取凭据、未发送模型请求。官方 Skill 已恢复启用。验收创建了一条无消息的 New chat 测试会话。

## 验收点与结果

| 点 | 结果 | 真实观察与证据 |
| --- | --- | --- |
| 1. 真实窗口与 IPC 列表加载 | 通过 | Electron 显示新建会话、project 工作区、未连接模型；扩展→Skills 加载 26 条及 1 个同名被遮蔽项，无加载失败提示。真实窗口 AX 与截图支持；不是浏览器 mock。 |
| 2. 官方来源、默认启用、不可卸载入口 | 通过（界面层） | 搜索 actspace-plugin-development，显示官方·actspace-official@1，初始主 Agent 开关 on。展开来源路径显示当前仓库 packages/official-skills/skills/actspace-plugin-development；官方卡片无卸载按钮。未绕过 UI 尝试底层卸载。 |
| 3a. 禁用保存与 Composer 同步 | 通过 | 点击开关后 AX 为 off。进入 New chat→添加 Agent、上下文或工具→Skills，完整菜单没有 actspace-plugin-development；退出并重新打开扩展→Skills→搜索条目，开关仍 off。期间发生构建触发的 renderer 重载，后续状态仍保留。 |
| 3b. 恢复启用 | 通过（开关恢复） | 在重新加载的管理页点击开关，AX 明确为 on；已恢复原始状态。 |
| 3c. 启用后 Composer 可选、ID 与展示一致、重启持久化 | 未覆盖 | 恢复 on 后已回原测试会话，但未继续打开选择菜单或查看内部 ID。未主动重启应用。主线程要求当前调用结束后收尾；CUA 状态读取每次约 61 秒，避免扩展探索。不能用源码或自动测试声称本项 GUI 通过。 |
| 4. 官方正文读取/预览入口 | 未提供 | Skills 卡片仅有名称、描述、来源路径、主 Agent 开关；源码只读检查 SkillsSection.tsx 也未提供正文按钮。没有进行正文 GUI 读取，不能标通过。 |
| 5. 真实模型工具回执、审批、下一消息使用新工具 | 未覆盖 | 窗口显示未连接模型，发送按钮禁用。隔离实例无凭据，未发请求。受控 adapter 自动测试属于主线程工程证据，不能代替本项真实模型 GUI 验收。 |

## 操作分组与复现路线

1. 管理路线：连接指定 bundle ID→扩展→Skills→搜索 `actspace-plugin-development`→展开来源路径。一次检查默认开关、官方来源、描述、无卸载入口，保留关键官方卡片截图。
2. 同步路线：禁用官方开关→新建会话→Composer 加号→Skills，确认官方条目不在完整列表→Escape→扩展→Skills→相同搜索，确认 off 保存→恢复 on→返回原 New chat。未发送任何消息。

## 证据与限制

关键截图只保留在本轮 `mcp__cua_repl` 工具输出，没有生成可引用的仓库图片文件。截图展示官方卡片、官方来源标签、仓库来源路径、绿色默认开关及无卸载入口；另一张截图展示真实会话 Composer 的未连接模型状态。逐步 AX 输出记录 off、重开管理页仍 off、恢复 on，以及禁用后的完整 Composer Skills 菜单。

初始 display name 解析失败后使用指定 bundle ID 成功连接。构建期间发生 AX ID 失效；刷新完整 AX 后恢复正常，未据此判为产品 Bug。此次没有发现需交回修复的明确 GUI Bug。
