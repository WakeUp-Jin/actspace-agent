# 自定义标题栏下的命中测试与面板响应式

关联变更：`docs/histories/2026-07/20260730-1832-review-workbench.md`

## 核心问题

Electron 隐藏系统标题栏后，应用通常会用固定浮层模拟窗口 chrome，并把部分区域声明为 `-webkit-app-region: drag`。此时下层按钮即使视觉可见，也可能因为 z-index、`pointer-events` 或拖拽区域而无法点击。

另一个常见误区是用 viewport media query 判断面板布局。一个 `390px` 的右侧面板可能存在于 `1440px` 窗口中；`window.innerWidth` 很宽，不代表面板内容有足够空间放三列或 split diff。

## 可迁移模式

1. 页面级内容若从窗口顶部开始，必须先消费统一的 chrome 安全高度。
2. chrome 下方的交互工具栏应显式使用 `-webkit-app-region: no-drag`，并保证其祖先没有屏蔽 pointer event。
3. 组件响应式应以实际容器宽度为依据；如果组件固定运行在窄面板中，优先设计单列或明确的 dock/独占视图，而不是依赖 viewport breakpoint 隐藏列。
4. 不要通过“临时隐藏其它区域”来补偿错误的组件宽度模型。先确认产品容器边界，再决定内部布局。
5. 弹层若位于 `overflow: auto/hidden` 祖先中，即使状态和 DOM 都已创建，也会被裁切成“点击没反应”。通用工具栏弹层应 portal 到顶层，再用触发器的 `getBoundingClientRect()` 做 fixed 定位和 viewport collision。
6. overlay、dock 和独占视图是三种不同语义：overlay 适合临时阻断式任务；dock 适合并行浏览；当容器窄到并行内容都不可读时，应切到独占视图，而不是让 overlay 永久盖住主内容。

## 自检

- 按钮是否位于固定 chrome 浮层或 drag region 下方？
- 当前 breakpoint 测量的是 viewport，还是组件真正拥有的宽度？
- 弹层是否仍受某个滚动或裁切祖先控制？打开状态存在但不可见时，先查 containing block 与 overflow。
- 这个次级区域应该 overlay、dock，还是在窄宽度下独占内容区？
- 在最小面板宽度下，核心路径是否仍无需横向滚动即可操作？
