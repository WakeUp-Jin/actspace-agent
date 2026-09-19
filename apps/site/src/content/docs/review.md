---
title: "代码审阅与 Git 操作"
description: "按变更来源查看差异，确认修改范围后再暂存、恢复或提交。"
group: "workbench"
order: 2
updatedAt: 2026-09-19
draft: false
---

在右侧工作台打开审阅，可以查看当前工作区的文件差异。先选择要审阅的范围，再逐个检查文件，避免把之前已有的改动混进这次任务。

## 选择变更范围

| 范围 | 用来回答的问题 |
| --- | --- |
| Last Turn | 最近一轮 Agent 改了什么？ |
| Uncommitted | 当前目录有哪些尚未提交的变化？ |
| Unstaged | 哪些变化还没有进入暂存区？ |
| Staged | 下次提交将包含什么？ |
| Committed | 已提交的变化是什么？ |
| Branch | 当前分支相对已配置上游有哪些变化？ |

可用范围和操作取决于目录是否为 Git 仓库，以及当前是否具备相应比较依据。Last Turn 只描述 Agent 对应一轮的改动，不能代替整个工作区的 Git 状态。

<figure class="product-shot screenshot-placeholder" data-screenshot="review-diff.png">
<figcaption><span class="screenshot-label">待补实拍 · 04</span><strong>Review 文件差异</strong><code>review-diff.png</code><p>完成小修改后打开右侧 Review，选择有实际差异的范围</p></figcaption>
</figure>

## 检查并处理改动

选择文件后阅读具体差异，确认内容和任务目标一致。需要暂存、取消暂存、恢复或提交时，使用当前范围实际提供的操作，并再次确认文件清单。

恢复操作可能丢弃未保存到 Git 的修改。不同会话如果共享同一工作区，也会看到同一批文件变化；要隔离并行任务，使用[Worktree](../workspaces/)。

## 差异为空时

检查范围是否正确、当前是否有 Git 仓库，以及分支是否配置了上游。文件内容已变化但面板未更新时，刷新审阅状态。对于生成的非 Git 文件或会话产物，可以直接从[文件预览](../file-preview/)打开。
