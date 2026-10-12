# 20261011-repo-cleanup 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
| --- | ---: | ---: | ---: |
| 源代码文件 | 1,139 | 1,139 | 0 |
| 源代码行 | 132,069 | 132,079 | +10 |
| 测试文件 | 437 | 437 | 0 |
| 测试代码行 | 51,929 | 51,929 | 0 |
| Docs 文件 | 1,571 | 1,575 | +4 |
| Docs 非空白字符 | 5,046,045 | 5,054,396 | +8,351 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
| --- | ---: | ---: | ---: | ---: |
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 857 | 857 | 0 | 0 |
| apps/desktop | 60,877 | 60,877 | 0 | 0 |
| apps/site | 3,549 | 3,549 | 0 | 0 |
| browser-bridge | 10,753 | 10,753 | 0 | 0 |
| docs | 12,597 | 12,604 | +7 | 0 |
| packages/agent-host | 1,553 | 1,553 | 0 | 0 |
| packages/agent-service | 1,116 | 1,116 | 0 | 0 |
| packages/boot | 407 | 407 | 0 | 0 |
| packages/bundle | 8 | 8 | 0 | 0 |
| packages/client | 1,289 | 1,289 | 0 | 0 |
| packages/compaction | 220 | 220 | 0 | 0 |
| packages/composition | 214 | 214 | 0 | 0 |
| packages/context | 1,000 | 1,000 | 0 | 0 |
| packages/cordis-adapter | 1,043 | 1,110 | +67 | 0 |
| packages/core | 1,315 | 1,315 | 0 | 0 |
| packages/desktop-app | 181 | 181 | 0 | 0 |
| packages/diagnostics | 9 | 9 | 0 | 0 |
| packages/english-learning | 379 | 379 | 0 | 0 |
| packages/harness-control | 425 | 425 | 0 | 0 |
| packages/harness-hmr | 113 | 113 | 0 | 0 |
| packages/headless | 115 | 115 | 0 | 0 |
| packages/llm | 1,585 | 1,585 | 0 | 0 |
| packages/official-skills | 9 | 9 | 0 | 0 |
| packages/plugin-manager | 297 | 297 | 0 | 0 |
| packages/prompt | 665 | 665 | 0 | 0 |
| packages/runtime | 2,274 | 2,274 | 0 | 0 |
| packages/session | 3,429 | 3,429 | 0 | 0 |
| packages/shared | 7,327 | 7,327 | 0 | 0 |
| packages/subagent | 481 | 481 | 0 | 0 |
| packages/test-support | 73 | 4 | -69 | 0 |
| packages/tools | 5,712 | 5,712 | 0 | 0 |
| packages/util | 3 | 3 | 0 | 0 |
| scripts | 7,445 | 7,450 | +5 | 0 |

## Git 变化摘要

- 变化文件：63
- 新增 / 删除 / 重命名文件：0 / 11 / 0
- 新增 / 删除行：103 / 2,738
- 未跟踪项：7（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`20261011-repo-cleanup`
- **统计阶段**：`after`
- **统计时间**：2026-10-11T01:08:37.805Z
- **Git 分支**：`fix/context_manager_v1`
- **Git commit**：`c15c26b34d89fc8752c97d61773e38e87c853c63`
- **工作区**：有 70 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
| --- | ---: |
| 源代码文件 | 1,139 |
| 源代码行 | 132,079 |
| 测试文件 | 437 |
| 测试代码行 | 51,929 |
| Docs 文件 | 1,575 |
| Docs 非空白字符 | 5,054,396 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
| --- | ---: | ---: | ---: | ---: |
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 18 | 3,756 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 42 | 12,196 | 0 | 0 |
| JavaScript | 71 | 9,329 | 22 | 2,031 |
| Python | 5 | 1,981 | 0 | 0 |
| Shell | 10 | 574 | 0 | 0 |
| TypeScript | 953 | 96,268 | 405 | 47,943 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"20261011-repo-cleanup","slot":"after","generatedAt":"2026-10-11T01:08:37.805Z","git":{"commit":"c15c26b34d89fc8752c97d61773e38e87c853c63","branch":"fix/context_manager_v1","dirty":true,"changedEntries":70,"untrackedEntries":7},"metrics":{"totals":{"sourceFiles":1139,"sourceLines":132079,"testFiles":437,"testLines":51929,"docsFiles":1575,"docsCharacters":5054396},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":16,"sourceLines":857,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":485,"sourceLines":60877,"testFiles":210,"testLines":34316,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":28,"sourceLines":12604,"testFiles":0,"testLines":0,"docsFiles":1575,"docsCharacters":5054396},"packages/agent-host":{"sourceFiles":23,"sourceLines":1553,"testFiles":18,"testLines":646,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1116,"testFiles":5,"testLines":538,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":7,"sourceLines":407,"testFiles":4,"testLines":309,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1289,"testFiles":5,"testLines":321,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":8,"sourceLines":220,"testFiles":4,"testLines":229,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":20,"sourceLines":1000,"testFiles":7,"testLines":447,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":17,"sourceLines":1110,"testFiles":8,"testLines":597,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1315,"testFiles":15,"testLines":973,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":7,"sourceLines":181,"testFiles":2,"testLines":154,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":379,"testFiles":2,"testLines":182,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":425,"testFiles":5,"testLines":317,"docsFiles":0,"docsCharacters":0},"packages/harness-hmr":{"sourceFiles":4,"sourceLines":113,"testFiles":1,"testLines":57,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":115,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1585,"testFiles":14,"testLines":1075,"docsFiles":0,"docsCharacters":0},"packages/official-skills":{"sourceFiles":2,"sourceLines":9,"testFiles":1,"testLines":9,"docsFiles":0,"docsCharacters":0},"packages/plugin-manager":{"sourceFiles":6,"sourceLines":297,"testFiles":1,"testLines":152,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":19,"sourceLines":665,"testFiles":5,"testLines":203,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":35,"sourceLines":2274,"testFiles":20,"testLines":1276,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":50,"sourceLines":3429,"testFiles":19,"testLines":1392,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":51,"sourceLines":7327,"testFiles":20,"testLines":2189,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":481,"testFiles":2,"testLines":265,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":1,"sourceLines":4,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":69,"sourceLines":5712,"testFiles":24,"testLines":1584,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":55,"sourceLines":7450,"testFiles":22,"testLines":2031,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":18,"sourceLines":3756,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":42,"sourceLines":12196,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":71,"sourceLines":9329,"testFiles":22,"testLines":2031,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":5,"sourceLines":1981,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":10,"sourceLines":574,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":953,"sourceLines":96268,"testFiles":405,"testLines":47943,"docsFiles":0,"docsCharacters":0}}}}
-->
