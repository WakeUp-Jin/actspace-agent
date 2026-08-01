# 图片分析工具实施计划

## 目标

实现可由文本主模型按需调用的 `inspect_image` 工具：用户能在设置页选择 Kimi `kimi-k2.7-code` 或 OpenRouter `openai/gpt-5.6-luna` 及对应已有凭据；工具安全读取已授权本地图片，调用视觉模型，并把完整、稳定、可审计的文字观察返回给主模型。

## 范围

- 包含：共享设置契约、视觉模型候选、Provider 凭据复用、图片路径与格式校验、视觉模型调用、固定 system prompt、稳定输出、工具曝光、文本模型附图提示、工具预览、设置页、自动化测试和文档同步。
- 不包含：自动分析所有附件、自动跨 Provider fallback、视频/音频/PDF/SVG/GIF/HEIC、远程 URL、Kairos/Explore/Subagent 接入、图片编辑、模型质量自动路由。

## 背景

- 设计规范：`docs/design-docs/tool-system/agent-image-inspection-tool.md`。
- 工具预览规范：`docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`。
- 图片生成设置参考：`docs/design-docs/tool-system/agent-image-generation-tool.md`。
- Provider 与模型契约：`packages/shared/src/model-config.ts`、`packages/shared/src/settings.ts`、`packages/desktop/src/main/settings-service.ts`、`packages/desktop/src/main/model-runtime-service.ts`。
- Agent 配置链：`packages/desktop/src/main/desktop-agent-runtime.ts`、`packages/agent-core/src/engine/create-agent-deps.ts`、`packages/agent-core/src/runtime/agent-runtime.ts`。
- 工具系统：`packages/agent-core/src/tools/types.ts`、`packages/agent-core/src/tools/manager.ts`、`packages/agent-core/src/tools/exposure.ts`、`packages/agent-core/src/tools/output-truncator.ts`。
- 附件提示：`packages/agent-core/src/adapters.ts`。
- UI：`packages/desktop/src/renderer/components/settings/SettingsPage.tsx` 及相邻设置组件与测试。
- 已知约束：renderer 不接收明文密钥；共享声明变更后先构建 `@actspace/shared`；自动化测试不等于 Electron 或真实 Provider 验收。

## 实施原则

- 工具 definition、执行器、Provider-neutral 调用服务、输入校验和输出整形分离。
- 视觉能力配置只引用现有 Provider 凭据，不复制密钥生命周期。
- 路径以运行时重新解析后的真实路径为准，renderer 与主模型都不能扩大允许范围。
- 付费视觉调用最多发起一次；失败不隐式换模型或重试。
- 视觉模型回答直接保留给主模型，但先执行明确的 20,000 字符硬上限。
- 所有 UI 颜色使用现有语义 token，浅色和深色主题共同验收。

## 风险

| 风险 | 缓解方式 |
|---|---|
| 图片内容被发送到非预期 Provider | 设置页显式显示 Provider/模型，工具输出记录模型，禁止自动 fallback |
| 模型利用任意路径外传本地图片 | 只允许 workspace、当前轮注册附件、当前 session artifact；`realpath` 后复验 |
| 图片提示词注入影响视觉模型 | 固定 system prompt 把图片定义为不可信证据；加入注入回归样例 |
| 视觉回答过短，文本主模型缺少上下文 | 固定“整体概念 + 问题答案 + 六类细节”分层输出、典型长度目标与 prompt 测试 |
| 视觉回答过长挤占上下文 | 执行器 20,000 字符硬上限，明确截断，不再调用摘要模型 |
| 通用工具截断再次压缩结果 | `preserveModelOutput: true`，覆盖回归测试 |
| Provider 超时或重复计费 | 90 秒超时、abort 透传、失败不自动重试 |
| 同名 Luna 选择到 DuckCoding | 候选注册表使用 provider-qualified key，OpenRouter 固定 `openai/gpt-5.6-luna` |
| 删除仍被引用的附加 Key | SettingsService 引用完整性校验阻止删除 |

## 里程碑

### 1. 共享配置与迁移

1. 在 `packages/shared/src/image-inspection-config.ts` 新增两项受控候选、provider-qualified key、默认项和显示元数据。
2. 在 `packages/shared/src/settings.ts` 增加 `ImageInspectionSettings`，为旧设置迁移出安全默认值，并从共享 barrel 导出。
3. 如设置读写走专用 IPC，在 `packages/shared/src/ipc.ts` 增加最小契约；不把解析后的 Key 或 Provider runtime 暴露给 renderer。
4. 为默认值、未知模型回退、Kimi/OpenRouter 候选和 `credentialId` 往返增加共享测试。

### 2. Desktop Provider 解析

1. 在 `packages/desktop/src/main/settings-service.ts` 复用 `getProviderRuntimeConfigForCredential`，按图片分析配置解析默认或附加 Key。
2. 扩展凭据删除保护：当 `imageInspection.credentialId` 引用该 Key 时拒绝删除。
3. 在 `packages/desktop/src/main/model-runtime-service.ts` 增加图片分析模型解析，返回模型定义与 main-only Provider runtime。
4. 在 `packages/desktop/src/main/desktop-agent-runtime.ts` 将已解析视觉模型注入本轮 Agent config，不把密钥写入 request、session 或 renderer。
5. 增加 Provider 未配置、凭据失效、OpenRouter Luna 精确 ID、Kimi 精确 ID和多 Key 选择测试。

### 3. 当前轮图片授权范围

1. 扩展 `packages/agent-core/src/runtime/agent-runtime.ts` 的 runtime context，携带当前轮图片附件真实路径和当前 session artifact 根目录。
2. workspace 根目录继续由 main-owned runtime 提供；工具执行时才根据 `path` 解析目标。
3. 新增可独立测试的路径校验器：普通文件、`realpath` containment、精确附件匹配和 artifact containment。
4. 覆盖相对路径、允许的绝对附件、`..`、符号链接逃逸、目录、管道和不存在文件测试。

### 4. 视觉调用服务与固定提示词

1. 在 `packages/agent-core/src/tools/tools/inspect-image/` 新增 `definition.ts`、`prompt.ts`、`image-input.ts`、`service.ts`、`executor.ts`。
2. `definition.ts` 定义 `inspect_image({ path, question })`、严格 schema、只读属性和清晰使用边界。
3. `prompt.ts` 保存设计文档中的固定 system prompt，避免散落字符串，并增加完整快照测试。
4. `image-input.ts` 校验 JPEG/PNG/WebP 文件签名、普通文件和 20 MiB 上限，生成仅驻留内存的 data URL。
5. `service.ts` 通过现有 `LLMService` / OpenAI-compatible message API 发起单次调用：Kimi 开启 thinking，OpenRouter Luna 使用 `medium` reasoning。
6. 请求只发送 system prompt、question、安全文件名和图片；不带主会话历史、主 prompt 或工具表。
7. 90 秒超时与 turn abort signal 合并；任何失败都不自动重试或切换 Provider。
8. `executor.ts` 处理空响应、错误映射、20,000 字符截断、结构化元数据和 `preserveModelOutput`。
9. 覆盖两种 Provider 请求形状、超时、abort、空响应、错误脱敏、截断和不泄露 Base64 的测试。

### 5. 工具注册、曝光与主模型提示

1. 在工具 barrel 与 `packages/agent-core/src/tools/manager.ts` 注册 definition/executor，并为执行器注入专用视觉 LLM service 与允许路径。
2. 扩展 `packages/agent-core/src/tools/types.ts` 和 Agent config，使图片分析能力采用独立、可选的 runtime contract。
3. 在 `packages/agent-core/src/tools/exposure.ts` 实现曝光规则：Agent/Plan 可用，Chat/Kairos/Explore/Subagent 不可用，原生视觉主模型默认不暴露。
4. 修改 `packages/agent-core/src/adapters.ts`：文本模型收到图片时，若工具可用则提示按需调用 `inspect_image`；只有工具不可用时才建议切换原生视觉模型。
5. 复用 `media_analysis` preview kind；更新 streaming preview extractor，使 `path` 能生成安全文件名状态。
6. 更新工具目录元数据与相关 renderer 工具日志映射，不为同一预览语义增加第二套卡片。
7. 增加模式过滤、原生视觉模型、配置不可用、文本模型附件提示和工具生命周期测试。

### 6. 设置页与 IPC

1. 在现有 Settings main/preload 边界中加入图片分析设置读写，renderer 只接收模型元数据和凭据引用摘要。
2. 在 `packages/desktop/src/renderer/components/settings/SettingsPage.tsx` 的图片生成区域附近增加“图片分析”配置。
3. 使用模型选择器和已有 Key 选择器；当只有默认 Key 时不增加多余步骤。工具启停复用现有 Agent 工具开关，不增加第二个状态源。
4. Provider 未配置时显示明确不可用原因和前往 Provider 设置入口；不在图片分析区域输入或创建 Key。
5. 更新 preload 类型、renderer 测试和 Settings IPC 测试。
6. 按 `docs/design-docs/frontend/front-设置页规范.md` 和主题规范检查布局、文案、键盘操作、焦点、浅色/深色状态。

### 7. 文档、历史与学习判断

1. 实现完成后更新 `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`，删除“没有视觉辅助工具”的过期事实并说明显式委托边界。
2. 按实际实现更新 `docs/SECURITY.md`、`docs/RELIABILITY.md` 与 `docs/design-docs/agent-runtime/agent-current-module-map.md`。
3. 在 `docs/histories/` 记录功能、配置迁移、验证结果和未完成的真实 Provider 验收。
4. 对照 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`，完成脱敏与质量分层检查。
5. 本任务涉及不可信多模态输入、外部数据发送和工具输出上下文治理，满足学习文档条件；读取 `docs/learnings/WRITING_GUIDE.md` 后沉淀一篇可迁移的设计学习。

## 验证方式

### 自动化命令

实现时先从变更覆盖到全局检查逐步扩大：

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/agent-core exec vitest run <inspect-image-test-files>
pnpm --filter @actspace/desktop exec vitest run <settings-and-runtime-test-files>
pnpm check:frontend-theme
pnpm check:docs
pnpm check:secrets
git diff --check
```

若共享包实际没有独立测试脚本，则使用仓库现有 Vitest 配置运行对应测试文件，不为本任务临时发明第二套测试入口。

### 自动化场景

- 配置迁移、默认 Luna、Kimi 切换与多 Key 引用。
- 工具 schema、模式曝光和原生视觉主模型排除。
- 三类允许来源与全部路径逃逸情况。
- 文件签名、格式、尺寸和普通文件约束。
- 两个 Provider 的模型 ID、消息结构、thinking/reasoning 参数。
- prompt 分层结构、注入防护文字和 OCR 完整性规则。
- 超时、取消、空响应、错误脱敏、输出截断与保留模型输出。
- 文本模型附件提示、工具预览和 session/log 脱敏。
- Settings IPC、preload 类型、禁用态和凭据删除保护。

### 手工检查

- 浏览器 mock：设置区域的默认、Kimi、Luna、未配置、多 Key、禁用和错误状态；浅色/深色主题。
- Electron：真实设置持久化、工具运行中/完成/失败/取消预览，以及重启后的配置恢复。
- 图片集：OCR、复杂 UI、图表、照片、低清图片、超长文字和图片内提示词注入。
- 真实 Provider：由用户在自己的 Kimi 与 OpenRouter 凭据下各运行一次，确认能力、费用和错误映射。自动化和 mock 通过不能宣称这一步完成。

### 观测检查

- 日志可定位 Provider、模型、耗时、字节数、输出字符数和错误类别。
- 日志、session、renderer props 和工具预览中均不出现 API Key、Base64 或完整绝对路径。
- 失败不会出现第二次视觉请求或隐式 Provider 切换。

## 回滚方式

- 使用现有 Agent 工具开关禁用 `inspect_image`，即可停止曝光且不影响其他工具。
- 代码回滚按“设置契约 / Desktop 解析 / Agent 工具 / Renderer”切片执行，不删除或重写用户现有 Provider 凭据。
- 若新配置字段需要移除，旧版本应忽略未知字段；不通过 destructive migration 修改用户设置文件。

## 进度记录

- [x] 2026-08-01：确认按需调用、两种视觉模型、OpenRouter Luna 归属、凭据复用和不自动 fallback。
- [x] 2026-08-01：完成长期设计规范、固定视觉 system prompt 与实施计划初稿。
- [x] 完成共享配置、迁移和 Desktop Provider 解析。
- [x] 完成图片授权、格式校验、视觉调用服务和执行器。
- [x] 完成工具注册、曝光、附件提示和预览。
- [x] 完成设置页读写、模型 / 已有 Key 选择和 renderer 自动化测试。
- [x] 完成定向自动化与文档收尾。
- [ ] 完成浏览器 mock 视觉检查与 Electron 验收。
- [ ] 由用户完成 Kimi 与 OpenRouter 真实 Provider 付费验收。

## 决策记录

- 2026-08-01：工具命名为 `inspect_image`，由 `question` 区分 OCR、UI 检查和整体理解，避免拆成多个重叠工具。
- 2026-08-01：默认 OpenRouter `openai/gpt-5.6-luna`，Kimi `kimi-k2.7-code` 为同级选项；不与 DuckCoding 同名 Luna 混用。
- 2026-08-01：用户附图不自动调用，所有视觉调用由 Agent 按需、可见地发起。
- 2026-08-01：图片分析配置复用 Provider 已有默认 Key 或附加 Key，设置页只做选择；启停继续使用现有 Agent 工具开关。
- 2026-08-01：视觉输出采用“整体识别概念 + 问题答案 + 六类细节证据”的分层结构，外层由工具包装成版本化 envelope；图片文字始终视为不可信证据。
- 2026-08-01：不使用自动跨 Provider fallback，也不对失败的付费请求做隐式重试。
