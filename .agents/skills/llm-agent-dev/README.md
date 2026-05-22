<div align="center">

# llm-agent-dev

**一份教 AI 编程助手如何构建 Agent 后端的架构规范。**

[快速开始](#快速开始) · [工作原理](#工作原理) · [模块一览](#模块一览) · [参与贡献](#参与贡献)

</div>

---

## 为什么需要它

从零构建 Agent 后端比想象中难得多——上下文管理、工具调度、权限控制、压缩策略、结构化输出，这些模块必须协同工作。

`llm-agent-dev` **不是**框架，也不是 SDK。它是一份**可被 LLM 直接消费的架构规范**。以 [Skill](https://github.com/vercel-labs/skills) 的形式安装后，你的 AI 编程助手（Cursor、Claude Code 等）在帮你写 Agent 时，会自动获得一套经过实战验证的架构参考——从第一个 `runAgentLoop` 原型到生产级多智能体系统。

> 上下文工程（Context Engineering）是设计原则，Agent Harness 是构建目标。

### 核心理念

- **渐进式披露** — 模型只读取当前需要的内容。`SKILL.md` 作为唯一入口，按需路由到各模块详细规范，保持上下文窗口精简。
- **迭代式架构** — 定义两个里程碑：**V0**（可运行的完整骨架）→ **V1**（含调度/压缩/权限的生产可用版）。遇到具体问题时才升级，而非预防性堆砌。
- **四大支柱** — 任何 Agent 后端都可分解为上下文管理、工具系统、LLM 模块和 Agent 运行空间，由执行引擎统一串联。

## 快速开始

### 通过 CLI 安装（推荐）

```bash
npx skills add WakeUp-Jin/agent-harness-dev
```

将 Skill 安装到当前项目。常用命令：

```bash
# 全局安装到 Cursor
npx skills add WakeUp-Jin/agent-harness-dev -a cursor -g -y

# 全局安装到 Claude Code
npx skills add WakeUp-Jin/agent-harness-dev -a claude-code -g -y

# 项目级安装（随仓库提交，团队共享）
npx skills add WakeUp-Jin/agent-harness-dev -a cursor -y
```

<details>
<summary>全部 CLI 参数</summary>

| 参数 | 说明 |
| --- | --- |
| `-a, --agent <name>` | 目标 Agent：`cursor`、`claude-code` |
| `-g, --global` | 安装到用户全局目录（如 `~/.cursor/skills/`） |
| `--copy` | 拷贝文件而非创建软链接（适合离线/容器场景） |
| `-y, --yes` | 跳过交互式确认 |
| `-l, --list` | 仅列出可用 Skill，不安装 |

</details>

### 手动安装

```bash
# Cursor
git clone https://github.com/WakeUp-Jin/agent-harness-dev.git ~/.cursor/skills/llm-agent-dev

# Claude Code
git clone https://github.com/WakeUp-Jin/agent-harness-dev.git ~/.claude/skills/llm-agent-dev
```

## 工作原理

安装后，Skill 会**自动触发**——无需在对话中手动提及。当你的需求命中"写一个 Agent"、"工具调度"、"上下文管理"、"结构化输出"等关键词时，编程助手会自动加载 `SKILL.md` 并导航到对应的参考文档。

信息按**四层金字塔**逐级展开：

```
SKILL.md           →  架构总览 + 模块路由表（始终加载）
  └─ references/   →  各模块详细规范（按需加载）
      └─ examples/ →  TypeScript 代码骨架（按需加载）
          └─ 内联指导  →  工程约定与常见陷阱
```

**会触发 Skill 的典型提示词：**

- *"帮我写一个 Agent，能调用 Bash、Grep、文件操作等工具"*
- *"长对话场景下上下文压缩怎么设计？"*
- *"Agent Harness 里工具权限审批怎么做？"*
- *"怎么搭建多模型服务层？工厂模式怎么用？"*

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 运行空间                          │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  执行循环  │──│   工具系统   │──│     上下文管理       │  │
│  │           │  │              │  │                      │  │
│  │ • 流式输出 │  │ • 工具定义   │  │ • 系统提示词         │  │
│  │ • 解析调用 │  │ • 调度编排   │  │ • 会话历史           │  │
│  │ • 执行工具 │  │ • 权限审批   │  │ • 压缩策略           │  │
│  │ • 回填结果 │  │ • 输出裁剪   │  │ • 结构化输出         │  │
│  └─────┬──────┘  └──────────────┘  └──────────────────────┘  │
│        │                                                     │
│  ┌─────▼──────────────────────────────────────────────────┐  │
│  │                    LLM 模块                            │  │
│  │  工厂函数 → BaseLLMService → stream / complete         │  │
│  │  模型注册表：high / medium / low 三级                   │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 模块一览

| 模块 | 覆盖内容 | 参考文档 |
| --- | --- | --- |
| **架构设计** | V0/V1 构建路径、目录结构、模块组装指南 | [`architecture.md`](references/architecture.md) |
| **上下文管理** | 上下文管道、压缩策略、记忆模块、结构化输出 | [`context/`](references/context) |
| **工具系统** | 工具定义、调度编排、权限审批、Bash/Grep/文件操作 | [`tools/`](references/tools) |
| **LLM 模块** | 多模型接入的服务层、工厂模式、多级模型 | [`llm/`](references/llm) |
| **Agent 运行空间** | 执行循环、Agent 形态、定时任务、KAIROS 模式 | [`agent-runtime/`](references/agent-runtime) |
| **评估体系** | 评估框架、多类型 Agent 评估策略、评分实现 | [`agent-evaluation/`](references/agent-evaluation) |
| **基础设施** | RAG 检索策略、Skill 集成 | [`foundations/`](references/foundations) |
| **工程实践** | 常见陷阱、上下文污染、Skill 构建经验 | [`practices/`](references/practices) |

## 仓库结构

```
.
├── SKILL.md                  # 入口：自动加载到 Agent 上下文
├── CONVENTIONS.md            # 本 Skill 的贡献规范
├── references/               # 各模块详细规范（按需加载）
│   ├── architecture.md       # 构建路径与组装指南
│   ├── context/              # 上下文管道与压缩
│   ├── tools/                # 工具系统与调度
│   ├── llm/                  # LLM 服务层
│   ├── agent-runtime/        # 执行循环与 Agent 形态
│   ├── agent-evaluation/     # 评估框架
│   ├── foundations/           # RAG、Skill 集成
│   └── practices/            # 工程实践经验
├── examples/                 # TypeScript 代码骨架
│   ├── agent-loop.ts
│   ├── context-manager.ts
│   ├── tool-scheduler.ts
│   ├── llm-factory.ts
│   └── ...
└── assets/                   # 架构图等图片资源
```

## 兼容性

| Agent | 状态 |
| --- | --- |
| [Cursor](https://cursor.com) | ✅ 支持 |
| [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) | ✅ 支持 |
| 任何兼容 [vercel-labs/skills](https://github.com/vercel-labs/skills) 规范的 CLI | ✅ 支持 |

## 参与贡献

提交 PR 前请先阅读 [CONVENTIONS.md](CONVENTIONS.md)。核心约束：

- 目录最多两层，第三层必须是文件
- 新增内容归入已有的模块文件夹，不新增顶层目录
- 文档通过路径引用代码（`参考代码: examples/xxx.ts`），不内嵌代码块
- `overview.md` 控制在 30–50 行，仅做导航
- 单个 reference 文件控制在 100–200 行
- 使用祈使句式，解释"为什么"，而非堆砌 MUST 规则

## 许可证

MIT

## 致谢

作者：[@WakeUp-Jin](https://github.com/WakeUp-Jin)
