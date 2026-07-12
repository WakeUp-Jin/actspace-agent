## [2026-07-12 14:53] | Task: 修复 Composer 回车后误缩为单行布局

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 长文本在 follow-up 输入框中正常显示为 stacked 布局，按回车后却缩回 inline，模型选择器和发送按钮挤入文本行并裁切内容。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、Composer 设计文档、测试与学习沉淀

**Key Actions:**

- **[稳定测量基准]**: 多行判定固定使用 inline 布局的可用输入宽度，不再用 stacked 全宽下的 `scrollHeight` 决定是否缩回 inline。
- **[展示高度分离]**: 判定完成后恢复当前布局宽度，再设置 textarea 实际展示高度；布局、模型和容器宽度变化均会重测。
- **[回归测试]**: 新增“stacked 全宽下一行，inline 窄宽下折行”场景，覆盖中文输入法回车确认后 message 再次变化的状态。
- **[验证]**: Composer 19 个定向测试和 desktop typecheck 通过；真实 Electron 窗口中长文本再次修改后仍保持 stacked，验收草稿已清空且未发送。

### 🧠 Design Intent (Why)

inline 和 stacked 会改变 textarea 可用宽度，而宽度又会改变自动折行后的 `scrollHeight`。如果直接用“当前布局”的高度决定下一个布局，判定条件会被自己的结果改变。修复将“是否需要 stacked”固定在 inline 宽度下判定，使状态转换具有稳定不变式。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/front-聊天输入框规范.md`
- `docs/learnings/2026-07/layout-state-needs-a-stable-measurement-baseline.md`
