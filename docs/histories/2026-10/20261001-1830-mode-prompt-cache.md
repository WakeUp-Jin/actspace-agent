## [2026-10-01 18:30] | Task: 修复 OpenRouter Claude 缓存与小比例上下文显示

### 🤖 Execution Context

- **Agent ID**: Codex /root
- **Base Model**: GPT-6
- **Runtime**: Codex desktop，本地 macOS workspace

### 📥 User Query

> 排查缓存不命中及上下文显示 0%，确认 Chat 使用 1 小时、其他模式使用 5 分钟，连接显式关闭优先，并开始修复。

### 🛠 Changes Overview

**Scope:** Core Agent Loop、LLM Service / pi-ai、Desktop adapter 与 Context UI。

- Agent Loop 将模式策略写入每次请求 options，Chat 为 long，其余模式为 short；重试复用 prepared options。
- Desktop prepare 应用连接关闭优先，并将有效策略传到 Anthropic Messages 与 OpenRouter Claude Completions。
- OpenRouter 官方 endpoint 的 anthropic/* Completions 请求添加顶层自动缓存参数，short/long 分别发送 5m/1h；关闭省略，其他模型不注入。
- 原生 Anthropic 代理断点支持长缓存，pi-ai 直连透传 long；保留 OpenRouter 原始账单与 usage 解析。
- Composer 与 ContextPopup 将小比例判断从 <=0 改成 <1，保留未知容量和空上下文的 0% 行为。
- 同步设置说明、LLM 架构与 Context 文档，新增兼容 backend 能力验证学习笔记。

### 🧠 Design Intent (Why)

安装 pi-ai 不代表每条请求均由它发送。OpenRouter 的实际兼容 backend 遗漏了缓存标记，原生协议已有的缓存实现没有覆盖它。缓存策略由业务模式决定，由 adapter 约束支持范围与关闭开关，避免从提示词猜模式或向其他模型发送 Claude 参数。

百分比回归测试原本只覆盖了已被舍入为 0 的输入，漏掉真实投影保留的小数。改用 0.219 与 0.42 的输入复现问题，并分别验证底部与浮层。

### 📁 Files Modified

- `packages/core/agent-loop/src/loop.ts` 与对应测试。
- `packages/llm/service/src/message.ts`。
- `packages/llm/pi-ai/src/anthropic-cache.ts`、`legacy-proxy-wire-engine.ts`、`pi-ai-stream.ts` 与对应测试。
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts` 与连接协议测试。
- `apps/desktop/src/renderer/components/Composer.tsx`、`ContextPopup.tsx` 与对应测试。
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx` 的缓存说明。
- `docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md`。
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`。
- `docs/learnings/2026-10/20261001-provider-cache-wire-parity.md`。

### Verification

- Red：修复前缓存请求体测试 4 项失败；模式策略测试 3 项失败；Composer / Popup 真实小数占用率测试 2 项失败。
- Green：pi-ai 全套 59 项通过，后续真实 SDK 请求体测试新增 3 项并与已有 2 项一起通过；Agent Loop 全套 32 项通过；Desktop 聚焦 98 项通过，共 192 项不同测试。
- 已通过 runtime 依赖闭包 build、Desktop 双 tsconfig typecheck、renderer build、Electron/preload build、check:docs、git diff --check。Renderer 存在既有大 chunk 构建警告。
- 同类检查：两个 UI <=0 判断均修复；两条 Anthropic direct/proxy 路线覆盖；OpenRouter Claude 与非 Claude、缓存关闭、原始账单测试覆盖。Responses SDK 迁移不在本轮范围。

### Computer Use 验收

先列 A/B/C 验收点，以进入原会话 → 查看底部 → 打开浮层 → 关闭的单条路线执行；只读查看，没有发送新消息。

| 验收点 | 结果 | 证据 |
| --- | --- | --- |
| A：原会话底部 <1% | 通过 | Electron 实际窗口 AX 状态显示“上下文用量 <1%” |
| B：浮层 <1% 已用、约 4K / 1M、分桶计数正常 | 通过 | 本轮 Computer Use 截图与 AX：system 164、tools 313、conversation 4K |
| C：关闭浮层 | 未确认 | 已执行关闭按钮动作，但工具返回 AX 无变化，不能据此判定通过 |

原窗口验证为浅色主题，没有新增颜色样式；不宣称其他主题或尺寸逐一验收。Computer Use 多次出现元素编号失效与长延迟，截图保留于本轮工具记录，不将用户完整会话内容复制进仓库。

真实 OpenRouter 缓存命中与实际账单未执行付费请求验收；正确参数不保证满足服务商缓存长度、前缀、有效期和路由条件。运行中的 Electron main 需重启加载新 backend，未为此打断当前开发窗口。代码未提交，保留既有未提交改动。
