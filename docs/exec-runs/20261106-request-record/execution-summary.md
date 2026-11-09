# 请求记录只在变化时写完整内容 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261106-request-record.md`
- **执行过程**：`docs/exec-runs/20261106-request-record/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成。自动化验证全部通过；实机对比（规范 §9）待用户删除旧会话后重跑。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 新增 `request/system-prompt`、`request/tools`，变化才写 | `session-journal/src/core-codecs.ts`、`invariant-validator.ts`、`agent-loop/src/loop.ts` | 每个请求内顺序为 header → 提示词 → 工具 → context，每种最多一条 |
| `request/context` 改为 schemaVersion 3 小快照 | `context-engine/src/request-snapshot.ts` | 不再存对话、提示词、工具和估算明细；删除裁剪逻辑 |
| 生效记录读取规则 | `shared/src/request-record.ts` | 取 seq 不大于该请求 `request/context` 的最近一条 |
| 统一估算 | `shared/src/token-estimate.ts` | `ceil(字数/4)`，每块 +4，每条消息 +4；面板、圆环、统计、压缩、容量检查共用 |
| 估算明细定义只有一份 | `shared/src/context-entries.ts`、`context-engine/src/content-manifest.ts` | 引擎和日志折叠用同一套分类和 key |
| 压缩替换带被替换估算 | `session-journal/src/compaction.ts`、`context-engine/src/compaction.ts` | `replacedTokens` 与 `estimatorVersion` 为必填 |
| `contextEstimate` 投影替代 `requestContext` | `shared/src/context-estimate.ts`、`runtime/src/projection/durable-session.ts` | 状态大小不随消息数增长；删除 `projectContextState` / `browseContextState` |
| 圆环、Web、面板只读投影 | `client/src/sessions/*`、`apps/web/src/sessions/session-observer.ts`、`context-panel-service.ts`、`WorkbenchLayout.tsx` | 删除 `describeContext` 轮询；对话明细按需现算 |
| SQLite 历史与 Harness 统计用同一折叠 | `context-history-projection.ts`、`harness-stats-projection.ts`、`usage-read-model-schema.ts` | 版本升级会重建派生库（见下文「数据与版本」） |
| 轨迹与历史窗口 | `trajectory/builder.ts`、`context-sections.ts`、`session-controller.ts`、`journal-cache.ts` | 系统行和 Schema 读生效记录；窗口带上起点前的记录 |
| disclosure | `context-disclosure/src/plugin.ts` | 改读提示词记录里的 `contributorProvenance` |

## 验证结果

- 根目录 `pnpm typecheck` 通过。
- **测试**：

  | 包 | 结果 |
  |---|---|
  | shared | 211 |
  | session-journal | 108 |
  | projection-cache | 14 |
  | session-projection | 25 |
  | session-persistence | 50 |
  | session-persistence-jsonl | 29 |
  | session-transcript | 16 |
  | context-engine | 27 |
  | context-disclosure | 25 |
  | context-compaction | 23 |
  | prompt | 9 |
  | agent-loop | 71 |
  | runtime | 117 |
  | agent-service | 71 |
  | client | 79 |
  | agent-host | 63 |
  | english-learning | 20 |
  | apps/web | 136 |
  | apps/desktop | 2744 |

  全部通过，只有原本就设为 skip 的用例跳过。
- **检查**：以下全部通过：
  - `check:current-docs`、`check:docs`；
  - `check:ipc-channels`、`check:renderer-bridge`；
  - `check:packages`、`test:contract-matrix`；
  - `check:harness-events`、`check:v2-legacy-removal`。
- **真实 Electron**：`verify-trajectory-electron.mjs`（临时数据目录，不调用模型）11 项检查全部通过，包括历史翻页和 Schema。截图里第一行是「初始系统提示词」，工具 Schema 取自 `request/tools`。

## 数据与版本

- **日志格式**：不兼容旧会话（规范 §8），旧会话由用户自行删除。
- **派生库**：`usage-read-model.sqlite` 的 `user_version` 从 16 升到 17，`CONTEXT_PROJECTOR_VERSION` 从 3 升到 4。首次启动会重建派生库，不修改日志。

## 人工验证指引

### 必须验证

1. **日志与内存对比（规范 §9）**
   - 验证方式：
     1. 删除旧会话；
     2. `ACTSPACE_INSPECT_MAIN=9229 pnpm dev`；
     3. 另开终端运行 `node tmp/heap/monitor.mjs tmp/heap/run3 --wait-new`；
     4. 在同一工作区问同一个问题。
   - 预期结果：
     - 日志总大小与 `request/context` 单条大小明显低于 run2（9.1 MB / 最大 440 KB）；
     - 两种新事件的条数等于提示词、工具实际变化的次数；
     - 原来 `requestContext` 的约 0.7 GB 分配消失。
2. **圆环与面板**
   - 验证方式：对话几轮后，看输入框圆环，再打开右侧「上下文」面板。
   - 预期结果：
     - 两处总数相同；
     - 分类、明细、对比上一次请求、趋势图正常；
     - 压缩后估算下降。
3. **轨迹**
   - 验证方式：在超过 20 轮的会话里打开轨迹并向前翻页。
   - 预期结果：系统行、工具 Schema、上下文增减记录都正常显示。

### 建议验证

- Harness 统计页的分类、技能、工具曝光有数据。
- 读取文件后，路径面板（disclosure）照常记录。
