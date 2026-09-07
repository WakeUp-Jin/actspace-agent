## [2026-09-06 22:37] | Task: 建立英语辅助学习设计与执行计划

### Execution Context

- Agent：Codex，当前主任务。
- Runtime：本地桌面工作区；本轮只修改文档。

### 用户诉求

将已有语音项目集成到 ActSpace，插件命名为「英语辅助学习」。开启后只向选定会话注入逐段英文/中文提示词，并只朗读英文；默认选择最新会话，MiniMax 配置放通用设置。用户要求先生成设计文档和执行计划。

### Changes Overview

- 建立设计文档，明确真实 Agent Scope 绑定、Session/subject 二次校验、请求快照一致性、英文提取、取消、队列、凭据和播放器责任。
- 建立单功能执行计划，列出文件范围、S1–S6 顺序任务、共享契约、自动化矩阵、真实 Electron/MiniMax 门禁和回退。
- 在设计总索引、插件专题、前端索引和计划总索引登记入口，均标记待实施。

### Design Intent

双语提示词和英文朗读属于同一个学习能力；沿用 Cordis 作用域干预和 Session commit 观察，不修改全局 Prompt、不建设外部 Hook 服务。文档准备与代码实施状态明确分开。

### Files Modified

- `docs/design-docs/agent-plugin-runtime/agent-english-learning.md`
- `docs/exec-plans/completed/20260906-actspace-english-learning/README.md`
- `docs/design-docs/index.md`
- `docs/design-docs/agent-plugin-runtime/README.md`
- `docs/design-docs/frontend/README.md`
- `docs/exec-plans/README.md`

本轮无代码实施，不生成预设的学习复盘；学习沉淀安排在实现与验证完成后。

### 验证

- `pnpm check:docs`：通过。
- `pnpm check:current-docs`：通过。
- 新文档相对链接、代码围栏、尾随空白和计划占位语检查：通过。
- 未运行代码测试、Electron 或真实 MiniMax 合成；本轮没有实现代码。


### 2026-09-07 实施补记

用户随后授权“开始执行”，本任务已完成代码实现：独立 `@actspace/english-learning` 插件、单主会话作用域注入、成功回答英文提取、MiniMax 队列、Desktop 临时音频播放、main-only 凭据、typed IPC、扩展控制及通用语音设置。原文档阶段记录保留为过程事实，当前状态以本补记和执行摘要为准。

核心变更：`packages/english-learning/`、shared 英语学习契约、DesktopApp Bundle / Runtime Loader 装配、Desktop settings-service / speech-playback / english-learning-ipc、renderer 英语学习卡片与语音分组。未改 AgentLoop 的业务路径，未迁移原语音项目密钥。

针对性插件 12 项、Runtime 5 项和 Desktop 新增 5 项通过，类型与构建通过；全量桌面超时项单独复测通过。根测试仍被其他任务两处工具测试深导入阻断。已看浏览器浅/深主题和窄面板，Electron 启动提前退出，实际 MiniMax 音频尚未验证。

详细结果与人工步骤：[执行摘要](../../exec-runs/20260906-actspace-english-learning/execution-summary.md)。本轮命中“可迁移、有陷阱、有模式”，生成[事件身份与组装结果](../../learnings/2026-09/20260907-event-subject-and-prompt-candidate.md)学习文档。

收尾复核：最新全量 build 因并行费用目录任务的 shared channel 尚未齐备而失败；本功能此前完整构建通过。当前工作区不能宣称全量构建/根测试全绿，具体边界已补入执行摘要。


### 2026-09-07 语音模型可选

用户要求并批准手动选择 MiniMax 语音模型。新增 8 项共享枚举、配置白名单保留/默认回退、通用设置模型下拉框；保存后试听与会话请求使用所选版本，模型改变沿用取消旧任务的机制。

插件 19 项及 Desktop 配置/控件 3 项通过，Desktop 类型检查、renderer 和 Electron main/preload 构建通过；已通过 CUA 查看浅深主题及选择保存反馈。未调用真实 MiniMax 或重启 Electron。本次属于既有配置链的小幅扩展，未命中至少两项学习沉淀条件，不另写学习文档。
