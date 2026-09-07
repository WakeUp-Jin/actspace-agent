# 事件身份与组装结果要分开读取

给某个会话添加提示词时，先问两个问题：“是谁发出了这次事件？”和“下游最终组装出了什么？”它们可能来自不同对象。

在中间件瀑布中，事件输入携带 Agent subject，供监听器判断来源。`await next()` 返回的是下游新建的请求候选；下游只需要满足候选契约，不必复制输入上所有临时字段。即使 TypeScript 允许取属性，也不意味着生产路径一定保留了身份信息。

```ts
const candidate = await next();
const subject = input.agent;
if (!isTarget(subject, candidate.sessionId)) return candidate;
return addPromptImmutably(candidate);
```

如果误从 `candidate.agent` 获取身份，单测可能仍通过：测试 dispatcher 原样返回输入对象，恰好保留了 subject。真实 AgentLoop 重建候选时丢弃该字段，能力就会静默不生效。

因此需要两层证据。Scope 测试验证监听范围与子 Scope 排除；真实组装链测试检查发给 fake Provider 的 messages，同时检查 Journal 的 request/context。后者可以发现“按钮已开启、函数测过、实际模型请求却没有提示词”的问题。

Scope 继承还意味着父监听器可能看见子 Agent。注册在父 Scope 并不自动等于“仅这个主 Agent”；要同时核对 subject 和 Session ID。这样单会话功能不会随着后端事件路由的继承规则扩散。

自检：事件来源在哪个阶段确定？下游返回值承诺保留哪些字段？测试有没有真正穿过生产组装器？这三个问题也适用于鉴权中间件、请求重写和追踪信息传播。

实践来源：[英语辅助学习实施](../../histories/2026-09/20260906-2237-english-learning-design.md)。
