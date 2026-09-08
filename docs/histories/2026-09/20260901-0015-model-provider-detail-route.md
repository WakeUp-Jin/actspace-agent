## [2026-09-01 00:15] | Task: 模型连接列表与详情路由

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行模型页面的 Maka 风格重构。

### 🛠 Changes Overview

- Provider 连接卡片改为 Maka 风格的窄列布局，服务商名称可进入连接详情。
- “添加服务”改为页内目录路由，支持搜索服务商，选择后进入现有连接配置表单。
- 新增模型连接详情路由，提供返回连接列表、测试连接、编辑连接、移除服务、余额和连接事实摘要。
- 保留原有编辑 Dialog，避免影响现有凭据、代理和 Management Key 保存流程。
- 新增详情路由、目录搜索与返回测试，覆盖列表、目录、详情之间的交互契约。

### ✅ Verification

- `pnpm exec vitest run src/renderer/test/provider-model-settings.test.tsx src/renderer/test/settings-page.test.tsx`：39 个测试通过。
- `pnpm --filter @actspace/desktop run typecheck`：通过。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `docs/exec-plans/completed/20260830-actspace-settings-center-refactor/README.md`
