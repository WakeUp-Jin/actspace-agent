# Agent Skill 设计与加载规范

本文档是 actspace 主 Agent Skill 体系的长期设计事实来源。它回答 Skill 应该长什么样、从哪里发现、如何进入上下文、如何读取正文，以及哪些能力暂不进入第一版。

执行层面的拆分见 `docs/exec-plans/completed/20260603-agent-skill-loading.md`。

## 目标

Skill 是 Agent 的能力扩展机制，用来保存模型默认不知道、容易忘、或项目特有的工作方法。Skill 不只是提示词片段，而是一个目录：`SKILL.md` 负责触发和使用说明，`references/`、`scripts/`、`assets/` 等子目录承载按需探索的资源。

actspace 的 Skill 加载遵循两层渐进式披露：

1. 第一层：每轮 Agent runtime context 构建时，扫描可用 Skill，只注入 `name`、`description`、`scope`、`source`、`location`。
2. 第二层：Agent 判断任务需要某个 Skill 时，使用已有 `read_file` 工具读取 catalog 中 `location` 指向的 `SKILL.md` 绝对路径。

任务需要更深材料时，Agent 再按 `SKILL.md` 指引，用已有 `read_file`、`list_directory`、`grep` 等读类工具探索 `references/`、查看 `assets/`，或在用户授权后使用相关脚本。

这样做的核心取舍是：让 Agent 知道有哪些能力存在，但不把所有 Skill 正文提前塞进系统提示词，避免上下文膨胀和缓存前缀频繁漂移；同时复用已有读文件工具，不为 Skill 正文读取新增专用工具。

## 目录结构

有效 Skill 必须是包含 `SKILL.md` 的目录：

```text
<skill-root>/<skill-name>/SKILL.md
<skill-root>/<skill-name>/references/
<skill-root>/<skill-name>/scripts/
<skill-root>/<skill-name>/assets/
```

`references/`、`scripts/`、`assets/` 都是可选目录。第一版只扫描 Skill 根目录的一级子目录，不递归搜索任意深度，避免误扫依赖目录、构建产物或大型仓库。

`SKILL.md` 由 YAML frontmatter 和 Markdown 正文组成：

```markdown
---
name: frontend-design
description: Use when building or improving web UI, layout, visual style, responsive behavior, or frontend interaction details.
license: MIT
allowed-tools:
  - read_file
  - grep
---

# Frontend Design

Use this skill when...
```

## Frontmatter 规范

必需字段：

- `name`：Skill 名称，最多 64 字符，推荐小写字母、数字和连字符。
- `description`：触发条件说明，最多 1024 字符。它应该写“什么时候使用”，而不是只写“这是什么”。

可选字段：

- `license`：许可证或来源说明。
- `compatibility`：运行环境要求，例如目标产品、系统命令、网络访问要求。
- `metadata`：附加结构化元数据。
- `allowed-tools`：该 Skill 期望使用的工具清单。第一版只展示和记录，不自动提升权限。

解析策略应宽松：frontmatter 小错误不应阻断普通对话。缺少必需字段、格式不合法或读取失败时，该 Skill 进入 warning 状态，并在 catalog 中暴露 warning 摘要。

## Description 编写原则

`description` 是 Skill 触发准确性的核心。它不应是泛泛介绍，而应包含明确使用场景和限制。

推荐：

```text
Use when the user asks to create, style, review, or verify frontend UI, including React components, dashboards, landing pages, responsive layouts, visual polish, and browser screenshot QA.
```

不推荐：

```text
A skill about frontend design.
```

好的 description 可以适度 pushy：宁可在明显相关任务中稳定触发，也不要让 Agent 错过关键项目知识。但 description 也不应覆盖过宽，避免无关 Skill 被频繁加载。

## 发现路径

actspace 同时兼容项目级、用户级、actspace 私有生态、跨客户端 `.agents` 生态和 Claude 兼容目录。

扫描根按优先级排列如下：

| 优先级 | scope | source | 路径 |
| --- | --- | --- | --- |
| 1 | project | actspace | `<workspaceRoot>/.actspace/skills/` |
| 2 | project | agents | `<workspaceRoot>/.agents/skills/` |
| 3 | project | claude | `<workspaceRoot>/.claude/skills/` |
| 4 | user | actspace-userData | `<userData>/skills/` |
| 5 | user | actspace-userData | `<userData>/.actspace/skills/` |
| 6 | user | agents | `<home>/.agents/skills/` |
| 7 | user | claude | `<home>/.claude/skills/` |

标准路径使用 `skills` 复数形式。若本地历史中出现误拼目录，例如 `.agents/skilll/`，第一版不把它固化为正式扫描源；可以在迁移或诊断中提示用户改为 `.agents/skills/`。

## 去重与优先级

同名 Skill 只保留一个可用版本：

- 项目级优先于用户级。
- 同一 scope 内，按上表 source 顺序优先。
- 同一 source 内，按目录名稳定排序，保证 catalog 输出确定。

被覆盖的 Skill 不进入可加载 catalog，但可以在诊断结果里记录为 `shadowed`，便于排查为什么某个全局 Skill 没生效。

## Catalog 注入

Skill catalog 作为 `SystemPromptContext` 的 `skills` bucket 注入，并使用稳定 segment。注入内容只包含元信息，不包含正文。

建议格式：

```xml
<available_skills>
  <skill>
    <name>frontend-design</name>
    <description>Use when building or improving web UI...</description>
    <scope>project</scope>
    <source>agents</source>
    <location>/abs/path/.agents/skills/frontend-design/SKILL.md</location>
  </skill>
</available_skills>
```

`location` 必须是绝对路径，用于让 Agent 在需要时直接调用 `read_file` 读取 `SKILL.md`，也让它能理解 Skill 内部资源的相对路径边界。

当没有发现 Skill 时，catalog segment 可以不注入；Context usage 的 `skills` bucket 为 0。

## Skill 正文读取

Skill 正文读取复用通用 `read_file` 工具，不新增 `load_skill` 专用工具。

推荐调用：

```json
{ "path": "/abs/path/.agents/skills/frontend-design/SKILL.md" }
```

读取结果就是 `SKILL.md` 原文，包含 frontmatter 和 Markdown 正文。Agent 应按 frontmatter 判断名称、描述和兼容性，按正文执行具体工作流。

如果正文引用了相对路径，例如 `references/style-guide.md`，Agent 应以 `SKILL.md` 所在目录为基准解析。需要列资源时使用 `list_directory`；需要搜索引用材料时使用 `grep` 或 `glob`。

读取 Skill 不执行脚本、不授予额外权限、不绕过现有工具权限系统。脚本是否运行仍由 bash/权限审批等既有机制决定。

## 上下文与压缩

Skill catalog 属于系统级上下文，稳定性低于核心 system prompt，高于普通 conversation。它应该进入 `skills` bucket，便于 Context Popup 和 token usage 显示。

已读取 Skill 正文是当前会话的行为指导，原则上不应被历史压缩错误吞掉。第一版先依赖工具结果保留和压缩提示；如果后续引入专门的 protected tool result 标记，应让 Skill `read_file` 结果进入不可压缩或可重新读取提醒路径。

如果未来必须压缩已加载 Skill 内容，压缩摘要中必须显式说明“Skill 内容已被压缩，如有需要请重新加载”，避免 Agent 误以为仍持有完整指令。

## 安全边界

第一版采用保守只读策略：

- 只自动扫描 `SKILL.md` frontmatter 并注入 catalog；正文和资源由 Agent 按需用已有读类工具读取。
- 不自动执行 Skill 目录内脚本。
- 不因 `allowed-tools` 自动放宽工具权限。
- 项目级 Skill 标记 `scope=project`，用户级 Skill 标记 `scope=user`。
- 读取失败、frontmatter 异常、重复覆盖等情况都只产生 warning，不阻断普通 turn。

后续可增加 workspace trust 配置、按 source 禁用、Skill 管理 UI、文件监听和加载缓存。

## 与现有模块的关系

- `packages/desktop/src/main/agent-runtime-context.ts` 负责装配真实 turn 的 runtime context，应在这里把 Skill catalog 与 AGENTS.md rules 一起注入。
- `packages/agent-core/src/context/modules/system-prompt.ts` 已支持 `skills` bucket，可直接注册 Skill catalog segment。
- `packages/agent-core/src/tools/` 已提供 `read_file`、`list_directory`、`grep`、`glob` 等通用读类工具，Skill 正文和资源读取复用这些工具。
- `packages/shared/src/context-buckets.ts` 已存在 `skills` bucket，不需要新增 bucket 类型。
- `docs/design-docs/agent-current-module-map.md` 在实现完成后记录 `skills/` 模块与工具清单。

## 第一版不做

- 不做 Skill 安装器。
- 不做 Composer Skill 菜单和 UI 管理。
- 不做 `load_skill` 专用工具；Skill 正文读取复用 `read_file`。
- 不做文件监听热更新；每轮 runtime context 构建时重新扫描即可。
- 不做 subAgent 隔离执行。
- 不递归扫描任意目录。
- 不把 `.agents/skilll/` 误拼路径纳入正式规范。
- 不自动执行 `scripts/` 下任何文件。
