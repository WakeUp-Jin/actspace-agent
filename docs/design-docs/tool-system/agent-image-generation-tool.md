# Agent 图片生成工具设计规范

> 状态：V0 已实现并通过自动化检查；真实服务与 UI 交互由用户后续手工验收。
>
> V0 范围：通过用户配置的 OpenAI-compatible Images API，为主 Agent 提供 `generate_image` 工具；默认 Base URL 为 DuckCoding，默认模型名称为 `gpt-image-2`，两者都可在设置页修改；图片数量 `n` 由模型按用户意图选择，默认 1、最大 10。

## 1. 目标

图片生成是一个独立的 Agent 工具能力，不是主对话模型的附属配置。用户完成 API Key、Base URL 与模型名称配置后，可以直接在对话中要求 Agent 生成一张或多张图片，生成结果作为当前会话的持久产物保存；工具过程使用单行日志展示，最终图片从回复下方的产物栏打开到右侧面板预览。

V0 需要满足：

- 用户可以在设置页配置图片生成 API Key、Base URL 与模型名称；Key 明文只存在于 Electron main / agent-core 运行时，Base URL 和模型名称作为非敏感配置保存。
- 主 Agent 在已配置 Key 时获得 `generate_image` 工具；缺 Key 时不暴露该工具。
- 模型可以选择生成数量 `n`，范围为 1 到 10，未传时默认 1。
- 一次工具调用对应一次图片生成请求，返回的每张有效图片都保存为独立会话产物。
- 消息流能够恢复并展示单图或多图结果，不依赖短期有效的远程 URL。
- Base64 图片、Authorization header、API Key 和上游原始错误正文不得进入 session、renderer 状态或日志。

## 2. 非目标

V0 不处理以下能力：

- 不建立通用图片模型目录或动态模型安装机制。
- 不建立多图片 provider 列表；V0 只有一份 OpenAI-compatible 图片生成连接配置。
- 不建立图片模型目录、能力元数据或下拉选择器；V0 只提供一个可填写的模型名称字段。
- 不开放 `quality`、`style`、`response_format` 给主模型选择。
- 不支持图片编辑、局部重绘、参考图生成或蒙版输入。
- 不把图片生成供应商并入 LLM Provider Registry。
- 不让 Kairos、Explore 或通用 SubAgent 默认调用付费图片生成能力。
- 不提供历史图片资产库、跨会话素材管理或云端同步。

这些能力可以在 V1 以后基于本规范的 provider adapter、artifact 和 preview 契约继续扩展。

## 3. 产品行为

用户路径：

```text
设置 → 服务商 → 图片生成服务 → 填写 API Key / Base URL / 模型名称
  ↓
下一轮主 Agent Runtime 检测到图片生成 Key
  ↓
向模型注册 generate_image
  ↓
用户提出图片生成需求
  ↓
模型构造 prompt / size / n
  ↓
配置的 Images API 返回 1..n 个结果
  ↓
下载或解码 → 原子写入当前 session artifacts
  ↓
消息流展示图片网格 → Agent 返回简短说明
```

典型例子：

- “生成一张日落锦鲤池的浮世绘” → `n` 省略，默认生成 1 张。
- “给我 3 个不同构图版本” → `n: 3`。
- “多做几个方向让我挑” → 模型根据任务选择合理数量；通常为 2 到 4 张。
- “生成 10 张头像候选” → `n: 10`。

模型不能在用户没有表达图片生成意图时主动调用该工具。批量数量会影响成本和等待时间，工具描述必须要求模型根据用户意图选择数量，而不是总是取最大值。

## 4. 能力边界与命名

| 概念 | V0 值 | 说明 |
|---|---|---|
| 工具名 | `generate_image` | 给 LLM 与 ToolManager 使用，snake_case |
| 工具目录 | `tools/tools/generate-image/` | 仓库目录使用 kebab-case |
| `previewKind` | `image_generation` | 给 bridge、shared contract 与 renderer 使用 |
| 接入协议 | `openai-compatible` | V0 只有一份连接配置，不建立图片 provider registry |
| 默认模型名称 | `gpt-image-2` | 用户可在设置页覆盖，但不作为单次工具参数 |
| 默认 Base URL | `https://www.duckcoding.ai/v1` | 用户可在设置页覆盖 |
| Endpoint | `<normalizedBaseUrl>/images/generations` | OpenAI-compatible Images API |
| 运行时 Key | `IMAGE_GENERATION_API_KEY` | `$NEW_API_KEY` 只是 curl 示例里的 shell 变量名，不作为产品配置名 |
| 运行时 Base URL | `IMAGE_GENERATION_BASE_URL` | 默认 DuckCoding，设置页值可覆盖 |
| 运行时模型名称 | `IMAGE_GENERATION_MODEL` | 默认 `gpt-image-2`，设置页值可覆盖 |

图片生成服务与现有配置保持三类分离：

```text
LLM providers       → DeepSeek / Kimi / OpenRouter
Search providers    → Zhipu / Tavily / TinyFish / Exa
Image generation    → one user-configured OpenAI-compatible endpoint
```

三类服务可以复用同一套 main-only 凭据文件、连接/断开 IPC 和密钥表单交互，但共享基础设施不代表共享业务类型。V0 使用单例 `imageGeneration` 设置，不虚构 `ImageGenerationProviderId`，也不把它加入 `ProviderId` 或 `SearchProviderId`。

## 5. 工具参数契约

V0 对模型开放三个参数：

| 参数 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|---|---|---:|---|---|---|
| `prompt` | string | 是 | - | trim 后非空；实现时设置长度上限 | 想要生成图片的文字描述 |
| `size` | enum | 否 | `1024x1024` | 只接受 provider 已验证支持的尺寸 | 输出图片尺寸 |
| `n` | integer | 否 | `1` | 最小 1，最大 10 | 本次生成的图片数量 |

建议的 JSON Schema：

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Describe the image or images to generate. Include subject, composition, style, lighting, color, and constraints when relevant."
    },
    "size": {
      "type": "string",
      "enum": ["1024x1024", "1536x1024", "1024x1536"],
      "default": "1024x1024",
      "description": "Output size. Use square by default, landscape for wide compositions, and portrait for vertical compositions."
    },
    "n": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "default": 1,
      "description": "Number of images to generate. Choose based on the user's requested quantity or need for alternatives; omit when one image is enough."
    }
  },
  "required": ["prompt"],
  "additionalProperties": false
}
```

尺寸枚举在正式实现前必须用默认 DuckCoding endpoint 做一次脱敏契约确认。已由用户示例确认 `1024x1024`；如果其余两个尺寸不被当前网关支持，应收窄 enum，而不是把未验证值透传给上游。用户改用其他 Base URL 后，若其支持范围不同，应返回明确的 provider 参数错误，不在 V0 动态改变工具 schema。

### `n` 的选择规则

- 用户给出明确数量时，在 1 到 10 范围内原样遵循。
- 用户未给出数量时，schema 默认值为 1，模型可以根据“多个候选、不同构图、多个方向”等意图主动选择大于 1。
- 没有明显批量价值时使用 1。
- 超过 4 张通常应有明确的用户批量意图；不能仅因为上限是 10 就生成 10 张。
- `n` 不是字符串，也不接受小数。
- 超出范围时 executor 返回明确参数错误，不静默 clamp，避免实际费用和模型预期不一致。

### 暂不开放的上游参数

用户提供的接口说明还包含 `quality`、`style`、`response_format`。V0 不把它们加入工具 schema：

- `quality` / `style`：由上游默认值决定，减少模型无依据试参和跨模型兼容负担。
- `response_format`：属于 provider adapter 的传输细节，不是用户生成意图。adapter 必须同时解析 URL 和 Base64 两种常见返回形态。
- `model`：不作为单次工具参数；由设置页的模型名称统一决定，默认 `gpt-image-2`。这样主模型不能在每次调用时自行切换计费模型。

## 6. 工具描述规范

建议 definition 描述：

```text
Generate one or more new images from a text prompt using the configured image generation service.
Use this only when the user asks to create or generate images, visual concepts, illustrations, covers, or image variations.
Choose n from 1 to 10 based on the user's requested quantity and need for alternatives; omit n when one image is enough.
Use size to match square, landscape, or portrait composition.
Do not use this tool to search for existing images, analyze an existing image, or edit workspace files.
```

描述需要明确正向场景、数量选择和负面边界，避免模型把图片搜索、图片理解或文件编辑误路由到 `generate_image`。

## 7. Provider 请求与响应适配

V0 请求形态：

```http
POST <normalizedBaseUrl>/images/generations
Authorization: Bearer <IMAGE_GENERATION_API_KEY>
Content-Type: application/json
```

```json
{
  "model": "<configuredModel>",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1
}
```

adapter 负责：

1. 校验并规范化 Base URL、`prompt`、`size`、`n`。
2. 用规范化 Base URL 拼接固定路径 `/images/generations`，发起带超时和 turn abort signal 的请求。
3. 解析 `data[]`，兼容每项包含 `url` 或 `b64_json`。
4. URL 结果下载为本地文件；Base64 结果直接解码到本地文件。
5. 验证 MIME、响应大小和实际结果数量。
6. 返回轻量文本摘要和结构化 artifact 元数据。

### Base URL 规范化

- 设置字段填写 API 根地址，例如 `https://www.duckcoding.ai/v1`，不是完整的 `/images/generations` endpoint。
- trim 后必须是合法绝对 URL，只接受 `http:` 或 `https:`。
- 禁止 URL 内嵌用户名、密码、query 或 fragment。
- 保留必要路径前缀，例如 `/v1`；去掉末尾 `/` 后再拼接 `/images/generations`。
- 如果用户误填完整 endpoint，应返回“请输入 API Base URL”的明确错误，不产生双重路径。
- V0 允许用户配置本机或自托管 OpenAI-compatible 网关；使用非 HTTPS 地址时，设置页应提示 API Key 可能以明文网络流量传输。
- Base URL 本身不是秘密，可以进入 renderer 设置视图和 `settings.json`，但日志只记录脱敏后的 origin/host，不记录可能包含租户标识的完整路径。

### URL 下载安全

远程图片 URL 不是直接交给 renderer 的最终产物。adapter 必须先下载到本地，并遵守：

- 只允许 `https:`；拒绝 URL 内嵌用户名或密码。
- 拒绝 localhost、loopback、link-local 和私网目标，避免 provider 响应被利用为 SSRF 跳板。
- 只接受允许的图片 MIME，例如 PNG、JPEG、WebP。
- 设置单图和整批响应大小上限；建议单图不超过 25 MB、单次调用总量不超过 100 MB。
- 下载失败不能把短期 URL 当作成功产物持久化。

### 超时与重试

- 图片生成比普通搜索耗时更长，建议请求总超时为 180 秒。
- 用户停止 turn 时必须中止尚未完成的请求和下载。
- V0 不自动重试完整生成请求。图片请求可能已经被上游接受并计费，盲目重试会产生重复图片和重复费用。
- 认证、额度、限流和参数错误均不可自动重试。
- 网络或 5xx 错误返回可诊断但脱敏的失败信息，由用户或下一轮 Agent 决定是否重试。

### 部分成功

- `data[]` 中至少有一张图片成功保存时，工具可以返回部分成功。
- 如果上游返回少于请求的 `n`，保留已生成图片并在摘要中说明“请求 N 张，实际保存 M 张”。
- 单个条目无效不应让其他有效图片丢失。
- `data[]` 为空或没有任何图片成功保存时，工具整体失败。

## 8. 会话产物与持久化

图片属于会话产物，不属于工作区代码文件，也不应放进 7 天清理的通用 `tmp/tool-output`。

建议路径：

```text
<userData>/sessions/<sessionId>/artifacts/generated-images/<generationId>/
  image-01.png
  image-02.png
  ...
```

约束：

- `generationId` 使用进程内唯一 ID，不使用完整 prompt 作为目录或文件名。
- 先写同目录临时文件，再原子 rename，避免 session 中出现半张图片。
- 每张图片形成一个 `ToolArtifact`：`{ type: "image", name, path, mimeType }`。
- session event 只持久化路径、MIME、尺寸、模型、数量和脱敏摘要，不持久化 Base64。
- 会话 Fork 会复制整个 session 目录并重写内部路径，因此生成图片随 Fork 一起复制。
- 归档会话继续保留图片；未来若新增删除会话能力，应由会话目录删除统一回收产物。

## 9. 模型上下文边界

生成结果默认不把图片像素自动回填给下一次 LLM 调用，原因是：

- `n` 最大为 10，Base64 会显著膨胀上下文。
- 当前主模型可能是 text-only，直接注入图片会导致协议失败。
- 图片已经保存为可回读产物，模型通常只需要知道生成是否成功和文件位置。

模型回填建议：

```text
Generated 3 images with <configuredModel> at 1024x1024.
Artifacts:
- image-01.png
- image-02.png
- image-03.png
```

如果后续任务确实需要模型检查某张图片，支持视觉输入的模型可以显式调用 `read_file` 读取指定 artifact。不要把全部图片自动放进 `ToolResult.content`。

## 10. Key 配置与工具暴露

共享设置契约建议新增：

```ts
type ImageGenerationSecretId = "image-generation";
type SecretProviderId = LlmProviderId | SearchProviderId | ImageGenerationSecretId;

interface ImageGenerationSettingsView {
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
}

interface AppSettingsV2 {
  imageGeneration: ImageGenerationSettingsView;
}
```

配置边界：

- 设置页保留独立「图片生成服务」Section，默认只展示「已配置 / 未配置」、当前模型、Base URL host 和 Key 已本地保存的摘要；完整表单通过「立即配置 / 编辑配置」弹窗打开，避免低频配置长期占据页面空间。
- 首次配置弹窗直接展示 API Key；Base URL 与模型名称收进默认折叠的「高级设置」。已有 Key 只显示安全保存状态，不回显明文，用户主动选择「更换 Key」后才出现新的密码输入框。
- Base URL 默认预填 `https://www.duckcoding.ai/v1`；用户可以覆盖为其他 OpenAI-compatible API 根地址。
- 模型名称默认预填 `gpt-image-2`；接受 trim 后非空的字符串，不建立模型白名单，建议最大长度 200 且拒绝控制字符。
- 用户可以只修改 Base URL 或模型名称而不重新输入已保存的 Key；保存后下一轮 Runtime 使用新配置。
- 状态使用「已配置」而不是「已连接」：V0 保存时不发起连接探针，不能把本地存在 Key 误表述为上游鉴权已经验证。
- UI 只读取 `hasApiKey`，不读取旧 Key 明文，也不把 Key 写进 renderer store。
- Key 以明文写入 main-only `secrets.json` v2，文件权限固定为 `0600`；renderer 不读取文件或明文。
- Base URL 和模型名称规范化后写入 `settings.json`，不进入 `secrets.json`。
- main 读取 Key，并把 Key/Base URL/模型名称写入当前运行时的 `IMAGE_GENERATION_API_KEY` / `IMAGE_GENERATION_BASE_URL` / `IMAGE_GENERATION_MODEL` overlay。
- `agent-core/env.ts` 集中声明并读取这三个字段，executor 不直接散落读取 `process.env`。
- `ToolRuntimeConfig.hasImageGenerationKey` 为 true 时才注册 `generate_image`。
- 缺 Key 时 executor 仍保留防御性错误，但正常路径下模型看不到该工具，避免同一轮反复失败。
- V0 保存 Key 时不额外发起付费图片探针；第一次真实生成请求完成鉴权验证。

图片生成配置不加入 LLM provider 的代理、模型安装或余额逻辑。未来若具体 endpoint 提供稳定的免费鉴权探针或用量接口，再单独设计连接测试与用量展示。

## 11. Agent 暴露范围与调度

- V0 只向主 Agent 注册 `generate_image`。
- Kairos 默认不注册该工具，避免自治 tick 触发不可预期的付费生成。
- Explore 与通用 SubAgent 默认不注册；需要图片时由主 Agent 统一执行并管理产物。
- `isReadOnly` 设为 `false`：它会产生外部计费副作用并写入会话 artifact。
- 单次调用内部由 provider 批量生成 `n` 张，不让模型为了多张图片并行发起多个重复工具调用。
- V0 不增加二次审批弹窗；用户的图片生成请求视为本次调用授权。工具描述必须禁止无明确图片生成意图时主动调用。

## 12. 前端预览契约

新增稳定 preview：

```ts
type ImageGenerationPreview = {
  kind: "image_generation";
  status: "running" | "completed" | "partial" | "failed";
  displayText: string;
  promptPreview: string;
  requestedCount: number;
  generatedCount?: number;
  model: string;
  size: string;
  images?: Array<{
    name: string;
    path: string;
    mimeType: string;
  }>;
  warning?: string;
  errorMessage?: string;
};
```

生命周期：

- streaming / dispatched：参数不完整时展示单行 `Generate image…`。
- running：与 Read 同级展示 `Generate image · size · n · prompt · model`，使用文字 shimmer，不使用图标、边框卡片或行内缩略图。
- completed：立即按该 `toolCallId` 切换为 `Generated image · size · count · prompt · model`。
- partial：工具行展示实际数量 `generated/requested`；已成功图片仍进入本轮产物栏。
- failed：展示单行失败摘要，不产生图片产物行。

工具行和图片产物必须分层：

- `image_generation` 属于工具过程，进入 `Worked for` 分组，不在消息流中占据大面积媒体卡片。
- 最终回复后渲染本轮 `Artifacts` 组件，逐行展示图片文件名与 session-relative artifact 路径。
- 点击图片行后，renderer 通过 `session:read-artifact` IPC 请求 main 读取文件；main 必须校验文件位于当前 `<sessionId>/artifacts/` 子树、大小与真实图片签名，再返回单张 data URL。
- 悬浮图片产物行时展示完整绝对路径；右键菜单由 main 进程创建，支持打开、复制路径、复制图片与 Finder 定位。上下文菜单与预览共享同一 session realpath 边界，不扩大 renderer 的文件系统权限。
- renderer 禁止自行拼接或加载 `file://`，也不在聊天区预加载全部图片 Base64。
- 右侧 Image Tab 使用 `object-contain` 展示完整图片，不裁掉生成内容。
- 产物栏可同时展示本轮 `write_file` / `edit_file` 的完成输出，但不收录 Read/Grep 等输入对象。
- UI 颜色必须使用主题 token，浅色与深色主题都要验证。

Renderer 只消费 `MessageBlock`，不能从 raw tool args、raw provider response 或 Base64 反推图片列表。

## 13. 错误分类与用户提示

| 分类 | 典型情况 | 行为 |
|---|---|---|
| `invalid_request` | prompt 为空、size 不支持、n 越界 | 明确指出参数问题，不重试 |
| `model_not_found` | 配置的模型名称不存在或当前 endpoint 不支持 | 提示检查模型名称与 Base URL 的匹配关系 |
| `auth` | 401 / 403 | 提示检查图片生成 API Key 与 Base URL 是否匹配 |
| `quota` | 余额或额度不足 | 提示检查服务商额度，不重试 |
| `rate_limit` | 429 | 提示稍后重试，不自动重复计费请求 |
| `timeout` | 生成或下载超时 | 说明未确认生成状态，不自动重试 |
| `network` | DNS、连接或下载失败 | 返回脱敏网络错误 |
| `provider` | 5xx、响应 schema 异常 | 提示上游暂不可用或响应无效 |
| `storage` | artifact 目录创建或写盘失败 | 工具失败；不能只保留远程 URL 假装成功 |

错误信息不得包含：

- API Key 或 Authorization header。
- 上游完整响应正文。
- Base64 图片内容。
- 带签名或短期凭据的完整图片 URL。
- 不必要的用户本机绝对路径。

## 14. 可观测性

run log 可以记录：

- protocol：`openai-compatible`。
- 脱敏后的 endpoint origin/host。
- 实际配置的 model name。
- size、requestedCount、generatedCount。
- 请求耗时、下载耗时、整体状态和脱敏错误分类。
- 每张图片的字节数与 MIME，不记录图片正文。

不得记录完整 prompt 的场景包括 prompt 可能包含用户隐私或未公开产品资料。V0 最多记录长度、哈希或截断后的脱敏 preview；session 中的 tool args 仍属于本地会话事实，外发日志或截图前需要脱敏。

## 15. 实现位置建议

```text
packages/shared/src/settings.ts
  ImageGenerationSettingsView / ImageGenerationSecretId / SecretProviderId

packages/shared/src/session.ts
  image_generation preview / MessageBlock / ToolArtifact

packages/agent-core/src/env.ts
  IMAGE_GENERATION_API_KEY / IMAGE_GENERATION_BASE_URL / IMAGE_GENERATION_MODEL

packages/agent-core/src/tools/tools/generate-image/
  definition.ts
  executor.ts
  provider.ts

packages/agent-core/src/tools/exposure.ts
packages/agent-core/src/tools/index.ts
packages/agent-core/src/engine/create-agent-deps.ts
packages/agent-core/src/engine/bridge.ts
packages/agent-core/src/engine/streaming-preview-extractors.ts

packages/desktop/src/main/settings-service.ts
packages/desktop/src/main/session-artifact-service.ts
packages/desktop/src/renderer/components/settings/SettingsPage.tsx
packages/desktop/src/renderer/components/messages/ToolLogLine.tsx
packages/desktop/src/renderer/components/messages/TurnOutputArtifacts.tsx
```

provider 请求构造和响应解析放在薄 adapter 中，definition、网络传输、artifact 写盘和 UI preview 不应揉成一个大 executor。

## 16. 测试与验收

### Agent Core

- definition schema：`prompt` 必填，`n` 默认 1，范围 1 到 10，`additionalProperties: false`。
- exposure：有 Key 注册、缺 Key 不注册；Kairos / SubAgent 不注册。
- Base URL：默认值、用户覆盖、末尾斜线规范化、非法协议、内嵌凭据、query/fragment 和误填完整 endpoint。
- 模型名称：默认值、用户覆盖、空值、超长值和控制字符校验。
- 请求构造：使用配置后的 Base URL 与模型名称，正确传递 prompt / size / n。
- 参数错误：空 prompt、非法 size、`n=0`、`n=11`、小数和字符串。
- 响应解析：单 URL、多 URL、单 Base64、多 Base64、混合结果。
- 部分成功：请求 3 张只保存 2 张；单项失败不丢其他图片。
- 错误分类：auth、quota、rate limit、timeout、network、5xx、无效 JSON、空 data。
- 安全：日志与 session 序列化结果不包含 Key、Authorization、Base64 或签名 URL。
- 中止：turn abort 能停止生成请求和未完成下载。

所有自动化测试使用 fake fetch 和临时目录，不依赖真实 Key、真实网络或真实费用。

### Shared / Desktop

- settings：图片生成 Key 只返回 `hasApiKey`，Base URL 与模型名称可读写，Key 加密存储与清除路径正确。
- session selectors：running / completed / partial / failed preview 都能恢复。
- renderer：图片工具单行状态、长 prompt 截断、本轮产物栏、点击加载与右侧 Image Tab。
- session artifact：合法图片读取、越界路径、逃逸 symlink、伪造扩展名和大小上限。
- tool lifecycle：每个 `toolCallId` 完成后立即更新自己的图片块。
- 主题：浅色、深色和系统主题下无字面量颜色回归。
- Fork：图片目录被复制，持久化路径重写后仍可预览。

### 真实验收

真实 DuckCoding 验收由用户通过设置页输入 Key，并保留默认 Base URL 与 `gpt-image-2`：

1. 生成 1 张 `1024x1024` 图片。
2. 生成 3 张图片，确认 `n` 与 UI 网格。
3. 验证至少一种非方形尺寸；若 provider 不支持则收窄 schema enum。
4. 断开 Key，确认下一轮不再暴露 `generate_image`。
5. 修改为另一个可用的 OpenAI-compatible Base URL 和对应模型名称，确认请求切换且不需要重新显示旧 Key。
6. 输入无效模型名称，确认返回可诊断错误且不修改工具 schema。
7. 检查 `session.jsonl`、run log 和 settings 文件没有 Key、Authorization、Base64 或签名 URL；`settings.json` 只包含非敏感 Base URL 与模型名称。

## 17. 后续演进

V1 可以引入：

- `ImageProviderId` / `ImageModelDefinition` / `ImageProviderRuntimeConfig`。
- 多图片服务商与图片模型目录。
- 图片模型目录、模型能力元数据、下拉选择和 quality/style/output format 偏好。
- 图片编辑、参考图、透明背景和蒙版。
- 图片资产库、复制到 workspace、导出与删除。
- 用量和成本统计。
- 高数量或高成本生成的显式审批策略。

升级时保持 `generate_image(prompt, size, n)` 的基础语义稳定；新增参数应是可选能力，不要求历史模型调用和 session 事件迁移后才能恢复。

## 18. 决策记录

- 2026-07-27：图片生成作为独立 Agent 工具，不并入主 LLM Provider Registry，也不混入网络搜索 provider 类型。
- 2026-07-27：V0 使用一份用户可配置的 OpenAI-compatible 图片连接；DuckCoding 是默认 Base URL，API Key、Base URL 与模型名称都在设置页提供，模型名称默认 `gpt-image-2`。
- 2026-07-27：`n` 由模型按用户意图选择，默认 1，合法范围 1 到 10；越界直接报错，不静默修正。
- 2026-07-27：生成图片保存为 session artifacts，消息流展示本地产物；不把 Base64 或短期 URL 持久化。
- 2026-07-27：图片默认不作为 `ToolResult.content` 自动注入模型上下文，需要检查时再由视觉模型显式读取。
- 2026-07-27：V0 只向主 Agent 暴露，不向 Kairos、Explore 或通用 SubAgent 默认开放付费生成能力。
- 2026-07-28：工具执行状态改为 Read 风格单行日志；生成图片不再直接占据消息流，而是在最终回复后的本轮产物栏中展示。
- 2026-07-28：开发态 renderer 不加载 `file://`；点击图片时通过按 session artifacts 边界校验的 IPC 返回单张 data URL，再在右侧面板打开。
- 2026-07-28：Artifacts 行新增完整路径 Tooltip 和 main-owned 原生右键菜单；系统操作仍只允许当前 session artifacts 或 workspace 边界内的真实文件。
