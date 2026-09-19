---
title: "工作区与 Git Worktree"
description: "选择 Agent 实际工作的目录，并按需要隔离 Git 改动。"
group: "workspace-sessions"
order: 1
updatedAt: 2026-09-19
draft: false
---

工作区决定 Agent 从哪里读文件、搜索和执行命令。一个工作区可以包含多条会话；会话的对话记录和磁盘文件是两套不同的数据。

## 选择工作目录

从左侧工作区区域添加本地文件夹，在该工作区下创建会话。发送第一条消息前，检查输入框中的目录和分支信息。普通文件夹可以直接使用；只有 Git 仓库才提供分支和 Worktree 选择。

## 在原目录或 Worktree 中工作

在 Git 项目中，新会话可以使用原工作区，也可以选择独立 Git Worktree。Worktree 为另一个分支创建独立目录，适合同时推进不同任务。

Worktree 从 Git 中的提交状态建立。原目录里尚未提交的修改、忽略文件、依赖目录和本地环境配置不会自动复制过去；开始任务前需要准备新目录自己的依赖和配置。

<figure class="product-shot screenshot-placeholder" data-screenshot="workspace-worktree.png">
<figcaption><span class="screenshot-label">待补实拍 · 14</span><strong>工作目录、分支与 Worktree</strong><code>workspace-worktree.png</code><p>Git 项目首次发送前展开环境/分支选择，展示当前分支与 Worktree 入口</p></figcaption>
</figure>

## 会话开始后

第一条消息发送时会确定本会话的实际工作目录，之后环境信息用于查看。要换目录或切换隔离方式，新建会话并重新选择，避免已有对话与文件环境错位。

ActSpace 不会为了切换环境自动丢弃或暂存你的未提交修改。遇到 Git 提示时，先在[代码审阅](../review/)中确认当前状态。

从侧栏移除工作区不会删除磁盘目录。[分支会话](../sessions/)也不会自动复制文件或创建 Git 分支。当前工作环境以本地目录为主，不能把 Cloud 或 Remote 当作已经接入的执行环境。
