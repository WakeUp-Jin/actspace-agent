---
title: "图片理解与生成"
description: "上传图片给模型分析，或连接图片服务生成本地产物。"
group: "tools-execution"
order: 6
updatedAt: 2026-09-19
draft: false
---

ActSpace 支持图片附件、图片分析工具和图片生成工具。三者的可用条件不同：能发送文字，不代表当前模型能接收图片；能理解图片，也不代表能生成图片。

## 添加图片并提问

通过输入框附件入口、拖拽或粘贴加入图片，确认缩略图出现后，再说明要看什么。例如：“这张界面截图里，正文是否有被遮挡的地方？”

支持图片输入的主模型可以直接接收附件。不支持原生图片输入的文本模型，需要可用的图片分析工具和对应模型配置；工具是否出现还受当前模式限制。Chat 模式不会自动获得工具调用能力。

## 配置图片分析

在“设置 → 通用”的多媒体配置中选择图片分析模型，并确认它绑定的连接有效。需要分析时，Agent 调用工具，将本地图片发送给所配置的服务商。添加附件本身不等于已经触发额外的分析调用。

分析输出适合解释截图或照片，涉及小字、精确数值和复杂图表时，仍需要对照原图检查。

<figure class="product-shot screenshot-placeholder" data-screenshot="image-analysis.png">
<figcaption><span class="screenshot-label">待补实拍 · 27</span><strong>图片附件与分析结果</strong><code>image-analysis.png</code><p>用户图片附件与真实分析回复同时可见，右侧打开对应图片</p></figcaption>
</figure>

## 配置图片生成

在“设置 → 通用”的多媒体配置中配置图片生成连接，包括 API 地址、Key 和模型，再检查“设置 → 工具”中的图片生成能力是否开启。

明确提出生成需求，例如：“生成一张用于博客的抽象插画，方形构图，使用柔和配色。”生成成功后，图片作为当前会话产物保存，可在消息和右侧文件预览中打开。

当前生成工具以文字生成为主，不将局部重绘、蒙版或参考图编辑当作通用能力。图片请求可能产生独立费用，连接或模型不支持时会返回错误。

<figure class="product-shot screenshot-placeholder" data-screenshot="image-generation.png">
<figcaption><span class="screenshot-label">待补实拍 · 28</span><strong>图片生成与实际产物</strong><code>image-generation.png</code><p>一次成功生成图片的任务，展示产物入口与右侧实际图片</p></figcaption>
</figure>
