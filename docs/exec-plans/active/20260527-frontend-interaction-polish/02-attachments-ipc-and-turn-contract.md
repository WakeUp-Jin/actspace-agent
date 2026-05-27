# 02 附件选择与 Turn 契约

## 目标

完成 `#6` 附件添加功能。点击 Composer 附件按钮后，Electron 真实环境能打开系统文件选择器；添加图片显示缩略图，普通文件显示文件名；删除后不随消息发送；发送时附件元信息进入当前 turn 的 user message 契约并可恢复展示。

## 范围

包含：

- 新增 renderer 可调用的文件选择 bridge。
- Electron main 使用系统文件选择能力选择图片和普通文件。
- 浏览器 mock 没有 preload 时提供 fallback fixture，不白屏、不无响应。
- Composer 从 demo 布尔值改成真实 attachments 数组。
- 发送消息时把 attachments 传入 `RunTurnInput`，并持久化到 `user_message.payload.attachments`。
- 恢复 session 时 `MessageBlock.kind === "user"` 能继续展示附件元信息。

不包含：

- 不实现 Agent 对附件内容的读取、OCR、图片理解或向模型上传二进制。
- 不复制文件到 app data，也不做附件生命周期管理。
- 不实现拖拽上传。
- 不改右侧文件预览面板。

## 背景

相关文档：

- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/SECURITY.md`

相关代码路径：

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/messages/UserMessage.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`

已知现状：

- `ComposerAttachment` 类型已存在，字段包括 `id`、`kind`、`name`、`path`、`mimeType`、`previewUrl`。
- `UserMessagePayload` 已支持 `attachments?: ComposerAttachment[]`。
- `createMessageBlocks` 已把 `payload.attachments` 转成 user message block。
- `RunTurnInput` 当前还没有 attachments 字段，`runTurnWithAgent` / `userMessageToEvents` 当前只持久化文本 content。

## 实施任务

### Step 1: 共享契约补齐

- 在 `RunTurnInput` 中增加 `attachments?: ComposerAttachment[]`。
- 如需新增文件选择结果类型，优先复用 `ComposerAttachment` 或定义轻量 `SelectFilesResult`，不要引入复杂文件模型。
- 更新 `packages/desktop/src/global.d.ts` 的 `window.actspace` 类型。

验收：

- TypeScript 能在 renderer / preload / main 之间识别 attachments。

### Step 2: Electron 文件选择 IPC

- 在 main 注册文件选择 IPC，例如 `dialog:select-files`。
- 使用 Electron 系统 dialog 选择文件，支持多选。
- 返回只包含必要元信息：文件名、路径、mimeType 或可推导 kind。
- 取消选择时返回空数组或明确 cancelled 结果，renderer 不产生副作用。
- 在 preload 暴露 `selectFiles()`。

验收：

- Electron 下点击附件按钮会打开系统选择器。
- 取消不会添加附件。

### Step 3: Composer 附件状态

- 将 `imageAttached` / `fileAttached` 替换为 `attachments: ComposerAttachment[]`。
- 点击附件按钮：
  - Electron 环境调用 `window.actspace.selectFiles()`。
  - 浏览器 mock 环境添加 fallback fixture 附件。
- 图片附件展示图片本体缩略图；普通文件展示文件名。
- 删除按钮默认隐藏，hover/focus 时显示。
- 删除附件后从 pending attachments 中移除。

验收：

- 可以添加一张图片和一个普通文件。
- 删除附件后 UI 和发送 payload 都不包含该附件。

### Step 4: 发送与持久化

- 扩展 `ComposerSendOptions` 或 `onSend` 参数，让 attachments 随发送提交。
- `App.handleSend` 构造 streaming user block 时带 attachments。
- `RunTurnInput` 传给 main 时带 attachments。
- `runAndPersistTurn` 传给 `runTurnWithAgent` 时带 attachments。
- `runTurnWithAgent` / `buildSessionEvents` / adapter 层将 attachments 写入 `user_message` payload。
- 保持模型实际输入仍只使用 `userInput` 文本，避免本计划扩大为多模态实现。

验收：

- 发送后当前 user message 能显示附件。
- session 恢复后 user message 仍能显示附件元信息。

### Step 5: 测试

- renderer 测试覆盖添加 mock 附件、删除附件、发送 payload。
- shared / agent-core 测试覆盖 `RunTurnInput.attachments` 最终进入 `user_message.payload.attachments`。

## 风险

- 风险：暴露本地绝对路径可能带来隐私风险。
  - 缓解：只在本地 session 持久化元信息；history 和日志不要记录用户选择的敏感路径全文。
- 风险：把附件误当成模型输入会扩大实现面。
  - 缓解：本计划只传递元信息和 UI 展示，不实现内容读取或模型上传。
- 风险：浏览器 mock 无 Electron dialog。
  - 缓解：明确 fallback fixture，保证 UI 可验收。

## 验证方式

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core test -- bridge` 或覆盖附件持久化的等价测试。
- `pnpm --filter @actspace/desktop typecheck`
- 浏览器 mock 验证 fallback 附件添加/删除。
- Electron 真实验证系统文件选择、取消选择、发送后恢复。

## 进度记录

- [ ] 完成共享契约补齐。
- [ ] 完成 Electron 文件选择 IPC。
- [ ] 完成 Composer 附件状态与展示。
- [ ] 完成发送和持久化链路。
- [ ] 完成测试和 Electron 真实验证。

## 决策记录

- 2026-05-28：附件第一版只做选择、展示、删除和 user message 元信息持久化，不做文件内容读取、上传或模型多模态输入。
