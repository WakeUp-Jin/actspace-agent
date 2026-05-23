# actspace 后端计划 C：Tool Runtime — InternalTool + Scheduler + Truncator

## 目标

基于 Skill 推荐的 definition + executor 分离模式，建立完整的工具系统。V0 阶段实现 ToolManager（注册/查询/执行/极简截断），V1 阶段引入 ToolScheduler（完整生命周期）和 OutputTruncator（两层裁剪）。首版实现四个文件工具。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`（模块导航）
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`（核心：InternalTool 类型、description 编写、ToolResult）
- `.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`（核心：ToolScheduler 生命周期、权限审批、OutputTruncator）
- `.agents/skills/llm-agent-dev/references/tools/search-tools.md`（Grep/Glob 设计）
- `.agents/skills/llm-agent-dev/references/tools/file-tools.md`（Read/Write/Edit 设计）
- `.agents/skills/llm-agent-dev/examples/tool-definition.ts`（InternalTool 参考）
- `.agents/skills/llm-agent-dev/examples/tool-scheduler.ts`（ToolScheduler 参考）
- `.agents/skills/llm-agent-dev/examples/grep-tool.ts`（搜索工具参考）
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`

## 相关路径

- `packages/agent-core/src/tools.ts`（当前实现，需要按 Skill 重构）
- `packages/agent-core/src/types.ts`（依赖计划 A 的 InternalTool/ToolResult 类型）
- `packages/shared/src/session.ts`

## 范围

**V0 骨架（首要目标）：**

- 定义 `InternalTool` 统一类型：
  - 必需：name、description、parameters（JSON Schema）、handler（async，返回 ToolResult）
  - 可选（V0 先留接口）：check_permissions、render_result、category、is_read_only
- 实现 `ToolManager`（V0 版调度）：
  - 注册/查询/按名执行
  - execute() 内部对结果做硬截断（防止大文件撑爆上下文）
  - 工具定义导出为 LLM 可消费的 `Tool[]`（name/description/parameters 子集）
- 定义 `ToolResult` 统一返回类型：success / data / error
- 实现四个基础工具：read_file、search_files、list_directory、edit_file_diff
- 增加 workspace 路径边界检查

**V1 增强（后续）：**

- `ToolScheduler`（替换 V0 的 ToolManager.execute）：
  - 完整生命周期状态机：validating → awaiting_approval → scheduled → executing → render_result → OutputTruncator → success/error/cancelled
  - ToolCallRecord 记录每次状态变更的时间戳和耗时
- `OutputTruncator`（两层裁剪）：
  - 阈值判断（建议 2000 字符）
  - 未超过：直接使用完整输出
  - 超过：调用快速模型生成摘要，或保留头尾截断中间
  - 完整输出可落临时文件，摘要中包含路径供 Agent 按需深读
  - SummarizeFn 可注入依赖
- 权限审批机制：
  - YOLO 模式 / Default 模式
  - check_permissions 函数（拒绝/通过/修正参数）
  - AllowList 机制
- render_result 函数（ToolResult → LLM 可读自然语言）
- 并行调度（is_read_only 的工具并行，非只读串行）

不包含：

- 不实现 Bash 工具（V1 Tool 扩展）
- 不实现真实写盘 edit/write
- 不实现外部网络工具
- 不实现用户审批 UI

## InternalTool 类型设计（来自 Skill）

```ts
type InternalTool = {
  name: string;
  description: string;               // LLM 选择工具的唯一依据
  parameters: JSONSchema;             // 参数定义
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  
  // V1 可选字段
  check_permissions?: (args) => Promise<PermissionResult>;
  render_result?: (result: ToolResult) => string;
  category?: 'system' | 'file' | 'search' | 'memory';
  is_read_only?: boolean;
};

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};
```

### description 编写要点

1. 第一句说明工具做什么（功能定位）
2. 后续说明使用约束和最佳实践（Instructions）
3. 明确说明"不要用这个工具做什么"（负面指引）

## 工具要求

### read_file

- 输入：文件路径，可选行范围
- 输出：读取摘要、裁剪内容、文件 artifact
- description 要明确说"读取 workspace 内文件"，引导 LLM 只用于读取
- is_read_only: true

### search_files

- 输入：查询文本或 glob，搜索范围
- 输出：匹配文件和行摘要
- description 要明确说"搜索 workspace 内文本或文件名"
- is_read_only: true

### list_directory

- 输入：目录路径
- 输出：目录项列表，区分文件/目录
- is_read_only: true

### edit_file_diff

- 输入：文件路径和编辑提案
- 输出：统一 diff、增删行统计、diff artifact
- 首版只产物化 diff，不应用 patch
- is_read_only: false（但不实际写盘，V0 可标记为 true）

## V0 → V1 触发信号（来自 Skill architecture.md）

- **工具输出太长** → 引入 OutputTruncator
- **需要权限控制**（如引入 Bash 工具）→ 引入 ToolScheduler + check_permissions
- **需要并行执行只读工具** → 引入 is_read_only + 并行调度策略

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

- [ ] 审查现有 `packages/agent-core/src/tools.ts`
- [ ] 定义 InternalTool 统一类型
- [ ] 实现 ToolManager（注册/查询/执行/硬截断）
- [ ] 实现 read_file 工具
- [ ] 实现 search_files 工具
- [ ] 实现 list_directory 工具
- [ ] 实现 edit_file_diff 工具
- [ ] 增加 workspace 路径边界检查
- [ ] 增加结构化工具错误
- [ ] 通过类型检查
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：V1 工具优先服务文件上下文获取与 diff 预览，默认不做自动写盘。
- 2026-05-23：按 Skill `tool-definition.md` 采用 InternalTool 统一类型和 ToolResult 统一返回值。V0 先用 ToolManager 做极简调度（注册+执行+硬截断），V1 引入 ToolScheduler 完整生命周期和 OutputTruncator 两层裁剪。触发信号：工具输出过长或需要权限控制时升级。
