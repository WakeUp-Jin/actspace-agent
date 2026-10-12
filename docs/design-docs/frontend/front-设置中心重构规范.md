# 设置中心重构规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 文档状态

- **状态**：已确认设计；P0–P5 已实现，P6 真实宿主与人工验收待完成。
- **适用范围**：ActSpace Desktop 设置中心、Usage 活动页面，以及与设置页面直接相关的 shared IPC 适配。
- **当前事实来源**：本文是设置中心重构后的产品与交互规范。实现细节、执行顺序和具体改动文件进入 `docs/exec-plans/` 后再冻结。
- **模型页面子规范**：模型页面的视觉和路由细节以 [`front-模型设置页面-Maka重做规范.md`](front-模型设置页面-Maka重做规范.md) 为准。
- **视觉重设计**：2026-09-25 按 [`settings-redesign-demo.html`](settings-redesign-demo.html) 统一分组、行、控件和保存方式，新增「能力 → 搜索」页；实现与验收见 `docs/exec-plans/completed/20260925-settings-visual-redesign.md`。本文 4.1、5.2、6.1、6.5 与 9.1 已同步。
- **使用统计更新**：2026-09-07 已实现视觉统一、中文与费用口径，详见 [`front-usage-statistics-refresh.md`](front-usage-statistics-refresh.md)；真实 Electron / Provider 门禁见该任务执行摘要，不改变本文其他阶段的验收状态。

本文不是 Maka 的复制规范。Maka 源码和 `curated-design-docs` 只作为参考证据，用来提炼可迁移的页面语法、对象模型、状态处理和数据分析方法。Maka 中 ActSpace 没有的 Runtime Host、Bot Chat、宠物、每日回顾等功能不因为视觉参考而进入本次范围。

## 1. 已确认的产品决策

以下决策已经确认，后续实现不得再次把它们当作待选方案：

1. 删除顶层“服务商”导航，只保留一个“模型”页面。
2. “模型”页面在用户界面中统一处理 Provider、Connection 和 Model，底层数据对象仍然分开。
3. Usage 按 Maka 的“活动分析”重做，首屏不再展示热力图、2D、3D 和 Share。
4. 快捷键并入“通用”，联网搜索并入“工具”，图片生成和图片分析的默认选择并入“通用”；模型连接仍归“模型”。
5. 取消独立的“智能体”设置页面。
6. Agent 相关功能按用户任务分散到“通用”“工具”和“子 Agent”。
7. “个人偏好”进入“通用”，第一版包含“显示名称”和“回复风格偏好”。

## 2. 为什么要重构

当前设置页的问题不是单个组件不好看，而是信息架构和对象边界让用户承担了内部实现复杂度：

- Provider 和 Model 被拆成两个顶层页面，配置模型需要往返两次。
- Agent 的 System Prompt、模型参数、工具审查和 Explore 路由放在同一页面，用户难以判断每个设置影响什么。
- 设置导航平铺，没有表达“偏好、能力、活动、系统”的心智分组。
- `SettingGroup` 以卡片为默认容器，造成卡片堆叠和 card-in-card。
- Usage 同时放置汇总、模型排行、热力图、工具卡、日报和运行明细，缺少从结论到证据的阅读路径。
- 部分控件尚未有真实行为，例如 2D、3D、Share 和默认权限占位开关。
- 重构前 Usage 请求行主要按 `agentRunId` 聚合，不等于一次真实 LLM 请求；P5 已补齐 Journal 事件级活动投影，旧聚合仅作为兼容回退。

因此本次不是局部换皮，而是设置中心的用户模型重构：

> 按用户要解决的问题组织页面，按真实数据和风险组织交互，按内部对象保持运行时边界。

## 3. 参考证据与迁移原则

### 3.1 Maka 源码中直接采用的机制

| 机制 | Maka 证据 | ActSpace 迁移结论 |
| --- | --- | --- |
| 导航分组 | `tmp/maka/apps/desktop/src/renderer/settings/settings-nav.ts` | 采用偏好、能力、活动、系统分组 |
| 设置页面语法 | `settings-section.tsx`、`settings-rows.tsx` | 采用开放式分组和 hairline 行，不让卡片成为默认容器 |
| 编辑行 | `settings-expandable-row.tsx` | 短值默认只读，点击后展开编辑，一次只打开一行，取消恢复原值 |
| 模型配置路由 | `providers-panel.tsx`、`provider-catalog-page.tsx`、`provider-connection-detail.tsx` | 一个模型页面承载列表、目录、连接配置和连接详情 |
| 身份设置 | `personalization-settings-section.tsx` | 将显示名称和回复偏好放进通用，不把它们伪装成 System Prompt |
| Usage 结构 | `usage-settings-page.tsx` | 时间范围、汇总指标、Tab 分析、按需明细、来源回链 |
| 数据可信度 | Maka Usage telemetry 类型和 provenance 处理 | 明确成本估算依据、日志截断和不可用状态 |
| 错误恢复 | Maka 的 Banner、retry、draft 保留和状态模型 | 所有异步操作有加载、成功、错误和恢复路径 |

### 3.2 不迁移的机制

- 设置中心重构本身不引入参考产品的 Host 模型；后续已实现的远端连接现位于「能力 → 远端 Host」，由独立 Host 契约负责。
- 不引入 Bot Chat、WorkHub、宠物、每日回顾和远程项目管理。
- 不为了视觉一致而把搜索 Provider 改造成 LLM Provider。
- 不把图片生成强行当成普通文本模型；连接能力归“模型”，默认使用方式归“通用 → 媒体默认”。
- 不把 Agent 身份偏好写进高优先级 System Prompt 文件。
- 不为了获得事件级 Usage 外观而破坏现有 Journal 或伪造请求记录。

## 4. 信息架构

### 4.1 顶层导航

```text
设置
├── 偏好
│   ├── 通用
│   └── 外观
│
├── 能力
│   ├── 远端 Host
│   ├── 模型
│   ├── 搜索
│   ├── 工具
│   └── 子 Agent
│
├── 活动
│   ├── Usage
│   ├── 归档会话
│
└── 系统
    └── 更新
```

### 4.2 页面归属规则

| 页面 | 主要回答的问题 |
| --- | --- |
| 通用 | 我希望 ActSpace 和 Agent 怎样按我的习惯工作？ |
| 外观 | 我希望界面怎样显示？ |
| 远端 Host | 我连接到哪里，如何配对和管理连接？ |
| 模型 | 我连接了哪些模型服务，哪些模型可以被使用？ |
| 搜索 | Agent 联网搜索用哪些服务？ |
| 子 Agent | 主 Agent 可以路由给哪些专门代理？ |
| 工具 | Agent 可以做什么，以及执行时需要什么审查？ |
| Usage | 已经发生了多少模型、工具和成本活动？ |
| 归档会话 | 已归档的会话如何查找和恢复？ |
| 更新 | 如何检查并执行本地应用更新？ |

快捷键、图片生成和图片分析不再占用顶层导航（联网搜索 2026-09-25 起独立为「搜索」页），因为它们是相邻页面中的一个功能分组，而不是独立的用户任务。

### 4.3 导航状态

- 导航项使用稳定的 section ID，不通过文字或数组位置判断当前页面。
- 当前 section 同时在侧栏高亮、内容区标题和辅助说明中表达。
- 最后访问的 section 持久化，重新打开设置时恢复。
- 从列表进入详情、从目录进入连接配置时，返回必须恢复来源页面、滚动位置和筛选状态。
- 页面切换时焦点进入新页面的 landmark 或首个主要动作，不在流式输出期间反复抢焦点。

## 5. 设置壳层与页面语法

### 5.1 设置壳层

设置是独立于聊天态的页面级视图，继续使用整页接管布局：

```text
┌──────────────────────────────────────────────────────────┐
│ 窗口 chrome                                             │
├───────────────┬──────────────────────────────────────────┤
│ 设置导航      │ 当前页面                                 │
│               │ 页面标题                                 │
│ 分组          │ 页面说明                                 │
│ 分组          │                                          │
│               │ 设置分组 / 列表 / 特殊分析内容           │
└───────────────┴──────────────────────────────────────────┘
```

布局规则：

- 左侧导航拥有固定滚动所有权，右侧内容区是主要垂直滚动容器。
- 主内容使用稳定的最大阅读宽度，不随页面切换改变左边缘。
- 设置壳层不与聊天右侧文件面板叠加。
- 窄窗口将侧栏变成顶部横向导航，不能出现第二个嵌套滚动条。
- 模型详情和 Usage 表格允许使用比普通设置行更宽的内容列，但仍由同一个设置壳层承载。

### 5.2 普通设置页

普通页面使用以下结构：

```text
SettingsPage
  ├── SettingsPageHeader (唯一 h2)
  ├── SettingsSection (h3)
  │     ├── 分组标题
  │     ├── 分组说明
  │     └── SettingsRow / SettingsField / SettingsActions
  └── 下一个 SettingsSection (h3)
```

默认使用开放式行：

```text
设置名称
设置说明，允许换行                         当前值 / 控件 / 动作
──────────────────────────────────────────────────────────
```

规则：

- 组与组之间用较大的垂直间距表达主题切换。
- 组内行之间用细分隔线表达同一主题下的连续设置。
- 只有真正需要独立阅读的 Widget 使用卡片，例如指标、警告、选项网格和表格。
- 一个顶层设置页面只允许一个 `h2`；页面内主要分组使用 `h3`，分组内子分组使用 `h4`。
- Dialog 的标题可以使用 `h2`，但只在 `role="dialog"` 的局部语义范围内计数，不得成为页面第二个大标题。
- 分组使用**内嵌分组**：白底 `bg-surface` + 1px `border-line` + 10px 圆角，无阴影；组内行用浅分隔线（2026-09-25 用户确认，取代此前“开放式行、不用卡片”的写法）。
- 从属设置（父开关控制的行）左侧缩进；父开关关闭时整行变灰且控件禁用。
- 说明文字不以单行省略为默认行为。
- 路径、ID、Endpoint 等机器值使用整行等宽排版，并提供复制或展开能力。

### 5.3 Route-level 子页

模型连接目录、连接配置、连接详情和归档列表采用子页，不放进窄 Dialog：

- 子页有明确的返回动作和页面标题。
- 返回恢复进入前的筛选和焦点。
- 保存失败保留草稿，不能静默跳回列表。
- 删除、断开等破坏性动作不与普通保存动作混在一起。

### 5.4 特殊分析页

Usage 允许使用自己的结构：

```text
SettingsPage
  ├── toolbar
  ├── summary / metric
  ├── tab navigation
  └── table / detail / drill-down
```

特殊页面仍必须复用设置壳层、页面标题、内容宽度、加载错误态、空状态和主题 token，不能自由发明一套后台系统视觉。

## 6. 页面规范

### 6.1 通用

通用页面是用户对应用和 Agent 默认行为的总入口。

```text
通用
├── 个人偏好
│   ├── 显示名称
│   └── 回复风格
├── Agent 指令
│   └── Agent 系统提示词
├── 模型与生成（原“任务默认”）
│   ├── 默认聊天模型
│   ├── 轻量任务模型
│   ├── Explore 模型（只读跳转到「子 Agent」）
│   ├── 温度
│   └── 最大输出 Token
├── 媒体（原“媒体默认”）
│   ├── 图片生成连接
│   └── 图片分析模型
├── 语音播放
└── 快捷键
    └── 快速打开
```

快速打开的“指定会话”使用按需索引搜索：只有打开选择器并输入查询后才读取分页结果，每页最多50条，翻页替换当前结果。进入通用设置只读取快捷键状态和工作区元数据，禁止为下拉选项调用全量会话恢复。已有指定目标未在当前搜索页中不代表已删除；选择结果后才保存新的目标。

#### 个人偏好与指令

第一版只加入两个个人偏好：

```text
PersonalizationSettings
├── displayName?: string
└── responseStyle?: string
```

- `displayName` 最大长度 60 个字符。
- `responseStyle` 最大长度 500 个字符。
- 显示名称和回复风格默认以只读行显示，点击后展开编辑。
- 一次最多展开一个身份编辑行。
- 保存失败保留草稿，并给出错误原因和重试路径。

Agent System Prompt 也放入本分组，但保持高级编辑器语义：

- 默认显示提示词文件路径和当前状态。
- 点击后打开多行编辑器。
- 使用显式保存和取消。
- 保存前显示字符限制和生效时机。
- 正文继续由 main 进程通过受控文件桥读写，不放入 renderer 长期状态或 Journal。

身份偏好不是 System Prompt 的替代品。注入顺序为：

```text
系统约束
  ↓
项目指令
  ↓
Agent System Prompt
  ↓
身份与回复偏好
  ↓
当前会话输入
```

身份偏好只能影响称呼和表达方式，不能覆盖系统规则、项目约束、安全策略、工具权限或审批规则。

#### 任务默认

任务默认只选择已有模型，不负责创建模型：

- 默认聊天模型：新会话和未显式选择模型时使用。
- 轻量任务模型：标题、工具摘要和上下文压缩等低成本任务使用。
- Explore 模型：作为子 Agent 页面中 Explore 配置的快捷入口，最终只维护一份数据。
- 温度和最大输出 Token：属于 Agent 生成参数，但不再放在独立 Agent 页面。

如果模型不可用，页面必须显示失效原因并要求重新选择，不能默默改写用户配置。

#### 语言设置

当前 ActSpace 没有完整的界面国际化能力，因此第一版不显示一个“简体中文”禁用选择器。语言设置只有在实际支持切换、持久化和完整文案覆盖后才进入页面。

### 6.2 外观

外观页面只负责真实的 UI 偏好：

```text
外观
├── 主题
├── UI 字体
├── 代码字体
├── 界面字号
└── 代码字号
```

主题、字体和字号继续遵守 ActSpace 的 `Ink & Emerald` 和三态主题规范，不复制 Maka 的颜色。实现任何带颜色的样式前，必须遵守 [`front-主题与配色规范.md`](front-主题与配色规范.md)：

- 浅色、深色、跟随系统三态同时验证。
- 组件只消费语义 token。
- 不使用 `text-black`、`bg-white` 或组件内 Hex 作为普通 UI 颜色。
- 导航 selected 使用 neutral，Toggle on 和连接成功使用 operational green。
- Usage 数据颜色走独立 chart token，不回流为按钮或导航色。

### 6.3 模型

连接、模型目录、能力和页面路由统一见[模型页面规范](front-模型设置页面-Maka重做规范.md)。本页只规定设置壳层：模型页负责连接与模型管理；默认会话、轻量任务、Explore 和媒体默认选择归「通用」。不另存一份模型页面字段表。

连接、模型和任务绑定保持独立身份；API Key 不回显，删除连接不删除历史。媒体连接同样遵循凭据安全规则，并明确成本和数据传输范围。

### 6.4 子 Agent

取消独立的“智能体”页面，不取消子 Agent 能力。

当前页面展示 Explore 的只读能力说明和模型选择，未单独设置时跟随默认会话模型。可选模型来自 `listUsableModels({ purpose: "explore" })`，保存走 `updateTaskModels({ exploreModel })`。

当前页面没有独立连接、思考级别、启停或 preset 删除控件；这些能力不能作为已实现验收项。Explore 只读代码探索不等同于主 Agent，也不负责完整实现。

### 6.5 工具

工具页面按用户可理解的能力边界分组；执行风险只在终端和浏览器高级设置中出现：

```text
工具
├── 代码库
├── 终端（Bash 终端 → 执行前确认）
├── 浏览器
├── 多媒体
└── 显示（显示写入变动）
```

#### 代码库、终端、联网与多媒体

管理工具是否暴露给 Agent。将同一用户任务下的工具放在一组，避免在页面顶部同时出现“工具总览”和逐项工具说明：

- 文件读取、搜索和目录浏览。
- 文件写入和编辑。
- Bash 执行与自动审查。
- 联网搜索入口。
- 图片生成和图片分析工具。

工具当前 Provider 不可用时，必须显示禁用原因。不能把 Provider 不可用误报为工具本身故障。

#### 浏览器能力

浏览器默认只显示一个总开关；需要时展开“高级设置”，再管理分类执行工具和敏感能力。这样可以保持首屏简洁，同时保留完整的 Browser Use 控制面。

#### 联网能力（2026-09-25 起位于「搜索」页）

「搜索」页顶部是「允许联网搜索」开关（写 `disabledTools` 的 `web_search`），下方是搜索通道列表：不显示 logo，国际通道带顺序标签，点「连接」在行下展开 Key 输入，已连接显示「管理」菜单（更换 Key / 断开连接）。关闭开关不影响通道的连接与断开。

联网搜索 Provider 继续与 LLM Provider 数据隔离，但在 UI 上作为工具能力的一部分展示：

- Zhipu。
- Tavily。
- TinyFish。
- Exa。

每行展示凭据状态、服务说明、连接或断开操作。Tavily 用量仍属于搜索服务状态，不混入 LLM 模型成本。

#### 执行审查

`Bash` 自动审查归入工具：

```text
Bash 命令审查
每条 Bash 命令执行前要求确认
```

该设置控制工具执行策略，不再被解释成 Agent 人格或 Agent 系统提示词。

### 6.6 扩展独立入口

扩展和 Skills 已移出设置导航，集中在左侧 New Agent 下方的「扩展」页面。扩展页保留会话侧栏，右侧聊天对象区不显示；点击会话或 New Agent 回到聊天。

- 「能力」管理 Browser Bridge 等 Host capability，不负责加载后端 Cordis 插件，不使用 Plugin 作为产品分类名称。
- 「Skills」管理知识能力的发现、启用、禁用、目录安装和卸载，沿用已有 IPC 与设置存储。开关以保存成功后的状态为准，失败显示提示并可重试。
- 「MCP」仅显示「暂未接入」，不提供无效的添加操作。
- 顶部搜索按当前分类筛选，切换分类保留各自查询；Tab 支持方向键、Home / End。
- 能力默认呈现名称、说明和连接状态，展开后显示源码目录、编译安装、连接检查与诊断。
- Skills 来源和状态可见，完整路径按需展开；安装、卸载、刷新与保存失败均保留明确反馈。
- 布局采用居中内容列、胶囊分类和紧凑列表；使用现有主题 token，支持窄窗与浅深主题。
- 两类能力复用各自管理逻辑，不合并为通用安装器。设置仍管理模型、工具与子 Agent。

### 6.7 使用统计

页面布局、分类、筛选和查询契约统一见[使用统计规范](front-usage-statistics-refresh.md)；事实与费用归因见[Token Usage 与 Context State](../model-context/agent-token-usage-and-context-state.md)。Usage 是活动分析，不能充当服务商账单。

当前协议范围是 `day / week / month / total`，页面展示滚动 24 小时、7 天、30 天和全部；不新增 `24h / 7d / 30d / all` 协议。费用由请求保存的价格快照解释，未知费用不能显示为免费。页面读取事件级活动投影，不回退为旧运行聚合统计。

### 6.8 归档会话

归档页面吸收 Maka 的对象管理语法：

- 搜索和列表是主要内容。
- 恢复是主动作。
- 删除放入更多菜单，并需要破坏性确认。
- 恢复后只刷新普通会话列表，不自动切换当前会话。
- 删除归档配置不影响其他 Session 和 Journal。

### 6.9 已退役的分析观测

2026-09-06 删除设置入口、独立工作区及专用 Analysis / Trace 接口；Journal 和公共投影继续服务聊天、Trajectory、Context 与 Usage。

### 6.10 更新

保留现有本地更新流程，不因为 Maka 的系统分组而引入新的更新模型。页面只负责展示当前源码目录、安装目标、构建进度和失败恢复路径。

## 7. 数据结构与作用域

### 7.1 设置逻辑层与当前兼容视图

P0 完成后，`SettingsService` 读取和写入 `version: 4` 的逻辑 namespace，并继续向旧 Renderer 提供 `AppSettingsV2` 兼容视图；v1/v2/v3 只作为迁移输入并保留备份。下面的结构是设置中心当前的 v4 contract：

```text
SettingsV4
├── general
│   ├── personalization
│   ├── agentInstructions
│   ├── taskDefaults
│   └── shortcuts
├── models
│   ├── connections
│   ├── definitions
│   ├── installed
│   └── taskBindings
├── tools
│   ├── disabledTools
│   ├── bash
│   └── searchProviders
├── media
├── skills
├── subagents
└── activity
    └── usage
```

迁移期间由 Main 进程把 v3 字段映射为 v4 namespace，再通过兼容投影满足尚未迁移的调用方。Renderer 不应直接依赖 v3 的物理字段名。

UI 归属如下：

| 数据字段 | 用户页面 |
| --- | --- |
| `general.personalization.displayName` | 通用 → 身份与指令 |
| `general.personalization.responseStyle` | 通用 → 身份与指令 |
| `general.agentInstructions.systemPromptPath` | 通用 → 身份与指令 |
| `general.taskDefaults.temperature` | 通用 → 任务默认 |
| `general.taskDefaults.maxOutputTokens` | 通用 → 任务默认 |
| `models.taskBindings.*` | 通用 → 任务默认 / 子 Agent |
| `models.connections` | 模型 |
| `models.definitions` | 模型 |
| `models.installed` | 模型 |
| `tools.disabledTools` | 工具 → 工具能力总览 |
| `tools.bash.alwaysAsk` | 工具 → 执行审查 |
| `tools.searchProviders` | 搜索 |
| `media.imageGeneration` | 模型连接数据；默认使用方式位于通用 → 媒体默认 |
| `media.imageInspection` | 模型能力数据；默认使用方式位于通用 → 媒体默认 |
| `skills` | Skills |
| `subagents.routes` | 子 Agent |
| `general.shortcuts` | 通用 → 快捷键 |

### 7.2 模型对象关系

模型关系、稳定标识与连接归属以[模型页面规范](front-模型设置页面-Maka重做规范.md)为准。数据层不能因页面合并而混合 Provider、Connection、Model；引用使用 provider-qualified `ModelKey`，不以裸模型名作为全局身份。

### 7.3 Usage 查询模型

查询字段、分页与筛选以[使用统计规范](front-usage-statistics-refresh.md)及 `packages/shared/src/ipc.ts` 为准。活动投影从 Journal 重建，每次模型请求按 request ID 形成独立行，重试保留关联；工具调用独立计数。此处不重复维护目标伪 DTO。

## 8. 持久化存储设计

### 8.1 采用的总体方案

ActSpace 采用以下混合方案：

```text
Maka：设置中心统一呈现和存储所有权分层
  +
DeepSeek Harness：namespace、schema、revision、局部 patch
  +
ActSpace：main-only 凭据、Session Journal 单一事实源
```

核心判断是：

> UI 可以统一，物理存储不需要统一；设置偏好、凭据、Prompt、Session 事实和 Usage 派生数据必须各自拥有明确的所有权。

### 8.2 数据根目录

数据根目录继续由现有 `resolveActSpaceDataRoot` 决定：

- macOS 默认：`~/Library/Application Support/ActSpace/`。
- 设置 `ACTSPACE_DATA_DIR` 时，以环境变量指定目录为准。
- 其他平台遵循现有 `data-root.ts` 的平台规则。

目标目录结构保持 ActSpace 当前边界：

```text
<dataRoot>/
├── settings.json
├── secrets.json
├── prompts/
│   └── main-agent.md
├── sessions-v2/
│   └── <sessionId>/
│       └── journal.jsonl
├── runtime-v2/
└── tmp/
```

本次设置中心重构不把 `tmp/maka`、`tmp/deepseek-harness` 或仓库源码目录当作运行数据目录。

### 8.3 `settings.json` 的职责

`settings.json` 保存非敏感、可序列化、可版本迁移的应用和 Runtime 配置。P0 将物理写入切换到 `version: 4`，仍保留现有 `version` 字段命名，避免为了模仿参考项目而额外引入 `schemaVersion` 重命名迁移。

namespace 的页面归属见 §7.1；完整字段、默认值与校验只在 `packages/shared/src/settings.ts` 和 SettingsService 中维护，不在本文复制 JSON 示例。

### 8.4 目标设置结构

现行结构为 `SettingsV4`，以 shared contract 为准。`general.taskDefaults.chatCompactionTriggerRatio` 仅影响 Chat 自动压缩判断，范围 0.5～0.95，默认 0.8；手动 compact 不受该阈值限制。

### 8.5 模型数据的正规化

连接、模型定义、已安装模型与任务绑定保持独立身份；具体关系统一见[模型页面规范](front-模型设置页面-Maka重做规范.md)。页面合并不改变数据所有权。

### 8.6 凭据存储

`secrets.json` 继续是 main-only 凭据存储，不迁移到 `settings.json`：

```text
Renderer
  只看到 hasApiKey、credentialId、连接状态

Main / Host
  读取、写入和解析凭据

secrets.json
  独立文件、0600、原子替换
```

约束：

- API Key、Management Key、搜索服务 Key 和图片生成 Key 不进入 renderer snapshot、Journal 或 Usage 日志。
- `settings.json` 只保存 `credentialId`、Key 是否存在和非敏感连接配置。
- 凭据读取失败时阻止覆盖写入，避免空状态覆盖原文件。
- 断开连接清理对应凭据，但不删除模型定义、会话、Journal 或 Usage 历史。

### 8.7 Prompt 存储和身份设置

身份设置和 System Prompt 必须分开：

```text
settings.json
└── general.personalization
    ├── displayName
    └── responseStyle

prompts/main-agent.md
└── Agent System Prompt 正文
```

`displayName` 和 `responseStyle` 由 Prompt Composer 作为低优先级 personalization context 注入；System Prompt 文件仍由 main 进程受控读写。身份偏好不能覆盖系统约束、项目指令、工具权限或安全策略。

### 8.8 外观偏好的例外

Maka 将部分 appearance 配置放在 settings JSON，但 ActSpace 第一阶段继续把主题、字体和字号保存在 renderer `localStorage`，原因是：

- 首屏渲染前需要恢复主题，避免闪烁。
- 这些值只影响当前 Desktop UI，不影响 Agent Runtime、Session 或其他 Host。
- 现有实现和主题检查已经以 renderer 存储为边界。

这不是遗漏，而是有意保留的 Client UI 例外。未来如果支持 workspace-specific appearance，再单独设计归属，不把界面偏好混入 Runtime 模型配置。

### 8.9 Usage 数据与 Usage 页面偏好

必须区分：

```text
activity.usage
  页面偏好：range、status、modelFilter、showDetails、activeTab

sessions-v2/<sessionId>/journal.jsonl
  运行事实：模型调用、工具调用、Token、缓存、成本和状态
```

Usage 页面偏好可以持久化到 `settings.json` 的 `activity.usage` namespace，跨窗口和重启恢复；这些字段不属于 Agent Runtime 行为，也不能被解释为计费事实。

Usage 明细不写入 `settings.json`。当前阶段继续从 Journal 投影统计；如果数据规模需要更快查询，可以增加可删除、可重建的 `runtime-v2/usage-read-model.sqlite`，但它必须是 Journal 的派生读取模型，不能成为第二个恢复事实源。

### 8.10 Namespace patch、revision 和迁移

Settings Authority 采用以下写入规则：

1. Main 进程读取并校验完整设置快照。
2. Renderer 通过 typed IPC 提交 namespace 级 partial patch，不直接写文件。
3. Main 合并 patch，按目标 namespace 校验字段，再执行原子临时文件加 rename。
4. 成功写入后发布 settings changed，返回脱敏后的最新快照。
5. 并发窗口提交旧 revision 时拒绝覆盖，先重新读取并让 Renderer 重放用户草稿。
6. v3 到 v4 迁移必须幂等；迁移前保留 v3 backup，迁移失败恢复原文件。

第一阶段可以继续使用 root revision 和整个 `settings.json` 原子写入；只有出现多窗口冲突或外部编辑需求时，才增加更细的 namespace revision 和热重载。不能为了模仿 DeepSeek 而提前引入一套独立插件配置系统。

### 8.11 存储所有权图

```text
Renderer Settings UI
        │ typed IPC
        ▼
Main Settings Authority
   ├── settings.json       非敏感 namespace 配置
   ├── secrets.json        main-only 凭据
   ├── prompts/*.md        System Prompt 长文本
   └── runtime-v2/         可重建的派生读取模型

Agent Runtime
   ├── 读取 settings namespace
   ├── 解析凭据
   ├── 组装 prompt
   └── 把真实活动写入 Session Journal

Usage UI
   ├── 读取 activity.usage 页面偏好
   └── 从 Journal 或派生 read model 查询统计
```

### 8.12 明确不采用的存储方案

- 不把所有设置、凭据、Prompt 和 Usage 明细塞进一个巨大的 `settings.json`。
- 不把 Usage 统计结果作为不可重建的唯一事实。
- 不让 Renderer 直接读写 `settings.json` 或 `secrets.json`。
- 不把 System Prompt 和身份偏好合并成一个可变字符串。
- 不为支持多个设置页面而立即拆出十几个物理配置文件。
- 不把后端 Cordis 插件的运行配置直接暴露给设置页面，除非该插件已经有稳定的公共配置契约。

## 9. 保存、错误和风险交互

### 9.1 保存策略

| 设置类型 | 默认交互 |
| --- | --- |
| 开关、下拉、步进器 | 立即保存，底部显示“已保存” |
| 时间范围、Tab、状态筛选 | 立即保存为查看偏好 |
| 温度、最大输出 Token、音色 | 失焦或回车保存；不合法时在该行提示，不提交 |
| 显示名称 | 展开编辑，保存 / 取消 |
| 回复风格偏好 | 展开编辑，失焦或防抖保存，失败保留草稿 |
| System Prompt | 显式保存 / 取消 |
| API Key | 编辑态保存，不回显 |
| Endpoint、Headers、Body | 展开编辑，验证后显式保存 |
| 删除连接、删除 Skill、删除归档 | 更多菜单 + 二次确认 |

### 9.2 状态模型

每个有异步行为的页面或分组至少区分：

- 初始加载。
- 已加载。
- 保存中或操作中。
- 保存成功后的稳定状态。
- 加载失败。
- 操作失败但草稿仍在。
- 数据不可用或来源不完整。
- 空数据。
- 筛选无匹配。

不能用“空数组”同时代表“还没加载”和“确实没有数据”。

### 9.3 破坏性操作

- 连接删除必须明确影响范围。
- 删除连接不删除历史数据。
- 清理 Usage 只能作用于明确的 Usage 数据，不得碰 Session Journal、设置或密钥。
- 任何删除失败都保留原列表和原状态，不乐观移除后静默失败。

## 10. 安全和隐私边界

- API Key 和其他凭据只在 main / Host 侧保存和解析。
- Renderer 只接收存在性、状态和脱敏错误，不接收明文。
- 身份偏好会进入未来 Agent prompt context，但不进入密钥、Trace 原文或未经说明的外部同步。
- 页面明确提示身份偏好会影响回复表达，但不会覆盖系统规则和安全策略。
- Usage 不展示完整 Prompt、Chain of Thought、未裁剪的工具输出或凭据。
- 成本数据标记估算性质，不能使用“账单”或“已结算”措辞。
- Provider、Connection、Model、Tool 的日志关联必须使用稳定 ID，不能从展示名称反推身份。

## 11. 视觉、响应式和无障碍约束

### 11.1 视觉

- 继续使用 ActSpace `Ink & Emerald`。
- 设置导航 selected 使用 neutral，不使用蓝色或绿色主色条。
- Toggle 开启、连接成功和运行状态使用 operational green。
- 普通提交使用主题反色的 action token。
- Warning、Danger、Info 和 chart 数据颜色职责分离。
- 不使用 Emoji 作为结构性图标，统一使用 Lucide 或现有线性图标。

### 11.2 响应式

- 大窗口使用侧栏加主内容。
- 窄窗口侧栏变成顶部横向列表。
- 设置行在窄窗口允许右侧控件换行，不让长说明被压扁。
- Usage Tab 在窄窗口局部横向滚动，页面主体不出现横向滚动。
- 表格必须在小窗口提供列裁剪、局部滚动或详情展开，不整体撑破页面。

### 11.3 无障碍

- 所有交互控件保持清晰 focus ring。
- 图标按钮必须有 `aria-label` 和必要 Tooltip。
- 状态不能只靠颜色表达，必须同时有文字或图标。
- 列表、子页和 Tab 有正确的 landmark、标题和返回语义。
- 异步错误靠近相关控件表达，并提供 retry、编辑或清除路径。
- 动画不改变布局尺寸，遵守 `prefers-reduced-motion`。

## 12. 实现边界与阶段

实施阶段与原验收边界统一见[设置中心执行计划](../../exec-plans/completed/20260830-actspace-settings-center-refactor/README.md)；后续视觉调整见[视觉重设计记录](../../exec-plans/completed/20260925-settings-visual-redesign.md)。本文不再维护另一份阶段清单。

使用统计现行行为见[使用统计规范](front-usage-statistics-refresh.md)。历史计划完成不代表本轮重新验证了真实 Provider、真实凭据或所有窗口尺寸。

## 13. 验收标准

### 产品验收

- 设置导航只有四组，顶层不存在“服务商”和“智能体”。
- 用户从模型页面可以在一个连续流程中完成服务商连接、模型发现、启用和默认模型选择。
- 用户可以在通用中设置显示名称和回复风格，并能看到它们会影响 Agent 表达但不覆盖系统约束。
- System Prompt、任务默认、工具审查和 Explore 路由分别出现在规定页面。
- Usage 首屏没有热力图、2D、3D 和 Share。
- Usage 可以从汇总进入 Provider、Model、Tool、Pricing 和请求明细。

### 数据与安全验收

- 删除或断开连接不删除模型、会话、Journal 和历史 Usage。
- Provider-qualified ModelKey 在模型选择、Usage 聚合和子 Agent 路由中保持稳定。
- 凭据不会进入 Renderer 或 Journal。
- 未知成本显示为 unavailable 或明确估算状态，不显示虚假零成本。
- Usage 的加载失败、日志截断和无数据状态可以被用户区分。

### 前端验收

- 浅色、深色、跟随系统三态通过主题检查。
- Settings Shell、模型列表、连接详情、Usage 表格在窄窗口不出现整体横向溢出。
- 键盘可以完成导航、行展开、保存、取消、返回和 Tab 切换。
- 设置说明、长路径、模型 ID 和错误信息可读且不依赖悬停。
- 所有图标按钮有可访问名称，所有异步动作有可感知反馈。

### 需要明确保留的未验收项

自动化测试不能代替真实 Electron 窗口、真实 Provider、真实凭据、浅深主题人工检查和最终截图验收。实现阶段必须按 [`docs/FRONTEND_VERIFICATION.md`](../../FRONTEND_VERIFICATION.md) 记录实际执行过的验证层级。

## 14. 相关文档和源码

### ActSpace 当前实现

- [`SettingsPage.tsx`](../../../apps/desktop/src/renderer/components/settings/SettingsPage.tsx)
- [`use-settings.ts`](../../../apps/desktop/src/renderer/components/settings/use-settings.ts)（设置的加载与保存）
- [`sections/`](../../../apps/desktop/src/renderer/components/settings/sections/)（通用、外观、工具、子 Agent、归档会话、更新等各分区）
- [`SettingsNav.tsx`](../../../apps/desktop/src/renderer/components/settings/SettingsNav.tsx)
- [`SettingsPrimitives.tsx`](../../../apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx)
- [`ProviderSettings.tsx`](../../../apps/desktop/src/renderer/components/settings/ProviderSettings.tsx)
- [`ModelSettings.tsx`](../../../apps/desktop/src/renderer/components/settings/ModelSettings.tsx)
- [`UsageStatisticsPage.tsx`](../../../apps/desktop/src/renderer/components/UsageStatisticsPage.tsx)
- [`packages/shared/src/settings.ts`](../../../packages/shared/src/settings.ts)
- [`packages/shared/src/ipc.ts`](../../../packages/shared/src/ipc.ts)
- [`durable-session.ts`](../../../packages/runtime/src/projection/durable-session.ts) 与 [`usage-aggregates.ts`](../../../packages/client/src/sessions/usage-aggregates.ts)

### Maka 参考实现

以下快照不随 Git 仓库分发，路径仅用于追溯本机研究证据；新检出无需具备这些文件。

- settings-nav.ts（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/settings-nav.ts`）
- settings-surface.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/settings-surface.tsx`）
- settings-section.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/settings-section.tsx`）
- settings-expandable-row.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/settings-expandable-row.tsx`）
- providers-panel.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/providers-panel.tsx`）
- provider-connection-detail.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/provider-connection-detail.tsx`）
- personalization-settings-section.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/personalization-settings-section.tsx`）
- usage-settings-page.tsx（历史快照路径：`tmp/maka/apps/desktop/src/renderer/settings/usage-settings-page.tsx`）

### 外部参考资料

本规范还参考了本机资料目录中的以下文件：

```text
/Users/wakeup-jin/Downloads/curated-design-docs/maka-settings-design-study.zh-CN.md
/Users/wakeup-jin/Downloads/curated-design-docs/maka-settings-functional-design-map.zh-CN.md
/Users/wakeup-jin/Downloads/curated-design-docs/models-settings-functional-design-analysis.zh-CN.md
/Users/wakeup-jin/Downloads/curated-design-docs/usage-settings-functional-design-analysis.zh-CN.md
```

这些参考资料不属于 ActSpace 的运行指令，不能替代仓库 `AGENTS.md`、`docs/` 和当前实现事实。

## 英语辅助学习语音配置（2026-09-07 已实施）

「通用 → 语音播放」管理 MiniMax 中国站语音配置：固定 MiniMax 服务、8 个语音模型版本下拉选择、音色、语速、API Key 保存/清除、试听和停止。普通配置写入 `media.speech`，Key 进入 main-only secret store，不在配置读回中回显。保存失败保留输入；试听使用已保存配置。

学习模式开关与会话选择位于「扩展 → 能力 → 英语辅助学习」，不放在全局语音配置中。首次选择最新可用主会话，后续优先最近选择；enabled 不持久保存。没有 Key 时仍可启用选定会话的中英对照，停止播放只取消音频。卡片的「语音配置」导航在设置内容加载后滚动到对应分组。详见[插件设计](../agent-plugin-runtime/agent-english-learning.md)。


## 使用统计查询读模型（实施中）

使用统计沿用 typed Usage IPC，内部接入 SQLite Worker 和按需 Session 增量读取。数据来自受控 Session fallback 时，页面独立显示提示；索引/重建失败且超出 fallback 预算时显示读取错误，不能显示成空结果。进度、取消和大数据流畅度尚待完整验收，见[SQLite 设计与状态](../筛选存储改版V2-增加SQLite/README.md)。
