---
description: "Harness 的演进：候选的选择与授权、不重启的热替换、评估，以及帮 Agent 编写和安装插件的工具。"
kind: "package-group"
---

# harness-evolution

Harness 是每个会话里装配好的一组会话插件。这里的包让它能被安全地替换：`harness-control` 管固定产物的选择和授权，`harness-hmr` 在会话之间提交替换，`harness-evaluation` 在沙箱里评估候选，`plugin-manager` 是给 Agent 用的插件开发工具。授权始终由 Host 掌握，没有 Agent 能自己启用候选的入口。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `harness-control` | 库 | 不在默认组合 | — | Host 级固定 Harness 选择服务：准备候选、独立授权、持久启用、恢复与回退；Agent 运行时直接调用，提供 `harness.control` |
| `harness-hmr` | 库 | 不在默认组合 | — | 会话级提交协调：把会话绑定到新的 Harness 选择，不启动、停止或恢复 Run；Agent 运行时直接调用，提供 `harness.hmr` |
| `harness-evaluation` | 库 | 不在默认组合 | — | 在评估沙箱里用 CLI 跑候选 Harness，返回结果文件；提供 `harness.evaluation`，评估候选时单独装配 |
| `plugin-manager` | 工具 | 会话 | 开 | `plugin_manager`、`harness_inspect`：帮 Agent 编写、构建和安装插件；提供 `tools.plugin-manager` |

## 包之间怎么连

```
会话 Harness 里：plugin-manager 插件（两个工具的代理）
                        │ actspace.host.agent 的 evolution
Host 里：agent-runtime 持有 PluginManager ──→ harness-control（准备 / 授权 / 启用）
                        └──────────────────→ harness-hmr（把会话绑定到新选择）──→ harness-control
harness-evaluation ──→ harness-control ，并 inject `sandbox`
```

- `core/runtime` 的 `agent-runtime` 创建 `HarnessControl`、`HarnessHmr`、`PluginManager`，并提供 `harness.control`、`harness.hmr`、`harness.plugin-manager`；`harness-control`、`harness-hmr` 自己的插件入口只在需要独立装配时使用。
- `plugin-manager` 插件是每个 Harness 里的代理：inject `tools.runtime`、`actspace.host.agent`，注册两个工具，调用转给 Host 的 `evolution`；Host 能力 `process`；授权通过 `PluginManager` 的 `authorize` 选项回到 Host。包依赖 `harness-control`、`harness-hmr`、`official-skills`（官方的插件开发 Skill）和 `bundle`。
- `harness-evaluation` inject `sandbox`，可选 inject Host 端口 `actspace.host.harness-evaluation`（没有时服务仍加载并报告不可用）。
- `harness-control` 依赖 `boot`（Harness 组合生命周期）、`composition`、`bundle`、`session-persistence-jsonl`；`harness-hmr` 依赖 `harness-control` 和 `boot`。

## 入口与测试

- `harness-control/src/service.ts`、`authorization.ts`、`selection-store.ts`；`harness-hmr/src/service.ts`；`harness-evaluation/src/service.ts`；`plugin-manager/src/service.ts`、`build.ts`。包 README 见 [harness-control](harness-control/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/harness-control test`，其他包同理。

## 怎么扩展

- 新增一种 Agent 可用的演进工具：放进 `plugin-manager`（或新建 `harness-evolution/tool-<名>`），授权必须走 `harness-control` 的 Host 授权，不要绕过。
- 想让某个包不在默认组合里单独装配：登记到 `PLUGIN_PACKAGES_OUTSIDE_DEFAULT` 并写明原因。通用步骤见[总地图](../README.md)。
