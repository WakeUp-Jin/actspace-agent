# 脚本执行 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-script-execution.md`
- **执行过程**：`docs/exec-runs/20261109-script-execution/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码完成（T1–T9）；macOS / Windows 打包冒烟与真机手工检查待发布流程与用户本机

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Bash 硬拒绝改为引号感知词法器 | `packages/shell/tool-shell/src/command-rules.ts` | 让 `python3 -c '…'`、`node -e '…'`、带引号分隔符的 heredoc、管道、工作区内重定向可以运行；未加引号的 `$`、反引号、子 shell 仍拒绝，拒绝文案带下一步 |
| 解释器进入会话前缀授权 | `packages/shell/tool-shell/src/command-prefix.ts` | `python3 run.py …` / `node build.mjs …` / `python3 -m json.tool` 可复用授权，脚本路径必须在工作区；`-c` / `-e` 与 pip 保持单次 |
| 测试 | `src/test/command-rules.test.ts`（新增）、`command-prefix.test.ts`、`lifecycle.test.ts` | 锁住放行与拒绝两侧；`pnpm test \| cat` 从 deny 改为 ask |
| 设计与计划 | `docs/design-docs/tool-system/agent-script-execution.md`、`docs/exec-plans/active/20261109-script-execution.md`、`docs/references/script-execution-harness-survey-20261109.md` | 五层方案、九个任务、十一个参考实现的调研沉淀 |
| 文档同步 | `packages/shell/tool-shell/README.md`、`agent-subprocess-runner-guidelines.md`、`execution-safety/README.md`、`agent-tool-permission-model.md` §16、`design-docs/index.md`、`exec-plans/README.md`、`references/README.md` | 旧的"复杂 shell 语法一律硬拒绝"描述全部改掉 |
| 会话临时目录（T4） | `packages/core/tool-runtime/src/permission/{engine,host-writable-roots}.ts`、`packages/shell/tool-shell/src/{node-ports,plugin,query-paths}.ts` | `HostWritableRoots` 让 scratch 根内 read / write 免审批、delete 仍 ask；每条命令导出 `ACTSPACE_SCRATCH=<scratch>/scripts/<sessionId>`；脚本路径在 scratch 内也可进前缀授权 |
| 随包 Python 核心层（T5） | `packages/shell/python-runtime/`（新包 + `lock.json`）、`scripts/python-runtime/{resolve-lock,prepare}.mjs`、`scripts/verify-python-runtime.mjs`、`scripts/release-package.sh`、`.github/workflows/release.yml`、tool-shell / agent-host / CLI / desktop 接线 | CPython 3.12.16 + openpyxl、XlsxWriter、python-docx、python-pptx、lxml、Pillow、pypdf、pdfplumber（含 pypdfium2）随包；shim `actspace-python`（`-E -s -X utf8`）、`ACTSPACE_PYTHON`；五个目标平台；macOS 逐文件签名 |
| 扩展层按需下载（T6） | `apps/desktop/src/main/python-runtime/`、`PythonRuntimePanel.tsx`、`pythonRuntime.getStatus` / `installExtension` IPC、`ipc/guards.ts` | numpy、pandas、markitdown 下载到 `<dataRoot>/runtime/python-ext/<digest>/`，sha256 校验，`sitecustomize.py` 读 `ACTSPACE_PYTHON_EXT` 挂载；离线把 wheel 放 `wheels/` |
| 提示词与官方 Skill（T7） | `packages/context/prompt/src/core-contributors.ts`、`packages/skill/official-skills/skills/{office-docx,office-xlsx,office-pptx,pdf,data-analysis}/`、`NOTICE` | `core/scripting` 提示段 + `host/scripting-facts`；四个 Skill 改编自 anthropics/skills（Apache 2.0，带 LICENSE），一个自写；`OFFICIAL_SKILLS_VERSION` 2 |
| 展示层（T8） | `packages/util/shared/src/runtime-v2/script-command.ts`、`ToolResource` / `ApprovalResourceSummary` 的 `script`、`apps/desktop/src/renderer/components/messages/{ScriptSourceBlock,BashRunBlock}.tsx`、mock `script-execution` | bash 行「Python 脚本（N 行）」、详情代码块（> 12 行折叠）、`# script:` 文件名链到右侧面板、审批卡「运行 Python 脚本（N 行）」 |
| Windows 最简（T9） | 无新增；T5 的 `prepare.mjs` win-x64、`.cmd` shim、`release.yml` windows-latest、verify Windows 分支 | `bash` 的 shell 选择与沙箱另立设计 |

## 人工验证指引

### 必须验证

1. **内联脚本可运行**
   - 验证方式：在 default 模式下让模型执行 `python3 -c "print(sum(range(10)))"`。
   - 预期结果：出现单次审批卡片而不是 `BASH_COMMAND_DENIED`；批准后输出 `45`。

2. **替换仍被拒绝且文案可行动**
   - 验证方式：让模型执行 `echo $(id)`。
   - 预期结果：立即拒绝，文案包含 "Put inline script source in single quotes, or write the script to a file"。

3. **脚本文件复用授权**
   - 验证方式：先批准 `python3 scripts/a.py` 并勾选会话复用，再执行 `python3 scripts/b.py --flag`，再执行 `python3 ../outside.py`。
   - 预期结果：第二条不再询问；第三条询问（脚本路径不在工作区）。

4. **随包 Python 可用（打包版）**
   - 验证方式：安装 `release.yml` 产出的 macOS / Windows 包，对一份 PDF 说"把第 3 页的表格导出成 xlsx"。
   - 预期结果：模型用 `actspace-python`（或 heredoc）完成，不弹 `pip install`；临时脚本出现在 scratch 目录，关闭应用后消失；设置 › 扩展 › 插件 › 命令行 下看到「脚本运行时」面板与 Python 版本。

5. **数据扩展下载**
   - 验证方式：面板点「下载数据扩展」；完成后让模型 `actspace-python -c 'import pandas; print(pandas.__version__)'`。
   - 预期结果：进度到 100% 后状态变为已安装；命令输出版本号。未下载前 `import pandas` 失败，模型提示去设置页下载。

6. **Bash 卡片的脚本形态（Electron）**
   - 验证方式：让模型跑一段 > 12 行的 heredoc Python，再跑一个工作区内的 `.py` 文件。
   - 预期结果：主行「Ran Python 脚本（N 行）」；展开后 `$` 行只留 heredoc 首行，下面是带 Python 标签的代码块与「展开全部 N 行」，输出在代码块之后；脚本文件卡片 `# script:` 后的文件名可点开右侧面板。审批卡头行写「运行 Python 脚本（N 行）」。浅色 / 深色各看一遍。

### 建议验证

1. **重定向边界**
   - 验证方式：`pnpm test > out.log 2>&1`、`echo x > /etc/hosts`。
   - 预期结果：前者进入审批 / 执行；后者立即拒绝，文案含 "temp directory"。

2. **heredoc**
   - 验证方式：`python3 - <<'EOF'` 多行脚本 vs `python3 - <<EOF`。
   - 预期结果：前者放行到审批；后者拒绝并提示 `<<'EOF'`。

## Agent 已完成的验证

- 包测试：`@actspace/shared`、`@actspace/tool-shell`（含 `command-rules` 60 例、`lifecycle` 脚本元数据）、`@actspace/python-runtime`、`@actspace/prompt`、`@actspace/official-skills`、`@actspace/skill`、`@actspace/context-system`、`@actspace/runtime` 通过；`@actspace/tool-runtime` 除 3 个预存失败外通过（见遗留）。
- `pnpm --filter @actspace/desktop typecheck` 与 `test`（含 `bash-script-block.test.tsx` 6 例、`ipc-guards`、`fixed-renderer-skills`、`plugins-section`、`python-runtime-service`）通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm check:docs`、`pnpm check:hot-path-reads`、`pnpm check:ipc-channels`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm test:contract-matrix`：通过。
- 浏览器 renderer：`pnpm --filter @actspace/desktop dev:renderer` + headless Chrome（CDP 点开 Worked / Bash 行）核对 `?mock=script-execution` 的三种形态：heredoc 执行详情（代码块折叠 + 输出）、脚本文件详情（`# script:` 行内链接）、审批卡（「运行 Python 脚本（3 行）」+ 代码块）。
- 未做：Electron 窗口、真实模型与打包版（本环境无 Computer Use、无 macOS / Windows runner）。

## 已知风险和遗留事项

- 管道放开后，模型可以把一个受前缀授权的程序输出接给任何第二段命令；每段仍各自过硬拒绝规则，但整条命令不提供可复用授权（只单次审批），这是设计里的既定边界。
- 输出重定向允许写系统临时目录（`/tmp`、`os.tmpdir()`）；这与 bash 沙箱可写范围一致，但 `full-access` 下没有沙箱，依赖的是规则而不是内核边界。
- `command-prefix.ts` 的 `UNSUPPORTED` 正则仍把 `|`、`>` 等整串排除，所以带管道 / 重定向的命令永远不进可复用授权（符合设计）。
- `release.yml` 的 macOS 签名与 Windows 打包冒烟没在本轮跑过：`lock.json` 的 sha256 与 `prepare.mjs` 裁剪规则只经过脚本语法检查与包单测，首次 tag 可能需要修一轮。
- Windows 上 `bash` 工具用哪个 shell、`.cmd` shim 在 Git Bash 下是否能以 `actspace-python` 直呼（MSYS 不解析 `.cmd`，可能要 `"$ACTSPACE_PYTHON"`）未验证；提示词已同时给出 `ACTSPACE_PYTHON` 绝对路径。属于「Windows 另立设计」的范围。
- `@actspace/tool-runtime` 的 `runtime.test.ts` 有 3 个预存失败（read-only capability 相对路径、process Session Grant 两例），`git stash` 后同样失败，与本计划无关。
- 脚本识别只认简单命令：`python3 x.py | head`、`VAR=1 python3 -c '…'` 照普通 bash 显示，不是缺陷。

## 后续建议

- 合入后手动触发一次 `release.yml`（不填 tag 只打包），确认三平台 `verify-python-runtime.mjs` 通过，再按需修 `lock.json` / 签名。
- 单独立 Windows 设计：`bash` 工具的 shell 选择、`.cmd` shim 的可达性、沙箱。
- 处理 `@actspace/tool-runtime` 的 3 个预存失败。
- 观察真实会话里模型对 heredoc 与 `-c` 的选择比例（Context 面板「Bash 命令」统计），决定提示词里 20 行的阈值是否调整。
