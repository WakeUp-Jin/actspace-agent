## [2026-08-02 11:05] | Task: 统一本地凭据存储

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 开发版和本地安装版共用一份本地配置；说明现状、风险与权限差异后，将服务商、URL、模型和 Key 稳定保存在本地，避免更新或切换版本后重复填写。Key 可以明文保存，但凭据文件应限制访问权限。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`、凭据安全文档、设置页设计和发布记录。

**Key Actions:**

- **[明文 v2]**: 将 Desktop Key 从依赖应用身份的 `safeStorage` 密文迁移为 main-only `secrets.json` v2 明文；开发版与安装版继续共用同一 `userData`。
- **[权限与原子写]**: 凭据临时文件和目标文件统一使用 `0600`；加载已有 v2 时自动收紧旧权限。
- **[失败保护]**: 旧 v1 只有在所有字段完整解密后才写入 v2；读取、格式、权限或迁移失败会保留原文件并阻止新增、替换、删除凭据。
- **[进程边界]**: renderer 和 preload 仍只接收 `hasApiKey` 与脱敏存储状态，不读取明文、文件正文或迁移细节。
- **[设置页状态]**: 凭据不可用时显示明确告警，禁用添加服务并隐藏误导性的未配置空状态。

### 🧠 Design Intent (Why)

开发版与安装版使用不同应用身份时，系统密钥串密文可能无法跨身份解密；把同一用户目录内的 Key 改为严格权限的明文文件，可以让本地开发、更新和正式使用共享稳定配置。代价是放弃静态加密，因此必须明确 `0600` 的边界，并通过 main-only 访问、日志脱敏、全量迁移和故障时禁止写回来控制风险。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/main/test/settings-service.test.ts`
- `packages/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/SECURITY.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/design-docs/model-context/agent-duckcoding-multi-key-model-catalog.md`
- `docs/design-docs/tool-system/agent-image-generation-tool.md`
- `docs/design-docs/tool-system/agent-web-tools.md`
- `docs/releases/feature-release-notes.md`
