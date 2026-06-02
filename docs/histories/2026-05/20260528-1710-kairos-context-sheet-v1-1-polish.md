## [2026-05-28 17:10] | Task: Kairos 上下文 Sheet v1.1 走查打磨

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> v1.0 实装跑通之后做的走查反馈，几条调整：
> 1. 工具列表"简单一点"——直接 `name + 简短描述`，不要展开 / 不要 Schema；
> 2. 会话历史每条消息默认显示 3 行，超出折叠；
> 3. 系统提示词的每一段加上"来源文件名"——通过这个能找到要改哪个文件；
> 4. Prompt token 那个先不要了，未来挪到每条消息后面；概览段下面四个都没必要，生成时间挪到"上下文"旁边即可。
>
> 整体感受是"细节太多不直观"——系统提示词要可细看（带来源），历史不需要太长，工具列表越扁越好。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **[Shared 契约 v1.1]**: 新增 `KairosContextPromptSegment { label, text, sourceFiles? }`；`KairosContextSnapshot` 增加 `systemPromptSegments` 字段。原 `modelId / phase / systemPromptTokens` 标记 v1.1 不渲染但保留契约，避免测试 fixture 大改。
- **[short-term `summarySegments` 加 `path`]**: `KairosShortTermLoadResult` 把摘要段从 `{label, text}` 扩到 `{label, text, path}`——store 自己已经知道路径，向上透传是免费的。controller 用这个 path 给"历史摘要"段写 `sourceFiles`。
- **[Controller `buildPromptSegments`]**: 在 `controller.ts` 顶层新加纯函数，把 system prompt 拆 6 段（角色与节奏 / 运行上下文 / 配置提示 / 用户规则 / 观测摘要 / 历史摘要），分别复用 `KAIROS_SYSTEM_PROMPT.split("# 上下文段")[0]` / `buildConfigTipsBlock` / `buildObservationSummary` / `buildHistorySummary`。每段写好 `sourceFiles`：硬编码段指向 `prompt.ts`、配置段指向 `paths.json / preferences.json / blocklist.json`、用户规则段指向 `rule.md`、历史段指向实际加载的 `*.summary.md`。运行时段（运行上下文 / 观测摘要）不带 `sourceFiles`，renderer 显示"运行时生成"占位。
- **[Renderer 重写]**: `KairosContextSheet.tsx` 彻底改造——
  - 删 `OverviewSection`；生成时间用 12px tabular-nums 灰字塞进 Sheet 标题旁。
  - 新增 `SystemPromptSection` + `PromptSegmentItem` + `SourceFileBadge`：按段渲染，每段卡片含 480-字符预览 + "展开全部"切换；源文件徽章是按钮，点击复制完整路径（hover 显示 tooltip）。
  - `HistoryMessageRow` 截断策略改为按 `\n` 切分的 3 行预览，"展开本条"切换。
  - `ToolsSection` 重写为扁平 `<ul>`：`<name> · <description>`，单行 `truncate`，hover 通过浏览器原生 title 看完整描述。来源角标 / Schema 展开全部去掉。
- **[Sheet 测试重写]**: `kairos-context-sheet.test.tsx` 7 个用例覆盖：段渲染 + 源文件徽章（basename）+ "运行时生成"占位 + 复制全文 + 段徽章复制路径 + 工具列表 flat + 历史消息 3 行折叠 + 错误重试。`kairos-page.test.tsx` / `right-panel-kairos.test.tsx` 的 fake bridge 同步补 `systemPromptSegments: []`。
- **[Design-md 同步]**: `front-Kairos监控页规范.md` 新增 v1.1 历次变更块、信息架构图改为三段（含标题旁生成时间）、`KairosContextSnapshot` 类型小节追加 `systemPromptSegments` 字段、controller 实现策略写清楚 segments 与 sourceFiles 的来源、测试策略全部对齐 v1.1。
- **[prompt-assembler 测试修复]**: `summarySegments` 加 `path` 字段后，`prompt-assembler.test.ts` fixture 同步补两条 path。

### 🧠 Design Intent (Why)

走查反馈本质上揭示了 v1.0 的两个隐性偏差：

1. **"信息完整"被错认为"信息有效"**：v1.0 在概览段堆了 4 个键值（生成时间 / 模型 / 阶段 / Token），工具列表给了来源角标 + Schema 展开。表面看是"全",但用户实际只需要"现在 LLM 看到什么 + 怎么改它"——前者是 prompt + 历史，后者是源文件链接。v1.1 把"完整"转向"高信噪",**信号留下**（系统提示词、历史、工具名），**噪声删掉**（角标、Schema、token/phase）。
2. **"模型视角"不止 prompt 文字，还要"修改入口"**：把每段 prompt 标注源文件（可点击复制路径）后,Sheet 真正成为"诊断 + 修改入口"的一体化工具——看到 prompt 错了直接知道改哪个 .md / .json。这比"看到 prompt + 自己猜源头"的体验跨了一个台阶。这一抽象可推广到任何"渲染层 - 源文件"对应清楚的领域（lint 报告、文档生成、配置可视化）。

具体取舍记一笔：

- **不删 `modelId / phase / systemPromptTokens` 字段**：用户说"不要了"，但他后面又说"到时候我在每条消息后面列表里面去显示一下 token"——意思是"现在不展示，未来在更合适的位置展示"。所以契约保留，UI 不渲染。删了反而要在未来重新打开 shared / fixture / 三层测试，得不偿失。
- **段预览从 800 字符调到 480 字符**：v1.0 单段时 800 字符是合理的（少滚一点）；v1.1 拆成 6 段后，单段 480 字符（约 4-5 行）+"展开"按钮反而让用户感觉"段落清爽，需要时再深看"。
- **历史消息折叠按"行"不按"字符"**：v1.0 用 600 字符 truncate，但短期记忆里的消息长度差异大（user 一行、assistant 多段）——按字符切会出现"有的卡片高、有的卡片矮"的视觉错位。按 `\n` 切到固定 3 行，每张消息卡片高度更可预期。
- **工具列表彻底扁平化**：当前 Kairos 只注册 1 个自有工具（`sleep`）+ 几个 shared 工具。Schema 展开是"未来扩展才需要"的设计；现在塞进去只增加噪声。等真的注册了 5+ 个工具时再分组 / 加角标也不晚。

### 📁 Files Modified

- `packages/shared/src/kairos-contracts.ts`
- `packages/agent-core/src/kairos/context/short-term.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/test/prompt-assembler.test.ts`
- `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx`
- `packages/desktop/src/renderer/test/kairos-context-sheet.test.tsx`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `docs/design-docs/front-Kairos监控页规范.md`
