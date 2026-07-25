# Ink & Emerald 前端配色迁移计划

## 状态

- 状态：Active / 等待执行批准
- 设计系统：`ActSpace Editor Design System`
- 视觉方向：`Ink & Emerald / 墨色与翡翠绿`
- 改动类型：前端主题 token、组件状态和页面视觉迁移
- 当前阶段：只完成计划，未修改 renderer 代码

## 目标

将 ActSpace 桌面端从“单一蓝色 `brand` 同时承担按钮、选中、focus、运行和图表”迁移到明确的语义颜色系统：

> 暖中性灰阶工作台 + 随主题翻转的 ink action + 稀缺的 emerald operational accent。

完成后应达到：

- 灰阶独立完成页面、surface、hover、selected、pressed 和文本层级。
- 发送、保存、确认等主操作使用 action token，不使用 operational green。
- running、connected、enabled、healthy 和 success 使用 operational / success 语义。
- info、warning、danger、diff 和数据可视化保持独立 token，不互相借用。
- 浅色、深色、跟随系统三态都可用，不依赖组件字面量颜色。
- 旧 `brand` 消费者清零后才删除兼容 alias，不进行一次性全局替换。

## 执行门槛

这份 plan 获得用户批准后才能开始修改前端代码。

开始大范围组件迁移前，还必须先通过 Sidebar、Composer、Settings 三个浅色 / 深色视觉样板的人工确认。样板未确认时，只允许做消费者盘点和预览产物，不得推进全局 token 切换。

## 事实来源

执行时按以下优先级读取：

1. `DESIGN.md`
2. `docs/design-docs/frontend/front-全局视觉语言规范.md`
3. `docs/design-docs/frontend/front-主题与配色规范.md`
4. `docs/design-docs/frontend/README.md`
5. 各组件专题规范
6. `docs/FRONTEND_VERIFICATION.md`

历史 PNG / HTML 可用于理解结构和交互，不能覆盖上述文字规范的颜色职责。

## 当前实现基线

2026-07-25 扫描 `packages/desktop/src/renderer` 得到：

- 40 个 TSX / TS / CSS 文件仍消费 `brand` 或 `--act-color-brand*`。
- 159 行直接包含 `brand` 相关使用。
- 高频 utility 包括：`bg-brand-soft` 51 处、`border-brand` 49 处、`text-brand` 45 处、`bg-brand` 37 处、`text-brand-strong` 16 处。
- 14 个 renderer 文件包含 `bg-white`、`bg-black`、arbitrary hex / rgba 等需要审核的字面量；其中部分是合法 overlay、shadow、Toggle thumb 或媒体装饰，不能机械删除。
- Composer 发送按钮已使用 `bg-text-main / text-surface`，可作为 ink action 的既有样板。
- Settings Toggle、Sidebar running dot、Kairos running 和多数连接状态仍消费 `brand`，应迁移为 operational。
- 多数导航 selected、menu selected、hover 和 focus 仍使用 `brand-soft / brand / brand ring`，应迁移为 neutral selected / hover / focus。
- Usage、Lab、Context 和 Kairos reply 存在合法的数据色 / info 需求，不应统一改绿。

重新执行基线扫描：

```sh
rg -l --glob '*.{tsx,ts,css}' "brand|--act-color-brand" packages/desktop/src/renderer
rg -n --glob '*.{tsx,ts,css}' "brand|--act-color-brand" packages/desktop/src/renderer
rg -n --glob '*.{tsx,ts,css}' "text-black|bg-black|bg-white|text-\[#|bg-\[#|border-\[#|rgba\(" packages/desktop/src/renderer
```

## 范围

### 包含

- 制作 Sidebar、Composer、Settings 的浅色 / 深色配色样板。
- 调整 `tokens.css` 的浅色、深色和 system-dark 目标色值。
- 拆分 action、operational、info、warning、danger、success、chart、context、diff 和 focus token。
- 同步 `tailwind.css` 语义 utility 映射。
- 迁移基础组件、Sidebar、Composer、Settings、消息流、右侧面板、Usage、Kairos 和 Lab。
- 处理 Markdown、code、diff、selection、focus、overlay 和 Electron chrome 等全局边界。
- 更新受 class 名或视觉状态影响的 renderer 测试。
- 增加可机械检查的主题颜色防回流脚本。
- 同步设计文档、history 和必要的视觉基线产物。

### 不包含

- 不调整业务流程、IPC、Agent Runtime 或持久化。
- 不重做页面信息架构和主布局。
- 不引入新 UI 组件库、CSS-in-JS 或新主题框架。
- 不追求和 Cursor 官方产品或营销站逐像素对齐。
- 不删除 info blue、warning amber、danger red 或数据可视化多色。
- 不在同一次配色迁移中重做字体、间距、圆角和布局尺寸；只修正因颜色对比必须调整的边框强度和状态可见性。
- 不在没有消费者清单和视觉样板的情况下直接修改 `--act-color-brand` 的值。

## 颜色职责契约

| 职责 | 目标 token / utility 方向 | 主要消费者 | 禁止用途 |
|---|---|---|---|
| Neutral surface | app-bg / sidebar / surface / surface-subtle | 工作台、面板、Composer、设置分组 | 不表示成功或运行 |
| Neutral state | selected / hover-overlay / line / focus-ring | 导航、Tab、菜单、行选中、普通 focus | 不使用 operational green |
| Action | action / action-hover / on-action | 发送、保存、确认提交、关键 CTA | 不用于 Toggle、running 或导航选中 |
| Operational | operational / operational-hover / operational-soft / on-operational | running、connected、Toggle on、healthy、运行状态点 | 不用于普通链接、hover、selected |
| Success | success / success-soft / on-success | 显式完成确认、成功 toast | 不把每条 completed 日志染绿 |
| Info | info / info-soft / on-info | 信息提示、有限回复分类、可视化系列 | 不作为全局主色 |
| Warning | warning / warning-soft / on-warning | 审批等待、阈值、风险 | 不表示品牌气质 |
| Danger | danger / danger-soft / on-danger | 错误、删除、失败 | 不与 diff removal 背景直接混用 |
| Visualization | chart-series-* / context-* | Usage、Context、Lab、heatmap | 不借用 action / operational |
| Diff | diff-add-* / diff-remove-* | diff 行、变更统计 | 不直接复用 Toggle 或 danger button 背景 |

## Token 迁移策略

### 保留现有稳定 utility 名

下列已是语义名的 Tailwind utility 尽量保留，只调整它们底层的目标色值：

- `bg-app-bg`
- `bg-sidebar`
- `bg-surface`
- `bg-surface-subtle`
- `bg-sidebar-selected`（可保留为 selected 兼容名，或在有充分消费者证据后收口为 `bg-selected`）
- `border-line / border-line-strong`
- `text-text-main / muted / faint / subtle`

不为了追求命名完美而制造无意义的全仓 JSX 更名。

### 新增的语义映射

`packages/desktop/src/renderer/styles/tokens.css` 和 `tailwind.css` 至少建立：

```text
action / action-hover / on-action
operational / operational-hover / operational-soft / on-operational
info / info-soft / on-info
warning / warning-soft / on-warning
danger / danger-soft / on-danger
success / success-soft / on-success
selected / focus-ring / operational-focus-ring
```

`brand / brand-strong / brand-soft / brand-glow` 在迁移期只作兼容 alias，不允许新组件继续消费。

### 浅深主题一次定义

每个新 token 必须在以下三个主题分支同步落地：

1. `:root` 浅色。
2. `:root[data-theme="dark"]` 深色。
3. `@media (prefers-color-scheme: dark)` 下的 `:root[data-theme="system"]`。

不允许先只写浅色值，再把深色主题当成后续修补。

## 里程碑 0：锁定基线与分类表

### 任务

1. 用 `rg` 生成完整 `brand` 消费者清单。
2. 为每个消费点标记 `neutral / action / operational / info / warning / danger / visualization / diff / legal-literal`。
3. 保存当前浅色、深色的 Sidebar、Composer、Settings、Usage、Kairos 截图作为 before 基线。
4. 记录当前 computed style，至少包含 app background、sidebar、surface、selected row、send button、Toggle on、focus ring 和 danger state。

### 产物

- plan 内更新后的消费者分类统计。
- before 截图和 computed-style 记录，放入当次 history 或明确的验收记录。

### 验收

- 所有 `brand` 消费点都已分类，没有“顺手改绿”的未定义项。
- 所有颜色字面量都已标记为语义 token 候选或合法例外。

## 里程碑 1：三个视觉样板先行

### 任务

1. 新增 `docs/design-docs/frontend/ink-emerald-color-preview.html`。
2. 同一 HTML 内提供 Light / Dark 切换，不依赖外部资源。
3. 样板只覆盖三个代表切片：
   - Sidebar：normal / hover / selected / running / waiting approval / failed。
   - Composer：idle / focused / attachment / context warning / running / disabled send。
   - Settings：nav selected / group surface / Toggle on-off / primary-secondary-danger button / input focus。
4. 展示 neutral、action、operational、info、warning、danger 和图表系列的完整状态组，但不把样板做成营销式色板页。
5. 在 `docs/design-docs/frontend/README.md` 中增加样板入口和审批状态。

### 视觉审批门

需要用户明确确认：

- 浅色背景是否足够暖且不显黄。
- Sidebar 和主工作区的灰阶差是否在真实屏幕上可见。
- selected 在无彩色时是否仍然清楚。
- ink action 是否有足够优先级，但不像纯黑大块。
- operational green 是否只占少量状态信号，没有变成普通按钮色。
- 深色是否使用暖黑灰，而不是纯黑或高饱和绿。

未通过这一门禁止进入里程碑 2。

## 里程碑 2：建立 token 地基

### 主要文件

- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/styles/tailwind.css`
- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/styles/markdown.css`
- `packages/desktop/src/renderer/styles/diff.css`

### 任务

1. 按 `DESIGN.md` 目标色板更新 surface、sidebar、selected、line 和 text 的浅深值。
2. 新增 action、operational、info、warning 和完整 on-* / soft token。
3. 将旧 `warm` 语义收口为 warning，迁移期保留 alias。
4. 将旧 `success` 与 operational 色家族对齐，但保留独立语义名。
5. 将普通 focus ring 改为高对比中性 token，另外建立 operational focus 例外。
6. 将 selection、quote、table head、inline code 中不必要的冷蓝背景收口为中性层级；需要 info 语义的部分消费 info token。
7. 保持 chart / context / diff token 独立，为深色主题重新校准亮度，不与 operational 合并。
8. 修正 `docs/coding-standards/team/frontend-style-scope-conventions.md` 中使用 hard-coded 蓝色的示例，避免编码规范与主题硬约束冲突。

### 兼容策略

- 第一步允许 `brand` alias 指向旧色值，保证未迁移页面不被意外重染。
- 组件迁移按切片完成后，再逐步改变或删除 alias。
- 不允许在 token 定义层把 `brand` 直接 alias 到 operational，否则未迁移的 selected / link / chart 会全部变绿。

### 验收

- 三态主题定义完整，Tailwind 映射与 CSS token 一一对应。
- 在尚未迁移任何页面时，新 token 的加入不应让旧 `brand` 消费者全部改绿。
- 新增一个 token 契约测试或检查脚本，能发现浅色 / 深色 / system-dark 缺少定义。

## 里程碑 3：基础组件与三个黄金切片

### 3.1 基础状态和 Settings primitives

主要文件：

- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `packages/desktop/src/renderer/components/ui/Sheet.tsx`
- `packages/desktop/src/renderer/components/ui/Tooltip.tsx`

任务：

- Toggle on 使用 operational，off 使用 neutral line。
- Select / multi-select 当前项改为 neutral selected + check，不再用蓝底白字。
- Input / Select / button focus 使用中性 focus ring，不只修改 border color。
- 主操作使用 action，次级操作使用 neutral surface，危险操作使用 danger。
- Toggle thumb、overlay 和 shadow 等合法字面量逐项写注释或转为 token，不做无证据全删。

### 3.2 Sidebar 黄金切片

主要文件：

- `packages/desktop/src/renderer/components/Sidebar.tsx`
- 新增 `packages/desktop/src/renderer/test/sidebar-color-semantics.test.tsx`

任务：

- active / selected 使用中性 `sidebar-selected / selected`。
- hover / pressed 使用 neutral overlay。
- running 状态点使用 operational。
- waiting approval 使用 warning，failed 使用 danger，idle 使用 faint。
- rename input focus 改为 neutral focus，不使用 brand border / glow。
- selected 和 running 同时出现时，中性行底与绿色小点同时存在。

### 3.3 Composer 黄金切片

主要文件：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`

任务：

- 保留已有 ink send action，不改成绿色。
- command menu、model menu、option row 的 hover / selected 改为 neutral。
- Toggle on 改为 operational，并更新相关 class 断言。
- Context usage ring 默认使用 neutral，接近阈值使用 warning，超限使用 danger。
- drop active / attachment remove hover / popover focus 使用 neutral 或对应语义，不使用 brand-soft。
- 审查附件缩略图中的 hard-coded 渐变和 rgba，仅将它们保留为媒体占位装饰，不当作交互状态色。

### 3.4 Settings 黄金切片

主要文件：

- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `packages/desktop/src/renderer/components/settings/FileWatchSettings.tsx`
- `packages/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx`
- `packages/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx`
- `packages/desktop/src/renderer/components/settings/PluginsSettings.tsx`
- `packages/desktop/src/renderer/components/settings/SkillsSettings.tsx`
- `packages/desktop/src/renderer/components/settings/fs-watch-shared.ts`
- 新增 `packages/desktop/src/renderer/test/settings-color-semantics.test.tsx`

任务：

- nav selected 使用中性灰底黑 / 浅色主文字。
- 设置分组使用 `surface-subtle`，删除不必要的彩色边框和阴影层级。
- 添加服务、保存等主操作使用 action。
- 测试连接、编辑等次级操作使用 neutral。
- 连接成功使用 operational / success，连接失败使用 danger，连接中使用 operational 但保留文字说明。

### 里程碑 3 验收门

在浅色、深色和 system 三态分别检查：

- Sidebar：normal / hover / selected / selected+running / waiting approval / failed / keyboard focus。
- Composer：idle / focus / menu open / model selected / Toggle on / context warning / send disabled / running。
- Settings：nav selected / Toggle on-off / input focus / primary-secondary-danger / success-failed。

通过后才可以把相同语义扩散到其他页面。

## 里程碑 4：消息流与右侧工作区

### 主要文件

- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/*.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/*.tsx`
- `packages/desktop/src/renderer/components/SessionHoverPreview.tsx`
- `packages/desktop/src/renderer/components/ShutdownOverlay.tsx`

### 任务

- 普通回复、Thinking、completed 工具行和菜单 hover 回归 neutral。
- running shimmer / spinner / 运行状态点使用 operational，基础文字仍保持可读中性色。
- approval 使用 warning，failed / denied 使用 danger。
- Tab selected、文件树 hover / selected、对象菜单当前项使用 neutral。
- Review 中 addition / deletion / hunk / renamed 分别使用 diff / info 职责，不统一改绿。
- Sheet overlay 中的恒定黑色 alpha 按合法例外处理，同时检查浅深主题可见性。

### 验收

- 消息流在去掉所有彩色状态后仍能理解执行顺序。
- 颜色只补充 running / warning / danger / diff 语义，不形成彩色工具卡片墙。
- 右侧面板的 Tab、树、菜单和启动卡在 keyboard focus 下清晰可见。

## 里程碑 5：Kairos 运行语义

### 主要文件

- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/components/kairos/*.tsx`
- `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`

### 任务

- running / healthy / enabled 使用 operational。
- sleep / waiting / ordinary event 使用 neutral。
- warning / budget threshold 使用 warning，exhausted / failed 使用 danger。
- selected row、page button、header menu active 改为 neutral selected，不使用彩色左边线或蓝色 glow。
- final reply 只在需要事件分类时使用 info blue，普通正文保持 neutral。
- 未读通知使用点、字重或中性层级；只有 important / failed 使用 danger，不让“未读”和“运行”共享同一绿色语义。

### 验收

- selected + running、selected + failed、unread + important 等组合状态能同时表达，不依赖单一颜色。
- 运行轨迹不再以固定蓝黄红灰分类作为主视觉，而是按 operational / neutral / warning / danger / limited info 表达。

## 里程碑 6：Usage、Context 和 Lab 数据配色

### 主要文件

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`
- `packages/desktop/src/renderer/components/LabPage.tsx`
- `packages/desktop/src/renderer/styles/tokens.css` 中 chart / context token

### 任务

- Usage 卡片、range tab、弹窗和 hover 使用 neutral，不再使用蓝色建立组件层级。
- Token 总数、缓存效率等大数字使用主文字；健康 / 命中语义可用 operational 小标识。
- Chart series 保持独立低饱和色板，验证浅深主题的系列区分和 legend 可读性。
- Context bucket 保持多色分类，但不将其中任一色提升为导航或按钮主色。
- Lab 容器保持中性 surface，阶段色只作身份徽章和数据编码。

### 验收

- 关闭 chart / context 颜色后，页面层级仍然成立。
- 图表色不与 warning / danger / operational 状态产生误读。
- Heatmap 空值、低值、高值、hover 和 keyboard focus 在两个主题下都可区分。

## 里程碑 7：删除旧 brand 消费与建立防回流

### 任务

1. 确认 renderer 中 `brand` 消费者为 0，或只剩经设计文档明确允许的兼容边界。
2. 删除 `tailwind.css` 中无消费者的 `brand*` 映射。
3. 删除 `tokens.css` 中无消费者的 `--act-color-brand*`、`--color-brand*`、`--accent*` 和 `--surface-blue` alias。
4. 新增 `scripts/check-frontend-theme-colors.mjs`：
   - 拒绝新增 `brand` utility / variable 消费。
   - 拒绝交互组件中新增 `text-black / bg-white / arbitrary hex / arbitrary rgba`。
   - 允许 token 定义、overlay、shadow、Toggle thumb、媒体装饰和第三方品牌色的窄范围 allowlist。
   - 检查新语义 token 在 light / dark / system-dark 三处都存在。
5. 在根 `package.json` 增加 `check:frontend-theme`，并纳入仓库 CI 或 `check:repo` 的稳定检查链。
6. 更新 `front-主题与配色规范.md`，将“目标设计”状态改为“已落地”，并写清最终 token 名。

### 验收

```sh
pnpm check:frontend-theme
rg -n --glob '*.{tsx,ts,css}' "brand|--act-color-brand" packages/desktop/src/renderer
```

- 检查脚本通过。
- `rg` 无输出，或仅剩有明确注释和 allowlist 的非 UI 兼容项。
- 不存在“为了让检查通过而把字面量换成新的 arbitrary color”的规避写法。

## 测试调整

### 组件测试

- 将直接断言 `bg-brand / text-brand / border-brand` 的测试改为断言新语义 class。
- 优先测试“职责正确”，不锁定具体 hex。
- Composer 保留“发送按钮不使用 operational / brand”的回归断言。
- Toggle 断言 on = operational，off = neutral。
- Sidebar 断言 selected = neutral，running dot = operational，waiting approval = warning，failed = danger。
- Settings 断言 primary = action，nav selected = neutral，connected = operational。

### Token 契约测试

脚本至少检查：

- 目标 token 名在三个主题分支都定义。
- `tailwind.css` 中的 utility 只引用已定义的 token。
- 删除 alias 前不存在消费者。
- 新交互组件没有非主题感知颜色字面量。

## 验证方式

### 工程验证

每个里程碑至少执行：

```sh
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-theme
```

完成全部迁移后执行：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
pnpm check:repo
git diff --check
```

### 浏览器 renderer 视觉验证

使用 `http://127.0.0.1:5173/` 验证布局和组件状态，覆盖：

- 浅色 / 深色 / system。
- 1440×900 标准工作台尺寸。
- 1100×720 紧凑桌面尺寸。
- Sidebar、Composer、Settings、Message tools、Right Panel、Usage、Kairos。
- hover、selected、pressed、disabled、focus-visible、running、success、warning、danger。
- `prefers-reduced-motion` 下的 running 静态表达。

每个里程碑都保留有意义的 before / after 截图，但不把临时调色过程全部堆入长期设计文档。

### Electron 真实验收

收尾阶段使用 `pnpm dev:log` 启动 Electron，通过 Computer Use 检查：

- 窗口 chrome、交通灯区域和滚动条随主题正确翻转。
- 真实 macOS Retina 屏上 hairline、selected 和 focus ring 可见。
- 打开菜单、popover、Sheet、Settings 和右侧面板时没有旧蓝色瞬间闪现。
- 主题切换后已打开浮层、图表和消息流正确更新。
- 长时间阅读区域不出现过强绿色、纯黑或高对比疲劳。

### 可访问性与对比度

- 普通文本与背景对比度目标不低于 4.5:1。
- 大文字与非文本关键边界按适用场景检查 3:1。
- focus-visible 必须在 surface、selected 和 danger / operational 周边都可见。
- 状态不能只依赖颜色；必须保留文字、图标、形状或位置中的至少一种冗余表达。

## 风险与缓解

### 风险 1：把“蓝色迁移”做成“全局换绿”

缓解：先建消费者分类表，新建 action / operational / semantic / visualization token，旧 brand alias 不直接指向绿色。

### 风险 2：一次修改 tokens 导致所有页面集体回归

缓解：先新增 token，再按黄金切片迁移；旧 alias 在消费者清零前保持稳定。

### 风险 3：浅色好看，深色变成黑绿霓虹

缓解：每个里程碑同时验收 Light / Dark / System，限制绿色面积，深色 operational 只用在小状态信号。

### 风险 4：中性 selected 在 Retina 屏上看不见

缓解：在真实 Electron / Retina 屏审查 surface 差、边框和文字权重，必要时调整 neutral 对比，不通过重新加彩色解决。

### 风险 5：语义 class 更名造成测试噪音

缓解：测试锁定职责而不是 hex；每个切片同步修测试，不等到最后批量更新。

### 风险 6：防回流脚本误报合法颜色字面量

缓解：allowlist 只按文件 + 用途维护，不使用宽泛目录豁免；每个例外需有可读注释。

## 回滚策略

- 每个里程碑保持可独立评审和回退，不将 token 地基、所有页面和 alias 删除塞进同一次不可分割改动。
- 页面迁移期保留旧 brand alias；单个切片出现严重问题时，回退该切片的语义 class 迁移，不需回退已验证的 token 定义。
- alias 删除是最后的不可兼容步骤；只在 `rg` 证明消费者清零、全量构建与 Electron 验收通过后执行。
- 不使用 `git reset --hard` 或其他会覆盖用户工作区的回滚方式。

## 实施分段建议

建议按以下独立评审单元推进：

1. 配色 HTML 样板与用户确认。
2. Token 地基 + 契约检查。
3. Settings primitives + Sidebar + Composer 黄金切片。
4. Message flow + Right Panel。
5. Kairos。
6. Usage + Context + Lab。
7. Legacy alias 删除 + 防回流 + 全量 Electron 验收。

第 3 步内的 Sidebar、Composer 和 Settings 共享 token / primitive 地基，不建议由多个 Agent 同时修改。第 4、5、6 步在 token 契约稳定后可以按不同文件范围并行，但每个执行者都必须先读 `AGENTS.md` 和本 plan。

## 进度记录

- [x] 确认 `Ink & Emerald` 设计方向和颜色职责。
- [x] 扫描当前 renderer 的 brand 与颜色字面量基线。
- [x] 生成可执行的配色迁移计划。
- [ ] 用户批准本 plan。
- [ ] 完成三个浅深视觉样板并获得确认。
- [ ] 完成 token 地基与契约检查。
- [ ] 完成 Sidebar、Composer、Settings 黄金切片。
- [ ] 完成消息流、右侧面板和 Kairos。
- [ ] 完成 Usage、Context 和 Lab。
- [ ] 删除旧 brand alias，建立防回流检查。
- [ ] 完成全量工程、浏览器、Electron 和可访问性验收。
- [ ] 同步 history / learning / 设计文档并将 plan 归档。

## 决策记录

- 2026-07-25：不将旧 `brand blue` 直接替换为绿色，先按颜色职责拆分 token。
- 2026-07-25：Sidebar、Composer、Settings 是配色迁移的黄金切片，样板确认后才扩散。
- 2026-07-25：发送按钮保留 ink action，Toggle / running / connected 迁移为 operational green。
- 2026-07-25：selected / hover / normal focus 改为 neutral，info blue 只保留在信息和数据编码中。
- 2026-07-25：旧 brand alias 只在消费者清零、全量验收通过后删除。
