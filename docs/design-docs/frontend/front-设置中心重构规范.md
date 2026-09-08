# 设置中心重构规范

> 2026-09-09 文案更新：日常界面展示名称以[中文文案规范](front-desktop-chinese-ui.md)为准；保留 Chat、Plan、Thinking、Effort 和工具执行展示。本文英文名称仍可用于指代内部概念，协议与行为不变。

## 文档状态

- **状态**：已确认设计；P0–P5 已实现，P6 真实宿主与人工验收待完成。
- **适用范围**：ActSpace Desktop 设置中心、Usage 活动页面，以及与设置页面直接相关的 shared IPC 适配。
- **当前事实来源**：本文是设置中心重构后的产品与交互规范。实现细节、执行顺序和具体改动文件进入 `docs/exec-plans/` 后再冻结。
- **模型页面子规范**：模型页面的视觉和路由细节以 [`front-模型设置页面-Maka重做规范.md`](front-模型设置页面-Maka重做规范.md) 为准。
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

- 不引入 ActSpace 当前没有的 Runtime Host 选择器。
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
│   ├── 模型
│   ├── 子 Agent
│   └── 工具
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
| 模型 | 我连接了哪些模型服务，哪些模型可以被使用？ |
| 子 Agent | 主 Agent 可以路由给哪些专门代理？ |
| 工具 | Agent 可以做什么，以及执行时需要什么审查？ |
| Usage | 已经发生了多少模型、工具和成本活动？ |
| 归档会话 | 已归档的会话如何查找和恢复？ |
| 更新 | 如何检查并执行本地应用更新？ |

快捷键、联网搜索、图片生成和图片分析不再占用顶层导航，因为它们是相邻页面中的一个功能分组，而不是独立的用户任务。

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
- 不使用“白卡、边框、大圆角、阴影”作为每组默认配方。
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
├── 任务默认
│   ├── 默认聊天模型
│   ├── 轻量任务模型
│   ├── Explore 模型快捷入口
│   ├── 温度
│   └── 最大输出 Token
├── 媒体默认
│   ├── 图片生成连接
│   └── 图片分析模型
└── 快捷键
    └── 快速打开
```

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

模型页面是 Provider、Connection、Model 的统一用户入口。

#### 对象边界

```text
Provider
  = 服务商类型和默认协议能力

Connection
  = 一个具体的凭据、Endpoint、代理和连接状态

Model
  = 属于某个 Provider 或 Connection 的模型定义

Task Model Binding
  = 某种任务默认使用哪个 ModelKey
```

UI 合并这些对象的配置路径，数据层不合并对象。

#### 页面路由

```text
模型列表
  ├── 添加连接
  │     └── 服务商目录
  │           └── 连接配置
  │                 └── 连接详情
  └── 已有连接详情
```

模型列表每一行展示：

- Provider 标识和名称。
- Connection 名称。
- 当前默认模型。
- 连接状态。
- 已启用模型数量。
- 默认连接动作或默认标记。
- 进入详情的箭头。

#### 服务商目录

- 搜索优先。
- 按官方 API、第三方兼容、本地或聚合等类别筛选。
- 选择 Provider 后进入完整配置页。
- 返回目录时保留搜索和类别筛选。
- 不用一个狭窄 Dialog 承载大量 Provider 和多步配置。

#### 连接详情

```text
连接
├── 连接名称
├── API Key / OAuth 状态
├── Endpoint
├── 连接测试
└── 当前连接状态

高级请求设置
├── Provider 代理
├── Request Headers
└── Request Body Overlay

模型管理
├── 远程模型刷新
├── 已启用模型
├── 手动添加模型
└── 默认模型

模型能力
├── Thinking
├── Vision
├── Context Window
└── Fast Mode

危险区
└── 删除连接
```

关键规则：

- API Key 只显示“已配置”状态，不回显明文。
- Endpoint 只有确实属于用户可编辑范围时才显示编辑控件。
- 连接测试显示测试中的 loading、成功或具体失败原因。
- 删除连接不删除模型定义、会话历史、Journal 和 Usage。
- 失效连接和失效模型保留原引用，并显示原因。
- Provider-qualified `ModelKey` 是模型身份的最小单位，不能只按裸模型名称聚合。

#### 媒体模型

图片生成和图片分析的连接与能力定义属于模型数据层；用户选择默认使用方式时进入“通用 → 媒体默认”：

- 使用与文本模型相同的连接、凭据安全和状态语法。
- 图片生成连接可以拥有自己的 Endpoint 和模型名。
- `inspect_image` 的视觉模型从可用 Provider 凭据中选择，不把文本模型伪装成原生多模态模型。

#### 页面职责和标题层级

模型页面只负责连接、模型目录、启用状态和模型能力。任务默认模型、图片生成模型和图片分析模型属于“应用默认行为”，统一放入“通用”页面：

```text
h2 通用
├── h3 个人偏好
├── h3 Agent 指令
├── h3 任务默认
│   ├── h4 默认会话模型
│   ├── h4 轻量任务模型
│   ├── h4 Explore 模型
│   ├── h4 温度
│   └── h4 最大输出 Token
├── h3 媒体默认
│   ├── h4 图片生成模型
│   └── h4 图片分析模型
└── h3 快捷键
```

模型页面的唯一页面标题为 `h2 模型`，连接列表、模型目录和模型能力为 `h3`。连接详情仍属于模型页面，不创建第二个页面级 `h2`。
- 媒体能力的成本和数据传输边界必须在说明文字中明确。

### 6.4 子 Agent

取消独立的“智能体”页面，不取消子 Agent 能力。

第一版页面只展示真实存在的 Explore 路由：

```text
子 Agent
└── Explore
    ├── 用途说明
    ├── 能力边界
    ├── 模型连接
    ├── 模型
    ├── 思考级别
    └── 是否启用
```

Explore 是只读代码探索能力，不等同于主 Agent，也不负责完整实现。

规则：

- Connection → Model → Thinking level 级联选择。
- 上层选择变化时，重新计算下层可用选项。
- 引用失效时保留失效值并显示原因，不静默切换。
- 停用保留配置，删除才移除 preset。
- 删除 preset 不删除已产生的历史子任务或会话。
- 未来新增其他子 Agent 时复用同一 preset 结构，不再创建新的“智能体总设置页”。

### 6.5 工具

工具页面按用户可理解的能力边界分组；执行风险只在终端和浏览器高级设置中出现：

```text
工具
├── 代码库
├── 终端
├── 联网
│   ├── 联网搜索工具开关
│   └── Zhipu / Tavily / TinyFish / Exa 搜索通道
├── 浏览器
└── 多媒体
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

#### 联网能力

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

Usage 是活动分析页面，不是账单系统。它回答：

```text
用了多少
  → 哪个 Provider / Model / Tool 消耗最多
    → 哪一次请求有问题
      → 回到原始会话查看上下文
```

#### 页面结构

页面沿用 PageShell 默认 760px / 22px 标题、单层指标、下划线分类和详情开关；价格视图为当前本地目录，普通刷新不触发网络。费用按 USD / CNY 分别汇总，未知不显示为免费。

```text
使用统计
├── 时间范围与刷新
├── 汇总指标
│   ├── 模型调用
│   ├── 总成本
│   ├── 总 Token
│   └── 缓存 Token
└── 统计 Tab
    ├── 请求
    ├── 服务商
    ├── 模型
    ├── 工具
    └── 定价
```

时间范围采用：

- `24h`：滚动 24 小时。
- `7d`：最近 7 天。
- `30d`：最近 30 天。
- `all`：全部可用历史。

旧的 `day / week / month / total` 只作为迁移期间的兼容输入，不作为新 UI 文案。

#### 汇总指标

默认只回答整体情况，不在首屏堆叠多个图表：

- 模型调用次数。
- 总成本。
- 总 Token，并可附输入 / 输出拆分。
- 缓存 Token，并可附命中、创建和未命中拆分。

刷新是低频工具动作，使用安静的图标按钮，不改变当前时间范围、Tab 或筛选条件。

#### 请求 Tab

默认状态先显示汇总说明，用户主动打开明细后才加载或展示详细请求表：

| 列 | 含义 |
| --- | --- |
| 时间 | 活动发生时间 |
| 类型 | 模型请求或工具调用 |
| 对象 | Model 或 Tool 名称 |
| 任务 | 所属 Session 的短标识 |
| Token | 输入、输出和缓存的合计或拆分 |
| 成本 | 估算值和成本依据 |
| 延迟 | 可用时展示 |
| 状态 | 成功、错误、中止或未知 |

筛选支持：

- Provider。
- Connection。
- Model。
- Tool。
- 状态。
- 文本搜索。
- 清除筛选。

筛选后无结果和当前范围完全无数据是两个不同的空状态。点击任务标识回到原始 Session，形成统计到问题源头的闭环。

#### Provider、Model、Tool 和 Pricing Tab

| Tab | 主要字段 | 回答的问题 |
| --- | --- | --- |
| 服务商 | Provider、请求、Token、成本 | 哪个服务商使用最多 |
| 模型 | Provider、Model、请求、Token、成本 | 哪个模型最常用或最贵 |
| 工具 | Tool、调用、成功、错误、平均耗时 | 哪个工具最慢或失败最多 |
| 定价 | Provider、Model、输入单价、输出单价 | 成本估算依据是什么 |

#### 成本可信度

成本必须能表达来源：

```text
costUsd
costBasis: priced | estimated | unavailable
```

界面不能把未知价格渲染为 `$0.00`。当存在日志但无法估算成本时，显示“无法估算”，并解释缺少的定价信息。

#### 热力图和旧控件

第一版不展示：

- 热力图。
- 2D 切换。
- 3D 切换。
- Share。
- 没有真实数据的详情弹窗。

daily 数据可以继续保留在投影中，未来如果明确需要趋势分析，再作为独立的“趋势”视图加入。不要为保留旧视觉而保留无行为控件。

#### 当前数据能力的诚实边界

Usage 现在优先消费从 Session Journal 冷启动重建的事件级活动投影：每个 `request/header` 形成一个稳定的 LLM request row，每个 `tool/call` 形成一个 Tool invocation row。`assistant/message` 是请求终态的首选事实，`step/end` 只作为缺少 assistant terminal 时的兼容回退，因此不会因为同一请求同时出现两类事件而重复计数。

旧 `UsageStatisticsSnapshot` 仅为兼容消费者保留，新页面不再静默回退；默认显示时间、模型、Token、费用、状态，详情提供耗时、缓存分解和费用来源。缺少 provider usage 或价格依据时显示 unknown / unavailable，不把未知成本渲染为 `$0.00`。重试生成的新 request ID 保持独立，并通过 `retryOfRequestId` 建立链路。

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
| `tools.searchProviders` | 工具 → 联网能力 |
| `media.imageGeneration` | 模型连接数据；默认使用方式位于通用 → 媒体默认 |
| `media.imageInspection` | 模型能力数据；默认使用方式位于通用 → 媒体默认 |
| `skills` | Skills |
| `subagents.routes` | 子 Agent |
| `general.shortcuts` | 通用 → 快捷键 |

### 7.2 模型对象关系

```text
Provider Registry
      ↓
Model Connection
      ↓
Model Definition / Installed Model
      ↓
ModelKey
      ↓
Task Model Binding / Subagent Preset
```

连接和模型页面可以合并用户流程，但所有引用必须使用 provider-qualified `ModelKey` 或等价稳定身份，不能使用裸模型名称作为唯一键。

### 7.3 Usage 查询模型

目标查询维度：

```text
UsageQuery
├── range
├── sessionId?
├── providerId?
├── connectionId?
├── modelId?
├── toolName?
└── status?
```

目标活动记录（当前实现使用同语义的 `UsageActivityRow`）：

```text
UsageLogRow
├── id
├── timestamp
├── kind: model | tool
├── providerId?
├── connectionId?
├── modelId?
├── toolName?
├── inputTokens?
├── outputTokens?
├── cacheTokens?
├── reasoningTokens?
├── costUsd?
├── costBasis
├── latencyMs?
├── status
├── sessionId?
├── turnId?
└── diagnostics?
```

这不是要求一次性重写 Journal，而是规定新 Usage UI 需要的目标契约。当前由 fixed-renderer projection 从既有 Journal 事件生成 `UsageActivitySnapshot`；该快照带有每个 Session 的 `throughJournalSeq` 水位，可在删除派生缓存后重新构建。每个 retry request 保持独立 activity row，`assistant/message` 优先于 `step/end`，Tool terminal 事件形成独立调用行。旧运行聚合投影仅服务旧消费者，不作为当前页面失败后的回退事实源。

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

目标逻辑 namespace：

```text
settings.json
├── version: 4
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

这里的 namespace 是同一个 JSON 文件内的逻辑所有权边界，不表示现在就要拆成多个物理文件。这样可以先获得 Maka 和 DeepSeek 的结构收益，同时保留 ActSpace 当前的原子写入和简单迁移机制。

### 8.4 目标设置结构

以下是目标语义结构，字段名称以实现阶段的 shared contract 最终冻结为准：

```json
{
  "version": 4,
  "general": {
    "personalization": {
      "displayName": "",
      "responseStyle": ""
    },
    "agentInstructions": {
      "systemPromptPath": "prompts/main-agent.md"
    },
    "taskDefaults": {
      "temperature": null,
      "maxOutputTokens": null
    },
    "shortcuts": {
      "quickOpen": {}
    }
  },
  "models": {
    "connections": {},
    "definitions": {},
    "installed": {},
    "taskBindings": {
      "defaultChat": null,
      "utility": null,
      "explore": null
    }
  },
  "tools": {
    "disabledTools": [],
    "bash": {
      "alwaysAsk": false
    },
    "searchProviders": {}
  },
  "skills": {
    "disabled": []
  },
  "subagents": {
    "routes": {}
  },
  "media": {
    "imageGeneration": {},
    "imageInspection": {}
  },
  "activity": {
    "usage": {
      "range": "30d",
      "status": "all",
      "modelFilter": "",
      "showDetails": false,
      "activeTab": "requests"
    }
  }
}
```

这段结构表达的是所有权和迁移目标，不要求第一阶段一次性迁移所有字段。`permissionMode`、`thinkingLevel` 等尚未有稳定运行时语义的字段不进入 v4 正式结构；等对应能力真正接入后再扩展 namespace。实现时必须提供 v3 到 v4 的幂等迁移，并继续兼容旧 Renderer 需要的投影视图。

### 8.5 模型数据的正规化

UI 合并 Provider、Connection、Model，不代表存储把它们混成一张表。目标关系为：

```text
Provider Registry
      ↓ providerId
Model Connection
      ↓ connectionId
Model Definition / Installed Model
      ↓ modelKey
Task Model Binding / Subagent Preset
```

目标数据规则：

- `connections` 以稳定 `connectionId` 为键；Provider 类型只是连接的一个属性。
- `definitions` 保存模型定义和能力元数据。
- `installed` 保存启用状态、自定义名称和凭据引用。
- `taskBindings` 只保存 `modelKey` 或等价的稳定模型引用。
- 连接、模型和任务绑定之间不通过展示名称关联。
- 当前每个 Provider 只有一组连接时，由迁移层生成稳定的默认连接记录；未来多连接不需要再次改变 UI 模型。

采用对象映射而不是无身份数组，是为了支持局部 namespace patch、稳定引用和并发冲突检查。列表排序属于 Renderer 派生视图，不属于存储身份。

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

### 8.1 保存策略

| 设置类型 | 默认交互 |
| --- | --- |
| 开关 | 立即保存 |
| 时间范围、Tab、状态筛选 | 立即保存为查看偏好 |
| 短值选择器 | 立即保存 |
| 显示名称 | 展开编辑，保存 / 取消 |
| 回复风格偏好 | 展开编辑，失焦或防抖保存，失败保留草稿 |
| System Prompt | 显式保存 / 取消 |
| API Key | 编辑态保存，不回显 |
| Endpoint、Headers、Body | 展开编辑，验证后显式保存 |
| 删除连接、删除 Skill、删除归档 | 更多菜单 + 二次确认 |

### 8.2 状态模型

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

### 8.3 破坏性操作

- 连接删除必须明确影响范围。
- 删除连接不删除历史数据。
- 删除子 Agent preset 不删除历史子任务。
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

### 10.1 视觉

- 继续使用 ActSpace `Ink & Emerald`。
- 设置导航 selected 使用 neutral，不使用蓝色或绿色主色条。
- Toggle 开启、连接成功和运行状态使用 operational green。
- 普通提交使用主题反色的 action token。
- Warning、Danger、Info 和 chart 数据颜色职责分离。
- 不使用 Emoji 作为结构性图标，统一使用 Lucide 或现有线性图标。

### 10.2 响应式

- 大窗口使用侧栏加主内容。
- 窄窗口侧栏变成顶部横向列表。
- 设置行在窄窗口允许右侧控件换行，不让长说明被压扁。
- Usage Tab 在窄窗口局部横向滚动，页面主体不出现横向滚动。
- 表格必须在小窗口提供列裁剪、局部滚动或详情展开，不整体撑破页面。

### 10.3 无障碍

- 所有交互控件保持清晰 focus ring。
- 图标按钮必须有 `aria-label` 和必要 Tooltip。
- 状态不能只靠颜色表达，必须同时有文字或图标。
- 列表、子页和 Tab 有正确的 landmark、标题和返回语义。
- 异步错误靠近相关控件表达，并提供 retry、编辑或清除路径。
- 动画不改变布局尺寸，遵守 `prefers-reduced-motion`。

## 12. 实现边界与阶段

本规范不是执行计划。实现时应另写 execution plan，并按以下可独立交付阶段拆分：

### Phase 1：设置壳层和导航

- 分组导航。
- 新的开放式 Settings Section / Row 语法。
- 页面标题、说明、加载和错误态统一。
- 不改变现有设置数据。

### Phase 2：模型页面统一

- 删除顶层“服务商”入口。
- 将 Provider 和 Model 路由收敛到一个模型页面。
- 增加目录、配置、详情和返回状态。
- 保留现有凭据安全和模型数据。

### Phase 3：功能分散与身份设置

- 取消顶层“智能体”。
- System Prompt 迁移到通用 → 身份与指令。
- 温度和最大输出 Token 迁移到通用 → 任务默认。
- 工具开关和 Bash 审查迁移到工具。
- Explore 路由迁移到子 Agent。
- 增加 `personalization.displayName` 和 `personalization.responseStyle`。

### Phase 4：Maka 式 Usage

- Usage 迁移到活动分组。
- 四个汇总指标和五个统计 Tab。
- 筛选、明细开关、空状态、成本来源和回到 Session。
- 删除无行为控件。
- 第一阶段使用兼容投影，不伪造事件级粒度。

### Phase 5：事件级活动投影（已完成）

- 增加真实 LLM Call 和 Tool Invocation 记录。
- 补齐 request ID、延迟、状态、成本依据和诊断信息。
- 将运行级汇总升级为可分页的活动日志。

当前实现通过 `usage-activity:get` typed IPC 返回事件级快照；当 Journal 缺少 provider usage、currency 或可验证价格来源时，活动行保留 `unknown` / `unavailable`，不生成虚假零成本。旧 `getUsageStatistics` IPC 仍是显式兼容边界，待后续确认外部消费者清零后再删除。

每个阶段完成后，应用仍然可以正常使用，不能要求后续阶段完成后才具备可用页面。实现期间必须保留现有 Journal 数据。

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
- [`SettingsNav.tsx`](../../../apps/desktop/src/renderer/components/settings/SettingsNav.tsx)
- [`SettingsPrimitives.tsx`](../../../apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx)
- [`ProviderSettings.tsx`](../../../apps/desktop/src/renderer/components/settings/ProviderSettings.tsx)
- [`ModelSettings.tsx`](../../../apps/desktop/src/renderer/components/settings/ModelSettings.tsx)
- [`UsageStatisticsPage.tsx`](../../../apps/desktop/src/renderer/components/UsageStatisticsPage.tsx)
- [`packages/shared/src/settings.ts`](../../../packages/shared/src/settings.ts)
- [`packages/shared/src/ipc.ts`](../../../packages/shared/src/ipc.ts)
- [`fixed-renderer-projection.ts`](../../../apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts)

### Maka 参考实现

- [`settings-nav.ts`](../../../tmp/maka/apps/desktop/src/renderer/settings/settings-nav.ts)
- [`settings-surface.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/settings-surface.tsx)
- [`settings-section.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/settings-section.tsx)
- [`settings-expandable-row.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/settings-expandable-row.tsx)
- [`providers-panel.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/providers-panel.tsx)
- [`provider-connection-detail.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/provider-connection-detail.tsx)
- [`personalization-settings-section.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/personalization-settings-section.tsx)
- [`usage-settings-page.tsx`](../../../tmp/maka/apps/desktop/src/renderer/settings/usage-settings-page.tsx)

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
