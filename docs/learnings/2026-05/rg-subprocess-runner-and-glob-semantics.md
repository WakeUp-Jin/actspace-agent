# rg 工具封装：runner 和 adapter 要分层

来源：`docs/histories/2026-05/20260525-2355-grep-glob-rg-tools.md`

## 是什么

当多个 Agent 工具都需要启动外部命令时，不应该把每个工具都写成一套 `spawn`/timeout/stdout 拼装逻辑，也不应该直接做一个“万能 Bash runner”。更稳的分层是：

- `run-process`：只管子进程生命周期。
- `ripgrep adapter`：只管 `rg` 这个命令的约定。
- `grep` / `glob` executor：只管工具参数、workspace guard 和结果渲染。

## 为什么需要

子进程执行流天然有很多边界条件：命令不存在、timeout、stdout/stderr 同时输出、非零退出码、输出过大、进程被 signal 结束。把这些散落在每个工具里，很容易出现行为不一致。

但如果抽成过宽的“任意命令执行器”，又会和 Bash 工具的权限模型混在一起，变成一个隐形的命令执行入口。runner 必须保持低层、受控、不面向模型。

## 分层思路

```ts
runProcess({
  command: "rg",
  args: ["--files", "--glob", "**/*.ts", workspaceRoot],
  cwd: workspaceRoot,
  timeoutMs: 15_000,
  maxOutputChars: 128_000,
});
```

`runProcess` 返回结构化结果，但不判断 `exitCode === 1` 是成功还是失败。因为对 `rg` 来说，退出码 `1` 可能只是“无匹配”，对其他命令则可能是错误。

`ripgrep adapter` 才解释这些语义：

- `0`：执行成功且有结果。
- `1`：执行成功但无匹配。
- `2`：执行错误。
- `ENOENT`：环境缺少 `rg`。

## Glob 的相对路径坑

`rg --files --glob` 的 pattern 是相对于搜索根解释的。比如用户传：

```txt
path = packages/agent-core
pattern = src/**/*.ts
```

如果直接用：

```txt
rg --files --glob src/**/*.ts packages/agent-core
```

语义上容易和当前工作目录、搜索根、输出路径混在一起。更清晰的做法是拆出静态目录前缀：

```txt
searchRoot = packages/agent-core/src
globPattern = **/*.ts
```

这样 `path` 表示搜索范围，`pattern` 表示范围内的文件匹配规则，工具行为会更接近用户直觉。

## 核心要点

- runner 负责生命周期，adapter 负责命令语义，executor 负责业务参数。
- 不要让通用 runner 接收 shell command 字符串；用 `command + args[]`。
- 非零退出码不一定是错误，必须放到具体命令 adapter 里解释。
- `rg --glob` 的 pattern 要和搜索根一起设计，否则 `path + pattern` 很容易错位。
- Bash 未来可以复用 runner，但权限检查和 shell 语义必须留在 Bash 工具层。

## 自检问题

1. 为什么 `runProcess` 不应该直接把 `exitCode !== 0` 当成失败？
2. 为什么通用 runner 不应该暴露成模型可直接调用的任意命令能力？
3. 当用户同时传 `path` 和带目录前缀的 glob pattern 时，应该先想清楚 pattern 是相对谁解释的。
