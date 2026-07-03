# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

| 日期 | 区域 | 债务描述 | 为什么会存在 | 计划中的后续动作 |
| --- | --- | --- | --- | --- |
| 2026-05-27 | Settings / Typography | Settings -> General -> Typography 需要提供 UI Font Size、Code Font Size、UI Font Family、Code Font Family 等通用样式设置。 | 用户希望能像 Cursor 一样调整界面字号；原始记录曾放在 active plan，但该需求已被 `active/20260527-frontend-interaction-polish/05-settings-typography.md` 承接，单独 active plan 会造成入口重复。 | 执行 `active/20260527-frontend-interaction-polish/05-settings-typography.md` 时先确认缩放策略、作用范围、持久化位置和不参与缩放的固定尺寸，再落地设置页。 |
| 2026-05-29 | Agent-core / 安全 | 读取类工具（`read_file`/`grep`/`glob`/`list_directory`）已放开 workspace 边界（`resolveReadablePath`），主 Agent 理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。 | 上下文压缩需要模型回读 `<userData>/tmp` 的 bash 落盘文件和 `<userData>/sessions` 的完整历史，这些都在 workspace 之外，workspace 硬边界会挡住正常回读（见 `context-compression.md`「读边界放开」）。 | 补「敏感路径 blocklist + 按需读审核」：读类工具命中敏感路径（如家目录密钥、系统配置）时拒绝或升级为审核，而非恢复 workspace 硬限制。可复用 Kairos 的 blocklist-check 思路。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务终态只有内存态 `bash_task_update` 事件，session.jsonl 里持久化的 preview 停在 backgrounded/running；重启后历史块显示为「后台运行中」不再更新。 | 任务注册表不持久化（进程活不过 app 退出），终态发生在 turn 结束后，没有回写持久化事件的通道。 | 任务终态时回写/追加一条 session 事件（或加载会话时对 backgrounded 块做「进程已不存在」的降级显示）。 |
| 2026-07-03 | Bash 后台任务 / 前端 | 后台任务卡片无输出流式滚动、无 kill 按钮（设计文档前端契约的完整形态）。 | Plan 02 MVP 先复用 bash 块 + 徽标；输出流式与 kill 需要新增 IPC 通道和预览流对接。 | 独立前端任务卡片立项（可与 E5 沙盒标签一起做）。 |
| 2026-07-03 | Bash 后台任务 / 收割 | app 崩溃（非正常退出）时 before-quit 不触发，detached 后台进程可能残留。 | 收割依赖正常退出钩子；崩溃场景无进程内兜底。 | 可选：spawn 时记 pid 文件，启动时清理上次残留进程组。 |
