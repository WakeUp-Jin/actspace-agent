---
description: "操控浏览器：通过 Chrome 扩展让 Agent 操作网页，默认关闭。"
kind: "package-group"
---

# browser

一个会话插件，给 Agent 一组 `browser_*` 工具，经 Host 提供的浏览器能力去操作用户安装了扩展的 Chrome。默认关闭，用户在“插件”页打开后才在新会话生效。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-browser` | 工具 | 会话 | 关 | 11 个浏览器工具（`browser_cua`、`browser_dom`、`browser_locator`、`browser_navigation`、`browser_tabs`、`browser_user`、`browser_wait`、`browser_io`、`browser_debug`、`browser_help`、`browser_run`）；提供 `tools.browser`；可在“插件”页开关 |

## 包之间怎么连

- inject `tools.runtime` 注册工具；Host 能力要求 `browser`，可选 `approval`；真实的浏览器 I/O 由 Host 端口 `actspace.host.tools.browser` 提供，包里的 `node-capability.ts` 是 Node 实现。
- 工具的输入输出经 `redaction.ts` 脱敏后再进入会话。
- 依赖 `tool-runtime`（工具定义）和 `shared`（`runtime-v2` 的 JSON 类型）；Chrome 扩展和桌面端的桥接代码在 `apps/`，不在包里。
- 使用方：`core/runtime`（装配）、`apps/desktop`。

## 入口与测试

- `tool-browser/src/plugin.ts`、`definitions.ts`、`host-port.ts`、`node-capability.ts`、`redaction.ts`。
- 测试在 `tool-browser/src/test/`：`pnpm --filter @actspace/tool-browser test`。

## 怎么扩展

新增一个浏览器工具：在 `definitions.ts` 定义，在 `manifest.ts` 的工具清单里登记，由 `node-capability.ts` 实现；工具数量变化后更新上面的表。通用步骤见[总地图](../README.md)。
