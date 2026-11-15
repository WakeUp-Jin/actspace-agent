## [2026-11-13 13:11] | Task: 修三种让「包测试」随机变红的失败

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 继续执行

审查修复批次（计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`）同步 `main` 之后，各个 PR 的 CI 随机变红，红的地方和 PR 的改动无关。CI 汇总要设成合并必需检查，随机失败的用例会把合并卡住，所以放在批次的第 1 个 PR 里修。

### 🛠 Changes Overview

**Scope:** `packages/background-tasks/background-tasks`、`packages/subagent/subagent`（测试）、`packages/shell/tool-shell`（测试）、`docs/design-docs/collaboration`

**Key Actions:**

- **后台任务登记表关闭时等完收尾写入**：`BackgroundTaskRegistry.dispose()` 原来只等还在运行的任务。关闭前一刻刚结束的任务，通知和收尾记录还在写，dispose 不等就返回，Host 接着关会话，后面的写入报 `SessionHandle is closed`。现在等所有任务的收尾写完才返回；关闭开始之后才结束的任务照旧不写，重启后标 `lost`。
- **Bash 时间上限用例**：`runs subagent commands in the foreground and kills them at the time limit` 用一个 400 ms 的上限同时验证「跑得完」和「会超时」。拆成两个上限，要跑完的那条 60 秒，要超时的那条 400 ms。
- **唤醒断言**：`external.test.ts` 和 `manager.test.ts` 各有一条用例等到收件箱里有通知就断言父会话已被唤醒；登记表是先入收件箱、再写收尾记录、最后唤醒。改成等到唤醒发生。
- **文档**：`agent-background-tasks.md` 的「通知与唤醒」写明关闭时等收尾写入。

### 🧠 Design Intent (Why)

`main` 的一次 CI 加上这一批 PR 同步 `main` 之后的三次，四次「包测试」红了三次，三次是三种不同的失败：

| 失败 | 出现在 | 原因 |
| --- | --- | --- |
| `expected 'failed' to be 'completed'` | #83 | 400 ms 的上限在忙的机器上不够起一个 bash 再睡 0.2 秒 |
| `expected [] to deeply equal [ 'root' ]` | `main` | 通知入收件箱和唤醒之间隔着一次写盘，用例只等了前者 |
| `Vitest caught 2 unhandled errors`（`SessionHandle is closed`） | #85 | 登记表 dispose 不等刚结束的任务写完，会话先关了 |

前两种只是用例写法依赖时间，改用例。第三种是登记表本身的问题：测试夹具的 `onError` 会抛出，所以表现为测试失败；产品里这个错误只进诊断日志，但如果通知写了、收尾记录没写上，下次启动 `reconcile` 会把这个任务再标一次 `lost`，模型先收到「完成」，重启后又收到「丢失」。所以改 `dispose()`，不改用例。

三种都是先复现再改。本地平时跑不出来，在 4 核机器上开 8 个空转进程占满 CPU 之后能稳定复现，失败信息和 CI 上一致。

### ✅ Verification

占满 CPU，单条或整包反复跑：

| 用例 | 改前 | 改后 |
| --- | --- | --- |
| tool-shell 时间上限那条 | 20 次失败 20 次 | 20 次失败 0 次 |
| external「runs a Codex task in the background…」 | 30 次失败 3 次 | 60 次失败 0 次 |
| manager「refuses an eleventh running subagent」 | 40 次失败 8 次 | 40 次失败 0 次 |
| subagent 整包 | 25 次失败 2 次 | 25 次失败 0 次 |

- 登记表新增一条用例：任务结束后把会话的打开卡住，dispose 在放行之前不返回，返回时通知和收尾记录都在。旧实现上这条失败。
- `manager.test.ts` 改的那条没有在 CI 上失败过，写法和 external 那条相同，一起改了；改后 30 次失败 0 次，改前没有单独测。

### 📁 Files Modified

- `packages/background-tasks/background-tasks/src/registry.ts`
- `packages/background-tasks/background-tasks/src/test/registry.test.ts`
- `packages/shell/tool-shell/src/test/node-ports.test.ts`
- `packages/subagent/subagent/src/test/external.test.ts`
- `packages/subagent/subagent/src/test/manager.test.ts`
- `docs/design-docs/collaboration/agent-background-tasks.md`
