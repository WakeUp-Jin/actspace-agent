# 子智能体和后台任务设计规范

更新：2026-11-04。状态：S1–S6 已实施（本地提交，未推送），待 Electron 实机验收，交接清单见[验收交接](../../exec-runs/20261103-subagent-background-redesign/acceptance-handoff.md)。分支 `feat/subagent-background-redesign`。

## 为什么做

现在的子智能体是一次性、只读、不能续聊的；后台任务的日志放在临时目录，卸载就删。这次参考 DeepSeek Harness（DSH）的子智能体设计（约九成照搬），再加上 ActSpace 自己的一点：**留痕**。

留痕的意思：子智能体和后台 Bash 执行时都要把执行记录写进文件，并在启动、运行中、结束时把文件路径交给主智能体。主智能体觉得有必要时可以去读执行细节，而不是只能相信最后那段结论。这些路径同时进入上下文管理引擎的活跃 / 睡眠路径。

## 文档

| 文档 | 内容 | 状态 |
|---|---|---|
| [01-设计决策](01-设计决策.md) | 逐项拍板的决策记录 | 已确认 |
| [02-子智能体设计规范](02-子智能体设计规范.md) | 工具、事件、续派、权限、模型、留痕与通知、fork、上限、验收 | 已实施（后端） |
| [03-后台Bash设计规范](03-后台Bash设计规范.md) | 日志目录与删除时机、`task_output since`、通知、登记表只管 Bash | 已实施（后端） |
| [04-外部子智能体设计规范](04-外部子智能体设计规范.md) | Codex / Claude Code 两个可选插件 | 已实施（后端） |
| [05-界面与设置设计规范](05-界面与设置设计规范.md) | 对话区、子 Agent 面板、设置、插件页、轨迹、统计 | 已实施（S6） |

执行计划：[20261103-subagent-background-redesign](../../exec-plans/active/20261103-subagent-background-redesign/README.md)（S1–S6）。

## 现行设计（已改写为现状）

- [子智能体运行规范](../collaboration/agent-subagent-runtime.md)
- [后台任务](../collaboration/agent-background-tasks.md)
- [会话记录 Markdown](../agent-runtime/agent-session-transcript.md)

原 `agent-explore-subagent.md`（Explore 与 Agent 只读边界）已随旧实现删除，由设计 02 取代。

## 参考

- DSH 源码：`tmp/deepseek-harness/`（不进 git），主要看 `packages/subagent/`、`packages/jobs/`、`packages/shell/tool-bash/`。
