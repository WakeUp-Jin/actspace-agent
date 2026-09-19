---
title: "交互式终端"
description: "在当前会话的工作目录中手动运行 shell 和交互式命令。"
group: "workbench"
order: 3
updatedAt: 2026-09-19
draft: false
---

右侧终端供你直接操作本机 shell。它从当前会话实际使用的工作区或 Worktree 启动，适合运行开发服务、REPL 或需要键盘交互的程序。

## 打开终端

展开右侧工作台，选择终端入口。已有面板时，通过标签栏的 `+` 菜单再创建终端。启动完成后先运行 `pwd`，确认所在目录，再执行项目命令。

终端随面板尺寸调整字符行列。程序运行中可以使用常见的 Ctrl+C 中断；交互行为仍由当前 shell 和程序决定。

<figure class="product-shot screenshot-placeholder" data-screenshot="terminal.png">
<figcaption><span class="screenshot-label">待补实拍 · 20</span><strong>工作区交互式终端</strong><code>terminal.png</code><p>右侧终端运行示例项目开发服务，保留终端页签与日志</p></figcaption>
</figure>

## 离开、关闭和重启

收起面板、切换标签或切换会话会保留正在运行的终端。明确关闭终端标签时会结束对应 shell；应用退出也会清理终端进程，不能依赖它在退出后继续跑服务。

终端输出不作为聊天历史自动发送给模型。需要 Agent 分析错误时，可以手动提供相关片段。应用重启后也不会恢复之前的活跃终端进程。

## 与 Agent Bash 区分

你在终端中输入的命令不经过 Agent 工具审批，也不属于它的后台任务列表。让 Agent 执行并追踪命令，应在聊天中提出任务，由 [Bash 工具](../bash/)处理。

出现连接失败或 shell 退出提示时，可以按界面提示重启；持续无法启动，检查应用日志、工作目录和本机 shell 配置。不同打包环境的原生终端组件仍需在实际安装环境确认。
