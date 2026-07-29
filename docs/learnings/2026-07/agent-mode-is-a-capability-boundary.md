# Agent 模式必须是能力边界，而不是 Prompt 标签

## 是什么

Chat、Plan、Agent 这类产品模式看起来像输入框上的 UI 状态，但它们真正表达的是不同的能力集合：Chat 不应调用工具，Plan 只能调查与制定方案，Agent 才能修改环境。因此模式必须参与工具注册，而不能只靠 system prompt 告诉模型“不要写文件”。

## 为什么需要

Prompt 是行为引导，不是权限系统。只要写工具仍然出现在模型可见的 definitions 中，模型就可能因为上下文冲突、提示注入或推理失误调用它。对于 Plan 模式，这会把“先设计后执行”退化成一种不可靠的约定。

## 怎么做

在工具注册入口建立显式 profile：

```ts
type ToolProfile = "none" | "read-only" | "full";

const READ_ONLY_TOOL_NAMES = new Set([
  "read_file",
  "grep",
  "glob",
  "list_directory",
  "web_search",
  "web_fetch",
]);
```

- `none` 直接返回空 ToolManager。
- `read-only` 使用固定 allowlist，而不是依赖 `isReadOnly` 自动纳入新工具。
- `full` 才注册写文件、Bash、Browser 和子 Agent 等能力。
- Plan prompt 继续说明输出格式和行为，但它只是体验层约束，权限由 profile 保证。

## 核心要点

- UI 模式必须随 IPC 一起传到可信运行时，不能只保存在 renderer。
- 权限应在能力创建阶段裁剪，越靠近调用时才判断，越容易出现旁路。
- 只读模式优先使用 allowlist；以后新增工具时默认不可用，比 denylist 更安全。
- 上下文注入也要跟随能力裁剪，例如无 Browser 工具时不能继续宣称 Browser 可用。
- 测试应直接断言每种 profile 的工具名集合，而不只测试某次模型没有调用工具。

## 常见陷阱

- 只改 placeholder 或 system prompt，实际仍注册全部工具。
- 依据工具的 `isReadOnly` 字段自动开放 Plan；新工具的元数据一旦标错就越权。
- 关闭工具后仍注入对应运行时说明，造成模型不断尝试不可用能力。
- renderer 传入完整 Skill 路径或权限信息，导致可信边界倒置。

## 自检问题

1. 如果新增一个默认 `isReadOnly: true` 的工具，Plan 是否会自动获得它？为什么？
2. Chat 模式除了工具 definitions，还需要清理哪些会误导模型的运行时上下文？
3. 为什么 Skill 的“选择状态”可以来自 renderer，但 Skill 正文必须由 main 重新解析？
