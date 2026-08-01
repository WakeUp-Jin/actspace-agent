# 02 附件选择与 Turn 契约

## 目标

完成 `#6` 附件添加功能。点击 Composer `+` 菜单里的 `Attach files` 或把文件拖入 Composer 后，Electron 真实环境能选择 / 接收本地文件；添加图片显示缩略图，普通文件显示文件名；删除后不随消息发送；发送时附件元信息进入当前 turn 的 user message 契约并可恢复展示。普通文件以路径元信息交给 Agent，需要内容时由 Agent 使用 `read_file` 读取；图片在发送前走一次后台视觉分析工具，生成文本后拼入当前 turn 的模型输入。

## 范围

包含：

- 新增 renderer 可调用的文件选择 bridge。
- Electron main 使用系统文件选择能力选择图片和普通文件。
- Composer `+` command menu 新增 `Attach files` 菜单项，不把 `+` 退回单一附件按钮。
- 支持把文件拖拽到 Composer 面板添加附件。
- 浏览器 mock 没有 preload 时提供 fallback fixture，不白屏、不无响应。
- Composer 从 demo 布尔值改成真实 attachments 数组。
- 发送消息时把 attachments 传入 `RunAgentInput`，并持久化到 `user_message.payload.attachments`。
- 恢复 session 时 `MessageBlock.kind === "user"` 能继续展示附件元信息。
- 普通文件附件在当前 turn 的 Agent 输入中追加结构化附件清单，提示可用 `read_file` 读取对应路径。
- 图片附件发送前由 main / agent-core 调用已有视觉分析能力（`analyze_media` 底层 Kimi vision），把分析结果作为文本附加到当前 turn 输入；renderer 通过 runtime stream event 展示该工具正在执行，但该临时工具状态不作为普通 tool log 持久化。
- 图片预分析结果不写成 assistant message，也不覆盖用户原始 `content`；持久化到 `user_message.payload` 的结构化字段中，并在构造模型输入时与用户文本一起注入 DeepSeek。

不包含：

- 不复制文件到 app data，也不做附件生命周期管理。
- 不改右侧文件预览面板。
- 不把图片二进制 / base64 持久化到 `session.jsonl`。
- 不把普通文件内容自动读入模型上下文。
- 不实现 DeepSeek 原生图片输入；等 DeepSeek 具备原生视觉能力后另起计划替换预分析链路。

## 背景

相关文档：

- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/SECURITY.md`

相关代码路径：

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-run.ts`
- `packages/desktop/src/main/media-analysis.ts`（如需拆出图片预分析服务）
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/tools/tools/analyze-media/**`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/messages/UserMessage.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

已知现状：

- `ComposerAttachment` 类型已存在，字段包括 `id`、`kind`、`name`、`path`、`mimeType`、`previewUrl`。
- `UserMessagePayload` 已支持 `attachments?: ComposerAttachment[]`。
- `createMessageBlocks` 已把 `payload.attachments` 转成 user message block。
- `RunAgentInput` 当前还没有 attachments 字段，`runAgentWithBridge` / `userMessageToEvents` 当前只持久化文本 content。
- `Composer` 当前左侧 `+` 已是 command menu；附件入口应作为菜单项接入，而不是替换 `+` 的语义。
- `read_file` 实现已可读取用户提供的绝对路径，但工具描述仍偏向 workspace，需要同步调整描述，避免模型不知道可以读取附件路径。
- `ImageContent` 和 LLM provider 转换层已具备图片内容类型，但 DeepSeek 当前不可依赖原生图片理解；已有 `analyze_media` 工具可通过 Kimi vision 把图片转成文本摘要。
- `analyze_media` 当前 `previewKind` 是 `generic`，可作为通用工具行展示，但不具备 `Read` / `Grep` 等 typed preview 的 running 状态语义；图片预分析体验应补 typed preview 或等价的 runtime-only tool line，而不是新增重型组件。

## 实施任务

### Step 1: 共享契约补齐

- 在 `RunAgentInput` 中增加 `attachments?: ComposerAttachment[]`。
- 在 `UserMessagePayload` 中增加图片预分析结果字段，例如 `attachmentAnalyses?: AttachmentAnalysis[]`；字段与附件 id 绑定，保存 `toolName: "analyze_media"`、`status`、`summary?`、`errorMessage?`、`analyzedAt?` 等文本元信息。
- 定义轻量 `SelectFilesResult = { canceled: boolean; attachments: ComposerAttachment[] }`，不要引入复杂文件模型。
- 保持 `ComposerAttachment` 只保存元信息：`id`、`kind`、`name`、`path`、`mimeType`、`previewUrl?`；不要增加二进制字段。
- 更新 `packages/desktop/src/global.d.ts` 的 `window.actspace` 类型。

验收：

- TypeScript 能在 renderer / preload / main 之间识别 attachments。

### Step 2: Electron 文件选择 IPC

- 在 main 注册文件选择 IPC，例如 `dialog:select-files`。
- 使用 Electron 系统 dialog 选择文件，支持多选。
- 返回只包含必要元信息：文件名、路径、mimeType 或可推导 kind。
- 取消选择时返回空数组或明确 cancelled 结果，renderer 不产生副作用。
- 在 preload 暴露 `selectFiles()`。
- 如拖拽 `File` 对象在 renderer 侧无法稳定拿到真实路径，则在 preload 暴露最小 `getPathForFile(file)` 辅助；该 API 只返回路径字符串，不读取文件内容。

验收：

- Electron 下点击附件按钮会打开系统选择器。
- 取消不会添加附件。
- Electron 下拖拽文件能拿到真实路径并形成附件元信息。

### Step 3: Composer 附件状态

- 将 `imageAttached` / `fileAttached` 替换为 `attachments: ComposerAttachment[]`。
- 点击 `+` 菜单里的 `Attach files`：
  - Electron 环境调用 `window.actspace.selectFiles()`。
  - 浏览器 mock 环境添加 fallback fixture 附件。
- 拖拽文件到 Composer 面板：
  - `dragover` / `drop` 阻止浏览器默认打开文件。
  - drop 时把 `DataTransfer.files` 转成 attachments。
  - 拖拽悬停时显示轻量高亮态，不新增大面积视觉设计。
- 图片附件展示图片本体缩略图；普通文件展示文件名。
- 删除按钮默认隐藏，hover/focus 时显示。
- 删除附件后从 pending attachments 中移除。

验收：

- 可以添加一张图片和一个普通文件。
- 可以通过拖拽添加文件。
- 删除附件后 UI 和发送 payload 都不包含该附件。

### Step 4: 发送与持久化

- 扩展 `ComposerSendOptions` 或 `onSend` 参数，让 attachments 随发送提交。
- `App.handleSend` 构造 streaming user block 时带 attachments。
- `RunAgentInput` 传给 main 时带 attachments。
- `runAndPersistTurn` 传给 `runTurnWithAgent` 时带 attachments。
- `runTurnWithAgent` / `buildSessionEvents` / adapter 层将 attachments 写入 `user_message` payload。
- 普通文件附件不自动读内容；在当前 turn 的 Agent 输入中追加结构化附件清单，提示 Agent 可按需 `read_file`。
- 图片附件发送前先执行视觉预分析，把 `analyze_media` 的文本结果追加到当前 turn 的 Agent 输入；持久化只保存附件元信息和 `user_message.payload.attachmentAnalyses` 文本结果 / 失败说明，不保存图片二进制，也不把预分析写成普通 `tool_call` / `tool_result` 历史事件。
- `read_file` 工具描述同步允许读取用户明确附加的本地路径。

验收：

- 发送后当前 user message 能显示附件。
- session 恢复后 user message 仍能显示附件元信息。
- 普通文件附件对应的本轮 Agent 输入包含附件路径清单。
- 图片附件发送时先出现视觉分析工具调用状态，分析结果文本进入 DeepSeek 当前 turn 输入。

### Step 5: 图片预分析流式体验

- 图片附件存在时，在真正调用 DeepSeek turn 前，由 main / agent-core 执行图片预分析。
- renderer 使用现有 `RuntimeStreamEvent` 的 `tool_started` / `tool_finished` 或等价新增事件显示“图片分析中”的工具调用状态，视觉上与 Agent 工具调用一致。
- 该工具状态是 runtime-only：只用于当前发送过程的用户感知，不落成普通 session `tool_call` / `tool_result` 事件；历史恢复时不重新显示一条独立的 `Analyze image ...` 工具日志。
- 为 `analyze_media` 补 typed preview 或等价展示语义，避免继续使用 `generic` fallback。建议显示为 `Analyze image screenshot.png` / `图片分析中 screenshot.png`，复用现有工具行 running shimmer，不新增图片分析专属组件。
- 预分析失败时：
  - 不阻断用户消息持久化和普通文本 turn。
  - 在追加文本和 `attachmentAnalyses` 中写入明确失败说明，例如“图片分析失败，模型只能看到附件路径和文件名”。
  - UI 显示失败的 runtime-only 工具状态，并在用户气泡的图片分析区展示轻量失败说明。
- 预分析文本只作为当前 turn 的附加上下文，不改用户气泡原文 `content`，也不伪装成用户亲手输入的文本。
- 历史恢复时，用户气泡展示附件和对应的“图片分析结果”区域；长摘要可默认折叠。该区域来自 `user_message.payload.attachmentAnalyses`，不是 assistant 回复。

验收：

- 发送含图片附件的消息时，用户能看到图片分析工具处于 running / completed 或 failed 状态。
- DeepSeek 收到的 user input 包含图片分析摘要。
- session 恢复后，用户气泡能展示附件和对应的图片分析结果 / 失败说明。
- session 恢复后，不额外显示一条独立的图片分析工具日志。
- `session.jsonl` 不保存图片 base64。

### Step 6: 测试

- renderer 测试覆盖 `Attach files` 菜单项、添加 mock 附件、拖拽添加、删除附件、发送 payload。
- app / streaming 测试覆盖发送时 current user block 和 `RunAgentInput.attachments`。
- shared / agent-core 测试覆盖 `RunAgentInput.attachments` 最终进入 `user_message.payload.attachments`。
- shared / agent-core 测试覆盖图片预分析结果进入 `user_message.payload.attachmentAnalyses`，且不进入 assistant message 原文。
- agent-core / main 测试覆盖普通文件附件清单注入、图片预分析文本注入、图片二进制不持久化、图片预分析不落普通 tool log。

## 风险

- 风险：暴露本地绝对路径可能带来隐私风险。
  - 缓解：只在本地 session 持久化元信息；history 和日志不要记录用户选择的敏感路径全文。
- 风险：把附件误当成模型输入会扩大实现面。
  - 缓解：普通文件只传路径元信息和附件清单；图片只做发送前预分析，不持久化二进制，不实现 DeepSeek 原生视觉输入。
- 风险：浏览器 mock 无 Electron dialog。
  - 缓解：明确 fallback fixture，保证 UI 可验收。
- 风险：让 Agent 自主调用图片工具会导致第一轮 DeepSeek 看不到图片内容，工具调用质量不稳定。
  - 缓解：图片附件采用发送前预分析，先得到文本摘要，再把摘要交给 DeepSeek。
- 风险：Kimi vision 不可用会阻断图片工作流。
  - 缓解：预分析失败不阻断 turn；UI 和追加上下文都明确说明失败状态。

## 验证方式

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core test -- bridge` 或覆盖附件持久化的等价测试。
- `pnpm --filter @actspace/desktop typecheck`
- 浏览器 mock 验证 fallback 附件添加、拖拽、删除、发送 payload。
- Electron 真实验证系统文件选择、取消选择、拖拽添加、发送后恢复。
- Electron / 日志验证图片附件会先显示 runtime-only 视觉分析工具调用，再调用主模型。
- 恢复历史 session 验证用户气泡展示图片分析结果，但不重复展示独立 `Analyze image ...` 工具日志。

## 进度记录

- [x] 完成共享契约补齐。
- [x] 完成 Electron 文件选择 IPC。
- [x] 完成 Composer 附件状态与展示。
- [x] 完成发送和持久化链路。
- [x] 完成图片预分析工具调用与流式展示。
- [x] 完成自动化测试覆盖。
- [ ] 完成 Electron 真实验证：系统文件选择、取消选择、拖拽添加、发送后恢复；当前因本任务外 Sidebar runtime error 阻塞完整验收。

## 当前验证记录

- 2026-06-02：`pnpm --filter @actspace/shared typecheck` 通过。
- 2026-06-02：`pnpm --filter @actspace/agent-core typecheck` 通过。
- 2026-06-02：`pnpm --filter @actspace/desktop typecheck` 通过。
- 2026-06-02：`pnpm --filter @actspace/agent-core test -- read-boundary.test.ts adapters.test.ts bridge.test.ts streaming-preview-extractors.test.ts` 通过。
- 2026-06-02：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/app-streaming-user-message.test.tsx` 通过。
- 2026-06-02：`pnpm --filter @actspace/desktop test -- composer.test.tsx app-streaming-user-message.test.tsx` 在当前 vitest 配置下实际跑完整 desktop 测试集；目标附件相关测试通过，但 `src/renderer/test/sidebar.test.tsx` 的 pin 断言失败，属于本任务外的既有/并行红点，未在本轮改动中处理。
- 2026-06-02：尝试 Electron 真实验收时，`pnpm --filter @actspace/desktop dev` 因 5173 端口已有 dev server 被占用而失败；随后复用现有 Electron 窗口，确认 Composer 可见、已有附件 chip 可删除。继续验证文件选择/发送前，现有 dev server HMR 触发 `Sidebar.tsx` runtime error（`dotClass` / session map undefined），Electron 窗口变为空白页。该错误不在本附件任务改动文件内，完整 Electron 验收暂缓。

## 决策记录

- 2026-05-28：附件第一版只做选择、展示、删除和 user message 元信息持久化，不做文件内容读取、上传或模型多模态输入。
- 2026-06-02：因 DeepSeek 当前不能可靠原生识别图片，图片附件不直接作为 DeepSeek 多模态输入；改为发送前调用视觉分析工具生成文本摘要，再把摘要附加到当前 turn 输入。普通文件仍只传路径元信息，由 Agent 按需调用 `read_file`。
- 2026-06-02：附件入口接入 Composer `+` command menu 的 `Attach files` 项，同时支持拖拽到 Composer 添加；不改变 `+` 的 command menu 总入口语义。
- 2026-06-02：图片预分析的运行状态只作为 runtime stream 体验，不持久化为普通 tool log；预分析摘要 / 失败说明持久化到 `user_message.payload.attachmentAnalyses`，历史 UI 在用户气泡中展示“图片分析结果”，避免把系统生成内容写成 assistant 回复或污染用户原始 `content`。
