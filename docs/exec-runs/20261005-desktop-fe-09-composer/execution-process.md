# 09 输入框优化（含发送队列）— 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-09`，从 `refactor/desktop-frontend@4ba97aaf`（16 的 squash）拉出
- **开始时间**：2026-10-06 19:30
- **结束时间**：—

路径缩写：`R/` = `apps/desktop/src/renderer/`。

## 执行时间线

### T0：重新定位与基线

**补登 16**：16 的 squash `4ba97aaf` 填进 16 的交接和 00 §11；子分支范围 `82d75436`..`e87bb8aa`（23 个提交）。用户对 16 的两项待确认已拍板：`pauses.md` P2 选 A（ResponseAnnotationPill 保留 HoverCard），T17 三处按钮外观先保持现状。已写进 `pauses.md`、16 的决策记录、组件表（ResponseAnnotationPill 一行）、16 的交接和摘要。

**基线**：desktop 测试文件 182 / 0 / 1，用例 1402 / 0 / 2；`Composer.tsx` 2491 行，原生 `<button>` 基线 31 个（全仓 230）。

**行号重新定位**（`4ba97aaf` 上，计划中的行号全部失效，以下以函数名为准）：

| 计划中的位置 | 现在 | 说明 |
| --- | --- | --- |
| panel class `:151-153` | `COMPOSER_PANEL_CLASS` / `COMPOSER_PANEL_INITIAL_CLASS` :151-154 | 两份几乎相同，T2 合并 |
| body grid `:173-187` | `COMPOSER_BODY_*` :173-187 | 6 个常量（通用 / Agent / Chat × inline / stacked）。Agent 的 grid 没有 `mode` 区（Agent 不显示 chip） |
| 输入 class `:188-193` | `COMPOSER_INPUT_CLASS` / `COMPOSER_INITIAL_INPUT_CLASS` :188-193 | 最高 142 / 172px，计划要求 200px |
| 模式 / 模型按钮 class `:196-203` | `MODE_BUTTON_*` / `MODEL_BUTTON_CLASS` :196-205 | |
| `+` 菜单 class `:211` | `COMMAND_MENU_CLASS` :211 | |
| `resolvedLayout` `:723` | :736 | |
| placeholder `:729-739` | :744-752 | |
| 单行测量 `:865-922` | `useLayoutEffect` 中的 `measureInput` :896-950 | |
| `selectMode` `:1099` | :1104 | |
| `renderCommandModeRow` `:1316` | :1323 | |
| `renderComposerInput` `:1344` | :1351（Shift+Tab :1377、斜杠 ↑↓ :1388、历史 ↑↓ :1394、Enter :1403） | |
| `renderSkillsMenu` `:1505` | :1512 | |
| `renderAddMenuButton` `:1673` | :1680 | |
| `renderCommandMenu` `:1701` | :1708 | |
| `renderModeSelector` `:1743` | :1750 | 现在整颗 chip 是一个按钮（`aria-label="移除 Plan 模式"`） |
| `renderModelSelector` `:1771-2020` | :1778-2025 | 远端 `<select aria-label="远端模型">` 在 :1779 |
| `renderSendButton` `:2021` | :2027 | |
| `renderPanel` `:2094`（队列 `:2114-2119`） | :2104（队列 :2124-2129） | |
| `renderComposerStatusRow` `:2227` | :2237 | |
| `renderContextSelector` `:2250` | :2260（「即将推出」:2382、:2401） | |
| `renderInitialContextRow` `:2422` | :2432（远端两个 `<select>` :2437、:2442） | |
| Composer 内的 document 监听 | `pointerdown` / `keydown` :1275-1321 | T15 删除 |
| `MessageQueueTray.tsx`（241 行） | 147 行（16 T9 改用 `ui/Menu` 后变短）；`TRAY_CLASS` :23，标题行 :78-89，`↳ 插入` :63 | |
| `tokens.css` | 浅色 `--act-color-border` :29、`--act-shadow-popover` :183；深色 :295 / :399；深色 media 块 :422 / :526 | 与计划一致 |
| `tailwind.css` | `--color-line` :34；`--shadow-act-*` :112-117 | 与计划一致 |

**接口核对**：

- `R/target/use-model-catalog.ts` 的 `useModelCatalog` 已有，但除测试外还没有调用方；远端模型选择目前走 `RunTargetContext.choices.modelId / selectModel`（同一份存储）。T13 改为 ModelPicker 读目录结构。
- 本机模型的 Thinking / 推理强度 Options 依赖 `ComposerModelOption` 的完整字段（`supportsThinkingToggle`、`reasoningEfforts` 等），`CatalogModel` 只有 `id / label / detail`。T12 / T13 让 ModelPicker 同时接收目录（分组、显示）和一个按 id 查 options 的函数，不改 15 的结构。
- readiness：`resolveReadiness` 已有 11 种取值（含 15 新增的 `host-unavailable`），`describeReadiness` 给 tone / label / reason。
- `capabilitiesOf(...).newWorktree` 本机按 gitStatus、远端为「远端机器暂不支持」。

**技术债中归 09 的**（`tech-debt-tracker.md`「Desktop 前端组件遗留」）：

1. `review-overflow-button` 没有 `onClick`。
2. Composer 跨会话状态：`sending` 不按 `draftKey`；模型运行时选项带到别的会话；发送中切走后失败，附件不写回原会话的附件草稿。
3. Composer 命令菜单、模型列表、模式 / 模型触发器的按钮形态（随 P3 迁移）。

这三项不在 09 的 T 表里，放在 P3 / P6 碰到相应代码时处理，在执行记录里单独写明。

### T1：composer token

- `tokens.css`：新增 `--act-color-composer-border`、`--act-color-composer-border-focus`、`--act-shadow-composer`、`--act-shadow-composer-focus` 和 `--act-color-on-warning-solid`，浅色、深色（`[data-theme="dark"]`）、深色 media 块各一份。数值取 demo（06 §5.1）。阴影注释原写「Composer 不使用阴影」，改为 Composer 例外（06 §9 #7 定稿保留柔和阴影）。
- `tailwind.css`：映射 `--color-composer`、`--color-composer-focus`、`--color-on-warning-solid`、`--shadow-act-composer`、`--shadow-act-composer-focus`。
- **决定**：`on-warning-solid` 浅色 `#ffffff`、深色 `#181916`。计划写「深色取与 `on-operational` 同一深底色系」；`on-operational` 深色是 `#102119`（偏绿），放在黄底上发绿，所以取深色系的中性深底 `#181916`（与 demo 的 `--on-tint`、深色 `on-action` 相同）。对比度：浅色 白 / `#91600e` ≈ 5.4:1，深色 `#181916` / `#d2a14d` ≈ 7.5:1，都过 4.5。
- **验证**：`check:frontend-tokens`、`test:frontend-tokens` 通过（token 还没有使用方，T2 起使用）。

### T2：panel 外观

- `COMPOSER_PANEL_CLASS` / `COMPOSER_PANEL_INITIAL_CLASS` 两份几乎相同，合并为 `getComposerPanelClass(surface, layout, dragActive)`：
  - 基类 `border shadow-act-composer focus-within:shadow-act-composer-focus`，过渡 box-shadow / border-color / 背景；
  - 形状：inline `rounded-act-pill`，stacked `rounded-act-xl`；
  - 颜色：平时 `border-composer bg-surface focus-within:border-composer-focus`，拖入文件时 `border-line-strong bg-selected`（沿用原样式）。两组只二选一，避免同属性 utility 互相覆盖。
- **决定**：
  - 计划写「`rounded-act-xl` + inline 时追加 `rounded-full`」。两个类同属 border-radius，追加不保证覆盖（取决于样式表顺序），所以改成按布局二选一；`rounded-full` 换成 token `rounded-act-pill`（999px，同值）。
  - 窄窗（≤ 600px）下 inline 布局本来就排成两行（body 的 `max-[600px]` 规则），胶囊形会把两行的四角切掉，所以 inline 在窄窗下也用 `rounded-act-xl`。T3 会把窄窗直接算成 stacked，这条规则到时可以去掉，留在那里也无害。
- **验证**：typecheck；`composer*` 4 个测试文件 84 条通过；`check:frontend-tokens` 通过。计划要求的「断言 `data-layout`」已有用例（「switches between inline and stacked layout…」「forces stacked layout when attachments exist」）。形状和阴影是纯样式，jsdom 测不出，留给阶段末 CDP 截图。

### T3：inline / stacked 布局

- **grid**：
  - inline：`plus mode input send`（Agent 没有模式 chip，是 `plus input send`）。模型按钮仍渲染在 DOM 里，靠 body 上的 `group/composer-body` 和 `data-layout=inline` 隐藏（`group-data-[layout=inline]/composer-body:hidden`），远端的 `远端模型` 下拉同样处理。
  - stacked：`input×5 / plus mode model . send`（Agent 去掉 mode 列）。
  - 去掉 `COMPOSER_BODY_CHAT_*` 两份 grid 和 `INLINE_USAGE_*` 样式：Chat followup 的上下文用量回到输入框下面的状态行，状态行只放这一个按钮（右对齐）。T19 再统一状态行。
  - body 内边距 `px-2 py-1.5` → `p-2`，stacked 顶部 `pt-2.5`、行距 `gap-y-1.5`；输入区最高 142 / 172 → 200px，新建页最少 76 → 54px（2 行：20 行高 × 2 + 上下 7px 内边距）。
- **判定**（`resolvedLayout`）：
  - 进入 stacked：新建页；窄窗（≤ 600px，新增 `hooks/useMediaQuery.ts`）；有附件 / Skill / 回复引用；文字里有换行；按单行宽度测量会折行。
  - 回到 inline：只看「清空」——输入框为空，且没有附件、Skill、引用。用 `stuckStacked` 记住已进入 stacked，在 render 里按条件同步（React 推荐的「根据 props 调整 state」写法，不走 effect，避免先画一帧 inline 再跳）。
  - 换会话（`draftKey` 变化）清掉 `stuckStacked`，由新草稿重新测量。
  - 测量单行宽度时，克隆出来的 body 也设 `data-layout="inline"`，让模型按钮按单行隐藏，宽度才和真实单行一致。
- **决定**：
  - 窄窗原来是 inline grid 里的 `max-[600px]` 两行规则（视觉上两行，但 `data-layout` 仍是 inline、外框是胶囊）。改为直接判定为 stacked，T2 留下的 `max-[600px]:rounded-act-xl` 一并去掉。
  - jsdom 没有 `matchMedia`，`useMediaQuery` 在没有它时当作不匹配。
- **用例**：
  - `composer.test.tsx`「switches between inline and stacked…」改写：单个字 inline → 输入折行 stacked → 删到一个字仍 stacked → 清空 inline；同一个 textarea 节点。原来「清空后再输入 short 回到 inline」与新规则一致，保留在中段。
  - 「keeps wrapped content stacked…」的正则改为新的 inline grid。
  - 新增：去掉最后一个附件后回到 inline；短行加换行 → stacked；inline 时模型按钮在 DOM 里但带隐藏类、stacked grid 有 model 列；窄窗始终 stacked。
  - `chat-presentation-recovery.test.tsx`「moves Chat context usage into the composer toolbar…」改为「状态行里只有上下文用量」。
- **变异**：去掉 stuck 条件、去掉换行条件、去掉窄窗条件，各有用例失败。
- **验证**：typecheck；`composer*` + `chat-presentation*` 5 个文件 97 条通过；`check:frontend-tokens` 通过。

### T4：`+` 按钮

- `renderAddMenuButton`：IconButton `variant="soft" size="lg"`（36px，浅底加描边）改为 `variant="ghost" size="sm"`（28px，无底）；图标 18 → 17px。ghost 自带 `aria-expanded:bg-selected`，面板打开时有底色，不用另加。
- `IconButton.tsx` 注释里「soft / lg 用于 Composer「+」」去掉；两个取值保留（`ui-button.test.tsx` 还在用，以后的常驻入口也可能用）。
- **注意**：ghost 的图标默认是 `text-faint`，demo 的 `.ib` 是 `muted`，略深一档。按计划用 ghost，不为 Composer 单开一种颜色；阶段末截图时再看是否太浅。
- **验证**：typecheck；`composer*`、`ui-button` 测试通过。纯样式，没有新增用例（计划 T4 不要求）。

### T5：模式 chip

- 原来整个 chip 是一个按钮（`aria-label="移除 Plan 模式"`，32px 高、14px 字）。改为：
  - 外层 `span.mode-chip`：24px 高、`text-act-sm`、胶囊；Plan `bg-warning-soft text-on-warning`，Chat `bg-operational-soft text-operational`。图标 + 名称只是标签。
  - 独立的 × 是 IconButton（xs，22px，圆形），`aria-label="退出 Plan 模式"` / `"退出 Chat 模式"`，提示「回到 Agent」；运行中禁用（沿用原来的 `disabled={isStreaming}`）。
  - chip 内按 Backspace（焦点在 × 上）也回到 Agent；运行中不响应。
  - 退出后 chip 卸载，焦点交还输入框（原来点了以后焦点落到 body）。
  - `modeButtonRef` 改挂在 × 上，document pointerdown 的「点在面板内」判断不变。
- **决定**：IconButton 新增 `inherit` 变体——沿用所在 chip 的文字色，平时 75% 不透明，hover 变实并加浅底（demo `.mode-chip button`）。现有 ghost 用 `text-faint`，放在黄 / 绿底上颜色不对；IconButton 约定 className 不覆盖颜色，所以加变体而不是在调用处覆盖。
- 原生按钮：Composer 31 → 30，基线已收紧（总数 230 → 229）。
- **用例**：原「switches modes…」改为点 × 退出，并断言 chip 里只有 × 一个按钮、退出后焦点在输入框；新增 Chat chip 的 Backspace 退出、运行中 × 禁用且 Backspace 不响应。
- **变异**：去掉 Backspace 处理、Backspace 不判断运行中、退出后不聚焦输入框，各有用例失败。
- **验证**：typecheck；`composer*`、`chat-presentation*`、`ui-button` 6 个文件 105 条通过；`check:frontend-tokens`、`test:frontend-tokens` 通过。

### T6：发送按钮按模式着色

- `IconButton.tsx` 新增两个变体：`operational`（`bg-operational text-on-operational`，hover `bg-operational-hover`）、`warning`（`bg-warning text-on-warning-solid`，hover `brightness-95`——没有 `warning-hover` token，不为这一处新增）。
- `renderSendButton`：`SEND_BUTTON_VARIANT[mode]`，Agent `accent`、Plan `warning`、Chat `operational`；停止仍是 `primary`，不跟模式变色（停止和发送是两种动作，沿用现状）。尺寸 32 → 28px（`size="sm"`），图标 16 → 15px、停止方块 12 → 10px。按钮加 `data-mode`。
- **决定**：
  - 计划写「禁用时 30% 透明度」。IconButton 基类统一是 `aria-disabled:opacity-50`，`cn` 只拼接不去重，调用处再加 `opacity-30` 两个类谁生效取决于样式表顺序，不可靠；全局改成 30% 又会影响所有图标按钮。保留 50%，记一笔，阶段末截图时看是否需要单独处理。
- **用例**：原 accent 用例加 `size-7`、`data-mode="agent"`；新增 Plan / Chat 的颜色和 `data-mode`；Plan 模式下停止按钮仍是 `bg-action`。
- **验证**：typecheck；`composer*`、`ui-button` 5 个文件 99 条通过；`check:frontend-tokens` 通过。

### T7：placeholder

- 按计划决策 3 的定稿文案：Agent 新建页「描述你要做的事，@ 引用文件，/ 调用命令」、对话中「继续追问…」；Plan「描述要规划的改动…」；Chat「问点什么…」（Plan / Chat 不再分新建页和对话中）；运行中且开了队列「继续追问，运行中发送会进入队列…」。
- 现行规范 `front-中间消息区规范.md` 里的运行中占位文案同步更新。`docs/design-docs/frontend/*-demo.html` 是历史 demo，不改。
- **用例**：`composer.test.tsx` 新增 8 组「模式 × 页面 × 是否排队」的 placeholder；按旧文案查询的 3 处（`composer.test.tsx` 2 处、`composer-focus-request.test.tsx` 1 处）改为新文案。`app-message-queue.test.tsx` 没有按 placeholder 查询，不用改。
- **验证**：typecheck；`composer*`、`app-message-queue`、`chat-presentation*` 6 个文件 129 条通过；`check:current-docs` 通过。

### T8：输入法组字判断

- 新增文件内函数 `isImeComposing(event)`：`nativeEvent.isComposing || keyCode === 229`。
- **决定**：计划写「Shift+Tab、斜杠 ↑↓ 各加判断，Enter 和历史 ↑ 改用它」。改为在 textarea `onKeyDown` 开头统一 `if (isImeComposing(event)) return;`——组字时没有一个按键应该被 Composer 接走，一处判断不会漏掉以后新增的快捷键；顺带覆盖了斜杠菜单的 Esc（组字时 Esc 是输入法取消候选）。原来 Enter 和历史 ↑ 各自的判断删除。
- 同样的问题在 document 级的 Esc 监听里也有（组字时按 Esc 会把斜杠菜单、`+` 菜单一起关掉），一并加上组字判断。这个监听本身属于技术债「Composer 内手写浮层」，P3 换 `ui/Menu` 时再整体处理。
- **用例**：新增 `composer-ime.test.tsx`，`isComposing` 和 `keyCode 229` 两种各跑一遍：Shift+Tab 不切 Plan、斜杠菜单 ↑↓ 不动、Esc 不关斜杠菜单、历史 ↑ 不翻、Enter 不发送；每条都在后面补一次不组字的同一按键，确认会生效。
- **变异**：去掉开头的 return（12 条失败，含 `composer.test.tsx` 原有的 2 条）；只判断 `isComposing`（`keyCode 229` 的 5 条失败）；去掉 document Esc 的判断（2 条失败）。
- **验证**：typecheck；`composer*` 5 个文件 111 条通过。

### P1 阶段末检查

- **全量测试**：文件 183 通过 / 1 跳过，用例 1429 / 2 跳过。第一次全量时已知偶发的「opens a card listing selected text…」超时 1 次，单独重跑 3 次、跑整个 `composer.test.tsx` 都通过。
- **mock 截图**（vite 5199 + 无头 Chrome 9333，`deviceScaleFactor: 2`，`screenshots/p1-*.png`）。CDP 读到的计算值：
  - 外框：单行 `border-radius: 999px`，多行 `18px`；边框浅色 `rgba(0,0,0,.07)`，聚焦 `.11`；聚焦阴影 `0 1px 2px rgba(0,0,0,.05), 0 8px 28px -6px rgba(0,0,0,.1)`；深色边框 `rgba(255,255,255,.12)`，阴影 `.35 / .55`。
  - 发送 28px：Agent `rgb(32,32,30)` / 白；Plan `#91600e` / 白，深色 `#d2a14d` / `#181916`；Chat `#087a4b` / 白，深色 `#36c783` / `#102119`。
  - 单行时模型按钮不可见，多行时可见；新建页输入框 54px（两行）。
  - 流程：短文本单行 → 长文本多行 → 删到一个字仍多行 → 清空回单行 → 换行进多行，全程是同一个 textarea 节点。
  - 焦点在 × 上按 Backspace：chip 消失，焦点回到输入框。
  - 560px 窄窗是多行；回到 1280 宽、输入为空时回到单行。
- `?mock=streaming` 是运行中的会话，Shift+Tab 不能切模式（09 之前就会提示「会话正在执行…」），所以模式相关的截图改用 `?mock=long-session`；第一轮在 streaming 下拍的 4 张模式图没有切成功，已删除。

### T9：托盘移出 panel

- `MessageQueueTray` 从 `renderPanel` 里移到 Composer 根节点，紧挨在 panel 前面（Review strip、新建页上下文行、草稿错误都在它上面）。托盘不再受 panel 的圆角、单行 / 多行和拖放区域影响。
- **用例**：新增 `message-queue-tray-position.test.tsx`：托盘不在 `.composer-panel` 里、下一个兄弟节点就是 panel；空队列不渲染。
- 进度：09 计划「进度记录」P1 打勾；00 §11 09 行更新到 T9。
- **验证**：typecheck；`message-queue*`、`app-message-queue`、`composer*` 8 个文件 140 条通过。

### T10：托盘外观

- `TRAY_CLASS`：`rounded-act-lg border border-composer bg-surface`，不加阴影；外层 grid 间距是 8px，托盘加 `-mb-0.5`，和输入框之间实际 6px。去掉原来在 panel 里用的 `mx-3 mt-3`。
- 删除标题行。计数和发送时机（「2 条排队，当前运行结束后依次发送」「1 条排队 · 1 条已插入」）放进第一行左侧图标的提示里；这个图标可聚焦、`role="img"` 带同样的 `aria-label`，其余行的图标 `aria-hidden`。
- **决定**：原标题行除了计数还有「即将发送 / 当前运行结束后依次发送」的说明，计划只说计数进提示。说明一起放进提示，不丢信息。
- 每行左边一个 20px 的图标位：排队行是 `ListOrdered`（14px，faint），已插入行是 6px 的 operational 呼吸圆点（原来在「下一步读取」前面，挪到行首，和排队行对齐）。
- 排队行的动作（插入、删除、⋯）包一层 `opacity-60`，行 hover / focus-within 时 100%。
- 暂停时在列表下面单独一行「已暂停」（`role="status"`）+「继续发送」。
- 列表 `max-h-[144px]`（4 行 × 36px），超出在托盘内部滚动。
- **用例**：`message-queue-tray.test.tsx` 断言标题文案的 2 处改为断言首行图标的名称；新增：只有首行图标可聚焦、悬停显示计数提示；列表最大高度和动作淡显的类；暂停行在列表之后。`app-message-queue.test.tsx` 5 处计数断言改为查首行图标。
- **验证**：typecheck；`message-queue*`、`app-message-queue`、`composer*`、`conversation-view-tooltip` 9 个文件 155 条通过；`check:frontend-tokens` 通过。

### T11：「插入」改为「引导」

- 托盘：按钮 `↳ 插入` → `↳ 引导`，计数 `N 条已插入` → `N 条已引导`，组件和类型注释同步。
- `App.tsx` 两条不可用原因：「压缩中不能引导，完成后会自动发送」「等待审批时不能引导」。
- `session/task-queue.ts`、`session-run-state.ts`、`message-queue.ts` 里指「运行中送进当前回合」的注释同步改。
- 现行规范 `front-中间消息区规范.md`：章节名改为「消息队列与运行中引导」；「结构」按 T9 / T10 的新外观改写（托盘在输入框外、无标题行、计数在首行提示、暂停行在底部、4 行 144px、动作淡显）；「交互」里的「插入」都改为「引导」。没有别的文档链接这个章节锚点（learnings、history 里是功能名，保留历史写法）。T20 写「发送队列」一节时以这里为准。
- **偏差**：计划写「`test/fixtures/response-annotations-preview.tsx` 同步」。这个 fixture 里的「插入」是「相邻块之间插入一个虚拟换行」，和队列无关，不改。
- **用例**：`message-queue-tray.test.tsx`、`app-message-queue.test.tsx` 里的 `↳ 插入`、`条已插入`、`压缩中不能插入` 全部换成新文案。
- **验证**：typecheck；`message-queue*`、`app-message-queue`、`composer*` 8 个文件 142 条通过；`check:current-docs` 通过。

### P2 阶段末检查

- mock 的 `tasks.submit` 立即领取，不会排队。截图时用 CDP 把 `window.actspace` 换成一份浅拷贝（原对象是冻结的），只替换 `tasks.command` 的 `snapshot` 返回值，再在侧栏切一次会话触发 `refreshTaskQueue`。
- 读到的值：托盘不在 panel 内；与 panel 间距 6px；宽度差 0；`border-radius: 12px`；边框 `rgba(0,0,0,.07)`；`box-shadow: none`；列表 `max-height: 144px`，5 行时 `clientHeight 144 / scrollHeight 180`；悬停第 2 行时它的动作 `opacity: 1`、第 1 行 `0.6`；首行图标提示「5 条排队，当前运行结束后依次发送」。暂停加 1 条已引导：首行绿点 +「下一步读取 · 撤回」，底部「已暂停 · 继续发送」。
- 截图：`screenshots/p2-tray-five.png`、`p2-tray-count-tooltip.png`、`p2-tray-row-hover.png`、`p2-tray-paused-steering.png`、`p2-tray-dark.png`。
- 09 进度 P2 打勾；00 §11 更新到 T12。

### T12：抽出 ModelPicker

- 新增 `R/components/composer/ModelPicker.tsx`：模型按钮是 `PopoverTrigger`，菜单是 `PopoverContent`（`side="top" align="start"`，间距 8px，圆角 `lg` = 12px，和原来的 `rounded-xl` 相同）。搜索、按供应商分组、同名消歧、行上「编辑」、Options（Thinking / Effort / Auto / 「此模型始终启用 Thinking。」/「暂无其他选项。」）原样搬过去。
- 新增 `R/components/composer/model-options.ts`：`ComposerModelOption`、`ComposerModelRuntimeOptions` 和 `isModelEditable` 等运行时选项函数从 Composer 移过来，Composer 和 ModelPicker 共用。
- 状态划分：选中的模型、各模型的运行时选项、`modelOpen` 留在 Composer（发送要用；T15 换成枚举）。搜索词、悬停 / 聚焦行、正在编辑的模型、Options 位置和进场动画移进 ModelPicker，菜单内容只在打开时挂载，关闭即丢弃。Composer 里删掉 `modelOptionsOpen`、`editingModelId` 等 8 个 state、4 个 ref、2 个动画 effect，以及点外关闭里模型菜单那一段（交给 Radix）。
- 外框（边框、背景、阴影）来自 `ui/PopoverContent`；滚动放在里面一层（`max-h-[290px]`，加上 1px 边框和原来的 292 一致），这样 Options 还能伸到外框之外。`PopoverContent` 带 `data-composer-floating`，Composer 的 document pointerdown 不会把点在菜单里当成点外面。
- **偏差**：
  - 菜单底色从 `bg-surface-raised/96` 变成原语的 `bg-surface-raised`（不透明）。`cn` 不合并冲突类，没法在调用处覆盖；差 4% 透明度，不再单独处理。
  - 原来 inline 时菜单向左锚定、Options 放左边。T3 以后 inline 布局不显示模型按钮，这个分支用不到了，菜单统一从按钮左边对齐。Options 改为按右侧剩余空间决定放左还是右（原来按布局）。
  - Esc 关闭后焦点回到模型按钮（Radix 行为；原来由 Composer 的 document Esc 统一关闭，焦点不处理）。
  - 打开时焦点直接进搜索框（`onOpenAutoFocus`），不再等 rAF。
- 原生按钮：Composer 30 → 25，ModelPicker 5（按钮本身、选择行、编辑、Auto、Effort），总数 229 不变，基线已更新。
- **用例**：
  - `composer.test.tsx` 里查 `.model-menu`、`.model-options-menu` 的 3 处从 `container` 改为 `document`（菜单进了 portal），断言不变。
  - 新增「打开聚焦搜索、改搜索词收起 Options、Esc 关闭后焦点回按钮、再打开搜索词清空」和「点外面关闭、选中后关闭」两条。
- **变异**：去掉搜索框自动聚焦、菜单常驻挂载、改搜索词不收起 Options、选中后不关菜单，各有用例失败。打开模型菜单时 `setCommandOpen(false)` 去掉后用例仍通过：点击模型按钮时 Composer 的 pointerdown 已经收起 `+` 菜单，这一行只在键盘打开时有用，属等价变异。
- **CDP**（vite mock，`?mock=long-session`，输入两行进入 stacked）：菜单在 portal 里，左边与模型按钮对齐、在按钮上方 8px，宽 244、圆角 12px；打开 100ms 内不透明度到 1；焦点在「搜索模型」；点「编辑」后 Options 在菜单右侧 8px；Esc 后菜单消失、焦点回到模型按钮；暗色背景 `rgb(48, 49, 45)`。第一次测得不透明度为 0，是无头 Chrome 里多出一个 `chrome://settings/help` 页把测试页压到后台、rAF 被节流，关掉那一页后复测正常。
- **验证**：typecheck；renderer 测试 117 个文件 986 条通过；`composer.test.tsx` 91 条；`check:frontend-tokens`、`test:frontend-tokens`（15）、`check:renderer-bridge` 通过。

### T13：ModelPicker 改读 useModelCatalog，删除远端模型 select

- ModelPicker 的输入换成 15 的 `ModelCatalog`（`catalog`、`selectedModelId`、`onSelect`），本机和远端同一个入口。运行时选项改为可选的 `options`（`find` / `values` / `onChange`）：本机传，远端不传，远端行上没有「编辑」。
- Composer 调 `useModelCatalog(target, sessionId, { models, defaultModelId, selectedModelId, onSelect })`；本机选中仍走原来的 `selectLocalModel`（记 `userPickedModelRef`、回调 `onSelectedModelChange`），远端选中走 `useRemoteModel` 的记忆规则（会话页写 `remote-session-prefs`，新建页写该 Host 的新建记录）。远端推给 Host 的 `configure` 里的模型也改读 `modelCatalog.selectedModelId`（与 `choices.modelId` 来自同一个 `useRemoteModel`，值相同）。
- 删除 `<select aria-label="远端模型">`。远端时模型按钮显示 Host 上的模型名，`title` 是「Host 名 / 模型名」；Host 描述还没回来时按钮写「等待 Host 模型」，菜单里也是这句；Host 没连上时按钮禁用（与原来 select 的禁用条件相同）。
- 搜索：匹配模型名、模型 id、详情（本机是 API 模型名）、分组名。本机模型 id 以供应商 id 开头（`openrouter:…`），所以按供应商 id 搜索的行为不变，不需要再单独匹配 provider。
- 同名消歧：原来是「同一供应商内同名就显示 API 模型名」，现在是「同一分组内同名就显示详情」。同一供应商下不同连接的同名模型已经分在不同分组（分组名是连接名），不再额外显示 API 模型名。工具栏按钮上的消歧（`formatSelectedModelLabel`）不变。
- `run-target-context.tsx` 注释同步：没有 `choices` 时不显示的只剩运行位置和工作区 select（T16 / T17 处理）。
- **用例**：
  - `host-feedback.test.tsx`：按「远端模型」select 取值的 3 处改为：模型按钮文字随 Host 切换；打开菜单只有以 Host 命名的分组和它的模型、没有「编辑」；选中后菜单关闭，新建页记录写进 `actspace:new-session-model:<hostId>`。
  - `composer.test.tsx`：新增远端用例（没有 select；Host 未连接时按钮禁用；已连接但描述没回来时按钮可点、菜单写「等待 Host 模型」）；自定义连接分组用例加按分组名（team）和供应商 id（openrouter）搜索。
- **变异**：去掉分组名搜索、「等待 Host 模型」空状态、按钮禁用、远端按钮文字、远端选中写入、同名判断（`> 1` 改 `> 0`），各有用例失败。`options` 不按远端去掉时用例仍通过：远端模型 id 不在本机列表里，`find` 本来就返回空，属等价变异，保留这层判断让意图清楚。
- **CDP**（`?mock=remote-host`；mock 没有 `host.describe`，用 `Page.addScriptToEvaluateOnNewDocument` 在 `window.actspace` 赋值时补一个返回 3 个模型的 `hosts.call`）：devbox 会话里没有远端 select；模型按钮「Sonnet 5.5」、`title`「开发机 devbox / Sonnet 5.5」；菜单只有「开发机 devbox」一组 3 个模型、没有「编辑」、焦点在搜索框；选 Opus 5.5 后菜单关闭、按钮变「Opus 5.5」，`remote-session-prefs` 里这个会话的 `modelId` 是 `claude-opus`。无头 Chrome 又自己开了一个 `chrome://settings/help` 页，已关掉；之后截图前先确认只有测试页。
- **验证**：typecheck；renderer 测试 117 个文件 989 条通过；`check:frontend-tokens`、`check:renderer-bridge` 通过。

### T14：`+` 统一面板 ComposerPalette

- 新增 `components/composer/ComposerPalette.tsx`，替换 Composer 里的 `renderCommandMenu` / `renderCommandModeRow` / `renderSkillsMenu` / `handleOpenSkills` 和 `skillsOpen` 状态，以及只给旧菜单用的类名常量、`COMMAND_MENU_MODES`。上下文菜单还在用的 `COMMAND_MENU_SEPARATOR_CLASS` / `COMMAND_MENU_BUTTON_CLASS` / `COMMAND_MENU_ICON_CLASS` 保留，T15 一起整理。
- 结构：`ui/Popover` + `PopoverAnchor`（锚在 `.composer-panel` 上，宽度跟 panel 一样），`side="top"`、`sideOffset={8}`，翻转交给 Radix。一张卡片里四页：主页、Skills、模型、模型选项。
  - 主页没有搜索词时两组：模式（`paletteModes`：未开始的会话列 Plan / Chat 中不是当前模式的；已开始的 Agent 会话只列 Plan；已开始的 Plan / Chat 不列），添加（图片 / 图片与文件、Skills ›、模型 › 后面写当前模型名）。运行中模式行禁用。
  - 主页有搜索词时按「模式 / 添加 / Skills / 模型」分组列结果，模型行第二列写分组名；都没有时写「没有匹配的结果。」。
  - Skills 页：加载中、失败（「重试」）、空、没有匹配；勾选不关面板。打开面板时就加载 Skills（原来是点进 Skills 才加载），主页搜索才能直接搜到。
  - 模型页：按分组列模型，当前模型打勾；可编辑的模型行尾有「编辑」（键盘高亮或悬停时显示），→ 或「编辑」进入选项页。选中模型后关面板。
  - 键盘：焦点一直在搜索框（combobox + `aria-activedescendant`）；↑↓ 循环并跳过禁用行；Enter / Tab 选中；光标在末尾时 → 下钻；搜索框为空时 ← / Backspace 返回上一级；Esc 在子页返回一级、在主页关闭；组字中这些键都不处理。返回后高亮停在刚才进入的那一行。
  - 焦点：打开时进搜索框；用键盘关闭（Esc、选中）回到消息输入框；点外面关闭不抢焦点。
- **偏离计划**：
  1. 计划写「内嵌 `ModelPicker variant="page"`」。实际是把模型列表的搜索、空状态文字、同名消歧抽成 `filterModelGroups` / `modelListEmptyText` / `showModelDetail`，选项内容抽成 `ModelOptionsBody`，ModelPicker 和面板各自用。原因：面板的模型页要跟主页共用一个搜索框和一套键盘高亮，ModelPicker 自带搜索框和按钮行，做成 variant 需要把它的键盘和焦点逻辑整个分叉，共用纯函数更小。
  2. 模型选项在面板里是一页（返回按钮 + 「{模型} 选项」），不是 ModelPicker 那种贴行的二级浮层。面板宽度跟 panel 一样，右侧没有地方放浮层。
  3. 外框边框是 Popover 的 `border-line`，不是 `border-composer`：`cn` 只拼接类名、不做 tailwind-merge，后加的同属性类不一定能覆盖。两者在浅色主题下色差很小。
  4. 没有用 `PopoverTrigger`。有 `PopoverAnchor` 时，Radix 会先把 Trigger 包在 `Popper.Anchor` 里，effect 里发现有自定义锚点后再拆掉，按钮会重新挂载；App 级用例里 pointerdown 时这个 effect 刚好执行，按钮被换掉，click 丢失。改为 `+` 按钮自己切换 `commandOpen`（`aria-expanded` / `aria-haspopup="dialog"` 手动写）。
  5. 点 `+` 关闭：仓库里打过补丁的 Radix 把外部 pointerdown 推迟到 click 之后，所以开着时点 `+` 只由按钮自己关上，不需要在 `onInteractOutside` 里排除触发器（变异验证见下）。
  6. 角色用 `listbox` / `option`（原来是 `menu` / `menuitem`），因为焦点留在搜索框、高亮靠 `aria-activedescendant`。相关旧用例改了角色名。
  7. 焦点移出面板也会关闭（Radix 默认）。Chat 初始页恢复草稿时会在下一帧把焦点放回输入框，用例里先等这次聚焦完成再点 `+`。
- **用例**：新增 `composer-palette.test.tsx` 17 条（`paletteModes` 6 种组合；打开时焦点和首行高亮；Plan 中不列 Plan、已开始的 Chat 无模式组；输入「son」出现模型行并 Enter 选中、关闭、焦点回输入框；搜索 Skills 和无结果；↑↓ 循环跳过禁用行；Tab 选模式、点击选附件；→ 进 Skills、勾选不关、←/Backspace 返回；Esc 两级；模型选项页与「编辑」按钮；点外关闭不抢焦点、`+` 切换；Composer 里 Esc 后焦点回到「消息输入框」）。`composer.test.tsx`、`chat-presentation-recovery.test.tsx`、`app-streaming-user-message.test.tsx` 按新角色和新行列表改写。
- **变异**：18 处（已开始的 Agent 不列 Plan、↑↓ 不跳禁用行、↑↓ 不循环、Esc 子页不返回、→ 不下钻、返回后高亮不回到原行、搜索框有字也返回、点外也还焦点、勾选 Skill 就关面板、选中模型不关面板、主页搜不到模型、Tab 不选中、选项页焦点不进「返回」、打开时不加载 Skills、Chat 也显示 Skills、关闭不还焦点、会话总当作未开始、点触发器算点外），17 处有用例失败。剩下一处是 `onInteractOutside` 里排除触发器：去掉后用例仍通过，原因见偏离 5，属等价变异，已删掉这段代码。
- **原生按钮基线**：面板里的按钮都用 `Button` / `IconButton`；Composer.tsx 从 25 降到 19，基线总数 223。
- **CDP**（vite + 无头 Chrome，mock 数据，截图在 `/tmp/fe09-t14-*.png`，P3 阶段末统一放进 screenshots）：
  - `?mock=long-session`：面板在 panel 上方 8px、与 panel 同宽、圆角 12px、行高 28px、列表最高 280px；焦点在搜索框；行为 Plan / 图片 / Skills / 模型（deepseek-flash）。搜「kimi」出现「模型」组里的 Kimi 行。Skills 页（mock 没有 Skills，显示「暂无已启用的 Skills」）、模型页（DeepSeek / Moonshot 两组，行尾「编辑」）、选项页（「deepseek-flash 选项」：Thinking、Effort Low / High / Max，焦点在「返回」）都在 panel 上方 8px。Esc 从选项页回到模型页、焦点回搜索框。深色主题背景 `rgb(48,49,45)`。点外面关闭后焦点在输入框。
  - `?mock=empty`：行为 Plan / Chat / 图片 / Skills / 模型，同样在上方 8px；Esc 关闭后焦点在「消息输入框」。
  - 900×330 窗口：panel 顶部在 216px，面板高 191px，仍放得下，留在上方（top 17px）。更矮的窗口里 panel 本身被挤出视口（布局有最小高度），点不到 `+`，没能在 mock 里触发向下翻转；翻转是 Radix 的默认碰撞处理，没有改动。
  - 中途无头 Chrome 两次在 `Page.navigate` 时卡死。单独复现：同一页面打开面板 → Esc 关闭 → 跳转，和不打开面板直接跳转，都正常返回，判断与面板无关，是无头 Chrome 本身的问题，重启后不再出现。
- **验证**：typecheck；renderer 测试 118 个文件 1006 条通过（1 条原有 skip）；`check:frontend-tokens`、`test:frontend-tokens`、`check:renderer-bridge` 通过。

### T15：菜单布尔换成 ComposerOverlay，删除 Composer 的 Esc / 点外监听

- `commandOpen`、`modelOpen`、`contextSelectorOpen`、`contextOpen` 换成一个 `overlay: ComposerOverlay`（`palette` / `model` / `context` / `run-target` + `field`）。计划列的 6 个里，`skillsOpen` 已在 T14 删除，`modelOptionsOpen` 在 T12 就变成了 ModelPicker 内部的 `editingModelId`，都不再进枚举。
- **与 05 §2.3 的出入**：
  1. 没有 `{ kind: "slash" }`。斜杠菜单是否打开由输入内容推出来（`slashQuery !== null && !slashDismissed`），放进枚举要在每次输入时同步两份状态；保持原样，只保留「打开任何浮层就收起斜杠菜单」「斜杠菜单出现就关掉浮层」两条联动。
  2. `palette` 不带 `page`。页、搜索词、高亮行在 ComposerPalette 内部，随面板关闭一起丢掉，Composer 不需要知道。
  3. `run-target` 的 `field` 沿用现有的 `workspace` / `branch` / `runtime`，T18 换 RunTargetRow 时再定。
- 两个入口：`toggleOverlay(x)`（按钮：同一个就关、否则换成它）和 `setOverlayOpen(x, open)`（给 Radix 的 `onOpenChange`）。`setOverlayOpen(x, false)` 只在当前是 x 时才关：从一个浮层点到另一个时，新浮层先打开、旧浮层的关闭回调后到，不能把新的也关掉。
- 全局 `pointerdown` / `keydown` 监听不再管 `+` 面板、模型菜单、上下文用量浮层（三者都在 `ui/Popover` 里，Radix 自己处理点外和 Esc），只留给 Composer 还在自己画的两种：斜杠菜单和新建页的工作区 / 分支 / 运行位置下拉（T18 换成 `ui/Menu` 后删掉）。`closeFloatingPanels()` 仍用于发送后和换会话时把所有浮层收起。
- **验收时发现并修复的问题**（T14 就存在，jsdom 里的事件顺序复现不了，在浏览器里查到）：
  1. `+` 面板开着时点工具行的模型按钮：模型菜单打开后立刻又关掉，焦点回到输入框。原因：面板关闭时把焦点还给输入框，模型菜单因为焦点移出而关闭。改为面板只在自己关闭（选完、主页 Esc）时还焦点；被别的浮层顶掉、点外面关闭时交给 `ui/Popover`。
  2. 反过来，模型菜单开着时点 `+`：面板打开后又关掉。原因：`ui/Popover` 在 Radix 的 `setTimeout(0)` 里把焦点还给模型按钮，这时焦点已经在面板的搜索框里。改为：还焦点时如果焦点已经在这个浮层之外的别处，就不再还给触发器（`event.preventDefault()`）；焦点还在浮层里或已经丢到 body 上时行为不变。
  用例：`ui-menu-popover-select.test.tsx` 新增「关闭后焦点被别处拿走时不抢回触发器」（用 `flushSync` 按浏览器的顺序：先卸载、再聚焦别处、最后 Radix 还焦点；旧代码失败）；`composer-palette.test.tsx` 断言从触发器关闭时不调 `onReturnFocus`、焦点留在触发器上。
- **顺带修复的不稳定用例**：`composer.test.tsx`「opens a card listing selected text and comments…」在全量并行时约 4 次失败 1 次（T14 的代码上也一样）。失败时胶囊 `aria-expanded="true"`：点「编辑」关闭卡片后，悬停留下的 HoverCard 打开计时器（`openDelay` 100ms）晚到，把卡片重新打开。`ResponseAnnotationPill` 的「编辑」和「定位原文」关闭时也记为主动关闭（`dismissedRef`，与 Esc 相同），计时器到了不再打开。修复后全量连跑 6 次都通过。
- **用例**：`composer.test.tsx` 新增 2 条：新建页三个下拉由自己的按钮开关、互相顶掉，打「/」时下拉收起，点外面和 Esc 关闭下拉和斜杠菜单；`+` 面板与模型菜单来回切换，关掉的那个不抢焦点。`composer-slash-commands.test.ts`、`composer-focus-request.test.tsx` 通过。
- **变异**（只跑 4 个 composer 相关文件）：关闭不判断是不是自己、toggle 不关、全局监听不关下拉、全局监听不收斜杠菜单、去掉 Esc 监听、打开浮层不收斜杠菜单、斜杠菜单出现不关浮层、三个下拉共用一个 key，8 处全部有用例失败；面板还焦点的 3 处（只在自己关闭时还、主页 Esc 记为自己关闭、选完记为自己关闭）也都有用例失败。
- **CDP**（`?mock=empty`，多行布局）：`+` 面板 → 点模型按钮：面板关、模型菜单开、焦点在「搜索模型」；→ 点 `+`：模型菜单关、面板开、焦点在「搜索」；再点 `+`：面板关，焦点留在 `+` 上。`?mock=long-session`：上下文用量开着时点 `+`，用量浮层关、面板开；Esc 关闭后焦点在「消息输入框」。新建页：运行位置下拉开着时点 `+`，下拉关、面板开。单行布局下模型按钮本来就隐藏（模型从 `+` 面板里选），不在这一步测。
- **验证**：typecheck；renderer 测试 118 个文件 1009 条通过（1 条原有 skip）；`check:frontend-tokens`、`check:renderer-bridge` 通过。Composer.tsx 2024 → 2022 行。

### P3 阶段末检查

- 对照 demo（`composer-run-target-demo.html?surface=followup&target=local&running=false&open=palette`，加 `&theme=dark`、480px 宽、`&query=son`）与 `?mock=long-session` 打开 `+` 面板。
- 读到的值（三种都一样，宽度除外）：面板在 panel 上方 8px，左边对齐，宽度等于 panel（1280 下 880px，480 下 444px）；圆角 12px；行高 28px、字号 13px；浅色边框 `rgb(222,222,217)`、背景白色；深色边框 `rgb(53,54,48)`、背景 `rgb(48,49,45)`。
- 与 demo 的差别：
  1. Skills 行多一句「为本轮加载技能说明」（计划规格里的文字，demo 没写）。
  2. 搜到模型时，高亮行尾多一个「编辑」（进入模型选项页，demo 没画选项）。
  3. 附件入口在 mock 的本机 Agent 会话里是「图片」，demo 是「图片与文件」：入口按运行目标的能力显示，本机 Agent 不收文件，行为没变。
  其余（搜索行、模式行与分隔线、图标、`›`、当前模型名、高亮底色、搜索结果按「模型」分组并写供应商名）与 demo 一致。
- 截图：`screenshots/p3-palette-light.png`、`p3-palette-dark.png`、`p3-palette-480.png`、`p3-palette-search-model.png`、`p3-palette-initial.png`、`p3-palette-skills.png`、`p3-palette-models.png`、`p3-palette-options.png`。
- 09 进度 P3 打勾；00 §11 更新到 T15。

### T16：发送按钮的禁用和 tooltip 读 readiness

- 发送一侧 15 T7 已经接好：`canSendMessage` 含 `readiness.state === "ready"`，不能发时 tooltip 和 aria-label 用 `describeReadiness(...).reason`（06 §4.5）。本步补用例，并把剩下一处没读 readiness 的地方改掉。
- **停止按钮**：原来按 `choices.hosts` 里这台 Host 的 `state !== "connected"` 禁用，tooltip 仍写「停止 Agent」。改为读 readiness：新增 `hostReachable(readiness)`（`connecting` / `offline` / `revoked` / `incompatible` / `removed` 为 false，其余表示 Host 连着），连不上时停止禁用，tooltip 和 aria-label 写 readiness 的原因。Host 连着但还不能发新消息（`describing`、`describe-failed`、工作区或模型缺失等）时照样可以停止。
- 远端模型按钮的禁用仍按 `choices.hosts` 的连接状态（T13 的行为，不在本步范围）。
- **用例**：`composer.test.tsx` 新增 2 条：offline 时发送 `aria-disabled`、tooltip「Cloud 离线。前往设置重新连接」；`describe-failed` 时按钮名和 tooltip 为「无法读取机器信息：socket hang up」（IPC 前缀和错误类名已去掉）；运行中 `describing` 可以停止，`offline` 时停止禁用、点了不调 `onAbort`、tooltip 写原因。`readiness.test.ts` 新增 `hostReachable` 的 11 种状态。
- **变异**：停止永不按连接禁用、停止 tooltip 不写原因、发送 tooltip 不写 readiness 原因，3 处都有用例失败。
- **验证**：typecheck；renderer 测试 118 个文件 1012 条通过（1 条原有 skip）；`check:frontend-tokens`、`check:renderer-bridge` 通过。

### T17：RunLocationMenu

- 新增 `components/composer/RunLocationMenu.tsx`，基于 `ui/Menu` + `MenuSub`，受控（`open` / `onOpenChange`），触发按钮由调用方经 `children` 传入（`MenuTrigger asChild`）。本步只有组件和用例，T18 接进新建页。
- 主菜单 240px：本机（`menuitemradio`，当前时 ✓）／ 远端机器 ›（右侧写当前 Host 名）／ 分隔 ／ 新建工作树（第二行说明：可用时「从 {branch} 创建隔离分支」，不可用时写 `capabilities.newWorktree.reason`）。没有 Host 时第二项是「连接远端机器…」，点击调 `onConnectHost`（T18 接到 设置 › Agent 服务器）。没有「云端 / 远程 SSH · 即将推出」。
- 远端机器子菜单 260px：Host 行是状态点、名称、右侧状态文字（只在非 connected 时显示）、当前 ✓；底部「连接新机器…」。≥ 5 台时顶部有「搜索机器」：打开后焦点进搜索框；字母和 ← 只给搜索框（不触发菜单首字母跳转、不退出子菜单）；↓ 进入列表；没有结果时写「没有匹配的机器」。不可用的 Host 也能选中。
- 状态点 `RunTargetDot`（connected 绿点、pending 黄点闪烁、offline 空心圈、error 红点；对应 demo 的 `.dot`）和 `hostStateTone` / `hostStateLabel` 一并导出，T18 的运行位置按钮和 T19 的状态行复用。状态文字直接取 `describeReadiness` 的 label，Host 连接状态与 readiness 的同名状态一致。
- `capabilitiesOf`：本机 `no_head` 时 `newWorktree` 的原因从「当前工作区不是可用的 Git 仓库」细化为「需要先创建提交」（沿用旧菜单的文案）。
- **与旧菜单的出入**：旧菜单在不是 Git 仓库时不显示「新建工作树」；现在按规格读 capability，显示为禁用并写原因（与 demo 的「需要 Git 仓库」一致）。
- **用例**：新增 `run-location-menu.test.tsx` 9 条：三项与无「即将推出」、选本机、选新建工作树、`no_head` 禁用、→ 打开子菜单与状态文字 / 状态点、选不可用的 Host、连接新机器、无 Host 时「连接远端机器…」、远端目标下工作树禁用并写「远端机器暂不支持」、5 台时的搜索（焦点、字母不跳转、← 不退出、↓ 进列表、无结果）、状态映射。`run-target.test.ts` 断言 `no_head` 的原因。
- **变异**：总显示子菜单、搜索阈值、搜索框不拦按键、工作树不禁用、不写状态文字、↓ 不进列表、搜索框不自动聚焦、本机 ✓ 不看 runLocation，8 处都有用例失败。
- **验证**：typecheck；renderer 测试 119 个文件 1021 条通过（1 条原有 skip）；`check:frontend-tokens`、`check:renderer-bridge` 通过。

### T18：新建页运行目标行 RunTargetRow

- 新增 `components/composer/RunTargetRow.tsx`：工作区 ⌄ ／ 分支 ⌄ ／ 运行位置 ⌄，三个无边框文字按钮（28px 高、14px、`text-muted`，展开时保持 hover 底色），菜单全部用 `ui/Menu`。删除 Composer 里旧的 `renderContextSelector`、远端两个原生 `<select>`、文件夹名的 state 和相关常量 / 图标；`ContextSelectorKind` 换成 `RunTargetField`，overlay 仍是 T15 的 `{ kind: "run-target", field }`。
- **工作区**：本机列「最近使用」（最多 5 个，名称 + 第二行路径，`menuitemradio`）、「使用已有文件夹…」、「新建文件夹」（选中后不关菜单，原地换成输入框；输入框的按键不交给菜单，Esc / Tab 除外）。远端列「{Host} 上的工作区」（名称 + 路径），描述没读到时写「等待 Host 工作区」，读到但为空时写「这台机器上还没有工作区」。
- **分支**：本机且有分支名时显示，远端不显示。
- **运行位置**：T17 的 `RunLocationMenu`。按钮写「本机 / 新建工作树 / Host 名」，图标对应 Laptop / GitFork / Server；远端没就绪时按钮尾部带状态点和 readiness 短文案（如「读取失败」「离线」）。选「本机」会同时离开远端 Host（`selectHost(null)`）再设 `this_mac`。
- **「连接远端机器…」/「连接新机器…」**：新增 `onConnectHost`，经 ConversationView → ConversationComposerSlot → Composer，在 WorkbenchLayout 打开 设置 › Agent 服务器（`settingsSection = "hosts"`）。
- **Chat 形态**：不用工作区和分支，只留运行位置；本机 Chat 整行不显示，远端 Chat 只显示运行位置。改前只要有 Host 列表（真实应用总是有），Chat 新建页也显示「会话运行位置」下拉和三个选择器，所以本机 Chat 现在不能直接切到远端——列为需要用户判断的事项（`acceptance-handoff.md` P4）。
- **窄窗**：480px 下远端机器子菜单左右都放不下 260px，Radix 的 shift 只做纵向挪动，子菜单右边出视口（CDP 实测 x 304..564）。子菜单宽度改为 `min(260px, --radix-dropdown-menu-content-available-width)`，480 下变成 304..472，长 Host 名截断（「旧…」）。
- **原生按钮**：触发器保留原生 `<button>`（`TextButton`，规格是 14px 常规字重、6px 内边距，Button 的档位不合），基线 `RunTargetRow.tsx: 1`；新建文件夹的「创建」改用 `Button ghost sm`。Composer.tsx 原生按钮 19 → 8，基线同步收紧。
- **与旧行为的出入**：
  1. 不是 Git 仓库时「新建工作树」显示为禁用并写原因（T17 已记）。
  2. 旧用例「keeps a removed remote Host…」测的是远端 `<select>` 里保留已删除的 Host；锁定的远端会话本来就不显示选择行，新建页的 Host 列表来自 `choices.hosts`，这条改成「锁定的远端会话不显示运行目标选择」。
- **用例**：新增 `run-target-row.test.tsx` 7 条（本机三个按钮与样式、选本机离开 Host、新建文件夹输入「wiki notes」不触发首字母跳转、远端工作区名称 + 路径、等待描述、没就绪的状态点和文案、Chat 只留运行位置）。改写 `composer.test.tsx`（`renderComposer` 包 `RunTargetContext.Provider`，rerender 保留 Provider）、`host-feedback.test.tsx`（经菜单选 Host 和工作区；新增「没有 Host 时 连接远端机器… 打开 Agent 服务器」的 App 级用例）、`app-streaming-user-message.test.tsx`。`run-location-menu.test.tsx` 断言子菜单宽度类。
- **变异**：远端显示分支、选本机不离开 Host、新建文件夹输入框不拦按键、新建文件夹不 preventDefault、不显示没就绪状态、忽略 locationOnly、本机 Chat 显示整行、远端工作区不写路径、打开运行目标菜单不收起 `/` 菜单，9 处都有用例失败。
- **CDP（headless Chrome + vite mock）**：
  - `?mock=remote-host` 新建页 1280 浅色：行内按钮 28px / 14px / `rgb(103,103,98)` / 圆角 6px；主菜单 240px（本机 ✓ ／ 远端机器 ／ 新建工作树 禁用「当前工作区不是可用的 Git 仓库」）；子菜单 260px：开发机 devbox、GPU 服务器「离线」、旧笔记本「需要重新配对」、连接新机器…。
  - 选 devbox：工作区写「等待 Host 工作区」，按钮「开发机 devbox · 读取失败」（mock bridge 没有 `hosts.call`），发送禁用；选 GPU 服务器：空心点「离线」，发送 tooltip「GPU 服务器 离线。前往设置重新连接」；回本机后发送可用。
  - 深色 1280、深色 / 浅色 480：子菜单在视口内。
  - `?mock=empty`：主菜单第二项「连接远端机器…」，点击后进入设置，标题「Agent 服务器」。
  - 截图：`screenshots/p4-t18-remote-host-light-hosts.png`、`p4-t18-light-1280-offline.png`、`p4-t18-dark-1280-hosts.png`、`p4-t18-dark-480-hosts.png`、`p4-t18-light-480-hosts.png`、`p4-t18-empty-1280-location.png`。
  - headless Chrome 在连续 Esc + 切换配色时卡住过 3 次（CDP 无响应），分步复现不出来；脚本加了每次调用 20s 超时，卡住时只重启自己起的 Chrome。与应用无关的可能性大，记录在此。
- **验证**：typecheck；renderer 测试 120 个文件 1029 条通过（1 条原有 skip）；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。Composer.tsx 1851 行。

### T19：对话中的只读状态行 ComposerStatusRow

- 新增 `components/composer/ComposerStatusRow.tsx`，Composer 的 `renderComposerStatusRow` 只剩传参（`renderContextUsageButton` 和 `STATUS_*` 常量随之搬走）。没有 `⌄`，事实之间用「·」分隔（demo 的 `.sep`）。
  - 本机：`⑂ 分支 · 💻 本机`；工作树：`⑂ 分支 · ⑂ 工作树`（有 worktree 信息时 title 写「原工作区：… · 基于 …」）。
  - 远端：`🖥 Host · 📁 工作区`。Host 名 hover 用 Tooltip 显示状态（已连接 / readiness 短文案）和工作区路径（取 Host 描述）；可聚焦（`tabIndex=0`），键盘也能看到。
  - 远端没就绪且有短文案时，第二段换成状态点 + 文案，context 用量写「—」（`aria-label="上下文用量暂不可用"`，不可点）。`workspace-missing` / `model-missing` 没有短文案，仍显示工作区和用量。
  - `PermissionModeControl` 和 context 用量入口位置不变。
  - Chat：只有 context 用量（Composer 早已不在输入框里放 context 按钮，T19 只是改由新组件渲染）。
- **原生按钮**：context 用量入口仍是原生 `<button>`（从 Composer 搬来），基线 Composer 8 → 7、ComposerStatusRow 1。
- **用例**：`composer.test.tsx` 新增 5 条：本机（文字顺序、`button[aria-haspopup]` 只有权限控件、可点的只有权限和用量）、工作树、远端（Host 与工作区名、tooltip「已连接 · /srv/api-server」）、连接中（状态点 pending、「—」、行内无按钮）、Chat 只剩用量。原「explains why it cannot send」的状态行断言改成新文案。
- **变异**：用量永不显示「—」、Chat 显示事实、第二段不换成 readiness、不写工作区名、tooltip 不带路径、工作树显示成本机、不渲染权限控件、Host 无 tooltip，8 处都有用例失败。
- **CDP**：
  - `?mock=remote-host`（devbox 会话，mock 读不到描述）：「开发机 devbox · ● 读取失败 [权限] —」，13px，浅色 `rgb(114,114,107)`、深色 `rgb(150,150,143)`；hover Host 名 tooltip「读取失败」；480 下行宽 444px。
  - `?mock=long-session`：「本机 [权限] ◔ 0%」（mock 没有分支名）。
  - 状态行里带 `aria-haspopup` 的按钮只有「会话权限模式」。
  - 截图：`screenshots/p4-t19-remote-host-light-1280.png`、`p4-t19-remote-host-dark-1280.png`、`p4-t19-remote-host-light-480.png`、`p4-t19-long-session-light-1280.png`、`p4-t19-long-session-dark-480.png`、`p4-t19-remote-host-tooltip.png`。
- **验证**：typecheck；renderer 测试 120 个文件 1034 条通过（1 条原有 skip）；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。Composer.tsx 1851 → 1810 行。

### P4 阶段末检查

- 对照 demo（`composer-run-target-demo.html?surface=initial&target=remote&open=location&sub=hosts`，加 `&theme=dark`、480px；`surface=followup&target=remote|remote-off|local&running=false`）与 `?mock=remote-host`、`?mock=empty`、`?mock=long-session`。
- 读到的值：主菜单 240px、子菜单 260px（demo 一致）；Host 行状态点 7px，非 connected 时右侧状态文字；状态行 13px，事实之间「·」，demo 文字「dev-box·api-server|请求批准|42%」「home-nas·离线|请求批准|—」，应用「开发机 devbox·读取失败|—」（mock 读不到描述）、「本机|0%」。
- 与 demo 的差别：子菜单底部 demo 说明文字没实现；480 下 demo 子菜单出视口（-107..153），应用收窄留在视口内；mock 没有分支名。
- 需要用户判断：新建 Chat 的运行目标行（本机不显示、远端只留运行位置）、非 Git 仓库时「新建工作树」显示为禁用。写进 `acceptance-handoff.md` P4。
- 截图：`screenshots/p4-demo-*.png`（demo）与 `p4-t18-*`、`p4-t19-*`（应用）。
- 09 进度 P4 打勾；00 §11 更新到 T19。

### T20：改写《聊天输入框规范》

- `docs/design-docs/frontend/front-聊天输入框规范.md` 按 P1–P4 的实现改写：
  - 头部加 09 注记（计划与 demo 链接）。「定位」「内容」「原则」里的 `+` command menu、This Mac / Worktree、`variant="accent"` 发送按钮改成现行说法。
  - 「Composer 形态」重写为：视觉职责（composer 边框 / 阴影 token，阴影例外）、单行与多行（规则表、进入 / 回到单行、`stuckStacked`、不 remount）、surface 结构表、控件表（`+`、模式 chip、模型按钮、发送 / 停止）、模型菜单（ModelPicker：本机与远端同一个、Options 按剩余空间放左右）、浮层互斥（`ComposerOverlay`）。
  - 「Initial composer 结构」「Follow-up bar 结构」按运行目标行 / 托盘 / 只读状态行改写；去掉「Plan New Idea」快捷 chip。
  - 「`+` command menu」改为「`+` 面板」（同宽 Popover、主页内容、模式组规则、搜索、下钻、键盘、焦点）；「Skills 二级菜单」改为「Skills 页」，去掉悬浮展开、窄窗 Back 两节。
  - 模式切换：chip 都带 `×`；placeholder 表换成定稿中文文案。
  - 新增「发送队列」：只写与 Composer 的关系，完整规则指向《中间消息区规范 · 消息队列与运行中引导》（T11 已按新外观改写），避免两处重复维护。
- **验证**：`check:current-docs` 通过。

## T21 front-workspace-git-worktree-context 改写（2026-10-06）

- 改写「Initial Composer 信息架构」（三个无边框文字按钮、远端 / Chat 形态、`ui/Menu` 键盘行为）、「Workspace 菜单 › 结构」（最近使用 5 项 + 路径第二行、新建文件夹原地输入、远端「{Host} 上的工作区」）。
- 「Run on 菜单」改为「运行位置菜单」：本机 / 远端机器 ›（260px 子菜单、状态点、≥5 台搜索、连接新机器…）/ 新建工作树（三种禁用原因）；无 Host 时「连接远端机器…」。删除 Cloud / Remote SSH 占位。
- 「Follow-up 状态行」改为只读事实：`⑂ main · 💻 本机`、`⑂ 分支 · ⑂ 工作树`、`🖥 Host · 📁 工作区`，未就绪时状态点 + 文案、用量「—」；Chat 只有用量。
- 同步：开头 2026-10-06 说明、范围段、响应式宽度、a11y、验收矩阵（+3 行：选远端 Host / 没有 Host / 对话中）、已确认决策（07-29 两条加后注，新增 10-06 一条）；`Requires commit / Requires Git` 换成界面中文文案。
- `check:current-docs` 通过。

## T22 message-queue-demo 标为废弃（2026-10-06）

- `message-queue-demo.html` 文件头加 HTML 注释，页面顶部加一行「已废弃」说明，指向 `front-聊天输入框规范.md`「发送队列」。
- `front-中间消息区规范.md`「消息队列与运行中引导」的设计稿链接改为 `composer-run-target-demo.html`，注明旧 demo 已废弃。历史文档（2026-09 的 history / exec-run）里的引用不改。

## T23 06 与 README 标注已实施（2026-10-06）

- 06 头部加「实施状态：已按 09 实施」，指向两份现行规范和本执行记录（与 03「已按 15 实施」同格式）。
- README 索引：06 行改为「已按 09 实施」、迁移去向改为「已合并进」两份规范；D8 改为「已批准并实施（P1–P5）」（P6 拆分完成后再更新）。
- 07 W4（`message-queue-demo.html`）不改：清单记录的是当时的发现，处理结果见 T22。
- `check:current-docs` 通过。

## T24 Electron / CDP 检查（2026-10-06）

- 方法：vite 5199 + 无头 Chrome 9333（`--user-data-dir=/tmp/chrome-mock-profile`），`deviceScaleFactor: 2`，脚本 `/tmp/fe09-probe8.mjs`（模式 flow / search / dark / narrow / flip / remote）。按 09「验证方式」逐项在最终代码（P1–P4 全部完成后）重跑，截图 `screenshots/p5-t24-*.png`（13 张）。
- 读到的值：
  - **单行 / 多行**：空 → `inline` / `999px`；短句仍 inline；长文本 → `stacked` / `18px`；全选删除后打一个字 → 回到 inline（P1 的「删到一个字仍多行」是在没有全选、逐字删除时；这里先清空再输入，属于重新开始）；清空 → inline。全程焦点在同一个 textarea。
  - **外观**：浅色聚焦边框 `rgba(0,0,0,.11)`，未聚焦 `.07`；深色 `rgba(255,255,255,.12)`。与 P1 记录一致。
  - **`+` 面板**：在输入框上方 8px，宽度差 0，在视口内；首行 Plan、图片、Skills、模型；焦点在「搜索」。搜索 `flash` 出现「模型」组和 `deepseek-flash` 行（mock 只有 `deepseek-*` 模型，计划写的 `son` 在 mock 里无结果，截图是 `p5-t24-palette-search-flash.png`）。↓ 到「模型」→ 进入「搜索模型」页；← 回到主页；在模型页按 Esc 回主页、再按 Esc 关闭，焦点回「消息输入框」。
  - **翻转**：窗口高度 ≥ 420 时面板始终在上方。高度 300 / 360 且把输入框滚到视口顶部时，Radix 翻到下方（间距 8px），但面板下沿超出视口（列表 `max-h-[280px]` 不随可用高度收）。Electron 窗口 `minHeight: 760`，实际不会出现；记为已知问题，不改。
  - **模式**：Shift+Tab → `data-mode=plan`，chip「退出 Plan 模式」，发送按钮 `rgb(145,96,14)`；点 × → 回到 agent，chip 消失，焦点回输入框。
  - **480px**：会话页为 stacked；`+` 面板在上方 8px、宽度差 0、在视口内。新建页切到远端 Host 后缩到 480：运行目标行「等待 Host 工作区 | 开发机 devbox | 读取失败」，右缘 419 < 480，两行（60px），没有分支按钮。
  - **远端未就绪**：发送按钮 disabled，aria-label 和 tooltip 都是「无法读取机器信息：Mock bridge does not implement hosts.call」。
- 已在 P2 / P4 做过、本步没有重做的：队列托盘（5 条、暂停、已引导，`p2-*`）、运行位置菜单和子菜单（含 480 收窄）、无 Host 时进设置、状态行（`p4-*`）。P4 之后没有改过这些代码。
- 交给验收：中文输入法、真实打字节奏、真实队列（需要模型 key 的真实运行）、真实远端 Host、Electron 窗口里的整体观感。
- 阶段末检查：typecheck；renderer 全量 120 文件 / 1034 通过 + 1 跳过；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。09 进度 P5 打勾；00 §11 更新到 T24。

## 补：`check:frontend-theme` 白名单（2026-10-06）

- T25 摸底时跑了此前各步没跑的 `pnpm check:frontend-theme`，失败：`components/composer/ModelPicker.tsx contains non-theme-aware color utility bg-white`。原因：T12 把模型选项里 Thinking 开关的圆点（`toggle-thumb … bg-white`）从 Composer 搬进 ModelPicker，而白名单仍挂在 `components/Composer.tsx` 下。基线 `4ba97aaf` 上该检查通过。
- 修复：`scripts/check-frontend-theme-colors.mjs` 的白名单改为 `components/composer/ModelPicker.tsx → bg-white`；Composer 原条目里的 `linear-gradient`、两种 `rgba` 底色、`text-white` 在 Composer 里都已不存在（`grep` 为空），一并删除。
- 以后每步的命令加上 `pnpm check:frontend-theme`。

## T25 P6 摸底与拆分边界（2026-10-06）

- **现状**（P1–P5 之后）：`Composer.tsx` 1810 行；props 40 个；`useState` 19、`useRef` 15、effect 19；`render*` 13 个（`renderComposerInput`、`renderAttachmentStrip`、`renderSlashMenu`、`renderAddMenuButton`、`renderModeSelector`、`renderModelSelector`、`renderSendButton`、`renderToolbar`、`renderPanel`、`renderReviewActionsStrip`、`renderComposerStatusRow`、`renderInitialContextRow`、`renderDraftError`）；原生 `<button>` 7 个（附件预览 / 移除 ×2、Skill 移除、斜杠功能行、斜杠 Skill 行、斜杠重试）。
- **Composer 不改成读 ComposerContext**：`ConversationComposerSlot` 读 ComposerContext 再把值作为 props 交给 Composer，12 个测试文件直接渲染 `<Composer … />`，Context 缺省会抛错。「不再增加 prop」按 Composer 对外的 props 理解：P6 不给 Composer 加 prop；子组件从 Composer 拿 props（内部接口）。
- **拆分边界**（新文件都在 `R/components/composer/`）：

| T | 文件 | 搬走的内容 |
| --- | --- | --- |
| T26 | `use-composer-keyboard.ts` | `isImeComposing`；textarea 的 onKeyDown（IME、Shift+Tab、斜杠 ↑↓ / Enter / Esc、↑↓ 输入历史、Enter 发送）；`navigateInputHistory` |
| T27 | `ComposerAttachments.tsx` | `useComposerAttachments`（附件 state 与草稿写回、追加 / 移除、选图 / 选文件、粘贴、拖放、错误）、附件条组件、附件 helper 和样式常量 |
| T27 | `ComposerInput.tsx` | textarea 组件；`useComposerLayout`（测量、`stuckStacked`、inline / stacked 判定、body class） |
| T28 | `SlashMenu.tsx` | `useSlashMenu`（斜杠 state、过滤、高亮、进场动画、点外 / Esc 关闭、选中后回焦）和菜单组件、样式常量 |
| T28 | `use-composer-skills.ts` | Skills 加载（列表、loading、error、按工作区去重、重试）。**偏差**：计划写的是 `SkillsPage.tsx`，但 T14 的 Skills 页已经是 `ComposerPalette` 里按数据生成的行（`skillRow`），没有独立的页面组件可拆；Composer 里剩下的是加载逻辑，拆成 hook |
| T29 | `ComposerToolbar.tsx` | `+`、模式 chip、模型按钮、发送 / 停止（含 tooltip / aria 文案计算） |
| T29 | `ReviewStrip.tsx` | Review 按钮条 |
| T30 | `use-composer-model.ts`、`composer-types.ts` | 计划表外：模型选择 / 运行时选项 / 目录 / 显示文案 / configure effect 拆成 hook；对外类型移到 `composer-types.ts`，Composer 原样 re-export（测试和调用方的导入不变）。context 用量的百分比计算移进 `ComposerStatusRow.tsx`。不这样做根组件到不了 500 行 |

- 每步都是纯搬迁：行为、DOM、class 不变；跑 typecheck、renderer 全量、`check:frontend-tokens`（按钮基线按文件搬，总数只降不升）、`check:frontend-theme`。

## T26 use-composer-keyboard（2026-10-06）

- 新增 `R/components/composer/use-composer-keyboard.ts`：`isImeComposing`（导出）和 `useComposerKeyboard`。hook 持有输入历史的游标（原 `historyIndexRef`），返回 `onKeyDown` 和 `resetHistory`；斜杠菜单通过 `slash: { open, resultCount, active, dismiss, move, select }` 交给它，发送和切 Plan 是回调。按键顺序和判断原样搬过去。
- Composer：删除 `isImeComposing`、`navigateInputHistory`、textarea 上 37 行的 onKeyDown；5 处 `historyIndexRef.current = null` 改为 `keyboard.resetHistory()`；新增 `setDraftText`（换文字并写回草稿），供历史导航用。1810 → 1751 行。
- 文档级 Esc 监听里「组字时不关斜杠菜单」的判断用的是原生 `KeyboardEvent`，留在 Composer（T28 随斜杠菜单一起搬）。
- **变异**：去掉 IME 判断 12 条失败；输入框有字时也翻历史 1 条失败；Esc 不关斜杠菜单 2 条失败；Shift+Enter 也发送 **0 条失败**，补用例 `composer-ime.test.tsx`「does not send on Shift+Enter」后 1 条失败。
- **验证**：typecheck；renderer 全量 120 文件 / 1035 通过 + 1 跳过；`check:frontend-tokens`、`check:frontend-theme` 通过。

## T27 ComposerInput / ComposerAttachments（2026-10-07）

- 新增 `R/components/composer/ComposerAttachments.tsx`：附件常量和 helper（`attachmentFromDroppedFile`、`dedupeAttachments`、预览样式等）、`useComposerAttachments`（按 draftKey 读写附件草稿、换会话换入、卸载释放；选图、选文件、粘贴图片、拖放，失败写进 `error`；拖放高亮 `dragActive` 和 `dropTarget` 三个事件）和附件条组件 `ComposerAttachments`（图片缩略图、文件卡片、Skill 胶囊）。
- 新增 `R/components/composer/ComposerInput.tsx`：`COMPOSER_BODY_*` / 输入框 class / 窄窗断点 / 单行高度阈值；`useComposerLayout`（inline / stacked 判定、`stuckStacked`、独立 DOM 测量的 `useLayoutEffect`，返回 `bodyRef / layout / bodyClass / resetStuck`）；`composerPlaceholder`；`ComposerInput`（textarea 本体和斜杠菜单的 combobox aria）。
- Composer：删除上述常量、状态、两个 effect 和 helper；附件发送错误的清理收成 `clearAttachmentSendError`；面板 class 和 `getComposerPanelClass` 留在 Composer。1751 → 1366 行。
- 原生按钮：Composer 7 → 3；`ComposerAttachments.tsx` 4（缩略图预览、图片移除、文件移除、Skill 移除，都是搬来的，各带一行原因注释）。基线总数不变，只是挪文件。
- **变异**（ComposerInput）：去掉 stuckStacked 保持 1 条失败；单行阈值 40 → 4000 4 条失败；`hasExtras` 不触发多行 2 条失败；新建页不强制多行 **0 条失败** → 补 `composer.test.tsx`「keeps the initial surface stacked even when empty」后 1 条失败。
- **变异**（ComposerAttachments）：去重、锁定时不收拖放、远端选文件传 `{ remote: true }`，搬家前后都 **0 条失败**（原来就没覆盖）→ 新增 `test/composer-attachments.test.tsx`（renderHook，4 条，含 Chat 整批拒绝），4 个变异各 1 条失败。
- **验证**：typecheck；renderer 全量 121 文件 / 1040 通过 + 1 跳过；`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过；T3「切换布局前后是同一个 textarea 节点」通过。headless Chrome（mock）跑 probe8 flow：inline ⇄ stacked 切换、`+` 面板钻取、Plan chip、Esc 回焦点都和 T24 一致。

## T28 SlashMenu / use-composer-skills（2026-10-07）

- 新增 `R/components/composer/SlashMenu.tsx`：斜杠菜单的常量、图标表、`SLASH_MENU_ID`（导出，输入框的 `aria-controls` 用）、`ComposerSlashResult` 类型；`useSlashMenu`（打开 / 收起、过滤、高亮、进场动画、高亮项滚进可见区、文档级点外和 Esc 收起；返回 `open / query / functions / skills / results / active / activeOptionId / dismiss / reset / move / highlight / finish`）；组件 `SlashMenu`（功能组、Skills 组、加载 / 失败重试 / 空状态）。
- 新增 `R/components/composer/use-composer-skills.ts`：Skills 列表的加载（同一工作区只拉一次、失败允许重拉、晚到请求丢弃、过滤与排序）和 `toggle`。斜杠菜单和 `+` 面板共用。
- 和 T25 的边界表一致：没有单独的 `SkillsPage.tsx`（Skills 页已经在 ComposerPalette 里）。
- Composer：删除斜杠常量、9 个 state / ref、4 个 effect、`loadSkills` / `toggleSkill` / `cancelSlashFocusFrame` / `finishSlashSelection`、文档级监听和 `renderSlashMenu`。选择后的执行（`executeSlashFunction` / `selectSlashResult`）留在 Composer：它要调发送、切模式、开 Review。1366 → 1074 行。
- 删掉一段不可达代码：原 `finishSlashSelection(nextMessage)` 在有 `nextMessage` 时下一帧把光标放到末尾，但 5 处调用都不传参数（只会清空），这段从没执行过。`finish()` 现在不带参数。
- 原生按钮：Composer 3 → 0（从基线删除）；`SlashMenu.tsx` 3（两种 option 和行内「重试」，各带原因注释）。总数不变。
- **变异**：搬家后先跑一遍，11 个变异里只有「点外面不收起」（1 条）和「空查询下没有 Skills 时不显示提示」（3 条）被抓到；锁定时也开菜单、运行中仍有 /plan /agent、文档级 Esc、结果变化不回第一项、鼠标悬停不改高亮、Skills 过滤 / 缓存 / 失败后重拉都是 **0 条失败**（原来就没覆盖）。新增 `test/composer-slash-menu.test.tsx`（renderHook，8 条）后，这 9 个变异（另加 Skills 排序）各 1 条失败。
- **验证**：typecheck；`--noUnusedLocals` 下 composer 相关文件无未用项（其他文件的既有未用项不在本计划范围）；renderer 全量 122 文件 / 1048 通过 + 1 跳过；`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过。
- **headless Chrome（mock long-session）**：输入 `/` 打开菜单，在输入框上方间距 7px，功能 + Skills 两组，`aria-controls` / `aria-activedescendant` 正确；↓ 高亮移到 agent；Esc 收起、焦点留在输入框；`/c` 把 compact 排第一；`/zzzz` 显示「没有匹配的功能或 Skills」；`/st` + Enter 执行 status 并清空输入框；点 Composer 外面收起。截图 `screenshots/p6-t28-slash-open.png`。

## T29 ComposerToolbar / ReviewStrip（2026-10-07）

- 新增 `R/components/composer/ComposerToolbar.tsx`：`+` 按钮、模式 chip（× 和 Backspace 退出）、模型按钮（包 `ModelPicker`，props 原样透传）、发送 / 停止。发送按钮的样子和 tooltip / aria 文案收成纯函数 `composerSendButtonState(ComposerSendState)`（导出），判断顺序原样搬过去。模式表、chip 颜色、发送按钮变体等常量随之移走。
- 新增 `R/components/composer/ReviewStrip.tsx`：Review 按钮条和 `ReviewStripSummary` 类型；Composer 的 `ComposerReviewSummary` 改为它的别名，调用方导入不变。是否显示（能力开关、Chat、空状态）留在 Composer。
- 删掉两处死代码：`renderReviewActionsStrip` 里 `surface !== "followup" && surface !== "initial"`（`ComposerSurface` 只有这两个值，永远不成立）；`modeButtonRef`（只挂上、从没读过）。
- `review-overflow-button` 没有 `onClick` 是已登记的技术债，在 ReviewStrip 里加了一行注释，行为不变。
- Composer 1074 → 876 行。原生按钮没有变化（工具栏用的都是 IconButton）。
- **变异**：队列中发送、压缩中不能停、Host 不可达不能停、运行中 Backspace / × 不退出模式各 1 条失败；**中止进行中仍可点停止、Review 默认 aria 文案、加载中可点 Review 都是 0 条失败**（原来就没覆盖）→ 新增 `test/composer-toolbar.test.tsx`（5 条：`composerSendButtonState` 2 条、ReviewStrip 3 条），3 个变异各 1 条失败。
- **验证**：typecheck；`--noUnusedLocals` 下 composer 相关文件无未用项；renderer 全量 123 文件 / 1053 通过 + 1 跳过；`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 通过。headless Chrome（mock）：probe8 flow（inline ⇄ stacked、Plan chip 发送按钮 `rgb(145,96,14)`、× 回 Agent 且焦点回输入框）和 remote（发送禁用，tooltip「无法读取机器信息：…」）都和 T24 一致；long-session / approval-pending / streaming 三个场景的 Review 条都在，文案「查看工作区变更；Git 仓库尚未初始化」。

## T30 Composer 根组件收尾（2026-10-07）

- 目标：`Composer.tsx` ≤ 500 行，只留根布局和浮层编排。876 → 496 行。
- 按 T25 边界表新增：
  - `use-composer-model.ts`：模型表映射、本机选择、运行时选项、模型目录、显示文案和 title、configure effect、默认模型异步同步。
  - `composer-types.ts`：全部对外类型，另把原来内联的 props 类型提成 `ComposerProps`。Composer 用 `export type { … } from` 原样 re-export，测试和调用方的导入不变。
  - context 用量百分比、圆环颜色、`<1` 文案收成 `ComposerStatusRow.tsx` 的 `contextUsageDisplay`，状态行的 `context` prop 改为 `{ snapshot, open, onToggle }`。
- **计划表外（偏差，已记录，不影响行为）**：只拆上面三项，Composer 还剩约 610 行，到不了 500，又拆了 5 个文件：
  - `use-composer-send.ts`：`composerSendOptions`（纯函数）和 `useComposerSend`。管发送中状态、上传进度订阅、发送失败写回原会话草稿、仍在当前会话时放回输入框、附件错误的清理。
  - `composer-run-context.ts`：`useComposerContextSnapshot`（用量来源的优先级）、`composerGitFacts`（分支 / 分离的 HEAD / 运行位置）、`composerLocalRunTarget`（新建页运行位置行的本机部分，含工作区名回退）。
  - `ComposerNotices.tsx`：面板内的提示区（回复引用胶囊行 → 附件条（children 插槽）→ 状态提示 → 发送中 / 上传进度 → 附件错误），顺序和原来一致；另有 `ComposerSendErrorAlert`（输入框上方的发送错误，id 不变）。
  - `use-composer-draft.ts`：文字草稿按 draftKey 读写、换会话换入、发送失败恢复、聚焦请求。其余 hook 的重置通过 `onSwitched` / `onRestored` 回调交回 Composer。
  - `use-composer-overlay.ts`：`ComposerOverlay` 类型、互斥打开、「晚到的关闭只关自己」。
- 斜杠功能的执行改成 `SlashMenu.tsx` 的 `runSlashFunction(id, handlers)`，返回 false 时（/compact 不可用）菜单保持打开。Composer 只决定 compact 能不能用。
- props 解构按主题合并成 8 行；远端 Host 只查一次（`remoteHost`，模型按钮禁用和状态行共用）；去掉 `canSendMessage` / `sendError` / `selectedModelAvailable` 三个别名。
- 原生按钮没有变化（新文件都没有原生 button）；基线不动。
- **变异**：27 个，18 个搬家后直接被抓到。9 个原来就没覆盖（**0 条失败**）：
  - 用户选过模型后默认模型仍覆盖；
  - 未开 Thinking 也带推理强度；
  - 圆环危险色阈值 90 → 95；
  - 工作区名不回退到第一项；
  - 恢复草稿不写回；
  - /compact 不可用时菜单仍关闭；
  - /compact 守卫放宽到只看 onSend；
  - 发送错误提示丢 id（附件卡片的 aria-describedby 断开）；
  - 换会话不清「已进入多行」。

  补测试后 9 个各 1 条失败：
  - 新增 `test/composer-run-helpers.test.tsx`（4 条：`composerSendOptions`、`contextUsageDisplay`、`composerLocalRunTarget`、`useComposerModel` renderHook）；
  - `composer.test.tsx` 加 4 条（恢复草稿写回、被拒附件用错误描述、换会话回到单行、无模型时 /compact 留在菜单）。
- **验证**：
  - typecheck 通过；`--noUnusedLocals` 下 composer 相关文件没有未用项。
  - renderer 全量：124 个文件，1061 条通过，1 条跳过。
  - `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:current-docs` 都通过。
- **headless Chrome（mock）**：
  - probe8 flow：`+` 面板钻取、模型页、Plan chip `rgb(145, 96, 14)`、× 回 Agent 且焦点回输入框。
  - remote：发送禁用，tooltip「无法读取机器信息：…」。
  - slash：间距 7px、↓、Esc、过滤、空状态、`/st` + Enter 打开上下文。
  - narrow 480：新建远端是 stacked、18px 圆角。
  - dark：inline 胶囊、面板在上方间距 8px。
  - 点外面收起：点主区和侧栏都收起。
  - Review 条在 long-session / approval-pending / streaming 三个场景都在。
  - 以上都和 T29 一致。

## P6 阶段复核与 09 收尾（2026-10-07）

- **只读复核**：Sonnet 子智能体对照 `cd933e00`（T24）检查 P6 diff，没有必须修的问题。
  - 门槛：Composer 496 行；原生按钮基线 213 → 213，只在文件间搬。
  - 声明删除的三处确实不可达或从未被读取。
  - 以下各项都与原逻辑等价：
    - `runSlashFunction` 与原 `executeSlashFunction`；
    - 发送和失败恢复的顺序；
    - `ComposerNotices` 的渲染顺序；
    - 浮层的互斥和「晚到的关闭只关自己」；
    - 各 hook 的依赖数组（没有陈旧闭包）。
  - 对外导出不变，新增用例都有真实断言，交接里的 4 条技术债和代码一致。
- **复核建议**：草稿的三个 effect 移进 `use-composer-draft` 后，相对其他 effect 的顺序变了，复核判断没有可观察差异。按建议补了一条用例：
  - 用例是 `composer.test.tsx`「prefers the restored draft when the session and the restore arrive together」，覆盖 draftKey 和 draftRestore 在同一次渲染里一起变的情况。
  - 变异：把「换会话」effect 挪到「恢复」之后，这条和「writes a restored draft back」各 1 条失败。
- **收尾验证**：renderer 全量 124 个文件，1062 条通过，1 条跳过；typecheck 和 4 个检查都通过。
- **文档**：
  - 新增 `execution-summary.md`；交接补 P6 一节，标注可以交给验收；
  - 计划 09 勾 P6；00 §11、README D8 已更新；
  - history 已补全；`tech-debt-tracker.md` 两条的后续动作已改写（09 只搬迁、未改行为）；
  - 学习文档：`docs/learnings/2026-10/20261007-mutation-check-for-moves.md`。
