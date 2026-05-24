# actspace

`actspace` 是一个面向 Agent 协作的桌面端工作台。

它的目标不是再做一个普通聊天壳，而是围绕“上下文控制”来设计一套真正适合 Agent 工作的桌面应用：让模型拿到更多有组织的上下文，让用户更清楚地看到模型读了什么、想了什么、改了什么、最终产出了什么。

## 项目目标

- 做一个适配 DeepSeek 等模型的桌面端工作台。
- 强化上下文管理、可视化和本地可控性。
- 让思考、读取、搜索、编辑、diff、最终回复都能被清晰地展示出来。
- 优先使用本地文件和本地状态，降低系统复杂度和运行成本。

## 当前状态

当前项目已经完成了首版初始化，不再只是设计稿和模板仓库：

- `packages/desktop` 已经跑起 Electron + React + TypeScript + Vite 的桌面端骨架。
- `packages/shared` 已经提供跨进程共享类型、session schema 和 IPC contracts，并可独立构建到 `dist/`。
- `packages/agent-core` 已经落下首版 Agent 运行层骨架，包含 provider、tools、context 和 persistence，并通过标准包入口供桌面端消费。
- 桌面端主界面已经实现左侧会话栏、中间消息区、底部 Composer 和右侧预览位。
- 本地 `jsonl` 会话持久化、`meta.json` 摘要和基础会话恢复链路已经接通，数据目录固定落在系统用户数据目录下的 `actspace/`。

当前仍处在 `V1 基础版` 阶段，重点推进项包括：

- 真实 DeepSeek provider 已接入为默认运行路径；mock provider 只用于测试、浏览器 fixture 和显式 demo，不会静默替代 Electron 真实会话。
- 把 UI 和真实 turn 数据链路进一步打磨成稳定闭环。
- 补强 CI、可靠性约束、错误恢复和端到端测试。

当前设计文档入口见：

- `docs/design-docs/frontend-ui/`
- `docs/ARCHITECTURE.md`

## 技术栈

当前桌面端应用的首版技术选型如下：

- `Electron`：桌面应用壳层，用于窗口、菜单、文件系统和本地能力接入。
- `React + TypeScript`：主界面与组件开发。
- `Vite`：前端开发与构建工具。
- `Radix UI`：作为底层无样式交互 primitives，承载 dropdown、popover、dialog、tabs 等基础能力。
- `jsonl`：本地会话与消息数据存储格式，直接落盘到用户电脑，优先保证可读、可迁移和易调试。

当前不优先引入重量级本地数据库；会话、上下文、工具调用等优先按本地文件组织。

## 当前文档入口

- `docs/ARCHITECTURE.md`：当前架构方向与实现边界。
- `docs/design-docs/frontend-ui/`：桌面端界面设计文档与定稿图。
- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作与文档同步约定。
- `docs/histories/`：每轮设计与代码变更的历史记录。

## 仓库内开发

```sh
pnpm install            # 安装 workspace 依赖
pnpm dev                # 启动桌面端开发环境
pnpm dev:log            # 启动桌面端并写入 logs/latest-dev.log
pnpm typecheck          # 运行类型检查
pnpm build              # 构建 desktop/shared/agent-core
pnpm ci                 # 运行当前仓库级 CI 检查（docs / hygiene / shell 校验）
```

## 仓库结构

```text
.
├── AGENTS.md                  # Agent 入口，文档路由
├── CONTRIBUTING.md            # 协作约定
├── packages/
│   ├── agent-core/            # Agent 运行层与上下文/工具骨架
│   ├── desktop/               # Electron + React 桌面端应用
│   └── shared/                # IPC 契约、session schema、共享类型
├── docs/                      # 仓库知识库
│   ├── ARCHITECTURE.md        # 架构总览
│   ├── CICD.md                # CI/CD 说明
│   ├── CODING_BEHAVIOR.md     # 编码行为纪律
│   ├── FRONTEND.md            # 前端协作入口
│   ├── RELIABILITY.md         # 稳定性与可运维性
│   ├── SECURITY.md            # 安全默认约束
│   ├── TODOLIST.md            # 当前仓库级任务看板
│   ├── design-docs/           # 设计文档
│   ├── exec-plans/            # 执行计划
│   ├── histories/             # 变更历史
│   ├── learnings/             # 学习文档
│   └── releases/              # 发布记录
├── scripts/                   # 自动化脚本
│   ├── ci.sh                  # CI 入口
│   └── release-package.sh     # Release 打包
└── .github/                   # GitHub Actions 和模板
    └── workflows/             # CI、Release、供应链安全
```

## 参考与致谢

- [harness-template](https://github.com/iFurySt/harness-template) / [harness-template-cn](https://github.com/iFurySt/harness-template-cn) — Agent-first 仓库模板的原始实现，本项目早期骨架来源。
- [上下文工程与运行空间实践指南](https://github.com/WakeUp-Jin/Practical-Guide-to-Context-Engineering) — 从上下文工程到 Harness Engineering 的系统化方法论，本项目的理论参考。
- OpenAI [harness engineering 文章](https://openai.com/index/harness-engineering/) — 最初启发这一实践方向的思路来源。

## 许可证

[MIT](LICENSE)
