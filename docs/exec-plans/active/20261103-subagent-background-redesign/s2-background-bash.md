# S2 后台 Bash

## 目标

后台 Bash 的日志进会话目录、长期可读并进入活跃路径；前台日志用完即删；单会话 50MB 清理；`task_output` 支持 `since`；上限改 5；完成通知带日志路径；退出只删沙箱临时目录。后台任务登记表只管 Bash。

## 范围

- 包含：设计 [03](../../../design-docs/子智能体和后台任务设计规范/03-后台Bash设计规范.md) 全部。
- 不包含：子会话 Bash 不转后台（属于子智能体，S3 做）；界面（S6）。

## 必读

- 设计 03；S1 完成的 `actspace.context.trace`、`isBashLogReadPath`、`background/task` `prune`
- `packages/shell/tool-shell/src/node-ports.ts`（第 45、71–100、249–300、340–365 行）、`src/plugin.ts`（工具描述）
- `packages/background-tasks/background-tasks/src/{types.ts,registry.ts,notification.ts}`
- `packages/background-tasks/tool-background-tasks/src/tools.ts`
- `packages/context/context-background-tasks/src/source.ts`
- `packages/core/runtime/src/startup/boot.ts`（登记表创建与 `actspace.host.background-tasks`）

## 步骤

### 1. 日志目录

`node-ports.ts`：

- `BashTaskRegistry` 拆成两个根：`scratchRoot = <tmpRoot>/bash-v2/<randomUUID>`（沙箱 `scratchDir` / `TMPDIR`）与按会话计算的日志目录 `<dataRoot>/sessions-v2/<sessionId>/bash-log/`。`dataRoot` 从 `actspace.host.session` 拿（`shell-tools` 的 manifest 增加 inject）；会话路径用现有安全 ID 校验函数拼。
- 命令启动时生成 `id = bash_<uuid>`，日志写 `<bash-log>/<id>.log`；`registry.register` 接收这个 id 作为 `taskId`，不再另生成。
- `sandboxedRequest(…, outputRoot)` 改传 `scratchRoot`；不传日志目录。

### 2. 删除时机

- `foreground(…)` 返回前（超长输出复制成 artifact 之后）`rm` 日志。`TOOL_ABORTED` 等产生了结果的情况同样删。
- `dispose()`：杀进程照旧，最后只 `rm(scratchRoot)`，不删日志。
- 新函数 `pruneSessionLogs(sessionId)`：新日志创建后、后台任务结束后调用；`bash-log/` 合计 > 50MB 时按 mtime 从旧到新删掉不在运行中的日志，直到 ≤ 50MB；对每个被删的后台任务调用登记表新增的 `markPruned(taskId)`，由它写 `background/task` `op: "prune"`。
- Host 启动时扫 `<tmpRoot>/bash-v2/`：删掉不等于本进程 `scratchRoot`、mtime 超过 1 天的目录。放在 `shell-tools` 插件 `apply` 里（异步、失败只记日志）。

### 3. 工具

- `plugin.ts` bash 描述中 `the workspace, the output directory and the temp directory are writable` 改为 `the workspace and the temp directory are writable`。
- `MAX_BACKGROUND_PER_SESSION` 8 → 5。
- `backgrounded(…)` 的结果 detail 增加 `{ label: "actspace.context.trace", value: { kind: "trace", path: outputPath, description: "Background Bash log: " + (intent ?? command).slice(0, 80) } }`。
- `tools.ts`：
  - `task_output` 增加 `since`（integer ≥ 0）；登记表 `output(sessionId, taskId, since?)` 按字节偏移读，最多 32KB，起点向后对齐到 UTF-8 字符边界；结果末尾 `log_size:`、`next_offset:`；已清理写 `log pruned`。
- `notification.ts`：`renderTaskNotification` 在 `<summary>` 后加 `<output_path>`（Bash 才有）。

### 4. 登记表只管 Bash（放在 S3 做）

现在的后台子智能体还在用登记表（`packages/subagent/subagent/src/provider.ts`），S2 不动 agent 分支，保证 S2 单独提交时一切照常。下面这些改动在 S3 删掉子智能体对登记表的使用时一起做，列在这里是为了把后台任务这边的改动集中说明：

- `types.ts`：`BackgroundTaskKind` 收窄为 `"bash"`；读老事件时 `kind: "agent"` 的 `background/task` 在投影里忽略。
- `registry.ts`：删掉 agent 专用分支（`agent_` 前缀、agent 结果截断、lost 文案里的 agent 分支）。
- `notification.ts`：删掉 agent 分支，`AGENT_RESULT_LIMIT_BYTES` 移到 subagent 包。
- `context-background-tasks/src/source.ts`：只列 Bash。
- `task_*` 描述去掉 agent（上面第 3 步先只加 `since`，描述在这里一起改）。

## 验证

- `pnpm --filter @actspace/tool-shell test`：
  - 前台结束后 `bash-log/` 为空；超长输出 artifact 仍在；
  - `blockMs: 0` 的日志在 `sessions-v2/<id>/bash-log/<taskId>.log`，结果 detail 有 trace；
  - `dispose()` 后日志还在、scratch 目录没了；
  - 50MB 清理：用小上限注入参数测试删除顺序、运行中不删、写出 `prune`；
  - 启动清扫：超过 1 天且不属于当前进程的目录被删。
- `pnpm --filter @actspace/background-tasks test`、`pnpm --filter @actspace/tool-background-tasks test`：`since` 偏移、多字节对齐、`next_offset`、`log pruned`；通知含 `<output_path>`；上限 5。
- 统一验证命令。

## 回滚

revert 本提交：日志回到临时目录。期间写进会话目录的 `bash-log/` 旧代码不读，留着无害；`prune` 事件旧代码的编解码器不认，所以要与 S1 一起回滚。
