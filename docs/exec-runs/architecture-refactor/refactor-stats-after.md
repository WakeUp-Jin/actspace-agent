# architecture-refactor 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
| --- | ---: | ---: | ---: |
| 源代码文件 | 811 | 897 | +86 |
| 源代码行 | 126,628 | 133,226 | +6,598 |
| 测试文件 | 288 | 344 | +56 |
| 测试代码行 | 35,825 | 39,518 | +3,693 |
| Docs 文件 | 1,493 | 1,581 | +88 |
| Docs 非空白字符 | 4,929,451 | 5,160,242 | +230,791 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
| --- | ---: | ---: | ---: | ---: |
| (root) | 54 | 0 | -54 | 0 |
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 923 | 857 | -66 | -36 |
| apps/desktop | 53,273 | 53,970 | +697 | +534 |
| apps/site | 3,549 | 3,549 | 0 | 0 |
| browser-bridge | 10,753 | 10,753 | 0 | 0 |
| docs | 20,658 | 23,070 | +2,412 | 0 |
| packages/agent-host | 0 | 1,553 | +1,553 | +646 |
| packages/agent-service | 0 | 1,099 | +1,099 | +482 |
| packages/boot | 178 | 397 | +219 | +192 |
| packages/bundle | 8 | 8 | 0 | 0 |
| packages/client | 1,170 | 1,265 | +95 | +56 |
| packages/compaction | 221 | 216 | -5 | -6 |
| packages/composition | 92 | 214 | +122 | +61 |
| packages/context | 85 | 80 | -5 | -5 |
| packages/cordis-adapter | 884 | 1,046 | +162 | +302 |
| packages/core | 1,549 | 1,355 | -194 | -74 |
| packages/desktop-app | 457 | 181 | -276 | +28 |
| packages/diagnostics | 9 | 9 | 0 | 0 |
| packages/english-learning | 380 | 380 | 0 | 0 |
| packages/harness-control | 0 | 378 | +378 | +271 |
| packages/headless | 113 | 115 | +2 | 0 |
| packages/llm | 1,593 | 1,585 | -8 | -3 |
| packages/prompt | 566 | 559 | -7 | -5 |
| packages/runtime | 1,954 | 2,120 | +166 | +295 |
| packages/session | 3,579 | 3,417 | -162 | +64 |
| packages/shared | 6,996 | 7,089 | +93 | 0 |
| packages/subagent | 451 | 481 | +30 | +28 |
| packages/test-support | 73 | 73 | 0 | 0 |
| packages/tools | 5,756 | 5,705 | -51 | +73 |
| packages/util | 3 | 3 | 0 | 0 |
| scripts | 6,552 | 6,950 | +398 | +790 |

## Git 变化摘要

- 变化文件：678
- 新增 / 删除 / 重命名文件：245 / 43 / 22
- 新增 / 删除行：20,360 / 39,576
- 未跟踪项：24（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`architecture-refactor`
- **统计阶段**：`after`
- **统计时间**：2026-10-05T14:17:16.061Z
- **Git 分支**：`main`
- **Git commit**：`e02f37f7f94ed4ffbf1ce221c03ce38a3862dc5c`
- **工作区**：有 249 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
| --- | ---: |
| 源代码文件 | 897 |
| 源代码行 | 133,226 |
| 测试文件 | 344 |
| 测试代码行 | 39,518 |
| Docs 文件 | 1,581 |
| Docs 非空白字符 | 5,160,242 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
| --- | ---: | ---: | ---: | ---: |
| Astro | 18 | 1,234 | 0 | 0 |
| CSS | 17 | 3,312 | 0 | 0 |
| Go | 22 | 6,741 | 10 | 1,955 |
| HTML | 57 | 23,198 | 0 | 0 |
| JavaScript | 64 | 8,319 | 20 | 1,649 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 10 | 591 | 0 | 0 |
| TypeScript | 705 | 87,893 | 314 | 35,914 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"architecture-refactor","slot":"after","generatedAt":"2026-10-05T14:17:16.061Z","git":{"commit":"e02f37f7f94ed4ffbf1ce221c03ce38a3862dc5c","branch":"main","dirty":true,"changedEntries":249,"untrackedEntries":24},"metrics":{"totals":{"sourceFiles":897,"sourceLines":133226,"testFiles":344,"testLines":39518,"docsFiles":1581,"docsCharacters":5160242},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":16,"sourceLines":857,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":278,"sourceLines":53970,"testFiles":140,"testLines":23784,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":46,"sourceLines":3549,"testFiles":4,"testLines":310,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":44,"sourceLines":10753,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":37,"sourceLines":23070,"testFiles":0,"testLines":0,"docsFiles":1581,"docsCharacters":5160242},"packages/agent-host":{"sourceFiles":23,"sourceLines":1553,"testFiles":18,"testLines":646,"docsFiles":0,"docsCharacters":0},"packages/agent-service":{"sourceFiles":13,"sourceLines":1099,"testFiles":5,"testLines":482,"docsFiles":0,"docsCharacters":0},"packages/boot":{"sourceFiles":7,"sourceLines":397,"testFiles":4,"testLines":309,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":13,"sourceLines":1265,"testFiles":4,"testLines":216,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":7,"sourceLines":216,"testFiles":2,"testLines":182,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":7,"sourceLines":214,"testFiles":3,"testLines":105,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":80,"testFiles":2,"testLines":34,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":16,"sourceLines":1046,"testFiles":8,"testLines":597,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":26,"sourceLines":1355,"testFiles":14,"testLines":899,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":7,"sourceLines":181,"testFiles":2,"testLines":154,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":380,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/harness-control":{"sourceFiles":8,"sourceLines":378,"testFiles":5,"testLines":271,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":115,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":30,"sourceLines":1585,"testFiles":14,"testLines":1075,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":559,"testFiles":4,"testLines":161,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":33,"sourceLines":2120,"testFiles":16,"testLines":1048,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":50,"sourceLines":3417,"testFiles":18,"testLines":1373,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":47,"sourceLines":7089,"testFiles":17,"testLines":1974,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":481,"testFiles":2,"testLines":265,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":69,"sourceLines":5705,"testFiles":24,"testLines":1572,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":53,"sourceLines":6950,"testFiles":20,"testLines":1649,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":18,"sourceLines":1234,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":17,"sourceLines":3312,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":22,"sourceLines":6741,"testFiles":10,"testLines":1955,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":57,"sourceLines":23198,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":64,"sourceLines":8319,"testFiles":20,"testLines":1649,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":10,"sourceLines":591,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":705,"sourceLines":87893,"testFiles":314,"testLines":35914,"docsFiles":0,"docsCharacters":0}}}}
-->
