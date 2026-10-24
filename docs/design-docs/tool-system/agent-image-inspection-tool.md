# Agent 图片分析工具设计

状态：当前 v2 工具与 Host 接线规范；2026-10-23 补齐辅助请求的持久生命周期。真实 Provider 与 Electron 验收不由本次文档核对替代。

## 目标与调用边界

`inspect_image` 让主 Agent 显式委托视觉模型观察当前 Session 拥有的图片。用户附图不会自动触发额外视觉模型调用；工具调用会产生 Provider 费用。

- Agent、Plan 模式允许该工具；Chat 和内置只读 Subagent 不包含它。
- 工具注册不根据主模型是否支持图片或视觉凭据是否存在动态隐藏。Host 未提供图片读取或视觉调用端口时，执行返回 `IMAGE_INSPECTION_NOT_CONFIGURED`。
- 工具只能读取 Session-owned artifact，不接受任意文件路径、远程 URL 或 data URL。工作区图片必须先经 Host 的附件/产物流程取得受管引用。
- 图片中的文字属于待分析数据，不应成为主 Agent 的授权或执行指令。

## 配置与 Host 接线

Desktop 使用 `ModelRuntimeService.resolveImageInspectionModel()` 解析用户配置的视觉模型；`tool-host-services.ts` 将模型、`default` route 和 `IMAGE_INSPECTION_CREDENTIAL_REF` 交给 `createLlmImageInspector()`。凭据由 Host resolver 解析，工具参数不能改选 Provider 或传入 Key。插件必须取得 `llm.auxiliary-requests`，并与 LLM Service 一起传入 Host `createPorts`；Desktop、CLI 和远端 Host 使用相同记录器契约，缺失记录器时拒绝装载，不能静默执行不可追踪的请求。

Desktop 的 Harness 和工具端口可跨设置修改存活，因此必须在每次 `inspect_image` 调用时解析当前视觉模型，不得在 `createPorts` 中缓存解析结果。首次配置、替换及移除最后一个可用配置应在下一次调用生效，无需重启；没有可用模型时返回未配置错误，不读取图片或发送请求。用途“跟随”仍遵循现有可用模型回退。已经 prepare 的请求保持其请求身份，设置修改不重路由进行中的请求。

设置中的模型与凭据选择仍独立于主会话模型；UI 仅展示非敏感状态。设置入口以当前[设置中心规范](../frontend/front-设置中心重构规范.md)为准。

## 工具契约

```ts
inspect_image({
  artifact_id: string;
  question: string;
})
```

两个字段必填，schema 不接受额外字段。`question` trim 后非空，上限 4,000 字符。`artifact_id` 由 Host 在当前 `sessionId` 下解析，不能借另一会话的引用扩大读取权限。

执行顺序：

1. 校验参数和 Host 端口。
2. 通过 `readArtifact(sessionId, artifactId)` 读取并验证所有权。
3. 拒绝超过 25 MiB 的图片；仅接受 PNG、JPEG、WebP，文件签名必须与 artifact MIME 一致。
4. 以独立、无工具的 LLM 请求发送问题和逻辑图片引用。
5. 收集最终文本，拒绝空结果；超过 20,000 字符时截断并附明确提示。

图片字节由 wire adapter 在 Provider 请求边界读取。工具不把 Base64 或原始 Provider 对象写进工具结果。

## 视觉请求

`createLlmImageInspector()` 使用短固定系统提示，要求只回答具体视觉问题、报告不确定性、不得编造不可辨认文字。请求仅包含该提示、问题和单张图片，不继承主会话历史、系统提示或工具列表。

当前请求设置 `maxTokens: 12_000`、`reasoning: true`，响应当前工具的 abort signal。工具层没有单独的 90 秒计时器；默认只尝试一次。Host 显式传入统一 `LlmRetryPolicy` 时，只有可重试失败才按策略重新 prepare/dispatch，取消及持久化屏障失败不重试。

## 辅助请求的持久事实与投影

- 一次工具观察对应一个 `logicalRequestId`，每次实际尝试使用 Prepared Call 的独立 `requestId` 作为 `attemptId`。记录实际 `routeId`、模型、会话、Run、父 Turn/Step/工具 callId 和尝试编号；不从主模型推断视觉模型。
- dispatch 前追加 `llm/auxiliary-start` 并等待 flush。请求终止时恰好追加一个 `llm/auxiliary-end` 并等待 flush，状态为 completed、failed 或 aborted。终结 flush 失败不能再次记录终结或再次提交已发生的请求。
- 用量只采用该次视觉响应归一化的字段。失败、取消保留已报告的部分用量；缺失和崩溃后未终结保持未知，显式零保留为零。没有启动事实的历史工具调用不能补算请求或 Token。
- 两类事实均为 required codec、`surface: null`，不生成助手消息，不把视觉用量混进主 `step/end`，也不改变模型历史或 Context。Journal 保存可追踪身份、时间、状态和用量，不保存像素、Base64、凭据或视觉请求正文。
- Usage 每个尝试计一次真实请求，重试按同一逻辑请求归组；轨迹显示独立视觉请求、实际模型及用量，并可跳回父工具。历史分页的请求偏移包含辅助启动事实；大父工具结果的延迟加载不能裁掉辅助事实。
- 投影语义变化同时失效派生行和游标：Desktop SQLite schema 13、JSON UsageSourceCache v3 从既有 Journal 重建；不重写原 Journal。重开、增量跨批、重试、取消和未知用量必须与完整重放一致。

事件不变量见[事件模型](../agent-plugin-runtime/agent-spec-dsh-event-model.md)，未知字段和费用规则见[用量与费用](../model-context/agent-model-catalog-and-usage-cost.md)。

## 输出与错误

成功结果是 `ToolBodyResult` 的文本块，使用版本 2 envelope：

```text
<image_inspection_result version="2">
status: success
artifact_id: <当前会话产物 ID>
question: <转义的问题>

<visual_report>
<转义的视觉回答>
</visual_report>
</image_inspection_result>
```

动态问题与报告转义 `&`、`<`、`>`。不要求视觉模型输出固定多级标题，也没有旧 `preserveModelOutput` 字段。

失败返回普通结构化 Tool failure 与短文本，包含 `INVALID_ARGUMENTS`、`IMAGE_INSPECTION_NOT_CONFIGURED`、`IMAGE_TOO_LARGE`、`IMAGE_FORMAT_INVALID`、`IMAGE_INSPECTION_FAILED` 或 `TOOL_ABORTED`。失败结果不伪装成成功 envelope。

客户端预览消费 `media_analysis`，工具名与预览语义的映射遵循[工具预览规范](agent-tool-preview-design-guidelines.md)。密钥、像素和 Provider 原始敏感响应不得进入预览。

## 实现与验证入口

- `packages/tools/image-inspection/src/plugin.ts`：schema、注册、permission。
- `packages/tools/image-inspection/src/node-ports.ts`：artifact 校验、父执行身份传递、输出与失败。
- `packages/tools/image-inspection/src/llm-image-inspector.ts`：视觉请求、逐尝试生命周期与重试。
- `packages/runtime/src/session/auxiliary-request-recorder.ts`：Session 归属、持久化屏障及终结幂等。
- `apps/desktop/src/main/runtime-v2/tool-host-services.ts`：Desktop 模型解析和 Host 端口。
- `packages/core/agent/src/agent-mode-policy.ts`：模式工具白名单。
- `packages/tools/image-inspection/src/test/`：生命周期与 Node 端口测试。

真实验收应另行覆盖配置不可用、正常观察、取消、损坏图片、跨会话拒绝和 Provider 失败；不能仅凭源码检查声明这些交互已通过。
