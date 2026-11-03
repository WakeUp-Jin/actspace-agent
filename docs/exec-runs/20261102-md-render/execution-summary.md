# Markdown 编辑与渲染（文档面板 + 聊天区）— 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261102-md-render.md`
- **执行过程**：`docs/exec-runs/20261102-md-render/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成。
  - T1–T28 全部完成，Codex Electron 验收 15 通过、0 失败、2 局部未覆盖（复核后都不是缺陷）。
  - 分支 `feat/md-render`（2026-11-03 已从 worktree 移回主仓库），改动未提交。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 共享模块 | `components/markdown-common/{paths,callouts,katex}.ts`、`styles/tokens.css`（`--act-font-reading`） | 路径识别、五种提示框、KaTeX 加载，文档面板和聊天区共用 |
| 文档面板编辑器内核 | `components/markdown-editor/core/*`（含 `widgets/`） | CM6 + Lezer 实时预览：光标所在元素露出标记，D1–D12 预览规则、块级 widget（表格、代码、Mermaid、公式、图片、文件头）、大纲、链接与路径 |
| 和 CM 自带主题的层叠桥接 | `core/layer-bridge.ts` | 样式文件在 `layer(components)`，CM 运行时主题不在 layer 里、总是更强；冲突属性用 `revert-layer` 回退到样式文件的值 |
| 编辑器外壳与面板接入 | `markdown-editor/{MarkdownEditor.tsx,host.ts,use-markdown-editor-host.tsx}`、`right-panel/docs/{DocsReader,DocsOutline,use-docs-draft}.tsx` | 懒加载；预览和源码是同一个编辑器、共享撤销栈；⌘S、未保存圆点、磁盘变化提示条、行号跳转 |
| 删除旧实现 | `MarkdownRenderView.tsx`、`MarkdownSourceEditor.tsx`、`.markdown-doc` 样式及其测试 | 被新编辑器取代 |
| 编辑器样式 | `styles/markdown-editor.css` | 正文居中、无衬线、Codex 排版；源码模式等宽、行号栏 |
| 聊天区渲染管线 | `components/messages/markdown/*`、`MarkdownProse.tsx`、`markdown-blocks.ts` | remark/rehype 插件：提示框、公式守卫、代码块 meta、原始 HTML 白名单与 id 前缀、全局脚注、行内路径、流式末尾渐显；分块与 HTML 合并 |
| 流式平滑输出 | `messages/markdown/smooth-text.ts`、`rehype-stream-tail.ts`、`CodeBlock.tsx` | 收尾围栏整行到达再显示，代码块不回缩；流式写过的代码落盘后不折叠 |
| 聊天区宿主 | `conversation/ChatMarkdownHostProvider.tsx`、`files/read-workspace-image.ts`、`use-workspace-file-links.ts`、`open-workspace-path.ts` | 路径带行号打开「文档」面板、本机读图；对话区和子 Agent 面板共用 |
| 路径图标不拆行 | `messages/markdown/FileIconLead.tsx`、`core/inline-text.ts` | 图标和第一个字符包进不换行的 `.md-path-lead` |
| mock 与夹具 | `mock/docs-fixture.ts`、`mock/markdown-fixture.ts`、`mock/scenarios/markdown.ts`、`stream-player.ts` | 覆盖两份规范全部元素的示例文档和回复 |
| 测试 | `test/markdown-editor-*`、`test/chat-markdown-*`、`markdown-common.test.ts` 等 | 新增 18 个测试文件，更新现有的 prose、blocks、批注、文档面板测试 |
| 展开面板时顶栏标题退场（N1） | `WindowChromeBar.tsx`、`styles/electron.css`、`WorkbenchLayout.tsx`、`test/sidebar.test.tsx` | 「文档」展开盖住聊天区时，会话标题和中间栏操作隐藏，不再和面板标签叠在一起 |
| 规范同步 | 全局视觉语言、中间消息区、会话状态与数据流、Mermaid、右侧面板、文档面板规范，`FRONTEND_VERIFICATION.md` | 和新实现对齐 |

## 人工验证指引

### 必须验证

1. **「文档」面板的预览编辑**
   - 验证方式：`pnpm dev`，右侧「文档」打开一篇有标题、列表、表格、代码块、公式的 Markdown，点「展开面板」。把光标点进粗体、链接、表格、公式，再点到别处；改一个字，⌘S。
   - 预期结果：
     - 标题和正文是无衬线字体，正文居中；
     - 光标所在元素露出 Markdown 标记，离开后恢复排版；
     - 改后文件名旁出现圆点，⌘S 后消失，磁盘内容更新。
2. **聊天区长回复**
   - 验证方式：让模型写一份带代码块、表格、`> [!WARNING]`、公式、脚注、`src/xxx.ts:12` 路径的长回复，看流式过程；结束后点路径。
   - 预期结果：
     - 代码块写的过程中不跳、不回缩；
     - 末尾的字渐显、有光标，结束后消失；
     - Markdown 路径在「文档」里打开并跳到对应行。

### 建议验证

1. **深色主题和紫色强调色**
   - 验证方式：设置里切深色和紫色，各看一眼「文档」和聊天区。
   - 预期结果：都看得清；链接、引用竖条、复选框跟随强调色，提示框保持语义色。
2. **大文档**
   - 验证方式：打开一个约 1MB 的 Markdown，滚到中间和末尾各打一串字。
   - 预期结果：一两秒内可用，打字不卡、不丢字。

## Agent 已完成的验证

- **类型与测试**：`typecheck` 通过；desktop 全量测试 281 个文件、2663 项通过（含 N1 修复后补的 1 项）。
- **前端检查**：`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`pnpm --filter @actspace/desktop build` 通过。
- **`check:current-docs`**：主仓库里通过。在 worktree 里会失败，失败项都是旧执行记录里引用的截图：`docs/exec-runs/**/*.png` 被 gitignore，只在主仓库里有。本分支新增的文档不引用截图链接。
- **编辑器样式计算检查**：`tools/check-editor-css.mjs` 在预览、源码两种模式下比对字体、内边距、居中、表格行、行号栏等计算样式，0 项失败。去掉层叠桥接后有 11 项失败。
- **流式稳定性**：`tools/measure-stream.mjs` 逐帧量正文和每个代码块的高度。
  - 代码块回缩 0 次，原版也是 0 次。
  - 正文回缩 4–5 次，都是行内语法闭合后的重排或设计内的切换：
    - 提示框标签写完；
    - 表格成形；
    - 块公式写完；
    - 本轮结束后 Mermaid 由源码换成图。
- **浏览器 mock 截图**，在 `shots/` 下，被 gitignore，只列文件名，主智能体逐张看过：
  - 聊天区：`chat-light.png`、`chat-dark.png`、`chat-accent-purple.png`、`chat-narrow.png`；
  - 「文档」面板：`docs-light-1..6.png`、`docs-dark-1..6.png`、`docs-accent-purple-1..6.png`、`docs-narrow-1..6.png`（编辑器约 380px 宽）、`docs-source.png`。
  - T12 删旧样式前后，聊天区截图逐字节一致。
- **性能**（1280×900，本机 Chrome 无头）：
  - **「文档」面板**，1MB 样本，39,612 行：
    - 打开（同步创建加首帧测量）≤ 43ms，目标 ≤ 300ms；
    - 按键 p95 ≤ 12.5ms，目标 ≤ 16ms，样本是预览和源码 × 开头、中间、结尾 × 40 次；
    - 两轮测量中只有一次超过 16ms：预览模式在文档末尾打的第一个字，21.7ms，另一轮同一位置是 12.1ms。其余每次 ≤ 14.3ms。
  - **聊天区**，每 50ms 送 120 字，记录 React Profiler 每次提交的耗时：
    - 30KB 回复：每次提交中位 1.7ms，原版 20ms；
    - 30KB 含脚注：中位 1.6ms，前 20% 和后 20% 的提交耗时基本相同，不随长度变慢。
- **体积**（gzip）：
  - 主包 JS 635.72KB → 642.97KB，+7.25KB。按源文件归属：
    - 文档面板部分 −0.9KB，预算 ≤ 5KB；
    - 聊天区部分 +7.8KB，预算 ≤ 10KB。
  - 懒加载 chunk：编辑器 208.6KB、原始 HTML（parse5）54.4KB；KaTeX 77.6KB 原来就有。
- **Electron 实机**：Codex 原生 Computer Use，操作当前构建的应用；隔离数据目录；真实 DeepSeek 会话。证据在 `tmp/codex-acceptance/20261103-md-render/`，不入库。

  | 编号 | 结论 | 方式 |
  |---|---|---|
  | E1 文档浅色排版 | 通过 | 原生 CUA |
  | E2 源码模式、切换后撤销 | 通过 | 原生 CUA |
  | E3 光标露出标记、任务框 | 通过 | 原生 CUA |
  | E4 未保存圆点、⌘S 落盘 | 通过 | 原生 CUA（磁盘读取自动化旁证） |
  | E5 路径、本地链接、外链 | 通过 | 原生 CUA + `shell.openPath` / `openExternal` 记录旁证 |
  | E6 回复里的 `docs/guide.md:40` | 通过 | 原生 CUA |
  | E7 大纲（预览、源码） | 通过 | 原生 CUA |
  | E8 深色、紫色强调色 | 通过 | 原生 CUA |
  | E9 模型改文件时的提示条，草稿不被覆盖 | 通过 | 原生 CUA（磁盘读取自动化旁证） |
  | E10 1MB 文档滚动和输入 | 通过 | 原生 CUA |
  | C1 流式不跳、渐显和光标 | 通过 | 原生 CUA |
  | C2 整条回复样式 | 通过 | 原生 CUA |
  | C3 聊天区路径、链接 | 通过 | 原生 CUA + shell 记录旁证 |
  | C4 重启后历史回复、长代码折叠 | 通过 | 自动化（Playwright 重启） |
  | C5 深色、紫色 | 通过 | 原生 CUA |
  | C6 批注 | 局部未覆盖 | 原生 CUA + 自动化对照 |
  | C7 子 Agent | 局部未覆盖 | 原生 CUA |

  - **C6**：跨粗体和路径的批注通过，引用文本和选区一致。选区跨过公式时不出现「添加到对话」，所以没有“排除公式后的引用”可核对。原因是批注逻辑把公式和代码块一样当作不支持的节点，这是批注规范已有的规则，公式不会进入批注文本，不是缺陷。聊天区规范 §11 补写了这条后果。
  - **C7**：右侧子 Agent 面板（含 320px 窄宽）通过，路径图标和首字不拆行，路径能点。没有独立弹窗可测：`SubAgentTranscriptModal` 在 main 上就是右侧面板的别名。聊天区规范的说法已更正。
  - **清理**：隔离目录和临时凭据都已删除；用户原有设置哈希不变，原有进程没动。

## 已知风险和遗留事项

- **N1 已修**：展开「文档」面板时，左上角「文档」标签盖住会话标题的开头（main 上原有的问题，Electron 截图 `E1-light-top-N1.png`）。修法见执行过程步骤 10，浏览器 mock 已核对；Electron 里还没复看。
- **Codex 打开的外部窗口**：验收时交给系统打开了隔离的 `src/app.ts`（Cursor）和 `https://codemirror.net/`（Chrome），各 3 次。Codex 没被允许操作这两个应用，这些标签页和文档没有关掉，需要手动关。
- **首次按键**：1MB 文档末尾的第一次按键一轮 21.7ms，另一轮 12.1ms，属于偶发的单帧，其余按键都在 16ms 内。
- **旧批注**：落在含公式或原始 HTML 的旧回复上的批注，可见文本变了，可能定位不到，按规范 §11 接受，定位失败时走“前后文唯一匹配”的兜底。
- **不入库的工具和截图**：测量脚本在 `tools/` 下入库，截图和 Codex 证据不入库。

## 后续建议

- 提交并开 PR（等用户说）。
- 下次真机验收时顺带看一眼展开面板的顶栏（N1）。
