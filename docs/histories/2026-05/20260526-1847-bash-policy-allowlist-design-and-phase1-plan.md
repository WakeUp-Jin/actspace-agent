# Bash 全局策略 + 动态 allowlist 三阶段路线设计与 Phase 1 plan

## 背景

延续 Bash intent 字段的工作，用户提出要继续"借鉴 Cursor 的全局策略选择器 + Allow 子命令拆分授权"。讨论后明确：

- 现在先不动代码，先把分阶段设计与可执行 Phase 1 plan 落档。
- Phase 1 范围：会话级动态 allowlist (A) + Allow 下拉的子命令拆分授权 (B)。
- Phase 2（全局执行策略选择器 C，去掉 Sandbox）与 Phase 3（真沙箱 D）作为未来项登记到 TODOLIST，不开 plan。
- allowlist 生命周期：会话级为主，提供"升级到用户配置"入口，与 Cursor 一致。

## 现状关键发现（驱动本次设计）

- `packages/agent-core/src/tools/scheduler.ts:174`：`allow_similar` 与 `approve_once` 走同一分支，**从未写入任何 allowlist**，按钮文案与实际行为不符。
- `packages/agent-core/src/tools/tools/bash/permissions.ts:18`：`UNSUPPORTED_SHELL_SYNTAX_RE` 拒绝 `|`，导致 `pnpm test | tail` 这类典型命令进不到审核流，Cursor 风格子命令拆分若不放开 `|` 等于关闭入口。
- `permissions.ts:208-220` 的 `isAllowedDevelopmentCommand` 硬编码，不可数据驱动。
- 全局策略字段在 env / session / preferences 任何一层都不存在；沙箱完全没有实现。

## 主要产出

- 新增设计文档：`docs/design-docs/agent-core/bash-policy-allowlist-design.md`
  - 定义 `BashAllowlistEntry` / `BashExecutionPolicy` / `BashAllowlistStore` 共享契约。
  - 阐明 A/B/C/D 四块能力的依赖关系。
  - 给出 D1-D5 五条关键决策（放开 `|`、升级入口形态、用户配置 JSON 结构、preset 与 store 关系、session 事件流）。
  - 三阶段路线表与排除方案清单。

- 新增 Phase 1 可执行 plan：`docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md`
  - 按代码位置组织 4 大改造区（shared / agent-core / main / renderer）。
  - 12 项有序任务粒度，每项给出文件路径与验证命令。
  - M1-M6 里程碑，含手动验收清单。
  - 决策记录复述设计文档中的 D1-D5，避免下游推进时再翻设计文档。

- 更新 `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
  - 计划列表新增第 5 行 `actspace-bash-session-allowlist-plan.md`（待执行）。
  - "相关设计文档"段统一指向 design.md + 权限设计规则 + 中间消息区规范。

- 更新 `docs/TODOLIST.md`
  - 状态总览表新增"会话级动态 allowlist + Allow 子命令拆分授权（A+B）"行，链接 design + plan。
  - 新增"未来：Bash 全局执行策略 + 真沙箱"段落，登记 Phase 2 / Phase 3 范围与触发条件。

## 关键决策

1. **放开 `|` 进入子命令拆分**，仍拒绝 `<` `>` `` ` `` `$()` `{}`。理由：管道是开发命令高频形态，拒绝它等于关闭 Cursor 风格的命令拆分入口；其它字符仍有注入风险。
2. **升级到用户配置的入口**放在 `BashApprovalBlock` 右上角 `⋯` 菜单内，主操作区只保留 Skip / Allow / Run。
3. **preset 不删除**，作为 `source: "preset"` 灌入 store；运行时只看 store，源码保留便于审计。
4. **scope=session 通过 session.jsonl 事件流持久化**（`bash_allowlist_added`），replay 时重建内存 store；scope=user 写 `~/.actspace/bash-allowlist.json`，结构含 `version: 1` 字段预留迁移。
5. **Phase 2 不提供 Sandbox 选项**，避免"看起来在隔离实际没隔离"的安全错觉。Sandbox 与 Phase 3 联动后才解锁。

## 不在本次范围

- 不写任何 TypeScript / TSX 代码。
- 不动 `scheduler.ts`、`permissions.ts`、`approval-registry.ts` 等实现文件。
- 不为 Phase 2 / Phase 3 单独写 plan 文档（待 Phase 1 完成后再细化）。

## 验证

- 文档通过 `PLANS_GUIDE` 的"plan 就绪检查"自审：无 `TBD` / `TODO` / `之后补充` 占位语；每个任务都有文件路径、修改目的、验证方式。
- README 列表与 TODOLIST 状态总览相互对齐。
- 设计文档与 Phase 1 plan 的 D1-D5 决策措辞一致。
