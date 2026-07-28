---
title: 开发与贡献
description: 了解仓库结构、文档同步、测试、history 和 Pull Request 的默认要求。
group: contributing
order: 1
updatedAt: 2026-07-27
draft: false
---

ActSpace 是为 Agent-first 开发准备的仓库，但协作规则对人和 Agent 完全相同：重要知识必须落到版本化文件中，行为变化需要同步代码、测试和文档。

## 从仓库导航开始

每轮开发先阅读根目录 `AGENTS.md`，再按任务进入对应正式文档：

- `docs/REPO_COLLAB_GUIDE.md`：提交、验证与协作约定。
- `docs/ARCHITECTURE.md`：顶层包边界和阅读路线。
- `docs/design-docs/core-beliefs.md`：Agent-first 的设计出发点。
- `docs/CODING_BEHAVIOR.md`：改代码时的操作纪律。

复杂或跨多轮的变更，应在 `docs/exec-plans/active/` 建 execution plan，并在完成后移入 `completed/`。

## 仓库结构

```text
packages/desktop      Electron main、preload 与 renderer
packages/agent-core   模型、Context、工具、执行循环与持久化
packages/shared       跨进程契约和共享类型
packages/site         Astro 官网、文档、博客与更新页
plugins/              Browser Bridge 与 fs-watch
docs/                 正式知识库、设计、计划、历史与发布记录
```

默认 TypeScript 依赖方向为 `desktop -> agent-core -> shared`。renderer 不能直接访问文件系统；密钥不进入 renderer 或 session events。

## 修改代码

优先选择小而清晰的抽象。不要大范围重写用户已有修改，也不要把与任务无关的格式化混入 diff。

如果实现让某份文档过期，在同一轮任务中更新它。用户可感知的功能补充 `docs/releases/`，完成的代码变更记录到 `docs/histories/`。

## 验证

Pull Request 前运行：

```sh
pnpm ci
```

网站可以单独验证：

```sh
pnpm check:site
pnpm test:site
pnpm build:site
```

涉及界面颜色时必须同时检查浅色、深色和跟随系统三种主题，并运行主题字面量检查。

## 提交 Pull Request

PR 应保持范围清晰，说明风险、迁移影响和后续待办。上下文复杂时直接链接 execution plan、设计规范或 history，不要假设评审者能从聊天记录还原决策。

项目使用 [Apache License 2.0](https://github.com/WakeUp-Jin/actspace-agent/blob/main/LICENSE)。提交代码即表示你有权按该许可证贡献相应内容。
