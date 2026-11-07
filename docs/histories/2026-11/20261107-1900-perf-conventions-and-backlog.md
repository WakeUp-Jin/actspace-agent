## [2026-11-07 19:00] | Task: 性能与内存约定、性能待办、采样工具入库、高频路径检查

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 明天要做第三轮优化，先准备好文档和待办列表；这次因为代码规范不到位，写出了近 3G 的内存占用，要整理规范和约束，确保下次不再出现；看看 docs 和测试还要加什么。coding-standards 下面不需要 team 子目录。其他按建议来。

### 🛠 Changes Overview

**Scope:** `docs/`、`scripts/`、`packages/session/session-journal`、根 `package.json`

**Key Actions:**

- **规范：**
  - 新增 `docs/coding-standards/perf-memory-conventions.md`，写明高频路径的范围和 8 条规则，以及怎么验证；
  - 去掉 `coding-standards/team/`，`frontend-style-scope-conventions.md` 上移一层，README 合并。已完成计划里引用的旧路径保持原样。
- **待办：**
  - 新增 `docs/exec-plans/perf-backlog.md`，作为性能任务总表：P1–P10 待做，以及已完成各轮的数字；
  - 新增第三轮执行计划 `active/20261108-perf-round3.md`，R1–R4 方案已拍板。
- **工具：**
  - `tmp/heap/monitor.mjs` 移入 `scripts/diagnostics/heap-monitor/monitor.mjs`：`ws` 改从 desktop 解析，端口跟随 `ACTSPACE_INSPECT_MAIN`；
  - 原来散落的分析脚本合成 `analyze.mjs`，子命令有 summary、top、callers、compare；
  - 使用说明在 `docs/tools/heap-monitor/README.md`。
- **检查：**
  - 新增 `pnpm check:hot-path-reads` 和基线 `scripts/hot-path-reads-baseline.json`，扫描整份读日志、逐条读、整份深拷贝 7 种写法；超出基线就失败，`perf-allow: 理由` 豁免；
  - 单测在 `scripts/test/hot-path-reads.test.mjs`；
  - 已接入根 `pnpm test`。
- **测试基础件：** 新增 `@actspace/session-journal/testing`，含 `syntheticSessionEvents`、`countingHistory`、`syntheticJournal`，以及自测和写法示范 `scale-testing.test.ts`。
- **入口：**
  - `AGENTS.md` 加「写高频路径前要读」；
  - `docs/README.md`、`RELIABILITY.md`、前端新功能开发清单 §5 都加了链接。
- **学习沉淀：** 新增 `learnings/2026-11/hot-path-cost-grows-with-session.md`。

### 🧠 Design Intent (Why)

前三轮排查（run1–run8）的热点都是同一类问题：代码在高频路径上，工作量却跟着会话长度增长。单元测试和短会话里看不出来。所以这次没有引入计时类基准框架，因为它在不同机器上波动大，容易偶尔失败。改为三层：

1. 静态检查拦住已知写法；
2. 规模测试数读取量，不计时；
3. 实机采样按函数对比，只报告，不判失败。

用新的 `analyze.mjs` 复查 run8 时，又发现 pi-ai 对工具参数流式片段整段重解析，约 1.9 GB，已登记为 P10，待拍板。

### 📁 Files Modified

- `AGENTS.md`、`package.json`
- `docs/README.md`、`docs/RELIABILITY.md`、`docs/design-docs/frontend/front-新功能开发清单.md`
- `docs/coding-standards/README.md`、`perf-memory-conventions.md`（新增）、`frontend-style-scope-conventions.md`（从 `team/` 移出）
- `docs/exec-plans/README.md`、`perf-backlog.md`（新增）、`active/20261108-perf-round3.md`（新增）
- `docs/tools/heap-monitor/README.md`（新增）
- `docs/learnings/README.md`、`2026-05/global-css-reset-vs-tailwind.md`、`2026-11/hot-path-cost-grows-with-session.md`（新增）
- `scripts/check-hot-path-reads.mjs`、`hot-path-reads-baseline.json`、`test/hot-path-reads.test.mjs`（新增）
- `scripts/diagnostics/heap-monitor/monitor.mjs`、`analyze.mjs`（新增）
- `packages/session/session-journal/package.json`、`src/testing.ts`、`src/test/scale-testing.test.ts`（新增）
