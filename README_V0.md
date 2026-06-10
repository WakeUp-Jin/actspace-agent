<p align="center">
  <img src="docs/assets/readme/actspace-agent-wordmark.png" alt="Actspace" width="640">
</p>

<p align="center">
  为 DeepSeek 打造的本地 Agent 桌面工作台
</p>

<p align="center">
  <a href="#开始使用">开始使用</a> ·
  <a href="#架构设计">架构设计</a> ·
  <a href="docs/design-docs/index.md">设计文档</a> ·
  <a href="#许可证">MIT</a>
</p>

<!-- TODO: 主界面截图。建议：浅色主题、统一窗口尺寸、包含一次完整的工具执行流，2x 分辨率 -->
<p align="center">
  <img src="docs/assets/readme/hero.png" alt="Actspace 主界面" width="920">
</p>

## 什么是 Actspace

Actspace 是一个为适配 DeepSeek 打造的本地 Agent 桌面应用。它不是聊天壳，而是把「模型读了什么、调用了什么工具、改了什么文件」全部摊开在你面前的工作台——上下文绝对可控，执行过程完全可视，所有数据落在本地。

它遵循三条原则：**简约优雅 · 上下文的绝对控制 · 为 DeepSeek 适配**（尤其是缓存利用，让成本低到可以忽略）。

## 核心特性

- **被动与主动，两种 Agent**——New Agent 被动响应你的指令；Kairos 主动自治运行，拥有独立 prompt、短期记忆、tick 调度和专属监控页。
- **上下文绝对控制**——token usage、context snapshot、每会话 `context-state.json`，你随时知道模型的上下文里有什么、花了多少、缓存命中了多少。
- **为 DeepSeek 而生**——上下文管线围绕 DeepSeek 的缓存机制设计，最大化缓存命中、最小化成本；Kimi 可作为联网搜索与多模态的辅助能力。
- **执行可视化**——每个工具调用都有独立预览：文件 diff、Bash 输出、权限审批、运行状态，不靠日志猜。
- **工具：被添加，也能自构建**——内置文件读写、Grep / Glob、Bash 等开发者添加的工具；Agent 也能依托 Lab 实验台，根据实际任务自己构建工具。
- **用 Agent 改造它自己**——借助 harness 工程，项目的全部上下文（功能设计规范、开发历史、执行计划、设计原则）都以文档沉淀在 `docs/`。你可以直接用 Codex / Claude Code 按自己的想法改造源码，自定义性和开放性都很强。
- **本地优先**——会话、记忆、事件流全部以 jsonl 落盘，可迁移、可审计、可追溯。

## 开始使用

```sh
git clone https://github.com/WakeUp-Jin/actspace-agent.git
cd actspace-agent
pnpm install
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（可选 KIMI_API_KEY）
pnpm dev
```

打包当前平台的桌面应用：

```sh
pnpm package:desktop   # 产物输出到 dist/
```

## 截图

<!-- TODO: 2x2 截图网格。建议四张：Kairos 监控页 / 工具执行流与权限审批 / Usage Statistics / 右侧 Review 与文件预览 -->

| ![Kairos 监控页](docs/assets/readme/shot-kairos.png) | ![工具执行流](docs/assets/readme/shot-tools.png) |
| :--: | :--: |
| Kairos 自治监控 | 工具执行与审批 |

| ![Usage 统计](docs/assets/readme/shot-usage.png) | ![文件预览与 Review](docs/assets/readme/shot-review.png) |
| :--: | :--: |
| Usage 与缓存统计 | 文件预览与 Review |

## 架构设计

```text
desktop (Electron + React)  ──▶  agent-core (模型 · 上下文 · 工具 · 执行循环)  ──▶  shared (IPC 契约与类型)
```

所有架构事实与设计决策都以文档形式版本化在仓库里：

- [架构总览](docs/ARCHITECTURE.md)——包边界、依赖方向和阅读路线。
- [Agent Runtime 设计](docs/design-docs/agent-backend-design.md)——模型接入、执行循环与模块边界的事实来源。
- [Agent Turn 四层职责](docs/design-docs/agent-turn-layers.md)——从前端输入到结果返回的完整数据流。
- [上下文压缩设计](docs/design-docs/agent-context-compression.md)——上下文如何被控制和压缩。
- [Kairos 自治模式](docs/design-docs/agent-kairos-autonomous-mode.md)——独立 prompt、短期记忆与 tick 调度。
- [缓存失效排查](docs/design-docs/agent-cache-loss-audit.md)——DeepSeek 缓存利用的工程细节。
- [设计文档索引](docs/design-docs/index.md)——全部 core / agent / front / lab 专题。

## 想说的话

市面上的很多 Agent 产品，想法和设计都很棒。真心感谢每一个在背后默默付出的团队和开发者。

大模型应用还在快速发展，我一直希望有一个可以随时构建、完全按照自己想法生长的东西。DeepSeek 的成本足够低、理念足够纯粹，让我可以放心地围绕模型去构建应用，而不必担心模型的成本、真实性和可靠性。作为一个应用工程师，这让我很舒服——不用担心源头，只专注于这种力量的应用与构建。

这个应用还有很多不足。但我相信随着日常使用，bug 会被修复，新功能会自然长出来。无论它如何变化，我都希望为它守住三件事：

<p align="center"><b>简约优雅 · 执行可视化 · 上下文可控</b></p>

<p align="center">「不诱于誉，不恐于诽，率道而行，端然正己。」</p>

## 致谢

- [DeepSeek](https://www.deepseek.com/)——低成本、纯粹的模型，是这个项目得以成立的前提。
- [harness-template](https://github.com/iFurySt/harness-template) / [harness-template-cn](https://github.com/iFurySt/harness-template-cn)——Agent-first 仓库模板，本项目早期骨架来源。
- [上下文工程与运行空间实践指南](https://github.com/WakeUp-Jin/Practical-Guide-to-Context-Engineering)——本项目的方法论参考。
- OpenAI [Harness Engineering](https://openai.com/index/harness-engineering/)——最初启发这一实践方向的思路来源。
- 以及所有给过我启发的开源项目：[Cherry Studio](https://github.com/CherryHQ/cherry-studio)、[AFFiNE](https://github.com/toeverything/AFFiNE)、[browser-use](https://github.com/browser-use/browser-use)、[nanobot](https://github.com/HKUDS/nanobot)、[Kimi Code](https://github.com/MoonshotAI/kimi-code) 等。

## 许可证

[MIT](LICENSE)
