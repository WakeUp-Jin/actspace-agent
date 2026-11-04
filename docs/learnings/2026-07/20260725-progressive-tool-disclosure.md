# 渐进式工具披露：注册、可见与授权必须分层

来源：Browser 工具渐进式披露变更，`docs/histories/2026-07/20260725-2233-browser-tool-progressive-disclosure.md`。原 HTML，已转 md。

> 历史说明：文中 `progressiveDisclosure` 元数据、`pendingDisclosureGroups`、`commitProgressiveDisclosure()` 是 2026-07 的实现名，当前代码中已不存在（已 grep 确认）；三层分离与“下一次请求才 commit”的时序仍是设计依据。

当一个能力域拥有大量工具时，最稳定的做法是让执行器保持注册，只动态改变本次模型请求能看到的 definitions，并把授权留在独立的安全层。

## 三层，各自回答不同的问题

| 层 | 问题 | 内容 |
|---|---|---|
| Registered | 系统能不能执行 | executor、permission checker、Socket client、disposer 是否装配 |
| Visible | 模型这次看见什么 | 当前 LLM 请求携带哪些工具 schema；渐进披露只改变这一层 |
| Authorized | 用户是否允许执行 | 审批租约、能力 hard deny、风险策略；不能被“已披露”替代 |

## 为什么不动态 register/unregister

注册通常带着资源与生命周期（连接池、Socket、清理函数、权限检查器、输出渲染器）。为省模型 token 反复重建这些对象，会把上下文优化变成运行时稳定性问题。

```text
ToolManager
  ├─ registered tools: gateway + deferred executors
  ├─ visible definitions: filtered per LLM call
  ├─ active disclosure groups
  └─ pending disclosure groups
```

## 时序：pending 到下一次调用才 commit

LLM call #1 只看到 gateway → gateway 成功：记录 pending group，不立即放行 → LLM call #2 commit 后看到完整工具包。关键陷阱：若 gateway 成功立即激活，模型在同一条 assistant message 里幻觉生成的隐藏工具可能因顺序执行被意外放行，所以披露必须绑定到下一次模型请求边界。

```ts
gateway.progressiveDisclosure  = { group: "browser", role: "gateway" }
deferred.progressiveDisclosure = { group: "browser", role: "deferred" }
pendingDisclosureGroups.add("browser")        // gateway 成功只写 pending
// 下一次 LLM 调用前
commitProgressiveDisclosure(); context.tools = toolManager.getToolDefinitions()
```

隐藏工具不仅不能出现在 definitions 中，执行入口也必须检查可见性，否则模型或不可信历史仍可绕过“UI 隐藏”。

## 不要漏掉的消费者

主 Agent 初始 Context；每次 LLM 调用前刷新；Context token bucket/完整视图；手动与自动压缩；自治 Agent 的下一次 tick；设置总开关与 system prompt。只改一个 producer 会产生“双口径”：模型看见一组工具、Context 面板统计另一组；或用户关了总开关，system prompt 仍宣称能力可用。

## 自检

1. 同一批 tool calls 中，gateway 后面的隐藏工具会被顺序放行吗？
2. 下一条用户消息是恢复为 gateway-only，还是永久膨胀？
3. 关闭工具组后，definitions、prompt、运行时依赖、Context 统计是否同时消失？
4. 工具披露是否被错误当成用户授权？
