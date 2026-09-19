---
title: "子 Agent 与 Explore"
description: "将范围明确的只读研究任务委派出去，再由主会话汇总结果。"
group: "extensions"
order: 2
updatedAt: 2026-09-19
draft: false
---

主 Agent 可以委派子任务去读取项目、检索代码和整理证据。子任务拥有独立的执行记录，完成后把结果交回主会话，适合把几项独立的调查拆开处理。

## 怎样提出任务

例如：“分别查找登录流程和权限判断的入口，整理相关文件与调用关系，先不要改代码。”主 Agent 决定是否调用子任务，并负责综合结果和后续操作。

需要指定模型或查看路由时，打开“设置 → 子 Agent”。主会话当前选择的模型不能代替对子任务实际请求记录的检查。

## 当前工具范围

内置 Agent 与 Explore 都用于只读研究，只开放 `read_file`、`list_directory`、`grep` 和 `glob`。它们不能写文件、执行 Bash 或再无限委派，也没有独立的写入审批流程。

需要修改代码时，由主会话依据调查结果执行。博客中的多智能体协作文章是设计探索，不能把其中的 Team、Room 或长期协作方式直接当作当前子任务操作流程。

<figure class="product-shot screenshot-placeholder" data-screenshot="subagent-running.png">
<figcaption><span class="screenshot-label">待补实拍 · 06</span><strong>只读子任务运行中</strong><code>subagent-running.png</code><p>主会话启动只读子任务，点击子任务卡片打开右侧详情，运行中截图</p></figcaption>
</figure>

## 查看进度和结果

子任务活动行显示当前读取、搜索等进展，点击可查看其执行记录。运行中的活动文字只是进度；是否完成、失败或被停止，以最终状态为准。

当前内置任务有步数和时长上限，默认最多 300 步、30 分钟。取消主任务会传递到关联子任务。失败或超时时，已有的部分结果可以帮助主 Agent 判断下一步，但不能被当作已完成结论。

<figure class="product-shot screenshot-placeholder" data-screenshot="subagent-result.png">
<figcaption><span class="screenshot-label">待补实拍 · 24</span><strong>子任务完成后的发现</strong><code>subagent-result.png</code><p>第 06 张任务完成后，右侧显示发现摘要与终态</p></figcaption>
</figure>
