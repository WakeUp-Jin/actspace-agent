---
description: "网页搜索与读取的模型工具。"
kind: "package-group"
---

# web

`tool-web` 提供网页搜索和读取。网络访问本身由 Host 端口完成，插件只定义工具、校验参数、登记到工具运行时。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-web` | 工具 | 会话 | 开 | `web`、`web_search`、`web_fetch` 三个工具；提供 `tools.web-tools` |

## 包之间怎么连

- inject `tools.runtime` 和 Host 端口 `actspace.host.tools.web-tools`（`node-ports.ts` 是 Node 实现）。
- manifest 声明 Host 能力 `network`。
- 工具设置页里的“关掉网页搜索”只控制工具可见性，不影响插件加载。

## 入口与测试

- `src/manifest.ts`、`src/plugin.ts`、`src/node-ports.ts`；参数约束（`web` 的 schema 不用顶层 `oneOf` / `allOf` / `anyOf`，以兼容 Anthropic）见[包 README](tool-web/README.md)。
- 测试在 `tool-web/src/test/`：`pnpm --filter @actspace/tool-web test`。

## 怎么扩展

新增一个搜索或读取后端：改 `node-ports.ts` 里的 Host 实现；要新增独立工具，再新建 `web/tool-<名>`。通用步骤见[总地图](../README.md)。
