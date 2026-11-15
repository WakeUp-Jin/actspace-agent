# 代码库审查修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261110-codebase-review-fixes.md`
- **执行过程**：`docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- **执行模式**：夜间
- **执行结果**：进行中。这份摘要随每个 PR 更新，只写到当前 PR 为止的内容。

## 怎么合并

8 个 PR 是一条线性栈，按编号从小到大合并，合并方式选 **Create a merge commit**（不要用 squash 或 rebase，否则后面的 PR 会和已合入的内容冲突）。每合一个，它的分支被自动删除，下一个 PR 的 base 随之自动改成 `main`；合并按钮提示分支落后时点一次 **Update branch**，等检查跑完再合。

想一次合完：把编号最大的那个 PR 的 base 改成 `main` 再合并，它包含前面全部提交。其余 PR 的提交这时已经都在 `main` 里，GitHub 没有自动标成已合并的手动关闭即可。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `main` 的 markdownlint 红灯 | `docs/design-docs/site-v6/README.md` | 6 张图补 alt。不修的话这批 PR 的必需检查全是红的。 |
| `ci.yml` 改成 job 级路径判断加汇总 job | `.github/workflows/ci.yml` | 每个 PR 都会报告 `CI 汇总`，可以设为合并必需检查；纯文档 PR 仍然跳过全部工程 job。 |
| 文档同步 | `.github/workflows/base-checks.yml`、`docs/CICD.md` | 说明哪些 check 可以设为必需、新增 job 时要改哪三处。 |
| 文件工具的输出上限（PR 2） | `packages/fs/tool-fs-read`、`packages/fs/tool-fs-write` | `read_file` 流式读取，输出 64,000 字符、单行 2,000 字符，拒绝二进制；`list_directory`、`write_file`、`edit_file` 的输出同样限制在 64,000 字符。 |
| tool-runtime 兜底（PR 2） | `packages/core/tool-runtime/src/output-limits.ts`、`prepared-execution.ts` | 任何工具的一条结果提交前按字节数检查，超出的截短，完整输出存成文件。 |
| 按窗口的批次额度（PR 2） | `packages/core/agent-loop/src/tool-output-budget.ts`、`loop.ts`、`tool-runtime` 的 `ToolOutputBudget` | 一批工具结果合计不超过上下文窗口放得下的量。 |
| 回合收尾（PR 2） | `packages/session/session-persistence/src/recovery.ts`、`packages/core/agent-loop/src/loop.ts` | 一条记录写入失败后回合照常闭合，会话可以继续用。 |
| 目录卡片读真实条目数（PR 2） | `packages/client/client/src/sessions/tool-card.ts` | 条目数读结果的 `detail`，不受输出截短影响。 |

## 人工验证指引

### 必须验证

1. **把 `CI 汇总` 设为必需检查**
   - 验证方式：这批 PR 合完后，打开 GitHub 仓库的 **Settings › Rules › Rulesets › main › Require status checks to pass**，点 **Add checks**，搜索并添加 `CI 汇总`，保存。
   - 预期结果：之后新开的 PR 上 `CI 汇总` 标着 Required；lint、类型检查、测试或构建任何一个失败，合并按钮不可用。
   - 注意：一定在工作流合入 `main` 之后再设。否则没有包含这次改动的旧 PR 上不会出现这个 check，会一直停在 Expected。旧 PR 点一次 **Update branch** 即可。

2. **大文件不再卡住会话（PR 2）**
   - 验证方式：在桌面端开一个新会话，让模型读一个很大的单行文件（例如几 MB 的 `*.min.js` 或一个大 JSON），再让它读一个二进制文件（例如一个 `.zip`），然后继续发一条普通消息。
   - 预期结果：第一次读取只返回开头，工具卡片正常显示，结果末尾有 `line truncated` 的说明；二进制文件返回「looks like a binary file」的失败；之后的消息照常得到回复，不出现 `Cannot start Turn … while … is open`，也不出现 `Context exceeds model capacity`。
   - 这一项云端验证不了的部分：真实模型看到截短说明后会不会按提示用 `offset` 或 `grep` 继续读。单测只验证了说明的内容和数字。

### 建议验证

1. **纯文档 PR 仍然很快**
   - 验证方式：开一个只改 `docs/` 下某个 Markdown 文件的 PR，看 Checks 页。
   - 预期结果：`变更范围` 与 `CI 汇总` 各十几秒通过；`Lint 与类型检查`、`测试`、`构建` 等显示 Skipped。
2. **大改动的文件修改卡片（PR 2）**
   - 验证方式：让模型用 `write_file` 写一个几万行的文件。
   - 预期结果：文件完整写入；卡片上的增删行数是真实的总数，diff 只显示开头的一部分。
3. **小窗口模型下的一批读取（PR 2）**
   - 验证方式：选一个上下文窗口较小的模型（例如 32K），让它在一步里并行读四五个各有几百行以上的文件。
   - 预期结果：部分结果末尾出现 `[Output truncated: … the context window has room for about …]`，并附一个「Full tool output」文件引用；这一轮正常继续。

## Agent 已完成的验证

- `changes` 的判断脚本：在临时仓库里造 merge commit 模拟纯文档（含中文文件名）、代码、代码改名成文档、工作流文件、中文路径代码文件五种改动，输出符合预期。
- `./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 通过。
- PR 1 上 `仓库基础检查`、`变更范围`、八个工程 job、`CI 汇总` 全部通过。
- PR 2：四层各自的单测与集成用例（清单见 `docs/histories/2026-11/20261110-1710-tool-result-size-limits.md` 的 Verification）。额度的集成用例做了反向验证：去掉额度后同一个用例报 `Context exceeds model capacity`。`pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。

## 已知风险和遗留事项

- 工程 job 现在要等 `changes` 跑完才开始，每次 CI 多十几秒。
- `CI 汇总` 设为必需之后，`ci.yml` 里新增 job 时要同时加 `needs: changes`、`if: needs.changes.outputs.code == 'true'`，并把它列进 `ci-gate` 的 `needs`；漏了第三步，那个 job 失败不会拦合并。`docs/CICD.md` 的「下一步推荐」第 1 条写了这一点。
- 没有做的条目和原因见计划的「范围 › 不包含」。
- PR 2 的额度按 4 个字符 1 token 估算，对中文偏低。以中文为主的大输出（例如一次读几个很长的中文文档）仍可能比估算的多占窗口；Provider 报了用量时，已有内容的占用是准的，偏差只在新的这一批结果上。要根治得改共用的估算器，它同时影响上下文面板、自动压缩和容量检查，这批没有动。
- PR 2 之后，一条记录写不进会话时这一轮仍然会失败，只是会话不再卡死。其中一种情况值得单独决定：工具调用的参数对象或工具返回的 json 块里有名为 `authorization`、`apikey`、`api_key`、`secret`、`password`、`cookie` 的字段时，`session-journal` 会拒绝这条记录。这是原有的安全规则，这批没有改；要不要改成「把值脱敏后写入」而不是拒绝，需要你来定。
- PR 2 的额度在并行调用整体超额时，各调用被截到多长取决于谁先出结果，同样的请求两次运行截断位置可能不同。完整输出都存成了文件，模型可以再读。

## 后续建议

- 进行中，执行结束时补全。
