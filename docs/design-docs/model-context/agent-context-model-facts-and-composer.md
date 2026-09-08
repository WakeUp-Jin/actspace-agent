# Context 面板与模型能力事实规范

状态：P00/P01 已实现，2026-09-09 全量类型与测试回归通过；Electron、真实 Provider 和截图人工验收仍待完成。

## 1. 目标

让 Context 面板回答“本次请求实际准备了什么、占用了所选模型多少上下文容量”，而不是显示一个与模型无关的固定容量或已完成请求的 provider usage。模型能力、用户默认选择、当前输入框临时选择和 Session 请求事实必须保持不同的生命周期与持久化边界。

## 2. 参考与适用边界

`tmp/deepseek-harness` 只作为机制参考，不是 ActSpace 的运行时依赖或当前事实来源。可迁移的机制有两点：

- Provider adapter 在请求准备阶段解析模型能力，并返回模型专属 `contextWindow`，而不是由 UI 猜测；
- 用户可编辑配置由 settings provider 持久化，默认模型选择是独立 settings namespace，Session 日志仍记录每次真实请求使用的模型。

ActSpace 继续使用自己的 v2 Runtime、Session Journal、SettingsService 和 typed IPC。

## 3. 实施前问题（2026-09-01）

以下容量与两桶数据源问题是 P00/P01 的修复背景，已完成代码修复；不能再当作当前缺陷。全量回归与人工验收状态见 [执行计划](../../exec-plans/completed/20260901-actspace-context-model-facts/README.md)。

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

## 5. 数据契约入口

Request Model Facts、Journal 事件、容量优先级、Usage 与 Context estimate 的区分、完整 bucket 映射统一维护在 [Token Usage 与 Context Projection](agent-token-usage-and-context-state.md)。本页只维护面板交互与模型选择的产品边界，避免两份规范重复定义同一数据契约。

模型能力快照随实际请求冻结；旧 Session 缺少容量时按 `0` 展示，设置或目录更新不改写历史。这些约束以主规范的 Request Model Facts 和 Context Projection 两节为准。

## 6. Composer 与 Context Popup 展示规范

- Context 面板左右边缘与 Composer 输入框完全对齐，宽度跟随 Composer，不使用固定 `820px` 上限；
- 面板显示 request snapshot 的全部可用 bucket，右侧完整 Context 视图继续显示逐条 entry；
- 百分比显示整数，`38.2149%` 显示为 `38%`；
- Token 摘要和 bucket 数值使用无小数的紧凑单位：`76,430` 显示为 `76K`，`1,000,000` 显示为 `1M`；
- 容量未知时显示 `0 / Tokens` 与 `0%`，不显示固定猜测值；
- Context bucket 颜色继续使用 `--act-context-*` visualization token，并同时通过浅色、深色主题验证。

## 7. 模型配置与持久化规范

ActSpace 的非敏感模型配置继续写入 `<userData>/settings.json`：

- builtin / curated definitions 由代码注册表提供；
- provider catalog / custom definitions 写入 `models.definitions`；
- installed、enabled、customLabel、credentialId 写入 `models.installed`；
- 默认会话、utility、explore 模型写入 `models.taskBindings`。

输入框临时切换不自动改写默认配置。只有设置页的默认模型操作才修改 `models.taskBindings.defaultChat`。实际请求模型仍以 Session Journal 的 request header 为准。

## 8. 非目标

- 不把 provider usage 与 Context estimate 合并；
- 不恢复独立 `context-state` 持久化文件或第二套 Session 事实源；
- 不让 renderer 直接读取模型 Key、settings 文件或 Journal 文件；
- 不在本轮新增 Context entry 编辑、pin、exclude 或跨 Session memory；
- 不因为参考项目使用 YAML 就把 ActSpace 的 settings.json 改成 YAML。

## 9. 验收标准

- 不同模型的 Context 容量来自当次 request model facts，而不是固定 200K；
- 仅凭 Session Journal 可以重建 Context bucket、entry preview 和容量；
- ContextPopup 不再优先显示 provider usage 的两桶适配结果；
- 输入框临时模型选择、设置页默认模型和 Session 实际模型三者行为可分别验证；
- 浅色和深色主题下 Context bucket、meter、border、text 均符合主题 token 规范；
- 旧 Session 缺少 contextWindow 时按 0 安全显示，不影响历史恢复。

## 10. 代码事实入口

- `packages/shared/src/model-config.ts`
- `packages/shared/src/settings.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/model-store-service.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/prompt/src/request-snapshot.ts`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`
- `apps/desktop/src/renderer/components/ContextPopup.tsx`
- `apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`
