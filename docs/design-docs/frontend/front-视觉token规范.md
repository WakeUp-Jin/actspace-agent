# 视觉 token 规范

管桌面端 renderer 的颜色、字号、间距、圆角、阴影、层级、动效，以及样式写在哪一层。数值以 `apps/desktop/src/renderer/styles/tokens.css` 与 `tailwind.css` 为准，本文只写职责和判断规则。品牌总纲见根目录 `DESIGN.md`。

## 1. 颜色职责

一句话：灰阶负责层级，墨色负责操作，翡翠绿负责运行语义。

| 职责 | 管什么 | 主要 token |
|---|---|---|
| Neutral | 空间层级、文字层级、hover、分隔线、普通工具日志 | `app-bg` `sidebar` `surface` `surface-subtle` `surface-raised` `selected` `hover-overlay` `line` `line-strong` `text-main/muted/faint/subtle` |
| Action | 每个区域最多一个的最高优先级动作 | `action` `on-action`（浅色近黑底，深色近白底） |
| Operational | Agent 运行中、已连接、健康、成功 | `operational` `operational-soft` |
| Accent | 用户选的强调色，只驱动第 4 节列出的几处 | `accent` `toggle-on` `link` `focus-ring` |
| Semantic | `info` 信息；`warning` 风险、等待审批、阈值；`danger` 错误、删除、失败、diff 删除 | 各自带 `-soft`、`on-*` |
| Data | 图表、Context bucket、diff 增删、热力图，只编码数据 | `chart-series-*` `--act-context-*` `diff-*` |

判断规则：

1. 去掉所有彩色后，页面层级仍要看得懂；看不懂就是灰阶没做完。
2. 绿色约占界面 2%–5%。绿色出现在选中导航、普通按钮、链接、大面积背景、每条已完成的工具日志上，都是错的。
3. 已完成回到中性（`text-muted`），不逐条染绿；运行中工具日志用中性墨色扫光，不用绿色（`check:frontend-tokens` 守）。
4. 数据色不接管 CTA、选中和导航；蓝色只留给 info 和数据，不回流成按钮或焦点。
5. 文字层级：`text-main` 标题与正文；`text-muted` 说明和次要正文；`text-faint` 时间戳、元信息、默认图标；`text-subtle` 箭头、占位符等装饰，对比度低，不承载必须读到的信息。
6. focus、selected、running 是三个状态，不共用同一个彩色 token。
7. 图标用线性图标（lucide），默认 `currentColor`；普通功能图标保持中性，不按功能类型染色，只有真实状态（运行、warning、danger）才用语义色；装饰图标加 `aria-hidden`。尺寸、线宽和命名见 §12。

## 2. 色板

唯一一份。浅 / 深两列都要有，新增 token 同时给两套值。

| token | 浅色 | 深色 |
|---|---|---|
| `bg` | `#f7f7f5` | `#181916` |
| `sidebar` | `#efefed` | `#1e1f1c` |
| `surface` | `#ffffff` | `#242522` |
| `surface-subtle` | `#f1f1ef` | `#292a26` |
| `surface-raised` | `#ffffff` | `#30312d` |
| `selected` | `#e4e4e1` | `#30312d` |
| `hover-overlay` | `#eaeae7` | `#2a2b27` |
| `scrim`（普通弹窗遮罩） | `rgba(17,24,39,.16)` | `rgba(0,0,0,.4)` |
| `overlay`（重遮罩） | `rgba(17,24,39,.32)` | `rgba(0,0,0,.55)` |
| `border`（`line`） | `#deded9` | `#353630` |
| `border-strong`（`line-strong`） | `#8c8c85` | `#787870` |
| `text` | `#20201e` | `#f1f1ed` |
| `text-muted` | `#676762` | `#b5b5ae` |
| `text-faint` | `#72726b` | `#96968f` |
| `text-subtle` | `#85857e` | `#787870` |
| `action` | `#20201e` | `#f1f1ed` |
| `operational` | `#087a4b` | `#36c783` |
| `info` | `#3978b8` | `#6ca6da` |
| `warning` | `#91600e` | `#d2a14d` |
| `danger` | `#c74747` | `#e06b6b` |
| `meter-track`（容量条空轨道） | `#e9e9e5` | `#3a3b35` |
| `toggle-off` | `#d3d3ce` | `#4a4b45` |

深色用暖黑灰，不用纯黑。`line-strong` 比 `line` 重很多，不拿它当容量条空轨道（会像已使用），空轨道用 `meter-track`。

## 3. 主题机制与硬约束

- 三态：`light` / `dark` / `system`，由 `<html data-theme>` 控制；`system` 靠 `prefers-color-scheme`，组件不监听系统主题。Electron 的 `nativeTheme.themeSource` 同步交通灯、滚动条和系统菜单。
- CSS 变量 `--act-color-*` 是颜色的唯一来源，`tailwind.css` 的 `@theme inline` 只做映射。新增语义 token 必须同时在 `:root`、`:root[data-theme="dark"]`、`system` 的 dark 媒体块里定义。
- 组件里禁止 `text-black`、`bg-white`、`bg-black`、`#hex`、`rgba()`、Tailwind 调色板色（`text-red-500` 之类）；用 `text-text-main`、`bg-surface`、`border-line`、`text-danger` 等语义类。缺颜色时先加浅深两套 token，再写组件。
- 例外只有：恒定反色的 tooltip 或遮罩、Toggle 白色滑块、低 alpha 装饰叠层、第三方品牌 logo 色、媒体内容本身、外观页主题缩略图（`--act-preview-*`，固定色）、文件类型图标（`--act-file-type-*`）、聊天 Mermaid 画布（`MERMAID_THEMES` 固定预设，有意不随主题翻转；画在画布上的文字只能取预设里的颜色）。
- 任何带颜色的改动，浅色、深色都要看一遍。
- 键盘焦点必须清晰：全局 `:focus-visible` 为 3px `focus-ring` 轮廓；`Button` / `IconButton` 自带 2px 轮廓。写 `focus-visible:outline-none` 就要给替代样式。

## 4. 强调色

设置 → 外观 → 强调色，`<html data-accent>`，与明暗独立。注册表在 `appearance/accents.ts`，色值在 `tokens.css` 的 `:root[data-accent="…"]`。当前有默认、蓝、紫、粉、橙；不收绿（与 operational 冲突）和黄（与 warning 冲突）。

只驱动这些位置（默认调色板回落到括号里的值）：

| 位置 | 消费方式 |
|---|---|
| Composer 发送按钮、工具审批主按钮 | `IconButton` / `Button` 的 `accent`（action 反色） |
| 开关开启态 | `bg-toggle-on`（operational） |
| 键盘焦点、输入框 focus、分割线拖动 | `focus-ring`（中性墨灰） |
| 普通链接 | `link`（info） |
| 文字选中 | `--act-color-selection`（中性 20%） |

其余位置一律不跟强调色：普通主按钮（`primary`）、导航与列表选中、状态点、进度条、审批卡边框、数据色、用户消息卡底色。

新增调色板 = `accents.ts` 加一行 + `tokens.css` 加一个 `data-accent` 块（浅深各一个源值）+ 一个 `--act-preview-accent-*` 色样。对比度门槛由 `check:frontend-theme` 校验：浅色白字在强调色上、强调色文字在 `surface` / `bg` / `surface-subtle` 上 ≥ 4.5:1；深色 `#181916` 在强调色上、强调色文字在 `surface` / `bg` / `surface-raised` 上 ≥ 4.5:1。

## 5. 字体与字号

### 5.1 三层字号

整个窗口只有三层文字，层与层之间差 2px，层内不再细分：

| 层 | 字号 | 管什么 |
|---|---:|---|
| 辅助 | 11 / 12px | 时间、徽标、分区标题、说明、表头、底部状态 |
| 界面 | 13px | 侧栏、标题栏、按钮、菜单、设置行、工具行与 Thinking、代码 |
| 阅读 | 15px | AI 回复正文、用户消息、输入框 |

14px 夹在界面和阅读之间，只给「对话里的次级内容」：正文里的表格、对话内卡片（待办、审批、子 Agent 来信）、分组标题。标题从阅读层往上走：16 / 18 / 20 / 24px。

判断规则：

1. 同一屏的阅读层字号不超过界面层的 1.2 倍（15 / 13 ≈ 1.15）。正文比外壳大出两档以上，窗口就会像两个产品拼在一起。
2. 用户消息、AI 正文、输入框是同一层，必须同字号；工具行、Thinking、`Worked for` 是过程，属于界面层，比正文小一档。
3. 区分层级先用颜色（`text-main` → `muted` → `faint`），再用字重，最后才换字号。同一个容器里出现三种以上字号，先检查是不是该用颜色。
4. 新界面不许发明字号。档位表里找不到合适的，说明角色没想清楚，回到上面三层里选。

### 5.2 字体

- 界面和聊天正文都用 `--act-font-ui`（系统 UI 字体 + 苹方 / 雅黑）；代码、diff、Bash、行内 code 用 `--act-font-mono`。
- 不用衬线字体，不设单独的「阅读字体」。原因：macOS 和 Windows 都没有适合屏幕正文的中文衬线，西文衬线 + 中文黑体会让「2026 年 11 月」这样的一行里数字和汉字是两种字体。
- 一行文字里只能有 UI 字体和等宽字体两种；等宽只用于代码、路径、命令、快捷键和 token 数这类需要逐字符辨认的内容。

### 5.3 字号档位

字号只用 `text-act-*`（只设字号，不带行高）；CSS 文件里写 `var(--text-act-*)`。

| 类 | 大小 | 用在 |
|---|---:|---|
| `text-act-xxs` | 11px | 时间戳、徽标、kicker、表格脚注、代码块工具条 |
| `text-act-xs` | 12px | 分区标题、说明、Tooltip、按钮 xs、表头、底部状态行、代码块头 |
| `text-act-sm` | 13px | 侧栏条目、标题栏、设置行标题、按钮、菜单项、工具行、Thinking、`Worked for`、文件名、代码 / diff / Bash |
| `text-act-md` | 14px | 正文里的表格与 `<details>`、对话内卡片正文、分组标题 |
| `text-act-base` | 15px | AI 回复正文、用户消息、Composer 输入、聊天 H4 |
| `text-act-lg` | 16px | 对话框标题、卡片里的关键数值、聊天 H3 |
| `text-act-head` | 18px | 聊天 H2、文档面板 H3 |
| `text-act-xl` | 20px | 页面与面板标题、聊天 H1 |
| `text-act-title` | 24px | 最大标题 |

- 不用 Tailwind 默认的 `text-xs`、`text-sm`（`text-sm` 是 14px，与本表同名不同值），不写 `text-[13px]`；同一元素上不叠两个字号类（生效的是生成顺序，不是书写顺序）。
- `styles/*.css` 里的 `font-size` 只写 `var(--text-act-*)`、`var(--act-font-mono-size)`、`inherit` 或 `em`；不写 `12.5px`、`0.72rem` 这类字面量。`em` 只用于必须跟随所在文字缩放的行内元素（行内 code、`kbd`、公式）。
- 8 / 9 / 10px（`text-act-5xs` / `4xs` / `3xs`）只允许在轨迹视图和 Harness 统计两类数据密集页使用，其他位置最小 11px。反例：普通设置页、面板正文里出现 10px。
- 数据页的 42–72px 大数字不是营销标题，要在 `scripts/check-frontend-design-tokens.mjs` 的 allowlist 逐条登记。
- 外观设置的「界面字号」是整窗缩放，本表所有档位等比变化；「代码字号」只改 `--act-font-mono-size`（默认 13px）。

### 5.4 行高

单行控件用固定行高，多行文字用比例行高。组件里只用下面这些类，不写 `leading-[1.55]`、`leading-[17px]`：

| 类 | 值 | 用在 |
|---|---:|---|
| `leading-none` | 1 | 图标旁的数字、徽标 |
| `leading-4` | 16px | 11 / 12px 的单行文字 |
| `leading-4.5` | 18px | 12px 的紧凑行（文件变更行、轮尾卡片） |
| `leading-5` | 20px | 13 / 14px 的单行文字 |
| `leading-5.5` | 22px | 15px 的单行文字、输入框 |
| `leading-snug` | 1.375 | 标题 |
| `leading-normal` | 1.5 | 多行说明、Tooltip、设置项描述 |
| `leading-relaxed` | 1.625 | 多行阅读：用户消息、展开的思考内容、对话内卡片正文 |

AI 回复正文的行高 1.7 只写在 `markdown.css`，代码块 1.6。中文正文行高不低于 1.6，标题不低于 1.35。

### 5.5 字重与字距

- 字重只用 `font-normal` 400 / `font-medium` 500 / `font-semibold` 600。`font-bold` 700 不用（苹方的 700 和 600 差别很小，Windows 上却明显更黑）；CSS 里不写 650 这类中间值。
- 400 正文和说明；500 可点击的条目名、按钮、表头；600 标题、正文粗体、关键数值。
- 普通 UI 不加负字间距；全大写的小标签可以加 `tracking-wide`。
- 数字列和需要对齐的数值加 `tabular-nums`。

### 5.6 聊天区一览

细则见 [聊天区 Markdown 渲染规范](front-聊天区Markdown渲染规范.md) §4 和 [中间消息区规范](front-中间消息区规范.md)。

| 对象 | 字号 / 行高 | 字重与颜色 |
|---|---|---|
| AI 回复正文 | 15px / 1.7 | 400，`text-main` |
| 聊天 H1 / H2 / H3 / H4 | 20 / 18 / 16 / 15px，行高 1.35 | 600 |
| 正文表格 | 14px / 1.6；表头 12px | 表头 500 `text-faint` |
| 用户消息 | 15px / 1.625 | 400，`text-main` |
| Composer 输入 | 15px / 22px | 占位符 `text-subtle` |
| 工具行、Thinking 标题、`Worked for` | 13px / 20px | 400，`muted` / `faint` |
| 展开的思考内容 | 13px / 1.625 | `text-muted` |
| 模型名、Composer 里的菜单 | 13px | 500 |
| 底部状态行、统计胶囊 | 12px / 16px | `text-faint` |

## 6. 间距与密度

- 4px 网格，用 Tailwind 间距刻度（`p-0.5` = 2px、`p-1` = 4px、`p-1.5` = 6px、`p-2` = 8px），不写 `p-[7px]`、`gap-[3px]`、`mt-[13px]` 这类零散值；margin / padding / gap / space / inset 的 `-[Npx]` 任意值按文件计数，不得超过 `scripts/spacing-literal-baseline.json` 的基线（desktop 与 web 各一组）。
- 存量约 107 处（2026-11 统计：`7px` 32、`3px` 18、`5px` 10、`18px` 10，其余零散）只减不增：改到某个文件就把它的任意值收到相邻刻度（7→6 或 8，3→2 或 4，5→4 或 6，18→16 或 20），在 Electron 里复看一眼，再跑 `node scripts/check-frontend-design-tokens.mjs --update-spacing-baseline` 收紧基线。确实要和某个像素对齐（例如和图标基线、字形对齐）的，PR 里说明原因再更新基线。
- 列表行高：侧栏 32–40px；设置行最小 52px（紧凑 44px）；表格行约 36px。
- 图标按钮视觉可以小，点击区接近 32px；尺寸只用 `IconButton` 的档位。
- 设置内容列保持阅读宽度，大窗口不横向铺满；中间消息区保护行长（`--conversation-content-width` 880px）和 Composer 宽度。
- 分组靠间距和 surface 层级，不靠堆卡片；不要把所有容器都做成大圆角卡片。

## 7. 圆角

| 类 | 值 | 用在 |
|---|---:|---|
| `rounded-act-xs` | 4px | 行内标签、小控件 |
| `rounded-act-sm` | 6px | 侧栏选中行、紧凑行、按钮、tooltip |
| `rounded-act-md` | 8px | 输入框、菜单面板、分段控件 |
| `rounded-act-group` | 10px | 设置等页面的内嵌分组、数据卡 |
| `rounded-act-lg` | 12px | Dialog、Sheet、popover、用户消息卡、Review 卡片 |
| `rounded-act-xl` | 18px | 只给 Composer 堆叠态与大头像，不给 dialog、popover |
| `rounded-act-pill` | 999px | 状态点、胶囊 |

1–3px 的细进度条、刻度和指示点圆角跟随元素厚度，逐条登记在检查脚本 `LITERAL_ALLOWLIST`，不写别的 `rounded-[…]`。

## 8. 边框、阴影

- 分栏、输入框、列表分组用 1px hairline；主工作台常驻卡片（用户消息卡、消息块）只靠 surface + hairline，不加阴影。
- 设置分组 = `surface` + 1px `line` + 10px 圆角，无阴影，组内行用 `divide-line/60`；分组标题行不单独换底色。
- 只有浮起的东西用阴影，全部来自 `tokens.css`（浅色暖色基底，深色换纯黑低透明度）：

| 类 | 用途 |
|---|---|
| `shadow-act-xs` | 小按钮描边感 |
| `shadow-act-knob` | Toggle 滑块 |
| `shadow-act-thumb` | 附件、图片缩略图 |
| `shadow-act-soft` | 大面积浮起：关机遮罩、Sheet |
| `shadow-act-popover` | 菜单、tooltip、hover card |
| `shadow-act-float` | dialog、窄窗口抽屉 |
| `shadow-act-composer` / `-focus` | 仅 Composer |

## 9. 层级（z-index）

组件写 `z-(--act-z-*)`；组件内部局部叠放（sticky 表头、行号列）用 Tailwind `z-1` / `z-2`，不进分层，不写 `z-[N]`。

| token | 值 | 用途 |
|---|---:|---|
| `pane` | 30 | SplitView 拖拽柄 |
| `drawer` | 50 | 窄窗口侧栏 / 右面板抽屉（低于标题栏） |
| `chrome` | 60 | 窗口标题栏 |
| `dropdown` | 80 | 组件内 absolute / fixed 菜单 |
| `overlay` | 100 | 工作区内的全屏遮罩（Review） |
| `modal` | 150 | dialog、Sheet |
| `popover` | 200 | tooltip、hover card、portal 到 body 的菜单 |
| `system` | 1000 | 关机遮罩 |

## 10. 动效

- 时长只用 `duration-(--motion-fast|base|slow)`（120 / 160 / 220ms），缓动 `--ease-standard`；不写 `duration-150`、`duration-[130ms]`。
- hover、active、focus 不改变布局尺寸；resize、折叠、popover 不超过 300ms。
- running 可用小绿点、细环或克制扫光；`prefers-reduced-motion` 下全局动画与过渡压到 0.01ms，工具日志扫光层 `display: none`。

## 11. 样式写在哪

Tailwind v4 + Preflight，入口 `styles/index.css`，层序 `theme, base, chrome, components, utilities`。

| 归属 | 放什么 |
|---|---|
| 组件的 Tailwind utility | 布局、间距、字号、颜色、hover / focus / disabled、响应式、常规卡片和弹窗。默认写这里 |
| `tokens.css` | `--act-*` 变量，样式语义的来源 |
| `tailwind.css` | `@theme inline` 把 `--act-*` 映射成 utility |
| `base.css`（`layer(base)`） | html / body / root、滚动条、全局 focus、selection、少量 keyframes |
| `electron.css`（`layer(chrome)`） | 窗口拖拽与 no-drag 区域 |
| `markdown.css`、`diff.css`、`tool-result.css`、`trajectory.css` 等（`layer(components)`） | 模型输出、代码、diff、轨迹这类 Tailwind 管不到的内容边界 |

- 普通页面和组件样式不往全局 CSS 加；新增全局样式先判断属于上表哪一行。
- 默认不用 `@apply`；不要把旧的 `.usage-*`、`.sidebar-*` 类名翻译成 `@apply` 再留着。
- className 过长就提成 React 组件或局部常量，不回到大 CSS 文件。
- 任意值（`w-[…]`）只用于大数字 `clamp()`、特殊 grid、窗口尺寸等确实需要的地方。

## 12. 图标

只用 `lucide-react`，颜色规则见 §1.7。

- **尺寸**只用这些档位：12（行内标签、`IconButton` xs）/ 14（列表行、菜单项、按钮里的图标）/ 16（`IconButton` sm、md）/ 18（`IconButton` lg、工具栏主操作）/ 20、22（面板空态、对话框标题）。更大的只有空态插画和 Logo 用 28 / 40 / 56。存量的 11 / 13 / 15 / 17 等非档位值记在 `exec-plans/tech-debt-tracker.md`，评审时顺手收敛，不新增。
- **线宽**：业务组件不传 `strokeWidth`，统一用 lucide 默认 2；粗细差异靠尺寸和颜色表达，不靠线宽。需要和 lucide 风格一致的手绘 SVG 用 16 或 24 viewBox，线宽按文件登记在检查脚本的 `LITERAL_ALLOWLIST`。
- **命名**：导入 lucide 的规范名，不用别名（别名只是 re-export，渲染出的 `class` 仍是规范名，在测试和样式里对不上）。本仓库同一含义只用一个图标，首选如下，脚本会拦截左列：

| 不要用 | 用 | 说明 |
|---|---|---|
| `AlertCircle`、`CircleAlert` | `CircleExclamationPoint` | 行内提醒、错误 |
| `AlertTriangle`、`TriangleAlert` | `TriangleExclamationPoint` | 警告 |
| `ShieldAlert` | `ShieldExclamationPoint` | 权限 / 安全警告 |
| `CheckCircle2` | `CircleCheck` | 完成 |
| `CircleHelp` | `CircleQuestionMark` | 帮助 |
| `Loader2` | `LoaderCircle` | 加载中，配 `animate-spin` |
| `MoreHorizontal` | `Ellipsis` | 更多操作菜单 |
| `Trash2` | `Trash` | 删除 |
| `Code2` | `CodeXml` | 源码 |
| `FileCode2` | `FileCodeCorner` | 代码文件 |
| `BarChart3` | `ChartColumn` | 统计 |
| `AlignLeft` | `TextAlignStart` | 文本对齐 |
| `WrapText` | `TextWrap` | 自动换行 |
| `ArchiveRestore` | `ArchiveArrowUp` | 取消归档 |
| `Terminal`、`TerminalSquare` | `SquareTerminal` | 终端、Bash 命令 |
| `SquareArrowOutUpRight` | `ExternalLink` | 在外部打开 |
| `RotateCw` | `RefreshCw` | 刷新、重试；`RotateCcw` 保留给「重置」 |

- **例外**：`components/trajectory/kind-icons.tsx` 是对标 DSH 轨迹的 16px viewBox、1px 线宽手绘图标，`components/files/FileTypeIcon.tsx`、`components/settings/ProviderLogo.tsx` 是文件类型和品牌 glyph，`components/stats/stats-ui.tsx` 的环形图不是图标；这些文件的线宽按「文件 + 精确匹配串」登记。

## 13. 检查命令

- `pnpm check:frontend-tokens`：禁止 `text-[Npx]`、Tailwind 默认字号、`leading-[…]`、`font-bold`、样式文件里的字号字面量（§5.3，轨迹页样式除外）、`rounded-[…]`、`z-[N≥3]`、`duration-[…]` / `duration-N`、Tailwind 调色板色名、彩色焦点环、旧冷色阴影、JSX 里的 `strokeWidth=`、§12 表格左列的 lucide 导入名；确认引用的 `text-act-*`、`rounded-act-*`、`shadow-act-*`、`--act-*`、`--motion-*` 都有定义；原生 `<button>` 数量不得超过基线；间距任意值（§6）数量不得超过 `scripts/spacing-literal-baseline.json`；`createPortal`、`role="dialog"` 只能在 `components/ui/`。例外按「文件 + 精确匹配串」登记在脚本的 `LITERAL_ALLOWLIST`。
- `pnpm check:frontend-theme`：token 的浅 / 深 / system 三个分支完整，强调色调色板与 CSS 块一一对应并满足对比度，组件无黑白与任意值颜色字面量。
- 两个命令都同时扫描 `apps/web/src`，web 没有字面量例外。
