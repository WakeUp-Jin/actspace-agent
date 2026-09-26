# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

## 当前文档债务

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-08 | 历史/学习文档链接 | 全量初扫剩余 16 处候选断链：15 处在旧 history，1 处在学习文档的示例图片。当前设计、归档、计划和执行记录链接已通过门禁。 | 按历史源码证据、错误相对路径、示例路径分别处理，不将历史源码一律指向当前实现；详见本轮执行摘要。 |
| 2026-09-09 | 当前设计重复与正文漂移 | 设置中心约 1,200 行，与模型/Usage 子规范重复；工具预览中的旧 extractor、参数展示、审批与 Subagent 位置说法仍需逐项校准。 | 按 [后续复核清单](../exec-runs/20260908-docs-v1-archive-v2-refresh/followup-audit.md)分配主规范和章节去向，保留独有内容与历史依据。P2 实现缺口继续由 active 计划跟踪，不转为文档债务。 |

## 前端设计 token 遗留

2026-09-26 设计 token 收口（`completed/20260926-frontend-design-token-convergence.md`）后仍保留的写死值和未统一控件：

| 日期 | 区域 | 债务描述 | 后续动作 |
|---|---|---|---|
| 2026-09-26 | renderer 间距 | 组件中仍有 `p-[7px]`、`gap-[9px]`、`py-[5px]` 等间距写死值，没有纳入 `check:frontend-tokens`。 | 先统计分布，决定是否收敛到 4px 网格或登记例外，再加检查规则。 |
| 2026-09-26 | 内容边界 CSS | `styles/markdown.css`、`diff.css`、`tool-result.css`、`web-tool.css` 内部仍用 px 字号。 | 这些文件服务模型输出和第三方 DOM，改为 `var(--text-act-*)` 前需逐个对照渲染结果。 |
| 2026-09-26 | 未迁移的按钮形态 | 菜单项（Composer 命令菜单、模型列表、消息操作菜单）、下拉触发器（模式 / 模型选择器、`SettingsSelect`）、分段控件（预览 / 源码切换）仍是各自的样式常量；Composer 附件删除按钮、Sidebar 会话行按钮等内联按钮未改为 `IconButton`。 | 随 `active/frontend-ui-components-foundation.md` 的 `DropdownMenu`、`Tabs` 落地一起迁移。 |
| 2026-09-26 | 设置表单内部 | `CustomConnectionModels` 行内操作、API Key 显隐切换等与 36px 输入框同排的控件，以及 `CustomModelForm`、连接状态块的「边框卡片」式分组仍是旧写法。 | 与 Input / Textarea 基础组件一起收口；分组样式需要用户决定是否改为内嵌分组。 |
| 2026-09-26 | dialog 圆角 | 8 处 dialog 仍用 `rounded-act-xl`（18px），规范为 12px。 | 单独做一次 dialog 外观统一，与 `Dialog` 基础组件一起。 |

## v1 历史债务记录

以下条目保留原日期与旧实现语境，不作为当前 v2 漏洞、缺陷或可直接执行的修复计划。重新立项前须按当前源码核实；当前安全边界见 [执行安全](../design-docs/execution-safety/README.md)，旧设计见 [v1 归档](../archive/v1/README.md)。

| 日期 | 区域 | 债务描述 | 为什么会存在 | 计划中的后续动作 |
| --- | --- | --- | --- | --- |
| 2026-05-29 | Agent-core / 安全 | 读取类工具（`read_file`/`grep`/`glob`/`list_directory`）已放开 workspace 边界（`resolveReadablePath`），主 Agent 理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。 | 上下文压缩需要模型回读 `<userData>/tmp` 的 bash 落盘文件和 `<userData>/sessions` 的完整历史，这些都在 workspace 之外，workspace 硬边界会挡住正常回读（见 `context-compression.md`「读边界放开」）。 | 补「敏感路径 blocklist + 按需读审核」：读类工具命中敏感路径（如家目录密钥、系统配置）时拒绝或升级为审核，而非恢复 workspace 硬限制。可复用 Kairos 的 blocklist-check 思路。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务终态只有内存态 `bash_task_update` 事件，session.jsonl 里持久化的 preview 停在 backgrounded/running；重启后历史块显示为「后台运行中」不再更新。 | 任务注册表不持久化（进程活不过 app 退出），终态发生在 turn 结束后，没有回写持久化事件的通道。 | 任务终态时回写/追加一条 session 事件（或加载会话时对 backgrounded 块做「进程已不存在」的降级显示）。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务卡片无输出流式滚动、无 kill 按钮（设计文档前端契约的完整形态）。 | Plan 02 MVP 先复用 bash 块 + 徽标；输出流式与 kill 需要新增 IPC 通道和预览流对接。 | 独立前端任务卡片立项（可与 E5 沙盒标签一起做）。 |
| 2026-07-03 | Bash 后台任务 / 收割 | app 崩溃（非正常退出）时 before-quit 不触发，detached 后台进程可能残留。 | 收割依赖正常退出钩子；崩溃场景无进程内兜底。 | 可选：spawn 时记 pid 文件，启动时清理上次残留进程组。 |
| 2026-07-04 | Bash 沙盒 / 网络 | 沙盒 profile 内 `(allow network*)` 全放行：沙盒内命令可连任意域名 / Unix socket，网络维度无隔离。 | 域名过滤需要本地 CONNECT/SNI 代理（profile 全拒网络只放行代理端口 + 子进程注入 HTTP_PROXY），是自研路线最大增量，E5 第一期裁掉。 | 网络代理阶段单独立项；落地后引入 `requiredPermissions: ["full_network"]`。 |
| 2026-07-04 | Bash 沙盒 / 违规归因 | 违规标注只有输出模式匹配一条腿（EPERM / Operation not permitted 等），无 `log stream` 精确归因；程序吞掉错误输出时模型可能拿不到升级证据。 | log stream 监听（按 Seatbelt `with message` tag 过滤 + 降噪）约 200+ 行，不阻塞升级闭环，第一期裁掉。 | 参照 srt `startMacOSSandboxLogMonitor` 补第二条腿。 |
| 2026-07-04 | Bash 沙盒 / 跨平台 | Linux 无 bwrap 沙盒实现：非 darwin 一律真实环境执行且权限层不放宽（回到 allowlist ask）。 | 桌面产品当前只发 macOS。 | Linux 发布前按设计文档 bwrap 路线补齐。 |
