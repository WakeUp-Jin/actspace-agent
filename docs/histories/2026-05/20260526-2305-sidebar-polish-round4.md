## [2026-05-26 23:05] | Task: sidebar 与 Cursor 对齐 round4

### 🤖 Execution Context

- **Agent ID**: `353d1cc2-a4cf-41b2-ad82-b893122a9046`
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE (desktop, macOS)

### 📥 User Query

> 1. workspace folder（`actspace-agent`）hover 时应该「左边是下拉箭头、右边是 + 号按钮」，现在不是这样。
> 2. Pinned / Scheduled / Workspaces 分组标题不需要加粗，至少要和 Usage 这类主入口有一点区别（weight 维度），字号可以一样。
> 3. 图钉图标应该在**左边**——非 pinned 行 hover 时左侧的灰点变成图钉图标；现在图钉跑到右边去了。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（renderer）+ design docs。

**Key Actions:**

- **WorkspaceSection 头左右翻转**：把 + 号从 icon-slot 内移到右侧 `nav-section-actions` 区；icon-slot 改回「default Folder / hover Chevron」的图标切换，并整体变成一个 button，点击触发折叠。这样 hover 时左 = Chevron（折叠提示），右 = + 号（新建提示），跟用户截图一致；同时顺手把之前的 `<MoreHorizontal>` 占位按钮删掉——用户截图里没有它、上一轮也是我自己加的。
- **SessionRow 结构重构**：marker 从 `session-row-main` 里拆出来，变成 `.session-row` grid 的独立第 1 列。marker 内同位叠两层：`<span class="session-status-dot">` 和 `<button class="session-row-pin">`，通过 opacity 互斥切换（hover 或 pinned 时 dot 淡出、pin button 淡入）。右侧 `session-row-actions` 只保留 archive。
- **`.session-row` 从 flex 改成 grid `[14px | 1fr | auto]`**：与 workspace folder 头共用同一组列规，确保 marker / main / actions 三列严格对齐 workspace folder 的 icon-slot / name / actions 三列。
- **`.session-row-main` 简化**：现在只剩 `title + time` 两列，padding 0、display grid `[1fr auto]`，不再承担 marker 列；行 hover 高亮由父 `.session-row:hover` 提供。
- **分组标题 weight 520 → 440**：`.nav-section-label` / `.workspace-folder-label` 的 weight 故意比主入口（520）轻一档，字号继续保持 13.5/13px。这样用户能从粗细差快速区分"导航主入口"和"分组标题"两种语义，又不会让分组标题被压成脚注。
- **Pin 按钮新样式**：marker 容器内 `position: absolute; inset: 0; width: 14px; height: 14px`，配合 `transition: opacity 130ms`。未 pin 行默认隐藏、行 hover 显示；已 pin 行常驻显示，图标用 `<Pin fill="currentColor" />` + `var(--color-text)` 深色填充。
- **CDP 模拟 hover 验证**：用 `CSS.enable + CSS.forcePseudoState({ forcedPseudoClasses: ["hover"] })` 强制把目标元素切到 :hover 态，验证：
  - workspace folder hover → folder_glyph opacity 0、chevron_glyph opacity 1、add-button opacity 1 ✓
  - session row hover → dot opacity 0、marker 内 pin opacity 1、行尾 archive opacity 1 ✓
- **测试**：sidebar.test.tsx 16 个 case 全部通过（结构变化没有破坏任何既有断言，因为测试都按 aria-label 而不是 DOM 结构定位）。

### 🧠 Design Intent (Why)

- **左 = 折叠，右 = 新建**：把"展开/折叠这个工作区"和"在这个工作区起一个新 Agent"两条意图**空间正交化**。视觉上左侧的 Folder/Chevron 表达"我是个容器、我可以收起来"，右侧的 + 号表达"我可以孵化新内容"。Cursor 也是这个模式，肌肉记忆共享。之前我把 + 号放在 icon-slot 内、Folder 切到 Chevron 在右侧，结果用户每次都得思考"+ 号代表哪个动作"——这其实是因为我把两条意图叠在了同一个空间。
- **Pin 在左、Archive 在右**：marker 列承担"关于这条会话的状态/权重"语义——常态是灰点（"这条会话存在"），hover 升级为图钉操作（"我要把它钉起来 / 取消钉"），已 pin 时图钉常驻表达"已被钉起来"。actions 列承担"对这条会话的破坏性操作"语义——目前只有 archive。这样左右两侧的语义边界清晰：左侧改变会话在列表中的"位置/权重"，右侧从列表里"移除"它。Cursor 的 `📌 标题  1h  📦` 也是这种分工。
- **分组标题 weight 440 而不是 520**：上一轮把分组标题字号提到 13.5 是对的，但 weight 同样调成 520 让分组标题看起来跟主入口一样粗、几乎没区分。weight 440 介于"很轻"（300）和"普通"（500）之间，让用户扫读时能感受到"主入口比分组标题更主动、分组标题更像 section eyebrow"，但又不会因为太细而显得不够正式。
- **marker 拆出 session-row-main**：HTML 不允许 `<button>` 内嵌另一个 `<button>`，而 pin 按钮本身需要独立可点击。把 marker 从 main 内拆到行级 grid 的第 1 列后，pin 按钮可以正常作为兄弟元素存在；同时也让"整行点击 = 进入会话"和"marker 内点击 = pin 切换"在 DOM 上分得清清楚楚，不再依赖 event.stopPropagation 来抢路由。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`：
  - SessionRow marker / main / actions 三件套拆分，pin 按钮迁入 marker，archive 单独留在 actions。
  - WorkspaceSection 头左右翻转：icon-slot button 化、Folder↔Chevron hover 切换、+号迁入 actions 区，移除 More 占位。
  - Scheduled mock 行同步新结构（marker 独立、main 只剩 title + time）。
- `packages/desktop/src/renderer/styles.css`：
  - `.nav-section-label` / `.workspace-folder-label` weight 520 → 440。
  - `.session-row` flex → grid `[14px | 1fr | auto]`、padding 0 8、gap 8。
  - `.session-row-main` 简化为 `[1fr auto]` 双列。
  - `.session-row-marker` 改为 relative 容器，dot + pin 叠层；新 `.session-row-marker .session-row-pin` 样式（14×14 absolute）。
  - `.session-row-archive` 独立样式（之前与 pin 共享）。
  - `.workspace-icon-slot` 加 button 行为、Folder/Chevron 同位叠加；`.workspace-add-button` 改成行尾 22×22 普通按钮。
- `docs/design-docs/front-左侧会话栏规范.md`：
  - 分组标题字重改为 440 + 说明理由。
  - 「Workspace 文件夹行」改写为"左 = 折叠、右 = 新建"的语义分工。
  - 「会话行」拆成「marker 叠层（dot + pin）」「右侧 actions（只剩 archive）」两小节，明确 pin 在左、archive 在右的理由。
  - 字号基准段落同步 440。
