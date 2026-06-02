## [2026-05-28 16:45] | Task: 实现 Kairos 监控页"上下文" Sheet

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 在重置按钮旁边再加一个按钮，叫"上下文"，点击后从右侧滑出像 shadcn `Sheet` 的弹窗。
> 弹窗布局上中下：上是标题、中是完整的系统提示词 + 会话历史记录、下以列表展示工具名称。
> 一起设计好后落到 design-md，然后实施。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **[Design]**: 落 `docs/design-docs/front-Kairos监控页规范.md`，覆盖入口按钮位置、Sheet 行为、四段信息架构（概览 / 系统提示词 / 会话历史 / 工具列表）、`KairosContextSnapshot` 契约、新增 IPC、状态边界与测试策略；同步更新母规范与两份索引。
- **[Shared 契约]**: 在 `packages/shared/src/kairos-contracts.ts` 扩 `KairosContextSnapshot`、`KairosContextMessage`、`KairosContextTool`、`KairosContextPhase` 等类型，并在 `KairosBridgeApi` 加 `getContextSnapshot()`。
- **[Agent-core controller]**: `createKairos` 把 `observeRefresh` / `activeBriefsCount` 闭包外提为顶层 fn，供 runner 与新方法共用；新增 `getContextSnapshot()`：重新跑 observe + shortTerm.load + assembleSystemPrompt，把 `Message` 投影成 `KairosContextMessage`（含 thinking / tool_call 摘要），用 `Set('sleep')` 区分工具来源。顺便把 `derivePhase` 从 prompt-assembler 显式导出。
- **[Main IPC]**: 在 `kairos-ipc-internals.ts` 的通道常量表加 `getContextSnapshot`，`kairos-ipc.ts` 注册 `kairos:get-context-snapshot` invoke handler，错误由 invoke 路径自然 reject。
- **[Preload + Hook]**: 在 `preload/index.ts` 把方法接到 `window.kairos`；`useKairos` 透出 `getContextSnapshot`，按需调用、不入 hook state。
- **[Sheet 基础组件]**: 新建 `components/ui/Sheet.tsx`——自研轻量级右侧滑入抽屉，Portal + Overlay + Esc / overlay 关闭 + focus trap + 引用计数滚动锁定 + 关闭时焦点归还。配套 7 个单测。
- **[KairosContextSheet]**: 新建 `components/kairos/KairosContextSheet.tsx`，四段：概览（生成时间 / 模型 / 阶段 / token）、系统提示词（默认展开 + 复制 + 800 字符预览/全文切换）、会话历史（summary 折叠卡 + 倒序 messages + 单条展开）、工具列表（扁平 + Kairos/共享 角标 + 行展开 JSON Schema）。配套 5 个单测。
- **[KairosHeader 接 Sheet]**: 按钮顺序固定为 `开启/暂停 · 立即唤醒 · 上下文 · 重置今日`，"上下文"按钮 `bridgeAvailable=false` 时禁用并显示 tooltip；KairosPage 维护 `contextOpen` 并挂载 Sheet。
- **[测试同步]**: `kairos-page.test.tsx` 与 `right-panel-kairos.test.tsx` 的 fake bridge 补 `getContextSnapshot` mock；新增 Sheet / KairosContextSheet 共 12 个单测。

### 🧠 Design Intent (Why)

Kairos 原本是黑盒：用户能看到事件流，却看不到 LLM 真正读到的 system prompt / 短期记忆 / 可用工具——
排障时只能猜 `rule.md` / `paths.json` 是否生效。把这份"模型视角的上下文"用一个按钮直达：

- **数据按需拉取，不走推送**：Sheet 关闭即丢弃。比预拉、订阅简单得多，也不会污染监控页主体的 ring buffer。
- **复用 runner 的 4 个依赖**：`observeRefresh` / `shortTerm.load` / `activeBriefsCount` / `assembleSystemPrompt`，保证"用户在 Sheet 里看到的" === "下次 tick LLM 看到的"。**不真正调 LLM**。
- **自研 Sheet 不引 Radix**：当前仓库没有 Radix / shadcn 依赖，为一个组件拉 `@radix-ui/react-dialog` 不划算。Portal + Tailwind data-state + 手写 focus trap 已覆盖典型抽屉行为，~150 行可控。
- **历史源选短期记忆 messages 而非 ring buffer**：监控页主体已经渲染事件流；Sheet 要回答"LLM 此刻看到什么"，那就是 `shortTerm.load().messages`，二者职责不重叠。
- **`jsdom` 没有 layout 引擎**：focus trap 实现里**故意不**用 `el.offsetParent !== null` 过滤，避免在测试环境把所有可聚焦元素误判为隐藏；真实浏览器中 hidden 元素无法 focus，浏览器自然跳过。
- **`userEvent.setup()` 会注入自带 clipboard mock**：测试里要在 setup 之后再 defineProperty 才能拿到我们自己的 spy；这一坑值得在以后写复制相关测试时复用。

### 📁 Files Modified

- `docs/design-docs/front-Kairos监控页规范.md`（新增）
- `docs/design-docs/front-Kairos监控页规范.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/index.md`
- `packages/shared/src/kairos-contracts.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/prompt-assembler.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/desktop/src/main/kairos-ipc.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/state/useKairos.ts`
- `packages/desktop/src/renderer/components/ui/Sheet.tsx`（新增）
- `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx`（新增）
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/test/sheet.test.tsx`（新增）
- `packages/desktop/src/renderer/test/kairos-context-sheet.test.tsx`（新增）
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
