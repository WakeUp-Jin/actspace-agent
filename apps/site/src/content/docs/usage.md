---
title: "Token、缓存与费用"
description: "查看请求和会话用量，区分已知费用、估算和服务商账单。"
group: "models-context"
order: 4
updatedAt: 2026-09-19
draft: false
---

打开“设置 → 使用统计”，选择时间范围，查看模型请求、Token 和工具活动。可以从整体变化继续定位到具体会话和请求。

## 读懂统计口径

输入 Token 是发给模型的内容，输出 Token 是模型生成的内容；缓存命中和未命中反映服务商对输入的处理。是否返回完整缓存字段，取决于服务商和该次请求的使用量数据。

模型请求次数不包含普通工具调用次数。一次 Agent 任务可能反复调用模型，因此会话数、用户消息数和模型请求数通常不同。

时间范围包括最近 24 小时、7 天、30 天和全部。检查某次操作时，注意滚动时间窗口和当前筛选条件。

<figure class="product-shot screenshot-placeholder" data-screenshot="usage.png">
<figcaption><span class="screenshot-label">待补实拍 · 25</span><strong>请求与使用统计</strong><code>usage.png</code><p>使用统计 → 最近 7 天，有真实请求和用量记录</p></figcaption>
</figure>

<figure class="product-shot screenshot-placeholder" data-screenshot="usage-token-detail.png">
<figcaption><span class="screenshot-label">待补实拍 · 26</span><strong>输入、输出与缓存明细</strong><code>usage-token-detail.png</code><p>在同一统计页展开 Token 明细，能区分输入、输出、缓存</p></figcaption>
</figure>

## 为什么费用可能不完整

费用计算需要该模型的价格记录和请求用量。缺少价格或某部分用量时，界面可能只显示已知费用，不能把未知部分当成免费。

ActSpace 的费用用于观察和比较，最终扣款以服务商账单为准。历史请求保留当时采用的价格记录，不会因为后来刷新价格就重新计算所有旧请求。

遇到异常增长时，检查是否存在多轮工具循环、大文件回读或反复失败重试，再到[上下文](../context/)中确认单次请求携带了什么。
