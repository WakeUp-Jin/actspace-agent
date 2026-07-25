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

## 常见陷阱

- 把旧的蓝色 `brand` 全局替换为绿色：只是换色，没有解决职责混乱。
- 让所有 completed 项都变绿：会把结果列表变成状态噪音。
- 用绿色表示既定导航又表示成功：同一颜色同时回答两个不同问题。
- 为了“有品牌感”给大面积 surface 加彩色：容器会抢走内容的注意力。
- 将 info blue 完全禁用：设计系统丢失语义工具；正确做法是限定职责，不是删除色相。

## 自检问题

1. 去掉所有彩色后，页面的层级、选中和主操作是否仍然清楚？
2. 一个 accent 是在表示用户操作、系统运行，还是风险状态？它是否只回答了一个问题？
3. 换掉 operational 色后，是否会意外改变导航、CTA、链接或图表？如果会，token 仍然耦合过度。

相关变更记录：`docs/histories/2026-07/20260725-0021-ink-emerald-design-system.md`。

