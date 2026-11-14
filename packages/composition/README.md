---
description: "插件 ABI、组合描述（Bundle / Profile / Patch）、解析与启动装配。"
kind: "package-group"
---

# composition

这一层回答“装配哪些插件、怎么装”，自己不是插件，全是库。`cordis-adapter` 是唯一接触 Cordis 的边界，定义插件 ABI；`bundle` 是描述类型；`composition` 把描述解析成可启动的组合；`boot` 负责启动与 Harness 组合的生命周期。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `cordis-adapter` | 接口 | 库 | — | 唯一允许直接接触 Cordis 的 ActSpace 边界：插件 manifest 与 ABI、behavior / codec 加载、固定插件产物、隔离组合树、服务与事件契约；按定义取用和注册服务、按名字注册干预点监听器的入口也在这里 |
| `bundle` | 接口 | 库 | — | 组合描述的类型：`Bundle`（一组 manifest）、`Profile`（有序的 Bundle）、`Patch`（替换、插入、禁用等操作）、`CompositionEntry` |
| `composition` | 库 | 库 | — | 把 Profile、Bundle 和各层 Patch 解析成 `ResolvedComposition`：校验 manifest、应用补丁、检查 Harness 兼容性、输出配置快照 |
| `boot` | 库 | 库 | — | 启动 Host 的 Cordis 树（`bootDshCordis`、`trusted-boot`）；Harness 组合的挂载与代际管理（`mountHarness`、`HarnessGenerations`） |

## 包之间怎么连

```
cordis-adapter（ABI、manifest、隔离树）
     ↑          ↑
   bundle ← composition ← boot（还依赖 diagnostics、shared、scope）
```

- 所有插件包只通过 `cordis-adapter` 接触 Cordis，它自己不依赖任何 `@actspace` 包。
- `core/runtime` 用 `bundle` 写出 Host 的基础 Bundle（`runtime/src/profiles/`），用 `composition` 解析，用 `boot` 启动 Host 并为会话挂载 Harness；`harness-control` 复用 `boot` 的代际管理。
- 这四个包本身不出现在插件清单里，它们描述并装配清单里的插件。

## 入口与测试

- `cordis-adapter/src/manifest.ts`、`plugin-contract.ts`、`plugin-artifact.ts`、`cordis-tree.ts`，服务的总表和取用在 `service-contract.ts`、`service-access.ts`，事件的声明和分发在 `event-contract.ts`、`dispatch.ts`；`bundle/src/index.ts`；`composition/src/compose.ts`、`patch.ts`、`harness-patch.ts`；`boot/src/dsh-boot.ts`、`harness-mount.ts`、`harness-generations.ts`。
- 测试：`cordis-adapter`、`composition`、`boot` 在各自的 `tests/`，`bundle` 暂无测试：`pnpm --filter @actspace/cordis-adapter test`，其他包同理。
- 包 README：[boot](boot/README.md)（Harness 组合生命周期）、[cordis-adapter](cordis-adapter/README.md)（固定产物、隔离树、按定义取用服务、干预点的注册与分发）。

## 怎么扩展

- 新增组合层级或补丁种类：改 `bundle` 的类型，在 `composition` 里实现解析，再由 `core/runtime` 的 `profiles/` 使用。
- 新增插件不改这里，见[总地图](../README.md)“新增一个插件”。
