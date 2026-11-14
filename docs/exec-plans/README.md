# 执行计划

这个目录保存需要跨多轮推进、具有明确依赖或需要验收留痕的执行计划。`active/` 必须只反映当前仍可继续执行的工作，不承担历史归档职责。

## 生命周期

- `active/`：仍有明确下一步、责任边界和验证方式的计划。
- `completed/`：实现已经完成；尚未执行的人工验收边界可以保留在计划中，但不能因此长期占用 `active/`。索引见 [completed/README.md](completed/README.md)。
- `templates/`：新计划模板。
- `tech-debt-tracker.md`：暂不立项、但需要持续跟踪的技术债。
- `perf-backlog.md`：性能与内存优化任务总表，实机采样发现的热点先登记在这里。

具体维护规则见 `docs/PLANS_GUIDE.md`。

## 当前进行中

| 计划 | 当前状态与下一步 |
|---|---|
| [代码库审查修复：工具结果体积上限、CI 门禁与中低优先级修复](active/20261110-codebase-review-fixes.md) | 2026-11-10 立项并开始执行（夜间模式）。8 个按顺序合并的 PR：CI 门禁、工具结果体积上限、修复合集、Loop 请求路径、路径安全模块、类型安全、命名、格式化；进度见计划的「进度记录」。 |
| [脚本执行：bash 规则放宽、随包 Python、临时目录与提示词](active/20261109-script-execution.md) | 2026-11-09 设计拍板，T1–T9 已实现（分支 `cursor/script-execution-design-c53e`，待合入）；macOS / Windows 打包冒烟待下一次 `release.yml`。 |
| [App 装配层拆分](active/20261110-app-assembly-split.md) | 2026-11-10 立项，未开始。`App.tsx`（立项时 1670 行，2026-11-14 全量格式化后 2358 行，代码没有变）按 8 个职责拆成 `use-*` hook，App 只留装配（目标 ≤ 300 行），Context 字段与 `WorkbenchLayout` prop 不变。下一步：M1 侧边对话 + evict。 |
| [`@actspace/shared` 契约分层](active/20261109-shared-contract-split.md) | P1 已完成待合入：`ipc.ts` / `session.ts` 按主题拆成 `src/ipc/`、`src/session/`，`check:packages` 新增「后端包不得引用桌面 IPC 契约」规则；对外 API 不变。P2 / P3（子入口、按归属拆包）等 P1 与 #66 / #67 / #68 合入后评估。 |
| [CI 提速：拆 job 并行 + tsc -b 增量缓存](active/20261109-ci-speedup.md) | P1 `exclude` 修正与根脚本切 `tsc -b` 已落地；下一步拆 `ci.yml` 四个 job 加缓存，再做 desktop 分片。 |
| [Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md) | 待拍板：2026-10-07 立项（来源：Desktop 前端重构 17 的特征测试），D1–D4 一直未决定；再不推进就降级回 [技术债](tech-debt-tracker.md)。 |
| [Composer 文件引用与回复批注](active/20260928-composer-mentions-annotations/README.md) | P0、PA、PA2 已实施；PA2 真实 Electron 主要流程通过，边界项见实机逐项记录；PB（编辑器内 `@` 文件引用）待实施。 |
| [前端基础组件](active/20260926-frontend-ui-components-foundation.md) | Button / IconButton / Tooltip / Menu / Popover / Dialog / Select 等已落地；只剩 Switch、Textarea、Tabs 三个基础组件及对应迁移。 |

计划移入 `completed/` 的记录写在对应的 history 里，本页不保留整理流水。

## 已完成

全部已完成计划的日期、标题和一句话见 [completed/README.md](completed/README.md)。最近几项：

- [子智能体简化：临时上下文窗口 + 并入后台任务](completed/20261112-subagent-simplify.md)：默认同步、不续派，后台子智能体并入后台任务登记表，删四个管理工具和 `context-subagents`；Electron 实机检查未做。见[执行摘要](../exec-runs/20261112-subagent-simplify/execution-summary.md)。
- [简化思考过程](completed/20261111-thinking-compact.md)：设置「通用 › 对话显示 › 简化思考过程」（缺省开启），思考进行时固定一行 `Thinking 6s · 开头一句`，不展开正文；Electron 走查未做。见[执行摘要](../exec-runs/20261111-thinking-compact/execution-summary.md)。
- [字号规范落地：三层字号](completed/20261111-typography-scale.md)：界面 13 / 正文 15 / 标题 18，聊天正文去掉衬线，工具行和 Thinking 降到 13px，`check:frontend-tokens` 拦任意行高、非档位字重和样式文件里的字号字面量；Electron 实机检查未做。
- [后端插件包解耦：让 Harness 自进化不必改 core](completed/20261109-harness-plugin-decoupling.md)：P1–P4 随 #68 完成——工具自声明模式、形态由 manifest 推导、默认 Harness 按插件产出产物、上下文来源注册式（`context-assembly`）、文件 / Shell 实现迁入 Harness 树。
- [性能第三轮：高频路径不再整份读日志](completed/20261108-perf-round3.md)：自动审查、每次请求查压缩摘要、子 Agent 面板轮询都改成增量；读旧事件不再深拷贝；每项配 1k / 10k 规模测试，新增 `pnpm check:scale-tests`；实机采样对比未做。见[执行摘要](../exec-runs/20261108-perf-round3/execution-summary.md)。
- [CI 重新上线与桌面发布流水线](completed/20261108-ci-pipelines.md)：P1–P5 随 #48、#57、#58 合入；签名与自动更新留待单独立项。
- [pi-ai 1.5.0 与复用内置服务商](completed/20261108-pi-ai-builtin-providers.md)：按 Base URL 复用 pi-ai 内置服务商，代理改走请求级 fetch（#41）。
- [统计页重做（使用统计 + Harness 统计）](completed/20261107-stats-redesign.md)：两页按 demo 第 4 版重做，统计库 Schema 17 → 18（#38）。
- [编辑提问重发与空闲发送不进队列](completed/20261107-edit-resend-rewind.md)：从某一轮重来，`tasks.submit` 带 `rewind`（#36）。
- [性能第二轮三项](completed/20261107-surface-derived.md)：对话内容只存一份、[上下文引擎直接用日志视图](completed/20261107-context-trusted-surface.md)、[流式 Markdown 解析降频](completed/20261107-markdown-stream-throttle.md)，随 #35 合入。

早期后端计划（六个）已移出执行导航；独有目标与未完成项见[结算](../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)。
