# 06 Composer 与运行目标交互重设计

> **实施状态：已按 09 实施（2026-10-06）。** 现行规范见 [聊天输入框规范](../design-docs/frontend/front-聊天输入框规范.md)（外观、单行 / 多行、`+` 面板、发送队列）和 [Workspace、Git Branch 与 Worktree 执行上下文规范](../design-docs/frontend/front-workspace-git-worktree-context.md)（运行位置菜单、只读状态行）。本文的行号指 2026-10-05 的代码；实施中的取舍见 [09 执行记录](../exec-runs/20261005-desktop-fe-09-composer/execution-process.md)。
> 范围：`components/Composer.tsx`（2479 行）、`components/composer/MessageQueueTray.tsx`、ConversationView 中的 Composer 挂载、运行位置 / 远端选择 UI。
> 目标：解决用户提出的三个体验问题：
> 1. 消息队列要放在输入框**上方**（Codex 式），不要塞在输入框里面。
> 2. 远端连接 UI 改成 Cursor 式的运行位置菜单。
> 3. 输入框样式和交互改成 Cursor 式：边框更淡，用柔和阴影；`+` 改为统一面板。
>
> 已拍板：D2（菜单只有本机 / 远端机器）、D3（对话中不能切换机器）、D4（`+` 面板方案）、D4+（低对比边框 + 柔和阴影）、D7（先看 demo）。
> Demo：[`demo/composer-run-target-demo.html`（已迁出）](../design-docs/retired-html-demos.md)，可切换浅色 / 深色、新建 / 对话中、本机 / 远端、柔和阴影 / Cursor 原样，以及新旧对比。
> 2026-10-05 第二轮：按 Cursor 编译后源码（§11）修正了工具行顺序、单行 / 多行规则和 `+` 面板形态。
> 依赖：03 的 `RunTarget`；05 的 Popover / Menu 原语。
> 迁移去向：改写 `front-聊天输入框规范.md`（视觉、`+` 菜单、队列三节），改写 `front-workspace-git-worktree-context.md` 的「Run on 菜单」「Follow-up 状态行」两节；`message-queue-demo.html` 标为已废弃。

## 1. 现状问题

### 1.1 队列在输入框里面

- `MessageQueueTray` 挂在输入面板**内部**（`Composer.tsx:2114-2119`），自带 `border border-line bg-surface-subtle` 和 `mx-3 mt-3`，形成「框中框」。
- 队列有 3 条以上时，输入面板被撑高，输入行被推到底部，视线要跳着找输入位置。
- 来源：队列 exec-plan 原本写的是「输入框上方，Codex 式」；`message-queue-demo.html:90` 画成了面板内部，实现按 demo 做了。这次回到原意。

### 1.2 远端 UI

见 03 §1.4。总结：三个原生 `<select>`（Host、远端工作区、远端模型）插在原有选择器旁边；工作区选项显示 `{name} · {path}`；Host 名在状态行重复出现；原 Run on 菜单里还有「远程 SSH · 即将推出」的占位，和真实远端入口并存。

### 1.3 输入框外观

- `COMPOSER_PANEL_CLASS`：`rounded-act-lg border border-line bg-surface … focus-within:border-line-strong`。
- 浅色下边框 `--act-color-border: #deded9`，聚焦时变成 `line-strong`，靠**加深边框**表达焦点，视觉偏硬，像表单输入框。
- 没有任何阴影，输入框和背景（`--act-color-bg: #f7f7f5`）之间只有一条灰线。

### 1.4 `+` 菜单与模型入口

- `+` 菜单（`renderCommandMenu`，`:1701`）：模式三行 + 分隔 + 图片 / Skills ›。没有搜索。
- 模型是独立按钮 + 独立面板（`:1771-2020`）；远端时被替换为原生 `<select>`（`:1773`）。
- 现行规范明确写了「不设搜索框」「不放 Models」，本次按 D4 改写。

### 1.5 交互 bug（顺带修）

| 问题 | 位置 | 修复 |
| --- | --- | --- |
| 切换会话时附件不清空，可能带到另一个会话（待真机验证） | `:765-771` 只恢复草稿文本；ConversationView 两处挂载 Composer 且无 `key`（`:1122`、`:1221`） | 单次挂载 + `key={draftKey}`；附件纳入草稿结构（02 的 `SessionLocalState.draft`）。**已在 16 T14 处理**：Composer 只挂一次但不用 key（重挂载会在新建页发出第一条时丢焦点），附件按会话存进 `SessionLocalState.attachments`，见 05 §7-8 |
| 斜杠菜单 ↑↓ 在输入法组字时也会响应 | `:1381` | 统一判断 `event.nativeEvent.isComposing \|\| event.keyCode === 229` |
| `Shift+Tab` 切 Plan 在组字时也会响应 | `:1370` | 同上 |
| 6 个布尔手工互斥 | `:602-627` | 05 §2.3 的 `ComposerOverlay` 枚举 |
| 死 prop：`onAgentFormChange`（`:545`）、`agentForm`（`:564`）、`ComposerExecutionContext.locked`（`:105`） | — | 删除（07） |
| 状态行和初始行都显示 Host 名 | `:2241`、`:2426` | 新设计只在一个位置显示 |

## 2. 设计总览

```text
新建会话（initial）
┌───────────────────────────────────────────────────────────────┐
│  📁 actspace-agent ⌄    ⑂ main ⌄    💻 本机 ⌄                    │ ← 运行目标行（可编辑）
│ ╭───────────────────────────────────────────────────────────╮ │
│ │ 描述你要做的事，@ 引用文件，/ 调用命令                         │ │
│ │                                                           │ │ ← 低对比细边 + 柔和阴影
│ │ (+)  [Plan ×]  Opus 5.5 ⌄                           (↑)   │ │
│ ╰───────────────────────────────────────────────────────────╯ │
└───────────────────────────────────────────────────────────────┘

对话中（followup）
  Review +12 −3   查看                                              ← 现有 Review strip（不变）
 ┌─────────────────────────────────────────────────────────────┐
 │ ≡  把测试也补上                          ↳ 引导   🗑   ⋯      │  ← 队列：输入框上方的独立托盘
 │ ≡  顺便改一下 README                     ↳ 引导   🗑   ⋯      │
 └─────────────────────────────────────────────────────────────┘
 ╭─────────────────────────────────────────────────────────────╮
 │ (+)  继续追问…                                          (■)  │  ← 单行：胶囊形；模型收进 + 面板
 ╰─────────────────────────────────────────────────────────────╯
   溢出 / 换行 / 附件后：
 ╭─────────────────────────────────────────────────────────────╮
 │ 第一层和第三层其实是同一个东西——只是第一层是内置的 Provider…    │
 │ (+)  [Chat ×]  Opus 5.5 ⌄                               (↑)  │  ← 模型在左，发送在右
 ╰─────────────────────────────────────────────────────────────╯
  ⑂ main · 💻 本机                                        42% ◔    ← 只读状态行（无 ⌄）
```

## 3. 消息队列：移到输入框上方

### 3.1 结构

```text
┌ 队列托盘（与输入框同宽，紧贴其上，间距 6px）───────────────────┐
│ [≡] 文本（单行截断）            [meta] [↳ 引导] [🗑] [⋯]        │
│ [●] 已引导的文本 · 下一步读取                     [撤回]          │
└──────────────────────────────────────────────────────────────┘
```

- **位置**：从输入面板内部移到面板**外部上方**，作为 Composer 根节点下与 panel 同级的兄弟元素。Review strip 在它上面。
- **外观**：
  - 背景 `surface`，与输入框同色；圆角 `rounded-act-lg` 的上半部分（`rounded-b-none` 不做——两者保持分离，间距 6px，避免视觉粘连成一个大块）。
  - 边框用和输入框一致的低对比细边（§5），**不加阴影**，层级低于输入框。
  - 去掉现在的标题行（「N 条排队 · 当前运行结束后依次发送」）。计数改为第一行左侧图标的 tooltip；只有在 `paused` 时显示一条提示行「已暂停 · 继续发送」。
- **行**：
  - 左侧图标：`ListOrdered`（14px，faint）表示排队；已引导的行用 6px operational 绿点 + 呼吸动效（沿用现状）。
  - 文本：单行截断，`title` 显示全文。
  - meta（附件数、引用数）：faint，窄窗隐藏（沿用 `max-[560px]:hidden`）。
  - 动作：`↳ 引导`（运行中才显示）、`🗑` 删除、`⋯` 更多（编辑、上移）。动作按钮默认 `opacity-60`，行 hover / focus-within 时 100%。
  - 已引导的行：文本 muted，右侧「下一步读取」+「撤回」。
- **最大高度**：4 行（约 144px），超出后托盘内部滚动；不推动输入框。
- **空队列**：托盘不渲染。

### 3.2 文案

| 现状 | 新 | 说明 |
| --- | --- | --- |
| `↳ 插入` | `↳ 引导` | 对齐 Codex 的 Steer；「插入」容易被理解为插入到输入框。tooltip 不变：「让 Agent 在下一步看到这条消息」 |
| 标题行「N 条排队…」 | 去掉 | 计数放到图标 tooltip |
| 「继续发送」 | 不变 | 只在 paused 时出现 |

> 「引导」这个词需要你确认（§9 问题 1）。备选：「插队」「现在发送」。

### 3.3 实现要点

- `MessageQueueTray` 的 `TRAY_CLASS` 去掉 `mx-3 mt-3 bg-surface-subtle`，改为与 panel 同宽的独立块。
- `⋯` 菜单改用 05 的 `Menu`（删除自写的 portal 和定位）。
- 挂载点从 `Composer.tsx:2114` 移到 Composer 根部 panel 之前；队列 controls 通过 `ComposerContext` 读取（02）。

## 4. 运行目标

### 4.1 新建页：运行目标行

```text
📁 actspace-agent ⌄     ⑂ main ⌄     💻 本机 ⌄
```

- 三个入口都是同一种**文字按钮**（`text-act-md text-text-muted`，hover `text-text-main` + `bg-hover-overlay`，高 28px，圆角 `rounded-act-sm`），没有边框，和 Cursor 新建页一致。
- 顺序固定：工作区 → 分支 → 运行位置（与现行规范一致）。
- **远端时**：
  - 运行位置按钮显示 `🖥 Host 名 ⌄`（Server 图标，与本机的 Laptop 区分）。
  - 工作区按钮列出该 Host 的工作区，**只显示名称**，路径放在 tooltip / 第二行 faint 小字；不再出现 `name · path`。
  - 分支按钮**隐藏**（`capabilities.gitContext = false`）。
- **Host 未就绪**：运行位置按钮右侧显示状态小点 + 简短原因（如「连接中」），输入框可以编辑草稿，发送按钮禁用并在 tooltip 中说明原因（§4.5）。

### 4.2 运行位置菜单

```text
┌──────────────────────────────┐
│ 💻 本机                    ✓ │
│ 🖥 远端机器                ›  │───┐
│ ─────────────────────────── │   │  ┌──────────────────────────────┐
│ ⑂ 新建工作树                 │   └─▶│ 🔍 搜索机器                   │
│   从 main 创建隔离分支         │      │ ──────────────────────────── │
└──────────────────────────────┘      │ ● dev-box            ✓       │
                                      │ ● gpu-server                 │
                                      │ ○ home-nas        离线        │
                                      │ ⚠ old-mac        需要重新配对  │
                                      │ ──────────────────────────── │
                                      │ ＋ 连接新机器…                 │
                                      └──────────────────────────────┘
```

规则：

| 项 | 规则 |
| --- | --- |
| 菜单宽度 | 主菜单 240px，子菜单 260px（与现行规范的 Run on 240px 一致） |
| 本机 | 默认项；选中打勾 |
| 远端机器 › | 悬停或 → 键打开子菜单。**没有任何已配置 Host 时**，这一项直接显示为「连接远端机器…」，点击跳到 设置 › Agent 服务器 |
| 子菜单搜索 | Host ≥ 5 台时显示；少于 5 台不显示，避免空搜索框 |
| Host 行 | 状态点（connected = operational 绿；connecting = warning 黄 + 动效；offline = faint 空心；revoked / incompatible = danger）+ 名称 + 右侧状态文字（只在非 connected 时显示） |
| 不可用 Host | 可以选中（草稿可编辑），但发送会被禁用并说明原因；不把它们灰掉成不可点，因为用户可能就是想选它再去修连接 |
| 连接新机器… | 打开 设置 › Agent 服务器 的添加流程；不在菜单内嵌配对表单 |
| 新建工作树 | 本机下：沿用现行规则（需要 Git + HEAD；否则禁用并显示「需要 Git」「需要先提交一次」）。远端下：禁用，说明「远端机器暂不支持」 |
| 不放 | Cloud、Remote Control、「即将推出」占位（D2） |
| 键盘 | ↑↓ 移动，→ 打开子菜单，← 返回，Enter 选择，Esc 关闭并回到触发按钮 |

选中「新建工作树」时，运行位置按钮显示 `⑂ 新建工作树 ⌄`，分支按钮的 tooltip 改为「从该分支创建工作树」（沿用现行规范的语义区分）。

### 4.3 对话中：只读状态行（D3）

```text
⑂ main · 💻 本机                                   42% ◔
⑂ actspace/92803054 · ⑂ 工作树                     42% ◔
🖥 dev-box · 📁 api-server                          42% ◔
🖥 dev-box · 连接中…                                 —
```

- 没有 `⌄`，不是按钮（Host 名可 hover 显示 tooltip：连接方式、状态、工作区路径）。
- 本机：分支 · 运行位置（本机 / 工作树）。
- 远端：Host 名 · 远端工作区名（远端没有分支信息）。Host 未就绪时第二段换成状态文字，context 用量显示 `—`。
- 权限模式控件（`PermissionModeControl`）保留在状态行，位置不变。
- 右侧 context 用量是打开 Context 弹窗的唯一入口（沿用）。
- 不再在输入框内或其它位置重复显示 Host 名。

### 4.4 新建入口与侧栏

- 侧栏某个远端工作区分组的「新建对话」：直接以该 Host + 工作区作为草稿目标（现在已有：`Sidebar.tsx:1226` → `handleCreateSession`）。
- 新建页的草稿目标默认取「上次使用的目标」（03 §2.4）。

### 4.5 未就绪文案

| readiness（03 §2.3） | 运行位置按钮旁 | 发送按钮 tooltip |
| --- | --- | --- |
| connecting | 黄点 + 连接中 | 正在连接 {host}，草稿会保留 |
| offline | 空心点 + 离线 | {host} 离线。前往设置重新连接 |
| revoked | 红点 + 需要重新配对 | {host} 的授权已失效，需要重新配对 |
| incompatible | 红点 + 版本不兼容 | {host} 的 Agent 版本与当前应用不兼容 |
| removed | 红点 + 已移除 | 这台机器已从列表移除 |
| describing | 黄点 + 正在读取 | 正在读取 {host} 的工作区和模型 |
| describe-failed | 红点 + 读取失败（可点击重试） | 无法读取 {host} 的信息：{error} |
| host-unavailable | 黄点 + 暂不接受任务 | {host} 正在停止，暂不接受新任务（draining）/ {host} 恢复上次的任务时出错，暂不接受新任务（blocked） |
| workspace-missing | — | 选择一个远端工作区 / 该工作区在 {host} 上已不存在 |
| model-missing | — | 选择一个模型 |

## 5. 输入框外观

### 5.1 边框与阴影

新增 token（`styles/theme.css`，浅色 / 深色各一套）：

```css
:root {
  --act-color-composer-border: rgb(0 0 0 / 0.07);          /* 现 #deded9 ≈ 0.13 */
  --act-color-composer-border-focus: rgb(0 0 0 / 0.11);
  --act-shadow-composer:
    0 1px 2px rgb(0 0 0 / 0.04),
    0 4px 16px -4px rgb(0 0 0 / 0.06);
  --act-shadow-composer-focus:
    0 1px 2px rgb(0 0 0 / 0.05),
    0 8px 28px -6px rgb(0 0 0 / 0.10);
}
[data-theme="dark"] {
  --act-color-composer-border: rgb(255 255 255 / 0.07);
  --act-color-composer-border-focus: rgb(255 255 255 / 0.12);
  --act-shadow-composer:
    0 1px 2px rgb(0 0 0 / 0.30),
    0 6px 20px -6px rgb(0 0 0 / 0.40);
  --act-shadow-composer-focus:
    0 1px 2px rgb(0 0 0 / 0.35),
    0 10px 32px -6px rgb(0 0 0 / 0.55);
}
```

Tailwind 映射：`border-composer`、`border-composer-focus`、`shadow-act-composer`、`shadow-act-composer-focus`（`check:frontend-tokens` 白名单同步）。

```ts
const COMPOSER_PANEL_CLASS =
  "composer-panel relative grid overflow-visible rounded-act-xl border border-composer bg-surface shadow-act-composer " +
  "transition-[box-shadow,border-color] duration-(--motion-fast) " +
  "focus-within:border-composer-focus focus-within:shadow-act-composer-focus";
```

- 聚焦时**阴影加深**、边框只轻微加深，不再用 `line-strong`。
- 圆角从 `rounded-act-lg`（12px）提到 `rounded-act-xl`（现有 token，18px，与 Cursor 的 4xl 相同）；单行时为胶囊形（§5.2）。
- **与 Cursor 的差异**：Cursor 源码里输入框**没有阴影**（只有拖拽时有 2px 外环），层次来自 6% 前景色的底色 + 8% 前景色的细边，hover / 聚焦时细边升到 12%。我们保留柔和阴影是按你的要求；demo 顶部「阴影」可切到「Cursor 原样」对比（§9 问题 7）。
- 深色主题下阴影几乎看不出来，层级主要靠 surface `#242522` 与 bg 的明度差 + 细边，这是预期的。
- 不使用彩色光晕，不改发送按钮颜色（沿用 ink action）。
- 现行规范里「1px 中性 hairline」这一条保留，只是降低对比度。

### 5.2 内部布局

保持现有的 inline ↔ stacked 动态切换（实现约束「不 remount textarea」不变；Cursor 也是同一棵 DOM，只切 class），按 Cursor 的 compact 变体调整：

**两种布局**

| | 单行（inline） | 多行（stacked） |
| --- | --- | --- |
| 形状 | 胶囊（`rounded-full`），padding 8px | `rounded-act-xl`（18px） |
| 排列 | `+` · 模式 chip · 输入 · 发送，同一行 | 输入独占上方；下方工具行：**左** `+` · 模式 chip · 模型 ⌄，**右** 发送 |
| 模型按钮 | 隐藏（从 `+` › 模型 切换） | 显示在左侧 |
| 输入区 | 单行高 22px | 最高 200px，超出内部滚动；新建页最少 2 行 |

**切换规则**（与 Cursor 源码一致）：

- 进入多行：输入在单行宽度下溢出（测量，不按字数）、出现换行（Shift+Enter）、有附件 / Skill chip、拖拽文件进入。用 ResizeObserver 在宽度变化时重新判断。
- 回到单行：**只在输入完全清空时**。删到只剩一行也保持多行，避免边界处来回跳。
- 新建页（initial）始终多行；窄窗（≤720px）始终多行。

**控件**

- `+` 按钮：从 `variant="soft"`（有底色的圆）改为 `ghost` 圆形 28px；hover 和打开时出底色。
- 模式 chip：Agent 默认不显示；Plan / Chat 显示为 `[图标 Plan ×]`，高 24px、13px 字、胶囊，`×` 常显，点 `×` 或聚焦后按 Backspace 回到 Agent。颜色：Plan = warning-soft 底 + warning 字，Chat = operational-soft 底 + operational 字。
- 模型按钮：ghost 胶囊 24px，`text-muted` → hover `text-main`，箭头 opacity .7 → 1；打开的面板与 `+` › 模型 是**同一个**组件（§6.3）。
- 发送按钮：28px 圆形。Agent 模式 ink；**Plan 模式 warning 色、Chat 模式 operational 色**（Cursor 同款，提示当前模式）；禁用 30% 透明；运行中为停止。
- placeholder 随模式变化：Agent 新建页「描述你要做的事，@ 引用文件，/ 调用命令」、对话中「继续追问…」；Plan「描述要规划的改动…」；Chat「问点什么…」。（需要确认，§9 问题 3）

## 6. `+` 统一面板

### 6.1 结构

```text
┌──────────────────────────────────────────────────────────────┐  ← 与输入框同宽，浮在输入框上方 8px
│ 🔍 搜索 Skills、文件、模型…                                     │  ← 打开即聚焦
│ 📋 Plan  先出计划，确认后再执行                                  │
│ 💬 Chat  纯对话，不使用工具                                      │
│ ────────────────────────────────────────────────────────────  │
│ 📎 图片与文件                                                   │
│ 📖 Skills                                                   ›  │
│ ✨ 模型  Opus 5.5                                            ›  │
└──────────────────────────────────────────────────────────────┘
╭──────────────────────────────────────────────────────────────╮
│ (+) …                                                        │
╰──────────────────────────────────────────────────────────────╯
```

| 项 | 规则 |
| --- | --- |
| 位置 | 锚定**整个输入框**：上方 8px，左对齐，**宽度 = 输入框宽度**；上方空间不足时翻到下方。portal 渲染，是独立卡片，不与输入框拼接 |
| 外观 | `rounded-act-lg`（12px）、`bg-surface-raised`、1px 低对比细边；行高 28px、圆角 8px、行内 `图标 · 名称 · 灰色说明`（说明紧跟名称，不右对齐）；列表最高约 280px |
| 搜索 | 打开即聚焦，placeholder「搜索 Skills、文件、模型…」；在模式、文件入口、**Skills 列表、模型列表**中做本地过滤，结果按组展示（输入「son」直接出现模型行 Sonnet 5.5）。不搜对话（D4：暂无数据源） |
| 模式组 | 只列**非默认**模式（Cursor 同款，不列 Agent，也不打勾）：空会话 Plan / Chat；已开始的 Agent 会话只有 Plan；已开始的 Chat 会话不显示模式组。选中后在工具行出现模式 chip，chip 的 `×` 回到 Agent |
| 图片与文件 | Agent / Chat 统一叫「图片与文件」（远端走上传，本机走路径；03 `capabilities.attachments`）。如果 Agent 本机仍然只接受图片，则保持「图片」，由能力决定 |
| Skills › | 在同一张卡片内下钻为 Skills 列表；搜索框左侧的搜索图标换成「‹」返回 |
| 模型 › | 行内说明显示当前模型；下钻为模型列表：与工具行模型按钮打开的是同一个 `ModelPicker` 组件；远端时列出 Host 提供的模型（03 §2.5） |
| 暂不放 | MCP、Debug、Multitask、对话搜索——目前没有对应能力，以后由我们自己加；结构上按「模式组 / 分隔 / 入口组」预留 |
| 键盘 | 搜索框中 ↑↓ 在结果间移动，Enter 选择，→ 下钻，← / Backspace（搜索为空时）返回上一级，Esc 关闭 |
| 斜杠菜单 | 保持独立（输入 `/` 触发），不合并进 `+` 面板 |

### 6.2 与现行规范的差异（需要改写规范）

| 现行规范 | 新 |
| --- | --- |
| 面板与输入框同宽（在输入框下方展开） | 仍与输入框同宽，但作为独立卡片浮在输入框**上方** 8px |
| 不设搜索框 | 顶部搜索框 |
| 不放 Models | 放「模型 ›」，与 toolbar 模型按钮共用组件 |
| Agent 入口叫「图片」 | 由能力决定「图片」或「图片与文件」 |
| `+` 按钮 soft 底色 | ghost |
| 无模式 chip 关闭按钮 | `Plan ×`；发送按钮随模式变色 |
| 模型按钮在工具行右侧 | 多行时在左侧（`+` · chip · 模型）；单行时隐藏 |
| 1px hairline、`surface`、无阴影 | 低对比 hairline + 柔和阴影 |

### 6.3 ModelPicker

把 `Composer.tsx:1771-2020` 的模型面板抽成 `features/composer/ModelPicker.tsx`：

- 输入：`ModelCatalog`（03 §2.5，本地 / 远端统一）。
- 两个挂载点：toolbar 模型按钮（Popover）、`+` 面板「模型 ›」（面板内页）。
- 保留现有规则：搜索、按供应商分组、同名消歧、Options 子菜单（Thinking / 推理强度）。
- 远端模型不支持 Options 时不显示 Edit。

## 7. 组件拆分（Composer 2479 → 约 400 + 子组件）

```text
features/composer/
  Composer.tsx                 ← 根：布局（initial / followup、inline / stacked）、ComposerOverlay 状态
  ComposerInput.tsx            ← textarea、IME、粘贴 / 拖拽、自动高度、inline/stacked 判定
  ComposerAttachments.tsx
  ComposerToolbar.tsx          ← + / 模式 chip / 模型按钮 / 发送停止
  ComposerPalette.tsx          ← `+` 统一面板（基于 05 的 CommandPalette）
  SkillsPage.tsx
  ModelPicker.tsx
  SlashMenu.tsx                ← 现有斜杠逻辑迁出
  RunTargetRow.tsx             ← 新建页：工作区 / 分支 / 运行位置
  RunLocationMenu.tsx          ← §4.2
  ComposerStatusRow.tsx        ← 对话中只读状态行
  MessageQueueTray.tsx         ← 迁入并改造
  ReviewStrip.tsx
  use-composer-keyboard.ts     ← 快捷键（Shift+Tab、Enter、↑ 编辑上一条、Esc），统一 IME 判断
  composer-context.ts          ← ComposerContext（02 §3.3）
```

- Composer 只在 ConversationView 挂载一次，`key={draftKey}`。（16 T14 已实施单次挂载，没有用 key，见 05 §7-8。）
- 所有远端判断改为 `useRunTarget().capabilities`（03）。

## 8. 实施步骤

| 步骤 | 内容 | 依赖 |
| --- | --- | --- |
| S0 | demo 评审，确认 §9 的问题 | — |
| S1 | 新 token（composer border / shadow）+ panel class 替换（圆角用现有 `radius-xl`）；`+` 改 ghost | 无，可提前单独做 |
| S2 | 队列托盘移到输入框上方 + 外观 + 文案；`⋯` 改用 Menu | 05 S1 |
| S3 | Composer 单次挂载 + key；附件纳入草稿；IME 判断统一（单次挂载和附件草稿已在 16 T14 完成，不用 key；IME 归 09） | 02 S3 |
| S4 | `RunTargetRow` + `RunLocationMenu` + `ComposerStatusRow`；删除远端 `<select>` 与「即将推出」占位 | 03 S4、05 S1 |
| S5 | `ModelPicker` 抽出，本地 / 远端统一 | 03 S6 |
| S6 | `ComposerPalette`（搜索 + 下钻）；模式 chip `×` | 05 S1 |
| S7 | 其余拆分（Input、Toolbar、SlashMenu、keyboard hook） | — |
| S8 | 改写两份规范；`message-queue-demo.html` 标为废弃 | — |

S1 改动小、收益明显，可以在其它重构之前单独做。

## 9. 需要确认（看 demo 时一起定）

> 2026-10-05 已定稿：用户确认按 demo 实施，以下九项均按 demo 默认值处理，定稿表见 [09 决策记录](../exec-plans/completed/20261005-desktop-frontend-refactor/09-输入框优化执行计划.md#决策记录)。

1. 队列按钮文案：「↳ 引导」还是保留「↳ 插入」，或其它？
2. 输入框圆角是否从 `lg`（12px）提到 `xl`（18px）？
3. placeholder 文案。
4. 远端 Host 少于几台时隐藏子菜单搜索（建议 5）。
5. 没有任何 Host 时，菜单里「连接远端机器…」直接跳设置，还是不显示远端项？（建议显示，作为能力入口。）
6. Agent 本机模式下附件入口是否也开放普通文件（统一叫「图片与文件」）？这涉及 Runtime 能力，不只是 UI。
7. 输入框阴影：保留柔和阴影，还是照 Cursor 原样不加阴影（只靠细边 + 底色）？demo 顶部可切换。
8. 单行时用胶囊形（Cursor 同款）还是保持 18px 圆角？
9. 发送按钮随模式变色（Plan 黄、Chat 绿）是否接受？

## 10. 验收

- 视觉：浅色 / 深色截图与 demo 一致；聚焦态只加深阴影。
- 队列：3 条以上时输入框位置不变；托盘内部滚动；引导 / 撤回 / 删除 / 编辑 / 上移全部可用。
- 运行位置：本机 → 远端 → 本机切换后，工作区 / 分支 / 模型正确切换；远端时分支隐藏、工作区只显示名称。
- 对话中：状态行无下拉；尝试通过任何入口切换机器都不可能（D3）。
- 未就绪：§4.5 每种状态都有对应文案（组件测试）。
- 键盘：`+` 面板搜索 → 下钻模型 → 选择，全程键盘可完成；运行位置菜单 → 子菜单 → 选择 Host，全程键盘可完成。
- IME：中文输入法组字时 ↑↓、Shift+Tab、Enter 不触发 Composer 行为。
- 切换会话：附件不串会话（新增测试）。16 T14 已加 `composer-attachment-drafts.test.tsx`。
- 480px 窄窗：运行目标行可换行，菜单不被裁剪。

## 11. Cursor 输入框源码参考（2026-10-05）

来源：本机 `/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js`（编译产物，StyleX 原子类）。由子智能体只读分析，[确认] 为源码可见，[推断] 为由公式 / CSS 推出。

| 项 | Cursor 实现 |
| --- | --- |
| 编辑器 | TipTap / ProseMirror contenteditable（不是 textarea），@ 引用和 / 命令是内联节点 [确认] |
| DOM | `.ui-prompt-input`（纵向 flex，gap 6px，也是 `+` 面板的锚点）› `__container`（可见框）› 编辑器 + `toolbar[role=toolbar]`（`__left` / `__right`）[确认] |
| 外框 | 底色 6% 前景色；1px 细边 8% → hover / 聚焦 12%；圆角 18px（单行时胶囊）；**无阴影**；overflow hidden [确认] |
| 编辑器 | padding 8px 12px，min 36px，max 200px 后滚动；14px / 22px；placeholder 36% 前景色，随模式变化 [确认] |
| 单行 → 多行 | `scrollWidth > clientWidth \|\| scrollHeight > 24`，或有换行 / 引用 chip / 附件 / 拖拽；ResizeObserver 重算；不重挂载 DOM，只切 class [确认] |
| 多行 → 单行 | 只在完全清空时 [确认]；删到一行仍保持多行 [推断] |
| 单行布局 | 容器 flex、gap 4px、padding 8px；toolbar 用 `display: contents` 把按钮摊平到同一行；只显示标了 compact-visible 的左侧项（`+`、模式 chip），模型隐藏 [确认] |
| 工具行 | 左：`+` · 模式 chip · 模型；右：麦克风 · 发送。多行时 padding 8px、gap 8px [确认] |
| 模式 chip | 24px 胶囊，13px，`×` 常显，Backspace 可删；Plan 黄 / Debug 红 / Ask 绿 / Multitask 紫，底色为该色 10% [确认] |
| 模型按钮 | ghost 胶囊 24px，文字 74% 前景色 → hover 100%，9px 箭头 opacity .7 → 1 [确认] |
| 发送 | 24px 圆；无模式时前景色底；有模式时随模式着色；禁用 6% 底 + 36% 图标；运行中且无输入时为停止 [确认] |
| `+` 面板 | Base UI Popover，portal，`side: top`，`align: start`，offset 8，翻转，**宽度 = 输入框宽度**；圆角 12px，1px 内描边 12%；搜索行 28px；列表行 28px、圆角 8px、gap 8px，图标 12px，名称 74% → 100%，说明 60% 紧跟名称；选中底 14%；列表最高 280px；Esc 关闭 / 子页返回，↑↓ 循环，Enter / Tab 选择 [确认] |
| `+` 面板内容 | 非默认模式（Plan / Debug / Multitask / Ask）· 分隔 · Files · Model（说明为当前模型）· MCP ›；有输入时切换为斜杠索引搜索（Skills、命令、子 Agent、历史对话、规则）[确认] |
| 输入框下方 | 「This Mac ⌄」运行位置（本机 / 工作树 / Cloud / SSH / 容器 / Remote Control）+ 右侧 16px context 环 [确认]；按钮 CSS 未提取 [推断] |
| 动效 | 快 100ms / 常规 150ms；按下 scale .98；尊重 prefers-reduced-motion；单行 ↔ 多行切换无过渡 [推断] |
