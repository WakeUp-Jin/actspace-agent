---
description: "三种宿主形态：桌面、远程（手机和网页）、命令行。"
kind: "package-group"
---

# host

同一套运行时有三种宿主形态：桌面应用、独立的远程 Host、命令行。三个包都在 Host 的加载清单里，但各自只在对应形态的 Host 标记存在时才起作用，否则保持休眠、不发布应用服务。它们都是应用层：不拥有第二套调度器，调度都交给 `agent-service`。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `desktop-app` | 实现 | 全局 | 开 | 桌面接线：桌面端的会话与界面接口、会话标题、文本补全；提供 `desktop.app`，带桌面形态的应用 Bundle（`DESKTOP_APP_BUNDLE`） |
| `agent-host` | 实现 | 全局 | 开 | 远程 Host：传输层、认证、订阅、文件与上传，让手机和网页连接这台电脑上的 Agent；提供 `host.application` |
| `headless` | 实现 | 全局 | 开 | 命令行运行：一次提交、等待完成，输出结果；提供 `headless.runner` |

## 包之间怎么连

- 三个包都 inject `session.runtime` 和 `agent.runtime`（`desktop-app` 另有 `llm.service`、`llm.auxiliary-requests`；`headless` 另有 Host 端口 `actspace.host.headless`）。
- `desktop-app` 只有存在 `actspace.host.desktop` 标记时才发布 `desktop.app`；`headless` 在 Host 端口未启用时直接返回；`agent-host` 只在远程 Host 标记存在时发布 `host.application`。
- 业务操作转给 `agent-service`（在 [`core/`](../core/README.md)）；`agent-host` 的传输层只持有连接、认证和订阅，断开连接不会取消 Agent Run。
- `agent-host` 的 `node-ports` 放 CLI 和远程 Host 共用的模型、工具、产物适配器；Host 引导代码在 CLI 启动器里，避免 `agent-host` 反向依赖 `core/runtime`。
- 这三个包是 `core/runtime` 在装配层依赖的仅有的宿主包，没有能力包依赖它们。

## 入口与测试

- `desktop-app/src/service.ts`、`bundle.ts`；`agent-host/src/server.ts`、`auth.ts`、`rpc.ts`、`node-ports/`；`headless/src/runner.ts`。包 README 见 [agent-host](agent-host/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/agent-host test`；真实隔离进程测试 `node --test scripts/test/host-process.test.mjs`（先构建 runtime 和 CLI）。

## 怎么扩展

新增一种宿主形态：新建 `host/<名>`，inject `session.runtime` 和 `agent.runtime`，只在自己的 Host 标记存在时发布服务；在 `core/runtime/src/plugin-catalog.ts` 加一行（`loaders: host`），再在对应应用的装配里提供标记。业务操作走 `agent-service`，不要新建调度器。通用步骤见[总地图](../README.md)。
