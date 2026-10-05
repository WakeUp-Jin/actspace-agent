# Profile / Bundle / Patch 分层规范

> 状态：P5 当前分层，2026-10-04。Host/Profile 与可选择的 Harness 组合有不同生命周期；不得把运行中切换选择误写成重启整个 Host。

## 1. 决策摘要

```text
Profile
  → Ordered Bundles
  → Profile Patch
  → Home Patch
  → Invocation Patch
  → Host Capability Ceiling
  → ResolvedComposition
  → BootManifest
  → Cordis Loader
```

`ResolvedComposition / BootManifest` 是唯一的激活事实源。`cordis.yml` 是组合输入或 Loader transport，不是另一份独立的插件清单。任何 Host、Runtime 或测试 fixture 都不得同时维护第二套生产激活列表。

## 2. 解决的问题

早期 P1-C 实施前，仓库已有 `@actspace/bundle`、`@actspace/composition` 和 `createProfileComposition()`，但 Boot 同时看 `ResolvedComposition` 和静态 `cordis.yml`。这会产生“digest、diagnostics 和实际 Loader tree 不一致”的风险，也让 Patch 无法完整表达最终启动事实。

现已将 Profile/Bundle/Patch 收敛为唯一解析过程，所有 Host 消费同一份结果；下面规定当前契约。

## 3. 三层定义

### 3.1 Profile

Profile 是命名的运行配方，只选择顺序和覆盖策略：

```ts
interface Profile {
  id: string
  runtimeContract: "actspace.runtime.v2"
  orderedBundleIds: readonly string[]
  patch?: Patch
}
```

Profile 不包含已激活的 Service 实例，不保存 Host credential，不直接执行模块。

### 3.2 Bundle

Bundle 是可审计、可分发的 Entry/Manifest 集合：

```ts
interface Bundle {
  id: string
  version: string
  manifests: readonly PluginManifest[]
  provenance: string
}
```

Bundle 只描述默认代码、Codec、Behavior、Service、事件、Host capability 和默认 config。一个 Bundle 不能隐式读取另一个 Bundle 的私有配置。

### 3.3 Patch

Patch 只按稳定 Entry id 操作：

```ts
type PatchOperation =
  | { id: string; kind: "replace"; target: string; artifactId: string; manifestEntryId: string; optional?: boolean }
  | { id: string; kind: "insert"; entry: CompositionEntry; after?: string; optional?: boolean }
  | { id: string; kind: "replace-config"; target: string; config: JsonValue; optional?: boolean }
  | { id: string; kind: "disable" | "remove"; target: string; optional?: boolean }
```

Patch 不做隐式 deep merge，不按 package version、数组位置或 module path 猜目标。required target 缺失直接失败；optional target 缺失记录 skipped diagnostic。

## 4. 唯一解析结果

`ResolvedComposition` 保存 Profile/Bundle/manifest、Entry、admission、Patch 结果、Host ceiling、诊断及配置摘要。`BootManifest` 在其上要求 `loaderConfig` 和 `startupRequirements`。准确字段与可选性由 `packages/composition/src/types.ts` 定义，不在文档重复维护另一份接口。

`digest` 必须覆盖 Profile、Bundle identity、Manifest/Entry、Patch results、Service/Codec admission、Host capability ceiling 和最终 Loader config。只读结果创建后不可修改，也不能在 Boot 中重新解析同一输入得到另一份配置。

## 5. 组合顺序和单调性

```mermaid
flowchart TD
  P[Profile] --> B[Ordered Bundles]
  B --> PP[Profile Patch]
  PP --> HP[Home Patch]
  HP --> IP[Invocation Patch]
  IP --> C[Host Capability Ceiling]
  C --> R[ResolvedComposition]
  R --> M[BootManifest]
  M --> L[Cordis Loader]
```

固定顺序：

1. 读取 Profile 并展开 `orderedBundleIds`。
2. 校验 plugin id、Entry id、manifest schema 和 Bundle provenance。
3. 依次应用 Profile、home、invocation Patch。
4. 应用 Host capability ceiling；只能减少能力，不能创造 Host capability。
5. 检查 required Entry/Service/Codec、inject cycle、frontend required 和冲突。
6. 生成 `ResolvedComposition`、脱敏 diagnostics 和 digest。
7. 将同一结果交给 Trusted Boot 和 Cordis Loader。

禁止：

- Loader 再读取一份未经过 composer 的生产插件列表；
- Host 根据自己的数组顺序补装 core plugin；
- Patch 绕过 required capability 或 frontend ceiling；
- 修改已被 Run 固定的组合实例；Host/codec 变更仍需兼容检查与重启；
- 为 CLI、Desktop、测试各维护不同的默认 Profile 事实。

## 6. `cordis.yml` 的定位

`cordis.yml` 有两种允许用途：

1. **Authoring source**：作为 Profile/Bundle 的声明输入，被 Composer 解析成 `ResolvedComposition`。
2. **Loader transport**：当 Cordis Loader 只接受文件路径时，由 Boot 根据已解析结果生成一次受控的、不可变的 Loader config，再通过同一个 Loader 加载。

它不再是独立的运行时真源。`apps/cli/cordis.yml`、`packages/runtime/cordis.yml` 和测试 fixture 必须明确标注其角色；默认 CLI 不得出现“Composition digest 来自 A、Loader entries 来自 B”的组合。

## 7. Host capability ceiling

Host 先声明 capability ceiling，再由 Composer 做 admission：

```text
required capability 缺失 → required Entry 启动失败
optional capability 缺失 → Entry skipped + diagnostic
frontend.required=true   → 固定 renderer 不支持时启动失败
frontend.required=false  → 忽略并告警，不执行插件前端代码
```

Host ceiling 是单调上界：Invocation Patch 可以禁用能力，不能添加 `browser`、`credential`、`filesystem.write` 或 renderer 等 Host 未提供的能力。

## 8. Service / Codec admission

Composer 不创建 Service 或 Codec 实例，但必须产出 admission 证据：

- 每个 required Service 有唯一 Provider；
- `provides/injects` 与 Service Definition 一致；
- Durable Codec 在 Behavior activation 前可被发现；
- Codec owner、criticality、version 和 namespace 合法；
- required provider 缺失时 Boot fail closed；
- optional provider 缺失时记录 degraded/skipped 状态。

这样 Session decode 不依赖一个尚未激活、但可能需要读取 Session 的 Behavior 插件。

## 9. Runtime / Host 边界

```text
Host Adapter
  ├─ 准备 Host ports 和 capability ceiling
  ├─ 选择 Profile / Bundle / Patch 并解析 Composition
  └─ 调用生产 Runtime Boot（显式 configPath + composition）

Runtime Boot
  ├─ codec discovery、创建 Cordis root 和 Loader
  ├─ 校验 transport、settlement 和 startup candidate
  └─ 发布 BootedRuntimeProfile

Host 消费 Profile Context
  ├─ headless.runner：单次任务
  └─ desktop.app：Desktop 会话应用操作
```

组合事实保持不可变；启动结果只持有 Context、root、manifest、state/diagnostics、restart 通知与 shutdown，不持有通用 Session/run API。Context 可由受信任的同进程调用方使用，不跨 IPC/renderer。唯一生产 BootedRuntimeProfile 的边界见 [Runtime 文档](agent-target-runtime-architecture.md)。

## 10. 简单 Patch 与组合切换

Patch 是定义变换：旧定义应用差异后产出完整新定义，再独立验证、装配和启用。不是对旧 live tree 做实例交换。

1. Host/Profile 基底保持运行，提供稳定服务和能力上界。
2. 候选引用固定产物，验证服务、事件、codec 与 Host 能力契约，完整装配新的 Harness。
3. 准备或启用失败保留原选择；成功后新 Run 取得最新组合。
4. 旧 Run 的 Loop、工具和插件实例保持原样，至最后一个 Run 释放后回收旧组合。
5. 同一 Session 的下一次运行不必新建会话；子 Run 在启动时独立选择最新组合。

不实现跨组合插件实例共享、插件级引用计数、自动影响图或增量树交换。固定文件可复用不代表实例复用。机制实验留在 cordis-adapter 测试，不能作为生产能力承诺。

Host Profile、codec 读取规则或基底服务变化走受控重启和兼容检查；不可在线改变历史解码。未来自进化先作用于 Harness，当前不提供源码自改工具或自进化控制流程。

## 11. 验收标准

1. CLI run、Desktop 和 fixture Boot 均从同一 `ResolvedComposition/BootManifest` 进入 Loader。
2. `digest` 能检测 Profile、Bundle、Patch、Host ceiling 或 loader config 的任一变化。
3. required/optional capability、frontend、Service conflict、Codec discovery 和 Patch target 行为有测试。
4. 生产默认路径不使用 `serviceValues`、手工 core activation 或第二份插件列表。
5. `cordis.yml` 的 authoring/transport 角色在文件和 diagnostics 中可识别。
6. Host 重启边界、失败候选保留原选择、新旧 Run 隔离与最后释放有 contract tests。
7. CLI 单次无头 `run` 的 boot → submitTask → Run settlement → flush → dispose 回归通过。

## 12. 回退和非目标

P1-C 不迁移 Session 数据、不改 Tool executor、不实现 CLI chat、不增加动态插件沙箱或远程下载。若 Loader 暂时只能接收文件路径，回退到 Boot 生成受控 transport 文件；不能回退到第二套 `activate()` 业务激活协议。

## 13. 参考

- [DSH 风格 Runtime 插件组装规范](agent-spec-dsh-plugin-assembly-and-agent-startup.md)
- [插件 Runtime ABI](./agent-spec-plugin-runtime-abi.md)
- [核心 Service 分层规范](./agent-spec-service-definition-provider-consumer.md)
- `packages/bundle/src/index.ts`
- `packages/composition/src/compose.ts`
- `packages/runtime/src/profiles/composition.ts`
- `packages/runtime/src/startup/boot.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
