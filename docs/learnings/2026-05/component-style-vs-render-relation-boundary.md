# 组件自身样式和渲染关系样式要分开归属

来源：`docs/histories/2026-05/20260529-1156-conversation-tool-style-ownership.md`

## 核心模式

迁移全局 CSS 时，不要只问“这条 selector 应该放进哪个组件”。更稳的判断是先区分两类样式：

- **组件自身样式**：这个 DOM 单独出现时也应该成立，例如工具行的颜色、running shimmer、tooltip open、reduced-motion fallback。
- **渲染关系样式**：只有放进某个列表或布局上下文才有意义，例如“thinking 后面紧跟 tool log 时压缩 4px 间距”。

前者应该放回组件或组件附近的共享常量；后者应该由渲染列表根据前后 item 类型追加 class，而不是继续靠全局相邻兄弟选择器。

## 为什么重要

旧 CSS 常见写法是：

```css
.thinking-block + .tool-log-line,
.tool-log-line + .tool-log-line {
  margin-top: -4px;
}

.tool-log-line.is-running .tool-log-line-text {
  animation: tool-log-text-shimmer 1.1s ease-in-out infinite;
}
```

这两条看起来都属于 conversation，但责任完全不同。running shimmer 属于工具行本身；相邻负间距属于 conversation list 对消息语法的排版决策。把它们留在同一个 legacy 文件里，后续删除时很容易漏掉某个复用方，例如 diff running 态也复用了 `.tool-log-line is-running`。

## 正确拆法

```tsx
// 组件自身样式
<span className={status === "running" ? runningTextClass : baseTextClass} />

// 渲染关系样式
messages.map((message, index) =>
  renderMessage(message, getMessageRelationClass(messages[index - 1], message))
);
```

这样组件可以独立表达“我是什么状态”，列表则表达“我和前一个 block 的关系”。两边都不需要知道对方的内部 DOM selector。

## 常见陷阱

- **把相邻 selector 直接塞进子组件**：子组件不知道前一个 sibling 是谁，只能引入额外 prop 或继续依赖 DOM 结构。
- **只迁主组件，忘记复用语义 class 的别处**：`FileDiffBlock` running 态复用工具行 class，如果只改 `ToolLogLine` 会丢掉 shimmer。
- **同时给默认 margin 和关系 margin**：例如 `mt-0.5 -mt-1` 同时出现，会让最终效果依赖 utility 生成顺序。默认间距和关系间距要二选一。

## 自检问题

1. 这条样式离开当前列表上下文是否仍然成立？
2. 它描述的是组件状态，还是两个消息 block 的关系？
3. 有没有其他组件复用了同一个语义 class，需要一起迁到共享常量？
