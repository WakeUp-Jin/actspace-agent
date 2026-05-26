# Settings → General → Typography 通用样式调整

| 字段 | 内容 |
| --- | --- |
| **状态** | Pending（不着急做，先记） |
| **创建于** | 2026-05-27 |
| **优先级** | P3（产品锦上添花，非阻塞） |
| **来源** | 用户在 typography-cursor-alignment 收尾阶段提出，对照 Cursor `Settings → Typography` 截图 |

## 触发场景

在 [2026-05-27 typography-cursor-alignment](../../histories/2026-05/20260527-0010-typography-cursor-alignment.md) 收尾阶段，用户反馈"侧边栏字看起来比 Cursor 小一点"。实测发现 Cursor 的 sidebar 字号其实是 11–12px（与 actspace 改后的 12–13px 同档甚至更小），用户视觉上"更大"的原因是**他在 Cursor `Settings → Typography` 里把 UI Font Size 调到了 15**（默认值 13）。

actspace 当前没有等价的 UI 字号设置入口，用户无法在不动代码的情况下放大全局文字。这次记下需求：**在 Settings 页加一组通用样式调整入口**，对齐 Cursor `Typography` section。

## 待定范围（占位，开工时再确认）

- **UI Font Size**：全局 UI 文字基准字号，默认 13，可调 11–18。落地方式可能是 `html { font-size: var(--ui-font-size) }` + 把 styles.css 里的 px 改成 rem，或更简单一档：只暴露一个全局 CSS 变量 `--ui-scale: 1`，让所有 `font-size` 通过 `calc(... * var(--ui-scale))` 缩放。**两种思路要在开工前选一个**——前者更"正统"但改动面广（百处 px 要回退），后者用一个 CSS 变量 zoom 一切但要保证布局不裂。
- **Code Font Size**：等宽字体基准字号（用于代码块、bash 输出、diff），默认 13，可调 11–18。
- **UI Font Family**：UI 字体覆盖，默认空（走 `--font-ui` 系统字体）。和 Cursor 一样支持留空 = `System font`。
- **Code Font Family**：等宽字体覆盖，默认空（走 `--font-mono`）。

## 待回答的问题

- [ ] **缩放策略**：rem 重构 vs. `--ui-scale` 变量 vs. Electron `webContents.setZoomFactor`（最简单但会影响图片、SVG icon 同比放大，与 Cursor 行为一致）？
- [ ] **作用范围**：UI Font Size 是否影响 Composer 输入、Markdown 正文？还是这些有独立 conversation-font-size token？Cursor 的做法是 `--conversation-font-size` 单独存在（grep 到 `font-size: var(--conversation-font-size, 13px)` 大量出现）。
- [ ] **持久化**：设置存到哪里？走 Electron `app.getPath('userData')` 下的 `settings.json`，还是 localStorage？
- [ ] **影响范围**：会不会和现在的 `--window-chrome-control-size: 22px` 之类的硬编码冲突？需要先做一次"哪些尺寸必须不缩放"的盘点。

## 不在范围

- 不做 dark mode 切换（那是 `Appearance` 段的事，不要塞进 Typography）。
- 不做主题色自定义。
- 不做布局密度切换（compact/comfortable）——先做字号即可。

## 相关参考

- Cursor 设置截图（用户提供）：`Typography → UI Font Size / Code Font Size / UI Font Family / Code Font Family`。
- [docs/design-docs/frontend-ui/设置页规范.md](../../design-docs/frontend-ui/设置页规范.md)：设置页骨架与导航分组（`General / Appearance / Model / Tools / Advanced`）已定义，Typography 子段可挂在 `General` 下或与 `Appearance` 平级。
- [docs/design-docs/frontend-ui/全局视觉语言规范.md](../../design-docs/frontend-ui/全局视觉语言规范.md)：当前字号阶梯、字重档已统一到 400/500/600/700 + 11/12/13/16/20/24px。
- [packages/desktop/src/renderer/styles.css](../../../packages/desktop/src/renderer/styles.css)：~100 处 `font-size` 散落各 selector，rem 化的工作量在这里评估。

## 开工前必读

- [docs/PLANS_GUIDE.md](../../PLANS_GUIDE.md) → 「plan 就绪检查」段：开工前需要把"待回答的问题"全部敲定，再扩展本文件。
- 本文件不要在没决定缩放策略时贸然开工，否则一定会回滚。
