# LLM domain group

LLM Service 只暴露 ActSpace 自有 Message、Stream、Failure、Usage 和 Prepared Call 契约。Provider SDK 类型只能留在 provider adapter 包内。

`llm-pi-ai` 的 SDK transport 将 HTTP 400 / 404 / 422 归类为 `invalid-request`（已有更具体的分类优先）。OpenRouter 的 `error.metadata.raw` 如为可解析 JSON 字符串或对象，只提取上游 `error.message` / `message` 与 code/type，经脱敏和长度限制后放入 Failure；不保存原始响应、请求头或路由元数据。无法解析时保留通用错误，不将原始文本写入 Journal。
