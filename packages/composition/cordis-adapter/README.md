# Cordis adapter

唯一允许直接接触 DSH Cordis 类型和 exact package family 的 ActSpace boundary。领域 package 只依赖这里的 ActSpace Plugin ABI。

本包封装现有 Cordis/Loader、插件 manifest、behavior/codec 与显式来源加载。旧 `source-loader` 的配置和 integrity 语义保持不变。

## 固定插件产物

`publishPluginArtifact({ sourceRoot, artifactRoot, plugin, files, sharedModules? })` 接受已构建 ESM 和显式文件闭包。每个文件读一次，AST 检查导入，复制到 staging，再按内容身份发布；已有身份先核验再复用。`verifyPluginArtifact` 在准入时重新校验磁盘字节，`importArtifactModule` 只加载已核验产物中列出的模块。发布失败只清理本次 staging，不删除其他产物。

支持 `.mjs` / ESM `.js`、相对静态导入、字面量动态导入及枚举的资源文件；Node builtin 保留。显式共享 Host 模块提供 specifier、文件 URL 和入口 SHA-256，导入改写到该 URL，准入时再次校验；其传递依赖由 Host 负责固定。不要把 Cordis 复制成第二个框架单例。共享 URL 是 Host 环境身份的一部分，不承诺跨机器搬迁后摘要相同；可编辑源目录位置不进入内容身份。

拒绝路径越界、symlink、缺失依赖、未批准的外部导入、非字面量动态导入、直接 require/eval 和原生 `.node` 文件。TypeScript 是现有版本的运行依赖，仅作 AST 解析，不在此编译或打包。调用方必须提供已经构建完成的目录；并发写源目录不具有事务快照保证。

文件清单无法证明任意 JS 的隐藏依赖完整，也不限制任意 `fs` 调用。产物存储由调用方保护为不可变；这是受约束、可信插件的加载协议，不是恶意代码沙箱。相同模块 URL 会共享 ESM 缓存，模块全局可变变量不能承载组合实例状态。释放实例不卸载 ESM 缓存，也不自动删除磁盘产物。

## 隔离组合树

`mountIsolatedCordisTree({ parent, entries, sharedServices, decorate? })` 使用既有 Host root 的 Loader，在独立内存树和 group realm 中装配服务。entry ID 复用 manifest 的 identity 校验规则，`harness` 为内部保留 ID。不同树可有同名服务；本树 provider/consumer 使用普通 Cordis 注入。Host 能力须明确列入 sharedServices，不能与本地提供者重名。

普通 `provide` 在调用前检查 manifest 声明，激活后核验服务与 realm。返回的 `getService` 只查询本树服务；不改 Host baseUrl，不重写 Host Loader 的模块表。scope 由上层通过 decorate 注入，adapter 不依赖 core-scope。需要按 scope 发事件，普通无目标广播仍保持 Cordis 的广播语义。

`dispose()` 幂等并等待本树清理，保留 Host。Cordis 本身会记录部分 teardown 异常而不拒绝 dispose；此入口按树归属捕获这些错误，并以 AggregateError 汇报。它不接管任务取消或 Host 关闭。

## 按定义取用服务

一个服务取出来是什么类型，由它的定义说了算，提供方和取用方用同一个定义。写法都在 `src/service-access.ts`。

定义有三种来源，由类型所属的包声明一次并导出：

| 写法 | 什么时候用 |
| --- | --- |
| `bindServiceType<T>(ACTSPACE_SERVICE_DEFINITIONS.x)` | id 在总表（`src/service-contract.ts`）里。总表在本包，写不了各个包的类型，由类型所属的包补上 |
| `serviceKey<T>("id")` | id 不在总表里：Host 交给 Harness 的端口，或没进总表的服务 |
| `serviceView<T>("id")` | 取用方不能依赖服务所属的包（下层包取上层包注册的服务）。只写自己用到的成员，不能拿来注册 |

取用和注册：

- `getService(ctx, KEY)`：没注册时是 `undefined`。
- `requireService(ctx, KEY, "取用方")`：没注册时报 `<取用方> requires <id>.`。
- `getLeasedService(lease, KEY)`：从 Harness 租约上取。
- `provideService(ctx, KEY, value)`：`value` 不满足定义的类型时编译不过。

视图是取用方单方面的声明，本包核对不了它和真实服务对不对得上。`@actspace/runtime` 同时依赖两边，在它的 `src/startup/service-views.ts` 里每个视图有一行 `Covers<真实服务, ServiceOf<typeof 视图>>`：服务改了签名而视图没跟上，那一行编译不过。新增视图时在那里补一行。

会被工具插件引用的定义，放在只引类型的模块里（`agent`、`tool-runtime`、`llm-service` 各有一个 `service-keys.ts`，包标了 `"sideEffects": false`）。Default Harness 把每个工具插件单独打包，定义和服务的实现类写在同一个模块里时，实现会被一起打进工具插件的产物。

`pnpm check:service-access` 拦四种写法：按 id 取出后自己断言类型、直接调 `.getService()`、有定义的服务按字符串 id 注册、视图不是导出的常量或没有对照行。可以保留的地方按「文件加处数」记在 `scripts/check-service-access.mjs` 的 `ALLOWED` 里，每条写明理由。

## 干预点的注册与分发

干预点是八个要等监听器处理完才往下走的事件：分发方（Agent Loop、Tool Runtime）按监听器的返回值或报错决定怎么继续。名字在 `src/event-contract.ts` 的 `AgentLoopIntervention`。本包在依赖的最底层，引用不到 LLM 和工具的类型，所以只提供形状和入口（`src/event-contract.ts`、`src/dispatch.ts`）：

- `WaterfallHook<TPayload, TResult>`、`SerialHook<TPayload>`：两种监听器形状。每个干预点的契约由分发它的包声明，用模块扩充合并进 `DomainEvents`：`@actspace/agent-loop` 的 `hooks.ts` 声明五个，`@actspace/tool-runtime` 的 `hooks.ts` 声明三个。
- `onHook(ctx, 名字, 监听器)`：注册并返回注销函数。payload、`next()` 和返回值的类型从契约来，监听器不用自己标。`ctx` 不能注册监听器时抛错。
- `waterfallDispatch`、`serialDispatch`：分发方用。payload 和内置行为按契约检查；结果是 `unknown`，因为监听器来自单独构建的插件，分发方检查之后再用。

名字没有契约时，注册和分发都编译不过。插件只用到类型时，写一行 `import type {} from "@actspace/agent-loop"`（或 `@actspace/tool-runtime`）把契约引进来，否则报错说名字不能赋给 `never`。

每个干预点的 payload、结果和运行时怎么处理，见 [Cordis 事件 ABI 的「干预点的类型契约」](../../../docs/design-docs/agent-plugin-runtime/agent-spec-cordis-event-abi-and-eventhub-retirement.md#干预点的类型契约)。源码里直接写 `ctx.on("干预点名字", …)` 会被 `pnpm check:harness-events` 拦下。
