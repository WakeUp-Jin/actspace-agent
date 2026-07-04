## [2026-07-03 18:15] | Task: 修复 Composer 输入框粘贴大段文本不自动长高

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

### 📥 User Query

> 当复制大量文本时，Cursor 会把输入框高度撑大，但 actspace 不行。找一下原因并修复。

### 🛠 Changes Overview

**Scope:** `packages/desktop`（renderer）

**Key Actions:**

- **[修复]**: `Composer.tsx` 的消息输入 `<textarea>` 增加 auto-grow 逻辑——新增 `inputRef`，在 `useLayoutEffect` 中监听 `message` / 布局变化，先把 `height` 重置为 `auto` 再设为 `scrollHeight`，超出 `max-h` 时由既有 CSS 钳住并出现内部滚动条。
- **[测试]**: `composer.test.tsx` 新增用例，mock `scrollHeight` 验证粘贴多行文本后 `style.height` 跟随内容增长。

### 🧠 Design Intent (Why)

原生 `<textarea>` 高度不会随内容增长，只会内部滚动；组件原先只有 `rows={1}` + `min-h`/`max-h` 样式，缺少把高度同步为 `scrollHeight` 的逻辑，导致 `max-h-[116px]` 等上限从未生效。采用最小改动的标准 auto-grow 模式，不引入额外依赖；用 `useLayoutEffect` 避免高度变化在绘制后才应用造成闪动。同一个 effect 同时覆盖 inline / stacked / initial 三种布局（textarea 在布局切换时会重挂载，依赖项包含 `resolvedInputLayout` 与 `surface`）。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
