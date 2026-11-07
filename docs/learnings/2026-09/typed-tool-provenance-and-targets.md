# 工具展示契约：previewKind、UI 事实分层、完成态与可操作目标

合并自六篇：Tool Preview Kind 契约、高风险工具把审批纳入展示契约、Typed provenance/bounded preview/safe UI target、运行态预览补齐完成态、模型回填与 UI 事实分层、Runtime-only 工具状态与持久化 payload 分层。主线：**执行事实、模型可见内容、用户可操作 UI 是三层不同的数据；展示语义由后端 typed 契约声明，前端不从工具名、字符串或回填文本反推**。当前符号见 `packages/util/shared/src/session.ts`（`ToolUiPreview`）；`ToolResult.structured`、`createToolUiPreview`、`attachmentAnalyses` 是 v1 实现，v2 已移除，下文作为历史案例保留，分层原则仍适用。

## 1. `toolName` ≠ `previewKind`

`toolName`（`read_file`、`list_directory`）是后端能力标识，给 LLM 与调度用；`previewKind`（`read`、`directory_list`、`bash`）是展示语义，给 bridge 与 shared selector 用；`ToolUiPreview.kind` 是前端 view model 的 discriminant，React 组件只是实现细节。

- 前端靠 `toolName` 推断组件，新增工具时容易漏映射：能执行、事件也落盘，UI 只显示 generic 文本。同一工具名以后可能需要不同密度，不同工具也可能共享同一展示样式。`previewKind` 放进工具定义，工具作者注册能力时就必须声明展示语义；renderer 只消费 shared view model。
- 开发早期让 `previewKind` 必填，避免旧 fallback 掩盖契约缺口（忘声明时类型系统应在编译期拦住）。
- 陷阱：别把字段叫 `componentName`（把后端契约绑死到前端框架与文件名）；selector 里别继续写 `if toolName === ...`；别只在最终持久化事件里补 preview——流式事件也要逐步拥有同一套语义，否则执行中与执行后不一致。两个工具想共享轻量日志行，就让它们声明同一 `previewKind`。

## 2. 模型回填（modelOutput）与 UI 事实（structured）从产生起分字段

工具一次执行产出两类消费者不同的数据：`modelOutput` 塞进 LLM 上下文，允许摘要/截断/压缩；UI 事实（diff 全文、additions/deletions、后台 taskId）必须精确完整。事故：edit 工具 diff 超过截断阈值，`modelOutput` 被压缩成摘要，前端此前从回填文本里数 `+`/`-` 行算统计，压缩后统计归零、展开看到摘要而不是 diff。根因不是压缩策略错，而是 **UI 把“允许失真”的字段当事实来源**；且只在“恰好超过阈值”时出现，小用例很难复现。

- scheduler 后处理在**所有返回路径**（成功、失败、无输出、被压缩）都把原始结果保留到 `ToolResult.structured`——最易漏的是失败分支和“renderResult 覆盖 data”的分支。bridge 构建 `ToolUiPreview` 优先读 structured，`modelOutput` 仅兜底旧事件；压缩/截断只作用于回填字符串，不碰 structured。
- 测试专门构造超过截断阈值的用例。自检：把截断阈值从 2000 改成 200，前端展示会变吗？会变说明分层没做干净。

## 3. 运行态预览必须补齐完成态

`tool_started.preview` 表达“正在做什么”，`tool_finished.preview` 表达“做完后发生了什么”（diff、数量、状态这类只能执行后确认的字段）；两者来自同一套 typed preview 契约。事故：`write_file` 的 running preview 正确（`tool_call_streaming` 从 partial args 提取 `path/content`，`tool_started` 用完整 args 补 `streamingContent`），但普通工具的 `tool_finished` 没带最终 preview（只有 SubAgent 带 `uiPreview`），前端只能把 running preview 标完成，`diff=""`、`additions=0` 的半成品被当最终态，出现空白 diff 框。

修：事件桥接层在 `tool_end` 用工具执行记录里的原始 args 与结果文本重新生成 preview：`event.result.subagent?.uiPreview ?? createToolUiPreview(previewKind, args, output, summary, ok)`，实时事件与最终持久化事件共用同一规则。前端组件不应从 raw args/toolName 反推结果——缺 final preview 时修 bridge 契约，不在 renderer 临时补；session 恢复 selector 也要保留同样字段，否则实时与恢复展示不一致。陷阱：只测 running 不测 finished；只修持久化不修实时（刷新后正常、运行中闪烁/空白）；只在前端兜底（每个工具长出自己的猜测逻辑）。

## 4. 来源（provenance）与目标（target）

每条跨层事实携带两个明确维度：
1. **Provenance**：这条消息是普通用户输入、后台任务通知，还是工具结果？必须从生产端传到 projection/selector，不能在 UI 端通过 XML 或显示文本反推。`inbox.enqueue(xml, "next-step", undefined, "task_notification")` 让 selector 能可靠过滤；只在 selector 写 `source === ...` 而 projection 没透传，是常见遗漏。
2. **Target**：结果是内联摘要、bounded disclosure、工作区文件 Tab、图片 artifact Tab，还是子 Agent 面板——由 typed preview 决定，不由组件名或字符串格式隐式决定。

收益：实时与回放消费同一 `ToolUiPreview` 字段（reload 不丢 Chevron/结果摘要）；renderer 只请求 workspace 内相对路径，main 再做 realpath、文件类型、大小校验（`window.actspace.readWorkspaceFile({ workspaceRoot, relativePath })`，不用 `window.open(file://…)` 读绝对路径）；短摘要用于扫描、详细错误放可点击 disclosure（hover 只辅助，不承担唯一可达性）；子 Session 不重复投影（Explore/Agent 主消息只显示状态，完整 transcript 由右侧 SubAgent panel 按 child Session 引用读取）。清单：事件、Inbox item、Surface projection、selector 全程保留来源字段；工具结果定义 bounded preview（行数与单行长度上限），空结果/失败结果不伪造可展开内容；历史回放复制实时路径实际使用的 preview 字段；任何 renderer 发起的文件/网络读取在 main 侧重新解析校验。陷阱：用错误文本填充 `resultPreview`（失败像成功）；通用结果复用 Web Search 的 URL 样式（语义与键盘行为渐渐分叉）；把独立 child Session 完整 transcript 复制回父消息（重复渲染与状态竞争）；看到 HTTP 200 就 `JSON.parse`（网关可能返回 HTML 错误页）。

## 5. 高风险工具：审批状态进入展示契约（`delete_file`）

删除不可逆，只靠 Bash 或通用工具行，用户分不清“模型准备删”“等待确认”“已删除”“用户拒绝”。后端用 `ToolUiPreview.kind = "delete"`，前端只消费 `MessageBlock.kind = "delete"`。running/completed/failed/denied 仍是轻量工具行（不打断消息节奏）；pending approval 独立成确认块（承载真实用户操作）；session 恢复只恢复最终事实态，不从历史里猜 pending；scheduler 与 main registry 双层拒绝 delete 的 `allow_similar`（一次同意不能扩大成一类删除放行）。判断是否需要独立审批 UI：动作不可逆、用户需在动作前确认具体目标、审批结果会改变工具调度而不只是展示——满足时先扩 shared 契约，再让 bridge、streaming preview、renderer、恢复逻辑走同一条路径。陷阱：只在 renderer 屏蔽 `allow_similar`；点审批后乐观切换 UI 却不检查 IPC 返回 `{ ok:false }`；denied 只存在运行态刷新即丢；pending 审批被写成历史事实，恢复旧 session 出现过期确认按钮。最终 `tool_result` 应能独立恢复出 completed/failed/denied。

## 6. Runtime-only 状态 vs persisted payload

同一用户动作可有两种信息流：runtime-only（只服务当前交互反馈，如“Analyze image screenshot.png”进度）与 persisted payload（写入 session、参与恢复，如 `user_message.payload.attachmentAnalyses`）。图片预分析：用户需要看到“正在分析”的工具行，但历史恢复不该再出现独立工具调用日志。当前 turn 只发 `tool_started` stream event（`kind: "media_analysis"`，不落 `tool_call/tool_result`），长期事实写 `userMessageToEvents(..., { attachments, attachmentAnalyses })`；恢复时只从 payload 展示“图片分析结果”，不重放 `tool_started`。全部 runtime 状态写进历史会造成历史污染（发送前辅助处理像模型主动调用）与上下文污染；完全不展示又让用户以为卡住。陷阱：别把系统生成的图片摘要拼回用户原文 `content`（伪装成用户输入）；别持久化 base64（存文本摘要与必要元信息）；测试同时覆盖 runtime stream 与 persisted payload。自检：刷新后还该存在吗（否→runtime-only）？会影响下一轮模型上下文吗（会→结构化持久化）？

## 自检

1. 新增 `web_fetch` 专用卡片时，改的是工具名、`previewKind` 还是 React 组件名？
2. 这个工具有哪些字段只能在 executor 完成后才知道？`tool_started`/`tool_finished`/`tool_result.uiPreview` 是否同一套展示语义？从历史恢复同一事件，renderer 看到的字段与实时一致吗？
3. 用户点审批后 IPC 失败或请求已过期，UI 会误报成功吗？
4. 你的前端展示字段中间经过几层可能改写它的处理？

来源：`docs/histories/2026-05/20260525-1240-tool-preview-kind-contract.md`、`.../2026-06/20260602-1412-delete-file-tool.md`、`.../2026-06/20260602-0132-attachments-turn-contract-tests.md`、`.../2026-07/20260703-0937-write-tool-finished-preview.md`、`.../2026-07/20260705-1522-user-message-clamp-diff-preview-write-approval.md`、[20260913 工具结果交互与后台通知修复](../../histories/2026-09/20260913-1540-tool-result-interaction-fixes.md)。
