## [2026-08-01 15:47] | Task: Add configurable image inspection

### Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop workspace

### User Query

> 为 text-only 主模型增加按需图片分析工具；在设置页选择 Kimi K2.7 Code 或 OpenRouter GPT-5.6 Luna，并把完整、稳定的视觉文字上下文交回主模型。

### Changes Overview

**Scope:** `@actspace/shared`, `@actspace/agent-core`, Desktop main / renderer, architecture and reliability docs.

**Key Actions:**

- 新增 `inspect_image(path, question)`，使用独立视觉 LLM、固定分层提示词和版本化工具结果 envelope。
- 默认使用 OpenRouter `openai/gpt-5.6-luna`，可切换 Kimi `kimi-k2.7-code`；只引用 Provider 已有默认或附加 Key。
- 仅为 text-only 主模型按需暴露工具；原生视觉主模型直接接收图片，Chat / Kairos / Explore 不接入。
- 图片读取限制在 workspace、当前轮附件和当前 session artifacts，并校验 `realpath`、普通文件、20 MiB 上限及 JPEG / PNG / WebP 文件签名。
- 设置页在图片生成配置附近增加视觉模型与已有 Key 选择，明确图片会发送给所选 Provider。
- 补齐配置迁移、凭据引用保护、工具曝光、附件提示、输入边界、上下文封装和设置页测试。

### Design Intent (Why)

图片分析是一次显式工具委托，不是给 text-only 主模型伪造原生多模态能力。独立视觉调用不携带主会话历史；视觉模型只负责观察，工具再把结果整理成“整体概念、问题答案、详细证据”三层上下文，让主模型能理解图片，同时保持费用、Provider、数据边界和失败行为可解释。

### Files Modified

- `packages/shared/src/image-inspection-config.ts`
- `packages/shared/src/settings.ts`
- `packages/agent-core/src/tools/tools/inspect-image/`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/runtime/agent-runtime.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/model-runtime-service.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `docs/design-docs/tool-system/agent-image-inspection-tool.md`

### Verification

- Shared、Agent Core 与 Desktop 类型检查通过。
- Agent Core 定向测试通过，覆盖视觉上下文、路径授权、格式 / 大小、曝光和附件提示。
- Desktop 定向测试通过，覆盖默认 Luna、Kimi 切换、多 Key 引用保护和设置页交互。
- 后续在 `main` 的唯一开发运行实例上通过 Computer Use 完成 Electron 设置 UI 验收：浅色 / 深色主题、Luna / Kimi 选择、图片分析工具启停、跨页面状态和 renderer 重载持久化均符合预期；验收后恢复 Luna、工具开启和浅色主题。
- 开发日志未出现图片分析相关 renderer / main 异常；仅有未连接 Provider 导致的预期不可用状态。由于本机未连接 Kimi / OpenRouter，真实工具运行预览和付费调用仍未执行。
