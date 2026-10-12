# 20261011-repo-cleanup 重构前统计

> 由 `pnpm refactor:stats before` 生成。重构完成后运行对应的 `after` 命令生成差异报告。

## 基本信息

- **计划**：`20261011-repo-cleanup`
- **统计阶段**：`before`
- **统计时间**：2026-10-11T00:51:49.738Z
- **Git 分支**：`fix/context_manager_v1`
- **Git commit**：`c15c26b34d89fc8752c97d61773e38e87c853c63`
- **工作区**：clean

## 仓库总览

| 指标 | 数量 |
| --- | ---: |
| 源代码文件 | 1,139 |
| 源代码行 | 132,069 |
| 测试文件 | 437 |
| 测试代码行 | 51,929 |
| Docs 文件 | 1,571 |
| Docs 非空白字符 | 5,046,045 |

## 按主要目录

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
| --- | ---: | ---: | ---: | ---: |
| .agents | 19 | 4,749 | 0 | 0 |
| apps/cli | 16 | 857 | 5 | 271 |
| apps/desktop | 485 | 60,877 | 210 | 34,316 |
| apps/site | 46 | 3,549 | 4 | 310 |
| browser-bridge | 44 | 10,753 | 10 | 1,955 |
| docs | 28 | 12,597 | 0 | 0 |
| packages/agent-host | 23 | 1,553 | 18 | 646 |
| packages/agent-service | 13 | 1,116 | 5 | 538 |
| packages/boot | 7 | 407 | 4 | 309 |
| packages/bundle | 1 | 8 | 0 | 0 |
| packages/client | 13 | 1,289 | 5 | 321 |
| packages/compaction | 8 | 220 | 4 | 229 |
| packages/composition | 7 | 214 | 3 | 105 |
| packages/context | 20 | 1,000 | 7 | 447 |
| packages/cordis-adapter | 16 | 1,043 | 8 | 597 |
| packages/core | 26 | 1,315 | 15 | 973 |
| packages/desktop-app | 7 | 181 | 2 | 154 |
| packages/diagnostics | 1 | 9 | 0 | 0 |
| packages/english-learning | 11 | 379 | 2 | 182 |
| packages/harness-control | 8 | 425 | 5 | 317 |
| packages/harness-hmr | 4 | 113 | 1 | 57 |
| packages/headless | 4 | 115 | 1 | 26 |
| packages/llm | 30 | 1,585 | 14 | 1,075 |
| packages/official-skills | 2 | 9 | 1 | 9 |
| packages/plugin-manager | 6 | 297 | 1 | 152 |
| packages/prompt | 19 | 665 | 5 | 203 |
| packages/runtime | 35 | 2,274 | 20 | 1,276 |
| packages/session | 50 | 3,429 | 19 | 1,392 |
| packages/shared | 51 | 7,327 | 20 | 2,189 |
| packages/subagent | 12 | 481 | 2 | 265 |
| packages/test-support | 2 | 73 | 0 | 0 |
| packages/tools | 69 | 5,712 | 24 | 1,584 |
| packages/util | 1 | 3 | 0 | 0 |
| scripts | 55 | 7,445 | 22 | 2,031 |

## 按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
| --- | ---: | ---: | ---: | ---: |
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 18 | 3,756 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 42 | 12,189 | 0 | 0 |
| JavaScript | 71 | 9,324 | 22 | 2,031 |
| Python | 5 | 1,981 | 0 | 0 |
| Shell | 10 | 574 | 0 | 0 |
| TypeScript | 953 | 96,270 | 405 | 47,943 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"20261011-repo-cleanup","slot":"before","generatedAt":"2026-10-11T00:51:49.738Z","git":{"commit":"c15c26b34d89fc8752c97d61773e38e87c853c63","branch":"fix/context_manager_v1","dirty":false,"changedEntries":0,"untrackedEntries":0},"metrics":{"totals":{"sourceFiles":1139,"sourceLines":132069,"testFiles":437,"testLines":51929,"docsFiles":1571,"docsCharacters":5046045},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":16,"sourceLines":857,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":485,"sourceLines":60877,"testFiles":210,"testLines":34316,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":28,"sourceLines":12597,"testFiles":0,"testLines":0,"docsFiles":1571,"docsCharacters":5046045},"packages/agent-host":{"sourceFiles":23,"sourceLines":1553,"testFiles":18,"testLines":646,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1116,"testFiles":5,"testLines":538,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":7,"sourceLines":407,"testFiles":4,"testLines":309,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1289,"testFiles":5,"testLines":321,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":8,"sourceLines":220,"testFiles":4,"testLines":229,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":20,"sourceLines":1000,"testFiles":7,"testLines":447,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":16,"sourceLines":1043,"testFiles":8,"testLines":597,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1315,"testFiles":15,"testLines":973,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":7,"sourceLines":181,"testFiles":2,"testLines":154,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":379,"testFiles":2,"testLines":182,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":425,"testFiles":5,"testLines":317,"docsFiles":0,"docsCharacters":0},"packages/harness-hmr":{"sourceFiles":4,"sourceLines":113,"testFiles":1,"testLines":57,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":115,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1585,"testFiles":14,"testLines":1075,"docsFiles":0,"docsCharacters":0},"packages/official-skills":{"sourceFiles":2,"sourceLines":9,"testFiles":1,"testLines":9,"docsFiles":0,"docsCharacters":0},"packages/plugin-manager":{"sourceFiles":6,"sourceLines":297,"testFiles":1,"testLines":152,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":19,"sourceLines":665,"testFiles":5,"testLines":203,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":35,"sourceLines":2274,"testFiles":20,"testLines":1276,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":50,"sourceLines":3429,"testFiles":19,"testLines":1392,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":51,"sourceLines":7327,"testFiles":20,"testLines":2189,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":481,"testFiles":2,"testLines":265,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":69,"sourceLines":5712,"testFiles":24,"testLines":1584,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":55,"sourceLines":7445,"testFiles":22,"testLines":2031,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":18,"sourceLines":3756,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":42,"sourceLines":12189,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":71,"sourceLines":9324,"testFiles":22,"testLines":2031,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":5,"sourceLines":1981,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":10,"sourceLines":574,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":953,"sourceLines":96270,"testFiles":405,"testLines":47943,"docsFiles":0,"docsCharacters":0}}}}
-->
