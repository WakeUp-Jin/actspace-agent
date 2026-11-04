# Composer 文件引用与回复批注

管两类「结构化上下文」：回复批注（选中助手回复里的文字加入对话，已实现）和 `@` 文件引用（正文里的 inline 引用，目标设计，**尚未实现**）。输入框整体形态见 [front-聊天输入框规范.md](front-聊天输入框规范.md)；Markdown 回复的渲染见 [front-聊天区Markdown渲染规范.md](front-聊天区Markdown渲染规范.md)。实施决策修订表、方案取舍、开放决策与验收清单见 `docs/exec-plans/completed/design-archive/frontend/front-composer-mentions-annotations-决策与验收.md`；执行计划见 [执行计划 README](../../exec-plans/active/20260928-composer-mentions-annotations/README.md)。

## 1. 对象与职责

| 对象 | 位置 | 性质 |
| --- | --- | --- |
| 图片 / 普通文件附件 | panel 内、输入框上方的 tile | 独立附件，不进入正文，见聊天输入框规范「附件」 |
| 回复批注 | Composer 上方一个「N 条批注」胶囊；回复里的高亮与编号圆点 | 对某条助手回复的 anchored reference，发送前属于草稿，发送后成为用户消息的结构化内容 |
| `@` 文件引用 | 正文光标处的 inline 引用 | 只带工作区相对路径，不静默读文件 |

- 引用文字、批注和评论一律按不可信文本用 React text children 渲染，不用 `dangerouslySetInnerHTML`；文件名与路径不当作 HTML。
- 批注不伪装成文件附件，也不并入正文字符串；不通过修改历史助手 Markdown 写入批注。

## 2. 数据契约

契约真源是共享包 `packages/util/shared/src/composer-content.ts` 与执行计划 P0 内容块契约，这里只写前端依赖的要点。

- 发送、草稿、历史都只用 `{ text, fileReferences, responseAnnotations }`；不跨 IPC、不持久化编辑器 document。
- `FileReference`：`relativePath`（POSIX、相对 session workspace、不以 `/` 开头、不含 `..`）+ `displayName`（仅展示，不是身份）。
- `ResponseAnnotationReference`：`annotationId`、`assistantMessageId`（回复的 `MessageBlock.id`）、`selectedText`、`startOffset` / `endOffset`（「可批注可见文本」的 UTF-16 偏移，start < end）、`prefixContext` / `suffixContext`、可选 `comment`。
- 上限（`COMPOSER_REFERENCE_LIMITS`）：文件引用 20 条、相对路径 1024 字符、显示名 255；批注 20 条、选中文本 8000 个码点、评论 2000 个码点、前后文各 64 个 UTF-16 码元。超限在本地给出明确提示，不静默截断。
- 持久化：用户消息以 surface content 块写入 journal，新增 `file-reference`、`response-excerpt` 两种块；模型文本由 `toLlmContent` 渲染（同一条消息的文件引用合并成一段），context 用量自动计入；旧 session 天然兼容，投影后 `MessageBlock.user` 多出 `fileReferences` / `responseAnnotations`。
- 模型可见内容只有文件相对路径、选中原文和用户评论，不含内部消息 id、编号或 UI 文案；日志只记数量、长度和校验结果，不记引用正文。
- 校验在 main / Host：文件引用按 session 的 workspace 重新解析，字面 + realpath 双重校验，拒绝绝对路径、`file://`、远程 URL、符号链接逃逸和非普通文件；批注校验 `assistantMessageId` 属于当前 session、长度在上限内，失败返回结构化错误（`ComposerReferenceIssue`）。文件引用不绕过权限：Agent 真正读取仍走 `read_file` / `grep` 等工具及审批。
- Chat 形态：`@` 关闭且 main 拒绝文件引用；回复批注在 Chat 中可用。
- 草稿：只在应用运行期间存在于 `SessionLocalStore`，按 sessionId 隔离，不写 Journal；发送成功清空，发送失败完整恢复正文、附件和批注（校验原会话 ID）。引用的源回复暂不在已加载窗口时草稿仍保留，加载后再定位。

## 3. 回复批注（已实现）

组件：`components/messages/ResponseSelectionMenu.tsx`、`ResponseAnnotationCommentPopover.tsx`、`ResponseAnnotationHighlights.tsx`、`ResponseAnnotationMarkers.tsx`、`useResponseAnnotationState.ts`、`response-annotation-text.ts`，Composer 侧 `composer/ResponseAnnotationPill.tsx`。

### 3.1 可批注范围

- 只处理助手回复里 Markdown 渲染出的文本：普通段落、标题、列表项、引用、表格单元格。
- 不支持：代码块、公式（`data-annotation-exclude`）、图片、工具行、Thinking、跨消息选区，以及起点或终点落在未收录文本里的选区。选区跨过这些节点时不出现「添加到对话」，代价是含公式的句子不能整句批注。
- 选区为空、只含空白或超过 8000 个码点时不显示入口。相邻块之间在可批注文本里补一个虚拟 `\n`；首尾空白收缩掉。
- 同一回复的同一文本范围按 identity 去重；总条数达到上限提示「最多引用 20 段回复」。

### 3.2 定位

- 不保存屏幕坐标。先用 `assistantMessageId` 找到回复，再用偏移还原 DOM Range；偏移失效时用 `selectedText` + 前后文做唯一匹配，匹配数为 0 或多于 1 时标记 unresolved，只显示引用，不在错误位置画高亮和圆点。
- 高亮用 CSS Custom Highlight API（`act-annotation`、`act-annotation-active`），不改 DOM；回复 DOM 晚于组件提交（分页加载、重渲染）时观察 DOM 变化后重新解析；环境不支持时不画高亮。

### 3.3 添加与评论

1. 拖选或键盘扩选松开后，在选区最后一行右下方出现「添加到对话」菜单（`Popover` 定位，下方放不下翻到上方，水平限制在视口内）。拖选过程中不出现；选区清空、Esc、滚动时关闭；打开时不移动焦点，避免打断键盘扩选。整个会话只挂一个菜单实例。
2. 点击后只创建草稿批注，不发送；原生选区清除，并在选区旁弹出评论框（placeholder「添加评论（可选）…」）。
3. 评论框：Enter 保存（空内容即无评论），Shift+Enter 换行，Esc 取消且不改评论，点外部保存已输入内容，IME 组词期间不提交；评论不复用 Composer 的 Slash 菜单。

### 3.4 草稿态

- 回复里：被引用原文淡蓝高亮 + 原文最后一行右上角的蓝色编号圆点（`bg-annotation-mark`，16px，上标式贴字，多个圆点最小间距 16px），圆点是可聚焦 button（`批注 N，编辑评论`），点击重开该条评论框。跨回复连续编号。
- Composer 里：只有一个「N 条批注」胶囊（有批注时进入多行布局）。悬停或聚焦弹出卡片，逐条显示选中文本和评论，每条有「编辑」「删除」，胶囊右上角 × 清空全部；Esc 先把焦点还给胶囊，随后不重新打开。悬停卡片条目时对应原文用加深高亮。
- 删除评论不删引用，移除引用才移除该上下文；清空只影响未发送草稿，不需确认。

### 3.5 已发送态

- 用户消息上方右对齐一个只读胶囊（同样「N 条批注」），卡片条目可点击定位到原回复并加深高亮；原回复不在已加载历史或定位不上时显示「原回复不可用」，仍保留选中文本与评论摘要。
- 已发送批注只读：只有查看和定位，没有删除、编辑或「复制到草稿」，不修改历史 user message；发送后回复上不留高亮和圆点。将来如要编辑历史批注，只能追加 `annotation_updated` / `annotation_removed` 事件，不改原始 journal 行。
- 批注摘要不被用户消息折叠遮蔽。

### 3.6 无障碍与性能

- 「添加到对话」、编号圆点、卡片里的编辑 / 删除 / 定位都是 button 且有可访问名称（`定位第 N 条批注的原文` 等）；hover 与 focus 等价；状态靠编号、焦点环、高亮表达，不只靠颜色。卡片因含可交互按钮必须有可进入的焦点顺序。
- 圆点位置用 layout effect + `ResizeObserver` / scroll 合并（`requestAnimationFrame`）重测，只对已加载且有草稿批注的回复计算；卸载时移除监听。定位失败不得清空正文、附件或批注。

## 4. `@` 文件引用（目标设计，未实现）

现状：Composer 正文仍是原生 `textarea`；仓库里只有 `ProseMirror` 依赖与 `test/editor-poc.test.tsx` 的可行性验证，没有 `@` 菜单，也没有 `file_mention` 节点。initial 形态 placeholder 已写「@ 引用文件」，在 PB 落地前与实际能力不符（待 PB 实施或改文案，见 [聊天输入框规范](front-聊天输入框规范.md)）。实施前以下方案视为目标，不是当前行为。

### 4.1 编辑器

- 用原生 ProseMirror（`prosemirror-model` / `state` / `view` / `keymap` / `history` / `commands`），不用 Tiptap，不在 `textarea` 里用正则替换实现 mention。
- schema 只有 `paragraph` / `text` / `hard_break` / `file_mention`；Markdown 按原文输入和发送，不做所见即所得。发送与草稿用 `{ text, fileReferences }`，需要时用 `plainTextToDoc` 重建节点；mention 的纯文本降级为 `@relative/path`，不能作为身份。
- `Composer.tsx` 外层布局、浮层互斥、模式 / 模型 / 发送保持不变；IME 组词期间不触发发送、菜单选择或历史输入。

### 4.2 触发与菜单

- 仅在编辑器可编辑、未 streaming、形态允许工作区上下文（Agent / Plan，不含 Chat）时启用。`@` 前是文首、空白或标点才打开；query 支持文件名、相对路径、中文，允许空格，用 query range 而不是字符串正则；第二个 `@`、Esc 关闭菜单并保留已输入文字。粘贴含 `@foo` 的文本不自动转成引用，只有显式选择建议项才创建节点。
- 与 `/` 菜单互斥。菜单是 combobox / listbox（`aria-activedescendant`），焦点留在编辑器：↑↓ 循环，Enter / Tab 选中，Esc 只关菜单，hover 改 active、点击确认；加载中 / 无匹配 / 失败重试各有一行说明；最大高度受视口限制、内部滚动。
- 每行：文件图标、文件名主标题、相对路径副标题（中段省略）；目录、大小、修改时间只在数据真实可用时显示。查询 debounce 约 100–200ms，旧结果不得覆盖新 query；workspace 切换清空旧结果。
- 文件搜索在 main：`git ls-files -co --exclude-standard`，非 git 仓库退回有上限的 Node 遍历，按 workspace 缓存 30 秒，不依赖 PATH 上的 `rg`。范围只含当前 session workspace，V1 只引用文件，不引用目录。

### 4.3 插入与编辑

- 选择后用 transaction 替换 query range；主显示文件名，tooltip 显示相对路径；节点不可被光标拆开，Backspace / Delete 一次删整个节点，方向键整体跨过，复制得到 `@相对路径`，不可直接编辑路径（重新 `@` 选择）。
- 文件被删除或 workspace 变化后历史 mention 仍显示，发送前由 main 重新解析，给出「文件不存在 / 不在当前工作区」的可解释错误并允许删除该 mention；草稿恢复同理。

### 4.4 模式

| 形态 / 模式 | `@` 菜单 | 发送语义 |
| --- | --- | --- |
| Agent | 可用 | 注册文件引用，Agent 按需读取 |
| Plan | 可用 | 同上，Runtime 仍不允许写操作 |
| Chat | 关闭 | 只有用户附件，不读工作区 |
| streaming | 关闭 | 等当前 run 完成 |

## 5. 不做

- 完整块编辑器；图片或普通文件成为正文 inline node；`@` 自动把整个文件内容塞进 prompt。
- 跨消息 / 代码块 / 图片 / 工具行选区批注；批注线程、多用户协作、评论通知；已发送批注的删除或编辑（见 3.5）。
- 把 renderer 传来的绝对路径交给 Agent 工具或 `shell.openPath`；保存屏幕坐标作批注唯一锚点；通过修改助手 Markdown 写入批注。
- 引用 workspace 外文件、引用目录（V1）。
