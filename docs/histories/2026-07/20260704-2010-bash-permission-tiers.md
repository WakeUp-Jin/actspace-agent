# Bash 文本层规则分级（不可逆 ask + .git 延迟执行点禁写）

## 用户诉求

E5 沙盒放宽落地后的追问：「沙盒里连 rm 都自动放行不安全；只有 rm 走判断后 ask，其他命令是不是可以放进 hard reject 阶段检查，会不会更清楚？」并要求实现讲得更详细、不能让 bash 工具逻辑变得不可读。

## 结论与取舍

「其他命令放进 hard reject」被否决：hard reject 是 **deny，用户批准也救不回**，而 `git reset --hard`、`git push --force` 有正当场景（用户明确要丢弃/强推），deny 会堵死任务。真正的分界是：

- **hard reject（deny）**：不存在正当场景（rm -rf 关键路径、eval、删 `.git` 本体）。
- **不可逆 ask**：有正当场景但出错无法回滚 → 沙盒放宽**不豁免**，永远问人，`allowSimilar: false`。
- **allowlist / 沙盒放宽 / 兜底 ask**：不变。

「清楚」的诉求用**规则表模块化**满足，而不是改变语义。

## 主要改动

- 新增 `packages/agent-core/src/tools/tools/bash/command-rules.ts`：三级规则表单一事实源（整条命令级 hard reject、段级 hard reject、不可逆 ask 清单、allowlist），每条规则带判据注释。`permissions.ts` 重写为纯决策编排，顺序：归一化 → hard reject → requiredPermissions ask → 不可逆 ask → ALWAYS_ASK → allowlist allow → 沙盒放宽 allow → 兜底 ask。
- hard reject 新增：`rm`/`rmdir`/`mv` 目标为 `.git` 本体（摧毁回滚能力的根，无正当场景）。
- 不可逆 ask 清单：`rm`/`rmdir`（与 `delete_file` 工具的永远 ask 对齐，否则 bash 成为绕过后门）、`find -delete`、`dd`/`shred`/`truncate`、`git reset --hard/--merge`、`git clean`（非 dry-run）、`git restore`、`git checkout` 丢弃形态（`--` / `.` / 无 `-b` 的多参数 pathspec 启发式）、`git stash drop/clear`、`git push --force[-with-lease]`。git 分支/commit 级操作（`branch -D`、rebase）reflog 可恢复，刻意不列。
- `sandbox/profile.ts`：新增 workspace 根仓库延迟执行点定向禁写——`.git/hooks/**`（subpath）+ `.git/config`（literal，`core.fsmonitor` 等配置项等价于 hook），置于写放行之后（last-match-wins）。只保护根仓库：拦 `**/.git` 会让沙盒内 `git clone` / 子目录 `git init`（都写 hooks 模板）全灭；根仓库自身 `git remote add` / `git push -u`（写 config）被拦时走违规标注 + 升级审批。
- `definition.ts`：工具描述补不可逆命令清单、`intent` 说明要求、非破坏性替代引导（挪走文件而非 rm、stash 而非 reset --hard）。
- 设计文档新增「文本层规则分级表」章节 + 决策管道图更新；exec-plan `20260704-bash-sandbox/README.md` 追加后续轮清单。

## 测试

- 权限回归：不可逆清单逐条 ask（含 `ls && rm x` 链式段命中）、安全近邻逐条 allow（`git checkout main`、`git checkout -b`、`git reset HEAD~1`、`git clean -n`、`git push origin main`、`truncate-logs`）、`.git` 本体 deny。
- profile 单测：git deny 参数注入 + 位于写放行之后的顺序断言。
- darwin 集成：沙盒内 `mkdir .git` 成功、`mkdir -p .git/hooks` / `touch .git/config` 被拦且带违规标注。
- agent-core 全量 91 文件 / 730 测试通过。

## 可信度前提（值得记住）

token 级文本匹配之所以可靠，是因为不支持的 shell 语法（`| < > $() {}` 等）在 hard reject 一级整体拒绝——变量展开和子 shell 不存在，`rm $DIR` 这类绕过面在进入规则匹配前已被消灭。

## 关联

- 学习沉淀：`docs/learnings/2026-07/sandbox-deny-vs-ask-boundary.md`
- 上一轮：`docs/histories/2026-07/20260704-1840-bash-sandbox-e5.md`
