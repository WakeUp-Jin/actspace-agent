# 界面颜色应按职责分层，不应按品牌色扩散

一个常见的设计系统陷阱是：选定一个“主色”后，让它同时承担按钮、选中、链接、focus、运行、成功和图表等所有角色。这种做法初期省事，但会很快让界面变成“满屏品牌色”，信息层级和状态语义也会彼此冲突。

## 应该拆成什么

一套稳定的工具界面至少需要分离五类颜色职责：

1. **Neutral hierarchy**：背景、surface、selected、边框和文本层级。它们应完成大部分界面组织。
2. **Action**：发送、确认、主 CTA 等用户主动操作。它需要稳定高对比，不一定需要品牌色。
3. **Operational**：正在运行、已连接、Toggle 开启、健康、成功。它描述系统的运行状态，不是普通交互强调。
4. **Semantic status**：info、warning、danger、approval、diff addition / removal。各自需要稳定且不混用的语义。
5. **Visualization**：图表系列、Context bucket 和统计分类。它可以多色，但不能借用操作或危险色造成错误含义。

## 为什么 selected 不应默认染色

selected 只回答“当前在哪里”，operational 回答“系统正在做什么”。如果两者都使用同一强调色，用户就无法判断一个绿色会话行是“当前选中”还是“正在运行”。

更稳定的做法是：

- selected 使用中性填充、文字对比和层级变化。
- running 使用小状态点、细环或克制 shimmer。
- 需要同时表达 selected + running 时，两种信号可并存，不会互相覆盖。

但还有一个容易忽略的可访问性陷阱：中性 selected 的底色差通常很低，可能只有约 1.1–1.3:1。它适合建立克制层级，却不适合独立承担状态表达。因此还需要字重、单色 glyph、轮廓或位置等冗余提示。

## Token 建模顺序

不要先建一个 `brand` token，再为所有组件提供 `brand-soft` 和 `brand-strong`。应该先列出产品中真实的视觉职责，再建立语义 token：

```text
surface / selected / text
action-bg / action-fg
operational / operational-soft
info / warning / danger
chart-series-* / context-* / diff-*
```

这样即使未来更换品牌色，也不会把按钮、运行状态和图表一起重染。

## 主题模式与实际渲染分支

“浅色 / 深色 / 跟随系统”是三个用户选择，但不是三个渲染结果。跟随系统必须拆成两个验收分支：

```text
Light
Dark
System + OS Light
System + OS Dark
```

只检查 `data-theme="system"` 是否存在并不能证明 system-dark token 完整，也不能证明系统切换后已打开的浮层和图表会更新。

## 视觉审批应包含测量

颜色样板不能只靠“看起来舒服”批准。至少要同时检查：

- 普通文字与背景 4.5:1。
- 关键非文本边界与 focus ring 3:1。
- 浅色和深色分别测量，不从一套主题推断另一套。
- selected、warning、running 等状态是否有非颜色冗余。
- 低对比 divider 与需要识别的 control boundary 是否使用了不同 token。

## 常见陷阱

- 把旧的蓝色 `brand` 全局替换为绿色：只是换色，没有解决职责混乱。
- 让所有 completed 项都变绿：会把结果列表变成状态噪音。
- 用绿色表示既定导航又表示成功：同一颜色同时回答两个不同问题。
- 为了“有品牌感”给大面积 surface 加彩色：容器会抢走内容的注意力。
- 将 info blue 完全禁用：设计系统丢失语义工具；正确做法是限定职责，不是删除色相。
- 用宽泛的文件 allowlist 放行颜色字面量：同一文件之后新增的非法颜色也会被静默放过。

## 自检问题

1. 去掉所有彩色后，页面的层级、选中和主操作是否仍然清楚？
2. 一个 accent 是在表示用户操作、系统运行，还是风险状态？它是否只回答了一个问题？
3. 换掉 operational 色后，是否会意外改变导航、CTA、链接或图表？如果会，token 仍然耦合过度。
4. system 主题是否实际验证了 OS Light 和 OS Dark 两个分支？

相关变更记录：

- `docs/histories/2026-07/20260725-0021-ink-emerald-design-system.md`
- `docs/histories/2026-07/20260725-1041-frontend-color-preview.md`
- `docs/histories/2026-07/20260725-1530-frontend-color-system-migration.md`
