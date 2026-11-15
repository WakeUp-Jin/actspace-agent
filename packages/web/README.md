---
description: "网页搜索、读取与深度搜索的模型工具。"
kind: "package-group"
---

# web

`tool-web` 提供网页搜索和读取，`tool-deep-search` 把问题交给 DeepSeek 深度思考搜索。网络访问本身由 Host 端口完成，插件只定义工具、校验参数、登记到工具运行时。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-web` | 工具 | 会话 | 开 | `web`、`web_search`、`web_fetch` 三个工具；提供 `tools.web-tools` |
| `tool-deep-search` | 工具 | 会话 | 开 | `deep_search`；提供 `tools.deep-search` |

## 包之间怎么连

- inject `tools.runtime` 和 Host 端口 `actspace.host.tools.web-tools`（`node-ports.ts` 是 Node 实现）。
- manifest 声明 Host 能力 `network`。
- 工具设置页里的“关掉网页搜索”只控制工具可见性，不影响插件加载。
- `tool-deep-search` 的 Host 端口 `actspace.host.tools.deep-search` 是可选注入：没有时不注册工具；有时由端口的 `available()`（设置开关 + DeepSeek Key）决定模型能不能看到 `deep_search`。

## 入口与测试

- `src/manifest.ts`、`src/plugin.ts`、`src/node-ports.ts`；参数约束（`web` 的 schema 不用顶层 `oneOf` / `allOf` / `anyOf`，以兼容 Anthropic）见[包 README](tool-web/README.md)。
- `src/public-request.ts`：`web_fetch` 判断一个地址是不是公网地址、并且只连检查过的地址。规则见 [Web 工具](../../docs/design-docs/tool-system/agent-web-tools.md)。
- 测试在 `tool-web/src/test/`：`pnpm --filter @actspace/tool-web test`。
- `tool-deep-search`：`src/plugin.ts` 是工具定义，`src/node-ports.ts` 是 DeepSeek 请求的 Node 实现；测试 `pnpm --filter @actspace/tool-deep-search test`，见[包 README](tool-deep-search/README.md)。

## 怎么扩展

新增一个搜索或读取后端：改 `node-ports.ts` 里的 Host 实现；要新增独立工具，再新建 `web/tool-<名>`。通用步骤见[总地图](../README.md)。
