# Grep/Glob 工具行过长时显示省略与条件 tooltip

## 背景

用户反馈 `Grep` 工具行在 pattern 很长、scope 是长路径时会占用过多消息区空间，希望参考 Cursor 的做法：行内显示省略号，并且只有在内容被截断后，鼠标悬浮或键盘聚焦时才显示完整内容提示。

## 主要改动

- 在 `ToolLogLine` 中为 `Grep` / `Glob` 增加 `OverflowToolLine`，保持工具行原始完整文本来源。
- 使用 `scrollWidth > clientWidth` 判断文本是否真实溢出。
- 仅在真实溢出时：
  - 工具行可被键盘 focus。
  - 渲染完整内容 tooltip。
  - hover/focus 时显示 tooltip。
- 更新工具行 CSS，给 Grep/Glob 文本增加单行省略号，并新增轻量 tooltip 样式。
- 将 renderer mock fixture 的 Grep 示例替换成长 pattern，方便后续浏览器 mock 直接回归这个问题。
- 补充 renderer 测试，覆盖短文本不出现 tooltip、长文本出现 tooltip 且 hover 后打开。

## 验证

- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`
- 浏览器 mock 验证：
  - 长 Grep 行被单行省略。
  - 长 Grep 行真实溢出时有 tooltip。
  - 短 Glob 行未溢出时没有 tooltip。
