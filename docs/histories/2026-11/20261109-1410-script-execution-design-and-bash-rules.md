## [2026-11-09 14:10] | Task: 脚本执行方案设计 + Bash 硬拒绝引号感知 + 解释器前缀授权

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 不要独立的脚本执行工具；两种主流方式都要有：写文件再执行（复杂、可复用）和内联执行（一次性计算）。参考 DeepSeek 把 Python 库打包进去的做法——有了 Python 就不需要 PDF 专用工具。不要按步骤来，现在就设计一个属于 ActSpace 的最完美的方案。决策：核心随包 + 扩展按需下载；管道和重定向适当放开；Windows 先简单实现；临时脚本放 TMP 为主。

### 🛠 Changes Overview

**Scope:** `packages/shell/tool-shell`、`docs/design-docs`、`docs/exec-plans`、`docs/exec-runs`、`docs/references`

**Key Actions:**

- **[设计文档]**: 新增 `docs/design-docs/tool-system/agent-script-execution.md`，五层方案：指导层（prompt + 官方 Skill）、展示层、执行层（引号感知规则 + 解释器前缀授权）、运行时层（python-build-standalone 核心随包 + 扩展按需，`actspace-python` shim 只前置到 bash 子进程 PATH）、安全层（零新权限域）。挂到设计索引，权限模型 §16 引用它作为"Bash 语法放宽另立设计"的那份设计。
- **[调研沉淀]**: `docs/references/script-execution-harness-survey-20261109.md` 记录 11 个参考实现（deepseek-harness、opencode、kimi-cli、codex、hermes-agent、software-agent-sdk、pi-mono、goose、gemini-cli、anthropics/skills、smolagents）的脚本执行路径与取舍。
- **[执行计划]**: `docs/exec-plans/active/20261109-script-execution.md` T1–T9；本轮完成 T1–T3，exec-runs 两份文档已写。
- **[T1 命令规则]**: `command-rules.ts` 从整串正则改为逐字符词法器：引号内字面量、按操作符切简单命令逐段分类、heredoc 分隔符必须带引号、输出重定向限工作区 / 临时目录、`2>&1` 与 `&>` 识别；未加引号的 `$`、反引号、`( ) { }` 仍拒绝，文案带下一步。新增 60 例测试。
- **[T2 前缀授权]**: `command-prefix.ts` 新增 `INTERPRETERS`：脚本文件与 `-m` 模块可复用（脚本路径走 `queryPaths` 工作区校验），`-c` / `-e` / pip 单次。
- **[文档同步]**: tool-shell README、subprocess guidelines、execution-safety README 的旧描述改掉。

### 🧠 Design Intent (Why)

Space 现状里模型写 `python3 -c "..."` 直接被 `BASH_COMMAND_DENIED`，根因是硬拒绝用整串正则判断，把引号内的脚本源码当成 shell 语法。目标不是"再加一个工具"，而是让 bash 这条已有的、带沙箱和审批的路径能承载脚本：规则只对未加引号的语法下判断，拒绝时告诉模型怎么改写（单引号 / 写文件 / `<<'EOF'`），才能让模型自己收敛而不是反复试错。管道与重定向放开到"每段可分类、目标在工作区或临时目录"，不放 shell expansion，是因为那部分无法静态分类，和设计第 1 节排除项一致。解释器进可复用授权只收脚本文件不收 `-c`，因为前缀授权的粒度是 argv token，内联源码每次都不同，复用没有意义也不安全。

### 📁 Files Modified

- `packages/shell/tool-shell/src/command-rules.ts`
- `packages/shell/tool-shell/src/command-prefix.ts`
- `packages/shell/tool-shell/src/test/command-rules.test.ts`（新增）
- `packages/shell/tool-shell/src/test/command-prefix.test.ts`
- `packages/shell/tool-shell/src/test/lifecycle.test.ts`
- `packages/shell/tool-shell/README.md`
- `docs/design-docs/tool-system/agent-script-execution.md`（新增）
- `docs/design-docs/tool-system/agent-subprocess-runner-guidelines.md`
- `docs/design-docs/execution-safety/README.md`
- `docs/design-docs/execution-safety/agent-tool-permission-model.md`
- `docs/design-docs/index.md`
- `docs/exec-plans/active/20261109-script-execution.md`（新增）
- `docs/exec-plans/README.md`
- `docs/exec-runs/20261109-script-execution/execution-process.md`（新增）
- `docs/exec-runs/20261109-script-execution/execution-summary.md`（新增）
- `docs/references/script-execution-harness-survey-20261109.md`（新增）
- `docs/references/README.md`
