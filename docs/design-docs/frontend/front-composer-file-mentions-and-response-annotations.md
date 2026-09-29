# ActSpace Composer 文件引用与回复批注设计

## 文档状态

- 状态：已确认方向，执行计划已拆分（见配套执行文档）；待实施。
- 日期：2026-09-28。
- 适用产品：ActSpace Desktop（Electron + React + TypeScript）。
- 参考对象：Codex App 的富输入框、`@` 文件引用、`/` 命令菜单、回复选区批注和悬浮批注卡片。
- 参考原则：借鉴交互模型和信息结构，不复制 Codex 的压缩 bundle、内部命名、品牌样式或私有协议。
- 配套执行文档：[ActSpace Composer 文件引用与回复批注执行计划](../../exec-plans/active/20260928-composer-mentions-annotations/README.md)。

## 实施决策修订（2026-09-28）

对照现有代码讨论后，以下决定优先于正文中与之冲突的描述；契约的唯一真源是执行计划 [P0 内容块契约](../../exec-plans/active/20260928-composer-mentions-annotations/p0-content-contract.md)。

| 主题 | 正文原描述 | 修订后 |
|---|---|---|
| 持久化（§10.2、§10.3） | `UserMessagePayload` 新增 `composerContent` / `responseAnnotations`，Runtime 注入独立 prompt segment | 用户消息实际以 surface content 块写入 journal（inbox claim 事件）。新增 `file-reference`、`response-excerpt` 两种内容块；模型文本由 `toLlmContent` 渲染，context 用量自动计入；journal 编码不改，旧 session 天然兼容。投影后 `MessageBlock.user` 多出 `fileReferences` / `responseAnnotations`。 |
| 编辑器 schema（§6.2、§6.4） | paragraph / code_block + bold / italic / code / link marks | 只有 `paragraph` / `text` / `hard_break` / `file_mention`；Markdown 按原文输入和发送。 |
| `ComposerContentPayload`（§6.3、§10.1） | 发送和保存 document + plainText + fileReferences | 不跨 IPC、不持久化 document。发送、草稿、历史只用 `{ text, fileReferences }`，需要时用 `plainTextToDoc` 重建节点。`composerContent.plainText === userInput` 的一致性校验随之取消。 |
| 文件引用身份（§7.4） | `workspaceId` + `relativePath` | 只带 `relativePath` + `displayName`；main 按 session 的 workspace 重新解析，字面 + realpath 双重校验。V1 只引用文件，不引用目录。 |
| 批注定位（§9.1、§9.2） | Markdown source ↔ DOM 的 `MessageTextLocator` 映射 | 只用「可批注可见文本」的 UTF-16 偏移 + 前后文（各 ≤ 64 码元）；前后文唯一匹配兜底，否则 unresolved。`assistantMessageId` 为回复的 `MessageBlock.id`。 |
| 编辑器依赖（§17-1） | 原生 ProseMirror 与 Tiptap 待 PoC | 原生 ProseMirror（约 64 KB gzip，6 个包）；Tiptap 约 138 KB gzip、30 个包。jsdom 下打字、查询范围、原子节点插删、undo 均可用。 |
| 文件搜索 | 未定 | main 用 `git ls-files -co --exclude-standard`，非 git 仓库退回有上限的 Node 遍历；按 workspace 缓存 30 秒；不依赖 PATH 上的 `rg`。 |
| workspace 外文件（§17-2） | 建议 V1 只含当前 workspace | 确认只含当前 session workspace。 |
| 已发送批注（§9.5、§17-3） | `删除` 为本地 overlay | 已发送批注只读：只有查看和「复制到草稿」，没有删除。 |
| 代码块批注（§17-4） | 建议不允许 | 确认不允许。 |
| 模型可见内容（§10.3） | 引用说明含 source message id | 只给选中原文和用户评论，不含内部 id、编号或 UI 文案。 |
| Chat 形态 | `@` 关闭 | `@` 关闭且 main 拒绝文件引用；回复批注在 Chat 中可用。 |
| 实施顺序（执行计划 M0–M7） | 一份大计划 | 拆为 P0 内容块契约 → PA 回复批注 → PB 编辑器与 `@` 文件引用。 |

## 1. 背景与问题

ActSpace 当前已经具备一部分基础能力：

- Composer 支持 follow-up 和 initial 两种布局。
- 输入区域支持自动切换 inline / stacked 布局。
- 图片与普通文件作为独立附件 tile 展示。
- `/` Slash Command 已实现，并接入模式切换、`/compact`、Context、Review 和 Skills。
- 助手消息通过 `MarkdownProse` 渲染 GFM、代码块和高亮。
- 用户消息已经支持附件投影、图片预览恢复和长文本折叠。
- Session 使用 `journal.jsonl` 和 Projection / MessageBlock 读取模型，不应让 renderer 直接访问文件系统。

当前仍有两个明显缺口：

1. 输入框本质上是 `textarea`。用户虽然可以通过拖放、文件选择和图片粘贴添加附件，但不能在正文光标位置以结构化方式插入 `@文件`，也不能让文件引用拥有独立的显示、删除、重命名或安全解析语义。
2. 助手回复中的文字只能被选择和复制，不能像 Codex 一样把选区作为“添加到对话”的上下文对象，随后在 Composer 中查看、编辑、移除，并在消息正文附近保留可回溯的编号 marker。

这两个能力在产品上有关联，但数据职责不同：

- `@文件` 是 Composer 正文中的结构化 inline reference。
- 回复批注是对已渲染 assistant message 的 anchored reference，发送前属于 Composer draft，发送后成为 user message 的结构化 context。
- 图片和普通文件附件仍然是 Composer 的独立 attachment，不并入正文编辑器节点。

## 2. 目标

### 2.1 产品目标

- 用户可以在输入框中输入 `@`，搜索当前工作区可引用文件，并在光标位置插入文件引用。
- 用户可以继续输入 Markdown、代码、链接和多行文本，编辑器视觉上保留接近普通输入框的轻量体验。
- 用户可以在助手回复中拖选文字，看到“添加到对话”操作，点击后将选区加入当前 Composer。
- Composer 可以同时容纳普通正文、`@` 文件引用、图片/文件附件和一个或多个回复选区引用。
- 用户可以在发送前查看每条回复选区引用的来源、选中文字和可选评论，并移除单条或全部引用。
- 已发送消息可以在历史记录中恢复这些引用；回复中的批注 marker 可以悬浮查看来源，点击定位；需要修改时复制为新的 Composer 草稿引用，不直接编辑历史消息。
- 文件引用和批注上下文都经过 main / Runtime 的安全边界校验，不信任 renderer 传来的绝对路径或 HTML。

### 2.2 工程目标

- 复用现有附件、Slash Command、Markdown、Session Journal、Projection 和 Electron IPC 体系。
- 让新能力具备明确的类型化契约，而不是在 prompt 文本中拼装不可逆的特殊标记。
- 把编辑器正文、附件、批注和发送 payload 分层，避免一次性重写整个消息协议。
- 支持渐进式迁移：第一阶段可以保留纯文本兼容，已有 Session 不需要迁移。
- 所有需要真实文件系统或持久化的能力都能通过 Electron 验收；浏览器 renderer 只负责 UI 和 mock bridge 场景。

## 3. 非目标与明确边界

### 3.1 V1 不做

- 不实现完整 Notion / Word 风格块编辑器。
- 不让图片或普通文件成为正文中的 inline node；它们继续显示在附件区。
- 不让 `@` 自动读取并把整个文件内容静默塞进 prompt。
- 不在 Chat 形态中默认打开工作区文件搜索。Chat 只允许显式的用户附件；如果未来允许 Chat 文件引用，需要另立权限和上下文策略。
- 不支持跨多条 assistant 消息的跨节点选区。
- 不支持跨消息批注合并、批注线程、多用户协作或评论通知。
- 不通过修改历史 assistant Markdown 正文来写入批注文本。
- 不保存屏幕坐标作为批注唯一锚点。
- 不把 renderer 传来的绝对路径直接交给 Agent 工具或 `shell.openPath`。
- 不复制 Codex 的源码、压缩 CSS、私有 API 或内部数据格式。

### 3.2 V1 行为取舍

- `@` 文件引用默认仅在 Workspace / Agent 形态可用。Plan 可用，但只允许引用当前工作区内可读文件；Chat 不显示工作区文件 mention 入口。
- 发送时文件引用只传递稳定的 workspace-relative identity 和显示信息。Agent 是否读取文件由现有 `read_file` / `grep` / `glob` 等工具按需决定。
- 回复选区先限制为一个 assistant message 内的连续纯文本选区；Markdown 代码块、图片、工具行和跨消息选区不进入 V1。
- 一条用户消息可以包含多条回复选区引用，但同一个 assistant message 的同一文本范围按 identity 去重。
- 批注编辑首版只允许编辑当前用户尚未再次发送的 Composer draft；已发送批注只支持查看和移除关联引用，不改写历史 user message。
- “添加到对话”按钮在选区存在且选择跨过有效文本节点时显示；鼠标离开选区后，按钮和选区状态一起退出。

## 4. 现有实现与改造边界

### 4.1 当前代码事实

| 能力 | 当前入口 | 当前状态 | 本次改造 |
|---|---|---|---|
| Composer 输入 | `apps/desktop/src/renderer/components/Composer.tsx` | `textarea` + 本地 `message` string | 保持外层布局和 toolbar，替换正文输入实现 |
| Slash Command | `apps/desktop/src/renderer/components/composer-slash-commands.ts` | 已有纯函数 catalog / filter / keyboard flow | 迁移为编辑器 suggestion source，行为保持一致 |
| 图片 / 文件附件 | `Composer.tsx`、`composer-attachment-service.ts`、`ComposerAttachment` | 独立 attachment tile | 保持独立，增加和 mention / annotation 共存的布局规则 |
| 助手 Markdown | `messages/MarkdownProse.tsx`、`messages/AssistantReply.tsx` | `react-markdown` + GFM + highlight | 增加可选 selection layer / marker layer，不替换 Markdown renderer |
| 用户消息 | `messages/UserMessage.tsx` | `content` + `attachments` | 增加已发送 reference summary 的非编辑投影 |
| 发送契约 | `packages/shared/src/ipc.ts`、`App.tsx` | `RunAgentInput.userInput` + attachments | 增加结构化 composer context，保留 userInput 兼容字段 |
| Session payload | `packages/shared/src/session.ts`、`packages/client/src/sessions/chat.ts`、selectors | user message payload 有 content / attachments | 增加可选 reference / annotation payload |
| 文件安全边界 | main / Host / Tool Runtime | 已有 workspace、realpath、permission 约束 | mention resolve 必须复用同一边界 |

### 4.2 不改动的基础能力

- 现有 `/compact` 仍走独立 context compaction IPC，不写入普通 user message。
- 现有图片文件选择、粘贴图片、预览恢复和 `previewUrl` 剥离规则保持不变。
- 现有 Chat / Plan / Agent 模式硬边界保持不变。
- 现有 `MarkdownProse` 的普通 Markdown、代码和链接语义保持不变。
- 现有 session 事件追加式存储不改为可变文档存储。

## 5. 用户体验总览

### 5.1 Composer 分层

Composer 的可见结构改为以下顺序：

```text
Composer wrapper
├─ Review / overflow strip
├─ Composer panel
│  ├─ reference tray（回复批注；有内容时显示）
│  ├─ attachment strip（图片 / 普通文件 / pasted text；有内容时显示）
│  ├─ rich editor body
│  │  └─ paragraph / inline text / file mention / link / code block
│  └─ toolbar
│     ├─ + / attachment command
│     ├─ mode pill
│     ├─ model / context controls
│     └─ send / stop
└─ status row
```

输入正文和上下文引用有明确视觉差异：

- 正文是用户正在编写的内容，光标可以进入其中。
- `@文件` 是正文内的 inline reference，显示文件名或相对路径片段，可选择、删除和悬浮预览。
- 图片 / 普通文件是正文上方的 attachment tile，不能被光标当作正文字符编辑。
- 回复批注是正文上方的 reference card / compact chip，来源是某条 assistant 回复，不应该伪装成普通文件附件。

### 5.2 交互状态矩阵

| 状态 | 输入正文 | `@` 菜单 | `/` 菜单 | 附件区 | 批注区 | 发送 |
|---|---|---|---|---|---|---|
| 空草稿 | placeholder | 关闭 | 关闭 | 隐藏 | 隐藏 | 禁用 |
| 输入 `@` | 光标保留在 editor | 打开 file suggestions | 关闭 | 保持 | 保持 | 允许发送普通文本但不应因菜单误发 |
| 输入 `/` | 光标保留在 editor | 关闭 | 复用现有 Slash menu | 保持 | 保持 | Enter 选命令，不发送普通消息 |
| 有文件引用 | mention 节点可删除 | query 改变时更新 | 关闭 | 可共存 | 可共存 | 允许 |
| 有回复批注 | 正文可编辑 | 关闭 | 关闭 | 可共存 | 显示 count 和 cards | 允许，除非仍有上传中附件 |
| streaming | editor disabled | 关闭 | 关闭 | 只读 | 只读 | stop |
| 发送失败 | 草稿恢复 | 按原状态恢复 | 按原状态恢复 | 原样恢复 | 原样恢复 | 可重试 |
| 窄窗口 | stacked | 限高、内部滚动 | 限高、内部滚动 | 换行 | 换行 / 横向不溢出 | 保持可见 |

## 6. 富文本 Composer 设计

### 6.1 编辑器选择

建议使用 ProseMirror 生态的轻量封装，而不是继续扩展 `textarea` 的字符串替换逻辑。原因：

- `@` 和 `/` 需要根据光标所在位置、当前 query range 和 selection range 工作。
- 文件引用需要作为 inline atom / inline mention node 存储属性，而不是依赖字符串反解析。
- Markdown、列表、代码块、链接和撤销历史需要共享编辑器 transaction。
- 选中 mention、删除 mention、粘贴 Markdown 和输入法组合输入都需要稳定的 document model。
- Codex 已经证明类似交互基于 ProseMirror 可行；ActSpace 可以只引入所需节点和插件，不引入完整编辑器产品。

正式依赖选型应在执行计划的第一个实现切片中通过最小 PoC 决定：

- 方案 A：直接使用 `prosemirror-model`、`prosemirror-state`、`prosemirror-view`、`prosemirror-inputrules` 等包，控制依赖和 schema。
- 方案 B：使用 Tiptap 作为 ProseMirror 封装，减少插件样板，但增加依赖层和默认行为。

设计不允许为了少改几行代码而在 `textarea` 中实现正则替换式 mention。最终编辑器必须有可序列化的 document schema 和明确的 selection transaction。

### 6.2 V1 Schema

建议的最小 schema：

```ts
type ComposerDocument = {
  version: 1;
  blocks: ComposerBlock[];
};

type ComposerBlock = {
  type: "paragraph" | "code_block";
  children: ComposerInline[];
};

type ComposerInline =
  | { type: "text"; text: string; marks?: ComposerMark[] }
  | {
      type: "file_mention";
      referenceId: string;
      displayName: string;
      relativePath: string;
      workspaceId?: string;
    }
  | { type: "hard_break" };

type ComposerMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; href: string };
```

实现时可以使用 ProseMirror Node JSON 作为 renderer 内部格式，但跨 IPC / Session 边界必须使用 ActSpace 自己版本化的 DTO，不把 ProseMirror 私有 JSON 直接当公共协议。

### 6.3 正文序列化

发送时同时保留两个层次：

```ts
type ComposerContentPayload = {
  schemaVersion: 1;
  plainText: string;
  document: ComposerDocument;
  fileReferences: FileReference[];
};
```

- `plainText` 用于历史兼容、搜索摘要、降级展示和日志脱敏。
- `document` 用于精确恢复正文和 mention 视觉。
- `fileReferences` 是归一化后的引用集合，便于 main / Runtime 做安全校验和上下文注入。

`plainText` 的 mention 降级文本建议为 `@relative/path`，但不能作为安全身份来源。发送链路必须以 `fileReferences` 重新解析并校验。

已有 `RunAgentInput.userInput: string` 可以短期保留：

```ts
type RunAgentInput = {
  // 兼容字段：等于 content.plainText
  userInput: string;
  composerContent?: ComposerContentPayload;
  attachments?: ComposerAttachment[];
  responseAnnotations?: ResponseAnnotationReference[];
  // 其他现有字段保持不变
};
```

当 `composerContent` 存在时，Runtime 以结构化内容为准，`userInput` 仅作为兼容和诊断摘要；二者的 plain text 不一致时 fail closed，不静默选择其中一个。

### 6.4 Markdown 行为

V1 目标不是让编辑器把所有 Markdown 语法实时渲染成最终回复样式，而是做到：

- 普通文字、换行、列表、代码块和链接可以自然输入。
- 已存在 Markdown 草稿可以恢复为编辑器文档。
- mention 节点在编辑态显示为稳定 inline chip / token。
- 发送时保留结构化 document 和 plain text。
- 历史恢复时结构化 document 优先；缺失时从 `plainText` 走受限 Markdown 解析降级。

建议先采用“编辑态轻量富文本”而不是完全所见即所得：正文保持接近当前字号和行高，代码块、链接和 mention 有轻量视觉提示，不把每个列表项做成重卡片。这样可保持 ActSpace 当前 Composer 的桌面 command bar 质感。

## 7. `@` 文件引用设计

### 7.1 触发规则

- 仅在编辑器可编辑、未 streaming、当前形态允许 workspace context 时启用。
- 用户输入 `@` 后，如果光标前是文档起点、空白、标点或允许的 mention boundary，打开建议菜单。
- query 允许文件名、相对路径、目录名和中文关键词。
- query 中出现空格时不立即关闭；空格用于支持路径显示和中文文件名，但建议菜单需用 query range 而不是简单字符串正则。
- 用户输入第二个 `@`、在代码块内输入 `@` 或主动按 Escape 时，关闭菜单并保留已输入文字。
- 粘贴包含 `@foo` 的普通文本不自动把所有内容转换为文件引用；只有显式选择建议项或通过专门的“解析引用”动作才创建节点。
- `/` 和 `@` 菜单互斥；打开其中一个时关闭另一个。

### 7.2 文件建议菜单

菜单结构：

```text
┌──────────────────────────────────────────┐
│ 搜索当前工作区文件                        │
├──────────────────────────────────────────┤
│ 最近引用 / 当前目录（可选）               │
│  src/components/Composer.tsx              │
│  apps/desktop/src/renderer/App.tsx        │
│  docs/design-docs/frontend/...             │
├──────────────────────────────────────────┤
│ 加载更多 / 无匹配 / 加载失败重试           │
└──────────────────────────────────────────┘
```

每行显示：

- 文件类型图标或轻量扩展名标识。
- 文件名作为主标题。
- 相对路径作为副标题，必要时中段省略。
- 目录、文件大小或最近修改时间只在数据真实可用时显示，不为填充信息伪造。

前端状态：

```ts
type FileMentionMenuState =
  | { status: "closed" }
  | { status: "loading"; query: string; range: EditorRange }
  | { status: "ready"; query: string; range: EditorRange; items: WorkspaceFileSuggestion[]; activeIndex: number }
  | { status: "empty"; query: string; range: EditorRange }
  | { status: "error"; query: string; range: EditorRange; message: string };
```

行为要求：

- 输入焦点始终留在编辑器，菜单通过 `aria-activedescendant` 或等价的 combobox / listbox 语义表达当前项。
- `ArrowDown` / `ArrowUp` 循环选择结果。
- `Enter` / `Tab` 选择当前结果并替换 query range。
- `Escape` 只关闭菜单，不删除 `@query`。
- 鼠标 hover 改变 active，点击确认选择。
- IME 组合输入期间不触发选择或发送。
- 菜单最大高度受 viewport 限制，内部滚动不推动消息流。
- 查询 debounce 约 100-200ms；旧请求结果不能覆盖新 query。
- workspace 切换时清空旧结果和 active state，不能显示上一个 workspace 的文件。

### 7.3 文件引用插入

选择文件后，编辑器用 transaction 替换 query range：

```text
原文：请检查 @src/com
选择：src/components/Composer.tsx
结果：请检查 [file mention: src/components/Composer.tsx] 
```

UI 上显示：

- 主显示为文件名 `Composer.tsx`。
- tooltip 显示 workspace-relative path。
- mention 节点不可被光标拆成半个字符串；Backspace 在节点后一次删除整个节点。
- 左右方向键可以跨过节点，Delete 删除整个节点。
- mention 节点支持复制；复制为 `@src/components/Composer.tsx` 的纯文本降级形式。
- mention 节点不允许直接编辑路径；需要重新输入 `@` 选择新文件。
- 文件被删除或当前 workspace 变化后，历史 mention 仍显示，但发送前由 main 重新解析并给出“文件不存在 / workspace 不匹配”错误。

### 7.4 文件引用数据与安全

```ts
type FileReference = {
  referenceId: string;
  workspaceId?: string;
  relativePath: string;
  displayName: string;
  source: "workspace_mention";
};
```

安全要求：

- renderer 只能拿到 suggestion DTO 和稳定相对路径，不直接读取文件内容。
- main 根据 session workspace / workspace registry 解析 `workspaceId` 和 root。
- main 对 `relativePath` 做规范化、禁止 `..` 越界、realpath 校验、符号链接逃逸校验和文件类型校验。
- 文件引用不绕过当前 Session permission mode；Agent 后续真正读取仍走已有 Tool Runtime 权限。
- `displayName` 只用于 UI，不作为文件身份。
- 不接受 renderer 传入任意 `absolutePath`、`file://`、远程 URL 或未登记 workspace root。
- 搜索结果数量、文件名长度、相对路径长度和请求频率都有上限。

### 7.5 `@` 与现有模式

| Agent 形态 / 模式 | 文件 mention 菜单 | 发送语义 |
|---|---|---|
| Workspace + Agent | 可用 | 注册文件引用，Agent 按需读取 |
| Workspace + Plan | 可用 | 仅暴露给只读上下文；Runtime 不允许写操作 |
| Chat | 默认关闭 | 使用图片 / 文本附件，不读取工作区 |
| streaming | 关闭 | 等待当前 run 完成 |

## 8. 回复选区与“添加到对话”设计

### 8.1 触发与选区识别

只处理 `AssistantReply` 中 Markdown 渲染产生的文本节点：

- 允许普通段落、标题、列表、引用和表格中的文本。
- V1 不允许代码块、链接 URL 节点、图片 alt 文本、工具日志、thinking 和跨 assistant message 选择。
- 选区为空、只包含空白、超过最大字符数或跨越不支持节点时，不显示添加操作。
- 起止文本统一规范化换行，但保留用户实际可见文本。
- 选择方向反向时按文档顺序归一化 `start < end`。

### 8.2 选区浮动工具条

用户拖选有效文本后，在选区上方或下方显示轻量浮动工具条：

```text
                 ┌──────────────────┐
                 │ + 添加到对话     │
                 └──────────────────┘
                         ▲
        ─────── 用户选中的 assistant 文本 ───────
```

交互：

- 工具条锚定 selection rect，优先放在选区上方；空间不足时翻到下方。
- 工具条出现有约 100-140ms 的 opacity / translate 过渡；`prefers-reduced-motion` 下取消。
- 工具条出现后点击按钮，不立即发送消息，只创建 Composer draft reference。
- 添加完成后清除原生 selection，Composer reference tray 出现并获得可见反馈。
- 用户点击页面其他位置、按 Escape 或开始新的选择时，工具条关闭。
- 快捷键不作为 V1 必需行为；后续可以提供 `Cmd+Shift+I`，但不能与系统复制冲突。
- 工具条必须支持键盘 focus、Enter / Space 触发和清晰的 accessible name。

### 8.3 Composer reference tray

加入后 Composer 顶部显示：

```text
┌──────────────────────────────────────────────┐
│  ▣ 1 条引用  ×                               │
│                                              │
│  “被选中的文字预览……”                         │
│  来源：助手回复 · 16:20             编辑  删除 │
│                                              │
│  [正文输入区域]                               │
└──────────────────────────────────────────────┘
```

紧凑态：

- 只显示 `1 条引用` / `N 条引用` 和 comment icon。
- hover / focus 显示 tooltip 或展开预览。
- 点击进入 reference list popover，不抢走正文焦点。
- 有多条引用时不把全文都铺开，采用列表滚动。

展开态：

- 每条 reference card 显示序号、选中文本预览、assistant 消息时间或标题。
- 如果用户已添加评论，显示评论摘要。
- 提供 `编辑`、`移除`，单条移除不影响正文和其他附件。
- 提供 `清空全部`，必须有明确的 destructive / reversible 语义；V1 可直接清空，因为它只影响未发送草稿。
- reference card 不能嵌套在普通 attachment card 内；它是 Composer 的独立上下文层。

### 8.4 批注编辑器

点击“编辑”或添加后可选地输入评论：

- 编辑器是小型单行 / 多行纯文本 comment input，不复用主 Composer 的文件 mention 和 Slash menu。
- placeholder：`添加可选评论…`。
- 评论为空时仍可以保留选区引用；引用本身是有效上下文。
- Enter 默认提交编辑，Shift+Enter 换行；IME 期间不提交。
- Escape 取消本次编辑，恢复之前的 comment。
- 删除 comment 不删除 selection reference；移除 reference 才完全移除该上下文。
- 评论最大字符数有界，超限显示本地错误，不静默截断。

### 8.5 发送后的用户消息展示

用户消息正文仍显示用户实际输入内容，不把 `[引用 1]` 或系统前缀拼进可见文本。正文下方显示 reference summary：

- `1 条回复引用` 或 `N 条回复引用`。
- 点击可以展开来源和选中文本。
- 如果会话历史缺少可定位的 assistant message，只显示脱敏后的引用摘要和“原回复不可用”。
- 用户消息仍可折叠，reference summary 不应被折叠遮蔽。

## 9. 批注 marker 与悬浮交互

### 9.1 数据定位模型

不保存屏幕坐标作为主数据。每条批注包含：

```ts
type ResponseAnnotationReference = {
  annotationId: string;
  assistantMessageId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  prefixContext: string;
  suffixContext: string;
  comment?: string;
  source: "assistant_response_selection";
};
```

定位策略：

1. 先按 `assistantMessageId` 找到目标 AssistantReply。
2. 将 Markdown source 和渲染文本建立可测量的 text locator map。
3. 用 start / end offset 尝试定位。
4. 若正文变更导致 offset 失效，用 `selectedText + prefixContext + suffixContext` 做唯一候选匹配。
5. 候选为 0 或多于 1 时 marker 进入 unresolved 状态，只显示引用卡，不在错误位置强行画 marker。
6. 找到 DOM Range 后，用 `Range.getClientRects()` 计算 marker point；窗口滚动、消息尺寸变化、字体变化时重新测量。

### 9.2 Markdown source 与 rendered text 映射

直接在最终 DOM 中用 `textContent.indexOf` 不够可靠，因为：

- Markdown 语法字符不一定出现在可见文本中。
- 列表、代码块、链接和硬换行会改变文本流。
- React Markdown 组件可能生成多个 span / em / code / a 节点。

因此 `MarkdownProse` 需要在渲染 assistant message 时建立受限 locator map：

```ts
type MessageTextLocator = {
  messageId: string;
  sourceStart: number;
  sourceEnd: number;
  visibleStart: number;
  visibleEnd: number;
  node: Text;
  localStart: number;
  localEnd: number;
  blockKind: "paragraph" | "heading" | "list_item" | "blockquote" | "table_cell";
};
```

V1 只对声明支持的 block 生成 locator。代码块和动态组件不生成 locator，从根上避免“看似选中但无法稳定回到原文”的情况。

### 9.3 Marker 展示

- 每条有效批注显示一个编号 marker，例如 `1`、`2`。
- marker 是可聚焦 button，不是装饰性 span。
- marker point 默认在选区右侧或最近一行末尾；多个 marker 发生碰撞时沿垂直方向堆叠，不能遮挡正文。
- marker 使用中性主题 token；selected / hover 只提高对比度，不用整段高亮绿色。
- 正文选区在 marker selected 状态下使用淡色 selection highlight，不能改变原始 Markdown 语义颜色。
- marker 层使用 portal 或消息容器内的独立 absolute layer，但必须以消息容器为坐标事实来源。

### 9.4 Hover preview

鼠标悬浮 marker 时显示紧凑 preview card：

```text
┌─────────────────────────────────┐
│ 1. 选中文本：                    │
│ “用户选择的文本……”              │
│                                 │
│ 用户评论：                       │
│ 请解释这一段                    │
│                                 │
│                          编辑 删除│
└─────────────────────────────────┘
```

- hover card 不能因为鼠标移动到 card 本身就立即消失。
- card 位置优先避开 Composer、窗口边界和其他 marker。
- 选中文本为多行时限制最大高度，内部滚动；不能撑开消息流。
- 无 comment 时隐藏“用户评论”区块。
- 点击 marker 或 card 中的“查看”让该批注进入 selected 状态。
- hover 只预览，不进入编辑态；键盘 focus 与 hover 等价。

### 9.5 Edit / remove

V1 的已发送批注交互：

- `编辑` 默认把该 assistant message 的引用复制为当前 Composer draft 的 selected reference，并打开 comment editor；不直接变更已发送 user message。
- `删除` 从当前 user message 的 reference projection 中移除只影响本地显示的 pending overlay；若要持久化删除历史批注，需要独立 user action event，V1 可暂不提供。
- 因此 V1 发送后 marker 以只读为主，避免引入“修改已发送消息”协议。
- 后续如需真正编辑历史批注，应增加 append-only `annotation_updated` / `annotation_removed` 事件，不能修改原始 `user_message` journal 行。

## 10. 数据契约

### 10.1 Composer draft

```ts
type ComposerDraft = {
  schemaVersion: 1;
  document: ComposerDocument;
  plainText: string;
  attachments: ComposerAttachment[];
  responseAnnotations: ResponseAnnotationReference[];
};
```

Draft 生命周期：

- 只保存在当前应用运行期间的 Workbench memory，延续现有 draft 语义。
- session 切换时按 sessionId 隔离。
- 发送成功后清空正文、附件和 annotations。
- 发送失败时完整恢复正文、附件和 annotations。
- 不把未发送 draft 写入 Session Journal。

### 10.2 User message

```ts
type UserMessagePayload = {
  content: string;
  composerContent?: ComposerContentPayload;
  attachments?: ComposerAttachment[];
  responseAnnotations?: ResponseAnnotationReference[];
  source?: string;
};
```

持久化要求：

- 新字段全部可选，旧事件继续可读。
- 事件中保留 `content` 作为 plain text 兼容字段。
- `responseAnnotations` 只保存必要文本、assistant message id 和 locator context；不保存完整 assistant 回复副本。
- 引用文本和 comment 受长度上限约束，避免 journal 被用户重复选择的大段回复撑爆。
- Session transcript、Context Projection 和 Prompt builder 都要明确处理新字段；不允许把 annotation metadata 意外暴露到普通用户正文中。

### 10.3 Runtime 输入

```ts
type RunAgentInput = {
  sessionId: string;
  agentRunId: string;
  userInput: string;
  composerContent?: ComposerContentPayload;
  attachments?: ComposerAttachment[];
  responseAnnotations?: ResponseAnnotationReference[];
  mode?: ComposerMode;
  // 现有模型、技能、执行上下文字段保持不变
};
```

Runtime 处理：

- 验证 `composerContent.plainText === userInput`，否则拒绝。
- 解析并校验所有 file reference 的 workspace identity 和 relative path。
- 验证 annotation 的 assistantMessageId 属于当前 session；不存在则返回结构化错误。
- 验证 selectedText 与 prefix / suffix context 长度在上限内。
- 将 file references 和 response annotations 作为独立 request context segment 注入 prompt builder。
- 不将 annotation marker 编号、UI comment card 文案或 renderer class 名暴露给模型，除非 prompt builder 明确生成用户可读的引用说明。

建议模型上下文的逻辑形态：

```text
User request:
  <plain user text>

Referenced workspace files:
  - @src/components/Composer.tsx

Referenced assistant response excerpts:
  1. Selected text: "..."
     User comment: "请解释这里"
     Source message: assistant message <stable id>
```

具体 prompt 文本属于 Runtime / Prompt package 的实现细节，不能由 renderer 直接拼接后发送。

## 11. 状态管理与恢复

### 11.1 Composer 状态

建议把当前 `message` state 逐步替换为 `ComposerController`：

```ts
type ComposerControllerState = {
  document: ComposerDocument;
  selectedRange?: EditorRange;
  fileMentionMenu: FileMentionMenuState;
  slashMenu: ExistingSlashMenuState;
  attachments: ComposerAttachment[];
  responseAnnotations: ResponseAnnotationReference[];
  draftError?: ComposerDraftError;
};
```

Controller 提供：

- `insertFileMention(suggestion)`。
- `removeFileMention(referenceId)`。
- `addResponseAnnotation(reference)`。
- `updateResponseAnnotation(annotationId, comment)`。
- `removeResponseAnnotation(annotationId)`。
- `serialize()`。
- `restore(payload)`。
- `focus()`。

外层 `Composer.tsx` 仍负责布局、面板互斥、发送按钮和现有模式 / model / context 行，不把所有编辑器逻辑继续堆入单个大组件。

### 11.2 草稿恢复

- `ComposerDraftRestore` 增加 `document` 和 `responseAnnotations`。
- 旧 draft 只有 `text` 时走 `textToComposerDocument`。
- 发送拒绝或异常时恢复同一 sessionId 的完整 draft。
- 如果某个 annotation 的源 assistant message 已经不在当前分页窗口，draft 仍保留引用数据；消息区加载完成后再尝试定位。
- 如果文件 mention 对应文件已经不存在，恢复 UI 仍显示 mention，发送前显示可解释错误并允许删除该 mention。

## 12. 安全、权限和隐私

### 12.1 文件引用

- 文件搜索只在当前 workspace root 内执行。
- main 必须重新解析 renderer 传来的 workspace id / relative path。
- 通过现有 Session permission mode 和 Tool Runtime 控制真实读取，不因为 mention 选择绕过审批。
- 不把 workspace absolute path 写入用户可见消息、远程模型请求或 session payload，除非现有诊断边界明确允许。
- 文件名和路径作为不可信文本渲染，不能被当作 HTML。

### 12.2 回复批注

- selectedText、prefixContext、suffixContext 和 comment 都视为用户 / 模型产生的不可信文本。
- preview 使用 React text children，不使用 `dangerouslySetInnerHTML`。
- annotation 不携带源 assistant 全文，避免重复持久化和意外扩散敏感内容。
- 发送到 provider 前，Runtime 应按现有上下文和数据处理策略决定是否包含引用文本；用户明确选择引用即表示本轮愿意发送该文本，但仍受 provider / mode 边界约束。
- 日志只记录 annotation 数量、长度和校验结果，不记录完整引用正文。

## 13. 可访问性与键盘行为

### 13.1 Rich editor

- `role="textbox"`、`aria-multiline="true"`，placeholder 通过 editor decoration / aria 描述表达。
- 文件 mention 是可读的 inline atom，辅助技术读出文件名和相对路径。
- 建议菜单使用 combobox / listbox 语义，当前项通过 `aria-activedescendant` 表达。
- Escape 分层关闭：先关闭 file mention menu，再关闭 Slash menu，再关闭 reference popover / model menu。
- Enter 在 mention menu 打开时选择，不发送；无菜单时沿用现有发送语义。
- IME 组合期间不触发发送、菜单选择、历史输入导航。

### 13.2 Selection toolbar and marker

- “添加到对话”是 button，不能只显示为 hover 文本。
- marker 是 button，带 `aria-label="回复批注 1"` 或等价本地化文案。
- marker hover、focus、selected 都有非颜色信号：编号、tooltip、focus ring、正文 selection highlight。
- hover card 使用 `role="dialog"` 或 `role="tooltip"`，取决于是否包含可交互按钮；有编辑 / 删除时必须具备可进入的焦点顺序。
- Escape 关闭 preview / editor 并恢复原焦点。

## 14. 性能与稳定性

- 文件 suggestion 查询做 debounce、取消旧请求和结果版本校验。
- 编辑器 transaction 不应在每次 keypress 都重建整个 Composer React tree。
- 发送前序列化一次 document，不在每个渲染周期重新解析 Markdown。
- assistant marker 定位只对当前可见 / 已加载 message 计算；使用 `ResizeObserver`、scroll listener 和 `requestAnimationFrame` 合并测量。
- 长回复最多生成有界数量的 annotation marker；超过上限时只在 Composer 中保留引用，不在正文中铺无限 marker。
- reference preview 使用截断文本，完整 selectedText 只在发送契约 / 持久化边界受控保存。
- 编辑器卸载时移除 suggestion listener、selection listener、ResizeObserver 和 pending file search。
- 失败必须保持草稿可恢复，不能因为定位失败而清空正文、附件或 annotations。

## 15. 验收矩阵

### 15.1 自动化测试

#### Editor / document

- 普通文本、换行、列表、代码块、链接的输入和序列化。
- `file_mention` 节点插入、复制、Backspace、Delete、撤销 / 重做。
- 旧 `text` draft 恢复为新 document。
- `plainText` 与 document 不一致时发送被拒绝。

#### `@` mention

- 起始、空格后、中文 query、路径 query、代码块内、链接内和重复 `@` 的触发规则。
- 键盘上下选择、Enter / Tab 选择、Escape 关闭、鼠标 hover / click。
- IME 组合输入不误选 / 不误发。
- workspace 切换和旧请求竞态。
- 无结果、加载中、失败、重试和文件被删除。
- main 端 `..` 越界、符号链接逃逸、workspace mismatch、非普通文件和绝对路径拒绝。

#### Response annotation

- 普通段落、标题、列表、引用的选区识别。
- 代码块、工具行、空白选区、跨消息选区被拒绝。
- 选择工具条的出现、定位、关闭和键盘操作。
- add / edit comment / remove / clear all。
- 多条引用去重、顺序、编号和发送前恢复。
- assistant message 改变后 offset 失效时 prefix / suffix fallback；0 个和多个匹配都进入 unresolved，不错位。
- marker hover、focus、click、preview boundary、碰撞布局和 scroll / resize 重测。

#### Session / Runtime

- 新字段缺失时旧事件和旧 Session 正常读取。
- user message payload 保存并投影 composerContent、attachments、responseAnnotations。
- annotation assistantMessageId 不属于当前 session 时 fail closed。
- 文件引用由 main 重新解析，不接受 renderer 任意 path。
- 发送失败恢复完整 draft；发送成功清空 draft。

### 15.2 浏览器 Renderer 验证

- 600px 以上宽度与 600px 以下窄窗。
- initial / follow-up、inline / stacked、有无附件、有无批注。
- Light / Dark / system-light / system-dark。
- `@` 菜单与 `/` 菜单互斥、内部滚动和 viewport 边界。
- selection toolbar 在正文顶部、底部和窗口边缘的翻转定位。
- marker 与 preview 不遮挡正文、Composer 和回到底部按钮。
- loading / empty / error / unresolved reference 的视觉状态。
- 使用 mock bridge，不把假文件系统状态当作 Electron 真实证明。

### 15.3 Electron 真实验证

- preload 的文件 suggestion IPC、当前 workspace 过滤和 realpath 校验。
- 真实文件选择、文件引用、发送、session journal 和重启恢复。
- 真实 assistant message 选区、批注加入 Composer、发送和历史回放。
- 真实窗口滚动、缩放、系统字体、Retina 和深浅主题。
- 发送失败、文件删除、workspace 切换和恢复路径。
- 验收按 `docs/FRONTEND_VERIFICATION.md` 执行，使用启动日志中的 `[dev-runtime] appName / appId` 定位真实窗口。

## 16. 方案取舍

### 16.1 为什么不继续使用 textarea

textarea 可以通过 `selectionStart` / `selectionEnd` 临时实现 `@` 替换，但难以同时可靠处理：

- inline mention 的不可拆分节点。
- Markdown / code / link 的结构化渲染。
- suggestion query range 与复杂光标移动。
- 输入法、撤销历史和粘贴 HTML。
- 同一正文中多个结构化引用的稳定恢复。

短期保留 textarea 的代价是后续必然出现字符串协议、显示协议和发送协议互相耦合。这里的 editor 迁移是为了把结构复杂度放到正确边界。

### 16.2 为什么不把回复选区直接复制进正文

复制选中文字虽然实现简单，但会丢失：

- 来源 assistant message。
- 原文定位。
- 多条引用的独立删除和预览。
- 后续 marker / hover card 的可能性。
- 发送失败恢复时的引用语义。

因此必须把 selection 当作 context object，而不是普通字符串。

### 16.3 为什么保留 `userInput` 兼容字段

当前 Runtime、CLI、测试和旧 Session 都以 string 为中心。结构化字段一次性替换会扩大改动面，也会让旧 session 和调试工具无法工作。保留 plain text 兼容字段，先让新能力可增量接入，再在后续版本评估是否收紧协议，是风险更低的迁移路径。

## 17. 开放决策

以下不是实现阻塞项，但实现前要在执行计划的决策记录中确认：

1. 使用原生 ProseMirror packages 还是 Tiptap。建议先用最小 PoC 对比 bundle 体积、IME、Markdown paste 和 schema 控制力。
2. `@` 文件 suggestion 是否包含 workspace 外已被授权的文件。建议 V1 只包含当前 session workspace。
3. 已发送 annotation 是否在 V1 提供真正的历史删除事件。建议先只读 marker + 复制到新 draft。
4. 是否允许引用代码块。建议 V1 不允许，后续以独立 code selection 设计处理。
5. selectedText 最大长度。建议初始限制为 8,000 个 Unicode code points；实现后根据实际 prompt 与 journal 体积观测调整。
6. marker 最大数量。建议每条 assistant message 20 条；超出后仍可加入 Composer，但正文只显示批注汇总入口。

## 18. 完成定义

当以下条件全部满足时，本设计对应的实现可以认为完成：

- Composer 可以稳定输入普通文本、Markdown、文件 mention、图片 / 普通文件附件和回复 annotations。
- `@` 和 `/` 菜单互斥、键盘优先、IME 安全且符合窄窗口布局。
- 文件 mention 经过 main / Runtime 重新解析和权限校验，renderer 不越权读文件。
- 回复选区可以加入 Composer，批注引用可编辑、删除、发送和失败恢复。
- 已发送用户消息和历史 assistant 回复能展示引用摘要和 marker；定位失败不会错位。
- 旧 Session 和旧 draft 能正常读取。
- `pnpm typecheck`、`pnpm build`、相关 Vitest、renderer 验收和 Electron 真实链路均有记录。
- 设计文档、执行计划、执行过程和执行摘要都同步反映最终实现状态。
