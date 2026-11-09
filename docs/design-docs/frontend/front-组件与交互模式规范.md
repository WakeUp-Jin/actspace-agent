# 组件与交互模式规范

管 `apps/desktop/src/renderer/components/ui/` 的基础组件怎么选、怎么用，以及设置行、表格、长值、弹层、确认与撤销这些跨页面的交互写法。颜色字号等数值见 [视觉 token 规范](front-视觉token规范.md)，文字与状态见 [文案与状态表达规范](front-文案与状态表达规范.md)。

## 1. 基础组件层

- `components/ui/` 只放通用控件，不接收 `modelId`、`sessionId`、`toolName` 这类业务字段；业务组件消费它，不重写按钮、菜单、浮层的样式。
- 复杂交互（浮层定位、焦点、Esc、键盘导航）基于 Radix 封装；简单控件（`Button`、`IconButton`）用原生 HTML。需要新外观先在基础组件加 variant，不在业务组件新建 `*_BUTTON_CLASS` 常量。
- 现有原语：`Button` `IconButton` `PlainButton` `Tooltip` `HoverCard` `Menu` `ContextMenu` `Select` `Popover` `Dialog` `ConfirmDialog` `UnderlineTabs` `JsonTree`。`Switch`、`Textarea` 仍是业务组件自写（设置页 `Toggle`、Composer 输入框），计划见 `exec-plans/active/20260926-frontend-ui-components-foundation.md`。
- 不进基础层：`SplitView`（工作台布局底座）、消息块（`BashRunBlock` 等）、只在一处用的列表项。
- 区域组件放 `components/<区域>/`，不新建 `features/`；拆分与文件行数规则见 [新功能开发清单](front-新功能开发清单.md)。

## 2. Button 与 IconButton

`Button`（文字按钮）：

| variant | 用在 | 约束 |
|---|---|---|
| `primary` | 主题反色 ink 主操作 | 每个区域最多一个 |
| `accent` | 跟随强调色的发送类主操作（工具审批的允许 / 运行） | 默认调色板下与 primary 一致 |
| `secondary`（默认） | surface + 描边的次要操作 | |
| `tonal` | 主操作旁无描边浅灰底的次要确认（审批「本会话允许」） | |
| `ghost` | 无底的低优先动作 | |
| `danger` | 描边红字，设置里的删除入口 | |
| `danger-solid` | 确认框里的破坏性主操作 | 只用在确认框 |

`size`：`xs` 26px（审批行内）/ `sm` 28px（设置、面板，默认）/ `md` 32px（对话框底部、表单提交）；`shape="pill"` 用于胶囊按钮；`busy` 显示转圈并设置 `aria-busy`，是否禁用由调用方决定。

`IconButton`（纯图标）：`size` `xs` 22 / `sm` 28 / `md` 32 / `lg` 36；`shape` `square` / `round`；`variant` `ghost`（默认）/ `soft` / `danger`（hover 才变红）/ `inherit`（放在有底色 chip 里）/ `secondary` / `primary` / `accent` / `operational` / `warning`。`operational`、`warning`、`accent` 只给 Composer 发送，对应 Chat、Plan、Agent。

规则：

1. 看起来是按钮的用 `Button` / `IconButton`；只要样式不要元素时用导出的 `buttonClass()` / `iconButtonClass()`。
2. `className` 只放布局和显隐（margin、宽度、`opacity-0 group-hover:opacity-100`），不传字号、圆角、颜色去覆盖 variant。
3. `IconButton` 的 `label` 必填，同时是 `aria-label` 和默认 Tooltip；所在控件已有可见文字时传 `tooltip={false}`。
4. 整块可点的区域（表格行展开、卡片、表头排序）用 `PlainButton` 或原生 `<button type="button">`，必须有可见 focus。
5. 菜单项、下拉选项在原语内部（`MenuItem`、`Select` 选项），业务组件不写 `<button>`。尺寸或默认透明度不在 IconButton 档位里、要靠覆盖颜色才能维持外观的按钮，保留原生，不为凑数改。
6. `pnpm check:frontend-tokens` 逐文件比较原生 `<button` 数与 `scripts/native-button-baseline.json`，只许减不许增；减少后用 `node scripts/check-frontend-design-tokens.mjs --update-native-button-baseline` 收紧基线，新增或上升的要在提交说明里写清为什么不能用 `Button` / `IconButton`。
7. 按钮按下 `scale-[0.97]`、disabled 半透明、hover 不改变布局尺寸，这些在组件里已有，业务组件不重写。

## 3. Tooltip

1. 没有可见文字的按钮必须有 `aria-label`，并默认有 Tooltip；两者不能互相替代（Tooltip 给视觉用户，`aria-label` 给辅助技术和测试）。
2. Tooltip 文案写法见 [文案与状态表达规范](front-文案与状态表达规范.md) 第 2 节；带对象的写「关闭 `{标题}`」，禁用态写原因（「输入消息后发送」）。
3. 随状态变化的按钮，`aria-label` 和 Tooltip 同步变化（发送 / 停止、展开 / 收起）。
4. 忙碌或禁用但要说明原因的按钮用 `aria-disabled` 加点击里判断，不用原生 `disabled`（原生禁用不触发 hover / focus，Tooltip 打不开）。
5. 文本被截断的标题、路径、文件名用 `title` 兜底完整值；这不算 Tooltip 迁移范围。
6. Tooltip 外壳只来自 `ui/Tooltip`，业务组件只传 `side` / `align` / `sideOffset`，不写颜色，不复制样式。延迟 350ms，连续悬停 120ms 内跳过。
7. 同一元素既有 Tooltip 又有浮层时，浮层打开期间收起 Tooltip（`open={tooltipOpen && !popoverOpen}`），否则 Esc 先关掉的是 Tooltip。
8. 作为对话框初始焦点的关闭图标可以不加 Tooltip（避免焦点提示抢走 Esc），但 `aria-label` 必须完整。
9. 浮层只放名称加数值，不放标题、单位说明、来源、时间、计算式。反例：使用统计的模型与 Token 浮层里带「推理说明」。
10. 会话行 Tooltip 只显示完整标题与绝对路径，锚点是整行，浮层与侧栏右边保持 8px。

## 4. 弹层怎么选

只有一套实现，全在 `components/ui/`，业务组件不自己 `createPortal`、不自己写 `role="dialog"`、不为关弹层监听 Escape 或 document 点击（`check:frontend-tokens` 守前两条）。

| 要做什么 | 用 | 说明 |
|---|---|---|
| 一列可执行动作或选项，不含输入框 | `Menu`（`MenuItem` / `MenuCheckboxItem` / `MenuRadioItem` / `MenuSub`） | 保留右侧勾选外观的单选：`MenuItem` 加 `role="menuitemradio"` 与 `aria-checked` |
| 右键 | `ContextMenu` | 与 Menu 同构，另支持 Shift+F10 |
| 从一组值里选一个，触发器显示当前值 | `Select` | 替代原生 `<select>` 和自绘下拉 |
| 浮层里有输入框、按钮、成段说明，或不是一列选项 | `Popover` | 触发器是 `IconButton`（自带 Tooltip）时用 `PopoverAnchor` 定位，开关由 `onClick` 控制，`onInteractOutside` 排除按钮本身 |
| 悬停预览 | `HoverCard` | 卡片里有可操作按钮的，标成 dialog 并登记在检查脚本 `UI_ONLY_ALLOWLIST` |
| 用户处理完才能回到背景的流程（表单、确认、全屏预览） | `Dialog` | 背景不可交互，Tab 不出对话框；只是「点开看一眼」用 Popover |
| 破坏性或高风险操作的确认 | `ConfirmDialog` | 见第 5 节 |

`Dialog`：`size` `sm` 420 / `md` 460 / `lg` 520 / `xl` 760 / `full`；`surface` `float`（设置、确认框）/ `raised`（Review、本地更新这类卡片），圆角都是 12px；`backdrop` 默认 `scrim`（轻遮罩），需要压住背景、让人专注的弹窗（填 API Key、本地更新进度、图表预览）用 `overlay`；`closeOnOutsideClick={false}` 用于确认框和正在编辑的表单；遮罩与浮层都是 `-webkit-app-region: no-drag`。

统一行为（原语已实现，新写法不得破坏）：

- Esc 只关最上层；原语内容在 Esc 上 `stopPropagation`，外层的返回、关面板不再响应同一次按键。业务组件只在输入框 / 表单内部监听 Esc（取消重命名、取消录制快捷键）。
- 点外面：Popover、Menu、ContextMenu 关闭，且那一下点击照常落到下面的元素；Popover 因点外面而关闭时不抢回焦点。
- 打开后焦点：菜单键盘打开落在第一项；对话框落在 `initialFocus`，没有时是第一个可聚焦元素；Popover 落在浮层内第一个可聚焦元素。关闭后焦点回到触发器，没有触发器的由 `OpenerCapture` 记下并还回去。
- 定位 `side` + `align` + `collisionPadding={8}`，portal 到 body，不依赖祖先 `overflow-visible`。
- Menu、ContextMenu、Select 共用 `menu-styles.ts`：面板 `rounded-act-md p-1 border-line bg-surface-raised shadow-act-popover`，菜单项 32px 高 `px-2 rounded-act-sm`，层级 `--act-z-popover`；菜单标题 `text-act-xxs text-text-faint`，危险项 `text-danger`。
- 设置页行内编辑 `SettingEditor` 关闭后回到稳定入口；若用户已把焦点移到别处不抢回；输入法合成中的按键不触发取消。

## 5. 确认与撤销

1. 能撤销的操作不弹确认框，改给撤销条：移除模型先在原位给「撤销」条，8 秒后（或离开页面、又移除别的模型时）才真正移除。
2. 只有不可恢复的丢失、对外可见或提升权限的操作才二次确认，例如开启完全访问；确认按钮用 `danger-solid`，默认焦点在「取消」，点遮罩不关，进行中不能关，失败的错误留在弹窗里。
3. 其余操作（归档、重命名、切换）直接执行，不加「确定吗」。
4. 删除入口在设置页用 `Button variant="danger"`，真正执行的那一下才是确认框里的 `danger-solid`；行内删除用 `IconButton variant="danger"`。
5. 删除或断开连接不删除模型、会话和历史用量；确认文案写清楚「删什么、不删什么」一句话。

## 6. 设置页的行、分组与对齐

1. 分组用 `SettingGroup`：`surface` + 1px `line` + 10px 圆角，无阴影，组内行 `divide-line/60`；分组之间间距 36px（`PageShell` 内 `gap-9`），页面宽度默认 736px、宽页 928px；无容器的分组标题加内容用 `SectionShell`。
2. 行用 `SettingRow`：左边标题（13px 中粗），右边控件，最小高 52px（`tight` 44px）；窄于 600px 时控件换到标题下。控件靠右对齐，一页里同类控件宽度一致。
3. 从属设置（父开关控制的行）与同组其他行左对齐，不缩进；父开关关闭时整行变灰、控件禁用。反例：设置子行向右缩进一级。
4. 页面只有一个 `h2`；分组标题 `h3`，分组内小节 `h4`；Dialog 的标题可以是 `h2`，但不能成为页面第二个大标题。
5. 路径、ID、Endpoint 等机器值整行等宽，并提供复制或展开；行内保留的数据或警示文字完整显示、允许换行，不默认单行省略。
6. 设置内容区的二级分类用 `UnderlineTabs`；互斥 2–4 项用 `SegmentedControl`；开关用 `Toggle`，开启靠滑块位置与 `aria-checked` 表达，颜色是 `toggle-on`。
7. 设置页根容器处理没被消费的 Esc，按现有返回动作退出；挂载时不夺取模态层的焦点。

## 7. 表格、列表行与长值

1. 表头与首列左对齐，数值列右对齐并加 `tabular-nums`；展开箭头放在名字之后，不占名字前的位置，不因为有展开箭头就缩进名字。反例：Bash 程序名相对表头「程序」缩进。展开出来的下级明细（子命令）可以缩进列出，列定义不变。
2. 标签永远不被挤压：标签 `shrink-0 whitespace-nowrap`，值 `min-w-0 truncate`，完整值放 `title`。反例：Harness「估算准确度」标签被挤成竖排。
3. 数据密集的行高约 36px，薄边框；窄窗口表格局部横向滚动，不允许把整个页面拖宽。表格最小宽度要写明（如使用统计请求表 800px）。
4. 360px 窄面板里程序名、文件名、URL 过长时截断，完整值在 `title`。
5. 数字用 `tabular-nums`；同一指标在不同页面格式一致（费用、百分比、耗时调同一个 formatter）。
6. 一组指标卡里标签是固定文字，卡片下方不写解释小字（见文案规范）。

## 8. Tab、横向溢出与焦点

1. 标签页保持内容宽度（标题最长约 160px 截断），不被挤成不可读窄条；溢出时不加可见水平滚动条，用折叠菜单或「所有标签页」兜底（右侧面板的具体做法见 [右侧面板与文件渲染规范](front-右侧面板与文件渲染规范.md)）。
2. 横向可滚动工具栏在焦点进入被裁切控件时要把它完整显露，保留焦点轮廓；用容器内滚动，不用会带动页面祖先的 `scrollIntoView`；滚动量按显露方向取整，防止小数边界仍裁切。
3. 键盘必须能到达并操作：Tab 顺序合理，菜单 ↑↓ / Home / End / Enter，标签 ← → / Home / End，Esc 关最上层且焦点回触发器。
4. 键盘焦点的外观见 [视觉 token 规范](front-视觉token规范.md) 第 3 节；hover、focus 不改变布局尺寸。
5. 侧栏、右侧面板等窄窗口下的覆盖层，Esc 只在没有浮层已处理该次按键时才关闭覆盖层。

## 9. 对标与 demo

1. 做新界面或改版前，先找 1–2 个同类产品的截图，把「别人怎么做、我们取什么」写 3–5 行放进区域规范；不要只凭记忆或想象开始画。
2. 规范和 token 是最终依据；demo 只用来选方向。方向选定后，结论写进区域规范，demo 删除（只有待 Electron 复验的 demo 暂留），不让 demo 与规范长期并存。
3. 视觉争议先做 HTML demo 变体让用户直接看，不用文字方案描述；定下来的数值进规范，而不是留在 demo 里。
4. 区域规范里不重复写本文和视觉 token、文案规范里已有的全局规则，只写一句指向这里。

## 10. 验证

改基础组件或交互模式后至少验证：类型检查和相关 renderer 测试通过；键盘能触达并操作；icon-only 按钮有可读名称；菜单、popover、Tooltip 的打开、关闭、Esc、点外面符合预期；浅色、深色、480px 窄窗都看过。按 [前端验证约定](../../FRONTEND_VERIFICATION.md) 选择浏览器 mock 或 Electron 路径。
