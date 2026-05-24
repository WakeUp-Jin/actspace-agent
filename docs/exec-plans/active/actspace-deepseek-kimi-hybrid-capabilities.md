# actspace DeepSeek + Kimi 混合能力接入计划

## 目标

让 `actspace` 首版只支持 DeepSeek 与 Kimi 两个真实 provider，并形成清晰的混合能力策略：

- 用户选择 Kimi 时，Kimi 作为主模型，直接使用 Kimi 原生联网搜索与多模态能力。
- 用户选择 DeepSeek 时，DeepSeek 作为主模型；如果用户同时提供 Kimi API Key，则通过轻量工具包装补齐联网搜索、网页读取和多模态识别。
- 用户选择 DeepSeek 且没有 Kimi API Key 时，仍可使用本地文件类工具，但不暴露联网搜索和多模态工具。

本计划的核心约束是保持实现简单：不要引入复杂能力路由系统，第一版用工具定义上的单个暴露属性和少量 provider 判断完成。

## Required Reading

新会话或子 Agent 执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/design-docs/agent-core/backend-agent-testing.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`
- `.agents/skills/llm-agent-dev/references/tools/overview.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`

不要读取 `.env` 文件内容。只能检查字段名、默认值、示例值和运行时错误信息；密钥不得写入日志、session 或测试快照。

## 背景

当前仓库已具备：

- `packages/agent-core/src/llm/services/deepseek.ts`：DeepSeek OpenAI-compatible provider。
- `packages/agent-core/src/llm/services/mock.ts`：mock provider。
- `packages/agent-core/src/llm/factory.ts`：provider 工厂。
- `packages/agent-core/src/env.ts`：集中式环境变量与 `envToLLMConfig()`。
- `packages/agent-core/src/tools/types.ts`：`ToolDefinitionSpec`。
- `packages/agent-core/src/tools/manager.ts`：注册工具、执行工具、结果截断。
- `packages/agent-core/src/tools/index.ts`：当前工具注册入口。

设计事实来源：

- `docs/design-docs/agent-core/deepseek-kimi-hybrid-capabilities.md`

本计划参考的外部文档：

- Kimi 联网搜索：`https://platform.kimi.com/docs/guide/use-web-search`
  - `$web_search` 是 Kimi Chat Completions 的 `builtin_function`。
  - 使用 `$web_search` 时需要禁用 thinking。
  - `$web_search` 不需要应用侧提供普通 function JSON schema。
- Kimi 官方工具 Formula：`https://platform.kimi.com/docs/guide/use-official-tools`
  - 官方工具可通过 Formula URI 调用，例如 `moonshot/web-search:latest`。
  - `web-search` 是 protected，结果可能出现在 `context.encrypted_output`，适合回填给 Kimi，不适合作为 DeepSeek 可直接消费的裸搜索结果。
- Kimi 视觉模型：`https://platform.kimi.com/docs/guide/use-kimi-vision-model`
  - `kimi-k2.6` 支持图片与视频输入。
  - 多模态 user message 的 `content` 是 part 数组，不是字符串化 JSON。

## 范围

包含：

- 新增 Kimi provider，使用户可在 DeepSeek 与 Kimi 之间选择主模型。
- 新增 Kimi 相关环境变量示例与安全说明。
- 在工具定义层新增轻量暴露属性，例如 `exposeOnlyTo?: "deepseek" | "kimi"`。
- 修改工具注册逻辑：
  - 缺少 `exposeOnlyTo` 的工具默认暴露给 DeepSeek 与 Kimi。
  - `exposeOnlyTo: "deepseek"` 的工具只暴露给 DeepSeek，且隐含需要 Kimi API Key。
- 给 DeepSeek 暴露 Kimi 辅助工具：
  - `web_search`：内部调用 Kimi `$web_search`，返回纯文本摘要与 sources。
  - `web_fetch`：首版可选择 Kimi `$web_search` 辅助或本地 HTTP fetch + Kimi 摘要，最终返回 DeepSeek 可读文本。
  - `analyze_media`：内部调用 Kimi Vision，把图片/视频理解结果转成文本或 JSON 返回 DeepSeek。
- 新增 Kimi 辅助调用的 prompt 资产目录，三个工具的系统提示词独立版本化：
  - `packages/agent-core/src/llm/kimi-assistants/prompts/web-search.ts`
  - `packages/agent-core/src/llm/kimi-assistants/prompts/web-fetch.ts`
  - `packages/agent-core/src/llm/kimi-assistants/prompts/analyze-media.ts`
- Kimi 主模型请求构造时接入 Kimi 原生能力：
  - 联网问题启用 `$web_search` 并禁用 thinking。
  - 图片/视频输入直接按 Kimi 多模态格式发送。
- 更新架构、安全、环境变量和测试文档。
- 记录完成后的 history；如果本轮实现命中学习沉淀条件，再按 `docs/learnings/WRITING_GUIDE.md` 写 learning。

不包含：

- 不支持第三个真实 provider。
- 不引入通用 Capability Router 框架。
- 不在第一版接入 Formula 官方工具作为 DeepSeek 搜索的直接实现。
- 不把 Kimi `moonshot/web-search:latest` 的 `encrypted_output` 直接返回给 DeepSeek。
- 不做企业级密钥管理、云端同步、计费面板或模型 marketplace。
- 不做完整 MCP、Skill、Formula 工具市场集成。

## 设计原则

### 1. 主模型选择保持显式

运行时只允许三种主路径：

- `LLM_PROVIDER=deepseek`
- `LLM_PROVIDER=kimi`
- `MOCK_MODE=true`

真实产品路径只支持 DeepSeek 与 Kimi。mock 仍用于测试和 demo，不作为用户可选真实 provider。

### 2. 工具暴露规则保持轻量

在 `ToolDefinitionSpec` 上新增一个可选字段：

```ts
exposeOnlyTo?: "deepseek" | "kimi";
```

语义：

- 字段缺省：两个主模型都可用。
- `exposeOnlyTo: "deepseek"`：只暴露给 DeepSeek，并且需要 Kimi API Key。
- `exposeOnlyTo: "kimi"`：只暴露给 Kimi。第一版除非出现明确 Kimi-only 普通工具，否则不主动使用。

第一版筛选逻辑应保持在一个小函数内，例如 `shouldExposeTool(spec, runtime)` 或 `resolveAvailableToolSpecs(specs, runtime)`，不要引入多层策略对象。

### 3. DeepSeek 看见产品能力，不看见供应商细节

DeepSeek 只应看到稳定的应用级工具名：

- `web_search`
- `web_fetch`
- `analyze_media`

DeepSeek 不应看到：

- `kimi_web_search`
- `$web_search`
- `moonshot/web-search:latest`
- `kimi-k2.6`

供应商细节由工具 executor 内部处理。

### 4. Kimi 原生能力不强行塞进 ToolManager

Kimi 主模型的 `$web_search` 和多模态输入属于 provider request builder 的职责，不是普通 `ToolManager` 工具。

因此：

- Kimi 主模型：由 `KimiService` 在请求参数中声明 `builtin_function.$web_search`，并在需要时禁用 thinking。
- DeepSeek 主模型：由普通工具 `web_search` 调用一个很薄的 Kimi 搜索函数，拿到 DeepSeek 可读结果。

### 5. 搜索子代理只是函数，不是新运行时

`web_search` executor 内部可以实现为：

1. 接收 DeepSeek 工具参数 `{ query }`。
2. 发起一次 Kimi Chat Completions 请求，启用 `$web_search` 并禁用 thinking。
3. 按 Kimi 内置工具调用协议回填 `$web_search` tool message。
4. 请求 Kimi 生成最终结果。
5. 返回结构化文本给 DeepSeek：
   - query
   - answer
   - sources
   - searchedAt

这里不需要创建独立 Agent loop、上下文压缩、长期记忆或调度器。

### 6. Kimi 辅助提示词是工具内部资产

三个 DeepSeek 专用工具都会调用 Kimi，但它们的 Kimi 系统提示词不属于主 Agent 的 `ContextManager` system prompt。

提示词放在：

```txt
packages/agent-core/src/llm/kimi-assistants/prompts/
  web-search.ts
  web-fetch.ts
  analyze-media.ts
```

边界：

- 工具 `definition.description` 给 DeepSeek 看，用于判断是否调用工具。
- `kimi-assistants/prompts/*` 给 Kimi 子调用看，用于约束搜索、网页摘要和多模态识别输出。
- 主 Agent 的 system prompt 不包含 Kimi 辅助工具内部实现细节。

## 风险

- 风险：Kimi `$web_search` 的工具调用协议与普通 function tool 不同，容易误执行本地函数。
  - 缓解方式：在 Kimi provider 内部专门处理 `builtin_function.$web_search`，测试覆盖 tool_calls 回填流程。
- 风险：Formula `web-search` 返回 `encrypted_output`，DeepSeek 无法直接消费。
  - 缓解方式：第一版不把 Formula `web-search` 作为 DeepSeek 搜索裸实现；只作为后续工具平台扩展候选。
- 风险：工具暴露规则散落到多处，后续维护困难。
  - 缓解方式：只允许一个工具筛选函数读取 `exposeOnlyTo` 与 `hasKimiKey`。
- 风险：Kimi key 泄漏到 session、日志或前端。
  - 缓解方式：密钥只在 main/agent-core 运行时读取；日志只记录 provider、model、是否配置 key 的布尔状态。
- 风险：Kimi 搜索禁用 thinking 与普通 Kimi 对话 thinking 策略冲突。
  - 缓解方式：仅在请求携带 `$web_search` 时禁用 thinking；普通 Kimi 主模型对话保持默认 provider 策略。
- 风险：DeepSeek 工具返回太长造成上下文膨胀。
  - 缓解方式：`web_search`、`web_fetch`、`analyze_media` executor 内先做结果裁剪，再交给现有 ToolManager 截断。

## 里程碑

1. 设计落地与环境契约。
2. Kimi provider 接入。
3. 工具暴露筛选。
4. DeepSeek 的 Kimi 辅助工具。
5. Kimi 主模型原生联网与多模态。
6. 文档、测试、history 与验收收尾。

## 实施任务

### Task 1: 环境变量与 provider 契约

修改目标：

- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/llm/types.ts`
- `.env.example`
- `README.md`
- `docs/SECURITY.md`
- `docs/ARCHITECTURE.md`

步骤：

1. 将真实 provider 范围明确为 `deepseek | kimi`，保留 `mock` 仅用于 `MOCK_MODE=true` 或测试。
2. 新增 Kimi 配置字段：
   - `KIMI_API_KEY`
   - `KIMI_BASE_URL`
   - `KIMI_MODEL`
3. 保持 DeepSeek 可在没有 Kimi key 时运行，但联网搜索和多模态工具不可用。
4. 在 `.env.example` 中说明：
   - `LLM_PROVIDER=deepseek` 时，`KIMI_API_KEY` 是可选增强能力。
   - `LLM_PROVIDER=kimi` 时，`KIMI_API_KEY` 必填。
5. 更新安全文档，明确 Kimi key 不进入 renderer、session 或日志。

验证：

- `pnpm --filter @actspace/agent-core test`
- 新增或更新 env 测试：
  - DeepSeek 主模型无 Kimi key 不报错。
  - Kimi 主模型无 Kimi key 返回清晰 auth/config 错误。
  - `MOCK_MODE=true` 仍走 mock。

### Task 2: Kimi provider 服务

修改目标：

- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/services/kimi.ts`
- `packages/agent-core/src/llm/services/deepseek.ts`（仅在共享 OpenAI-compatible helper 时触碰）
- `packages/agent-core/src/llm/test/*` 或新增同级测试

步骤：

1. 新增 `KimiService`，沿用 OpenAI-compatible Chat Completions 风格。
2. 支持流式文本输出、tool_calls 映射和 usage 基础映射。
3. 支持 Kimi 特有请求参数：
   - `$web_search` 请求时 `thinking: { type: "disabled" }`。
   - 多模态消息 content part 数组。
4. `createLLMService()` 增加 `kimi` 分支。
5. 真实网络调用测试使用 mock fetch/client，不依赖真实密钥。

验证：

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`
- 单测覆盖 provider factory 可创建 KimiService。
- 单测覆盖 Kimi auth 缺失时错误类型清晰。

### Task 3: 工具定义暴露属性

修改目标：

- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/manager.ts`（只有必要时修改）
- `packages/agent-core/src/tools/test/manager.test.ts` 或新增 tool exposure 测试

步骤：

1. 在 `ToolDefinitionSpec` 中新增：
   - `exposeOnlyTo?: "deepseek" | "kimi"`
2. 增加轻量筛选函数，输入至少包含：
   - `primaryProvider`
   - `hasKimiKey`
3. 规则：
   - 缺省字段：注册。
   - `exposeOnlyTo !== primaryProvider`：不注册。
   - `exposeOnlyTo === "deepseek"` 且无 Kimi key：不注册。
4. 当前文件工具不设置 `exposeOnlyTo`。
5. 后续 Kimi 辅助工具设置 `exposeOnlyTo: "deepseek"`。

验证：

- 单测覆盖三种运行时：
  - Kimi 主模型：只注册通用工具。
  - DeepSeek + Kimi key：注册通用工具与 DeepSeek-only Kimi 辅助工具。
  - DeepSeek 无 Kimi key：只注册通用工具。
- `pnpm --filter @actspace/agent-core test`

### Task 4: DeepSeek 的 Kimi 搜索工具

修改目标：

- `packages/agent-core/src/tools/tools/web-search/definition.ts`
- `packages/agent-core/src/tools/tools/web-search/executor.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/llm/services/kimi.ts` 或新增 `packages/agent-core/src/llm/kimi-assistants/search.ts`
- `packages/agent-core/src/llm/kimi-assistants/prompts/web-search.ts`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`

步骤：

1. 新增 `web_search` 工具，`exposeOnlyTo: "deepseek"`。
2. 输入 schema：
   - `query: string`
3. 新增 `kimi-assistants/prompts/web-search.ts`，约束 Kimi 搜索辅助调用：
   - 使用 `$web_search` 获取最新信息。
   - 输出 answer 和 sources。
   - 不输出无来源事实。
   - 不向最终用户暴露“正在辅助 DeepSeek”的实现细节。
4. executor 调用轻量 Kimi 搜索函数，而不是直接调用 Formula `moonshot/web-search:latest`。
5. Kimi 搜索函数使用 `$web_search`：
   - 声明 `builtin_function.$web_search`
   - 禁用 thinking
   - 按 Kimi 内置工具协议回填 tool message
   - 请求最终自然语言总结
6. 返回 DeepSeek 可读结果，包含查询词、搜索时间与 Kimi 生成的答案；sources 由 Kimi 答案文本承载，没有 sources 时要显式说明。
7. 工具错误要可诊断：
   - Kimi key missing
   - Kimi auth failed
   - search tool_call protocol failed
   - no sources returned

验证：

- 单测使用 fake Kimi client 模拟：
  - Kimi 返回 `$web_search` tool_call。
  - executor 回填 tool message。
  - Kimi 返回最终 answer + sources。
  - executor 给 DeepSeek 返回可读文本。
- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

### Task 5: DeepSeek 的网页读取与多模态辅助工具

修改目标：

- `packages/agent-core/src/tools/tools/web-fetch/definition.ts`
- `packages/agent-core/src/tools/tools/web-fetch/executor.ts`
- `packages/agent-core/src/tools/tools/analyze-media/definition.ts`
- `packages/agent-core/src/tools/tools/analyze-media/executor.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/llm/kimi-assistants/`（如 Task 4 已新增）
- `packages/agent-core/src/llm/kimi-assistants/prompts/web-fetch.ts`
- `packages/agent-core/src/llm/kimi-assistants/prompts/analyze-media.ts`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`

步骤：

1. 新增 `web_fetch`，`exposeOnlyTo: "deepseek"`。
2. 新增 `analyze_media`，`exposeOnlyTo: "deepseek"`。
3. 新增 `kimi-assistants/prompts/web-fetch.ts`，约束 Kimi 只基于提供的网页 Markdown 回答，内容不足时明确说明不足。
4. 新增 `kimi-assistants/prompts/analyze-media.ts`，约束 Kimi 输出 summary、ocrText、relevantDetails、limitations，并标注不确定内容。
5. `web_fetch` 首版优先选择简单可验证方案：
   - 只接受完整 URL。
   - 禁止 credentials URL。
   - 限制超时和响应大小。
   - HTML 转 Markdown 后交给 Kimi 摘要。
6. `analyze_media` 首版处理 Kimi provider 可接受的媒体 URL、data URL 或平台文件引用；不让 renderer 直接传密钥。
7. 图片走 `image_url` part，视频走 `video_url` part；更完整的文件上传协议后续单独补。
8. 返回给 DeepSeek 的内容要裁剪并标注限制。

验证：

- 单测覆盖 URL 校验与 HTML 转文本摘要路径。
- 单测覆盖图片 part 构造，不把 content part 数组字符串化。
- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

### Task 6: Kimi 主模型原生能力

修改目标：

- `packages/agent-core/src/llm/services/kimi.ts`
- `packages/agent-core/src/engine/agent.ts` 或 message adapter（仅当需要支持多模态消息时）
- `packages/shared/src/session.ts`（仅当 attachment/message block 契约需要扩展时）
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/` 相关附件入口（如当前已有附件 UI，则只接入；没有则拆后续计划）

步骤：

1. Kimi 主模型对普通文本保持正常 Chat Completions。
2. 当请求需要联网搜索时，Kimi provider 可声明 `$web_search`，并禁用 thinking。
3. 当用户输入包含图片/视频附件时，Kimi provider 直接构造多模态 content parts。
4. 若当前前端尚无附件上传链路，本任务只完成 agent-core 契约和 provider 支持，UI 接入拆成独立前端计划。

验证：

- 单测覆盖 Kimi 多模态 message content 是数组，不是 JSON 字符串。
- 单测覆盖 `$web_search` 请求禁用 thinking。
- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

### Task 7: 文档、history 与验收

修改目标：

- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/design-docs/agent-core/backend-agent-testing.md`
- `.env.example`
- `README.md`
- `docs/histories/YYYY-MM/*.md`
- 如命中学习沉淀条件：`docs/learnings/YYYY-MM/*.md`

步骤：

1. 更新架构文档，说明 DeepSeek/Kimi provider 边界、Kimi 辅助工具和工具暴露属性。
2. 更新安全文档，说明外部联网、多模态上传、API key 与日志脱敏。
3. 更新可靠性文档，说明 provider/tool 错误分类与排障日志字段。
4. 更新测试文档，补充 Kimi provider 与辅助工具的 mock 测试策略。
5. 记录 history。
6. 判断是否写 learning：
   - 本计划命中“新概念”“可迁移”“有陷阱”“有模式”，实现完成后大概率需要 learning。

验证：

- `pnpm typecheck`
- `pnpm --filter @actspace/agent-core test`
- `pnpm build`
- 文档自审：没有把计划中尚未实现的能力写成当前已落地事实。

## 验证方式

工程命令：

- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/shared test`（如果 shared contract 改动）
- `pnpm typecheck`
- `pnpm build`

手工验收：

- `LLM_PROVIDER=deepseek` 且无 `KIMI_API_KEY`：
  - 普通文件工具可用。
  - `web_search`、`web_fetch`、`analyze_media` 不暴露给模型。
- `LLM_PROVIDER=deepseek` 且有 `KIMI_API_KEY`：
  - DeepSeek 能调用 `web_search`。
  - 工具结果包含摘要与 sources。
  - DeepSeek 最终回答能引用 sources。
- `LLM_PROVIDER=kimi`：
  - Kimi provider 可完成普通文本回复。
  - 联网搜索请求启用 `$web_search` 并禁用 thinking。
  - 图片输入按 Kimi 多模态格式发送。

观测检查：

- `logs/agent-runs/*.jsonl` 中只记录 provider、model、tool name、错误类型和 key 是否存在的布尔状态。
- session 事件中不出现 API key、Authorization header、base64 大图原文或 Formula encrypted blob。

## 进度记录

- [x] 读 `AGENTS.md`、`docs/PLANS_GUIDE.md` 和当前 LLM/tool 代码入口。
- [x] 收敛第一版设计：DeepSeek 主模型通过 Kimi 辅助工具补齐搜索/多模态；Kimi 主模型使用原生能力。
- [x] 决定工具暴露只新增 `exposeOnlyTo?: "deepseek" | "kimi"`，不做复杂 Capability Router。
- [x] 决定 Kimi 辅助调用的系统提示词放入 `packages/agent-core/src/llm/kimi-assistants/prompts/`，不混入主 Agent system prompt。
- [x] Task 1: 环境变量与 provider 契约。
- [x] Task 2: Kimi provider 服务。
- [x] Task 3: 工具定义暴露属性。
- [x] Task 4: DeepSeek 的 Kimi 搜索工具。
- [x] Task 5: DeepSeek 的网页读取与多模态辅助工具。
- [x] Task 6: Kimi 主模型原生能力。
- [x] Task 7: 文档、history 与验收。
- [x] 验证：`pnpm --filter @actspace/agent-core test`，104 tests passed。
- [x] 验证：`pnpm typecheck`，shared、agent-core、desktop 均通过。

## 决策记录

- 2026-05-24：只支持 DeepSeek 与 Kimi 两个真实 provider。原因是当前产品目标是用 DeepSeek 控成本、用 Kimi 补生态能力，提前泛化到多 provider 会增加不必要复杂度。
- 2026-05-24：不做复杂 Capability Router。第一版只在工具定义上增加 `exposeOnlyTo?: "deepseek" | "kimi"`，由一个轻量筛选函数决定普通工具是否注册。
- 2026-05-24：DeepSeek 的 `web_search` 不直接调用 Formula `moonshot/web-search:latest` 作为裸结果。原因是 Kimi 官方 `web-search` Formula 是 protected，可能返回 `encrypted_output`，更适合回填给 Kimi，而不是直接给 DeepSeek 消费。
- 2026-05-24：DeepSeek 的 `web_search` 内部调用 Kimi `$web_search` 并让 Kimi 输出纯文本摘要与 sources。这个“搜索子代理”只实现为薄函数，不创建新 Agent runtime。
- 2026-05-24：Kimi 主模型的 `$web_search` 和多模态输入属于 provider request builder，不进入普通 ToolManager。这样可避免模型看到供应商细节，也避免普通工具系统承担 provider 原生能力。
- 2026-05-24：Kimi 辅助调用的系统提示词独立放在 `packages/agent-core/src/llm/kimi-assistants/prompts/`。原因是这些提示词只约束工具 executor 内部的 Kimi 子调用，不应污染 DeepSeek 或 Kimi 主模型的 system prompt。
- 2026-05-24：首版 `web_fetch` 使用本地 HTTP fetch + 简单 HTML 转文本 + Kimi 摘要，不接 Formula fetch。原因是该路径最小、可测、输出能直接给 DeepSeek 阅读。
- 2026-05-24：首版 `analyze_media` 支持 Kimi 可接受的 URL/data URL/平台引用，不在本轮实现 Moonshot 文件上传。原因是当前前端附件链路还未形成稳定契约，先把 provider content part 与 DeepSeek 工具边界打通。
