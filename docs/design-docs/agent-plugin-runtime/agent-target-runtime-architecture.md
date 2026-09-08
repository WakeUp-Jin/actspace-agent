# ActSpace v2 Runtime 与 Composition

> 状态：当前启动与生命周期说明，2026-09-08 按源码校准。整体职责见[总体架构](agent-target-overall-architecture.md)，演进取舍见 [Profile-first 决策](agent-decision-profile-first-headless-desktop.md)。

## 1. 两种 Profile 与应用所有权

生产 Profile identity 为 `actspace.headless` 与 `actspace.desktop`。CLI 的业务命令为 `run`，通过 headless Profile 完成一次请求；Desktop 通过自己的 App Bundle 承担会话应用操作。每个 Host 进程持有自己的 root，不能把架构图理解成跨进程单例。

- `packages/headless` 提供 `headless.runner`；CLI 调用 `run()` 并负责输出与退出。
- `packages/desktop-app` 提供 `desktop.app`；`DesktopAppService` 包含会话创建/恢复/分支、run、Inbox、abort、flush、metadata 和辅助文本调用。
- Runtime Boot 返回启动结果与生命周期操作，不重新聚合出另一套通用业务 facade。
- Host 适配器通过包的公开 exports 和本进程 Context 接入应用 Service。Context、Fiber 与 Service 实例不序列化到 IPC、renderer 或 Journal。

## 2. 两种启动结果不能混称

| API | 返回类型 | 实际成员与用途 |
|---|---|---|
| `@actspace/boot` 的 `bootProfile()` | `BootedProfile` | `context`、`root`、`configPath`、`manifest`、`shutdown()`；用于已解析 Profile 的基础启动，shutdown 返回 Cordis lifecycle probe |
| `@actspace/runtime` 的 `bootProfileRuntime()` / `bootRuntime()` | `BootedRuntimeProfile` | `context`、`root`、`manifest`、`getState()`、`getDiagnostics()`、`recordDiagnostic()`、`requestRestart()`、`shutdown()`；生产 Host 使用，shutdown 返回 Runtime shutdown result |

生产 `bootProfileRuntime()` 委托 `bootRuntime()`，后者使用 `bootDshCordis()`；它不是对基础 `bootProfile()` 返回值的同名重导出。两者都允许受信任的同进程调用方访问 Context，但都不包含通用 Session/run 业务方法。

源码真源：`packages/boot/src/dsh-boot.ts`、`packages/runtime/src/runtime/profile-runtime.ts`、`packages/runtime/src/runtime/boot.ts`。

## 3. Composition 与 Loader

`composeRuntimeProfile()` 选择 kernel/base 与应用 Bundle，应用 Profile/Home/Invocation Patch 和 Host ceiling，产出不可变 `ResolvedComposition`。Desktop App Bundle 由 Desktop Host 提供；组合描述不拥有运行实例或 Fiber。

受控 `cordis.yml` 是行为装载的文件载体，不是第二份可独立改变语义的配置事实源。`assertLoaderTransport()` 对包含 transport name 的组合条目校验文件中的 id/name/inject；不把这项校验夸大成任意 YAML 的完整语义验证。

Static Manifest 保留 identity、codec、依赖与准入信息；Behavior 由 Cordis Include/Loader 执行 `apply(ctx, config)`，领域对象在 plugin tree 中创建。恢复需要的 codec 先于行为激活发现，不以启动旧行为作为解码历史事件的前提。

Profile/Patch schema、digest 和 transport parity 已有实现；restart-only、one-shot 与全域 Service metadata 的剩余收口见 [P1-C](../../exec-plans/active/20260829-actspace-p1-profile-bundle-patch/README.md)及 [P1/P2](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md)，不能因组合类型已存在就宣称所有目标完成。

## 4. 生产 Boot 顺序

1. 取得进程内启动占用，要求显式 `composition` 和 Cordis `configPath`，拒绝缺省回到旧启动路径。
2. 读取组合 manifests 并发现 codec，建立 diagnostics、Host ports、Session/Agent/Prompt 等宿主事实。
3. 创建 root；校验 Loader transport；在挂载配置前注入 `actspace.host`。
4. Include/Loader 挂载配置，等待 settlement，验证 required Services 可见。
5. 检查启动 candidate、Entry/Fiber 和 manifest，记录 diagnostics，发布 Context service aliases。
6. 状态进入 ready，返回 `BootedRuntimeProfile`。Host 再取得对应应用 Service。

启动失败进入清理路径，释放已创建 root 和外部 disposer，并恢复进程启动占用；不发布半初始化的 Profile。具体错误与清理结果由源码和测试决定，文档不承诺所有外部资源均能无条件关闭。

## 5. Shutdown 与 restart

生产生命周期为 `booting → ready → quiescing → disposed`。`requestRestart()` 报告需要重启，不在线重写已激活插件树；配置更新仍要求受控 shutdown 后重新 Boot。

`shutdown()` 先将 state 与 Run controller 置为 quiescing，再等待 candidate/root、领域资源及 Host 扩展的 disposer。Session flush、取消与 Effect 清理由各自生命周期实现负责，Bootstrap 不通过另一个通用业务句柄逐条调度。

当前 graceful 等待默认为 30 秒，超时后再次请求停止接纳，并追加 5 秒最终等待。失败或超时记录 `SHUTDOWN_INCOMPLETE` 并抛出 `RuntimeShutdownFailure`；只有完成清理才进入 disposed 并释放启动占用。Host 必须处理失败结果，不能把退出进程当作持久化成功证明。

CLI 在单次命令 finally 中等待 Profile shutdown；Desktop 退出还需协调 Terminal、Host 扩展与 Electron 资源。真实 reload/quit/flush、Provider 和发行制品验收继续保留在各任务摘要。

## 6. 固定边界与验证

- renderer 只通过稳定 DTO 与 IPC 消费应用事实，不运行插件前端代码。
- Host ceiling 是受信任同进程插件的准入与能力契约，不是 OS 沙箱。
- raw JSONL Journal 是持久事实源；Projection、live progress、diagnostics 分开。
- Browser Bridge 是顶层 Host capability，不进入通用 TypeScript 插件目录。
- 不把部分实现的 P1/P2、Session Projection 目标写成已通过完整验收。

验证分层见 [Agent 测试策略](agent-testing.md)。当前源码中已删除的 RuntimeHandle/RuntimeFacade 仅在历史决策中保留解释，不构成待恢复的公共 API。
