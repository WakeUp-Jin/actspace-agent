# Agent 脚本执行设计

管模型在 ActSpace 里怎么写、怎么跑一段 Python / Node 脚本：不新增脚本专用工具，由 `bash` 工具的命令规则、随应用发布的解释器、会话临时目录、系统提示词与官方 Skill 五层共同实现。实施见 [执行计划](../../exec-plans/active/20261109-script-execution.md)；外部 harness 调研见 [参考资料](../../references/script-execution-harness-survey-20261109.md)。

## 1. 为什么做、做成什么样

用户上传一份 PDF、一张 Excel、一份 Word，或者要做一次数据清洗，模型今天在 ActSpace 里没有办法处理：`read_file` 只读 UTF-8 文本，没有 PDF / Office 解析工具，而 `bash` 工具的硬拒绝规则把 `python3 -c '...'`、heredoc、`node -e` 全部拦下（括号、`<`、`$` 都在 `UNSUPPORTED_SHELL_SYNTAX_RE` 里），模型唯一能走的路是 `write_file` 写脚本再 `bash python3 x.py`，而系统提示词从未告诉它这条路。

目标状态：**模型一旦能写 Python，就能解析和处理所有文件格式**，不需要为每种格式造一个工具。做法是让两种主流脚本执行方式都可用，并给它们一个确定的解释器和确定的存放位置：

| 方式 | 适用 | 形态 |
|---|---|---|
| 内联执行 | 一次性计算、探测、小转换 | `bash actspace-python -c '...'` 或 `python3 - <<'EOF' … EOF` |
| 写文件再执行 | 复杂、可复用、要交付 | `write_file` 到临时目录或工作区 → `bash actspace-python <file>` |

排除的方案：

- **独立 `run_python` / `run_script` 工具**。多一个工具占上下文，且和 `bash` 的边界要靠描述文字维持（Hermes agent 为此专门写了"把 command 传给 execute_code"的纠错提示）。脚本能做的事 `bash` 都能做，没有新的能力面，不值得新工具。
- **Code Mode / PTC**（DSH `run_code`、codex `exec`、opencode `execute`、pi `codemode`）。那是"用 JS 编排其他工具调用"的运行时，不是给模型跑 pandas 用的通用脚本执行，是另一件事。
- **持久 REPL**（codex `exec_command` + `write_stdin`、OpenHands tmux）。`bash` 是 fresh shell 的设计，持久状态用文件承载，不改。
- **全量随包**解释器与所有库（约 250 MB）。改为核心随包、扩展按需。

## 2. 五层结构

```
指导层   系统提示词小节 + 官方 Skill（docx / xlsx / pptx / pdf / data）
展示层   bash 卡片识别脚本：代码块渲染、审批卡摘要
执行层   bash 命令规则：引号感知，放行内联脚本、管道与工作区内重定向
运行时层 随应用发布的 Python 3.12 + 锁定 wheel；只对 bash 子进程可见
安全层   沿用现有沙箱与权限模型，零新权限域
```

### 2.1 执行层：命令规则改成引号感知

现状 `packages/shell/tool-shell/src/command-rules.ts` 对整条原始字符串跑 `/[|<>\`$(){}]/`，引号里的字符也被拒；而同文件的 `tokenize()` 本来就会处理引号，只是没用上。改为：先按 shell 引号规则切词，再只对**未加引号**的部分做语法判断。

| 语法 | 新规则 | 理由 |
|---|---|---|
| 单引号内任意字符 | 放行 | shell 不展开 |
| 双引号内 `$`、反引号 | 拒绝 | 会展开；其他字符放行 |
| 未加引号的 `$`、反引号 | 拒绝 | 变量 / 命令替换无法分类。不放行 `$TMPDIR`：临时目录的绝对路径由环境事实给出 |
| 未加引号的 `( )`、`{ }`、`<( )`、`>( )` | 拒绝 | 子 shell、花括号展开、进程替换 |
| 控制操作符 `;` `&&` `\|\|` `\|` `&` | 放行；按它们切成简单命令，**每条简单命令单独分类** | 管道的每一段都经过 `eval` / `rm` 等规则 |
| 重定向 `>` `>>` `2>` `&>` `>&` | 目标解析后必须在工作区或系统临时目录内，或是 `/dev/null`；`2>&1` 这类 fd 复制放行 | 沙箱同样只允许写这两处，规则和沙箱一致 |
| 输入重定向 `<` | 放行 | 读权限由沙箱（凭据目录不可读）与审批管 |
| heredoc `<<` / here-string `<<<` | 分隔符或字符串**必须带引号**（`<<'EOF'`）；正文不透明，不参与分类 | 未加引号的 heredoc 正文会展开 |
| `eval` `source` `.` `exec` 等 shell 内建 | 维持拒绝 | shell 层动态执行 |
| `rm` / `rmdir` / `mv .git` 规则 | 维持，按简单命令应用 | 不变 |

**内联脚本不是 shell 层动态执行。** `python3 -c 'print(1)'` 对 shell 来说只是一个带参数的程序，和 `python3 x.py` 的能力面完全一样；权限模型第 16 节说的"动态执行"指 `eval`/`source` 这类改变 shell 自身行为的内建，不包括解释器参数。`-c` / `-e` / heredoc 正文视作不透明字符串，不按 `;` 切段（否则 `print(1); import os` 会被当成两条 shell 命令）。

拒绝文案必须给出下一步（OpenHands `terminal` 工具的做法），例如：

- 双引号里有 `$`：`Wrap inline script source in single quotes, or write it to a file and run the file.`
- heredoc 分隔符未加引号：`Quote the heredoc delimiter (<<'EOF') so the body is not expanded.`
- 重定向越界：`Redirection targets must stay inside the workspace or the temp directory.`

### 2.2 执行层：解释器进入会话前缀授权

`command-prefix.ts` 今天只允许 `node -v`、`python3 --version` 复用授权，非 full-access 下每跑一次脚本都要审批。改为：

- `python` / `python3` / `node` / `actspace-python` 第一个参数是脚本文件（不以 `-` 开头），或 `python3 -m <module>`（`pip`、`ensurepip` 除外）→ 前缀 `[<解释器>]`，脚本路径进 `queryPaths`，必须在工作区或会话临时目录内。
- `-c` / `-e` / `--eval` / `-p` 内联形态**不**进入可复用授权，保持单次审批。授权"本会话在本工作区运行 Python 文件"不等于授权任意内联源码；这和现有测试 `node -e code` 保持单次的预期一致。
- 管道、重定向、heredoc 命令一律单次审批（前缀分析本来就不支持这些语法）。

### 2.3 运行时层：随应用发布的 Python

照 DSH `scripts/primary-runtime/` 的做法：`astral-sh/python-build-standalone` 3.12 + 锁定 wheel（URL + sha256）清单，构建脚本下载、校验、剪掉 `test/` 目录、生成 `runtime.json`（platform、arch、python 版本、包版本表、digest）。打包位置 `Contents/Resources/app/runtime/python/`，与 `nono`、`browser-components` 同级；`scripts/release-package.sh` 已有 Resources 下松散可执行文件单独签名的先例。

| 层 | 内容 | 位置 |
|---|---|---|
| 核心层（随包） | 解释器；openpyxl、XlsxWriter、python-docx、python-pptx、lxml、Pillow；pypdf、pdfplumber（含 pdfminer.six）；markitdown | `Resources/app/runtime/python/` |
| 扩展层（按需） | numpy、pandas；pypdfium2（PDF 页渲染成图，配 `inspect_image`） | `<dataRoot>/runtime/python-ext/`，首次用到时下载，sha256 校验；设置页可手动触发；离线可手动放置 |

许可约束：**不用 PyMuPDF（AGPL）**；PDF 渲染用 pypdfium2（Apache / BSD）。包集与 anthropics `skills/pdf`（Apache 2.0）一致：pypdf 读写、pdfplumber 抽文本和表格。

**暴露方式——不新增工具。** DSH 用 `load_workspace_dependencies` 工具返回路径；ActSpace 用两个更轻的手段：

- `bash` 子进程环境：`ACTSPACE_PYTHON=<绝对路径>`，PATH 前置一个 shim 目录，里面只有 `actspace-python`（Windows 为 `actspace-python.cmd`）。不叫 `python3`，所以不遮蔽用户自己的解释器和 venv——这正是 DSH"不改 PATH"要守住的东西。
- 系统提示词 model-fact 一行：`actspace-python: Python 3.12，含 openpyxl / python-docx / pypdf / pdfplumber / markitdown；numpy / pandas 按需`。

Codex 没有打包 Python，靠系统 `python3` + 沙箱放行；DSH 打包但不带 PDF 库。ActSpace 两者都要：放行是前提，打包是保证。

### 2.4 临时脚本放哪：会话临时目录为主，工作区只放交付物

`bash` 子进程的 `TMPDIR` 已经是 Host 自建的 `bash-v2/<process>/`，沙箱可写，Harness 卸载时整目录删除，崩溃残留 24 小时后扫掉。临时脚本就放这里，**模型不需要学会清理**。

| 位置 | 放什么 | 清理 |
|---|---|---|
| `$TMPDIR/scripts/<sessionId>/` | 一切临时脚本与中间产物 | 自动（Harness 卸载 / 24h 扫描） |
| 工作区正式位置 | 只放交付物：用户以后还会跑的脚本、任务产出 | 不清理，和代码文件一样进 review |

不允许"临时脚本放工作区再删"：`delete_file` 是 high risk、不可复用授权，`bash rm` 不在可复用前缀里，每删一个文件弹一次审批，模型很快就会"忘记"清理。把临时文件从一开始放在会自动消失的地方，比教模型善后可靠。

按 session 分子目录是因为 scratch 是每个 Harness 进程一个，不是每个会话一个；两个会话的 `convert.py` 不能互相覆盖。

**`write_file` 需要免审批写这个目录。** 今天任何工作区外路径都触发 `WORKSPACE_SCOPE_APPROVAL_REQUIRED`（`packages/core/tool-runtime/src/permission/engine.ts`）。Tool Runtime 已有 `isHostReadablePath`（Host 自有的工作区外只读路径，如 Session 转录），加对称的 `isHostWritablePath`，仅覆盖本进程 scratch 目录：`write_file` / `edit_file` / `read_file` 免审批，`delete_file` 维持 ask。这是 Host 自己创建、自己清理的目录，纳入 Host 自有边界，不等于放开"工作区外可写"。

模型通过两个渠道知道路径：`bash` 子进程环境 `ACTSPACE_SCRATCH=<scratch>/scripts/<sessionId>`；系统提示词 model-fact 给出绝对路径，并说明"临时脚本放这里，会话结束自动清理"。

### 2.5 指导层：提示词小节与官方 Skill

`packages/context/prompt/src/core-contributors.ts` 新增 `coreScripting()`，控制在十行内：

- 一次性计算 / 探测用 `actspace-python -c '...'`，单引号包裹。
- 需要复用、交付或超过约 20 行：`write_file` 到 `ACTSPACE_SCRATCH` 再执行；要留给用户的脚本写到工作区正式位置。
- 工具输出只回头 8000 字符：大结果写文件再 `read_file` / `grep`，不要重跑。
- 不要 `pip install`，不要找系统 Python；处理**用户项目**的代码时用项目自己的解释器 / venv。
- PDF / Office 优先 `markitdown` 转 Markdown 读；要看版面时用 pypdfium2 渲染页面后 `inspect_image`。

官方 Skill 放 `packages/skill/official-skills/skills/`：`office-docx`、`office-xlsx`、`office-pptx`、`pdf`、`data-analysis`，各带 `scripts/`。anthropics `skills/{docx,xlsx,pptx,pdf}` 是 Apache 2.0，可带 LICENSE 移植其脚本（`recalc.py`、`convert_pdf_to_images.py`、表单填写脚本等），把"预装了 openpyxl / markitdown"改成指向 `actspace-python`。Skill 脚本**不写、只执行**：`bash actspace-python <skill路径>/scripts/recalc.py book.xlsx`，不复制进工作区。现有机制（catalog 注入描述、模型用 `read_file` 按需读正文，无需 `load_skill`）直接复用，见 [Skill 加载](agent-skill-loading.md)。Chat 模式不注入工作区 Skill catalog，官方 Skill 的注入范围随现有规则。

### 2.6 展示层

`extractResources` 对识别出的脚本命令附带 `script: { language, source | path }` 元数据；bash 卡片据此把 `-c` / heredoc 正文渲染成带语言标签的代码块、超过阈值默认折叠；审批卡摘要写"运行 Python 脚本（12 行）"而不是一长串 shell；脚本文件名链到文件面板。按 `docs/design-docs/frontend/` 规范做。

### 2.7 安全层：零新权限域

脚本能做的事 `bash` 本来就能做（`python3 x.py` 今天就能过硬拒绝），放行 `-c` 没有扩大能力面：

- 沙箱不变：工作区 + 临时目录可写，`.git/hooks`、`.git/config` write-deny，凭据不可读，网络开放。
- `-c` 正文不透明意味着 `rm` 分类不覆盖脚本内的 `os.remove`；`python3 x.py` 本来也不覆盖，兜底一直是沙箱而不是正则。
- 随包 Python 只在 `bash` 子进程可见，不进用户 shell，不改系统 PATH。
- 重定向目标规则与沙箱可写范围一致；沙箱不可用（Linux nono 不合格）时命令走审批，照旧。
- 内联脚本与管道命令不进可复用授权。

## 3. 平台

- macOS：完整路径（nono / Seatbelt 沙箱、随包 Python、签名）。
- Linux：随包 Python 可用；沙箱不合格时走审批，与现状一致。
- Windows：本轮只做最简单的事——随包 `python.exe` 与 `actspace-python.cmd` shim；`bash` 工具在 Windows 上的 shell 选择（Git Bash `bash.exe` 还是 PowerShell）与沙箱另立设计，不在本文范围。

## 4. 与现有设计的关系

- [权限模型](../execution-safety/agent-tool-permission-model.md)第 16 节要求 Bash 语法放宽"必须另立设计和计划"，本文就是那份设计；第 16 节已链接到这里。
- [沙箱设计](../execution-safety/agent-沙箱设计.md)：可写范围不变，重定向规则对齐它。
- [受控子进程](agent-subprocess-runner-guidelines.md)：Bash Host 实现事实（shell 选择、30 秒转后台、输出上限）不变。
- [Skill 加载](agent-skill-loading.md)：官方 Skill 的发现与正文读取机制不变。
