# Kairos 上下文 Sheet 规范

> 本文是 Kairos 监控页"上下文"按钮及其右侧 Sheet 的前端事实来源。Kairos 自治模式、prompt-assembler、短期记忆和工具系统的长期事实来源仍以 `docs/design-docs/agent-core/kairos-autonomous-mode.md` 为准；本文只约束 renderer 的入口按钮、Sheet 行为、信息架构、IPC 契约和验收点。

## 当前状态

- 状态：v1.4（2026-05-28 已落地）。**工具列表从"两列 grid（name + description）"改为"chip 密排（只有 name）"**——同一天连续四轮走查的收尾改动。
- 历次调整：
  - v1.0（2026-05-28 早段）：初版设计稿，含①概览 / ②系统提示词整段 / ③历史 / ④工具列表四段。
  - v1.1（2026-05-28 晚段）：根据用户走查反馈精简——
    - 去掉概览段，把生成时间挪到 Sheet 标题旁；
    - 系统提示词改为按 6 段渲染，每段标注源文件徽章（点击复制路径）；
    - 会话历史消息默认折叠到 3 行，超出"展开本条"；
    - 工具列表改为扁平 `<name> · <description>`，去掉来源角标和 Schema 展开。
  - v1.2（2026-05-28 晚段二轮走查）：纯视觉打磨，信息架构不变——
    - 系统提示词段卡片**弃用 `<pre>` 灰底 + 等宽字体**：内容主要是中文/Markdown 散文，`font-mono` 让字符间距怪、整段视觉太重。改成正文字体 + 白底，左侧加一根 3px 渐变 accent bar 做视觉锚点。
    - 段预览**改为按行截断**（默认 6 行，含 720 字符上限保护），底部用渐隐遮罩 + 整行宽度的"展开全部"按钮——比尾部 "…" 字符更克制、可点性更强。
    - "运行时生成"占位由灰字升级为黄色 pill badge，与源文件徽章在头部并列时视觉重量平衡。
    - 工具列表**从单行 `name · description`（描述会被 `truncate` 裁掉）改为两列 grid**：`grid-template-columns: minmax(0, max-content) minmax(0, 1fr)`，name 列宽度按最长名字自适应，所有 description 严格左对齐到同一根竖线，长描述允许自然换行，不再裁切。
  - v1.3（2026-05-28 晚段三轮走查）：系统提示词的**信息架构修正**——
    - v1.1/v1.2 把"段落溯源"这个**附加诊断信息**提升成了**主架构**（按段切成 6 张独立卡片）。结果是：LLM 看到的是一篇连贯的 prompt，用户看到的是 6 张被切碎的卡片，视角不一致，主目标（完整阅读）被附加目标（每段溯源）破坏。
    - v1.3 把方向修回：**主体是一份连贯文档，溯源是章节标题旁的轻量标注**。每段从 `<li>` 卡片改成 `<article>` 章节流——上方一根 1px 细分隔线、左侧 14px 短色条 + 段名 + 源文件徽章（章节标题样式），下方紧跟段正文。
    - 取消"按段预览/展开/折叠"——整篇 prompt 一次性渲染，让 Sheet body 自然滚动。`computePromptPreview` 整个删除。
    - 工具列表（v1.2 的两列 grid）和会话历史（v1.1 的 3 行折叠）**完全保留不动**——它们的设计与各自需求是匹配的。
  - v1.4（2026-05-28 晚段四轮走查）：**工具列表 chip 化**——
    - v1.2/v1.3 的两列 grid 仍然在展示 description；走查认为"工具描述对快速扫读价值不大，模型上下文里看到工具列表的第一感受应该是'能力清单'，不是'API 文档'"。
    - 改为 **chip 密排**：每个工具一颗 pill，flex-wrap 自然换行。视觉语言与系统提示词段的 source-file badge 同源（圆角 pill + 浅边框 `#e0e5f0` + 浅底 `#fafbfe` + mono 字体），但 chip 字号略大（12px vs 11px）、颜色更深（`#2c303a` vs `#4f5665`），表达"主信息（工具名）"与"附加信息（源文件）"的层级。
    - 不带图标、不带 hover、不可点击、不分组——只读能力清单语义最直接。
    - `KairosContextTool.description` 字段在契约里**保留**（未来如需在某个 hover/dialog/不同视图重新展示），仅 Sheet 不再渲染。
- 适用范围：`packages/desktop` 的 renderer + main IPC，`packages/agent-core/src/kairos/controller.ts` 暴露快照方法，`packages/shared/src/kairos-contracts.ts` 扩展契约。
- 关联文档：
  - `docs/design-docs/frontend-ui/Kairos监控页规范.md`（监控页母规范；按钮入口位置写在那里）。
  - `docs/design-docs/agent-core/kairos-autonomous-mode.md`（system prompt 组装、上下文 6 段构成、短期记忆与工具集来源）。

## 设计动机

Kairos 现在是黑盒：用户能看到运行轨迹、事件列表和最终回复，但**看不到 Kairos 自己在每次 tick 真正"看到"了什么**——具体的 system prompt 段落、注入的会话历史、当前可用工具。

让这份"模型视角的上下文"可被一键查看，可以：

- 排障：用户怀疑 Kairos 行为奇怪时，第一时间检查 prompt 是否被配置 / rule.md 污染。
- 调优：写 `rule.md` / `paths.json` / `briefs/tasks/*.md` 时，能立刻在 Sheet 里验证 prompt 段落是否符合预期。
- 教学：第一次接触 Kairos 的用户，可以快速理解"它是个怎样的 Agent"——它的 system prompt + 短期记忆 + 工具集合就是它的"人格"。

## 设计目标

- 一个按钮直达，零步骤理解 Kairos 当前上下文全貌。
- 优先看"模型现在看到了什么"——系统提示词永远在首屏；历史 / 工具默认折叠。
- 把"为什么会是这样"用源文件徽章直观给出——系统提示词每段标注它来自哪个文件，用户可直接打开改。
- 不引入新依赖（不安装 Radix / shadcn）；自研轻量 Sheet 组件，对齐 shadcn `Sheet` 视觉与行为。
- 数据按需拉取，不走推送。Sheet 关闭后不保留内存数据。
- 与"重置今日"等控制操作语义清晰区分：上下文是只读查看，永远不会改 Kairos 状态。

## 非目标（v1）

- 不做"编辑系统提示词"。用户想改 prompt 走改 `rule.md` / `paths.json` / `preferences.json` 的常规配置路径，Sheet 只展示组装结果与源文件提示。
- 不展示 thinking / usage 等运行时事件——这些在监控页主体 UI 已经覆盖。
- 不做"对话回放 / 复跑"按钮——Sheet 只解释当下状态，不承担控制操作。
- 不展示工具的 JSON Schema 细节（v1.0 曾考虑，v1.1 走查后删除——细节噪声大于价值）；v1.4 起连 description 也不在 Sheet 渲染（仅契约保留字段），chip 只展示工具名。
- 不为非 Kairos 页面提供"主 Agent 上下文 Sheet"。主 Agent 已有右侧 Context popup（见 `聊天输入框规范.md`），二者不强行对齐。
- 不做 diff/历史对比（v1 不缓存上一次快照）。
- 不在概览/标题区域展示模型 / 阶段 / token 估算（v1.0 曾包含）。snapshot 字段仍保留以备未来在每条消息粒度展示 token。

## 入口按钮

### 位置

放在 `KairosHeader` 的右侧按钮组里。从左到右顺序固定为：

```
[开启 / 暂停]   [唤醒]   [上下文]   [重置]
```

把"上下文"放在"重置"**之前**，符合"先查看、后破坏"的从左到右心智：上下文是只读快照，重置是会清 ring buffer / 切 jsonl segment 的破坏性操作。

### 视觉

- 文案：`上下文`（与 `重置`、`唤醒` 平级）。
- icon：`FileText`（来自 `lucide-react`）。
- 样式：复用监控页现有 `kairosButtonClass`（次级按钮，灰边白底，hover 浅灰），不是 primary。
- 永远 enabled，**与 `state.enabled` 无关**——即使 Kairos 是 stopped，用户仍可查看"如果现在启动，会看到的上下文"。仅在 `bridgeAvailable === false`（mock / 非 Electron）时 disabled，并 tooltip 提示 `Kairos 桥未就绪`。

### a11y

- `aria-haspopup="dialog"`、`aria-expanded`（绑定 Sheet open 状态）、`aria-controls`（指向 Sheet 容器 id）。
- 键盘：`Enter` / `Space` 打开 Sheet；按钮聚焦态遵循全局 focus ring。
- 打开 Sheet 后，关闭时焦点必须回到此按钮。

## Sheet 组件规范

自研轻量级 Sheet 组件，落在 `packages/desktop/src/renderer/components/ui/Sheet.tsx`，对齐 shadcn `Sheet` 视觉。

### 结构（DOM）

```
<Portal target={document.body}>
  <SheetOverlay onClick={close} data-state={open|closed} />
  <SheetPanel role="dialog" aria-modal="true" aria-labelledby data-state>
    <SheetHeader>
      <SheetTitle id />
      <SheetDescription />
      <SheetActions>{slot 提供刷新等}<CloseButton /></SheetActions>
    </SheetHeader>
    <SheetBody>{children}</SheetBody>
  </SheetPanel>
</Portal>
```

### 尺寸与位置

- 永远从屏幕**右侧**滑入。本期不支持 `side="left|top|bottom"`（保留 prop 占位以便后续扩展）。
- Panel：`fixed top-0 right-0 h-screen w-[min(520px,92vw)]`，背景 `bg-surface`，左侧 `border-l border-[#e6e8ef]`，`shadow-[0_8px_30px_rgba(15,23,42,0.08)]`。
- Overlay：`fixed inset-0 bg-black/35 backdrop-blur-[1px]`。
- z-index 高于 `WindowChromeBar` 的 fixed strip，避免被 chrome 覆盖。

### 动效

- 打开：`translate-x-full → translate-x-0`，200ms `ease-out`；Overlay `opacity-0 → 100`，160ms。
- 关闭：反向，180ms。
- 用 Tailwind `data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full transition-transform`。
- `prefers-reduced-motion: reduce` 时改为瞬时切换。

### 关闭方式

- `Esc` 键关闭。
- 点击 Overlay 关闭。
- 顶部右上 `X` 关闭按钮（24×24，`lucide` 的 `X` 图标）。
- 程序化 `onOpenChange(false)`。

### 焦点管理

- 打开时：保存当前 activeElement，把焦点设到 Panel 第一个可聚焦元素（关闭按钮）。
- Tab / Shift+Tab：在 Panel 内循环（focus trap）。
- 关闭时：把焦点还给打开时保存的元素（即"上下文"按钮）。
- 实现：用一个 `useFocusTrap(panelRef, open)` 自定义 hook，列举 `'a[href], button, input, textarea, [tabindex]:not([tabindex="-1"])'` 作为可聚焦元素集合。

### 滚动锁定

- 打开时：`document.body.style.overflow = "hidden"`，记下原值，关闭时还原。
- 多个 Sheet 同时打开（非当前场景，但保留）：用 ref 计数避免错误恢复。

### 其它约束

- `role="dialog"` + `aria-modal="true"`；`aria-labelledby` 指向 SheetTitle id。
- Panel 容器 `data-testid="kairos-context-sheet"`，便于 vitest 定位。
- 不引入 Radix；不引入 `react-focus-lock`；不引入 `@react-aria` 子包。一切用原生 React + Tailwind 实现，控制依赖体积。

## KairosContextSheet 信息架构

Sheet 内部分为三段，由上至下（生成时间显示在标题旁，不再占用单独区块）：

```
┌──────────────────────────────────────────────┐
│ Header (固定高)                              │
│   标题：上下文  <16:00:30>                    │
│   描述：Kairos 当前 tick 会看到的提示词与历史 │
│   动作：[⟳ 刷新] [✕ 关闭]                    │
├──────────────────────────────────────────────┤
│ Body (单一纵向滚动容器)                       │
│                                              │
│  ① 系统提示词（章节流长文，v1.3）            │
│     标题行 [N 段] [复制全文]                 │
│     ├─ 章节 × N（用 1px 分隔线分界）         │
│     │   ▎段名  …  📄 源文件徽章 / 🛠 运行时  │
│     │   段正文（font-sans 13px，全文渲染）   │
│                                              │
│  ② 会话历史（可折叠，默认折叠）              │
│     ├─ 历史摘要（summarySegments）           │
│     └─ messages 列表（默认 3 行 / 展开本条） │
│                                              │
│  ③ 工具列表（chip 密排，flex-wrap 换行）     │
│                                              │
└──────────────────────────────────────────────┘
```

### Header — 标题旁的生成时间

把原概览段的 4 个字段全部去掉。Sheet 标题保持"上下文"主题字，右侧用 12px tabular-nums 灰字显示 `HH:mm:ss`，作为"刚才加载的时刻"提示。模型 / 阶段 / token 不再展示。

snapshot 字段（modelId / phase / systemPromptTokens）保留传输，但 v1.1 UI 不渲染——将来想在消息粒度后置 token 提示时再用，删了反而要回炸 fixture 和测试。

### ① 系统提示词段（首屏主角）

**v1.3 章节流**：系统提示词是一篇连贯文档，每段是文档里的一节。段与段之间用 1px 细分隔线 + 章节标题分界——不再是 6 张独立卡片。

```
─────────────────────────────────────────────────────────
▎角色与节奏                                  📄 prompt.ts
You are Kairos, the autonomous companion
of the user's actspace-agent.

# Pacing
- 每个 tick 都先观察，再行动，最后必须调用 sleep...

─────────────────────────────────────────────────────────
▎运行上下文                                    🛠 运行时
[当前时间] 2026-05-28T12:16:26.949Z（work）
[活跃 briefs] 0 个

─────────────────────────────────────────────────────────
▎配置提示             📄 paths.json  preferences.json  blocklist.json
## 配置提示
[preferences] Kairos 默认偏好；如需调整 sleep / tickBudget...

─────────────────────────────────────────────────────────
▎用户规则                                     📄 rule.md
请始终用中文回复。

─────────────────────────────────────────────────────────
... 后续段同理
```

- 段定义（与 `prompt-assembler.ts` 输出对齐，v1.1 起未变）：
  1. `Kairos 角色与节奏`：源自 `packages/agent-core/src/kairos/prompt.ts`。
  2. `运行上下文`：当前时间 / phase / 活跃 briefs；纯运行时。
  3. `配置提示`：源自 `paths.json` / `preferences.json` / `blocklist.json`（三个徽章并列）。
  4. `用户规则`：源自 `rule.md`。
  5. `观测摘要`：watch diff + sessions digest；纯运行时。
  6. `历史摘要`：源自 short-term `*.summary.md`（按实际加载的文件去重列出）。
- 每段视觉（v1.3）：
  - **不再是 `<li>` 卡片**，改成 `<article>`，6 段并排在一个 `<div>` 流容器里，**没有任何外层 border / 圆角 / 背景色**——主体阅读流是 Sheet body 直接渲染的。
  - **分隔线**：除首段外，每段顶部一根 `border-t border-[#eef1f6]` 1px 细分隔线 + `pt-4 pb-5` 上下间距。首段 `pt-1 pb-5`，紧贴 Section 标题。
  - **章节标题行**（`<header>`）：左侧 14px 高、3px 宽的渐变短色条（`from-[#c7d1e6] to-[#dbe2f0]`），垂直锚定段名；旁边 14px 加粗段名 `text-[#12151c]`；右侧用 `ml-auto` 推到尾部的源文件徽章 / 黄色 `运行时生成` pill。
  - **段正文**：`font-sans text-[13px] leading-[1.75] text-[#2c303a]`，`whitespace-pre-wrap break-words`，**直接完整渲染，不再按段做预览/展开/折叠**。
- 顶部 Section 标题右侧的"复制全文"按钮**仍保留**——复制完整 `snapshot.systemPrompt` 字符串到剪贴板，是诊断场景的快捷出口。

> 为什么取消"按段预览/折叠"？v1.1/v1.2 给每段加单独的 `<pre>` + 480/6 行预览 + "展开全部"按钮，本质上是把"6 段"当成"6 个独立信息单元"。但实际 LLM 看到的是**一篇连贯的 prompt 文档**，按段切碎反而让用户视角偏离模型视角。v1.3 把段降回"章节标题"层级，主体是一篇可滚动的长文档，章节标题里夹带溯源信息——这是 Stripe docs / Anthropic docs 的常规章节排版语言，用户认知零成本。

> 长 prompt 怎么办？现在 6 段加起来约 1500-3000 字；rule.md 若被用户写到极长是配置卫生问题，应该让用户去精简而不是用 UI 兜底。如果未来某天 prompt 真膨胀到 10k+，再考虑加 Sheet body 顶部的锚点 TOC（horizontal pills 跳转）。

### ② 会话历史段（短期记忆）

历史源选定为 **`KairosShortTermMemoryContext.load()` 的 messages**，即"真正会被回放给 LLM 的内容"。**不**展示 ring buffer 的 SessionEvent（那个是监控页主体的领域）。

- 子段 1：**历史摘要**
  - 来源：`shortTermResult.summarySegments`（year/month/week summary 文件内容）。
  - UI：每个 segment 一个折叠卡，标题为 `segment.label`，正文 `whitespace-pre-wrap`。
  - 空状态：`暂无历史摘要——仍在收集近期 tick 数据中`（与 prompt 一致）。
- 子段 2：**最近 messages**
  - 来源：`shortTermResult.messages`（短期记忆原文，按 token 预算从新到旧加载，前端按时间从新到旧渲染）。
  - 每条渲染：
    - 顶部一行：`role badge`（user / assistant / tool）+ 可选 `source`（如 `kairos_tick`）+ 相对时间（`HH:mm:ss`，无 timestamp 时省略）。
    - 正文：`whitespace-pre-wrap`，**默认显示前 3 行**（按 `\n` 切分），超出折叠为"展开本条"。v1.0 的 600-字符策略已下线——按行折叠的"3 行"对短期记忆消息的视觉一致性更友好（同一栏每条卡片高度可预期）。
    - role badge 配色：user 蓝、assistant 绿、tool 灰、其他默认灰。
  - 默认只渲染最近 20 条；底部"加载更早 20 条"按钮自客户端切片，不再发 IPC。

### ③ 工具列表段

**Chip 密排**（v1.4）：每个工具一颗 pill，flex-wrap 自然换行。**只展示工具名**——`KairosContextTool.description` 字段在契约里保留但不再渲染。

```
工具列表   8 个

⌐──────⌐ ⌐─────────⌐ ⌐──────────⌐ ⌐──────⌐ ⌐──────⌐
│ sleep │ │read_file│ │write_file│ │ grep │ │ bash │ ...
└──────┘ └─────────┘ └──────────┘ └──────┘ └──────┘
```

- DOM：`<ul>` 容器 + 每个工具一个 `<li>` chip，无 `<Fragment>` 包装、无 grid。
- 样式核心：
  ```tsx
  <ul className="m-0 flex flex-wrap gap-1.5 p-0">
    {tools.map(tool => (
      <li
        key={tool.name}
        className="inline-flex items-center rounded-full
                   border border-[#e0e5f0] bg-[#fafbfe]
                   px-2.5 py-0.5
                   font-mono text-[12px] leading-[1.7] text-[#2c303a]"
      >
        {tool.name}
      </li>
    ))}
  </ul>
  ```
- 视觉语言**与系统提示词段的 source-file badge 同源**（圆角 pill + 浅边框 `#e0e5f0` + 浅底 `#fafbfe` + mono 字体），让 Sheet 内只有一套"信息标签"语言。但 chip 有三处差异，体现"主信息 vs 附加信息"的层级：
  | 维度 | source-file badge | tool chip |
  |---|---|---|
  | 字号 | 11px | 12px |
  | 文本颜色 | `#4f5665`（二级灰） | `#2c303a`（接近深字） |
  | 左侧图标 | `FileText` 10px | 无 |
  | 可点击 | 点击复制完整路径 | 不可点击 |
- **不带 hover / 不带 tooltip**：chip 完全静态，传达"只读能力清单"的语义；hover 高亮会传达错误的可交互 affordance。
- **不分组**：当前 Kairos 自有工具只有 1 个（`sleep`），分组会让单工具的组孤立。排序仍是 `kairos > shared`，再字典序——`sleep` 永远第一个。
- 数量提示：标题旁 `<N 个>`。

> 为什么不展示描述？走查反馈：模型上下文里看到工具列表的第一感受应该是"能力清单"（"我能用哪些动作"），不是"API 文档"（"每个动作怎么用"）。后者的需求场景太弱——开发者如果真要看工具细节，去看源码或 Anthropic dashboard 比看 Sheet 高效。Sheet 的角色是"快速扫读 Kairos 当前状态"。

> 为什么 chip 形态比"两列 grid"或"单行 truncate"更对？chip 是"离散单元的列表"标准视觉语言（参考 Anthropic / OpenAI model card 里列工具/能力的方式）；grid 隐含"每行有结构化数据要对齐"，单行 truncate 隐含"信息流"。工具列表的语义是前者。

## 数据源与契约

### Snapshot 类型（`packages/shared/src/kairos-contracts.ts` 扩展）

```ts
export type KairosContextPhase = "work" | "quiet" | "weekend" | "off";
export type KairosContextMessageRole = "user" | "assistant" | "tool" | "system";

export interface KairosContextHistorySegment {
  label: string;
  text: string;
}

export interface KairosContextMessage {
  role: KairosContextMessageRole;
  source?: string;
  content: string;
  timestamp?: string;
}

export interface KairosContextTool {
  name: string;
  description: string;
  source: "kairos" | "shared";
  /** v1.1 不再渲染；保留契约以备未来扩展。 */
  parametersSchema: unknown;
}

export interface KairosContextPromptSegment {
  label: string;
  text: string;
  /** 该段可由编辑这些文件改变；纯运行时段省略此字段，renderer 显示"运行时生成"。 */
  sourceFiles?: string[];
}

export interface KairosContextSnapshot {
  generatedAt: string;
  /** v1.1 不渲染；snapshot 保留以备未来在消息粒度展示 token / 模型信息。 */
  modelId: string | null;
  phase: KairosContextPhase;
  /** 完整拼好的 system prompt 字符串（用于"复制全文"和未来对比/落盘）。 */
  systemPrompt: string;
  /** v1.1 不渲染。同上。 */
  systemPromptTokens: number;
  /** Sheet 渲染源——按段视图。 */
  systemPromptSegments: KairosContextPromptSegment[];
  historySummary: KairosContextHistorySegment[];
  historyMessages: KairosContextMessage[];
  tools: KairosContextTool[];
}
```

`KairosBridgeApi` 追加方法：

```ts
interface KairosBridgeApi {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

### IPC 通道

| Channel | 方向 | Payload |
|---|---|---|
| `kairos:get-context-snapshot` | renderer ↔ main | `void` → `KairosContextSnapshot` |

- 不需要 state / event 推送通道——Sheet 是按需拉取，关闭即释放。
- 多次快速点击 `刷新`：renderer 端用 `loading` 标志位串行化，main 端不做并发抑制。

### Controller 暴露

`KairosController` 接口追加（`agent-core/src/kairos/controller.ts`）：

```ts
interface KairosController {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

实现策略：

- 复用 runner 的依赖三件套：`observeRefresh()`、`shortTerm.load()`、`activeBriefsCount()`。
- 调一次 `assembleSystemPrompt(...)` 得到完整 prompt 字符串（用于 `systemPrompt` 字段 / "复制全文"）。
- 同步调一份独立 helper `buildPromptSegments(...)` 拆 6 段，给每段写上 `sourceFiles`。该函数复用 `buildConfigTipsBlock` / `buildObservationSummary` / `buildHistorySummary` 三个原始 build* 函数，确保段内容与 LLM 真正看到的对应一致。
- 历史摘要段的源文件来自 `shortTermResult.summarySegments[].path`——为此 `KairosShortTermLoadResult.summarySegments` 在 v1.1 增加 `path: string` 字段（短期记忆 store 自身已经知道路径，向上透传是廉价操作）。
- token 估算复用 `agent-core/context/token-estimator`（或简单 `Math.ceil(text.length / 3)` 兜底）。
- 工具列表：`toolManager.getAll()`，每条转成 `KairosContextTool`：
  - `source`：通过工具名是否在 `registerKairosTools` 注册的集合内来区分（v1 只有 `sleep` 是 kairos）。
  - `parametersSchema`：直接取 `tool.spec.parameters`（已是 JSON Schema）；v1.1 不渲染但保留字段。
- **不真正跑 LLM**。整个调用纯 IO + 文本拼接，可在用户点按钮时同步执行。
- 错误：若 `observeRefresh` 或 `shortTerm.load` 抛错，整个方法 reject；IPC handler 把错误透传给 renderer，Sheet 渲染顶部红色 banner。

### Renderer state 接入

在 `packages/desktop/src/renderer/state/useKairos.ts` 追加：

```ts
interface UseKairosResult {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

不缓存到 hook state，Sheet 自己用本地 `useState<KairosContextSnapshot | null>(null)` 管理（关闭即 GC）。

## 状态与边界

| 状态 | UI 表现 |
|---|---|
| Sheet 未打开 | 不渲染 Portal；按钮 `aria-expanded=false` |
| 首次打开（拉取中） | 渲染 Sheet 框架 + 各 section 骨架占位 |
| 拉取成功 | 渲染完整内容 |
| 拉取失败 | 顶部红色 banner：`无法加载上下文：<msg>` + `重试` 按钮 |
| 桥不可用 | 入口按钮 disabled + tooltip；点击不弹 Sheet |
| Kairos stopped（未启用） | 正常拉取并展示 snapshot；history messages 可能为空 |
| reset_today 刚发生 | 下次打开拉取会自动反映清空后的状态 |

## 视觉细节

- 配色继承监控页：primary `#2f6fff`、surface `#ffffff`、灰边 `#e6e8ef`、深字 `#1a1d24`、二级字 `#6c7281`。
- Section 标题：`text-[13px] font-semibold uppercase tracking-[0.04em] text-[#6c7281]`。
- 折叠 chevron：`ChevronDown` / `ChevronRight` lucide icon，用于会话历史段的展开折叠。
- 系统提示词段（v1.3 章节流）：`<article>` 直接渲染，无 border 无 background；除首段外顶部 `border-t border-[#eef1f6]` 1px 分隔线；章节标题用 14px 短色条 + 14px 加粗段名 + 右侧徽章 / pill。
- 会话历史 `<pre>` 仍保留 `font-mono`：消息内容是直接喂给 LLM 的"上下文文本"，等宽字体更能体现 user/assistant/tool 的对齐感。
- 工具列表（v1.4 chip 密排）：`<ul>` 用 `flex flex-wrap gap-1.5` 排版；每个 chip 圆角 pill + 浅边框 `#e0e5f0` + 浅底 `#fafbfe` + mono 12px + 文本 `#2c303a`。视觉与 source-file badge 同源，靠字号/颜色/图标做层级区分（见 ③ 节）。
- 复制成功 toast：暂不引入全局 toast；按钮文案临时切换为 `已复制`，2 秒后恢复。

## 测试策略

### 单测（vitest + jsdom）

1. `components/ui/Sheet.test.tsx`：
   - 打开 / 关闭 transition；`data-state` 属性切换。
   - Esc 关闭；Overlay 点击关闭；关闭按钮关闭。
   - focus trap：Tab 在最后一个元素上回到第一个；Shift+Tab 反向。
   - 关闭时焦点归还。
2. `components/kairos/KairosContextSheet.test.tsx`：
   - mock `getContextSnapshot()` 返回完整 fixture，验证 ①②③ 段渲染。
   - 标题旁渲染生成时间（`HH:mm:ss`），并断言 v1.0 概览字段已下线（`Prompt token` / `当前阶段` 不再出现）。
   - 系统提示词每段标题 + 源文件徽章（basename）渲染；"运行时生成"占位渲染。
   - "复制全文"按钮调 `navigator.clipboard.writeText(snapshot.systemPrompt)` 并切换为"已复制全文"。
   - 段徽章按钮（点击 basename 徽章）复制完整源文件路径。
   - 工具列表渲染为 chip 密排（v1.4）：每个工具一颗 pill，**只展示 name**；断言 description 字段不再渲染、schema / 来源角标也不渲染。
   - 历史消息默认折叠到 3 行，"展开本条"后第 4 行可见。
   - 错误状态：reject 后渲染 banner + 重试。
3. `main/kairos-ipc-internals.test.ts`（已有文件追加）：
   - `kairos:get-context-snapshot` handler 调 controller 一次并返回；controller throw 时透传错误。
4. `agent-core/src/kairos/test/controller.test.ts`（已有文件追加）：
   - `getContextSnapshot()` 在已启动 / 未启动两种状态下都能稳定返回；prompt 中包含 rule.md 内容。
   - `systemPromptSegments` 至少返回 6 段，且 `用户规则` / `配置提示` 段标注了正确的源文件路径。
   - 工具来源标记正确：`sleep` 是 `kairos`，其它共享工具是 `shared`。

### 视觉验收

- 浏览器 mock 模式：注入 mock bridge 返回 fixture，截图比对四种 section 状态。
- Electron `pnpm dev:log`：在真实 Kairos 上启用 mock LLM，跑一次 tick 后打开 Sheet，验证：
  - prompt 中能看到 rule.md 全文 ([4] 段)。
  - history messages 末条是刚才那次 tick 的注入。
  - tools 段包含 sleep + read_file / list_directory / ... 至少 5 个工具。

## 维护规则

- 入口按钮位置 / Sheet 行为变更，必须更新本文档。
- `KairosContextSnapshot` 字段增减必须在 `packages/shared/src/kairos-contracts.ts` 同步，并在本文档"数据源与契约"小节增减条目。
- Sheet 组件本身（`components/ui/Sheet.tsx`）若后续被复用到其它页面（例如设置态、Lab 页），写一份独立的"基础组件封装规范"小节，把通用 props（`side`、`size`）补全后再迁出。
- 监控页母规范 `Kairos监控页规范.md` 只引用本文一句，不复述详情。
