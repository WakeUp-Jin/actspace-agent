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
  <img src="docs/assets/readme/home.png" alt="Actspace 主界面" width="920">
</p>

## 什么是 Actspace

Actspace 是一个为适配 DeepSeek 打造的本地 Agent 桌面应用。其构建了一套Agent Harness，目的是让DeepSeek能够获取更多的上下文，做更多的事情

它遵循三条原则：**简约优雅 · 上下文的绝对控制 · 为 DeepSeek 适配**（尤其是缓存利用，降低成本）。

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

<table>
  <tr>
    <td align="center"><img src="docs/assets/readme/kairos.png" width="100%" alt="Kairos 监控页"><br><sub>Kairos 自治监控</sub></td>
    <td align="center"><img src="docs/assets/readme/tool-permission2.png" width="100%" alt="工具执行流"><br><sub>工具执行与审批</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/readme/usage2.png" width="100%" alt="Usage 统计"><br><sub>Usage 与缓存统计</sub></td>
    <td align="center"><img src="docs/assets/readme/file-prevoew2.png" width="100%" alt="文件预览"><br><sub>文件预览</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/readme/context-controle.png" width="100%" alt="上下文控制"><br><sub>上下文控制与可视化</sub></td>
    <td align="center"><img src="docs/assets/readme/review3.png" width="100%" alt="Review"><br><sub>Review</sub></td>
  </tr>
</table>

## 架构设计

<!-- TODO: 自己这里使用excalidraw补充一张设计图，一个是从被动自主，工具自建出发，一个是总设计图 ，还有一个完整的执行循环，从用户输入开始，到最终输出-->

所有架构事实与设计决策都以文档形式版本化在仓库里：

- [架构总览](docs/ARCHITECTURE.md)——包边界、依赖方向和阅读路线。
- [Agent Runtime 设计](docs/design-docs/agent-backend-design.md)——模型接入、执行循环与模块边界的事实来源。
- [Agent Turn 四层职责](docs/design-docs/agent-turn-layers.md)——从前端输入到结果返回的完整数据流。
- [上下文压缩设计](docs/design-docs/agent-context-compression.md)——上下文如何被控制和压缩。
- [Kairos 自治模式](docs/design-docs/agent-kairos-autonomous-mode.md)——独立 prompt、短期记忆与 tick 调度。
- [缓存失效排查](docs/design-docs/agent-cache-loss-audit.md)——DeepSeek 缓存利用的工程细节。
- [设计文档索引](docs/design-docs/index.md)——全部 core / agent / front / lab 专题。

## 想说的话

我很喜欢市面上的很多 Agent 产品，想法和设计都很棒。真心感谢每一个在背后付出的团队和开发者。

大模型应用还在快速发展，我特别希望有一个能够按照我自己想法构建的东西。

DeepSeek 的成本很低并且理念很好，让我可以放心地围绕模型去构建应用，而不必担心模型的成本、真实性和可靠性。让我这个工程师很安心，不用担心源头，而专注于这种力量的应用构建。
   
这个应用有很多的不足，但是我相信随着日常的使用，许多bug会被修复，许多新功能会产生，会完善，无论应用如何变化，我希望可以为这个应用保持**简约优雅，执行可视化，上下文可控性**

<hr/>

<p align="center">「不诱于誉，不恐于诽，率道而行，端然正己。」</p>

## 致谢

- [上下文工程与运行空间实践指南](https://github.com/WakeUp-Jin/Practical-Guide-to-Context-Engineering)——本项目的方法论参考。
- [agent-harness-dev](https://github.com/WakeUp-Jin/agent-harness-dev) -- 一份指导开发者如何无框架从0构建 Agent 后端的架构规范的skill
- [code-develop-harness-init](https://github.com/WakeUp-Jin/code-develop-harness-init)--面向 Agent-first 开发的基础模板
- [Linux.Do 社区](https://linux.do/latest) (真诚 、友善 、团结 、专业)
- Linux.Do社区佬友们的公益站的大力支持和帮助，充足的Token得以让该项目可以实现Agent原生开发，并且快速构建


## 许可证

[MIT](LICENSE)
