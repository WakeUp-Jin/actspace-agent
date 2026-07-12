# Browser 读取输出保真与分页

## 用户诉求

复盘一次 Browser Agent 悬浮操作时发现，模型最初调用 DOM snapshot 的方向正确，但目标节点没有稳定进入模型上下文。要求优先修复 DOM 快照截断，并同时修复精确 browser help、Locator 批量读取分页和 browser_run 结果转发；其他 Browser 工具保持不变。

## 主要改动

- `browser_dom.snapshot`
  - Locator runtime v4 默认读取最多 500 个可见交互节点、硬上限 1000。
  - 返回 total/returned/truncated，并为节点补充 href 与文本截断元数据。
  - Agent Core 改用紧凑逐节点输出，50,000 字符内保真，不进入通用 flash 摘要；超限只在完整节点边界停止。
- `browser_help(category, action)`
  - 精确 action schema 使用 20,000 字符保真路径，不再被普通 2,000 字符工具阈值摘要。
- `browser_locator.all_text_contents/read_all`
  - 增加 offset/limit 分页，默认 limit 200、硬上限 1000。
  - 返回 total/offset/returned/has_more，并按完整 item 格式化。
- `browser_run`
  - 不再只返回 action 名称，改为逐 action 返回真实模型可读结果，并复用单 action 的 DOM、分页、tabs 和短状态格式。
- 新增 `ToolResult.preserveModelOutput`，仅允许已经按工具语义完成限额的结果跳过通用 OutputTruncator；全局工具阈值未调整。

## 设计动机

DOM 节点、工具协议 schema 和分页列表属于结构事实。通用摘要模型无法知道后续操作依赖哪个中间节点，因而不能安全决定删除哪些内容。修复采用 action 级输出策略，而不是全局放大工具阈值，避免单一站点案例推动所有工具无边界扩容。

## 关键文件

- `plugins/browser-bridge/apps/cli/internal/locator/runtime.js`
- `plugins/browser-bridge/apps/cli/internal/commands/registry.go`
- `plugins/browser-bridge/apps/cli/command_router.go`
- `packages/agent-core/src/tools/tools/browser/executor.ts`
- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/tools/scheduler.ts`

## 验证

- Browser Bridge Go tests。
- Browser Locator runtime fixture。
- Agent Core Browser Socket integration tests。
- OutputTruncator regression tests。
- Browser registry / extension contract checks。
- Workspace typecheck。
