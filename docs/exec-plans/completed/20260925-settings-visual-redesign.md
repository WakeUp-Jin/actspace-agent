# 设置中心视觉重设计

> 状态：2026-09-25 已完成实现与自动化验证；Electron 真实窗口验收见 `docs/exec-runs/20260925-settings-visual-redesign/execution-summary.md`。

## 目标

按已确认的 demo 重做设置中心的视觉和交互：所有设置页使用同一套分组、行、控件和保存方式；新增「能力 → 搜索」页，承接原「工具 → 联网」中的搜索开关和搜索通道；使用统计只做小幅调整。做完后，用户在浅色和深色主题下看到的每一页层级清楚、控件统一，修改设置时能立刻看到"已保存"反馈。

## 设计依据

- 设计稿：`docs/design-docs/frontend/settings-redesign-demo.html`（用浏览器直接打开，右下角「DEMO 调节」只用于对比方案，实现时不做）。
- 用户已确认的决定（2026-09-25）：
  1. 分组样式用**内嵌分组**：白底 `bg-surface`、1px `border-line`、圆角 10px、无阴影；组内行之间用浅分隔线。
  2. 开关开启色保持**翡翠绿** `bg-operational`。
  3. 在「能力」下新增**搜索**，顺序为 模型 → 搜索 → 工具 → 子 Agent。
  4. 搜索通道行**不显示** logo 或字母方块。
  5. **使用统计只做微调**，结构不变。
  6. demo 其他内容全部接受：Explore 模型只在「子 Agent」设置；「显示写入变动」移到「工具 → 显示」；「任务默认」改名「模型与生成」。

## 范围

- 包含：
  - `SettingsPrimitives.tsx` 的分组、行、控件统一，以及新增的行内编辑、状态点、保存提示等部件。
  - 设置导航增加「搜索」，页面宽度统一。
  - 通用、外观、模型（列表和连接详情）、搜索、工具、子 Agent、归档会话、更新这几页改用新部件。
  - 使用统计的微调（见 T9）。
  - 相关测试更新和新增、设计文档同步、history、执行文档。
- 不包含：
  - 设置数据结构、IPC、main 进程逻辑的任何修改。搜索页只是把现有 `searchProviders` 和 `web_search` 开关搬到新页面。
  - 弹窗和表单内部：服务商目录（`ProviderCatalogRoute`）、连接配置表单（`ProviderConnectionForm`、`CustomConnectionSetup`）、`CustomModelForm`、`CustomModelReasoningFields`、`ModelPricingFields`、`OpenRouterModelCatalogDialog`、`ImageGenerationSettingsDialog`、`LocalUpdateProgressDialog`、`RemoveProviderDialog`。这些只会因为共享按钮样式而自然变化，不重排版。
  - 扩展页、Skills 页（不属于设置导航）。
  - demo 中**没有数据支撑**的内容一律不做：
    - 子 Agent 页的「启用」开关和「思考级别」：`SettingsV4SubagentRoute.enabled` 虽然存在，但 Runtime 不读它；也没有思考级别字段。
    - 搜索通道"保存后先测试连接"：搜索 Key 目前只有 `setProviderKey`，没有测试接口。
    - 连接测试的"上次：… · 2 分钟前"：测试结果不持久化，只显示本次打开页面后的结果。
    - 系统提示词的"1,284 字"：可以从已读取的 `promptFile.content.length` 得到，保留；读取失败时不显示。
  - 主题切换的视觉缩略图以外的新外观能力。

## 背景

- 必读文档：
  - `AGENTS.md`、`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`（颜色只能用语义 token，浅/深都要验）
  - `docs/design-docs/frontend/front-全局视觉语言规范.md`
  - `docs/design-docs/frontend/front-设置中心重构规范.md`（信息架构来源，本计划会更新其中的导航与工具页章节）
  - `docs/coding-standards/team/frontend-style-scope-conventions.md`
- 代码路径（均在 `apps/desktop/src/renderer/` 下）：
  - `components/settings/SettingsPrimitives.tsx`：分组、行、`Toggle`、`SettingsSelect`、`MultiSelect`、`Stepper`、`NumberField`、`TextField`。
  - `components/settings/SettingsNav.tsx`：`SettingsSectionId`、`SETTINGS_GROUPS`。
  - `components/settings/SettingsPage.tsx`（约 2200 行）：页面壳、`SettingsContent` 路由、`GeneralSection`、`AgentInstructionsSection`、`TaskModelDefaultsSection`、`MediaDefaultsSection`、`ImageInspectionSettingsRows`、`ToolsSection`、`SEARCH_PROVIDER_ROWS`、`SearchProviderRow`、`TavilyUsageRow`、`SubagentSection`、`ArchivedChatsSection`、`AppearanceSection`、`ThemeSegmented`、`LocalUpdateSection`、`ProviderKeyModal`、`BTN_*` 常量。
  - `components/settings/SpeechSettingsSection.tsx`、`ShortcutSettings.tsx`、`ModelPurposeSelect.tsx`
  - `components/settings/ProviderSettings.tsx`（`ConnectionRow`、`ProviderDetailRoute`、`CustomConnectionDetail`、`DetailSection`、`DetailRow`、`ProviderBalanceRow`、`StatusBadge`、`RouteBack`）、`ModelSettings.tsx`（`ModelRow`）、`CustomConnectionModels.tsx`
  - `components/UsageStatisticsPage.tsx`
  - `components/WorkbenchLayout.tsx`：持有 `settingsSection` 状态，只用到 `"usage"`，新增 section 不需要改它。
  - 测试：`test/settings-page.test.tsx`、`test/settings-color-semantics.test.tsx`、`test/provider-model-settings.test.tsx`、`test/usage-statistics*.test.tsx`（执行前用 `ls test | grep -i usage` 确认实际文件名）、`test/english-learning.test.tsx`。
  - 视觉 fixture：`test/fixtures/model-settings-preview.*`、`test/fixtures/usage-preview.*`。
- 已知约束：
  - 工作区有审批卡重设计的未提交改动（`components/messages/*`、`ApprovalParts.tsx` 等），与本计划不重叠；不要动那些文件。
  - `SettingsSelect` 已用 portal 渲染菜单，内嵌分组的 `overflow-hidden` 不会裁切它；原生 `<select>` 需要替换。
  - 没有现成的 Toast 组件，保存提示需要新建（只在设置壳内使用）。

## 设计契约

### 页面与分组

| 项 | 值 |
|---|---|
| 内容列宽 | 普通页 `max-w-[640px]`（`PageShell` 外层 `max-w-[736px] px-12`）；使用统计 `max-w-[832px]` |
| 页面标题 | `h2` 20px semibold；说明 13px `text-text-muted` |
| 分组间距 | 36px（`mt-9`） |
| 分组标题 | `h3` 13px semibold `text-text-main`；说明 12px `text-text-muted`；可选右侧 meta（12px `text-text-faint`，如"6 / 6 已启用"）或动作按钮 |
| 分组容器 | `rounded-[10px] border border-line bg-surface overflow-hidden`；行之间 `divide-y divide-line/60` |
| 行 | `min-h-[52px] px-4 py-2.5`；紧凑行 `min-h-[44px] py-2`；标题 13px medium；说明 12px `text-text-muted`；机器值（路径、ID）说明用 mono 11.5px `text-text-faint` 并允许断行 |
| 从属行 | 左内边距 36px（`pl-9`）；父开关关闭时整行 `opacity-45` 且控件 disabled |
| 小节标题行 | 11px medium `text-text-faint`，`bg-surface-subtle`，如「搜索通道」「执行工具」「敏感能力」 |
| 导航 | 宽 216px；分组标题 11px medium `text-text-faint`，不再大写、不加字间距；项高 30px、13px；选中 `bg-selected font-medium` |

### 控件

| 控件 | 规格 |
|---|---|
| 按钮 | 高 28px、12.5px medium、圆角 7px。`primary`（`bg-action`，每页最多一个）、`secondary`（描边）、`quiet`（无底，hover 出底）、`danger`（描边，文字 `text-on-danger`）、`icon`（28×28） |
| 下拉 | 统一用 `SettingsSelect`，高 30px、默认最小宽 216px、`size="sm"` 为 140px；设置页内不再出现原生 `<select>` |
| 输入框 | 高 30px、圆角 7px；数字右对齐 `tabular-nums`；宽度三档 `w-[120px]` / `w-[220px]` / `w-full` |
| 开关 | 32×18，滑块 14px；开 `bg-operational`、关 `bg-toggle-off`（新增 token，见下） |
| 步进器 | 沿用 `Stepper`，高度改为 30px |
| 状态 | `StatusDot`：`ok`（绿点 + 文字）、`off`（空心圈 + 文字）、`warn`（琥珀点 + 琥珀文字）。不再使用绿色胶囊徽标 |
| 行内提醒 | 说明位置显示琥珀色 `CircleAlert` 图标 + 文字，可带一个跳转链接（如"去连接"） |
| 标签 | 18px 高、4px 圆角、11px，中性描边；`warn` 变体用 `bg-warning-soft text-warning` |
| 快捷键 | 每个键一个 `kbd`（24px 高，底边 2px） |

新增 token：只加一个 `--act-color-toggle-off`（浅色 `#d3d3ce`，深色 `#4a4b45`），并在 Tailwind 配置里映射为 `bg-toggle-off`。原因：`line-strong` 太深（浅色 `#8c8c85`），关着的开关比开着的还显眼。其余颜色全部复用现有 token。

### 保存方式

| 设置类型 | 交互 |
|---|---|
| 开关、下拉、步进器 | 改完立即保存，成功后显示底部"已保存"提示（1.4 秒） |
| 温度、最大输出 Token、音色 | 失焦或回车时保存；不合法时在该行说明位置显示红字错误，不保存，保留输入 |
| 显示名称、回复风格、系统提示词 | 点整行展开行内编辑器，显式「保存 / 取消」；同一时间只展开一个；Esc 取消 |
| API Key（搜索通道、MiniMax） | 点「连接 / 设置 Key」在该行下方展开密码输入框，显式保存；已连接后显示「管理」菜单（更换 Key / 断开连接） |
| 删除连接 | 保持现有二次确认对话框 |

保存失败一律在出错的那一行显示错误，不弹提示；成功只用底部提示，不在行内写"已保存"。

## 风险

- 风险：`SettingsPage.tsx` 很大，逐段替换时容易改坏业务状态。
  - 缓解：只替换 JSX 结构和 className，状态、IPC 调用、回调不动；每个任务完成后跑对应测试。
- 风险：大量测试依赖旧文案和按钮名（如"保存生成参数"、"断开连接"、"编辑显示名称"、"自动审查"）。
  - 缓解：每个任务列出要改的测试断言；保留 `aria-label` 的地方尽量沿用旧名，减少测试改动。
- 风险："立即保存"让温度和 Token 输入每次失焦都触发写入，revision 冲突概率上升。
  - 缓解：值没变不提交；冲突时沿用 `handleUpdateNamespace` 现有的 `latest` 回填并在行内提示重试。
- 风险：统一宽度到 640px 后，模型页的长 Endpoint 和模型 ID 被挤压。
  - 缓解：机器值用 mono 并允许断行；连接详情里的 Endpoint 值 `max-w-[240px] truncate` 并用 `title` 显示完整值。
- 风险：内嵌分组的 `overflow-hidden` 裁切原生弹出物。
  - 缓解：设置页内原生 `<select>` 全部换成 portal 的 `SettingsSelect`；`Tooltip` 本身是 portal。

## 任务

执行顺序：T0 → T1 → T2 → T3～T8（彼此独立，按编号推进）→ T9 → T10。

### T0 基线与执行文档

- 创建 `docs/exec-runs/20260925-settings-visual-redesign/execution-process.md` 和 `execution-summary.md`（从 `docs/exec-runs/templates/` 复制）。
- 跑基线并把结果写进执行过程：
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/settings-page.test.tsx src/renderer/test/settings-color-semantics.test.tsx src/renderer/test/provider-model-settings.test.tsx src/renderer/test/english-learning.test.tsx` 以及 usage 相关测试。
  - 记录当前失败数；本计划结束时不能多于基线。
- 新建视觉 fixture `test/fixtures/settings-preview.html` + `settings-preview.tsx`：用固定样例数据渲染整个 `SettingsPage`，支持 `?section=…&theme=light|dark`。写法参照本次调研时的临时 fixture（mock 了 `getSettings`、`getSettingsV4`、`listProviders`、`listUsableModels` 等，其余方法用 Proxy 兜底返回空结果）。这个 fixture 保留在仓库，供后续视觉回归使用。

### T1 基础部件（`SettingsPrimitives.tsx`）

- `PageShell`：把 `maxWidth?: "720" | "880"` 改为 `width?: "default" | "wide"`，对应上面的列宽；标题 20px；子元素间距改为 `gap-9`。
- `SettingGroup`：改为上面的分组契约；新增 `meta?: ReactNode`、`action?: ReactNode`；`headingLevel` 默认改为 3（页面内分组就是 h3）。去掉只有标题没有容器的 `SectionShell` 用法，`SectionShell` 删除或只留给模型页连接详情内部的 h4 小节。
- `SettingRow`：新增 `indent?: boolean`、`disabled?: boolean`、`tight?: boolean`、`monoDescription?: boolean`；尺寸改为上面的行契约。
- 新增：
  - `SettingLinkRow`：整行可点（`button` 语义，支持 Enter / Space），右侧值 + `ChevronRight`；用于"显示名称"、"Explore 模型"、"图片生成"、连接列表、高级设置展开。展开型传 `expanded`，箭头旋转 90°。
  - `SettingEditor`：行下方的编辑区（`bg-surface-subtle`），底部左侧提示、右侧「取消 / 保存」。
  - `useSingleEditor()`：在一个页面内保证只展开一个编辑器，返回 `{ openId, open, close }`；Esc 关闭。
  - `SettingSubhead`、`StatusDot`、`InlineWarning`、`SettingTag`、`Kbd`。
  - `SettingsButton`（`variant`、`size="icon"`、`busy`）：替代 `SettingsPage.tsx` 顶部的 `BTN_PRIMARY / BTN_SECONDARY / BTN_DANGER / BTN_QUIET` 常量和 `SpeechSettingsSection` 里的 `button` 常量。
  - `SettingsInput`：统一的文本 / 数字 / 密码输入框，`width` 三档。
- `Toggle`：改为 32×18；关闭色 `bg-toggle-off`；滑块保持白色（`bg-white` 在两套主题下都是滑块本色，已有 `settings-color-semantics` 覆盖，保持不变）。
- `SettingsSelect`、`MultiSelect`：高度 30px、圆角 7px；新增 `size?: "default" | "sm"`。
- `Stepper`：高度 30px；`defaultValue` 重置按钮保留。
- 保存提示：新增 `SettingsSaveNotice` 上下文（provider 放在 `SettingsPage` 壳里），暴露 `notifySaved(text = "已保存")`；渲染一个 `role="status"` 的底部居中提示，`prefers-reduced-motion` 下不做位移动画。
- token：`styles/tokens.css` 增加 `--act-color-toggle-off`（浅/深两套），在 Tailwind 主题映射里加 `toggle-off`。
- 测试：新增 `test/settings-primitives.test.tsx`，覆盖：
  - `SettingLinkRow` 键盘 Enter / Space 触发。
  - `useSingleEditor` 打开第二个时第一个关闭、Esc 关闭。
  - `SettingRow disabled` 时控件不可点。
  - `SettingsSaveNotice` 调用后出现 `role="status"` 且文字为"已保存"。

### T2 导航与页面壳（`SettingsNav.tsx`、`SettingsPage.tsx`）

- `SettingsSectionId` 增加 `"search"`；`SETTINGS_GROUPS` 的「能力」改为 模型、搜索（`Search` 图标）、工具、子 Agent；「通用」图标换成 `SlidersHorizontal`，「模型」换成 `Cpu`（与 demo 一致）。
- 导航样式按契约调整；返回按钮文案改为"返回应用"，`aria-label` 保持"返回应用"。
- `SettingsContent`：新增 `case "search"`；`PageShell` 调用全部改为新的 `width`；模型页不再用宽列。
- 窄窗口（`max-[820px]`）保持横向导航，分组标题隐藏，返回按钮不换行。
- 测试：`settings-page.test.tsx` 默认页用例增加断言 `getByRole("button", { name: "搜索" })`；新增用例：点「搜索」后出现 `h2` "搜索"。

### T3 通用页

对应 demo「通用」。分组顺序：个人偏好、Agent 指令、模型与生成、媒体、语音播放、快捷键。

- 个人偏好（`GeneralSection`）：显示名称、回复风格改为 `SettingLinkRow` + `SettingEditor`；行上不再放说明文字，值显示在右侧（空值显示"未设置"）。`aria-label` 沿用"编辑显示名称"、"编辑回复风格"、"保存显示名称"、"保存回复风格"。
- Agent 指令（`AgentInstructionsSection`）：一行 `SettingLinkRow`，说明为 mono 路径，右侧显示字数；展开后是现有的 mono textarea 编辑器，底部提示"保存后从下一次请求生效 · 当前 / 20,000"，按钮「取消 / 保存」。"撤销更改"并入"取消"（取消即恢复文件内容并收起）。
- 模型与生成（`TaskModelDefaultsSection`，标题改名）：
  - 默认会话模型、轻量任务模型：`ModelPurposeSelect` 内部改用 `SettingsSelect`。
  - Explore 模型：从本组移除，改为一行 `SettingLinkRow`（值为当前 Explore 模型名或"跟随会话模型"），点击切到「子 Agent」页。需要给 `SettingsContent` 传一个 `onNavigate(section)`。
  - 温度、最大输出 Token：`SettingsInput` 数字框，失焦保存，校验范围沿用现有规则，错误显示在该行。
  - Chat 自动压缩阈值：改名"自动压缩阈值"，改用 `Stepper`（50–95，步长 5，单位 %），立即保存。
  - 删除底部"生成参数只影响新请求"行和"保存生成参数"按钮；"只影响之后的请求"写进分组说明。
- 媒体（`MediaDefaultsSection`，标题"媒体默认"改为"媒体"）：
  - 图片生成：`SettingLinkRow`，说明为"模型 · 域名"，右侧 `StatusDot`；点击打开现有 `ImageGenerationSettingsDialog`。去掉图标方块和"API Key 已安全保存在本机"小字。
  - 图片分析模型：普通 `SettingRow` + `SettingsSelect`；缺 Key 时说明位置显示 `InlineWarning`「缺少 {服务商} Key，调用会失败。」加"去连接"（切到模型页）。去掉图标方块和 mono 模型 ID 行。
  - 图片分析调用 Key：原生 `<select>` 换成 `SettingsSelect`，禁用项在选项里标"（不可用）"并不可选。
- 语音播放（`SpeechSettingsSection`）：
  - 行顺序：MiniMax API Key、语音模型、音色、语速；去掉"语音服务 MiniMax"行（写进分组说明）。
  - API Key：右侧 `StatusDot` + 「设置 Key / 管理」，展开密码输入；管理菜单包含更换和清除。
  - 语音模型：`SettingsSelect`，立即保存；语速：`Stepper`（0.5–2.0，步长 0.1，显示 `1.0×`），立即保存；音色：输入框失焦保存，右侧 `icon` 按钮试听，播放中变为停止。
  - 删除分组下方的 5 个按钮和状态段落；播放状态和错误显示在音色行的说明位置。
  - `id="speech-settings"` 和"从扩展页跳转后滚动到语音分组"的行为保持。
- 快捷键（`ShortcutSettings`）：快速唤起开关为父行，快捷键和打开目标为从属行（关闭时变灰）；快捷键值用 `Kbd` 拆键显示，"录制"为 `quiet` 按钮；去掉图标方块。
- 测试：更新 `settings-page.test.tsx` 中生成参数用例（不再点"保存生成参数"，改为输入后失焦，断言 `updateSettingsV4` 收到 `taskDefaults`）；个人偏好用例改为点击整行展开；新增"温度填 3 后失焦显示范围错误且不提交"。更新 `english-learning.test.tsx` 中语音按钮相关断言。

### T4 外观页（`AppearanceSection`）

- 主题：三张缩略图单选（浅色 / 深色 / 跟随系统），`role="radiogroup"`，选中为 2px `text-text-main` 外框；缩略图用固定的主题预览色块。**例外说明**：缩略图的任务是展示另一个主题的样子，不能随当前主题翻转，因此在组件内用局部 CSS 变量定义这 6 个预览色，并在 `scripts/check-frontend-theme-colors.mjs` 的允许列表里登记这个文件的这一段；若脚本不支持局部豁免，就把预览色作为 `--act-preview-*` token 写进 `tokens.css`，浅深两套取相同值。
- 字体与字号合成一组：界面字体、界面字号、代码字体、代码字号，最后一行是预览（一句正文 + 一行代码，随字号实时变化）。
- 测试：`settings-page.test.tsx` 外观用例把 `ThemeSegmented` 的按钮查询改为 `getByRole("radio", { name: "深色" })`。

### T5 模型页（`ProviderSettings.tsx`、`ModelSettings.tsx`、`CustomConnectionModels.tsx`）

- 连接列表：分组标题"连接"，右侧「添加连接」`primary` 按钮；每个连接是 `SettingLinkRow`：左侧保留 `ProviderLogo`（真实 logo），说明为"官方 API · 已启用/已安装 个模型启用 · 默认 模型名"，右侧 `StatusDot`（已连接 / 缺少 Key / 连接失败）。`StatusBadge` 改为调用 `StatusDot`。
- 连接详情（`ProviderDetailRoute`、`CustomConnectionDetail`）：
  - 顶部是 `RouteBack`（"‹ 模型"）+ 大 logo + `h3` 名称 + 状态。
  - 「连接」组：API Key（mono 掩码值 + 「更换」）、Endpoint（mono，可编辑时带「编辑」）、连接测试（说明位置显示本次测试结果，按钮"测试连接"，测试中显示 loading）、余额（有数据时显示）。
  - 「模型」组：分组右侧「更新目录」`quiet` +「添加模型」`secondary`；每个模型一行：名称 + 默认 `SettingTag`，说明为 mono 的"ID · 上下文 · 能力"，右侧非默认模型有「设为默认」`quiet`，最右是启用开关。
  - 「高级请求设置」：一行 `SettingLinkRow`（展开型），展开后是代理、Request Headers、Request Body Overlay 三个从属行。
  - 「危险操作」组：删除连接行 + `danger` 按钮，继续打开 `RemoveProviderDialog`。
  - `DetailSection`、`DetailRow`、`ProviderBalanceRow` 改用新部件或删除。
- 测试：`provider-model-settings.test.tsx` 中查找"已连接"徽标的断言改为查找 `StatusDot` 文本；其余交互（连接、测试、删除、设为默认、启用开关）保持现有 `aria-label`。

### T6 搜索页（新增）

- 新组件 `components/settings/SearchSettings.tsx`（从 `SettingsPage.tsx` 移出 `SEARCH_PROVIDER_ROWS`、`SearchProviderRow`、`TavilyUsageRow`）。
- 结构：
  - 第一组只有一行「允许联网搜索」开关，对应 `disabledTools` 中的 `web_search`（沿用 `toggleTool` 逻辑，需要把 `toggleTool` 提到 `SettingsPage.tsx` 顶层的一个小 hook `useToolToggle(settings, settingsV4, onUpdate, onUpdateNamespace)`，工具页和搜索页共用）。
  - 「搜索通道」组：说明"国内内容优先使用智谱；国际内容按 Tavily → TinyFish → Exa 的顺序使用第一个已连接的通道。"，右侧 meta"n / 4 已连接"。每个通道一行，**不显示 logo**；名称后带 `SettingTag`（国际 1 / 2 / 3，智谱不带）；说明为费用短句；右侧未连接为「连接」`secondary`，已连接为 `StatusDot ok` +「管理」`quiet`（菜单：更换 Key、断开连接）。关闭「允许联网搜索」时通道行**不变灰、不禁用**：连接和断开 Key 不依赖这个开关，demo 里的变灰不实现。
  - 点「连接」在行下展开 `SettingEditor`（密码输入 + 保存），保存调用现有 `onSaveKey`（即 `setProviderKey`），失败在编辑器内显示错误并保留输入；成功收起并 `notifySaved("已连接")`。不再为搜索通道打开 `ProviderKeyModal`。
  - Tavily 已连接时，把 `TavilyUsageRow` 的内容放到 Tavily 行的说明里（"本周期已用 x / y credits"），不再单独占一行。
- `ToolsSection` 删除「联网」分组。
- 测试：新增 `test/search-settings.test.tsx`：
  - 渲染 4 个通道，已连接数 meta 正确。
  - 点「连接 Tavily」展开输入，保存后调用 `setProviderKey({ provider: "tavily", apiKey })`。
  - `setProviderKey` 返回 `{ ok: false, error }` 时错误可见、输入保留。
  - 关闭「允许联网搜索」提交 `disabledTools` 包含 `web_search`。
  - `settings-page.test.tsx` 中原先在工具页查找搜索通道的用例迁到这里。

### T7 工具页（`ToolsSection`）

- 分组：代码库（右侧 meta "n / 6 已启用"，行用 `tight`）、终端、浏览器、多媒体、显示。
- 终端：Bash 终端为父行；原"自动审查"改名"执行前确认"，作为从属行，Bash 关闭时 disabled。`aria-label` 同步改为"执行前确认"。
- 浏览器：浏览器工具为父行；"高级设置"为展开型 `SettingLinkRow` 从属行，展开后是 `SettingSubhead`「执行工具」「敏感能力」和各工具从属行（`tight`）；敏感能力名称后带 `warn` 标签"敏感"。
- 多媒体：图片生成、图片分析；工具不可用时（`tool.conditional` 且对应服务未配置）说明位置显示 `InlineWarning`，文案沿用"是否可用取决于当前供应商配置"的判断来源，不新增判断逻辑。
- 显示：从代码库组移出"显示写入变动"。
- 页面说明加一句"联网搜索在「搜索」中管理。"
- 测试：`settings-page.test.tsx` 中"自动审查"相关用例改为"执行前确认"，并新增"关闭 Bash 终端后执行前确认开关 disabled"。

### T8 子 Agent、归档会话、更新

- 子 Agent（`SubagentSection`）：分组标题"Explore"，说明"只读代码探索：读取、搜索、列目录；不写文件，不执行命令。"；一行「模型」，`SettingsSelect`，选项为"跟随会话模型" + `listUsableModels({ purpose: "explore" })`，调用现有 `updateTaskModels({ exploreModel })`。删除"绑定模型 ModelKey"说明行和"前往通用"提示。**不做**启用开关和思考级别（原因见"不包含"）。
- 归档会话：列表放进内嵌分组；每行标题 + 说明（时间 · 次数 · 工作区），右侧「恢复」`secondary`；空状态、错误状态沿用。
- 更新：只把按钮、行、分组换成新部件，流程和进度对话框不动。
- 测试：`settings-page.test.tsx` 子 Agent 用例改为断言模型下拉存在并调用 `updateTaskModels`。

### T9 使用统计微调（`UsageStatisticsPage.tsx`）

- `PageShell width="wide"`；说明改为"模型调用、Token 用量与估算费用。"
- 时间范围：四个按钮改为分段选择器（与外观页主题切换同一视觉：`bg-surface-subtle` 外框、选中项 `bg-surface` + 轻阴影），`role="tablist"` 与现有 `aria-selected` 语义保持。
- 指标卡 `Metric`：`bg-surface border border-line rounded-[10px]`；标签 12px `text-text-muted`；小字 11px；缺少费用依据时小字改为琥珀色点 + 文字。
- 分类标签文案：「服务商统计 / 模型统计 / 工具统计」改为「服务商 / 模型 / 工具」。
- 筛选栏：搜索框前加 `Search` 图标；状态筛选改用 `SettingsSelect size="sm"`；"详细记录"改名"显示明细"并靠右；删除"共 N 条记录"（分页已显示）。
- 表格：删除表格上方的 `mt-6`；表头 `bg-surface-subtle`；行高 38px；行分隔 `divide-line/60`；模型名 mono 12px；工具行的 Token、费用用 `text-text-subtle` 的"—"；费用未知显示"未知"；列名"延迟"改为"耗时"；状态列改为 `StatusDot`（成功为中性灰点，失败为红点 + `text-on-danger`）。
- 聚合表（服务商 / 模型 / 工具）应用同样的表头和行样式。
- 测试：更新 usage 测试中"服务商统计"、"详细记录"、"延迟"、"共 N 条记录"等文案断言；`test/fixtures/usage-preview.tsx` 视觉确认。

### T10 文档与收尾

- `docs/design-docs/frontend/front-设置中心重构规范.md`：
  - 4.1 导航树加「搜索」，4.2 页面归属表加"搜索：Agent 联网搜索用哪些服务？"。
  - 5.2 普通设置页规则：把"不使用白卡、边框、大圆角、阴影作为每组默认配方"改为"分组使用内嵌分组：白底 + 1px 边框 + 10px 圆角，无阴影"，并注明 2026-09-25 用户确认。
  - 6.1 通用：分组改名与 Explore 入口调整；6.5 工具：删除联网，新增 6.5.1 搜索；9.1 保存策略表按本计划"保存方式"更新。
- `docs/design-docs/frontend/front-全局视觉语言规范.md` 的 Settings 小节：把"内容分组使用 surface-subtle"改为内嵌分组描述。
- `docs/design-docs/frontend/front-主题与配色规范.md`：登记 `--act-color-toggle-off` 和主题缩略图预览色的例外。
- demo 文件顶部加注释：定稿方向为"内嵌分组 + 翡翠绿"，右下角调节面板仅用于对比。
- `docs/design-docs/frontend/README.md` 或 `docs/design-docs/index.md` 登记 demo。
- 写 `docs/histories/2026-09/<日期>-settings-visual-redesign.md`（按 `docs/HISTORY_GUIDE.md`）。
- 填写执行摘要，计划移到 `completed/`，更新 `docs/exec-plans/README.md`。

## 验证方式

- 命令（仓库根目录）：
  - `pnpm --filter @actspace/desktop typecheck`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/settings-primitives.test.tsx src/renderer/test/search-settings.test.tsx src/renderer/test/settings-page.test.tsx src/renderer/test/settings-color-semantics.test.tsx src/renderer/test/provider-model-settings.test.tsx src/renderer/test/english-learning.test.tsx` 加 usage 相关测试，预期全部通过，失败数不高于 T0 基线。
  - `pnpm --filter @actspace/desktop test`（全量 renderer 测试，确认没有波及其他页面）
  - `pnpm --filter @actspace/desktop build:renderer`
  - `pnpm check:frontend-theme`
- 视觉检查：用 T0 的 `settings-preview` fixture 和 `usage-preview` fixture，在 headless Chrome 对每一页截浅色、深色两张，外加 390px 宽的工具页一张；与 demo 同页截图并排对比，写进执行过程。
- 真实桌面：`pnpm dev:log` 启动 Electron，由用户检查：
  - 各页浅色 / 深色。
  - 在搜索页连接和断开一个通道。
  - 在通用页修改温度并重启应用后值仍在。
  - 从扩展页「语音配置」跳转后滚动到语音分组。

## 回退策略

- T1 的部件改动会影响所有页面。若 T1 之后某页出现严重问题，先在该页临时恢复旧 JSX（`git show HEAD:<file>` 取对应段落），部件保持新版本。
- T6 搜索页独立成文件；若需要回退，恢复 `ToolsSection` 中的「联网」分组，并从 `SETTINGS_GROUPS` 移除 `search` 即可，数据层无改动。
- 新增 token 只有一个，回退时 `Toggle` 改回 `bg-line-strong`。

## 进度记录

- [x] T0 基线、执行文档、设置页视觉 fixture
- [x] T1 基础部件
- [x] T2 导航与页面壳
- [x] T3 通用页
- [x] T4 外观页
- [x] T5 模型页
- [x] T6 搜索页
- [x] T7 工具页
- [x] T8 子 Agent、归档会话、更新
- [x] T9 使用统计微调
- [x] T10 文档与收尾

## 决策记录

- 2026-09-25：用户确认分组用内嵌分组、开关用翡翠绿、新增「搜索」导航、使用统计只微调、搜索通道不显示 logo。
- 2026-09-25：demo 中子 Agent 的「启用」「思考级别」、搜索 Key 保存前测试、连接测试"上次"时间不实现，因为没有对应数据或接口；只在数据层补齐后另立计划。
- 2026-09-25：关闭联网搜索时搜索通道行不变灰。Key 的连接与断开不依赖工具开关，变灰会误导用户以为不能操作。
- 2026-09-25：搜索通道改为行内展开输入 Key，不再使用 `ProviderKeyModal`；模型页连接配置仍走现有子页流程，不改。
- 2026-09-25：只新增 `toggle-off` 一个颜色 token。现有 `line-strong` 作为关闭色太深。

- 2026-09-25（执行中）：连接详情保留可搜索多选管理模型，不改为 demo 的逐模型开关行；原因是模型设置规范与 34 个测试依赖现有交互。
- 2026-09-25（执行中）：外观缩略图预览色改为 `--act-preview-*` token，只在 `:root` 定义一次，避免在组件里写 hex。

## 执行模式

- **交互模式**：用户在线，按任务顺序推进；T3、T5、T6 完成后各截图给用户看一次。

## 执行文档

`docs/exec-runs/20260925-settings-visual-redesign/execution-process.md` 与 `execution-summary.md`。
