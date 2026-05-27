# actspace

`actspace` 是一个面向 Agent 协作开发的本地桌面工作台。

它不是一个普通聊天壳，而是围绕上下文控制、本地可追溯和工具执行可观察来组织 Agent 工作：用户能看到模型读了什么、想了什么、调用了什么工具、改了什么文件，以及这些过程如何沉淀为可继续协作的仓库知识。

## 当前能力

- **桌面工作台**：Electron + React 桌面端，包含会话栏、消息区、Composer、右侧对象区、Usage 页面和 Kairos 监控页。
- **Agent Runtime**：`packages/agent-core` 承载模型接入、prompt、context、tools、execution loop、persistence 和 observability。
- **模型接入**：普通会话默认走真实 DeepSeek provider；Kimi 可作为主模型，也可作为 DeepSeek 的联网搜索和多模态辅助能力。
- **工具系统**：已包含文件读写编辑、目录读取、Grep / Glob、Bash、工具权限调度、工具预览和运行状态展示。
- **上下文与统计**：已落地 token usage、context snapshot、每会话 `context-state.json` 和 Usage Statistics 的数据地基。
- **Kairos 自治模式**：v1 已落地，支持独立 prompt、短期记忆、tick 调度、事件流和桌面端监控页。
- **Lab 能力实验台**：产品与架构设计已沉淀在 `docs/design-docs/lab/`，尚未进入实现。

当前进行中的任务、验收缺口和下一步入口以 `docs/TODOLIST.md` 与 `docs/exec-plans/README.md` 为准。

## 快速开始

```sh
pnpm install
cp .env.example .env
pnpm dev:log
```

默认 DeepSeek 运行路径需要填写 `.env` 中的 `DEEPSEEK_API_KEY`。如果需要 Kimi 主模型，或希望 DeepSeek 通过 Kimi 获得联网搜索、网页读取和多模态辅助能力，再填写 `KIMI_API_KEY`。

常用命令：

```sh
pnpm dev        # 启动桌面端开发环境
pnpm dev:log    # 启动桌面端，并同步写入 logs/latest-dev.log
pnpm typecheck  # 运行 workspace 类型检查
pnpm test       # 运行各 package 测试
pnpm build      # 构建 desktop / shared / agent-core
pnpm package:desktop # 本地打包 unsigned 桌面应用 archive
pnpm run ci     # 运行仓库级 CI 检查
```

本项目当前按开源项目优先支持源码本机构建：用户 clone 仓库后运行 `pnpm install` 和 `pnpm package:desktop`，即可在 `dist/` 下得到当前平台的桌面应用 archive。默认产物不使用付费 Developer ID 证书，也不会强制签名；如果用户需要临时本地签名，可以显式设置 `ACTSPACE_MAC_ADHOC_SIGN=true`。

## 运行边界

- renderer 不能直接访问文件系统，所有本地能力通过 main / preload 暴露的类型化 bridge 进入。
- API Key 只在 main / agent-core 运行时读取，不进入 renderer、session 事件、前端状态或测试快照。
- 会话、Kairos 短期记忆、context state 和排障日志都优先落本地文件，便于迁移、审计和调试。
- `.env` 不提交；`.env.example` 是环境变量模板和说明来源。
- 本地开发排障优先看 `logs/latest-dev.log` 和 `logs/agent-runs/`。

安全、存储和日志边界详见：

- `docs/SECURITY.md`
- `docs/design-docs/storage-and-observability.md`
- `docs/RELIABILITY.md`

## 文档导航

- `AGENTS.md`：Agent 入口和仓库文档路由。
- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作、文档同步和测试约定。
- `docs/ARCHITECTURE.md`：顶层架构、包边界和专题阅读路线。
- `docs/TODOLIST.md`：当前焦点、验收缺口和下一步入口。
- `docs/exec-plans/README.md`：active / completed execution plans。
- `docs/design-docs/index.md`：长期设计文档索引。
- `docs/FRONTEND.md`：前端协作入口和验证规范导航。
- `docs/QUALITY_SCORE.md`：当前质量水位和主要短板。
- `docs/SECURITY.md`：密钥、Electron、文件系统和真实模型调用边界。
- `docs/histories/`：已完成变更的历史记录。
- `docs/learnings/`：有迁移价值的学习沉淀。

## 技术栈

- `Electron`：桌面应用壳层、窗口和本地能力入口。
- `React + TypeScript`：renderer UI 和组件开发。
- `Vite`：前端开发与构建。
- `Tailwind CSS v4`：正在推进的 renderer 样式架构。
- `jsonl`：本地 session、事件流和 Kairos 短期记忆的主要存储格式。
- `Vitest`：agent-core、shared、desktop renderer / main 的单元测试和组件测试。

当前不优先引入重量级本地数据库；会话、上下文、工具调用和自治事件优先按本地文件组织。

## 仓库结构

```text
.
├── AGENTS.md                  # Agent 入口，文档路由
├── CONTRIBUTING.md            # 协作约定
├── packages/
│   ├── agent-core/            # Agent 运行层、模型、上下文、工具和 Kairos
│   ├── desktop/               # Electron main / preload / React renderer
│   └── shared/                # IPC 契约、session schema、共享类型
├── docs/                      # 仓库知识库
│   ├── ARCHITECTURE.md        # 架构总览
│   ├── TODOLIST.md            # 当前焦点和验收缺口
│   ├── design-docs/           # 长期设计文档
│   │   └── lab/               # Lab 能力实验台设计
│   ├── exec-plans/            # 执行计划
│   ├── histories/             # 变更历史
│   ├── learnings/             # 学习文档
│   └── releases/              # 发布记录
├── scripts/                   # 仓库自动化脚本
└── .github/                   # GitHub Actions 和模板
```

## 参考与致谢

- [harness-template](https://github.com/iFurySt/harness-template) / [harness-template-cn](https://github.com/iFurySt/harness-template-cn)：Agent-first 仓库模板的原始实现，本项目早期骨架来源。
- [上下文工程与运行空间实践指南](https://github.com/WakeUp-Jin/Practical-Guide-to-Context-Engineering)：从上下文工程到 Harness Engineering 的系统化方法论，本项目的理论参考。
- OpenAI [harness engineering 文章](https://openai.com/index/harness-engineering/)：最初启发这一实践方向的思路来源。

## 许可证

[MIT](LICENSE)
