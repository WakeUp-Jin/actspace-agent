## [2026-07-03 23:00] | Task: Kairos 提示词重写 + 巡检管道退役 + 读写授权分离

### 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE

### 📥 User Query

> Kairos 加载了 fs-watch Skill 后仍然很被动，几乎不会主动读监听日志。一起梳理系统提示词，强调唤醒时主动读取持续数据源；不要把 fs-watch 事件直接注入 tick 观测（那样 Skill 设计就没意义了）。另外：tick 消息里的"巡检目录变化"既然和文件监听重复，旧巡检管道可以去掉；Workspace boundary 的读限制太严——写入按授权来，读取没必要限制（fs-watch 监听目录应可读）。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`（kairos / tools）、`packages/desktop`（main / renderer）、`docs/`

**Key Actions:**

- **[提示词重写]**: `KAIROS_SYSTEM_PROMPT` 改为「唤醒例程 + 闲时工作」骨架——每次唤醒先过一遍例程（含"持续更新的数据源类 Skill 主动查看最新输出"，保持 skill-agnostic 不硬编码 fs-watch），无新观测时从闲时清单挑事做；Pacing 与 First wake-up 段同步改写。
- **[巡检管道退役]**: 删除 `context/watch-scanner.ts`、`context/watch-diff.ts` 及其测试；tick 观测增量只剩 sessions-digest + inbox；`paths.json` 移除 `watch` 字段（loader 对旧文件静默忽略）；bootstrap 不再创建 `observe/watch-manifests/`，并迁移旧默认空配置。
- **[读写授权分离]**: 工具守卫新增 `readOnlyRoots`（Skill 目录 + fs-watch 监听目录）；`ToolScheduler.checkKairosGuard` 按工具 `isReadOnly` 分流——读工具放行 `allowedRoots ∪ readOnlyRoots`，写工具仅限 `allowedRoots`（paths.json）。
- **[main 进程联动]**: 创建 KairosController 时从 `FsWatchService.getConfig()` 取监听目录注入 `readOnlyRoots`；fs-watch 监听目录变化或开关切换时自动重建 controller，保证授权实时同步。
- **[设置页]**: 「可访问路径」更名「可读写路径」，移除每行「巡检」Toggle，文案说明文件监听目录自动获得只读授权。
- **[测试]**: guard 读写分离新增 3 条用例（只读工具可读监听目录 / 写工具被拒 / 写工具在 allowedRoots 正常）；prompt-assembler / runner / schema / loader / bootstrap / renderer 相关测试全部同步，agent-core 与 desktop 测试及 typecheck 通过。
- **[文档同步]**: `agent-kairos-autonomous-mode.md`（提示词结构 / 存储布局 / paths.json / watch 小节标注退役）、`agent-plugins-fs-watch.md`（状态改已上线 + readOnlyRoots 授权通道）、`agent-current-module-map.md`、`agent-kairos-prompt-cache-optimization.md`、`core-storage-and-observability.md`、`front-设置页规范.md` 全部更新。

### 🧠 Design Intent (Why)

- **被动性问题走提示词而非机制**：直接把 fs-watch 事件注入 tick 会让 Skill 消费路径失去意义，且破坏"插件与 Kairos 只经文件契约耦合"的边界。改为在系统提示词的唤醒例程里做通用引导，fs-watch 的 SKILL.md description 自述 pushy，两层配合。
- **巡检管道与 fs-watch 职责重复**：旧 poll-on-tick 巡检感知不到 modified、粒度粗、每 tick 全量扫描；fs-watch 上线后保留两套只会带来配置困惑（paths.json watch 开关 vs 文件监听设置），整体退役归口到插件。
- **读写授权不对称是合理默认**：读的风险远低于写；用户把目录加入文件监听即表达了"允许 Kairos 阅读"的意图，自动并入只读授权省掉重复配置；写仍需 paths.json 显式授权，防止后台 Agent 意外改动用户文件。

### 📁 Files Modified

- `packages/agent-core/src/kairos/prompt.ts`
- `packages/agent-core/src/kairos/prompt-assembler.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/agent-core/src/kairos/config/schema.ts`
- `packages/agent-core/src/kairos/config/prompt-assembler.ts`
- `packages/agent-core/src/kairos/context/watch-scanner.ts`（删除）
- `packages/agent-core/src/kairos/context/watch-diff.ts`（删除）
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- 相关测试与 `docs/design-docs/` 6 份文档
