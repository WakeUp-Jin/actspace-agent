# Context 面板与模型能力事实规范

状态：已确认设计，P00/P01 已实现，等待全量回归与 Electron 手工验收。

## 1. 目标

让 Context 面板回答“本次请求实际准备了什么、占用了所选模型多少上下文容量”，而不是显示一个与模型无关的固定容量或已完成请求的 provider usage。模型能力、用户默认选择、当前输入框临时选择和 Session 请求事实必须保持不同的生命周期与持久化边界。

## 2. 参考与适用边界

`tmp/deepseek-harness` 只作为机制参考，不是 ActSpace 的运行时依赖或当前事实来源。可迁移的机制有两点：

- Provider adapter 在请求准备阶段解析模型能力，并返回模型专属 `contextWindow`，而不是由 UI 猜测；
- 用户可编辑配置由 settings provider 持久化，默认模型选择是独立 settings namespace，Session 日志仍记录每次真实请求使用的模型。

ActSpace 继续使用自己的 v2 Runtime、Session Journal、SettingsService 和 typed IPC。

## 3. 当前问题

### 3.1 Context 容量来源错误

当前多个 Projection 和 renderer 文件把 `200_000` 写死。模型定义虽然已经包含 `contextWindow`，但请求的 `request/header` 与 `request/context.prepared` 没有固化这项模型能力，因此 Session 恢复时无法得到当次请求的真实容量。

### 3.2 Context 内容来源错误

ContextPopup 当前优先消费 provider usage，并把它压缩成 Conversation 与 Tools 两个 bucket。provider usage 是已完成请求的实际消耗，不等价于最近一次 request snapshot 的完整上下文。`projectContextState()` 已经能够从最近一次 `request/context` 还原 system prompt、tools、rules、skills、summary 和 conversation，但弹窗尚未消费这份投影。

### 3.3 选择状态与配置状态混淆

- 输入框当前选择的模型是 renderer 内存状态，只影响当前窗口后续发送；
- 设置页“默认会话模型”写入 `settings.json`，用于新会话和重启后的默认值；
- 实际发送的模型写入 Session Journal 的 `request/header`，已开始请求的 Session 不随默认值变化；
- Thinking / Effort 的 Composer 临时选择目前不持久化。

## 4. 规范化数据边界

```text
ModelDefinition / provider catalog
  └─ 模型能力：contextWindow、maxTokens、reasoning、input

SettingsService → <userData>/settings.json
  └─ 模型定义、installed 状态、taskBindings.defaultChat/utility/explore

Composer 临时状态
  └─ 当前窗口选择、Thinking、Effort

Session Journal
  ├─ request/header：本次请求的 model、route、attempt、contextWindow
  └─ request/context：冻结的完整 LogicalRequestSnapshot 与 prepared metadata
```

API Key 继续只进入 `<userData>/secrets.json`，不得进入 settings、request snapshot、Journal 或 Projection。

## 5. Request Model Facts Contract

每次真实模型请求越过 dispatch 前，Runtime 必须把以下事实写入 durable request 记录：

```text
request/header
  requestId
  turnId
  stepId
  routeId
  model
  attempt
  contextWindow: positive integer | null

request/context.snapshot.prepared
  route
  model
  contextWindow: positive integer | null
  registrationId
  adapterVersion
  defaults
  retryPolicy
```

`contextWindow` 是当次请求解析到的模型能力快照，不是当前设置文件的实时查询结果。这样模型目录刷新、设置修改或模型删除都不会改变历史 Session 的解释。

旧 Session 若没有该字段：Projection 与 UI 按容量 `0` 处理，并保留 token 统计；禁止回退到伪造的 `200_000`。

## 6. Context Projection Contract

Context 面板的主数据源是最近一次可关联的 `request/header + request/context`：

- bucket 内容和 entry preview 来自 request snapshot；
- token 数是可解释的 UI estimate；
- `maxTokens` 来自 request model facts 的 `contextWindow`；
- provider usage 只用于 Usage 页面和独立的实际消耗语义。

默认 bucket 映射：

| Snapshot 来源 | UI bucket |
| --- | --- |
| 核心 system sections | System prompt |
| tools | Tools |
| rules contributor | Rules |
| skills contributor | Skills |
| compaction summary | Summarized conversation |
| messages | Conversation |

Projection 必须保留未知 bucket 的稳定兜底，不得因为新增 contributor 让 Context 面板崩溃。未来若要单独显示 MCP dynamic tools、Subagent definitions 等类别，必须先扩展 Journal snapshot 分类契约，不能仅在 renderer 中伪造分类。

## 7. Composer 与 Context Popup 展示规范

- Context 面板左右边缘与 Composer 输入框完全对齐，宽度跟随 Composer，不使用固定 `820px` 上限；
- 面板显示 request snapshot 的全部可用 bucket，右侧完整 Context 视图继续显示逐条 entry；
- 百分比显示整数，`38.2149%` 显示为 `38%`；
- Token 摘要和 bucket 数值使用无小数的紧凑单位：`76,430` 显示为 `76K`，`1,000,000` 显示为 `1M`；
- 容量未知时显示 `0 / Tokens` 与 `0%`，不显示固定猜测值；
- Context bucket 颜色继续使用 `--act-context-*` visualization token，并同时通过浅色、深色主题验证。

## 8. 模型配置与持久化规范

ActSpace 的非敏感模型配置继续写入 `<userData>/settings.json`：

- builtin / curated definitions 由代码注册表提供；
- provider catalog / custom definitions 写入 `models.definitions`；
- installed、enabled、customLabel、credentialId 写入 `models.installed`；
- 默认会话、utility、explore 模型写入 `models.taskBindings`。

输入框临时切换不自动改写默认配置。只有设置页的默认模型操作才修改 `models.taskBindings.defaultChat`。实际请求模型仍以 Session Journal 的 request header 为准。

## 9. 非目标

- 不把 provider usage 与 Context estimate 合并；
- 不恢复独立 `context-state` 持久化文件或第二套 Session 事实源；
- 不让 renderer 直接读取模型 Key、settings 文件或 Journal 文件；
- 不在本轮新增 Context entry 编辑、pin、exclude 或跨 Session memory；
- 不因为参考项目使用 YAML 就把 ActSpace 的 settings.json 改成 YAML。

## 10. 验收标准

- 不同模型的 Context 容量来自当次 request model facts，而不是固定 200K；
- 仅凭 Session Journal 可以重建 Context bucket、entry preview 和容量；
- ContextPopup 不再优先显示 provider usage 的两桶适配结果；
- 输入框临时模型选择、设置页默认模型和 Session 实际模型三者行为可分别验证；
- 浅色和深色主题下 Context bucket、meter、border、text 均符合主题 token 规范；
- 旧 Session 缺少 contextWindow 时按 0 安全显示，不影响历史恢复。

## 11. 代码事实入口

- `packages/shared/src/model-config.ts`
- `packages/shared/src/settings.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/model-store-service.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/prompt/src/request-snapshot.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `apps/desktop/src/renderer/components/ContextPopup.tsx`
- `apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`
