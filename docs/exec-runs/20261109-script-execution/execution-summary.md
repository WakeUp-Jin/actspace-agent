# 脚本执行 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-script-execution.md`
- **执行过程**：`docs/exec-runs/20261109-script-execution/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成（T1–T3 完成；T4–T9 未开始）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Bash 硬拒绝改为引号感知词法器 | `packages/shell/tool-shell/src/command-rules.ts` | 让 `python3 -c '…'`、`node -e '…'`、带引号分隔符的 heredoc、管道、工作区内重定向可以运行；未加引号的 `$`、反引号、子 shell 仍拒绝，拒绝文案带下一步 |
| 解释器进入会话前缀授权 | `packages/shell/tool-shell/src/command-prefix.ts` | `python3 run.py …` / `node build.mjs …` / `python3 -m json.tool` 可复用授权，脚本路径必须在工作区；`-c` / `-e` 与 pip 保持单次 |
| 测试 | `src/test/command-rules.test.ts`（新增）、`command-prefix.test.ts`、`lifecycle.test.ts` | 锁住放行与拒绝两侧；`pnpm test \| cat` 从 deny 改为 ask |
| 设计与计划 | `docs/design-docs/tool-system/agent-script-execution.md`、`docs/exec-plans/active/20261109-script-execution.md`、`docs/references/script-execution-harness-survey-20261109.md` | 五层方案、九个任务、十一个参考实现的调研沉淀 |
| 文档同步 | `packages/shell/tool-shell/README.md`、`agent-subprocess-runner-guidelines.md`、`execution-safety/README.md`、`agent-tool-permission-model.md` §16、`design-docs/index.md`、`exec-plans/README.md`、`references/README.md` | 旧的"复杂 shell 语法一律硬拒绝"描述全部改掉 |

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

### 建议验证

1. **重定向边界**
   - 验证方式：`pnpm test > out.log 2>&1`、`echo x > /etc/hosts`。
   - 预期结果：前者进入审批 / 执行；后者立即拒绝，文案含 "temp directory"。

2. **heredoc**
   - 验证方式：`python3 - <<'EOF'` 多行脚本 vs `python3 - <<EOF`。
   - 预期结果：前者放行到审批；后者拒绝并提示 `<<'EOF'`。

## Agent 已完成的验证

- `pnpm --filter @actspace/tool-shell test`：191 通过、1 跳过（含新增 60 例 `command-rules.test.ts`）。
- `tsc -p packages/shell/tool-shell/tsconfig.json --noEmit`：通过。
- `biome lint --diagnostic-level=error packages/shell/tool-shell`：无错误。
- `pnpm check:docs`、`pnpm check:hot-path-reads`：通过。

## 已知风险和遗留事项

- 管道放开后，模型可以把一个受前缀授权的程序输出接给任何第二段命令；每段仍各自过硬拒绝规则，但整条命令不提供可复用授权（只单次审批），这是设计里的既定边界。
- 输出重定向允许写系统临时目录（`/tmp`、`os.tmpdir()`）；这与 bash 沙箱可写范围一致，但 `full-access` 下没有沙箱，依赖的是规则而不是内核边界。
- `command-prefix.ts` 的 `UNSUPPORTED` 正则仍把 `|`、`>` 等整串排除，所以带管道 / 重定向的命令永远不进可复用授权（符合设计）。

## 后续建议

- 按计划顺序做 T4（scratch 可写范围与 `ACTSPACE_SCRATCH`）→ T5（随包 Python 核心层）→ T7（提示词与官方 Skill）；T6、T8、T9 可并行。
