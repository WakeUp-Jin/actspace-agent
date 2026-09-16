# Typed tool provenance, bounded previews, and safe UI targets

这次工具交互修复暴露了一个通用问题：执行事实、模型可见内容和用户可操作 UI 不是同一层数据。把它们都压成字符串，短期看似简单，长期会导致通知泄露、历史回放丢交互、错误只能靠 tooltip 查看，以及 renderer 猜测文件路径等问题。

## 核心模式

让每条跨层事实都携带两个明确维度：

1. **Provenance（来源）**：这条消息是普通用户输入、后台任务通知，还是工具结果？来源必须从生产端一直传到 projection/selector，不能在 UI 端通过 XML 或显示文本反推。
2. **Target（目标）**：这条结果是内联摘要、bounded disclosure、工作区文件 Tab、图片 artifact Tab，还是子 Agent 面板？目标应由 typed preview 决定，不能由组件名称或字符串格式隐式决定。

## 为什么有效

- **实时与回放一致**：live adapter 和 historical selector 都消费同一个 `ToolUiPreview` 字段，reload 不会丢掉 Chevron 或结果摘要。
- **安全边界清晰**：renderer 只请求 workspace 内的相对路径，main 再做 realpath、文件类型和大小校验；UI 不接触绝对路径读盘。
- **错误可操作**：短摘要用于扫描，详细错误放进可点击 disclosure；hover 只提供辅助信息，不承担唯一可达性。
- **子 Session 不重复投影**：Explore/Agent 主消息只显示状态，完整 transcript 由右侧 SubAgent panel 按 child Session 引用读取。

## Before / After

```ts
// Before: 把后台通知当作普通 user message，source 在边界丢失
inbox.enqueue(xml, "next-step");

// After: source 是事件事实，selector 可以可靠过滤
inbox.enqueue(xml, "next-step", undefined, "task_notification");
```

```ts
// Before: renderer 看到 Read /path/to/file 后自行猜测如何打开
window.open(`file://${message.filePath}`);

// After: 只传相对路径，由 main IPC 重新校验并生成 Tab
const result = await window.actspace.readWorkspaceFile({ workspaceRoot, relativePath });
openTab(tabFromFile(result));
```

## 实施清单

- 在事件、Inbox item、Surface projection 和 selector 中保留来源字段。
- 为工具结果定义 bounded preview（行数和单行长度上限），空结果和失败结果不要伪造可展开内容。
- 为不同对象定义明确的 UI target：disclosure、文件 Tab、artifact Tab、SubAgent panel。
- 让历史回放路径复制实时路径实际使用的 preview 字段。
- 对任何 renderer 发起的文件/网络读取，在 main 侧重新解析和校验；不要信任 renderer 的绝对路径。

## 常见陷阱

- 只在 selector 里写 `source === ...` 过滤，但 projection 没有透传 source。
- 用错误文本填充 `resultPreview`，导致失败状态看起来像成功结果。
- 为通用结果复用 Web Search 的 URL 样式，语义和键盘行为会逐渐分叉。
- 把独立 child Session 的完整 transcript复制回父消息，造成重复渲染和状态竞争。
- 看到 HTTP 200 就直接 `JSON.parse`；网关可能返回 HTML 错误页。

本条学习来自 [20260913 工具结果交互与后台通知修复](../../histories/2026-09/20260913-1540-tool-result-interaction-fixes.md)。
