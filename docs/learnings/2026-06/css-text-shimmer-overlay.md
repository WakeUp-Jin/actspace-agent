# CSS Text Shimmer：动画层不要吞掉真实文本

关联 history：`docs/histories/2026-06/20260604-0001-running-tool-shimmer-theme-tokens.md`

## 是什么

文字扫光动画常见做法是把文字本体设为透明，再用 `background-clip: text` 把渐变背景裁进字形里。它看起来简洁，但风险是：一旦浏览器或 Electron 某一帧没有稳定裁剪，用户看到的不是文字高光，而是一整块渐变矩形。

更稳的模式是把“可读文本”和“动画高光”分层：

- 底层是真实 DOM 文本，使用主题色，始终可读。
- 上层是 `::after`，用 `content: attr(data-shimmer-text)` 复制同一段文本，只负责高光扫过。
- 高光层的背景限制在 inline 文本盒子里，不占满整条日志行。

## 为什么需要

running 工具行会频繁出现，尤其是 streaming tool preview 提前展示后，用户更容易看到动画的每一帧。这里不能让动效成为信息可读性的单点故障。

旧写法的问题：

```css
.running {
  color: transparent;
  background: linear-gradient(...);
  background-clip: text;
}
```

这个写法把“文本是否可读”完全交给裁剪结果。一旦裁剪失败，真实文字也是透明的。

新写法：

```css
.running {
  color: var(--act-color-text-muted);
}

.running::after {
  content: attr(data-shimmer-text);
  color: transparent;
  background: linear-gradient(90deg, transparent, var(--act-color-brand), transparent);
  background-clip: text;
}
```

即使高光层出现问题，底层文本仍然存在。

## 核心要点

- **动效不能承载唯一信息层**：running 文本首先要可读，其次才是漂亮。
- **伪元素适合做装饰层**：它可以复制同一段文字，只承担动画，不改变真实文本语义。
- **背景范围要小**：`display: inline-block`、`max-width: 100%`、`overflow: hidden` 能避免渐变背景扩散到整行。
- **主题色必须走 token**：基础文字用 `--act-color-text-muted`，高光用 `--act-color-brand`，浅色/深色自动翻转。
- **测试要锁住结构约束**：断言 running 文本同时有 shimmer class 和 `data-shimmer-text`，防止以后只加 class 却忘记伪元素内容。

## 常见陷阱

- **把真实文字也设为 transparent**：动画失败时文字会消失。
- **渐变挂在 flex 行容器上**：背景宽度会变成整行，裁剪失败时露出大矩形。
- **组件里堆 Tailwind 任意值**：多处复制后很难统一修复，也容易继续写死 `#hex`。
- **忘记 reduced motion**：关闭动画时也要保留一个静态高光层或回到稳定主题色。

## 自检问题

- 如果 `background-clip:text` 某一帧失效，用户还能读到真实文字吗？
- 高光背景的盒子宽度是文本宽度，还是整条消息行宽度？
- 浅色和深色主题下，基础色与高光色是否都来自语义 token？
