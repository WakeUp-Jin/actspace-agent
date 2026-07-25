# 供应商级代理：把差异放在 fetch 边界，不要污染全局网络环境

一个桌面 Agent 同时使用多个 LLM 供应商时，代理通常只应该影响其中一家。例如 OpenRouter 需要代理，而 DeepSeek、Kimi 仍应直连；搜索工具、应用更新和 Browser Use 也不能被连带改变。

## 为什么全局环境变量不合适

设置 `HTTP_PROXY` / `HTTPS_PROXY` 是进程级行为。它会把“某个供应商的传输策略”扩散成“整个应用的网络策略”，导致：

- 原本可直连的国内供应商也绕代理。
- web_search、更新器等无关请求行为改变。
- 测试难以证明某个请求究竟使用了哪个 transport。
- 开关一个供应商的代理可能要求重启整个进程。

更窄的边界是：在 SDK client 构造时注入供应商专属 fetch。

```ts
const providerFetch = createProviderFetch(runtime.transport?.proxyUrl);

new OpenAI({
  apiKey: runtime.apiKey,
  baseURL: runtime.baseUrl,
  ...(providerFetch && { fetch: providerFetch }),
});
```

无代理时不传 fetch，让 SDK 保持默认行为；有代理时才注入由 `ProxyAgent` 驱动的 fetch。Anthropic SDK 复用同一边界，因此代理能力不依赖具体消息协议。

## 连接池的缓存键应是标准化代理 URL

连接池既不能按模型或 turn 创建，也不能全局只保留一个。合理缓存键是标准化后的代理 URL：

```text
http://127.0.0.1:7890
http://127.0.0.1:7890/
        ↓ normalize
http://127.0.0.1:7890/
```

同一 URL 复用 dispatcher，不同 URL 隔离；应用退出时统一 `close()` 并清空缓存，之后再请求必须创建新实例。

## 错误归一要能穿透 SDK 包装

自定义 fetch 抛出的错误往往会被 SDK 包成 `APIConnectionError`，原始错误位于多层 `cause` 中。因此只检查最外层 `instanceof ProviderProxyError` 不够，需要沿 cause 链做有界查找，再映射成稳定的 `LLMErrorKind: "proxy"`。

错误消息不能包含完整代理 URL。URL 可能带本地地址、端口，甚至误配置的认证信息。对外只保留类似“Provider proxy connection failed”的诊断，详细底层错误也不直接进入 session 或 renderer。

## 安全默认值

- 只接受 `http:` / `https:`。
- 首版拒绝 URL 中的 username/password，而不是尝试脱敏后继续使用。
- 代理开关是 provider runtime 字段，不写进全局 env。
- direct client 不注入 dispatcher；测试必须锁定这一点。
- provider adapter 只修饰 headers/request params，transport 只处理网络，两者不要合并成持有状态的大类。

来源：`docs/histories/2026-07/20260724-2222-multi-provider-llm.md`。
