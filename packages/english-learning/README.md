---
description: "英语学习：双语回答、生词与朗读，默认关闭。"
kind: "package-group"
---

# english-learning

一个全局插件，为英语学习场景提供双语回答、生词整理和朗读。默认关闭，用户在“插件”页打开后生效；朗读由 Host 端口 `SpeechHostPort` 组织，语音合成请求在 `minimax.ts`。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `english-learning` | 实现 | 全局 | 关 | 英语学习服务：英文文本处理、提示、补全与朗读队列；提供 `english-learning` 服务；可在“插件”页开关 |

## 包之间怎么连

- manifest inject `agent.registry`、`session.runtime`；Host 能力要求 `renderer`、`network`、`credential`、`process`。
- 朗读通过 Host 端口 `SPEECH_HOST_PORT_ID`（定义在 `host-port.ts`）完成，实现在 `apps/desktop` 的 Host 适配器里；Host 没有提供这个端口时插件不创建服务。
- `desktop-app`（在 [`host/`](../host/README.md)）的 `DESKTOP_APP_BUNDLE` 把它的 manifest 放进桌面形态的基础组合，供“插件”页显示开关。
- 依赖 `shared` 里的英语学习协议（`english-learning`）。

## 入口与测试

- `english-learning/src/plugin.ts`、`service.ts`、`queue.ts`、`host-port.ts`、`prompt.ts`。
- 测试在 `english-learning/src/test/`：`pnpm --filter @actspace/english-learning test`。

## 怎么扩展

换朗读服务：改 Host 端实现的 `SpeechHostPort`，包内的 `minimax.ts` 是现有的一种实现。调整提示词改 `prompts/`。通用步骤见[总地图](../README.md)。
