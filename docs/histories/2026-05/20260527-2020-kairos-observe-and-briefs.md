## [2026-05-27 20:20] | Task: 落地 Kairos Observe + Briefs 子系统

### 🤖 Execution Context

- **Agent ID**: cursor-agent / actspace-agent workspace
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE / pnpm 10.33

### 📥 User Query

> 一个一个执行（执行 `docs/exec-plans/active/kairos_observe_and_briefs.md`）

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **Watch 子系统**：
  - `watch-scanner.ts` 手写递归 `readdir`：默认排除 `.git/node_modules/dist/.cache/...` 10 个目录、隐藏文件（`.` 开头）跳过，5000 文件上限触发 `truncated=true`。
  - `watch-diff.ts` 使用 SHA1(rootPath) 前 12 位作 manifest 文件名，集合差集得 added/removed，超 50 项触发截断（added 优先），写盘 tmp+rename 原子写。
- **Sessions Digest**：`SessionsDigestBuilder` 用"不挑食"策略——所有 paths.json path 都尝试当 sessions root，子目录有 `session.jsonl` 即视为 session。增量读取仅扫 `session.jsonl` 的最后几个 turnId，与 `<kairosRoot>/memory/state.json` 的 `lastSeenTurnId` 比较算未读数。
- **Briefs**：
  - `parser.ts` 手写极简 YAML frontmatter（key:value 平铺），仅支持 string/number/boolean/null；id 与文件名不一致直接 throw。
  - `index-manager.ts` 维护 `<briefsDir>/index.json` 缓存，`rebuildFromDisk()` 全量重读，`markRun()` 推进 lastRun/nextRun 并写回 frontmatter；解析失败的 brief 标 `status: failed` 不阻断整体。
  - `dispatcher.ts` 按 priority(high>normal>low) + nextRun 升序挑选 due brief；未命中返回默认 `<tick>YYYY-MM-DD HH:mm:ss</tick>`。
- **27 个单测**：watch-scanner 5 + watch-diff 5 + sessions-digest 4 + briefs/parser 4 + briefs/index-manager 4 + briefs/dispatcher 5。

### 🧠 Design Intent (Why)

- **不引入 gray-matter / cron-parser / chokidar**：v1 brief 格式极简，手写 70 行 frontmatter parser 覆盖足够；cron 5 段语法对用户心智负担重，先用 `intervalSec` 数字间隔 + v2 平滑升级（`cron` 是后续可加字段，不破坏存量数据）；文件 watcher 实际只需要在"用户保存 brief"时由 main IPC 主动调 `rebuildFromDisk()`。
- **markRun 不在 dispatcher 而是 controller**：dispatcher 只负责"决定投什么"，状态推进由 plan 5 controller 在 turn 闭合后判断 ok/failed 调用。这避免 dispatcher 双职责。
- **Sessions digest 不挑食**：v1 不强制用户在 paths.json 标 type；扫描时若子目录缺 `session.jsonl` 静默忽略。这与"配置最少"原则一致。
- **manifest 用 sha1(rootPath) 而非用户配置 id**：paths.json 没有 id 字段；rename path 时 hash 自动变化 = 新 watch，旧 manifest 留在磁盘上由 controller 后续清理。

### 📁 Files Modified

- `packages/agent-core/src/kairos/context/watch-scanner.ts`（新增）
- `packages/agent-core/src/kairos/context/watch-diff.ts`（新增）
- `packages/agent-core/src/kairos/context/sessions-digest.ts`（新增）
- `packages/agent-core/src/kairos/briefs/parser.ts`（新增）
- `packages/agent-core/src/kairos/briefs/index-manager.ts`（新增）
- `packages/agent-core/src/kairos/briefs/dispatcher.ts`（新增）
- `packages/agent-core/src/kairos/context/test/{watch-scanner,watch-diff,sessions-digest}.test.ts`（新增 14 单测）
- `packages/agent-core/src/kairos/briefs/test/{parser,index-manager,dispatcher}.test.ts`（新增 13 单测）
- `docs/design-docs/agent-kairos-autonomous-mode.md`（plan 完成清单更新）

### ✅ 验证结果

- `pnpm --filter @actspace/agent-core typecheck` ✅
- `pnpm --filter @actspace/agent-core test` ✅ **349/349 passed**（plan 1-3 累计 47 + 本轮新增 27 = 74 Kairos 测试；旧 263 全保留）
- `ReadLints` ✅ 关键文件无错
