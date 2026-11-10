## [2026-11-10 14:20] | Task: 脚本执行 PR 的 CI 失败修复

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.2`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 那你看看这个 pr 还有什么问题吗？

### 🛠 Changes Overview

**Scope:** `packages/shell/tool-shell/`、`packages/core/runtime/src/harness/`、`packages/util/shared/src/runtime-v2/`、`scripts/python-runtime/`

**Key Actions:**

- **fork 提示词缓存**：`host/scripting-facts` 里的 scratch 绝对路径带 sessionId，fork 子智能体的系统提示词因此和父会话不一致，`host-subagent-fork-cache-process.test.mjs` 失败。`tool-shell` 新增 `ScratchOwners` 与服务方法 `shareScratchDirectory`，Agent 工厂创建 fork 时让它用父会话的 scratch 目录；model-fact 与 `ACTSPACE_SCRATCH` 同时跟随。
- **Windows 打包**：`prepare.mjs` 在 Windows 主机上改用系统自带的 `System32\tar.exe`（Git Bash 的 GNU tar 把 `D:\…` 当成远程主机）；`lib/` 下的 tcl / tk 剪裁只在非 Windows 目标做——Windows 文件系统不分大小写，`lib` 就是标准库 `Lib`，原规则会删掉 `threading.py`。
- **CodeQL**：`scriptLineCount` 修剪首尾空行的 `/^\n+|\n+$/g` 是多项式回溯（一长串换行后跟其他字符时），改成手写计数。第一次误改了相邻的 `elideScriptSource`，已还原。
- **文档**：设计文档 2.4 节与 `tool-shell/README.md` 补 fork 共用父会话 scratch 目录。

### 🧠 Design Intent (Why)

- fork 的首个请求要和父会话的提示词、工具、消息前缀逐字节一致才能命中缓存；fork 继承的对话里出现的脚本路径也都在父会话目录下，共用目录比把路径从提示词里拿掉更一致（`write_file` 需要绝对路径，拿掉后模型得先跑一次 `echo $ACTSPACE_SCRATCH`）。
- 这个失败在分支上一直存在，只是 PR 有合并冲突时 GitHub 不跑 `pull_request` 工作流，本地也没跑 `pnpm test:scripts`（进程级测试不在 `pnpm -r test` 里）。改动提示词、工具定义或会话相关的 model-fact 后要跑它。

### 📁 Files Modified

- `packages/shell/tool-shell/src/{scratch,plugin,node-ports}.ts`、`src/test/{lifecycle,node-ports}.test.ts`、`README.md`
- `packages/core/runtime/src/harness/agent-factory-plugin.ts`
- `packages/util/shared/src/runtime-v2/script-command.ts`
- `scripts/python-runtime/prepare.mjs`
- `docs/design-docs/tool-system/agent-script-execution.md`
