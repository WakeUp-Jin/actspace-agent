---
description: "读 PDF、Word、PPT 文档的模型工具。"
kind: "package-group"
---

# document

`tool-document` 用 DeepSeek OCR 读 PDF、Word、PowerPoint 的文字。上传和解析由 Host 端口完成（Key 在 Host），插件只定义工具、校验参数、登记到工具运行时。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-document` | 工具 | 会话 | 开 | `read_document`；提供 `tools.document` |

## 包之间怎么连

- inject `tools.runtime`；Host 端口 `actspace.host.tools.document` 是可选注入，没有时不注册工具。
- manifest 声明 Host 能力 `network`、`filesystem.read`。
- 设置「工具 › 多媒体 › 文档解析」开关和 DeepSeek Key 决定工具对模型是否可见，不影响插件加载；插件本身在「扩展 › 插件」里不能关。

## 入口与测试

- `src/manifest.ts`、`src/plugin.ts`；契约见 [DeepSeek 深度搜索与文档解析工具](../../docs/design-docs/tool-system/agent-deep-search-and-document-parsing.md)。
- 测试在 `tool-document/src/test/`：`pnpm --filter @actspace/tool-document test`。

## 怎么扩展

换解析后端：改 Host 端口的实现。通用步骤见[总地图](../README.md)。
