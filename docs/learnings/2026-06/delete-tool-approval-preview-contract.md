# 高风险工具要把审批状态纳入展示契约

关联 history：`docs/histories/2026-06/20260602-1412-delete-file-tool.md`

## 是什么

`delete_file` 这类高风险工具不能只实现一个 executor。它需要同时把权限审批、运行态、最终结果和 session 恢复纳入同一套 typed preview 契约：后端用 `ToolUiPreview.kind = "delete"` 表达展示语义，前端只消费 `MessageBlock.kind = "delete"`，不从 raw args 或 toolName 临时推断 UI。

## 为什么需要

删除是不可逆操作。如果只靠 Bash 或通用工具行，用户很难区分“模型准备删除”“正在等待确认”“已经删除”“用户拒绝”这些阶段。更危险的是，如果审批系统提供 `allow_similar`，一次同意可能被错误扩大为一类删除放行。

把审批状态建模进 preview 后，系统可以做到：

- running/completed/failed/denied 仍是轻量工具行，不打断消息节奏。
- pending approval 独立成确认块，因为这里承载真实用户操作。
- session 恢复只恢复最终事实态，不从历史里猜 pending。
- scheduler 和 main registry 双层拒绝 delete 的 `allow_similar`。

## 怎么想

判断一个工具是否需要独立审批 UI，可以看它是否同时满足三点：

- 动作不可逆或难撤销。
- 用户需要在动作发生前确认具体目标。
- 审批结果会改变工具调度，而不只是改变展示。

满足这些条件时，不要把审批做成组件里的临时状态。应先扩 shared 契约，再让 bridge、streaming preview、renderer 和恢复逻辑都走同一条路径。

## 常见陷阱

- 只在 renderer 屏蔽 `allow_similar`，但 scheduler 仍接受相似审批。
- 点击审批按钮后乐观切换 UI，却没有检查 IPC 返回的 `{ ok: false }`。
- completed/failed 可以恢复，但 denied 只存在运行态，刷新后丢失。
- pending 审批被写成历史事实，导致恢复旧 session 时出现已经过期的确认按钮。

## 自检问题

- 这个工具的 `previewKind` 是否能完整表达用户需要看到的状态？
- 用户点击审批按钮后，IPC 失败或请求已过期时 UI 会不会误报成功？
- 最终 `tool_result` 能不能独立恢复出 completed / failed / denied，而不依赖正在运行的内存状态？
