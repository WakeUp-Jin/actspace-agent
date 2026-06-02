# 运行时检查视图要复用真实 Loader

关联 history：`docs/histories/2026-06/20260602-1008-agents-md-runtime-loader.md`

## 核心问题

很多 Agent 产品都会有一个“查看当前上下文”的检查视图。这个视图看起来只是调试工具，但它展示的是用户判断 Agent 行为的事实来源。如果检查视图自己重新拼一份 prompt、规则或工具列表，就很容易和真实 LLM 调用漂移：用户以为某条规则没进上下文，实际上它已经进了；或者反过来，检查视图展示了规则，真实 turn 却没吃到。

## 可迁移模式

把“运行时上下文装配”做成一个小 loader，让真实执行链路和检查/预览链路共用它：

```txt
settings / files / workspace rules
        ↓
runtime context loader
        ↓
buildAgentConfig(...)
        ↓
真实 turn / context describe
```

这次的落点是 main 侧 `loadMainAgentRuntimeContext()`：

- 主系统提示词来自 `SettingsService.readAgentSystemPrompt()`。
- `<userData>/AGENTS.md` 和 `<workspaceRoot>/AGENTS.md` 由 `agents-md-service.ts` 加载。
- 输出统一是 `systemPrompt + systemPromptSegments`。
- 真实 turn 和 `context:describe` 都只消费这份输出。

## 常见陷阱

- **检查视图单独兜底**：比如 Context describe 继续用代码默认 prompt，而真实 turn 已经改为读用户文件。短期测试容易过，长期一定漂移。
- **错误处理不一致**：真实 turn 对缺失规则文件静默跳过，检查视图却报错，会让用户误以为主流程也会失败。
- **bucket 丢失**：`AGENTS.md` 这类规则如果直接拼进主系统提示词，就很难在 UI 里解释来源。作为 `rules` segment 注入，既能进入最终 system prompt，也能在 Context 明细中单独展示和统计。

## 自检

- 修改一个运行时上下文来源时，Context 检查视图是否自动跟着变？
- 缺失、空文件、读取失败这些边界在真实 turn 和检查视图中是否一致？
- UI 展示的 bucket 是否能解释“这段内容来自哪里”，而不是只展示一整坨 system prompt？
