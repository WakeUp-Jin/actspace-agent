# 缩放 iframe 时要同时管理布局尺寸和视觉尺寸

关联 history：`docs/histories/2026-08/20260805-2305-html-preview-fixed-canvas-fit.md`

## 问题

一个 `1600x1000` 的固定画布放进 `800px` 宽的 iframe，并不会自动变成 `800x500`。iframe 的 CSS 宽度只定义浏览上下文的视口；页面里的 `html, body { width: 1600px }` 仍会按 1600px 排版，因此用户只能看到画布的一部分。

直接给 iframe 写 `transform: scale(0.5)` 也不完整。CSS transform 只改变绘制结果，不改变父文档的布局计算：父层仍会为原来的 `1600x1000` 留位置，产生多余空白或滚动条。

## 两套坐标

正确实现需要区分：

- **布局坐标**：iframe 内页面认为自己有多宽、多高，例如 `1600x1000`。
- **视觉坐标**：用户在父页面实际看到多大，例如 `800x500`。

父层让 iframe 保持自然布局尺寸，再用 transform 缩小；同时用一个外层占位元素承担缩放后的视觉尺寸：

```ts
const scale = Math.min(1, viewportWidth / canvasWidth);

iframe.style.width = `${canvasWidth}px`;
iframe.style.height = `${canvasHeight}px`;
iframe.style.transform = `scale(${scale})`;

wrapper.style.width = `${canvasWidth * scale}px`;
wrapper.style.height = `${canvasHeight * scale}px`;
```

`Math.min(1, ...)` 表示只缩小、不放大，避免小页面被拉伸得模糊。

## 如何识别固定画布

不能把所有 HTML 都锁成首次测得的宽度。响应式页面应该继续跟随容器重排。

iframe 内同时报告：

- `contentWidth`：文档实际需要的宽度。
- `viewportWidth`：iframe 当前浏览视口宽度。

首次出现 `contentWidth > viewportWidth` 时，可以把它视为有自然宽度的固定画布或超宽内容。父层锁住这个自然宽度；没有溢出的页面仍保持 `width: 100%`。

这里的“锁住”很重要。父层把 iframe 宽度改为 1600px 后，下一次测量会变成 `contentWidth === viewportWidth === 1600`。如果每次都重新判断，它会取消缩放、回到 800px，然后再次检测到溢出，最终在两种状态间振荡。

## 容器变化

内容尺寸和容器尺寸由不同一侧负责：

- iframe 内的 `ResizeObserver` 报告内容宽高变化。
- 父层的 `ResizeObserver` 报告预览区变化。

这样文件树展开、面板拖动或窗口 resize 时，只需重新计算 scale，不需要重新加载 HTML，也不会丢失 iframe 内交互状态。

## 常见陷阱

- 只缩放 iframe，不缩放外层占位，导致空白或滚动条仍按原尺寸存在。
- 只测 `scrollWidth`，不同时报告 iframe 视口宽度，无法区分响应式页面和固定画布。
- 每次测量都重新分类，iframe 自己的宽度修改会反过来改变分类结果。
- 用注入 CSS 强行覆盖用户页面的 `html/body` 宽度，破坏本来依赖固定尺寸的排版和交互。
- 根据页面宽度放大内容，导致位图、Canvas 或文字出现不必要的模糊。

## 自检问题

1. 为什么 `transform: scale()` 之后仍要单独设置外层占位元素的尺寸？
2. 为什么固定画布的自然宽度一旦确认就不能在下一次测量时立即清除？
3. 响应式页面和固定画布分别由哪一侧的宽度变化驱动？
