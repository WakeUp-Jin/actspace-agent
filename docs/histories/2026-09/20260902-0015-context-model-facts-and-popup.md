# 2026-09-02 | Task: Context 模型事实与 Composer 展示收敛

### 📥 User Query

Context 面板需要与输入框同宽，百分比和 token 数不显示小数；上下文容量应来自当前模型配置并通过 Session request/header 与 request/context 投影，而不是固定 200000。

### 🛠 Changes Overview

- 在 LLM prepare 阶段解析非敏感模型事实 `contextWindow`，持久化到 request/header 与 request/context.prepared。
- Context projection 从最近请求事实读取容量，旧 Session 缺失时统一按 0 展示，不伪造默认容量，也不向用户暴露 Unknown。
- Context Popup 改用 ContextState/request-context projection，支持完整 bucket，宽度贴合 Composer，token 与百分比按整数显示。
- 补充 LLM、Session projection、Desktop projection 与 Popup 回归测试。
- 修复底部 Composer 状态栏遗漏格式化导致的 `7.6092%` 小数显示，并增加回归测试。

### 📁 Files Modified

- `packages/llm/service/src/adapter.ts`
- `packages/llm/service/src/service.ts`
- `packages/prompt/src/request-snapshot.ts`
- `packages/core/agent-loop/src/loop.ts`
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `packages/session/projection/src/product-projections.ts`
- `apps/desktop/src/renderer/components/ContextPopup.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
