# 16 UI 原语与组件拆分 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/16-UI原语与组件拆分执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-16`，从 `refactor/desktop-frontend@59e8e64b`（15 的 squash `856b776f` + 验收反馈第 1 轮 `7154f57d` + 记录提交）拉出
- **开始时间**：2026-10-06 13:40
- **结束时间**：2026-10-06

## 执行时间线

### T0：重新定位与基线

- 15 的 squash 提交和反馈第 1 轮已登记到 15 的交接和 00 §11，本计划没有需要补登的。
- **基线**：desktop 测试文件 170 / 0 / 1，用例 1284 / 0 / 2。composer 批注卡片的一个用例在全量负载下偶发超时，单跑稳定。
- 行号以下均为 2026-10-06 `59e8e64b` 上的位置。

**createPortal：9 个文件**，与计划一致（Sheet 已在 10 删除）。

MessageQueueTray、MermaidPreviewDialog、ResponseAnnotationCommentPopover、ResponseSelectionMenu、ReviewToolbar、settings/ConfirmDialog、SettingsPrimitives、Sidebar、WorkspaceChromeControls。

**role="dialog"**

| 文件 | 位置 | 说明 |
| --- | --- | --- |
| `settings/ConfirmDialog.tsx` | :44 | T2 / T6 |
| `settings/SettingsPage.tsx` | :634（ImageGenerationSettingsDialog，函数 :562）、:1273（LocalUpdateProgressDialog，:1247）、:2041（ProviderKeyModal，:1998） | T5 |
| `settings/OpenRouterModelCatalogDialog.tsx` | :70 | T4 |
| `ContextPopup.tsx` | :72 | T7 |
| `messages/MermaidPreviewDialog.tsx` | :172 | T4 |
| `messages/ResponseAnnotationCommentPopover.tsx` | :149 | T7 |
| `composer/ResponseAnnotationPill.tsx` | :91 | T7 |
| `workspace/WorkspaceChromeControls.tsx` | :288（环境浮层）、:619（对话框） | T7、T4 |
| `review/ReviewWorkspace.tsx` | :132（DialogShell） | T4 |

计划没有列的：`ShutdownOverlay.tsx:31` 的 `role="alertdialog"`。它是退出时的全屏遮罩（`z-(--act-z-system)`），没有可操作的控件，不需要焦点陷阱，也不能被 Esc 关闭。**不迁移**，T16 的 dialog 检查只匹配 `role="dialog"`，不受影响。

**useDialogFocusTrap**：3 处使用，与计划一致（ConfirmDialog :28、SettingsPage :582、OpenRouterModelCatalogDialog :31）。

**自己监听 Escape：25 个文件**（计划写 30，05 写 25；不含测试，含 Composer）。

| 文件 | 用途 | 处理 |
| --- | --- | --- |
| MessageQueueTray、MermaidPreviewDialog、ResponseAnnotationCommentPopover、ResponseSelectionMenu、ReviewToolbar、OpenInAppMenu、RightPanelObjectMenu、ConfirmDialog、OpenRouterModelCatalogDialog、SettingsPage、SettingsPrimitives、Sidebar、WorkspaceChromeControls | 关闭弹层、菜单、对话框 | 随 T4–T10 删除 |
| `ModelSettings.tsx:100` | 自绘下拉的关闭 | T10 换 Select 后删除 |
| `RightPanel.tsx:402` | 面板内菜单的关闭 | 见下文「计划没有列的」 |
| `WorkbenchLayout.tsx:319`（window 级）、:694 | :319 关闭窄窗下的右侧面板；:694 是 PermissionModeControl 的菜单 | :319 保留（面板不是弹层）；:694 随 T15 搬出时评估 |
| `ConversationView.tsx:564` | 退出 turn 导航之类的状态 | T13 时确认用途 |
| `SubAgentTranscriptModal.tsx:428` | 关闭子智能体记录面板（`role="region"`，不是对话框） | 保留，T18 的 Escape 清单中注明 |
| `ReplyHtmlRenderView.tsx:75` | 关闭面板内的 listbox | 见下文 |
| `AnthropicKeySetup`、`CustomConnectionWizard`、`CustomModelForm`、`ProviderSettings`（:425、:812） | 设置页内的表单流程，Esc 返回上一步 | 保留：是表单内行为，不是弹层 |
| `ShortcutSettings.tsx:162` | 录制快捷键时取消录制 | 保留：输入框内行为 |
| `Composer.tsx` | — | 09 |

**document 级 mousedown / pointerdown：16 个文件**，与计划一致。

Composer、MessageQueueTray、ConversationView、ResponseAnnotationCommentPopover、ResponseSelectionMenu、UserMessage、ReviewToolbar、OpenInAppMenu、ReplyHtmlRenderView、RightPanelObjectMenu、RightPanel、ModelSettings、SettingsPrimitives、Sidebar、WorkbenchLayout、WorkspaceChromeControls。

**计划没有列的弹层**（RightPanel、ReplyHtmlRenderView、UserMessage、ConversationView）：这 4 处在 05 §1.2 里也没有。范围的「包含」写的是「05 §1.2 列出的所有弹层」，所以本计划不强行迁移。迁完计划内的之后，在执行记录里逐条列出它们还剩的监听和用途；如果某处明显是菜单，又改动很小，顺手迁移并记录。

**原生 `<select>`**

| 文件 | 位置 | 处理 |
| --- | --- | --- |
| `settings/HostConnectionsSettings.tsx` | :43 | T10 |
| `settings/ModelSettings.tsx` | :115 | T10 |
| `settings/CustomModelReasoningFields.tsx` | 4 处 | T10 |
| `extensions/EnglishLearningCapability.tsx` | :71 | T10 |
| `Composer.tsx` | 3 处 | 09 |

**原生 `<button>`：256 行**（不含 `components/ui/`、测试、fixture；计划写 302）。15 和更早的计划删掉了一些。逐文件：

| 文件 | 数量 |
| --- | --- |
| Composer | 31 |
| Sidebar | 22 |
| workspace/WorkspaceChromeControls | 17 |
| settings/SettingsPrimitives、review/ReviewToolbar | 各 13 |
| ConversationView | 11 |
| TrajectoryView、review/ReviewDiffCanvas | 各 9 |
| UsageStatisticsPage、trajectory/TrajectoryDetails、RightPanel、review/ReviewScopeMenu | 各 7 |
| right-panel/RightPanelObjectMenu | 6 |
| WindowChromeBar、settings/SettingsPage | 各 5 |
| WorkbenchLayout、settings/ModelSettings、extensions/EnglishLearningCapability、ContextPopup | 各 4 |
| settings/ProviderSettings、OpenRouterModelCatalogDialog、custom-connection-shared，review/ReviewWorkspace、ReviewFileTree，messages/ToolLogLine、CompactCommandBlock | 各 3 |
| 其余 16 个文件 | 各 2 |
| 其余 18 个文件 | 各 1 |
| 合计 60 个文件 | 256 |

T16 生成基线文件时用脚本重新数，以脚本结果为准。

**ReviewToolbar:148 的 `AnchoredPopover`**

它承载 4 个面板，自带 pointerdown 和 Escape 监听：

| 面板 | 内容 | 迁移目标 |
| --- | --- | --- |
| options | 一组操作项 | `ui/Menu` |
| git | 一组 Git 操作 | `ui/Menu` |
| scope | `ReviewScopeMenu` 的内容（带分组和说明） | `ui/Popover` |
| jump | 搜索框 + 文件列表 | `ui/Popover`（内含输入框，不能用 Menu 的字母跳转） |

**样式 token**

- 存在：`--color-surface-raised`、`--shadow-act-popover`、`--radius-act-md`、`--motion-fast`、`--act-z-popover`、`--act-z-modal`、`--act-z-overlay`。
- **`line-subtle` 不存在**。现有弹层都用 `border-line`，原语沿用它，不新造 token。

**大组件当前行数**

| 文件 | 计划写的 | 现在 |
| --- | --- | --- |
| settings/SettingsPage | 2167 | 2074 |
| Sidebar | 1306 | 1287 |
| ConversationView | 1267 | 1218 |
| settings/SettingsPrimitives | 1069 | 1069 |
| RightPanel | 763 | 763 |
| workspace/WorkspaceChromeControls | 766 | 756 |
| WorkbenchLayout | 893 | 746 |
| Composer | — | 2462 |

其他位置：

- Sidebar：`groupSessionsByWorkspace` 在 :117；`resolveSessionStatus` :193、`resolvedSessionStatus` :764。第二份分组逻辑到 T12 再定位。
- ConversationView 挂载 Composer 两次：:1076、:1173。
- Composer：`attachments` 的 `useState` 在 :626；blob URL 创建 :449、释放 :455。

**依赖 document 级事件的测试**（迁移对应组件时同步改）

- `fireEvent` 打在 document 或外部元素上：
  - `response-selection-menu.test.tsx`：:120 `keyDown(document, Escape)`，:80、:147 `mouseDown` / `pointerDown`；
  - `response-annotation-markers.test.tsx`：:148 在输入框上 keyDown，:160、:171 在外部按钮上 `pointerDown`；
  - `provider-model-settings.test.tsx`：:1070、:1157 在对话框上 keyDown。
- `userEvent.keyboard("{Escape}")`（焦点在哪里就打在哪里，迁移后多半仍能工作，逐个确认）：
  - `sidebar` :640，`usage-hover-card` :30，`right-panel-review` :34，`workbench-responsive` :186，`settings-primitives` :45，`markdown-prose` :130，`provider-model-settings` :753、:758、:904，`message-queue-tray` :76。

### T1：依赖、polyfill、cn

- **版本**：5 个包都选和已有 `react-tooltip@1.2.16`、`react-hover-card@1.1.23` 同一批（2026-07-24）发布的版本：popover 1.1.23、dialog 1.1.23、select 2.3.7、dropdown-menu 2.1.24、context-menu 2.3.7。package.json 写 `^`，和已有两个包一致，实际版本由锁文件固定。
- **为什么不用最新版**：最新版（popover / dialog 1.2.0 等）2026-10-05 才发布，依赖新一版的 `react-dismissable-layer@1.1.20`、`react-popper@1.3.8`。装最新版会让 node_modules 里同时有两份 DismissableLayer。Radix 靠这个包里的模块级栈判断「最上层」，两份就是两个栈：Tooltip / HoverCard 和新原语之间按 Esc 会一起关。现在锁文件里 dismissable-layer、popper、portal、presence 各只有一份（1.1.19 / 1.3.7 / 1.1.17 / 1.1.10）。
- **安装方式**：先直接 `pnpm add`，按 `^` 解析到了最新版，还把 package.json 的依赖顺序整个重排了。回滚后手工把 5 行加进 package.json，再用 `pnpm install --config.resolution-mode=lowest-direct` 安装，新增的直接依赖取范围内的最低版本。
- **网络**：本机到 `registry.npmjs.org` 的连接超时（TLS 握手后无响应，连续 3 次）。这次安装加了 `--registry=https://registry.npmmirror.com/`，只用于这一条命令，没有改 `.npmrc`。锁文件不记录 tarball 地址（`grep npmmirror pnpm-lock.yaml` 为 0），integrity 是包本身的 sha512，与源无关。
- **polyfill**（`R/test/setup.ts`）：`PointerEvent`（继承 `MouseEvent`，带 `pointerId` / `pointerType`）、`hasPointerCapture`、`setPointerCapture`、`releasePointerCapture`。`scrollIntoView` 之前已经有了。都先探测再补，node 环境的 main 测试不受影响。
- **cn**：新增 `ui/cn.ts`；`Button.tsx` 的 `cx` 改为从 `cn.ts` 再导出（`IconButton`、`MessageQueueTray` 仍用 `cx`）；`Tooltip.tsx` 的本地 `cn` 删除。
- **验证**：typecheck 通过；全量 170 / 0 / 1 个文件，1284 / 0 / 2 个用例，与基线相同。

### T2：Dialog 与 ConfirmDialog

- **`ui/Dialog.tsx`**：导出 `Dialog`、`DialogTrigger`、`DialogClose`、`DialogContent`、`DialogTitle`、`DialogDescription`、`DialogHeader`、`DialogBody`、`DialogFooter`。
  - `size`：sm 420px、md 460px、lg 760px、full（`inset-4 sm:inset-8`）。宽度取自现有对话框，不新造。（T5 改为 lg 520px、xl 760px，见 T5。）
  - **外观两套**：现有对话框本来就有两种样子，迁移时各自保留，不统一。
    - `surface="float"`（默认）：`rounded-act-xl bg-surface shadow-act-float`。用于 ConfirmDialog、模型目录、图像生成、Git 操作、Mermaid。
    - `surface="raised"`：`rounded-act-lg bg-surface-raised shadow-act-popover`。用于 Review 的 DialogShell、本地更新、ProviderKeyModal。
  - `backdrop`：`scrim`（默认）或 `overlay`，同样按原样保留。`overlayClassName` 只放 `backdrop-blur` 这类不冲突的类。
  - 遮罩和定位层加 `[-webkit-app-region:no-drag]`。原来只有 WorkspaceChromeControls 的对话框加了；遮罩会盖住标题栏，没有它时 Electron 会把那一块的点击当成拖窗口。
  - `closeOnOutsideClick`：迁移前 ConfirmDialog、模型目录、图像生成点遮罩都不关闭，用这个开关保持原样。
  - `initialFocus` / `returnFocus`：对应原来 `useDialogFocusTrap(restoreFocusTo)` 的用法。
  - `withDescription`：Radix 默认把 `aria-describedby` 指向 Description，没有渲染 Description 时会打警告。默认不关联，渲染了再打开。
  - 没有新增进出场动效：现有对话框都没有，计划要求只换实现、不换外观。
- **发现 1：没有 Trigger 时关闭后焦点丢失。** Radix 模态 Dialog 的 `onCloseAutoFocus` 会 `preventDefault`，然后只聚焦 `DialogTrigger`。项目里的对话框基本都是 `{open ? <X /> : null}` 条件渲染、没有 Trigger，关闭后焦点落到 body。原来的 `useDialogFocusTrap` 会还给打开前的元素。
  - 处理：`DialogContent` 内放一个 `OpenerCapture`，在内容第一次渲染时记下 `document.activeElement` 作为兜底。
  - 不能放在 `onOpenAutoFocus` 里记：React 处理 `autoFocus` 在 commit 阶段，早于 FocusScope 的 effect。ConfirmDialog 的「取消」带 `autoFocus`，到 `onOpenAutoFocus` 时焦点已经在对话框里了。有一条用例专门覆盖。
- **发现 2：Esc 会穿过 portal 冒泡到外层。** React 的合成事件沿组件树冒泡，不管 DOM 在不在 portal 里。ProviderSettings 等外层 `onKeyDown` 收到 Esc 会「返回上一步」。原 ConfirmDialog 手动 `stopPropagation`。`DialogContent` 统一对 Esc `stopPropagation`。Radix 的 Esc 监听在 document 的捕获阶段，不受影响。
- **ConfirmDialog**：迁到 `ui/ConfirmDialog.tsx`，接口不变；`role="alertdialog"`；进行中 Esc 和遮罩都不能关闭。`settings/ConfirmDialog.tsx` 改为再导出，T6 删除。
- **测试**：`ui-dialog.test.tsx` 10 条。
  - Dialog：打开后聚焦第一个可聚焦元素，Tab / Shift+Tab 循环不出界，Esc 关闭后焦点回到触发器；`initialFocus` / `returnFocus`；条件渲染时焦点回到打开前的元素；两层嵌套时 Esc 只关上层；Esc 不冒泡到外层 `onKeyDown`；点遮罩关闭和 `closeOnOutsideClick={false}`；portal 到 body，size 和 surface 对应的类。
  - ConfirmDialog：默认焦点在取消；错误显示；进行中 Esc 不关闭；`autoFocus` 的情况下焦点仍回到打开者；点遮罩不关闭。
- **变异**：8 个全部杀死。去掉 Esc 的 stopPropagation、去掉打开者兜底、忽略 `closeOnOutsideClick`、忽略 `initialFocus`、忽略 `returnFocus`、总是清掉 describedby、ConfirmDialog 进行中可关闭、ConfirmDialog 点外关闭。
  - 第一轮「忽略 closeOnOutsideClick」存活：同时在 `onPointerDownOutside` 和 `onInteractOutside` 里拦截，其中一处是多余的。删掉前者后再测，被杀死。
- **验证**：typecheck 通过；全量 171 / 0 / 1 个文件，1294 / 0 / 2 个用例。

### T3：Popover、Menu、ContextMenu、Select

- **`ui/menu-styles.ts`**：Menu、ContextMenu、Select 共用的类。
- **`ui/Popover.tsx`**：`Popover`、`PopoverTrigger`、`PopoverAnchor`（可传 `virtualRef`）、`PopoverClose`、`PopoverContent`。
  - 现有浮层的圆角各不相同（md / lg / xl / 2xl），用 `radius` 选；内边距和宽度由调用方给。
- **`ui/Menu.tsx`**、**`ui/ContextMenu.tsx`**：计划列的 13 个导出，另加 `MenuGroup`。
  - `MenuItem` 带 `danger`。
  - ContextMenu 由 Menu 改名生成，Content 去掉 `sideOffset` / `align`（ContextMenu 在指针处打开，没有这两个参数）。
- **`ui/Select.tsx`**：`Select({ value, onValueChange, options, placeholder, disabled, ariaLabel, className, contentClassName })`，`SelectOption` 类型也在这里。
  - `position="popper"`，在触发器下方展开，和原来的 SettingsSelect 一致。
  - 触发器外观取自 SettingsSelect，打开状态改用 `data-[state=open]`。
  - **空串值**：Radix 不允许 Item 的 value 是空串，而设置里「跟随默认」常用空串，内部换成占位值再换回来。
  - 当前值不在选项里时显示 `placeholder`，没有就显示值本身，与 SettingsSelect 一致。
- **与计划不同的取舍**：
  - **菜单项高度用 32px（`min-h-8`），不是计划写的 28px。** 迁移前的菜单项绝大多数是 32px：Sidebar 右键、排队消息、OpenInApp 都是 `h-8` / `min-h-8`，SettingsSelect 是 `py-1.5` 加 `text-act-sm`。用 28px 会让所有菜单变矮，违反本计划「只换实现、不换外观」。面板沿用 `rounded-act-md` + `p-1`。
  - **层级统一用 `--act-z-popover`（200）。** 原来的内联菜单多用 `--act-z-dropdown`（80）。现在全部 portal 到 body，而对话框是 150，菜单出现在对话框里时必须比它高。
  - **Menu 和 ContextMenu 默认非模态（`modal={false}`）。** Radix 默认是模态的：点菜单外面只关菜单，那一下点击被吃掉。迁移前都是「关菜单，点击照常生效」，保持原样。Popover 本来就是非模态。
- **Esc 不冒泡**：Popover、Menu、SubContent、ContextMenu 的内容上都对 Esc 调 `stopPropagation`，理由同 T2。
- **发现**：给 `MenuContent` 传的 `aria-label` 不起作用。Radix 会给菜单加 `aria-labelledby` 指向触发器，可访问名称取触发器的文字。测试改为不按菜单名称查询。迁移业务组件时，原来按 `getByRole("menu", { name })` 查询的测试要相应调整。
- **测试**：`ui-menu-popover-select.test.tsx` 14 条。
  - Menu：↑↓、Home、End、跳过禁用项、Enter 执行、关闭后焦点回到触发器；→ 进子菜单、← 返回；字母跳转；Esc 关闭且不冒泡；CheckboxItem 可以不关菜单；点外面时点击照常落到下面的元素。
  - ContextMenu：右键打开、键盘选择；点外面时点击照常落到下面的元素。
  - Popover：虚拟 anchor（等待 `getBoundingClientRect` 被调用）；Esc 关闭、不冒泡、焦点回到触发器；Popover 里的 Menu 按 Esc 只关 Menu，再按一次才关 Popover。
  - Select：键盘打开、移动、选中并回调，焦点回到触发器，显示分组名；空串选项；未知值显示 placeholder；禁用时不能打开。
- **变异**：10 个全部杀死。Menu / ContextMenu 改成默认模态、Menu / Popover 去掉 Esc 的 stopPropagation、Select 去掉空串映射（两个方向）、去掉 placeholder、忽略 danger。
  - 第一轮「Popover 去掉 stopPropagation」和「ContextMenu 默认模态」存活，补了两条用例后被杀死。
- **验证**：typecheck 通过；全量 172 / 0 / 1 个文件，1308 / 0 / 2 个用例；`check:frontend-tokens` 通过。

### T4：四处对话框迁到 ui/Dialog

- **MermaidPreviewDialog**：删掉 `createPortal`、自写的焦点循环和 window 上的 keydown。`size="full"`、`backdrop="overlay"` 加 `backdrop-blur-[1px]`，打开后聚焦「关闭」（`initialFocus`）。缩放快捷键（`+` `=` `-` `_` `0`）改在 `DialogContent` 的 `onKeyDown` 里处理，焦点总在对话框里，效果不变。
- **OpenRouterModelCatalogDialog**：删掉 `useDialogFocusTrap`。`size="lg"`，点遮罩不关闭（迁移前就不关），标题改用 `DialogTitle`。
- **Review 的 DialogShell**（提交或推送、创建拉取请求）：`size="md"`、`surface="raised"`、`backdrop="overlay"`，标题改用 `DialogTitle`。
  - 关闭后焦点回到工具栏的「提交或推送」按钮。打开对话框的是弹层里的菜单项，菜单项随弹层一起卸载，打开前的焦点已经不在页面上，所以显式传 `returnFocus`。ReviewToolbar 改为从外面接收这个按钮的 ref。
- **WorkspaceChromeControls 的 Git 操作对话框**（创建分支、提交或推送、选择远程仓库三种状态共用）：`size="sm"`。
  - 删掉 document 上的 keydown 和遮罩的 mousedown。操作进行中不能关闭，改成 `onOpenChange` 在 busy 时忽略关闭。
  - ⌘/Ctrl+Enter 提交改在 `DialogContent` 的 `onKeyDown` 里。
  - 「提交或推送」状态没有可见标题，加了 `sr-only` 的 `DialogTitle`；另外两种把 h2 换成 `DialogTitle`，远程仓库的说明换成 `DialogDescription`。
  - 关闭后焦点回到「查看工作区环境」，原来用 `queueMicrotask` 手动聚焦，改为传 `returnFocus`。
- **与迁移前不同的地方**（都是有意的，或者可以忽略）：
  - **Review 两个对话框现在可以按 Esc 关闭。** 迁移前没有任何 Esc 处理，只能点取消或遮罩。
  - **Review 对话框的阴影**：迁移前用的是 `shadow-act-float`，`surface="raised"` 是 `shadow-act-popover`，阴影略浅（不透明度 0.18 → 0.14）。为了不再加一种外观，接受这点差别。
  - **所有对话框的遮罩都带 no-drag**，见 T2。
  - Git 操作对话框两侧留白 px-4 → px-5，只在窗口很窄时看得出来。
  - **键盘打开的 Tooltip 会先吃掉一次 Esc。** Mermaid 预览里用 Tab 聚焦到带 Tooltip 的按钮时 Tooltip 会显示。Tooltip 本身也是一层 DismissableLayer，第一次 Esc 只关 Tooltip，第二次才关对话框。这符合 WCAG 1.4.13（提示内容要能单独关掉），保留。markdown-prose 的用例按这个顺序写。
- **测试**：
  - markdown-prose：Mermaid 放大预览里 Tab 8 次、Shift+Tab 1 次焦点都在对话框内；两次 Esc 的顺序；关闭后焦点回到「放大查看」。
  - right-panel-review 新增 1 条：提交或推送对话框 Tab 循环、Esc 关闭、焦点回到工具栏按钮；创建 PR 对话框 Shift+Tab 不出界、点取消关闭、焦点回到工具栏按钮。
  - workspace-chrome-controls 新增 2 条：Tab / Shift+Tab 不出界、⌘+Enter 提交、提交进行中 Esc 不关闭、结束后关闭并把焦点还给「查看工作区环境」；空闲时 Esc 关闭。
  - provider-model-settings：模型目录点遮罩不关闭。Tab 循环和焦点还原的用例原本就有，未改。
- **变异**：9 个全部杀死。Git 对话框去掉 busy 保护、去掉 ⌘+Enter、去掉 returnFocus、忽略关闭；Review 忽略关闭、标题不用 DialogTitle、去掉 returnFocus；Mermaid 去掉 initialFocus；模型目录允许点遮罩关闭。
  - 第一轮「模型目录允许点遮罩关闭」存活，补了一条断言后被杀死。
- **验证**：typecheck 通过；全量 172 / 0 / 1 个文件，1311 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge` 通过。

### T5：设置页的三个对话框拆出并迁移

- 从 `SettingsPage.tsx` 搬到 `settings/dialogs/`，同时改用 `ui/Dialog`。SettingsPage 2074 → 1618 行。
  - **`ImageGenerationSettingsDialog.tsx`**：连同 `formatImageGenerationEndpoint`（媒体分组也用，导出给 SettingsPage）。`restoreFocusTo` 改名 `returnFocus`，直接传给 `DialogContent`。保存或断开进行中 Esc 不关闭；点遮罩不关闭（迁移前也不关）。标题和说明改用 `DialogTitle` / `DialogDescription`，说明现在关联到 `aria-describedby`。
  - **`LocalUpdateProgressDialog.tsx`**：连同 `LOCAL_UPDATE_STEPS`、`localUpdateStepIndex`、`formatLocalUpdateTime`、`isActiveLocalUpdatePhase`（SettingsPage 的 `isLocalUpdateActive` 还要用，导出）。
    - 可访问名称保持「本地更新进度」：加了 `sr-only` 的 `DialogTitle`，可见的 h3「本地更新」不变。
    - 更新进行中 Esc 和点遮罩都不关闭，结束或失败后都能关。迁移前进行中点遮罩也不关，但完全没有 Esc；现在结束后多了 Esc 关闭。
  - **`ProviderKeyModal.tsx`**：连同 `PROVIDER_LABELS`。标题用 `DialogTitle asChild` 保持 h3，说明关联到 `aria-describedby`。点遮罩关闭和迁移前一致；新增 Esc 关闭。
- **Dialog 尺寸调整**：图片生成对话框宽 520px，原有的 sm 420 / md 460 / lg 760 都对不上。`cn` 只做拼接、不合并冲突的 Tailwind 类，用 className 覆盖 `max-w` 时哪个生效取决于 CSS 的生成顺序，不可靠。所以 size 改为 sm 420 / md 460 / **lg 520** / **xl 760** / full，模型目录从 lg 改为 xl。计划写的是 sm / md / lg / full，这里多了一档，只是命名，外观没有变化。
- 两侧留白：LocalUpdate、ProviderKey 迁移前遮罩是 px-4，现在统一 px-5，只在很窄的窗口能看出来。
- **测试**：新增 `settings-dialogs.test.tsx` 5 条，直接渲染三个对话框。
  - 图片生成：Tab 不出界；点遮罩不关闭；保存中 Esc 不关闭；保存完成后关闭，焦点回到打开者；给了 `returnFocus` 时焦点回到它。
  - 本地更新：进行中 Esc 和点遮罩都不关闭、没有关闭按钮；失败后 Tab 不出界，Esc 关闭且焦点回到打开者，点遮罩也能关闭。
  - ProviderKey：h3 标题、说明关联；Tab 循环；Esc 关闭且焦点回到打开者；点遮罩关闭。
  - `settings-page`、`provider-model-settings` 原有用例未改，全部通过。
- **变异**：10 个全部杀死。图片生成去掉 busy 保护、允许点遮罩关闭、去掉 returnFocus、去掉说明关联；本地更新去掉进行中保护、忽略关闭、改掉标题；ProviderKey 忽略关闭、标题不是 h3、去掉说明关联。
- **验证**：typecheck 通过；全量 173 / 0 / 1 个文件，1316 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge` 通过。

### T6：删除 settings/ConfirmDialog 与 useDialogFocusTrap

- CustomConnectionDetail、CustomConnectionModels、ProviderSettings 改为从 `ui/ConfirmDialog` 引入。
- 删除 `settings/ConfirmDialog.tsx`（T2 留下的再导出）和 `settings/useDialogFocusTrap.ts`（T4、T5 之后已没有引用方）。
- `grep -rn "useDialogFocusTrap\|settings/ConfirmDialog" apps/desktop/src` 为 0。`docs/desktop-frontend-refactor/05`、`07` 里仍提到这两个文件，那是重构前的现状分析和清理清单，不改。
- **验证**：typecheck 通过；全量 173 / 0 / 1 个文件，1316 / 0 / 2 个用例；`check:current-docs` 通过。

### T7：五处浮层迁到 ui/Popover

- **Popover 原语补焦点兜底**：Radix 的非模态 Popover 关闭时只把焦点还给 `PopoverTrigger`。用 `PopoverAnchor` 定位、没有 Trigger 的浮层（选区菜单、评论框、上下文用量），关闭后焦点会丢到 body。
  - 和 Dialog 一样用 `OpenerCapture` 记下打开前的焦点。Dialog 里的那份抽成 `ui/OpenerCapture.tsx`，两边共用。
  - 只在焦点随浮层一起丢失时还（`document.activeElement` 是 body），并且点外部关闭的不还。调用方自己处理外部点击时（Composer 的 pointerdown、评论框的保存），Radix 收不到外部点击，靠前一个条件避免抢走用户新点的焦点。
- **ResponseSelectionMenu**：删掉 `createPortal`、手算位置和 document 上的 Esc。虚拟 anchor 是选区最后一行右端的一条竖线，`side="bottom"`、`align="start"`，下方放不下翻到上方。`sticky="always"`：选区部分滚出视口时菜单仍完整留在视口内。打开时不移动焦点（不打断键盘扩选）。拖选、选区变化、滚动关闭的逻辑不变。
- **ResponseAnnotationCommentPopover**：删掉 `createPortal` 和手算位置。虚拟 anchor 是原文最后一行（左移 4px），`contextElement` 设为原文所在元素，Radix 跟着消息区滚动重新定位。原文滚出消息区时隐藏不关闭、`data-anchored` 保持原样。Esc 交给 Popover，打开时聚焦输入框并把光标放到末尾。
  - **点外部保存仍用自己的 pointerdown（capture）。** Radix Popover 把左键的外部点击推迟到 click 才关闭（`deferPointerDownOutside`）。React 的 click 先于 document 冒泡监听执行，所以点 Composer 的发送按钮会先发送、后保存，评论丢失。迁移前就是在按下时保存，保持不变。
  - 不传 `onOpenChange`，Radix 的点外部、焦点移出关闭不生效：Tab 出去不关闭，和迁移前一致。
  - 关闭后的焦点由调用方决定（保存、Esc 还给 Composer，点外部留在原处），`onCloseAutoFocus` 阻止 Popover 的兜底。
- **ContextPopup**：改成以 Composer 外框为 anchor 的 Popover，`side="top"`，宽度用 `--radix-popper-anchor-width` 与 Composer 等宽。
  - 点 Composer 自身不关闭（开关按钮在 Composer 里）：`onInteractOutside` 里目标在 anchor 内时 preventDefault。
  - 浮层挂到 body 后，Composer 的 document pointerdown 会把点浮层内部当成点外部而关掉它。浮层加了 `data-composer-floating`，Composer 的判断多认这个属性（改动一行，Composer 的其他菜单归 09）。
  - 打开时焦点放在浮层本身，不放到第一个按钮上：那个按钮有 Tooltip，聚焦就会弹出提示。
- **WorkspaceChromeControls 环境浮层与分支菜单**：环境浮层改成 `PopoverTrigger`（套在 Tooltip 的 trigger 里）加 `PopoverContent`，`align="end"`；分支菜单改成嵌套 Popover，`side="left"`、`align="start"`，左边放不下翻到右边。删掉 document 上的 pointerdown / keydown、`createPortal`、手算位置和 `queueMicrotask` 还焦点。Esc 先关分支菜单（焦点回分支按钮），再关环境浮层（焦点回「查看工作区环境」）。
- **WorkbenchLayout**：窄窗口下 window 上的 Esc 会同时关侧栏和右侧面板。焦点在浮层里时 PopoverContent 已阻止 Esc 冒泡；焦点不在浮层里时（选区菜单），Esc 由 Radix 在 document 捕获阶段处理并 preventDefault，这里加上 `event.defaultPrevented` 时跳过。
- **ResponseAnnotationPill 未改**：它已经是 Radix HoverCard，没有手写定位和点外关闭；改成 Popover 会丢掉悬停预览。记入 pauses.md P2，待用户确认，先按建议不改。
- **与迁移前不同的地方**：
  - **打开 Git 对话框时环境浮层会关闭。** 焦点移进对话框，非模态 Popover 把焦点移出当作关闭。操作完成后照旧重新打开环境浮层显示结果（新增用例覆盖）。
  - 环境浮层的层级从 `--act-z-dropdown` 变为 `--act-z-popover`，与其他浮层一致。
  - 评论框原来只限制水平方向不出视口；现在下方放不下时会翻到原文上方。
  - ContextPopup 原来不移动焦点，现在打开时焦点进浮层、Esc 后回到用量按钮；Tab 离开 Composer 和浮层时会关闭。
  - Popover 外部点击在 click 时才关闭（Radix 行为），迁移前环境浮层在 pointerdown 时关闭。
- **测试**：
  - response-selection-menu：位置断言改为 Radix 写在外层包装上的 `transform`；jsdom 视口尺寸为 0，`beforeEach` 里给 `documentElement` 补 `clientWidth` / `clientHeight`。
  - response-annotation-markers：打开时输入框获得焦点；新增 1 条：Esc 后焦点留在 onClose 给的位置、点外部的非焦点元素后不回到打开前的元素；超长评论点外部后评论框关闭。
  - context-popup：浮层挂在 body 上，查询改用 `document`，补 `anchorRef`。
  - composer 新增 1 条：点浮层内部、点 Composer 不关闭；打开时焦点在浮层；Esc 关闭且焦点回到用量按钮；点外部关闭且焦点留在被点的元素上。
  - workspace-chrome-controls 新增 2 条：分支菜单打开时聚焦搜索框，Esc 逐层关闭并还焦点，点外部两层都关闭、重新打开时分支菜单不跟着打开；提交完成后环境浮层重新打开并显示结果。
  - workbench-responsive 新增 1 条：窄窗口右侧面板打开时，焦点在浮层里或不在浮层里按 Esc，都只关浮层，再按一次才关面板。
- **变异**：18 个，第一轮 16 个杀死。
  - 「评论框去掉 onCloseAutoFocus 的 preventDefault」存活：Esc 路径上 onClose 已经把焦点移走，Popover 的兜底不会生效。补了「点外部的非焦点元素」这一段后被杀死。
  - 「环境浮层关闭时不重置分支菜单」存活：分支菜单是嵌套 Popover，外层因点外部、Esc、焦点移出关闭时它自己先关闭，这行是多余的，删掉。
- **验证**：typecheck 通过；全量 173 / 0 / 1 个文件，1321 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。renderer 里 ui 之外仍用 `createPortal` 的：Sidebar、SettingsPrimitives、MessageQueueTray、ReviewToolbar，分别归 T8–T10。

### T8：Sidebar 右键菜单改用 ui/ContextMenu

- **会话行**：整行包在 `ContextMenuTrigger` 里，删掉 `createPortal`、`clampContextMenuPosition`、手算尺寸、document 上的 pointerdown / keydown 和手写的「复制」子菜单。子菜单改成 `ContextMenuSub`，悬停或 → 打开。菜单开着时行的标题提示不弹（`open={tooltipOpen && !menuOpen && !isRenaming}`）。
  - 从菜单选「重命名」时，`onCloseAutoFocus` 阻止 Radix 把焦点还回打开前的元素，否则输入框失焦会直接提交改名。jsdom 里没能复现被抢焦点（选菜单项后 Radix 没有回焦），保留作防御，CDP 验收时实测。
- **工作区标题行**：标题行包在 `ContextMenuTrigger` 里。Esc 或选了菜单项后焦点回到工作区名称；点外面关闭的不管（`onInteractOutside` 记一下，`onCloseAutoFocus` 里跳过）。名称按钮的 `aria-expanded` 跟菜单开关。删掉手写的上下键导航和打开时聚焦第一项。
- **键盘打开**：Radix ContextMenu 只认 `contextmenu` 事件。浏览器里 Shift+F10 / 菜单键本身会派发它，但位置是元素位置还是 (0, 0) 因平台而异，jsdom 不派发。加了 `openContextMenuFromKeyboard`：在锚点左下方派发 `contextmenu`。会话行的锚点是行本身，工作区的锚点是名称按钮。
- **删掉的一处**：会话行原来在 `onContextMenu` 里 `stopPropagation`，外层没有任何 `contextmenu` 处理，删掉。
- **与迁移前不同的地方**：
  - 菜单项禁用改为 `aria-disabled` / `data-disabled`（Radix 行为），不再是 `disabled` 属性。
  - 「复制」子菜单的可访问名称是触发项文字「复制」（Radix 用 `aria-labelledby` 指向子菜单触发项），原来是「复制会话 <会话标题>」。
  - 层级从 `--act-z-dropdown` 变为 `--act-z-popover`，与其他浮层一致。
  - 会话行新增 Shift+F10 / 菜单键入口；两类菜单都有了上下键、Home / End、首字母跳转（Radix 提供），键盘打开时焦点落在第一项。
  - 会话菜单 Esc 或选项后焦点回到打开前的元素（原来留在 body）。
- **测试**：
  - sidebar：禁用断言改为 `aria-disabled`；复制子菜单用键盘进入（jsdom 元素没有尺寸，指针移向子菜单会被当成离开），或直接 `fireEvent.click` 子菜单项。
  - sidebar 新增 4 条：Shift+F10 打开会话菜单、Esc 回焦、↓ 到「重命名」后改名，提示在菜单打开时隐藏；从行内操作按钮用键盘打开菜单改名，焦点留在输入框；指针移进菜单再回到行上不弹提示，关菜单后照常弹；置顶的会话显示「取消置顶」。工作区键盘入口用例改写：Shift+F10 / 菜单键打开，第一项获得焦点，选项后回到名称，点外面关闭不回焦。当前会话的「归档」在菜单里也是禁用的。
  - app-session-actions：复制子菜单改用键盘打开；两次打开之间等一个 `setTimeout(0)`，否则上一个菜单关闭后的回焦会把新菜单当成焦点移出而关掉（测试里连续操作才会遇到）；复制会话记录是异步的，改用 `waitFor`。
- **变异**：14 个，第一轮 10 个杀死。补测试后「归档未禁用」「置顶文案固定」「菜单打开时仍显示提示」被杀死。「选重命名时不阻止关闭回焦」仍存活，原因见上。
- **验证**：typecheck 通过；全量 173 / 0 / 1 个文件，1325 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。ui 之外仍用 `createPortal` 的：SettingsPrimitives、MessageQueueTray、ReviewToolbar。

### T9：按钮菜单改用 ui/Menu，Review 的两个面板改用 ui/Popover

- **OpenInAppMenu**：改成 `Menu` + `MenuTrigger`（套在 Tooltip 的 trigger 里），`align="end"`。打开时加载应用列表、清掉上次的错误。选应用后 `onSelect` 里 preventDefault，菜单先不关：打开成功才关，失败时菜单留着并在底部显示错误（`role="alert"`）。删掉 document 上的 pointerdown / keydown 和 `queueMicrotask` 还焦点。
- **RightPanelObjectMenu**：改成 `Menu`，`align="end"`。终端项的预加载从 `onPointerEnter` + `onFocus` 合成 `onFocus`：Radix 在鼠标移上时也会把焦点移到菜单项上。删掉 document 监听。
- **ReviewToolbar**：按 T0 的结论，「审查选项」和「提交或推送」改成 `Menu`，「审查范围」和「跳转到文件」改成 `Popover`。删掉 `AnchoredPopover`（`createPortal`、手算位置、document 监听）。
  - 四个弹层共用一个 `menu` 状态。点另一个弹层的按钮时，新弹层在 pointerdown 打开，旧弹层在 click 时才因外部点击关闭，所以 `onOpenChange(false)` 只在当前还是自己时才清空，不把新打开的一起关掉。
  - 显示设置（自动换行、富预览、词级差异、空白差异）改成 `MenuCheckboxItem`，切换后菜单不关，和迁移前一致。「加载完整文件」也不关。
  - 「跳转到文件」没有文件时按钮 `aria-disabled`，在 `onClick` 里 preventDefault 阻止 Radix 打开。搜索框由 Popover 的打开时聚焦拿到焦点，去掉 `autoFocus`。
  - 「提交或推送」菜单项打开对话框后，焦点在对话框里，关闭后回到「提交或推送」按钮（T5 的 `returnFocus` 不变，用例照旧通过）。
  - **ReviewScopeMenu 没有改。** 它在「审查范围」Popover 里，内部是「已提交」「分支」两级的就地切换（带返回按钮、加载和错误状态），换成 Menu 的子菜单会改变交互，T0 已定为 Popover。它内部仍是 `role="menu"` 加普通按钮，没有方向键导航，留到以后。
- **MessageQueueTray**：每条排队消息的 `⋯` 各自一个 `Menu`，删掉 `createPortal`、手算位置和翻转、document 监听、`anchorsRef` 和「消息被删时关菜单」的 effect（菜单随行一起卸载）。
- **与迁移前不同的地方**：
  - 菜单的可访问名称：Radix 用 `aria-labelledby` 指向触发器，`aria-label` 不生效。OpenInAppMenu 的菜单名从「打开方式」变为「在外部应用中打开」，排队消息菜单从「排队消息操作」变为「更多操作：排队消息 N」，ReviewToolbar 的两个菜单原来没有名称，现在分别是「审查选项」「提交或推送」。
  - 菜单项禁用改为 `aria-disabled`；打开方式由 click 变为 pointerdown（Radix DropdownMenu 行为）；键盘打开时焦点落在第一项；都有方向键、Home / End、首字母跳转。
  - 选项后焦点回到触发器（原来 OpenInAppMenu 只在 Esc 时还，其他几处不还）。
  - 层级统一为 `--act-z-popover`（原来 OpenInAppMenu、RightPanelObjectMenu、排队消息菜单是 `--act-z-dropdown`）。
  - 外观跟 `menu-styles` 走：面板 `rounded-act-md` + `p-1`，菜单项 32px、`text-act-sm`。原来 OpenInAppMenu 是 `rounded-act-lg`、`p-1.5`、`text-act-xs`，RightPanelObjectMenu 是 34px 高、`font-medium`，Review 两个菜单是 `text-act-xs`。显示设置的勾从右侧移到左侧的指示位（`MenuCheckboxItem` 的布局）。
- **测试**：
  - 新增 open-in-app-menu（4 条）：选应用后打开、菜单关闭、焦点回到触发器、下次标「上次」；打开失败时菜单留着显示错误，重新打开时错误清掉；键盘打开、Esc 关闭并还焦点；拿不到应用列表时只列上次用过的。
  - 新增 right-panel-object-menu（1 条）：没有会话时终端禁用；键盘打开、End 到「上下文」、Enter 打开 Tab，焦点回到「+」。
  - right-panel-review：按钮断言改为 `menuitem`，图标断言改为按类名查（勾和图标都是 svg）；新增 2 条：切换显示设置菜单不关、Esc 还焦点、范围弹层开着时点「跳转到文件」只留跳转弹层且搜索框获得焦点、选文件后关闭；快照没加载完时「复制 git apply 命令」禁用。另在已有用例里补：没有文件时点「跳转到文件」不打开；选提交后范围弹层关闭；点「加载完整文件」后菜单不关。
  - message-queue-tray：禁用断言改为 `aria-disabled`，Esc 后焦点回到 `⋯`；新增 1 条：点「上移」调用对应消息，键盘打开后焦点在「编辑」、Enter 执行。
- **变异**：16 个，第一轮 9 个杀死；补上面的用例后全部杀死。
- **验证**：typecheck 通过；全量 175 / 0 / 1 个文件，1333 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。ui 之外仍用 `createPortal` 的只剩 SettingsPrimitives（T10）。

### T10：设置页下拉改用 ui/Select 与 ui/Menu

- **SettingsPrimitives**：删掉 `useAnchoredMenu`（`createPortal`、手算位置、document 监听）、`MENU_SURFACE`、`MENU_ITEM`、`TRIGGER_BASE`、`triggerState`。`SelectOption` 改从 `ui/Select` 再导出，三个组件的 props 不变。
  - `SettingsSelect` 直接用 `Select`，宽度沿用原来的 `min-w-[140px]`（sm）/ `min-w-[216px]`、`max-w-[300px]`、窄屏 `w-full`。
  - `MultiSelect` 改成 `Menu` + `MenuCheckboxItem`，勾选时 `onSelect` preventDefault，菜单不关，和迁移前一致。触发器沿用 `SELECT_TRIGGER_CLASS`，箭头在打开时旋转。目前没有调用方（仍导出）。
  - `SettingsMenuButton` 改成 `Menu`，`align="end"`、最小宽 140px。
- **ui/Select**：列表加 `aria-label={ariaLabel}`。Radix 的 Select 列表默认没有名称，迁移前 SettingsSelect 的 listbox 有，provider-model-settings 按名称找它。
- **原生 select 换成 ui/Select**（对外接口不变）：
  - HostConnectionsSettings：「连接方式」。
  - ModelSettings 的模型行：「连接」「调用 Key」。空串值（默认 Key）由 ui/Select 的占位值处理；「已删除的 Key · 不可用」和不可用的 Key 仍是禁用项。
  - CustomModelReasoningFields：「能力来源」「参考模型（可选）」「推理支持」「默认强度」。`support` 缺省时按「未知」显示，和原生 select 显示第一项一致。删掉不再用的 `inputClass`。
  - EnglishLearningCapability：「英语学习目标会话」，没有会话时只有一项「请先创建会话」。
  - 包这些 select 的 `<label>` 改成 `<div>` + `<span>`：Radix 触发器是按钮，名称由 `ariaLabel` 给，和原来的可见文字一致。
  - Composer 的两个 select 留给 09。
- **与迁移前不同的地方**：
  - 单选触发器的角色从 `button`（`aria-haspopup="listbox"`）变为 `combobox`；选项禁用改为 `aria-disabled`。多选和「管理」菜单的项分别是 `menuitemcheckbox` / `menuitem`（原来是 `option` / `menuitem`），菜单名称由触发器给（Radix 的 `aria-labelledby`）。
  - 打开方式由 click 变为 pointerdown；键盘打开后焦点落在选中项（Select）或第一项（Menu）；选后焦点回到触发器。
  - 外观跟 `menu-styles` 走：面板圆角由 `rounded-act-group` 变为 `rounded-act-md`，菜单项最小高 32px（原来 `py-1.5`），禁用项由 45% 透明改为 `text-text-faint`。「管理」菜单的危险项颜色由 `text-on-danger` 变为 `text-danger`（ui/Menu 的 `danger`）。
  - 原生 select 换掉后尺寸统一为 30px 高、`text-act-sm`：模型行两个原来是 32px、`text-act-xxs`；推理字段原来 36px；主机「连接方式」原来 `px-3 py-2` 的输入框样式；英语学习原来 36px。下拉列表由系统原生菜单变为应用内的列表。
- **测试**：
  - 9 处 `getByRole("button", { name: <下拉名> })` 改为 `combobox`；选项和菜单项的 `toBeDisabled` 改为 `aria-disabled`。
  - custom-model-reasoning：`selectOptions` 改成点触发器再点选项（文件内 `choose` 辅助函数），`toHaveValue("")` 改为看触发器文字；补选「自动（不指定强度）」后不再带 `defaultEffort`。
  - english-learning：改为打开下拉检查只列主会话（新的在前、子会话不列），选「Old」失败后触发器仍显示「New」，并断言调用参数。原来的「Child 不在 option 里」在 Radix 下拉关闭时恒成立，改成打开后比对列表。
  - 新增：settings-primitives 2 条（多选勾选后菜单不关、Esc 还焦点、禁用项；「管理」菜单禁用项不执行、选中后关闭）；provider-model-settings 1 条（模型行切连接、切回默认 Key 传 `null`，已删除和不可用的 Key 禁用）；host-feedback 1 条（切到 SSH 隧道后地址清空、按别名和端口配对）。
- **变异**：15 个，第一轮 13 个杀死；补上面 english-learning 和默认强度的断言后全部杀死。
- **验证**：typecheck 通过；全量 175 / 0 / 1 个文件，1337 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过；ui 之外用 `createPortal` 的文件为 0；components 下含 `<select` 的只剩 `Composer.tsx`。
- **没有改的**：ModelSettings 里「选择启用模型」的可搜索多选（手写 listbox + document 监听）不在 T10 范围内，留着。

### T11：SettingsPage 拆成 sections/ 与 use-settings

- **纯搬迁**，用脚本按行号把原文件切开，再按用到的标识符生成 import（相对路径多一层 `../`）。搬完后把新旧代码逐行做多重集合对比，差异只有下面列出的改名和 hook 替换。
- **`use-settings.ts`**（110 行）：`mergeSettings`、首次加载（旧版设置 + v4 快照、读取失败文案）、`refresh`、`update`（乐观合并后以保存结果为准）、`updateNamespace`（带 revision，冲突时换成最新快照并抛错）、`saveProviderKey` / `clearProviderKey`（成功后 refresh）。原来内联在 JSX 里的 `onReplaceSettings` 改成 hook 里的 `replaceSettings`（`useCallback`），行为相同。函数名去掉 `handle` 前缀。
- **`sections/`**，每个分区一个文件：
  - `PerformanceSection`（原 `PerformanceSettingsSection`，改名与文件一致）、`GeneralSection`、`AgentInstructionsSection`（连同 `AGENT_SYSTEM_PROMPT_MAX_CHARS`）、`TaskModelDefaultsSection`（连同 `EMPTY_TASK_MODELS`、`parseTemperature`、`parseMaxOutputTokens`）、`MediaDefaultsSection`（连同 `ImageInspectionSettingsRows`）、`ToolsSection`、`SubagentSection`、`ArchivedChatsSection`（连同 `workspaceLabelFromRoot`、`formatUpdatedAt`）、`LocalUpdateSection`（连同 `LOCAL_UPDATE_POLL_MS`、`isLocalUpdateActive`）、`AppearanceSection`（连同 ThemeTiles、ThemeMiniWindow、AccentPicker 和选项常量）。
  - `shared.ts`：`SectionProps` 和 `SETTINGS_TEXTAREA_CLASS`（通用、Agent 指令两个分区都用）。
  - 计划写的是 12 个 section。另外两个：`ProvidersSection` 是死代码（「模型」分区直接渲染 `ProviderSettings`，它没有被引用），删掉；远端 Host 本来就是独立文件 `HostConnectionsSettings.tsx`，测试从这个路径 import，不搬。
- **SettingsPage**（1618 → 221 行）：只留导航、section 路由（`SettingsContent`）、ProviderKeyModal 和语音分区的滚动定位。provider-model-settings 测试从 SettingsPage import `TaskModelDefaultsSection`，保留再导出。计划里写的「搜索」现在是独立分区（SearchSettings），SettingsPage 里没有搜索逻辑。
- **SettingsPrimitives**（899 → 787 行，超过 500）：
  - 只属于某个分区的：`Kbd` 只有 ShortcutSettings 用，搬过去（不再导出）。顺手删掉 ShortcutSettings 里没用到的 `Button` import。
  - `NumberField`、`TextField` 没有任何引用（文档里也没提），删掉。
  - 剩下的都被两个以上设置文件使用（`InlineWarning` 被媒体和工具两个分区用；`SegmentedControl` 目前只有 CustomConnectionWizard 用，但它是通用控件，规范文档也把它列为原语，留着），不属于某个分区的业务部分，所以没有再搬。再降到 500 以内要把 SettingsPrimitives 拆成多个文件（05 设想过 `primitives/` 目录），不在 T11 的改动范围内，留作后续。
- **测试**：新增 use-settings（4 条）：加载两份快照、加载失败显示文案；乐观更新后以保存结果为准并回传；namespace 更新带 revision、冲突时抛错并换成最新快照；替换设置回传，保存 Key 失败不 refresh、成功和清除 Key 后 refresh。原来这些逻辑没有直接测试：4 个变异（不回传、冲突不抛错、去掉乐观合并、保存 Key 后不 refresh）在已有用例下全部存活，补用例后全部杀死。
- **文档**：`front-设置中心重构规范.md` 的源码列表加 `use-settings.ts` 和 `sections/`；`front-chat-mermaid-diagrams.md` 的实现位置建议里，外观设置行从 SettingsPage 改指 `sections/AppearanceSection.tsx`。
- **验证**：typecheck 通过；`--noUnusedLocals` 检查新文件没有多余 import；全量 176 / 0 / 1 个文件，1341 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。各 section 最大 247 行（AppearanceSection）。

### T12：Sidebar 拆成 sidebar/ 下的模块

- **两份分组逻辑的对照（计划要求不一致时停下）**：先把两份原样搬进 `session-grouping.ts`（`groupSessionsByWorkspace` 和 Sidebar 里 `workspaceGroupSessions` 的 useMemo 体，后者命名为 `sessionsByGroupKey`），用现有行为写 `session-grouping.test.ts`，覆盖按 id、按路径、没有路径、空路径、未登记的 id（有无路径）、未登记的路径、远端（路径与本机工作区相同也分开），有默认工作区和没有默认工作区两种情况。
  - 结论：**两份算出的分组 key 完全相同**（只是 `defaultWorkspace` 提前查一次和每次现查的写法差别；S0 提交 `5fe9f1a6` 时就是这样）。唯一的差别是输入：分组只用未置顶的会话，`sessionsByGroupKey` 用全部会话。后者只用来判断工作区「归档全部」是否可用，而 App 的 `handleArchiveWorkspace` 会连置顶的会话一起归档，所以用全部会话是对的，是有意为之。
  - 因此没有按设计偏差停下。合并成一份：`matchSessionWorkspace`（本机会话匹配哪个已登记的工作区）和 `sessionGroupKey`（分组 key），两个导出函数都用它们。对照测试改成对比两个函数在有、无默认工作区时给每条会话的 key 一致。
  - 附带记录的现有行为（没改）：没有默认工作区时，未登记 id 的会话按 id 归组，组名取先遇到的那条会话的路径；比如先遇到没有路径的那条，组名就是「默认工作区」。
- **远端分组标签读 HostDirectory**：`groupSessionsByWorkspace` 加可选参数 `hostNameOf`，标签里的 Host 名按「HostDirectory 当前名称 → 会话记录的 `hostName` → `hostId`」取。Sidebar 用 `useHostDirectory` 读 `hosts`（模块级 selector）。与之前不同：Host 改名后分组标签跟着变；会话没有 `hostName` 时显示 hostId，原来会显示「undefined · 路径」。
- **`session-status.ts`**：`SessionUiStatusKind`、`SESSION_STATUS_META`、`sessionStatusOf(id, busyIds, statuses)`（合并原来的 `resolveSessionStatus` 和 `resolvedSessionStatus`，规则不变：有记录以记录为准，认不出的值按空闲；没有记录看是否在 busy 集合里）、`isSessionBusy`（运行中或等待审批；原来分叉禁用和「归档全部」禁用各写了一遍）。
  - 改了一处：判断记录值是否合法从 `status in SESSION_STATUS_META` 改为 own-property 检查。原来 `"toString"` 这类原型上的名字也算合法，会拿到函数当 meta。App 只会传四种合法值，正常使用不受影响。
- **拆出的组件**（Sidebar 1055 → 245 行）：
  - `SessionRow.tsx`（340 行）：行、`SessionStatusButton`、内联重命名、时间和标题格式化。状态在上层算好再传进来，不再在行里重复解析。
  - `SessionContextMenu.tsx`：会话右键菜单的内容（`SessionContextMenuContent`）和 `openContextMenuFromKeyboard`（WorkspaceSection 也用）。「从菜单选了重命名就不还焦点」通过 `shouldRestoreFocus` 回调交给 SessionRow 判断，逻辑不变。
  - `SessionList.tsx`：原 `CollapsibleSessionList`（本地超过 10 条折叠、远端分页加载）。
  - `WorkspaceSection.tsx`：工作区标题行、工作区右键菜单、下面的会话列表。
  - `styles.ts`：多个文件共用的样式常量。只在一个文件里用的留在原文件。顺手删掉两个没用到的常量（`SESSION_STATUS_DOT_MUTED_CLASS`、`SESSION_STATUS_DOT_BUSY_CLASS`）和没用到的 `Sparkles` import。
  - Sidebar 只留布局、两个分区的折叠、「新建会话 / 扩展 / 设置」入口和 `NavSectionHeader`。
- **会话动作读 SessionActionsContext**：SessionList 读置顶、重命名、复制、分叉、归档；WorkspaceSection 读打开、归档全部、移除工作区。Sidebar 只读新建、选择、添加工作区，并把「选择会话」「在工作区新建」包一层（先切回聊天视图）传下去。原来 Sidebar 读出 12 个操作再逐层透传。
- **类型**：`NewSessionInput` 的定义移到 `session/session-actions-context.tsx`（原来 context 反过来从 Sidebar import 它），`session-gateway.ts` 改从 context 读；Sidebar 再导出 `NewSessionInput` 和 `SessionUiStatusKind`，App、WorkbenchLayout 的 import 不变。拆出的模块都不 import Sidebar。
- **测试**：
  - 新增 `session-grouping.test.ts`（7 条）、`session-status.test.ts`（3 条）。
  - sidebar.test 新增 3 条：工作区里任一会话（含置顶的）运行中或等待审批时「归档全部」禁用、没有会话时禁用；远端分组标签先显示会话记录的 Host 名，HostDirectory 读到后换成当前名称；点置顶区和工作区里的会话、点工作区的「+」时都先切回聊天视图。
- **变异**：10 个，6 个第一轮杀死。存活的 4 个：「点会话 / 工作区 + 时不切回聊天视图」3 个，补上面第 3 条后杀死；「从菜单选了重命名后仍还焦点」1 个，换回 T11 的原 Sidebar 做同样的变异也存活——jsdom 里 Radix 关菜单后焦点没有被移走，现有两条用例区分不出来。这条留给 CDP 验收（Shift+F10 → 重命名后焦点留在输入框）。
- **文档**：`front-icon-button-tooltip-guidelines.md` 的 P1 列表里，置顶、归档、会话状态按钮改指 `sidebar/SessionRow.tsx`，工作区按钮补 `sidebar/WorkspaceSection.tsx`。05 和 07（V3、V4）的更正放到 T18。
- **验证**：typecheck 通过；`--noUnusedLocals` 检查改过和新建的文件没有多余 import；全量 178 / 0 / 1 个文件，1354 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过。

### T13：ConversationView 拆成 conversation/ 下的模块

纯搬迁，行为不变。ConversationView 1218 → 374 行。

- **计划列出的 6 个文件**：
  - `turns.ts`（纯函数）：分轮 `groupMessagesIntoTurns`、`splitTurnMessages`、`hasToolLikeItem`、轮次导航项 `createTurnNavigationItems`、`workDurationMs`、`getLatestTodoMessage`，以及三类消息 kind 集合。另从组件里抽出三个原来写在 JSX / effect 里的计算：`finalAssistantMessages`（一轮的最终回复）、`userInputHistory`（Composer ↑ 键历史）、`pickActiveTurnId`（阅读线以上最后一轮；都在线下时取第一轮）。
  - `render-message.tsx`：`renderMessage`、`renderMessageList`、延迟工具消息、工作区准备块、模型等待状态。`SubagentsPanel` 和 `deferred-tool-message.test` 改从这里 import。
  - `TurnActions.tsx`：复制、时间、可视化按钮和 `⋯` 菜单。
  - `TurnView.tsx`：一轮的外层 section、提问、过程与回复、产物卡片、TurnActions。只有用户发起的轮次登记到导航（与原来一致）。
  - `TurnNavigator.tsx`：`useTurnNavigator` hook（每轮 DOM 位置、当前轮、导航条是否显示、滚到某轮）和 `TurnNavigator` 组件。贴底、回底按钮仍归 ConversationView；滚动后由它调 `sync`。
  - `ConversationComposerSlot.tsx`：两处 Composer 共用的接线，从 ActiveSession / Composer / RunTarget 三个 Context 读其余 prop。T13 仍挂两处（initial 和 followup），只挂一次是 T14。
- **计划外多出的一个文件**：`use-workspace-file-links.ts`（工作区相对路径校验和打开文件，本机 / 远端两条路径原样搬）。不拆时 ConversationView 是 409 行，超过 400 的上限。
- **测试**：
  - 新增 `conversation-turns.test.ts`（12 条），覆盖 `turns.ts` 全部导出和 `isSafeWorkspaceRelativePath`。
  - 新增 `conversation-view-navigation.test.tsx`（5 条）：导航条在不足 3 轮或视口窄于 640px 时不显示；followup Composer 拿到输入历史（↑ 依次回填）、Review 摘要（点击打开 Review）、权限控件、当前会话的草稿批注。
- **变异**：9 个。
  - 第一轮只跑相关测试，杀死 1 个（流式中不显示产物卡片）。存活的 8 个改跑全量：6 个被其他测试杀死（Review 摘要、输入历史、当前轮、轮次登记、批注、权限控件）。
  - 「导航条最少 2 轮」存活，补上面的导航测试后杀死；同时加测「窄屏阈值 639」，也杀死。
  - 「点导航条后不先置为离开底部」存活。这是等价变异：`navigateToTurn` 滚动后立即调 `updateConversationViewport`，按滚动位置重算贴底和回底按钮，先前的两个赋值在同一批更新里被覆盖。原代码也是这样，T13 只搬不改。
- **T16 Esc 排查要列的**：TurnActions 的 `⋯` 菜单仍是手写的（document 上的 pointerdown 和 Escape 监听）。T9 迁移清单里没有它，T13 只搬不改。
- **文档**：规范里提到 ConversationView 的地方（`front-中间消息区规范.md`、`front-会话状态与数据流规范.md` 等）说的是组件职责，拆分后仍成立，不用改。`front-tool-stream-typography.md` 的那句是「实施前」的历史事实，`histories/` 是历史记录，都不改。05、07 的更正放到 T18。
- **验证**：typecheck 通过；`--noUnusedLocals` 检查改过和新建的文件没有多余 import；全量 180 / 0 / 1 个文件，1371 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。

### T14：Composer 只挂一次，附件按会话存进 SessionLocalStore

- **附件草稿（J4）**：
  - `SessionLocalState` 加 `attachments`。`useSessionDrafts` 加 `readAttachmentDraft` / `writeAttachmentDraft`，经 ComposerContext 和 `ConversationComposerSlot` 传给 Composer。
  - Composer 的附件初始值从草稿读；每次改动（拖入、粘贴、移除、发送清空、失败回填、恢复草稿）同时写回当前 `draftKey`；`draftKey` 变化时换入新会话的附件。没有传这两个函数时（单独渲染 Composer 的测试）行为和原来一样，只存在组件里。
  - 预览 blob URL 的释放：发送成功、移除附件、被恢复的草稿替换时由 Composer 释放（不释放恢复草稿里仍在用的那几个）；会话 evict / evictWhere 时由 store 释放 `attachments` 和 `draft.attachments` 里的预览。共用的函数放到新文件 `composer/attachment-preview.ts`。
  - 和原来不同的一处：Composer 卸载时，存在草稿里的附件不再释放预览，否则切到设置页再回来，图片预览就坏了。只存在组件里的仍在卸载时释放。
- **Composer 只挂一次**：ConversationView 底部那一格始终渲染同一个 `ConversationComposerSlot`，`surface` 随是否空会话切换；空会话时这一格用 grid 放到消息区同一格，外面两层 div 的 class 和原来放在消息区里时相同（滚动、`min-h-[420px]`、居中、留白）。有消息后换成原来的 `composer-zone`。消息区和 Composer 区显式指定 grid 行列，不然自动排布会把消息区挤到第二行。空会话不传 Review 摘要（和原来一样）。
- **计划外改的文件**：
  - `App.tsx` 一行：激活会话时「上次未确认的提交恢复为草稿」，原来输入框有文字就不恢复，现在有附件也不恢复。附件进了 store 以后才能判断；不加的话，恢复会把用户刚拖进来的附件换掉。
  - `test/helpers/workbench.tsx` 的 Context 键表加两个字段（键表编译时要求列全）。
  - 规范：`front-聊天输入框规范.md`（附件草稿、释放时机、两种 surface 是同一个 Composer）、`front-会话状态与数据流规范.md` §5（`attachments` 字段、evict 释放预览）。
- **测试**：新增 `composer-attachment-drafts.test.tsx`（7 条）：A 加附件后切到 B，B 没有附件，切回 A 附件还在，卸载再挂回也在且没有释放；A 发送后附件清空、草稿清空、预览释放；移除附件释放预览；恢复草稿时只释放被替换掉的预览；evict / evictWhere 释放预览；失败草稿里的预览在 evict 时也释放；从空会话发出第一条后输入框还是同一个元素、焦点还在、只有一个输入框。`app-message-queue.test` 加 1 条：等快照期间用户拖进了附件，不恢复旧提交。
- **变异**：10 个，全部杀死。第一轮跑全量，存活 2 个（「未确认提交的恢复不看附件」「恢复草稿时不释放旧预览」），补上面两条后杀死；另加「恢复草稿时把复用的预览也释放」，也杀死。
- **浏览器检查**（vite 5199 + headless Chrome 9333，`?mock=empty`，前后各量一次，截图在 `screenshots/t14-*`）：
  - 空会话 Composer 的位置和尺寸，在 1280×800、480×700、1280×360 三种窗口下与改动前完全相同（面板 y 分别为 363 / 313 / 207，滚动高度 732 / 632 / 420）。第一版只用一层 div，在 360 高的窗口里面板上移了 64px（少了 `min-h-[420px]`），改成两层后一致。
  - 发出第一条后：改动前输入框换了一个新元素、焦点丢失；改动后是同一个元素、焦点还在。底部 Composer 的位置和尺寸与改动前相同。
  - 空会话时打开工作区下拉，菜单完整显示、点得到。控制台没有 error / warning。
- **验证**：typecheck 通过；`--noUnusedLocals` 的 6 条命中在 HEAD 上就有（App 的 `ModelId` 等），T14 没有新增；全量 181 / 0 / 1 个文件，1379 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。ConversationView 373 行。

### T15：WorkbenchLayout 拆成 workbench/ 下的模块

纯搬迁，行为不变。WorkbenchLayout 747 → 378 行（计划写的 893 是 14 之前的数字）。

- **计划列出的 3 个文件**：
  - `use-panel-layout.ts`：布局常量、`loadStoredLayout`（含旧 `rail` → `hidden`）、宽度与收起状态和 localStorage 持久化、窄窗口自动收起、紧凑布局（≤ 820px）的覆盖层开关和 Esc 关闭、左右分隔条的拖拽 / 键盘 / 双击、`chromeLeftMode`。右侧面板开关仍由 RightPanelContext 持有，作为参数传入。原来写在 JSX 里的三个回调（左侧键盘调整、右侧拖拽、右侧双击复位）搬进 hook，改名为 `keyResizeLeftPanel` / `resizeRightPanel` / `resetRightWidth`，逻辑不变。
  - `PermissionModeControl.tsx`：原样搬。`permission-mode-control.test` 改从新路径 import；WorkbenchLayout 不再导出它（没有其他使用方）。
  - `edited-files.ts`：`collectEditedFilePaths` 原样搬并导出。
- **计划外多出的一个文件**：`use-session-history.ts`（标题栏后退 / 前进的会话访问历史，原样搬）。只拆计划的三个时 WorkbenchLayout 约 450 行，超过 400 的上限。用量统计加载（约 30 行）留在原处，拆完已在上限内。
- **prop 数量**：WorkbenchLayout 9 个，与 15 结束时相同（14 结束时 13 个，15 移走 4 个运行位置相关的）。T15 只拆内部实现，不动 prop。ConversationView 的数字见 15 的执行记录。
- **测试**：
  - 新增 `workbench-modules.test.tsx`（11 条）：编辑路径只收已完成的 edit / write、优先相对路径、去重；布局读取旧 `rail`、宽度收进范围；拖到 148 以下收起、键盘从收起状态展开到最小宽度、持久化；右栏宽度上限和双击复位；窗口变窄时先收侧栏再关右栏、宽侧栏在剩余宽度不足时收起；820 的紧凑边界、紧凑下侧栏和右栏互斥；Esc 关覆盖层、已被浮层处理的 Esc 不连带关闭；中等宽度打开右栏时让出侧栏；会话历史后退 / 前进不记入历史、新访问截掉前进分支、切换失败退回位置。
  - `workbench-responsive.test` 加 1 条：右栏分隔条按 End 拉到上限、双击恢复 390。
- **变异**：25 个。第一轮存活 4 个：
  - 「窄窗口不自动收起侧栏」「右栏双击不复位」：补上面两条后杀死。
  - 「后退 / 前进的切换完成后不提前 return」：等价变异。去掉 return 后会走到下一句 `history[currentIndex] === activeSessionId`，index 已经指向目标会话，同样返回。
  - 「左侧键盘调整改用拖拽的处理」：两者只在侧栏收起时不同，而侧栏收起时 SplitView 不渲染左侧分隔条，键盘到不了。原代码的这段分支实际走不到，T15 只搬不改。
- **顺带发现**：`setUsageSnapshot` 在 HEAD 上就从未调用（`usageSnapshot` 恒为 null，传给 SettingsPage）。不属于本次搬迁，记在下面的推迟事项里。
- **文档**：规范里提到 WorkbenchLayout 的地方说的是职责（注入宽度变量、切会话读回草稿、测试用的 `TestWorkbenchLayout`），拆分后仍成立，不用改。
- **验证**：typecheck 通过；`--noUnusedLocals` 对 WorkbenchLayout 和 `workbench/` 只有 `setUsageSnapshot` 一条（HEAD 上就有）；全量 182 / 0 / 1 个文件，1391 / 0 / 2 个用例；`check:frontend-tokens`、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。

### T16：检查脚本加原生按钮基线、createPortal 和 role="dialog" 的位置

- **`scripts/check-frontend-design-tokens.mjs`** 新增三项，都并进 `pnpm check:frontend-tokens`：
  - `checkNativeButtons`：逐个 `.tsx` 数原生 `<button`（去掉注释，`components/ui/` 和 `test/` 不计），和 `scripts/native-button-baseline.json` 比。超过基线（包括基线里没有的新文件）就失败；低于基线、或基线里的文件已经没有原生按钮时，只打印「可以收紧基线」的提示。
  - `createPortal` 只能出现在 `components/ui/`。
  - `role="dialog"`（也认 `role={'dialog'}`、`role: "dialog"`）只能出现在 `components/ui/`；`alertdialog` 不算。
  - 后两条的例外按「文件 + 规则」登记在 `UI_ONLY_ALLOWLIST`。现在只有一条：`ResponseAnnotationPill` 的 HoverCard 卡片标了 `role="dialog"`（pauses.md P2，按 A 保留 HoverCard）。用户选 B / C 时这条随之删掉。
  - 更新基线：`node scripts/check-frontend-design-tokens.mjs --update-native-button-baseline`，按当前代码重写整份基线；之后在 diff 里核对每一行变化，只接受下降，或已说明原因的新增。
- **基线**：66 个文件、239 个原生 `<button>`。T0 记的是 256「行」，口径不同：T0 按行数，这里按出现次数，而且 T0 之后的 T4–T15 删掉了一些。最多的是 Composer（31，归 09）。
- **脚本单测**（`scripts/test/frontend-design-tokens.test.mjs`，从 10 条到 15 条）：portal 越界、dialog 越界（三种写法、`alertdialog` 不误报、例外只放过登记的规则）、按钮计数（注释、`<buttons>`、`ui/`、`.ts` 不计）、超过基线和新增文件失败、低于基线和文件消失只提示；另用临时目录造一棵 renderer 树跑 `runCheck`，确认三项都接进了总检查、`test/` 不扫；「当前代码通过」的用例改为同时要求和基线完全一致（没有可收紧的提示），所以以后按钮数下降时要顺手更新基线。
- **变异**：14 个，全部杀死（`ui/` 不豁免、例外不生效、`ui/` 计数、不去注释、`<button` 前缀误匹配、上限放宽、新文件放行、两种提示不出、两项没接进 runCheck、dialog 正则放宽、portal 不要求词边界、ui-only 不去注释）。
- **grep 门槛**：`createPortal` 在 `components/ui/` 之外 0 处；`role="dialog"` 在 `components/ui/` 之外只剩上面那条例外。

**Esc 排查**（`components/ui/` 和测试之外，19 个文件）：

| 位置 | 用途 | 结论 |
| --- | --- | --- |
| `sidebar/SessionRow.tsx` `handleRenameKeyDown` | 重命名输入框里取消编辑 | 输入框内行为，保留 |
| `settings/ShortcutSettings.tsx` | 录制快捷键时取消录制 | 输入框内行为，保留 |
| `trajectory/TrajectoryTimeline.tsx` | 时间轴概览上清除拖选的时间范围 | 控件内行为（focus 在可拖选的轨道上），保留 |
| `Composer.tsx` 斜杠菜单、document 上的 Escape | 输入框内收起斜杠建议；关 Composer 的浮动面板 | 归 09（P3 / P4），本计划不碰 |
| `settings/SettingsPrimitives.tsx` `SettingEditor`、`ProviderSettings.tsx`（两处）、`CustomConnectionWizard`、`CustomModelForm`、`AnthropicKeySetup` | 设置页内的编辑区 / 表单流程，Esc 取消或回到上一步，保存中不响应 | 表单内行为，保留（T0 已定） |
| `messages/SubAgentTranscriptModal.tsx` | 关闭子智能体记录面板（window 级，`role="region"`，不是对话框） | 保留（T0 已定）；没有找到使用方，可能是死代码，记为后续候选 |
| `workbench/use-panel-layout.ts` | 窄窗口下关侧栏和右侧面板的覆盖层；已被浮层处理过（`defaultPrevented`）的 Esc 不连带关 | 保留：覆盖层是布局，不是弹层；只关一层由 `defaultPrevented` 保证，T15 有单测 |
| `ResponseAnnotationPill.tsx`、`ResponseAnnotationCommentPopover.tsx` | `onEscapeKeyDown` 是 Radix 回调（还焦点、取消编辑），不是自己监听 | 保留 |
| `conversation/TurnActions.tsx` `⋯` 菜单 | 手写菜单的关闭（document 上的 pointerdown + keydown） | 明显是菜单、改动小，T16b 已改用 `ui/Menu` |
| `workbench/PermissionModeControl.tsx` | 手写的单选菜单（自己做方向键、Esc 还焦点） | 同上，T16b 已改用 `ui/Menu` |
| `sidebar/SessionRow.tsx` `SessionStatusButton` | 状态点的说明浮层（document 上的 mousedown + keydown） | 同上，T16b 已改用 `ui/Popover` |
| `RightPanel.tsx` 标签溢出菜单 | 手写菜单；每一项里还嵌了「关闭标签」按钮 | 不改：菜单项里嵌按钮，换 Radix 要改交互（关闭按钮挪到别处或改成子菜单）。RightPanel 不在 16 的拆分范围，记为后续候选 |
| `right-panel/ReplyHtmlRenderView.tsx` | 可视化文件选择列表的关闭 | 不改：不在 05 §1.2，T0 已列为「计划没有列的弹层」；更像 Select，迁移要改它的结构，记为后续候选 |
| `settings/ModelSettings.tsx` `ModelMultiSelector` | 可搜索多选列表的关闭 | 不改，T10 已推迟（见下方推迟事项） |

### T16b：Esc 排查中三处手写弹层改用原语（计划外）

T0 定的规则是「明显是菜单、改动又小的顺手迁移并记录」。T16 排查后迁了三处；RightPanel 标签溢出菜单、ReplyHtmlRenderView、ModelMultiSelector 不迁，原因见上表。

- **TurnActions 的 `⋯`**：改成 `Menu`（`side="top"`、`align="end"`、宽度仍 178px）。删掉 document 上的 pointerdown / keydown 和 `menuRef`。四项改为 `MenuItem`，「分叉会话」禁用改为 `aria-disabled`。
- **PermissionModeControl**：改成 `Menu`，两项是 `MenuItem` 加 `role="menuitemradio"` / `aria-checked`（保留原来右侧打勾的样子，不用 `MenuRadioItem` 左侧圆点）。删掉自写的方向键、Home / End、Esc、document 监听和失焦关闭。
  - 选当前模式：菜单关闭，不提交（和原来一样）。
  - 换模式：`onSelect` 里 preventDefault，菜单先不关；保存成功才关，失败时菜单留着（和原来一样）。
  - 焦点：保存期间触发器是禁用的，Radix 关闭时还焦点会落空。改为等 `submitting` 变回 false、按钮可用后再还给触发器。原来在 `finally` 里直接 `focus()`，那时按钮还没恢复可用，实际也落空。
- **SessionStatusButton**（侧栏状态点的说明）：改成 `Popover`。IconButton 自带 Tooltip，不能再套 `PopoverTrigger`，所以用 `PopoverAnchor` 包住状态点定位，开关仍由按钮的 `onClick` 控制；点按钮本身不算「点外面」（`onInteractOutside` 里排除）。
  - 和原来不同的地方：说明浮层原来是 `role="status"`、没有焦点；现在是 Popover（`role="dialog"`，名称「会话状态：空闲」等），打开时焦点进浮层，Esc 关闭后焦点回到状态点。
  - 打开说明时收起会话行的悬停提示（和右键菜单打开时一样）。不收起的话，提示盖在说明上面，Esc 先关掉的是提示。为此 `statusOpen` 提到 SessionRow。
  - 层级从 `z-20` 变为 `--act-z-popover`，portal 到 body，不再被侧栏的 overflow 裁剪。
- **与迁移前不同的地方（三处共有）**：打开从 click 变为 pointerdown（Radix 行为，PermissionModeControl、TurnActions）；键盘打开时焦点落在第一项（PermissionModeControl 原来落在当前选中项）；选项后焦点回到触发器；菜单外观跟 `menu-styles` 走（TurnActions 原来 34px、`text-act-md`、`font-semibold`、`p-1.5`，现在 32px、`text-act-sm`、`p-1`；PermissionModeControl 保留 `text-act-xs`）。
- **测试**：
  - permission-mode-control：改用 `userEvent`（Radix 在 pointerdown 打开，`fireEvent.click` 打不开），从 3 条到 7 条：保存成功后关闭并还焦点、保存失败菜单留着、键盘操作（打开、End、选当前模式只关闭、↓ 打开、Esc 还焦点）、保存中选项和触发器禁用且刷新完成后才还焦点、换会话时关闭。
  - conversation-view-tooltip 加 1 条：键盘打开 `⋯`，「分叉会话」禁用，没有可视化时不显示「重新生成」，↓ Enter 复制请求 ID 后关闭并还焦点，Esc 还焦点。
  - sidebar 加 1 条：状态点说明的打开、再点一次关闭、Esc 关闭并还焦点、点外面关闭、触屏点按钮也是关闭。
- **按钮基线**：TurnActions 7 → 3，PermissionModeControl 2 → 1，合计 239 → 234。
- **变异**：13 个，第一轮 8 个杀死；补上面的用例后，PermissionModeControl 的 3 个（不等按钮可用再还焦点、保存中不禁用选项、换会话不关）杀死。剩下 2 个存活，都在 SessionStatusButton：去掉「点按钮本身不算外面」、去掉按钮 `onClick` 里的 `stopPropagation`。jsdom 里鼠标和触屏两种点法都分不出差别（Radix 把外部点击推迟到 click，按钮的 onClick 先把状态置为关闭），保留这两处以防真实浏览器的事件顺序不同。收尾的 CDP 检查里加一项：状态点说明点开后再点一次，确认是关闭。
- **验证**：typecheck 通过；`--noUnusedLocals` 没有新增；全量 182 / 0 / 1 个文件，1397 / 0 / 2 个用例；`check:frontend-tokens`、`test:frontend-tokens` 通过；没有 U+FFFD。

### T17：T11–T15 碰过的文件里，视觉上是按钮的换成 Button / IconButton

范围：T11–T15 碰过的 12 个文件（Composer 归 09，不动），原生按钮 36 → 32 个。

| 文件 | 前 → 后 | 处理 |
|---|---|---|
| ConversationView | 4 → 3 | 执行轨迹顶上的「停止」→ `Button size="xs"`；三个「重试」补 `type="button"` |
| SettingsPrimitives | 9 → 7 | `SettingsMenuButton` 触发器（原本就是 `buttonClass({ variant: "ghost" })`）→ `Button variant="ghost"`；`Stepper` 的重置 → `IconButton`（自带 Tooltip，删掉外面手写的那层） |
| SubagentsPanel | 2 → 1 | 详情页「返回子 Agent 列表」→ `IconButton`（Tooltip「返回」） |
| Sidebar、SessionList | 5、2 不变 | 「重试」补 `type="button"` |

其余保留原生，原因：

- 列表行、导航入口（Sidebar 的新建 / 扩展 / 设置 / 分组标题、SessionRow 标题、SessionList 的「显示更多」、SubagentsPanel 的子 Agent 行、WorkspaceSection 的图标位和标签、SettingLinkRow）：整行是点击区域，不是按钮外观。
- 单选卡片、开关、分段控件（AppearanceSection 的主题卡和强调色、Toggle、SegmentedControl）：`role="radio"` / `role="switch"`，不是 Button 的语义。
- WorkbenchLayout 的两个遮罩：铺满的点击区域，已有 `type="button"` 和 `aria-label`。
- 侧栏会话行的置顶、归档（22px），TurnActions 的三个图标（30px、默认 65% 透明）：换成 `IconButton` 要改尺寸或用 className 覆盖颜色和透明度，违背 IconButton「className 只放布局与显隐」的约定，视觉也会变。
- Stepper 的加减：嵌在带边框的分组里，是分组的一部分，用 `aria-disabled`。
- ShortcutSettings 的录制按钮：里面是按键组合，键盘事件自己处理。
- InlineWarning 的文字链接、PermissionModeControl 的触发器（图标 + 箭头、`h-7 px-1.5`，Button 没有这个尺寸）。

focus：保留的原生按钮都有可见的 focus 样式（base.css 的全局 `button:focus-visible` 轮廓，或自己的 `focus-visible:ring` / `focus-visible:bg-*` / `group-focus-visible:ring`）。没有发现缺的，没有改。

视觉对比（vite + 无头 Chrome，`git stash` 前后各跑一次）：

- 设置 → 外观（1280×800）、设置 → 搜索：整页截图逐字节相同。
- Stepper 重置按钮：可见状态下截图逐字节相同（28×28、6px 圆角、`text-faint`）；**悬停时不同**：原来只变字色，现在和其他 ghost 图标按钮一样多一层 `hover-overlay` 底色。
- 执行轨迹的「停止」（streaming 场景）：**有变化**。原来 50×27、8px 圆角、透明底、常规字重、`py-1 px-3`；现在 44×26、6px 圆角、`surface` 白底、`font-medium`，和审批行的 `xs` 按钮一致。
- SubagentsPanel 返回按钮：mock 没有子 Agent 数据，没有截图。按类名对比：尺寸都是 28×28；圆角 8px → 6px；悬停底色 `surface-subtle` → `hover-overlay`；图标颜色从继承的主文字色变为 `text-faint`，悬停回到主文字色；多了 Tooltip。
- 「重试」只加了 `type`，不影响外观。

以上三处变化都是统一到 Button / IconButton 的结果，计划写的是「视觉不变」，列进总结请用户确认（不接受的话，停止按钮可以改回原生，另两处同理）。

- **按钮基线**：234 → 230（`--update-native-button-baseline` 写回，diff 只有上表三行）。
- **测试**：没有改测试。受影响的 subagents-panel、conversation-view-tooltip、provider-model-settings（「倍率减小」）、settings-page、sidebar 都按名字找按钮，全部通过。
- **验证**：typecheck 通过；改动文件 `--noUnusedLocals` 没有新增；全量 182 / 0 / 1 个文件，1397 / 0 / 2 个用例；`check:frontend-tokens`、`test:frontend-tokens`（15）、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。

### T18：文档

- **`front-基础组件封装规范.md`**：新增三节。
  - 「弹层原语」：原语清单和用途、`menu-styles` 共用外观、统一行为表（Esc、点外面、打开 / 关闭后的焦点、键盘、定位、no-drag）、业务组件里还允许的 Escape、Menu / Select / Popover / Dialog 怎么选、`UI_ONLY_ALLOWLIST` 的例外。
  - 「按钮收口与检查」：三类原生按钮的处理、T17 里不改的几种情况、`check:frontend-tokens` 守的三件事、更新基线的命令和核对方式。
  - 「大组件拆分的目录约定」。
  - 另把基础层清单里的 DropdownMenu 改为 Menu / ContextMenu / Select，命名示例改为 `ui/Menu`，迁移顺序第 3 项标为已完成，「看起来像按钮」表里消息操作菜单和 `SettingsSelect` 标为已迁移。
- **05**：头部加「已按 16 实施」；新增 §7「实施后的更正」9 条：按钮数口径（289 → 按次数 239 → 230）、§1.2 没列的弹层、16 开始时的行数、实际的 `ui/` 清单、§2.2 与实际行为不同处（Menu 非模态、菜单项 32px、`line-subtle` 不存在、Esc `stopPropagation`、`OpenerCapture`）、§2.4 是基线不是白名单注释、§3 目录（没有 `features/`，各区域与本文的出入）、§3.3 / S6 **没有用 `key={draftKey}`**（单次挂载 + 附件存进 store）、§5 验收的现状。
- **06**：§1.5 附件串会话那行、§5 的 `key={draftKey}`、S3、验收里的附件测试，都标注 16 T14 已处理、不用 key。
- **07**：V2、V3、V4 补核实结论。
- **README**：05 那行标「已按 16 实施」，迁移去向改为已合并；风险表 P1「附件串会话」「10+ 套弹层」划掉并注明。
- **技术债**：新增「Desktop 前端组件遗留」：RightPanel / SettingsPrimitives / WorkspaceChromeControls 超过 500 行、三处手写弹层、`handleArchiveWorkspace` 与侧栏分组不一致、`usageSnapshot` 死状态、`SubAgentTranscriptPanel` 疑似死代码。「未迁移的按钮形态」那条更新为现状。
- **`frontend-ui-components-foundation.md`**：状态行更新（新增的原语、Sheet 已删）；DropdownMenu 勾选，Switch 单独留一项。
- **`front-tailwind-style-architecture.md`**：`check:frontend-tokens` 那段加一句新增的三项检查，链到规范。
- **验证**：`check:current-docs` 通过；没有 U+FFFD。

### 收尾验收（Electron，CDP 真实输入）

在临时数据目录 `/tmp/actspace-cdp-data` 下构建并启动 Electron，用 CDP 发真实的键盘、鼠标、触摸事件，逐项核对弹层行为。不能用 computer use，所以下面都是 CDP 注入的输入，不是人手操作。

| 项 | 操作 | 结果 |
|---|---|---|
| 侧栏右键菜单（键盘） | 聚焦会话标题，Shift+F10 → ↓ → Enter 进入重命名 → Esc | 菜单打开时焦点在「置顶」；Enter 后焦点在重命名输入框；**Esc 后焦点原先落到 body**（已修，见下） |
| 侧栏右键菜单（鼠标） | 右键 → Esc / 点外面 | 只关菜单；窄窗下侧栏覆盖层不被连带关掉 |
| 图片生成设置对话框 | 打开 → Tab 循环 → Esc | 初始焦点在 API Key 输入框；Tab 不出对话框；Esc 关对话框、焦点回触发器、设置页还在 |
| 文件「打开方式」菜单 | 右侧面板打开 README.md，Enter 打开 → ↓ → Esc | 焦点落在上次用的 Finder；↓ 到 Terminal；Esc 后焦点回触发器、面板还在 |
| 会话状态说明 | 鼠标点开、再点关、点外面、Esc、触摸点按 | 都符合 T16b 的预期；T16b 里那几个靠 jsdom 测不出的变异（点按钮本身不算外面）在真实输入下行为正确 |
| 会话状态说明 + 行提示 | 悬停行出提示 → 点状态点 → 指针移走点外面 | **说明关掉后行的悬停提示又冒出来，一直挂着**（已修，见下） |
| 窄窗 480px：右键菜单 | 在侧栏覆盖层最后一行的右端右键 | 菜单向左让开，完整在窗口内（155–339） |
| 窄窗 480px：「复制」子菜单 | 键盘 → 进子菜单 | 右侧放不下，翻到左侧，但左边也只有 155px，子菜单 208px 宽，**左边被裁掉 52px**（见下「窄窗子菜单」） |
| 窄窗 480px：设置页 Select | 「默认会话模型」在中部、「快速唤起打开目标」在底部 | 中部向下展开，底部向上翻；都在窗口内；初始焦点在选中项；Esc 焦点回触发器 |
| 窄窗 480px：权限模式菜单、消息 ⋯ 菜单 | 点开 → Esc | 都在窗口内（权限菜单向上）；Esc 焦点回触发器 |
| 默认宽度截图 | 会话页、设置通用页、模型页 | 与改前一致，没有看到错位 |

两处修复（同一次提交，`SessionRow.tsx`）：

- **重命名用 Enter / Esc 结束后焦点回到标题按钮。** 输入框卸载后焦点原先掉到 body，键盘用户得从头 Tab。点别处失焦提交时不抢焦点，焦点留给用户点的地方。
- **状态说明、右键菜单、重命名接管这一行期间，不接受行提示的「打开」。** 原因在 Radix 的受控状态：接管期间传给 Tooltip 的 `open` 是 false，Radix 想「关」提示时值没变，不回调 `onOpenChange`，「开」却照样回调（点状态点时焦点进说明浮层，React 的 focus 事件穿过 portal 冒泡到行上的 TooltipTrigger）。于是 `tooltipOpen` 停在 true，接管结束后提示自己冒出来，指针早就不在行上了。改为 `onOpenChange={(open) => setTooltipOpen(open && !tooltipSuppressed)}`。T8 前的写法（`tooltipOpen && !menuPosition && !isRenaming`）有同样的问题，只是旧的手写说明浮层不在行的 React 树里收焦点，不容易触发。
- 测试：`sidebar.test.tsx` 加三条（键盘结束重命名还焦点、失焦提交不抢焦点；状态说明关闭后提示不冒出来；键盘打开菜单 / 说明后点别处关掉，提示不冒出来）。变异：去掉还焦点的 4 处、去掉 `open && !tooltipSuppressed` 过滤，全部被杀。也试过「接管开始时清 `tooltipOpen`」，三个变异都杀不掉，说明只靠过滤就够，没有保留。
- Electron 复核：重建后重跑，Esc 结束重命名焦点回到标题按钮（随后出现的提示是标题按钮的聚焦提示，符合预期）；点状态点 → 点外面，1.5 秒后没有残留提示。

**窄窗子菜单。** 窗口最小宽度是 480（`window-security.ts`），侧栏覆盖层打开时，右键菜单在 155–339，右边剩 141px，左边剩 155px，「复制」子菜单 208px 宽，哪边都放不下。Radix 的 `collisionPadding` 只决定翻转，`avoidCollisions` 下 `shift` 只在主轴的垂直方向（上下）挪，所以水平方向会出界。16 之前的手写子菜单固定在 `left-[calc(100%+4px)]`，在这个宽度下右边会出界更多，不是回归。两个子项「复制 ID」「复制会话记录」仍可用键盘操作，只是左边几个字看不见。没有改：给子菜单设 `max-w` 或改成在主菜单内展开都是交互变化，记进技术债。

验收中另发现两处 16 之前就存在的问题，没有改，记进技术债：

- `ProviderKeyModal` 打不开：`SettingsPage` 把 `setKeyModalProvider` 作为 `onConnectProvider` 传下去，但 16 之前的 `ProvidersSection` 只解构不调用，现在 `sections/` 里也没有调用方。所以 T7 的 Tab / Esc 走查用图片生成设置对话框代替。
- Composer 的「更多审查操作」`⋯`（`review-overflow-button`）没有 `onClick`，点了没有反应；16 之前就是这样。

### 复核处理（Sonnet 只读复核）

范围是 `59e8e64b..HEAD` 的 `apps/desktop/src` 和 `scripts`。5 条发现，逐条读代码核实：

| # | 发现 | 核实 | 处理 |
|---|---|---|---|
| 1 | `ui/Select` 的内容没有在 Esc 上 `stopPropagation`，Menu / ContextMenu / Popover / Dialog 都有。设置表单外层（`CustomModelForm`、`ProviderSettings`、`SettingEditor`）用 React `onKeyDown` 监听 Esc 返回上一步，下拉 portal 到 body，但合成事件仍沿组件树冒泡：在「能力来源」「推理支持」等下拉里按 Esc，会连表单一起退出，未保存的编辑丢失 | **属实，T10 引入的回归**（旧的手写下拉自己处理 Esc）。先写用例复现（外层 `onKeyDown` 被调用），再修 | `Select.tsx` 内容加 `onKeyDown` 拦截 Esc；`ui-menu-popover-select.test.tsx` 加一条，和 Menu 的同类用例对称 |
| 1b | Composer 在 document 上监听 keydown，Select 里按 Esc 也会让 Composer 收起自己的浮层 | 属实但无害：那个监听只收起 Composer 自己的菜单，Select 开着时它们本来就是关的。React 的 `stopPropagation` 拦不住 document 原生监听，Menu 也一样 | 不改；Composer 的菜单随 09 改用原语后这个监听会删掉 |
| 2 | Composer 只挂一次后，换会话时菜单、上下文用量浮层、`sending`、模型运行时选项都不重置 | **部分属实**。16 之前 Composer 也没有 key，ConversationView 也没有按会话 key，两个有消息的会话之间切换本来就是同一个实例，这些状态一直会带过去；16 新增的只是「新建页 ↔ 会话」之间也不重挂了。其中开着的菜单和上下文用量浮层带到别的会话（显示的是新会话的数据）最容易看到 | 换会话（`draftKey` 变化）时调用 `closeFloatingPanels()`，`composer.test.tsx` 加一条（在 A 打开添加菜单 / 上下文用量，换到 B 后都关了）。`sending` 跨会话、模型运行时选项带过去是 16 之前就有的，记进技术债，归 09 |
| 3 | A 发送中切到 B，A 随后失败：catch 只把文字写回 A 的草稿，附件靠 App 的 `draftRestore` 恢复，`sentAttachments` 的预览 URL 没有释放 | 属实，但和 `59e8e64b` 上的代码逐行相同，不是回归。App 的恢复草稿里附件不带预览（`withoutPreview`），原来的预览 URL 会一直占着 | 不改，记进技术债，归 09。附件进 store 以后可以在这里写回 A 的附件草稿，但要和 `draftRestore` 的顺序一起设计 |
| 4 | `CustomConnectionModels.tsx:188` 外层 `div role="button"` 里嵌了菜单按钮和开关 | 属实，16 之前就是这样 | 不改，记进技术债 |
| 5 | 检查脚本的漏报 / 误报：不认 `motion.button`、`role="button"`、`role={cond ? "dialog" : …}`；字符串里的 `/*` 会被当成注释开头；行尾注释里的 `<button` 会多数 | 属实，但仓库里目前没有这些写法（grep 过）；行尾注释多数只会让检查更严 | 不改。规范「按钮收口与检查」已写明它数的是 `<button`，基线写回要人工看 diff |

另外核实为正确的（复核列出的）：Dialog / Popover 的 Esc 隔离和 `OpenerCapture` 还焦点；`use-panel-layout` 看 `defaultPrevented`，窄窗下 Esc 不连带关侧栏（Electron 里也实测过）；ContextPopup 的 `onInteractOutside` 和 `data-composer-floating`；附件草稿的换入、卸载不释放、evict 释放；PermissionModeControl 换会话关菜单、保存后还焦点；SessionRow 的重命名焦点；仍监听 document 的四处（RightPanel、ModelSettings、ReplyHtmlRenderView、SubAgentTranscriptModal）都是手写的非 Radix 浮层，不会和原语重叠。

- **变异**：去掉 Select 的 Esc 拦截、去掉换会话时的 `closeFloatingPanels()`，新加的两条用例都失败（修之前先跑过，确认是红的）。
- **验证**：typecheck 通过；全量 182 / 0 / 1 个文件，1402 / 0 / 2 个用例；`check:frontend-tokens`、`test:frontend-tokens`（15）、`check:renderer-bridge`、`check:current-docs` 通过；没有 U+FFFD。

## 遇到的问题

- T16b 的提交说明（067247ea）第二条里「恢复可用」的「恢复」写坏成了 U+FFFD。按约定不 amend；squash 时用 00 §5 的模板重写说明，这条不会进主线。之后写完提交说明先查一遍 U+FFFD 再提交。

## 跳过或推迟的事项

- T7：ResponseAnnotationPill 保留 HoverCard，未改 Popover。见 pauses.md P2，待用户确认。
- T10：ModelSettings 的「选择启用模型」可搜索多选仍是手写 listbox（document 监听、无方向键），不在 16 的范围，也没有排进其他计划。
- T12：`SessionStatusButton` 的说明浮层仍是手写的（document 上的 mousedown 和 Esc 监听），T12 只搬不改，列进 T16 的 Esc 排查。→ T16b 已改用 Popover。
- T12：App 的 `handleArchiveWorkspace` 自己按 `workspaceId` / 路径挑要归档的会话，规则和侧栏分组不完全相同。例如带着本机工作区 id 的远端会话会被它算进去，侧栏却把它分在远端组；`workspaceId` 是已不存在的 id、路径却和某个工作区相同的会话，侧栏归进那个工作区，它却不算。所以「归档全部」可用与否和实际归档的范围，在这类边角情况下可能不一致。计划只要求合并 Sidebar 里的两份，这份没有动，记为后续候选。
- T13：TurnActions 的 `⋯` 菜单仍是手写的（document 上的 pointerdown 和 Esc 监听），T13 只搬不改，列进 T16 的 Esc 排查。→ T16b 已改用 Menu。
- T15：WorkbenchLayout 的 `usageSnapshot` 状态从未被写入（`setUsageSnapshot` 没有调用方，HEAD 上就是这样），SettingsPage 收到的 `usageSnapshot` 恒为 null。是否删掉这个 prop 链要看 SettingsPage 的用量页，不在 16 的范围，记为后续候选。
- T15：`keyResizeLeftPanel` 里「侧栏收起时用键盘展开到最小宽度」这段分支走不到（侧栏收起时 SplitView 不渲染左侧分隔条），只搬不改。
- T16：RightPanel 标签溢出菜单（菜单项里嵌「关闭标签」按钮）、ReplyHtmlRenderView 的可视化文件列表，仍是手写弹层。不在 05 §1.2，迁移要改交互或结构，记为后续候选。
- T16：`SubAgentTranscriptPanel`（`SubAgentTranscriptModal.tsx`）在 renderer 里没有找到使用方，只有一个测试引用，可能是死代码，记为后续候选。
