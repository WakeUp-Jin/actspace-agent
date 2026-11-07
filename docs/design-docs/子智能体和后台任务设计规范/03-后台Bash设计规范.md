# 03 后台 Bash 设计规范

依据 [01-设计决策](01-设计决策.md) 的 L3、L4、S10、B1、B2、Q1；现行结构、日志规则与通知见[后台任务](../collaboration/agent-background-tasks.md)。

## 1. 日志文件

日志位置、写入与权限、读取免审批、前台命令即删、转后台保留、单会话 50MB 封顶与 `prune` 事件、沙箱临时目录的清理，都以[后台任务](../collaboration/agent-background-tasks.md)「日志（留痕）」为准。补充两条边界：

- 前台命令「在 `blockMs` 内结束」包含失败和被用户取消，只要产生了工具结果；`> 8000` 字的完整输出先复制成会话 artifact 再删日志。
- `prune` 事件字段：`taskId`、`prunedAt`、`reason: "session-cap"`；检查时机是每次新日志创建和后台任务结束时。

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

登记表只登记 Bash，`context-background-tasks` 只列 Bash，老会话的 `background/task` `kind: "agent"` 只读显示；见[后台任务](../collaboration/agent-background-tasks.md)「结构」。

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
