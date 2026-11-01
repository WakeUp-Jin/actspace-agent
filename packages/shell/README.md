---
description: "命令行（Bash）工具：在沙箱里运行命令，长命令转后台。"
kind: "package-group"
---

# shell

`tool-shell` 是给模型用的 `bash` 工具。它自己不实现沙箱和后台任务，而是接两个别的能力：命令默认进 [`sandbox`](../sandbox/README.md)，转后台的命令登记到 [`background-tasks`](../background-tasks/README.md) 的 Host 登记表。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `tool-shell` | 工具 | 会话 | 开 | `bash` 工具：命令前缀与规则、权限评估、沙箱判断、前台和后台执行；提供 `tools.shell-tools` |

## 包之间怎么连

- inject `tools.runtime`、Host 端口 `actspace.host.tools.shell-tools`（真正启动进程的实现，`node-ports.ts`）和 `actspace.host.background-tasks`（后台任务登记）。
- **可选** inject `sandbox`：有沙箱服务时命令进沙箱；没有（例如沙箱插件被移除）时，Bash 改走审批。依赖的是接口包 `sandbox`，不是 `sandbox-nono` / `sandbox-seatbelt`。
- manifest 声明 Host 能力 `process`。
- 转后台的进程仍归本包持有，卸载 Harness 会结束进程；完成通知、输出匹配通知、`task_output` / `task_stop` 由 Host 登记表负责，对应工具在 `background-tasks/tool-background-tasks`。

## 入口与测试

- `src/manifest.ts`、`src/plugin.ts`（工具定义与执行）、`src/command-prefix.ts`、`src/command-rules.ts`（命令前缀与规则）、`src/node-ports.ts`。沙箱和出沙箱的细节见[包 README](tool-shell/README.md)。
- 测试在 `tool-shell/src/test/`：`pnpm --filter @actspace/tool-shell test`。

## 怎么扩展

新增命令行类工具时，优先判断是否该并入 `bash` 的参数；确实独立，再新建 `shell/tool-<名>`。要换沙箱后端不在这里改，见 [sandbox](../sandbox/README.md)。通用步骤见[总地图](../README.md)。
