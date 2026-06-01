# actspace 的 pi 风格 LLM 契约对齐与 Kimi 公共入口收口计划

## 目标

把 actspace 的 LLM 相关契约收敛到更接近 pi 的三层结构：模型元数据明确区分 `api` 与 `provider`，LLM service 按 `api` 分成 `AnthropicMessagesService` / `OpenAICompletionsService` 两条协议线，消息转换抽出独立的通用预处理层，模型注册表支持 public/internal 可见性；同时收口前端公开模型选择，仅保留 DeepSeek `flash` / `pro` 给用户，Kimi 继续作为内部工具能力使用。

## 范围

- 包含：
  - 扩展 `packages/shared/src/model-config.ts` 的模型元数据结构，让模型定义更接近 pi 的 `Model` 语义。
  - 调整 `packages/agent-core/src/llm/` 的 service 分层，让实现按 `api` 组织，而不是按品牌组织。
  - 在 `packages/agent-core/src/messages.ts`、`packages/agent-core/src/llm/types.ts`、`packages/agent-core/src/llm/convert.ts`、`packages/agent-core/src/llm/anthropic-convert.ts` 中整理消息与协议边界，补齐更明确的来源信息与预处理分层。
  - 新增或抽出 `transformMessages` 级别的通用消息预处理层，统一承接图片降级、thinking 降级、tool call id 规范化、孤儿 tool result 修复、错误/中止消息过滤。
  - 让前端公开模型选择只展示 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro`，不再提供 Kimi 选项。
  - 保留 Kimi 的内部能力入口，继续供 `web_search`、`analyze_media` 等内部工具使用。
  - 为历史设置里仍然存在的 Kimi 选择提供兼容处理，避免旧配置直接失效。
  - 补充相关测试、设计文档同步和 history 记录。
- 不包含：
  - 不重做模型切换体验，不新增更复杂的模型路由 UI。
  - 不移除 `KimiService`、Kimi assistant helper 或内部 Kimi 工具链。
  - 不把 Kimi 的 builtin 能力硬塞进通用 LLM service 协议层，特殊能力仍保留独立 helper。
  - 不改上下文压缩、工具权限调度、Kairos 运行循环等与该契约无直接关系的部分。
  - 不在这一轮扩展新的 provider 能力，只做现有 DeepSeek / Kimi 路线的结构收口。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/agent-backend-design.md`
  - `docs/design-docs/agent-current-module-map.md`
  - `docs/design-docs/agent-token-usage-and-context-state.md`
  - `/Users/wakeup-jin/Desktop/code-project/back-code/pi-project/docs/pi-ai-type-system.md`
  - `/Users/wakeup-jin/Desktop/code-project/back-code/pi-project/docs/pi-ai-message-architecture.md`
  - `/Users/wakeup-jin/Desktop/code-project/back-code/pi-project/docs/pi-ai-transform-messages.md`
  - `/Users/wakeup-jin/Desktop/code-project/back-code/pi-project/docs/pi-ai-types-reference.ts`
- 相关代码路径：
  - `packages/shared/src/model-config.ts`
  - `packages/shared/src/ipc.ts`
  - `packages/shared/src/settings.ts`
  - `packages/agent-core/src/messages.ts`
  - `packages/agent-core/src/llm/types.ts`
  - `packages/agent-core/src/llm/convert.ts`
  - `packages/agent-core/src/llm/anthropic-convert.ts`
  - `packages/agent-core/src/llm/factory.ts`
  - `packages/agent-core/src/llm/services/openai-completions.ts`
  - `packages/agent-core/src/llm/services/deepseek.ts`
  - `packages/agent-core/src/llm/services/deepseek-anthropic.ts`
  - `packages/agent-core/src/llm/services/kimi.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/tools/exposure.ts`
  - `packages/agent-core/src/tools/index.ts`
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
  - `packages/desktop/src/main/settings-service.ts`
  - `packages/desktop/src/main/kairos-bootstrap.ts`
- 已知约束：
  - 公开 UI 只需要支持 DeepSeek `flash` / `pro` 的切换。
  - Kimi 仍然要能被内部工具链调用，不能因为隐藏 UI 而让工具能力断掉。
  - 旧 settings / session 中可能仍保存 Kimi id，读取时必须可回退或兼容。
  - 新契约要保持对现有 session 回放和工具结果链路的兼容性。
  - `KimiService` 作为品牌服务可以保留，但普通对话协议层应跟随 `api` 组织，避免以后继续按品牌扩展出更多重复适配器。

## 风险

- 风险：历史设置里保存的 `kimi-k2.6` 在前端隐藏后看起来“消失”，可能让用户误以为数据丢失。
  - 缓解方式：把 Kimi 作为 internal-only 继续保留在解析层，公开选择器只过滤展示；必要时对旧配置提供明确 fallback。
- 风险：抽出通用 `transformMessages` 后，消息回放规则改变，可能影响 tool call / tool result 配对。
  - 缓解方式：先用测试锁定现有行为，再把图片降级、thinking 降级、orphan tool repair 逐项迁入。
- 风险：模型元数据扩充后，前端和 main 进程可能出现“公开列表”和“内部解析”两个口径。
  - 缓解方式：把 public/internal 可见性做成单一字段或单一派生规则，避免多个地方各自过滤。
- 风险：Kimi 作为内部工具仍需自己的模型配置，不应被“隐藏 UI”误伤。
  - 缓解方式：内部 helper 使用独立入口或 internal registry，不依赖 Composer 的 public model list。

## 里程碑

1. 收敛模型契约。
   - 让 shared 层的模型定义更接近 pi，明确 `api` 与 `provider` 的分工。
   - 定义 public/internal 可见性，确保前端公开模型列表只剩 DeepSeek `flash` / `pro`。
2. 按 `api` 拆分 LLM service。
   - 让 `AnthropicMessagesService` / `OpenAICompletionsService` 成为真正的协议实现层。
   - 让 DeepSeek / Kimi 只承担 provider/model preset 与认证配置，不再承载协议转换职责。
3. 抽出统一消息预处理层。
   - 把跨 provider 的消息兼容逻辑集中到一个可复用层，供 OpenAI / Anthropic 路线共用。
   - 保持现有消息回放、tool call 和 error handling 行为可测。
4. 收口前端和 settings。
   - Composer 和 Settings 不再提供 Kimi 切换入口。
   - 旧配置能安全回退到可见模型，不阻断启动和 turn 执行。
5. 验证、同步文档与收尾。
   - 跑完类型检查和相关测试。
   - 补齐 history，并在必要时同步设计文档。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared typecheck`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm typecheck`
- 手工检查：
  - Composer 的模型菜单只展示 DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro`。
  - Settings 页面不再提供 Kimi 作为公开默认模型选项。
  - 旧 settings 中若残留 Kimi id，应用仍能启动，且不会在公开 UI 中暴露出 Kimi 选择。
  - Kimi 相关内部工具仍能正常触发 Kimi assistant 路线。
- 观测检查：
  - 关键消息转换路径上能看到统一预处理层生效，且没有破坏 tool call / tool result 的配对关系。

## 进度记录

- [ ] 确认模型契约收口范围。
- [ ] 完成通用消息预处理层设计与接入。
- [ ] 完成前端公开模型收口与旧配置兼容。
- [ ] 完成测试、文档和 history 同步。

## 决策记录

- 2026-06-01：先对齐 `api/provider`、统一消息预处理和模型元数据三处基础契约，再收口前端 Kimi 入口；原因是这三处决定后续所有 provider 和上下文行为的稳定边界。
- 2026-06-01：Kimi 暂停公开切换，但保留为内部工具能力；原因是它当前仍承担辅助搜索与多模态子能力，不应因为 UI 收口而丢失工具链能力。
- 2026-06-02：确认 service 层按 `api` 组织更贴近 pi；原因是 `provider` 负责端点和认证，`api` 负责协议转换，把两者混在同一层会让适配器越来越像品牌分发器。
