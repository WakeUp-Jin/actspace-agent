# ActSpace v2 P04：Session Journal、Surface 与文件持久化 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-04-session-journal-and-persistence.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 20:04
- **结束时间**：2026-08-22 20:27

## 执行时间线

### 步骤 1：领域事实与 Codec

- **操作**：实现 Header、Event Envelope、JSON-safe snapshot、Event Codec Registry、核心 codec 和关系校验。
- **影响文件**：`packages/agent-runtime/src/session/header.ts`、`event-envelope.ts`、`codec-registry.ts`、`core-codecs.ts`、`invariant-validator.ts`。
- **决定**：非法候选必须在分配 seq 前失败；required/ignorable 由 codec 固定，未知 required 进入 browse-only。
- **验证**：Codec 注册顺序 digest 稳定；重复 owner、断裂 upgrade chain、非法 owner 与 secret 字段均被拒绝。

### 步骤 2：Journal、Surface 与投影

- **操作**：实现 append-only Journal、三类 Surface node、append/replace、增量 clone/apply cache 与有效事务视图。
- **影响文件**：`journal.ts`、`surface.ts`、`projection.ts`、`compaction.ts`。
- **决定**：repair 和 compaction 只有在 commit/end marker 可见后才影响关系与 Surface；原始行永不删除。
- **验证**：非法 candidate 不推进 seq；replace 精确引用全部 shadowed source；cache 重建等价。

### 步骤 3：raw JSONL durability

- **操作**：实现 Header 原子发布、short-write 循环、append fsync/rollback、200ms/128 event/256KiB write-behind、canonical reader/export。
- **影响文件**：`jsonl-reader.ts`、`jsonl-writer.ts`、`write-behind.ts`。
- **决定**：任何不确定写入都 fail closed；torn tail 只 inspect，不在 browse 时改写。
- **验证**：open、header write、append write、short write、fsync、truncate、rename 和 directory fsync 故障注入通过；append fsync 失败和 partial write 失败都能截回原字节并保持 Journal 可读，rollback 自身失败则明确进入 corrupt。

### 步骤 4：lease、checkpoint、repair 与 fork

- **操作**：实现 writer lock heartbeat/stale recovery、SessionStore/SessionHandle、四个 durability barrier、保守 repair、torn-tail forensic publish 与 cold fork。
- **影响文件**：`writer-lease.ts`、`session.ts`、`session-store.ts`、`checkpoint.ts`、`recovery.ts`、`fork.ts`。
- **决定**：Desktop/CLI 同一 Session 只能有一个 writer；tool dispatch 后无结果一律 outcome-unknown，不自动重试。
- **验证**：真实 child process 竞争只有一方成功；close 与在途 append 串行；repair 幂等；fork 只接受 balanced boundary。

### 步骤 5：Golden acceptance 与 ESM export

- **操作**：登记 17 项 golden cases，增加 `@actspace/agent-runtime/session` export。
- **影响文件**：`packages/agent-runtime/package.json`、`src/session/test/**`。
- **验证**：Session 4 个测试文件 34/34、package boundary 2/2 通过；strict typecheck、ESM import smoke、docs/secrets/diff 检查通过。

## 遇到的问题

- **问题**：repair 续写最初会让未提交 closer 提前进入投影。
  - **原因**：关系校验与 Surface 直接消费物理事件，没有 commit-aware 有效视图。
  - **应对**：增加事务缓冲；repair/compaction 只在匹配 terminal marker 后原子进入有效视图。
- **问题**：`close()` 最初未与 append/flush 共用串行队列。
  - **原因**：关闭直接释放 writer 与 lease，在调用者未 await append 时存在竞态。
  - **应对**：close 进入同一 mutation queue，并用共享 promise 保证幂等。

## 后续集成边界

- 锁定的 Vitest 3.2.4 已通过标准 workspace 命令；fresh install 和跨平台 packaged matrix 仍属于 P15 外部门禁。
- Desktop/CLI 已由 P13/P14 接入同一 Session root 和 writer lease；真实 packaged 跨 Host 竞争仍待 P15。
