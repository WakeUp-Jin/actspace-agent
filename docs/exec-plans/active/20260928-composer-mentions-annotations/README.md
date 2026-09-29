# Composer 文件引用与回复批注 — 执行计划总览

状态：执行中（交互模式）。当前进度：M0、P0、PA 已实施（PA.8 Electron 验收待确认，见执行过程步骤 6），下一步 PB。

- 分支 / worktree：`feat/composer-file-mentions-annotations` @ `../actspace-agent-composer-mentions`（从 `main@186a18b` 切出）。
- 设计真源：[Composer 文件引用与回复批注设计](../../../design-docs/frontend/front-composer-file-mentions-and-response-annotations.md)。设计文档顶部的「实施决策修订」优先于正文中与之冲突的旧描述。
- 执行记录：[`docs/exec-runs/20260928-composer-mentions-annotations/`](../../../exec-runs/20260928-composer-mentions-annotations/execution-process.md)。
- 执行模式：交互模式。每个子计划完成后停下，给出验证结果，确认后再进入下一个。

## 为什么拆成三份

回复批注（A）不依赖把 textarea 换成编辑器；`@` 文件引用（B）依赖。两者只共享「用户消息里多出来的结构化内容」这一层契约。按 `docs/PLANS_GUIDE.md`，先落共享契约，再拆两个可独立推进的子计划：

| 顺序 | 子计划 | 产物 | 依赖 |
|---|---|---|---|
| 1 | [P0 内容块契约](p0-content-contract.md) | shared 类型与校验、main 发送链路、模型渲染、历史投影 | 无 |
| 2 | [PA 回复批注](pa-response-annotations.md) | 回复选区 → Composer 引用托盘 → 发送 → 历史摘要与编号 marker | P0 |
| 3 | [PB 编辑器与 `@` 文件引用](pb-editor-file-mentions.md) | ProseMirror 编辑器替换 textarea、文件搜索 IPC、mention 节点与发送 | P0 |

PA 与 PB 都只依赖 P0，彼此文件范围基本不重叠（冲突点只有 `Composer.tsx` 的发送参数和 `App.tsx` 的 `handleSend`，按先 PA 后 PB 顺序合入）。默认串行执行：P0 → PA → PB。

## 已确认的决策（2026-09-28）

1. **持久化走内容块，不新增 journal 事件或 payload 字段。** 用户消息的 surface content 在现有 `text` / `artifact` 块之外新增两种块：`file-reference` 和 `response-excerpt`。journal 编码、surface 校验、旧 session 都不用改；模型侧由 `toLlmContent` 渲染，context 用量由现有 `request/context` 快照自动计入。
2. **编辑器 schema 只有 `paragraph` / `text` / `hard_break` / `file_mention`。** 不做粗体、斜体、链接、代码块等 mark；Markdown 仍按原文发送。ProseMirror document 不跨 IPC、不持久化：发送和草稿只保存 `plainText`（mention 降级为 `@relativePath`）加 `fileReferences` 列表，需要时用 `plainTextToDoc(text, fileReferences)` 重建。
3. **文件引用只携带 `relativePath` + `displayName`，不带 `workspaceId`。** main 发送时按 session 的 workspace 重新解析，做字面 + realpath 双重校验。
4. **批注定位用「可见文本偏移 + 前后文」。** 不做 Markdown 源码到 DOM 的映射表。assistant 回复完成后内容不再变化，偏移在渲染器不变时稳定；校验失败时用前后文唯一匹配兜底，仍失败则进入 unresolved，不画错位 marker。
5. **编辑器用原生 ProseMirror**（约 64 KB gzip、6 个包），不用 Tiptap（约 138 KB gzip、30 个包）。
6. **文件搜索用 `git ls-files`，非 git 仓库时退回有上限的 Node 目录遍历**，在 main 按 workspace 缓存并做模糊匹配。不依赖 PATH 上的 `rg`。V1 只返回文件，不返回目录。
7. **模型只看到「选中原文 + 用户评论」**，不暴露内部 message id、编号或 UI 文案。
8. **已发送批注只读。** 历史 marker 只提供查看和「复制到草稿」，不提供删除，不引入改写历史的事件。
9. **Chat 形态**：禁用 `@` 文件引用（main 也拒绝）；允许回复批注，因为批注只引用对话内容，不接触工作区。

## 全局约束（每个子计划都适用）

- 执行前先读仓库根 `AGENTS.md`，再按子计划「必读」列表读文档。
- renderer 不新增 `fs` / `path` 调用；不在 Markdown 组件里写 journal；不用全局可变单例保存批注状态。
- 所有新颜色走主题 token，改样式前读 `docs/design-docs/frontend/front-主题与配色规范.md`；浅色 / 深色都要验。
- 日志只记录引用数量、长度和校验结果，不记录选中原文、评论或文件内容。
- 选中文本、评论、文件名、路径一律作为不可信文本，用 React text children 渲染，不用 `dangerouslySetInnerHTML`。

## 统一验证命令

每个子计划收尾都跑：

```sh
pnpm --filter @actspace/shared test
pnpm --filter @actspace/client test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/desktop test        # 基线已知失败：workspace-git-context-service「non-repository」1 条
pnpm --filter @actspace/desktop typecheck
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:docs
```

全部完成后再跑一次 `pnpm typecheck` 和 `pnpm --filter @actspace/desktop build`。

## 进度

- [x] M0：基线记录；编辑器依赖 PoC（原生 ProseMirror 在 jsdom 可用，结论见执行过程）。
- [x] P0：内容块契约（2026-09-28，详见执行过程步骤 4）。
- [x] PA：回复批注（2026-09-28，详见执行过程步骤 6；PA.8 Electron 验收待用户确认）。
- [ ] PB：编辑器与 `@` 文件引用。
- [ ] 收尾：Electron 真实验收、执行摘要、history、设计文档状态更新，计划移入 `completed/`。
