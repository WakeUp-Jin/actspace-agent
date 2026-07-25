# Plan 4：任务模型与运行时消费方迁移

状态：已完成（2026-07-25）

依赖：Plan 0-3

产物消费方：Plan 5-6

## 目标

让主会话、utility、Explore、Kairos 以及所有依赖模型元数据的 main/agent-core 路径消费统一 ModelSnapshot 和 purpose resolver，移除标题、摘要、Explore、Kairos 对 DeepSeek 或静态 allowlist 的隐藏绑定，并完成 desktop 从 env LLM key 装配到显式 provider runtime 的迁移。

## 附加必读

- `docs/design-docs/model-context/agent-context-compression.md`
- `docs/design-docs/collaboration/agent-explore-subagent.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/context-compact.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`

## 允许修改的文件

- `packages/desktop/src/main/model-runtime-service.ts`（新增）
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/context-compact.ts`
- `packages/desktop/src/main/context-describe-service.ts`
- `packages/desktop/src/main/eval-candidate-service.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/session-preview-service.ts`
- `packages/desktop/src/main/index.ts`
- 对应 main tests
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/tools/agent/runner.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/session-title.ts`
- `packages/agent-core/src/visualize/md-to-html.ts`
- 对应 agent-core tests
- `packages/agent-core/src/persistence/usage-statistics.ts`
- 对应设计文档和 history

不得修改 renderer 视觉；Plan 5 负责 UI。

## 运行时装配

`ModelRuntimeService` 由 main 持有，依赖 SettingsService + ModelStoreService，提供：

```ts
listUsableModels(purpose): UsableModel[]
resolveMainModel(requestedKey?): ResolvedRuntimeModel
resolveUtilityModel(mainModel): TaskModelResolution
resolveExploreModel(mainModel): TaskModelResolution
resolveKairosModel(): TaskModelResolution
```

`ResolvedRuntimeModel` 包含：

- ModelDefinition。
- ProviderRuntimeConfig（含明文 key，只在 main/agent-core 内存边界）。
- 由 Plan 1 构造出的 LLMConfig。
- 选择来源和 fallback 原因。

不得把该对象通过 IPC 返回 renderer。

## 任务清单

### 4.1 主会话真实 turn

- 新 renderer 只发送 provider-qualified `modelKey`；main 的兼容边界优先读取 modelKey，否则 normalize 旧 `model` 字段，未知 legacy/string 明确拒绝。
- main 在调用 `runAndPersistTurn` 前解析 chat purpose 和 provider runtime。
- `buildAgentConfig()` 接收显式 main/utility/explore runtime，而不是在内部重新读 desktop env。
- active session 中用户选择的模型只影响后续 turn，历史事件保留原 ModelKey。
- requested model 不可用时拒绝本次 turn，并返回可展示的 `model_unavailable`，不回落其他 provider。

### 4.2 utility 模型贯通

- `AgentDeps` 只创建一个 utility LLM 实例，供 title 与 summarizer 复用。
- `createSummarizerForAgent()` 不再固定 DeepSeek Flash，改为消费已解析 utility/main LLM。
- `createTitlerLLMService()` 删除固定模型构造职责；`maybeGenerateSessionTitle` 使用本轮 deps 的 utility LLM。
- 自动压缩、手动 `context:compact`、工具输出摘要使用相同 utility 解析结果。
- utility 不可用时复用当前 main LLM，并记录 `fallback: utility_to_main`；main 也不可用时沿用现有确定性截断/丢弃逻辑。
- utility provider 的 usage 继续写独立 LLM usage，不并入主模型伪装。

### 4.3 Explore 模型

- `createExploreLLMService()` 改为接收已解析 runtime，不读取 `MODEL_REGISTRY`。
- Explore 配置不可用时回退当前 main LLM，并向 agent run log 写脱敏 fallback 原因。
- tools runner 不维护 provider/model allowlist。
- Explore 的 toolUse capability 必须由 resolver 通过后才能运行。

### 4.4 Kairos 模型

- 删除 `packages/agent-core/src/kairos/env.ts` 及其静态 allowlist；thinking mode 直接依据动态 ModelDefinition capability 解析。
- Kairos 以 provider-qualified ModelKey 继续由 Kairos 设置分区持有，候选和 runtime 使用 `purpose: kairos`。
- provider/key/base URL/proxy/model enabled 任一变化时，main 在空闲态重建 Kairos controller。
- Kairos 选中模型不可用时不回落 DeepSeek Flash：停止启动或暂停 tick，状态包含 `model_unavailable` 和 ModelKey。
- Kairos contextWindow 从动态 ModelDefinition 获取。
- Kairos ToolManager 的 primaryProvider/apiFormat 与实际 runtime 完全一致。

### 4.5 其他静态模型消费方

逐一迁移并加回归测试：

- `context-describe-service.ts`：使用当前会话 ModelDefinition，不重新选择 provider。
- `eval-candidate-service.ts`：显式解析请求 ModelKey。
- `visualize/md-to-html.ts`：使用请求主模型或调用方明确传入的 chat 模型。
- `session-preview-service.ts`：新 ModelKey 查动态 snapshot，旧 ModelId 走 legacy map。
- Usage statistics：优先读取事件中的 label/provider/ModelKey 快照，动态 registry 不存在时仍可展示保存字符串。
- adapter/tests 中只为 fixture 使用 legacy IDs，不让生产 API 收窄。

### 4.6 desktop env 双真源收口

- 所有 desktop LLM 消费方迁移到 ModelRuntimeService 后，SettingsService 停止把 DeepSeek/Kimi LLM keys 回写 process.env。
- 搜索 provider key、工具配置和其他仍由 env proxy 消费的设置维持现状。
- CLI、CI、agent-core 单测继续通过 `resolveAgentEnvConfig()` 构造 provider runtime。
- 增加回归测试：系统 env 中存在旧 key、UI 已断开时，desktop turn 不得继续使用旧 key。
- DeepSeek/Kimi 余额查询同样只消费 SettingsService 提供的显式 ProviderRuntimeConfig，并复用对应供应商的代理 transport，不再旁路读取 env。

## 测试要求

- main model 可用/断开/disabled/capability mismatch。
- utility 正常使用、utility → main fallback、main 也不可用的确定性 fallback。
- title、tool summary、自动 compact、手动 compact 使用同一个 utility ModelKey。
- Explore 正常使用与 Explore → main fallback。
- Kairos 可用、断开后 blocked、重新连接后空闲态重建恢复。
- provider 代理变化后新 LLM 实例使用新 transport，旧实例在重建后释放。
- dynamic ModelKey 在 session preview、usage、context snapshot 中往返。
- 旧 session ModelId 仍能恢复和展示。
- desktop 不再从旧 process.env 取 UI 已断开的 LLM key。

## 验证命令

```bash
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
```

## 完成标准

- 主会话、utility、Explore、Kairos 全部通过统一 resolver 和显式 runtime 装配。
- 标题、摘要和压缩不再固定 DeepSeek Flash。
- Kairos 不再维护静态模型 allowlist，也不静默切换 provider。
- desktop LLM key 不再依赖 process.env 双真源。
- 历史 session/usage 和新 ModelKey 都能稳定恢复、展示和计费。

## 决策记录

- 2026-07-24：utility LLM 在一轮 Agent deps 中复用，不为标题和压缩分别创建 client。
- 2026-07-24：Explore 不可用时允许回退用户当前主模型；Kairos 自主运行不允许静默 fallback。
- 2026-07-24：只有 desktop 停止 LLM env 注入，CLI/CI 保留 env runtime adapter。
