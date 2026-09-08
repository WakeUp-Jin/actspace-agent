# P04：Session Journal、Surface 与文件持久化

状态：已完成

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](README.md)

依赖：P00

消费方：P06、P07、P08、P10-P15

Exec-run slug：`actspace-v2-plan-04-session-journal-and-persistence`

## 1. 目标

在 `@actspace/agent-runtime` 中实现 ActSpace 自有 Session kernel，使 `journal.jsonl` 成为 Agent 运行和模型历史的唯一持久事实来源。完成 Event Codec、Surface、write-behind、durability checkpoint、跨进程 writer lease、保守 repair、cold fork、compaction replacement primitive 与 17 个 golden cases；不复用或兼容 v1 `SessionEvent`、`session.jsonl`、`meta.json` 和 `context-state.json`。

本计划不接 Desktop/CLI，不实现 LLM、Tool 或 Agent Loop；它通过测试 codec 和 fixture 驱动完整状态机。

## 2. 必读与当前基线

- [Session Format v1](../../../design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md)
- [Session 与 Context 目标设计](../../../design-docs/agent-plugin-runtime/agent-target-session-and-context.md)
- `packages/agent-core/src/persistence/`
- `packages/agent-core/src/context/modules/conversation.ts`
- `packages/shared/src/session.ts`

旧实现只作为行为与风险清单。新实现不得导入 `@actspace/agent-core`。

## 3. 固定文件布局和接口

新增：

```text
packages/agent-runtime/src/session/
├── header.ts
├── event-envelope.ts
├── codec-registry.ts
├── core-codecs.ts
├── invariant-validator.ts
├── surface.ts
├── journal.ts
├── session.ts
├── session-store.ts
├── jsonl-reader.ts
├── jsonl-writer.ts
├── write-behind.ts
├── writer-lease.ts
├── checkpoint.ts
├── recovery.ts
├── fork.ts
├── projection.ts
├── errors.ts
└── test/
```

本计划依据 Session Format v1 固定并实现 `SessionHeaderV1`、`SessionEventEnvelopeV1`、`EventCodec`、`SessionAccessState`、`SessionInspection`、`SessionHandle` 与 `SessionProjection`。Session 目录固定为：

```text
<dataRoot>/sessions-v2/<session-id>/
├── journal.jsonl
├── artifacts/
├── recovery/
└── .writer-lock/
```

`artifacts/` 由 Host 提供的 `ArtifactStore` port 管理；Journal 只保存版本化 reference 和 digest，不嵌入二进制。

## 4. 机械参数

- 编码：UTF-8、无 BOM、LF；Header 第一行，之后每个 Event Envelope 一行。
- write-behind：200 ms 窗口；达到 128 个事件或 256 KiB 立即 drain。
- `flush()`：取消计时器，串行写完当前和随后已接纳 batch，执行 file `fsync` 后返回。
- 新建 Journal：同目录临时文件写 Header、`fsync`、原子 rename、目录 `fsync`。
- append：记录原文件长度，循环处理 short write，写完整 batch 后 `fsync`；失败时尝试 truncate 回原长度并再次 `fsync`，无法确认回滚则关闭 writer 并标记 `corrupt`。
- writer lease：原子创建 `.writer-lock/`，`owner.json` 包含 sessionId、runtimeId、pid、nonce、acquiredAt、heartbeatAt；每 5 秒 heartbeat。
- stale：heartbeat 超过 30 秒且 owner PID 不存活时，先把 lock 目录原子 rename 到 `recovery/stale-lock-<nonce>`，再竞争新 lock；PID 仍存活时禁止偷锁。
- disposer 只在 nonce 与 owner 一致时删除 lock；二次 dispose 幂等。
- inspect / browse 永不修改物理文件；continue / repair 必须持有 writer lease。
- torn tail repair：先把原文件完整复制到 `recovery/<sha256>.journal.jsonl` 并 `fsync`，再用有效前缀和 repair facts 写临时文件、`fsync`、原子替换及目录 `fsync`。任何崩溃点都保留原文件或完整新文件。

## 5. 任务

### 04.1 Codec registry 与 admission

- 实现 Core codec 全量注册、插件 codec 预发现、owner / type / version / criticality 唯一性校验。
- 写入前先执行 schema、关系和 Surface candidate 校验；失败不能推进 seq 或留下内存事实。
- unknown required 进入 browse-only；unknown ignorable 保留 raw row、跳过 projection 并标记 degraded；非法 known payload 标记 corruption。
- 用随机注册顺序测试 registry 输出 digest 稳定。

### 04.2 Journal 与 Surface

- 事件接纳时分配连续 seq、固定 time、做 lossless JSON snapshot 并 deep-freeze。
- 实现 user / assistant / tool-result 三类 Surface node、append 和 positional replace。
- replace 必须引用全部被 shadow 的 `sourceEventSeqs`；普通 append 不推进 `replaceGeneration`。
- 实现增量 projection cache；删除 cache 后从 Journal 重建得到 byte-equivalent view。

### 04.3 文件编码、write-behind 与 lease

- 按第 4 节参数实现 reader、writer、batch queue 和跨进程 lock。
- child-process 测试证明 Desktop/CLI 竞争同一 Session 时只有一个 writer 成功。
- 注入 open/write/short-write/fsync/truncate/rename/dir-fsync 失败，验证 fail-closed 和证据保留。
- shutdown 必须取消 timer、drain queue、关闭 fd、停止 heartbeat、释放自己拥有的 lock。

### 04.4 Checkpoint 与 crash recovery

- `CheckpointPolicy` 提供 LLM dispatch 前、顶层工具 body 前、下一 Step 前三个固定 barrier。
- checkpoint 失败返回结构化 `SessionDurabilityFailure`，调用者不得继续副作用。
- repair 区分 tool not-started 与 outcome-unknown，追加 interrupted Step / Turn closers，不删除 durable open tail。
- repair marker 和 closers 幂等；重复 load 不产生第二组 repair facts。

### 04.5 Fork、Compaction primitive 与 provenance

- cold fork 只允许 balanced boundary，无 dangling tool call；复制逻辑 prefix，不复制 writer、credential、Fiber 或进程状态。
- Header 保存 parentSession、seedLength、compositionDigest、pluginSet、eventCodecDigest 和 static preset provenance。
- 实现 compaction start / summary / Surface replacement / end transaction primitive；原始事件永远保留。
- Artifact reference、request snapshot 和 replacement 必须携带可追踪的 source seq / digest。

### 04.6 Golden fixtures

- 把 Session 规范第 21 节 17 个案例逐项落为 `packages/agent-runtime/src/session/test/golden/` fixture。
- 增加 LF/BOM、连续 seq、canonical export、unknown codec、torn final line、writer race、repair crash、cold fork 和 secret canary 负例。
- fixture 既测试 decode，也测试 encode -> decode -> projection round trip。

## 6. 允许修改

- `packages/agent-runtime/src/session/**`
- `packages/agent-runtime/src/contracts/session.ts`，仅修正实现时发现的机械类型错误，不改变设计语义
- `packages/shared/src/runtime-v2/session.ts`，仅同步 Host 可见 DTO
- 对应测试、设计勘误、history 和 exec-run

禁止修改 Desktop、CLI、旧 `packages/agent-core`、根 Session 数据和默认 Runtime。

## 7. 失败与回滚

- 任一 golden case 无法由 raw JSONL 单 backend满足时停止，不增加 SQLite、zstd、sidecar truth 或 v1 importer。
- 平台无法可靠执行 writer lease 时停止 Host 接入；不能退化为“最后写入者获胜”。
- 文件写入不确定时 Session 进入只读 corruption 状态；不得继续工具或 LLM 副作用。
- 回滚只移除新 `session/` 实现与 `sessions-v2/` 测试数据，旧 `<dataRoot>/sessions/` 不变。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/session
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:docs
pnpm check:secrets
git diff --check
```

预期：17 个 golden cases 和全部故障注入通过；测试结束无 fd、timer、heartbeat 或 lock 目录泄漏；任何 canary secret 不出现在 Journal、错误或 snapshot 中。

## 9. 完成标准

- Session 可以完全从 `journal.jsonl` 和已安装 codec 重建，不读取 v1 文件或可变 Context。
- persistent 与 browse-only access state、repair、fork、checkpoint 和 compaction 不变量全部机械验证。
- P06-P14 只通过本计划的公共 Session API 接入，不自行写 JSONL。

## 10. 执行结果

- 2026-08-22：完成 `@actspace/agent-runtime/session` ESM 子路径、17 项 golden acceptance inventory 与 34 个自动化测试。
- 2026-08-22：持久化只使用 `<dataRoot>/sessions-v2/<session-id>/journal.jsonl`；未增加 SQLite、zstd、packed row 或 v1 importer。
- 2026-08-22：repair 与 compaction 都以 commit marker 控制有效视图；未提交事务保留原始行但不改变关系或 Surface。
- 2026-08-22：跨进程 writer race、short write、fsync、truncate、rename、directory fsync、torn tail、checkpoint 与 shutdown drain 均有机械测试。
