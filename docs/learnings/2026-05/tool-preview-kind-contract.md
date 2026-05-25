# Tool Preview Kind Contract

关联 history：`docs/histories/2026-05/20260525-1240-tool-preview-kind-contract.md`

## 是什么

Agent 工具名描述的是后端能力，例如 `read_file`、`list_directory`。前端 preview kind 描述的是 UI 展示语义，例如 `read`、`directory_list`、`bash`。两者不应该混成一个概念。

## 为什么需要

如果前端靠 `toolName` 推断组件，新增工具时很容易漏掉映射：工具能执行，事件也能落盘，但 UI 只能显示 generic 文本。更糟的是，同一个工具名以后可能需要不同展示密度，而不同工具也可能共享同一种展示样式。

把 `previewKind` 放进工具定义后，工具作者必须在注册能力时同步声明展示语义；renderer 只消费 shared view model，不需要知道后端工具目录或具体实现。

## 设计要点

- `toolName` 是能力标识，给 LLM 和 ToolManager 用。
- `previewKind` 是展示语义，给 bridge 和 shared selector 用。
- `ToolUiPreview.kind` 是前端 view model 的 discriminant，React 组件只是实现细节。
- 初始开发阶段可以让 `previewKind` 必填，避免旧 fallback 掩盖契约缺口。

## 常见陷阱

- 不要把字段命名成 `componentName`。这会把后端契约绑死到前端框架和文件名。
- 不要在 selector 里继续写 `if toolName === ...`。这会让契约表面上干净，实际仍然靠猜。
- 不要只在最终持久化事件里补 preview。流式事件也需要逐步拥有同一套语义，否则执行中和执行后 UI 会不一致。

## 自检问题

1. 新增一个 `web_fetch` 专用卡片时，应该改工具名、`previewKind`，还是 React 组件名？
2. 两个不同工具想共享同一种轻量日志行时，应该如何建模？
3. 如果某个工具忘记声明 `previewKind`，类型系统能不能在编译期拦住？
