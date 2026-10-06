# 基础组件封装规范

## 定位

这份文档定义 `actspace` 桌面端基础 UI 组件层的边界。

基础组件层的目标不是引入一套完整第三方设计系统，而是在项目内部沉淀一层稳定、可复用、可测试的 UI wrapper，让业务组件不再重复实现按钮、菜单、浮层、开关、输入框、focus 和 disabled 等基础交互细节。

推荐分层：

```txt
Radix primitives / 原生 HTML
  -> apps/desktop/src/renderer/components/ui/*
  -> actspace 业务组件
```

## 与 Radix 和 shadcn 的关系

`Radix UI` 是无样式交互 primitives，负责复杂交互的行为正确性，例如：

- 可访问性语义。
- 键盘操作。
- focus 管理。
- portal。
- 浮层定位。
- ESC 关闭。
- 外部点击关闭。
- `data-state`、`data-side` 等状态属性。

`shadcn/ui` 的主要价值是把 Radix primitives 复制到项目内，包一层默认样式、class 合并、组件导出和使用约定。

`actspace` 当前不直接采用完整 `shadcn/ui` 生成体系，但参考它的封装模式：

- 底层优先使用 Radix primitives 或原生 HTML。
- 项目内维护 `components/ui/*` wrapper。
- wrapper 只处理通用视觉和交互，不包含业务语义。
- 业务组件消费 wrapper，而不是直接重复写基础控件样式。

## 组件分层

### 基础 UI 组件

基础 UI 组件放在：

```txt
apps/desktop/src/renderer/components/ui/
```

这一层只表达通用控件，不知道 Agent、Session、Model、Context、Tool 或 Message。

适合进入基础层的组件：

- `Button`
- `IconButton`
- `Tooltip`、`HoverCard`
- `Menu`（DropdownMenu）、`ContextMenu`、`Select`
- `Popover`
- `Dialog`、`ConfirmDialog`
- `Switch`
- `Textarea`
- `Tabs`

前七项已落地（见下文「弹层原语」），`Switch`、`Textarea`、`Tabs` 仍归 [`frontend-ui-components-foundation.md`](../../exec-plans/active/frontend-ui-components-foundation.md)。

这些组件可以接收 `variant`、`size`、`className`、`children`、`disabled` 等通用属性，但不应接收 `modelId`、`sessionId`、`messageId`、`toolName` 这类业务字段。

### 业务组合组件

业务组合组件继续放在具体 feature 或现有组件目录中。

示例：

- `ModelSelector`
- `ModeSelector`
- `ContextUsageButton`
- `MessageActionsMenu`
- `SessionRow`
- `ToolPreviewBlock`

这一层可以使用基础 UI 组件，并负责业务状态、数据字段、事件含义和文案。

## 组件选择原则

### 优先用 Radix 的场景

只要组件涉及复杂交互，就优先基于 Radix 封装：

- 浮层定位和碰撞避让。
- ESC 关闭和外点关闭。
- focus trap 或 focus restore。
- 菜单键盘导航。
- tooltip 延迟和 hover/focus 行为。
- tablist 语义和键盘切换。
- dialog、popover、dropdown 等 portal 组件。

首批适合引入 Radix wrapper 的组件：

- `Tooltip`
- `DropdownMenu`
- `Popover`
- `Switch`
- `Tabs`
- `Dialog`

### 可以先用原生封装的场景

交互简单、原生语义足够稳定的组件，可以先用原生 HTML 封装：

- `Button`
- `IconButton`
- `Textarea`

这类组件重点统一视觉 token、尺寸、状态和 aria 约定。

### 暂缓抽象的场景

以下组件先不放入基础 UI 层：

- `SplitView`：它是工作台布局底座，包含左右面板尺寸约束、键盘 resize、拖拽、折叠和恢复逻辑，应单独演进。
- 消息块组件：例如 `BashRunBlock`、`ToolLogLine`、`EditDiffBlock`，它们是 Agent 消息语法的一部分，不是通用 UI primitive。
- 业务列表项：例如 session row，如果只在一个业务场景出现，先保留在业务组件中。

## 样式规则

基础 UI 组件必须优先消费 [`全局视觉语言规范`](front-全局视觉语言规范.md) 中定义的语义 token。

默认规则：

- 不在组件内随手新增十六进制颜色。
- 不把任何彩色 accent 作为默认文本色。
- hover、focus、active、disabled 状态不改变布局尺寸。
- icon-only button 必须有 `aria-label` 或被 tooltip 清晰解释。
- focus-visible 必须可见。
- disabled 状态必须同时体现视觉和交互不可用。
- 动效使用全局 motion token，并尊重 `prefers-reduced-motion`。

如果一个基础组件需要新增颜色、字号、阴影或半径，先判断是否应该扩展全局视觉规范，而不是只在局部新增样式。

## 命名规则

基础组件文件名使用 PascalCase：

```txt
components/ui/Button.tsx
components/ui/IconButton.tsx
components/ui/Tooltip.tsx
components/ui/Menu.tsx
```

导出名称与文件名保持一致。组合式 Radix wrapper 可以导出多个命名组件，例如：

```tsx
export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem
};
```

Radix 的 DropdownMenu 在项目里叫 `Menu`（`ui/Menu.tsx`），与 `ContextMenu` 对称。

如果某个组件需要 variant，优先使用清晰的字符串枚举，例如：

```tsx
variant?: "primary" | "secondary" | "ghost" | "soft";
size?: "sm" | "md" | "lg" | "icon";
```

不要为了早期便利暴露过多 one-off prop，例如 `isComposerModeButton`、`isModelEditButton`。

## 已落地：Button 与 IconButton

2026-09-26 起 `components/ui/Button.tsx`、`components/ui/IconButton.tsx` 已落地，设置中心（含原 `SettingsButton`）、审批卡、Composer（回形针、「+」、发送、Review 胶囊）、Sidebar 行内图标、右侧面板工具条、子 Agent 弹窗、工作区对话框和扩展页已迁移。尺寸、变体和 focus 规则见 [全局视觉语言规范「按钮」](front-全局视觉语言规范.md#按钮)。

约定：

- 业务组件不再新建 `*_BUTTON_CLASS` 样式常量；需要新外观时先在基础组件里加 variant，再使用。
- `className` 只放布局和显隐类。不要传字号、圆角、颜色去覆盖 variant：同一属性出现两个 utility 时，生效的是 Tailwind 生成顺序，不是书写顺序。
- `IconButton` 的 `label` 是必填 prop（类型层面保证），默认同时作为 Tooltip 文案；所在组合控件已有可见文字时传 `tooltip={false}`。
- 需要保留测试或布局计算用的标记类（如 `send-button`）时，放进 `className`。
- 只要按钮样式、不要 `<button>` 元素时（例如自定义下拉触发器），用导出的 `buttonClass()` / `iconButtonClass()`。

以下形态看起来像按钮，但不属于 `Button` / `IconButton`，保留在原组件中，等对应基础组件落地时再迁移：

| 形态 | 例子 | 归属 |
|---|---|---|
| 菜单项、列表行 | Composer 命令菜单项、模型列表项 | `Menu`，随 09 迁移；消息操作菜单项已改为 `MenuItem`（2026-10-06） |
| 下拉触发器 | Composer 模式 / 模型选择器、可视化回复文件选择器 | Composer 随 09 迁移；文件选择器见技术债。`SettingsSelect` 已改用 `ui/Select`（2026-10-06） |
| 分段控件 | 右侧面板「预览 / 源码」切换 | `Tabs` / SegmentedControl |
| 整块可点的卡片 | 子 Agent 卡片、任务输入卡、右侧面板启动器方块 | 业务组件自身 |
| 与 36px 输入框同排的表单控件 | API Key 显隐切换、自定义连接模型行内操作 | 与 Input / Textarea 基础组件一起收口 |
| 已封装的浮动按钮 | `ScrollToBottomButton`、会话轨迹刻度 | 业务组件自身 |

## 弹层原语

2026-10-06 起（Desktop 前端重构 16），弹层、菜单、对话框只有一套实现，都在 `components/ui/`，基于 Radix。业务组件不再自己 `createPortal`、不再自己声明 `role="dialog"`、不再为了关弹层监听 Escape 或 document 上的 mousedown。

| 原语 | 文件 | 用于 |
|---|---|---|
| `Dialog`（`DialogContent` / `DialogHeader` / `DialogBody` / `DialogFooter`） | `Dialog.tsx` | 模态对话框。尺寸 `sm \| md \| lg \| xl \| full`，外观 `float`（设置、确认框）/ `raised`（Review、本地更新这类卡片），遮罩 `scrim` / `overlay` |
| `ConfirmDialog` | `ConfirmDialog.tsx` | 破坏性操作的确认：默认焦点在「取消」，点遮罩不关，进行中不能关，错误留在弹窗里 |
| `Popover` | `Popover.tsx` | 非模态浮层：内容里有输入框、按钮、说明文字，或者不是一列选项 |
| `Menu` | `Menu.tsx` | 按钮打开的动作菜单（Item、CheckboxItem、RadioItem、Sub、Label、Separator、Shortcut） |
| `ContextMenu` | `ContextMenu.tsx` | 右键菜单，与 Menu 同构 |
| `Select` | `Select.tsx` | 单选下拉，替代原生 `<select>` 和自绘下拉 |
| `Tooltip`、`HoverCard` | `Tooltip.tsx`、`HoverCard.tsx` | 悬停说明、悬停预览 |

Menu、ContextMenu、Select 共用 `menu-styles.ts` 的外观：面板 `rounded-act-md` + `p-1` + `border-line` + `bg-surface-raised` + `shadow-act-popover`，菜单项 32px 高、`px-2`、`rounded-act-sm`。层级统一是 `--act-z-popover`，因为它们都 portal 到 body，可能出现在对话框之上。

### 统一行为

| 行为 | 规则 |
|---|---|
| Esc | 只关最上层，由 Radix 的 DismissableLayer 栈处理。原语的内容在 Esc 上 `stopPropagation`，外层组件自己的 Esc 处理（返回上一步、关右侧面板）不会再响应同一次按键 |
| 点外面 | Popover、Menu、ContextMenu 关闭，那一下点击照常落到下面的元素上（Menu / ContextMenu 默认非模态）；Dialog 由 `closeOnOutsideClick` 决定 |
| 打开时焦点 | 菜单：键盘打开时落在第一项；对话框：`initialFocus`，没有时是第一个可聚焦元素（`autoFocus` 优先）；Popover：浮层内第一个可聚焦元素 |
| 关闭后焦点 | 回到触发器。没有 Trigger 的 Dialog / Popover（条件渲染、用 `PopoverAnchor` 定位）由 `OpenerCapture` 记下打开前的焦点并还回去；Popover 因点外面而关闭时不还，焦点留给用户新点的地方 |
| 键盘 | 菜单 ↑↓、Home / End、Enter / 空格、→ 进子菜单、← 返回、字母跳转；ContextMenu 另支持 Shift+F10 / 菜单键 |
| 定位 | `side` + `align` + `collisionPadding={8}`，空间不够时翻到另一侧；portal 到 body，不依赖祖先 `overflow-visible` |
| 拖动区域 | 遮罩和浮层都是 `-webkit-app-region: no-drag`，盖在窗口标题栏上时点击不会变成拖动窗口 |

业务组件里仍可以监听 Escape 的只有输入框或表单内的行为：取消重命名、取消录制快捷键、设置表单回到上一步、清除时间轴的拖选。另有两处不是弹层的：窄窗口下关侧栏和右侧面板的覆盖层（`workbench/use-panel-layout.ts`，已被浮层处理过的 Esc 不连带关）、子 Agent 记录面板（`messages/SubAgentTranscriptModal.tsx`，`role="region"`，疑似死代码，见技术债）。

### 怎么选

- **Menu**：内容是一列可执行的动作或选项，不含输入框。单选用 `MenuRadioItem`；需要保留右侧打勾外观时，用 `MenuItem` 加 `role="menuitemradio"` 和 `aria-checked`（PermissionModeControl 就是这样）。
- **Select**：从一组值里选一个，触发器显示当前值。
- **Popover**：浮层里有输入框（会和菜单的字母跳转冲突）、按钮、成段说明，或者结构不是一列选项。触发器已经是 `IconButton`（自带 Tooltip，不能再套 `PopoverTrigger`）时，用 `PopoverAnchor` 定位，开关由按钮的 `onClick` 控制，并在 `onInteractOutside` 里排除按钮本身。
- **Dialog**：需要用户处理完才能回到背景的流程（表单、确认、全屏预览）：背景不可交互、Tab 不出对话框。只是「点开看一眼」的内容用 Popover。
- 同一个元素同时有 Tooltip 和浮层时，浮层打开期间收起 Tooltip（`open={tooltipOpen && !popoverOpen}`），否则 Esc 先关掉的是 Tooltip。

### 例外

例外按「文件 + 规则」登记在检查脚本的 `UI_ONLY_ALLOWLIST`，现在只有一条：`composer/ResponseAnnotationPill.tsx` 保留 Radix HoverCard（悬停预览），卡片里有可操作的按钮，所以标成 `role="dialog"`（`docs/exec-runs/20261005-desktop-fe-00-overall/pauses.md` P2）。

还没迁移的手写弹层（RightPanel 标签溢出菜单、ReplyHtmlRenderView 的文件列表、设置页 ModelMultiSelector、Composer 内的菜单）见 [技术债](../../exec-plans/tech-debt-tracker.md) 和 09。

## 按钮收口与检查

原生 `<button>` 分三类：

1. 视觉上就是按钮 → `Button` / `IconButton`。
2. 菜单项、下拉选项 → 原语内部（`MenuItem`、`Select` 的选项），业务组件不写 `<button>`。
3. 纯点击区域（列表行、导航入口、单选卡片、开关、遮罩）→ 保留原生，但必须有 `type="button"` 和可见的 focus 样式（base.css 的全局 `button:focus-visible` 轮廓，或自己的 `focus-visible:*`；写了 `focus-visible:outline-none` 就要给替代样式）。

以下情况也保留原生，不要为了凑数改成 `IconButton`：尺寸或默认透明度不在 IconButton 档位里、要靠 className 覆盖颜色才能维持外观的（如侧栏会话行的置顶 / 归档、回复下方的操作图标），以及嵌在带边框分组里的按钮（如 Stepper 的加减）。

`pnpm check:frontend-tokens` 守三件事：

- **原生按钮基线**：逐个 `.tsx` 数原生 `<button`（去掉注释；`components/ui/` 和 `test/` 不计），和 `scripts/native-button-baseline.json` 比。超过基线（包括基线里没有的新文件）就失败；低于基线时打印「可以收紧基线」的提示。
- `createPortal` 只能出现在 `components/ui/`。
- `role="dialog"`（也认 `role={'dialog'}`、`role: "dialog"`）只能出现在 `components/ui/`；`alertdialog` 不算。

更新基线：

```bash
node scripts/check-frontend-design-tokens.mjs --update-native-button-baseline
```

它按当前代码重写整份基线。写回后在 diff 里逐行核对：数量下降的直接接受；新增或上升的，要在提交说明或执行记录里写清楚为什么不能用 `Button` / `IconButton`。`pnpm test:frontend-tokens` 要求当前代码和基线完全一致（没有可收紧的提示），所以按钮数下降后要顺手更新基线。

## 大组件拆分的目录约定

- 拆出的模块放在 `components/` 下按区域分的子目录，不新建 `features/`：`settings/sections/`（每个设置分区一个文件）、`settings/dialogs/`、`sidebar/`、`conversation/`、`workbench/`、`composer/`。
- 原文件保留为区域入口（`SettingsPage.tsx`、`Sidebar.tsx`、`ConversationView.tsx`、`WorkbenchLayout.tsx`），只做布局和装配，目标 400 行以内。
- 纯函数单独成 `.ts` 文件并有单测（`session-grouping.ts`、`session-status.ts`、`turns.ts`、`edited-files.ts`）；有状态的逻辑抽成 `use-*.ts` hook（`use-settings.ts`、`use-panel-layout.ts`、`use-session-history.ts`、`use-workspace-file-links.ts`）。
- 区域内多个文件共用的样式常量放进该区域的 `styles.ts`；只在一个文件里用的留在原文件。
- 拆出的模块不反向 import 区域入口；需要给外部用的类型由入口再导出。
- 会话动作、当前会话、输入框、运行目标从 Context 读（`session/`、`target/`），不经入口逐层透传。

## 迁移顺序

基础组件层应按低风险、小切片推进。

推荐顺序：

1. `Button` 和 `IconButton`：统一按钮尺寸、圆角、focus、disabled、icon-only 约定。（2026-09-26 已完成）
2. `Tooltip`：为 icon-only 操作提供统一解释能力。
3. `DropdownMenu`：替换 Composer mode/model 菜单和消息操作菜单的手写浮层逻辑。（2026-10-06 由 Desktop 前端重构 16 完成，实现为 `ui/Menu`，同时落地 Popover、ContextMenu、Dialog、Select；Composer 内的菜单随 09 迁移）
4. `Switch`：替换 model options 中的 Thinking toggle。
5. `Textarea`：统一 composer 输入框的基础状态和可访问性。
6. `Tabs`：替换右侧面板顶部 tab 的基础语义和状态。

`SplitView`、复杂消息块和设置页布局不参与第一批基础组件迁移。

## 验证要求

每次迁移基础 UI 组件后，至少验证：

- TypeScript 类型检查通过。
- 相关 renderer 测试通过。
- 键盘可以触达和操作新组件。
- icon-only button 有可理解名称。
- 菜单、popover、tooltip 的打开、关闭、ESC 和外部点击行为符合预期。
- 前端视觉变化符合对应设计文档和定稿图。

涉及桌面端 UI 的实质改动，还需要按 [`FRONTEND_VERIFICATION.md`](../../FRONTEND_VERIFICATION.md) 选择合适的浏览器或 Electron 验收路径。
