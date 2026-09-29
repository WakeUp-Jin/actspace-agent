# Chat Mermaid 图表渲染设计

## 文档状态

- 状态：已实施（2026-09-28），执行计划见 [`20260928-chat-mermaid-diagrams`](../../exec-plans/completed/20260928-chat-mermaid-diagrams.md)；真实 Electron 验收边界见执行摘要。
- 开放讨论项已于 2026-09-28 确认，结论见文末「决策记录」；正文中「推荐」「待确认」的表述以决策记录为准。
- 目标：在助手聊天回复中将 Mermaid fenced code 渲染为可读、可检查的图表，并借鉴 Codex App 的 Mermaid 图表视觉与预览交互。
- 设计参考：本机 Codex App 编译产物中的 `MermaidDiagram`、Mermaid renderer、图表预览操作和宽块布局。它是行为与视觉参考，不复制其实现代码或品牌资产。
- 实现边界：首版先覆盖聊天回复，不默认扩展到右侧 Markdown 文件预览。

## 背景与问题

ActSpace 当前助手回复通过 `MarkdownProse` 渲染 Markdown，使用 `react-markdown`、`remark-gfm` 与 `rehype-highlight`；fenced code 统一交给普通代码块组件。目前 ` ```mermaid ` 仍然是源码代码块，不能直接检查参与者、节点、箭头和分支关系。

Codex 的观感不是 Mermaid 默认主题单独产生的。可观察到的实现把识别、绘图、布局和预览操作拆开：Markdown 层专门识别 Mermaid；图表由 Mermaid 生成；图表块可使用比正文更宽的居中布局；工具栏提供放大、复制源码、显示源码和导出 PNG。Codex 还会等待回复完成后绘图，并为 Mermaid 使用独立的颜色变量。

ActSpace 当前通用 UI 主题是 `Ink & Emerald`，设计目标和 token 与 Codex 图表主题并不相同。本功能不应为了图表的品牌式视觉改写全局主题，也不应强迫图表复用尚未完成的 ActSpace 图表色板。

## 目标与非目标

### 目标

- 在聊天回复中将 `mermaid` fenced code 显示为图表，其他语言代码块维持现有行为。
- 保留原始 Mermaid 源码的复制和查看入口；图表不能成为不可检查的黑盒。
- 默认图表外观参考用户提供的 Codex 浅色主题截图：浅灰白画布、深色文字和线条、低饱和橙色强调。
- 图表颜色与应用 UI 主题解耦，避免应用切换深浅主题时静默改变用户选择的图表风格。
- 支持足够宽的图表阅读空间；宽块仍受消息容器和窗口可用宽度限制，不造成全局横向溢出。
- Mermaid 错误不影响同一条回复中的其他 Markdown 内容。
- Mermaid 源码按不可信输入处理，限制危险指令和 HTML 能力。

### 非目标

- 首版不把 Mermaid 转成图片或 HTML artifact，不增加 LLM 调用。
- 首版不修改右侧 Markdown 文件预览的 Mermaid 支持范围。
- 首版不建立通用主题编辑器，不改变 ActSpace 的全局 UI 色板。
- 不承诺支持 Mermaid 上游全部图类型、实验语法或任意初始化配置。
- 不实现拖动节点、编辑连线等图形编辑器能力。

## 关键决策建议

### 图表主题独立于应用主题

推荐在设置的「外观」页面增加 Mermaid 图表设置，由 renderer appearance preference 持久化。它属于本机 UI 呈现偏好，不进入 Session Journal、工具参数或 Runtime 配置。

Codex 风格预设使用独立的 Mermaid theme variables，不消费 `--act-color-*`，不读取应用当前 `data-theme` 来隐式翻转。这样图表在浅色和深色 ActSpace 界面中保持同一套选定外观。

不要将它建模为全局 `AppearancePrefs.theme` 的另一个主题值。应用主题和图表主题是两个不同对象：前者控制工作台，后者控制 Mermaid 画布；分开命名、持久化和测试。

### 首版设置形态

推荐首版只提供轻量外观选项，而不是完整编辑器：

| 设置 | 推荐首版行为 | 说明 |
|---|---|---|
| Mermaid 图表主题 | `Codex`（默认） | 固定图表色板，作为截图的近似视觉方向 |
| 自定义主题色 | 暂不提供 | 避免在没有完整色彩角色和可访问性验证前暴露孤立色值 |
| 跟随应用主题 | 不默认启用 | 避免应用 `system` 主题改变时图表意外翻色 |
| 导出 / 查看源码 | 图表块操作 | 不属于全局主题偏好 |

后续 ActSpace 通用可视化主题稳定后，可增加 `ActSpace` 预设；它应将通用图表 token 映射到 Mermaid theme variables，而不是改变 `Codex` 预设的语义。

### 当前不照搬的 Codex 行为

Codex App 内部 bundle 的 Markdown、Mermaid API 和 React 组件只作为行为证据。ActSpace 应采用项目现有 React/TypeScript、设置偏好、主题与内容安全约定，不复制压缩 bundle、CSS 命名或内部 API。

## 用户体验

### 聊天消息内

- 仅对 fenced code 的 info string 完整匹配 `mermaid` 执行图表渲染；匹配不区分大小写并忽略首尾空白。部分语言前缀仍先按普通代码块处理，避免流式输入 `mer` 时过早切换组件。
- 渲染完成后显示独立图表区域。普通小图与 Mermaid 块保持自然间距；明显宽于正文的图表在聊天列内居中扩展，使用稳定宽度约束和 `overflow` 行为，不撑开窗口。
- 操作入口保持克制，并提供清晰 tooltip / accessible name。推荐首版包含：放大预览、复制 Mermaid 源码、查看源码、下载 PNG。
- 流式期间保留代码/加载占位；fence 闭合且消息完成后再尝试最终渲染。若确认支持稳定增量解析，可另立决策，不以每个 token 重绘作为首版要求。
- 单块语法错误时显示局部错误状态与「查看源码 / 复制源码」恢复入口；不能隐藏源码或令整条回复崩溃。
- 源码入口复用现有代码块视觉与复制语义，不为 Mermaid 源码新增第二套无关编辑体验。

### 放大预览

- 放大视图使用独立 overlay / dialog，图表保持完整比例，具备 fit-to-view 与用户可见的缩放控制。
- 支持键盘 Escape 关闭、焦点管理、可访问名称；缩放状态不能导致布局抖动或页面整体滚动。
- 大图不应强制自动 fit 到无法阅读文字的极小尺寸；应允许查看原始可读比例并在预览区域平移。
- 首版是否在放大预览中提供 Mermaid 源码切换尚待确认；可先支持复制与独立源码入口。

## 渲染与组件边界

建议按单向数据流组织：

```text
assistant message.content
  -> Markdown parser
  -> fenced code handler
       -> 非 Mermaid：现有 MarkdownPre
       -> Mermaid：MermaidDiagramBlock
            -> sanitizeAndValidateMermaidSource
            -> Mermaid renderer (strict configuration)
            -> themed SVG
            -> diagram actions / expanded preview
```

- Markdown 层只负责分类代码围栏并传入 code、消息流状态和 callback，不承载 Mermaid parser / SVG 生成细节。
- `MermaidDiagramBlock` 管理 loading / ready / error / expanded 等局部 UI 状态与操作入口。
- Mermaid renderer 通过独立 adapter 封装初始化、主题变量、渲染、错误归一化和 SVG 后处理，避免设置 UI 直接调用 Mermaid 全局 API。
- 使用稳定且唯一的 diagram id；相同源码多次出现也不能产生重复 SVG id 或 marker/filter 冲突。
- 图表 SVG 只在当前消息 DOM 中呈现，不写入 Session、磁盘或 artifact；恢复会话时由 Markdown 正文重新渲染。
- Mermaid 主题偏好在 Markdown/renderer 边界读取一次并显式传入，不从 SVG 内部读取全局 DOM 变量。

## 主题模型

### 建议的主题类型

```ts
type MermaidThemeId = "codex";

interface MermaidAppearancePrefs {
  version: 1;
  theme: MermaidThemeId;
}
```

这是讨论用的最小形状，正式实现时可合并进既有 `AppearancePrefs`，但应使用独立属性 `mermaidTheme`，不能复用 `theme` 字段。

Codex 预设内部使用角色名而非 UI token 名，例如：

```ts
type MermaidThemeVariables = {
  canvas: string;
  text: string;
  nodeFill: string;
  nodeBorder: string;
  line: string;
  labelBackground: string;
  accent: string;
  muted: string;
};
```

初始色值应以用户截图和安装版 Codex 的可观察样式为视觉目标，形成 ActSpace 自己命名、维护和测试的固定预设；不要未经逐项核验就宣称与 Codex 内部色值完全一致。

### 设计对未来通用主题的兼容

- 主题预设 registry 接受 `MermaidThemeId`，返回完整 Mermaid 变量，不在组件内按主题散落条件色值。
- 后续添加 `actspace` 预设时由 ActSpace 图表 token 映射生成 Mermaid 所需角色；不修改既有 `codex` 预设。
- 如果以后增加「跟随应用主题」，作为明确第三种模式，例如 `follow-app`，分别解析 light / dark 对应变量；不把它隐含为当前默认值。
- Mermaid 的用户自定义 accent 与节点/边/文字色之间必须验证对比度。如果未来提供自定义色，至少还需定义是否跟随深浅模式、自动生成语义色、颜色校验和重置行为，不能只加一个颜色输入框。

### 持久化与启动

当前主题、UI 字体和代码字体是 renderer localStorage 偏好，并在 `main.tsx` 初始渲染前恢复，以避免闪烁。Mermaid 主题适合留在同一偏好边界：它无需跨进程生效，也不是 Agent Runtime 配置。

需要决定将其加入现有 `actspace.appearance.v1` 并调整 schema/default，还是建立 versioned 独立 key。推荐扩展同一 `AppearancePrefs` 对象，因为它是同一用户、同一窗口的显示偏好；保存时必须兼容缺少 `mermaidTheme` 的旧记录并回落 `codex`。

## 安全与健壮性

- Mermaid 源码是模型生成的不可信输入。
- 初始化固定由应用提供，禁止源码覆盖 `securityLevel`、主题、external resource policy 或 parser 配置。
- 使用 Mermaid `strict` security level；禁止或移除 `click` 交互指令、外部链接和会导致主动导航的语法。HTML labels 默认关闭；若图类型需要 HTML，必须单独做安全评估，不能为显示效果直接放宽。
- 不使用 `rehype-raw`，不把 Mermaid 源码拼接成任意 HTML。Mermaid 返回 SVG 后仍应校验输出根节点与必要属性；确认是否采用 SVG sanitization library 属于实现前置决策。
- 设源码长度、节点/边数量、渲染时间和 SVG 输出大小上限。达到限制时落入安全的错误状态并允许查看源码。
- 处理 Abort/unmount、重复渲染、主题偏好变化和图表卸载，释放临时 DOM / listener；并发渲染不得改写其他图表节点。
- 错误信息对用户简短，对日志只记录受控类别；不记录完整回复、源码、SVG 或本地隐私内容。
- 异步渲染完成前不得把空 SVG 或旧源码 SVG 当成成功图表。

## 性能与布局

- Mermaid 核心按需加载，首次非 Mermaid 回复不承担 Mermaid parser / layout engine 的初始化成本。
- 同一源码、主题和配置可做 renderer 级短期缓存；需限制缓存数量和总输出，不能把未经验证的 SVG 无限留在全局 map。
- 流式期间不对未闭合 fence 反复解析；完成态源码变化或主题变化才重新生成。
- 聊天虚拟化卸载后允许丢弃 SVG；重新挂载时从 Markdown 源码确定性重建。
- wide block 最大宽度由聊天可用容器计算；移动/窄窗退回容器宽度，避免固定像素宽度与横向页面溢出。
- 展开视图只在用户触发时挂载，关闭后释放图形和事件资源。

## 实现位置建议

```text
apps/desktop/src/renderer/components/messages/MarkdownProse.tsx
  Mermaid code fence custom renderer registration

apps/desktop/src/renderer/components/messages/MermaidDiagramBlock.tsx
  loading / ready / error / expanded states and per-diagram actions

apps/desktop/src/renderer/components/messages/mermaid-renderer.ts
  lazy renderer adapter, source policy, fixed security config, theme registry

apps/desktop/src/renderer/components/messages/mermaid-preview.tsx
  only if expanded preview has enough behavior to justify a separate component

apps/desktop/src/renderer/appearance/types.ts
apps/desktop/src/renderer/appearance/storage.ts
apps/desktop/src/renderer/components/settings/SettingsPage.tsx
  mermaidTheme preference and Appearance settings row

apps/desktop/src/renderer/test/
  Mermaid renderer, message Markdown, appearance storage, Settings and layout tests
```

具体文件可以随现有组件结构调整；除非 preview 已经成为可复用职责，不预先拆分空组件。

## 测试与验收

### 自动化

- 语言识别：`mermaid` / `MERMAID` / 空白边界；其他语言、`mer` 流式前缀、未闭合围栏仍显示代码占位。
- React Markdown 集成：含 Mermaid 与普通 Markdown/代码混合的回复；一个图失败不能影响其他块。
- renderer adapter：合法 sequence / flowchart、无效语法、空源码、超长源码、危险 `click` / HTML / `securityLevel` init、重复 diagram id。
- 状态生命周期：流式占位到完成渲染、error 回退、消息卸载/快速重挂载、多个 Mermaid 块同时渲染。
- 主题：缺少新偏好的旧 localStorage 回落 `codex`；选择设置后刷新保持；Codex 预设不随 app light/dark 改色。
- 布局：宽图居中、最大宽度不越界、窄窗口内缩、长节点文字不裁切、SVG 不触发消息列表横向溢出。
- 交互：复制源码、显示源码、PNG 导出、放大/关闭/缩放、键盘 Escape 与焦点行为。
- 安全：渲染结果不含可执行脚本/事件属性、不进行外网请求、不允许图源码覆盖安全配置。

### 视觉验收

- 对比用户提供的 Codex 截图，覆盖浅色图表在 ActSpace light、dark、system-light、system-dark UI 下的组合；图表外观本身保持一致。
- Mermaid 内容至少包括 sequence diagram（参与者多、条件分支与长 label）、flowchart（多层级/长节点）、状态图和错误语法。
- 桌面常用窗口与窄窗截图检查：正文列宽、图表宽度、居中关系、文字清晰度、缩放前后比例和操作控件不遮图。
- 真实 Electron 检查 CSP / SVG 资源行为、剪贴板、下载路径、键盘焦点和主题首屏恢复。
- 若未来增加 `follow-app` 或 ActSpace theme preset，新增浅/深两套图表对比度和 system 跟随验收。

## 开放讨论项

1. **首版设置入口**：推荐「外观」页面新增 Mermaid 图表主题行，只有 `Codex` 一个预设时是否仍显示选择器，还是先用固定默认并暂不展示无效控件？
2. **应用主题联动**：推荐默认固定 Codex 主题。是否希望首版同时提供 `跟随应用主题`？它会增加浅/深色调和 system 主题测试矩阵。
3. **参考忠实度**：用户截图显示的是 Codex 浅色 Mermaid 外观。深色 ActSpace 下仍使用浅色图表，还是基于截图反推一套 Codex dark variant？
4. **主题调色范围**：首版只提供 Codex 预设，还是同时允许自定义 accent？建议推迟自定义色，除非确实需要用户覆盖主题橙色。
5. **图类型范围**：首版 Mermaid.js 全图类型按需加载，还是只承诺 sequence / flowchart / state diagram？大依赖体积和兼容责任不同。
6. **放大预览交互**：放大窗口是否必须同时提供源码编辑并即时重绘，还是首版仅 zoom / pan、源码另行查看？编辑会增加焦点、状态同步和错误恢复复杂度。
7. **宽块策略**：普通对话中图表最大宽度要超出正文多少、是否占用右侧空列？Codex 风格参考截图的宽度依赖具体窗口和布局。
8. **安全白名单**：是否从首版起完全禁用 Mermaid `click`、HTML labels 和外部链接？推荐默认全部禁止，等明确用例后再逐项放开。
9. **设置存储**：推荐将 `mermaidTheme` 加入 `AppearancePrefs` 并扩展现有 localStorage schema；是否接受它跟随该偏好一起重置？

## 决策记录

- 2026-09-28：接受 Codex App Mermaid 图表作为视觉和交互参考；不以当前 ActSpace UI token 重染图表。
- 2026-09-28：方案推荐独立 Mermaid theme preference，默认固定 Codex 风格；跟随应用主题、自定义颜色和编辑型预览保留待讨论。
- 2026-09-28：开放项确认——(1)(2)(3) 固定 Codex 浅色、不跟随应用主题、暂不在外观页放只有一项的选择器，代码保留 `AppearancePrefs.mermaidTheme` 与主题注册表；(4) 不提供自定义颜色；(5) Mermaid 全部图类型按需加载，只对 sequence / flowchart / state 做视觉承诺；(6) 放大预览只做缩放/平移，源码走块工具栏的「查看源码」；(7) 聊天列本身即 `--conversation-content-width`，图表不越出列宽，过宽时最多缩到 72%，再宽则块内横向滚动；(8) 默认禁用 `click` / 外链 / HTML labels；(9) `mermaidTheme` 并入 `actspace.appearance.v1`，旧记录回落 `codex`。
- 2026-09-28：实现细节——助手消息没有流式标记，以「fence 已闭合」代替「消息完成」作为渲染时机（闭合后源码不再变化）；依赖 `mermaid@11.17.2` 与 `dompurify`；Codex 预设取 Codex 橙色聊天主题的节点色（`#ffe7d9` / `#fff5f0` / `#6d2e0f`）配灰色连线与 `#fbfaf8` 画布，由 ActSpace 自行命名维护；工具栏放在画布外、复用代码块顶栏，避免深色 UI 下按钮压在浅色画布上。

## 实现落点

- `apps/desktop/src/renderer/components/messages/mermaid-renderer.ts`：懒加载、固定 strict 配置与 `secure` 键、源码策略（剥离 `%%{init}%%`、frontmatter `config`、`click` / `link` / `callback`）、DOMPurify 二次净化（只保留 `#` 内部 href）、上限（源码 20k 字符、500 条边、10 秒、SVG 2 MB）、LRU 32 与并发去重、实例 id 重写、PNG 导出。
- `MermaidDiagramBlock.tsx`：loading / ready / error / 源码视图与工具栏（查看源码、复制源码、下载 PNG、放大）。
- `MermaidPreviewDialog.tsx`：适配视口（不放大）、预设档位 25%–500%、Ctrl/⌘ + 滚轮以光标为锚、拖拽平移、`+` / `-` / `0` 与 Esc、焦点归还。
- `MarkdownProse.tsx`：通过 context 拿到原始 Markdown，仅对语言完整匹配且 fence 闭合的块分流。
- 视觉验收页：`apps/desktop/src/renderer/test/fixtures/mermaid-preview.html`（`?theme=dark`、`?streaming=1`、`?expand=N`、`?png=N`）。
