---
title: "权限与审批"
description: "理解工具为什么等待确认，以及允许、拒绝和停止分别会发生什么。"
group: "tools-execution"
order: 3
updatedAt: 2026-09-19
draft: false
---

工具执行前，ActSpace 会检查参数、当前模式、工作区范围和权限策略。需要你决定的调用会进入等待审批状态，批准后才继续执行。

## 处理一个审批请求

1. 查看工具名称和操作说明。
2. 检查实际路径、命令或其他参数是否符合任务范围。
3. 允许本次调用，或拒绝并告诉 Agent 需要怎样调整。

批准作用于对应的工具调用。当前机制不提供跨会话永久生效的“允许同类命令”清单；历史博客中讨论的 allowList 属于当时的设计研究。

<figure class="product-shot screenshot-placeholder" data-screenshot="tool-approval.png">
<figcaption><span class="screenshot-label">待补实拍 · 17</span><strong>命令审批卡片</strong><code>tool-approval.png</code><p>普通、安全的命令触发实际审批后，保留完整命令、目录和允许/拒绝按钮</p></figcaption>
</figure>

## 为什么允许后仍可能失败

用户批准不会绕过硬性安全检查，也不会补齐缺失的文件、依赖或服务商连接。命令还可能因参数错误、路径越界或运行环境问题失败。根据错误定位原因，再决定是否重试。

[Chat、Plan 和 Agent](../modes-and-input/)控制可用工具范围。Plan 的只读约束不能靠批准写操作来改成 Agent 模式。

## 停止执行

停止任务会取消当前运行及等待中的工作，但已经产生的效果需要另外检查。比如文件已经写入，就应在[审阅](../review/)里确认是否保留；远端操作也不会自动回滚。

直接在[交互式终端](../terminal/)键入的命令由你操作，不经过 Agent 工具审批。不要依赖聊天审批设置来限制手动终端命令。
