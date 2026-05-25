# Grep/Glob rg 工具与 UI 改造计划

## 目标

将 actspace-agent 中新增的 `grep` 和 `glob` 工具收敛成独立、可测试、用户可见语义清楚的文件检索能力：

- 后端 Grep/Glob 都优先使用 ripgrep。
- 两个工具共享 `rg` adapter；`rg` adapter 底层复用通用受控子进程 runner。
- 前端消息流中 `Grep`、`Glob` 是和 `Read`、`Search` 同级的独立工具组件。
- 现有 `Search` 不再承载 Grep/Glob 的展示语义。

## 范围

- 包含：
  - `packages/agent-core/src/tools/tools/grep/`
  - `packages/agent-core/src/tools/tools/glob/`
  - 新增 `packages/agent-core/src/tools/subprocess/` 下的通用 runner 与 `rg` adapter。
  - `packages/shared/src/session.ts`
  - `packages/shared/src/session-selectors.ts`
  - `packages/agent-core/src/engine/bridge.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
  - 相关 fixtures、测试和设计文档。
- 不包含：
  - 本轮不修 `llm-agent-dev` skill 源码，只保留后续修复说明。
  - 不重构 Bash 权限策略；Bash 迁移到通用 runner 可作为后续任务。
  - 不重做消息区整体视觉语言。

## 背景

- 相关设计文档：
  - `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
  - `docs/design-docs/agent-core/subprocess-runner-guidelines.md`
  - `docs/design-docs/agent-core/current-module-map.md`
  - `docs/design-docs/frontend-ui/中间消息区规范.md`
- 相关 skill 调研：
  - `.agents/skills/llm-agent-dev/references/tools/search-tools.md`
  - `docs/design-docs/llm-agent-fix-plan/04-skill-rg-tools-fix.md`
- 参考实现：
  - `heartclaw/apps/ruyi-api/src/core/tool/tools/grep/`
  - `heartclaw/apps/ruyi-api/src/core/tool/tools/glob/`

## 当前问题

- `grep` 和 `glob` 当前 `previewKind` 都是 `search`，前端只能显示 Search，无法表达用户要求的 `Grep` / `Glob` 独立组件。
- `createToolUiPreview("search")` 读取 `args.query`，但 `grep` 和 `glob` 的核心参数是 `pattern`，会造成预览字段错误。
- `glob` 目前手写目录遍历和 glob-to-regex，和 Grep 的 ripgrep 主路径不一致。
- `glob` 传 `path` 时，pattern 与路径相对关系容易错位。
- Grep 和 Glob 都需要处理 `rg` 的 timeout、退出码、stderr、输出上限，不应该各自重复实现。

## 设计方案

### 1. 受控子进程 runner

新增通用受控子进程生命周期 helper，建议路径：

```txt
packages/agent-core/src/tools/subprocess/run-process.ts
```

职责：

- 使用 `spawn(command, args)` 或等价的 argv 数组 API。
- 统一 timeout、stdout/stderr 解码、max output chars、耗时统计、启动错误和截断标记。
- 返回结构化 `RunProcessResult`。
- 不接收完整 shell command 字符串。
- 不解释具体命令的退出码。
- 不负责权限、workspace guard 或业务渲染。

推荐返回结构：

```ts
type RunProcessResult = {
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};
```

### 2. rg adapter

新增 `rg` 专用 adapter，建议路径：

```txt
packages/agent-core/src/tools/subprocess/ripgrep.ts
```

职责：

- 固定调用 `runProcess({ command: "rg", args })`。
- 提供 `runRipgrep(args, options)` 这类小 API。
- 解释 `rg` 的退出码语义：`0` 有结果、`1` 无结果、`2` 执行错误。
- 将 `ENOENT` 转成清晰的 `rg` 不存在错误。
- 不做 Grep/Glob 参数业务组装。

Bash 后续也可以复用 `run-process.ts`，但 Bash 的权限检查、shell 入口和非零退出码处理留在 Bash 工具自己那里。

### 3. Grep executor

Grep 使用 `rg` adapter 运行：

```txt
rg --line-number --no-heading --color never --max-count <max> --max-filesize 1M [--glob <glob>] -- <pattern> <searchPath>
```

行为：

- `path` 支持文件或目录，默认 workspace root。
- `glob` 是 include 过滤。
- `rg` exit code `1` 返回成功但无匹配。
- `rg` exit code `2` 返回工具失败，错误来自 stderr。
- 输出保留 workspace 相对路径、行号和内容。

### 4. Glob executor

Glob 使用 `rg` adapter 运行：

```txt
rg --files --glob <pattern> --color never <searchPath>
```

行为：

- `path` 是搜索根目录，默认 workspace root。
- 简单文件名 pattern 可自动补 `**/`，例如 `*.ts` 递归匹配。
- `src/**/*.ts` 在 `path=packages/agent-core` 时按 `packages/agent-core` 为搜索根解释。
- 输出规范化为 workspace 相对路径。
- 对结果 stat 后按 mtime 降序排序，最多返回 200 条。

### 5. Preview 与消息模型

新增独立 preview kind：

```ts
type ToolPreviewKind = "grep" | "glob" | ...
```

新增独立 `ToolUiPreview`：

```ts
{ kind: "grep"; pattern: string; scope?: string; resultCount?: number; displayText: string }
{ kind: "glob"; pattern: string; scope?: string; resultCount?: number; displayText: string }
```

新增独立 `MessageBlock`：

```ts
{ kind: "grep"; pattern: string; scope?: string; ... }
{ kind: "glob"; pattern: string; scope?: string; ... }
```

`search_files` 的历史 Search 展示不在本轮扩大；如决定删除 Search，应单独确认历史 session 兼容策略。

### 6. 前端 UI

在 `ToolLogLine` 中为 `grep` 和 `glob` 增加独立分支：

- `Grep <pattern>`，有 scope 时显示 `in <scope>`。
- `Glob <pattern>`，有 scope 时显示 `in <scope>`。

样式复用 `.tool-log-line`，保持和 Read/Search 同级的轻量工具行。不新增重卡片，不在组件里读取 raw args 或 toolName。

### 7. 文档同步

更新：

- `docs/design-docs/agent-core/tool-preview-design-guidelines.md`
- `docs/design-docs/agent-core/current-module-map.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-core/index.md`

完成代码后补：

- `docs/histories/YYYY-MM/...`
- 如命中学习沉淀标准，再按 `docs/learnings/WRITING_GUIDE.md` 判断是否新增 learning。

## 任务拆分

- [x] Step 1：实现并测试 `run-process.ts`，覆盖成功、非零退出码、启动失败、timeout、stdout/stderr 截断。
- [x] Step 2：实现并测试 `ripgrep.ts` adapter，覆盖 `rg` exit code `0/1/2`、`ENOENT`、timeout、stderr。
- [x] Step 3：改 Grep executor 使用 `rg` adapter，并保持现有工具参数兼容。
- [x] Step 4：改 Glob executor 使用 `rg --files --glob`，修复 `path + pattern` 语义。
- [x] Step 5：新增 `grep` / `glob` preview kind 与 message block，更新 bridge 和 session selector。
- [x] Step 6：前端新增 Grep/Glob 工具行分支，复用现有工具行样式。
- [x] Step 7：更新 fixtures、单元测试和流式 UI 测试。
- [x] Step 8：更新设计文档、history，运行验证。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/desktop test`
  - `pnpm typecheck`
- 手工检查：
  - mock 消息流中能看到 `Grep` 和 `Glob`，不是 `Search`。
  - `Glob` 在 `path=packages/agent-core`、`pattern=src/**/*.ts` 时能找到目标文件。
  - `Grep` 的结果仍含路径和行号。
- 前端验证：
  - 浏览器 mock 已验证消息区展示 `Grep ToolUiPreview in *.ts` 与 `Glob src/**/*.ts in packages/agent-core`，且没有退回旧的 `Searched files...` 文案。
  - 本轮变更集中在 renderer mock 可覆盖的消息行与 agent-core 工具执行路径，未追加 Electron 真实窗口验收。

## 风险

- 风险：删除或改动 Search 影响历史 session 恢复。
- 缓解方式：本计划只让新 Grep/Glob 使用独立 kind，Search 兼容保留；是否删除 `search_files` 另开决策。

- 风险：通用 runner 做得过宽，变成绕过 Bash 权限的隐形命令执行入口。
- 缓解方式：runner 不对模型暴露，不接收 shell command 字符串；所有 command 只能由具体工具代码硬编码或显式传入，权限仍在工具层。

- 风险：`rg` 在某些用户环境不存在。
- 缓解方式：先返回清晰工具错误；是否保留 Node fallback 作为后续增强，不在首轮扩大复杂度。

- 风险：`rg --glob` 与手写 glob 语义不完全一致。
- 缓解方式：以 ripgrep 语义为准，并在工具 description 和测试中锁定常见 pattern。

## 决策记录

- 2026-05-25：Grep/Glob 前端展示采用独立 preview/message kind，而不是 `search` 上增加标题字段。原因是用户明确要求它们是和 Search 同级的组件。
- 2026-05-25：Glob 主实现采用 `rg --files --glob`，不再以手写 glob-to-regex 为主路径。原因是 `rg` 已能处理 `.gitignore`、忽略规则和成熟 glob 语义。
- 2026-05-25：共享封装拆为通用 `run-process` runner 和 `rg` adapter。原因是进程生命周期属于 Bash、Grep、Glob 都会遇到的共同复杂度，但权限、shell 语义和退出码解释必须留在工具或命令适配层。
