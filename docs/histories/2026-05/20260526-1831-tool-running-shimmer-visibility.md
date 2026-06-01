## [2026-05-26 18:31] | Task: 工具行 running 态文字可见性修复

### 🤖 Execution Context

- **Agent ID**: `cursor-agent`
- **Base Model**: `claude-opus-4-7-thinking-xhigh`
- **Runtime**: `cursor`

### 📥 User Query

> Write/Edit 工具开始执行时前端"什么都没显示"，按道理 `tool_started` 那一刻就应该出现 `Write 秋日随笔.md`，执行期间 shimmer 提示，完成后才追加 `+15` 统计和折叠箭头。检查 design-docs 看看 shimmer 规范在哪里、为什么没遵守。

### 🛠 Changes Overview

**Scope:** `packages/desktop` `docs/design-docs/front-*` `docs/design-docs/agent-*`

**Key Actions:**

- **CSS shimmer 重做**: `.tool-log-line.is-running .tool-log-line-text` 渐变改为左右两端足够长的纯灰段（0-35% 与 65-100% 都是 `#6f7681`），中央 50% 是亮蓝高光，`background-size` 加大到 250%，`background-position` 在 `100%` 与 `0%` 之间循环。任意时刻文字可视区都落在纯灰段或灰+蓝叠加段，**不再出现文字 transparent 的瞬间**。
- **shimmer 周期收紧**: 一轮从 1.45s 缩到 1.1s，与 300ms 兜底配合时能让快工具在结束前看到至少一次蓝光接近中央的视觉提示。
- **design-docs 沉淀**: `中间消息区规范.md` 新增「工具执行中态规范」小节，明确视觉、时序、文案与后端契约；`tool-preview-design-guidelines.md` 在通用展示原则里补充 running 阶段 shimmer 视觉指引与 preview 字段约束。
- **MIN_TOOL_RUNNING_MS 不动**: 保持 300ms。它的作用是防 UI 闪烁，不是为了让 shimmer 扫完一轮。快工具就该快，慢工具自然循环 shimmer。

### 🧠 Design Intent (Why)

- **shimmer 是叠加，不是文字本体**：上一版实现把文字 `color: transparent` 让背景渐变 clip 到文字形状显色，意味着 shimmer 没扫到的地方文字就消失。这违反了 shimmer 的本质——它是一个用来表达「正在跑」的叠加提示，不是文字的渲染方式。新版让基础灰色文字始终可读，蓝光作为高光扫过，符合 Cursor / VSCode 等成熟产品的语义。
- **「快工具不需要 shimmer」是核心约束**：用户明确反对「为了显示 shimmer 而延长 running 态」。这次修复严格遵守：tool_start 瞬间 → 灰色文字可读 → MIN_TOOL_RUNNING_MS 兜底 300ms → 切到完成态卡片；shimmer 一轮 1.1s，对快工具几乎扫不到，但文字本身的可读性已经把"已经触发"的信号传递给了用户。
- **规范缺口是这次返工的根本原因**：上一轮 [20260526-1251-tool-line-text-shimmer.md](../2026-05/20260526-1251-tool-line-text-shimmer.md) 引入 shimmer 时只在 history 里记了思路，没把「文字始终可读」「最低可见时长 vs shimmer 时长的关系」写进 design-docs。这次补齐规范，后续相关组件改造可以直接对照。

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`
- `docs/design-docs/front-中间消息区规范.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/TODOLIST.md`
