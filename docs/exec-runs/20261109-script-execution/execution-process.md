# 脚本执行 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-script-execution.md`
- **执行模式**：交互
- **开始时间**：2026-11-09 11:00
- **结束时间**：2026-11-09 14:10（T1–T3；T4–T9 未开始）

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

## 遇到的问题

- **问题**：词法器初版在输入结尾先检查未消费的 heredoc 再调用最终 `endCommand()`，导致 `cat <<'EOF'\nbody\nEOF`（无尾随换行）误报"未终止"。
  - **原因**：heredoc 分隔符是在命令结束（换行）时才注册并消费正文；结尾没有换行时，最后一条命令的正文消费被跳过了。
  - **应对**：调整顺序：先 `endCommand()`（内部会消费 pending heredoc），再检查剩余 pending。
- **问题**：工作区 `node_modules` 为空、`@actspace/tool-runtime` 未构建，`vitest` 与 `tsc` 解析依赖失败。
  - **应对**：`pnpm install --frozen-lockfile` 后 `pnpm --filter @actspace/tool-shell... build`。

## 跳过或推迟的事项

- T4–T9（scratch 可写范围、随包 Python、扩展层下载、提示词与 Skill、展示层、Windows）：按计划顺序后续执行；T1–T3 不依赖它们，可独立合入。
- `docs/exec-plans/active/20261109-script-execution.md` 验证方式里的"手工检查"与"观测检查"依赖 T5 / T8，本轮不适用。
