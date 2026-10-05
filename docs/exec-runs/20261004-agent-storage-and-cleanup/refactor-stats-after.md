# 20261004-agent-storage-and-cleanup 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
|---|---:|---:|---:|
| 源代码文件 | 889 | 891 | +2 |
| 源代码行 | 132,710 | 131,804 | -906 |
| 测试文件 | 340 | 343 | +3 |
| 测试代码行 | 39,137 | 39,175 | +38 |
| Docs 文件 | 1,544 | 1,554 | +10 |
| Docs 非空白字符 | 5,086,988 | 5,002,814 | -84,174 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
|---|---:|---:|---:|---:|
| (root) | 54 | 54 | 0 | 0 |
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 839 | 838 | -1 | -2 |
| apps/desktop | 54,318 | 53,908 | -410 | -91 |
| apps/site | 3,549 | 3,549 | 0 | 0 |
| browser-bridge | 10,753 | 10,753 | 0 | 0 |
| docs | 21,792 | 21,792 | 0 | 0 |
| packages/agent-host | 1,555 | 1,554 | -1 | 0 |
| packages/agent-service | 1,170 | 1,102 | -68 | +2 |
| packages/boot | 447 | 397 | -50 | +7 |
| packages/bundle | 8 | 8 | 0 | 0 |
| packages/client | 1,280 | 1,266 | -14 | +2 |
| packages/compaction | 221 | 221 | 0 | 0 |
| packages/composition | 214 | 214 | 0 | 0 |
| packages/context | 85 | 85 | 0 | 0 |
| packages/cordis-adapter | 1,224 | 1,111 | -113 | -16 |
| packages/core | 1,379 | 1,379 | 0 | 0 |
| packages/desktop-app | 181 | 181 | 0 | +2 |
| packages/diagnostics | 9 | 9 | 0 | 0 |
| packages/english-learning | 380 | 380 | 0 | 0 |
| packages/harness-control | 378 | 378 | 0 | 0 |
| packages/headless | 113 | 112 | -1 | 0 |
| packages/llm | 1,593 | 1,593 | 0 | 0 |
| packages/prompt | 566 | 566 | 0 | 0 |
| packages/runtime | 2,166 | 2,120 | -46 | +77 |
| packages/session | 3,584 | 3,429 | -155 | +27 |
| packages/shared | 7,172 | 7,089 | -83 | 0 |
| packages/subagent | 485 | 485 | 0 | +1 |
| packages/test-support | 73 | 73 | 0 | 0 |
| packages/tools | 5,734 | 5,734 | 0 | 0 |
| packages/util | 3 | 3 | 0 | 0 |
| scripts | 6,636 | 6,672 | +36 | +29 |

## Git 变化摘要

- 变化文件：275
- 新增 / 删除 / 重命名文件：0 / 52 / 0
- 新增 / 删除行：4,046 / 11,627
- 未跟踪项：29（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`20261004-agent-storage-and-cleanup`
- **统计阶段**：`after`
- **统计时间**：2026-10-04T16:35:56.777Z
- **Git 分支**：`main`
- **Git commit**：`1bc434d62152a783990e30e738eacc9ec302e140`
- **工作区**：有 304 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 891 |
| 源代码行 | 131,804 |
| 测试文件 | 343 |
| 测试代码行 | 39,175 |
| Docs 文件 | 1,554 |
| Docs 非空白字符 | 5,002,814 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 57 | 21,974 | 0 | 0 |
| JavaScript | 58 | 7,991 | 19 | 1,421 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 665 | 0 | 0 |
| TypeScript | 704 | 87,949 | 314 | 35,799 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"20261004-agent-storage-and-cleanup","slot":"after","generatedAt":"2026-10-04T16:35:56.777Z","git":{"commit":"1bc434d62152a783990e30e738eacc9ec302e140","branch":"main","dirty":true,"changedEntries":304,"untrackedEntries":29},"metrics":{"totals":{"sourceFiles":891,"sourceLines":131804,"testFiles":343,"testLines":39175,"docsFiles":1554,"docsCharacters":5002814},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"(root)":{"sourceFiles":1,"sourceLines":54,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":16,"sourceLines":838,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":278,"sourceLines":53908,"testFiles":140,"testLines":23720,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":36,"sourceLines":21792,"testFiles":0,"testLines":0,"docsFiles":1554,"docsCharacters":5002814},"packages/agent-host":{"sourceFiles":23,"sourceLines":1554,"testFiles":18,"testLines":646,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1102,"testFiles":5,"testLines":482,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":7,"sourceLines":397,"testFiles":4,"testLines":309,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1266,"testFiles":4,"testLines":216,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":221,"testFiles":2,"testLines":188,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":16,"sourceLines":1111,"testFiles":8,"testLines":560,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1379,"testFiles":14,"testLines":909,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":7,"sourceLines":181,"testFiles":2,"testLines":154,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":378,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":112,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1593,"testFiles":14,"testLines":1078,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":566,"testFiles":4,"testLines":166,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":33,"sourceLines":2120,"testFiles":16,"testLines":1048,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":50,"sourceLines":3429,"testFiles":18,"testLines":1350,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":47,"sourceLines":7089,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":485,"testFiles":2,"testLines":263,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":69,"sourceLines":5734,"testFiles":24,"testLines":1554,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":47,"sourceLines":6672,"testFiles":19,"testLines":1421,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":57,"sourceLines":21974,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":58,"sourceLines":7991,"testFiles":19,"testLines":1421,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":665,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":704,"sourceLines":87949,"testFiles":314,"testLines":35799,"docsFiles":0,"docsCharacters":0}}}}
-->
