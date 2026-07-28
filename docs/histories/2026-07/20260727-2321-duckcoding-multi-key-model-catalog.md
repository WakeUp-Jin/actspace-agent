## [2026-07-27 23:21] | Task: 接入 DuckCoding 多 Key、本地模型档案与名称变体

### 🤖 Execution Context

- Tool: Codex
- Date: 2026-07-27 至 2026-07-28

### 📥 User Query

> 新增 DuckCoding 服务商；默认保持一家供应商一把 Key，存在额外 Key 时模型才能从供应商已有 Key 中选择。倍率与 Key 绑定。模型首版支持 Codex 与 Grok，本地记录 DuckCoding 实际接受的裸模型名；Codex 推理强度通过模型名变体传递，添加时允许修改最大上下文。

### Changes Overview

- Scope: `shared`、`agent-core`、`desktop main/preload/renderer`、设计与安全文档。
- 新增 `duckcoding` Provider Registry 配置与 `DuckCoding` 展示名，按模型声明复用 OpenAI Chat Completions 或 Responses runtime。
- provider 默认 Key 保持现有安全存储；额外 Key 增加加密 CRUD、独立测试状态、倍率和模型引用删除保护。
- 模型增加可选 `credentialId`，runtime 按绑定选择密钥，缺失或不可用时明确失败，不静默回退。
- 新增共享 DuckCoding 本地模型档案，Codex 收录 5.6 Sol、5.6 Terra、5.6 Luna，并为每个模型提供 Light、Medium、High、Extra High、Ultra 五档精确名称；Grok 收录 `grok-4.5`。
- `ModelDefinition` 增加 `family` 与 `requestModelByReasoningEffort`；统一 effort 类型增加 `ultra`，Codex 在调用时按五档切换精确 `apiModel`，DuckCoding 请求不增加 reasoning 属性。
- Composer 对 DuckCoding 默认选择 Medium，只展示 Light、Medium、High、Extra High、Ultra；其他供应商保留原有 Auto 和标签语义。
- 添加模型时可覆盖最大上下文和最大输出；自定义模型保留精确 API 模型名，不添加 OpenAI、Azure 或 xAI 前缀。
- main 校验本地档案 id 与精确 API 模型名必须一致，避免绕过 UI 后拼接错误能力和名称变体。
- 模型页只有存在额外 Key 时显示 Key 选择器；供应商页管理 Key，模型页不能输入密钥。
- 调用时生成“模型基础价格 × 目标 Key 倍率”的有效价格快照；倍率缺省为 `1x`。
- 参考 models.dev 的对应 OpenAI 条目，将 Sol、Terra、Luna 的标准输入、输出、缓存读取和缓存写入价格固化进本地档案；这些价格仅用于估算，不声明为 DuckCoding 官方价。
- 已安装但没有持久化价格或仍声明旧 Chat 协议的 Codex 模型会在读取快照时按精确 `apiModel` 补齐当前本地档案价格并升级为 Responses，不改写用户持久化定义；Grok 4.5 暂时继续显示价格未知。
- 模型列表和 runtime 使用相同的 Key 倍率规则；Sol 绑定 `0.2x` Key 时估算输入为 `$1 / 1M`、输出为 `$6 / 1M`。
- 删除早期为 DuckCoding 引入的 models.dev/OpenRouter 公共元数据聚合服务，OpenRouter 自身目录保持不变。
- 新增 `scripts/diagnose-duckcoding-cache.ts` 手动归因探针，使用合成静态前缀对照 `prompt_cache_key`、工具定义、显式缓存断点、Chat Completions / Responses 协议以及 `api` / `www` 域名；Key 只从环境读取，输出不会包含密钥或完整请求体。
- 用户实测探针只有 `responses-key-api` 返回明确缓存命中：`cached_tokens=2560`、总输入 `3610`，约 `70.9%`；Chat Completions 对照没有可确认缓存字段。
- `ModelApi` 增加 `openai-responses`，本地 Codex 档案切换到 Responses，Grok 与未知手动模型默认继续使用 Chat Completions。
- 新增 `OpenAIResponsesService` 与独立转换层，支持 Responses 文本流、`call_id` 工具调用、错误/incomplete、response metadata 及输入、输出、缓存读写、reasoning token usage 归一。
- 主 Agent 为 Responses 模型注入由 session id 哈希派生的稳定 `prompt_cache_key`；请求使用 `store: false`，不发送 `previous_response_id`，会话事实继续由本地完整上下文管理。
- Responses 返回的加密 reasoning item 作为 opaque provider signature 随 thinking session 事件持久化；thinking/tool-call 事件同时保存 `api`、`provider`、`model`，落盘恢复后通过同目标校验再按原顺序回放。它不会被当作可读思考展示。
- 新增 `scripts/diagnose-duckcoding-thinking.ts`：用 Codex Responses 的现代 `summary`、旧 `generate_summary` 参数对照和 Grok Chat delta 字段探测，区分 reasoning token、加密 reasoning 状态与可展示 Thinking；默认不输出正文，Codex/Grok Key 从独立环境变量读取且不互相 fallback。

### Key Files

- `packages/shared/src/provider-config.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/duckcoding-model-catalog.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/llm/responses-convert.ts`
- `packages/agent-core/src/llm/services/openai-responses.ts`
- `packages/agent-core/src/llm/provider-adapter.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/model-store-service.ts`
- `packages/desktop/src/main/model-runtime-service.ts`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/DuckCodingModelDialog.tsx`
- `scripts/diagnose-duckcoding-cache.ts`
- `scripts/diagnose-duckcoding-thinking.ts`
- `docs/design-docs/model-context/agent-duckcoding-multi-key-model-catalog.md`
- `docs/learnings/2026-07/20260728-prompt-cache-diagnosis-controlled-variable-matrix.md`
- `docs/learnings/2026-07/20260728-responses-stateless-replay-needs-reasoning-items.md`

### Verification

- shared typecheck 通过；全套 61 项测试通过，包含 signature-only Thinking 隐藏回归。
- agent-core typecheck 与 build 通过；Responses 转换、流式服务、factory、session 缓存键、名称变体、加密 reasoning item session 回放和跨协议隔离等 69 项定向测试通过。
- desktop typecheck 通过；模型协议升级、运行配置、连接默认值与 settings 的 50 项定向测试通过；此前全套 505 项测试通过，覆盖三模型五档强度、本地档案、上下文覆盖、多 Key 选择、旧模型价格补齐和倍率 runtime/UI 展示。
- agent-core 全套仍有 11 项非本次改动失败：10 项为沙箱内 Unix Socket `listen EPERM`，1 项为既有 ToolManager 权限错误文案断言不一致。
- production build 通过；仅保留既有的 renderer chunk 大小提示。
- 前端主题颜色契约、文档骨架、密钥泄露扫描与 `git diff --check` 均通过。
- DuckCoding 缓存探针的 Node TypeScript 运行解析、帮助、场景列表、dry-run 和本地连接失败续跑路径通过；随后由用户使用自己的 Key 执行，结果确认 Responses 缓存命中。
- DuckCoding Thinking 探针的独立 TypeScript 检查、Node TypeScript 运行解析、帮助、场景列表和四请求 dry-run 通过；全量缺两把 Key、仅 Codex 缺 Codex Key、仅 Grok 缺 Grok Key 均按场景 fail-closed，单场景提供对应 dummy Key 时不会要求另一系列 Key。
- 用户第一轮真实探针确认：Codex baseline 与现代 `reasoning.summary=auto` 均有 reasoning token 和加密 reasoning item，但没有可读 summary；Grok 有 reasoning token，但流式 delta 只有 `role` / `content`。
- 用户补测旧 `reasoning.generate_summary=auto`：请求返回 HTTP 200，但没有 reasoning token、加密 reasoning item 或 summary，确认旧参数同样不是可读 Thinking 路径。
- shared session selector 不再为 content 为空的 signature-only thinking 事件生成可见消息块；底层事件、签名持久化、session 恢复和 Responses 工具循环回放保持不变。新增回归测试同时锁定“空协议状态隐藏、非空 Thinking 正常展示”。
- agent-core adapters / Responses 转换定向 21 项测试通过，确认签名仍可落盘恢复并回放；agent-core 全套仍只有上述 11 项既有失败。shared build 与 desktop typecheck 通过。

### Remaining Manual Acceptance

- 使用用户自己的 DuckCoding Key 验证默认 Key、额外 Key 和模型绑定的真实连接；Codex 走 Responses，Grok 走 Chat Completions。
- 确认 Sol、Terra、Luna 的非默认强度均通过模型名后缀选择，且请求体不需要 reasoning effort 属性。
- 用 Codex 完成一次真实工具调用和后续轮次，确认加密 reasoning item 回放与 session 级缓存键在 DuckCoding 网关上兼容。
- 对照 DuckCoding 实际账单确认模型基础价乘 Key 倍率后的 Usage 估算。
- 在浅色、深色和跟随系统主题下检查额外 Key 列表、模型 Key 下拉、Codex/Grok 档案、上下文输入与键盘焦点。
