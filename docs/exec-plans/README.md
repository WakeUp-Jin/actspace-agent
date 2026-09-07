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

- ActSpace Profile-first Runtime 精简与 RuntimeHandle 删除（实现完成；真实宿主门禁待执行）：`active/20260830-actspace-profile-first-runtime-simplification/README.md`

- ActSpace 设置中心重构（P0-P5 已交付，P6 人工验收与交付收口）：`active/20260830-actspace-settings-center-refactor/README.md`

- ActSpace 模型设置页面 Maka 风格重做（文档已确认，模型页面实施中）：`active/20260901-actspace-model-settings-maka-redesign/README.md`

- ActSpace Session 持久化事实源与投影收敛（P00/P01 完成候选，P02/P03 基础契约执行中）：`active/20260830-actspace-session-persistence-projection/README.md`

- ActSpace Context 面板与模型能力事实收敛（设计文档已建立，P00/P01 待实施）：`active/20260901-actspace-context-model-facts/README.md`


- ActSpace Cordis 事件 ABI 与 CLI run 最终验收计划（待主 Agent 执行）：`active/20260829-actspace-cordis-event-abi-final-acceptance/README.md`
- ActSpace P0 Agent Scope 模型重构（完成候选，待归档）：`active/20260829-actspace-agent-scope-model/README.md`
- ActSpace DSH Agent Loop / Session / Tool Shell 核心重构（完成候选，待归档）：`active/20260829-actspace-dsh-core-rebuild/README.md`
- ActSpace DSH 风格插件组装与 Agent 启动实现（完成候选，旧 composition 外壳待收口）：`active/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md`
- ActSpace P1/P2 Session、Service、Composition 与契约矩阵（已批准，待实施）：`active/20260829-actspace-p1-p2-contract-and-composition/README.md`
  - P1-A Session Core / Persistence：`active/20260829-actspace-p1-session-core-persistence/README.md`
  - P1-B Service Definition / Provider / Consumer：`active/20260829-actspace-p1-service-roles/README.md`
  - P1-C Profile / Bundle / Patch：`active/20260829-actspace-p1-profile-bundle-patch/README.md`
  - P2 Contract Matrix：`active/20260829-actspace-p2-contract-matrix/README.md`
- ActSpace Tool Name 全量切换（已完成）：`completed/20260829-actspace-tool-name-contract/README.md`
- DSH-native Plugin Runtime 旧草案重定向（不单独执行）：`active/20260829-actspace-dsh-native-plugin-runtime/README.md`
- ActSpace v2 插件化 Agent Runtime 完整交付：`active/20260822-actspace-v2-plugin-runtime/README.md`
- ActSpace v2 包拆分与真实插件包化：`active/20260824-actspace-v2-package-layout-and-plugin-packaging/README.md`
- 运行态反馈与图片预览回读修复：`active/20260801-running-feedback-and-attachment-rehydration.md`
- Composer 图片附件可用性修复：`active/20260801-composer-image-attachments.md`
- 前端 UI 组件基础：`active/frontend-ui-components-foundation.md`

## 最近完成

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

- 旧版 Agent 工具能力总计划：`discarded/20260527-agent-tool-capabilities.md`
- 已失效的基础 Bug 人工验收计划：`discarded/开发者手动验收-20260529-bugfix-foundation-manual-acceptance.md`
- 基于 v1 SessionEvent / ToolScheduler 的 Agent Team V1：`discarded/20260711-agent-team/README.md`
- 基于 v1 `session.jsonl` 的 Bash 会话级动态 allowlist：`discarded/Bash工具和工具权限调度开发计划/README.md`

每份 discarded plan 顶部都应说明丢弃日期、原因和替代入口。
