# architecture-refactor 重构前统计

> 由 `pnpm refactor:stats before` 生成。重构完成后运行对应的 `after` 命令生成差异报告。

## 基本信息

- **计划**：`architecture-refactor`
- **统计阶段**：`before`
- **统计时间**：2026-10-02T16:26:10.997Z
- **Git 分支**：`main`
- **Git commit**：`08e7047a322e189974d1ae4ed8c0e8fc5449c75d`
- **工作区**：clean

## 仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 811 |
| 源代码行 | 126,628 |
| 测试文件 | 288 |
| 测试代码行 | 35,825 |
| Docs 文件 | 1,493 |
| Docs 非空白字符 | 4,929,451 |

## 按主要目录

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| .agents | 19 | 4,749 | 0 | 0 |
| (root) | 1 | 54 | 0 | 0 |
| apps/cli | 17 | 923 | 6 | 307 |
| apps/desktop | 263 | 53,273 | 132 | 23,250 |
| apps/site | 46 | 3,549 | 4 | 310 |
| browser-bridge | 44 | 10,753 | 10 | 1,955 |
| docs | 35 | 20,658 | 0 | 0 |
| packages/boot | 5 | 178 | 2 | 117 |
| packages/bundle | 1 | 8 | 0 | 0 |
| packages/client | 11 | 1,170 | 4 | 160 |
| packages/compaction | 7 | 221 | 2 | 188 |
| packages/composition | 5 | 92 | 1 | 44 |
| packages/context | 4 | 85 | 2 | 39 |
| packages/cordis-adapter | 13 | 884 | 5 | 295 |
| packages/core | 26 | 1,549 | 15 | 973 |
| packages/desktop-app | 5 | 457 | 2 | 126 |
| packages/diagnostics | 1 | 9 | 0 | 0 |
| packages/english-learning | 11 | 380 | 2 | 160 |
| packages/headless | 4 | 113 | 1 | 26 |
| packages/llm | 30 | 1,593 | 14 | 1,078 |
| packages/prompt | 12 | 566 | 4 | 166 |
| packages/runtime | 34 | 1,954 | 13 | 753 |
| packages/session | 45 | 3,579 | 16 | 1,309 |
| packages/shared | 42 | 6,996 | 17 | 1,974 |
| packages/subagent | 12 | 451 | 2 | 237 |
| packages/test-support | 2 | 73 | 0 | 0 |
| packages/tools | 70 | 5,756 | 24 | 1,499 |
| packages/util | 1 | 3 | 0 | 0 |
| scripts | 45 | 6,552 | 10 | 859 |

## 按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 56 | 20,840 | 0 | 0 |
| JavaScript | 55 | 7,844 | 10 | 859 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 665 | 0 | 0 |
| TypeScript | 628 | 84,054 | 268 | 33,011 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"architecture-refactor","slot":"before","generatedAt":"2026-10-02T16:26:10.997Z","git":{"commit":"08e7047a322e189974d1ae4ed8c0e8fc5449c75d","branch":"main","dirty":false,"changedEntries":0,"untrackedEntries":0},"metrics":{"totals":{"sourceFiles":811,"sourceLines":126628,"testFiles":288,"testLines":35825,"docsFiles":1493,"docsCharacters":4929451},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"(root)":{"sourceFiles":1,"sourceLines":54,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":17,"sourceLines":923,"testFiles":6,"testLines":307,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":263,"sourceLines":53273,"testFiles":132,"testLines":23250,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":35,"sourceLines":20658,"testFiles":0,"testLines":0,"docsFiles":1493,"docsCharacters":4929451},"packages/boot":{"sourceFiles":5,"sourceLines":178,"testFiles":2,"testLines":117,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":11,"sourceLines":1170,"testFiles":4,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":221,"testFiles":2,"testLines":188,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":5,"sourceLines":92,"testFiles":1,"testLines":44,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":13,"sourceLines":884,"testFiles":5,"testLines":295,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1549,"testFiles":15,"testLines":973,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":5,"sourceLines":457,"testFiles":2,"testLines":126,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":113,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1593,"testFiles":14,"testLines":1078,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":566,"testFiles":4,"testLines":166,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":34,"sourceLines":1954,"testFiles":13,"testLines":753,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":45,"sourceLines":3579,"testFiles":16,"testLines":1309,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":42,"sourceLines":6996,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":451,"testFiles":2,"testLines":237,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":70,"sourceLines":5756,"testFiles":24,"testLines":1499,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":45,"sourceLines":6552,"testFiles":10,"testLines":859,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":56,"sourceLines":20840,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":55,"sourceLines":7844,"testFiles":10,"testLines":859,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":665,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":628,"sourceLines":84054,"testFiles":268,"testLines":33011,"docsFiles":0,"docsCharacters":0}}}}
-->
