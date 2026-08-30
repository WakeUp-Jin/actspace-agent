# Agent 分析观测页面规范

## 文档状态

- 文档等级：current-v2-product-design。
- 状态：页面已实现；数据源已切到 v2 Session Journal Projection，真实 Electron 交互仍属于人工验收边界。
- 后端事实来源：[`../agent-runtime/agent-observability-trace-model.md`](../agent-runtime/agent-observability-trace-model.md)。
- 交互原型：[`front-agent-analysis-observability-prototype.html`](front-agent-analysis-observability-prototype.html)。

## 定位

分析观测是本地只读诊断工作区。它从 Session Journal 派生会话索引、Agent Run、Turn、真实模型请求、工具调用、usage 和耗时，用于回答：

- 一次用户输入触发了多少个 Turn、Step 和模型请求；
- 某次请求携带了哪些 system prompt、工具定义和消息；
- 模型返回了正文、思考还是工具调用；
- 相邻请求之间上下文如何变化；
- token、缓存和耗时主要消耗在哪里。

页面不启动 Agent、不修改 Journal、不重放请求，也不维护第二份 Trace 真相。

## 数据事实来源

```text
sessions-v2/<sessionId>/journal.jsonl
  -> Session codecs / Surface
  -> Desktop main fixed projection
  -> typed IPC DTO
  -> Analysis renderer
```

当前约束：

- Journal 是唯一持久事实来源；没有 `trace/` JSONL、summary sidecar 或独立 retention worker。
- 会话索引和详情都由 main Projection 派生；renderer 不直接扫描文件系统。
- Projection 可以有内存缓存，但缓存丢失后必须能从 Journal 重建，不能成为恢复前提。
- 单个坏事件按 codec/fallback 规则降级；不能因为一个未知插件事件阻断整个会话索引。
- v1 `session.jsonl`、`context-state.json` 和 Trace sidecar 只属于历史实现。

## 概念层级

```text
Session
└─ Agent Run                 agentRunId
   └─ Turn                  turnId
      └─ Step               stepId
         └─ Model Request   requestId
            └─ Tool Call    toolCallId
```

Renderer 可以在兼容 UI 文案中把 `requestId` 显示为 “LLM Call”，但内部 DTO 和关联必须保留真实 `requestId`，不能生成一套新的持久 ID。

## 页面结构

### 设置内会话索引

- “分析观测”保留在设置导航中。
- 索引展示未归档 Session 的最近活动时间、标题、工作区、Run/Turn/Request 数、token、模型和状态。
- 当前会话只标记“当前”，不自动钻取。
- 搜索覆盖会话标题、工作区和模型；状态与模型筛选消费结构化字段。
- 单条不可读取时只降级该行，不阻断其他 Session。

### 单会话详情

- 用户显式选择 Session 后进入独立两栏工作区。
- 左栏按 Agent Run 分组展示 Turn/Step，并提供搜索和实际调用过的工具筛选。
- 右栏展示当前 request 的响应、请求上下文、system prompt、工具定义、usage、耗时、attempt 和脱敏开发者数据。
- 返回后恢复设置内索引的搜索、筛选和滚动位置。

页面始终最多两栏，不增加常驻 Session 第三栏。

## 视图模型

建议 renderer 只消费以下语义，不依赖 Journal 原始 envelope：

```ts
type AnalysisSessionSummary = {
  sessionId: string;
  title: string;
  updatedAt: string;
  workspaceRoot?: string;
  status: "recording" | "completed" | "failed" | "empty" | "unavailable";
  totals: {
    agentRuns: number;
    turns: number;
    steps: number;
    requests: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    durationMs?: number;
  };
  modelNames: string[];
};

type AnalysisRequestView = {
  requestId: string;
  agentRunId: string;
  turnId: string;
  stepId: string;
  attempt: number;
  model: string;
  request: unknown;
  response: unknown;
  toolNames: string[];
  usage?: unknown;
  durationMs?: number;
  status: "started" | "completed" | "failed" | "aborted" | "unknown";
};
```

归一化、排序、消息 diff、usage 聚合和 cURL 生成放在 main Projection 或可单测纯函数中。React 组件不得根据展示文本猜测事件顺序。

## 内容展示规则

- 默认先展示模型响应，再展示请求上下文。
- 工具定义以 description 与参数表呈现；完整 schema 放在开发者 JSON 中。
- 消息按 role、内容类型和来源区分，思考内容遵守现有可见性与脱敏规则。
- Request JSON 和 cURL 必须移除 API Key、Authorization、Cookie、代理凭据、图片 Base64 和签名 URL。
- 相邻请求对比默认比较当前 Agent Run 内前一个真实 request；同 Turn 重试也必须可比较。
- provider 未报告 cache 时显示 `—`，不能伪造 `0%`。
- 工具筛选只列出实际发生过 Tool Call 的工具，不把请求中仅声明的工具算作已调用。

## 可靠性与性能

- Projection 读取使用有界策略；大字段按后端 Projection 的 truncation/fallback 契约降级。
- 页面按 Session 和 Agent Run 懒加载详情，不能在 renderer 首屏物化全部请求正文。
- 当前没有独立 Trace 清理操作；归档或删除 Session 的产品动作必须以 Journal/Artifact owner 契约为准。
- 分析页面不可用不能影响 Runtime 写 Journal 或正常聊天恢复。
- 活动 Session 可以展示 recording 状态，但不能把未 checkpoint 的短暂 stream event 伪装成已持久事实。

## 隐私与安全

- 数据默认只在本机，通过 preload/main 的类型化 IPC 返回。
- Main 校验 Session id、普通文件边界、符号链接和 DTO allowlist。
- Renderer 不获得 Session 目录、secrets 文件或任意文件读取能力。
- 复制 JSON/cURL 是显式用户动作；页面不自动写剪贴板或导出文件。
- Analysis Projection 与聊天 Projection共享 redaction 基线，不能因“开发者页面”放宽密钥保护。

## 可访问性

- Run、Turn、Step 和 request 选择器使用原生 button，提供 `aria-expanded` / accessible name。
- 弹窗和下拉支持 `Escape`，关闭后恢复触发按钮焦点。
- 状态、diff 和 cache 不只用颜色表达。
- 窄窗口优先保证主内容可读，导航可以收窄或横向滚动，但不能遮挡返回动作。

## 验收标准

- 页面层级与 `agentRunId -> turnId -> stepId -> requestId` 一致。
- 索引和详情都能仅从 `sessions-v2` Journal 重建，不依赖 v1 sidecar。
- 一个 Turn 的多次 request/重试可以切换和对比。
- 当前 request 的响应、上下文、usage、模型和开发者数据引用同一组 ID。
- 未知插件事件或单个损坏事件不会导致全部 Session 不可浏览。
- 大 Session 首屏不需要在 renderer 读取全部 Journal 正文。
- API Key、Authorization、Cookie、Base64 和签名 URL 不进入 DTO、复制内容或日志。
- 自动检查与真实 Electron 人工验收分别记录；自动测试不替代真实 UI 验收。

## 与 Agent 评估的边界

| 能力 | 分析观测 | Agent 评估 |
| --- | --- | --- |
| 数据来源 | 用户真实 Session Journal | 数据集、Case 与受控环境 |
| 主要动作 | 查看、筛选、对比、诊断 | 运行、评分、回归 |
| 是否产生模型请求 | 否 | 是 |
| 主要结果 | 定位上下文、工具、模型和成本问题 | 判断能力是否达到目标 |

真实问题未来可以被保存为 Eval Candidate，但分析页面本身不承担评分和数据集执行。
