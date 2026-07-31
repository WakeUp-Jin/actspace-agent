# DeepSeek OpenAI 思考强度迁移执行计划

## 目标

将 ActSpace 内置 DeepSeek 模型从 Anthropic Messages 主线切换到 OpenAI Chat Completions，并让 Thinking 只提供 `High` / `Max` 两档、默认显式使用 `Max`。DeepSeek provider 不再选择 Anthropic 路线，现有官方 `/anthropic` Base URL 配置安全迁移到 OpenAI 根地址。

## 范围

- 包含：
  - 内置 DeepSeek 模型与 provider 的 API 协议、默认 Base URL 和能力元数据。
  - DeepSeek OpenAI 请求的 `thinking.type` 与 `reasoning_effort` 映射。
  - Composer 的 High / Max 必选交互和默认 Max。
  - 旧官方 Anthropic Base URL 的设置迁移。
  - env、测试、设计文档、安全说明、发布记录和 history 同步。
- 不包含：
  - 删除通用 `AnthropicMessagesService`、跨协议历史消息转换或 Anthropic SDK 依赖。
  - 真实 DeepSeek 凭据调用与 Electron 人工验收。
  - 修改 Kimi、OpenRouter、DuckCoding 的既有 reasoning 策略。

## 背景

- 相关文档：
  - `docs/design-docs/model-context/agent-multi-provider-llm.md`
  - `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
  - `docs/SECURITY.md`
- 相关代码路径：
  - `packages/shared/src/model-config.ts`
  - `packages/shared/src/provider-config.ts`
  - `packages/agent-core/src/env.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/llm/provider-adapter.ts`
  - `packages/desktop/src/main/settings-service.ts`
  - `packages/desktop/src/renderer/components/Composer.tsx`
- 已知约束：
  - DeepSeek 官方 OpenAI 格式使用 `thinking.type=enabled|disabled` 和 `reasoning_effort=high|max`。
  - 产品决定不提供 Auto，默认必须显式落到 Max。
  - provider 差异留在模型能力和请求适配层，不能散落到 Agent loop。

## 风险

- 风险：历史设置若保存官方 `/anthropic` 地址，切协议后会把 OpenAI 请求发到错误路径。
- 缓解方式：仅对精确官方 Anthropic 地址做迁移；用户自定义网关地址保持不变。
- 风险：只改 Composer 会让 CLI、Kairos 或其他调用继续缺省 effort。
- 缓解方式：模型能力声明必选默认值，runtime 与 provider adapter 都提供 Max 防御性默认。
- 风险：切协议后历史 Anthropic 消息块无法续聊。
- 缓解方式：保留现有跨协议 `transform-messages`，并运行对应回归测试。

## 里程碑

1. 更新共享模型/provider 契约与设置迁移。
2. 更新 Agent Core OpenAI 请求参数和默认 effort 解析。
3. 更新 Composer High / Max 交互。
4. 更新测试与文档，完成自动化验证。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/agent-core exec vitest run <相关测试>`
  - `pnpm --filter @actspace/desktop exec vitest run <相关测试>`
  - `pnpm typecheck`
  - `pnpm check:docs`
  - `pnpm check:frontend-theme`
- 手工检查：不启动 Electron；Composer 交互由 Testing Library 验证只出现 High / Max 且默认 Max。
- 观测检查：请求构造测试断言 DeepSeek 开启、关闭和缺省场景的最终请求体。

## 进度记录

- [x] 确认官方参数、现有 Anthropic 主线和产品决策。
- [x] 完成共享契约、OpenAI 路由与旧地址迁移。
- [x] 完成请求映射和 Composer 交互。
- [x] 完成测试、文档和 history。
- [x] 完成自动化验证并归档计划。

## 决策记录

- 2026-07-31：DeepSeek 不再使用 Anthropic 主线；内置模型与 provider 只选择 OpenAI Chat Completions。
- 2026-07-31：Composer 不显示 Auto，原生强度只提供 High / Max，默认显式发送 Max。
- 2026-07-31：保留通用 Anthropic 协议基础设施，避免把 provider 路由迁移扩大成无关的协议层删除。

## 完成记录

- `pnpm --filter @actspace/shared build` 通过。
- `pnpm --filter @actspace/shared test` 通过（65 tests）。
- Agent Core 定向测试通过（66 tests）。
- Desktop main / renderer 定向测试通过（101 tests）。
- `pnpm typecheck`、`pnpm check:docs`、`pnpm check:frontend-theme` 和 `git diff --check` 通过。
- 未执行真实 DeepSeek 凭据调用或 Electron 人工验收，符合本计划验证边界。
