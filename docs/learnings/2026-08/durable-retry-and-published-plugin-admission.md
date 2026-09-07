# Durable Retry 与发布插件准入的两个边界

这次 v2 Runtime 重构暴露出两个容易混在一起的问题：模型请求失败后的重试，和插件运行时依赖是否真的可以进入生产。它们都需要“先记录事实，再改变状态”，但所有权不同。

## Durable retry 不属于 SDK

一次 `PreparedLlmCall` 只允许一次 dispatch。这样 Adapter 的 registration、credential resolution 和 retry policy 都能绑定到同一份 request snapshot，也不会让 SDK 在模型已经观察到部分 delta 后偷偷发第二次请求。

因此 retry 应该由 AgentLoop 持有：

1. 一次 wire attempt 失败后先记录 `llm/error`。
2. 只有没有产生可观察 delta、failure 可重试且 policy 仍允许时，记录 `llm/retry`。
3. checkpoint 通过后等待可取消的 backoff，再记录 `llm/retry-started`。
4. 用同一 registration 创建新的 one-shot PreparedCall。

如果失败发生在 stream 创建前，也必须进入相同路径。否则 credential、SDK public export 或网络初始化异常会绕过 Journal，重启时无法区分“没有发出请求”和“请求已开始”。

## 依赖准入不是版本字符串检查

插件框架的准入至少要检查：exact version、ESM、public exports、types、peer dependency 形状、family root 和禁止的 HMR/旧命名空间。只检查 `name@version` 会把不同安装树误判成同一 family。

本地 vendored 或 workspace 构建包可以证明 API/lifecycle 行为，但不能证明 registry tarball 的 integrity、peer resolution、packaged Electron 的单实例依赖树。因此本地 smoke 和生产制品 gate 必须分开记录，不能用软链替代 lockfile 证据。

## 可迁移的检查问题

- 一个失败是否在发生前已经产生了可观察副作用？如果是，不能自动重试。
- 一个“依赖通过”是否同时覆盖了安装来源、导出面和制品运行环境？如果没有，只能叫候选通过。
