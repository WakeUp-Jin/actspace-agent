---
title: "开发与贡献"
description: "从仓库导航进入实现，按变更范围同步文档和验证。"
group: "settings-development"
order: 5
updatedAt: 2026-09-19
draft: false
---

ActSpace 的正式开发知识位于仓库 `docs/`。官网文档面向使用者，设计文档和执行记录面向维护者，修改功能时需要同步对应入口。

## 先读仓库导航

开始前阅读根目录 `AGENTS.md`，再进入 `docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md` 和 `docs/design-docs/core-beliefs.md`。当前 v2 专题是实现入口，`docs/archive/v1/` 用于历史追溯。

复杂或跨多轮的变更在 `docs/exec-plans/active/` 建计划，执行过程放在 `docs/exec-runs/`，完成后记录 `docs/histories/` 并更新计划状态。

## 主要目录

| 目录 | 职责 |
| --- | --- |
| `apps/desktop` | Electron 主进程、preload 与界面 |
| `apps/cli` | 命令行入口和输出契约 |
| `apps/site` | 官网、公开文档、博客与更新页 |
| `packages/runtime` | 运行时启动、应用组合和生命周期 |
| `packages/core`、`session`、`llm`、`tools` 等 | Agent、日志、模型、工具等独立领域包 |
| `packages/shared` | 跨进程和跨包契约 |
| `browser-bridge` | Go CLI、Chrome 扩展和浏览器协议 |

应用通过运行时与领域包协作，renderer 不直接访问文件系统，凭据由 Host 管理。变更前先确认对应专题约束，不从历史示例推断当前接口。

## 开发与验证

桌面开发使用 `pnpm dev:log`。完整检查入口是 `pnpm ci`，也应根据变更范围运行针对性的测试。涉及桌面界面时，按仓库前端验证指南区分自动化、浏览器和真实 Electron 验收。

官网可以单独运行：

```sh
pnpm dev:site
pnpm check:site
pnpm test:site
pnpm build:site
```

默认站点基础路径是 `/actspace-agent`。博客原文和配图放在官网内容与资产目录，维护规范见 `apps/site/CONTENT_SOURCES.md`；截图替换清单见 `apps/site/SCREENSHOTS.md`。

## 提交变更

保留与任务无关的已有修改，PR 写清具体行为、验证结果和仍需人工确认的范围。项目采用 [Apache License 2.0](https://github.com/WakeUp-Jin/actspace-agent/blob/main/LICENSE)，贡献者应有权提供所提交的代码和材料。
