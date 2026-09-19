---
title: "Bash 与后台任务"
description: "让 Agent 执行命令、观察长任务输出，并区分运行中和已完成。"
group: "tools-execution"
order: 2
updatedAt: 2026-09-19
draft: false
---

Bash 用于在工作区执行测试、构建和命令行工具。让 Agent 运行命令前，明确目标和工作目录；有审批请求时可以查看即将执行的命令。

## 发起命令任务

例如：“按 package.json 的测试脚本运行测试，告诉我失败的用例和错误，不修改测试。”Agent 应先确认脚本，再执行命令并读取结果。

命令返回成功退出码，和产品行为通过验收不是一回事。检查测试覆盖的范围，以及是否真的执行到了你关心的用例。

## 长任务在后台运行

较长的命令可以进入后台，工具返回任务标识和运行状态。后续通过输出读取工具查看增量日志，通过终止工具停止不再需要的任务。

看到“后台运行中”时，任务尚未完成。可以要求 Agent 继续读取输出，直到得到退出状态或明确的失败原因。后台任务属于当前应用进程的运行资源，不保证应用退出后继续执行。

<figure class="product-shot screenshot-placeholder" data-screenshot="bash-background.png">
<figcaption><span class="screenshot-label">待补实拍 · 18</span><strong>后台命令运行中</strong><code>bash-background.png</code><p>运行同一安全任务，截取后台执行状态，保留任务标识与输出。</p></figcaption>
</figure>

<figure class="product-shot screenshot-placeholder" data-screenshot="bash-complete.png">
<figcaption><span class="screenshot-label">待补实拍 · 19</span><strong>后台命令执行结果</strong><code>bash-complete.png</code><p>前一张任务退出后截图，保留相同任务标识、退出状态与结果。</p></figcaption>
</figure>

## 失败、停止与权限

命令不存在时，检查工作区依赖和 PATH；目录错误时，确认实际 Worktree。审批拒绝或安全检查阻止命令时，先缩小操作范围，说明需要执行的具体步骤。

停止命令不会撤销已经发生的文件改动或外部操作。需要检查改动时使用[代码审阅](../review/)。想自己操作交互式 CLI 或 REPL，请使用[右侧终端](../terminal/)，它与 Agent Bash 的任务和审批相互独立。
