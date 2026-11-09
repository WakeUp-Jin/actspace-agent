# 脚本执行 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-script-execution.md`
- **执行模式**：交互（T1–T4）→ 用户确认「只把这个计划完成掉」后 T5–T9 连续执行
- **开始时间**：2026-11-09 11:00
- **结束时间**：2026-11-09 16:00（T1–T9 代码完成；打包冒烟与真机手工检查待发布流程 / 用户本机）

## 执行时间线

### 步骤 1：调研与设计拍板

- **操作**：对照 deepseek-harness、opencode、kimi-cli、codex、hermes-agent、software-agent-sdk、pi-mono、goose、gemini-cli、anthropics/skills、smolagents 的脚本执行路径，确认 ActSpace 现状根因是 `command-rules.ts` 用整串正则 `/[|<>\`$(){}]/` 判断，引号内的脚本源码也被拒绝；确认 bash scratch 目录（`bash-v2/<process>/`）已是沙箱 `TMPDIR` 且可写，而 `write_file` 写工作区外要审批。
- **影响文件**：`docs/references/script-execution-harness-survey-20261109.md`（新增）、`docs/references/README.md`。
- **决定**：不做独立脚本工具；两种方式（写文件再执行、内联执行）都走 bash；核心随包 + 扩展按需；临时脚本放 scratch 自动清理；Windows 先做最简。记录在计划「决策记录」。
- **验证**：无代码变更。

### 步骤 2：设计文档与执行计划

- **操作**：写五层方案（指导、展示、执行、运行时、安全）设计文档，并按 `docs/PLANS_GUIDE.md` 落 execution plan（T1–T9）。
- **影响文件**：`docs/design-docs/tool-system/agent-script-execution.md`（新增）、`docs/design-docs/index.md`、`docs/design-docs/execution-safety/agent-tool-permission-model.md` §16、`docs/exec-plans/active/20261109-script-execution.md`（新增）、`docs/exec-plans/README.md`。
- **验证**：`pnpm check:docs` 通过。

### 步骤 3：T1 命令规则引号感知与管道 / 重定向

- **操作**：把 `command-rules.ts` 重写为逐字符词法器：按 shell 引号规则切出词与操作符，记录每个词未加引号的部分；按 `;` `&&` `||` `|` `&` 和换行切成简单命令逐段分类；heredoc 分隔符必须带引号，正文整体跳过；输出重定向目标解析后必须在工作区或系统临时目录内（或 `/dev/null` 等设备）；`2>&1`、`&>` 识别为描述符复制 / 输出重定向。拒绝文案带下一步（放进单引号 / 写成文件 / `<<'EOF'`）。
- **影响文件**：`packages/shell/tool-shell/src/command-rules.ts`、`packages/shell/tool-shell/src/test/command-rules.test.ts`（新增，60 例）。
- **决定**：未加引号的 `$`、反引号、`( ) { }`、`<( )` 继续拒绝——这是设计里"不做 shell expansion 静态分类"的边界；输入重定向（`<`、`<<<`）放行，因为读路径由沙箱与读规则管。
- **验证**：先写失败用例（`python3 -c "print(1)"` 原实现拒绝），重写后 `pnpm vitest run src/test/command-rules.test.ts` 60 通过。

### 步骤 4：T2 解释器进入前缀授权

- **操作**：`command-prefix.ts` 的 `VERSIONS` 改为 `INTERPRETERS`（python、python3、actspace-python、node）：首参为脚本文件 → `{ prefix: [head], queryPaths: [script] }`（脚本路径经 `queryPathsWithinWorkspace` 校验）；`-m <模块>` 且非 pip / ensurepip / venv → `{ prefix: [head] }`；`-c` / `-e` / `-p` 等其他前置选项保持单次；`--version` / `node -v` 照旧。
- **影响文件**：`packages/shell/tool-shell/src/command-prefix.ts`、`src/test/command-prefix.test.ts`、`src/test/lifecycle.test.ts`。
- **决定**：`lifecycle.test.ts` 原断言 `pnpm test | cat` 为 `deny`，是旧行为的编码；改为 `ask` 且不提供可复用授权，并新增 `pnpm test $(id)` 仍为 `deny` 的断言，保证"放开管道、不放开替换"两头都被测试锁住。
- **验证**：`pnpm --filter @actspace/tool-shell test` 191 通过 1 跳过；`tsc --noEmit` 通过；`biome lint` 无错误；`pnpm check:hot-path-reads` 通过。

### 步骤 5：T3 文档同步

- **操作**：同步 `packages/shell/tool-shell/README.md`（新增「Bash 硬拒绝」节、前缀授权加解释器）、`docs/design-docs/tool-system/agent-subprocess-runner-guidelines.md`、`docs/design-docs/execution-safety/README.md`「Bash 当前边界」与「不做」列表。
- **验证**：`pnpm check:docs` 通过。

### 步骤 6：T4 会话临时目录

- **操作**：tool-runtime 插件新增 `HostWritableRoots` 服务（`actspace.host-writable-roots`），`ToolRuntimeEnvironment.isHostWritablePath` 命中时 `evaluateGlobalBoundary` 不再给 read / write 加 `WORKSPACE_SCOPE_APPROVAL_REQUIRED`，delete 照旧 ask。tool-shell 建端口时 realpath scratch 根并登记；每条命令前确保 `<scratch>/scripts/<sessionId>/` 存在并导出 `ACTSPACE_SCRATCH`；`queryPathsWithinWorkspace` 接受 scratch 根作为第二个允许范围。
- **影响文件**：`packages/core/tool-runtime/src/permission/{engine,host-writable-roots}.ts`、`prepared-execution.ts`、`plugin.ts`、`packages/shell/tool-shell/src/{node-ports,plugin,query-paths}.ts`、对应测试。
- **验证**：`write_file` 到 scratch 内 allow、`os.tmpdir()/other` 仍 ask、scratch 内 delete 仍 ask；bash 子进程读到 `ACTSPACE_SCRATCH`。

### 步骤 7：T5 随包 Python 核心层

- **操作**：新包 `@actspace/python-runtime`（`runtime.json` 清单与校验、定位、最小 ZIP 读取器与 wheel 安装、扩展层下载）；`scripts/python-runtime/resolve-lock.mjs` 用 host pip `--dry-run --report` 按五个目标解析 wheel 闭包写 `lock.json`（CPython 3.12.16，核心 = 核心包依赖闭包，其余归扩展层）；`prepare.mjs` 下载、校验、裁剪、写 shim / `sitecustomize.py` / `runtime.json`；`verify-python-runtime.mjs` 跑 `--version` 与导入；`release-package.sh` 打包 `runtime/python` 并在各平台 verify，macOS 对运行时内 `.so` / `.dylib` / `bin/*` 逐个签名并加 entitlements；tool-shell 注入 PATH shim、`ACTSPACE_PYTHON`、`ACTSPACE_PYTHON_EXT`；agent-host、CLI、桌面 Host 接线。
- **决定**：markitdown 移到扩展层（magika → onnxruntime）；pypdfium2 随 pdfplumber 进核心层；Linux 删未引用的 `libpython3*.so*`；shim 以 `-E -s -X utf8` 启动，隔离用户 `PYTHON*` 变量与 user site。
- **验证**：`pnpm --filter @actspace/python-runtime test`；`node --check` 三个脚本；本环境无 macOS / 签名，打包冒烟留给 `release.yml`。

### 步骤 8：T6 扩展层按需下载

- **操作**：main `PythonRuntimeService`（定位随包 Python、下载扩展层、状态与进度）；IPC `pythonRuntime.getStatus` / `installExtension`（契约、channel、类型、mock、入参守卫）；设置 › 扩展 › 插件 › 命令行 行下的「脚本运行时」面板（版本、核心包、下载按钮、离线 wheel 提示）。
- **决定**：扩展层通过 `sitecustomize.py` 读 `ACTSPACE_PYTHON_EXT` 挂载，不用 `.pth`，应用包保持只读。
- **验证**：`python-runtime-service.test.ts`、`plugins-section.test.tsx`、`ipc-guards.test.ts`。

### 步骤 9：T7 提示词与官方 Skill

- **操作**：prompt 新增 `core/scripting` 提示段与 `host/scripting-facts` model-fact，`ScriptingFacts` 由 agent-factory 从 tool-shell `apply` 时 provide 的 `tools.shell-tools` 服务构造（context-system 过滤器放行）；移植 anthropics/skills 的 docx / xlsx / pptx / pdf（Apache 2.0，各带 `LICENSE.txt`，根 `NOTICE` 登记），改写为 `actspace-python` + 随包库、临时文件放 `$ACTSPACE_SCRATCH`、无 `pip install`；新增 `data-analysis`；`pdf/scripts/pdf_to_images.py`（pypdfium2 渲染）；`OFFICIAL_SKILLS_VERSION` 升到 2。
- **决定**：只移植 SKILL.md 指导，不移植依赖 LibreOffice / Node 库的脚本；pptx 缩略图用 Pillow，不引入 matplotlib。
- **验证**：prompt 12、official-skills 3、skill 2（discovery 断言 6 个官方 id 与 `actspace-official@2`）、context-system 2；desktop `fixed-renderer-skills.test.ts` 改为按 id 列表断言。

### 步骤 10：T8 展示层

- **操作**：`@actspace/shared/runtime-v2/script-command.ts` 新增 `detectScriptCommand` / `elideScriptSource` / `scriptLineCount` / `scriptLanguageLabel`；`ToolResource` 与 `ApprovalResourceSummary` 的 process 分支加可选 `script`，`summarizeResource` 透传，tool-shell `extractResources` 附带；renderer 新建 `ScriptSourceBlock`（`highlightToLines` 按语言高亮，超过 12 行默认露出 8 行 + 「展开全部 N 行」），`BashRunBlock` 执行行写「Python 脚本（N 行）」、详情 `$` 行省略正文、代码块夹在命令头与输出之间、`# script:` 工作区相对路径链到 `onOpenWorkspaceFile`，审批卡摘要「运行 Python 脚本（N 行）」/「运行 JavaScript 脚本 pack.mjs」；`render-message.tsx` 把 `onOpenWorkspaceFile` 传给 `BashRunBlock`；新增 mock 场景 `script-execution`。
- **决定**：识别器放 shared 供两端共用，只认简单命令（无管道、无 `$` 展开）；脚本文件链接改用 `PlainButton` + 行内样式（`.tool-file-link` 是 `display: flex`，在 `pre` 里会换行；原生 `<button>` 基线不许增加）；带代码块的详情容器放高到 460px，折叠后的代码不必先在容器里滚。
- **验证**：`script-command.test.ts` 6、`bash-script-block.test.tsx` 6、tool-shell lifecycle 新用例；`pnpm check:frontend-tokens` / `check:frontend-theme`；`pnpm --filter @actspace/desktop dev:renderer` + headless Chrome（CDP 点开 Worked 与 Bash 行）截图核对执行详情、脚本文件链接与审批卡三种形态。

### 步骤 11：T9 Windows 最简实现

- **操作**：核对 T5 已覆盖：`prepare.mjs --target win-x64`（`actspace-python.cmd` shim、win_amd64 wheel）、`runtime-manifest.ts` 的 `win32/x64 → win-x64`、`locate.ts` 不检查执行位、`release.yml` windows-latest 矩阵、`verify-python-runtime.mjs` Windows 分支（.cmd 不能带源码做参数，导入检查直接调 `python.exe` 加 shim 参数）、`release-package.sh` Windows 分支打包后 verify。无代码新增；设计文档第 3 节与计划进度记录补上这些事实。
- **验证**：`release.yml` 只在 tag / 手动触发时跑，本环境无法触发；Windows runner 上的打包与 verify 待下一次发布流程确认。

## 遇到的问题

- **问题**：词法器初版在输入结尾先检查未消费的 heredoc 再调用最终 `endCommand()`，导致 `cat <<'EOF'\nbody\nEOF`（无尾随换行）误报"未终止"。
  - **原因**：heredoc 分隔符是在命令结束（换行）时才注册并消费正文；结尾没有换行时，最后一条命令的正文消费被跳过了。
  - **应对**：调整顺序：先 `endCommand()`（内部会消费 pending heredoc），再检查剩余 pending。
- **问题**：工作区 `node_modules` 为空、`@actspace/tool-runtime` 未构建，`vitest` 与 `tsc` 解析依赖失败。
  - **应对**：`pnpm install --frozen-lockfile` 后 `pnpm --filter @actspace/tool-shell... build`。

- **问题**：`pnpm --filter @actspace/skill test` 在升级 `OFFICIAL_SKILLS_VERSION` 后仍断言 `actspace-official@1`。
  - **原因**：skill 包通过 official-skills 的 `dist` 解析，改源码后要先 `pnpm --filter @actspace/official-skills build`。
- **问题**：`script-command` 对 `python3 -X utf8 -c '…'` 返回 undefined。
  - **原因**：`-X` 的参数 `utf8` 被当成未知词。加 `FLAG_WITH_ARGUMENT`（python `-X` / `-W`，node `-r` / `--require` / `--import`）跳过带参 flag。
- **问题**：详情里 `# script:` 后的文件名换到下一行。
  - **原因**：`.tool-file-link` 全局是 `display: flex`。脚本链接改为独立的行内类，不复用这个 class。
- **问题**：headless Chrome 截 `?mock=script-execution` 显示「无法连接桌面服务」。
  - **原因**：mock 场景文件里一处 `durationMs` 未传参，mock bridge 构造抛错后 `main.tsx` 回退到致命页。用 CDP 抓 `Runtime.consoleAPICalled` 才看到；修后正常。
- **问题**：`pnpm --filter @actspace/desktop test` 有两处失败：`ipc-guards.test.ts`（契约多了 `pythonRuntime.*` 两个 invoke 没登记守卫）、`fixed-renderer-skills.test.ts`（断言官方只有 1 个 Skill）。均为 T6 / T7 的遗漏，已补。

## 跳过或推迟的事项

- `release.yml` 的 macOS 签名 / Windows 打包冒烟（`verify-python-runtime.mjs`）：工作流只在 tag 或手动触发时跑，本环境没有触发权限，留给下一次发布。
- 计划「验证方式」里的手工检查（打包版对 PDF 说"导出第 3 页表格成 xlsx"）与 Electron 窗口核对：需要用户本机；浏览器 mock 截图已核对。
- `pnpm --filter @actspace/tool-runtime test` 有 3 个**预存**失败（`runtime.test.ts`：read-only capability 相对路径、process Session Grant 两例，status 为 denied），`git stash` 后同样失败，与本计划改动无关，未在本轮处理。
