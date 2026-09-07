# agent-runtime-v2 重构后统计

> 由 `pnpm refactor:stats after` 生成。代码行变化只用于观察，不代表单独的质量评分。

## 前后对比

| 指标 | 重构前 | 重构后 | 变化 |
|---|---:|---:|---:|
| 源代码文件 | 552 | 668 | +116 |
| 源代码行 | 125,758 | 102,994 | -22,764 |
| 测试文件 | 243 | 202 | -41 |
| 测试代码行 | 47,088 | 25,947 | -21,141 |
| Docs 文件 | 906 | 1,161 | +255 |
| Docs 非空白字符 | 3,236,074 | 4,080,378 | +844,304 |

## 主要目录变化

| 目录 | 重构前源代码行 | 重构后源代码行 | 变化 | 测试行变化 |
|---|---:|---:|---:|---:|
| .agents | 4,749 | 4,749 | 0 | 0 |
| apps/cli | 0 | 902 | +902 | +296 |
| apps/desktop | 0 | 44,345 | +44,345 | +17,246 |
| apps/site | 0 | 4,939 | +4,939 | +234 |
| browser-bridge | 10,247 | 10,315 | +68 | 0 |
| docs | 10,781 | 10,788 | +7 | 0 |
| packages/agent-cli | 1,680 | 0 | -1,680 | -804 |
| packages/agent-core | 31,687 | 0 | -31,687 | -20,707 |
| packages/boot | 0 | 176 | +176 | +109 |
| packages/bundle | 0 | 8 | +8 | 0 |
| packages/client | 0 | 267 | +267 | +80 |
| packages/compaction | 0 | 165 | +165 | +47 |
| packages/composition | 0 | 92 | +92 | +44 |
| packages/context | 0 | 85 | +85 | +39 |
| packages/cordis-adapter | 0 | 846 | +846 | +295 |
| packages/core | 0 | 1,399 | +1,399 | +562 |
| packages/desktop | 49,468 | 0 | -49,468 | -21,563 |
| packages/desktop-app | 0 | 266 | +266 | +12 |
| packages/diagnostics | 0 | 9 | +9 | 0 |
| packages/english-learning | 0 | 366 | +366 | +160 |
| packages/headless | 0 | 103 | +103 | +26 |
| packages/llm | 0 | 1,093 | +1,093 | +521 |
| packages/prompt | 0 | 522 | +522 | +121 |
| packages/runtime | 0 | 1,620 | +1,620 | +181 |
| packages/session | 0 | 3,214 | +3,214 | +1,073 |
| packages/shared | 5,668 | 5,702 | +34 | -146 |
| packages/site | 4,955 | 0 | -4,955 | -234 |
| packages/subagent | 0 | 437 | +437 | +190 |
| packages/test-support | 0 | 73 | +73 | 0 |
| packages/tools | 0 | 4,466 | +4,466 | +738 |
| packages/util | 0 | 3 | +3 | 0 |
| plugins/fs-watch | 1,306 | 0 | -1,306 | 0 |
| scripts | 5,217 | 6,044 | +827 | +339 |

## Git 变化摘要

- 变化文件：2,025
- 新增 / 删除 / 重命名文件：877 / 416 / 438
- 新增 / 删除行：101,856 / 87,376
- 未跟踪项：0（会计入规模统计，但 Git diff 摘要不含其行变化）

## 基本信息

- **计划**：`agent-runtime-v2`
- **统计阶段**：`after`
- **统计时间**：2026-09-07T15:35:53.978Z
- **Git 分支**：`refactor-dsh-plugin`
- **Git commit**：`890f7a8cc21305fae3d787567564909f8f4f6cdc`
- **工作区**：有 381 项未提交变化

## 重构后仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 668 |
| 源代码行 | 102,994 |
| 测试文件 | 202 |
| 测试代码行 | 25,947 |
| Docs 文件 | 1,161 |
| Docs 非空白字符 | 4,080,378 |

## 重构后按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 24 | 3,762 | 0 | 0 |
| CSS | 11 | 1,847 | 0 | 0 |
| Go | 21 | 6,351 | 9 | 1,810 |
| HTML | 31 | 11,157 | 0 | 0 |
| JavaScript | 47 | 6,985 | 8 | 677 |
| Python | 4 | 1,938 | 0 | 0 |
| Shell | 11 | 657 | 0 | 0 |
| TypeScript | 519 | 70,297 | 185 | 23,460 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"agent-runtime-v2","slot":"after","generatedAt":"2026-09-07T15:35:53.978Z","git":{"commit":"890f7a8cc21305fae3d787567564909f8f4f6cdc","branch":"refactor-dsh-plugin","dirty":true,"changedEntries":381,"untrackedEntries":0},"metrics":{"totals":{"sourceFiles":668,"sourceLines":102994,"testFiles":202,"testLines":25947,"docsFiles":1161,"docsCharacters":4080378},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"apps/cli":{"sourceFiles":17,"sourceLines":902,"testFiles":6,"testLines":296,"docsFiles":0,"docsCharacters":0},"apps/desktop":{"sourceFiles":199,"sourceLines":44345,"testFiles":96,"testLines":17246,"docsFiles":0,"docsCharacters":0},"apps/site":{"sourceFiles":45,"sourceLines":4939,"testFiles":3,"testLines":234,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":43,"sourceLines":10315,"testFiles":9,"testLines":1810,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":20,"sourceLines":10788,"testFiles":0,"testLines":0,"docsFiles":1161,"docsCharacters":4080378},"packages/boot":{"sourceFiles":5,"sourceLines":176,"testFiles":2,"testLines":109,"docsFiles":0,"docsCharacters":0},"packages/bundle":{"sourceFiles":1,"sourceLines":8,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/client":{"sourceFiles":6,"sourceLines":267,"testFiles":2,"testLines":80,"docsFiles":0,"docsCharacters":0},"packages/compaction":{"sourceFiles":6,"sourceLines":165,"testFiles":2,"testLines":47,"docsFiles":0,"docsCharacters":0},"packages/composition":{"sourceFiles":5,"sourceLines":92,"testFiles":1,"testLines":44,"docsFiles":0,"docsCharacters":0},"packages/context":{"sourceFiles":4,"sourceLines":85,"testFiles":2,"testLines":39,"docsFiles":0,"docsCharacters":0},"packages/cordis-adapter":{"sourceFiles":13,"sourceLines":846,"testFiles":5,"testLines":295,"docsFiles":0,"docsCharacters":0},"packages/core":{"sourceFiles":25,"sourceLines":1399,"testFiles":9,"testLines":562,"docsFiles":0,"docsCharacters":0},"packages/desktop-app":{"sourceFiles":5,"sourceLines":266,"testFiles":1,"testLines":12,"docsFiles":0,"docsCharacters":0},"packages/diagnostics":{"sourceFiles":1,"sourceLines":9,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/english-learning":{"sourceFiles":11,"sourceLines":366,"testFiles":2,"testLines":160,"docsFiles":0,"docsCharacters":0},"packages/headless":{"sourceFiles":4,"sourceLines":103,"testFiles":1,"testLines":26,"docsFiles":0,"docsCharacters":0},"packages/llm":{"sourceFiles":26,"sourceLines":1093,"testFiles":9,"testLines":521,"docsFiles":0,"docsCharacters":0},"packages/prompt":{"sourceFiles":12,"sourceLines":522,"testFiles":4,"testLines":121,"docsFiles":0,"docsCharacters":0},"packages/runtime":{"sourceFiles":34,"sourceLines":1620,"testFiles":5,"testLines":181,"docsFiles":0,"docsCharacters":0},"packages/session":{"sourceFiles":43,"sourceLines":3214,"testFiles":14,"testLines":1073,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":31,"sourceLines":5702,"testFiles":11,"testLines":1486,"docsFiles":0,"docsCharacters":0},"packages/subagent":{"sourceFiles":12,"sourceLines":437,"testFiles":2,"testLines":190,"docsFiles":0,"docsCharacters":0},"packages/test-support":{"sourceFiles":2,"sourceLines":73,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"packages/tools":{"sourceFiles":38,"sourceLines":4466,"testFiles":8,"testLines":738,"docsFiles":0,"docsCharacters":0},"packages/util":{"sourceFiles":1,"sourceLines":3,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":40,"sourceLines":6044,"testFiles":8,"testLines":677,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":24,"sourceLines":3762,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":11,"sourceLines":1847,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":21,"sourceLines":6351,"testFiles":9,"testLines":1810,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":31,"sourceLines":11157,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":47,"sourceLines":6985,"testFiles":8,"testLines":677,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":11,"sourceLines":657,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":519,"sourceLines":70297,"testFiles":185,"testLines":23460,"docsFiles":0,"docsCharacters":0}}}}
-->
