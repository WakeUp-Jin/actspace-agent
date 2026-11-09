# 多智能体协作

这个专题收拢 ActSpace「多个 Actor 一起解决一个问题」的设计：Space 工作台、Actor 名册、一对一对话。概念层的来源是根层的 [ActSpace 产品概念思路（初稿）](../ActSpace产品概念思路初稿.md)。

## 文档

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [Space 工作台设计](front-space-工作台设计.md) | 术语、决策（D1–D31）、布局、交互、状态与动效 | 前端演示已实现，数据全部 mock，后端未接 |
| [space-demo.html](space-demo.html) | 可交互 demo，数据全部 mock；直接用浏览器打开 | 设计以它为准 |
| [assets/demo/](assets/demo/) | 头像素材：6 色 Space 头像、5 色小球，256px；桌面端 `apps/desktop/src/renderer/assets/space/` 由它缩放而来 | — |

执行计划：[多智能体协作前端演示](../../exec-plans/completed/20261007-multi-agent-collab-frontend-demo.md)（只做前端，不碰后端）。

## 和其他专题的关系

- [collaboration/](../collaboration/)：当前的子智能体运行时（默认后台运行、可续聊、Fork、外部 Codex / Claude Code）与 Explore 只读预设。子智能体不参与 Space。更早的 Member / Room / Team 产品稿已删除，由本专题取代。
- [frontend/](../frontend/)：桌面端通用的视觉、组件与工作台规范，本专题的实现遵守那里的规则。
