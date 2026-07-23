# 用输出目录作为专用 Agent 的 Workspace

关联 history：`docs/histories/2026-07/20260719-1400-add-eval-failure-candidate-command.md`

## 问题

一个专用 Agent 需要读取原项目，但只能把生成结果写到另一个目录。直觉上容易为它再造一套 `read_source`、`write_candidate` 工具，结果会重复文件工具、权限检查、预览和测试。

## 模式

如果现有读工具支持用户显式提供的绝对路径，可以把专用 Agent 的 `workspaceRoot` 直接设置为输出目录：

- 相对 `write_file` / `edit_file` 自动落在输出目录。
- 原项目和会话文件通过 prompt 提供绝对路径，用既有 `read_file` / `grep` / `glob` 读取。
- 系统提示词说明原目录只读、输出目录的文件协议和成功标准。
- 删除、Bash、网络等无关工具从当前 Agent 的 ToolManager 中禁用。

这样复用的是完整 ToolManager 能力，而不是只复用 executor 函数。

## 适用条件

- 输出是一个独立目录或沙盒。
- 专用 Agent 不需要在原项目中执行写操作。
- 读工具允许访问显式绝对路径。
- 写工具已经按 workspaceRoot 做边界检查。

## 常见陷阱

- `additionalWritableRoots` 是“增加可写范围”，不能把原 workspace 变成只读；需要只写输出目录时，应直接把输出目录设为 workspaceRoot。
- 系统提示词负责行为语义，路径守卫负责机械边界，两者不能互相替代。
- 只换 workspaceRoot 还不够；Bash、删除和网络工具可能绕开预期，应按任务最小化暴露工具。

## 自检

- 专用 Agent 是否真的需要新工具，还是只需要不同的 workspaceRoot？
- 所有相对写入是否都会解析到输出目录？
- 是否仍暴露了能绕开文件写入边界的工具？
