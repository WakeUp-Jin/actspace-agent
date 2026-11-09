# 设计文档索引

`docs/design-docs/` 是设计文档的唯一索引：回答“为什么这么设计、边界在哪里、哪些方案被排除”。实施步骤在 `docs/exec-plans/`，外部资料与调研在 `docs/references/`，决策时间线在 `docs/histories/`。

## 目录规则

- `docs/design-docs/` 下最多一层专题目录；只有至少两份长期强关联、放在一起能降低查找成本的文档才建专题目录。
- 跨专题入口、基础原则和无法形成稳定专题的独立设计放在根层。
- 专题目录内保留 `agent-`、`front-` 文件名前缀。
- HTML 原型随所属专题放置，入口需说明用途；选定方向后结论写进规范，原型删除，需要时查 git 历史。
- 当前实现变化要同步设计文档，但不把实现流水账堆进设计入口；设计文档开头最多一行说明它管什么。

## 专题目录

| 目录 | 内容边界 | 入口 |
|---|---|---|
| `agent-plugin-runtime/` | v2 插件化 Runtime：总体架构、Profile / Bundle / Patch、Cordis 事件 ABI、包结构、Session 与 Tool 公共契约、Host 部署 | [README](agent-plugin-runtime/README.md)、[总体架构](agent-plugin-runtime/agent-target-overall-architecture.md) |
| `agent-runtime/` | Agent 形态与工作模式、Journal 观测数据契约、会话记录 Markdown、渐进式会话加载 | [形态与模式](agent-runtime/agent-forms-and-modes.md)、[观测模型](agent-runtime/agent-observability-trace-model.md) |
| `model-context/` | 多供应商、模型目录与费用、request snapshot、token usage、Context Projection | [多供应商](model-context/agent-multi-provider-llm.md)、[Context 模型事实](model-context/agent-context-model-facts-and-composer.md) |
| `上下文管理引擎设计/` | 上下文管理引擎 V2：生命周期、物理拆包、Step 增量更新、渐进式披露、压缩、Context 面板与 SQLite 联合设计 | [专题 README](上下文管理引擎设计/README.md)、[V2 设计](上下文管理引擎设计/上下文管理引擎V2/README.md) |
| `tool-system/` | Skill、Web / 图片工具、工具输出引用、工具预览契约、受控子进程、脚本执行 | [Skill 加载](tool-system/agent-skill-loading.md)、[工具预览契约](tool-system/agent-tool-preview-design-guidelines.md)、[脚本执行](tool-system/agent-script-execution.md) |
| `execution-safety/` | Tool Runtime、权限模式、审批、Grant、Bash 硬防线、沙箱 | [README](execution-safety/README.md) |
| `browser/` | Browser Bridge、ActSpace 集成与 canonical command | [入口](browser/agent-browser-use-index.md) |
| `collaboration/` | 子智能体、后台 Bash 任务、侧边对话 | [子智能体](collaboration/agent-subagent-runtime.md)、[后台任务](collaboration/agent-background-tasks.md)、[侧边对话](collaboration/side-chat-design.md) |
| `子智能体和后台任务设计规范/` | 子智能体与后台任务改造的设计决策与分项规范（模型可见文本、界面与设置） | [README](子智能体和后台任务设计规范/README.md) |
| `自进化的方案设计/` | Harness 自进化：V1 用户显式修改、下一条消息使用新版本；V2 失败触发与沙箱评估；Harness 统计 | [README](自进化的方案设计/README.md)、[V1 使用说明](自进化的方案设计/10-V1实现与使用说明.md)、[Harness 统计](自进化的方案设计/11-Harness统计设计.md) |
| `架构优化/` | 功能减法（什么属于 ActSpace）与插件结构（`packages/<能力>/<包>`、全局 / 会话插件、插件清单） | [README](架构优化/README.md) |
| `多智能体协作/` | Space 工作台、Actor 名册与一对一对话的产品与前端设计（只做前端演示，不是 v2 Runtime 事实） | [README](多智能体协作/README.md) |
| `frontend/` | 桌面端与 Web 客户端的视觉、组件、区域与页面规范 | 前端相关一律从 [frontend/README.md](frontend/README.md) 进入 |

## 根层文档

- [ActSpace 产品概念思路初稿](ActSpace产品概念思路初稿.md)：定位、信念“唯变所适，每一个问题都有它的空间”、Agent / 场景 / Actor / 名册 / 空间、意象与气质。
- [存储与可观测性边界](core-storage-and-observability.md)：本地存储、workspace root 和可观测性边界。
- [数据存储结构与职责](core-data-storage-design.md)：Session 数据包为唯一事实源；接纳与落盘写入、按用途读取、Q1–Q14 决策记录、运行态实现落点、SQLite 查询读模型与查询 Worker。
- [Review 设计规范](core-review-change-sources.md)：Git-first 只读 Review，覆盖五种 scope、结构化 diff、Review Options、刷新时机、Standard / capped 大 Diff 加载与虚拟渲染。
- 官网：内容归属与静态部署边界见 [apps/site/CONTENT_SOURCES.md](../../apps/site/CONTENT_SOURCES.md)，视觉规范见 [apps/site/DESIGN.md](../../apps/site/DESIGN.md)。

## v2 插件化 Runtime（agent-plugin-runtime）

- [Runtime 文档导航](agent-plugin-runtime/README.md)：研究证据、已确认目标、公共契约、条件采用门禁的总入口。
- [总体架构](agent-plugin-runtime/agent-target-overall-architecture.md)：v2 分层、启动流、单次任务流、Session 真相模型。
- [Runtime 与 Composition](agent-plugin-runtime/agent-target-runtime-architecture.md)：Profile / Bundle / Patch、生产启动类型、Host 与 shutdown 边界。
- [Agent Core](agent-plugin-runtime/agent-target-agent-core.md)：Host / Harness / Run 边界和核心不变量。
- [已确认决策总账](agent-plugin-runtime/agent-harness-host-refactor-decisions.md)：含 Cordis 采用范围、门禁与回退条件。
- [Profile / Bundle / Patch 分层](agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md)、[插件运行时 ABI](agent-plugin-runtime/agent-spec-plugin-runtime-abi.md)、[Cordis 事件 ABI 与 Agent Loop 插入面](agent-plugin-runtime/agent-spec-cordis-event-abi-and-eventhub-retirement.md)、[插件组装与 Agent 启动](agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md)。
- [包结构与插件打包](agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md)：包身份、服务接口与消费者、Plugin Entry。
- Session：[Session Core 与持久化分离](agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)、[Session 格式 v1](agent-plugin-runtime/agent-spec-session-format-v1.md)、[三类读模型](agent-plugin-runtime/agent-spec-runtime-projection.md)、[流式输出只走实时通道](agent-plugin-runtime/agent-spec-live-assistant-stream.md)（`assistant/chunk` 不持久化、实时底稿、每事件投影 / 校验 / IPC 开销约束）、[请求记录与上下文估算](agent-plugin-runtime/agent-spec-request-record.md)（提示词与工具变化才写、`request/context` 小快照、`contextEstimate` 投影与统一估算）、[上下文引擎不再每次请求复制对话](agent-plugin-runtime/agent-spec-context-trusted-surface.md)（日志交出的对话视图已信任、按版本号判断变化、`toLlmInput` 浅冻结）。
- Tool / Prompt：[Tool Runtime ABI](agent-plugin-runtime/agent-spec-tool-runtime-abi.md)、[Tool 插件边界与 Todo 领域事件](agent-plugin-runtime/agent-tool-plugin-boundaries.md)、[Prompt / Context 贡献者](agent-plugin-runtime/agent-spec-prompt-context-contributors.md)。
- [main Agent 与 Subagent 契约](agent-plugin-runtime/agent-spec-agent-and-subagent.md)、[Task / Run 生命周期](agent-plugin-runtime/agent-task-run-lifecycle.md)、[LLM Core Pi 收敛](agent-plugin-runtime/agent-llm-core-pi.md)、[契约矩阵生成](agent-plugin-runtime/agent-spec-contract-matrix-generation.md)、[测试分层](agent-plugin-runtime/agent-testing.md)。
- 其余契约：[Agent scope 模型](agent-plugin-runtime/agent-spec-agent-scope-model.md)、[DSH 事件模型](agent-plugin-runtime/agent-spec-dsh-event-model.md)、[工具名契约](agent-plugin-runtime/agent-spec-tool-name-contract.md)、[Tool Runtime 边界](agent-plugin-runtime/agent-spec-tool-runtime-boundary.md)、[LLM Adapter](agent-plugin-runtime/agent-target-llm-adapter.md)；[契约矩阵](agent-plugin-runtime/agent-contract-matrix.generated.md)由脚本生成，不手改。
- [Host 部署指南](agent-plugin-runtime/agent-host-guide.md)（含 `apps/web` 所连接的 Host）、[英语辅助学习插件](agent-plugin-runtime/agent-english-learning.md)（默认不加载）。

## 模型、上下文与工具

- [多供应商与 Host prepare](model-context/agent-multi-provider-llm.md)、[模型目录与使用费用](model-context/agent-model-catalog-and-usage-cost.md)、[token usage 与 Context 状态](model-context/agent-token-usage-and-context-state.md)。
- [渐进式会话加载](agent-runtime/agent-progressive-session-loading.md)：会话浏览按需加载。
- [会话记录 Markdown](agent-runtime/agent-session-transcript.md)：每个会话派生一份精简 `transcript.md`，Agent 据此读取历史会话，读取不弹审批。
- [编辑提问重发](agent-runtime/agent-edit-resend-rewind.md)：从某一轮重来，日志截到它之前（旧日志存档），停掉在跑的后台任务和子 Agent。
- [Skill 加载](tool-system/agent-skill-loading.md)、[Web 工具](tool-system/agent-web-tools.md)、[工具输出、文件引用与图片输入](tool-system/agent-tool-output-references.md)、[受控子进程](tool-system/agent-subprocess-runner-guidelines.md)、[图片检查工具](tool-system/agent-image-inspection-tool.md)、[图片生成工具](tool-system/agent-image-generation-tool.md)、[工具预览契约](tool-system/agent-tool-preview-design-guidelines.md)、[脚本执行](tool-system/agent-script-execution.md)。

## Browser Use

- [入口](browser/agent-browser-use-index.md)（含 Bridge、协议与安装）→ [集成设计](browser/agent-browser-use-integration-design.md) → [命令面](browser/agent-browser-use-command-surface.md) → [命令实现](browser/agent-browser-use-command-implementation.md)。

## 执行安全

- [Agent 工具权限模型](execution-safety/agent-tool-permission-model.md)：权限事实源；`default/auto-review/full-access`、结构化资源、once 与 Desktop 文件 Session Grant。
- [沙箱设计](execution-safety/agent-沙箱设计.md)：工具沙箱与评估沙箱，可替换的 Harness 插件（管理器 + 后端），macOS / Linux 用打包的 nono；含出沙箱与回退。
- [权限设计规则和原则](execution-safety/agent-权限设计规则和原则.md)：长期风险分层与审核原则。

## 阅读路线

- Agent Runtime：[总体架构](agent-plugin-runtime/agent-target-overall-architecture.md) → [Runtime 文档导航](agent-plugin-runtime/README.md) → [Task / Run 生命周期](agent-plugin-runtime/agent-task-run-lifecycle.md)；涉及 Journal 观测读[观测模型](agent-runtime/agent-observability-trace-model.md)；再按任务进入模型、工具、执行安全、Browser 或协作专题。
- 官网与公开内容：[CONTENT_SOURCES](../../apps/site/CONTENT_SOURCES.md) → `docs/releases/README.md`。
