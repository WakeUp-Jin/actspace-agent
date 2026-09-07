# P01：Projection Registry、Watermark 与 Cache

## 目标

在 `@actspace/session-projection` 内实现 DSH 风格的 projection registry，并新增独立的 `@actspace/session-projection-cache` package。前者只负责纯 projection framework，后者负责 checkpoint、restore floor 和 cold restore。完成后，通知可以丢失，cache 可以删除，Host 仍能从 Journal 重建相同的 projection。

## 依赖

- [P00 Projection Contract](./p00-projection-contract.md) 的 shared types 和 canonical Surface adapter；
- P1-A Session Core/Persistence 的 `readFrom`、detached inspection、flush 和 Provider contract；
- [Session Core 与 Persistence Provider 分离规范](../../../design-docs/agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)。

P01 不依赖 Desktop renderer，也不等待 P1-C 的 Profile/Bundle/Boot cutover。

## 范围

允许修改：

- `packages/session/projection/src/projection.ts`；
- `packages/session/projection/src/registry.ts`；
- `packages/session/projection/src/plugin.ts`、`manifest.ts`、`index.ts`；
- `packages/session/projection/src/test/**`；
- 新建 `packages/session/projection-cache/package.json`、`tsconfig.json`、`src/**` 和 tests；
- `packages/session/persistence/src/**` 仅在补充 detached checkpoint/readFrom contract 时；
- `packages/shared/src/runtime-v2/projection.ts` 仅在 P00 contract 发现必要的 detached cache row 缺口时，且必须回写 P00 计划记录。

禁止修改：

- Journal event schema、JSONL writer 的物理行为和 recovery 语义；
- AgentLoop、ToolRuntime、LLM adapter 和具体 executor；
- Desktop IPC、renderer state 和 UI；
- 任何把 cache 变成第二事实源的接口；
- 让 `@actspace/session-projection` 依赖 Persistence Provider、文件系统或 JSONL writer。

## 实施步骤

1. 在 `packages/session/projection` 实现 `ProjectionDefinition<K, S, V>` 注册表，校验唯一 key、非负 `stateVersion`、同步 `init/apply/view`、JSON-safe schema 和注册 disposer。
2. 为每个 `sessionId` 建立惰性 projection cell，按已知 Journal 事件顺序从 `init` fold；后注册 unit 时从现有内存事件补齐，不要求领域自己订阅 `session/event`。
3. 实现统一 `snapshot(session)`，保证所有已注册 unit 与同一个 `throughJournalSeq` 对齐；不相关事件必须保留 state reference，不触发变更通知。
4. 实现 `onChanged` change feed。每个 committed event 对每个 changed unit 至多发布一次，change payload 是 schema 校验后的全量 view，不发布增量假设。
5. 在新建 `packages/session/projection-cache` 中实现 checkpoint row：`sessionId + key + stateVersion + throughJournalSeq + detached value`。Cache package 可以依赖 projection framework 和 Persistence contract，不能让 projection framework 反向依赖 Provider。
6. 实现 cold restore：从 checkpoint 的 restore floor 读取 Journal tail，按 version、watermark、baseSeq 和 Journal end 校验；cache 过期、版本不匹配或 Journal 缩短时从 seq 0 重建。
7. 将 cache 写回绑定到 `turn/end` 和 Session dispose 的 durability point。cache 写失败只写 diagnostics，不阻止 Journal append 或 Session close。
8. 增加 concurrent Session、late registration、duplicate key、stateVersion bump、通知丢失、tail gap、crash-repair shrink、cache corruption 和 provider read failure 测试。

## 验收标准

- Registry 只有一份 Session event subscription，projection definition 不自行订阅事件。
- `@actspace/session-projection` 只依赖 Journal 和 detached types；`@actspace/session-projection-cache` 才依赖 Persistence contract。
- Snapshot 的所有值反映同一个 `throughJournalSeq`；缺失可选 unit 表示 capability absence。
- cache 删除后，cold restore 与 live replay 生成等价 view。
- `stateVersion` 不匹配不会 forward-apply 旧 state；Journal 缩短不会返回过期 cache。
- cache 和 change feed 失败不改变 Journal 事实，核心 projection 失败按 fail-closed 规则暴露 diagnostic。
- 两个 Session 的 watermark、cells、change 和 cache row 互不串线。
- `pnpm --filter @actspace/session-projection typecheck` 和 `test` 通过。

## 定向验证

```bash
pnpm --filter @actspace/session-projection typecheck
pnpm --filter @actspace/session-projection test
pnpm --filter @actspace/session-persistence typecheck
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/session-jsonl test
pnpm run check:packages
```

## 回退

回退只移除 Registry/Cache adapter、`@actspace/session-projection-cache` package 和 service wiring，保留 P00 的纯 projector、Session Journal 和 JSONL Provider。不得恢复每个领域私自订阅 `session/event`，也不得把 Desktop 临时 state 当作 cache 替代品。

## 交接给 P02/P03/P2

必须提供：

- Registry public methods 和生命周期语义；
- `@actspace/session-projection` 与 `@actspace/session-projection-cache` 的依赖方向；
- snapshot/change/checkpoint/cold restore types；
- 每个核心 projection 的 key、stateVersion、schema 和 owner；
- `throughJournalSeq` 的推进规则；
- cache failure、gap repair 和 unknown event 的 diagnostics codes；
- 定向测试结果和可删除 cache 的 parity 证据。

## 进度记录

- [ ] 实现 projection definition registry。
- [ ] 实现 per-session cells 和统一 watermark snapshot。
- [ ] 实现 change feed、checkpoint、restore floor 和 cold restore。
- [ ] 完成 cache failure、gap、version 和并发 Session 测试。
- [ ] 完成定向验证并交接。

## 执行模式

交互模式。P01 触及 Session 读取一致性和可恢复 cache，但不改变用户 Journal；每一步都应先通过纯 replay 和 failure tests，再接入生产 Service。
