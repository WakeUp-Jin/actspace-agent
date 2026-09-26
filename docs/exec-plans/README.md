# 执行计划

这个目录保存需要跨多轮推进、具有明确依赖或需要验收留痕的执行计划。`active/` 必须只反映当前仍可继续执行的工作，不承担历史归档职责。

## 生命周期

- `active/`：仍有明确下一步、责任边界和验证方式的计划。
- `completed/`：实现已经完成；尚未执行的人工验收边界可以保留在计划中，但不能因此长期占用 `active/`。
- `discarded/`：已经失效、被后续方案取代或不再采用，但仍值得保留决策上下文的计划。
- `templates/`：新计划模板。
- `tech-debt-tracker.md`：暂不立项、但需要持续跟踪的技术债。

具体维护规则见 `docs/PLANS_GUIDE.md`。

## 当前进行中

| 计划 | 当前状态与下一步 |
|---|---|
| [官网首页改版与全站轻量统一](active/20260926-site-homepage-redesign.md) | T1–T9、T11 已完成（check/test/build 通过，四宽度截图对照）；只剩 T10：用户重拍 `context-detail.png` 后替换并移入 completed。 |
| [会话切换与后台运行](active/20260916-session-background-runs.md) | 按会话隔离 stream、后台工具状态与历史校准，补切换回归与桌面验收。 |
| [自定义模型推理能力](active/20260912-custom-model-reasoning.md) | 实施 shared 契约、设置入口与协议回归。 |
| [Cordis 事件 ABI 与 CLI 最终验收](active/20260829-actspace-cordis-event-abi-final-acceptance/README.md) | P00–P04 有通过证据；补 P05 deterministic retry/error fixture 后再闭环。 |
| [P1/P2 契约与组合](active/20260829-actspace-p1-p2-contract-and-composition/README.md) | contract slices 已交付；G1 跨包回归、P2/G2 语义门禁继续。 |
| [P1-A Session Core / Persistence](active/20260829-actspace-p1-session-core-persistence/README.md) | contract 与事件行为已交付；下一步独立迁移物理 `session-core` 包和 consumer imports。 |
| [P1-B Service 三层](active/20260829-actspace-p1-service-roles/README.md) | slice 已交付；全域 Provider/Consumer 收口待完成。 |
| [P1-C Profile / Bundle / Patch](active/20260829-actspace-p1-profile-bundle-patch/README.md) | schema/digest/transport 已交付；restart-only、失败清理及 one-shot 回归待完成。 |
| [P2 Contract Matrix](active/20260829-actspace-p2-contract-matrix/README.md) | 字节漂移检查已恢复通过；语义 validator 与负向 fixtures 未完整交付，不能归档。 |
| [前端基础组件](active/frontend-ui-components-foundation.md) | Button / IconButton 已由设计 token 收口计划完成；剩 DropdownMenu、Switch、Textarea、Tabs 及对应迁移。 |

2026-09-09 [逐项复核与设计合并清单](../exec-runs/20260908-docs-v1-archive-v2-refresh/followup-audit.md)：初始 10 个 active 入口逐项复核；中文界面任务自行归档后，Context 补齐全仓回归也进入 completed，当前剩余 8 个入口。P2 按语义检查缺口保留 active。

## 最近完成

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

- [Session 事件持久化与检查点重构](completed/20260920-session-event-persistence/README.md)：accepted/durable 分离、persistence coordinator、必需 checkpoint policy 和生命周期通知已实施；物理 `session-core` 包迁移仍由 P1-A 跟踪。

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


- [Docs v1 归档与 v2 原位校准](completed/20260908-docs-v1-archive-v2-refresh.md)：50 个 v1 文件移动、3 份完整稿归档；v2 原位更新，文档门禁扩展。

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
- Kairos 默认隐藏与功能门控：`completed/20260808-kairos-feature-gate.md`
- Actspace 本地明文凭据存储迁移：`completed/20260802-local-plaintext-credential-storage.md`
- 分析观测会话索引：`completed/20260801-analysis-session-index.md`
- 全局快捷唤起：`completed/20260801-global-quick-open-shortcut.md`
- Environment 分支选择与创建：`completed/20260801-environment-branch-selector.md`
- 分析观测与工作台交互收口：`completed/20260801-analysis-observability-ui-polish.md`
- Agent 图片分析工具：`completed/20260801-image-inspection-tool.md`
- Agent 分析观测生产页面：`completed/20260730-agent-analysis-observability-page.md`
- 文档计划生命周期清理：`completed/20260801-docs-exec-plan-lifecycle-cleanup.md`
- 本地 Agent CLI 与 host-neutral runtime：`completed/20260731-agent-runtime-desktop-cli.md`
- DeepSeek OpenAI Thinking：`completed/20260731-deepseek-openai-thinking-effort.md`
- 终端启动与关闭可靠性：`completed/20260731-terminal-startup-shutdown-reliability.md`
- Review Workbench：`completed/20260730-review-workbench/README.md`
- 右侧面板终端：`completed/20260730-right-panel-terminal/README.md`
- Composer Slash 菜单：`completed/20260730-composer-slash-command-menu.md`

更早的完成记录直接从 `completed/` 按日期或主题检索，不在本页重复维护完整清单。

## 已丢弃或被替代

- [早期 Session 持久化与投影计划](discarded/20260830-actspace-session-persistence-projection/README.md)：2026-09-21 生产切换计划已替代剩余实施路径；保留原契约和验收证据。

- [DSH-native 旧重定向](discarded/20260829-actspace-dsh-native-plugin-runtime/README.md)：无独立任务，当前入口为 Profile-first。

- 旧版 Agent 工具能力总计划：`discarded/20260527-agent-tool-capabilities.md`
- 已失效的基础 Bug 人工验收计划：`discarded/开发者手动验收-20260529-bugfix-foundation-manual-acceptance.md`
- 基于 v1 SessionEvent / ToolScheduler 的 Agent Team V1：`discarded/20260711-agent-team/README.md`
- 基于 v1 `session.jsonl` 的 Bash 会话级动态 allowlist：`discarded/Bash工具和工具权限调度开发计划/README.md`

每份 discarded plan 顶部都应说明丢弃日期、原因和替代入口。
