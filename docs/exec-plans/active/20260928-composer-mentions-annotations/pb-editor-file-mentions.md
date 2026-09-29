# PB：编辑器替换与 `@` 文件引用

状态：待执行（依赖 P0；建议在 PA 之后合入）。上级：[总览](README.md)。

## 目标

把 Composer 的 `textarea` 换成原生 ProseMirror 编辑器，现有输入、发送、草稿、历史输入、`/` 菜单、粘贴图片行为保持不变；在此基础上支持输入 `@` 搜索当前工作区文件，并在光标处插入不可拆分的文件引用节点，随消息发送、在历史中还原显示。

## 不做

- 粗体、斜体、链接、代码块等富文本格式；Markdown 按原文输入和发送。
- 目录引用；工作区之外的文件；Chat 形态的文件引用。
- 选中文件后自动读取内容；由 Agent 自己决定是否用读取工具。
- 粘贴含 `@foo` 的文本时自动转换成引用。

## 必读

- `AGENTS.md`、`docs/FRONTEND.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/SECURITY.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/frontend/front-composer-slash-command.md`。
- 设计文档第 6、7 节，以及顶部「实施决策修订」。
- 执行过程里的「M0.2 编辑器 PoC」结论（jsdom 限制与测试写法）。
- 代码：`Composer.tsx`（`renderComposerInput`、输入高度测量的 `useLayoutEffect`、`navigateInputHistory`、`finishSlashSelection`、`handlePasteImages`、`switchAgentForm`）、`composer-slash-commands.ts`、`apps/desktop/src/main/workspace-fs-service.ts`（忽略目录列表 `IGNORED_DIR_NAMES`）、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（`handle` + `assertTrustedSender`、`registeredWorkspaceRoot`）、`packages/shared/src/runtime-v2/fixed-renderer.ts`（通道常量）、`apps/desktop/src/preload/index.ts`（`FIXED_RENDERER_INVOKE_CHANNELS`、`exposeInMainWorld`）、`apps/desktop/src/global.d.ts`。

## 关键设计

**文档与序列化**（`apps/desktop/src/renderer/components/composer/composer-document.ts`，纯函数）：

- `docToPlainText(doc)`：段落之间 `\n`，`hard_break` 为 `\n`，`file_mention` 为 `@relativePath`。
- `docFileReferences(doc): FileReference[]`：按出现顺序、按路径去重。
- `plainTextToDoc(text, fileReferences = [])`：按行拆段落；对 `fileReferences` 里每个路径，把文本中「前面是开头或空白、后面是结尾或空白」的 `@路径` 还原成 mention 节点，其余保持文字。
- 草稿、输入历史、发送失败恢复、历史消息显示都只用 `{ text, fileReferences }`，ProseMirror JSON 不出 renderer。

**编辑器组件**（`composer/ComposerEditor.tsx`）：封装 `EditorView` 生命周期，对外只暴露一个 imperative handle 和少量回调：

```ts
type ComposerEditorHandle = {
  focus(position?: "end"): void;
  setValue(value: { text: string; fileReferences: FileReference[] }): void;
  getValue(): { text: string; fileReferences: FileReference[] };
  insertFileMention(range: { from: number; to: number }, file: WorkspaceFileSuggestion): void;
  getDom(): HTMLElement | null;   // 供高度测量
};
props: {
  value 初值、disabled、placeholder、ariaLabel、aria-* 透传（combobox 语义）、
  onChange(value)、onMentionQueryChange(query | null)、
  onKeyDown(event) => boolean（返回 true 表示外层菜单已处理，编辑器不再处理）、
  onSubmit()、onPasteFiles(event) => boolean、
}
```

- 插件：`history`、自定义 keymap（Enter → `onSubmit`，组合输入中不触发；Shift+Enter → `hard_break`；Mod+Z / Mod+Shift+Z）、`baseKeymap`、mention 查询插件（每次事务后计算光标前的 `@query` 与范围，经 `onMentionQueryChange` 通知外层）。
- mention 触发规则：`@` 前是段落开头、空白或中英文标点；query 不含空白和第二个 `@`；遇到 mention 节点边界即结束。
- `/` 菜单保持现状：仍由 `parseComposerSlashQuery(plainText)` 判断整段文本是否为 `/xxx`；打开 `/` 菜单时不计算 `@`，两者互斥。
- placeholder 用 decoration 渲染；空文档时根节点加 `data-empty`，样式沿用现有 placeholder token。
- 粘贴：图片仍交给 `handlePasteImages`；其余粘贴只取纯文本（`clipboardTextParser` 按行拆段落），HTML 不进入文档。
- 复制：`clipboardTextSerializer` 输出 `docToPlainText` 的结果，mention 复制为 `@路径`。
- 根节点保留现有 `composer-input` 类（高度限制、内边距、字号），`role="textbox"`、`aria-multiline="true"`、`aria-label="消息输入框"` 不变，测试与无障碍定位不受影响。

**文件搜索**（main）：

```ts
type SearchWorkspaceFilesInput = { workspaceRoot: string; query: string; limit?: number };  // limit 默认 50，最大 100
type WorkspaceFileSuggestion = { relativePath: string; displayName: string };
type SearchWorkspaceFilesResult =
  | { status: "ok"; items: WorkspaceFileSuggestion[]; truncated: boolean }
  | { status: "error"; code: "workspace_not_registered" | "query_too_long" | "index_failed" };
```

- `workspaceRoot` 必须通过 `registeredWorkspaceRoot` 校验（未登记的根直接拒绝），通道经 `assertTrustedSender`。
- 建索引：先 `git -C <root> ls-files -co --exclude-standard -z`（5 秒超时，最多 50,000 条）；不是 git 仓库或失败时，退回 Node 广度优先遍历：跳过 `IGNORED_DIR_NAMES`、不跟随符号链接目录、最多 20,000 个文件、深度 12。
- 索引按 root 缓存 30 秒；同一 root 并发请求共享一次构建。
- 匹配（大小写不敏感）：文件名前缀 > 文件名包含 > 路径包含 > 路径子序列；同分时路径短的在前。空 query 返回路径最短的前 N 条。query 最长 256 字符。
- 只返回相对路径和文件名，不返回绝对路径、大小或内容。

## 任务

### PB.1 编辑器核心（先不接 `@`）

- 删除 `apps/desktop/src/renderer/test/editor-poc.test.tsx`；把 PoC 里的 jsdom polyfill（`document.elementFromPoint`、`Range.prototype.getBoundingClientRect / getClientRects`）移入 `apps/desktop/src/renderer/test/setup.ts`（先探测 `Element` 存在，与现有 `scrollIntoView` 桩写法一致）。
- 新增 `composer/composer-editor-schema.ts`（四种节点）、`composer/composer-document.ts`、`composer/ComposerEditor.tsx`。
- 测试 `apps/desktop/src/renderer/test/composer-document.test.ts`：纯文本往返；多行与空行；mention 降级与还原；`@路径` 出现在单词中间时不还原；同一路径出现两次都还原；`docFileReferences` 去重保序。
- 测试 `apps/desktop/src/renderer/test/composer-editor.test.tsx`：user-event 输入中英文；Shift+Enter 换行；Enter 触发 `onSubmit`；组合输入中（`compositionstart` 后、`keyCode 229` / `isComposing`）Enter 不触发，`compositionend` 后 Enter 触发（PoC 未跑通的一项，在这里查清并修好）；粘贴纯文本与 HTML 都只得到文本；undo / redo。
- jsdom 限制：程序化事务之后 jsdom 的 DOM 选区不跟随，所以「先程序改内容、再用 user-event 在光标处继续输入」的多步场景改用 handle 或事务驱动，真实光标行为放到 Electron 验收。

验证：上述两个测试文件通过；`pnpm --filter @actspace/desktop typecheck`。

### PB.2 Composer 换用编辑器

- `Composer.tsx`：`message` string state 改为 `{ text, fileReferences }`；`renderComposerInput` 渲染 `ComposerEditor`；以下逻辑逐一迁移并保持行为：
  - 草稿读写：`ComposerDraftReader / Writer` 改为读写 `{ text, fileReferences }`；`App.tsx` 里的草稿存储同步改类型，旧字符串值按 `{ text: value, fileReferences: [] }` 读取。
  - 输入历史：上下键只在无菜单、非组合输入、光标在首行 / 末行时触发，与现有条件一致；回填用 `setValue`。
  - `/` 菜单：键盘拦截改走 `onKeyDown` 回调；`finishSlashSelection` 用 `setValue` + `focus("end")`。
  - 粘贴图片、拖放附件、`Shift+Tab` 切 Plan、`switchAgentForm` 带草稿。
  - 高度测量：沿用「按 inline 宽度测量 `scrollHeight` 判断多行」的做法，测量对象换成编辑器根节点。
  - `isStreaming` 时 `editable` 为 false。
- 迁移现有测试：`composer.test.tsx` 中依赖 textarea 的断言（`toHaveValue`、`HTMLTextAreaElement`、`setSelectionRange`、`user.clear`，共 16 处）改为读取编辑器文本的辅助函数（在测试文件内新增 `getComposerText()` / `clearComposer()`）；`app-streaming-user-message.test.tsx`、`workbench-responsive.test.tsx`、`turn-output-artifacts.test.tsx` 中对「消息输入框」的用法同样检查。断言语义不得放宽。
- `composer-slash-commands.test.ts` 不改，应直接通过。

验证：`pnpm --filter @actspace/desktop test` 全部通过（基线已知失败除外）；在浏览器 fixture 中手工确认中文输入、换行、粘贴、多行切 stacked 与原来一致。

**停止点**：PB.2 完成后停下来确认。若真实 Electron 中文输入法、光标或焦点有不可接受的问题，按「回退」处理，不进入 PB.3。

### PB.3 文件搜索 IPC

- `packages/shared/src/ipc.ts`：新增上面三个类型。
- `packages/shared/src/runtime-v2/fixed-renderer.ts`：新增通道 `searchWorkspaceFiles: "runtime-v2:fixed-renderer:search-workspace-files"`。
- 新增 `apps/desktop/src/main/workspace-file-search-service.ts`：`createWorkspaceFileSearchService()`，内含索引构建、缓存、匹配排序。
- `fixed-renderer-ipc.ts`：在 `registerFixedRendererHostCapabilities` 里用 `handle` 注册，root 经 `registeredWorkspaceRoot`。
- `preload/index.ts`：`FIXED_RENDERER_INVOKE_CHANNELS` 加 `"workspace:search-files"`，`exposeInMainWorld` 加 `searchWorkspaceFiles`；`global.d.ts` 声明为可选方法。
- 测试 `apps/desktop/src/main/test/workspace-file-search-service.test.ts`：
  - git 仓库：已跟踪、未跟踪未忽略的文件出现，`.gitignore` 忽略的不出现。
  - 非 git 目录：`node_modules`、`.git`、`dist` 下的文件不出现；指向外部的符号链接目录不进入。
  - 排序：文件名前缀优先；中文文件名可搜；空 query 返回最短路径；limit 与 `truncated`。
  - 未登记 root 返回 `workspace_not_registered`；超长 query 返回 `query_too_long`。
  - 缓存：30 秒内第二次请求不重新执行 `git`。
- 更新 `apps/desktop/src/main/test/runtime-v2-preload-bundle.test.ts`（若它校验通道白名单）。

验证：`pnpm --filter @actspace/desktop test -- workspace-file-search runtime-v2-preload`。

### PB.4 `@` 菜单与 mention 节点

- 新增 `composer/FileMentionMenu.tsx`，状态：

```ts
type FileMentionMenuState =
  | { status: "closed" }
  | { status: "loading"; query: string; range: { from: number; to: number } }
  | { status: "ready"; query: string; range: { from: number; to: number }; items: WorkspaceFileSuggestion[]; activeIndex: number }
  | { status: "empty"; query: string; range: { from: number; to: number } }
  | { status: "error"; query: string; range: { from: number; to: number }; message: string };
```

- 行为：
  - 只在非 Chat 形态、非流式、有 `selectedWorkspaceRoot`、`window.actspace.searchWorkspaceFiles` 存在时启用。
  - query 变化后 120ms 防抖请求；每次请求带递增序号，只接受最新序号的结果。
  - `selectedWorkspaceRoot` 变化时关闭菜单、丢弃未返回的结果。
  - 焦点始终在编辑器；编辑器设 `aria-controls` / `aria-activedescendant` / `aria-expanded`，菜单是 `role="listbox"`、每行 `role="option"`。
  - ArrowUp / ArrowDown 循环；Enter / Tab 选择；Escape 只关闭菜单、保留已输入的 `@query`；鼠标悬停改 active、点击选择。
  - 每行：文件图标、文件名（主）、相对路径（次，中间省略）。底部状态：加载中、无匹配、加载失败 + 重试。
  - 位置与尺寸沿用 `/` 菜单的样式常量（followup 向上、initial 向下，限高内部滚动）。
  - 与 `/` 菜单、`+` 菜单、模型菜单、Context 弹窗互斥：打开任何一个时关闭其余，沿用现有 `closeFloatingPanels` 的写法。
- mention 节点：`toDOM` 输出 `span.composer-file-mention`，`contenteditable="false"`，显示文件名，`title` 为相对路径，`aria-label="文件引用 {相对路径}"`；样式用现有 token（`bg-surface-subtle`、`border-line`、`text-text-main`，圆角 `rounded-act-sm`），浅 / 深主题都要验。
- 测试 `apps/desktop/src/renderer/test/file-mention-menu.test.tsx`：
  - 触发：开头、空格后、中文标点后触发；单词中间（`a@b`）不触发；Chat 形态不触发；`/` 菜单打开时不触发。
  - 键盘：上下选择、Enter 与 Tab 选择后插入节点且后面带一个空格、Escape 关闭并保留文本、组合输入中 Enter 不选择。
  - 竞态：先慢后快两个请求，只显示后一个的结果；切换工作区后旧结果不出现。
  - 状态：加载中、无结果、失败后点重试重新请求。
  - 节点：Backspace 一次删除整个节点；复制得到 `@路径`；undo 恢复。

### PB.5 发送、恢复与历史显示

- `Composer.tsx`：`createSendOptions` 带 `fileReferences: docFileReferences(doc)`（为空不带）；发送、恢复、切换形态都传递 `fileReferences`。
- `App.tsx`：P0 已透传；`draftRestore` 恢复时用 `plainTextToDoc(text, fileReferences)` 还原节点；`referenceIssue` 为 `file_not_found` 等时，错误条显示具体路径，节点保留，用户可删除后重发。
- `UserMessage.tsx`：正文渲染时用 `plainTextToDoc` 同样的规则把 `@路径` 切成文字和文件引用 chip（只读，`title` 为路径），其余文字保持现有 `whitespace-pre-wrap` 与折叠逻辑。
- 测试：选择 `@src/...` 后发送，`onSend` 收到的 `fileReferences` 与正文一致；`referenceIssue` 返回后草稿恢复且 chip 仍在；历史用户消息中 chip 渲染、无 `fileReferences` 的旧消息显示不变。

### PB.6 浏览器 fixture 与视觉验证

- 新增 `apps/desktop/src/renderer/test/fixtures/composer-mentions-preview.{html,tsx}`，桩一个返回固定列表、可切换延迟 / 空结果 / 失败的 `searchWorkspaceFiles`。
- 截图：宽窗口与 600px 以下窄窗；浅色与深色；`@` 菜单的四种状态；正文中多个 mention 折行；inline 与 stacked；与图片附件、回复批注托盘同时存在。截图存到执行记录目录。

### PB.7 Electron 真实验证

`pnpm dev:log` 启动后：

1. Agent 会话输入中文、换行、粘贴一段含 HTML 的网页文本，确认行为与改动前一致。
2. 输入 `@Comp`，搜索并选择真实文件；用 Backspace 删除再重新选择；复制正文检查剪贴板为 `@路径`。
3. 发送带文件引用的 Agent 和 Plan 消息；确认模型收到引用说明且按需调用了读取工具；`journal.jsonl` 里有 `file-reference` 块且没有绝对路径。
4. 切换工作区后 `@` 结果随之变化，不出现上一个工作区的文件。
5. 在 Finder 中删除一个已引用文件后发送，确认报「文件不存在」且草稿完整保留。
6. 在工作区里建一个指向外部目录的符号链接，确认搜索结果不出现其中文件，手工构造的引用发送被拒。
7. Chat 会话输入 `@` 不出现菜单。
8. 重启应用，历史消息中 chip 仍正确显示。

## 完成标准

- PB.1–PB.5 测试通过，统一验证命令通过（desktop 只剩基线已知失败）。
- `composer.test.tsx` 原有用例全部保留并通过。
- fixture 截图与 Electron 验证结果写入执行过程；未验证项写入执行摘要。

## 回退

- PB.2 停止点若发现编辑器在 Electron 输入法、焦点或光标上不可接受：撤回 PB.1–PB.2 的改动，恢复 textarea，`@` 功能暂停；在设计文档记录原因并另立编辑器可行性计划。不在 textarea 上用正则拼 mention。
- 若 `git ls-files` 在某些仓库过慢：降低上限或只用 Node 遍历，不改接口。
