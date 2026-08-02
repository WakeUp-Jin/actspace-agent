# Agent 分析观测页面规范

## 文档状态

- 状态：已实现，待 Electron 人工验收
- 页面名称：分析观测 / Analysis
- 数据事实来源：[`../agent-runtime/agent-observability-trace-model.md`](../agent-runtime/agent-observability-trace-model.md)
- 交互原型：[`front-agent-analysis-observability-prototype.html`](front-agent-analysis-observability-prototype.html)
- 执行计划：[`../../exec-plans/completed/20260801-analysis-session-index.md`](../../exec-plans/completed/20260801-analysis-session-index.md)

## 定位

分析观测是面向 ActSpace 开发者的本地会话诊断工作区。它先提供全部未归档 Session 的轻量索引，再把选中 Session 中已经发生的 Agent Run、内部 Turn 与真实 LLM Call 按执行层级还原出来，用于回答：

- 一次用户输入触发了多少个内部 Turn？
- 每个 Turn 发起了哪些真实模型请求，是否发生重试？
- 某次请求实际携带了哪些 system prompt、工具定义和消息？
- 模型返回了思考、正文还是工具调用？
- 相邻两次请求之间新增或移除了哪些上下文？
- token、缓存和耗时主要消耗在哪里？

分析观测不运行新的 Agent，也不修改会话事实。它只读取本地 Session 与 Trace，并将已有证据转成适合人工分析的界面。

## 与 Agent 评估的边界

| 能力 | 分析观测 | Agent 评估 |
| --- | --- | --- |
| 数据来源 | 用户真实会话与本地 Trace | 预先定义的数据集、用例与环境 |
| 主要动作 | 查看、筛选、对比、诊断 | 运行、评分、回归、比较版本 |
| 主要对象 | 单个 Session / Agent Run / LLM Call | Dataset / Case / Eval Run |
| 主要结果 | 找出上下文、工具、模型调用和成本问题 | 判断能力是否达到目标并防止回归 |
| 是否产生新模型调用 | 否 | 是 |

两者可以在未来形成单向连接：分析观测中发现的真实问题可以被保存为 Eval Candidate，但分析页面本身不承担数据集执行、通过率或评分职责。

## 概念层级

页面必须忠实使用后端层级，不得再把 `agentRunId`、`turnId` 和 `llmCallId` 混为一层：

```text
Session
└─ 用户输入 / Agent Run
   ├─ Turn 1
   │  ├─ LLM Call 1
   │  └─ LLM Call 2（同一 Turn 内重试）
   └─ Turn 2
      └─ LLM Call 1
```

- 一次普通用户输入当前对应一个 Agent Run。
- 一个 Agent Run 可以包含多个 Turn。
- 一个 Turn 通常只有一次 LLM Call；自动重试时可以有多次。
- 工具调用由某次 LLM Call 的响应产生，工具结果进入后续 LLM Call 的消息上下文。
- `agentRunId`、`turnId`、`llmCallId` 是关联键，不作为默认视觉主标题。

## 入口与页面切换

### 设置页入口

- 在设置导航中新增直接操作项「分析观测」，位置在「归档会话」之后、「更新」之前。
- 点击后直接把 `WorkbenchLayout.view` 切换为独立 `analysis` 视图，不增加中间说明页。
- 入口先打开会话索引首页；当前活动 Session 只标记为「当前」，不自动钻取。
- 首页列出全部未归档 Session，包括暂无 Trace 的会话；用户显式选择后才加载该 Session 的分析详情。
- Session 索引与详情是两个页面状态，不在详情页常驻为第三栏。详情仍只保留 Agent Run / Turn 导航与 LLM Call 内容两栏。

### 独立工作区

- 分析观测打开后，设置导航和聊天侧栏都不保留。
- 会话首页不设置独立页面标题栏；纯箭头返回按钮与「会话记录」位于同一内容标题行，返回后恢复进入分析观测前的设置分区。
- 会话详情左上角提供无边框「返回会话列表」，回到索引首页并保留页面级加载边界。
- 页面占据完整工作区；索引首页为单列表，详情页为两栏。
- 切换页面不会启动、停止或重放 Agent Run。

## 页面总布局

```text
会话索引首页
┌──────────────────────────────────────────────────────────────────┐
│ ←  会话记录  4 个会话                                        │
│ Session 4 / Run 9 / Turn 49 / LLM Call 49 / Token 832,193      │
│ [搜索会话或工作区                    ] [状态] [模型]              │
│ 会话与工作区              Run / Turn  Token    模型  状态       │
│ · Inspect runtime            1 / 2     28,817   DS    当前    > │
│   runtime · 07-29 18:05                                      │
└──────────────────────────────────────────────────────────────────┘

单会话详情
┌──────────────────────────────────────────────────────────────────┐
│ ←  分析观测    Run / Turn / LLM Call / Token / 耗时          本地 │
├──────────────────────┬───────────────────────────────────────────┤
│ 搜索  [工具筛选]     │ Turn 2   模型名称              对比上次   │
│                      │ LLM Call 切换 / 用量 / 耗时 / Attempt     │
│ 用户输入 1 ▼         │                                           │
│   Turn 1             │ 响应（默认展开）                          │
│   Turn 2 · 2 Calls   │ 请求上下文                                │
│   Turn 3             │   消息 / 系统提示词 / 工具定义            │
│                      │ 开发者数据：JSON / cURL / Trace           │
│ 用户输入 2 ▼         │                                           │
│   Turn 1             │                                           │
└──────────────────────┴───────────────────────────────────────────┘
```

### 会话索引首页

- 首页通过单次 main IPC 返回聚合后的轻量列表，Renderer 不逐条读取完整 Trace。
- 首页内容使用约 `1180px` 的居中阅读宽度，不把少量会话横向铺满整个窗口。
- 每行至少展示最近活动时间、会话标题、工作区、Agent Run 数、Turn 数、API Token、模型和文字状态。
- 状态包括「记录中」「已完成」「失败」「暂无记录」「不可读取」；单条损坏只降级该行。
- 搜索覆盖会话标题、工作区和模型；状态与模型筛选使用结构化字段，不解析展示文本。
- 搜索、状态和模型筛选收进列表顶部工具栏，形成一个连续的浏览工具，不在页面上漂浮成独立表单区。
- 一级汇总只保留 Session、Agent Run、Turn、LLM Call 与 API Token；Cache 与耗时进入单会话详情，不和入口主指标争夺层级。
- 列表把工作区与最近活动时间合并为标题次级信息，把 Run / Turn 合并为一列，减少横向扫描距离。
- 列表默认沿 Session 元数据的最近更新时间排序。当前会话只使用 operational 小圆点和「当前」文字，不使用整行染色。

### 顶部栏

详情顶部栏用于表达当前 Session 的总体规模，不重复显示当前用户输入正文。为保持与会话首页一致的层级，顶部只展示：

- Agent Run 数
- Turn 数
- LLM Call 数
- API Token 总量
- 累计 LLM 耗时

规则：

- 首页与详情均复用设置导航的无边框返回语法，不使用独立描边方形图标按钮。
- 首页不保留独立页面标题栏；返回动作以纯箭头并入「会话记录」标题行，不重复显示「返回」「分析观测」或「本地记录」文字。
- 详情保留独立顶部汇总栏，标题区只显示纯箭头返回动作和「分析观测」，不显示「返回会话列表」文字，也不重复显示设置路径或当前 Session 标题；返回按钮必须保留无障碍名称和 Tooltip。
- `Cache Hit Rate = Cache Read Token / Input Token`；provider 未报告缓存数据时显示 `—`，不能显示伪造的 `0%`。
- 累计耗时使用每次 LLM Call 的 `durationMs` 求和，不把用户等待和工具执行误计入模型耗时。
- 汇总项在空间不足时横向滚动或收敛标签，不允许挤压页面标题和返回按钮。
- Input、Output、Cache Read、Cache Hit Rate 下沉到当前 LLM Call 元数据，不在 Session 顶部重复展示。
- 详情中的「本地」只表示数据来自本机，不代表正在监听网络代理；完整说明通过 Tooltip 提供。

## 左栏：导航与筛选

### 搜索

首版导航索引的搜索范围包括：

- 用户输入摘要
- 模型名称
- 工具名称
- Turn 序号

完整请求消息只在选中 Agent Run 后懒加载，不复制到 summary sidecar，因此首版不做跨 Run 的全文消息搜索。不要求用户搜索底层 ID。搜索与 Tools 筛选使用 AND 关系。

### Tools 筛选

- 只展示模型响应中实际产生过 `toolCall` 的工具名称；请求中仅声明、但从未调用的工具不进入筛选索引。
- 首项为 `All`。
- 首版采用单选筛选；点击工具后，只显示包含该工具的 Turn。
- 工具筛选默认收进搜索框旁的筛选按钮，避免长期占用 Run / Turn 导航高度；激活筛选时按钮必须显示状态标记。
- 工具项随当前搜索结果动态收敛，没有匹配 Turn 或调用数为 0 的工具不显示；当前工具随搜索失效时自动回到 `All`。
- 工具名按首次出现顺序排列，展开筛选面板后允许换行。
- 筛选的是 Turn，不是单个 Tool Call；右侧仍展示完整 LLM Call 上下文。

### 用户输入分组

- 每个用户输入对应一个 Agent Run 分组。
- 分组标题显示用户输入摘要和 Turn 数。
- 默认展开当前选中 Turn 所属分组，其余分组可以收起。
- 收起只影响导航，不清除右侧已选内容。
- 用户输入很长时单行截断；完整内容可通过 Tooltip 或无障碍名称读取，不在右侧标题重复展示。

### Turn 行

Turn 行至少展示：

- `Turn N`
- 模型名称
- LLM Call 数；只有大于 1 时显示
- API Token 总量
- LLM 累计耗时
- 开始时间
- 请求协议或 endpoint 摘要
- 失败、重试中、已完成等文字状态

选中态属于分析数据选择，可以使用低饱和浅蓝信息底色；它不是全局导航或主操作强调色。

## 右栏：当前 Turn 详情

### Turn 标题区

- 主标题只显示 `Turn N`。
- 模型徽标显示真实模型名称；provider 名称仅在有辨识价值时作为次级信息。
- 不显示用户输入摘要。
- 不默认显示 `turnId` 或 `llmCallId`；开发者需要时可在完整 JSON 中查看。
- 标题区右侧只保留高频诊断动作「对比上次」；「请求 JSON」与「cURL」进入底部「原始数据」折叠区。

### LLM Call 切换

- 一个 Turn 只有一次 LLM Call 时隐藏切换器。
- 多次调用时显示 `调用 1`、`调用 2` 等小型分段按钮。
- 每项同时显示成功、失败或重试状态，不能只靠颜色区分。
- 选中某次调用后，右侧全部内容都切换到该次请求：工具定义、系统提示词、消息、响应、JSON 和 cURL 必须保持同一关联对象。
- `attempt` 作为次级元数据展示，不替代 `调用 N`。

### 调用元数据

展示当前 LLM Call 的：

- Input Token
- Output Token
- Cache Read Token
- Cache Creation Token（provider 支持时）
- Duration
- Attempt
- Provider / Model
- Stop Reason 或错误状态

provider 没有返回的字段显示 `—` 或完全隐藏，不能根据其他字段反推伪数据。

## 详情折叠区

详情使用单一 Surface 内的平面分区，不为每个折叠区重复添加外层阴影卡片。默认只展开「响应」，其余请求上下文和开发者原始数据按需展开，避免用户进入页面后直接面对完整工具 Schema。

展示顺序固定为：

1. 响应
2. 请求上下文：消息、系统提示词、工具定义
3. 开发者数据：请求 JSON、cURL、规范化 Trace

### 工具定义

工具定义必须以可读工具列表呈现，禁止默认输出原始 JSON 数组。

每个工具项包含：

- 工具名称
- description
- 参数列表
- 每个参数的名称、类型、是否必填、说明和默认值（如果存在）
- 嵌套对象或枚举采用缩进层级或可展开参数组

工具定义外层默认收起。展开后先显示紧凑工具列表，包括工具名、一行描述和参数数量；点击单个工具后才展开完整描述和参数。原始 schema 只在「原始数据」的规范化 Trace 中保留。

### 系统提示词

- 使用等宽或适合长文本阅读的内容区。
- 保留换行和 Markdown 源文本，不在此处执行 Prompt。
- 支持复制。
- 大内容采用容器内滚动和字符计数，不让整个页面横向溢出。

### 消息

消息按请求发送顺序展示完整上下文，使用带背景的角色卡片：

- User：浅蓝信息背景。
- Assistant：浅绿 operational-soft 背景。
- Tool Result：浅紫 data/context 背景。
- System 若出现在 messages 中：中性灰背景；主 system prompt 仍在独立区域展示。

每张卡片必须同时显示角色标签，不能只靠背景色。工具调用和工具结果显示工具名、调用参数或结果正文；超长输出默认限制高度并允许展开。

### 响应

响应展示模型实际返回的语义内容，不默认展示 provider 原始响应 JSON：

- provider 暴露的 Thinking / Reasoning Summary：灰色独立块。
- Assistant Text：按正常正文或 Markdown 渲染。
- Tool Call：结构化卡片，展示工具名与格式化参数。
- Error：Danger 语义错误块，展示脱敏后的 code、message 和 status。

只有 Trace 中实际存在的 thinking 才能展示；页面不得生成、补全或推断模型未返回的内部推理。

### 原始数据

- 集中提供请求 JSON、脱敏 cURL 与当前 LLM Call 的规范化 Trace 事件或请求/响应组合。
- 默认收起。
- 支持复制和代码格式化。
- 保持脱敏结果，不提供“查看原始密钥/Header”的绕过入口。

## 顶部操作

### 请求 JSON

- 展示发送给 provider 的脱敏请求快照。
- 使用独立大弹窗或 Sheet，不在窄小 popover 中承载长 JSON。
- 支持复制、查找与格式化。

### cURL

- 根据当前请求生成可复现的脱敏 cURL。
- API Key、Authorization 和 Cookie 必须使用 `${API_KEY}` 等占位符。
- 未安全捕获的 Header 不补造。
- 明确标注“已脱敏，复制后需自行补充凭据”。

### 对比上次

#### 比较对象

- 默认比较当前 Agent Run 内紧邻当前调用之前的真实 LLM Call。
- 同一 Turn 的重试也属于合法前序调用。
- 当前调用是本 Agent Run 第一次请求时按钮禁用，并给出原因 Tooltip。
- 不提供任意“对比对象”下拉，避免跳过中间上下文变化。
- 弹窗标题两侧的前后按钮以相邻调用为窗口翻页，例如 `Turn 1 → Turn 2`、`Turn 2 → Turn 3`；到首尾后禁用。

#### 弹窗标题

- 跨 Turn：`Turn 1 → Turn 2`
- 同 Turn 重试：`Turn 2 · 调用 1 → 调用 2`
- 不显示 `llmCallId` 对照文本。

#### 差异内容

弹窗采用接近全屏的大尺寸内容区：

1. 顶部显示 Token、Cache、消息数、工具数和 Attempt 的差值。
2. 消息按结构化对象归一化后比较。
3. 未变化的前缀消息折叠成一条灰色摘要，例如“前 6 条消息未变化”。
4. 新增或删除的消息按完整角色卡片展示，不把内容压成行级文本 diff。
5. System Prompt、工具定义、模型与非敏感请求选项在“其他请求变化”中分别展示。
6. 如果同 Turn 重试的请求上下文完全一致，明确显示“请求上下文未变化”，但仍展示 Attempt、耗时或错误变化。

比较时忽略事件时间戳、内部 ID 等易变字段；保留角色、内容、工具名、工具参数、工具结果、模型和真实请求选项。

## 视觉与主题

### 视觉方向

分析观测属于高密度开发工具，但浅色主题必须保持明亮、轻盈：

- App 背景、顶部栏、左栏和主要 Panel 以明亮白色为主。
- 只用很浅的冷中性层级区分页面背景、Panel 和代码区。
- 低饱和浅蓝用于 User 与分析选择。
- 低饱和浅绿用于 Assistant、当前 LLM Call 和 Diff 新增。
- 低饱和浅紫用于 Tool Result 与工具上下文。
- 浅红只用于失败、删除和 Diff 移除。
- Dark 主题回到低彩度中性暗面，并重新校准所有角色背景与文字对比。

这些颜色是页面内的“分析数据编码”，不是全局品牌色、导航色或 CTA 色。主操作仍使用 ActSpace action token；运行健康仍使用 operational token。

### Token 约束

生产实现不得复制原型中的颜色字面量。需要建立页面级语义映射，例如：

```text
analysis-canvas
analysis-selection-soft
analysis-user-soft
analysis-assistant-soft
analysis-tool-soft
analysis-thinking-soft
analysis-diff-add-soft
analysis-diff-remove-soft
```

- 每个新增 token 同时定义 light、dark、system-dark。
- 可以复用现有 `info-soft`、`operational-soft`、`context-tools`、diff add/remove token 时不重复造色。
- selected、focus、running 仍是不同状态；键盘 focus 必须使用独立 ring。
- 所有状态同时使用文字、图标或边框，不把颜色作为唯一信息。

## 响应式布局

- 会话索引在宽窗下保持居中单列；`<= 1050px` 隐藏模型列，`<= 720px` 将 Run、Turn 与 Token 收入会话次级信息，并让搜索独占一行。
- `>= 1000px`：固定两栏，左栏建议 300–340px，右栏占剩余空间。
- `821–999px`：左栏收敛到约 280px；顶部统计允许横向滚动；Turn 标题操作可以换行。
- `<= 820px`：右栏全宽；左栏变为由“用户输入与 Turn”按钮打开的覆盖式导航 Sheet。
- 对比、JSON 和 cURL 弹窗在窄窗下占满可用区域。
- 任意宽度下都不恢复设置侧栏，也不增加第三个常驻导航栏。

## 加载、空状态与错误

### 加载

- 页面先加载跨 Session 轻量索引；用户选中 Session 后再加载该 Session 的 Run summary，选中 Agent Run 后才读取完整 Trace。
- 左栏 Skeleton 与右栏 Skeleton 分开，避免一次大读取让整页空白。
- 切换 Turn 或同一 Run 内 LLM Call 不重复读取文件；切换 Agent Run 时才懒加载并缓存最近读取结果。

### 空状态

- Session 没有 Trace：首页仍展示该会话并标记「暂无记录」；钻取后说明“该会话暂无可分析记录”。
- 没有活动 Session：仍展示其他未归档会话；全部为空时显示索引空状态，不自动创建会话。
- 筛选无结果：保留搜索与工具筛选，提供清除筛选操作。

### 错误与降级

- 单个 Trace 损坏时只标记对应 Agent Run，不阻塞其他分组。
- Trace 被裁剪时显示明确 Banner，并指出后半段请求内容可能不完整。
- provider 未返回 usage、cache 或 thinking 时隐藏对应内容，不将其视为读取失败。
- 活跃 Agent Run 显示“记录中”；首版不做高频文件 tail，重新进入页面会读取最新 summary 与 Trace。

## 数据加载与前端视图模型

Renderer 不应让各组件直接遍历原始 `AgentTraceEvent[]`。页面适配层先构建稳定视图模型：

```ts
type AgentAnalysisSessionView = {
  sessionId: string;
  title: string;
  totals: AnalysisTotals;
  toolNames: string[];
  runs: AgentAnalysisRunView[];
};

type AgentAnalysisSessionSummary = {
  sessionId: string;
  title: string;
  updatedAt: string;
  workspaceRoot?: string;
  status: "recording" | "completed" | "failed" | "empty" | "unavailable";
  totals: AnalysisTotals;
  modelNames: string[];
};

type AgentAnalysisRunView = {
  agentRunId: string;
  userMessagePreview: string;
  startedAt: string;
  status: "recording" | "completed" | "failed";
  truncated: boolean;
  turns: AgentAnalysisTurnSummary[];
};

type AgentAnalysisTurnDetail = {
  turnId: string;
  turnIndex: number;
  toolNames: string[];
  llmCalls: AgentAnalysisLlmCallView[];
};
```

规则：

- SessionEvent 提供用户输入与 Agent Run 对应关系。
- Session 元数据与 Trace summary sidecar 提供跨 Session 首页；首页不得回退读取完整 JSONL。
- Trace summary 提供左栏和顶部统计所需的轻量元数据。
- 完整 Trace 只在选中 Agent Run 时读取。
- 归一化、排序、消息 diff 和 cURL 生成放在纯函数中，并写单元测试。
- React 组件只消费视图模型，不自行猜测事件顺序或层级。

## Trace 可靠性与保留策略

生产页面接入前必须同时补齐：

- 每个 Agent Run 维护独立 summary sidecar，列表页不得为生成摘要读取全部 JSONL。
- 单个 Trace 默认上限 64 MiB；超过后停止写入大请求/响应快照，记录 `truncated` 状态，但不得影响 Agent Run。
- 全局 Trace 默认保留 30 天且总量不超过 512 MiB；超限时从最旧的已完成 Trace 开始清理。
- 活跃 Trace 不参与自动清理。
- Trace 清理 IPC 与自动保留策略继续存在，但分析页顶部不提供删除按钮，避免在高频浏览区暴露低频破坏性操作；任何清理都不得删除 `session.jsonl`。
- 所有限制使用集中配置常量并有测试，后续再决定是否开放为用户设置。

以上数值是首版建议默认值，属于本设计评审内容；实现前若调整，应同步修改本文与执行计划。

## 隐私与安全

- 所有数据默认仅保存在本机，不上传到分析服务。
- Renderer 只能通过 Preload/Main IPC 读取指定 Session 的 Trace。
- Main 校验安全 ID、普通文件、符号链接、文件上限与事件身份一致性。
- Trace 和 cURL 永不返回 API Key、Authorization、Cookie、代理凭据、图片 Base64 或签名 URL。
- 复制按钮是显式用户动作；页面不自动把内容写入剪贴板或外部文件。
- 清理分析记录必须与删除聊天会话分离，避免用户误以为会话正文被删除。

## 可访问性与键盘

- 左栏分组使用可访问的展开按钮，并设置 `aria-expanded`。
- Turn 与 LLM Call 使用真实 button，不用可点击 div。
- 折叠区、弹窗、下拉和关闭按钮都有明确 label。
- `Escape` 关闭最上层弹窗；弹窗打开时锁定背景焦点并恢复触发按钮焦点。
- Tab 顺序遵循顶部操作 → LLM Call → 折叠区内容。
- 角色与 Diff 状态均有文字标签，颜色不是唯一提示。

## 首版范围

### 包含

- 设置页入口与独立 Analysis 工作区。
- 未归档 Session 索引、汇总、搜索、状态与模型筛选。
- 选中 Session 的 Agent Run / Turn / LLM Call 导航。
- 搜索、单选 Tools 筛选、用户输入折叠。
- 工具定义、系统提示词、消息、响应与完整 JSON。
- Request JSON、脱敏 cURL、相邻请求对比。
- Token、Cache、耗时和重试展示。
- Trace summary、懒加载、体积上限、保留与清理。
- 浅色、深色、跟随系统和紧凑窗口适配。

### 不包含

- 多供应商代理流量抓包或中间人代理。
- 数据集运行、评分、排行榜或回归报告。
- 独立“工具执行”详情面板。
- 详情页常驻 Session 第三栏或跨 Session 全文消息搜索。
- Trace 导出包、分享链接或云端同步。
- 修改、重放或重新发送某次请求。
- 子 Agent 的独立树形分析；首版只显示主 Agent Trace 已捕获的上下文事实。

## 验收标准

- 页面层级与 `agentRunId → turnId → llmCallId` 一致。
- 从设置进入时先显示会话索引；当前会话仅标记，不自动读取详情。
- 首页只读取 Session 元数据与 summary sidecar；单条损坏不阻断其他会话。
- 从首页选择会话后进入详情，详情返回会话列表，首页返回设置。
- 一个 Turn 的重试可以切换为多个 LLM Call。
- 选中任意 LLM Call 后，所有详情和顶部操作引用同一请求。
- 工具定义不是原始 JSON；消息有角色背景；响应不是原始 JSON。
- 对比弹窗能区分跨 Turn 与同 Turn重试，按相邻调用前后翻页，并且不显示 LLM Call ID 或任意对象下拉。
- Tools 只显示当前搜索结果中实际调用数大于 0 的工具，旧 summary 会从有界 JSONL 重建这项派生索引。
- Settings 侧栏在 Analysis 中消失，页面始终最多两栏。
- 浅色主题以明亮白色为主，角色色只承担低面积数据编码；深色主题可读。
- 大 Session 不需要读取全部 Trace 才能渲染左栏。
- 清理、上限和自动保留不影响 `session.jsonl` 与聊天恢复。
- 自动测试与 Electron 手动验收边界分别记录。

## 决策记录

- 2026-07-30：分析观测与评估保持产品边界；前者分析真实会话，后者运行数据集并评分。
- 2026-07-30：页面采用两栏，不增加 Session 导航；Settings 入口进入后整页接管。
- 2026-07-30：用户输入作为 Agent Run 分组，Turn 在左栏，LLM Call 在右栏小型切换器中处理。
- 2026-07-30：不增加独立工具执行面板；工具调用看响应，工具结果看后续消息与请求对比。
- 2026-07-30：工具定义改为 description + 参数列表；原始 schema 只放完整 JSON。
- 2026-07-30：浅色主题采用明亮白色与浅蓝、浅绿、浅紫的数据编码；这些颜色不回流为全局导航或 CTA 色。
- 2026-07-30：对比上次默认比较当前 Agent Run 内的前一个真实 LLM Call，隐藏底层调用 ID。
- 2026-08-01：恢复原始 claude-tap Demo 已确认的「会话索引 -> 单会话钻取」核心；此决策取代 2026-07-30 的“入口直接打开当前 Session”。详情仍保持两栏，不引入常驻第三栏。
- 2026-08-01：当前活动 Session 只在首页标记，所有会话钻取都必须由用户显式触发。
