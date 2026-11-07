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
| [性能第三轮：高频路径不再整份读日志](active/20261108-perf-round3.md) | 2026-11-07 立项，R1–R4 方案已拍板（自动审查、压缩摘要、子 Agent 面板、读旧事件深拷贝）；下一步按 spec → 代码执行。性能任务总表见 [性能待办](perf-backlog.md)。 |
| [上下文引擎不再每次请求复制对话](active/20261107-context-trusted-surface.md) | 2026-11-07 T1–T6 已实现并提交；run8 实测 `stateDigest` 239 → 87 MB、`toLlmInput` 156 → 31 MB；随 `fix/bug-batch-1104` 的 PR 合入。 |
| [流式 Markdown：尾部解析降频与解析器常驻](active/20261107-markdown-stream-throttle.md) | 2026-11-07 T1–T5 已实现并提交；run8 实测渲染进程 Markdown 约 722 → 48 MB；剩 Electron 看流式观感。 |
| [对话内容只存一份](active/20261107-surface-derived.md) | 2026-11-07 T1–T9 已实现并提交（cd0ff335）；79 个旧会话已按用户确认删除；run7/run8 已实机重跑；剩 Electron 功能验收。 |
| [流式输出只走实时通道](active/20261105-live-assistant-stream.md) | 2026-11-05 T1–T13 已实现并提交（c6538dd7），run2 实机内存对比已完成；§9 功能清单待用户确认。 |
| [请求记录只在变化时写完整内容](active/20261106-request-record.md) | 2026-11-06 T1–T11 已实现并提交（c6538dd7）；run4 日志 8.57 → 1.60 MB；剩 Electron 功能验收。 |
| [Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md) | 2026-10-07 立项（来源：17 的特征测试）；下一步由用户拍板 D1–D4，再开始执行。 |
| [Composer 文件引用与回复批注](active/20260928-composer-mentions-annotations/README.md) | P0、PA、PA2 已实施；PA2 真实 Electron 主要流程通过，边界项见实机逐项记录；PB 待实施。 |
| [前端基础组件](active/frontend-ui-components-foundation.md) | Button / IconButton / Tooltip / Menu / Popover / Dialog / Select 等已落地；只剩 Switch、Textarea、Tabs 三个基础组件及对应迁移。 |

## 本轮整理移入 completed 的计划（2026-11-04）

- [Harness 统计](completed/20261101-harness-stats.md)：T1–T12 已实现并合入 main；Electron 真实 Host 验收未验证。执行记录见[执行摘要](../exec-runs/20261101-harness-stats/execution-summary.md)。
- [自定义模型推理能力](completed/20260912-custom-model-reasoning.md)：已被[设置 › 模型重做](completed/20261021-model-provider-redesign.md)取代，不再推进。
- [Chrome 扩展连接、启动与使用体验闭环](completed/20260928-chrome-connect-experience.md)：随[功能减法](completed/20261101-feature-subtraction/README.md)暂停（浏览器改为可选插件，默认不加载）；A02–A16 实机验收未完成，恢复该功能时再重新立项。

## 已停止的本轮验收

2026-10-25 用户决定本轮验收到此为止，因暂时没有时间，未验证部分留待对外发版时完整验收。原 165 项中 104 项历史通过、61 项部分或未覆盖；52 个 Bug 中 51 个关闭，BUG-039 保留未关闭。两份旧验收/集中修复 active 计划退出执行入口，131 份过程文档合并为[唯一结算与未验证清单](../exec-runs/20261021-actspace-full-acceptance/execution-summary.md)，完整原文保存在清理前提交 `8dbc68a5`；不代表验收全部完成。

## 已完成

全部已完成计划的日期、标题和一句话见 [completed/README.md](completed/README.md)。最近几项：

- [卡顿与内存修复](completed/20261104-perf-jank-fix.md)：journal 增量续读与缓存（37MB 会话命中 633ms → 0.3ms）、空闲会话释放（常驻 3 个）、IPC 合并、渲染订阅隔离与懒加载；Electron 实机验收未做。
- [docs 整理：前端设计规范重建与冗余清理](completed/20261104-docs-reorg.md)：前端四份必读规范 + 区域规范路由表，设计文档唯一索引，exec-runs 与 learnings 去重，文档检查加严。
- [子智能体与后台任务改造](completed/20261103-subagent-background-redesign/README.md)：S1–S6 完成，合入 main 的 #32、#33；Electron 实机验收 23 点 17 通过、0 失败、6 部分覆盖。见[执行摘要](../exec-runs/20261103-subagent-background-redesign/execution-summary.md)。
- [Markdown 编辑与渲染](completed/20261102-md-render.md)：「文档」面板换成 CodeMirror 6 实时预览编辑器，聊天区 Markdown 重做；合入 main #31；Electron 验收 15 通过 / 0 失败 / 2 局部未覆盖。见[执行摘要](../exec-runs/20261102-md-render/execution-summary.md)。
- [Context 面板 · Bash 命令统计](completed/20261102-context-bash-stats.md)：合入 main #29；Electron 真实 Host 未验证。见[执行摘要](../exec-runs/20261102-context-bash-stats/execution-summary.md)。

早期后端计划（六个）已移出执行导航；独有目标与未完成项见[结算](../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)。
