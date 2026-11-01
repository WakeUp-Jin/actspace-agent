# Context management engine

统一管理长期 `Context` 实例，通过 `toLlmInput` 输出单次不可变 `LlmInput`。`context.engine` 提供 Harness 级实例注册表、事件 reconcile、只读 projection、请求引擎工厂和唯一压缩协调器；实例按 `Session + logical Agent scope` 隔离，来源与 reducer 只能更新自己声明的切片。转换保留现有消息、工具调用配对、图片及文件引用；状态不会自动发送给模型。

- `types.ts` / `engine.ts`：公共数据结构、来源调用、实例捕获、持久水位 reconcile、插槽与转换。
- `instances.ts` / `reducers.ts` / `projection.ts`：长期实例生命周期、模块 reducer 所有权和面向 Host/UI 的只读投影。
- `registry.ts`：按顺序执行来源、字段所有权、必需来源与可选失败隔离。
- `supplements.ts` / `codec.ts`：尾部补充和版本化插件事件；不改变 Session Surface。
- `compaction.ts`：策略选择、取消/并发检查、四条连续 core 事件提交。
- `state.ts` / `disclosure-contract.ts`：引擎持有状态事件和披露公共契约，不依赖披露插件实现。

具体来源、披露和压缩策略位于同级 `packages/context/*` 插件包；Prompt 包只提供 contributor 和 Host source loading 支持。

Host 在恢复 Session 前加载纯 Codec。行为停用不删除历史；不识别 required Codec 的旧二进制只能 browse-only。原始历史和 artifact 由 `DisclosureHost` 提供，Context 不依赖 JSONL 布局；引用不会授予工具读取权限。

`assembly.ts` 仅保留旧库调用兼容，生产不发布 `context.assembly`。请求快照保持现有 schemaVersion 2。设计和验证见[规范](../../../docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md)及[执行摘要](../../../docs/exec-runs/20261011-context-management-engine-v2/execution-summary.md)。

退役条件：先让根导出和自身兼容测试都切换到 `ContextEngine` / `toLlmInput`，再删除 `assembly.ts`；删除前必须证明动态入口、契约矩阵和历史恢复路径都不再解析 `context.assembly`。
