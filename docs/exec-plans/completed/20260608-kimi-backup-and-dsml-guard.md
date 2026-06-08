# Kimi 备用模型接入 + DeepSeek DSML 泄漏兜底 执行计划

## 状态

- 阶段：completed（2026-06-08 全部 Phase 0–4 落地，含单测与文档同步）
- 触发背景：session `session-mpvwikcx-eo6dik` turn-5 出现 DeepSeek 联网搜索导致的裸 DSML 泄漏；DeepSeek 近期不稳定（"降智"），需要 Kimi 作为可选备用主模型。
- 关键决策（用户确认）：
  - 本轮只产出本 plan，不改代码。
  - 任务1 DSML 兜底采用「检测到即当一次可重试错误，不把裸 DSML 当正文」。
  - Kimi 作为公开主模型时，暴露 Kimi 内置 `$web_search` 作为该模型的联网搜索能力。

## 目标

让用户可以在聊天框、Explore 子代理、Kairos 三处把 Kimi（`kimi-k2.6`）作为可选模型；当 DeepSeek 在 Anthropic 路线下把原生 DSML tool-call 特殊 token 泄漏成正文时，系统识别并按可重试错误处理而非展示垃圾；同时在 Usage 页为 Kimi 增加独立余额卡。整个过程不破坏现有 DeepSeek 默认路线与 Kimi 内部 helper 能力。

## 范围

- 包含：
  - Phase 0：DSML 泄漏检测兜底（最高优先，独立可交付）。
  - Phase 1：把 `kimi-k2.6` 提升为 public 主模型 + 补 pricing，进入聊天框模型选择器。
  - Phase 2：Kimi 作为主模型时的联网搜索能力（暴露 Kimi 内置 `$web_search`）。
  - Phase 3：Explore 子代理 + Kairos 设置页放出 Kimi 选项（默认仍 flash，UI 标注成本）。
  - Phase 4：Usage 页 Kimi 余额卡（泛化 provider 余额）。
  - 各 phase 的单测、设计文档与 history 同步。
- 不包含：
  - 不改 DeepSeek 默认走 Anthropic route 的现状。
  - 不删除 `DeepSeekService` / `KimiService` / `DeepSeekAnthropicService` 兼容包装层。
  - 不引入第三个真实 provider。
  - 不做通用 Capability Router；工具暴露继续用 `shouldExposeTool` 轻量判断。
  - 不重写 Usage 统计聚合逻辑，只新增 Kimi 余额卡。

## 背景

- 必读文档（新会话/子 Agent 先读）：
  - `AGENTS.md`
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/agent-deepseek-kimi-hybrid-capabilities.md`（双模型能力事实来源）
  - `docs/design-docs/agent-current-module-map.md`
  - `docs/design-docs/agent-kairos-autonomous-mode.md`
  - `docs/SECURITY.md`
  - `docs/PLANS_GUIDE.md`
- 相关代码路径：
  - 模型注册表：`packages/shared/src/model-config.ts`
  - 设置契约：`packages/shared/src/settings.ts`
  - Anthropic 协议流处理：`packages/agent-core/src/llm/anthropic-convert.ts`
  - Anthropic service：`packages/agent-core/src/llm/services/anthropic-messages.ts`
  - 工具暴露：`packages/agent-core/src/tools/exposure.ts`、`packages/agent-core/src/tools/types.ts`
  - Kimi 内置搜索 helper：`packages/agent-core/src/llm/services/kimi.ts`、`packages/agent-core/src/llm/kimi-assistants.ts`
  - web_search 工具：`packages/agent-core/src/tools/tools/web-search/`
  - Explore 模型解析：`packages/agent-core/src/engine/create-agent-deps.ts`（`createExploreLLMService`）
  - Explore runner：`packages/agent-core/src/tools/tools/agent/runner.ts`
  - Kairos 模型与 env：`packages/agent-core/src/kairos/env.ts`、`packages/desktop/src/main/kairos-bootstrap.ts`
  - 设置 UI：`packages/desktop/src/renderer/components/settings/SettingsPage.tsx`、`KairosSettings.tsx`
  - 聊天框模型选择：`packages/desktop/src/renderer/components/Composer.tsx`（消费 `MODEL_LIST`）
  - 余额后端：`packages/desktop/src/main/index.ts`（`getDeepSeekBalanceSnapshot` / `deepseek:balance:get`）
  - 余额前端：`packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`（`DeepSeekBalanceCard`）
  - 余额契约：`packages/shared/src/ipc.ts`（`DeepSeekBalanceSnapshot`）
- 已知约束：
  - API Key 只在 main/agent-core 运行时读取，绝不进入 renderer、session 事件或日志。
  - `ContextManager` 输出 provider-neutral `Context`，协议差异只在 LLM adapter 层。
  - 跨 provider 历史回放已由 `packages/agent-core/src/llm/transform-messages.ts` 处理（thinking 降级为 text、删 thoughtSignature、tool call id 规范化、孤儿 tool result 兜底），切换 DeepSeek↔Kimi 不应导致协议崩溃。
  - Kimi `kimi-k2.6` 现为 `visibility: "internal"`，被 `MODEL_LIST` 过滤；`reasoning: false`、`thinkingDefault: false`。

## 复现与根因（Phase 0 依据）

- 复现日志：`<userData>/logs/agent-runs/20260608-115402-session-mpvwikcx-eo6dik-turn-1780890842411-5.jsonl`
- 现象：`message_end.summary` 中 `serverToolUse.webSearchRequests: 2`，但 `toolCallCount: 0`、`toolCalls: []`、`stopReason: "stop"`；assistant 正文为裸 `<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="web_search">...`。
- 根因：DeepSeek Anthropic 网关在触发 server `web_search_20250305` 时，未把模型原生 DSML tool-call 序列化成结构化 `server_tool_use`/`tool_use` block，而是当作 `text_delta` 吐出；`processAnthropicStream`（`anthropic-convert.ts:447`）无条件把 `text_delta` 累进 `acc.textParts`，最终落库展示。
- 结论：DeepSeek 侧不稳定问题，我们这边缺检测兜底。只在走 server web_search 时暴露，与"网络搜索导致"现象一致。

## Phase 0：DSML 泄漏检测兜底（独立可交付，最高优先）

目标：检测到 assistant 文本含 DeepSeek DSML tool-call 标记时，不再把它当正文落库/展示，而是产出一次可重试的 `LLMServiceError`，交给现有错误链路（error assistant message + 后续可重试）。

1. 在 `packages/agent-core/src/llm/anthropic-convert.ts` 新增导出纯函数 `detectLeakedDsmlToolCalls(text: string): boolean`：
   - 命中条件（任一）：包含子串 `｜｜DSML｜｜tool_calls`，或同时包含 `｜｜DSML｜｜invoke` 与 `name=`。
   - 使用全角字符 `｜`（U+FF5C）匹配，不做正则贪婪匹配，保持纯字符串 `includes`，避免误伤正常英文 `DSML` 文本。
2. 在 `buildAnthropicAssistantMessage(acc, config, providerName)` 中（`anthropic-convert.ts:548`）：
   - 组装 content 后，若 `acc.toolCalls.size === 0` 且 `detectLeakedDsmlToolCalls(acc.textParts.join(""))` 为真，则不返回正常 `done` 消息，而是返回一个 `stopReason: "error"` 的 AssistantMessage，`errorMessage` 设为固定文案（如 `"DeepSeek 返回了未解析的工具调用标记（DSML leak），已按可重试错误处理。"`）。
   - 为避免破坏函数语义，优先在 `AnthropicMessagesService._stream`（`anthropic-messages.ts:124`）的 `yield { type: "done", ... }` 之前判断：若检测到泄漏，改 `yield { type: "error", message: buildAnthropicErrorMessage(acc, ..., new LLMServiceError("DSML leak", "server_error", true)) }`。二选一实现，决策记录里写明最终选址。
3. 错误分类用 `LLMServiceError(message, "server_error", true)`（`retryable: true`），让上层判定为可重试。
4. 安全：错误文案与日志不得包含裸 DSML 原文，只记录布尔命中与 provider/model；遵循 `docs/SECURITY.md`「日志不能记录未裁剪网页全文/原始 payload」精神。
5. 单测（新增 `packages/agent-core/src/llm/test/anthropic-dsml-guard.test.ts`）：
   - `detectLeakedDsmlToolCalls` 对真实泄漏样本返回 true，对普通含 "DSML" 词的英文返回 false。
   - 构造 fake Anthropic stream（只发 `text_delta` 输出裸 DSML、不发 `tool_use` block），断言 service 产出 `stopReason: "error"`、`retryable` 为真、且 message 不含原始 DSML（或仅在 errorMessage 固定文案中）。
   - 正常 `tool_use` block 流不受影响，仍 `stopReason: "toolUse"`。

验收命令：
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core test`

回退策略：Phase 0 仅在 Anthropic build/done 边界加一处分支；如误伤正常输出，删除该分支即可恢复旧行为，不影响其它 phase。

## Phase 1：Kimi 提升为公开主模型

依赖：无（可与 Phase 0 并行，但建议 Phase 0 先合）。

1. `packages/shared/src/model-config.ts`：
   - 把 `kimi-k2.6` 的 `visibility` 从 `"internal"` 改为 `"public"`。
   - 补 `pricing`（按 Moonshot 官网 `kimi-k2.6` 价目填，单位与 currency 与 DeepSeek 卡保持一致；若官网为 CNY/百万 token 则 `currency: "CNY"`）。具体数值在实现时以官网为准并写进决策记录，不留占位。
   - 确认 `MODEL_LIST`（filter `visibility === "public"`）会自动包含 Kimi，`isPublicModelId("kimi-k2.6")` 返回 true。
2. 校验下游消费方：
   - `Composer.tsx` 模型菜单（`MODEL_LIST`）出现 Kimi。
   - `SettingsUpdateInput.defaultModelId` 允许 `kimi-k2.6`（类型为 `ModelId | null`，已兼容）。
   - Usage 页 `resolveRequestModelLabel` / `MODEL_REGISTRY` 能正确显示 Kimi label（已兼容）。
3. thinking 行为：Kimi `supportsThinkingToggle: true` 但 `reasoning: false`；确认 Composer 思考开关切到 Kimi 时不报错。若 Kimi service 不支持 thinking 参数，由 `OpenAICompletionsService` 在请求构造时按模型能力忽略。实现时验证一次真实切换。
4. 单测：
   - `packages/shared` 增/改测试断言 `MODEL_LIST` 含 `kimi-k2.6`、`isPublicModelId("kimi-k2.6") === true`。
   - 既有 `kimi-service.test.ts` 不回归。

验收命令：
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/shared test`
- `pnpm --filter @actspace/agent-core test`

回退策略：把 `visibility` 改回 `"internal"` 即从所有公开选择器移除 Kimi，不影响内部 helper。

## Phase 2：Kimi 主模型的联网搜索（provider-native builtin，不走本地工具）

依赖：Phase 1。

设计要点（已按文档修正）：Kimi 的联网搜索是**供应商原生能力**，靠内置 `builtin_function.$web_search`，应与 DeepSeek Anthropic server `web_search_20250305` 对称——**由 LLM service 在请求层管理，不注册成 ToolManager 工具、不出现在 agent loop / 工具事件里**。绝不采用"暴露本地 `web_search` 工具 → executor 再调一次 Kimi"的 Kimi-调-Kimi 方案（浪费、且违背 `agent-deepseek-kimi-hybrid-capabilities.md`「Kimi 原生 `$web_search` 不进入普通 ToolManager」原则）。

Kimi `$web_search` 协议（来源：platform.kimi.ai/docs/guide/use-web-search）：
- 在 `tools` 声明 `{ type: "builtin_function", function: { name: "$web_search" } }`，无需 JSON Schema 参数。
- 使用 `$web_search` 时必须 `thinking: { type: "disabled" }`。
- 返回 `finish_reason=tool_calls` 且 `tool_call.function.name="$web_search"` 时，调用方**只需把 `tool_call.function.arguments` 原样**作为 `role:tool` 消息（带 `tool_call_id` + `name`）回填，模型在下一次请求里真正执行搜索并返回 `finish_reason=stop` 的最终回答。
- 搜索结果计入下一次的 `prompt_tokens`；每次成功触发计费 $0.005。
- 既有 `packages/agent-core/src/llm/kimi-assistants.ts` 的 `searchWithKimi` 已正确实现这套回填循环，可作为下沉到主链路的参考实现。

实现步骤：

1. 在 Kimi 主模型链路里声明 builtin `$web_search`（默认开启）：
   - 入口：`packages/agent-core/src/llm/services/openai-completions.ts`（KimiService 继承自它）。
   - 当 `config.provider === "kimi"`（主模型为 Kimi）时，在请求 `tools` 中追加 `{ type: "builtin_function", function: { name: "$web_search" } }`，并强制 `thinking: { type: "disabled" }`。
   - builtin tool 与本地 ToolManager 工具（`read_file`/`grep`/…）可共存（文档明确支持 `builtin_function` 与 `function` 混用），所以 Kimi 主模型仍能用本地文件工具。
2. 在 service 内部透明处理 `$web_search` 回填循环（关键）：
   - `stream()` 单次调用内：若收到 `finish_reason=tool_calls` 且仅含 `$web_search`，则**在 service 内部**自动 append assistant(tool_calls) + 原样回填 `role:tool` 参数，再发起后续请求，直到 `finish_reason=stop`，把最终文本作为这一个 assistant turn 返回给 agent loop。
   - 若同一轮里既有 `$web_search` 又有本地工具调用（普通 `function`），则：`$web_search` 在 service 内部消化，本地工具调用照常 yield 给 agent loop 执行。需要明确区分 `name` 以 `$` 开头的 builtin tool 与普通工具。
   - 跨内部往返累加 usage（`prompt_tokens` 含搜索结果），保证 Usage 页统计正确。
3. 观测对称：把 Kimi `$web_search` 的触发次数记入 usage metadata 的 `serverToolUse.webSearchRequests`（与 DeepSeek server 搜索同一字段），让 Usage/run-log 统计一致；不把它当本地 `toolCallCount`，不写裸搜索结果原文到日志。
4. **不**在 ToolManager 为 Kimi 注册本地 `web_search` 工具；`exposure.ts` 不新增 kimi 分支。DeepSeek 两条路线维持现状（openai route 仍用本地 Kimi-backed `web_search`，anthropic route 仍用 server tool）。
5. 单测：
   - 扩展 `packages/agent-core/src/llm/test/kimi-service.test.ts` 或新增 `openai-completions-web-search.test.ts`：fake client 先返回 `finish_reason=tool_calls`($web_search) 再返回 `finish_reason=stop`，断言 service 自动回填 arguments、最终返回 stop 文本、usage 累加、且不向 agent loop emit `$web_search` 工具事件。
   - 断言 Kimi 主模型请求里 `tools` 含 builtin `$web_search` 且 `thinking=disabled`。
   - 断言本地 ToolManager 未为 Kimi 注册 `web_search`（exposure 测试不变即可）。
6. 更新 `docs/design-docs/agent-deepseek-kimi-hybrid-capabilities.md`：
   - 新增「Kimi 作为公开主模型时，联网搜索由 provider-native `$web_search` builtin 在 LLM service 内部管理，不进入 ToolManager」一节。
   - 把旧非目标「不重新开放 Kimi 作为公开主模型」修订为历史决策，并补本轮新决策。

验收命令：
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core test`

回退策略：在 service 内对 `config.provider === "kimi"` 的 builtin 声明加一个开关（默认开），关掉即退回"Kimi 主模型无联网搜索"，不影响 DeepSeek 两条路线和 Kimi 内部 helper。

## Phase 3：Explore 子代理 + Kairos 放出 Kimi 选项

依赖：Phase 1（需要 Kimi 为可选模型项）。

后端现状：`createExploreLLMService(exploreModelId)`（`create-agent-deps.ts:224`）已支持任意 `ModelId`，含 `provider === "kimi"` 的 key 检查；Explore 后端无需大改。Kairos `KairosModelId` 当前被收窄成只 `deepseek-v4-pro`，需扩展。

1. Explore（默认仍 flash）：
   - `packages/shared/src/settings.ts` 的 `AgentSettings.exploreModelId: ModelId | null` 类型已开放，无需改类型。
   - `SettingsPage.tsx` 的 Explore 模型下拉选项数组中加入 `kimi-k2.6`（标注"偏贵"提示），默认仍 `deepseek-v4-flash`。
   - 确认 `createExploreLLMService` 对 Kimi 缺 key 时回落主模型（已实现 `if (!hasKey) return undefined`）。
2. Kairos（默认仍 flash，受额度护栏约束）：
   - `packages/shared/src/settings.ts`：把 `KairosModelId` 从 `Extract<ModelId, "deepseek-v4-pro">` 扩展为 `Extract<ModelId, "deepseek-v4-pro" | "kimi-k2.6">`，并更新注释。
   - `packages/desktop/src/main/kairos-bootstrap.ts` / `packages/agent-core/src/kairos/env.ts`：确认 Kairos LLM 构造支持 Kimi provider（复用 `buildLLMConfig`，已 provider 无关；如有硬编码 deepseek 校验需放开到 kimi）。
   - `KairosSettings.tsx`：模型下拉加入 Kimi 选项，并在选 Kimi 时显式提示"成本较高，建议配合额度限制"。
   - 复用现有额度护栏（`packages/agent-core/src/kairos/storage/budget-store.ts` 的 `balanceCny` 扣费 + 耗尽停机），不新增护栏逻辑。
3. 单测：
   - `packages/desktop/src/renderer/test/settings-page.test.tsx`：Explore 下拉含 Kimi 选项。
   - `packages/desktop/src/renderer/test/kairos-settings.test.tsx`：Kairos 下拉含 Kimi 选项，set_budget 流程不回归。
   - `packages/agent-core/src/engine/test/create-agent-deps.test.ts`：`createExploreLLMService("kimi-k2.6")` 在有 Kimi key 时返回 Kimi service、无 key 时 undefined。

验收命令：
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/desktop test`

回退策略：从两个下拉的选项数组移除 Kimi、`KairosModelId` 改回只 pro 即可。

## Phase 4：Usage 页 Kimi 余额卡

依赖：Phase 1（Kimi 已是配置内 provider，`providers.kimi.hasApiKey` 已存在）。

设计要点：不把两个 provider 合进一个标题，而是两张独立余额卡，各自带 provider 名（「DeepSeek 余额」「Kimi 余额」），各自只在该 provider 配了 key 时显示。

1. 契约（`packages/shared/src/ipc.ts`）：
   - 把 `DeepSeekBalanceSnapshot` 泛化为 `ProviderBalanceSnapshot`（保留 `DeepSeekBalanceSnapshot` 作为 `ProviderBalanceSnapshot` 别名以兼容），字段含 `provider`、`isConfigured`、`displayBalance { amount, currency }`、`fetchedAt`、可选 `error`。
2. 后端（`packages/desktop/src/main/index.ts`）：
   - 抽出通用 `fetchProviderBalance(provider)`：DeepSeek 复用现有 `/user/balance`；Kimi 调 Moonshot 余额接口 `GET {kimiBaseUrl}/users/me/balance`（base 来自 `kimi` provider 配置，默认 `https://api.moonshot.cn/v1`）。
   - 新增 IPC handler `kimi:balance:get`，与 `deepseek:balance:get` 同形态；key 缺失时返回 `isConfigured: false`，不抛。
   - 安全：余额请求只在 main 进程读取 key，返回体不含 Authorization；超时与错误按现有 DeepSeek 实现（timeout、保留上次余额）。
3. preload（`packages/desktop/src/preload/index.ts`）+ `global.d.ts`：暴露 `getKimiBalance()`，与 DeepSeek 对称。
4. 前端（`packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`）：
   - 把 `DeepSeekBalanceCard` 泛化为 `ProviderBalanceCard`（props 接 `ProviderBalanceSnapshot` + 标题 + provider 名）。
   - 左栏堆叠渲染两张卡：DeepSeek、Kimi；各卡仅在 `isConfigured` 或有历史余额时显示，未配置时显示"未配置 {Provider} API Key"。
   - 标题：两卡分别为「DeepSeek 余额」「Kimi 余额」；不合并标题、不一分二。
   - 数据来源：`WorkbenchLayout.tsx` / 调用层补 Kimi 余额的 state、loading、error、刷新（参照现有 DeepSeek 余额三件套）。
5. 单测（`packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`）：
   - 同时传 DeepSeek + Kimi 余额快照时渲染两张卡，标题正确。
   - Kimi `isConfigured: false` 时显示未配置文案、不崩。
   - `packages/desktop/src/main/test/`：`fetchProviderBalance("kimi")` 对 fake fetch 解析金额；缺 key 返回 `isConfigured: false`。

验收命令：
- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/desktop test`
- 手工：在 Usage 页同时看到 DeepSeek/Kimi 两张余额卡，浅色/深色主题都验（遵循 `docs/design-docs/front-主题与配色规范.md`，禁止 `text-black`/`bg-white`/`#hex` 非主题字面量）。

回退策略：移除 Kimi 余额卡渲染与 `kimi:balance:get` handler；`ProviderBalanceSnapshot` 别名保证旧 DeepSeek 卡不受影响。

## 风险

- 风险：DSML 检测误伤包含 "DSML" 字样的正常正文。
  - 缓解：只用全角 `｜｜DSML｜｜` 严格子串匹配，单测覆盖正负样本。
- 风险：Kimi 主模型 thinking 开关行为与 DeepSeek 不一致导致报错。
  - 缓解：Phase 1 实现时真实切换验证；Kimi service 在请求构造层按模型能力忽略 thinking。
- 风险：跨 provider 切换历史回放出现 tool/thinking 协议问题。
  - 缓解：已有 `transform-messages.ts` 处理；Phase 1 加一条"DeepSeek 历史 → 切 Kimi 续聊"的手工冒烟验证。
- 风险：Kimi 余额接口路径/字段与假设不符。
  - 缓解：实现时以 Moonshot 官方文档为准核对 `users/me/balance` 响应结构，写进决策记录；解析失败按 `isConfigured`/error 兜底，不崩 UI。
- 风险：Kairos 选 Kimi 后成本飙升。
  - 缓解：默认仍 flash，UI 强提示，复用现有额度护栏自动停机。

## 验证方式（汇总）

- 命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
- 手工检查：
  - 触发一次 DeepSeek + 联网搜索，确认不再展示裸 DSML（或人工构造泄漏样本走单测）。
  - 聊天框可选 Kimi；DeepSeek 聊到一半切 Kimi 续聊不崩。
  - Explore / Kairos 设置页可选 Kimi，默认仍 flash。
  - Usage 页两张余额卡，浅/深主题都正常。
- 观测检查：
  - DSML 命中时 run-log/日志只记布尔与分类，不含原始 DSML。

## 进度记录

- [ ] Phase 0：DSML 检测兜底 + 单测。
- [ ] Phase 1：Kimi 提升 public + pricing + 选择器验证。
- [ ] Phase 2：Kimi 主模型 web_search 暴露 + executor provider 无关化 + 单测。
- [ ] Phase 3：Explore/Kairos 放出 Kimi 选项（默认 flash）+ KairosModelId 扩展 + 单测。
- [ ] Phase 4：Kimi 余额卡（契约/后端/preload/前端）+ 单测 + 主题验证。
- [ ] 同步设计文档（`agent-deepseek-kimi-hybrid-capabilities.md`）与 history。

## 决策记录

- 2026-06-08：本轮只产出 plan，不改代码（用户确认）。
- 2026-06-08：DSML 泄漏采用"检测即可重试错误"策略，不做"解析还原 tool call"，原因是裸 DSML 解析有协议不稳定风险，稳妥优先；解析还原列为后续可选增强。
- 2026-06-08：Kimi 作为公开主模型时，联网搜索用 provider-native `builtin_function.$web_search`，在 LLM service 请求层内部管理回填循环，**不**注册成本地 ToolManager 工具——与 DeepSeek Anthropic server web search 对称。否决了"暴露本地 web_search 工具 → executor 再调一次 Kimi"的 Kimi-调-Kimi 方案（浪费 + 违背既有设计原则）。依据 platform.kimi.ai/docs/guide/use-web-search 与既有 `searchWithKimi` 回填实现。DeepSeek 两条路线维持现状不回归。
- 2026-06-08：Usage 余额采用"每 provider 一张独立卡 + 各自 provider 名标题"，不合并标题、不一分二，便于未来扩展。
- 2026-06-08：Explore 与 Kairos 都放出 Kimi 选项但默认保持 flash；Kairos 依赖既有额度护栏控制 Kimi 成本风险。
