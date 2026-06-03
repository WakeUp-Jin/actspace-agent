# Prompt 承诺必须匹配工具权限

关联 history：`docs/histories/2026-06/20260603-0704-kairos-handoff-inbox-prompts.md`

## 核心问题

Agent 系统提示词经常会写“请把某类信息记录到某个文件”。这句话看起来只是行为规则，但如果文件工具的权限边界没有同步放行对应路径，它就会变成一个运行时陷阱：模型会按 prompt 行动，工具守卫会拒绝，模型再尝试绕路或反复解释失败。

这类问题尤其容易出现在 `userData`、缓存目录、日志目录、跨 workspace 文件这些“不是当前 workspace，但又确实需要写”的路径上。

## 可迁移模式

把 prompt 中的路径和工具权限放在同一个 runtime loader 里派生：

```txt
runtime roots
  dataRoot
    ↓
derive handoff path
  <userData>/kairos/inbox/main-agent.md
    ↓
inject prompt segment
  "append notes to this absolute path"
    ↓
inject tool boundary
  additionalWritableRoots = ["<userData>/kairos/inbox"]
```

这样系统提示词、Context 检查视图、真实工具调用都来自同一个来源，不会出现“提示词承诺 A，工具权限允许 B”的漂移。

## 为什么不能直接放开 userData

`userData` 往往包含 session、附件、缓存审计、密钥旁路文件或排障日志。为了让 Agent 写一个 handoff inbox 而放开整个 `userData`，权限面太大。

更稳的做法是：

- 只放行具体目录，例如 `<userData>/kairos/inbox/`。
- 只给需要写的工具放行，例如 `write_file` / `edit_file`。
- 相对路径仍按 workspaceRoot 解析，额外根只接受明确的绝对路径。
- bash 不共享这个额外写根，避免 shell 命令获得更宽的文件系统范围。

## 常见陷阱

- **只改 prompt，不改工具守卫**：模型会收到无法执行的指令。
- **只改 executor，不改检查视图**：真实 turn 能写，Context describe 却看不到对应规则或工具边界。
- **放开整个 userData**：短期省事，长期会把 session、日志、缓存审计等内部数据暴露给写入工具。
- **让相对路径命中额外根**：`../...` 这类路径可能绕过 workspace 语义，额外根最好只接受 prompt 明确给出的绝对路径。

## 自检问题

- Prompt 里给出的路径是真实绝对路径，还是不可解析的占位符？
- `write_file/edit_file` 是否真的允许写入该路径？
- Context describe 展示的 prompt 是否和真实 turn 使用同一个 loader？
- 额外写权限是否足够窄，且不会被 bash 继承？
