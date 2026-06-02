# 图标按钮 Tooltip 的可访问性边界

关联 history：`docs/histories/2026-06/20260602-0203-icon-button-tooltips.md`

## 是什么

图标按钮只靠视觉符号表达动作，空间效率高，但语义容易丢失。可靠做法是同时提供两层说明：

- **`aria-label`**：给屏幕阅读器和自动化测试提供稳定名称。
- **Tooltip**：给鼠标 hover 和键盘 focus 用户提供可见解释。

两者不是替代关系。Tooltip 解决“看得见的人不知道图标含义”，`aria-label` 解决“辅助技术需要知道控件名称”。

## 为什么需要

原生 `title` 能显示浏览器提示，但体验和可控性都弱：样式不可控、延迟不可控、键盘体验不一致，也很难和应用主题统一。Radix Tooltip 这类 primitive 更适合桌面应用，因为它把定位、碰撞检测、hover/focus 状态和可访问属性都收在一个稳定组件里。

## 常见陷阱

### 1. `disabled` 会吞掉 tooltip 触发

原生 disabled button 通常不会触发 pointer/focus 事件，因此 tooltip 也打不开。对于“正在生成中”这类仍然需要解释状态的按钮，可以改用：

```tsx
<button
  aria-disabled={isBusy}
  onClick={() => {
    if (isBusy) return;
    runAction();
  }}
>
  ...
</button>
```

这样按钮依然能展示 tooltip，但业务逻辑会阻止重复执行。注意这不等价于所有场景都该避免 `disabled`：表单提交、不可聚焦的控件仍可能需要原生 disabled。

### 2. Tooltip 文案不要替代按钮名称

按钮本身仍应有清楚的 `aria-label`，例如：

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button aria-label="更多消息操作">
      <MoreHorizontal aria-hidden="true" />
    </button>
  </TooltipTrigger>
  <TooltipContent>更多操作</TooltipContent>
</Tooltip>
```

这样测试和辅助技术可以直接按按钮名称定位，不依赖 tooltip 是否已经打开。

### 3. 主题色必须走语义 token

Tooltip 是浮层，常出现在各种背景上。样式应使用 `bg-surface-raised`、`text-text-main`、`border-line`、`shadow-act-popover` 这类语义 token，而不是写死黑白或 hex。否则浅色主题看着正常，深色主题很容易出问题。

## 自检问题

- 不看图标，只听 `aria-label`，能知道按钮做什么吗？
- 鼠标 hover 和键盘 focus 都能看到同一个解释吗？
- 忙碌态是否还需要解释？如果需要，原生 `disabled` 会不会让 tooltip 打不开？
