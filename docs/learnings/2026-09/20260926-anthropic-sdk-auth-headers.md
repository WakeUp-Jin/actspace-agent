# Anthropic SDK 的两种认证头，以及它会悄悄读的环境变量

> 来源：`docs/histories/2026-09/20260926-1413-custom-connection-setup-redesign.md`（自定义服务支持 Bearer 认证的中转站）。

## 背景

Anthropic 官方 API 用 `x-api-key: <key>` 认证。很多中转站却只认 `Authorization: Bearer <key>`，用 x-api-key 直接 401。所以自定义连接要能在两种之间切换，「自动」模式下先试 x-api-key，被拒再试 Bearer。

看起来只是换个请求头，实际有两个坑。

## 坑 1：只传 apiKey，SDK 也可能多发一个 Authorization

`@anthropic-ai/sdk` 的构造参数有两个：

```ts
new Anthropic({ apiKey, authToken });
```

- `apiKey` → `x-api-key` 头
- `authToken` → `Authorization: Bearer` 头

**两个参数都有环境变量默认值**：没传 `authToken` 时，SDK 会读 `process.env.ANTHROPIC_AUTH_TOKEN`。开发者机器上装过 Claude Code 或其他工具时，这个变量很常见。

后果：用户选了 x-api-key，请求却同时带上 `Authorization: Bearer <环境里的另一个令牌>`，发给了第三方中转站。这是凭据泄露，不只是认证失败。

**做法**：要哪种头就只给哪种，另一种显式传 `null`，不要留成 `undefined`：

```ts
// x-api-key
new Anthropic({ apiKey: key, authToken: null });
// Bearer：Key 放进自定义头，apiKey 和 authToken 都关掉
new Anthropic({ apiKey: null, authToken: null, defaultHeaders: { Authorization: `Bearer ${key}` } });
```

`null` 表示「明确不要」，`undefined` 表示「用默认值」。环境变量兜底走的是后者。

## 坑 2：用占位 Key 绕过「必须有 apiKey」的校验

旧代码在没有 apiKey 时塞一个 `"placeholder"`，好让 SDK 不报错。这在 Bearer 模式下会变成同时发两个头：

```
x-api-key: placeholder
Authorization: Bearer sk-real
```

有的中转站看到 x-api-key 就按它校验，结果返回 401，排查时还会以为 Bearer 不行。正确做法同上：头部已经自带认证时，传 `apiKey: null`。

## 怎么验证

不要只断言「调用参数里有 Authorization」，要用**真实 SDK** 构造 client，拦截 `fetch`，检查最终发出的请求头：

- Bearer：有 `authorization`，**没有** `x-api-key`；
- x-api-key：有 `x-api-key`，**没有** `authorization`，并且测试时把 `ANTHROPIC_AUTH_TOKEN` 设成一个假值，确认它没被带出去。

只有看最终的请求头，环境变量兜底和占位 Key 这类问题才会暴露出来。

## 自检

1. `new Anthropic({ apiKey: "k" })` 在 `ANTHROPIC_AUTH_TOKEN=t` 的环境里会发哪些认证头？
2. 为什么 Bearer 模式要把 Key 放进 `defaultHeaders`，而不是直接用 `authToken: key`？（提示：两条线路要行为一致，pi-ai 直连只接受 headers。）
3. 如果只用 mock 的 SDK 写测试，上面两个坑能被发现吗？
