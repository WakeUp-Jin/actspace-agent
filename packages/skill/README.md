---
description: "Skill：技能的发现与目录，以及随应用发布的官方 Skill。"
kind: "package-group"
---

# skill

两个库包：`skill` 负责发现技能并建目录（`SkillCatalog`、`discoverSkills`），`official-skills` 随应用发布官方 Skill（目前是插件开发 Skill）。两者都不是插件，Skill 进入模型上下文由 `context/` 里的 `context-skills` 和 `prompt` 完成。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `skill` | 库 | 库 | — | 技能目录与发现：`SkillCatalog`、`discoverSkills`、`DEFAULT_SKILL_ROOTS`；发现时包含官方 Skill 的根目录 |
| `official-skills` | 库 | 库 | — | 官方 Skill 内容与路径：`officialSkillsRoot`、`pluginDevelopmentRoot`（`actspace-plugin-development`），按 Node 资源路径解析 |

## 包之间怎么连

```
official-skills ──→ skill ──→ prompt（在 context/，建 Skill 目录）
       ├──→ plugin-manager（在 harness-evolution/，插件开发 Skill）
       └──→ core/runtime、apps/desktop（取根路径）
```

- `skill` 依赖 `official-skills`，让官方 Skill 总在发现范围内。
- 依赖方：`prompt` 依赖 `skill`；`plugin-manager`、`core/runtime`、`apps/desktop` 依赖 `official-skills`。
- 想看 Skill 怎么进入上下文，见 [`context/`](../context/README.md)。

## 入口与测试

- `skill/src/catalog.ts`、`discovery.ts`；`official-skills/src/index.ts` 和包内 `skills/`。
- 测试：`pnpm --filter @actspace/skill test`、`pnpm --filter @actspace/official-skills test`。

## 怎么扩展

新增一个官方 Skill：放进 `official-skills/skills/<名>/`，需要特殊路径时在 `index.ts` 导出。新增发现位置：改 `skill/src/discovery.ts` 的默认根目录。通用步骤见[总地图](../README.md)。
