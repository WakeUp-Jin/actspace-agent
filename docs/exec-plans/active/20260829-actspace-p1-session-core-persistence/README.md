# P1-A：Session Core 与 Persistence Provider 分离

状态：实施中；contract slice 与事件/检查点行为已交付，物理 `@actspace/session-core` 包迁移仍在本计划。

下一步：在独立变更中迁移 live classes 和 42 个 consumer 导入，不重复修改已由[事件持久化计划](../../completed/20260920-session-event-persistence/README.md)交付的时序语义。

## 目标与依赖

把 `SessionHandle`、live Journal、append/replay 生命周期与 JSONL 文件、writer lease、write-behind、physical recovery 分成可替换边界。依赖 P0 冻结的 13 个 Session 核心事件、Envelope、codec、`session/event`、`session/flush` 和当前 JSONL golden；可与 P1-B 并行，P1-C 生产 Boot 接线等待本计划 public contract 稳定。

设计真源：[Session Core 与 Persistence Provider 分离规范](../../../design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)。

## 范围和文件所有权

允许修改：

- `packages/session/core/**`（新增 `@actspace/session-core`，如 workspace 约定要求可在现有 session package 内先建同名入口）；
- `packages/session/persistence/src/**` 及其 manifest、exports、tests；
- `packages/session/jsonl/src/**` 及其 tests；
- `packages/session/journal/src/**` 仅在 detached snapshot、codec 或 contract export 需要时；
- `packages/session/projection/src/**` 仅在 projection 改为消费 Core/Journal read-only contract 时；
- Session package `package.json`、workspace wiring 和相关 docs/tests。

禁止修改：Agent Loop 9 个事件的字段/顺序、Cordis Event ABI、具体 Tool executor、LLM provider wire、用户 Session 数据目录和 CLI chat。

## 实施步骤

1. **Contract extraction**：从现有 `SessionStore`、`SessionHandle`、`JsonlSessionPersistence` 提取 `SessionPersistenceProvider`、`SessionSeed`、`SessionInspection`、`SessionInspectionSuffix` 和 `SessionCore` 的 type-only/public exports；Provider contract 不返回 live handle，不引入 `node:fs` 到 Core。
2. **Core package**：建立 Core 的 create/open/inspect/list、in-memory Journal、append/appendMany、post-commit `session/event`、flush delegation、close/dispose 和 writer-blocked 状态；Core 只依赖 Journal + persistence definition。
3. **JSONL Provider**：把当前 writer、lease、write-behind、torn-tail、recovery、fork prefix 和 artifact layout 通过 Provider contract 暴露；保持 UTF-8 raw JSONL、首行 Header、seq 连续性和 flush barrier。
4. **生产接线**：修改 Session Service/Runtime 注入点，使默认 Provider 由 Composition/Service system 提供；清理 `SessionHandle` 对 `JsonlSessionWriter` 的直接 import，禁止第二份 writer。
5. **Parity and failure**：增加 fake/in-memory Provider、append/flush failure、lease conflict、torn-tail、fork、replay、通知失败和 close/dispose tests；验证 provider blocked 时 LLM/tool 副作用 fail closed。
6. **交接**：输出 public export 列表、package dependency graph、CLI fresh/resume 测试结果和供 P1-C 消费的 Session Service Definition metadata。

## 验收标准

- `rg` 检查显示 Core 生产源码不导入 `@actspace/session-jsonl`、`JsonlSessionWriter` 或文件路径 API。
- Fake Provider 与 JSONL Provider 可替换，Agent Loop/Projection 测试不改业务代码。
- 13 个核心事件、扩展 codec、Surface、replay、recovery、fork、`session/end-seed` golden 与 P0 一致。
- `session/event` 只在 Journal commit 后发布；`session/flush` 只在 durability barrier 完成后报告。
- 并发 Session 的 seq、lease、通知和 dispose 不串线；Provider failure 后新副作用 fail closed。

## 定向验证

```bash
pnpm --filter @actspace/session-journal typecheck
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence typecheck
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/session-jsonl typecheck
pnpm --filter @actspace/session-jsonl test
pnpm --filter @actspace/session-core typecheck
pnpm --filter @actspace/session-core test
```

若 package 名称在实施中采用不同拆分，必须在本计划和根 workspace manifest 中统一命名后再运行命令，不得同时保留两种生产入口。完成后追加 `pnpm test:agent-cli:process` 的 `--persist/--resume` 证据。

## 回退

回退只允许撤销 Core/Provider adapter 和注入接线，保留原始 JSONL 文件、Journal schema 和 golden。不得让 Core 重新直接依赖 JSONL writer 来绕过失败；若 contract 仍不稳定，停在 fake Provider/contract tests 阶段并交接阻断原因。

## 交接给下游

P1-C 需要消费：`session.core`、`session.persistence`、`session.journal` 的 Definition/Provider ID、public exports、scope、required 状态和 Boot 所需 config schema。P2 需要消费：13 个核心事件及扩展 codec 的 owner、producerStatus、tests、sourceRefs。

## 进度

- [x] 提取并冻结 Core/Provider public contract（`SessionPersistenceDriver`、`SessionPersistenceBinding`）。
- [x] 完成现有 persistence package 内的 Core seam 与 fake Provider contract test。
- [x] 接入 JSONL Provider driver 并通过现有 34 个 persistence parity tests。
- [x] 切换 `SessionStore` 由 binding 组装 live Session Core；Core 不再导入 JSONL writer。
- [ ] 通过 CLI persist/resume 独立验收并完成 G1 交接；全仓 typecheck/test 已通过。
