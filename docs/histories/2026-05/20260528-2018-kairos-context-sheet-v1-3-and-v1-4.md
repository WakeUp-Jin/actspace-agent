## [2026-05-28 20:18-21:13] | Task: Kairos 上下文 Sheet 同日四轮走查 v1.2 → v1.3 → v1.4

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 第一轮：上下文 Sheet 的展示前端设计不好看，尤其是系统提示词那段，很丑。会话历史和工具列表都可以的，不过工具列表希望可以更"对齐"一些，描述应该是"竖直水平"的。重新设计一下。
>
> 第二轮（确认 v1.2 样式打磨后）：不只是样式问题，是设计问题。需求是"系统提示词展示，并且有一些段落用户可以知道来自于哪一个文件"，重新想方案。
>
> 第三轮：选方案 A（连续长文 + 章节段头条）。
>
> 第四轮：工具列表不要描述了，只展示工具名称就行，用 badge / 胶囊形式——参考 frontend-design 和 ui-ux-pro-max 两个 skill 的设计风格。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、`docs/design-docs/front-*`

本次任务分两个阶段推进，但代码层最终落到 v1.3：

#### 阶段一（v1.2，已落地但被 v1.3 替换）

走查反馈"系统提示词很丑"，最初判断为样式层问题，做了"段卡片样式打磨"：

- 系统提示词段卡片**弃用 `<pre>` 灰底 + 等宽字体**：把 v1.1 的 `font-mono` + `bg-[#f8fafc]` 大灰块替换成 `font-sans` 正文字体 + 白底，左侧 3px 渐变 accent bar 做视觉锚点。
- 段预览策略从 v1.1 的"按 480 字符截断 + `…` 尾标"改成"按 6 行 + 720 字符兜底 + 底部渐隐遮罩 + 整行宽度展开按钮"。
- "运行时生成" 占位由灰字升级为黄色 pill。
- **工具列表**：从单行 `name · description` + truncate 改成两列 grid `minmax(0, max-content) minmax(0, 1fr)`，描述自然换行，所有 description 严格对齐到同一根竖线（用户说的"竖直水平"）。

#### 阶段二（v1.3，最终方案）

第二轮走查指出："不只是样式，是设计"——v1.2 仍然是 6 张独立卡片，每段有自己的边框、预览、展开按钮，**把"段落溯源"这个附加诊断信息提升成了主架构**。LLM 看到的是一篇连贯文档，用户看到的是 6 张被切碎的卡片，视角不一致。

**Key Actions（v1.3 章节流）：**

- **[系统提示词彻底推倒重做]**：把 `PromptSegmentItem` 从 `<li>` 卡片改成 `<article>` 章节块——
  - 移除所有 border / 圆角 / 背景色——不再是"卡片"，是文档章节。
  - 段与段之间用 1px `border-t border-[#eef1f6]` 细分隔线分界（首段除外，紧贴 Section 标题）；段间留 `pt-4 pb-5` 上下间距。
  - 段头条：14px 高 × 3px 宽的渐变短色条（替代 v1.2 的"贯穿全段长 accent bar"）+ 14px 加粗段名 + 用 `ml-auto` 推到行尾的源文件徽章 / 黄色 "运行时生成" pill。
  - 段正文：`font-sans text-[13px] leading-[1.75]`，`whitespace-pre-wrap break-words`，**完整渲染不再做任何截断/预览/折叠**。
- **[删除 v1.2 的预览逻辑]**：`computePromptPreview` 函数、`PROMPT_PREVIEW_LINES` / `PROMPT_PREVIEW_MAX_CHARS` 常量、`ChevronUp` 图标 import 全部清理。
- **[`<ul>` 改 `<div>`]**：`SystemPromptSection` 内容容器从 `<ul>` 列表换成 `<div>` 章节流，对应每段 DOM 从 `<li>` 换 `<article>`——语义上更准确（这不是"列表"，是"章节流"）。
- **[工具列表保留 v1.2 改动]**：用户明确说"工具列表是可以的"，两列 grid 设计不动。
- **[会话历史完全不动]**：用户说"会话历史可以的"，保留 v1.1 的 3 行折叠 + `font-mono` 消息正文。
- **[design doc v1.3 同步]**：`front-Kairos监控页规范.md` 顶部状态升 v1.3；"历次调整"补 v1.3 项（标注"信息架构层面的方向修正"）；① 系统提示词段重写 ASCII 示意图 + 视觉描述 + "为什么取消按段预览/折叠"的设计解释；信息架构总图把"段卡片 × N"改成"章节 × N（用 1px 分隔线分界）"；视觉细节小节移除已废弃的卡片样式描述。

**测试影响**：`kairos-context-sheet.test.tsx` 的 7 个用例**完全不需要改**——它们关心的是段标签 / 源文件徽章 / "运行时生成"占位文本 / "复制全文"按钮，这些 v1.3 都保留。

#### 阶段三（v1.4，工具列表 chip 化）

走查到工具列表："工具描述没有必要，只要工具名就行，用 badge/胶囊形式。看看相关的两个 skill（`frontend-design` / `ui-ux-pro-max`）一般这种设计怎么做"。

**Key Actions（v1.4 chip 密排）：**

- **[ToolsSection 从 grid 改 chip flex-wrap]**：
  - DOM 从 `<dl>` 两列 grid 改成 `<ul>` flex-wrap。
  - 每个工具 `<li>` 是一颗 pill：`rounded-full border border-[#e0e5f0] bg-[#fafbfe] px-2.5 py-0.5 font-mono text-[12px] text-[#2c303a]`。
  - **视觉语言与系统提示词段的 `SourceFileBadge` 同源**（浅边框 + 浅底 + mono + pill 形状），通过字号（12 vs 11）、字体颜色（深 vs 二级灰）、有无图标三个维度区分"主信息（工具名）"与"附加信息（源文件）"。
  - 不带 hover / 不带 tooltip / 不可点击 / 不分组——"只读能力清单"语义最直接。
- **[description 字段保留契约不渲染]**：`KairosContextTool.description` 仍由 main 进程透传，但 Sheet UI 不再消费。理由跟之前保留 `modelId / phase / systemPromptTokens` 一样——契约稳定，未来如果在某个 hover/详情视图重新展示，不用回炸 fixture 和测试。
- **[`Fragment` import 清理]**：v1.2 的两列 grid 用了 `<Fragment>` 串 `<dt><dd>`，v1.4 chip 不需要，import 顺手删掉。
- **[文件顶部 doc 注释更新]**：把 v1.3 顶部的"工具列表 grid 两列对齐"描述换成 "chip 密排"，并在头部加 v1.4 改动小节。
- **[测试断言收紧]**：`kairos-context-sheet.test.tsx` 的 "renders tool list..." 用例从"flat without expansion or schema"改为 "renders tools as chips showing only name"，加两条断言：`queryByText(/请求自治调度器睡眠/).not.toBeInTheDocument()` 和 `queryByText(/读取本地文件内容/).not.toBeInTheDocument()`——明确"description 字段不再渲染"是设计契约。
- **[design doc v1.4 同步]**：`front-Kairos监控页规范.md` 顶部状态升 v1.4；"历次调整"补 v1.4 项；③ 工具列表段重写 ASCII 示意图 + 视觉规格 + "为什么不展示描述 / 为什么是 chip"的设计解释 + chip vs source-file badge 视觉差异对照表；信息架构总图把"两列对齐"改成"chip 密排，flex-wrap 换行"；"视觉细节"小节同步；"非目标"小节里加 v1.4 起 description 也不渲染的说明；"测试策略"小节改对应用例描述。

**v1.4 测试结果**：`pnpm --filter @actspace/desktop test` 全套 110 个测试通过。

### 关于读 skill 的决定

第四轮用户提示"看看相关的两个 skill"——读了 `.agents/skills/frontend-design/SKILL.md` 和 `.agents/skills/ui-ux-pro-max/SKILL.md`。两个 skill 给的 takeaway 直接影响了 chip 设计决策：

- **frontend-design** 的"避免 AI slop、视觉语言要有意图"——决定让 chip 沿用 Sheet 已有的 `SourceFileBadge` 语言而不是凭空造一种新的视觉，保持 Sheet 内只有一套"信息标签"语言。
- **ui-ux-pro-max** 的 Quick Reference §4 / §6 / Common Rules——决定 chip 不带图标（避免凭空映射工具→图标的强耦合）；用 font-weight / 字号 / 颜色做层级（不用容器或额外装饰）；不带 hover（避免传达错误 affordance）。

### 🧠 Design Intent (Why)

这次任务最值得记录的不是某个 CSS 技巧，而是**四轮反馈共同揭示的一个普适教训**：

> **附加诊断信息不应该提升为主架构。**

v1.1 设计时的逻辑路径是：
1. 需求："系统提示词展示 + 段落能溯源"。
2. 实现："那就把 prompt 拆成 6 段，每段独立一张卡片，卡片头标注源文件"。

看似自然，但拆开看会发现一个隐性偏差——**需求里的两个目标其实是主次关系**：
- 主目标：完整展示 prompt（让用户看到模型实际看到的）。
- 附加目标：能溯源（用于"看到不对劲想改"的诊断）。

v1.1 / v1.2 把"附加目标"当成了"主目标"的实现方式——按段切。**结果是附加信息（溯源）的承载结构（卡片边框、独立背景、独立折叠按钮）破坏了主目标的完整阅读体验**。

v1.3 的修正方式：把溯源信息降到"章节标题的元数据"层级——它只在每段开头一行出现，不再切割主体阅读流。LLM 看到的是一份连贯文档，用户看到的也是一份连贯文档，视角一致。

具体取舍记一笔：

- **v1.2 短暂的"段卡片视觉打磨"是有价值的代价**：第一轮反馈我以为是"丑"，做了 v1.2 的样式打磨。第二轮反馈才暴露出是信息架构问题。这两轮不是浪费——v1.2 让"卡片化"这条路被完整走过一遍，确认它的天花板就是"丑得没那么丑"，而不能达到"对"。如果直接跳到 v1.3，反而不容易理解"为什么 v1.1 不行"。
- **取消"按段预览/折叠"是关键决定**：v1.1/v1.2 的预览/折叠是为了"段卡片高度可控"——一个为"卡片化"服务的特性。v1.3 把"卡片化"砍掉了，"段高度可控"这个伪需求也跟着消失，整篇 prompt 一次性渲染，Sheet body 自然滚动即可。
- **短色条 vs 贯穿色条**：v1.2 的 accent bar 是"贯穿整段卡片"的（`absolute inset-y-0 left-0 w-[3px]`），因为卡片是边界明确的"信息单元"；v1.3 短色条只有 14px 高，垂直锚定段名——它的角色变成了"章节标题的视觉前缀"，不再承担"框住整段"的职责。
- **章节流没有外层容器**：考虑过给整个系统提示词包一层浅卡片（border-y + bg），但那等于又把"章节流"包成"一个大卡"，跟"一份长文档"的精神冲突。最终决定裸贴 Sheet body——Section 标题 + 章节流之间的视觉分界靠 `mb-3` 间距和 Section 标题的 uppercase tracking 字样自然完成。
- **"复制全文"按钮位置不动**：v1.3 没有"段卡片头"了，没法在段头上加"复制本段"按钮，也不需要——一次性复制整篇 prompt 喂给别处分析的需求频次远高于"复制某一段"。源文件徽章已经承担"复制源路径"。
- **rule.md 极长怎么办？** UI 不兜底。如果用户真把 rule.md 写到 500 行，那是配置卫生问题，应该让用户去精简，而不是 UI 帮他"折一下"。可以将来在"Sheet body 顶部加锚点 TOC"来缓解，但不是 v1.3 的范围。

v1.4 工具列表 chip 化进一步印证了同一个 takeaway——同样是把"附加信息"（工具描述）从主视觉里抽离，让主视觉（能力清单）的语义直接传达：

- **"能力清单 vs API 文档"是两种语义**：用户看 Sheet 工具列表的瞬间，需求是"我能做哪些事"（扫读），不是"每件事怎么做"（学习）。两列 grid 隐含"每个工具有结构化数据要对齐"，chip 隐含"离散单元的标签清单"——后者跟"能力清单"语义同构。
- **不分组、不可点击、不 hover 是必要约束**：一旦给 chip 加任何交互能力（点击展开、hover 显示描述、按 source 分组），它就从"标签清单"漂向"过滤器列表"或"导航菜单"——语义又错了一次。
- **chip 与 source-file badge 的视觉同源是关键**：Sheet 内已经有一套"信息标签"视觉（圆角 pill + 浅边框 + 浅底 + mono）；如果工具列表凭空发明一套新的"工具 badge"视觉（比如方角 + 不同色），会让 Sheet 视觉碎片化。复用现有语言、靠字号/颜色/图标的微差体现层级，是更克制的处理方式——这跟 ui-ux-pro-max 里的 `icon-style-consistent` / `elevation-consistent` / `consistency` 思路一致。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx`
- `packages/desktop/src/renderer/test/kairos-context-sheet.test.tsx`
- `docs/design-docs/front-Kairos监控页规范.md`
