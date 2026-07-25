## [2026-05-26 20:48] | Task: 工具命名统一与 Web Search 图标去除

### 🤖 Execution Context

- **Runtime**: Cursor IDE
- **Base Model**: claude-opus-4.7

### 📥 User Query

> 我发现工具的定义整体格式有点小问题：
> - 前端工具的展示是不需要 icon 的，我看网络搜索又
> - 工具的名称定义，是驼峰，还是中划线，还是下划线，统一一下吧
>
> 嗯嗯开始修复吧，可以吧 search_files 这个去掉，web_search 这里补充一下

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/desktop`、`packages/shared` (无)、`docs/`

**Key Actions:**

- **去掉 web_search 的 Globe 图标**：`ToolLogLine.tsx` 删除 `WebSearch` 子组件与 `lucide-react` 的 `Globe` import，`web_search` 与 Read/Grep/Glob/Directory List 走同一条纯文本行渲染分支；同步删除 `styles.css` 里 `.tool-log-line.web-search span` 的死 selector；`中间消息区规范.md` 把 `web_search` 显式列入"不使用图标"清单，并把历史措辞中代指 `search_files` 的"Search"统一改成"Web Search"以避免误读。
- **下线 `search_files` 工具**：删除 `tools/tools/search-files/` 目录（definition + executor）；`tools/index.ts` 卸下 export/import；兼容层 `tools.ts` 的 `createSearchFilesTool` 改写为 `createGrepTool`，并把 `createDefaultTools` 切到 `createGrepTool`；`MockLLMService` 默认行为里 `search_files` 改为 `grep`（参数也从 `query` 切到 `pattern`）；`fixtures.ts` 把 `createMockSearchResult` 重命名为 `createMockGrepResult` 并替换对应 fixture；`messages.test.ts`、`smoke.test.ts`、`agent.test.ts`、`loop.test.ts`、`bridge.test.ts`、`convert.test.ts` 里的工具字面量同步从 `search_files` 换到 `grep`；`workbenchFixture.ts` 删掉残留的 mock search 条目；保留 `ToolPreviewKind: "search"`、`ToolUiPreview.search`、前端 ToolLogLine 的 search 渲染分支，仅作历史 session 回放兼容。
- **统一工具 `name` 命名风格**：`edit-file-diff/definition.ts` 的 `name: "edit-file"` 改为 `name: "edit_file"`，跟齐 `read_file / write_file / list_directory / web_search / analyze_media` 的 snake_case 约定；mock LLM (`llm.ts`)、fixtures、bridge.test 用例、相关 description 与设计文档全部同步替换；`bash/definition.ts` 描述补一句"用 grep 搜内容、glob 找文件、edit_file/write_file 改文件"，避免 LLM 把 Bash 当通用入口。
- **补充 `web_search` description**：明确两种模式（query / url）、明确"实现上由 DeepSeek 主模型路由到 Kimi 内置 web 子能力"的工程事实，但同时强调"你直接调用 `web_search` 即可，无需关心下层"，避免之前 description 写"Kimi's built-in"和 `exposeOnlyTo: "deepseek"` 字面矛盾。
- **固化工具命名约定**：`tool-preview-design-guidelines.md` 新增「工具命名约定」章节（snake_case `name` + kebab-case 目录 + snake_case `previewKind` + camelCase JS 名）；`current-module-map.md` 提到 `edit-file-diff` 时显式标注"对外工具名为 `edit_file`（snake_case）"；llm-agent-dev skill 的 `tool-definition.md` 在 `name` 必需字段段落补一句"统一 snake_case"。

### 🧠 Design Intent (Why)

两个问题虽然小，但都属于"长尾不一致"——一旦留着就会持续给新人造成认知噪音。

**Web Search 图标**：`中间消息区规范.md` 明确写过"Read / Grep / Glob / Search 不使用图标"，且"所有工具行 running 阶段使用统一 text shimmer，不引入额外的图标或动效层"。但 `web_search` 是后加入的工具，规范没显式列入，结果实现上单独配了 `<Globe>` 图标 + 一条 CSS selector，成了视觉异类。修复同时把规范文档补全（把 web_search、directory_list 都纳入"不使用图标"清单），让规范跟代码对齐，避免下次新工具又踩同一个坑。

**工具命名 snake_case 化**：原本 10 个工具里 9 个 snake_case 或单词，唯独 `edit-file` 是 kebab-case。这种"9 vs 1"的不一致最容易让 LLM 串名字（grep mock 数据里看过 `edit-fi` 这种被截断的名字），也让权限/审计/日志按 toolName 做规则时多一条 ad-hoc 分支。统一到 snake_case 的理由：

- OpenAI / DeepSeek / Kimi / Anthropic 等主流 LLM function calling 协议事实约定都是 snake_case 或单词，没有公开生态用 kebab-case。
- 部分 JSON schema 校验和函数命名习惯对 `_` 友好度高于 `-`，统一 `_` 风险最低。
- 仓库内同类工具已经全部 snake_case，统一只是把异类拉齐。

注意保留了**目录名 kebab-case + 工具 `name` snake_case** 的双轨：目录名是仓库整体的目录命名风格，跟工具对外 `name` 是两件事，不要互相绑定。这条规则现在写进设计文档了。

**下线 `search_files`**：它和 `grep` 功能严重重叠（"搜文件内容"），description 几乎一样，会让 LLM 选错；而且实现用 Node fs walk + 简单字符串包含，相比 ripgrep 既慢又不支持正则。grep + glob 已经覆盖等价场景（搜内容用 grep，找文件用 glob）。下线时**保留** `ToolPreviewKind: "search"` 与前端渲染分支，是因为历史 session JSONL 里可能存在 `kind: "search"` 事件，删类型会让旧 session 回放失败；但生产路径上没有任何代码会再产出 search preview。

**Web Search description 重写**：旧版字面上自相矛盾（写"Kimi's built-in"但 `exposeOnlyTo: "deepseek"`）。实际工程事实是：DeepSeek 是主推理模型，Kimi 是 web 子能力 provider，对 LLM 调用方而言不需要感知。description 把这件事讲清楚 + 给 LLM 一个明确指令"你直接调 web_search 即可"。

### 📁 Files Modified

**代码：**
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`（去 Globe 图标）
- `packages/desktop/src/renderer/styles.css`（删 web-search selector）
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`（删 mock-search-1）
- `packages/agent-core/src/tools/index.ts`（卸 searchFiles export/import）
- `packages/agent-core/src/tools/tools/search-files/`（整目录删除）
- `packages/agent-core/src/tools/tools/edit-file-diff/definition.ts`（name: edit_file）
- `packages/agent-core/src/tools/tools/web-search/definition.ts`（description 改写）
- `packages/agent-core/src/tools/tools/write-file/definition.ts`（提及 edit-file 改 edit_file）
- `packages/agent-core/src/tools/tools/bash/definition.ts`（补 grep/glob/edit_file 负向引导）
- `packages/agent-core/src/tools/tools/shared/write-atomic.ts`（注释修正）
- `packages/agent-core/src/tools.ts`（createSearchFilesTool → createGrepTool；edit-file → edit_file）
- `packages/agent-core/src/llm.ts`（mock data edit-file → edit_file）
- `packages/agent-core/src/llm/services/mock.ts`（默认 tool_call search_files → grep）
- `packages/agent-core/src/fixtures.ts`（createMockSearchResult → createMockGrepResult + edit-file → edit_file）
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`（注释修正）

**测试：**
- `packages/agent-core/src/engine/test/bridge.test.ts`（search_files → grep / edit-file → edit_file）
- `packages/agent-core/src/engine/test/agent.test.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/test/smoke.test.ts`
- `packages/agent-core/src/test/messages.test.ts`
- `packages/agent-core/src/llm/test/convert.test.ts`

**文档：**
- `docs/design-docs/frontend/front-中间消息区规范.md`（web_search 纳入"不使用图标"、Search → Web Search）
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`（新增"工具命名约定"章节）
- `docs/design-docs/agent-runtime/agent-current-module-map.md`（edit_file 命名声明）
- `docs/design-docs/agent-runtime/agent-backend-design.md`（edit-file → edit_file，3 处）
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`（举例换成 grep/glob）
- `docs/design-docs/core-storage-and-observability.md`（edit-file → edit_file）
- `docs/exec-plans/active/actspace-grep-glob-rg-tools-and-ui.md`（补"已下线 search_files"跟进）
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`（name 字段补 snake_case 约定）

### ✅ Verification

- `pnpm typecheck`：全部 3 个 workspace 通过。
- `pnpm -r test`：agent-core 33 文件 / 258 用例通过，desktop 2 文件 / 14 用例通过。
- 手工核对：所有 `search_files` / `searchFilesDefinition` / `searchFilesExecutor` / `edit-file`（除目录名 `edit-file-diff/` 外）字面引用清零。

### 🔮 Follow-ups

- `ToolPreviewKind: "search"` + 前端 `ToolLogLine.tsx` 的 `kind === "search"` 分支保留以兼容历史 session JSONL；如果未来确认线上不再有任何旧 session 持有 `kind: "search"` 事件，可以连同类型一起删干净。
- `kind: "search"` 当前只有 streaming-preview-extractors 里有死代码 extractor + bridge / session-selectors 路由分支，没有 caller，未来清理时一起删。
