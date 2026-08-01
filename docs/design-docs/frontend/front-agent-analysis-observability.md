# Agent 分析观测页面规范

## 文档状态

- 状态：已实现，待 Electron 人工验收
- 页面名称：分析观测 / Analysis
- 数据事实来源：[`../agent-runtime/agent-observability-trace-model.md`](../agent-runtime/agent-observability-trace-model.md)
- 交互原型：[`front-agent-analysis-observability-prototype.html`](front-agent-analysis-observability-prototype.html)
- 执行计划：[`../../exec-plans/active/20260730-agent-analysis-observability-page.md`](../../exec-plans/active/20260730-agent-analysis-observability-page.md)

## 定位

分析观测是面向 ActSpace 开发者的本地会话诊断工作区。它把当前 Session 中已经发生的 Agent Run、内部 Turn 与真实 LLM Call 按执行层级还原出来，用于回答：

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
- 入口默认打开当前活动 Session；没有活动 Session 时尝试打开最近一个未归档 Session。
- 当前版本不提供 Session 导航器，避免恢复成三栏结构。后续若需要分析任意历史 Session，应从会话菜单增加“在分析观测中打开”，而不是在本页常驻第三层导航。

### 独立工作区

- 分析观测打开后，设置导航和聊天侧栏都不保留。
- 页面左上角提供「返回设置」，返回后恢复进入分析观测前的设置分区。
- 页面占据完整工作区，只保留分析页自己的两栏。
- 切换页面不会启动、停止或重放 Agent Run。

## 页面总布局

```text
┌──────────────────────────────────────────────────────────────────┐
│ 返回设置  分析观测   Session 汇总统计                    本地记录 │
├──────────────────────┬───────────────────────────────────────────┤
│ 搜索                 │ Turn 2   模型名称                         │
│ Tools 筛选           │ LLM Call 切换 / 用量 / 耗时 / Attempt     │
│                      │ 对比上次  请求 JSON  cURL                 │
│ 用户输入 1 ▼         │                                           │
│   Turn 1             │ 工具定义                                  │
│   Turn 2 · 2 Calls   │ 系统提示词                                │
│   Turn 3             │ 消息                                      │
│                      │ 响应                                      │
│ 用户输入 2 ▼         │ 完整 JSON                                │
│   Turn 1             │                                           │
└──────────────────────┴───────────────────────────────────────────┘
```

### 顶部栏

顶部栏用于表达当前 Session 的总体规模，不重复显示当前用户输入正文。建议依次展示：

- Agent Run 数
- Turn 数
- LLM Call 数
- API Token 总量
- Input Token
- Output Token
- Cache Read Token
- Cache Hit Rate
- 累计 LLM 耗时

规则：

- `Cache Hit Rate = Cache Read Token / Input Token`；provider 未报告缓存数据时显示 `—`，不能显示伪造的 `0%`。
- 累计耗时使用每次 LLM Call 的 `durationMs` 求和，不把用户等待和工具执行误计入模型耗时。
- 汇总项在空间不足时横向滚动或收敛标签，不允许挤压页面标题和返回按钮。
- 「本地记录」只表示数据来自本机，不代表正在监听网络代理。

## 左栏：导航与筛选

### 搜索

首版导航索引的搜索范围包括：

- 用户输入摘要
- 模型名称
- 工具名称
- Turn 序号

完整请求消息只在选中 Agent Run 后懒加载，不复制到 summary sidecar，因此首版不做跨 Run 的全文消息搜索。不要求用户搜索底层 ID。搜索与 Tools 筛选使用 AND 关系。

### Tools 筛选

- 只展示当前 Session 的 LLM 请求实际声明或调用过的工具名称。
- 首项为 `All`。
- 首版采用单选筛选；点击工具后，只显示包含该工具的 Turn。
- 工具名按首次出现顺序排列，数量较多时允许换行或在容器内横向滚动。
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
- 标题区右侧放置「对比上次」「请求 JSON」「cURL」。

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

### 工具定义

工具定义必须以可读工具列表呈现，禁止默认输出原始 JSON 数组。

每个工具项包含：

- 工具名称
- description
- 参数列表
- 每个参数的名称、类型、是否必填、说明和默认值（如果存在）
- 嵌套对象或枚举采用缩进层级或可展开参数组

工具较多时按名称定位或折叠单个工具。原始 schema 只在「完整 JSON」中保留。

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

### 完整 JSON

- 展示当前 LLM Call 的规范化 Trace 事件或请求/响应组合。
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
- 弹窗内可通过前后按钮和下拉选择更早的调用。

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

- `>= 1000px`：固定两栏，左栏建议 300–340px，右栏占剩余空间。
- `821–999px`：左栏收敛到约 280px；顶部统计允许横向滚动；Turn 标题操作可以换行。
- `<= 820px`：右栏全宽；左栏变为由“用户输入与 Turn”按钮打开的覆盖式导航 Sheet。
- 对比、JSON 和 cURL 弹窗在窄窗下占满可用区域。
- 任意宽度下都不恢复设置侧栏，也不增加第三个常驻导航栏。

## 加载、空状态与错误

### 加载

- 页面先加载轻量分析索引，再读取当前选中 Agent Run 的完整 Trace。
- 左栏 Skeleton 与右栏 Skeleton 分开，避免一次大读取让整页空白。
- 切换 Turn 或同一 Run 内 LLM Call 不重复读取文件；切换 Agent Run 时才懒加载并缓存最近读取结果。

### 空状态

- Session 没有 Trace：说明“该会话暂无可分析记录”，并提示只有启用 V2 Trace 后的新 Agent Run 才会出现。
- 没有活动 Session：提供“返回聊天”或“返回设置”，不自动创建会话。
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
- 提供“清除当前 Session 分析记录”和“清除全部分析记录”的显式操作，删除前确认；清理 Trace 不删除 `session.jsonl`。
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
- 当前活动 Session 的 Agent Run / Turn / LLM Call 导航。
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
- Session 常驻导航或跨 Session 搜索。
- Trace 导出包、分享链接或云端同步。
- 修改、重放或重新发送某次请求。
- 子 Agent 的独立树形分析；首版只显示主 Agent Trace 已捕获的上下文事实。

## 验收标准

- 页面层级与 `agentRunId → turnId → llmCallId` 一致。
- 一个 Turn 的重试可以切换为多个 LLM Call。
- 选中任意 LLM Call 后，所有详情和顶部操作引用同一请求。
- 工具定义不是原始 JSON；消息有角色背景；响应不是原始 JSON。
- 对比弹窗能区分跨 Turn 与同 Turn重试，并且不显示 LLM Call ID 标题。
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
