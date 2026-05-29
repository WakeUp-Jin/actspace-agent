# 全局视觉语言规范

## 定位

这份文档定义 `actspace` 桌面端的全局视觉语言。它优先约束字体、颜色、间距、圆角、阴影和动效 token，避免不同组件各自发明局部样式。

后续修改前端 UI 时，应先确认这里的全局规则，再进入具体组件规范。

## 设计方向

`actspace` 的视觉气质是：轻量桌面工作台、克制、清晰、长期使用不疲劳。

当前方向可以概括为：

- 黑色负责阅读。
- 灰白负责承载。
- 蓝色负责行动和品牌记忆。

整体可以保留 DeepSeek 相关的蓝色联想，但不把主界面染成大面积蓝色。蓝色是关键动作和状态信号，不是默认背景。

## 色彩原则

### 主色使用边界

蓝色只用于：

- 发送按钮等主操作。
- 当前选中状态中的小面积标识。
- focus ring。
- 链接、上下文入口、运行中或可执行状态。
- 需要用户注意的少量信息提示。

蓝色不用于：

- 大面积页面背景。
- 所有正文文本。
- 所有边框。
- 所有 hover 状态。
- 普通容器阴影或装饰。

如果一个区域需要长期阅读或停留，优先使用白色、冷灰和中性浅灰。

### 基础色板

建议首版 token：

```css
--color-brand: #2f6fff;
--color-brand-strong: #1f5fe8;
--color-brand-soft: #edf4ff;

--color-bg: #fbfcff;
--color-surface: #ffffff;
--color-surface-subtle: #f7f8fa;
--color-sidebar: #f3f5f7;
--color-sidebar-selected: #e6e9ed;

--color-border: #dfe4ea;
--color-border-strong: #c8d1dc;

/* 文字层级走"主前景 + alpha 梯度"，参照 Cursor `.monaco-workbench` 的 cursor-text-* */
--color-text: #202124;
--color-text-muted:  rgba(32, 33, 36, 0.72); /* ≈ Cursor secondary 74% */
--color-text-faint:  rgba(32, 33, 36, 0.54); /* ≈ Cursor tertiary 54% */
--color-text-subtle: rgba(32, 33, 36, 0.36); /* ≈ Cursor quaternary 36% */

--color-warm: #d99a20;
--color-danger: #d94d5c;
--color-success: #16a36a;
```

这些值是设计基线，不要求每次组件调整都机械照抄；但新增样式应优先引用语义 token，而不是在组件里随手写新的十六进制颜色。

**关于文字色用 `rgba(主前景, α)` 而不是独立灰 hex 的设计意图**：

`actspace` 的背景是冷调（`--color-bg: #fbfcff`、`--color-sidebar: #f3f5f7`）。如果文字 muted / faint 使用独立的"纯中性灰"hex（如 `#5f6670`、`#8b949e`），灰色色相会与冷蓝背景对立，肉眼立刻感觉"灰得太纯，飘在背景上"。

参照 Cursor 的做法，把弱化的文字层级定义成"主前景色的 alpha 梯度"：

- α=1.00 → primary（主阅读文本）
- α≈0.72 → secondary / muted（次级信息）
- α≈0.54 → tertiary / faint（弱提示、分组标题、时间戳）
- α≈0.36 → quaternary / subtle（占位、最弱元信息）

这样文字色会"吸收"背景色调——白卡片上仍是纯灰、浅蓝 sidebar 上会带一丝冷调——视觉上始终"长在背景里"，跨容器一致性也更好。这是冷调背景下"灰色看起来奇怪"问题的根治方案。

### 主题与暗色（硬约束）

上面的基础色板是**浅色基线**。`actspace` 支持 **浅色 / 深色 / 跟随系统** 三态主题，因此有一条贯穿所有样式工作的硬约束：

> **颜色必须随主题翻转。组件里只允许用语义 token / 语义 Tailwind 类（`text-text-main` / `bg-surface` / `border-line` …），不允许用「不随主题变化的颜色字面量」（`text-black` / `bg-white` / `text-[#hex]` / `bg-[#hex]`）承载主题相关的文字、背景、边框。**

最典型的坑：深色背景上写了 `text-black`，黑字直接看不见。这不是「深色专项」一次性的事，而是从此以后写任何颜色的默认要求。机制细节、禁止写法清单、合法例外、自检清单与验收要求见 **`主题与配色规范.md`**——写颜色前先读它。

## 文本系统

### 文本颜色

默认正文、消息回复、按钮文字和导航文字使用中性黑或炭黑，而不是深蓝。

推荐语义：

- `--color-text`：主要阅读文本、标题、普通按钮文字（α=1）。
- `--color-text-muted`：次级信息、辅助描述、非当前状态（α≈0.72）。
- `--color-text-faint`：弱提示、占位内容、低优先级元信息、分组标题、时间戳（α≈0.54）。
- `--color-text-subtle`：最弱的占位 / kicker / hover 触发前的图标（α≈0.36）。
- `--color-brand`：只用于可点击重点、当前状态、小面积强调。

不要把全局文本色设成品牌蓝。品牌色应该让用户知道“这里可操作”或“这里重要”，而不是承担所有阅读。

### 字体栈

桌面端优先使用系统字体，保持 macOS 原生感和中文可读性。字体栈与 Cursor `.monaco-workbench.mac:lang(zh-Hans)` 同源：

```css
--font-ui:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Hiragino Sans GB",
  "Segoe UI",
  "Microsoft YaHei",
  "Helvetica Neue",
  Arial,
  sans-serif;

--font-display:
  -apple-system,
  BlinkMacSystemFont,
  "PingFang SC",
  "Hiragino Sans GB",
  "Segoe UI",
  "Microsoft YaHei",
  "Helvetica Neue",
  Arial,
  sans-serif;

--font-mono:
  "SFMono-Regular",
  "Cascadia Code",
  "JetBrains Mono",
  monospace;
```

要点：

- **不要把 `"SF Pro Text"` / `"SF Pro Display"` 放在最前面**。这两个是 SF Pro 系列的子家族，会让英文走 SF Pro Text、中文 fallback 到 PingFang SC，基线和字号比例不齐。让 macOS 通过 `-apple-system` 自动选 San Francisco 才能与 Cursor / Finder / Safari 等系统 UI 一致。
- `actspace` 是高频桌面工具，不优先引入装饰性字体。品牌感主要来自密度、层级、色彩克制和交互细节。

### 字体特性（font-feature-settings）

```css
body {
  font-feature-settings: normal;
}
```

**全局保持 `normal`，不要打开 `cv11`、`ss01` 等拉丁 stylistic set / character variant**。理由：

- Cursor `.monaco-workbench` 全局也是 `normal`，只在数字字段局部启用 `"tnum"`、个别 hotkey 元素启用 `"cv05" on`。
- 一旦全局开启 `cv11/ss01`，英文字符会被替换成 SF Pro 的另一种字形（例如双层 `g` 变单层、`l` 末端加钩），整个 UI 的拉丁字符就和 macOS 系统 UI 不一致，肉眼一看就"不像原生应用"。
- 需要数字表格化的场景，**在该元素上局部使用 `font-variant-numeric: tabular-nums`**（必要时叠加 `font-feature-settings: "tnum"`），不要靠 body 全局开关。

### 字号阶梯

桌面端字号阶梯比移动端更紧凑，整体对齐 Cursor 的 `11 / 12 / 13 / 16 / 20 / 24` 节奏：

```css
--text-xxs: 11px;
--text-xs: 12px;
--text-sm: 13px;
--text-md: 14px;
--text-lg: 16px;
--text-xl: 20px;
--text-title: 24px;
```

使用建议（桌面端密度，已对齐 Cursor IDE）：

- Sidebar 主入口、会话标题、Workspace 文件夹、Settings：`13px`。
- Sidebar 分区标题（Pinned / Scheduled / Workspaces）：`12px` + `--color-text-faint`，靠"小一档字号 + 弱颜色"区分语义，不靠非标字重。
- 会话时间戳、徽标、kicker 等元信息：`11px`。
- 消息正文、Thinking、工具行：`14px`，行高保留 `1.42`–`1.65`，保证长时间阅读舒适。
- Composer 输入：`16px`。
- Markdown headings：`h1 ~1.34rem / h2 ~1.18rem / h3 ~1.04rem / h4 ~0.98rem`，全部 `font-weight: 700`，**不加负 `letter-spacing`**。
- 代码、diff、Bash 输出：`13px` 等宽字体。
- 表格表头 / 卡片标题：`12px`–`16px`，配 `font-weight: 600`。
- Usage 大数字（hero / cache 百分比）：`clamp(56px, 5.1vw, 72px)` / `42px`，`font-weight: 700`，最多保留 `letter-spacing: -0.02em`。

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

**字重只允许使用 `400 / 500 / 600 / 700` 这四档。** 禁止使用 `430 / 440 / 520 / 540 / 620 / 650 / 680 / 720 / 800` 等中间或超粗档。理由：

- 中间档（430/440/520 等）在 macOS 系统字体（San Francisco）渲染时权重落点不稳定，肉眼经常感觉像"半 medium"或"半 regular"，并与 macOS 系统 UI 不一致。
- 早期版本曾用「主入口 520 / 分组标题 440」做"重一档 vs. 轻一档"区分，已统一改为「都用 500，靠字号 + 颜色 token 区分语义」。
- Black 档（800）在桌面工作台场景下会让数字过度抢镜；Usage 等数据大数字统一使用 `700`，留出与品牌色搭配的呼吸感。

规则：

- 普通正文、消息文本、Thinking、工具行：`400`。
- 导航项、按钮、文件名、tab、表格表头：`500` 或 `600`。
- 页面 / 卡片 / Markdown 标题、Usage 大数字：`600` 或 `700`。
- **优先用字号和颜色（`--color-text` / `--color-text-muted` / `--color-text-faint`）区分层级，不要用非标字重区分**。
- 字间距默认保持 `0`；只允许在 50px 以上的 hero 数字处使用 `letter-spacing: -0.02em` 内的轻微紧凑。

## 间距与密度

整体采用 4px/8px 节奏：

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
```

桌面端需要比移动端更高密度，但不能像后台表格一样拥挤：

- Sidebar 列表项高度建议在 `36px` 到 `44px`。
- 图标按钮视觉尺寸可小，但点击区域应尽量接近 `32px` 到 `40px`。
- 消息区内容宽度和行长优先保护可读性，不为了铺满窗口而拉长文本。
- Composer 是核心输入控件，可以比普通卡片更有空间感。

## 圆角

建议 token：

```css
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-pill: 999px;
```

使用建议：

- Sidebar 选中项、普通按钮：`6px` 到 `8px`。
- Composer、弹窗、文件预览：`12px`。
- 状态点、胶囊按钮：`999px`。
- 不要把所有容器都做成大圆角卡片。工作台区域应保持桌面应用的克制边界。

## 阴影与边框

边框优先于阴影。阴影只用于明确浮层或核心输入区域。

建议 token：

```css
--shadow-soft: 0 18px 48px rgba(31, 45, 61, 0.08);
--shadow-popover: 0 24px 64px rgba(31, 45, 61, 0.14);
```

使用建议：

- 主布局分栏主要用边框分隔。
- Composer 可以使用轻阴影，因为它是主要输入焦点。
- 弹窗和菜单可使用更明显阴影。
- 消息、diff、工具日志不应全部浮起，否则工作台会显得碎。

## 状态与动效

建议 token：

```css
--motion-fast: 120ms;
--motion-base: 160ms;
--motion-slow: 220ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

规则：

- hover、active、focus 使用颜色、边框和透明度变化，不改变布局尺寸。
- resize、collapse、popup 等状态变化应保持轻快，避免超过 `300ms`。
- 所有动画应尊重 `prefers-reduced-motion`。
- 不为了装饰加入无意义动效。

## 组件落地规则

新增或修改组件时：

1. 先选语义 token，再写具体 CSS。
2. 如果需要新增颜色或字号，先判断是否应扩展这份规范。
3. 主操作优先使用品牌蓝，次级操作使用中性文字和浅灰背景。
4. 文本默认使用中性黑，不使用品牌蓝。
5. 一屏内蓝色面积要小，出现位置要有明确意义。
6. 组件局部样式不能覆盖全局阅读体验，例如把消息正文改成过小或过淡。

## 当前不做

- 不引入完整第三方设计系统。
- 不做大面积渐变背景。
- 不把 DeepSeek 官网视觉直接搬进桌面端。
- 不用品牌蓝替代所有层级表达。
- 不为了品牌感牺牲长时间阅读和输入舒适度。
