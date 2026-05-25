# llm-agent-dev Skill rg Tools 修复说明

## 背景

在 actspace-agent 检查 Grep/Glob 工具实现时，发现 `.agents/skills/llm-agent-dev` 对文件检索工具的指导还不够细。

当前 skill 已经说明：

- Grep/Glob 是 Agent 理解代码库的基础能力。
- Grep 适合搜索文件内容。
- Glob 适合按文件名模式查找文件。
- 底层实现建议使用 ripgrep。

但它没有展开说明 Grep 和 Glob 共享的 ripgrep 子进程执行流，例如超时、退出码、stderr、stdout 裁剪、工作目录、路径归一和参数安全边界。后续修复 skill 时应把这部分补上，并明确区分“通用受控子进程 runner”和“rg 命令适配层”。

## 参考实现

参考项目：

- `heartclaw/apps/ruyi-api/src/core/tool/tools/grep/`
- `heartclaw/apps/ruyi-api/src/core/tool/tools/glob/`

heartclaw 的实现值得吸收的点：

- `Grep` 使用 `rg --line-number --no-heading --color never`。
- `Glob` 使用 `rg --files --glob <pattern>`。
- 明确处理 `rg` 退出码：`0` 有结果、`1` 无结果、`2` 执行错误。
- 子进程有超时保护。
- stdout/stderr 使用 UTF-8 replacement 解码。
- 输出长度有上限保护。
- `Glob` 结果按 mtime 排序。

需要进一步优化的点：

- Grep 和 Glob 各自维护了一份子进程执行逻辑，容易让 skill 使用者复制重复代码。
- skill 示例应推荐一个共享 `runProcess` helper，再由 `runRipgrep` adapter 和 Grep/Glob 组合不同参数。

## 建议补充到 Skill 的设计

### 通用受控子进程 runner

新增一个小型共享 runner，职责只覆盖子进程生命周期：

- 使用 `execFile` 或 `spawn`，禁止通过 shell 拼接字符串。
- command 和 args 分离，runner 不接收完整命令字符串。
- 统一设置 timeout。
- 统一收集 stdout/stderr。
- 统一执行 max output chars 限制。
- 统一记录 exitCode、signal、duration、timedOut、truncated。
- 返回结构化结果，而不是直接返回字符串。
- 不解释具体命令的退出码，不负责权限审批。

建议返回结构：

```ts
type RunProcessResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};
```

### rg adapter

在通用 runner 之上新增 `runRipgrep` adapter：

- 固定调用 `rg`。
- 统一解释 `rg` 退出码：`0` 有结果、`1` 无结果、`2` 执行错误。
- 把 `rg` 不存在转成明确错误。
- 提供 Grep/Glob 可复用的默认 timeout 和输出上限。
- 不做 Grep/Glob 的业务参数组装。

### Grep 指导

Grep 的参数组装应固定使用：

```txt
rg --line-number --no-heading --color never --max-count <n> [--glob <include>] [--context <n>] -- <pattern> <path>
```

设计要点：

- `pattern` 是正则内容搜索模式。
- `path` 是文件或目录搜索范围。
- `glob/include` 是文件名过滤，不替代 `path`。
- `rg` exit code `1` 应返回成功但无匹配。
- 输出给模型时保留 `file:line:content`。

### Glob 指导

Glob 的参数组装应固定使用：

```txt
rg --files --glob <pattern> --color never <path>
```

设计要点：

- `path` 是搜索根目录。
- `pattern` 由 ripgrep 相对搜索根解释。
- 不要手写 glob-to-regex 作为主实现。
- 输出路径应规范化为 workspace 相对路径。
- 结果按 mtime 降序排序，最近修改的文件优先展示。

## 需要修改的 Skill 源文件

Skill 源文件仓库：

```txt
/Users/wakeup-jin/Desktop/code-project/side-project/agent-harness-dev
```

建议修改：

- `references/tools/search-tools.md`
- `references/tools/tool-definition.md`
- `examples/grep-tool.ts`
- 新增 `examples/run-process.ts`
- 新增 `examples/rg-runner.ts`
- 新增 `examples/glob-tool.ts`

## 验收标准

- Grep 和 Glob 示例复用同一个 `runProcess` 与 `rg` adapter。
- `search-tools.md` 明确 `rg` 退出码、timeout、stderr 和输出裁剪策略。
- `Glob` 文档明确使用 `rg --files --glob`。
- `Grep` 文档明确使用 `rg --line-number --no-heading`。
- skill 不再只停留在“建议使用 ripgrep”的抽象描述。

## 决策记录

- 2026-05-25：skill 修复不放在 actspace-agent 当前 active plan 中执行，后续单独修复 skill 源码。
- 2026-05-25：将 Grep/Glob 的共同复杂度拆为通用 `runProcess` 和 `rg` adapter。原因是进程生命周期未来也可服务 Bash，但 `rg` 退出码和参数语义应保留在命令适配层。
