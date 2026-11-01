---
description: "侧边对话：不打断主对话，在旁边提问。"
kind: "package-group"
---

# side-chat

一个全局插件，给“侧边对话”会话加上一段边界提示，让它知道自己是主对话旁边的临时提问，不要去改主对话的工作。它只在会话创建时按需挂载提示，不写入会话日志，也不能被关闭。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `side-chat` | 实现 | 全局 | 开 | 监听 `session/created` 和 `session/disposed`；对来源是 `side-chat` 的会话，向 Host 的 Prompt 端口登记一段边界提示（`side-chat/v1`）；提供 `side-chat` 服务 |

## 包之间怎么连

- inject `session.runtime`，用它判断会话的来源（`lineage.origin`）；通过 Host 端口 `actspace.host.prompt` 的扩展点按会话登记提示，会话销毁时移除。
- 没有 Host 能力要求，不注册工具和事件，也没有自己的 Codec。
- 使用方：`core/runtime`（装配）、`agent-service`（用包导出的 `resolveSideChatBoundary` 等边界规则判断侧边会话）、`apps/desktop`。

## 入口与测试

- `side-chat/src/plugin.ts`（服务）、`boundary.ts`、`prompt.ts`。
- 测试在 `side-chat/src/test/`：`pnpm --filter @actspace/side-chat test`。

## 怎么扩展

改边界提示的文字：改 `prompt.ts`。想让别的会话来源也带专属提示：照这个包新建一个全局插件，按 `lineage.origin` 登记提示。通用步骤见[总地图](../README.md)。
