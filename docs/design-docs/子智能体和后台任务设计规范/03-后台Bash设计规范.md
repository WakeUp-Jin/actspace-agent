# 03 后台 Bash 设计规范

更新：2026-11-04。状态：已实施（S1–S6，分支 `feat/subagent-background-redesign`），Electron 实机验收已完成（见[执行摘要](../../exec-runs/20261103-subagent-background-redesign/execution-summary.md)）；与本文不同的地方见[执行过程](../../exec-runs/20261103-subagent-background-redesign/execution-process.md)。依据：[01-设计决策](01-设计决策.md) 的 L3、L4、S10、B1、B2、Q1。

## 1. 日志文件

| 项 | 规则 |
|---|---|
| 位置 | `sessions-v2/<sessionId>/bash-log/<id>.log`；子智能体跑的 Bash 在子会话目录下 |
| `<id>` | 命令启动时分配 `bash_<uuid>`；转后台后它就是 `taskId`（不再另生成） |
| 谁写 | ActSpace 进程从 stdout / stderr 收到输出后追加写入（现状不变）；被执行的命令本身不写这个目录，所以沙箱不需要放开会话目录 |
| 单文件上限 | 5M 字符，超出后不再写，末尾标 `[output truncated at 5M characters]`（现状不变） |
| 权限 | 目录 `0700`、文件 `0600` |
| 读取 | `sessions-v2/<安全 ID>/bash-log/bash_<uuid>.log` 读取免审批（只对读操作、只对这个文件名格式）；`bash-log` 目录本身不放行，与 transcript 的规则一致 |

### 1.1 删除时机

| 情况 | 处理 |
|---|---|
| 前台命令在 `blockMs` 内结束（含失败、被用户取消，只要产生了工具结果） | 结果生成后**立即删除**这个 `.log`。超过 8000 字的完整输出先照旧复制成会话 artifact（`artifacts/`，「Full Bash output」），再删 |
| 转了后台 | 保留，跟会话走 |
| 应用退出时还在跑（前台或后台） | 进程被杀，日志保留；后台任务下次打开会话标为 `lost`，日志仍可读 |
| 单会话 `bash-log/` 合计超过 50MB | 每次新日志创建、后台任务结束时检查；从最早**已结束**的后台日志开始删，直到降到 50MB 以下；运行中的不删；留下的前台残留日志（退出时被杀的）与已结束的后台日志一起按时间排 |
| 删除会话 | 整个会话目录一起删 |

被清理的日志在父会话写 `background/task` `op: "prune"`（`taskId`、`prunedAt`、`reason: "session-cap"`），`task_output` 与 transcript 里该任务标注 `log pruned`。

### 1.2 沙箱临时目录

- 沙箱里命令的 `TMPDIR`（`scratchDir`）仍放在系统临时目录 `<tmpRoot>/bash-v2/<进程随机目录>/`，与日志分开。
- Harness 卸载（应用退出、Harness 重载）只删这个临时目录，不再删任何日志。
- 应用崩溃来不及清理：Host 启动时扫 `<tmpRoot>/bash-v2/`，删掉不属于当前进程、修改时间超过 1 天的目录。

## 2. 工具变化

### 2.1 `bash`

- 结果里的 `output_path` 指向会话目录下的日志。返回文字格式不变：

  ```text
  Bash task <taskId> is running in the background (<reason>).
  output_path: <会话目录下的绝对路径>
  …
  ```

- 转后台的结果带一条 detail `{ label: "actspace.context.trace", value: { kind: "trace", path, description: "Background Bash log: <intent 或命令前 80 字符>" } }`，由上下文引擎登记为活跃路径（与 [02 §6.3](02-子智能体设计规范.md) 同一机制）。前台命令的日志会被删，不登记。
- 工具描述里沙箱可写目录一句改为：`the workspace and the temp directory are writable`（输出目录不再对命令可写，本来也不需要）。
- 每会话同时运行的后台 Bash 由 8 个改为 **5 个**，超出错误文字不变（`Background task limit reached (5).`）。
- 子会话里 Bash 不转后台，见 [02 §5.1](02-子智能体设计规范.md)。

### 2.2 `task_*`

- 只管 Bash：描述里去掉 agent 相关说明；`TASK_ID` 说明改为 `Background Bash task id (bash_…).`；`task_list` 描述改为 `List background Bash tasks started in this session.`。
- `task_output` 新增参数 `since`（integer，≥0，可选）：

  | 情况 | 返回 |
  |---|---|
  | 不给 `since` | 现状：最后 32KB |
  | 给 `since` | 日志第 `since` 字节之后的内容，最多 32KB（按 UTF-8 边界对齐，不切断字符） |

  两种情况都在末尾写 `log_size: <字节>` 与 `next_offset: <下次用的 since>`；日志已清理时写 `log pruned`，不返回内容。
  描述追加：`Pass since with the previous next_offset to read only new output.`

### 2.3 完成通知

`<task_notification>` 只用于 Bash；`<kind>` 固定为 `bash`。在 `<summary>` 后新增一行 `<output_path>…</output_path>`，结束时也把日志路径交给模型。超时转后台、完成通知内联输出尾部、通知去重保持不变（B2）。

## 3. 后台任务登记表

- `BackgroundTaskRegistry` 只登记 Bash；`kind` 类型收窄为 `bash`。读老会话时 `background/task` 的 `kind: "agent"` 仍能解码，投影时忽略（老会话的后台子智能体由 `delegation/*` 投影显示）。
- `background/task` 编解码器新增 `op: "prune"`。
- `context-background-tasks` 只列 Bash。

## 4. 验收

| 编号 | 场景 | 期望 |
|---|---|---|
| B-A1 | 前台命令 | `bash-log/` 里不留文件；超长输出照旧在 `artifacts/` |
| B-A2 | `blockMs: 0` | 返回会话目录下的 `output_path`；路径进入活跃路径；`read_file` 读它不弹审批 |
| B-A3 | 完成通知 | 带 `<output_path>` |
| B-A4 | `task_output` + `since` | 只返回新增部分，`next_offset` 正确；多字节字符不被切断 |
| B-A5 | 退出应用后重开 | 后台任务 `lost`，日志还在、能读 |
| B-A6 | 超过 50MB | 最早的已结束日志被删，标注 `log pruned`；运行中的不动 |
| B-A7 | 第 6 个后台任务 | 返回上限错误 |
| B-A8 | 崩溃残留 | 下次启动删掉超过 1 天的沙箱临时目录，当前进程的不动 |
