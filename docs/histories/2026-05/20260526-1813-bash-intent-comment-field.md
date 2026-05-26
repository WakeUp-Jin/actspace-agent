# Bash 工具新增 intent 可读性字段

## 背景

`bash` 工具触发的命令对用户来说常常不直观（`pnpm --filter ... && pipe | head`），审核面板上的 `Reason` 字段只说明"为什么需要审核"（例如不在 allowlist、或开启了 `ACTSPACE_BASH_ALWAYS_ASK`），并不解释命令本身在做什么。用户希望参考 Cursor 的做法：让模型每次调用 `bash` 时附带一段人话描述，前端在审核卡片和历史展开视图里以"代码注释"风格显示。

设计上和 Cursor 全局策略选择器 / Allow 子命令拆分授权这些更大的改动分开做，本次只引入一个可选字段并把它呈现出来。

## 设计要点

- `bash` 工具 schema 新增 **可选** 参数 `intent`，向后兼容；description 文案仍英文（与其它字段一致），但显式要求模型把 **值** 写成简体中文，便于中文界面用户阅读。
- 前端只在两个地方渲染 intent：
  - 审核态卡片：`$ command` 行**上方**插入 `# {intent}` 行。
  - 执行态展开后：在 `<pre>` 顶部拼一行 `# {intent}`，与现有 `# cwd:` / `# exit:` 风格一致。
- 折叠条不显示 intent，保持紧凑。
- intent 注释样式：柔和灰、`font-family: mono`、`font-style: italic`，正常换行不截断（intent ≤60 字本身已足够短）。
- 没有 intent 时整行不渲染，回到现状外观。

## 数据流

`LLM` → `args.intent` → `bridge.createToolUiPreview()` 写入 `BashPreview.intent` → `tool_started` 事件携带 preview → 前端 `ToolEntry.preview.intent` → `toolEntryToBlock` 透传到 `MessageBlock` → `BashRunBlock` 渲染。

审核态走的是 `tool_started` 提前下发的 preview，`tool_approval_required` 事件不需要带 intent。

## 主要受影响文件

- `packages/agent-core/src/tools/tools/bash/definition.ts`：schema 加可选 `intent` 字段。
- `packages/agent-core/src/engine/bridge.ts`：`createToolUiPreview` 的 `case "bash"` 从 args 读取 intent 并写入 preview。
- `packages/shared/src/session.ts`：`BashPreview` 加 `intent?: string`（`MessageBlock` 的 bash 变体直接 spread `BashPreview`，自动继承）。
- `packages/desktop/src/renderer/App.tsx`：`toolEntryToBlock` 的 bash 分支透传 `preview.intent`。
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`：
  - `BashApprovalBlock` 在 `$ command` 上方插入 `# intent` div。
  - `BashExecutionBlock` 展开后的 `<pre>` 顶部拼入 `# intent` 行（带 `bash-intent-comment` span，让斜体样式作用到 mono 文本上）。
- `packages/desktop/src/renderer/styles.css`：新增 `.bash-intent-comment`、`.bash-intent-comment--block`、`.bash-intent-hash`。
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`：成功态和审核态两个 mock 样例都补了中文 intent。

## 验证

- `pnpm --filter @actspace/shared build && pnpm --filter @actspace/agent-core build`
- `pnpm typecheck` 通过（shared / agent-core / desktop 三包）
- `pnpm --filter @actspace/agent-core test`：233/233 通过
- `pnpm --filter @actspace/desktop test`：streaming 用户消息 7/7 通过

## 不在本次范围（后续可独立开计划）

- 借鉴 Cursor 的全局执行策略下拉（Autorun / Allowlist / Sandbox / Run Everything）。
- 借鉴 Cursor 的 Allow 子命令前缀拆分授权。
- 当前占位的 `Allowlist ›` 按钮是否需要替换成上面这些更精细的策略入口。
