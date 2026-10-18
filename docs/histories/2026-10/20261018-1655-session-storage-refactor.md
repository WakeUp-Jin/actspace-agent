## 2026-10-18 16:55 | Task: 重构 Session 存储职责与运行态历史

### Execution Context

- Agent：Codex，独立讨论会话。
- Runtime：Codex Desktop，本地 TypeScript workspace。

### User Query

> 把数据存储结构重构方案整理成计划，然后把计划全部实现。

### Changes Overview

Session JSONL 与附件保留完整事实；增量校验和物理追加替代每次全历史处理；持久事件正文可释放并按文件位置回读。迁移当前状态消费者，增加写入背压，清理 Step 用量辅助状态，移除 flush 的冷历史缓存重建。Desktop artifact 发布前补齐 fsync。

### Design Intent

将事实保存、当前执行状态和前端历史查询的职责分开。模型 Context 压缩不等于释放全部事件历史，SQLite 索引也不能解决 Agent 写入链路的全量重复计算。旧格式继续读取，失败不推进 durable，不通过删除历史降低内存。

### Files Modified

- `packages/session/journal/src/journal.ts`、`invariant-validator.ts`、`history.ts`
- `packages/session/jsonl/src/storage.ts`、`event-history.ts`
- `packages/session/persistence/src/`：Session、coordinator、write-behind 及相关测试
- `packages/session/projection/src/`：Registry、统计与相关测试
- `packages/runtime/src/session/session-controller.ts` 及 Context / Inbox / Todo / Task / Harness 调用方
- `apps/desktop/src/main/runtime-v2/artifact-store.ts`
- 计划、职责说明与执行摘要：`docs/exec-runs/20261018-session-storage-refactor/execution-summary.md`

### Validation

相关后端测试、Desktop artifact 测试、依赖闭包构建、Electron main 类型检查通过；十万事件磁盘恢复实验通过。全库文档门禁保留一条既有归档 demo 断链。未执行真实 Provider、Electron UI 或断电验证；具体命令、计数和资源边界见执行摘要。

### 设计文档同步（同日续轮）

用户确认结构后要求核对相关存储设计文档。将总设计从讨论稿更新为当前结构入口，补充四块存储归属、accepted/durable 写入流程及按用途读取图；更新职责决策记录、物理存储边界、Session 存储与格式规范、Projection 与 SQLite 专题，并同步架构和设计索引。

纠正旧文档中 SQLite“未来接入”、Agent 可能回退 SQL、旧 byte-offset cache 与新内存位置索引混淆等描述；明确 durability checkpoint、投影状态对象和 JSON 检查点文件的区别。保留冷恢复与冷分页仍可全量 inspect、总内存未固定、无新文件检查点和产品级验收边界。本续轮仅修改文档，未改业务代码或用户数据。

本续轮检查：10 份文档的 95 个本地链接及锚点通过，代码块围栏配对通过，`git diff --check` 通过。`pnpm check:docs` 仍只报告上述既有归档 demo 断链，未声称全库门禁通过。业务测试沿用实施轮证据，本次没有重新执行。
