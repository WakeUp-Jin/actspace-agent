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

- 运行态反馈与图片预览回读修复：`active/20260801-running-feedback-and-attachment-rehydration.md`
- Composer 图片附件可用性修复：`active/20260801-composer-image-attachments.md`
- Agent Team V1：`active/20260711-agent-team/README.md`
- Bash 会话级动态 allowlist：`active/Bash工具和工具权限调度开发计划/README.md`
- 前端 UI 组件基础：`active/frontend-ui-components-foundation.md`

## 最近完成

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

每份 discarded plan 顶部都应说明丢弃日期、原因和替代入口。
