# 2026-05-30 工作区文件浏览器计划

## 目标

在右侧面板新增一个轻量「工作区文件浏览器」：左侧常驻可折叠文件树（rail），点文件用已有渲染视图开成普通 Tab。第一版只做**只读 + 单 root（当前会话 workspaceRoot）**，让用户能直接翻看 Agent 实际操作的文件，并为后续 path 直达 / diff 标记 / Kairos 配置编辑预留地基。

派生自设计规范 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`。规范是「为什么 / 做成什么样 / V1-V3 边界 / 安全约束」的事实来源；本计划只负责「谁改哪些文件、按什么顺序、怎么验证」。两者冲突以规范为准。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/SECURITY.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/core-storage-and-observability.md`

## 范围

包含：

- 新增两个读盘 IPC：`workspace:list-dir`（懒加载一层目录）、`workspace:read-file`（读单文件）。
- main 侧文件服务 `workspace-fs-service.ts`（忽略名单 / 条目上限 / 大小上限 / 二进制识别 / 图片 data URL / renderKind 判定 / 越界拦截）。
- renderer 文件树 rail 组件 + `RightPanelContext` 的 rail 开关状态。
- 点文件复用现有 `Markdown / HTML / Image / Text` 渲染视图开 Tab（`file:<相对路径>` 稳定 id 去重）。
- `+` 新建对象菜单新增「工作区文件」入口唤出 rail。
- 浏览器 mock 降级 + 单测。

不包含（属 V2 / V3，等用户显式指令再做）：

- 消息内 path 点击直达、读/建/改角标。
- 会话级 diff 树标记。
- `.gitignore` 解析、文件搜索、多 root 切换、PDF / CSV 预览。
- 文件编辑保存、Kairos 配置编辑器。

## 相关代码路径

- `packages/shared/src/ipc.ts`（IPC 契约）
- `packages/desktop/src/main/workspace-fs-service.ts`（新增）
- `packages/desktop/src/main/index.ts`（注册 handler）
- `packages/desktop/src/main/agent-run.ts`（`AppDataRoots` 类型来源，复用其 `workspaceRoot`）
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`（新增）
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`（mock 降级）
- `packages/agent-core/src/tools/workspace-guard.ts`（越界语义参考，不改）

## 并行边界

- 本计划 owns 文件浏览器 rail、文件树组件、两个 workspace fs IPC、main fs 服务。
- 复用现有渲染视图（`MarkdownRenderView` / `HtmlRenderView` / `ImageRenderView` / `TextRenderView`），**不改它们的对外 props**。
- 不改 Composer、Context 弹窗、Usage 页面。
- 与 `20260527-right-panel-views.md` 协同：本计划补齐其待办「`read-file` IPC（renderer 不直接读 FS）」，但聚焦「文件浏览器」主线，message-inline 点击属 V2。
- 新增 IPC 必须保持 renderer 不直接访问文件系统。

## V1 实施任务

### Task 1：shared IPC 契约

修改文件：`packages/shared/src/ipc.ts`

- 按设计规范「IPC 契约」小节，新增类型：`WorkspaceListDirInput` / `WorkspaceEntryKind` / `WorkspaceDirEntry` / `WorkspaceListDirResult` / `WorkspaceReadFileInput` / `WorkspaceFileRenderKind` / `WorkspaceReadFileResult`。
- `WorkspaceReadFileResult` 含 `language?: string`（text 类语法高亮语言 id）。
- 字段名、错误码枚举与规范逐字一致。

验收：`pnpm typecheck` 通过；类型可被 desktop main / preload / renderer 引用。

### Task 2：main fs 服务 + IPC 注册 + preload + 类型

修改/新增文件：

- 新增 `packages/desktop/src/main/workspace-fs-service.ts`，导出：
  - `listWorkspaceDir(input: WorkspaceListDirInput, roots: AppDataRoots): Promise<WorkspaceListDirResult>`
  - `readWorkspaceFile(input: WorkspaceReadFileInput, roots: AppDataRoots): Promise<WorkspaceReadFileResult>`
  - 规则严格按规范「main 侧服务规则」：根解析（`input.workspaceRoot ?? roots.workspaceRoot`）、越界 `escapes_root`、忽略名单（`node_modules / .git / .pnpm-store / dist / .next / .turbo / coverage / .DS_Store`）、单目录上限 `1000` → `too_many_entries`、目录在前 `localeCompare` 升序、文本上限 `2MB` / 图片上限 `5MB` → `too_large`、扩展名映射 renderKind、NUL 字节 → `binary`、截断置 `truncated`。
  - text 类按规范「语言推断」表把扩展名映射成 `language`（`ts→typescript` / `js→javascript` / `css→css` / `yaml→yaml` / `json→json` 等）；表外扩展名不回传 `language`，**不做 `highlightAuto`**。
- `packages/desktop/src/main/index.ts`：`ipcMain.handle("workspace:list-dir", ...)` 与 `ipcMain.handle("workspace:read-file", ...)`，透传 `roots`（与 `visualize:list` 等同款方式拿 `AppDataRoots`）。
- `packages/desktop/src/preload/index.ts`：`window.actspace` 暴露 `listWorkspaceDir` / `readWorkspaceFile`。
- `packages/desktop/src/global.d.ts`：补两个方法签名。

验收：新增单测 `packages/desktop/src/main/test/workspace-fs-service.test.ts`（用 `mkdtemp` 临时目录）覆盖：

1. 列目录：目录在前、文件在后、按名升序。
2. 忽略 `node_modules` / `.git` 不出现在 entries。
3. 越界 `relativePath: "../.."` → `escapes_root`，且未读盘。
4. 读 `.md` → `renderKind: "markdown"` 且 `content` 为原文。
5. 读 `.png`（写入合法 PNG 头字节）→ `renderKind: "image"` 且 `dataUrl` 以 `data:image/png;base64,` 开头。
6. 含 NUL 字节的 `.bin`（按 text 分支）→ `binary`。
7. 超过 `2MB` 文本 → `too_large`（或 `truncated`，按规范取 `too_large`）。
8. 读 `.ts` → `renderKind: "text"` 且 `language: "typescript"`；读 `.yaml` → `language: "yaml"`；读无扩展名 / 表外扩展名 → `language` 缺省。

命令：`pnpm test`（该文件全绿）；`pnpm typecheck`。

### Task 3：renderer 文件树 rail + Context 开关

修改/新增文件：

- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`：新增 `isFileTreeOpen: boolean` + `toggleFileTree()` / `openFileTree()` / `closeFileTree()`，与 `tabs` 解耦。
- 新增 `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`：
  - 顶部小标题 + 折叠开关；隐藏滚动条（`scrollbar-none`）。
  - 懒加载：展开目录时调 `window.actspace.listWorkspaceDir`，缓存已展开目录的 entries。
  - 文件夹 / 文件图标用 lucide（`ChevronRight` / `Folder` / `File`），颜色走主题 token。
  - 点目录：展开/折叠。点文件：`await window.actspace.readWorkspaceFile` → 按 `renderKind` 调 `openTab`：
    - markdown → `{ kind: "markdown", source: content, relativePath }`
    - html → `{ kind: "html", html: content, trust: "file", relativePath }`
    - image → `{ kind: "image", src: dataUrl, relativePath }`
    - text → `{ kind: "text", content, language, relativePath }`
    - tab id 一律 `file:<relativePath>`；错误码（too_large / binary 等）渲染成 text Tab 的可读提示。
  - 无 `window.actspace`（浏览器 mock）时显示禁用空态，不抛错。
- `packages/desktop/src/renderer/components/RightPanel.tsx`：
  - 把面板改成 `[rail][分隔线][tabs+body]` 横向布局；`isFileTreeOpen` 时渲染 rail（固定宽约 `220px`），否则不占位。
  - `TextRenderView` 接 `language`：有 `language` 时用 `highlight.js`（`hljs.highlight(content, { language, ignoreIllegals: true })`，未注册语言 try/catch 回退纯文本）生成高亮 HTML，外层包共享 `.act-code-hl` 作用域；无 `language` 维持纯等宽 `<pre><code>`。
- `packages/desktop/src/renderer/styles/markdown.css`：把 `--md-hl-*` 变量 + `.hljs-*` token 规则从 `.markdown-doc` 作用域**提取为共享 class** `.act-code-hl`（`.markdown-doc` 也带上它），浅/深主题三态变量同步迁移，保证 Markdown 与代码 Tab 共用一套主题感知配色。

验收：浏览器 mock（注入 `listWorkspaceDir` / `readWorkspaceFile` 假数据）下：

- 展开根目录显示条目；点 md 文件在右侧 Tab 渲染文档；点图片显示 data URL 图。
- 点 `.ts` / `.css` / `.yaml` 文件在 text Tab 出现语法高亮；无扩展名/纯文本无高亮但可读。
- 浅 / 深双主题下树配色与代码高亮配色都正确（无写死颜色）。

### Task 4：`+` 菜单入口

修改文件：`packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`

- 在现有三项（Reply HTML / Kairos / Context）基础上加「工作区文件」一项（图标 `FolderTree` 或 `Files`），点击调 `openFileTree()`（唤出并聚焦 rail），不新增 Tab。

验收：点菜单项后 rail 出现并聚焦；rail 折叠开关可收起。

### Task 5：mock 降级 + 组件单测

修改/新增文件：

- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`：补一份 mock 工作区树 + 文件内容，供浏览器态演示与测试。
- 新增 `packages/desktop/src/renderer/test/workspace-file-tree.test.tsx`：渲染树、点目录懒加载、点文件触发 `openTab`（mock IPC）、空态降级；点 `.ts` 文件触发的 text Tab 带 `language: "typescript"`。

验收：`pnpm test` 全绿。

## 验证方式

- `pnpm typecheck`
- `pnpm test`（新增 main 服务测试 + 树组件测试全绿）
- `pnpm build`
- 浏览器 mock 验证树展开、点文件渲染、空态；**浅 / 深双主题都要验**（配色硬约束）。
- 因涉及文件读取 / preload / IPC / 本地路径，必须做 **Electron 真实验证**（见 `FRONTEND_VERIFICATION.md`）：真实 workspace 下展开树、点 md/图片/文本/html，验证越界被拦、大文件提示、忽略名单生效。

## 失败回退

- 任一 Task 失败：单 commit 粒度回退该 Task；IPC 契约（Task 1）是其余 Task 的地基，须先稳定。
- main 服务出现性能/卡顿：先把条目上限调小、忽略名单加项，不引入 worker。
- 浏览器 mock 缺 IPC：必须降级为空态而非崩溃，作为回退安全网。

## 进度记录

- [x] 2026-05-30：Task 1：shared IPC 契约（含 text 类 `language`）。
- [x] 2026-05-30：Task 2：main fs 服务 `workspace-fs-service.ts` + IPC 注册 + preload + `global.d.ts` + 9 例单测。
- [x] 2026-05-30：Task 3：renderer 文件树 rail（`WorkspaceFileTree.tsx`）+ `RightPanelContext` 开关 + `RightPanel` 横向布局 + `TextRenderView` highlight + `.act-code-hl` CSS 提取。
- [x] 2026-05-30：Task 4：`+` 菜单「工作区文件」入口唤出 rail。
- [x] 2026-05-30：Task 5：组件单测 3 例 + 补现有 app 测试 mock；浏览器无 IPC 优雅降级。
- [x] 2026-05-30：`pnpm typecheck` + `pnpm test`（agent-core 497 + desktop 180 全绿）+ `pnpm build` 通过。
- [ ] 待人工：Electron 真实验证（真实 workspace 展开树、点 md/图片/代码文件、越界拦截、浅/深双主题）。

## V1 完成情况（2026-05-30）

V1 全部任务已落地并通过自动化校验。`workspaceRoot` 取数 V1 走 main 的 `BootstrapState.workspaceRoot` 兜底（未透传 per-session root，留待后续）。highlight.js 采用全量 import 以覆盖 toml 等表内语言，renderer chunk 体积警告为既有现象，按需可在后续切 `highlight.js/lib/common` 或动态分包优化。

## 决策记录

- 2026-05-30：与用户共定文件浏览器方向——形态用「树 rail + 文件 Tab」（接近 Cursor 编辑器布局）；V1 范围只做 `+` 菜单唤出的只读浏览器，不做消息内 path 联动；采用「先文档后代码」，先落 `front-右侧面板与文件渲染规范.md` 再派生本计划。
- 2026-05-30：UI 浏览强约束在 `workspaceRoot` 内，**故意不复用**读工具放开越界的 `resolveReadablePath`；图片用 data URL 规避 `file://` + CSP；HTML 文件走 `trust="file"` strict CSP。
- 2026-05-30：Kairos 配置编辑列入 V3，且**必须复用** `kairos:read-config` / `kairos:write-config` 带校验通道，不退化成通用 fs 写。
- 2026-05-30：ts/js/css/yaml/json 等代码配置文件折进 V1 做**语法高亮**——复用已是直接依赖的 `highlight.js` + Markdown 的主题感知 hljs 配色（提取共享 `.act-code-hl` 作用域）；按扩展名确定性推断语言，不做 `highlightAuto`，表外扩展名回退纯等宽。
