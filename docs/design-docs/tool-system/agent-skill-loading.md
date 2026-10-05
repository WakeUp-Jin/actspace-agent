# Agent Skill 设计与加载规范

当前 v2 Skill 发现、catalog 与按需正文加载规范，2026-10-05 对照 `packages/prompt/src/skills/` 校准。

## 目标与内容

Skill 用目录保存任务方法。`SKILL.md` 提供名称、触发描述与使用步骤；相邻 `references/`、`scripts/`、`assets/` 按需读取。发现 Skill 不执行脚本，不改变工具权限。

```text
<skill-root>/<skill-name>/SKILL.md
<skill-root>/<skill-name>/references/
<skill-root>/<skill-name>/scripts/
<skill-root>/<skill-name>/assets/
```

典型 frontmatter：

```yaml
---
name: frontend-design
description: Use when building or reviewing frontend interfaces.
---
```

当前解析器只提取简单的逐行键值，不是完整 YAML 解析器。内部 `id` 优先取 frontmatter `id`，其次 `name`，最后目录名；必须匹配小写字母数字/连字符规则且不超过 64 字符。`description` 必须非空且不超过 1,024 字符。`name` 缺省时采用 `id`。

不合法 frontmatter、ID 或 description 不进入 catalog。当前没有单条 Skill warning/shadowed DTO；目录读取失败会跳过，已发现文件读取失败可能传播为发现失败，不能承诺所有错误都只产生 warning。

## 发现根与去重

按以下顺序扫描，先加入的相同 `id` 生效：

1. `<workspaceRoot>/.actspace/skills/`
2. `<workspaceRoot>/.agents/skills/`
3. `<workspaceRoot>/.claude/skills/`
4. `<dataRoot>/skills/`
5. `<dataRoot>/.actspace/skills/`
6. `<home>/.agents/skills/`
7. `<home>/.claude/skills/`

每个根按目录名稳定排序，递归深度上限为 6，每根最多处理 512 个 `SKILL.md`。重复判断使用 `id`，不是显示名称。Catalog 保留来源和绝对路径；来源包括 `.actspace/skills`、`actspace-userData`、`actspace-userData-legacy`、`agents-user` 等实际扫描标识。

## Prompt 与正文读取

Host 在构建运行所需的 prompt source 时调用 `discoverSkills()`。`core/skills-catalog` contributor 注入 `id/name/description/location/source` 与内容 digest provenance，不包含正文。Chat 模式不注入工作区 Skill catalog。

模型可用通用 `read_file` 按 catalog 的绝对 `location` 读取正文，再相对 `SKILL.md` 所在目录探索资源。没有 `load_skill` 专用工具。

另有显式选择入口：`core/selected-skills` contributor 根据 selected IDs 读取正文，每份最多注入 65,536 字符；缺少选中 ID 或读取失败会让该 required contributor 失败。不能把这一入口误写成“正文只能通过工具读取”。

当前没有独立 Skill 正文持久库或不可压缩标记。已读内容遵循 Session Surface 与通用压缩规则，需要时重新读取。`allowed-tools` 等附加 frontmatter 不授予权限。

## 所有权与安全

- `packages/prompt/src/host-context.ts`：读取 Host / workspace 指令，发现 Skills，形成 prompt source。
- `packages/prompt/src/skills/`：扫描、catalog、prompt contributor。
- `packages/runtime/src/harness/agent-factory-plugin.ts`：在 Harness 内装配 contributor，按 Agent mode 选择来源。
- 文件工具：按统一 Tool Runtime 的读取权限执行正文与资源读取。
- Host：负责来源目录与凭据边界；renderer 不直接读本地 Skill 文件。

不扫描误拼目录，不自动安装、执行脚本或放宽 workspace/Session 权限。未来缓存、文件监听和更完整 YAML 支持需明确新增合同。

## 验证入口

`packages/prompt/src/test/discovery.test.ts`、`host-context.test.ts` 与 contributor 测试覆盖根目录优先级、去重、目录注入、显式正文及 Chat 隔离。脚本执行的真实权限和副作用仍由工具验收负责。
