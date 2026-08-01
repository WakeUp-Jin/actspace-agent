# 增加 Pre-Push 仓库统计

## 用户诉求

在本地向远程仓库 push 前，自动输出源代码规模、Docs 字符数和测试文件数量，不接入远程 CI。

## 主要改动

- 新增基于 `git ls-files` 的仓库统计脚本，只读取已跟踪文件。
- 源代码统计排除测试文件，输出文件数与物理行数。
- Docs 统计 `docs/**/*.md` 的文件数与非空白 Unicode 字符数。
- 测试统计覆盖常见 `test`、`spec`、Go `_test.go` 和 Rust integration test 文件名。
- 本地 `pre-push` 在密钥扫描后运行统计，并提供 `pnpm repo:stats` 手动入口。
- 使用 Node 内置测试锁定文件分类、行数、字符数和聚合结果。

## 设计动机

统计属于开发反馈而不是质量阈值，因此每次本地 push 都显示，但不因规模变化失败。使用 Git 跟踪列表可以避免把依赖、构建产物、日志和本机临时文件计入结果。

## 关键文件

- `scripts/repo-stats.mjs`
- `scripts/test/repo-stats.test.mjs`
- `.githooks/pre-push`
- `package.json`
- `docs/CICD.md`
