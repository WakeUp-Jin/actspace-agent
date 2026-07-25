---
version: 0.1
name: ActSpace Editor Design System
codename: Ink & Emerald
codename_zh: 墨色与翡翠绿
status: target-design
description: A restrained editor design system built from warm neutral hierarchy, theme-inverted ink actions, and a scarce emerald operational accent.
---

# ActSpace Editor Design System

`Ink & Emerald / 墨色与翡翠绿` 是 ActSpace 编辑器的目标设计系统。

它不是“黑绿主题”，也不是对 Cursor 产品或官网的复刻。ActSpace 借鉴优秀编辑工具的克制、密度和信息层级，但保留自己的 Agent、Context、Usage、Kairos 等操作语义。

核心结论：

> 中性灰阶工作台 + 黑色主操作 + 翡翠绿语义强调。

灰阶承担约 95% 的界面层级；绿色通常只占约 2%–5%，用于 operational、success、connected 等明确状态。高级感来自低彩度、精确层级、稳定密度和克制用色，而不是黑色与绿色两个颜色本身。

## 文档地位

本文件定义产品级设计系统总纲和 token 方向。详细规则按以下层级维护：

1. `DESIGN.md`：产品设计系统总纲、颜色职责和核心 token。
2. `docs/design-docs/frontend/front-全局视觉语言规范.md`：字体、密度、圆角、边框、阴影、动效和视觉落地规则。
3. `docs/design-docs/frontend/front-主题与配色规范.md`：浅色、深色、跟随系统机制和颜色实现硬约束。
4. Sidebar、Composer、消息区、Settings、右侧面板等组件专题文档。
5. `docs/FRONTEND_VERIFICATION.md`：实现后的浏览器与 Electron 验收。

当旧截图、原型或历史文档与本文件冲突时，以本文件和对应最新专题规范为准。

## 当前实现边界

本文件描述目标设计，不代表代码已经完成迁移。

- 当前 renderer 仍存在以蓝色 `brand` token 为主的实现。
- 本阶段不直接修改 `tokens.css`、Tailwind 映射或组件代码。
- 后续必须先拆分 action / operational / info / semantic token，再迁移基础组件和页面。
- 禁止把旧 `brand blue` 在代码中机械替换成绿色。

## 设计性格

ActSpace 是长期使用的 Agent 编辑工作台，视觉应呈现：

- refined minimal：精确、安静、克制，而不是空泛或寡淡。
- editor density：列表、工具流和设置保持桌面工具密度，不做移动端大卡片。
- operational clarity：运行、连接、审批、失败等状态一眼可判断。
- long-session comfort：大面积区域保持低彩度，降低长期阅读疲劳。
- inspectable system：Agent 的上下文、工具执行与状态可见，但不变成彩色监控大屏。

## 颜色职责模型

### 1. Neutral hierarchy

灰阶负责：

- App、Sidebar、Surface 和 Selected 的空间层级。
- 标题、正文、辅助描述和 placeholder 的信息层级。
- hover、pressed、disabled 和普通边框。
- 普通工具日志、已完成事件和非关键元信息。

大部分页面在移除全部彩色 token 后，仍然必须能够被理解。

### 2. Ink action

近黑色或主题反色负责：

- 发送按钮和最主要 CTA。
- 当前页面标题、主要文字和关键图标。
- 浅色主题下需要强对比的操作按钮。
- 深色主题下对应翻转为浅色 action surface。

“主要”不等于“所有按钮”。次级按钮继续使用中性 surface、边框和文字。

### 3. Emerald operational accent

翡翠绿负责：

- Agent 正在运行。
- 已连接、在线和健康状态。
- Toggle 开启。
- 成功完成与确认反馈。
- diff additions。
- 必要的 operational focus 或运行反馈。

绿色不是默认品牌底色，不用于所有链接、导航选中、普通按钮、卡片背景、工具日志或 Context 分类。

### 4. Semantic colors

- Danger：错误、删除、失败、diff remove。
- Warning：风险、等待确认、额度或 Context 接近阈值。
- Info blue：信息提示、图表系列和 Context 数据可视化之一。
- Chart colors：仅用于数据编码，必须低饱和且不接管页面视觉。

Warning 使用琥珀色是语义要求，不代表引入橙色品牌色。

## 目标色板

以下值是设计目标和样板起点，代码落地前仍需做页面对比度与浅深主题验证。

### Light

| Token role | Target | Usage |
|---|---:|---|
| App Background | `#F7F7F5` | 主工作区 |
| Sidebar | `#EFEFED` | 左侧导航 |
| Surface | `#FFFFFF` | Composer、浮层、主要内容面 |
| Surface Subtle | `#F1F1EF` | 设置分组、代码容器 |
| Selected | `#E4E4E1` | 当前导航、选中行 |
| Hover | `#EAEAE7` | 普通 hover |
| Border | `#DEDED9` | hairline、分栏、输入框 |
| Border Strong | `#C9C9C3` | 需要更强边界的控件 |
| Text Main | `#20201E` | 标题、正文、主操作 |
| Text Muted | `#676762` | 描述、时间、辅助信息 |
| Text Faint | `#92928C` | placeholder、弱元信息 |
| Operational | `#087A4B` | 运行、连接、开启、成功 |
| Operational Soft | `#E5F2EA` | 绿色弱背景 |
| Info | `#3978B8` | 信息和有限图表编码 |
| Warning | `#A87218` | 风险、等待确认 |
| Danger | `#C74747` | 错误、删除、diff remove |

### Dark

| Token role | Target | Usage |
|---|---:|---|
| App Background | `#181916` | 暖黑灰工作区 |
| Sidebar | `#1E1F1C` | 左侧导航 |
| Surface | `#242522` | Composer、浮层、主要内容面 |
| Surface Subtle | `#292A26` | 设置分组、代码容器 |
| Selected | `#30312D` | 当前导航、选中行 |
| Hover | `#2A2B27` | 普通 hover |
| Border | `#353630` | hairline、分栏、输入框 |
| Border Strong | `#484943` | 强边界 |
| Text Main | `#F1F1ED` | 标题、正文、主操作 |
| Text Muted | `#B5B5AE` | 描述、时间、辅助信息 |
| Text Faint | `#85857E` | placeholder、弱元信息 |
| Operational | `#36C783` | 运行、连接、开启、成功 |
| Operational Soft | `#193A2B` | 绿色弱背景 |
| Info | `#6CA6DA` | 信息和有限图表编码 |
| Warning | `#D2A14D` | 风险、等待确认 |
| Danger | `#E06B6B` | 错误、删除、diff remove |

深色主题禁止使用纯黑 `#000000` 作为大面积背景，也不使用高饱和霓虹绿。

## Token 架构方向

后续代码迁移应明确拆分以下职责，而不是继续用单一 `brand` token 覆盖所有彩色行为：

```text
surface.*       app / sidebar / surface / selected / hover / border
text.*          main / muted / faint / disabled / inverse
action.*        primary / primary-hover / on-primary
operational.*   default / hover / soft / on-operational
semantic.*      info / warning / danger / success
chart.*         series-1 ... series-n
context.*       system / tools / rules / skills / conversation ...
diff.*          addition / removal
focus.*         ring / operational-ring
```

主 action 与 operational accent 必须是两个不同 token 家族。

## Typography

编辑器界面优先使用 macOS / Windows 系统 UI 字体，保持原生感、中文可读性和稳定渲染。不引入 CursorGothic 或营销展示字体。

```css
--font-ui:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Hiragino Sans GB",
  "Segoe UI",
  "Microsoft YaHei",
  sans-serif;

--font-mono:
  "SFMono-Regular",
  "JetBrains Mono",
  "Cascadia Code",
  Menlo,
  Consolas,
  monospace;
```

推荐桌面密度：

| Role | Size | Weight |
|---|---:|---:|
| Metadata / timestamp | 11–12px | 400–500 |
| Sidebar / compact controls | 13px | 400–500 |
| Main UI / message body | 14px | 400–500 |
| Composer input | 16px | 400 |
| Page / panel title | 18–24px | 600–700 |
| Code / diff / Bash | 13px | 400 |

字重只使用 `400 / 500 / 600 / 700`。普通编辑器 UI 不使用营销站的 72px 标题、负字间距和 80px section rhythm。

## Spacing and density

使用 4px 基础网格：

```text
4 / 8 / 12 / 16 / 20 / 24 / 32
```

- 列表行通常为 32–40px。
- Sidebar 保持高密度列表，不做卡片导航。
- Settings 内容列保持适中阅读宽度，不因大窗口横向铺满。
- 消息正文保护行长和阅读宽度。
- Composer 可以比普通控件更有空间感，但不能像营销输入框。

## Shape, border and depth

推荐圆角：

```text
4px  inline tag / tiny control
6px  compact row / selected item
8px  button / input / segmented item
12px composer / popover / dialog
999px status dot / small pill
```

规则：

- hairline 优先于阴影。
- 普通分组不做“边框卡片 + 大圆角 + 阴影”三件套。
- 阴影只用于 popover、dialog、Sheet 和必要浮层。
- 不把每个工具、设置项和统计块都浮成独立卡片。

## Iconography

- 使用统一的线性图标语言，默认 `currentColor`。
- 普通图标保持中性灰黑，不按功能随意染色。
- operational / warning / danger 图标只有在传达真实状态时使用对应语义色。
- 图标按钮必须提供 `aria-label`，必要时提供 tooltip。
- 状态不能只通过颜色表达，必须配合文字、形状或图标。

## Motion

- hover / active：120–160ms。
- popover / Sheet / collapse：160–220ms。
- 不为装饰加入持续动画。
- running 可以使用小型绿点、细环或极克制 shimmer。
- completed 不需要逐条播放绿色完成动画。
- 所有动画尊重 `prefers-reduced-motion`。

## Component rules

### Sidebar

- App Sidebar 使用稍深于主工作区的中性 surface。
- hover、selected、pressed 只用不同灰阶区分。
- 当前选中不显示蓝点或蓝色图标。
- 运行中、待关注的会话可以使用小型绿色状态点。
- 保持纯列表和高密度，不做卡片导航。

### Composer

- 使用主题 `surface` 和 1px 中性边框。
- 发送按钮使用主题反色的 ink action。
- 默认不使用蓝色描边、蓝色阴影或绿色 CTA。
- 运行 / 停止可使用绿色小点、细环或中性停止控件。
- Context usage 默认中性；接近阈值时切 warning / danger。

### Message and tool flow

- 默认使用黑灰文本和轻量日志行。
- running 可使用少量 operational green 反馈。
- completed 回到中性文本，不把每条完成项染绿。
- error、warning、approval 使用对应语义色。
- diff additions / removals 保留低饱和绿红编码。
- 不把工具调用做成彩色卡片墙。

### Settings

- 左侧选中态使用灰底和主文字。
- 设置组使用浅灰 `surface-subtle`，不为每组叠加厚边框和阴影。
- Toggle 开启使用 operational green。
- 内容列保持窄而稳定的阅读宽度。

### Right panel

- 文件、Markdown、HTML、图片和 diff 共享同一中性面板外壳。
- Tab selected 以灰阶、文字权重和细边界表达。
- 仅 diff、状态或数据编码使用彩色 token。

### Context, Usage and Kairos

这些区域是 ActSpace 个性化设计的主要空间：

- Context bucket 与统计图允许有限多色，但必须降低饱和度。
- Usage 图表使用中性底和低饱和 series，不设置单一品牌主色。
- Kairos running 使用绿色，等待和睡眠使用中性灰，风险使用 warning，失败使用 danger。
- 导航选中、普通行选中仍保持中性灰。

## Do / Do not

### Do

- 先用灰阶完成信息层级，再决定颜色是否真的必要。
- 把 action、operational、semantic、chart token 分开。
- 保持高密度桌面工具语言。
- 在浅色和深色主题中验证真实页面，而不是只验证色板。
- 保留蓝色作为 info / chart / Context 数据色之一。

### Do not

- 不使用 Cursor Orange 作为品牌或 CTA 色。
- 不把绿色用于所有链接、按钮和选中态。
- 不把蓝色继续作为全局按钮、选中和 focus 默认色。
- 不大面积使用纯黑或高饱和绿色。
- 不通过大圆角卡片、厚阴影和渐变制造“高级感”。
- 不让旧截图覆盖新的文字规范。

## Implementation sequence

1. 文档事实收口。
2. 制作 Sidebar、Composer、Settings 的浅色 / 深色视觉样板。
3. 拆分和迁移 CSS semantic tokens。
4. 迁移基础组件与交互状态。
5. 迁移工作台页面和专项页面。
6. 完成浏览器 mock、Electron 和浅深主题验收。
