# agent-runtime-v2 重构前统计

> 由 `pnpm refactor:stats before` 生成。重构完成后运行对应的 `after` 命令生成差异报告。

## 基本信息

- **计划**：`agent-runtime-v2`
- **统计阶段**：`before`
- **统计时间**：2026-08-22T11:48:53.732Z
- **Git 分支**：`refactor-dsh-plugin`
- **Git commit**：`9366c1910a3b1de5b469df9b833324d65c109767`
- **工作区**：有 11 项未提交变化

## 仓库总览

| 指标 | 数量 |
|---|---:|
| 源代码文件 | 552 |
| 源代码行 | 125,758 |
| 测试文件 | 243 |
| 测试代码行 | 47,088 |
| Docs 文件 | 906 |
| Docs 非空白字符 | 3,236,074 |

## 按主要目录

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| .agents | 19 | 4,749 | 0 | 0 |
| docs | 20 | 10,781 | 0 | 0 |
| packages/agent-cli | 19 | 1,680 | 13 | 804 |
| packages/agent-core | 182 | 31,687 | 110 | 20,707 |
| packages/desktop | 166 | 49,468 | 96 | 21,563 |
| packages/shared | 20 | 5,668 | 9 | 1,632 |
| packages/site | 45 | 4,955 | 3 | 234 |
| browser-bridge | 42 | 10,247 | 9 | 1,810 |
| plugins/fs-watch | 7 | 1,306 | 0 | 0 |
| scripts | 32 | 5,217 | 3 | 338 |

## 按语言

| 分类 | 源文件 | 源代码行 | 测试文件 | 测试行 |
|---|---:|---:|---:|---:|
| Astro | 24 | 3,778 | 0 | 0 |
| CSS | 11 | 1,826 | 0 | 0 |
| Go | 21 | 6,347 | 9 | 1,810 |
| HTML | 25 | 11,142 | 0 | 0 |
| JavaScript | 33 | 5,876 | 3 | 338 |
| Python | 4 | 1,938 | 0 | 0 |
| Rust | 6 | 1,291 | 0 | 0 |
| Shell | 12 | 713 | 0 | 0 |
| TypeScript | 416 | 92,847 | 231 | 44,940 |

<!-- refactor-stats-data
{"schemaVersion":1,"plan":"agent-runtime-v2","slot":"before","generatedAt":"2026-08-22T11:48:53.732Z","git":{"commit":"9366c1910a3b1de5b469df9b833324d65c109767","branch":"refactor-dsh-plugin","dirty":true,"changedEntries":11,"untrackedEntries":6},"metrics":{"totals":{"sourceFiles":552,"sourceLines":125758,"testFiles":243,"testLines":47088,"docsFiles":906,"docsCharacters":3236074},"areas":{".agents":{"sourceFiles":19,"sourceLines":4749,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"docs":{"sourceFiles":20,"sourceLines":10781,"testFiles":0,"testLines":0,"docsFiles":906,"docsCharacters":3236074},"packages/agent-cli":{"sourceFiles":19,"sourceLines":1680,"testFiles":13,"testLines":804,"docsFiles":0,"docsCharacters":0},"packages/agent-core":{"sourceFiles":182,"sourceLines":31687,"testFiles":110,"testLines":20707,"docsFiles":0,"docsCharacters":0},"packages/desktop":{"sourceFiles":166,"sourceLines":49468,"testFiles":96,"testLines":21563,"docsFiles":0,"docsCharacters":0},"packages/shared":{"sourceFiles":20,"sourceLines":5668,"testFiles":9,"testLines":1632,"docsFiles":0,"docsCharacters":0},"packages/site":{"sourceFiles":45,"sourceLines":4955,"testFiles":3,"testLines":234,"docsFiles":0,"docsCharacters":0},"browser-bridge":{"sourceFiles":42,"sourceLines":10247,"testFiles":9,"testLines":1810,"docsFiles":0,"docsCharacters":0},"plugins/fs-watch":{"sourceFiles":7,"sourceLines":1306,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"scripts":{"sourceFiles":32,"sourceLines":5217,"testFiles":3,"testLines":338,"docsFiles":0,"docsCharacters":0}},"languages":{"Astro":{"sourceFiles":24,"sourceLines":3778,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"CSS":{"sourceFiles":11,"sourceLines":1826,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Go":{"sourceFiles":21,"sourceLines":6347,"testFiles":9,"testLines":1810,"docsFiles":0,"docsCharacters":0},"HTML":{"sourceFiles":25,"sourceLines":11142,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"JavaScript":{"sourceFiles":33,"sourceLines":5876,"testFiles":3,"testLines":338,"docsFiles":0,"docsCharacters":0},"Python":{"sourceFiles":4,"sourceLines":1938,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Rust":{"sourceFiles":6,"sourceLines":1291,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"Shell":{"sourceFiles":12,"sourceLines":713,"testFiles":0,"testLines":0,"docsFiles":0,"docsCharacters":0},"TypeScript":{"sourceFiles":416,"sourceLines":92847,"testFiles":231,"testLines":44940,"docsFiles":0,"docsCharacters":0}}}}
-->
