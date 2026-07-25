# 全局视觉语言规范

## 定位

这份文档把根目录 `DESIGN.md` 的 `Ink & Emerald / 墨色与翡翠绿` 方向转换成桌面端可执行的视觉规则。它约束字体、颜色职责、密度、间距、圆角、边框、阴影、图标和动效，避免组件各自发明局部风格。

本规范描述目标设计。当前代码 token 尚未完成迁移，不能因为文档已经更新就宣称界面已经完成换肤。

## 设计方向

ActSpace 的视觉气质是：安静、精确、克制、高密度、适合长期停留的 Agent 编辑工作台。

一句话概括：

> 灰阶负责层级，墨色负责操作，翡翠绿负责运行语义。

这不是“黑绿主题”。界面大约 95% 由暖中性灰阶构成，绿色通常只占 2%–5%。如果移除绿色后页面层级就无法理解，说明灰阶设计没有完成。

## 颜色职责

### 中性灰阶

中性灰阶负责：

- App、Sidebar、Surface、Surface Subtle、Selected 的空间层级。
- 标题、正文、说明、时间戳和 placeholder 的文本层级。
- hover、pressed、disabled、divider 和普通边框。
- 普通工具日志、已完成事件和非关键元信息。

浅色使用接近白色的暖灰；深色使用暖黑灰，不使用纯黑。

### 主操作色

主操作不是某个彩色品牌色，而是主题反色的 ink action：

- 浅色主题：近黑底、浅色文字或图标。
- 深色主题：近白底、深色文字或图标。

用于发送、确认提交等最高优先级动作。普通按钮和导航项继续使用中性 surface。

### Operational accent

翡翠绿只用于：

- Agent 正在运行。
- 已连接、在线、健康。
- Toggle 开启。
- 成功、确认和 diff additions。
- 必要的 operational focus / progress 反馈。

禁止用于：

- 所有链接、所有选中导航。
- 普通按钮和普通 focus。
- 大面积卡片或页面背景。
- 每条 completed 工具日志。
- 所有 Context bucket 和图表系列。

### 其他语义色

- Danger red：错误、删除、失败、diff removals。
- Warning amber：风险、等待审批、额度或 Context 接近阈值。
- Info blue：信息提示、有限图表系列和 Context 数据色之一。
- Chart palette：只编码数据，不接管 CTA、选中和导航。

蓝色退出全局主色，但不被禁止。琥珀色保留 warning 语义，但不是橙色品牌视觉。

## 目标基础色板

以下值是设计样板起点，代码实施前必须结合真实页面验证对比度。

| Role | Light target | Dark target |
|---|---:|---:|
| App Background | `#F7F7F5` | `#181916` |
| Sidebar | `#EFEFED` | `#1E1F1C` |
| Surface | `#FFFFFF` | `#242522` |
| Surface Subtle | `#F1F1EF` | `#292A26` |
| Selected | `#E4E4E1` | `#30312D` |
| Hover | `#EAEAE7` | `#2A2B27` |
| Border | `#DEDED9` | `#353630` |
| Border Strong | `#C9C9C3` | `#484943` |
| Text Main | `#20201E` | `#F1F1ED` |
| Text Muted | `#676762` | `#B5B5AE` |
| Text Faint | `#92928C` | `#85857E` |
| Operational | `#087A4B` | `#36C783` |
| Operational Soft | `#E5F2EA` | `#193A2B` |
| Info | `#3978B8` | `#6CA6DA` |
| Warning | `#A87218` | `#D2A14D` |
| Danger | `#C74747` | `#E06B6B` |

色值不能直接写入业务组件，落地规则见 `docs/design-docs/frontend/front-主题与配色规范.md`。

## 文本系统

### 字体栈

桌面端使用系统 UI 字体，不引入 CursorGothic 或营销展示字体：

```css
--font-ui:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Hiragino Sans GB",
  "Segoe UI",
  "Microsoft YaHei",
  "Helvetica Neue",
  sans-serif;

--font-mono:
  "SFMono-Regular",
  "JetBrains Mono",
  "Cascadia Code",
  Menlo,
  Consolas,
  monospace;
```

AI 输出正文继续跟随 UI 字体，代码、diff、Bash 和行内 code 使用 mono 字体。

### 字号

桌面端使用稳定的 `11 / 12 / 13 / 14 / 16 / 20 / 24` 节奏：

```css
--text-xxs: 11px;
--text-xs: 12px;
--text-sm: 13px;
--text-md: 14px;
--text-lg: 16px;
--text-xl: 20px;
--text-title: 24px;
```

- 时间戳、徽标、kicker：11px。
- Sidebar 分区标题：12px。
- Sidebar 主入口、会话标题、Settings、文件名：13px。
- 消息正文、Thinking、工具行：14px。
- Composer 输入：16px。
- 页面和主要面板标题：20–24px。
- 代码、diff、Bash：13px。

Usage 等数据页允许出现 42–72px 的数据数字，但它们不是营销标题。

### 字重与行高

```css
--font-regular: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

--leading-tight: 1.25;
--leading-ui: 1.4;
--leading-body: 1.6;
```

字重只允许 `400 / 500 / 600 / 700`。优先用字号、颜色和空间区分层级，不使用 440、520、650、800 等不稳定档位，也不在普通 UI 中使用营销式负字间距。

## 间距与密度

采用 4px 网格：

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

- Sidebar 列表项通常为 32–40px。
- 图标按钮视觉尺寸可以较小，但点击区应接近 32–40px。
- 设置内容列保持适中阅读宽度，不在大窗口横向铺满。
- 中间消息区保护行长和 Composer 宽度。
- 高密度不等于拥挤：分组靠间距和 surface 层级，不靠大量卡片。

## 圆角

```css
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-pill: 999px;
```

- 行内标签、小控件：4px。
- Sidebar selected、紧凑行：6px。
- 按钮、输入框、segmented item：8px。
- Composer、popover、dialog、Sheet：12px。
- 状态点和必要胶囊：999px。

不要把所有容器都做成大圆角卡片。

## 边框、阴影与层级

- 分栏、输入框和列表分组优先使用 1px hairline。
- 主工作台通常不使用阴影。
- Popover、dialog、Sheet 可以使用低透明度柔和阴影。
- Composer 可以依赖 surface + border 获得层级，不默认使用蓝色光晕。
- 设置分组不使用“白卡 + 边框 + 大圆角 + 阴影”四件套。

建议目标阴影：

```css
--shadow-popover: 0 16px 40px rgba(20, 21, 18, 0.12);
--shadow-dialog: 0 24px 64px rgba(20, 21, 18, 0.18);
```

## 图标语言

- 统一使用线性图标，默认 `currentColor`。
- 普通功能图标保持中性，不按功能类型随意染色。
- 运行、warning、danger 等真实状态才使用语义色。
- 状态同时用文字、图标/形状和颜色表达。
- 图标按钮必须有 `aria-label`；隐藏含义必须通过 tooltip 补足。

## 状态与动效

```css
--motion-fast: 120ms;
--motion-base: 160ms;
--motion-slow: 220ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

- hover、active、focus 不改变布局尺寸。
- running 可使用小型绿色状态点、细环或克制 shimmer。
- completed 回到中性样式，不逐条染绿。
- error、warning、approval 使用对应语义色。
- resize、collapse、popover 不超过 300ms。
- 所有动画尊重 `prefers-reduced-motion`。

## 组件视觉基线

### Sidebar

- 中性灰 sidebar；选中态为更深灰底和主文字。
- 当前选中不使用蓝点、蓝色图标或绿色底。
- busy / running 可以使用小型 operational 绿点。
- hover、selected、pressed 用灰阶区分。

### Composer

- 使用主题 surface + 中性 hairline。
- 发送按钮使用反色 ink action。
- Context usage 默认中性，只在阈值风险时使用 warning / danger。
- 运行反馈可以使用绿色细环或小点，不把发送按钮改成绿色 CTA。

### Message flow

- 普通回复和工具行使用黑灰文字。
- running shimmer 的基础文字保持中性，叠加层可以使用 operational token。
- completed 回到 muted，不显示整行绿色。
- diff additions / removals 使用低饱和绿红。

### Settings

- 导航选中态为灰底黑字。
- 内容分组使用 surface-subtle，不堆卡片和阴影。
- Toggle 开启使用 operational green。
- 内容列保持稳定阅读宽度。

### Context / Usage / Kairos

- 允许有限的低饱和数据色，保留 ActSpace 自有特征。
- 图表色只编码数据，不承担主操作。
- Kairos running 为绿，sleep / waiting 为灰，warning 为琥珀，failed 为红。

## 旧资产的地位

`frontend/` 内现有 PNG 和 HTML 记录旧实现阶段，其中部分仍包含蓝色主强调、旧圆角或旧布局。它们可以用于理解组件结构和历史决策，但不能覆盖本规范的目标颜色职责。

在新的 Sidebar、Composer、Settings 浅深主题样板确认前：

- 旧图标记为历史视觉基线。
- 新实现不得仅以旧截图做颜色验收。
- 结构交互仍可参考对应组件规范。

## 落地检查

新增或修改 UI 时：

1. 先判断它属于 neutral、action、operational、semantic 还是 chart。
2. 如果去掉颜色后层级消失，先修灰阶和排版。
3. 不在组件里写主题相关 hex。
4. 不把所有旧 `brand` 使用点替换成 operational green。
5. 同时验证浅色、深色和键盘 focus。
6. 状态不能只依赖颜色。
