# 模型输入能力与图片路由收口

## 用户诉求

希望模型定义显式表达是否支持图片输入：`input: ["text"] | ["text", "image"]`。不再保留 `analyze_media` 这种隐藏 Kimi 视觉兜底；主模型不支持图片时直接说明不支持，引导切换到支持图片的模型。

## 主要改动

- DeepSeek 两档模型的 `input` 从 `["text", "image"]` 修正为 `["text"]`；Kimi K2.6 与 Kimi K2.7 Code 都声明 `["text", "image"]`。
- 删除 `analyze_media` 工具、Kimi media helper、Kimi media prompt，以及 main 进程的图片预分析链路。
- 用户 turn 输入增加最小 `<runtime_model>` 后缀，只包含 `model_id` 与 `input`；Browser Bridge 提示片段负责说明 Browser Use / Computer Use 如何根据 `input` 选择截图或结构化 DOM/accessibility 状态。
- 图片附件按模型能力路由：支持 `image` 的模型在本轮请求中接收结构化 image content part；text-only 模型只接收附件元信息和“不做视觉判断”的提示。
- session 持久化继续只保存用户原文和附件元信息，不保存 base64 图片，也不再保存 `attachmentAnalyses`。

## 设计动机

多模态能力应由模型元数据显式驱动，而不是由工具系统偷偷调用另一个模型补齐。这样某个模型支持图片时，只需要把对应模型的 `input` 标对并验证 provider 协议即可启用图片输入；Kimi K2.7 Code 曾因漏标 `image` 被误提示为 text-only，本次一并修正。

## 受影响文件

- `packages/shared/src/model-config.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
