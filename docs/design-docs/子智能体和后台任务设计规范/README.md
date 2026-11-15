# 子智能体和后台任务设计规范

子智能体的运行模型参考 DeepSeek Harness（可写、预设与模型可选），再加 ActSpace 自己的「留痕」。2026-11-12 起子智能体是主智能体的「临时上下文窗口」：默认同步、做完就结束、不续派；转后台的登记进后台任务登记表，用 `task_list` / `task_output` / `task_stop` 管理。
## 留痕

子智能体和后台 Bash 执行时都把执行记录写进文件，并在启动、运行中、结束时把文件路径交给主智能体。主智能体觉得有必要时可以去读执行细节，而不是只能相信最后那段结论。这些路径同时进入上下文管理引擎的活跃 / 睡眠路径。

## 文档

| 文档 | 内容 | 状态 |
|---|---|---|
| [01-设计决策](01-设计决策.md) | 逐项拍板的决策记录 | 决策记录 |
| [02-子智能体设计规范](02-子智能体设计规范.md) | 工具、事件、后台登记、权限、模型、留痕与通知、fork、上限、验收 | 后端规范 |
| [03-后台Bash设计规范](03-后台Bash设计规范.md) | 日志目录与删除时机、`task_output since`、通知、登记表（Bash 与后台子智能体） | 后端规范 |
| [04-外部子智能体设计规范](04-外部子智能体设计规范.md) | Codex / Claude Code 两个可选插件 | 后端规范 |
| [05-界面与设置设计规范](05-界面与设置设计规范.md) | 对话区、子 Agent 面板、设置、插件页、轨迹、统计 | 界面规范 |


## 现行设计（已改写为现状）

- [子智能体运行规范](../collaboration/agent-subagent-runtime.md)
- [后台任务](../collaboration/agent-background-tasks.md)
- [会话记录 Markdown](../agent-runtime/agent-session-transcript.md)

## 参考

- DSH 源码是外部参考快照，放在本地 `tmp/deepseek-harness/`（不进 git，新克隆需自行取得），主要看 `packages/subagent/`、`packages/jobs/`、`packages/shell/tool-bash/`。
