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
| [自定义模型推理能力](active/20260912-custom-model-reasoning.md) | 实施 shared 契约、设置入口与协议回归。 |
| [Cordis 事件 ABI 与 CLI 最终验收](active/20260829-actspace-cordis-event-abi-final-acceptance/README.md) | P00–P04 有通过证据；补 P05 deterministic retry/error fixture 后再闭环。 |
| [P1/P2 契约与组合](active/20260829-actspace-p1-p2-contract-and-composition/README.md) | contract slices 已交付；G1 跨包回归、P2/G2 语义门禁继续。 |
| [P1-A Session Core / Persistence](active/20260829-actspace-p1-session-core-persistence/README.md) | slice 已交付；CLI persist/resume 独立验收与 G1 交接待完成。 |
| [P1-B Service 三层](active/20260829-actspace-p1-service-roles/README.md) | slice 已交付；全域 Provider/Consumer 收口待完成。 |
| [P1-C Profile / Bundle / Patch](active/20260829-actspace-p1-profile-bundle-patch/README.md) | schema/digest/transport 已交付；restart-only、失败清理及 one-shot 回归待完成。 |
| [P2 Contract Matrix](active/20260829-actspace-p2-contract-matrix/README.md) | 字节漂移检查已恢复通过；语义 validator 与负向 fixtures 未完整交付，不能归档。 |
| [Session 持久化与投影](active/20260830-actspace-session-persistence-projection/README.md) | 基础通道与首批消费者已落地；最终消息映射和集成验收待完成。 |
| [前端基础组件](active/frontend-ui-components-foundation.md) | 仍有组件抽取、迁移与验收工作。 |

2026-09-09 [逐项复核与设计合并清单](../exec-runs/20260908-docs-v1-archive-v2-refresh/followup-audit.md)：初始 10 个 active 入口逐项复核；中文界面任务自行归档后，Context 补齐全仓回归也进入 completed，当前剩余 8 个入口。P2 按语义检查缺口保留 active。

## 最近完成

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

- [DSH-native 旧重定向](discarded/20260829-actspace-dsh-native-plugin-runtime/README.md)：无独立任务，当前入口为 Profile-first。

- 旧版 Agent 工具能力总计划：`discarded/20260527-agent-tool-capabilities.md`
- 已失效的基础 Bug 人工验收计划：`discarded/开发者手动验收-20260529-bugfix-foundation-manual-acceptance.md`
- 基于 v1 SessionEvent / ToolScheduler 的 Agent Team V1：`discarded/20260711-agent-team/README.md`
- 基于 v1 `session.jsonl` 的 Bash 会话级动态 allowlist：`discarded/Bash工具和工具权限调度开发计划/README.md`

每份 discarded plan 顶部都应说明丢弃日期、原因和替代入口。
