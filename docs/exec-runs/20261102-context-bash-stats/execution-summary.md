# Context 面板 · Bash 命令统计 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261102-context-bash-stats.md`
- **执行过程**：`docs/exec-runs/20261102-context-bash-stats/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 真实 Host 未验证）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 读取契约 | `packages/util/shared/src/context-panel.ts` | `ContextPanelView.bash` 与三个类型 |
| 命令解析器 | `apps/desktop/src/main/runtime-v2/bash-programs.ts` | 从一条 Bash 命令拆出程序与子命令，规则见规范 §3.2 |
| 投影与查询 | `context-history-projection.ts`、`context-history-query.ts`、`context-history-version.ts` | 三张新表；投影版本 1→2；按 callId 去重；程序级失败单独计 |
| 老库补表与重建判断 | `usage-read-model-worker.ts`、`usage-read-model.ts` | 不升 `user_version`；Worker 打开时补表；版本不一致的会话整会话重建 |
| 组装 | `context-panel-service.ts` | `bash` 与 `stats` 同一出现条件 |
| 卡片 | `components/right-panel/context/ContextBash.tsx`、`context-bash-model.ts`、`ContextPanel.tsx` | 上下文事件之后的「Bash 命令」卡片 |
| mock 与基线 | `mock/context-panel-fixture.ts`、`scripts/native-button-baseline.json` | mock 数字与 demo 一致；展开行原生按钮 +1 |

## 人工验证指引

### 必须验证

1. **老会话第一次打开时补齐**
   - 验证方式：Electron 里打开一个以前用过 Bash 的会话，打开右侧「上下文」，等历史索引同步完成，滚到底部。
   - 预期结果：出现「Bash 命令」卡片；调用次数与该会话轨迹里 Bash 调用数一致（被拒绝的不算）；同步期间卡片不显示。

2. **新调用实时计入**
   - 验证方式：在会话里让 Agent 跑 `cat a.txt && cat b.txt`（文件不存在），再跑一次 `git status`，面板保持打开。
   - 预期结果：几秒内调用 +2、失败 +1；`cat` ×2 带「1 失败」；`git` 可展开看到 `status`。

### 建议验证

1. **深色主题与窄面板**
   - 验证方式：切深色主题；把右侧面板拖到最窄。
   - 预期结果：条形、失败红色可读；长程序名截断，悬停看全名。

## Agent 已完成的验证

- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop test`：265 个文件、2201 个用例通过（7 个跳过为原有）。之后只改了展开行底色与测试写法，相关 17 个用例复跑通过。
- 新增用例：解析器 42 个、投影与组装 9 个、卡片与模型 17 个。
- `pnpm check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`：通过。
- `pnpm check:docs`：除最后一步 `check:current-docs` 的 363 条已有失败（全部在 `docs/exec-runs/`，main 上相同）外全部通过；本次改动的文件没有新增失败。
- 浏览器 mock（`?mock=long-session`）：浅色、深色、展开 `git`、480px 窄窗截图与 demo 一致。
- 解析器用本机 177 条真实 Bash 命令抽查：归入「其他」5 次，都是确实不合法的写法。

## 已知风险和遗留事项

- 升级后每个老会话第一次打开上下文面板会整会话重建一次上下文历史，长会话会多等几秒（走现有分批进度显示）。
- 占比列（每行占所有程序出现次数的百分比）是 demo 里保留下来的，用户没有单独表态，如不需要可以直接去掉。
- 解析器只做统计；`foo() { ...; }` 这种函数定义会把 `foo` 记成程序，影响很小，未处理。

## 后续建议

- 做完上面两项 Electron 验证后在本摘要补记结果。
