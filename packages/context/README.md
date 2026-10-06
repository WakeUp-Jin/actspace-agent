# Context domain group

统一管理 `Context`，通过 `toLlmInput` 输出 `LlmInput`。`context.engine` 提供请求引擎工厂和唯一压缩协调器；每个 Agent scope 注册来源，单次请求冻结内容。转换保留现有消息、工具调用配对、图片及文件引用；状态不会自动发送给模型。

- `types.ts` / `engine.ts`：公共数据结构、来源调用、插槽与转换。
- `registry.ts`：按顺序执行来源、字段所有权、必需来源与可选失败隔离。
- `supplements.ts` / `codec.ts`：尾部补充和版本化插件事件；不改变 Session Surface。
- `compaction.ts`：策略选择、取消/并发检查、四条连续 core 事件提交。
- `disclosure/` / `state.ts`：规范化文件引用、周期读取计数、最多 100 条活跃路径、可重建睡眠索引和幂等恢复。
- `sources/`：会话和工具来源；Prompt 包提供另外四个来源。

Host 在恢复 Session 前加载纯 Codec。行为停用不删除历史；不识别 required Codec 的旧二进制只能 browse-only。原始历史和 artifact 由 `DisclosureHost` 提供，Context 不依赖 JSONL 布局；引用不会授予工具读取权限。

`assembly.ts` 仅保留旧库调用兼容，生产不发布 `context.assembly`。请求快照保持现有 schemaVersion 2。设计和验证见[规范](../../docs/design-docs/上下文管理引擎设计/Context数据结构和模型输入数据结构的设计规范.md)及[执行摘要](../../docs/exec-runs/20261006-context-management-engine/execution-summary.md)。
