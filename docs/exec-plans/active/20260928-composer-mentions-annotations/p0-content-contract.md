# P0：用户消息内容块契约

状态：已实施（2026-09-28）；「发送参数带上引用」的 renderer 断言随 PA.4 / PB.5 补齐。上级：[总览](README.md)。

## 目标

让一次发送除了正文和附件，还能携带「文件引用」和「回复批注」两类结构化上下文，并打通从 renderer 到 journal、模型请求和历史投影的整条链路。本计划不做任何 UI；UI 由 PA / PB 接入。

完成后：

- `RunAgentInput` 多出可选的 `fileReferences` / `responseAnnotations`。
- main 校验后把它们写成用户消息里的 `file-reference` / `response-excerpt` 内容块。
- 模型看到可读的引用说明；context 用量自动包含这些文本。
- 历史投影把它们还原到 `MessageBlock.user`，正文 `content` 不受影响。
- 旧 session、旧 `RunAgentInput` 行为完全不变。

## 必读

- `AGENTS.md`、`docs/SECURITY.md`、`docs/CODING_BEHAVIOR.md`。
- 代码：`packages/shared/src/ipc.ts`（`RunAgentInput`，约 134 行）、`packages/shared/src/session.ts`（`UserMessagePayload` 约 185 行、`MessageBlock` user 约 696 行）、`packages/shared/src/chat-attachments.ts`（`RunAgentPreparationFailure`）、`apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（`agent:run` handler 约 222 行、`toRunContent` 约 759 行）、`packages/core/agent-loop/src/loop.ts`（`toLlmContent` 约 393 行）、`packages/client/src/sessions/chat.ts`（`projectSurfaceNode` 约 185 行、`contentText` / `attachmentViews`）、`packages/shared/src/session-selectors.ts`（`createMessageBlocks` 约 371 行）、`packages/shared/src/session-transcript.ts`、`apps/desktop/src/main/artifact-context-menu-service.ts`（realpath 双重校验的参考写法）。

## 契约（以 `packages/shared/src/composer-content.ts` 为唯一真源）

```ts
export const COMPOSER_REFERENCE_LIMITS = {
  maxFileReferences: 20,
  maxRelativePathLength: 1024,
  maxDisplayNameLength: 255,
  maxResponseAnnotations: 20,
  maxSelectedTextCodePoints: 8000,
  maxContextCodeUnits: 64,       // prefixContext / suffixContext 各自上限
  maxCommentCodePoints: 2000,
} as const;

export type FileReference = {
  relativePath: string;   // POSIX 分隔符，相对 session workspace，不以 / 开头，不含 ..
  displayName: string;    // 仅用于 UI，不是身份
};

export type ResponseAnnotationReference = {
  annotationId: string;
  assistantMessageId: string;   // 目标回复的 MessageBlock.id（形如 v2-<seq>）
  selectedText: string;
  startOffset: number;          // 回复「可批注可见文本」中的 UTF-16 偏移，start < end
  endOffset: number;
  prefixContext: string;
  suffixContext: string;
  comment?: string;
};

// 写入用户消息 surface content 的块
export type FileReferenceContentBlock = { type: "file-reference" } & FileReference;
export type ResponseExcerptContentBlock = { type: "response-excerpt" } & ResponseAnnotationReference;

export type ComposerReferenceIssue = {
  code:
    | "invalid_reference"            // 结构不合法、字段缺失、偏移非法
    | "too_many_references"
    | "file_references_not_allowed"  // Chat 形态
    | "file_not_found"
    | "file_outside_workspace"
    | "not_a_file"
    | "annotation_source_missing"    // assistantMessageId 不属于当前 session
    | "annotation_text_too_long"
    | "annotation_comment_too_long";
  kind: "file" | "annotation";
  index?: number;
  relativePath?: string;
  limit?: number;
};
```

`RunAgentInput` 新增 `fileReferences?: FileReference[]`、`responseAnnotations?: ResponseAnnotationReference[]`。
`RunAgentPreparationFailure` 改为两种失败的联合：现有附件失败（`error: ChatAttachmentIssue`）不变，新增 `{ status: "rejected"; sessionId; agentRunId; referenceIssue: ComposerReferenceIssue }`。
`UserMessagePayload` 与 `MessageBlock` 的 user 分支新增 `fileReferences?`、`responseAnnotations?`。

**块顺序**：`text`（有正文时）→ `file-reference`* → `response-excerpt`* → 附件块。无附件且无引用时 content 仍是纯字符串（与现在一致）。

**模型渲染**（`toLlmContent`，渲染函数放在 `composer-content.ts` 供 loop 调用）：

```text
<workspace_file_reference path="src/components/Composer.tsx" />
The user referenced this workspace file. It has not been read; use read tools if its content is needed.

<quoted_assistant_excerpt>
…selectedText…
</quoted_assistant_excerpt>
<user_comment>…comment…</user_comment>        （无评论时省略这一行）
```

同一条消息有多个文件引用时，说明句只出现一次。属性值用 `JSON.stringify` 转义，与现有 `attached_file` 写法一致。

## 任务

### P0.1 shared 类型、校验与块读写

- 新增 `packages/shared/src/composer-content.ts`，从 `packages/shared/src/index.ts` 导出。
- 函数：
  - `normalizeWorkspaceRelativePath(path: string): string | null`：统一 `\` 为 `/`，去掉开头的 `./`；拒绝空串、绝对路径（`/`、盘符、`\\`）、`file://` 等 URL、NUL 字符、任意 `..` 段、超长。
  - `validateFileReferences(refs: unknown): { ok: true; value: FileReference[] } | { ok: false; issue: ComposerReferenceIssue }`：逐条规范化、按 `relativePath` 去重并保持顺序、检查数量。
  - `validateResponseAnnotations(anns: unknown)`：同样返回结构；检查整数偏移、`start < end`、`selectedText.trim()` 非空、各字段长度（码点 / 码元按上面定义）、数量；按 `assistantMessageId + startOffset + endOffset` 去重。
  - `fileReferenceBlocks(refs)`、`responseExcerptBlocks(anns)`：生成内容块。
  - `readFileReferenceBlocks(content: unknown): FileReference[]`、`readResponseExcerptBlocks(content: unknown): ResponseAnnotationReference[]`：从 surface content 里宽松读取，不合法的块跳过。
  - `renderFileReferencesForModel(refs)`、`renderResponseExcerptForModel(ann)`：生成上面的模型文本。
  - `formatComposerReferenceIssue(issue): string`：中文错误文案，比如「文件“src/a.ts”不存在或已被移动」「引用的回复已不在当前会话中」。
- 修改 `packages/shared/src/ipc.ts`、`session.ts`、`chat-attachments.ts` 按上面的契约加字段。
- 测试 `packages/shared/src/test/composer-content.test.ts`，至少覆盖：
  - 路径：`src/a.ts` 通过；`./src/a.ts` → `src/a.ts`；`src\\a.ts` → `src/a.ts`；`/etc/passwd`、`C:\\x`、`../x`、`a/../../x`、`file:///x`、含 NUL、超长 全部拒绝。
  - 文件引用去重、超过 20 条返回 `too_many_references`。
  - 批注：`start >= end`、非整数、空白文本、8001 码点文本、2001 码点评论、21 条 均返回对应 code；emoji / 中文按码点计长度。
  - 块读写往返：生成的块被 `read*` 完整读回；混入 `text` / `artifact` / 非法块时只读出合法项。
  - 模型渲染 golden：无评论、有评论、多个文件引用。

验证：`pnpm --filter @actspace/shared test`、`pnpm --filter @actspace/shared typecheck`。

### P0.2 main 发送链路

- 新增 `apps/desktop/src/main/workspace-file-reference.ts`：
  - `resolveWorkspaceFileReference(workspaceRoot: string, relativePath: string): Promise<{ ok: true } | { ok: false; code: "file_not_found" | "file_outside_workspace" | "not_a_file" }>`。
  - 步骤：再次 `normalizeWorkspaceRelativePath` → 字面拼接后确认仍在 root 内 → `realpath(root)` 与 `realpath(target)` 比较确认仍在 root 内（挡住指向外部的符号链接）→ `stat` 确认是普通文件。不读文件内容。
- 修改 `fixed-renderer-ipc.ts`：
  - 把 `toRunContent` 的输入改为一个对象（`userInput`、`attachments`、`fileReferences`、`responseAnnotations`），按「块顺序」拼内容；无附件无引用时仍返回字符串。
  - 在导入附件之前做引用校验，任一失败立即返回 `{ status: "rejected", referenceIssue }`，不导入附件、不写 journal：
    1. shared 结构校验；
    2. `snapshot.agentForm === "chat"` 且有文件引用 → `file_references_not_allowed`；
    3. 每个文件引用用 `snapshot.workspaceRoot` 调 `resolveWorkspaceFileReference`；
    4. 每个批注的 `assistantMessageId` 必须对应当前 session 投影里一条 assistant 消息（用 `registry.readSessionProjection` 读出的事件核对 `v2-<seq>` 指向 `assistant/message`；实现时确认具体访问方式，并写入执行过程）。
  - 附件校验失败的现有返回保持不变。
- 测试：
  - `apps/desktop/src/main/test/workspace-file-reference.test.ts`：临时目录里验证普通文件通过；不存在、目录、`../outside`、指向 workspace 外的符号链接、指向 workspace 内的符号链接（通过）。
  - 在现有 runtime-v2 IPC 测试（沿用 `handlers` Map mock 的写法）里补：有引用时 `registry.runTurn` 收到的 content 块顺序正确；Chat 形态带文件引用被拒且 `runTurn` 未被调用；批注指向不存在的回复被拒；引用校验失败时附件没有被导入。

验证：`pnpm --filter @actspace/desktop test -- workspace-file-reference runtime-v2`。

### P0.3 模型渲染

- 修改 `packages/core/agent-loop/src/loop.ts` 的 `toLlmContent`：`file-reference` 块（同一条消息内合并成一段）和 `response-excerpt` 块按契约渲染成 text；不再落入末尾的 `JSON.stringify(block)` 兜底。
- 压缩摘要（`packages/compaction/src/summarizer.ts`）目前对非 runtime-context 块整体 `JSON.stringify`，新块会原样保留在摘要输入里，不改；补一条测试确认新块不会被当成 runtime-context 过滤掉。
- 测试：在 `packages/core/agent-loop/src/test/` 增加用例，构造带两种新块的用户 surface，断言发给 LLM 的 content 文本与 golden 一致，且 `request/context` 快照中包含这段文本（证明 context 用量计入）。

验证：`pnpm --filter @actspace/core-agent-loop test`、`pnpm --filter @actspace/compaction test`（若该包无测试脚本则在执行过程中注明）。

### P0.4 历史投影与 transcript

- `packages/client/src/sessions/chat.ts` 的 `projectSurfaceNode`：user 分支在 payload 中加 `fileReferences: readFileReferenceBlocks(node.content)`、`responseAnnotations: readResponseExcerptBlocks(node.content)`，为空时不写字段。`contentText` 已经忽略未知块类型，不改，并用测试锁住「正文不含引用内容」。
- `packages/shared/src/session-selectors.ts` 的 `createMessageBlocks`：user 分支透传两个字段。
- `packages/shared/src/session-transcript.ts`：在 Attachments 之后追加 `Referenced files:` 路径列表和 `Quoted replies: N`（只写数量，不重复选中原文）。
- 测试：
  - `packages/client/src/test/`：旧 journal fixture 投影结果与改动前完全一致；新 fixture（正文 + 2 个文件引用 + 1 个批注 + 1 张图片）投影出正确的 content / attachments / fileReferences / responseAnnotations。
  - `session-selectors`、`session-transcript` 对应测试补新字段用例。

验证：`pnpm --filter @actspace/client test`、`pnpm --filter @actspace/shared test`。

### P0.5 renderer 透传（无 UI）

- `apps/desktop/src/renderer/components/Composer.tsx`：`ComposerSendOptions` 加 `fileReferences?`、`responseAnnotations?`（本计划不产生这些值）。
- `apps/desktop/src/renderer/App.tsx` 的 `handleSend`：把两个字段放进 `RunAgentInput`；乐观 `userBlock` 同时带上；`rejected` 分支识别 `referenceIssue`，用 `formatComposerReferenceIssue` 生成 `draftRestore.error`。
- `ComposerDraftRestore` 加 `fileReferences?`、`responseAnnotations?`，在两处恢复点（rejected、抛错且未持久化）原样带回。
- 测试：`app-streaming-user-message.test.tsx` 或新文件里，mock `runAgent` 断言收到的 `RunAgentInput` 带两个字段；返回 `referenceIssue` 时 draftRestore 带回原值和错误文案。

验证：`pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/desktop typecheck`。

## 完成标准

- 上面各测试通过；desktop 全量测试只剩基线那 1 条已知失败。
- 手工构造一次带两种引用的 `agent:run`（测试内完成即可），journal 中的用户 surface content 块顺序符合契约。
- 执行过程记录 P0.2 第 4 步最终采用的 assistant 消息核对方式。

## 回退

P0 全部是新增可选字段和新块类型。若需要撤回，删除 `composer-content.ts` 及其引用即可；已写入 journal 的新块在旧代码里会走 `toLlmContent` 的 JSON 兜底和 `contentText` 的忽略分支，不会崩溃。
