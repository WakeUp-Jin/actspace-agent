---
title: "快速开始"
description: "从源码启动桌面应用，连接模型并打开第一个工作区。"
group: "getting-started"
order: 2
updatedAt: 2026-09-19
draft: false
---

准备 Git、Node.js 22.12 或更高版本，以及仓库声明的 pnpm 10.33.0。以下命令都在仓库根目录执行。

## 获取并启动

```sh
git clone https://github.com/WakeUp-Jin/actspace-agent.git
cd actspace-agent
pnpm install
pnpm dev:log
```

`dev:log` 启动桌面开发环境，并将输出同步到 `logs/`。遇到启动失败时，保留终端错误，查看 `logs/latest-dev.log`。普通开发也可以运行 `pnpm dev`。

## 连接一个模型

打开左下角设置，进入“模型”，添加服务商连接并填写 API Key。配置后添加或启用要使用的模型，回到聊天输入框确认可以选中它。详细步骤见[配置模型](../configure-a-model/)。

桌面应用从应用内设置读取凭据，向仓库 `.env` 写入模型 Key 不会替代这个步骤。

![模型连接列表与连接状态](../../assets/screenshots/docs/model-connection.png)

*模型连接列表与连接状态。*

## 打开工作区

在左侧工作区区域添加本地文件夹，再新建会话。先用一个能安全修改的示例项目；普通目录也可以作为工作区，不要求必须有 Git。

选择模型和模式后，发送一个范围明确的任务。完整演示见[完成第一个任务](../first-task/)。

![工作区、会话列表与代码回复](../../assets/screenshots/docs/workspace-overview.png)

*工作区、会话列表与代码回复。*

## 本地打包

```sh
pnpm package:desktop
```

产物位于根目录 `dist/`。本地打包与正式签名、公证是不同步骤；当前命令不能代替正式发行验收。开发相关的目录和检查命令见[开发与贡献](../contributing/)。
