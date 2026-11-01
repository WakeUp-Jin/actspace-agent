---
description: "生成图片和看懂图片的模型工具。"
kind: "package-group"
---

# image

两个独立的工具插件：生成图片，和让 Agent 看懂图片内容。看图片要调用模型，所以依赖 `llm-service`；生成图片只调用图片接口，不经过 `llm-service`。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-image-generation` | 工具 | 会话 | 开 | `generate_image`：按描述请求图片接口，结果保存为会话产物（artifact）；提供 `tools.image-generation` |
| `tool-image-inspection` | 工具 | 会话 | 开 | `inspect_image`：用模型看图并回答；提供 `tools.image-inspection` |

## 包之间怎么连

- 两个包都 inject `tools.runtime` 和各自的 Host 端口 `actspace.host.tools.image-generation` / `actspace.host.tools.image-inspection`，真实实现在 `node-ports.ts`。
- `tool-image-inspection` 还 inject `llm.service` 和 `llm.auxiliary-requests`：端口创建时拿到模型服务和辅助请求记录器，看图的模型请求记为辅助请求。
- manifest 声明的 Host 能力：生成图片要 `network`、`filesystem.write`，看图片要 `network`。

## 入口与测试

- 每个包：`src/manifest.ts`、`src/plugin.ts`、`src/node-ports.ts`；看图片另有 `src/llm-image-inspector.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/tool-image-generation test`、`pnpm --filter @actspace/tool-image-inspection test`。

## 怎么扩展

新增一个图片类工具（例如编辑图片）：新建 `image/tool-image-<名>`，照上面两个包的结构写 manifest、plugin 和 node-ports，需要模型时 inject `llm.service`。通用步骤见[总地图](../README.md)。
