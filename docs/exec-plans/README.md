# 执行计划

这个目录保存需要跨多轮推进、具有明确依赖或需要验收留痕的执行计划。`active/` 必须只反映当前仍可继续执行的工作，不承担历史归档职责。

## 生命周期

- `active/`：仍有明确下一步、责任边界和验证方式的计划。
- `completed/`：实现已经完成；尚未执行的人工验收边界可以保留在计划中，但不能因此长期占用 `active/`。
- `templates/`：新计划模板。
- `tech-debt-tracker.md`：暂不立项、但需要持续跟踪的技术债。

具体维护规则见 `docs/PLANS_GUIDE.md`。

## 当前进行中

| 计划 | 当前状态与下一步 |
|---|---|
| [左侧会话栏改版](active/20261015-sidebar-redesign.md) | 2026-10-15 Demo 认可后立项，交互模式；T1–T13 已实施（未提交，在默认工作区改动之上）；原生按钮基线已审批，只剩 Electron 手测。 |
| [内置 Harness 连续升级修复](active/20261014-harness-builtin-upgrade-fix.md) | 用户已批准；回归由红转绿，下一步真实 Electron 定向复验。 |
| [轨迹页对齐 DeepSeek Harness](active/20261014-trajectory-dsh-parity.md) | 2026-10-14 立项并开始执行 T1–T12；D1（停止进工具栏）、D2（supplement 显示为上下文行）按建议定案。 |
| [轨迹页流式拆分：定稿层与流式层](active/20261014-trajectory-streaming-split.md) | 2026-10-14 E1、T0–T6 完成，未提交：流式每帧 p95 24.83ms → 0.25ms，验收指标全部达到；剩用户验收和真实 Provider 流式检查，见[执行摘要](../exec-runs/20261014-trajectory-streaming-split/execution-summary.md)。 |
| [轮尾改动卡与交付文件卡](active/20261013-turn-deliverables-cards.md) | 2026-10-13 立项，照搬 DSH 的改动卡与 `present` 交付卡；T1–T10 完成，T11 只剩 Electron 实机验收（真实 `present`、Word/Excel 打开、Finder 定位）。 |
| [多智能体协作（Space）前端演示](active/20261007-multi-agent-collab-frontend-demo.md) | 2026-10-07 立项，分支 `feat/multi-agent-collab-fe`；只做前端、数据全 mock。下一步由用户拍板设计文档 §10 的 Q1–Q8，再开工 T1–T11。 |
| [Desktop settings 写入一致性修复](active/20261007-desktop-settings-write-consistency.md) | 2026-10-07 立项（来源：17 的特征测试）；下一步由用户拍板 D1–D4，再开始执行。 |
| [Composer 文件引用与回复批注](active/20260928-composer-mentions-annotations/README.md) | P0、PA、PA2 已实施；PA2 真实 Electron 主要流程通过，边界项见实机逐项记录；PB 待实施。 |
| [Chrome 扩展连接、启动与使用体验闭环](active/20260928-chrome-connect-experience.md) | 实施与自动化验证进行中；下一步完成制品核验、独立测试版实机安装授权后的 G1–G6 验收及缺陷修复。 |
| [官网首页改版与全站轻量统一](active/20260926-site-homepage-redesign.md) | T1–T9、T11 已完成（check/test/build 通过，四宽度截图对照）；只剩 T10：用户重拍 `context-detail.png` 后替换并移入 completed。 |
| [自定义模型推理能力](active/20260912-custom-model-reasoning.md) | 实施 shared 契约、设置入口与协议回归。 |
| [前端基础组件](active/frontend-ui-components-foundation.md) | Button / IconButton 已由设计 token 收口计划完成；DropdownMenu（及 Popover、Dialog、Select、ContextMenu）由 Desktop 前端重构 16 接手；剩 Switch、Textarea、Tabs 及对应迁移。 |
| [工具审批卡 · Cursor 式](active/20261011-approval-card-cursor-style/README.md) | 2026-10-11 前端实现与自动化验证完成；Bash 前缀授权[完整方案](active/20261011-approval-card-cursor-style/backend-bash-command-prefix-grant.md)已实现，见[执行摘要](../exec-runs/20261011-bash-command-prefix-grant/execution-summary.md)；后端和审批定向测试通过，桌面全量仍有 watcher 回归门槛；Electron 实机验收待做。 |
| [仓库文档与 `packages` 清理](active/20261011-repo-cleanup.md) | 2026-10-11 实现与自动化验证完成，待用户审阅清理边界和遗留项。 |

六个早期后端计划已移出执行导航，短页仅保留历史链接。独有目标与未完成项见[结算](../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)，当前验证见本轮清理摘要。

## 最近完成

- [main 新增功能与轨迹遗留项统一验收](completed/20261015-main-frontend-acceptance.md)：2026-10-16验收收束，60项53通过/5失败/2部分覆盖，4个Bug与O01观察完整交接；只验收未修复，见[摘要](../exec-runs/20261015-main-frontend-acceptance/execution-summary.md)与[台账](../exec-runs/20261015-main-frontend-acceptance/acceptance.md)。

- [默认工作区改为首次启动兜底](completed/20261015-default-workspace-first-run.md)：2026-10-15 实现与自动化验证完成（未提交，分支 `fix/session-default`）；只剩 Electron 实机验收，见[执行摘要](../exec-runs/20261015-default-workspace-first-run/execution-summary.md)。
- [Context 面板与 SQLite 联合实施](completed/20261011-context-sqlite-integration/README.md)：实现和本轮验收收尾，M/Small结果见报告；用户取消L剩余长测，保留测试失败及资源观察边界。
- [使用统计 SQLite 统一验收](completed/20261011-usage-sqlite-acceptance.md)：联合验收子计划同步收尾，已接受性能限制和未验证范围原样保留。

- [使用统计 SQLite 读模型与 Worker 实现](completed/20261011-usage-sqlite-read-model.md)：代码收口，保留未修缺陷和未通过性能门禁；统一验收由上方独立 active 计划接管，不能据此视为验收通过。
- [上下文管理引擎 V2](completed/20261011-context-management-engine-v2/README.md)：物理 Context 插件拆包、长期 Context、Runtime/Host/IPC Projection 接线与后端自动化完成；最终 `gpt-6.1-sol` Computer Use 验收保留 browse-only Session 导致的写入型路线未覆盖边界，见执行摘要。

- [Context 面板前端重做](completed/20261011-context-panel-frontend.md)：右侧 Context Tab 换成五区块面板（当前上下文、会话统计、明细对比、趋势、事件），会话内容点行跳轨迹；mock 先行，`describeContextPanel` main 暂返回 null 走过渡视图，待 Context 引擎 V2 实现。自动化通过，浏览器截图与 Electron 待人工验收，见[执行摘要](../exec-runs/20261011-context-panel-frontend/execution-summary.md)。

- [Desktop 前端重构](completed/20261005-desktop-frontend-refactor/00-总执行计划.md)：9 份计划（10–16、09、17）已全部执行并归档；各计划的 `acceptance-handoff.md` 保留待人工验收边界，设计文档在 `docs/desktop-frontend-refactor/`。

- [Desktop 验收问题 B03 / B08 / B12 修复](completed/20261007-desktop-acceptance-b03-b08-b12.md)：Review自动更新、搜索凭据即时生效、工作树首发与持久绑定已修复；真实Electron连续更新、同会话断开搜索和工作树冷重启复验通过。

- [Harness 自进化 V1](completed/20261007-harness-evolution-v1.md)：官方 Skill、Manager/HMR、会话局部版本与次消息生效已实现；自动化和制品验证通过，真实模型与桌面覆盖见[摘要](../exec-runs/20261007-harness-evolution-v1/execution-summary.md)。

- [上下文真实验收问题修复](completed/20261006-context-acceptance-bugfix.md)：原7项确认问题及新增启动锁问题已修复；227项定向测试、真实Electron和19次转换值复验通过，边界见[执行摘要](../exec-runs/20261006-context-acceptance-bugfix/execution-summary.md)。

- [上下文管理引擎](completed/20261006-context-management-engine/README.md)：P1–P4 实施完成，Context/来源/压缩/披露接线与自动化通过；首次桌面测试异步异常和真实模型未覆盖范围见[执行摘要](../exec-runs/20261006-context-management-engine/execution-summary.md)。

- [Agent 重构最终清理与验收](completed/20261005-agent-refactor-final-closeout/README.md)：代码、文档、根目录清理与自动化完成，35/35 界面验收通过；两项产品缺陷修复复验，保护记录与范围限制见[摘要](../exec-runs/20261005-agent-refactor-final-closeout/execution-summary.md)。

- [Agent 第二轮存储与代码清理](completed/20261004-agent-storage-and-cleanup/README.md)：实施完成；原剩余 UI 子项由 10-05 最终收尾逐项补验通过。
- [单一 Agent 形态与三种模式](completed/20260928-agent-forms-and-modes.md)：T1–T7 已实现；主要实机路线通过，T8 剩余验收见执行摘要。
- [会话切换与后台运行](completed/20260916-session-background-runs.md)：按会话隔离 stream、后台工具状态与历史校准，补切换回归与桌面验收。

- [Agent Harness 插件化与 Host 分离](completed/20261003-agent-harness-host-refactor/README.md)：P1–P5 实施与计划范围验收通过，P5 错误反馈修复经 Sol 实机复验；手机 Web、自进化具体工作流与真实云部署留待独立计划。见 [P5 摘要](../exec-runs/20261003-agent-harness-host-refactor/phase-5-summary.md)。

- [性能面板与会话投影优化](completed/20261001-performance-monitor-projection.md)：低频按需监控、历史批量折叠、上下文计算复用；自动化通过，人工验收和开销对比边界见[执行摘要](../exec-runs/20261001-performance-monitor-projection/execution-summary.md)。

- [压缩耗时与辅助模型路由修复](completed/20260930-compaction-duration-utility-fix.md)：真实摘要耗时持久化、utility 路由优先与旧 journal 兼容；98 项定向测试及真实 Electron 复验通过，见[修复报告](../exec-runs/20260930-compaction-duration-utility-fix/execution-summary.md)。

- [对话流里的上下文压缩](completed/20260929-context-compaction-timeline.md)：手动 `/compact` 与自动压缩共用一套中文 UI——进行中计时 + 不确定进度条、完成分隔线可展开摘要、失败红色分隔线可重试、无需压缩只在 Composer 提示；被压缩的旧消息继续显示，压缩中停止按钮置灰。自动化与 fixture 截图通过，Electron 验收见[执行摘要](../exec-runs/20260929-context-compaction-timeline/execution-summary.md)。

- [统一验收缺陷修复](completed/20260929-acceptance-bugfixes.md)：Chat工具拒绝结算、旧历史恢复、子会话检查点/读取/索引、字体预览、开发启动竞态与文件缓存隔离已修复，定向实机复验通过。

- [Tool 插件边界拆分与 Todo 领域迁移](completed/20260928-tool-plugin-boundaries.md)：七个独立工具插件与 Todo 领域事件、Projection Contributor、调用时 scope gate 和启动禁用已实现；全量测试与外部门禁边界见[执行摘要](../exec-runs/20260928-tool-plugin-boundaries/execution-summary.md)。

- [聊天 Mermaid 图表渲染](completed/20260928-chat-mermaid-diagrams.md)：闭合的 ` ```mermaid ` 渲染为固定 Codex 浅色图表，支持查看/复制源码、PNG 导出与缩放平移预览；源码按不可信输入处理（strict、剥离 init/click、DOMPurify）。自动化与浏览器 fixture 截图已通过，Electron 验收见执行摘要。

- [外观强调色](completed/20260928-accent-palette.md)：外观页新增默认 / 蓝 / 紫 / 粉 / 橙 5 个强调色，驱动发送按钮、开关开启态、焦点、链接、文字选中与分割线拖动；默认零变化，对比度由 `pnpm check:frontend-theme` 守住。单测与 fixture 截图通过，Electron 验收见执行摘要。

- [Desktop 构建提速](completed/20260926-desktop-build-speed.md)：依赖闭包去重、TypeScript 项目图增量构建、Client 与提示词监听；正式 Desktop 构建通过，typecheck 保留现有 Usage Statistics fixture 阻塞。

- [自定义服务与 Anthropic 连接流程重做](completed/20260926-custom-connection-setup-redesign.md)：目录合并为一条「自定义服务」，新增两步向导和只填 Key 的官方 Anthropic 页面；地址自动规范化，Anthropic 认证支持 x-api-key 和 Bearer 自动识别，计费支持按官方价折算；详情页逐项编辑，删除要确认。自动化与 fixture 截图已通过，Electron 验收和真实中转站测试见执行摘要。
- [前端设计 token 收口与视觉修复](completed/20260926-frontend-design-token-convergence.md)：字号、圆角、阴影、z-index、动效时长全部 token 化并由 `pnpm check:frontend-tokens` 防回流；修掉右上角孤立横线、设置页顶部空带，Composer 改 12px 无阴影、消息块与 Composer 对齐；新增 `Button` / `IconButton` 并迁移全部按钮。浏览器 fixture 快照与截图已验证，Electron 验收见执行摘要。

- [审批重载与 Chat fork 修复](completed/20260925-approval-reload-chat-fork-fixes.md)：恢复 pending 卡片与停止能力、统一 fork writer 生命周期、复制附件及替换引用；对应实机批次通过，完整权限/Chat 验收边界见摘要。

- [设置中心视觉重设计](completed/20260925-settings-visual-redesign.md)：统一内嵌分组与控件、即时保存与“已保存”提示，新增「能力 → 搜索」页，使用统计微调；自动化与 fixture 截图已通过，Electron 验收见执行摘要。

- [工具审批卡重设计](completed/20260925-approval-card-redesign.md)：5 类审批组件统一为一行审批条（读取/搜索/编辑/写入/删除）与底部按钮卡片（Bash/浏览器），共享部件与测试已完成；真实 Electron 验收见执行摘要。

- [Anthropic 自定义连接、手动模型与价格](completed/20260924-anthropic-custom-model-pricing.md)：Claude Code 常见的 Anthropic Messages 根地址、显式测试、短缓存开关、连接内手动模型与四类价格已完成；真实 Electron 点击和真实中转站缓存命中保留人工门禁。

- [主 Agent Chat 形态](completed/20260924-main-chat-form.md)：固定 Session preset、Chat 两工具、Prompt cache 动态尾部、首版附件与可调压缩阈值已实施；真实 Electron/Provider/本地文件与主题验收见执行摘要。

- [Desktop Session Scope Grant](completed/session-scope-grants.md)：Desktop 核心文件 exact/subtree Session Grant、Journal 恢复、Runtime 匹配、审批选择、管理与撤销已完成；真实 Electron 重启和三态主题矩阵保留人工验收。

- [Permission Runtime 基础切换](completed/permission-runtime-foundation.md)：`default/full-access`、结构化资源、once/deny、敏感边界、审批后复验、Session mode 与 Desktop/CLI Host 直接切换完成；后续 Desktop Session Grant 已独立交付。

- [Session 三类读模型统一](completed/20260922-session-three-read-models.md)：Canonical fold、三种 DTO/watermark、observation、Global Session/Usage Index、Window resource cap 和 Client target 收口已完成；大型 App UI fixture 门禁保留在执行摘要。

- [Session 投影一次性切换](completed/20260921-session-projection-cutover.md)：Host Registry、可删除 checkpoint 与 Client raw window 已接通，旧路径退役；自动化通过，Electron 缺失可执行文件的环境阻塞见执行摘要。

- [LLM Core Pi](completed/20260922-llm-core-pi.md)：M0–M4 的请求配置冻结、retry lease、Host prepare、pi-ai backend policy、replay envelope 和自动化验证已实施；真实 Provider、packaged Electron 与既有全仓基线失败保留在执行摘要。

- [Session 事件持久化与检查点重构](completed/20260920-session-event-persistence/README.md)：accepted/durable 分离、persistence coordinator、必需 checkpoint policy 和生命周期通知已实施；后续存储整体解耦见本轮清理，旧物理包迁移方案已替代。

- [官网功能展示与截图占位](completed/20260919-site-showcase.md)：六组滚动图文、35 张截图对应24篇文档40处占位与浅紫引用完成；真实素材待用户交付。

- [官网内容迁移与功能文档](completed/20260919-site-content-migration.md)：新增 4 篇原文、核对 37 张正文配图，按模块整理 27 页文档；22 处截图占位待人工补充。

- [Site 设计迁移](completed/20260919-site-design-migration.md)：正式 Astro site 接入已确认布局；博客 3:2 封面、折叠多选筛选。自动验证完成，视觉验收见执行摘要。

- [Context 与会话累计 Token](completed/20260916-context-and-session-tokens.md)：统一完整请求统计与压缩预计；顶部累计 Token 简约展示，自动验证通过，真实窗口边界见执行摘要。

- [消息流排版与工具摘要](completed/20260916-tool-stream-typography.md)：统一过程行、邻接间距和 Bash 摘要；自动验证已完成，真实桌面与主题矩阵边界见执行摘要。

- [只读子智能体与实时活动行](completed/20260915-readonly-subagents.md)：只读白名单、300 步收尾与事件驱动翻页卡片已实现，保留真实运行验收。

- [会话与长历史按需加载](completed/20260915-progressive-session-loading.md)：摘要和长消息真分页、大工具详情与轨迹按需；真实交互验收及并行改动的类型检查阻塞见执行摘要。

- [C 方案：工具流与子 Agent 消息布局](completed/20260913-c-tool-stream-layout.md)：Explored 归组、Thought 同组和紧凑 Agent/Explore 右侧详情入口已实现；真实 Electron 交互截图待人工验收。

- [工具进度、文件产物、模型目录与图片链路修复](completed/20260913-tool-artifact-provider-image-ux.md)：Write/Edit 变动行数、右侧文件打开、聊天代码块、Kimi 模型发现、Session Artifact 图片预览和 DeepSeek Files API 已完成；真实 Provider/Electron/截图门禁待人工验收。

- [工具结果交互与后台通知修复](completed/20260913-tool-result-interaction-fixes.md)：通知 provenance、结果 disclosure、Read 右侧打开、Explore 子 Agent 面板和图片错误归一化已完成；真实 Electron/Provider/截图门禁待人工验收。

- [工具输出引用与失败反馈](completed/20260912-tool-output-references.md)：大 Bash 输出回读、图片协议与失败恢复已修复；自动化通过，安装态与真实 Provider 验收待执行。

- [DeepSeek V4.1 Flash](completed/20260910-deepseek-v41-flash.md)：模型、目录、图片和价格实现完成；真实图片请求通过，完整设置交互与主题截图边界见摘要。

- [Context 模型事实](completed/20260901-actspace-context-model-facts/README.md)：2026-09-09 补齐全仓 typecheck/test；G1 通过，Electron/真实 Provider/截图 G2 仍保留人工验收。

- [日常主界面中文统一](completed/20260908-desktop-chinese-ui.md)：保留模式、思考档位和工具执行展示；renderer 验证与 Electron 主界面/设置检查完成，验证范围见摘要。



2026-09-08 生命周期整理：以下计划实现已完成，人工/宿主门禁仍保留在各自正文和执行摘要中。

- [图片附件](completed/20260801-composer-image-attachments.md)、[运行反馈与附件回读](completed/20260801-running-feedback-and-attachment-rehydration.md)。
- [v2 完整交付](completed/20260822-actspace-v2-plugin-runtime/README.md)、[包拆分](completed/20260824-actspace-v2-package-layout-and-plugin-packaging/README.md)。
- [Agent Scope](completed/20260829-actspace-agent-scope-model/README.md)、[DSH Core](completed/20260829-actspace-dsh-core-rebuild/README.md)、[插件组装与启动](completed/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md)。
- [Profile-first](completed/20260830-actspace-profile-first-runtime-simplification/README.md)、[设置中心](completed/20260830-actspace-settings-center-refactor/README.md)、[模型设置 Maka](completed/20260901-actspace-model-settings-maka-redesign/README.md)。

- [使用统计页面与费用更新](completed/20260906-actspace-usage-statistics/README.md)（P01–P04 实现完成，真实 Electron / Provider 门禁待验收）：中文与设置视觉统一、本地目录、费用来源修复及按需后台更新。

- [ActSpace 英语辅助学习插件](completed/20260906-actspace-english-learning/README.md)（代码已完成，Electron / MiniMax 实机验收待完成）：选定会话双语提示词注入、英文朗读、扩展控制和通用语音设置。

- Agent 工具体验与轨迹布局调整（实现与自动化完成，Electron/Provider 人工项见摘要）：`completed/20260906-agent-tool-experience/README.md`

- Agent 工具流式渲染修复（实现与自动化完成，Electron/Provider 人工项见摘要）：`completed/20260906-agent-tool-stream-rendering/README.md`

- ActSpace DSH 轨迹页面完整能力迁移（Phase 0–5 完成，真实 Projection/IPC 与隔离 Electron 验收通过）：`completed/20260905-actspace-dsh-trajectory-parity/README.md`

- ActSpace 会话内轨迹视图切换（标题行单按钮，中心 Chat/Trajectory 视图）：`completed/20260901-actspace-trajectory-session-view/README.md`

- ActSpace Cordis 原生事件 ABI 与 EventHub 退役（实现完成；真实 Provider/Desktop 为外部验收边界）：`completed/20260829-actspace-cordis-event-abi-and-eventhub-retirement/README.md`
- ActSpace DSH 风格 Runtime 全量插件组装（Phase 1–6 自动化实施完成；真实宿主门禁待验收）：`completed/20260829-actspace-dsh-runtime-full-plugin-composition/README.md`
- ActSpace 核心 Cordis Service 化与能力 seam（Phase 1–5 完成）：`completed/20260829-actspace-core-cordis-services/README.md`

- Agent Todo 工具 V1：`completed/20260808-agent-todo-tools.md`
- Actspace 本地明文凭据存储迁移：`completed/20260802-local-plaintext-credential-storage.md`
- 分析观测会话索引：`completed/20260801-analysis-session-index.md`
- 全局快捷唤起：`completed/20260801-global-quick-open-shortcut.md`
- Environment 分支选择与创建：`completed/20260801-environment-branch-selector.md`
- 分析观测与工作台交互收口：`completed/20260801-analysis-observability-ui-polish.md`
- Agent 图片分析工具：`completed/20260801-image-inspection-tool.md`
- Agent 分析观测生产页面：`completed/20260730-agent-analysis-observability-page.md`
- DeepSeek OpenAI Thinking：`completed/20260731-deepseek-openai-thinking-effort.md`
- 终端启动与关闭可靠性：`completed/20260731-terminal-startup-shutdown-reliability.md`
- Review Workbench：`completed/20260730-review-workbench/README.md`
- 右侧面板终端：`completed/20260730-right-panel-terminal/README.md`
- Composer Slash 菜单：`completed/20260730-composer-slash-command-menu.md`

更早的完成记录直接从 `completed/` 按日期或主题检索，不在本页重复维护完整清单。

## 本轮已完成

- [代码与文档清理](completed/20261004-agent-refactor-cleanup.md)：本批完成，保护 histories/learnings 和既有工作区修改。
