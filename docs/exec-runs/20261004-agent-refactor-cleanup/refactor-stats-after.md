# 20261004-agent-refactor-cleanup 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
|---|---:|---:|---:|
| 源代码文件 | 889 | 889 | 0 |
| 源代码行 | 132,703 | 132,710 | +7 |
| 测试文件 | 340 | 340 | 0 |
| 测试代码行 | 39,111 | 39,137 | +26 |
| Docs 文件 | 1,554 | 1,544 | -10 |
| Docs 非空白字符 | 5,165,763 | 5,082,931 | -82,832 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
|---|---:|---:|---:|---:|
| (root) | 54 | 54 | 0 | 0 |
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 839 | 839 | 0 | 0 |
| apps/desktop | 54,318 | 54,318 | 0 | 0 |
| apps/site | 3,549 | 3,549 | 0 | 0 |
| browser-bridge | 10,753 | 10,753 | 0 | 0 |
| docs | 21,792 | 21,792 | 0 | 0 |
| packages/agent-host | 1,555 | 1,555 | 0 | 0 |
| packages/agent-service | 1,165 | 1,170 | +5 | 0 |
| packages/boot | 447 | 447 | 0 | 0 |
| packages/bundle | 8 | 8 | 0 | 0 |
| packages/client | 1,280 | 1,280 | 0 | 0 |
| packages/compaction | 221 | 221 | 0 | 0 |
| packages/composition | 214 | 214 | 0 | 0 |
| packages/context | 85 | 85 | 0 | 0 |
| packages/cordis-adapter | 1,224 | 1,224 | 0 | 0 |
| packages/core | 1,379 | 1,379 | 0 | 0 |
| packages/desktop-app | 150 | 181 | +31 | +26 |
| packages/diagnostics | 9 | 9 | 0 | 0 |
| packages/english-learning | 380 | 380 | 0 | 0 |
| packages/harness-control | 378 | 378 | 0 | 0 |
| packages/headless | 113 | 113 | 0 | 0 |
| packages/llm | 1,593 | 1,593 | 0 | 0 |
| packages/prompt | 566 | 566 | 0 | 0 |
| packages/runtime | 2,194 | 2,166 | -28 | 0 |
| packages/session | 3,584 | 3,584 | 0 | 0 |
| packages/shared | 7,172 | 7,172 | 0 | 0 |
| packages/subagent | 485 | 485 | 0 | 0 |
| packages/test-support | 73 | 73 | 0 | 0 |
| packages/tools | 5,734 | 5,734 | 0 | 0 |
| packages/util | 3 | 3 | 0 | 0 |
| scripts | 6,637 | 6,636 | -1 | 0 |

## Git 变化摘要

- 变化文件：138
- 新增 / 删除 / 重命名文件：0 / 44 / 0
- 新增 / 删除行：1,753 / 6,010
- 未跟踪项：16（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`20261004-agent-refactor-cleanup`
- **统计阶段**：`after`
- **统计时间**：2026-10-04T11:31:28.324Z
- **Git 分支**：`main`
- **Git commit**：`1bc434d62152a783990e30e738eacc9ec302e140`
- **工作区**：有 154 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 889 |
| 源代码行 | 132,710 |
| 测试文件 | 340 |
| 测试代码行 | 39,137 |
| Docs 文件 | 1,544 |
| Docs 非空白字符 | 5,082,931 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 57 | 21,974 | 0 | 0 |
| JavaScript | 58 | 7,963 | 19 | 1,392 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 665 | 0 | 0 |
| TypeScript | 702 | 88,883 | 311 | 35,790 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"20261004-agent-refactor-cleanup","slot":"after","generatedAt":"2026-10-04T11:31:28.324Z","git":{"commit":"1bc434d62152a783990e30e738eacc9ec302e140","branch":"main","dirty":true,"changedEntries":154,"untrackedEntries":16},"metrics":{"totals":{"sourceFiles":889,"sourceLines":132710,"testFiles":340,"testLines":39137,"docsFiles":1544,"docsCharacters":5082931},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"(root)":{"sourceFiles":1,"sourceLines":54,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":16,"sourceLines":839,"testFiles":5,"testLines":273,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":277,"sourceLines":54318,"testFiles":140,"testLines":23811,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":36,"sourceLines":21792,"testFiles":0,"testLines":0,"docsFiles":1544,"docsCharacters":5082931},"packages/agent-host":{"sourceFiles":23,"sourceLines":1555,"testFiles":18,"testLines":646,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1170,"testFiles":5,"testLines":480,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":8,"sourceLines":447,"testFiles":4,"testLines":302,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1280,"testFiles":5,"testLines":214,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":221,"testFiles":2,"testLines":188,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":16,"sourceLines":1224,"testFiles":8,"testLines":576,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1379,"testFiles":14,"testLines":909,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":7,"sourceLines":181,"testFiles":2,"testLines":152,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":378,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":113,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1593,"testFiles":14,"testLines":1078,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":566,"testFiles":4,"testLines":166,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":36,"sourceLines":2166,"testFiles":14,"testLines":971,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":45,"sourceLines":3584,"testFiles":16,"testLines":1323,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":47,"sourceLines":7172,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":485,"testFiles":2,"testLines":262,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":69,"sourceLines":5734,"testFiles":24,"testLines":1554,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":47,"sourceLines":6636,"testFiles":19,"testLines":1392,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":57,"sourceLines":21974,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":58,"sourceLines":7963,"testFiles":19,"testLines":1392,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":665,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":702,"sourceLines":88883,"testFiles":311,"testLines":35790,"docsFiles":0,"docsCharacters":0}}}}
-->
