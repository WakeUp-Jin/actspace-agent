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

---

## [2026-11-09 16:00] | 续：T4–T9 执行完成（会话临时目录、随包 Python、扩展下载、提示词与 Skill、展示层、Windows 最简）

### 📥 User Query

> 那开始执行吧，只把这个计划完成掉。

### 🛠 Changes Overview

**Scope:** `packages/core/tool-runtime`、`packages/shell/tool-shell`、`packages/shell/python-runtime`（新）、`packages/util/shared`、`packages/context/prompt`、`packages/skill/official-skills`、`apps/desktop`、`scripts/`、`.github/workflows/release.yml`、`docs/`

**Key Actions:**

- **[T4 会话临时目录]**: tool-runtime 新增 `HostWritableRoots` 服务，scratch 根内 read / write 免工作区审批、delete 仍 ask；tool-shell 每条命令前建 `<scratch>/scripts/<sessionId>/` 并导出 `ACTSPACE_SCRATCH`，脚本路径在 scratch 内也可进前缀授权。
- **[T5 随包 Python]**: 新包 `@actspace/python-runtime`（清单、定位、ZIP / wheel 安装、扩展下载）；`resolve-lock.mjs` 用 host pip 的 `--dry-run --report` 产出五目标 `lock.json`（CPython 3.12.16 + openpyxl、XlsxWriter、python-docx、python-pptx、lxml、Pillow、pypdf、pdfplumber）；`prepare.mjs` 下载、校验、裁剪、写 `actspace-python` shim（`-E -s -X utf8`）与 `sitecustomize.py`；`release-package.sh` 打包并逐文件签名，`verify-python-runtime.mjs` 冒烟；tool-shell 注入 PATH shim、`ACTSPACE_PYTHON`、`ACTSPACE_PYTHON_EXT`。
- **[T6 扩展下载]**: main `PythonRuntimeService` + `pythonRuntime.getStatus` / `installExtension` IPC（含入参守卫）；设置 › 扩展 › 插件 › 命令行 下的「脚本运行时」面板，下载 numpy / pandas / markitdown 到数据目录，sha256 校验。
- **[T7 提示词与 Skill]**: `core/scripting` 提示段 + `host/scripting-facts` model-fact（Python 版本、随包库、扩展层状态、scratch 路径）；移植 anthropics/skills 的 docx / xlsx / pptx / pdf 为 `office-*` / `pdf`（Apache 2.0，带 LICENSE 与 NOTICE），新增 `data-analysis`；`OFFICIAL_SKILLS_VERSION` 2。
- **[T8 展示层]**: `@actspace/shared/runtime-v2/script-command.ts` 识别 python / node 的 `-c` / `-e` / heredoc / 脚本文件；`ToolResource` process 分支加 `script` 元数据；renderer 新建 `ScriptSourceBlock`（按语言高亮，> 12 行折叠），`BashRunBlock` 主行写「Python 脚本（N 行）」、详情 `$` 行省略正文、`# script:` 文件名链到右侧面板，审批卡摘要「运行 Python 脚本（N 行）」；mock 场景 `?mock=script-execution`。
- **[T9 Windows]**: 核对 T5 已含 win-x64 目标、`.cmd` shim、`release.yml` windows-latest 与 verify 的 Windows 分支，无新增代码；shell 选择与沙箱另立设计。
- **[文档]**: 设计文档 2.3 / 2.5 / 2.6 / 3 节按实际落地改写；执行计划 T5–T9 勾选并补决策；exec-runs 两份文档补 T4–T9、问题与遗留；`front-中间消息区规范.md` 与 `FRONTEND_VERIFICATION.md` 补脚本卡片规则与 mock 场景。

### 🧠 Design Intent (Why)

T5 把 markitdown 挪到扩展层是因为它的 magika 依赖拖进 onnxruntime，核心随包就失去意义；扩展层用 `sitecustomize.py` 读环境变量而不是 `.pth`，是因为 shim 用 `-E -s` 隔离用户环境后 `.pth` 只能写进签过名的应用包里。T7 只移植 SKILL.md 指导不移植脚本，是因为上游脚本依赖 LibreOffice 与 Node 库，随包做不到；Skill 的价值在工作流与库用法。T8 把识别器放 shared 而不是 tool-shell 私有，是因为 renderer 对历史消息与实时审批都要同样判断，不想再给审批事件透传字段；识别只认简单命令，拿不准的照普通 bash 显示，宁可少识别不可错识别。

### 📁 Files Modified（新增部分）

- `packages/core/tool-runtime/src/permission/{engine,host-writable-roots}.ts`
- `packages/shell/tool-shell/src/{node-ports,plugin,query-paths,prepared-execution}.ts`
- `packages/shell/python-runtime/`（新增）、`scripts/python-runtime/{resolve-lock,prepare}.mjs`、`scripts/verify-python-runtime.mjs`、`scripts/release-package.sh`、`.github/workflows/release.yml`
- `packages/util/shared/src/runtime-v2/{script-command,resources}.ts`
- `packages/context/prompt/src/core-contributors.ts`、`packages/skill/official-skills/skills/{office-docx,office-xlsx,office-pptx,pdf,data-analysis}/`、`NOTICE`
- `apps/desktop/src/main/python-runtime/`、`apps/desktop/src/main/ipc/guards.ts`
- `apps/desktop/src/renderer/components/messages/{ScriptSourceBlock,BashRunBlock}.tsx`、`components/extensions/PythonRuntimePanel.tsx`、`mock/scenarios/script-execution.ts`
- `docs/design-docs/tool-system/agent-script-execution.md`、`docs/exec-plans/active/20261109-script-execution.md`、`docs/exec-runs/20261109-script-execution/*`、`docs/design-docs/frontend/front-中间消息区规范.md`、`docs/FRONTEND_VERIFICATION.md`
