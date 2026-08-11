---
title: 快速开始
description: 从源码安装依赖、配置环境并启动 ActSpace 桌面应用。
group: getting-started
order: 2
updatedAt: 2026-07-28
draft: false
---

ActSpace 当前以源码运行和本地打包为主。开始前请准备 Git、Node.js 22.12 或更高版本，以及仓库声明的 pnpm 版本。

## 获取源码

```sh
git clone https://github.com/WakeUp-Jin/actspace-agent.git
cd actspace-agent
pnpm install
```

仓库使用 pnpm workspace。请在根目录安装依赖，不要分别进入每个 package 执行安装。

## 配置模型

启动 ActSpace 后，打开「设置 → 服务商」，选择 DeepSeek、Kimi 或 OpenRouter，并填写对应的 API Key。密钥由主进程使用系统安全存储加密保存在本机，不进入 renderer 或会话事件。

服务商连接建立后，在「设置 → 模型」中安装并启用需要的模型。Composer 只展示当前已经启用且可用于主会话的候选模型。

更完整的服务商、代理、模型用途和故障排查说明见[配置模型](../configure-a-model/)。

## 启动开发环境

日常开发推荐使用带日志的启动命令：

```sh
pnpm dev:log
```

终端输出会同步写入根目录 `logs/`。排障时优先查看 `logs/latest-dev.log` 或最近的 `logs/dev-*.log`。

如果不需要写日志，也可以运行：

```sh
pnpm dev
```

## 启动介绍网站

官网是独立的 Astro workspace package：

```sh
pnpm dev:site
```

默认地址为 `http://127.0.0.1:8765`。网站不依赖 Electron，可以单独开发和构建。

## 打包桌面应用

```sh
pnpm package:desktop
```

产物输出到根目录 `dist/`。本地 ad-hoc 签名、Developer ID 与 notarization 的边界不同，发布前请阅读仓库内的打包与安全文档。

## 常用验证

```sh
pnpm check:docs
pnpm check:frontend-theme
pnpm test
pnpm typecheck
```

完整仓库检查使用：

```sh
pnpm ci
```

如果安装完成但还不能发起对话，先继续阅读[配置模型](../configure-a-model/)和[工具与审批](../tools-and-approvals/)。
