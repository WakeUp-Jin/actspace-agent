# actspace 后端计划 C：Tool Runtime 与真实文件工具

## 目标

把当前 mock 工具重建为 V1 基础版 Tool Runtime，支持工具定义、输入校验、调度执行、输出裁剪、结构化错误和 UI preview。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`
- `.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`
- `.agents/skills/llm-agent-dev/references/tools/search-tools.md`
- `.agents/skills/llm-agent-dev/references/tools/file-tools.md`

## 相关路径

- `packages/agent-core/src/tools.ts`
- `packages/agent-core/src/types.ts`
- `packages/agent-core/src/tools/`
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/index.ts`

## 范围

包含：

- 建立 `ToolDefinition`、`ToolExecutor`、`ToolRegistry`。
- 建立 `ToolScheduler`。
- 建立 `OutputTruncator`。
- 实现 `read_file`。
- 实现 `search_files`。
- 实现 `list_directory`。
- 实现 `edit_file_diff`，只生成 diff preview，不自动写盘。
- 增加 workspace 路径边界检查。
- 增加结构化工具错误。

不包含：

- 不实现 Bash 工具。
- 不实现真实写盘 edit/write。
- 不实现外部网络工具。
- 不实现用户审批 UI。

## 工具要求

### read_file

- 输入：文件路径，可选行范围。
- 输出：读取摘要、裁剪内容、文件 artifact。
- 错误：路径不存在、越界、不是文件、读取失败。

### search_files

- 输入：查询文本或 glob，搜索范围。
- 输出：匹配文件和行摘要。
- 错误：查询为空、路径越界、搜索失败。

### list_directory

- 输入：目录路径。
- 输出：目录项列表，区分文件/目录。
- 错误：路径不存在、不是目录、权限不足。

### edit_file_diff

- 输入：文件路径和 diff 或 edit proposal。
- 输出：统一 diff、增删行统计、diff artifact。
- 限制：首版不应用 patch。

## 安全边界

- renderer 不直接访问文件系统。
- 所有路径必须在允许 workspace roots 内。
- 不允许通过 `..`、symlink 等方式逃逸 workspace。
- 原始大输出可落 ref，但回填模型必须使用裁剪输出。
- 工具错误要精确，避免模型反复走错方向。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- `read_file` 能读取 workspace 内小文件。
- `read_file` 读取不存在文件时返回结构化错误。
- `search_files` 能找到 fixture 中的文本。
- `list_directory` 能列出目录。
- `edit_file_diff` 只生成 diff preview，不写盘。
- 工具输出进入 `ToolExecutionResult`，并包含 `modelOutput` 和 `uiPreview`。
- 大输出会被裁剪。

## 并行关系

- 依赖计划 A 的 `ToolExecutionResult` 契约草案。
- 可与 LLM Service、Context Pipeline、Persistence 并行。
- Execution Engine 通过 `ToolScheduler` 接入本计划产物。

## 进度

- [ ] 审查现有 `tools.ts`。
- [ ] 定义工具 definition/executor 边界。
- [ ] 实现 Tool Registry。
- [ ] 实现 Tool Scheduler。
- [ ] 实现 Output Truncator。
- [ ] 实现 read/search/list/diff 工具。
- [ ] 增加路径边界检查。
- [ ] 增加失败场景。
- [ ] 通过类型检查。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-23：V1 工具优先服务文件上下文获取与 diff 预览，默认不做自动写盘。
