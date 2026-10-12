# Context domain packages

`packages/context/` 是上下文管理领域目录。每个子目录都是一个独立的 workspace 插件包，统一由 Harness 装配：

- `engine/`：长期 Context 实例、reconcile、capture、LlmInput 转换、状态事件和只读 Projection。
- `system/`、`runtime/`、`rules/`、`skills/`、`conversation/`、`tools/`：各自拥有来源与状态切片。
- `disclosure/`：渐进式文件披露与状态恢复。
- `compaction/`：压缩策略、摘要器和策略注册；协调提交仍由 engine 负责。

`packages/prompt/` 只保留 Prompt contributor、装配支持和 Host source loading，不再承载 Context 类型插件实现。历史事件继续使用 `actspace.context` owner 与既有 Codec，以保证旧 Session 可读。

Engine 的 `Context` 是按 `Session + logicalAgentScopeId` 管理的长期状态；面向模型的 `LlmInput` 和面向 Host/IPC 的 Projection 都是从它捕获出的只读值。
