---
description: "固定的前端契约：界面和手机、网页共用的会话投影、实时状态和 Host 客户端。"
kind: "package-group"
---

# client

一个库包，放界面（桌面渲染进程、网页）共用的固定契约：把会话日志投影成聊天、轨迹、用量，把实时事件合成运行状态，并提供连接远程 Host 的客户端。后端插件不得携带 React、CSS、HTML 或渲染端 JavaScript，界面只通过这里的类型读取后端。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `client` | 库 | 库 | — | 四个入口：`.`（总入口）、`./sessions`（会话快照、聊天、轨迹、工具卡片、用量聚合）、`./live`（实时运行状态与流式块）、`./host`（远程 Host 客户端） |

## 包之间怎么连

- `client` 只依赖 `shared`（在 [`util/`](../util/README.md)）里的协议类型，没有任何插件依赖它。
- 使用方是 `apps/desktop` 和 `apps/web`；它们从子路径入口导入，不深导入 `src`。
- 它不在插件清单里，不是插件。

## 入口与测试

- `client/src/sessions/index.ts`、`live/index.ts`、`host/index.ts`。包 README 见 [client](client/README.md)。
- 测试在 `client/src/test/` 和 `client/src/host/client.test.ts`：`pnpm --filter @actspace/client test`。

## 怎么扩展

新增一种界面要显示的投影：先在后端插件的投影里产出，再在 `client/src/sessions/` 加对应的选择器或类型，界面从 `./sessions` 读取。需要新的传输消息时先改 `shared` 的协议。通用步骤见[总地图](../README.md)。
