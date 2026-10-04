# 20261004-agent-harness-p5 重构前统计

> 由 `pnpm refactor:stats before` 生成。重构完成后运行对应的 `after` 命令生成差异报告。

## 基本信息

- **计划**：`20261004-agent-harness-p5`
- **统计阶段**：`before`
- **统计时间**：2026-10-04T04:26:09.170Z
- **Git 分支**：`main`
- **Git commit**：`a4f9c6e310b7ac0ab4963e881e989495ef1db548`
- **工作区**：有 14 项未提交变化

## 仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 891 |
| 源代码行 | 132,560 |
| 测试文件 | 337 |
| 测试代码行 | 38,789 |
| Docs 文件 | 1,539 |
| Docs 非空白字符 | 5,124,756 |

## 按主要目录

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| .agents | 19 | 4,749 | 0 | 0 |
| (root) | 1 | 54 | 0 | 0 |
| apps/cli | 19 | 938 | 6 | 311 |
| apps/desktop | 277 | 54,309 | 139 | 23,712 |
| apps/site | 46 | 3,549 | 4 | 310 |
| browser-bridge | 44 | 10,753 | 10 | 1,955 |
| docs | 36 | 21,792 | 0 | 0 |
| packages/agent-host | 21 | 1,287 | 15 | 468 |
| packages/agent-service | 13 | 1,165 | 5 | 480 |
| packages/boot | 8 | 447 | 4 | 302 |
| packages/bundle | 1 | 8 | 0 | 0 |
| packages/client | 13 | 1,280 | 5 | 214 |
| packages/compaction | 7 | 221 | 2 | 188 |
| packages/composition | 7 | 214 | 3 | 105 |
| packages/context | 4 | 85 | 2 | 39 |
| packages/cordis-adapter | 16 | 1,230 | 8 | 549 |
| packages/core | 26 | 1,384 | 14 | 916 |
| packages/desktop-app | 5 | 150 | 2 | 126 |
| packages/diagnostics | 1 | 9 | 0 | 0 |
| packages/english-learning | 11 | 380 | 2 | 160 |
| packages/harness-control | 8 | 378 | 5 | 271 |
| packages/headless | 4 | 113 | 1 | 26 |
| packages/llm | 30 | 1,593 | 14 | 1,078 |
| packages/prompt | 12 | 566 | 4 | 166 |
| packages/runtime | 38 | 2,194 | 14 | 971 |
| packages/session | 45 | 3,579 | 16 | 1,309 |
| packages/shared | 47 | 7,172 | 17 | 1,974 |
| packages/subagent | 12 | 485 | 2 | 262 |
| packages/test-support | 2 | 73 | 0 | 0 |
| packages/tools | 70 | 5,765 | 24 | 1,508 |
| packages/util | 1 | 3 | 0 | 0 |
| scripts | 47 | 6,635 | 19 | 1,389 |

## 按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 57 | 21,974 | 0 | 0 |
| JavaScript | 58 | 7,962 | 19 | 1,389 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 665 | 0 | 0 |
| TypeScript | 704 | 88,734 | 308 | 35,445 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"20261004-agent-harness-p5","slot":"before","generatedAt":"2026-10-04T04:26:09.170Z","git":{"commit":"a4f9c6e310b7ac0ab4963e881e989495ef1db548","branch":"main","dirty":true,"changedEntries":14,"untrackedEntries":8},"metrics":{"totals":{"sourceFiles":891,"sourceLines":132560,"testFiles":337,"testLines":38789,"docsFiles":1539,"docsCharacters":5124756},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"(root)":{"sourceFiles":1,"sourceLines":54,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":19,"sourceLines":938,"testFiles":6,"testLines":311,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":277,"sourceLines":54309,"testFiles":139,"testLines":23712,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":36,"sourceLines":21792,"testFiles":0,"testLines":0,"docsFiles":1539,"docsCharacters":5124756},"packages/agent-host":{"sourceFiles":21,"sourceLines":1287,"testFiles":15,"testLines":468,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1165,"testFiles":5,"testLines":480,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":8,"sourceLines":447,"testFiles":4,"testLines":302,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1280,"testFiles":5,"testLines":214,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":221,"testFiles":2,"testLines":188,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":16,"sourceLines":1230,"testFiles":8,"testLines":549,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1384,"testFiles":14,"testLines":916,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":5,"sourceLines":150,"testFiles":2,"testLines":126,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":378,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":113,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1593,"testFiles":14,"testLines":1078,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":566,"testFiles":4,"testLines":166,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":38,"sourceLines":2194,"testFiles":14,"testLines":971,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":45,"sourceLines":3579,"testFiles":16,"testLines":1309,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":47,"sourceLines":7172,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":485,"testFiles":2,"testLines":262,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":70,"sourceLines":5765,"testFiles":24,"testLines":1508,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":47,"sourceLines":6635,"testFiles":19,"testLines":1389,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":57,"sourceLines":21974,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":58,"sourceLines":7962,"testFiles":19,"testLines":1389,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":665,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":704,"sourceLines":88734,"testFiles":308,"testLines":35445,"docsFiles":0,"docsCharacters":0}}}}
-->
