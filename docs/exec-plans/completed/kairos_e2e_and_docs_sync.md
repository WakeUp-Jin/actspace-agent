# Kairos 端到端验证与文档同步

## 目标

收尾 Kairos 项目：

- 跑一整套端到端验证场景（实机 Electron + 浏览器 mock），证明前 6 份 plan 装配后行为符合设计文档。
- 把 Kairos 的最终模块布局、IPC 契约、配置文件、事件流、调度规则、压缩策略 **完整反向同步**到 `docs/design-docs/agent-current-module-map.md`、`docs/design-docs/core-storage-and-observability.md`（如有）、`docs/QUALITY_SCORE.md` 与 `docs/exec-plans/README.md`。
- 把所有 Kairos plan 从 `active/` 移到 `completed/`，写一条覆盖整个项目的总结 history。
- 评估是否命中 `docs/learnings/WRITING_GUIDE.md` 标准并按需新建 learning。

## 范围

- 包含：
  - 端到端测试场景的设计与执行记录（写入 history）
  - `docs/design-docs/agent-current-module-map.md` 增补 Kairos 章节
  - `docs/design-docs/core-storage-and-observability.md` 增补 Kairos 存储 + observe（如该文件不存在，则在 `kairos-autonomous-mode.md` 末尾补一份"实测目录树"）
  - `docs/QUALITY_SCORE.md` 评分更新（如 Kairos 项目质量影响整体评分）
  - `docs/exec-plans/README.md` 更新（把 7 份 Kairos plan 移到 completed 列表，从 active 列表删除）
  - `docs/histories/<month>/<timestamp>-kairos-project-summary.md`
  - 视情况新增 `docs/learnings/YYYY-MM/<topic>.md`
- 不包含：
  - 任何业务代码改动（只允许端到端测试中发现 P0 bug 时回切到对应 plan 修复）
  - v2 功能（pin notes、外部数据接入、笔记编辑等）

## 依赖关系

- 依赖（必须前置完成且全部跑通自测）：
  - `kairos_shared_contracts`
  - `kairos_config_and_tool_guard`
  - `kairos_short_term_memory`
  - `kairos_observe_and_briefs`
  - `kairos_controller_runner`
  - `kairos_main_ipc_and_renderer`

## 必读

- `AGENTS.md`
- `docs/design-docs/agent-kairos-autonomous-mode.md` 全文（最终对照标准）
- `docs/FRONTEND_VERIFICATION.md`（实机验收规范）
- `docs/HISTORY_GUIDE.md`、`docs/learnings/WRITING_GUIDE.md`
- 前 6 份 Kairos plan 的"决策记录"章节（汇总到 history）

## 背景

- 关键约束：
  - 本 plan **不允许引入任何新模块**；只能修文档。
  - 实机验证必须跑在用户 macOS 环境，使用 `pnpm dev:log`，并将 `logs/latest-dev.log` 关键片段附在 history 中。
  - 端到端测试发现的 bug 必须 fix-then-merge 到对应 plan 的 history（不要把 fix 内容写在本 plan 的 history 里）。

## 端到端测试场景

设计 8 个场景（每个对应一组手工操作 + 期望观察项）：

1. **冷启动 → 第一次 tick**
   - 操作：删 `<userData>/kairos/` → 启动 dev → 打开 KairosPage → 点"开启" → 等 5s
   - 期望：`config/` 4 个文件自动落默认值 + `memory/short-term/<YYYY-MM>/<date>.jsonl` 出现 `kairos_tick_injected{trigger:"auto"}` 起的事件流；KairosPage 顶部状态切换 Sleeping(xxs)。
2. **用户中断 sleep → 主 Agent 跑完 → Kairos 5s 后恢复**
   - 操作：场景 1 后立刻在主 chat 发"早"；等 LLM 回完
   - 期望：jsonl 出现 `kairos_sleep_interrupted{reason:"user_message"}`；KairosPage 行 status=interrupted；约 5s 后下一个 tick；
   - 反例 check：主 Agent runTurn 期间 jsonl 不应产生新 Kairos 事件。
3. **brief 触发**
   - 操作：在 `briefs/tasks/` 写一个 cron="* * * * *"（每分钟）brief；reload UI
   - 期望：下一分钟内出现 `kairos_tick_injected{trigger:"brief", briefId}`；index.json 的 lastRun/nextRun 推进；UI Briefs Tab 显示该 brief 的 `lastRun` 更新。
4. **watch 检测变动**
   - 操作：把某个真实目录加进 `paths.json`（watch=true）→ 等下一次 tick → 在目录内新增一个 `.md` 文件 → 再等下一次 tick
   - 期望：第一次 tick 的 observation 段把所有现有文件列为 added（首次）；第二次 tick 的 observation 段 added 含新文件；watch-manifest 对应 hash json 同步更新。
5. **blocklist 拦截**
   - 操作：blocklist.paths 写 `["**/secret/**"]`；让 Kairos 调 `read_file("./secret/xxx")`（可用一份手工 brief 让 LLM 主动尝试）
   - 期望：tool_result(isError=true, content 提示 blocklist 命中)；jsonl 不出现该文件实际读取结果；KairosPage 详情面板显示拒绝原因。
6. **熔断**
   - 操作：把 LLM endpoint 改成不存在端口（或临时改 model id 为非法）→ 触发 5 次连续 tick 失败
   - 期望：state 变 cooldown，UI header 显示 cooldown；preferences 的 cooldownSec 后恢复 idle。
7. **压缩触发**
   - 操作：手动塞入 80% 上下文窗口的 short-term 数据 → 触发一次 tick 让 `estimateTokens()` 超阈值
   - 期望：tick 结束后异步 compressor 启动 → 几秒后 `memory/short-term/<YYYY-MM>/week_*.summary.md` 出现 → 下次 tick 加载顺序中该 week 区间走 summary 不再读原 jsonl。
8. **resetToday**
   - 操作：UI 点 reset_today
   - 期望：`<today>_001.jsonl` 创建；ring buffer 清空（UI 表格瞬时清空）；下一次 tick 内容仍写到 `_001.jsonl`。

每个场景必须附带：

- 操作步骤（精确到点击 / 输入命令）
- 期望（每条具体可观测：行号、文件内容片段、UI 截图描述、log 关键字）
- 实测结果（pass/fail + 关键证据）

## 文档同步任务

- [ ] **`current-module-map.md`**：增补 "## Kairos" 章节，列出 `packages/agent-core/src/kairos/` 全部子目录与职责，配一张依赖图（mermaid）。
- [ ] **`core-storage-and-observability.md`**（若不存在则新建）：增补 Kairos 存储目录树与运行可观测信号清单（IPC 通道、SessionEvent 4 个新 type、关键 log 行）。
- [ ] **`kairos-autonomous-mode.md` 顶部状态徽章**：从"设计中"改为"v1 已上线（YYYY-MM-DD）"，并在末尾补"实测目录树"。
- [ ] **`docs/QUALITY_SCORE.md`**：补一段 Kairos 模块质量评分（按现有评分维度），如必要更新整体分数。
- [ ] **`docs/exec-plans/README.md`**：
  - 把 7 份 Kairos plan 从（如果之前加进了）active 列表移到 completed 列表
  - 在 completed 列表内按依赖顺序列出
- [ ] **`docs/histories/<month>/<timestamp>-kairos-project-summary.md`**：
  - 时间线（7 个 plan 各自完成日期）
  - 关键决策合订（每份 plan 决策记录最重要 1–2 条）
  - 测试结果总览（前 6 份 plan 单测数量 + 本 plan 端到端 8 个场景结果）
  - 已知遗留与 v1.1 候选项
- [ ] **`docs/learnings/`**（按需）：
  - 候选 topic：「actspace 主 Agent + Kairos 共用 SessionEvent 的设计」「Kairos 调度的"尾递归 + 可中断 sleep"模式」「Kairos `callerAgent + extractPaths` 的工具访问隔离」
  - 如命中 `docs/learnings/WRITING_GUIDE.md` 标准（新概念 + 可迁移 + 有深度 / 有陷阱 / 有模式 中至少 2 条），按指南落一篇

## 任务拆分

- [ ] Step 1：跑端到端场景 1–8，每个场景在临时 issue 文档（暂存 `docs/exec-plans/active/kairos_e2e_and_docs_sync.notes.md`）记录证据；发现 P0 bug 时回切对应 plan 修复后再继续。
- [ ] Step 2：把临时 notes 合并进最终 history `docs/histories/<month>/<timestamp>-kairos-project-summary.md` 的"端到端验证"章节；删除 notes 临时文件。
- [ ] Step 3：更新 `current-module-map.md` Kairos 章节（含 mermaid 图）。
- [ ] Step 4：更新或新建 `core-storage-and-observability.md` Kairos 章节。
- [ ] Step 5：更新 `kairos-autonomous-mode.md` 顶部徽章 + 末尾"实测目录树"。
- [ ] Step 6：更新 `docs/QUALITY_SCORE.md`。
- [ ] Step 7：更新 `docs/exec-plans/README.md`，把 7 份 plan 移到 completed。
- [ ] Step 8：把 7 份 plan 物理移动 `git mv docs/exec-plans/active/kairos_*.md docs/exec-plans/completed/`。
- [ ] Step 9：评估学习沉淀是否命中标准，按需落 `docs/learnings/`。
- [ ] Step 10：提交一条 history 汇总；如有 learning 一并列入。

## 验证方式

- 命令：
  - `pnpm typecheck`（确保没人偷偷动代码）
  - `pnpm --filter @actspace/agent-core test` + `pnpm --filter @actspace/desktop test`（最终回归）
  - `pnpm dev:log` 实机端到端 8 个场景全跑过
- 手工检查：
  - 8 个场景全部 pass（任何一个 fail 不允许收尾）
  - 文档同步项 6 个全部完成
  - active/ 下不再有 `kairos_*.md`；completed/ 下出现 7 份
- 观测检查：
  - `git log --oneline -- docs/exec-plans/` 出现 plan 文件移动
  - `docs/QUALITY_SCORE.md` 中 Kairos 模块条目出现

## 风险

- 风险：端到端发现 P0 bug 时回切修复打散节奏。
- 缓解：本 plan 不限定单 PR 完成；允许"先 6 plan 单独 PR → 本 plan 再独立 PR"两次合入。bug 修复优先合入对应 plan 的 history。

- 风险：场景 6（熔断）触发条件不易稳定复现。
- 缓解：用临时 dev script 直接调 `controller.processor.injectTickThatFails()` 工具，避免靠改 LLM 端口手工模拟（如需新增 dev script，记到对应 plan history）。

- 风险：文档同步遗漏，前端/后端开发未来找不到 Kairos 模块边界。
- 缓解：自审清单——`current-module-map.md` + `core-storage-and-observability.md` + `kairos-autonomous-mode.md` 三处都更新；history 总结里列出所有相关文档链接。

## 决策记录

- 2026-05-27：把"文档同步"作为独立 plan 而不是合并到 plan 6。原因：实机 e2e 才是文档可信的前提；前 6 个 plan 任一未跑通 e2e 都不应锁文档。
- 2026-05-27：物理移动 plan 文件用 `git mv`。原因：保持 git 历史可追溯，便于未来"看哪份 plan 实施时间是 X"。
