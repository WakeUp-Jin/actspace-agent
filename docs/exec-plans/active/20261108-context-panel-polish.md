# 上下文面板整理：事件有意义、明细分页并入「再显示」、去重复边框

## 目标

右侧「上下文」面板有四个问题，一次改完：
- 「上下文事件」只显示「注入 · 上下文补充」，看不出变了什么。
- 「加载更多明细（共 N 项）」按钮让人看不懂。
- Bash 卡片不好看。
- 面板边线、卡片边框、格子线叠在一起。

视觉以 [context-panel-polish-demo.html](../../design-docs/frontend/context-panel-polish-demo.html) 为准，规则写在 [front-Context面板规范](../../design-docs/frontend/front-Context面板规范.md) §2–§5。

## 范围

- 包含：
  - 后端事件投影：标题、说明、位置、增减，同轮合并。
  - 明细分页：非会话条目放首页，带每类总数。
  - 前端：边框换成方案 B；事件改列表样式；Bash 改成一行总览 + 展开子命令 + 只看失败；路径只保留平铺；去掉「加载更多明细」，并入「再显示」。
  - mock、测试、规范、历史记录。
- 不包含：
  - Bash 列出命令原文、跳到轨迹（用户选了只展开子命令）。
  - 路径按文件夹懒加载。
  - 子 Agent 的上下文。

## 背景

- 本地日志实测：补充事件只有 `actspace.context-disclosure/navigation`（120 条）和 `actspace.context-runtime/runtime-state`（5 条）。子 Agent、后台任务清单写法相同，补充全文都在事件里（`data.text`）。
- 投影代码：`apps/desktop/src/main/runtime-v2/context-history-projection.ts` 的 `projectContextEvents`；查询：`context-history-query.ts`；分页：`context-panel-service.ts` 的 `#page`。
- 改了投影口径，`CONTEXT_PROJECTOR_VERSION` 要加一，老会话第一次打开面板时自动重建，不需要迁移。

## 实施步骤

### 后端

- **B1 事件类型**：`ContextPanelEvent` 增加 `detail?: string`、`count?: number`、`source?`。`kind` 增加 `files` `runtime` `subagents` `background`；保留 `inject` 给其他补充。
- **B2 补充事件**：按 owner/id 映射到 kind 和标题。说明从 `data.text` 解析：
  - 文件清单：对比上一份清单，列出新增 / 移除的文件名和总数。
  - 运行状态：对比上一份的 mode。
  - 子 Agent / 后台：数运行中的条目，列出描述。
  - 增减 = 本条估算 − 同一 owner/id 上一条的估算，用 `describeSupplementEntry` 估算。
  - 每个 owner/id 的上一份文本和估算，存进 `context_estimate_state` 的折叠状态（字段 `supplementEvents`）。
- **B3 位置**：事件写入时记当前轮次和步数，取 `context_session_stats.turn_count`、`step_count`。`step/start` 的 `stepIndex` 已有，存进折叠状态里的 `currentStep`。
- **B4 压缩**：在 `compaction/start` 记下估算总量，到 `compaction/end` 时算出增减。标题「上下文已压缩」，说明「旧对话换成摘要」。
- **B5 工具 / 模型 / 模式**：
  - 工具：对比前后两份工具名单，写新增 / 移除，增减取工具分类前后之差。
  - 模型：写「旧 → 新」。
  - 模式：记上一个模式，写「旧 → 新」。
- **B6 同轮合并**：写入事件时，如果上一条事件是同一轮、同一 kind、同一 source（中间没有别的事件），就更新那一行：`count+1`，增减相加，位置只留轮，说明换成「本轮连续 N 次，合并显示；共 K 个」。
- **B7 版本**：`CONTEXT_PROJECTOR_VERSION` 改为 5，注释写清口径。
- **B8 明细分页**：
  - `#page` 先放非会话条目，再按新到旧放会话条目。首页 limit 不变，但保证非会话条目都在首页。
  - `entriesPage` 和 `ContextEntriesPage` 加 `bucketCounts`。

### 前端

- **F1 边框**：`CARD_CLASS` 改为 `border-t border-line px-0 first:border-t-0`；`ContextPanel` 的 `BODY_CLASS` 去掉 gap 和 padding。统计格、路径两格、Bash 三格都不画格线。
- **F2 事件**：`ContextEvents` 按规范 §2.6 渲染，标签按 kind 映射，右侧两行。
- **F3 Bash**：`ContextBash` 改成一行总览、值得注意（无底色无圆点）、按程序（子命令摘要、展开浅底子命令、只看失败）。`context-bash-model` 去掉 `percent`。
- **F4 路径**：去掉「按目录 / 平铺」，行内总是显示目录。`groupContextPaths` 和它的测试删掉。
- **F5 明细分页**：
  - 删掉面板底部的按钮。
  - `ContextConversationList` 的「再显示」：本地不够且还有下一页时，先 `loadMore` 再展开；读取中显示「正在读取…」。
  - 分类「N 项」和「共 N」用 `bucketCounts`。
- **F6 mock**：`context-panel-fixture.ts` 的事件改成新数据形状，覆盖各 kind、合并行、±0、null。

### 验证

- **V1 测试**：更新 `context-history-estimate.test.ts`，加事件标题、说明、位置、增减、合并的断言；更新 `context-bash.test.tsx`、`context-paths.test.tsx`、`context-panel.test.tsx`；分页加 `bucketCounts` 和非会话条目在首页的断言。
- **V2 检查**：`pnpm --filter @actspace/desktop exec tsc -b`、renderer 与 main 的 vitest、`check:docs`、`check:frontend-tokens`。
- **V3 浏览器 mock**：`?mock=long-session` 截图，看浅色、深色、360px 宽。
- **V4 Electron**：重启 `pnpm dev` 后打开真实会话，看事件、Bash、路径和翻页。这一步由用户做。

## 风险

- 事件投影改了口径，重建一次会读整份日志：只在第一次打开面板时发生，后台进行，和以前改版本一样。
- 解析补充文本依赖各插件的固定英文格式：解析不出来时退回「上下文补充」加 owner，不报错。
- 分页顺序变了，翻页游标要换：游标里带 query digest，旧游标会被拒绝，面板会自动重新读取。

## 决策记录

- 2026-11-08：用户在 demo 里选定边框 B、Bash「一行总览 + 展开子命令」、路径原样但只平铺、事件列表样式；同意去掉「加载更多明细」。

## 执行模式

交互模式。

## 进度

- 2026-11-08：B1–B8、F1–F6、V1–V3 完成，未提交，待用户 V4 Electron 复验。
  - 实现和计划的出入：
    - 折叠状态字段叫 `supplements`（不是 `supplementEvents`）。
    - 位置取 `turn/start`、`step/start` 的 `context_identity` 序号（不是 `context_session_stats` 计数），`turn/end` 后清空，所以轮间的模式切换没有位置。
    - 补充解析放在新文件 `context-history-events.ts`。
  - 检查：
    - tsc 通过；`check:docs`、`check:frontend-tokens` 通过；`native-button-baseline` 中 ContextBash 1→2（「只看失败」胶囊），ContextPaths 4→2。
    - desktop vitest 2803 通过、1 失败。失败的是 `turn-tail.test.tsx`「previews a deliverable in the right panel and reports a missing file」，用 git stash 回到改动前也失败，和本次无关。
  - 浏览器 mock：浅色、深色、窄屏截图都和 demo B 一致。`?mock=context-pagination` 的会话内容显示「643 项」，点「再显示」先出现「正在读取…」，再变成「再显示 20 项（共 643）」。
