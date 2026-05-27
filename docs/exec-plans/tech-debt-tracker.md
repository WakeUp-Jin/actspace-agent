# 技术债追踪

这里记录那些暂时不阻塞当前任务、但已经值得留档的技术债。

| 日期 | 区域 | 债务描述 | 为什么会存在 | 计划中的后续动作 |
| --- | --- | --- | --- | --- |
| 2026-05-27 | Settings / Typography | Settings -> General -> Typography 需要提供 UI Font Size、Code Font Size、UI Font Family、Code Font Family 等通用样式设置。 | 用户希望能像 Cursor 一样调整界面字号；原始记录曾放在 active plan，但该需求已被 `active/20260527-frontend-interaction-polish.md` Task 5 承接，单独 active plan 会造成入口重复。 | 执行 `20260527-frontend-interaction-polish.md` 时先确认缩放策略、作用范围、持久化位置和不参与缩放的固定尺寸，再落地设置页。 |
