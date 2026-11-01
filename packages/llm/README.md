---
description: "模型服务契约和提供商适配：ActSpace 自有的消息、流、失败、用量，以及 pi-ai 适配器。"
kind: "package-group"
---

# llm

`llm-service` 只暴露 ActSpace 自有的 Message、Stream、Failure、Usage 和 Prepared Call 契约；提供商 SDK 的类型只能留在适配器包内。适配器可以换，上层（Agent 循环、压缩、自动审批、看图片）只认 `llm-service`。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `llm-service` | 接口 | 全局 | 开 | 路由注册表、凭据端口、重试策略、模型目录、辅助请求和用量计费；提供 `llm.service`、`llm.routes`；同时挂在 Host 和每个 Harness 里 |
| `llm-pi-ai` | 实现 | 不在默认组合 | — | 基于 pi-ai 的适配器（`PiAiAdapter`），含 DeepSeek 文件与图片、Anthropic 缓存、传输失败归类；由桌面端和远程 Host 直接构造适配器 |

## 包之间怎么连

- `llm-service` inject Host 端口 `actspace.host.llm`（`credentials` 凭据解析 + `routes` 路由注册）。Host 把适配器当作路由注册进来，`llm-service` 按路由选适配器并发起调用。
- `llm-pi-ai` 依赖 `llm-service` 的 `LlmAdapter` 接口，实现 `dispatch`；它自己的插件入口只发布 `llm.route.pi-ai`，真正的适配器由桌面端（`apps/desktop`）和 `host/agent-host` 构造后注册，`core/runtime` 重新导出 `PiAiAdapter` 供应用使用。
- 使用方 inject `llm.service`：`agent-factory`（Agent 循环）、`compaction-runtime`、`auto-review`、`image-inspection`、`desktop-app`。

## 关于错误归类

`llm-pi-ai` 的 SDK transport 将 HTTP 400 / 404 / 422 归类为 `invalid-request`（已有更具体的分类优先）。OpenRouter 的 `error.metadata.raw` 如为可解析 JSON 字符串或对象，只提取上游 `error.message` / `message` 与 code/type，经脱敏和长度限制后放入 Failure；不保存原始响应、请求头或路由元数据。无法解析时保留通用错误，不将原始文本写入 Journal。

## 入口与测试

- `llm-service/src/service.ts`、`route-registry.ts`、`adapter.ts`（适配器接口）、`credential-port.ts`、`retry-policy.ts`、`usage-cost.ts`；`llm-pi-ai/src/pi-ai-adapter.ts`、`pi-ai-stream.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/llm-service test`、`pnpm --filter @actspace/llm-pi-ai test`。

## 怎么扩展

新增一个模型提供商适配：新建 `llm/llm-<名>`，实现 `llm-service` 的 `LlmAdapter`；由 Host 把它作为 `LlmRouteRegistration` 放进 `actspace.host.llm` 的 `routes`。提供商 SDK 类型不要漏到包外。通用步骤见[总地图](../README.md)。
