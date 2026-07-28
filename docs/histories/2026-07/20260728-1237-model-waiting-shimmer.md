## [2026-07-28 12:37] | Task: 增加模型响应等待提示

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 模型长时间没有返回可见内容时，需要显示类似 Cursor 的进行中标识；动效与现有工具执行中的文字扫光保持一致，不使用图标或尾部省略号。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **等待阶段建模**: 在当前流式 UI 状态中区分“等待模型可见活动”，覆盖首次请求、自动上下文压缩后以及工具全部完成后的下一轮生成。
- **统一运行动态**: 等待超过 300ms 后显示品牌化状态文案 `Operating Space · Expanding`，直接复用工具运行文字的 shimmer 样式；正文、Thinking、工具、重试或授权状态出现时立即隐藏。
- **中性扫光收敛**: 根据 Electron 手动验收反馈，将等待提示和全部工具 shimmer 从绿色高光统一改成主题中性扫光：running 使用主文字色，扫光使用浅灰，completed 回到 muted。
- **生命周期回归**: 新增渲染测试，锁定延迟出现、工具开始时隐藏、工具结束后重新出现和正文到达后消失的行为。

### 🧠 Design Intent (Why)

等待提示只表达请求仍在进行，不把网关等待或不可读的推理过程误称为“思考”。300ms 仅用于避免短请求闪烁，不延迟实际流式事件和工具完成状态；动效复用现有工具文字扫光。消息流中的 running 改由文字层级与动态共同表达，绿色继续保留给状态点、Toggle 和连接成功等明确 operational 场景。

### 📁 Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/toolLogStyles.ts`
- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/desktop/src/renderer/test/tool-log-shimmer-color-semantics.test.ts`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-全局视觉语言规范.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/histories/2026-07/20260728-1237-model-waiting-shimmer.md`

### ✅ Verification

- Desktop Vitest：62 个测试文件、507 个测试通过；包含中性 shimmer 颜色契约回归。
- Desktop TypeScript typecheck 通过。
- Renderer production build 通过。
- 前端主题颜色契约、文档骨架与 `git diff --check` 通过。
- 实际视觉效果由用户在 Electron 中手动验证。
