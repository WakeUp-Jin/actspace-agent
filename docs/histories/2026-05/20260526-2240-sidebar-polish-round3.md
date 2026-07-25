## [2026-05-26 22:40] | Task: sidebar 与 Cursor 对齐 round3

### 🤖 Execution Context

- **Agent ID**: `353d1cc2-a4cf-41b2-ad82-b893122a9046`
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE (desktop, macOS)

### 📥 User Query

> 还有点小 bug（附 Cursor 截图）：
>
> 1. Pinned / Scheduled / Workspaces 的下拉箭头应该在右边、hover 才出现，字号要和 New Agent 接近，目前太小。
> 2. workspace 文件夹（如 `actspace-agent`）和其下会话列表的文本要在一条水平线上，会话前面也要有 icon——一个灰色小圆点。
> 3. Workspaces 和它下面的 workspace 文件夹之间没有缩进，folder icon 要和 Workspaces 文本左对齐。
> 4. Pinned / Scheduled 的折叠箭头也要能用，目前只有 Workspaces 可以折叠。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（renderer）+ design docs。

**Key Actions:**

- **抽出 `NavSectionHeader` 公共组件**：Pinned / Scheduled / Workspaces 三个分组标题统一渲染——文本左对齐、字号 13.5px / weight 520（与「New Agent」同级），点击文字 = 折叠；右侧 `nav-section-actions` 整体默认隐藏，hover 时一同淡入，chevron 固定排在最右边，extraActions（Sort / New folder / More / New scheduled task 等）通过 slot 注入。
- **Pinned / Scheduled 加 collapsed state**：补齐 `useState`，让两个 section 像 Workspaces 一样可折叠，折叠态下不渲染对应内容。
- **WorkspaceSection 头改成 icon-slot + name + actions 的三列 grid**：`grid-template-columns: 14px minmax(0,1fr) auto; padding: 0 8px; gap: 8px`。icon-slot 里 `<Folder>` 默认占位、hover 时 Folder 淡出、`<Plus>` 按钮通过 `position: absolute; inset:0` 覆盖在同一格里淡入。点击 + 号 = 在该 workspace 起一次新 Agent；右侧把"hover Folder ↔ Chevron"语义移交给统一的 nav-section-chevron。
- **session-row-main padding 改为 `0 8px`**：与 workspace folder row 共用左侧网格，结果就是 folder icon X = session marker X = 18px，folder name X = session title X = 40px（视觉上文字连成一条左对齐线）。
- **SessionRow marker 改为常驻显示**：marker 元素始终渲染一个 `<span class="session-status-dot">`，通过 `is-muted / is-active / is-busy` 切换颜色（默认灰色锚点、active 蓝点、busy 呼吸蓝），不再随状态变化让 marker 出现/消失导致行抖动。Scheduled 占位行也用同一种 muted dot 保持对齐。
- **修复 button 默认 padding 偷偷推位的细节**：`.nav-section-label` 和 `.workspace-folder-label` 显式 `padding: 0`，否则浏览器默认的 `padding: 1px 6px` 会让 grid 列内的文字往右挤 6px，破坏严格的"文字左对齐线"。
- **顺手修一个 `UsageStatisticsView.tsx` 的语法错误**：发现一处多余的未闭合 `<button onClick={onRefresh}>`（应该用 `handleRefresh`），导致 typecheck 失败；删掉即可。
- **测试**：新增 3 个 case 覆盖「Pinned 可折叠」「Scheduled 可折叠」「每条 session row 都有一个 status dot」，sidebar.test.tsx 共 16 个 case；desktop 全套 30 个 case 通过。
- **设计文档**：`docs/design-docs/frontend/front-左侧会话栏规范.md` 补充「分组标题统一规范」「会话行 marker 常驻 + 三态」「分组标题字号改回 13.5px」三处。

### 🧠 Design Intent (Why)

- **分组标题不该比主入口小一截**：之前 12px / weight 500 让 Pinned / Scheduled / Workspaces 视觉上像是脚注，和 New Agent / Lab 形成断层。Cursor 把分组标题做到和主入口接近大小，保证用户在大量会话列表中扫读时不会被字号差异打断。
- **折叠靠右、hover 才出**：actspace 之前把 chevron 钉死在标题左侧，所有 section 在静态状态下都显得"装满了控件"。把 chevron 移到右侧 nav-section-actions 内、hover 才淡入，配上"标题文字也可点击折叠"的命中区，就既不抢视线、又确保折叠操作随时可达。同时让 chevron 和 Sort / New folder 等按钮共用一套 hover 显隐规则，section 标题之间的视觉行为完全一致。
- **session marker 常驻**：marker 不仅是状态信号，更是"这一行是可点击导航项"的视觉锚点。常驻一个 muted dot 后，行与行之间的列对齐天然成立，激活/busy 态切换也不会让前后行因为 marker 出现/消失而抖动；同时也跟 Cursor 的视觉一致。
- **folder name 严格对齐 session title**：让 workspace folder header 和 session row 共用同样的 `[14px | 1fr | auto]` grid + 同样的 padding，是为了把"工作区文件夹"和"它下面的会话列表"在视觉上焊成一棵树——眼睛只需要扫一条 X=40 的左对齐线就能读完整个工作区的会话目录，不会因为 folder name 多缩 几个像素而觉得它"飘"出来。
- **chevron 不再藏在 Folder icon 后面**：之前 Folder ↔ Chevron 的 hover 切换会让用户分不清"现在 hover 是为了新建还是为了折叠"。这一轮把"新建"留在 icon-slot（左）、"折叠"统一放到右侧 chevron（与 Pinned/Scheduled 一致），交互的两条意图被空间正交化。
- **顺手修 UsageStatisticsView 的语法错误**：另一个 agent 留下的悬空 `<button>` 导致仓库 typecheck 不过，本轮验证需要跑 typecheck，因此就地清除最小阻塞。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Sidebar.tsx`：抽出 NavSectionHeader、补 Pinned/Scheduled 折叠 state、WorkspaceSection 头改成 icon-slot + 三列 grid、SessionRow marker 改成三态常驻。
- `packages/desktop/src/renderer/styles.css`：分组标题字号 / chevron hover 规则、workspace-folder-row grid、workspace-icon-slot / +号叠层、session-row-main padding 8px、session-status-dot 三态、button padding 重置。
- `packages/desktop/src/renderer/components/UsageStatisticsView.tsx`：删除多余的未闭合 `<button onClick={onRefresh}>`。
- `packages/desktop/src/renderer/test/sidebar.test.tsx`：新增 3 个 case，sidebar 套件从 13 → 16。
- `docs/design-docs/frontend/front-左侧会话栏规范.md`：补「分组标题统一规范」「会话行 marker 三态常驻」「字号基准 13.5px」。
