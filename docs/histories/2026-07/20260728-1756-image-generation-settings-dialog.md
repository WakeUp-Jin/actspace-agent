## [2026-07-28 17:56] | Task: 精简图片生成服务配置交互

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 将图片生成服务的大型内联配置表单改为更简单的展示，并通过弹窗填写和编辑连接信息。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、设置页测试与图片生成设计文档

**Key Actions:**

- **摘要卡片**：设置页只显示配置状态、模型、服务地址 host 和 Key 安全保存状态，减少低频表单对页面的占用。
- **配置弹窗**：首次配置直接填写 API Key，Base URL 与模型名称放入默认折叠的高级设置；已保存 Key 不回显，主动点击后才能进入更换状态。
- **状态语义**：将「已连接 / 未连接」改成「已配置 / 未配置」，避免在没有连接探针时错误表达上游可用性。
- **交互完整性**：弹窗支持焦点约束、Esc 关闭、焦点恢复、保存错误、HTTP 警告，以及在弹窗内断开服务。
- **回归覆盖**：新增未配置保存、已配置不回显、更换 Key 和断开服务的 renderer 测试。

### 🧠 Design Intent (Why)

图片服务配置属于低频操作，长期展示三个输入框会让服务商页面显得沉重。摘要卡片保留日常判断所需的信息，弹窗承载完整编辑流程；同时把“本地有配置”和“远端连接已验证”拆成不同概念，避免状态文案给用户错误承诺。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/tool-system/agent-image-generation-tool.md`

### ✅ Validation

- `pnpm --filter @actspace/desktop test`：65 个测试文件、529 个测试通过。
- `pnpm typecheck`：workspace 类型检查通过。
- `pnpm build`：CLI、shared、agent-core、renderer 与 Electron 构建通过；保留既有 Vite 大 chunk 警告。
- `pnpm check:frontend-theme`：主题颜色契约通过。
- `pnpm check:docs`：文档骨架检查通过。
- `git diff --check`：通过。
- 本地 Vite Renderer 启动成功，但应用内浏览器未能附着本地页面，因此未宣称完成视觉截图或 Electron 真实 IPC 验收。
