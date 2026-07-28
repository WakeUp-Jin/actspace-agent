---
title: Skills
description: 用版本化的 SKILL.md 为 Agent 增加可发现、可阅读和可复用的工作流程。
group: guides
order: 2
updatedAt: 2026-07-27
draft: false
---

Skill 是一组版本化的工作说明与辅助资产。它告诉 Agent 在某类任务中应该读取什么、遵守哪些步骤，以及优先复用哪些脚本或模板。

## 为什么使用 Skill

把所有规则都塞进系统提示词会增加每次请求的 Token，也会让无关任务受到干扰。Skill 通过“先发现目录，再按任务读取完整说明”的方式，把专业流程延迟到真正需要时加载。

## 发现位置

ActSpace 会从约定目录发现 Skills，包括工作区内的 `.actspace/skills`、`.agents/skills` 与 `.claude/skills`。具体优先级由 Runtime 的 skill loader 统一处理。

一个 Skill 的入口是 `SKILL.md`。它可以继续引用：

- `scripts/` 中的可执行辅助程序。
- `references/` 中的领域资料。
- `templates/` 或 `assets/` 中的复用资源。

## 渐进式读取

模型先看到 Skill 的名称和简短描述。当任务触发某个 Skill 时，再读取完整 `SKILL.md`，并只按其中的路由打开必要资源。

被选择的说明文件应完整读取，不能只截取一部分规则后开始行动。

## 一个简单结构

```text
.agents/skills/my-workflow/
├── SKILL.md
├── scripts/
│   └── verify.sh
└── templates/
    └── report.md
```

`SKILL.md` 应说明触发场景、工作步骤、输入输出和安全边界。容易漂移的事实应尽量由脚本或仓库文件提供，而不是写死在描述里。

## Skills 与工具

工具是 Runtime 能执行的原子能力；Skill 是指导 Agent 如何组合能力的流程知识。Skill 可以要求使用 Browser、Bash 或文件工具，但不会绕过这些工具原有的参数验证和审批边界。

如果你需要让 Agent 主动按周期运行某个 Skill，继续阅读 [Kairos](../kairos/)。
