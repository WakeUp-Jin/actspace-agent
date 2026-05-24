# 工具权限调度：把决策和执行解耦

关联 history：`docs/histories/2026-05/20260524-1545-tool-permission-scheduler.md`

## 是什么

工具权限调度是一层位于工具注册表和具体 executor 之间的运行时控制层。它不关心某个工具如何读文件或执行命令，只关心一次 tool call 是否可以执行、是否应该拒绝、是否需要用户审核，以及执行结果如何回填给模型。

首版最重要的建模是三态权限决策：

```ts
type ToolPermissionDecision = "allow" | "deny" | "ask";
```

`reason`、`summary`、`riskLevel`、`sanitizedArgs` 是随决策返回的上下文信息，不是额外状态。

## 为什么需要

如果把权限逻辑写进 Bash 工具，后面 Write、Edit、网络工具都要重复实现审核、拒绝、日志、状态恢复。更麻烦的是，前端审核面板会被迫理解每个工具自己的私有状态。

调度层统一后，单个工具只需要回答：

- 这个调用能不能直接执行？
- 这个调用是否必须硬拒绝？
- 这个调用是否能让用户审核？
- 如果可以继续，参数是否需要清洗？

真正的执行顺序、结果裁剪、待审核状态和未来恢复流程都由 ToolScheduler 管。

## 怎么想

一个好用的边界是：

```text
ToolManager: 注册、查找、导出工具定义
ToolScheduler: 权限决策、状态记录、执行、结果处理
Tool: definition、checkPermissions、handler、renderResult
```

这样 `ToolManager.execute()` 可以保持兼容，但内部委托给 scheduler。调用方暂时不用知道调度层已经出现，系统可以渐进迁移。

## 常见陷阱

第一，别把 metadata 当状态。`riskLevel: high` 不等于拒绝，`summary` 也不等于审核请求；真正决定流程的只有 `allow`、`deny`、`ask`。

第二，`ask` 时不能启动 executor。审核等待发生在执行之前，暂停的是工具调度，不是已经运行的进程。

第三，`deny` 和 `ask` 要分清。硬拒绝是系统判断不应该执行，审核是用户有能力理解并授权的风险。

第四，先保持调用方兼容。调度层刚出现时，不必立刻改 engine、IPC 和 UI；先让现有工具行为不回归，再逐步把 pending approval 事件接出去。

## 自检问题

1. 如果 `checkPermissions` 返回 `ask`，executor 应该启动吗？为什么？
2. `riskLevel` 为什么不应该设计成权限状态枚举的一部分？
3. 为什么 ToolScheduler 不应该直接依赖 Electron renderer 的审核按钮？
