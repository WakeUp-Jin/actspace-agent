# 图片生成工具 V0 Execution Plan

## 目标

实现主 Agent 的 `generate_image` 工具：用户在设置页配置 OpenAI-compatible 图片服务的 API Key、Base URL 和模型名称后，Agent 可按 `prompt / size / n` 生成 1–10 张图片，将结果持久化到当前 session artifacts，并在消息流中恢复和展示多图预览。

设计事实来源：`docs/design-docs/tool-system/agent-image-generation-tool.md`。

## 范围

- 包含：
  - shared settings/session/IPC 契约。
  - Electron main 的安全密钥持久化、非敏感图片配置和 Runtime 注入。
  - agent-core 的 provider adapter、参数校验、请求中止、URL/Base64 响应解析、artifact 原子写盘和工具门控。
  - bridge、streaming preview、session 恢复与 renderer 图片生成块。
  - 设置页 API Key、Base URL、模型名称配置。
  - fake fetch/临时目录测试、文档同步与 history。
- 不包含：
  - 图片编辑、参考图、蒙版、质量/风格参数。
  - 图片 provider/model registry、模型目录或用量统计。
  - Kairos、Explore、通用 SubAgent 的图片生成能力。
  - 真实付费 API 自动化调用。

## 背景

- 必读文档：
  - `docs/design-docs/tool-system/agent-image-generation-tool.md`
  - `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
  - `docs/SECURITY.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/shared/src/settings.ts`
  - `packages/shared/src/session.ts`
  - `packages/shared/src/session-selectors.ts`
  - `packages/shared/src/ipc.ts`
  - `packages/desktop/src/main/settings-service.ts`
  - `packages/desktop/src/main/model-runtime-service.ts`
  - `packages/desktop/src/main/agent-turn.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/agent-core/src/env.ts`
  - `packages/agent-core/src/tools/`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- 已知约束：
  - API Key 只进 `safeStorage` / main / agent-core，不进 renderer 明文、session 或日志。
  - Base URL 与模型名称保存在 `settings.json`，默认分别为 `https://www.duckcoding.ai/v1` 和 `gpt-image-2`。
  - `n` 必须是 1–10 的整数，越界报错，不静默修正。
  - 图片不自动作为 Base64 注入模型上下文；工具只回填 artifact 摘要。
  - 单个 `tool_finished` 按 `toolCallId` 立即完成，不能等待同批其他工具。

## 风险

- 风险：OpenAI-compatible 网关返回 URL 或 Base64 的 schema 存在差异。
  - 缓解：adapter 同时支持 `url` / `b64_json`，无有效图片时返回结构化 provider 错误。
- 风险：生成请求已计费但客户端超时，自动重试会重复消费。
  - 缓解：executor 不自动重试；turn abort 直接中止请求与下载。
- 风险：短期图片 URL 失效或泄露签名参数。
  - 缓解：下载到 session artifact 后才算成功，session/log 不持久化远程 URL。
- 风险：多图 Base64 膨胀上下文和 session。
  - 缓解：图片只落盘；preview 只保存路径/MIME/尺寸等元数据。
- 风险：renderer 读取本地图片路径失败。
  - 缓解：复用现有 attachment 的 file URL 规则并补图片加载失败状态测试。

## 里程碑

1. Shared 契约与 Settings 数据地基。
2. Main Runtime 配置与 agent-core 工具实现。
3. Bridge/session/renderer 多图预览与设置 UI。
4. 回归测试、文档/history 和分层验收。

## 实施步骤

### Step 1：Shared 契约与设置迁移

- 在 `settings.ts` 增加 `ImageGenerationSettingsView`、secret id、默认值和 update 输入。
- 在 `session.ts` 增加 `image_generation` preview 与 MessageBlock；复用 `ToolArtifact` 表达图片产物。
- 在 `session-selectors.ts` 增加 preview → MessageBlock 恢复。
- 在 IPC/preload 契约增加图片配置保存能力，Key 与非敏感字段分离。
- 验证：shared typecheck 与 settings/session selector 单测。

### Step 2：Main 设置服务与 Runtime 注入

- `settings-service.ts` 迁移旧 settings，为 `imageGeneration` 补默认 Base URL/model。
- Key 写 `secrets.json`，Base URL/model 写 `settings.json`；校验 URL、模型名称和错误回滚。
- `model-runtime-service.ts` 返回图片工具运行环境，包含 `hasImageGenerationKey` 及 main-only runtime config。
- `agent-turn.ts` 为当前 session 注入 artifact root。
- 验证：settings-service/model-runtime tests，不读取真实 Key。

### Step 3：Agent Core 工具

- 新增 `generate-image/definition.ts`、`provider.ts`、`executor.ts`。
- 使用配置的 Base URL/model；请求固定 `/images/generations`，支持 `url` / `b64_json`。
- 校验 MIME、大小、URL 安全和 `n`；原子写入 session artifacts。
- 增加 `requiresKey: "imageGeneration"`、main Agent 注册门控和 abort signal 传递。
- 结果返回短文本 + structured preview/artifacts，不返回图片 Base64 content。
- 验证：fake fetch provider/executor/exposure/create-agent-deps tests。

### Step 4：Bridge、持久化与 Renderer

- 新增 `image_generation` streaming/final preview 创建逻辑。
- tool result 持久化图片 artifacts，并由 session selector 恢复。
- 新增 `GeneratedImageBlock`：running shimmer、单图、2–4 双列、5–10 响应式网格、partial/failure 状态。
- 设置页增加独立图片生成 Section，配置 API Key/Base URL/model；只使用主题 token。
- 验证：renderer component、streaming lifecycle、session recovery 和 settings tests。

### Step 5：收尾

- 更新设计文档状态、`SECURITY.md`、storage/current-module 文档与必要导航。
- 新增 `docs/histories/2026-07/` history。
- 按学习沉淀门槛检查是否需要 `docs/learnings/2026-07/`。
- 运行分层验证并记录真实限制。

## 验证方式

- 目标测试：
  - shared settings/session tests。
  - agent-core generate-image/exposure/create-agent-deps/bridge tests。
  - desktop settings-service/settings page/message rendering tests。
- 工程命令：
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm test`
  - `pnpm check:frontend-theme`
  - `pnpm check:docs`
  - `pnpm check:secrets`
  - `git diff --check`
- 手工检查：
  - 浏览器 renderer 验证 settings 三字段、1/多图布局和浅深主题。
  - Electron 真实链路需要用户输入真实 Key 后确认 IPC、写盘、session 恢复和图片显示；实现阶段不写入或记录真实凭据。
- 观测检查：
  - session/run log/settings/secrets 序列化扫描不含 Key、Authorization、Base64 或签名 URL。

## 进度记录

- [x] 设计规范确认。
- [x] Shared 契约与设置迁移完成。
- [x] Main Runtime 配置完成。
- [x] Agent Core 工具完成。
- [x] Renderer 设置与图片预览完成。
- [x] 自动化验证、文档与 history 完成。
- [ ] 真实 DuckCoding 与 UI 手工验收由用户后续完成（用户明确不要求本轮自动操作 UI）。

## 决策记录

- 2026-07-27：V0 使用单例 OpenAI-compatible 图片连接，不建立 provider/model registry。
- 2026-07-27：API Key、Base URL、模型名称由用户配置，默认 Base URL 为 DuckCoding、默认模型为 `gpt-image-2`。
- 2026-07-27：`n` 由模型选择，默认 1、最大 10；一次工具调用只发一次批量请求。
- 2026-07-27：图片保存到 session artifacts，不自动注入 LLM 上下文。
- 2026-07-27：URL 返回只接受 HTTPS 公网目标；单图上限 25 MB、单批上限 100 MB，不持久化上游 URL。

## 实际验证结果

- `pnpm run typecheck`：通过（shared、agent-core、agent-cli、desktop）。
- 图片工具/曝光/流式 preview targeted tests：26 项通过。
- shared session selector targeted tests：15 项通过。
- desktop settings/settings page/streaming/generated image targeted tests：67 项通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:secrets`、`git diff --check`：通过。
- 曾运行 agent-core 全量测试：本次相关测试通过；整套仍有一个与本改动无关的 manager 旧断言失败，以及 sandbox 下 Unix socket `listen EPERM`。本轮未修改这些路径。
- 按用户要求未启动或操作 UI；真实 Key、DuckCoding 付费请求、浅深主题与 Electron 图片显示留给用户手工验收。
