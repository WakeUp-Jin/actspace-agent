# 设计文档索引

用这个目录集中管理架构设计和产品设计文档。

建议约定：

- 一个主题一份文档。
- 每份文档写清当前状态和简短摘要。
- 关联引入它的 execution plan 或 spec。

## 文档列表

- `core-beliefs.md`
- `agent-core/backend-agent-design.md`
- `agent-core/index.md`
- `agent-core/agent-turn-layers.md`：Agent Turn 四层职责规范（Renderer → Main Process → Bridge → Agent），约束每层的输入输出和边界。
- `agent-core/current-module-map.md`：当前 `packages/agent-core` 已落地模块地图，记录 LLM、tools、context、engine、persistence、env 等实现清单。
- `agent-core/deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入设计，约束 provider、工具暴露、联网搜索和多模态能力边界。
- `agent-core/backend-agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。
- `agent-core/token-usage-and-context-state.md`：token usage、成本统计、轻量 context snapshot 与每会话 context-state 的数据分层设计。
- `agent-core/tool-preview-design-guidelines.md`：新增工具时必须遵守的前端预览契约。
- `agent-core/subprocess-runner-guidelines.md`：agent-core 内部受控子进程调用规范，约束 `rg` 等 CLI helper 的 timeout、退出码、输出裁剪和安全边界。
- `agent-core/权限设计规则和原则.md`：Agent 工具权限、用户审核、风险分层和权限记录的设计规则。
- `agent-core/tool-approval-pause-resume.md`：工具审核暂停恢复设计——Promise-based 暂停模型、PendingApprovalRegistry、会话边界规则。
- `agent-core/bash-policy-allowlist-design.md`：Bash 全局执行策略、会话级 allowlist、Allow 子命令拆分授权和真沙箱路线图。
- `agent-core/kairos-autonomous-mode.md`：Kairos 自治模式设计——独立 system prompt + 短期记忆、尾递归 tick 调度、与主 Agent 的打断协议、桌面端 IPC 契约和事件流页面规范。
- `lab/index.md`：Lab 能力实验台设计文档入口，定义实验矩阵、假说/实证/锻造/晋升生命周期和版本路线。
- `lab/lab-vision.md`：Lab North Star，定义 Agent 以实验方式增长长期能力的产品定位和最终形态。
- `lab/experiment-lifecycle.md`：一轮实验从创建、假说构建、实证验证、能力锻造到晋升评审的生命周期。
- `lab/data-model.md`：Experiment、Stage、Evidence、Artifact、Review 等 Lab 核心数据对象。
- `lab/ui-experience.md`：Lab 实验矩阵页面的信息架构、交互原则和前端设计入口。
- `lab/runtime-architecture.md`：Lab Runtime 与 Main Agent、Kairos、ToolManager、能力产物 registry 的关系。
- `lab/promotion-and-safety.md`：候选能力晋升、风险分层、沙箱、人工审批和失败实验保留原则。
- `lab/versions/README.md`：Lab V0-V3 渐进式构建路线。
- `storage-and-observability.md`：本地 session 存储、`context-state.json`、Electron `userData`、workspace root 和本地排障日志边界。
- `llm-agent-dev-skill-fix.md`：llm-agent-dev Skill 初始版本中发现的缺陷记录，用于后续统一修复。
- `frontend-ui/index.md`
- `frontend-ui/tailwind-style-architecture.md`：Tailwind v4 样式架构、全局样式边界、token 映射和迁移策略。
- `frontend-ui/前端设计文档.md`
- `frontend-ui/工作台布局与面板交互规范.md`
- `frontend-ui/左侧会话栏规范.md`
- `frontend-ui/中间消息区规范.md`
- `frontend-ui/聊天输入框规范.md`
- `frontend-ui/右侧面板与文件渲染规范.md`
- `frontend-ui/设置页规范.md`：设置态布局、导航分组和聊天态切换规则。
- `frontend-ui/Kairos监控页规范.md`：Kairos 监控页信息架构、运行轨迹、执行列表、统计区和详情区规范。
- `frontend-ui/usage-statistics/设计规范.md`：Usage Statistics 页面布局、组件、数据来源和视觉规范。
