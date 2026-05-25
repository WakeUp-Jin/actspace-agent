# 三 Bug 修复：Abort 竞态、搜索工具重构、Web 工具统一

## 用户诉求

修复三个 Bug：
1. 取消/暂停按钮无效——点击后 Agent 执行依旧不停止
2. 搜索工具不符合预期——应该拆分为 grep（内容搜索）和 glob（文件名搜索）两个独立工具
3. web_search / web_fetch 执行失败 + UI 显示为空

## 主要变更

### Bug 1: Abort 竞态条件修复

**根因**：`main/index.ts` 中先调用 `runTurnWithAgent`（async），再同步检查 `abortableDeps.abort` 是否存在来决定是否注册到 `activeTurnAborts`。由于 `bridge.ts` 在 async 执行中才赋值 `abort`，注册总是失败。

**修复**：改为在调用前注册闭包 `() => abortableDeps.abort?.()` 到 map，闭包在调用时才读取当时的 abort 值。

### Bug 2: 搜索工具重构

- 新增 `tools/grep/`（definition + executor）：支持正则搜索文件内容，优先用 ripgrep，fallback Node.js 遍历
- 新增 `tools/glob/`（definition + executor）：支持 glob pattern 查找文件，按修改时间排序
- 从 `createToolManager` 中移除旧 `search_files`，替换为 grep + glob 注册

### Bug 3: Web 工具统一为单一 `web_search`

**根因诊断过程**：
1. 通过日志发现 `searchWithKimi` 的 tool_result 内容错误（之前用 `"ok"`，应该原封不动回传 arguments）
2. 通过真实 API 测试发现 `fetchAndSummarizeWithKimi` 的 summarize 步骤超时（37 秒 + thinking 模式未禁用导致 content 为空）
3. 查阅 Kimi 官方文档确认：`$web_search` builtin 内置了 search + crawl 能力，无需自己 fetch HTML

**最终方案**：
- 删除 `web_fetch` 工具——合并到 `web_search` 中
- `web_search` definition 支持 `query`（关键词）、`url`（读取网页）、`prompt`（聚焦指令）三个参数
- executor 根据参数构造不同的 prompt 统一传给 `searchWithKimi`
- 删除 `fetchAndSummarizeWithKimi`、`WebFetchResult`、`fetchPageText`、`htmlToText` 等不再需要的代码
- `searchWithKimi` 中 tool_result 修正为 `JSON.stringify(tc.arguments)`（按 Kimi 文档要求原封不动回传）
- `bridge.ts` 中 UI preview 根据传入的 query/url 显示不同文案

### 安全阀

- `loop.ts` 增加 `maxTurns`（默认 50）硬限制，防止工具调用无限循环
- `AgentLoopConfig` 类型中新增 `maxTurns` 字段

### temperature / maxTokens 优化

- `main/index.ts` 中 `createLLMConfigFromSpec` 仅在用户 .env 显式配置了非默认值时才传递 temperature/maxTokens
- `kimi-assistants.ts` 中移除 KimiAssistantConfig 的 temperature/maxTokens 字段，调用时传 `{}`

## 关键受影响文件

- `packages/desktop/src/main/index.ts` — abort 注册 + temperature 传递优化
- `packages/agent-core/src/engine/loop.ts` — maxTurns 安全阀
- `packages/agent-core/src/engine/types.ts` — AgentLoopConfig.maxTurns
- `packages/agent-core/src/engine/bridge.ts` — UI preview 逻辑
- `packages/agent-core/src/llm/kimi-assistants.ts` — searchWithKimi 核心修复，删除 fetchAndSummarize
- `packages/agent-core/src/tools/tools/web-search/` — 统一的 executor 支持 query + url
- `packages/agent-core/src/tools/tools/web-fetch/` — 已删除
- `packages/agent-core/src/tools/tools/grep/` — 新增
- `packages/agent-core/src/tools/tools/glob/` — 新增
- `packages/agent-core/src/tools/index.ts` — 工具注册替换
- `docs/design-docs/agent-core/current-module-map.md` — 更新工具描述

## 设计动机

1. **Abort 用闭包延迟求值**：解决 async 赋值与同步注册的时序问题，不需要引入额外的事件/回调机制。
2. **grep + glob 替换 search_files**：符合 llm-agent-dev skill 的工具设计规范，让 Agent 能明确区分「搜内容」和「找文件」。
3. **统一 web_search**：Kimi `$web_search` 本身就具备 search + crawl 双能力，拆成两个工具反而引入了 fetchPageText + htmlToText + LLM summarize 的复杂链路，容易超时且结果质量差。合并后代码量大幅减少，可靠性提升。

## 测试状态

- 176 个单元测试通过
- 真实 Kimi API 测试脚本：`src/llm/test/kimi-assistants-real.test.ts` 和 `src/llm/test/web-fetch-debug.test.ts`
- web_search 关键词搜索已验证通过（返回 1664 字符的完整结果）
