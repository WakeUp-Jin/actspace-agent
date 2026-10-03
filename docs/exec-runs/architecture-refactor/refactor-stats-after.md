# architecture-refactor 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
|---|---:|---:|---:|
| 源代码文件 | 811 | 832 | +21 |
| 源代码行 | 126,628 | 128,113 | +1,485 |
| 测试文件 | 288 | 295 | +7 |
| 测试代码行 | 35,825 | 36,698 | +873 |
| Docs 文件 | 1,493 | 1,510 | +17 |
| Docs 非空白字符 | 4,929,451 | 5,012,078 | +82,627 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
|---|---:|---:|---:|---:|
| (root) | 54 | 54 | 0 | 0 |
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 923 | 923 | 0 | +4 |
| apps/desktop | 53,273 | 53,300 | +27 | +82 |
| apps/site | 3,549 | 3,549 | 0 | 0 |
| browser-bridge | 10,753 | 10,753 | 0 | 0 |
| docs | 20,658 | 20,658 | 0 | 0 |
| packages/agent-service | 0 | 754 | +754 | +415 |
| packages/boot | 178 | 434 | +256 | +177 |
| packages/bundle | 8 | 8 | 0 | 0 |
| packages/client | 1,170 | 1,170 | 0 | 0 |
| packages/compaction | 221 | 221 | 0 | 0 |
| packages/composition | 92 | 92 | 0 | 0 |
| packages/context | 85 | 85 | 0 | 0 |
| packages/cordis-adapter | 884 | 1,182 | +298 | +71 |
| packages/core | 1,549 | 1,385 | -164 | -57 |
| packages/desktop-app | 457 | 475 | +18 | 0 |
| packages/diagnostics | 9 | 9 | 0 | 0 |
| packages/english-learning | 380 | 380 | 0 | 0 |
| packages/headless | 113 | 120 | +7 | 0 |
| packages/llm | 1,593 | 1,593 | 0 | 0 |
| packages/prompt | 566 | 566 | 0 | 0 |
| packages/runtime | 1,954 | 2,140 | +186 | +147 |
| packages/session | 3,579 | 3,579 | 0 | 0 |
| packages/shared | 6,996 | 7,057 | +61 | 0 |
| packages/subagent | 451 | 484 | +33 | +25 |
| packages/test-support | 73 | 73 | 0 | 0 |
| packages/tools | 5,756 | 5,765 | +9 | +9 |
| packages/util | 3 | 3 | 0 | 0 |
| scripts | 6,552 | 6,552 | 0 | 0 |

## Git 变化摘要

- 变化文件：81
- 新增 / 删除 / 重命名文件：18 / 3 / 0
- 新增 / 删除行：2,840 / 867
- 未跟踪项：19（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`architecture-refactor`
- **统计阶段**：`after`
- **统计时间**：2026-10-03T11:53:10.202Z
- **Git 分支**：`main`
- **Git commit**：`99d184741b48dd9142270d0ef44f66336adfbf38`
- **工作区**：有 80 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 832 |
| 源代码行 | 128,113 |
| 测试文件 | 295 |
| 测试代码行 | 36,698 |
| Docs 文件 | 1,510 |
| Docs 非空白字符 | 5,012,078 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 56 | 20,840 | 0 | 0 |
| JavaScript | 56 | 7,879 | 10 | 859 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 665 | 0 | 0 |
| TypeScript | 648 | 85,504 | 275 | 33,884 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"architecture-refactor","slot":"after","generatedAt":"2026-10-03T11:53:10.202Z","git":{"commit":"99d184741b48dd9142270d0ef44f66336adfbf38","branch":"main","dirty":true,"changedEntries":80,"untrackedEntries":19},"metrics":{"totals":{"sourceFiles":832,"sourceLines":128113,"testFiles":295,"testLines":36698,"docsFiles":1510,"docsCharacters":5012078},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"(root)":{"sourceFiles":1,"sourceLines":54,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":17,"sourceLines":923,"testFiles":6,"testLines":311,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":263,"sourceLines":53300,"testFiles":132,"testLines":23332,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":35,"sourceLines":20658,"testFiles":0,"testLines":0,"docsFiles":1510,"docsCharacters":5012078},"packages/agent-service":{"sourceFiles":11,"sourceLines":754,"testFiles":4,"testLines":415,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":8,"sourceLines":434,"testFiles":4,"testLines":294,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":11,"sourceLines":1170,"testFiles":4,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":221,"testFiles":2,"testLines":188,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":5,"sourceLines":92,"testFiles":1,"testLines":44,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":15,"sourceLines":1182,"testFiles":6,"testLines":366,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1385,"testFiles":14,"testLines":916,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":5,"sourceLines":475,"testFiles":2,"testLines":126,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":120,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1593,"testFiles":14,"testLines":1078,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":566,"testFiles":4,"testLines":166,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":38,"sourceLines":2140,"testFiles":14,"testLines":900,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":45,"sourceLines":3579,"testFiles":16,"testLines":1309,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":43,"sourceLines":7057,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":484,"testFiles":2,"testLines":262,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":70,"sourceLines":5765,"testFiles":24,"testLines":1508,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":45,"sourceLines":6552,"testFiles":10,"testLines":859,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":56,"sourceLines":20840,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":56,"sourceLines":7879,"testFiles":10,"testLines":859,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":665,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":648,"sourceLines":85504,"testFiles":275,"testLines":33884,"docsFiles":0,"docsCharacters":0}}}}
-->
