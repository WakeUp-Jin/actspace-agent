---
title: "联网搜索与网页读取"
description: "搜索候选资料，再读取网页原文作为任务依据。"
group: "tools-execution"
order: 4
updatedAt: 2026-09-19
draft: false
---

联网工具分为关键词搜索和 URL 读取。搜索帮助定位页面，读取工具获取页面中的可读文本；它们不会自动替你操作登录后的浏览器界面。

## 配置搜索

打开“设置 → 工具 → 联网”，配置可用的搜索通道。支持的通道以设置页面为准，包括智谱、Tavily、TinyFish 和 Exa；至少连接一个通道后，搜索工具才具备相应凭据。

搜索服务与对话模型分开配置。只连接一个模型服务商，不代表搜索已经可用；搜索用量和收费也由搜索服务商独立管理。

<figure class="product-shot screenshot-placeholder" data-screenshot="web-search-settings.png">
<figcaption><span class="screenshot-label">待补实拍 · 31</span><strong>联网搜索配置</strong><code>web-search-settings.png</code><p>设置 → 工具，展示联网开关与配置状态，密钥遮罩</p></figcaption>
</figure>

## 搜索后读取原文

可以这样提问：“查找这个库的官方迁移说明，打开原文并列出与当前项目有关的改动，附上来源链接。”

Agent 先用 `web_search` 返回标题、链接和摘要，再用 `web_fetch` 读取具体页面。搜索摘要可能省略上下文，重要结论应回到原文核对。

<figure class="product-shot screenshot-placeholder" data-screenshot="web-search-result.png">
<figcaption><span class="screenshot-label">待补实拍 · 32</span><strong>搜索来源与网页结果</strong><code>web-search-result.png</code><p>一次搜索/网页读取完成后展开工具结果，能看到来源标题或链接</p></figcaption>
</figure>

## 网页读取的限制

`web_fetch` 通过 HTTP 获取可读文本，不依赖搜索 Key，但仍需要网络和工具权限。主要内容由 JavaScript 生成、需要登录、被访问限制拦住，或返回二进制文件时，可能无法读取。

遇到这类页面，可以使用已配置的 [Browser Use](../browser/)读取实际浏览器页面。工具失败时应说明失败原因，不能把空结果当作网页没有相关内容。
