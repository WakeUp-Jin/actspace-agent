---
description: "命令沙箱：策略合并、按能力选后端、执行生命周期，以及 nono 和 Seatbelt 两个后端。"
kind: "package-group"
---

# sandbox

限制命令能访问的文件和网络。`sandbox` 提供服务和策略，决定“怎么选后端、怎么跑”；`sandbox-nono`、`sandbox-seatbelt` 是可替换的后端，启动时把自己注册进服务。是否进沙箱不由沙箱插件决定：由调用方（`tool-shell` 的审批）算出，Host 端口 `actspace.host.sandbox` 是唯一启动进程的地方。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `sandbox` | 接口 | 会话 | 开 | 沙箱服务：策略合并、后端注册表与选择、执行生命周期、状态；提供 `sandbox`，不接受任何配置 |
| `sandbox-nono` | 实现 | 会话 | 开 | 跨平台的 nono 后端（优先级 100） |
| `sandbox-seatbelt` | 实现 | 会话 | 开 | macOS Seatbelt 后端（优先级 50） |

## 包之间怎么连

```
actspace.host.sandbox（Host 端口：spawn / run）
        ↓ inject
     sandbox ──provides──→ `sandbox` 服务 ←── register(backend) ── sandbox-nono
        ↑                         ↑                              └─ sandbox-seatbelt
   tool-shell（可选 inject）   harness-evaluation（inject）
```

- `sandbox` inject `actspace.host.sandbox`，提供 `sandbox` 服务。后端按优先级排序，选择时要求所需能力全部是 `full`；没有任何可用后端就返回原因。
- `sandbox-nono`、`sandbox-seatbelt` 都 inject `sandbox` 和 `actspace.host.sandbox`，在 `apply` 里 `sandbox.register(createXBackend(host))`，卸载时自动取消注册。后端实现 `SandboxBackend`（`id`、`priority`、`probe()`、`prepare(policy)`，定义在 `sandbox/src/types.ts`）。
- 使用方依赖的是接口包：`tool-shell` 可选 inject `sandbox`（没有沙箱时 Bash 改走审批），`harness-evaluation`（在 [`harness-evolution/`](../harness-evolution/README.md)）用 `sandbox` 跑候选 Harness 的评估。
- 三个包的清单行都带 `admitOnHost: true`，Host 的基础组合会准入它们的 manifest；行为只在每个会话的 Harness 里加载。

## 入口与测试

- `sandbox/src/service.ts`、`select.ts`、`policy.ts`、`execution.ts`、`types.ts`、`node-ports.ts`；后端：`sandbox-nono/src/backend.ts`、`sandbox-seatbelt/src/backend.ts`。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/sandbox test`，其他包同理。
- 设计见[沙箱设计](../../docs/design-docs/execution-safety/agent-沙箱设计.md)。

## 怎么扩展

**新增一个沙箱后端**（例如 Linux 的 bwrap）要改的地方：

1. 新建 `sandbox/sandbox-<名>`：`src/manifest.ts`（含 `display`，inject `sandbox`、`actspace.host.sandbox`，Host 能力 `process`）、`src/plugin.ts`（照 `sandbox-nono` 的 `apply` 注册后端）、`src/backend.ts`（实现 `SandboxBackend`，设定 `priority`）、生命周期测试。
2. 在 `core/runtime/src/plugin-catalog.ts` 加 import 和一行（`loaders: harness`，`directory: "sandbox"`，`admitOnHost: true`，放在其他沙箱行之后）。
3. 把包加到 `core/runtime/package.json` 的依赖、`core/runtime/tsconfig.build.json` 的 `references`，把 manifest 和 package.json 路径加进 `scripts/contract-matrix/source-registry.mjs`。
4. 运行 `pnpm --filter @actspace/runtime build && pnpm generate:plugin-loader && pnpm gen:contract-matrix`。
5. 在上面的包表里加一行，跑 `pnpm check:packages && pnpm check:docs`。

`sandbox` 和 `tool-shell` 不用改。通用步骤见[总地图](../README.md)。
