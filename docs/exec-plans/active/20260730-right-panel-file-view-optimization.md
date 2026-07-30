# 右侧面板文件视图优化（新鲜度 / 阅读体验 / 高亮覆盖 / 大文件 / CSV）

## 目标

让右侧面板的文件视图从「一次性快照 + 窄覆盖高亮」变成可信、可读、可导航的代码阅读区：打开的文件在磁盘变化后能被感知并显式重新加载；代码有行号、可关软换行、能复制、能在文件内搜索；语法高亮覆盖真实会遇到的文件类型（含 dotfile 与无扩展名文件），同时把 renderer bundle 里用不到的 176 种 highlight.js 语法去掉；超过上限的文本文件改为部分读而不是整体拒绝；补上设计文档已经声明但未实现的 CSV 预览。

## 范围

- 包含：
  - `packages/shared/src/ipc.ts` 的 workspace 文件契约扩展（`mtimeMs`、`truncated` 真正启用、`WorkspaceStatFile*`、新增 `csv` renderKind）。
  - `packages/desktop/src/main/workspace-fs-service.ts`：语言映射扩表 + basename 兜底 + 部分读 + 返回 mtime + 新增 statWorkspaceFile。
  - `packages/desktop/src/main/index.ts`：注册 `workspace:stat-file`。
  - `packages/desktop/src/preload/index.ts` 与 `packages/desktop/src/global.d.ts`：暴露 `statWorkspaceFile`。
  - `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`：文件树展开状态提升、tab 新鲜度字段、`markStale` / `reloadTab`。
  - `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`：消费提升后的展开状态、激活文件高亮、文件类型图标、过滤框、刷新按钮、`too_many_entries` 提示。
  - `packages/desktop/src/renderer/components/RightPanel.tsx`：操作栏加刷新 / 过期提示条；`TextRenderView` 拆到独立文件并加行号、wrap 开关、复制、文件内搜索。
  - 新增 `packages/desktop/src/renderer/components/right-panel/CodeRenderView.tsx`、`CsvRenderView.tsx`、`highlight.ts`（按需注册语言）、`useFileFreshness.ts`。
  - `packages/desktop/src/renderer/components/right-panel/MarkdownRenderView.tsx`：源码视图接入同一高亮。
  - 文档：`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`（唯一前端事实来源）同步；`docs/histories/` 记一条。
- 不包含：
  - 不引入 Shiki / Monaco / CodeMirror（用户已确认这轮继续用 highlight.js，只改成按需注册 + 扩表）。
  - 不做文件编辑、写入、重命名、删除（右侧面板保持只读）。
  - 不接 fs-watch 插件（理由见「决策记录」）。
  - 不做 PDF 预览（本轮只把设计文档里的 PDF 明确标成未实现，不实现）。
  - 不做跨文件全局搜索 / 快速打开（Cmd+P）/ git 状态标记 / 虚拟滚动。
  - 不改 Review / Context / Kairos / Reply 这四类对象视图的内部实现。

## 背景

### 相关文档

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：右侧面板唯一前端事实来源，本计划所有行为变化都要回写这里。
- `docs/design-docs/frontend/front-主题与配色规范.md`：颜色硬约束。行号 gutter、过期提示条、搜索命中高亮都要用语义 token，禁止 `#hex` / `text-black` / `bg-white`，且浅深两态都要验。
- `docs/design-docs/agent-plugins-fs-watch.md`：fs-watch 插件的文件契约与边界，用于论证为什么不走插件。
- `docs/FRONTEND_VERIFICATION.md`：验证分层。本计划同时改了 IPC / preload / main，属于「IPC、preload、session、本地文件」类，必须 `pnpm typecheck` + `pnpm build` + Electron 真实验证。

### 相关代码路径

| 路径 | 当前职责 |
| --- | --- |
| `packages/desktop/src/main/workspace-fs-service.ts` | `listWorkspaceDir` / `readWorkspaceFile`，含忽略名单、1000 条上限、2MB/5MB 上限、二进制识别、`LANGUAGE_BY_EXT` |
| `packages/desktop/src/main/index.ts` L1117–1129 | 注册 `workspace:list-dir` / `workspace:read-file` / `session:read-artifact` |
| `packages/desktop/src/preload/index.ts` L189–194 | 暴露 `listWorkspaceDir` / `readWorkspaceFile` / `readSessionArtifact` |
| `packages/shared/src/ipc.ts` L685–728 | workspace 文件契约 |
| `packages/desktop/src/renderer/components/RightPanel.tsx` | 面板外壳、tab 条、操作栏、启动页、`ImageRenderView` / `TextRenderView` |
| `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx` | tab 模型、`isWorkspaceFileTab`、浏览态两个开关 |
| `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx` | 树 rail，懒加载逐层展开，点文件读盘开 tab |
| `packages/desktop/src/renderer/styles/markdown.css` L195–295 | `.act-code-hl` 主题感知 hljs token 配色 |

### 已确认的现状事实（调研结论，2026-07-30）

1. 高亮链路是通的，`.tsx → typescript` 实测能正确标记 JSX（`hljs-tag` / `hljs-name` 均出现），这不是缺陷。
2. `LANGUAGE_BY_EXT` 只有 20 个扩展名 / 16 种语言。仅本仓库自身就有 `.astro`(24)、`.csv`(30)、`.mod`、`.work`、`.lock`、`.txt`、`.example`、`.editorconfig`、`.gitattributes` 落在映射外；`extname()` 对 dotfile 返回空串，`.gitignore` / `.npmrc` / `.prettierrc` 拿不到语言；无扩展名的 `LICENSE` / `NOTICE` / `CODEOWNERS` / `Dockerfile` / `Makefile` 无 basename 兜底。
3. `import hljs from "highlight.js"` 是全量入口，192 种语法进 bundle。已构建的 renderer chunk（单文件 1.9MB）里能搜到 `name:"Brainfuck"` / `"VHDL"` / `"Fortran"` / `"Erlang"` / `"Mathematica"` / `"Puppet"`，证实全部语法都被打进去了，而可达语言只有 16 种。
4. 文件内容是打开瞬间的快照，右侧面板没有任何刷新机制，也没接 fs-watch。唯一刷新路径是「再去文件树点一次同一个文件」（`openTab` 按 `file:<relativePath>` 去重时会替换内容），既不明显也无提示。
5. 文件树展开状态是 `EntryRow` 的局部 `useState`；`RightPanel.tsx` L91 用 `showTree ? <WorkspaceFileTree/> : null` 条件渲染，收起树栏或切到对象 tab 会整体卸载 → 回来后所有目录塌回根层。
6. 树里不标记当前激活文件（`ROW_CLASS` 无 active 变体）；所有文件共用通用 `File` 图标；无过滤、无刷新按钮；`too_many_entries` 在 UI 上完全静默。
7. `too_large` / `binary` / `not_found` 被 `tabFromFile` 塞成 text tab 的 `content`，表现为「一个内容是错误文案的文本文件」，没有 size 信息、没有部分查看出口。契约里 `truncated?` 字段存在但 main 侧从未设置。
8. 无行号；`TEXT_BODY_CLASS` 含 `whitespace-pre-wrap` 且不可切换；无复制按钮、无文件内搜索。
9. `hljs.highlight` 在 `useMemo` 里同步执行，2MB 上限文件会阻塞渲染进程；整文件一次性进 DOM，无虚拟化。
10. Markdown 的「源码」视图是纯 `<pre><code>`，完全不高亮，与 text tab 不一致。
11. 设计文档声明了 `PDF` / `CSV` 两种 tab 类型和渲染规则，`RightPanelTab` 联合类型与代码里都没有。

### 已知约束

- renderer 不能直接访问文件系统，所有读盘走 preload + IPC；UI 浏览强约束在 `workspaceRoot` 内，`..` 返回 `escapes_root`。这条不放松。
- 浏览器 renderer（无 preload）下所有新增 IPC 调用都必须优雅降级为空态 / 禁用态，不抛错、不白屏。现有 `WorkspaceFileTree` 已用 `typeof window.actspace?.listWorkspaceDir === "function"` 做判断，新增能力沿用同样写法。
- 颜色必须走语义 token 并通过 `pnpm check:frontend-theme`。
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md` 是唯一前端事实来源，行为变化必须同轮更新，不允许代码先跑、文档后补。

## 风险

- 风险：文件新鲜度检测把「内容自动替换」做成默认，会在用户正在阅读或选中文本时抽走内容。
  - 缓解方式：检测到变化只打 `stale` 标记并在操作栏显示「文件已变更 · 重新加载」，内容替换必须由用户点击触发。自动替换不做，也不留开关。
- 风险：语言按需注册漏注册某个已在 `LANGUAGE_BY_EXT` 里声明的语言，导致原本能高亮的文件回退成纯文本（静默回归）。
  - 缓解方式：`highlight.ts` 里注册表与 main 侧 `LANGUAGE_BY_EXT` 的值域必须一致，并加一条单测：遍历 `LANGUAGE_BY_EXT` 与 `LANGUAGE_BY_BASENAME` 的每个 value，断言 `hljs.getLanguage(value)` 均非空。这条测试就是防漂移的锁。
- 风险：部分读（`truncated`）让用户误以为看到了完整文件，据此做出错误判断。
  - 缓解方式：`truncated` 为 true 时操作栏必须常驻显示「已截断，仅显示前 N 行 / 共 M 字节」，且被截断文件不参与文件内搜索的「全文命中数」统计（只报可见范围命中数，文案写明）。
- 风险：行号 gutter 与软换行同时开启时，折行的续行会与行号错位。
  - 缓解方式：行号用 CSS grid 双列（gutter 列 + 内容列）按「每个逻辑行一个 grid row」布局，续行天然落在同一 row 内，不用绝对定位或伪元素计数。加一条单测断言开启 wrap 时行号数量等于逻辑行数。
- 风险：一次改动同时动 shared 契约、main、preload、renderer 五层，容易破坏包边界或让 `desktop` 直接相对引用 sibling `src/`。
  - 缓解方式：契约只写在 `packages/shared/src/ipc.ts`，desktop 侧一律从 `@actspace/shared` 消费；每个阶段结束都跑 `pnpm typecheck` + `pnpm build`。
- 风险：`fs.watch`（阶段 6 可选增强）在 macOS 上因原子写（rename 替换）丢 inode，导致监听静默失效。
  - 缓解方式：watch 父目录而非文件本身，按 filename 过滤；`fs.watch` 抛错时捕获并降级到阶段 1 的 mtime 重校验，不让主进程崩。该阶段独立可跳过。

## 里程碑

### 阶段 1：契约与 main 侧地基（无 UI 变化）

1. `packages/shared/src/ipc.ts`：
   - `WorkspaceReadFileResult` 增 `mtimeMs: number`；`truncated?: boolean` 的注释改为「文本超过上限，只返回前 `MAX_TEXT_BYTES` 内的完整行」。
   - `WorkspaceFileRenderKind` 增 `"csv"`。
   - 新增 `WorkspaceStatFileInput = { workspaceRoot?: string; relativePath: string }` 与 `WorkspaceStatFileResult = { relativePath: string; size: number; mtimeMs: number; error?: "not_found" | "not_a_file" | "escapes_root" }`。
2. `packages/desktop/src/main/workspace-fs-service.ts`：
   - `LANGUAGE_BY_EXT` 扩表（见下方「语言映射目标清单」）。
   - 新增 `LANGUAGE_BY_BASENAME`（小写 basename 精确匹配）：`dockerfile`→`dockerfile`、`makefile`→`makefile`、`justfile`→`makefile`、`.gitignore`/`.dockerignore`/`.npmignore`→`plaintext`、`.npmrc`/`.editorconfig`→`ini`、`.env`→`bash`、`.prettierrc`/`.babelrc`→`json`、`codeowners`→`plaintext`。
   - 语言判定顺序：basename 精确匹配 → 扩展名匹配 → `.env.*` / `Dockerfile.*` 前缀规则 → 无语言。
   - `readWorkspaceFile` 超过 `MAX_TEXT_BYTES` 时改为读前 `MAX_TEXT_BYTES` 字节、丢弃最后一个不完整行、返回 `truncated: true` + `content`，不再返回 `error: "too_large"`（图片仍保留 `too_large`，因为部分图片无法渲染）。
   - 所有成功与失败分支都返回 `mtimeMs`（失败分支为 0）。
   - 新增 `statWorkspaceFile`，只做 `stat`，不读内容。
   - `renderKindOf` 对 `.csv` / `.tsv` 返回 `"csv"`。
3. `packages/desktop/src/main/index.ts` 注册 `workspace:stat-file`；`preload/index.ts` 与 `global.d.ts` 暴露 `statWorkspaceFile`。
4. 单测扩 `packages/desktop/src/main/test/workspace-fs-service.test.ts`：
   - `Dockerfile` / `Makefile` / `.gitignore` / `.npmrc` 能拿到预期 language。
   - 超过上限的文本返回 `truncated: true`、`content` 非空、且 `content` 不以半行结尾（最后一个字符是 `\n` 或整体无换行）。
   - `.csv` 的 `renderKind === "csv"`。
   - `statWorkspaceFile` 对越界路径返回 `escapes_root`、对目录返回 `not_a_file`。
   - 遍历 `LANGUAGE_BY_EXT` / `LANGUAGE_BY_BASENAME` 全部 value，断言 highlight.js 里存在同名语言。

验证：`pnpm typecheck`、`pnpm --filter @actspace/desktop test`。此阶段结束时 UI 行为不变（除大文件从报错变成截断显示）。

### 阶段 2：P0 正确性 —— 新鲜度与文件树状态

1. 新增 `right-panel/useFileFreshness.ts`：导出 `useFileFreshness()`，内部在三个时机对所有工作区文件 tab 调 `statWorkspaceFile` 比对 `mtimeMs` / `size`：
   - tab 被激活（`activeTabId` 变化）；
   - 窗口重新获得焦点（`window.addEventListener("focus")` + `document.visibilitychange`）；
   - 当前 turn 结束（复用 `App.tsx` 已有的 turn 完成状态，通过 prop 传入的 `revalidateKey` 变化触发）。
   不做 `setInterval` 轮询。
2. `RightPanelContext.tsx`：
   - 文件类 tab 增 `mtimeMs?: number`、`size?: number`、`truncated?: boolean`、`isStale?: boolean`。
   - 新增 `markTabStale(id)`、`replaceTabContent(tab)`。
   - 文件树展开状态提升：新增 `expandedDirs: Set<string>` + `toggleDir(relativePath)`，放在 Provider 里，解决卸载丢状态。
   - 目录列表缓存也提升到 Provider（`dirCache: Map<string, WorkspaceDirEntry[]>`），避免每次重挂都重新 IPC。
3. `WorkspaceFileTree.tsx`：改为消费 `expandedDirs` / `toggleDir` / `dirCache`；给当前激活文件加 `bg-selected` + `aria-current="true"`；`too_many_entries` 时在该目录末尾追加一行「仅显示前 1000 项」。
4. Agent 编辑事件联动：在 `App.tsx` 收到 `edit_diff` / `write_diff` 块时，按 `filePath` 归一化成 workspace 相对路径后调 `markTabStale(`file:${rel}`)`。
5. `RightPanel.tsx` 的 `WorkspaceOperationBar`：
   - 常驻「刷新」按钮（重新 `readWorkspaceFile` 并 `replaceTabContent`）。
   - `isStale` 时在操作栏下方插一条提示条：「文件已变更 · 重新加载」，用 `warning` 语义 token，点击后重载并清除标记。
   - `truncated` 时常驻显示「已截断 · 仅显示前 N 行（共 M）」。
6. 单测：扩 `right-panel-workspace.test.tsx` 与 `workspace-file-tree.test.tsx`：
   - 收起再展开树栏后，之前展开的目录仍是展开态。
   - 激活文件在树里带 `aria-current`。
   - `markTabStale` 后出现「重新加载」按钮，点击后调用 `readWorkspaceFile` 且提示条消失。
   - 无 `window.actspace` 时不抛错、不出现刷新按钮。

验证：`pnpm typecheck`、单测、浏览器 renderer 看空态与降级。

### 阶段 3：P1 阅读体验 —— 行号 / wrap / 复制 / 搜索

1. 把 `RightPanel.tsx` 里的 `TextRenderView` 移到新文件 `right-panel/CodeRenderView.tsx` 并扩展：
   - CSS grid 双列行号：gutter 列 `text-text-faint` + `select-none`（复制时不带行号），内容列。每个逻辑行一个 grid row。
   - wrap 开关（默认关闭，改为 `whitespace-pre` + 横向滚动；这是相对现状的行为变化，要写进设计文档）。状态按 tab 保存在 Provider 里，切 tab 不丢。
   - 复制按钮（`navigator.clipboard.writeText`，成功后图标切 `Check` 1.5s）。
   - 文件内搜索：工具栏一个搜索框，`Enter` / `Shift+Enter` 跳上下一个命中，显示「第 i / 共 n 项」，命中用 `bg-warning-soft`、当前命中用 `bg-warning`。搜索在高亮之后的纯文本层做匹配（按行 index + 列 offset 定位），不破坏 hljs 的 span 结构。
   - `Cmd+F` 在面板内聚焦搜索框（只在右侧面板获得焦点时接管，不劫持全局）。
2. 行号与搜索都基于「按行切分」的中间结构，所以先把 `hljs.highlight` 的输出改成按行返回（`hljs` 的输出跨行 span 需要做逐行闭合处理，实现放在 `highlight.ts` 的 `highlightToLines()`）。
3. 单测：新增 `code-render-view.test.tsx`：
   - 行号数量等于逻辑行数（wrap 开 / 关 两种情况都测）。
   - gutter 带 `select-none`。
   - 搜索命中数正确，`Enter` 推进当前命中 index。
   - 无 language 时回退纯文本仍有行号。

验证：`pnpm typecheck`、单测、浏览器 renderer 截图对比浅深两态。

### 阶段 4：P2 高亮覆盖 —— 按需注册 + Markdown 源码

1. 新增 `right-panel/highlight.ts`：
   - 从 `highlight.js/lib/core` 导入 core，逐个 `registerLanguage` 只注册 main 侧值域用到的语言。
   - 导出 `highlightToLines(content, language)`。
   - 导出 `SUPPORTED_HLJS_LANGUAGES` 供单测断言。
2. `CodeRenderView.tsx` 与 `MarkdownRenderView.tsx` 的源码视图都改用 `highlight.ts`（Markdown 源码按 `markdown` 语言高亮）。
3. `MarkdownRenderView.tsx` 的 `rehypeHighlight` 保留（预览态用），但确认它与 `.act-code-hl` 配色共用，不新增第二套颜色。
4. 构建后核对 bundle：`rg -c 'name:"Brainfuck"' packages/desktop/dist/assets/*.js` 应为 0。
5. 单测：`highlight.test.ts` 断言 `LANGUAGE_BY_EXT` / `LANGUAGE_BY_BASENAME` 值域全部已注册（与阶段 1 的 main 侧测试互为两端锁）。

验证：`pnpm typecheck`、`pnpm build`、单测、bundle grep。

### 阶段 5：P3 大文件 —— 分块异步高亮

1. `CodeRenderView.tsx`：内容超过阈值（8000 行或 512KB）时改为分块高亮 —— 首屏同步高亮前 500 行立即可读，其余用 `requestIdleCallback`（无则 `setTimeout(0)`）分批推进，每批 500 行，组件卸载时取消。
2. 高亮期间在工具栏显示轻量进度文案「正在高亮 …」，不用 spinner 遮挡内容。
3. 单测：`code-render-view.test.tsx` 增一条：超过阈值时首次渲染即有内容输出（不是空白），且不抛错。

验证：`pnpm typecheck`、单测；手工用仓库内最大的文本文件在 Electron 里打开确认不卡。

### 阶段 6：P4 CSV 预览 + 文档对齐

1. 新增 `right-panel/CsvRenderView.tsx`：
   - 解析支持引号包裹、字段内逗号与换行、`""` 转义；分隔符按 `.tsv` 用 `\t`、其余用 `,`。
   - 首行当表头（可切「首行为数据」）；表头 sticky；行号列复用阶段 3 的 gutter 样式。
   - 超过 2000 行只渲染前 2000 行并提示；提供「以纯文本查看」切换（复用 `CodeRenderView`）。
   - 解析失败或列数不一致时降级为纯文本视图并给出提示，不抛错。
2. `RightPanelContext.tsx` 增 `{ kind: "csv" }` tab；`WorkspaceFileTree.tsx` 的 `tabFromFile` 分发到它。
3. 文档同步 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`：
   - Tab 类型表里 CSV 标为已实现，PDF 明确标注「未实现，V2」。
   - 新增「文件新鲜度与重新加载」小节，写清三级信号、不自动替换内容的取舍、以及为什么不接 fs-watch。
   - 新增「代码视图能力」小节：行号、wrap 默认关闭、复制、文件内搜索、分块高亮阈值。
   - 更新「main 侧服务规则」：文本超限从整体拒绝改为部分读 + `truncated`；语言判定顺序含 basename 兜底。
   - 更新 IPC 契约代码块（`mtimeMs`、`csv`、`WorkspaceStatFile*`）。
4. `docs/histories/` 记一条本轮变更。
5. 按 `AGENTS.md` 的沉淀规则判断是否写 `docs/learnings/2026-07/`：本轮命中「有陷阱」（highlight.js 全量入口静默打包 192 语法）与「有模式」（用已有 Agent 编辑事件替代文件监听的信号选择），达到两条，需要写。

验证：`pnpm typecheck`、`pnpm build`、单测、`pnpm check:frontend-theme`、文档链接检查。

### 语言映射目标清单（阶段 1 用）

在现有 20 条基础上补：

- Web/前端：`.vue`→`xml`、`.svelte`→`xml`、`.astro`→`xml`、`.html`/`.htm` 已走 html renderKind 不需要、`.xml`/`.svg`（非图片场景不适用）→`xml`、`.mdx`→`markdown`
- 后端/系统：`.java`→`java`、`.kt`/`.kts`→`kotlin`、`.c`/`.h`→`c`、`.cpp`/`.cc`/`.cxx`/`.hpp`→`cpp`、`.cs`→`csharp`、`.rb`→`ruby`、`.php`→`php`、`.swift`→`swift`、`.dart`→`dart`、`.lua`→`lua`、`.r`→`r`、`.pl`→`perl`、`.ex`/`.exs`→`elixir`、`.scala`→`scala`
- 配置/基础设施：`.ini`/`.cfg`/`.conf`/`.properties`→`ini`、`.dockerfile`→`dockerfile`、`.tf`/`.tfvars`/`.hcl`→`ini`（见下方修正）、`.gradle`→`gradle`、`.ps1`→`powershell`、`.bat`/`.cmd`→`dos`；`go.mod`/`go.sum`/`go.work` 走 basename 判定
- 数据/协议：`.graphql`/`.gql`→`graphql`、`.proto`→`protobuf`、`.jsonl`/`.ndjson`→`json`、`.json5`→`json`
- 其它：`.diff`/`.patch`→`diff`、`.txt`/`.log`→ 无语言（保持纯文本，避免误高亮）、`.fish`→`bash`、`.make`→`makefile`、`.cmake`→`cmake`、`.vim`→`vim`

`.csv` / `.tsv` 不进语言表，走新的 `csv` renderKind。

## 验证方式

### 命令

```sh
pnpm typecheck
pnpm build
pnpm --filter @actspace/desktop test
pnpm check:frontend-theme
```

预期结果：全部通过；`pnpm build` 后 `rg -c 'name:"Brainfuck"' packages/desktop/dist/assets/*.js` 输出 0（证明 176 种无用语法已从 bundle 移除），且该 chunk 体积相对基线 1.9MB 有可观测下降。

### 手工检查（浏览器 renderer，`http://127.0.0.1:5173/`）

无 preload 环境下：文件树显示「当前环境不支持文件浏览。」，刷新按钮与搜索框不出现，页面不白屏、控制台无未捕获错误。

### 手工检查（Electron，`pnpm dev`）

按用户确认的分工，代码侧自查后由用户在 Electron 窗口确认并截图。验收清单：

1. 打开一个 `.ts` 文件 → 有行号、有高亮、默认不软换行可横向滚动；点 wrap 开关后行号数量不变、无错位。
2. 打开 `Dockerfile`、`.gitignore`、`Makefile`、`LICENSE` → 前三个有高亮，`LICENSE` 为纯文本但仍有行号。
3. 打开一个 `.csv` → 表格视图、表头 sticky；切「以纯文本查看」正常。
4. 右侧打开某文件后，让 Agent 改这个文件 → 操作栏出现「文件已变更 · 重新加载」，点击后内容更新；期间内容不会被自动抽换。
5. 右侧打开某文件后，用外部编辑器改它并切回 Electron 窗口 → 同样出现提示（验证 mtime 兜底路径）。
6. 展开几层目录 → 收起树栏再展开、切到 Kairos tab 再切回 → 展开层级仍保留；当前文件在树里高亮。
7. 打开超过 2MB 的文本文件 → 显示前 N 行 + 截断提示，不再是「文件过大，暂不在此预览。」。
8. 文件内搜索：输入关键词有命中计数，`Enter` 逐个跳转，命中高亮在浅色和深色下都清晰可辨。
9. 浅色 / 深色 / 跟随系统三态各过一遍第 1、4、8 项，确认行号、提示条、搜索命中色都随主题翻转。

### 观测检查

`pnpm dev:log` 启动，改动过程中查 `logs/latest-dev.log`：新增的 `workspace:stat-file` 不应出现高频调用（每次 tab 激活 / 窗口聚焦 / turn 结束各一次量级），若出现每秒多次说明触发时机写错了。

## 进度记录

- [x] 调研右侧 file 模块现状，确认 11 条事实（见「已确认的现状事实」）。
- [x] 确认文件新鲜度方案，排除 fs-watch 插件（见「决策记录」）。
- [x] 写下本执行计划。
- [x] 阶段 1：契约与 main 侧地基。`pnpm --filter @actspace/desktop exec vitest run src/main/test/workspace-fs-service.test.ts` → 19 passed。
- [x] 阶段 2：P0 新鲜度与文件树状态。
- [x] 阶段 3：P1 行号 / wrap / 复制 / 搜索。
- [x] 阶段 4：P2 按需注册高亮 + Markdown 源码高亮。
- [x] 阶段 5：P3 分块异步高亮。
- [x] 阶段 6：P4 CSV 预览。
- [x] 全量验证（截至代码上限修复前）：`pnpm typecheck` 全绿；`pnpm check:frontend-theme` 通过；`pnpm --filter @actspace/desktop test` → 74 files / 624 tests passed；`pnpm --filter @actspace/desktop build` → renderer chunk **1,991 kB → 1,117 kB**（gzip 617 kB → 335 kB，-44%），bundle 内 `brainfuck` / `vhdl` / `erlang` 均为 0。
- [x] Electron 真实验证（CDP 驱动真实 renderer，见下方「Electron 实测结论」）。
- [x] 文档同步：设计文档（Tab 类型 / 代码视图能力 / 新鲜度 / CSV / main 侧规则 / IPC 契约 / 文件树状态规则）、`docs/histories/2026-07/20260730-1200-right-panel-file-view-optimization.md`、三篇 learning（库入口与体积、新鲜度信号选择、断言类名≠行为）。
- [ ] **待重跑（阻塞中）**：以下三批改动之后，本机 shell 一直不可用（连 `uptime` 都挂十分钟不返回，见下方「本机 shell 阻塞」），未能再跑 typecheck / build / 全量单测。下次接手第一件事就是重跑「验证方式」里那组命令。
  1. `MAX_RENDERED_LINES` 上限、`LineRow` memo、`WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES` 收敛到 shared；
  2. 布局对齐 Cursor（树移右栏、操作栏简化、过滤框重做、`OpenInAppMenu` + `relativePath` 契约）；
  3. 撤掉代码视图工具栏 + 折行固定开启 + 预览/源码切换移入操作栏（`code-render-view.test.tsx` 已按新形态重写，`right-panel-workspace.test.tsx` 新增一条操作栏切换用例）。
- [ ] 用户在 Electron 窗口复核 9 项验收清单（其中「软换行」与「文件内搜索」两项已作废，改为复核「长行是否恒折行」「视图内确实没有按钮」）。

### 本机 shell 阻塞（2026-07-30）

上一轮为了实测大文件性能，跑了一个持续生成并打开大文件的脚本，同时 Electron 带着 CDP 在跑 —— 大量写盘触发文件监听、渲染进程堆出几十万节点，把机器压到无响应。脚本与 Electron 已 kill，但 shell 会话至今没恢复（`echo` 挂 6 分钟以上不返回）。

**下次做性能实测的约束**：生成大文件的脚本必须一次性生成、跑完即退，不要写成循环持续生成；实测大文件前先关掉 fs-watch 类监听；单次实测的行数上限自己心里有数（本轮 5 万行就已经 13.5s，19 万行没必要真跑）。

### Electron 实测结论（CDP 驱动真实 renderer，非浏览器 mock）

`screencapture` 被系统屏幕录制权限拦下，改为给 Electron 加 `--remote-debugging-port=9222`，用 CDP 对**真实** renderer（带 preload / IPC）取值和截图。已验证：

| 项 | 结论 |
| --- | --- |
| 语法高亮 | `highlight.ts` 打开后 446 个 token、12 种 token 类型（keyword / string / comment / title / number …） |
| 行号 | 273 行代码对应 273 个 gutter 行号，一一对应 |
| 行号钉住 | 横向滚动 140px 后 gutter 仍贴在左边（`position: sticky`） |
| 软换行 | 关：最长行 1 行、可横向滚动；开：同一行折成 2 行、横向滚动消失 |
| 文件内搜索 | 53 命中 / 计数 `1/53` / 逐个跳转成环；**50 个 mark 嵌在 hljs token 内部**，证明搜索高亮与语法高亮共存 |
| 当前命中区分度 | 深色下 active `rgb(210,161,77)` vs 普通 `rgb(62,50,28)`，明显可辨 |
| 深色主题 | token 配色整套翻转（keyword 紫、string 绿、number 橙），gutter 底色 `rgb(41,42,38)` |
| 新鲜度 | `touch` 文件后触发 window focus → 出现「文件已在磁盘上变更…」提示条；点「重新加载」后提示消失 |
| 截断 | 2MB+ 文件出现「文件过大，仅显示前 2.0 MB 内的完整行」 |
| CSV | `products.csv` 渲染成 161 行 × 9 列表格，表头 sticky，引号内含逗号的字段未被错切 |
| Markdown 源码 | 75 行、75 个行号、91 个 token（源码态已接入同一高亮） |
| IPC | `statWorkspaceFile` / `readWorkspaceFile` 真实可用，返回 `renderKind` / `mtimeMs` / `truncated` |

## 决策记录

- 2026-07-30：**文件新鲜度不走 fs-watch 插件，改用「Agent 编辑事件 + mtime 重校验」两级信号。** fs-watch 按 `docs/design-docs/agent-plugins-fs-watch.md` 是用户可选安装的 Rust 常驻进程，需要 Rust 工具链手动编译，未安装的用户就完全没有刷新能力，而右侧面板的内容新鲜度是正确性功能，不能建立在可选插件上；它的监听根来自设置页 `config.json` 的 `roots`，与当前 session 的 `workspaceRoot` 无关，用户很可能没把当前工作区加进监听；它的输出是 500ms 去抖后按天轮转的 JSONL 审计日志 + 30s 心跳，为 Agent 的 `read_file` 语义消费设计，把它当 UI 事件总线要叠「去抖 + 落盘 + main 轮询」三层延迟；且该文档明确写了「不做插件与宿主的双向通信」「两仓之间的唯一耦合是文件契约」，让 renderer 依赖 JSONL schema 会破坏这条边界。改用的两级信号成本更低且总是可用：`MessageBlock` 的 `edit_diff` / `write_diff` 已经带 `filePath`，renderer 实时就知道 Agent 改了哪些文件，零新增基础设施即覆盖主场景；`readWorkspaceFile` 本来就 `stat` 过文件，把 `mtimeMs` 带回来后只需在 tab 激活 / 窗口重获焦点 / turn 结束三个时机各做一次 O(1) stat，即可兜住外部编辑器与 git checkout。影响：右侧面板与插件体系保持零耦合，插件仍只服务 Agent 语义消费。
- 2026-07-30：**检测到文件变更后不自动替换内容，只打 stale 标记 + 显式「重新加载」。** 用户可能正在阅读或选中文本，内容被自动抽换比看到旧内容更糟。不提供「自动重载」开关，避免两套行为都要维护。
- 2026-07-30：**`fs.watch` 实时监听推迟为 V2，不在本计划内。** 阶段 1、2 的两级信号已能保证正确性；`fs.watch` 只是把「点一下才刷新」变成「自动刷新」，属于体验增量。真要做时应 watch 已打开文件的**父目录**而非文件本身（Agent 与编辑器常用 rename 原子写，watch 文件路径会丢 inode），上限 8 个目录、非递归、生命周期跟着 tab 走 —— 这与 fs-watch 插件排除 `fs.watch` 的理由不冲突，插件排除的是长期多目录**递归**监听。
- 2026-07-30：**继续用 highlight.js，不换 Shiki。** 用户明确选择。改动集中在「按需注册替代全量入口」+「扩表 + basename 兜底」，既修覆盖面又顺手把 176 种用不到的语法从 bundle 里去掉；Shiki 需要引入异步高亮管道并重做主题翻转，成本与本轮目标不匹配。设计文档里 Shiki 作为 V2 可选升级的表述保持不变。
- 2026-07-30：**文本超限从整体拒绝改为部分读。** 契约里 `truncated?` 早已预留但 main 侧从未设置，`too_large` 让 2MB 以上文件完全不可查看。改为返回前 2MB 内的完整行 + `truncated: true`，并在 UI 常驻截断提示。图片仍保留 `too_large`，因为部分图片字节无法渲染。
- 2026-07-30：**`.tf` / `.tfvars` / `.hcl` 映射到 `ini` 而不是 `hcl`。** 阶段 1 新加的「映射值域必须都是 highlight.js 真实语言」这条防漂移测试当场抓出 `hcl` 不存在 —— highlight.js 不内置 HCL / Terraform 语法，那是第三方 `highlightjs-terraform` 才提供的。选 `ini` 近似：`#` 注释、字符串和 `key = value` 都能正确着色，`resource "x" "y" {` 这类 block 头行退化成纯文本，不会产生错误的关键字着色。这条测试的价值当场就体现出来了，保留。
- 2026-07-30：**四个只有真机跑起来才暴露的缺陷，都是「单测断言了类名、但类名不等于行为」。** 记下来是因为它们共享同一个失效模式，值得当成写断言时的反例：
  1. **软换行开关是个空操作。** grid 一直挂着 `w-max`，宽度取 max-content，代码列那个 `1fr` 就等于「最长行的宽度」，`whitespace-pre-wrap` 永远没有需要折行的机会。单测断言了 `whitespace-pre-wrap` 在不在，所以全绿；CDP 一量 `rowsForLongest` 仍是 1 才发现。修法是宽度随 wrap 切换（`w-full` / `w-max`），补的断言也从「有没有这个类」改成「两种状态下 grid 宽度类是否互斥」。
  2. **行号会被横向滚动带走。** gutter 在滚动容器内且 `position: static`，滚到右边就完全看不出在第几行 —— 恰好是长行最需要行号的时候。改成 `sticky left-0` + 不透明底色。
  3. **打开查找后首字符被吃掉。** `openSearch` 在 `requestAnimationFrame` 里补 `select()`，那一帧落在用户已经开始打字之后，把刚输入的字符选中、下一个键位直接替换掉，查询变成 `lpha`。这个是写组件测试时被 `user.type` 撞出来的（断言值 `alpha` 实际拿到 `lpha`），不是真机发现的 —— 说明「测试里像真人一样按顺序操作」比「构造好状态再断言」更容易撞出竞态。改成用 ref callback 在挂载时同步聚焦。
  4. **按行渲染让大文件退化。** 每个逻辑行两个 DOM 节点，2MB 日志有 19 万行 = 38 万节点，实测 5 万行的文件要 13.5s 才打开。旧实现是单个 `<pre>`（一个节点）所以从不受影响 —— 换成按行渲染是**引入**了这个回归，不是继承的。两处修：`LineRow` 加 `memo`（分块高亮每推进一批就换掉整个数组，没有 memo 每批都会重渲染全部行，5 万行 × 50 批），以及 `MAX_RENDERED_LINES = 20000` 上限 + 工具栏明示还有多少行没显示（与 `CsvRenderView` 已有的 2000 行上限同一套取舍）。
- 2026-07-30：**`WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES` 收敬到 `packages/shared/src/ipc.ts`。** 原先 main 的 `MAX_TEXT_BYTES` 和 renderer 的 `TEXT_PREVIEW_LIMIT_BYTES` 各写了一份 `2 * 1024 * 1024`，靠注释互相提醒。这个数是 main 的策略、renderer 只是在提示条里复述，改一边就会让文案说谎，属于必须共享的契约。
- 2026-07-30：**Markdown fenced code 改用与文件视图同一份语言表。** `rehype-highlight` 的 `languages` 是**替换**默认的 lowlight `common` 而非追加。换掉后 dockerfile / protobuf / dart / cmake / powershell 等在 fence 里从不着色的语言补齐了；代价是 common 独有的 arduino / objectivec / php-template / python-repl / vbnet / wasm 不再支持，本仓库不写这些。注意这里**换不来体积**：`rehype-highlight` 无条件静态 import 了 `common`，摇不掉（产物里仍能搜到 objectivec / vbnet）。曾试过取并集来兼得两者，但那要求直接 import `lowlight`，而它只是传递依赖 —— 为这点边角覆盖引入 phantom dependency 不值，遂放弃。
- 2026-07-30：**`WorkspaceFileTree` 的「上次是哪个 root」记在 Provider 而不是组件里。** 换 workspace 要清空展开层级，但这个组件会随树栏收起 / 切到对象 Tab 反复挂载卸载。先用组件内 `useRef` 记录，重挂载时 ref 一起重建，等于每次挂载都误判成换根，把刚提升到 Provider 的展开状态又清掉 —— 状态白提升。改为 Provider 持有 `{ known, root }`，`known: false` 表示还没有树挂载过、此时同步 root 不算换根。
- 2026-07-30：**`Element.prototype.scrollIntoView` 的桩打在共享 setup 里，必须先 `typeof Element !== "undefined"`。** jsdom 不实现布局所以没有这个方法，但 `src/renderer/test/setup.ts` 同时被 node 环境的 main 进程测试加载，无条件访问 `Element` 会让 6 个 main 侧测试文件直接加载失败。
- 2026-07-30：~~**代码视图默认关闭软换行。**~~ 现状 `whitespace-pre-wrap` 让长行折起来后看不出缩进层级，对代码阅读是净损失。默认改 `whitespace-pre` + 横向滚动，保留开关。这是相对现状的显式行为变化，已写入设计文档待更新项。**已被下一条推翻。**
- 2026-07-30（用户反馈后）：**折行固定开启，代码视图整条工具栏撤掉。** 上面那条「默认关闭 + 保留开关」的取舍只考虑了「折行丢缩进层级」，没算上「右面板只有几百 px 宽」这个前提 —— 在窄栏里横向滚动读代码的代价比丢缩进更大。既然固定折行，开关就没有存在意义；同一栏里的查找与复制也一并撤掉：它们是编辑器动作，在只读预览里的使用频率撑不起「每个文件上方常驻一层 chrome」。`CodeRenderView` props 收敛为 `{ content, language }`，`RightPanelContext` 的 `isWrapEnabled` / `setWrapEnabled` 删除，「仅渲染前 20,000 行」从工具栏挪到内容末尾，「正在高亮…」直接去掉。搜索的支撑件一并删除（`injectMatchMarks` + 四条单测 + `mark.act-code-match` 两条 CSS）：留着就是「以后可能用得上」的未用代码，真要做 `Cmd+F` 时从 git 历史取回比维护死代码便宜。
- 2026-07-30：**预览 / 源码切换从视图内移到 Workspace 操作栏，做成显示目标态的单个文字按钮。** 对齐 Cursor 第二层的 `View source` / `View preview`。做成文字而不是第三个图标，是因为那一栏已有两个图标，再加一个就分不清哪个是模式切换；显示「查看源码」（目标）而不是「源码 | 预览」（分段控件）在 200~400px 的窄栏里省一半宽度。实现上 `MarkdownRenderView` / `HtmlRenderView` 改成受控（传 `mode` + `onModeChange`，不渲染自带工具栏）/ 不受控双形态 —— **不能只留受控一种**：聊天生成的 markdown / html 是对象 Tab，整面板呈现、没有操作栏，只留受控会让它们彻底失去源码入口。按钮同时要求当前 Tab 有 `relativePath`：浏览态下激活对象 Tab 时内容区是「选择文件查看」占位页，此时按钮点了没有任何视图会响应。
