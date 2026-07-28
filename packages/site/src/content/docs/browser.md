---
title: Browser Use
description: 使用 ActSpace Browser Bridge 操作真实 Chrome，并理解授权、定位器与标签页隔离。
group: guides
order: 1
updatedAt: 2026-07-27
draft: false
---

Browser Use 让主 Agent 通过标准工具操作真实 Chrome，包括读取页面、导航、表单输入、截图、标签页、下载、剪贴板和调试。

## 组成

Browser 能力跨越三个运行边界：

- Agent Core 暴露模型工具并管理会话语义。
- Go Bridge 维护 canonical command registry、CDP 连接和命令执行。
- Chrome Extension 提供浏览器侧 primitive、可视光标与 Native Messaging 连接。

它们通过协议通信，不要求 Agent Core 直接依赖 Go 编译产物。

## 按需披露工具

每个 Turn 默认只提供 `browser_help`。当模型确认任务需要网页操作后，完整浏览器工具组从下一次模型请求开始进入 Context。

新 Turn 或 Kairos tick 会重新回到入口状态。这能减少无关 schema 占用，并降低普通编码任务误触浏览器的概率。

## 会话授权

Browser 使用会话级授权租约。用户首次允许后，同一 Browser session 内的连续操作不需要逐条询问；拒绝只作用于当前 Turn 的授权请求。

标签页具有 ownership 和 claim 语义，不同任务不会随意关闭彼此的页面。

## Locator

定位器优先使用接近真实用户的语义：

- role 与 accessible name
- label
- placeholder
- text
- test id
- 必要时使用 CSS

Locator Runtime 支持 Frame、开放 Shadow DOM、严格匹配、自动等待和 actionability 检查。相比只依赖坐标，这种方式对响应式布局和页面小幅变化更稳定。

## 批量操作

批量 mutation 会先完成整批参数验证和风险预检，再按顺序执行。这样能避免前几步已经改变页面、后一步才发现输入无效的半完成状态。

需要为浏览器加入项目专属流程时，可以把固定操作沉淀成 [Skill](../skills/)，而不是不断扩大系统提示词。
