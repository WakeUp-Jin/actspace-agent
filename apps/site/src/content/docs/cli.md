---
title: "命令行使用"
description: "从终端运行 ActSpace，选择工作区并按需要保存会话。"
group: "settings-development"
order: 3
updatedAt: 2026-09-19
draft: false
---

CLI 适合一次性任务、脚本调用和运行时调试。它使用同一套 v2 运行时，但不包含桌面工作台，也不会自动读取桌面设置中的模型 Key。

## 构建并查看帮助

在仓库根目录安装依赖后，构建 CLI 及其依赖：

```sh
pnpm install
pnpm --filter @actspace/agent-cli... build
node apps/cli/dist/cli.js --help
```

没有真实模型凭据时，可以用 mock 检查命令入口和输出：

```sh
node apps/cli/dist/cli.js run --mock --input "hello"
```

mock 不会验证真实模型、联网工具或你的任务效果。

## 运行实际任务

按照当前 CLI 配置要求提供服务商环境变量，再指定输入与工作区：

```sh
node apps/cli/dist/cli.js run --workspace ./example-project --input "阅读 README，说明项目启动方法"
```

输入也可以来自 `--input-file` 或标准输入。需要结构化输出时使用 `--json` 或 `--jsonl`，两者不能同时使用。模型可通过 `--model` 指定，具体可用配置以当前帮助和仓库 CLI 文档为准。

## 保存和继续会话

`--persist` 启用会话 Journal 写入，`--data-dir` 指定数据目录；`--resume` 接受之前保存的会话 ID，并隐含启用持久化。

```sh
node apps/cli/dist/cli.js run --persist --data-dir ./local-agent-data --input "阅读 README"
node apps/cli/dist/cli.js run --data-dir ./local-agent-data --resume SESSION_ID --input "继续说明测试方法"
```

将 `SESSION_ID` 替换为实际返回的 ID。继续任务前确认工作区和模型环境仍然正确。CLI 权限模式与桌面 Chat/Plan/Agent 选择不是同一个参数；先保留默认权限，完整选项通过 `--help` 查询。
