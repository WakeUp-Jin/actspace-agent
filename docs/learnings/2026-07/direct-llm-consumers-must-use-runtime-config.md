# Direct LLM Consumers Must Share Runtime Config

## 问题

一个桌面应用可能同时存在正常对话、上下文压缩、标题生成、评估、可视化等多条直接调用 LLM 的路径。只要其中一条仍从环境变量读取 Key，而其他路径已经迁移到 Settings / 系统密钥存储，就会出现同一模型在主对话可用、辅助功能却报“未配置”的割裂行为。

这次回复可视化的故障还叠加了第二层问题：LLM 服务把部分失败作为返回值表达（`stopReason=error`），调用方只等待 Promise 成功并提取文本，于是把空文本当成 HTML 成功缓存。后续普通点击持续命中空缓存，显式重新生成虽然绕过缓存，却仍重复使用错误的配置来源。

## 可迁移模式

### 1. 在可信边界解析 runtime，叶子模块只消费显式配置

Electron main 负责从 Settings 和系统密钥存储解析当前模型，得到完整 `LLMConfig` / `ProviderRuntimeConfig`；具体转换器只接收该配置，不自行读取 Settings、环境变量或 renderer 状态。

这样可以同时保证：

- renderer 永远拿不到明文 Key；
- 所有桌面 LLM 消费路径共享同一可用性和模型选择语义；
- CLI、CI、测试仍可保留独立的 env 入口；
- 单元测试可以注入显式配置和 fake converter，不依赖真实网络。

### 2. 先判定协议级结果，再解析业务内容

Promise fulfilled 不等于模型任务成功。调用方应先检查 `stopReason`、错误类型和截断状态，再提取内容：

1. `error` / `aborted`：保留 provider 错误并失败退出；
2. `length` / `toolUse` 等非完整结束：视为不可缓存结果；
3. `stop`：再解析 Markdown fence 和 HTML；
4. 最后校验业务不变量，例如 doctype、`<html>` 和闭合标签。

### 3. 缓存经过验证的产物，而不是调用返回值

缓存边界必须建立在“产物可用”之上。读取时也要再次执行轻量校验，让历史坏数据能够自动失效并被新结果覆盖。显式 regenerate 只负责绕过缓存，不能替代正确的模型配置与输出校验。

## 常见陷阱

- 为兼容旧调用临时把系统密钥写回 `process.env`，会扩大敏感信息的进程级暴露面。
- 只在 renderer 判断 `html.length > 0`，main 已经落盘的坏缓存仍会污染列表和后续请求。
- 只写 `try/catch`，无法捕获 error-as-value API。
- 把 turn 中全部 assistant block 拼起来，会把工具间旁白误当成最终回复；转换入口应复用界面已有的最终回复分段语义。

## 自检问题

- 新增的直接 LLM 消费者是否通过统一 runtime service 获取配置？
- LLM 客户端的错误是 throw、返回值，还是两者混合？
- 什么条件才算可缓存的完整产物？读取旧缓存时是否执行同样校验？
- “重新生成”是否既绕过缓存，也沿用正确的模型解析路径？
- 输入边界是否与用户实际点击和看到的内容一致？

相关修复记录：[`20260726-1108-fix-reply-visualization-runtime.md`](../../histories/2026-07/20260726-1108-fix-reply-visualization-runtime.md)。
