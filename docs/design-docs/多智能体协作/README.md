# 多智能体协作

这个专题收拢 ActSpace「多个 Actor 一起解决一个问题」的设计：Space 工作台、Actor 名册、一对一对话。概念层的来源是根层的 [ActSpace 产品概念思路（初稿）](../ActSpace产品概念思路初稿.md)。

## 文档

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [Space 工作台设计](front-space-工作台设计.md) | 术语、决策（D1–D31）、布局、交互、状态与动效 | 已实施（演示，2026-10-07），Electron 验收待做 |
| [space-demo.html](space-demo.html) | 可交互 demo，数据全部 mock；直接用浏览器打开 | 设计以它为准 |
| [assets/](assets/) | demo 用的头像素材：`space/` 6 色 Space 头像、`ball/` 5 色小球（原图），`demo/` 256px 裁切版，`unused/` 落选稿 | — |

执行计划：[多智能体协作前端演示](../../exec-plans/active/20261007-multi-agent-collab-frontend-demo.md)（只做前端，不碰后端）。

## 和其他专题的关系

- [collaboration/](../collaboration/)：当前的一次性子智能体与 Explore。子智能体保持现状，不参与 Space。更早的 Member / Room / Team 产品稿已在 2026-10-07 删除，由本专题取代。
- [frontend/](../frontend/)：桌面端通用的视觉、组件与工作台规范，本专题的实现遵守那里的规则。
