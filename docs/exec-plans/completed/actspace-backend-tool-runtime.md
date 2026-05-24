# actspace 后端计划 C：Tool Runtime — InternalTool + Scheduler + Truncator

## 目标

基于 Skill 推荐的 definition + executor 分离模式，建立完整的工具系统。V0 阶段实现 ToolManager（注册/查询/执行/极简截断），V1 阶段引入 ToolScheduler（完整生命周期）和 OutputTruncator（两层裁剪）。首版实现四个文件工具。

## 设计来源

- `docs/design-docs/agent-core/backend-agent-design.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`（模块导航）
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`（核心：InternalTool 类型、description 编写、ToolResult）
- `.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`（核心：ToolScheduler 生命周期、权限审批、OutputTruncator）
- `.agents/skills/llm-agent-dev/references/tools/search-tools.md`（Grep/Glob 设计）
- `.agents/skills/llm-agent-dev/references/tools/file-tools.md`（Read/Write/Edit 设计）
- `.agents/skills/llm-agent-dev/examples/tool-definition.ts`（InternalTool 参考）
- `.agents/skills/llm-agent-dev/examples/tool-scheduler.ts`（ToolScheduler 参考）
- `docs/design-docs/llm-agent-dev-skill-fix.md`（Skill 缺少工具文件夹结构建议的补充）
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`

## 目标目录结构

```
packages/agent-core/src/tools/
  types.ts                      # ToolManager 等模块级类型（计划 A 的 InternalTool/ToolResult 已在 internal-tools.ts）
  manager.ts                    # ToolManager（V0 注册/查询/执行/硬截断）
  workspace-guard.ts            # workspace 路径边界检查
  tools/
    read-file/
      definition.ts             # name, description, parameters, isReadOnly, category
      executor.ts               # handler 函数实现
    search-files/
      definition.ts
      executor.ts
    list-directory/
      definition.ts
      executor.ts
    edit-file-diff/
      definition.ts
      executor.ts
  index.ts                      # 统一导出
```

每个工具是一个文件夹，内含两个文件：definition（给 LLM 看的声明）和 executor（系统执行的逻辑）。与 Skill `tool-definition.md` 提出的 definition + executor 分离理念一致。

Skill 原始 V0 目录结构将每个工具放在单文件中（`tools/read_file`），本项目将其拆为文件夹（`tools/read-file/definition.ts` + `executor.ts`），已记录到 `docs/design-docs/llm-agent-dev-skill-fix.md`。

## 相关路径

- `packages/agent-core/src/tools.ts`（当前实现，将被拆分为上述目录结构）
- `packages/agent-core/src/internal-tools.ts`（计划 A 产物：InternalTool/ToolResult 类型）
- `packages/shared/src/session.ts`

## 范围

**V0 骨架（首要目标）：**

- 建立 `tools/` 目录结构（manager + workspace-guard + tools/每工具一个文件夹）
- 实现 `ToolManager`（V0 版调度）：
  - 注册/查询/按名执行
  - execute() 内部对结果做硬截断（默认 2000 字符）
  - 工具定义导出为 LLM 可消费的 `Tool[]`
  - renderResult 支持（有则用，无则默认 JSON.stringify）
- 实现 workspace 路径边界检查（workspace-guard）
- 实现四个基础工具（每个工具 = definition.ts + executor.ts）：
  - read_file、search_files、list_directory、edit_file_diff
- 迁移现有 `tools.ts` 引用到新结构

**V1 增强（后续）：**

- ToolScheduler（完整生命周期状态机）
- OutputTruncator（两层裁剪 + SummarizeFn 可注入）
- 权限审批机制
- 并行调度

不包含：

- 不实现 Bash 工具
- 不实现真实写盘 edit/write
- 不实现外部网络工具
- 不实现用户审批 UI

## 工具 definition + executor 分离模式

每个工具文件夹包含：

- **definition.ts**：导出一个常量对象，包含 name、description、parameters（JSON Schema）、isReadOnly、category。不依赖任何运行时库，可以被 LLM tool list 序列化消费。
- **executor.ts**：导出 handler 函数，接收 `(args, workspaceRoot)` 返回 `ToolResult`。可以依赖 Node.js fs/path 等运行时能力。

工具组装：ToolManager 在注册时将 definition + executor 合并为完整的 `InternalTool`。

## 工具要求

### read_file

- 输入：文件路径，可选行范围（offset/limit）
- 输出：读取摘要、文件内容（带行号前缀）
- 大文件保护：超过阈值行数时截断，返回提示使用 offset/limit
- description 要引导 LLM 使用行范围读取而非整个大文件
- isReadOnly: true，category: "file"

### search_files

- 输入：查询文本或 glob，搜索范围
- 输出：匹配文件和行摘要
- description 要明确说"搜索 workspace 内文本或文件名"
- isReadOnly: true，category: "search"

### list_directory

- 输入：目录路径
- 输出：目录项列表，区分文件/目录
- isReadOnly: true，category: "file"

### edit_file_diff

- 输入：文件路径和编辑提案（old_string + new_string）
- 输出：统一 diff、增删行统计
- 首版只产物化 diff，不应用 patch
- isReadOnly: true（V0 不写盘）
- category: "file"

## 安全边界

- renderer 不直接访问文件系统
- 所有路径必须在允许的 workspace roots 内
- 不允许通过 `..`、symlink 逃逸 workspace
- 工具错误要精确（路径不存在、权限不足、输入非法各有独立错误码），避免模型反复走错方向

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- `read_file` 能读取 workspace 内小文件
- `read_file` 读取不存在文件时返回 `{ success: false, error: "..." }` 结构化错误
- `search_files` 能找到 fixture 中的文本
- `list_directory` 能列出目录
- `edit_file_diff` 只生成 diff preview，不写盘
- ToolManager.execute() 对大输出做硬截断
- 工具定义可导出为 LLM 消费的 `Tool[]` 格式
- ToolResult 统一返回 success/data/error

## 并行关系

- 依赖计划 A 的 InternalTool/ToolResult/Tool 类型
- 可与 LLM Service、Context Pipeline、Persistence 并行
- Execution Engine 通过 ToolManager（V0）或 ToolScheduler（V1）接入本计划产物

## 进度

- [x] 审查现有 `packages/agent-core/src/tools.ts`
- [x] 创建 `tools/` 目录结构
- [x] 实现 workspace-guard（路径边界检查）
- [x] 实现 ToolManager（注册/查询/执行/硬截断/renderResult）
- [x] 实现 read_file（definition + executor）
- [x] 实现 search_files（definition + executor）
- [x] 实现 list_directory（definition + executor）
- [x] 实现 edit_file_diff（definition + executor）
- [x] 迁移现有 tools.ts 引用到新结构（兼容层）
- [x] 通过类型检查（agent-core + 全项目）
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：V1 工具优先服务文件上下文获取与 diff 预览，默认不做自动写盘。
- 2026-05-23：按 Skill `tool-definition.md` 采用 InternalTool 统一类型和 ToolResult 统一返回值。V0 先用 ToolManager 做极简调度，V1 引入 ToolScheduler + OutputTruncator。
- 2026-05-23：每个工具采用文件夹结构（definition.ts + executor.ts），将 Skill 的 definition + executor 分离理念落实到文件组织层面（Skill 原始设计中未覆盖此点，已记录到 `docs/design-docs/llm-agent-dev-skill-fix.md`）。
