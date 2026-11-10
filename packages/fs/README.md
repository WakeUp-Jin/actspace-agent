---
description: "读、搜索、写工作区文件的模型工具。"
kind: "package-group"
---

# fs

三个独立的工具插件，各管一组文件工具：读（含目录列表和 `present` 交付文件）、搜索、写。拆开是为了让权限、Host 能力和开关各自独立：读和搜索只需要 `filesystem.read`，写需要 `filesystem.write`。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-fs-read` | 工具 | 会话 | 开 | `read_file`、`list_directory`、`present`；提供 `tools.filesystem-read` |
| `tool-fs-search` | 工具 | 会话 | 开 | `grep`、`glob`；提供 `tools.filesystem-search` |
| `tool-fs-write` | 工具 | 会话 | 开 | `edit_file`、`write_file`、`delete_file`；提供 `tools.filesystem-write` |

## 包之间怎么连

三个包结构相同，互不依赖，都只依赖 `tool-runtime`：

- inject `tools.runtime`（工具注册与执行）；**可选** inject 能力授予 `actspace.host.filesystem`（类型 `FilesystemHostGrant`，定义在 `tool-runtime/src/host-ports.ts`：`workspaceRoot`、`resolveArtifact`、`ripgrepPath`）。真正读写文件的实现是包里自己的 `node-ports.ts`，插件 `apply` 用授予里的根目录创建它，随 Harness 产物一起打包；Host 没给授予时（例如 CLI `--mock`）工具照常注册，但每次调用返回 `CAPABILITY_UNAVAILABLE`。
- 插件 `apply` 把工具注册到 `tools.runtime`，卸载 Harness 时撤销注册。
- manifest 声明所需 Host 能力：`filesystem.read`（读、搜索）、`filesystem.write`（写）；Host 没有这个能力时 Harness 装配会失败而不是悄悄少工具。能力门禁和审批留在 Host / `tool-runtime`，文件怎么读写由本目录的包决定，Harness 换掉一个包不需要动 Host。

## 入口与测试

- 每个包：`src/manifest.ts`（工具名、Host 能力）、`src/plugin.ts`（工具定义、权限与注册）、`src/node-ports.ts`。
- 测试在各包 `src/test/`（`lifecycle.test.ts`、`node-ports.test.ts`）：`pnpm --filter @actspace/tool-fs-read test`，其他包同理。
- 工具边界见[Tool 插件边界](../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。
- 输出上限（64,000 字符、单行 2,000 字符）和超出时怎么提示模型，见[工具输出与引用](../../docs/design-docs/tool-system/agent-tool-output-references.md)的「工具结果的体积上限」。

## 怎么扩展

新增一个文件类工具：先看它该归入已有的哪个包；需要新的 Host 能力或权限形状时，新建 `fs/tool-fs-<名>`，照 `tool-fs-read` 的结构写 manifest、plugin 和 `node-ports`（可选 inject `actspace.host.filesystem` 拿根目录），并在 `core/runtime/src/plugin-catalog.ts` 加一行；Host 侧不用加端口。通用步骤见[总地图](../README.md)。
