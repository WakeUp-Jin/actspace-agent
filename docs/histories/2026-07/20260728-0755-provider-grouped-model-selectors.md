## [2026-07-28 07:55] | Task: 按供应商分组模型选择器

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 模型选择器按供应商分组，避免不同供应商存在同名模型时无法辨识。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、模型与前端设计文档

**Key Actions:**

- **供应商分组**：Composer 模型菜单按 DeepSeek、Kimi、OpenRouter 分组，搜索后自动隐藏空分组。
- **重名消歧**：候选存在跨供应商同名模型时，折叠态追加供应商名称；同一供应商内部仍重名时追加 API model ID。
- **选择器统一**：默认会话、轻量任务、Explore 与 Kairos 的原生 Select 使用相同分组与重名显示规则。
- **回归覆盖**：新增跨供应商同名模型的 Composer 与任务模型选择测试。

### 🧠 Design Intent (Why)

模型运行时已经通过 provider-qualified key 保证唯一身份，但平铺的显示名称无法让用户确认请求将由哪家供应商执行。分组解决菜单浏览问题，条件式追加供应商则保证菜单收起后仍可确认选择，同时避免所有模型常驻重复信息。

### 📁 Files Modified

- `packages/desktop/src/renderer/model-option-groups.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`

### ✅ Validation

- `pnpm --filter @actspace/desktop test`：61 个测试文件、495 个测试通过。
- `pnpm typecheck`：workspace 类型检查通过。
- `pnpm build`：CLI、shared、agent-core、renderer 与 Electron 构建通过。
- `pnpm check:frontend-theme`：主题颜色契约通过。
- `pnpm check:docs`：文档骨架检查通过。
- 浏览器 renderer：确认供应商分组可见，搜索 `kimi` 后只保留 Kimi 分组；未启动 Electron，不宣称真实 IPC 验收。
