# 工具模块

工具是 LLM 获取外部能力的唯一途径。工具系统的设计质量直接决定 Agent 的执行能力上限。

核心设计哲学：每个工具采用 **definition + executor** 分离模式。definition 描述"是什么"（给 LLM 看），executor 实现"怎么做"（系统执行）。工具调度器管理从验证到执行到输出裁剪的完整生命周期。

## 本模块包含

| 文件 | 关注点 |
|------|--------|
| `tool-definition.md` | 工具类型体系、参数 schema 设计、description 编写要点 |
| `bash-tool.md` | Bash 命令执行工具的安全权限设计（多层防护） |
| `search-tools.md` | Grep/Glob 文件检索工具的设计（Agent 代码理解的基础能力） |
| `file-tools.md` | Read/Write/Edit 文件操作工具（原子写入、行号精确替换） |
| `tool-scheduling.md` | 工具调度生命周期、权限审批、输出裁剪 |

## 阅读顺序

先读 `tool-definition.md` 理解工具的类型结构和定义规范，再根据需要开发的工具类型选读具体文件。如果需要理解工具从调用到返回的完整流程，读 `tool-scheduling.md`。

参考代码: `examples/tool-definition.ts`、`examples/tool-scheduler.ts`、`examples/bash-tool.ts`、`examples/grep-tool.ts`
