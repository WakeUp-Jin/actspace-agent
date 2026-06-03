# 设计文档索引

`docs/design-docs/` 集中管理长期架构设计、产品设计和重要设计决策。这个目录采用扁平结构：正式设计文档只放在当前目录一层，专题归属由文件名前缀表达。

## 目录规则

- `core-*`：跨端、跨包的基础原则和运行边界。
- `agent-*`：Agent Runtime、工具、上下文、权限、Kairos 等后端/运行层设计。
- `front-*`：桌面端 renderer、交互、视觉、组件和页面设计。
- `lab-*`：Lab 能力实验台的产品、运行时和版本路线设计。
- `public/`：图片、HTML prototype 等资产目录；正式 `.md` 设计文档不放进 `public/`。

新增设计文档时，优先选一个稳定前缀并保持一题一文。不要再新增 `agent-core/`、`frontend-ui/`、`lab/` 这类专题子目录；需要渐进式披露时，先从本索引或对应 `*-index.md` 进入。

## 推荐入口

- `core-beliefs.md`：Agent-first 的工作原则和模板设计出发点。
- `core-storage-and-observability.md`：本地 session 存储、`context-state.json`、Electron `userData`、workspace root 和本地排障日志边界。
- `agent-index.md`：Agent Runtime 专题入口。
- `front-index.md`：桌面端前端设计专题入口。
- `lab-index.md`：Lab 能力实验台专题入口。
- `docs/references/llm-agent-dev-skill-fixes/README.md`：`llm-agent-dev` Skill 修复分析归档。

## Agent

- `agent-backend-design.md`：后端 Agent Runtime 的总体设计事实来源。
- `agent-turn-layers.md`：Agent Turn 四层职责规范（Renderer -> Main Process -> Bridge -> Agent）。
- `agent-current-module-map.md`：当前 `packages/agent-core` 已落地模块地图。
- `agent-testing.md`：后端 Agent 测试策略、目录约定和覆盖范围。
- `agent-token-usage-and-context-state.md`：token usage、成本统计、context snapshot 与 context state 的数据分层设计。
- `agent-context-compression.md`：上下文压缩设计。
- `agent-skill-loading.md`：Agent Skill 设计与加载规范，包括目录生态、渐进式披露、catalog 注入和 `read_file` 正文读取边界。
- `agent-cache-loss-audit.md`：缓存失效排查设计。
- `agent-subagent-runtime.md`：Agent 工具与 SubAgent run 设计，约束子智能体上下文隔离、transcript、只读 Explore 子智能体和前端执行流展示。
- `agent-tool-preview-design-guidelines.md`：新增工具必须遵守的前端预览契约。
- `agent-subprocess-runner-guidelines.md`：agent-core 内部受控子进程调用规范。
- `agent-权限设计规则和原则.md`：Agent 工具权限、用户审核、风险分层和权限记录的设计规则。
- `agent-tool-approval-pause-resume.md`：工具审核暂停恢复设计。
- `agent-bash-policy-allowlist-design.md`：Bash 全局执行策略、会话级 allowlist 和真沙箱路线图。
- `agent-deepseek-kimi-hybrid-capabilities.md`：DeepSeek 主模型与 Kimi 辅助能力的混合接入边界。
- `agent-kairos-autonomous-mode.md`：Kairos 自治模式设计。

## Front

- `front-前端设计文档.md`：前端总目标、布局原则、消息语法和输入区原则。
- `front-全局视觉语言规范.md`：全局字体、颜色、间距、圆角、阴影和动效 token。
- `front-主题与配色规范.md`：三态主题机制与颜色硬约束。
- `front-tailwind-style-architecture.md`：Tailwind v4 样式架构和迁移策略。
- `front-基础组件封装规范.md`：基础 UI wrapper 分层和组件抽象边界。
- `front-工作台布局与面板交互规范.md`：SplitView、面板 resize、collapse 和 restore。
- `front-左侧会话栏规范.md`：左侧会话栏、Pinned / Scheduled / Workspaces 分区规则。
- `front-中间消息区规范.md`：消息语法、工具流和消息区可视状态。
- `front-聊天输入框规范.md`：Composer、模式、模型、附件、Context 弹窗和发送。
- `front-右侧面板与文件渲染规范.md`：右侧文件预览、Workspace 文件树、Markdown / HTML / Context / Reply HTML、diff 和对象区渲染。
- `front-设置页规范.md`：设置态布局、导航分组和聊天态切换规则。
- `front-Kairos监控页规范.md`：Kairos 监控页信息架构、上下文 Sheet 和聊天态右侧 compact view。
- `front-usage-statistics.md`：Usage Statistics 页面布局、组件、数据来源和视觉规范。

## Lab

- `lab-product-design.md`：Lab North Star、产品定位、实验生命周期、核心数据模型、晋升评审和安全原则。
- `lab-ui-experience.md`：实验矩阵页面的信息架构和交互原则。
- `lab-frontend-page-design.md`：Lab 首页和弹窗页面规范。
- `lab-implementation-progress.md`：Lab 当前设计执行进度。
- `lab-runtime-architecture.md`：Lab Runtime 与 Main Agent、Kairos、ToolManager 和 registry 的关系。
- `lab-versions-index.md`：Lab V0-V3 渐进式构建路线和分版本范围。
