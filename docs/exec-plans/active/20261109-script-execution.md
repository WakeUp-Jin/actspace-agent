# 脚本执行：bash 规则放宽、随包 Python、临时目录与提示词

## 目标

模型能在 ActSpace 里用两种方式跑 Python / Node 脚本——一次性计算内联 `-c` / heredoc，复杂的写文件再执行——并且有一个确定的解释器（随应用发布的 `actspace-python`）和一个会自动清理的存放位置（会话临时目录）。做完后，用户上传 PDF / Excel / Word，模型不需要专门的解析工具就能处理。设计见[脚本执行设计](../../design-docs/tool-system/agent-script-execution.md)。

## 状态

2026-11-09 设计已拍板（用户：体积「核心随包加按需扩展」、管道与重定向「适当放开」、Windows「简单实现，后续单独做」、临时脚本「TMP 为主，工作区只放交付物」）。T1–T4 已实现（本分支）；下一步 T5。

## 范围

**包含：** T1–T9。

**不包含：**
- 独立 `run_python` / `run_script` 工具、Code Mode / PTC、持久 REPL（设计第 1 节已排除）；
- Windows 上 `bash` 工具的 shell 选择与沙箱（另立设计）；
- Linux 沙箱合格性（现状：走审批）；
- 放行 `$`、反引号、子 shell、花括号展开。

## 背景

- 必读：`AGENTS.md`、[脚本执行设计](../../design-docs/tool-system/agent-script-execution.md)、[权限模型](../../design-docs/execution-safety/agent-tool-permission-model.md)第 16 节、[沙箱设计](../../design-docs/execution-safety/agent-沙箱设计.md)、[受控子进程](../../design-docs/tool-system/agent-subprocess-runner-guidelines.md)、[性能与内存约定](../../coding-standards/perf-memory-conventions.md)。
- 相关代码：
  - `packages/shell/tool-shell/src/command-rules.ts`：硬拒绝规则（`getBashHardRejectReason`）。
  - `packages/shell/tool-shell/src/command-prefix.ts`：会话前缀授权分析（`analyzeCommandPrefixGrant`）。
  - `packages/shell/tool-shell/src/query-paths.ts`：前缀授权的路径范围校验。
  - `packages/shell/tool-shell/src/plugin.ts`：bash 工具定义与 `permissionContract`。
  - `packages/shell/tool-shell/src/node-ports.ts`：bash 执行、scratch 目录（`bash-v2/<process>/`，沙箱 `TMPDIR`）、子进程 env。
  - `packages/core/tool-runtime/src/permission/engine.ts`：`evaluateGlobalBoundary`（工作区外文件审批）。
  - `packages/core/tool-runtime/src/prepared-execution.ts`：`isHostReadablePath` 的接入位置。
  - `packages/context/prompt/src/core-contributors.ts`：系统提示词核心小节。
  - `packages/skill/official-skills/`：官方 Skill。
  - `scripts/release-package.sh`、`.github/workflows/release.yml`：打包与签名。
  - `apps/desktop/src/renderer`：bash 工具卡片与审批卡。
- 已知约束：
  - 硬拒绝在所有模式生效；沙箱只在 `default` / `auto-review` 生效。
  - 每条 bash 调用都经过 `getBashHardRejectReason` 与 `analyzeCommandPrefixGrant`，是高频路径：工作量只能与命令长度线性相关，不能随会话增长。
  - 前缀授权匹配（`grantCoversProcess`）只比较 `grantPrefix` 与 `argv` 的前缀 token，脚本路径范围靠 `queryPaths`。

## 风险

- 风险：放宽后出现规则误放（引号解析与 shell 实际行为不一致）。缓解：规则只做"更严格或相同"的判断——拿不准的语法一律拒绝；测试覆盖设计第 2.1 节表格的每一行，正反例都有。
- 风险：随包 Python 让安装包变大、签名失败。缓解：核心层只含纯 Python 包；`verify-python-runtime.mjs` 在打包冒烟里跑解释器与 import 检查；签名复用 nono 的松散可执行文件流程。
- 风险：`isHostWritablePath` 被误用成"工作区外可写"。缓解：只接受 Host 自建 scratch 目录的 canonical 路径；测试断言任何其他工作区外路径仍触发 `WORKSPACE_SCOPE_APPROVAL_REQUIRED`。
- 风险：提示词让模型在用户项目里也用 `actspace-python`，导致依赖错位。缓解：提示词明确"处理用户项目的代码时用项目自己的解释器 / venv"。

## 任务

### T1 命令规则引号感知与管道 / 重定向（执行层）

文件：`packages/shell/tool-shell/src/command-rules.ts`、新测试 `packages/shell/tool-shell/src/test/command-rules.test.ts`。

- 写一个词法器：按 shell 引号规则切出词与操作符（`;` `&&` `||` `|` `&`，重定向 `>` `>>` `<` `<<` `<<<` `N>` `N>&M` `&>`），记录每个词里**未加引号**的部分；未加引号的 `$`、反引号、`( ) { }`，双引号内的 `$`、反引号 → 返回带下一步的拒绝原因。
- heredoc / here-string：分隔符或字符串任一部分带引号才放行；正文（到分隔符行为止）整体跳过，不参与分类。未加引号 → 拒绝并提示 `<<'EOF'`。
- 按控制操作符切成简单命令；对每条简单命令应用原有 `eval` / `rm` / `.git` 规则。
- 重定向目标：`/dev/null` 放行；`N>&M` 放行；其他目标 `resolve(cwd, target)` 后必须在 `workspaceRoot` 或 `os.tmpdir()` 内（字符串层面的路径判断，不 realpath——这里是硬拒绝，不是授权）。越界 → 拒绝并提示。
- 内联脚本：简单命令头为 `python` / `python3` / `actspace-python` / `node` 且含 `-c` / `-e` / `--eval` / `-p` 时，正文词不按 `;` 切段。
- 验证：`pnpm --filter @actspace/tool-shell test`。失败用例先写：`python3 -c "print(1)"` 应放行；`python3 -c "print('$x')"` 应拒绝且文案含 `single quotes`；`python3 - <<'EOF'\nprint(1)\nEOF` 放行、`<<EOF` 拒绝且文案含 `<<'EOF'`；`pnpm test | tail -n 20` 放行；`echo x > out.txt` 放行、`echo x > /etc/passwd` 拒绝且文案含 `temp directory`；`a | eval b` 拒绝；`cat x | rm -rf /` 拒绝；`$(id)`、`` `id` ``、`(cd x)`、`{ a; b; }` 拒绝；原有 `rm -rf /`、`rm -rf .git`、`printf ok` 断言不变。

### T2 解释器进入前缀授权

文件：`packages/shell/tool-shell/src/command-prefix.ts`、`packages/shell/tool-shell/src/test/command-prefix.test.ts`。

- 新增 `INTERPRETERS = { python, python3, actspace-python, node }`：第一个参数不以 `-` 开头 → `{ prefix: [head], queryPaths: [脚本路径] }`；`python3 -m <module>`（`module` 不是 `pip` / `ensurepip`）→ `{ prefix: [head] }`；`-c` / `-e` / `--eval` / `-p` → `undefined`；`--version` / `-v` 维持现状。
- 验证：`python3 scripts/run.py --input a.csv` 的 `prefix` 为 `["python3"]`、`queryPaths` 为 `["scripts/run.py"]`；`node build.mjs` 同理；`python3 -m json.tool a.json` 可复用；`python3 -m pip install x`、`python3 -c 'print(1)'`、`node -e code` 为 `undefined`（后者已有断言）。

### T3 设计文档、调研沉淀与文档同步

- 设计：`docs/design-docs/tool-system/agent-script-execution.md`，挂到 `docs/design-docs/index.md`；权限模型第 16 节链接到它。
- 调研：`docs/references/script-execution-harness-survey-20261109.md`，挂到 `docs/references/README.md`。
- 同步：`packages/shell/tool-shell/README.md`（硬拒绝与前缀授权两节）、`docs/design-docs/tool-system/agent-subprocess-runner-guidelines.md`（Bash 规则一句）。
- 验证：`pnpm check:docs`。

### T4 会话临时目录：`isHostWritablePath` 与 `ACTSPACE_SCRATCH`

文件：`packages/core/tool-runtime/src/permission/engine.ts`、`prepared-execution.ts`、`packages/shell/tool-shell/src/node-ports.ts`、`packages/shell/tool-shell/src/query-paths.ts`、`packages/core/runtime/src/harness/`（Host 把 scratch 根交给 Tool Runtime 的装配点）、对应测试。

- `node-ports.ts`：每条命令执行前确保 `<scratch>/scripts/<sessionId>/` 存在；子进程 env 加 `ACTSPACE_SCRATCH=<该目录>`。
- Tool Runtime：照 `permission/host-readable-files.ts` 的 `HostReadableFiles` 服务再写一个 `HostWritableRoots`（目录级，只接受 Host 自建 scratch 根的 canonical 路径）；`ToolRuntimeEnvironment` 加 `isHostWritablePath?: (canonicalPath) => boolean`；`evaluateGlobalBoundary` 对 `access` 为 `write` / `read` 且命中的路径不加 `WORKSPACE_SCOPE_APPROVAL_REQUIRED`；`delete` 不受影响。`tool-shell` 的 node-ports 创建 scratch 时登记到该服务。
- `query-paths.ts`：`queryPathsWithinWorkspace` 接受 scratch 根作为第二个允许范围（T2 的脚本路径可以在临时目录里）。
- 验证：`write_file` 到 `<scratch>/scripts/<sessionId>/x.py` 在 `default` 模式为 `allow`；`write_file` 到 `os.tmpdir()/other/x.py` 仍 `ask`；`delete_file` scratch 内文件仍 `ask`；bash 子进程能读到 `ACTSPACE_SCRATCH`。

### T5 随包 Python 运行时（核心层）

文件：新包 `packages/shell/python-runtime/`（`runtime.json` 解析与校验、路径解析、shim 目录生成）、`scripts/python-runtime/lock.json`、`scripts/python-runtime/prepare.mjs`、`scripts/verify-python-runtime.mjs`、`scripts/release-package.sh`、`.github/workflows/release.yml`、`packages/shell/tool-shell/src/node-ports.ts`。

- `lock.json`：`python-build-standalone` 版本与四平台（mac-arm64、mac-x64、linux-x64、win-x64）archive sha256；核心层 wheel 列表（openpyxl、XlsxWriter、python-docx、python-pptx、lxml、Pillow、pypdf、pdfplumber、pdfminer.six、markitdown 及其依赖）URL + sha256。
- `prepare.mjs --target <t> --output <dir>`：下载、校验、解包、安装 wheel 到 `site-packages`、剪 `test/` 目录、写 `runtime.json`。
- `verify-python-runtime.mjs <dir>`：运行解释器 `--version` 与 `import openpyxl, docx, pptx, pypdf, pdfplumber, markitdown`；在 `release-package.sh` 的打包冒烟里调用。
- `node-ports.ts`：解析到运行时则在子进程 env 加 `ACTSPACE_PYTHON`，PATH 前置 shim 目录（只含 `actspace-python`；Windows `actspace-python.cmd`）。开发环境没有运行时时不注入，bash 行为与现状一致。
- 验证：macOS 本地 `pnpm package:desktop:dmg` 后，包内 `actspace-python -c 'import pypdf'` 退出码 0；`pnpm --filter @actspace/python-runtime test` 覆盖 `runtime.json` 平台 / 架构不匹配拒绝。

### T6 扩展层按需下载

文件：`packages/shell/python-runtime/`、`apps/desktop/src/main`（下载任务与设置页 IPC）、`apps/desktop/src/renderer`（设置 › 扩展 › 脚本运行时）。

- `lock.json` 增加扩展层 wheel（numpy、pandas、pypdfium2 及依赖）；下载到 `<dataRoot>/runtime/python-ext/<digest>/`，sha256 校验，通过 `.pth` 文件挂到核心层 `site-packages`。
- 触发：模型 `import pandas` 失败时的提示文案指向设置页；设置页"下载数据扩展"按钮；离线可把目录手动放置。
- 验证：删除扩展目录后 `actspace-python -c 'import pandas'` 失败并提示；点击下载后成功。

### T7 提示词与官方 Skill

文件：`packages/context/prompt/src/core-contributors.ts`（`coreScripting()` 与运行时 / scratch model-fact）、`packages/skill/official-skills/skills/{office-docx,office-xlsx,office-pptx,pdf,data-analysis}/`。

- `coreScripting()` 内容见设计第 2.5 节；运行时不存在时小节退化为"写脚本文件后用系统 python3 执行"。
- Skill 从 anthropics/skills 移植，附 `LICENSE.txt` 与 `THIRD_PARTY_NOTICES` 条目；SKILL.md 中解释器统一写 `actspace-python`。
- 验证：`pnpm --filter @actspace/prompt test` 的 golden 更新；`pnpm --filter @actspace/official-skills test` 发现 5 个 Skill；`pnpm check:docs`。

### T8 展示层

文件：`packages/shell/tool-shell/src/plugin.ts`（`extractResources` 附 `script` 元数据）、`apps/desktop/src/renderer` bash 卡片与审批卡。

- 内联正文渲染为代码块（语言标签 python / javascript），超过 12 行默认折叠；审批卡摘要"运行 Python 脚本（N 行）"；脚本文件名链到文件面板。
- 验证：浏览器 mock 场景截图（`docs/FRONTEND_VERIFICATION.md` 分层）。

### T9 Windows 最简实现

- `prepare.mjs` 支持 `win-x64`；shim 为 `actspace-python.cmd`。不改 `bash` 工具的 shell 选择。
- 验证：`release.yml` Windows 矩阵打包通过，`verify-python-runtime.mjs` 在 Windows runner 上通过。

## 验证方式

- 命令：`pnpm --filter @actspace/tool-shell test`、`pnpm --filter @actspace/tool-runtime test`、`pnpm lint`、`pnpm check:docs`、`pnpm check:hot-path-reads`。
- 手工检查：macOS 打包版里对一份 PDF 说"把第 3 页的表格导出成 xlsx"，模型用 `actspace-python` 完成且不弹 pip install；临时脚本出现在 scratch 目录，关闭应用后消失。
- 观测检查：Context 面板「Bash 命令」统计中 `python3` / `actspace-python` 计数正常（`parseBashPrograms` 已支持管道）。

## 进度记录

- [x] T1 命令规则引号感知与管道 / 重定向。
- [x] T2 解释器进入前缀授权。
- [x] T3 设计文档、调研沉淀与文档同步。
- [x] T4 会话临时目录（`HostWritableRoots` 由 tool-runtime 插件提供，tool-shell 登记 scratch 根；`ACTSPACE_SCRATCH`）。
- [ ] T5 随包 Python 核心层。
- [ ] T6 扩展层按需下载。
- [ ] T7 提示词与官方 Skill。
- [ ] T8 展示层。
- [ ] T9 Windows 最简实现。

## 决策记录

- 2026-11-09：不做独立脚本工具，两种方式都走 bash；理由见设计第 1 节。
- 2026-11-09：临时脚本放 bash scratch 目录，工作区只放交付物，不教模型善后；理由是删除审批代价高。
- 2026-11-09：核心随包 + 扩展按需；PDF 渲染用 pypdfium2，不用 PyMuPDF（AGPL）。
- 2026-11-09：管道与重定向放开到"每段可分类、目标在工作区或临时目录"；`$`、反引号、子 shell 不放。
- 2026-11-09：内联 `-c` / `-e` 不进可复用授权，脚本文件进；Windows 只做 shim，shell 选择另立设计。

## 执行模式

交互模式：T1–T4 涉及权限规则，逐步审批；T5–T9 边界清楚，可转夜间模式。

## 执行文档

`docs/exec-runs/20261109-script-execution/execution-process.md`、`execution-summary.md`。
