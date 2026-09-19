---
title: "上下文与压缩"
description: "查看模型本轮能看到的内容，并在长任务中整理上下文。"
group: "models-context"
order: 3
updatedAt: 2026-09-19
draft: false
---

模型每次请求看到的上下文包括系统说明、工具定义、规则、Skill 提示、历史消息以及必要的摘要。聊天窗口显示的全部历史，与这次实际发送给模型的内容并不总是相同。

## 查看当前上下文

点击输入框底部的上下文状态，查看占用和分组信息。需要深入检查时，在右侧工作台打开上下文视图，查看对应请求的快照。

排查“模型为什么不知道这个信息”时，先确认文件或工具结果是否进入该次请求，再看是否经过摘要。附上一个路径并不等于完整文件已经被读取。

<figure class="product-shot screenshot-placeholder" data-screenshot="context-popup.png">
<figcaption><span class="screenshot-label">待补实拍 · 08</span><strong>上下文占用与分组</strong><code>context-popup.png</code><p>回到聊天，点击输入框底部上下文占用入口，弹层展开后截图</p></figcaption>
</figure>

<figure class="product-shot screenshot-placeholder" data-screenshot="context-detail.png">
<figcaption><span class="screenshot-label">待补实拍 · 02</span><strong>当前请求的上下文详情</strong><code>context-detail.png</code><p>在同一会话打开右侧“上下文”，选择有文件读取结果的请求；展开一个消息或工具结果条目</p></figcaption>
</figure>

## 上下文占用与累计 Token

上下文占用描述单次请求的内容规模；会话累计 Token 包括多次请求的消耗。前者用于判断离模型容量还有多远，后者用于了解工作成本，两个数字不能互相替代。

容量依据实际请求对应的模型事实。旧会话缺少容量记录时，可能显示 0，不能据此认定请求没有使用 Token。请求的输入、输出和缓存用量见[使用统计](../usage/)。

## 何时压缩

长任务积累大量消息和工具结果时，可以在输入框执行 `/compact`，把较早内容整理为摘要；运行时也会依据压缩策略处理上下文压力。压缩依赖可用的摘要模型，请先检查相关模型用途配置。

压缩减少后续请求需要携带的历史，但不会删除原始会话日志。摘要仍可能遗漏细节，关键约束最好写入项目文档；压缩后继续任务时，可以补充明确目标，并让 Agent 重新读取需要精确依据的文件。
