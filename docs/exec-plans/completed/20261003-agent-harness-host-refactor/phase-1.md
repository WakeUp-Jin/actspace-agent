# P1：固定产物与组合生命周期基础

状态：2026-10-03 P1 T1–T5 实现与自动化验收完成，见[执行摘要](../../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)。只新增组合装配基础及真实依赖上的回归测试，不改变 Desktop/CLI 当前默认启动与会话行为。P2/P3 将消费这里形成的加载和生命周期能力。

## 目标与必读材料

交付可被 P2/P3 消费的正式基础模块，证明一个 Host root 内可以准备新组合、切换未来使用者的选择并保留旧使用者。P1 的使用者由测试模拟持有行为，不冒充真实 Run 或真实 Loop 验收。

先读仓库 AGENTS.md、docs/REPO_COLLAB_GUIDE.md、docs/ARCHITECTURE.md、docs/design-docs/core-beliefs.md、docs/CODING_BEHAVIOR.md、docs/HISTORY_GUIDE.md、docs/QUALITY_SCORE.md，以及[总计划](README.md)、[设计决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)、[参考验证](../../../exec-runs/architecture-refactor/deepseek-harness-verification.md)。

## 方案与范围

沿现有 Profile/Bundle/Patch、Cordis adapter、boot 和 scope 实现扩展。一个 Host root 下装配隔离的组合树，服务提供者与消费者共享该组合独有 realm；scope 负责事件/注册可见性。组合持有已固定的产物引用，Run 通过引用租约使用；不以 Session 固定组合。

不采用直接 HMR 更新旧树，不通过每次创建一个 Host root 隔离，不把 tmp/deepseek-harness 作为依赖，不在本阶段重写真实 Loop 或 Session 持久化。

## 新增能力与归属

| 能力 | 放置位置 | 输入与输出 | 生命周期 |
| --- | --- | --- | --- |
| 固定插件产物 | packages/cordis-adapter/src/plugin-artifact.ts（新增）（保留 source-loader.ts 原语义） | 显式构建产物目录及依赖/资源清单，生成内容身份和可加载引用 | 磁盘产物独立于组合实例；本阶段不自动删除已发布产物 |
| 隔离组合树装配 | packages/boot/src/harness-mount.ts（新增）与 cordis-adapter/cordis-tree.ts（新增） | 已解析组合、产物引用、明确共享的 Host 能力，返回就绪状态与异步释放入口 | Loader 持有子树；失败只释放候选独占资源 |
| 当前组合与引用 | packages/boot/src/harness-generations.ts（新增） | 准备、基线条件启用、获取当前组合租约、释放租约 | boot-owned 协调模块；不持业务运行状态，未来由运行管理消费 |
| 事件/注册隔离 | packages/core/scope/src/scope.ts、layered-registry.ts、disposer.ts | 组合父 scope 与使用者 scope | 复用既有实现，仅修实测不足 |

不增加对外 RPC、UI 开关或永久后台任务。新增模块不是额外应用服务层；独立职责不得合并进 DesktopAppService。

## 当前事实与迁移边界

| 已有实现 | 当前能力/限制 | P1 的处理 |
| --- | --- | --- |
| adapter/source-loader.ts | 校验显式来源后从原路径导入；本地 integrity 覆盖 manifest 与入口文件，不覆盖完整传递依赖/资源 | 新增固定产物路径，保持原 integrity 算法和旧配置兼容，不把新摘要冒充旧摘要 |
| adapter/cordis-root.ts | root.mount 在 Host Loader 上装配，getService 从根上下文读取；mountCordisConfig 会设置根 baseUrl | 为组合增加局部装配能力，不改变 root.mount 默认语义，不复用根服务查询来查组合实例 |
| boot/dsh-boot.ts | 启动失败释放整个 root | 新组合失败只清理子树，不直接复用整根销毁路径 |
| core/scope | 已有 scope 父链、注册表、事件过滤和异步释放 | 优先复用，不另写第二套 scope/事件总线 |
| composition | 提供解析后条目、manifest、服务与 codec 描述及 digest | 消费 ResolvedComposition，不另建 Profile/Bundle/Patch 描述格式 |

基础实现允许修改 adapter、boot 的 src/exports/tests；boot 增加 core-scope 的 workspace 依赖，并更新必要的 package.json、构建项目引用及锁文件。adapter 不得反向依赖 core-scope，避免循环。core-scope 只在真实用例暴露缺口时改动。新增测试 fixture 放在各包 tests/fixtures，绝不依赖 tmp 中的探针。

不修改 DesktopAppService、HeadlessRunner、RunController、Loop 生产逻辑和持久化格式；runtime 本阶段仅作为默认启动的兼容验证消费者。新增文件名遵循本计划，具体函数内部拆分可随实现调整，不增加通用运行 Facade。

## 固定产物规则（首版范围已确认）

1. 接受已构建的 ESM 插件目录，不在运行时编译任意工作区。清单覆盖 behavior、codec、相对导入文件与实现资源，依赖使用明确固定的闭包；Node builtin 与声明的 Host 契约模块允许共享。
2. 将清单文件复制到临时目录，校验相对路径、realpath 与摘要后发布到调用方提供的产物根目录，以内容摘要命名。禁止覆盖已有内容身份；已有目录须重新核验再复用，失败清理仅限本次创建的临时目录。
3. 不复制整个用户工作区；不让运行产物通过符号链接回到可编辑源码；不允许依赖解析静默落回工作区 node_modules。未能固定的动态依赖、原生依赖或资源，拒绝作为在线替换产物，明确诊断。
4. 本阶段测试用可枚举 ESM 依赖与资源闭包验证机制；不能以此声称任意第三方插件均可固定。批量自动打包及现有内置插件产物迁移属于 P3 的具体计划范围。
5. 新产物使用不同真实路径导入，旧产物不重写，不使用查询参数刷新入口却复用可变依赖的办法。插件实例共享只依据声明的 Host 能力；JS 模块级可变状态不能作为组合状态，需负向用例暴露越界。
6. 进程内 Cordis 不是安全沙箱；固定机制防止正常开发编辑影响运行，不承诺隔离主动修改任意文件的恶意插件。内存实例释放不等于 Node ESM 模块缓存卸载，不承诺无限热更且内存恒定。

## 输入、输出与身份契约

这些是本阶段新增内部 API 的实施约定，不增加客户端协议字段。

| 对象 | 必需信息 | 语义 |
| --- | --- | --- |
| 产物清单 | schemaVersion、原插件 manifest、排序后的相对文件路径及各文件摘要、明确允许的共享模块 | 独立于原 manifest.source；原来源仅用于追踪，不再决定运行导入位置 |
| 产物引用 | artifactId、不可覆盖的产物根目录、清单 | artifactId 为规范化清单和文件内容的 SHA-256 身份；不含工作区绝对路径、时间戳或自身摘要，避免不可复现或自引用 |
| 候选组合请求 | harnessId、expectedRevision、ResolvedComposition、插件到产物的映射、允许共享的 Host 服务 | harnessId 表示哪一个逻辑 Harness；不同 Harness 的当前选择互不覆盖 |
| 已准备候选 | harnessId、generationId、expectedRevision、executionDigest；装配对象内部保留 compositionDigest 与产物 | generationId 标识本次实例，即使内容相同也不等于同一个实例；它不参与内容摘要 |
| 使用租约 | harnessId、generationId、revision、组合服务访问与 scope 绑定能力、异步 release | 固定一次；不用插件语义版本推断绑定身份；不暴露 root/Loader 给应用客户端 |

expectedRevision 是每个 Harness 当前选择的单调递增编号。首次启用要求该 Harness 尚无当前选择；之后每次切换都增加编号，避免 A→B→A 后错误接受旧候选。compositionDigest 保留现有解析含义；执行身份另外包含产物身份，不能只用原 digest 判断代码是否相同。

### 操作与并发顺序

1. `prepare` 完成清单、codec/契约检查和子树激活，返回就绪候选；不改变当前选择。准备期间 Host 能力可调用，但候选不能修改全局策略或执行真实用户工具副作用。
2. `activate` 在同步提交段内检查 expectedRevision、候选归属和就绪状态，更新当前选择与 revision。准备允许并发；提交段不得跨 await。消费一次候选后不能重复启用；冲突候选释放后可重新准备。
3. `acquire` 同步读取当前选择并增加引用，再返回租约；同一提交点前后取得的只能是完整旧/新组合。当前选择不存在时显式报错，不隐式创建默认组合。
4. 旧当前组合标记退役，最后一个引用释放后清理。当前组合即使暂时无人使用也保留，以免每个 Run 重建。租约绑定使用者 scope，结束时撤销绑定与注册再释放引用，重复 release 返回同一清理结果。
5. 激活提交后旧组合清理失败，启用仍算成功，另报 cleanup failure；不回滚选择，也不触发业务重执行。清理失败对象保留可诊断状态，不伪装成已释放，不自动重试可能有副作用的 disposer。
6. `close` 阻止新 prepare/activate/acquire，废弃未启用候选，将当前组合退役，等待现有租约释放与清理。不得强制取消真实 Run；上层持有者负责先结束工作。重复 close 等待同一结果，清理异常汇总返回；准备与关闭竞争时不能在关闭后留下新候选。

错误需要区分产物无效、准入失败、组合激活失败、无当前组合、基线冲突、管理器已关闭和清理失败；带 harnessId/generationId/entryId 等适用定位信息。原始原因与清理原因同时保留，不用清理错误覆盖首次失败。

### 可支持的加载范围

首版接受构建完成、相对 ESM 依赖闭包显式枚举的产物。每个文件从输入读取一次，以同一份字节计算摘要并写入 staging，发布后从产物位置加载。调用方在提交前完成构建；不承诺从并发写入的源码目录取得事务快照。

完整性摘要保证已声明内容固定，不证明任意 JS 的隐藏依赖已经枚举。测试必须覆盖静态导入、字面量动态导入和声明资源；不能声称自动识别 eval、任意 fs 读取或非字面量动态导入。此类插件未经明确构建约束审核不得准入在线替换。实现必须给出已支持输入的可检查规则，不以 import 成功作为闭包完整的唯一证据。

共享 Host 契约模块解析到显式批准的固定模块路径；禁止复制 Cordis 生成第二个框架单例。任何允许的共享模块都须记录身份，并在载入前确认；普通实现依赖留在固定产物中。若必须新增解析/构建依赖才能落实上述规则，应先在计划中说明依赖和受支持语法，不能用正则扫描冒充完整 JS 分析。

同一 artifact 可被多个组合引用，Node 可能复用模块缓存，因而插件可变状态必须属于 apply/fiber。负向测试要展示模块全局状态可以串扰，并明确不支持此类状态作为隔离单元；不承诺自动检测任意插件的全部全局可变状态。

## 顺序任务及验收细化

T1 → T2 → T3 → T4 → T5 顺序推进；每步测试通过后再继续。本阶段整体为一个可独立合并切片，子任务不是各自改变产品行为的发布阶段。

### T1：扩展已有 source-loader 的固定产物入口

涉及 `packages/cordis-adapter/src/{plugin-artifact,source-loader,manifest,index}.ts` 及该包 tests 下新增 `plugin-artifact.spec.ts`。保持现有显式插件加载入口兼容。

验收：修改原入口、依赖和资源后，已发布产物返回旧结果；新产物返回新结果；缺文件、越界路径、指向源码的 symlink、摘要冲突及未固定依赖拒绝；相同内容可复用；codec 先于 behavior 检查且不触发 behavior 副作用。

### T2：在当前 Cordis 版本实现隔离组合装配

涉及 `packages/cordis-adapter/src/{cordis-root,cordis-types}.ts`、`packages/boot/src/harness-mount.ts`、包公开导出与 `packages/boot/tests/harness-mount.spec.ts`。必要的 scope 修复限于原包与原测试。

使用真实 Loader 装配两个组合：同名工具、同名服务 provider/consumer、相同事件类型但不同监听器，调用结果必须分别为旧与新；消费者必须通过普通 Cordis 注入调用其 provider，不能只用显式查询绕过注入验证；旧组合释放后新组合仍可调用。一个真实 Host 服务作为共享资源，组合释放不能将其销毁。配置更新不修改 Host root 的全局解析基址，不污染现有树。候选缺少服务、导入失败、激活失败或服务泄漏均拒绝就绪。

### T3：候选启用、引用持有与回收

涉及 `packages/boot/src/harness-generations.ts`、`packages/boot/tests/harness-generations.spec.ts`。状态包括准备中、就绪、当前、退役、已释放；当前选择更新与获取租约有明确顺序。租约绑定一次，不提供在运行中重新绑定方法。

验收：候选准备失败时旧选择不变；两个候选基于相同旧组合时只有第一个可启用，另一个报告基线冲突；启用与获取租约交错只能拿到完整旧或新组合；退役组合最后一个引用释放后销毁一次；重复释放幂等；候选共享引用释放不销毁 Host；关闭等待清理完成，失败可诊断，不能报告成功回收。

这里验证的是组合选择原语，真实 Run 接纳、排队和状态管理由 P2 接入，不能在本模块另建任务队列。

### T4：固定产物与组合树联合回归

在 `packages/boot/tests/harness-generations.spec.ts` 使用 T1 生成的两个产物并经 T2 真实 Loader 加载，跨越源码改写、候选失败、成功启用与旧租约释放。禁止只用内存 stub 模拟文件固定或服务解析。

验收：旧使用者始终调用旧工具/服务并读取旧资源；新使用者调用新工具/服务；失败期间获取的使用者仍使用旧组合。单独报告本次尚未覆盖真实 Loop 共存、完整应用流和远端连接。

### T5：集成检查与记录

检查 `packages/runtime/src/startup/boot.ts`、`packages/runtime/src/profiles/composition.ts` 不被新增模块改变默认行为。更新 adapter/boot 的公开模块说明及设计决策中的已验证范围，写 history；按学习文档指南判断是否沉淀隔离/生命周期知识。记录修改文件与依赖新增情况。

## 验收矩阵

| 编号 | 场景 | 成功标准 | 主要测试位置 |
| --- | --- | --- | --- |
| A1 | 固定入口、传递依赖和资源 | 原目录被修改后旧产物仍返回旧结果；新产物使用新真实路径 | adapter/tests/plugin-artifact.spec.ts |
| A2 | 文件与清单不合法 | 缺失、越界、symlink、摘要损坏拒绝；不留下半成品可加载目录 | 同上 |
| A3 | 内容复用与竞争发布 | 相同内容复用且验证已有目录；并发发布不覆盖已有内容 | 同上 |
| A4 | 准入顺序 | codec 验证失败时 behavior 不激活，原选择不受影响 | boot/tests/harness-generations.spec.ts |
| A5 | 普通服务注入隔离 | 两个同名 provider 的消费者分别调用正确实例 | 同上 |
| A6 | 事件与注册隔离 | scoped emit/parallel/serial/waterfall 适用路径不串组合；全局观察者仅观察，不修改执行策略 | 同上及 scope 原测试 |
| A7 | 候选失败清理 | 导入/缺服务/激活失败仅释放候选；Host 服务与旧选择仍可用 | boot/tests/harness-generations.spec.ts |
| A8 | 选择与持有竞态 | activate/acquire 交错只产生完整绑定；同基线两个候选仅一个成功；A→B→A 不误收旧基线 | 同上 |
| A9 | 引用回收 | 多使用者持有旧组合；最后一次 release 才清理一次；当前组合零引用不销毁 | 同上 |
| A10 | 清理与关闭失败 | 旧清理失败不否定已提交启用；异常可诊断；关闭与 prepare 竞争不泄漏；释放幂等 | 同上 |
| A11 | 完整联合回归 | 真实文件产物→真实 Loader→消费者调用→候选失败/成功→旧租约释放闭环 | 同上 |
| A12 | 默认路径兼容 | 原 source-loader 配置/摘要与 boot/runtime 测试继续通过，无新增默认 Harness 切换 | 原 adapter/boot/runtime 测试 |

事件测试遵循本项目实际 API 语义，serial 的短路和 waterfall 的 next 委托须保留，不统一改成广播。测试同步使用可控 gate/barrier，不靠固定 sleep 猜竞态时序。每个测试自己拥有临时目录和 root，并 await teardown。

## 验证命令

在仓库根目录执行；测试文件路径按所属包根目录解释：

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/core-scope test
pnpm --filter @actspace/boot test
pnpm --filter @actspace/composition test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/runtime... typecheck
pnpm test:package-boundaries
pnpm test:contract-matrix
pnpm check:docs
git diff --check
```

测试需真实收集到新增用例，不能接受 passWithNoTests 掩盖遗漏。仅修改文档时不执行上述代码测试。P1 不改 UI，真实 Electron 验收在 P2/P4 行为迁移阶段按覆盖清单执行。

## 风险与停止条件

- 固定依赖闭包无法表达：拒绝该产物，报告缺失文件/依赖，不回退可编辑源路径。
- 当前 Cordis 版本缺少所需隔离能力：保留最小失败测试，提出依赖调整方案供审阅；不自行换框架。
- 同一插件模块的全局状态串扰：不能将普通实例隔离测试记为完整通过，改为生命周期内状态或明确不支持该插件在线替换。
- 生产行为回归：不接入新默认路径，修复新模块引入的影响后再验收。

回退以删除本阶段新增入口及撤回对应接线为范围；保留已有用户改动、历史数据和基线统计。新产物处于单独目录，不修改旧安装包。

## 完成定义

上述自动化验收通过、失败路径有真实证据、默认应用路径保持兼容、文档记录准确。该阶段完成只表示组合基础可供 P2/P3 接入，不表示整个自进化或 Host 分离目标完成。


## 执行记录与交接

获批开始实施时建立 `docs/exec-runs/20261003-agent-harness-host-refactor/execution-process.md` 与 `execution-summary.md`。过程记录按 T1–T5 更新；摘要按 A1–A12 标记通过、失败或未覆盖，附命令、退出状态、测试数量及失败原因，不以总数代替覆盖。

给下一阶段的输出是固定产物 API、组合装配 API、选择与租约 API，以及这些 API 的真实集成测试。P2 负责把真实 Run 与租约连接，P3 负责将 Patch/权限/显式启用接入产品。P1 不持久化当前选择，不处理崩溃后恢复、不提供磁盘 GC 或产品级回退按钮。

审阅重点：上述职责归属、固定产物首版支持范围、引用与切换语义。若审阅通过，可以授权执行 P1 全部 T1–T5；不需要每个普通文件编辑重复确认。扩大到真实 Run/Loop 迁移、依赖升级或新的产物打包方案时，先更新具体变更方案再讨论。


## 2026-10-03 范围确认

用户接受以下方向：模块按职责独立设计，不限制包数量；第一阶段支持依赖和资源明确、已构建的固定插件产物，先验证替换机制，不同时建设通用编译和打包系统。

Composition/Patch 负责组合描述，Adapter 负责固定产物与加载，组合生命周期模块负责候选、选择与引用回收，运行管理负责真实 Run 调度和绑定。包内模块不得通过访问彼此内部状态破坏边界。boot 中的组合生命周期模块是持续工作的能力，不限于启动时执行；若实际依赖要求单独成包，应说明具体迁移范围，不为减少包数将其耦合进启动流程。

固定范围包含插件实现、依赖及实现资源，不包含工具操作的用户工作区。后续可由构建流程自动生成产物清单；不支持的依赖明确拒绝，不退回可编辑源码。该范围确认不等于已完成验证或已启动代码实施。

实施选择：复用已有 TypeScript AST 解析器并移入 adapter 运行依赖，用于解析已构建 ESM 的静态/字面量动态导入、拒绝非枚举导入并固定显式共享模块 URL；不编译源码，不引入通用打包器。

实施交接：未修改 source-loader/cordis-root/core-scope 原实现；固定产物与隔离树使用独立新增模块并从包公开导出。错误和实例引用由 boot 管理，不外泄给客户端。共享 Host 模块的显式 URL 计入执行环境身份；可编辑源码位置不计入内容身份。详见两包 README 与执行摘要。
