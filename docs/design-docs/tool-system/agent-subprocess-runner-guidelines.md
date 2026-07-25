# 子进程执行规范

## 目标

Agent 工具可以调用少量成熟 CLI 来完成本地任务，例如 `rg` 用于代码检索、`bash` 用于用户批准后的命令执行。子进程调用必须被封装成可测试、可裁剪、可解释错误的基础设施，避免每个工具重复处理进程创建、timeout、stdout/stderr、退出码和输出上限。

## 适用范围

适用于 `packages/agent-core` 内部工具对受控命令的调用，例如：

- `grep` 调用 `rg` 搜索文件内容。
- `glob` 调用 `rg --files` 查找文件。
- `bash` 在权限验证通过后调用 `bash -lc <command>`。

不适用于：

- 绕过 Bash 权限系统的任意命令执行。
- 需要用户审批的写操作。
- 需要 shell 特性的命令拼接。

## 设计原则

- 子进程 API 使用 `spawn` 或 `execFile`，不使用 shell 字符串拼接。
- 命令入口必须由调用方显式传入并由工具层控制，例如 `rg` 或 `bash`；runner 本身不决定权限。
- 参数以数组形式传入，pattern、path、glob 等用户/模型输入只作为单个 argv 元素。
- 所有路径仍必须先经过 workspace guard。
- helper 返回结构化结果，工具 executor 再决定如何渲染给模型。
- timeout、stdout/stderr 解码、max output chars、进程启动失败和耗时统计在 runner 层统一处理。
- 命令特有退出码语义放在适配层，例如 `rg` exit code `1` 对 Grep/Glob 表示“无结果”，不是工具失败。
- 权限、参数清洗、workspace guard 和业务渲染留在具体工具层，不下沉到 runner。

## 推荐结构

```txt
packages/agent-core/src/tools/subprocess/
  run-process.ts       # 通用受控子进程生命周期 helper
  ripgrep-path.ts      # rg 可执行文件解析：显式配置、系统命令、内置二进制
  ripgrep.ts           # rg 专用参数与退出码适配
```

分层职责：

- `run-process.ts`：只处理进程生命周期，不理解 `rg`、Bash 权限或工具语义。
- `ripgrep-path.ts`：解析 `rg` 可执行文件来源，优先级为显式配置、系统命令、内置二进制 fallback。
- `ripgrep.ts`：封装 `rg` 默认 timeout、退出码解释和常用参数片段。
- `tools/*/executor.ts`：负责工具参数、workspace guard、结果格式和模型可读输出。

首轮 Grep/Glob 应先落 `run-process.ts` 与 `ripgrep.ts`。Bash 工具可在后续计划中迁移到 `run-process.ts`，但不应在 Grep/Glob 任务里重构 Bash 权限策略。

## run-process 契约

通用 runner 应提供一个小型结构化 API：

```ts
type RunProcessOptions = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  env?: NodeJS.ProcessEnv;
};

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

约束：

- `command` 和 `args` 分离，runner 不接收完整命令字符串。
- 默认 `stdio` 为 `ignore/pipe/pipe`。
- timeout 到达后先发送 `SIGTERM`；是否需要升级 `SIGKILL` 可作为后续增强。
- stdout/stderr 分别截断，不能因为一边输出过大导致内存无限增长。
- runner 不把非零退出码直接转为异常；退出码由命令适配层解释。
- 只有进程无法启动这类系统错误才进入 `startError`。

## rg adapter 契约

`rg` adapter 基于 `run-process`，提供 ripgrep 语义：

```ts
type RipgrepResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
};
```

约束：

- `exitCode === 0`：命令成功且有输出。
- `exitCode === 1`：命令成功但无匹配或无文件。
- `exitCode === 2`：ripgrep 执行错误，应把 stderr 暴露为工具错误。
- `timedOut === true`：工具应返回超时错误。
- `truncated === true`：工具输出应明确提示已裁剪。
- `startError` 中包含 `ENOENT` 时，工具应返回 `ripgrep (rg) is required...` 这类清晰错误。

## rg 可执行文件解析

Grep/Glob 不应要求终端用户预先安装 ripgrep。`rg` 查找顺序为：

1. `ACTSPACE_RG_PATH`：显式指定的绝对路径，主要用于调试、CI 或高级用户覆盖。
2. 系统 `rg`：如果用户机器或开发环境已有 `rg`，优先复用。
3. bundled `@vscode/ripgrep`：作为 App 内置 fallback，不需要运行时联网安装。

约束：

- 不在运行时下载或安装 `rg`。
- 不在用户机器已有系统 `rg` 时删除 bundled binary；内置二进制保持为 fallback，避免破坏应用包完整性。
- 解析到候选路径后，先执行 `rg --version` 小 timeout 探测，成功后才缓存使用。
- `ACTSPACE_RG_PATH` 指向无效路径时应直接返回缺失错误，避免悄悄忽略用户显式配置。

## Bash adapter 边界

Bash 可以复用 `run-process` 的生命周期能力，但必须保留自己的权限边界：

- `bashCheckPermissions` 继续负责 command、cwd、timeout、危险命令、allowlist 和审批决策。
- Bash executor 只在权限验证通过后的 sanitized args 上调用 `run-process`。
- Bash 使用 `command: "bash"`、`args: ["-lc", command]`，这是 Bash 工具独有的 shell 入口，不允许 Grep/Glob 复用。
- Bash 的退出码 `non-zero` 仍由 Bash executor 转成工具失败；runner 不做这个决定。
- Bash 的 stdout/stderr、duration、timedOut、truncated 字段应沿用 `RunProcessResult`，减少重复实现。

## Grep 参数边界

Grep 应通过 `rg` 搜索文件内容：

```txt
rg --line-number --no-heading --color never --max-count <n> [--glob <include>] [--context <n>] -- <pattern> <path>
```

规则：

- `pattern` 是正则内容搜索模式。
- `path` 是文件或目录搜索范围，默认 workspace root。
- `glob` 只作为 include 过滤，不替代搜索路径。
- `rg` 输出保留 `file:line:content`，作为后续 Read/Edit 的定位依据。

## Glob 参数边界

Glob 应通过 `rg --files` 搜索文件名：

```txt
rg --files --glob <pattern> --color never <path>
```

规则：

- `path` 是搜索根目录，默认 workspace root。
- `pattern` 由 ripgrep 相对搜索根解释。
- 不以 `**/` 开头且不包含路径分隔符的简单 pattern，可以自动补成递归匹配。
- 输出给模型的路径应统一为 workspace 相对路径。
- 结果按 mtime 降序排序，最近修改的文件优先。

## 错误与降级

`rg` 不存在时，首选返回清晰错误：

```txt
ripgrep (rg) is required for grep/glob tools but was not found.
```

是否保留 Node fallback 由具体计划决定。若保留 fallback，必须在测试中覆盖 fallback 与 `rg` 主路径的差异，并确保 fallback 不绕过 workspace guard、忽略目录和输出上限。

## 验证要求

- 单元测试覆盖 `rg` exit code `0/1/2`。
- 单元测试覆盖 timeout。
- Grep/Glob executor 测试覆盖 `path + pattern` 的组合语义。
- 前端 preview 测试只消费结构化 `ToolUiPreview`，不反推 raw args。
