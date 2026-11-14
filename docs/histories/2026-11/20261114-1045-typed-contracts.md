## [2026-11-14 10:45] | Task: 事件、服务、干预点三处按名字定类型，各加一个检查防止再写回去

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）……M9、M10 应该也可以修。……都可以按照你的建议去做吧。……没有完成的话继续

这是审查修复批次的第 6 个 PR，条目是 M10。计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。同一个 PR 里修的 `session.storage` 包装服务漏转发另有一份 history（`20261114-0200-session-storage-wrapper-forwarding.md`），这里不重复。

### 🛠 Changes Overview

**Scope:** `packages/composition/cordis-adapter`、`packages/util/shared`、`packages/core/{agent,agent-loop,agent-service,runtime,tool-runtime}`、`packages/session/*`、`packages/llm/llm-service`、`packages/context/*`、各工具插件包、`packages/host/*`、`packages/subagent/*`、`packages/harness-evolution/*`、`apps/cli`、`apps/desktop`、`scripts`

**Key Actions:**

三组改的是同一类问题：名字是字符串，类型由用的地方自己断言，名字或字段写错编译器不报。

| 组 | 改之前 | 改之后 |
| --- | --- | --- |
| 事件（`a95c4f01`） | 往会话日志里写 `@actspace/core` 名下的事件，靠各包自己的 `core(type: string, data)`：7 份拷贝，6 份返回 `as never`；另有 9 处直接写对象。合计 13 个文件 16 处 | 42 种事件的 `data` 记在 `@actspace/shared` 的 `CoreEventDataMap` 一张表里，只从 `coreEvent(type, data)` 写。63 个调用点，13 个文件，9 个包 |
| 服务（`291342c6`） | `ctx.get?.("llm.service") as LlmServiceContract \| undefined`：52 个文件 132 处；直接调 `.getService()` 7 处；按字符串 id 注册 38 处 | id 和类型绑在一个定义上，57 个 id 共 77 个定义。`getService`、`requireService`、`provideService`、`getLeasedService` 四个函数按定义取用和注册，167 处。剩 9 个文件 11 处记在检查的清单里 |
| 干预点（`e330de17`） | 八个干预点（7 个 waterfall、1 个 serial）声明成同一个宽松的形状，payload 是 `Record<string, unknown>`。Loop 为了凑类型写了 5 处 `as unknown as` | payload 和结果按名字定类型，契约由分发它的包声明（`agent-loop`、`tool-runtime` 各一个 `hooks.ts`）；监听器用 `onHook(ctx, 名字, 监听器)` 注册 |

- **三个检查**，都接进 `pnpm test:scripts`。旧写法仍然能编译，没有检查就拦不住下一处：
  - `pnpm check:core-events`（`1509bb8c`）：不许绕过 `coreEvent` 手写带 core 来源的事件。
  - `pnpm check:service-access`（随第 2 组，用例在 `8622ae7c` 补齐）：不许按 id 取出后断言类型，不许直接调 `.getService()`，有定义的 id 不许按字符串注册，每个视图都要有对照行。
  - `pnpm check:harness-events` 新增一条（随第 3 组，`e863e728` 补查 `.tsx`）：干预点的监听器不许直接用 `ctx.on()` 注册。
- **顺带修的原有问题**，都是给接口写类型时发现的，`main` 上同样存在：
  - `llm/stream` 的监听器不调 `next()`、直接给出流时，准备好的那次调用占着的路由不归还，这条路由之后注销会等到超时（`5cb8589f`）。
  - `session.storage` 的包装服务漏转发三个方法（`d3716f26`，见另一份 history）。
- **规范按代码改的两处**：`agent/pre-step`、`agent/turn-stopping` 两个干预点，规范写的能力代码里没有实现，见下面「设计意图」。
- **恢复一处读取时机**（`5881f29c`）：第 2 组把 `plugin-manager` 读 Host 端口的时机改了，对照改动前后时发现，改了回去，见下面「对提交说明的更正」。

### 🧠 Design Intent (Why)

**事件表放在 `shared`，不放在 `session-journal`。** 写这些事件的 13 个文件分在 9 个包里，其中 `desktop-app` 这样的 Host 包只为了拼一条事件才依赖 `session-journal`；`shared` 在最底层，谁都能引。`session-journal` 的 codec 仍然负责运行时校验，并加了一行编译期检查：表里有、codec 没登记的事件名编译不过。

**`session.append` 的参数类型不收紧。** context、task、todo 这些插件写自己名下的事件也走它，事件名和 `data` 由各自的 codec 管，收紧到 core 的表会把它们挡在外面。代价是手拼一个带 core 来源的对象仍然能编译，所以加 `pnpm check:core-events`。

**定义由类型所属的包声明。** `cordis-adapter` 在依赖的最底层，引用不到各个包的类型，写不出一张带类型的总表。总表里已有的条目用 `bindServiceType<T>` 补上类型（15 个），不在总表里的用 `serviceKey<T>(id)`（42 个）。

**下层包取上层包注册的服务用视图。** 为了拿类型去反向依赖，会被 `pnpm check:packages` 的依赖环检查拒绝。`serviceView<T>(id)`（20 个）只写取用方用到的成员，不能拿来注册。视图是取用方单方面的声明，和真实服务对不对得上，由同时依赖两边的 `@actspace/runtime` 在 `startup/service-views.ts` 里逐行核对：服务改了签名而视图没跟上，对应那一行编译不过。检查脚本确认每个视图都有对照行、两边是同一个 id。

**会被工具插件引用的定义放在只引类型的模块里。** Default Harness 把每个工具插件单独打包。定义和服务的实现类写在同一个模块时，实现类会被打进每个工具插件的产物。所以定义放在各包的 `service-keys.ts`，`agent`、`tool-runtime`、`llm-service` 三个包标 `"sideEffects": false`。在第 2 组那次提交上量：内核 339,617 → 343,721 字节（多 4,104），14 个工具插件合计 283,199 → 272,234 字节（少 10,965）。

**两个 app 各留一处断言。** CLI 和桌面端主进程只能动态加载 Runtime，拿不到定义这个值。Runtime 导出类型 `ProfileServices`（7 个 id 对应的类型），两个 app 各有一个 `profileService(profile, id)`，app 里的断言只剩这一处。这张表必须逐行写明类型：整体推导时声明文件里会出现以仓库根目录为起点的路径（`import("packages/…")`），app 解析不到，类型悄悄变成 `any`。两个 app 各加一行编译期检查守着。根因是 `tsconfig.base.json` 的 `baseUrl`，不在这个 PR 里改，见计划的决策记录。

**干预点的契约由分发方声明，分发结果是 `unknown`。** `cordis-adapter` 写不了 payload 的类型（引用不到 LLM、工具的类型），所以契约由 `agent-loop`、`tool-runtime` 用模块扩充合并进去；插件要先引入声明契约的包，否则名字编译不过。监听器来自单独构建的插件，编译期的类型约束不到运行时拿到的值，分发方本来就逐个字段检查，结果类型写成 `unknown` 让这些检查省不掉。

**规范和代码对不上的两处按代码改规范。** `agent/pre-step` 规范写「接受、改写或跳过候选 step」，Loop 只把返回值写进 `step/start` 的 `metadata`；`agent/turn-stopping` 规范写「返回第一个继续 / 停止决策」，Loop 不读返回值。补能力是新功能，要定「跳过一步之后这一轮怎么继续」「监听器要求继续时循环怎么走」，不是类型安全这一条的范围；类型契约照着没实现的能力写，会让插件作者以为返回值有用。要不要补记在 `docs/exec-plans/tech-debt-tracker.md`，由仓库所有者决定。

**lease 在读完流之后归还，不在钩子返回之后。** 监听器可以等流被读取时才调用 `next()`；钩子一返回就归还，这种写法会收到 `Prepared LLM call has been released`。

**三个检查都只按文本匹配。** 认不出哪些写法写在各自脚本开头。前两个的例外按「文件加处数」记清单，处数多了少了都失败；第三个没有例外。

### ✅ Verification

三组的提交说明都写了「运行时行为不变」。这一节写这句话是怎么核对的，以及核对出来的例外。

**第 1 组：写出去的事件有没有变。** 用 TypeScript 的语法树把改动前后「构造一条 core 事件」的地方都找出来：改之前 71 处（调各包自己的构造函数，或者直接写对象），改之后 69 处。其中 67 处的文件、事件名、`data` 的表达式、`surface` 和 `provenance` 逐字相同。剩下的是两个文件：`loop.ts` 有一处把只为断言而起的别名变量去掉了，值是同一个；`evolution-approval.ts` 的三处调用前后都经过同一个本地函数，函数里拼的字段没有变。事件对象的字段顺序和原来各份构造函数相同。

**第 1 组：类型拦不拦得住。** `shared` 4 条用例固定 `coreEvent` 输出的形状。桌面端 renderer 有 6 条必须编译不过的反例（事件名没登记、字段名写错、少必填字段、取值不在范围内等）；把其中一条改对，`tsc` 报 TS2578。

**第 2 组：取用和注册的 id 有没有变。** 把改动前后每个文件里「把一个已知的服务 id 传给某个调用」的地方都找出来（已知的 id 共 70 个；改之后经过定义的，按定义解析出 id），逐个文件比较「取用还是注册、哪个 id」。前后都是 255 处，分布在 69 个文件，每个文件都一致。

**第 2 组：服务不在时的表现有没有变。** 改之前的 132 处断言里，116 处断言成「可能不在」，16 处断言成「一定在」。后 16 处是：底层接口 1 处（没动）、CLI 的 Agent Host 1 处、`plugin-manager` 2 处、另外五个插件 12 处。`requireService` 现在有 38 处：26 处替换的是原来的显式判断或本地辅助函数，报错文案逐条对过，相同；12 处是新加的判断，就是上面那五个插件。这一步和下一步一共核对出三处提交说明没有列的差别，写在下面「对提交说明的更正」。

**第 2 组：其余的改动。** 非测试代码的改动（122 个文件，+895 / −461）整份读过一遍，除了上面说的，没有别的不是机械替换的运行时改动。`"sideEffects": false` 的三个包另外扫过：64 个源文件，顶层语句只有声明、导入和导出，没有只为副作用而写的导入；仓库里也没有只为副作用引入这三个包的地方。

**第 2 组：类型拦不拦得住。** `cordis-adapter` 的 `service-access.spec.ts` 9 条，其中一条把夹具文件用 TypeScript 编译两遍：原样必须没有报错；去掉 `@ts-expect-error` 后，8 个反例（取了不存在的成员、没判空就用、注册的值形状不对、拿视图注册、总表条目名写错等）必须各自报出指定的错误码。`runtime` 的 `profile-services.test.ts` 核对 `ProfileServices` 每个 id 等于定义自己的 id。两个 app 的编译期检查：把表改回整体推导，两边都报 TS2578。

**第 3 组：分发有没有变。** 产品代码里分发干预点的地方一共 9 处：Loop 6 处（5 个名字）、Tool Runtime 3 处。逐处对过改动前后传的 payload、内置行为和对返回值的处理。Loop 原来的包装函数对传进来的对象字面量什么都不做，缺省的内置行为是「返回 payload」，现在写明在分发的地方；检查监听器返回值的两个函数按原来的条件逐个字段判断。Tool Runtime 只改了类型守卫的签名。目前没有生产插件注册任何一个干预点。

**第 3 组：类型和注册。** `cordis-adapter` 的 `hook-dispatch.spec.ts` 8 条：6 条在真实的 Cordis 根上（按注册顺序一层层进到内置行为、不调 `next()` 时短路、serial 停在第一个有返回值的监听器、注销之后不再被调用、不能注册时报错、没有 context 时只跑内置行为）；2 条编译夹具，14 个反例各自报出指定的错误码。`agent-loop` 的 `hook-listeners.test.ts` 2 条固定上面两处按代码写的行为，各做过一次改错验证。

**三个检查。**

| 检查 | 在改之前的代码上 | 现在 | 把脚本逐处改错再跑用例 |
| --- | --- | --- | --- |
| `check:core-events` | 15 个文件 18 处：当时的 16 处，加上现在清单里的 2 处 | 通过，1,427 个文件 | 55 种改法，每一种都有用例失败 |
| `check:service-access` | 清单留空，139 处：132 处断言，7 处直接调 `.getService()` | 通过，1,468 个文件 | 144 种改法，143 种有用例失败；剩下 1 种改了结果一样 |
| `check:harness-events` 新增的那条 | 0 处（产品代码里本来没有插件注册监听器） | 通过，1,425 个文件 | 78 种改法，每一种都有用例失败 |

第三个在改之前的代码上报不出东西，所以另有一条用例读仓库自己的源码，往里放一处 `ctx.on("agent/request", …)`，确认会报。它一开始只读 `.ts` 文件，309 个 `.tsx`、3 个 `.mts` 没有读，是准备做逐处改错、核对它读哪些文件时发现的（`e863e728`），读的文件从 1,115 个变成 1,425 个。

**lease 修复。** `request-release.test.ts` 新增 2 条。监听器直接给出流：去掉这次改动，报 `did not drain`。监听器在流被读取时才调用 `next()`：把归还挪到钩子返回之后，报 `Prepared LLM call has been released`。

**`plugin-manager` 恢复读取时机。** 新增 1 条用例。把 `plugin.ts` 换回第 2 组的版本，它在「`evolution` 挂载之后才出现」那一步失败；换回第 2 组之前的版本，它在「Host 没有这个端口」那一步失败（抛的是 TypeError）。

**没有验证的。**

- 没有生产插件注册干预点，`onHook` 这条路径只有测试在走。
- CLI 的 Agent Host 新加的那一行启动检查，报错的那个分支没有用例，和它上一行原有的 `Host application plugin unavailable` 一样。正常启动的路径由进程级测试覆盖（`pnpm test:agent-host:process`，真的起一个 `host serve`）。
- 没有在真实的桌面窗口和真实的 Provider 连接上跑过。

全量验证的范围和结果见执行记录步骤 7。

### 对提交说明的更正

仓库约定不改写已有提交，更正写在这里。

`291342c6`（第 2 组）的「行为变化」只列了 CLI 的 Agent Host 一处，后面写「其余不变：注册和取用的 id、报错文案都和原来相同」。id 和原有的报错文案确实没变（见上面的核对），但还有三处没有列：

- **五个插件多了 12 处判断。** `english-learning`（1 处）、`desktop-app` 的会话标题（2 处）、`subagent-claude-code`、`subagent-codex`、`tool-subagent`（各 3 处）原来把取出来的服务断言成「一定在」，不判断；现在用 `requireService`，服务不在时在取用的地方报 `<取用方> requires <id>.`，原来是之后第一次用到时抛 TypeError。这五个插件的 `inject` 都列了这些服务，按 `inject` 挂载时服务一定在，只有绕过 `inject` 直接调用 `apply` 才会走到。
- **`plugin-manager` 读 Host 端口的时机变了。** 原来每次执行工具时读 `host.evolution`，那次提交改成挂载时读一次。目前唯一的提供方给的是冻结对象，`evolution` 是固定字段，产品里看不出差别，但这不是那次改动该带的。`5881f29c` 改回每次执行时读，并加了用例。改回之后和最初的差别只剩一处：Host 端口整个不在时，报 `Harness evolution is unavailable on this Host`，原来是抛 TypeError；同样只有绕过 `inject` 才会走到。
- **压缩插件不再自己拆包装。** 原来有一行 `llmValue.runtime ?? llmValue`，拿到包装服务时取里面的 `LlmService` 来用；现在直接用注册的包装服务。压缩只用到 `routes.list()` 和 `prepareAsync`：包装服务的 `routes` 和里面那个是同一个对象，`prepareAsync` 原样转发。结果相同，多一层函数调用。

数字有一处写错：定义的个数写的是「共 78 个」「`bindServiceType`：16 个」，实际是 77 个、15 个。当时按文本数，把一行注释里的示例也数了进去；用检查脚本自己的解析重数，那次提交上和现在都是 15 + 42 + 20 = 77 个，覆盖 57 个 id。

另外两处数字是那次提交时的，后来变了：检查扫的文件数 1,466 → 1,468，脚本用例 15 → 16 条（`8622ae7c`）。

### 📁 Files Modified

- `packages/util/shared/src/runtime-v2/core-events.ts`（新增）与测试；`apps/desktop/src/renderer/test/core-event-types.test.ts`（新增）
- `packages/composition/cordis-adapter/src/service-access.ts`（新增）、`src/{service-contract,event-contract,dispatch,cordis-root,index}.ts`，`tests/` 下的 `service-access.spec.ts`、`hook-dispatch.spec.ts`（都是新增）、三个夹具和 `support/type-fixture.ts`
- `packages/core/agent-loop/src/hooks.ts`（新增）、`src/loop.ts`，测试 `request-release.test.ts`、`hook-listeners.test.ts`（新增）
- `packages/core/tool-runtime/src/hooks.ts`、`src/service-keys.ts`（都是新增）、`src/prepared-execution.ts`
- `packages/core/agent/src/service-keys.ts`（新增）、`src/{dispatch,inbox,registry}.ts`
- `packages/llm/llm-service/src/service-keys.ts`（新增）、`src/{service,plugin,auxiliary-request}.ts`
- `packages/core/runtime/src/startup/{service-views,profile-services}.ts`、`src/service-keys.ts`（都是新增），`src/startup/{boot,cordis-entry}.ts`，`src/harness/{agent-factory-plugin,agent-runtime-plugin,managed-runs,evolution-approval}.ts`，`src/session/{session-controller,session-plugin,auxiliary-request-recorder}.ts`
- `packages/harness-evolution/plugin-manager/src/plugin.ts` 与测试
- `packages/core/agent-service`、`packages/session/*`、`packages/llm/llm-service`、`packages/context/*`、`packages/background-tasks/*`、`packages/subagent/*`、`packages/host/*`、`packages/harness-evolution/*`、`packages/side-chat`、`packages/english-learning`、`packages/approval/auto-review`、`packages/sandbox/*`、各工具插件包：事件构造、服务取用和注册的调用点
- `apps/cli/src/runtime-v2/{profile-service,host,run}.ts`、`apps/desktop/src/main/runtime-v2/{profile-service,runtime-registry,tool-host-services}.ts`
- `scripts/check-core-event-writes.mjs`（新增）、`scripts/check-service-access.mjs`（新增）、`scripts/check-harness-event-contracts.mjs`、`scripts/contract-matrix/generate.mjs`，`scripts/test/` 下对应的四个用例文件，`package.json`、`pnpm-lock.yaml`
- `packages/README.md`、`packages/{composition,core,session,util}/README.md`、`packages/composition/cordis-adapter/README.md`
- `docs/design-docs/agent-plugin-runtime/` 下的事件 ABI 规范、Tool Runtime ABI、包布局规范、契约矩阵生成规范、DSH 事件模型和生成的契约矩阵；`docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-runs/20261110-codebase-review-fixes/`
