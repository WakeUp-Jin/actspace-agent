# Tailwind 页面切片迁移：让样式所有权跟着组件走

来源：`docs/histories/2026-05/20260528-0245-lab-v0-frontend-mock.md`

## 核心模式

迁移一个新页面时，不要把旧的全局 `.page-*` CSS 先写一遍，再计划“以后迁 Tailwind”。更稳的做法是把这个页面当成一个完整切片：

- 全局 CSS 只保留 token、base、Electron chrome、滚动条、focus、Markdown / diff 和复杂第三方渲染边界。
- 页面布局、间距、响应式、按钮、卡片、弹窗状态直接写成 Tailwind utility。
- 重复但只属于本页面的组合，用组件文件里的局部 class 常量承载。
- 业务状态和可访问性仍由 React 组件负责，不塞进 CSS 命名体系。

## 为什么这样做

迁移前的旧 `styles.css` 一旦继续增长，很快会出现两个问题：样式位置离 DOM 太远，改一个页面要在大文件里找上下文；类名前缀看似隔离，但状态、响应式和 hover 仍然分散。当前旧根部 `styles.css` 已下线，Tailwind utility 把这些视觉决策放回组件附近，适合页面仍在快速演进时使用。

局部 class 常量的作用不是复刻 CSS 框架，而是给长 utility 串一个可读名字。例如按钮、弹窗外壳、阶段列、卡片这类结构在同一文件里反复出现，抽成 `primaryButtonClass`、`modalBaseClass` 比复制几十个 utility 更可维护。

## 常见陷阱

- **不要用 `@apply` 把旧 class 翻译一遍。** 这只是换语法，样式所有权仍然留在全局 CSS。
- **不要让测试断言 Tailwind class。** 测试应覆盖用户可感知的流程、可访问名称和状态变化。
- **动态业务颜色可以保留 inline style。** 例如 mock 数据里的状态 tag 色值，本质是数据驱动，不一定要硬塞进 Tailwind theme。
- **迁移后要删除旧页面 CSS。** 同一页面同时有 utility 和全局 class，会让后续维护者不知道哪套才是事实来源。

## 自检问题

1. 新样式是否能只看组件文件就理解大部分布局和状态？
2. 全局边界文件中是否还残留这个页面的组件级 class，或是否有人重新引入了旧根部 / legacy 分区？
3. 测试是否绑定用户流程，而不是绑定 Tailwind class 细节？
