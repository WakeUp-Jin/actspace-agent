# ActSpace v2 P04：Session Journal、Surface 与文件持久化 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-04-session-journal-and-persistence.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-04-session-journal-and-persistence/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Session kernel | `packages/agent-runtime/src/session/{header,event-envelope,codec-registry,core-codecs,invariant-validator,journal,surface}.ts` | ActSpace 自有 append-only 事实与模型 Surface |
| raw JSONL persistence | `packages/agent-runtime/src/session/{jsonl-reader,jsonl-writer,write-behind}.ts` | 唯一文件 backend 与 fail-closed durability |
| exclusive ownership | `packages/agent-runtime/src/session/writer-lease.ts` | Desktop/CLI 跨进程互斥 writer |
| recovery/fork/compaction | `packages/agent-runtime/src/session/{recovery,fork,compaction}.ts` | 保守恢复、cold fork 与 commit-aware replacement |
| public Session API | `packages/agent-runtime/src/session/index.ts`、`packages/agent-runtime/package.json` | 后续模块不直接写 JSONL |

## 人工验证指引

### 必须验证

1. **fresh install 后重跑标准工具链**
   - 验证方式：从完整依赖树执行 P04 计划第 8 节全部命令。
   - 预期结果：Session 34 个测试和 package boundary 2 个测试继续通过，build/typecheck 和仓库检查退出码为 0。

### 建议验证

1. **跨 Host 文件根检查**
   - 验证方式：后续 P13/P14 使用同一测试 dataRoot 同时尝试打开一个 Session。
   - 预期结果：只有一个 Host 获得 `.writer-lock`，另一 Host 得到结构化 locked failure。

## Agent 已完成的验证

- Session：4 个测试文件、34/34；package boundary：2/2 通过。
- TypeScript 5.9.3 strict NodeNext typecheck：通过。
- ESM `dist/session/index.js` import smoke：通过。
- Child process writer race：通过。
- append fsync/partial-write 可恢复回滚、rollback failure、creation fault、write-behind failure 与 torn-tail forensic repair：通过。
- `check:docs`、`check:secrets`、`git diff --check`：通过。

## 已知风险和遗留事项

- 标准 workspace 的 Vitest 3.2.4 已通过；fresh dependency install 和 packaged 平台矩阵仍待 P15。
- writer lease 已覆盖 macOS 本机与 child process；Linux/Windows packaged matrix 属于 P15 验收。
- ArtifactStore 只定义 port 与 durable reference，具体 artifact backend 按后续 Tool/Host 工作包实现。

## 后续建议

- P06-P14 只消费 `@actspace/agent-runtime/session`，禁止再创建平行 JSONL writer 或可写 conversation 状态。
