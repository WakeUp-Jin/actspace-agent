# 增加重构前后统计脚本

## 用户诉求

希望在大型重构开始前和完成后各执行一次简单脚本，生成两份可直接比较的仓库统计文档，用于个人观察代码库变化，不把它扩展成产品功能或复杂质量评分系统。

## 主要改动

- 新增 `pnpm refactor:stats before --plan <plan-slug>`，在对应 `docs/exec-runs/<plan-slug>/` 下生成重构前统计。
- 新增 `pnpm refactor:stats after --plan <plan-slug>`，读取前置快照并生成带前后差值和 Git 变化摘要的重构后统计。
- 统计 Git 已跟踪及未忽略的新文件，覆盖源码、测试、Docs、语言和主要目录，同时排除脚本自己生成的两份报告。
- 在 Markdown 注释中保存机器可读快照，不额外引入 JSON 产物；已存在报告默认不覆盖，需显式使用 `--force`。
- 增加参数、文件分类、聚合统计和 Markdown 快照回读测试，并接入根测试命令。

## 设计动机

仓库已有 `repo:stats` 的稳定分类和行数口径，因此新脚本复用这些基础函数，只增加前后快照与对比能力。代码行变化只用于观察，不生成笼统重构分数，也不引入额外统计依赖。

## 关键文件

- `scripts/refactor-stats.mjs`
- `scripts/test/refactor-stats.test.mjs`
- `package.json`
