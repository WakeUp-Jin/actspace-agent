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

## 人工验证指引

### 必须验证

1. **把 `CI 汇总` 设为必需检查**
   - 验证方式：这批 PR 合完后，打开 GitHub 仓库的 **Settings › Rules › Rulesets › main › Require status checks to pass**，点 **Add checks**，搜索并添加 `CI 汇总`，保存。
   - 预期结果：之后新开的 PR 上 `CI 汇总` 标着 Required；lint、类型检查、测试或构建任何一个失败，合并按钮不可用。
   - 注意：一定在工作流合入 `main` 之后再设。否则没有包含这次改动的旧 PR 上不会出现这个 check，会一直停在 Expected。旧 PR 点一次 **Update branch** 即可。

### 建议验证

1. **纯文档 PR 仍然很快**
   - 验证方式：开一个只改 `docs/` 下某个 Markdown 文件的 PR，看 Checks 页。
   - 预期结果：`变更范围` 与 `CI 汇总` 各十几秒通过；`Lint 与类型检查`、`测试`、`构建` 等显示 Skipped。

## Agent 已完成的验证

- `changes` 的判断脚本：在临时仓库里造 merge commit 模拟纯文档（含中文文件名）、代码、代码改名成文档、工作流文件、中文路径代码文件五种改动，输出符合预期。
- `./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 通过。
- PR 1 上 `仓库基础检查`、`变更范围`、八个工程 job、`CI 汇总` 的实际结果见执行过程步骤 1。

## 已知风险和遗留事项

- 工程 job 现在要等 `changes` 跑完才开始，每次 CI 多十几秒。
- `CI 汇总` 设为必需之后，`ci.yml` 里新增 job 时要同时加 `needs: changes`、`if: needs.changes.outputs.code == 'true'`，并把它列进 `ci-gate` 的 `needs`；漏了第三步，那个 job 失败不会拦合并。`docs/CICD.md` 的「下一步推荐」第 1 条写了这一点。
- 没有做的条目和原因见计划的「范围 › 不包含」。

## 后续建议

- 进行中，执行结束时补全。
