## [2026-07-26 11:08] | Task: 修复回复可视化空白与重新生成失效

### 🤖 Execution Context

- Agent ID: Codex
- Base Model: GPT-5
- Runtime: Codex Desktop

### 📥 User Query

> 点击回复可视化后右侧为空，重新生成也无结果；应只转换当前点击回复，而不是引入更早会话内容。

### Changes Overview

- Scope: `agent-core`、`desktop`、相关设计文档与测试。
- 将回复可视化接入 main 的 `ModelRuntimeService`，复用 Settings / `safeStorage` 中的主模型配置，不再走只读取环境变量的旧配置路径。
- 在写缓存前校验 LLM `stopReason` 与完整 HTML 文档结构；错误、截断、空输出不再被保存成成功产物。
- 历史空产物自动失效，Reply 聚合列表过滤无效缓存；显式重新生成始终绕过有效缓存并重新调用模型。
- renderer 只把当前 turn 的最终可见助手回复交给转换，不包含工具执行旁白或更早会话内容。
- 为模型配置、错误值、缓存自愈、重新生成和 renderer 请求边界补充回归测试与日志字段。

### Design Notes

正常对话早已迁移到 main-only provider runtime，但回复可视化仍残留旧 env builder。由于 LLM 层用 `stopReason=error` 表达部分失败，调用方若只依赖 `catch`，会把空文本当作正常结果继续缓存。本次修复同时收敛配置来源和结果判定，避免“配置失败 -> 空 HTML -> 永久缓存命中”的链式故障。

### Files

- `packages/agent-core/src/visualize/md-to-html.ts`
- `packages/desktop/src/main/visualize-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/agent-core/src/visualize/test/md-to-html.test.ts`
- `packages/desktop/src/main/test/visualize-service.test.ts`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`

