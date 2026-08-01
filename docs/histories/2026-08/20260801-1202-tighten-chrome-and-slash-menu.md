# 收紧顶部工具与 Slash 菜单

## 用户诉求

减少桌面工作台右上角三个入口之间的空白，并让 Slash 菜单的 Function 与 Skill 都使用更紧凑的单行展示。

## 主要改动

- 缩小右侧面板关闭时的 chrome 边缘列与跨列 padding，保留原有按钮点击区。
- Function 展示名称移除 `/` 前缀，但命令解析、过滤和执行仍使用完整 Slash command。
- Skill 改为“小图标 + name + 可选勾选 + 右侧单行描述”。
- `compact` 使用 Lucide `Asterisk`，`status` 使用 Lucide `ChartPie`。

## 关键文件

- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/frontend/front-composer-slash-command.md`
