# 主流 Agent harness 的脚本执行方式调研

依据：2026-11-09 克隆到本地 `/tmp/ref/`（不入库）的外部参考快照。源码路径相对各参考仓库，不是本仓库路径。只读源码与提示词，未运行这些 harness；结论只代表这些快照。

| 仓库 | 快照 |
|---|---|
| DeepSeek Harness（DSH） | `fcc0ad46` |
| opencode | `2f0e2db` |
| Kimi CLI | `9ab1286` |
| codex | `e54a571` |
| Hermes agent | `34acabf0` |
| OpenHands software-agent-sdk | `be42ad4` |
| pi-mono | `2cac4f1` |
| goose | `0edf2bd` |
| gemini-cli | `62bab5b` |
| anthropics/skills | `2c5958e` |
| smolagents | `96f33fa` |

设计应用：[Agent 脚本执行设计](../design-docs/tool-system/agent-script-execution.md)。

## 结论

1. 主流 coding harness **没有通用的 Python / JS 执行工具**。脚本执行走 `bash` / `shell` 工具 + 提示词或 Skill 约定。
2. 名字叫 `run_code` / `exec` / `execute` / `codemode` 的工具做的是另一件事：**用 JS 编排其他工具调用**（Code Mode / PTC），不是通用脚本解释器。
3. 独立 Python 执行工具只出现在通用 / 研究型 agent（Hermes、smolagents）；OpenHands 已经删掉 IPython 工具，只保留 tmux 终端。
4. 两种脚本执行方式并存：写文件再执行（DSH Office skills、anthropics skills）；内联 `python3 -c` / heredoc（opencode 提示词明确写"一次性计算用 `-c`，复杂的才写文件"）。
5. 解释器来源分两派：Codex 不打包，靠系统 `python3` + 沙箱放行；DSH 打包 `python-build-standalone` + 锁定 wheel，但**不带 PDF 读取库**，其 `read` 工具对 PDF 是 "deferred"。

## 五个谱系

| 谱系 | 代表 | 脚本怎么跑 | 专用工具 |
|---|---|---|---|
| 纯 bash + 提示词 | Kimi、gemini-cli、goose、anthropics skills | `bash python3 -c` / heredoc / 写文件 | 无 |
| bash + 捆绑解释器 + Skill 约定 | DSH | `load_workspace_dependencies` 返回路径 → 写脚本文件 → bash 执行 | 解释器路径查询工具 |
| Code Mode 编排工具 | DSH `run_code`、codex `exec`、opencode `execute`、pi `codemode` | JS / TS 隔离沙箱调用工具注册表 | 有，但不是通用脚本执行 |
| 独立 Python 内核 | Hermes `execute_code`、smolagents | 持久 kernel + RPC 回调工具 | 有，复杂度高 |
| PTY 交互 shell 当 REPL | codex `exec_command` + `write_stdin`、OpenHands `terminal` | 持续向 stdin 写入 | 无 |

## 逐家要点

### DeepSeek Harness

- `bash`（`packages/shell/tool-bash/src/index.ts`）：fresh shell，`description` 参数放在 `command` 前让模型先说意图。没有语法级硬拒绝，安全靠沙箱与审批。
- `load_workspace_dependencies`（`packages/skill/tool-workspace-dependencies/`）：返回随应用捆绑的 Python 与 Node / pnpm 的**绝对路径**，不改 PATH。payload 布局 `runtime.json` + `dependencies/python/bin/python3`；Desktop 首次调用时复制到 Harness home，只读载体就地使用。
- 捆绑来源 `scripts/primary-runtime/lock.json`：`astral-sh/python-build-standalone` 3.12 + 锁定 wheel（URL + sha256）。包集：numpy、pandas、python-docx、python-pptx、openpyxl、XlsxWriter、Pillow、lxml 及其依赖。**没有 pypdf / pdfplumber / PyMuPDF。**
- Office skills（`packages/skill/skill-office/assets/office-*/SKILL.md`）：`office` 做路由；`office-docx` 等写死"写成 `edit_docx.py` 之类脚本放工作区、用返回的 Python 路径执行、不要 pip install、不要找系统 Python"；`office-export-pdf` 用 LibreOffice Kit CLI 导出，与 Python 无关。
- PTC：`run_code` 工具，`tools.mode: 'native' | 'ptc'` 全局切换；`ptc-runtime-node` fresh Node 进程 + fd 控制通道；实验性 `ptc-runtime-python`（CPython 子进程、fd-3 JSON-lines、cpuSeconds / maxWallMs / addressSpaceMb 预算）。是工具编排运行时。
- 另有 `tool-bash-persistent`（跨调用保持 cwd / 变量）、`tool-workflow`（JS 编排子 agent）。

### opencode

- `shell` 工具（`packages/core/src/tool/plugin/shell.ts`）是唯一执行入口。
- 提示词按模型分发（`packages/core/src/plugin/optimize.ts`）：`meta.txt` 给 muse 系模型，第 29、47 行写"简单一次性 Python 计算用 `shell` 跑 `python3 -c`；只有需要可复用产物、重复执行或足够复杂时才写独立脚本文件"。`kimi.txt:54`："用 shell 命令或 Python 包处理多媒体文件，第三方包必须装在虚拟 / 隔离环境"。
- `@opencode/codemode`：纯解释器实现的 JS 子集（无 fs / 网络 / 进程），`execute` 工具只用于批量调用 MCP 工具。

### Kimi CLI

只有 `Shell` 工具（`src/kimi_cli/tools/shell/bash.md`），fresh shell，Windows 用 Git Bash `bash.exe`，描述里只有一句 "run scripts"。无脚本专用工具，无脚本相关提示词。

### codex

- `exec_command` + `write_stdin`（`codex-rs/core/src/tools/handlers/shell_spec.rs`）：PTY 会话，可把 `python3` 当 REPL 持续写 stdin；`shell` 参数选 shell；Windows 有 PowerShell 专门指导。
- `exec`（`codex-rs/code-mode-protocol/src/description.rs`）：V8 isolate 跑原始 JS，无 Node / fs / 网络，`// @exec:` pragma，`text() / image() / store() / load() / notify() / yield_control()`，`wait` 工具续读 cell。工具编排用途。
- `gpt_5_2_prompt.md:251`："Do not use python scripts to attempt to output larger chunks of a file"，是限制滥用而非鼓励。
- 不打包 Python。

### Hermes agent

`execute_code`（`tools/code_execution_tool.py`、`tools/code_kernel.py`）：持久 Python session kernel（stdin 一行一请求、stdout sentinel 帧）；脚本内 `from hermes_tools import ...` 通过 RPC 回调其他工具；解释器优先 `VIRTUAL_ENV` / `CONDA_PREFIX` 否则 `sys.executable`；5 分钟超时、50 次工具调用上限、stdout > 50 KB 落盘。模型误把 `command` 传进来时返回纠错提示——专用工具与 shell 的边界需要靠文字维持。

### OpenHands software-agent-sdk

只剩 `terminal`（tmux 持久会话，`is_input` 续输入）。`openhands/tools/terminal/definition.py` 的 `_LITERAL_ARG_HINT_TEMPLATE`：当 `command` 看起来像 Python 字面量时返回提示"先用 file_editor 写 `/tmp/run.py` 再 `python /tmp/run.py`，或用 heredoc `python - <<'EOF'`"。用错误提示引导模型走正确路径。

### 其他

- goose（`crates/goose/src/agents/platform_extensions/developer/`）：`shell` 工具，选 bash 否则 sh，提示 "always use `python3` instead of `python`"。
- gemini-cli（`packages/core/src/tools/definitions/dynamic-declaration-helpers.ts`）：`bash -c <command>` / Windows `powershell.exe -NoProfile -Command`，无脚本工具。
- pi-mono（`packages/coding-agent/docs/codemode.md`）：`codemode` 工具，QuickJS 沙箱，`store / load`、`searchTools / describeTool`，工具编排用途。
- anthropics/skills：docx / xlsx / pptx / pdf 四个 skill 为 Apache 2.0，自带 `scripts/*.py`（`recalc.py`、`convert_pdf_to_images.py`、表单填写脚本等）；SKILL.md 声明 "openpyxl / pandas / markitdown 已预装，不要先 pip install"；PDF 用 pypdf 读写、pdfplumber 抽文本和表格；全部经 Bash 运行。
- smolagents（`src/smolagents/local_python_executor.py`、`remote_executors.py`）：CodeAgent 以 Python 为动作语言，`LocalPythonExecutor` import 白名单 + E2B / Docker / Modal 远程执行器。另一种范式，不适合 coding harness。
