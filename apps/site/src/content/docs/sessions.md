---
title: "会话管理与分支"
description: "整理任务记录、从已有对话继续探索，并区分会话与文件状态。"
group: "workspace-sessions"
order: 2
updatedAt: 2026-09-19
draft: false
---

会话保存一次持续工作的对话与执行记录。左侧按工作区组织会话，也可以置顶需要经常回到的任务。运行、等待审批和失败等状态帮助你判断下一步需要关注哪里。

## 新建和继续任务

在目标工作区下新建会话。继续已有任务时，选中原会话并追加消息，保留此前的任务上下文。长会话记录会按需加载，较早的工具详情可能在展开后才读取。

切换会话只是切换查看对象。需要停止当前执行时，使用运行中的停止操作，不要把离开页面理解为已经取消。

## 从已有对话分支

任务不在运行或等待审批时，可以使用会话提供的分支操作，以已有对话为起点创建新会话。两个会话随后分别积累新记录。

分支会话不会回滚或克隆工作区文件。如果两个会话指向同一个目录，仍会看到该目录当前的文件状态。希望同时做互不干扰的代码改动，先了解[Git Worktree](../workspaces/)。

<figure class="product-shot screenshot-placeholder" data-screenshot="session-management.png">
<figcaption><span class="screenshot-label">待补实拍 · 15</span><strong>会话操作菜单</strong><code>session-management.png</code><p>示例会话的操作菜单展开，侧栏保留项目分组</p></figcaption>
</figure>

## 切换会话与后台执行

切换到另一条会话后，原会话中已经开始的任务继续运行。通过侧栏运行状态确认任务仍在推进；返回原会话可继续查看工具、子任务和审批状态。切换会话与点击停止是不同操作。

<figure class="product-shot screenshot-placeholder" data-screenshot="background-session.png">
<figcaption><span class="screenshot-label">待补实拍 · 16</span><strong>切换会话后的后台任务</strong><code>background-session.png</code><p>一条示例会话仍运行，切到另一会话，侧栏保留前一会话的运行标识</p></figcaption>
</figure>

## 归档与恢复

切换到其他会话后，可以归档不再活跃的任务；运行中或待处理状态会限制归档操作。需要找回时进入“设置 → 归档会话”，恢复后再继续工作。归档用于整理会话列表，不等于删除项目文件。

会话记录保存在本机，后台进程与终端则有各自的生命周期。关闭应用不能当作持久化运行任务的方法；长期执行前请阅读[Bash](../bash/)和[交互式终端](../terminal/)。
