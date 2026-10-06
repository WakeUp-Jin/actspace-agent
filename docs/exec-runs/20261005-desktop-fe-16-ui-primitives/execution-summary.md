# 16 UI 原语与组件拆分 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-16-ui-primitives/execution-process.md`
- **现行规范**：`docs/design-docs/frontend/front-基础组件封装规范.md`「弹层原语」「按钮收口与检查」「大组件拆分的目录约定」
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T18 全部完成，另有计划外的 T16b 和一个收尾验收修复提交。
  - 中途登记了一个待确认事项（`pauses.md` P2，ResponseAnnotationPill 保留 HoverCard），按建议 A 先执行，没有阻塞。
  - 界面大体不变。可感知的变化：
    - 弹层、菜单、对话框的键盘行为统一：Esc 只关最上层，关闭后焦点回到触发器；
    - 设置页的下拉换成统一的 Select（不再是系统原生下拉）；
    - 切换会话时，附件跟着各自的会话草稿走，不再串到别的会话；
    - T17 有三处按钮外观统一后的小变化，需要你确认（见「需要你确认」）。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 原语（T1–T3） | `R/components/ui/` 下 Dialog、ConfirmDialog、Popover、Menu、ContextMenu、Select、OpenerCapture、menu-styles、cn | 基于 Radix。Esc 在原语里 `stopPropagation`，只关最上层；没有 Trigger 的弹层由 `OpenerCapture` 还焦点；遮罩和浮层 `no-drag` |
| 对话框迁移（T4–T6） | Git 提交、Review、Mermaid 预览、OpenRouter 目录、工作区对话框、设置页三个对话框（拆到 `settings/dialogs/`） | 删除 `settings/ConfirmDialog` 和 `useDialogFocusTrap` |
| 浮层与菜单迁移（T7–T10、T16b） | ContextPopup、批注评论浮层、选区菜单、Review 范围 / 跳转、MessageQueue、侧栏右键菜单、消息操作菜单、设置页下拉、TurnActions ⋯、权限模式、会话状态说明 | 业务组件里不再 `createPortal`、不再为关浮层监听 Escape / document mousedown（规范里列了还允许的几处） |
| 拆分（T11–T13、T15） | SettingsPage 2074 → 221 行，Sidebar 1287 → 245，ConversationView 1218 → 374，WorkbenchLayout 746 → 378 | 拆到 `settings/sections/`、`settings/dialogs/`、`sidebar/`、`conversation/`、`workbench/`；纯函数和 `use-*` hook 有单测 |
| Composer 只挂一次（T14） | Composer、`SessionLocalStore` | 不用 `key={draftKey}` 重挂；附件按会话存进 store，切换会话时恢复，预览 URL 按引用释放 |
| 检查脚本（T16） | `scripts/check-frontend-design-tokens.mjs`、`scripts/native-button-baseline.json` | 原生 `<button>` 按文件计数基线（230 个 / 66 个文件，只许减）；`createPortal` 和 `role="dialog"` 只许在 `ui/`；脚本单测 10 → 15 条 |
| 按钮收口（T17） | ConversationView、SettingsPrimitives、SubagentsPanel 等 | 234 → 230；保留原生的按类说明原因 |
| 文档（T18） | 基础组件规范三节、05 §7「实施后的更正」9 条、06、07、README、技术债、foundation 计划 | — |
| 复核修复 | `ui/Select.tsx`、`Composer.tsx` | Select 内按 Esc 不再冒泡到外层表单；换会话时收起 Composer 的菜单和上下文用量浮层 |
| 收尾验收修复 | `sidebar/SessionRow.tsx` | 重命名用 Enter / Esc 结束后焦点回到标题；状态说明、右键菜单、重命名期间不接受行提示的「打开」，浮层关掉后提示不再自己冒出来 |

## 偏差

- **T7**：ResponseAnnotationPill 保留 Radix HoverCard（悬停预览），没改 Popover。`pauses.md` P2，待你确认，按建议 A 执行。
- **T14**：没有用 05 / 06 写的 `key={draftKey}`，改为 Composer 单次挂载 + 附件存进 store。按 key 重挂会在发出第一条消息、新建页变成会话时丢掉输入框焦点，05 §7 已更正。
- **T16b（计划外）**：T16 做 Esc 排查时发现 TurnActions ⋯、权限模式、会话状态说明三处仍是手写弹层，一并迁移。
- **T17**：计划写「视觉不变」，实际三处有变化（见下）。
- **按钮数口径**：05 写 289 个，按出现次数实际 239，16 开始时 234，结束 230。05 §7 已更正。
- **验收发现的修复**：两处 SessionRow 的问题在 Electron 验收时发现，单独提交（`8b6bf867`）。

## 需要你确认

1. **`pauses.md` P2**：ResponseAnnotationPill 保留 HoverCard（建议 A），还是改 Popover（B：手写悬停计时；C：只点击打开）。
2. **T17 的三处外观变化**（不接受的话可以逐个改回原生按钮）：
   - 执行轨迹顶上的「停止」：原来 50×27、8px 圆角、透明底、常规字重；现在 44×26、6px 圆角、白底、中等字重，和审批行的小按钮一致。
   - 设置里数值调节（Stepper）的「重置」：悬停时多一层浅灰底色（原来只变字色）。
   - 子 Agent 详情页的「返回」：圆角 8 → 6px；图标默认变浅（`text-faint`），悬停变深；多了「返回」提示。

## 人工验证指引

### 必须验证

1. **弹层的键盘行为**（真实键盘，最好开 VoiceOver 走一遍）
   - 侧栏会话：聚焦标题，Shift+F10 打开右键菜单 → ↓ → Enter「重命名」→ 改名后 Enter，或直接 Esc。
   - 设置 → 图片生成设置：Tab 在对话框里循环，Esc 关闭。
   - 右侧面板文件的「打开方式」菜单、输入框下的权限模式菜单、消息的 ⋯ 菜单：Enter 打开、方向键移动、Esc 关闭。
   - 预期：Esc 一次只关一层；关闭后焦点回到打开它的按钮；重命名结束后焦点回到会话标题。
2. **切换会话时的草稿和附件**
   - 在会话 A 输入文字并加一张图片，切到 B 再切回 A。
   - 预期：A 的文字和图片都在；B 里看不到 A 的附件。
   - 新建页输入后发送第一条：输入框不闪、焦点留在输入框里。
   - 切到设置页再回来：草稿里的图片预览还在。
3. **设置页下拉**：默认会话模型、轻量任务模型、快速唤起打开目标等。
   - 预期：选中后立即生效；键盘可以上下选；窗口底部的下拉向上展开。

### 建议验证

- 窄窗口（480 宽）打开侧栏，右键会话 → 「复制」子菜单：左边会被裁掉一点（已知，记进技术债）。
- 拖动标题栏附近的弹层遮罩：点击不应变成拖窗口。

## Agent 已完成的验证

- typecheck：desktop 0 错误。
- 测试：desktop 文件 182 通过 / 1 跳过，用例 1402 / 2 跳过，没有失败。比 16 开始时（170 / 1284）多 12 个文件、118 个用例。
- 脚本检查：`check:frontend-tokens`、`test:frontend-tokens`（15）、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。
- 变异验证：每个 T 的关键判断都做了变异，存活的都写明了原因（等价变异，或 jsdom 测不出、留给 CDP 验收的）。留给 CDP 的两组（重命名后焦点、点状态点按钮本身不算外面）已在 Electron 里实测通过。
- 浏览器 mock（vite + 无头 Chrome）：T14 附件前后对比、T17 视觉前后对比，截图在 `screenshots/`。
- Electron（临时数据目录，CDP 真实键盘 / 鼠标 / 触摸输入）：侧栏右键菜单、图片生成对话框、打开方式菜单、会话状态说明、权限菜单、消息 ⋯ 菜单、设置页 Select；480px 窄窗下各弹层的位置。发现并修复了两处 SessionRow 的问题。详见执行过程「收尾验收」。
- Sonnet 只读复核：5 条发现。2 条属实且是 16 引入的，已修：设置下拉里按 Esc 会连表单一起退出（Select 没拦 Esc）；换会话时 Composer 开着的菜单和上下文用量浮层不收起。其余 3 条是 16 之前就有的或脚本的理论漏报，记进技术债。详见执行过程「复核处理」。

## 已知风险和遗留事项

- **窄窗子菜单**：480 宽时侧栏右键菜单的「复制」子菜单左边约 52px 出界。16 之前的手写子菜单在这个宽度下出界更多，不是回归。已记技术债。
- **Composer 跨会话状态**（16 之前两个有消息的会话之间就这样）：远端会话发送中切到别的会话，发送按钮也是禁用的，直到那边的请求结束；模型运行时选项会带过去。已记技术债，归 09。
- **16 之前就有、验收时发现的**：`ProviderKeyModal` 没有入口（`onConnectProvider` 没有调用方）；Composer「更多审查操作」⋯ 没有 `onClick`。已记技术债。
- **还没迁移的手写弹层**：RightPanel 标签溢出菜单、可视化回复的文件列表、设置页模型多选，以及 Composer 内的菜单（随 09）。已记技术债。
- 三个文件仍超过 500 行（RightPanel、SettingsPrimitives、WorkspaceChromeControls），Composer 2484 行归 09。
- composer 批注卡片的一个用例在全量满载时偶发超时，本计划期间没有再出现。

## 后续建议

- 进入 09（Composer）。Composer 内的模式 / 模型菜单、命令菜单改用 `ui/Menu`；`review-overflow-button` 的菜单内容一起定。
