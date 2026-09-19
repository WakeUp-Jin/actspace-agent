---
title: "Browser Use"
description: "连接 Chrome 后读取页面、截图和交互，先确认浏览器桥接状态。"
group: "tools-execution"
order: 5
updatedAt: 2026-09-19
draft: false
---

Browser Use 通过本地 Browser Bridge 连接 Chrome，提供标签页、页面读取、截图和交互工具。适合需要实际页面状态的任务，比如读取动态页面或检查本地网页。

## 准备浏览器连接

源码环境需要构建桥接程序、在 Chrome 中加载扩展，并安装 Native Messaging Host。仅有模型连接或桥接可执行文件，还不能保证浏览器已就绪。

在仓库根目录构建：

```sh
./browser-bridge/build.sh
```

在 Chrome 扩展管理页启用开发者模式，加载 `browser-bridge/apps/chrome-extension/`。安装本地桥接并检查状态：

```sh
./browser-bridge/skill/scripts/abb install-native-host --json
./browser-bridge/skill/scripts/abb doctor --json
./browser-bridge/skill/scripts/abb capabilities --json
```

当前实现仍需要在实际 Chrome 配置中确认连通性。诊断未就绪时，先修复扩展或 Native Host，不要反复发起网页任务。

<figure class="product-shot screenshot-placeholder" data-screenshot="browser-ready.png">
<figcaption><span class="screenshot-label">待补实拍 · 29</span><strong>浏览器连接就绪</strong><code>browser-ready.png</code><p>Browser Bridge 设置中的连接状态与安装入口，或实际 doctor 就绪输出</p></figcaption>
</figure>

## 在会话中使用

连接正常后，明确提供页面地址和目标。例如：“打开这个本地页面，检查导航和博客卡片是否能正常点击，把发现的问题列出来。”日常任务由内置 `browser_*` 工具执行，诊断 CLI 主要用于安装与排障。

查看工具返回的页面文字、截图和交互结果，确认操作发生在正确的标签页。页面变化后应重新读取状态，避免沿用旧页面中的元素信息。

<figure class="product-shot screenshot-placeholder" data-screenshot="browser-task.png">
<figcaption><span class="screenshot-label">待补实拍 · 30</span><strong>浏览器读取任务结果</strong><code>browser-task.png</code><p>在公开示例网页完成一次真实读取；保留浏览器工具记录和返回结果</p></figcaption>
</figure>

## 与联网工具的区别

只需要文章原文时，[网页读取](../web-tools/)通常更直接。需要登录态、动态内容或真实点击时，再使用 Browser Use。浏览器连接异常与模型请求失败是不同问题，排查时分别检查。
