# P3：Harness 可替换基础与持久启用

状态：2026-10-03 用户已审阅并明确授权执行；实现、自动化与 Computer Use 验收完成。产品边界及详细计划已批准。前置基线：P2 提交 `92e1c7c`，见 [P2 验证记录](../../../exec-runs/20261003-agent-harness-host-refactor/phase-2-summary.md)。

## 1. 目标、范围与阶段调整

本阶段为未来 Harness 自进化提供可替换的架构条件，不实现自进化功能。以已构建的固定产物为输入，完成 Patch、候选检查与装配、Host 授权、持久启用、恢复和回退，接入真实主/子 Run。Profile 保持稳定，复用 Bundle/Patch、P1 Loader 与组合生命周期，不建立第二套插件框架。

纳入：在线替换 Harness 执行能力；明确共享 Host 能力的重启边界；删除被新入口替代的重复选择逻辑；同步受影响设计文档。插件、文件或包数不作为精简目标。

不纳入：Agent 修改源码的工具和工作流、通用编译/打包器、效果评估、自动优化或自动回退、自进化审批页面/工具、插件管理页面、远端协议、手机前端、共享状态热迁移、数据迁移器和历史产物自动 GC。独立 Host 与 Desktop 远端连接仍归 P4；全仓文档/目录集中整理仍归 P5。

本计划取代早期文档中“P3 实现源码修改到审批启用的产品闭环”的范围表述。保留独立启用授权原则，具体用户审批交互由未来自进化功能接入。本阶段默认 Host 不授权外部启用；真实服务逻辑使用受控测试 Host 验收，不把测试 allow 实现装进生产默认配置。

## 2. 必读与当前源码依据

先读仓库 AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、PLANS_GUIDE、CODING_BEHAVIOR、HISTORY_GUIDE、QUALITY_SCORE；再读 [设计决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)、[P1](phase-1.md)、[P2](phase-2.md)、agent-plugin-runtime/agent-testing.md、FRONTEND_VERIFICATION。

当前依据为源码检查，不是 P3 运行验收：

| 当前入口 | 已有能力 | 本阶段缺口 |
| --- | --- | --- |
| `packages/bundle/src/index.ts`、`packages/composition/src/{patch,compose}.ts` | insert、replace-config、disable、remove，依赖描述与 digest | 实现替换、固定产物清单合并、严格的在线候选兼容检查 |
| `packages/cordis-adapter/src/{plugin-artifact,manifest}.ts` | 已构建 ESM 与枚举资源固定、完整性校验、Manifest | 合法产物不等于获得 Host 共享模块授权；缺少服务/事件契约版本和模式的机器可读声明 |
| `packages/boot/src/{harness-mount,harness-generations}.ts` | codec 先于 behavior、隔离装配、内存 CAS、租约和退役清理 | 持久选择、恢复 revision、事务期间 close/discard 的互斥 |
| `packages/runtime/src/runtime/{default-harness,agent-runtime-plugin,managed-runs}.ts` | 默认固定 Harness，主/子 Run 获取租约 | 每次启动固定选择 main 的内置组合；选择控制直接暴露底层管理器 |
| `packages/session/persistence/src/session-store.ts` | Host 启动时注入固定 codec registry | 在线替换不能默默修改已打开 Session 的历史读取规则 |

默认产物包含多个行为入口及共享构建 chunk。P3 允许仅替换一个行为入口，并保留未变化条目所引用的原产物，不要求重打包整个默认 Harness。首版可以重新装配完整 Harness 候选树；复用固定文件和明确兼容的 Host 服务，不承诺未变化的有状态 Harness 实例跨组合共享。

## 3. 模块与依赖方向

新增一个 `@actspace/harness-control` Host 生命周期插件包，内部拆分 candidate、authorization、selection-store、service；不是把任务调度与组合管理塞入 AgentService。该包依赖 boot/composition/bundle/cordis-adapter，存储锁复用 session-persistence 的现有导出；不依赖 runtime、Desktop、具体 Loop 或工具实现。runtime 只负责装配 Host 端口与选择入口。

```text
Host 集成 / 受控测试调用方
        |
        v
harness-control --授权请求--> Host 注入的授权端口
   |        |
   |        +--> selection-store（持久选择与启用记录）
   +--> composition（纯描述、Patch、兼容检查）
   +--> boot HarnessGenerations --> adapter Loader / 固定产物
                ^
                | 经 control 的租约端口
AgentService / 子 Run / 手动压缩
```

预计修改超过 8 个文件，新增 1 个服务包；按职责拆模块，不能为了压缩包数将控制逻辑并入 runtime。共享类型留在所属包，只有 Run 持久身份需要扩展 shared。生产调用方不能直接调用裸 `activate` 绕过控制服务；boot 的底层 API 保留供该服务及底层测试使用。

## 4. 固定产物、Patch 与身份

### 4.1 输入与替换单位

引入 `HarnessPatchRequest`：`harnessId`、`expectedRevision`、`baseExecutionDigest`、现有 `Patch`、`artifactIds`。固定产物先通过 adapter 的发布接口进入 Host 管理的 artifactRoot；服务仅接受该根目录下的内容身份，不接受远端 URL、任意源码路径或调用方自行指定的 sharedServices。

在现有 PatchOperation 中增加 `replace`：指定目标 entryId、目标 artifactId 和该产物 manifest 中的 behavior entryId。保持组合槽位 entryId 稳定，并单独记录 manifestEntryId；装配以 manifestEntryId 核对真实 behavior，不能伪造 manifest。`insert` 在在线入口同样由产物 manifest 解析，拒绝调用方手写 module/provides 绕过清单。replace-config 仍按槽位定位。所有启用条目的 module、pluginId/version、provides/injects 均由已验证清单导出，配置覆盖通过插件公开的纯校验入口检查。

同 pluginId 在一个候选中只能绑定一个 artifactId；同 ID 多产物明确拒绝。替代单个默认行为使用独立插件 ID；升级同 ID 多入口产物时必须一起更新受影响条目，不能把同一插件两版暗中混用。禁用/移除导致必需契约缺失时拒绝，不静默删掉依赖者。原有启动 Patch 调用保持兼容，共用条目操作与校验，不复制一套 applyPatch。

### 4.2 身份与内容摘要

- harnessId：稳定逻辑选择，例如当前生产 main；P3 不新增主/子路由配置，主子仍按现有路由选择 main，独立获取最新租约。
- artifactId：固定代码及资源内容身份，沿用 P1。
- executionDigest：完整候选的执行描述、配置、产物和共享契约摘要，使用规范序列化；不依赖时间戳/随机 ID。
- candidateId / generationId：本次准备与装配实例身份；重启不能复用进程内对象。
- revision：每个 Harness 单调增加的成功选择序号；回退也增加，不重用旧序号。
- activationId：调用方稳定请求身份；同 ID 同请求返回既有结果，同 ID 不同内容返回冲突。

Run 的原有可扩展 configuration 记录可选 harnessExecutionDigest（P2 codec 严格限制 harness 对象字段，因此保留其原字段集合）。保留已有 harnessId/generationId/revision，旧 Journal 仍能读取；generationId 与跨重启稳定内容身份不混用。

## 5. 候选兼容与隔离检查

复用 Manifest，增加可选 `contracts` 描述（在线目标要求完整）：服务提供/需求的契约 ID 与整数版本，事件提供/需求的契约 ID、整数版本和 mode，允许共享的 Host 契约，以及纯配置校验入口。首版按精确版本匹配，不引入 semver 求解器。参数与结果语义包含在契约版本对应的 TypeScript 类型和契约测试中，声明匹配不能证明任意 JS 行为正确。

服务名称、契约版本、作用域需同时满足；重复提供者、缺必需服务、模式不符或配置不合法均拒绝。可选依赖缺失必须有明确声明的降级说明并进入检查报告。既有生产内置 manifest 补齐相应声明；旧外部产物仍可保留历史用途，缺声明不自动获得在线准入。

事件使用所属领域的声明合并；为本阶段触达的 Harness 事件补齐 `@mode` 和目录检查，核对声明与实际调用（包括 emitContained/requiredDispatch 等封装）的等待、短路和错误语义。mode 不在 Patch 中任意覆盖，策略顺序由最终组合和显式注册次序决定；报告实际次序，测试验证关键链。新增 `harness/selection-updated` 为事实通知 `@mode emit`，持久化和授权均直接 await 服务；监听器失败只记诊断，不触发重试启用。

Host 提供共享服务及 sharedModules 白名单与契约指纹，候选不能扩大它。共享模块校验不能仅证明“文件 hash 与调用者自己填写的 hash 相同”。Host 启动建立可信解析表，产物声明必须与其一致；升级 Host 导致固定 URL/hash 不匹配时返回需要重启/重新准备的诊断，不静默重写旧产物。

历史兼容采取可实现的首版边界：候选 codec 集合必须是当前 Host 已准入的相同实现/版本，不允许在线新增、替换或删除持久化 codec。差异返回 RESTART_REQUIRED，并说明受影响 event type；重启仍按现有纯 codec 准入规则检查，P3 不实现任意 codec 数据迁移。移除行为不卸载历史读取所需的 Host codec。替代 Loop 必须实现已有 Run 工厂和 Session 读取契约；契约测试以既有历史 fixture 验证读取、继续、终态和取消。

候选初始化只允许局部注册及可释放的独占资源，不启动真实任务或以用户工作区副作用验证工具。需要改写共享状态的变更返回 RESTART_REQUIRED；初始化失败释放候选资源，当前选择不变。Cordis 是同进程插件框架，不是恶意代码沙箱；静态声明无法自动证明任意插件无副作用，生产准入限于 Host 信任的产物。

最脆弱假设：插件确实遵守状态和资源归属。如果存在模块全局可变状态或绕过注入访问 Host，声明检查不足以保证隔离；用负向 fixture 证明边界，拒绝给此类模块“支持在线替换”的结论，不能通过共享更多对象掩盖问题。

## 6. 控制服务与授权契约

公开操作：`prepare(request)` 返回候选 ID、digest、基线、变更摘要、兼容报告与状态；`inspect(harnessId)` 返回当前选择/历史/候选状态；`discard(candidateId)` 释放未启用候选；`activate(activationId, candidateId, context)` 请求 Host 授权并启用；`prepareRollback(harnessId, expectedRevision, historicalDigest)` 以历史完整描述重新准备。回退不重复逆向执行 Patch。

授权端口由可信 Host 初始化注入，默认 deny，未注入返回 AUTHORIZATION_REQUIRED。context 身份由 Host 调用适配器提供，不以调用者填写的角色字符串为凭据。不公开 grant 创建函数，不接受 approved 布尔值。授权绑定 harnessId/candidateId/executionDigest/expectedRevision/activationId，带 expiresAt，最终提交前再验证；拒绝、过期、候选不匹配都不得启用。

等待授权期间不锁住其他启用或 Run；授权返回后必须重新检查基线、候选存活和有效期。候选被丢弃、关闭或当前选择已变化时拒绝，不能沿用旧批准自动重新准备。授权记录保存 actor 标识与 decisionId，不保存密钥或完整敏感上下文。同进程受信插件不具有安全沙箱隔离，但正常产品调用路径必须经过此授权边界。

内置首次启动属于可信 bootstrap，只在没有持久选择时生效；不是任意候选的通用免授权开关。重启恢复已成功启用的选择不要求再次批准，但必须重验产物与当前 Host 兼容性。生产默认不新增面向 renderer/Agent 的启用入口。

错误使用结构化 code 和诊断列表：PREPARE_FAILED、INVALID_PATCH、ARTIFACT_INVALID、CONTRACT_MISMATCH、RESTART_REQUIRED、BASELINE_CONFLICT、CANDIDATE_NOT_READY、AUTHORIZATION_REQUIRED、AUTHORIZATION_DENIED、AUTHORIZATION_EXPIRED、REQUEST_CONFLICT、STORE_LOCKED、DURABILITY_BLOCKED、RECOVERY_BLOCKED、CLOSED。字段包含 operationId/harnessId/受影响 entry 或契约，不以错误字符串解析业务状态。

## 7. 持久化、并发与恢复

### 7.1 单一持久事实源

使用 `<dataRoot>/harness-state/selections.jsonl`，每条为一个已选择组合的完整记录：schemaVersion=1、activationId、requestDigest、harnessId、revision、previousRevision、executionDigest、完整规范组合描述、artifactIds、共享契约指纹、授权摘要和时间。旧产物根路径不从请求持久化；恢复时由可信 artifactRoot 与 ID 定位。候选未启用前仅在内存中，发布的固定产物可保留；重启后重新 prepare，旧授权和 candidateId 失效。

目录写锁复用 session-persistence 导出的 SessionWriterLease，通过 selection-store 内部适配绑定独立 harness-state 目录和固定 store identity，不创建伪 Session/Journal；错误转换为 STORE_LOCKED/DURABILITY_BLOCKED。保持现有 5 秒 heartbeat、30 秒 stale 且进程已退出的恢复条件，不另写一套锁。一个数据根只允许一个选择 writer；锁丢失后阻断 mutation 和新租约，已有 Run 可自然收尾。

追加记录后 flush/fsync 成功才允许返回启用成功；首次创建目录/日志补目录同步。日志每行带序号与内容校验；启动只接受连续且完整记录，末尾半行保留到 recovery 证据后截断，完整行校验失败/中段损坏进入 RECOVERY_BLOCKED，不能跳过后继续。所有日志修复仅由持有 writer 锁的恢复路径执行。

### 7.2 启用与获取租约的排序

候选准备和授权等待不阻塞 Run。进入最终启用时，每 Harness 串行提交，短暂关闭新租约获取：重验基线/授权/候选 → 保留 candidate 提交所有权 → 持久写入选择 → 同步切换内存 current → 打开新租约获取 → 返回回执。此区间禁止 close/discard 使 candidate 失效。已有租约不受影响，也不等待旧 Run 结束。

control 提供异步 acquire，主 Run、子 Run、手动压缩统一等待提交门；不能绕过门调用裸 manager.acquire。同步 capability 查询改读已经提交的能力摘要，或迁移为异步租约读取并等待释放，禁止读取准备中的候选服务。提交门只覆盖本地持久写入/内存选择，不覆盖用户授权、插件初始化或旧资源回收。

持久写入失败即使可能已写入部分数据，也不继续假定旧选择安全：阻断该 Harness 新租约与变更，已有 Run 保持原组合，已接纳队列保持等待，不因短暂提交门而失败；恢复读取持久记录后再决定当前选择。启动前取消等待租约不泄漏 Run 或候选引用。

进程在持久写入后、内存切换或回执前退出：重启按最后有效记录恢复；同 activationId 可查询结果，不能重复增加 revision。进程在持久写入前退出：恢复旧记录。日志已经提交而内存切换异常时同样进入恢复阻断，不能返回“未启用”并接受新任务。旧组合清理失败独立报告，不改写已经成功的启用。

### 7.3 恢复与回退

有选择记录时不再无条件 bootstrap 内置 main。恢复从最后有效完整描述验证产物和契约，重新装配，恢复持久 revision，创建新的 generationId；等待候选全部就绪后才放行新租约。任务队列继续遵循 P2 重启后手动继续规则。

产物缺失、不兼容或记录损坏时显式阻断执行，不静默选择内置实现。提供受信 Host 维护 API `recoverBuiltin(activationId, expectedRevision, authorizationContext)`：从当前安装的内置产物准备，通过同一授权/提交路径形成新 revision，保留原选择证据。日志本身损坏时先返回可定位诊断并拒绝自动修复完整记录；由维护者保留副本后修复，不能猜测基线。P3 不新增恢复页面或公开 CLI 命令，维护 API 由进程集成测试证明可调用；若启动恢复失败，Host 保留维护服务及诊断可用，Agent 执行处于 blocked，避免维护入口随启动异常一起销毁。

回退不恢复旧 Loop 内存、不撤销工具副作用、不逆向迁移用户数据。准备旧组合时再次验证当前 Host 与历史读取契约，不兼容则拒绝。普通任务失败不自动改变选择。

### 7.4 产物与实例保留

无租约的旧实例立即退役释放；新旧组合共享的 Host 能力不随候选销毁。已发布历史产物和成功选择描述不做按数量/时间自动清理；prepare 失败的临时 staging 目录由原发布函数释放。P3 不增加删除历史产物 API。模块导入缓存仍可能留在 Node 进程，释放实例不承诺卸载 ESM 模块；大量替换的内存压力通过受控 Host 重启处理，不增加 worker 热迁移。

## 8. 文件级任务与顺序

以下是 P3 内部依赖顺序，不分别声称可独立发布。整体形成一个可用阶段，P4 不实施也能运行原有 Desktop/CLI。

- [x] T1 契约与纯解析：修改 `packages/bundle/src/index.ts`、`packages/composition/src/{patch,compose,types}.ts`、`packages/cordis-adapter/src/manifest.ts`；新增 composition 的 `harness-patch.ts` 与 `harness-compatibility.ts`，补充 manifestEntryId、replace、基线描述、严格产物清单和兼容报告。测试 `packages/composition/tests/harness-patch.spec.ts`、`packages/cordis-adapter/tests/contract.spec.ts`；已有 compose 调用回归。
- [x] T2 声明与装配：修改 `packages/boot/src/harness-mount.ts`、adapter `plugin-artifact.ts`；新增 adapter `harness-contracts.ts` 与 `tests/harness-contracts.spec.ts`，补默认 Harness 及其服务/事件的声明，建立 `scripts/check-harness-event-contracts.mjs` 与负向测试并接入根 package.json。验证共享白名单、模式/版本、配置校验、codec 差异、策略隔离与候选失败释放。保留 Manifest → codec → behavior 顺序。
- [x] T3 控制服务与存储：新增 `packages/harness-control/{package.json,tsconfig.json,tsconfig.build.json,README.md}` 和 `src/{index,manifest,plugin,contracts,candidate,authorization,selection-store,service}.ts`；复用 writer lease；注册 Host 级服务 `harness.control`。新增 `src/test/{candidate,authorization,selection-store,lifecycle}.test.ts`，覆盖默认 deny、完整身份绑定、CAS、幂等、锁和持久故障。
- [x] T4 提交与租约：调整 `packages/boot/src/harness-generations.ts` 支持恢复 revision、候选提交保留和关闭互斥；新增 boot 事务边界测试。control 封装所有生产 activate/acquire；不让 storage/auth 侵入底层 manager。新增 control `activation.test.ts` 覆盖并发准备/批准/启用/关闭、落盘故障和清理故障。
- [x] T5 生产接入：修改 `packages/runtime/src/runtime/{agent-runtime-plugin,managed-runs,default-harness,boot}.ts`、`packages/runtime/src/profiles/composition.ts`、`packages/runtime/cordis.yml`；补 Host 授权/存储端口和 blocked 诊断。更新 `packages/agent-service/src/{run-manager,service}.ts` 的异步 acquire 契约和取消等待；`packages/subagent/src/provider.ts` 同步适配子租约等待。修改 shared `runtime-v2/tasks.ts` 与 task codec 以兼容方式记录 executionDigest；覆盖手动压缩和能力查询所有调用者。更新 package manifests、项目引用、lockfile 与构建图，不导入 sibling src。
- [x] T6 集成与恢复：新增 runtime `harness-control.test.ts`、`harness-recovery.test.ts` 及 `scripts/test/harness-recovery-process.test.mjs`，使用真实固定产物和临时数据目录；验证真实主/子 Run、替代 Loop、重启、进程故障、维护恢复入口。沿用默认构建工具，仅增加测试产物，不构建通用自进化打包器。
- [x] T7 回归与收尾：检索并删除 runtime 中无条件默认启用和裸 manager 生产入口，保留内部底层测试；补 CLI、Desktop 默认行为回归；同步架构、Task/Run 设计、本计划及执行记录，新增 phase-3-summary.md、history，按学习指南判断学习文档。不得借清理移除其他活跃计划或用户文件。

T1→T2→T3/T4→T5→T6→T7；T3 与 T4 接口先冻结再集成。本计划已获用户明确实施授权；后续 P4/P5 仍须单独审阅。

## 9. 验收矩阵

| 编号 | 验收点与通过标准 | 证据归属 |
| --- | --- | --- |
| A1 | 单工具替换复用未变产物，槽位稳定，清单一致；同插件双产物拒绝 | composition/adapter 单测 |
| A2 | insert/replace/config/disable/remove 的依赖、配置、重复提供者、事件模式/版本负向例完整 | composition + event checker |
| A3 | 未授权 shared module/service、codec 变化和缺契约拒绝或明确需重启，不改当前选择 | adapter/boot/control |
| A4 | 候选失败不污染旧策略，旧 Run 仍能执行下一工具调用，资源不重复释放 | boot + runtime 集成 |
| A5 | Host 默认 deny；批准绑定/过期/迟到/丢弃均验证；候选不能自授权 | control authorization |
| A6 | 两份同基线候选只有一份成功；回退递增 revision；同 activationId 幂等 | control activation |
| A7 | 启用期间主 Run、子 Run、压缩均取得完整旧或新组合，无混用；等待可取消 | runtime + agent-service + subagent |
| A8 | 父持旧组合时子取得新选择，同会话下一 Run 使用新组合；Loop 可替换 | runtime 真实工厂与替代 Loop fixture |
| A9 | 写入失败、部分写入、完整损坏、锁丢失、双进程冲突使新执行受控阻断 | store + 真实子进程故障测试 |
| A10 | 在持久提交前/后和回执前杀进程，重启选择与记录一致；不自动重放任务 | recovery process |
| A11 | 重启恢复最新选择和 revision；缺产物/Host 指纹变更不偷偷回退；维护入口可恢复内置 | runtime recovery |
| A12 | 普通任务失败不自动回退；旧资源清理失败不推翻成功启用；历史产物保留 | control/runtime |
| A13 | P2 历史可读、旧 Run 身份可读、新摘要记录可追溯；不重写 Journal | persistence/task codec fixture |
| A14 | 默认 Desktop/CLI、模式/队列/停止/审批/恢复/压缩回归通过 | 自动化 + 下方 CU |

必须测试实际服务路径，不允许仅调用底层 HarnessGenerations 然后声称 Host 授权、持久启用或恢复通过。

### 工程命令

先 `pnpm install --frozen-lockfile` 检查最终清单一致，再 `pnpm --filter @actspace/runtime... build` 建依赖闭包。依次运行：

- `pnpm --filter @actspace/composition test`、`pnpm --filter @actspace/cordis-adapter test`、`pnpm --filter @actspace/boot test`、`pnpm --filter @actspace/harness-control test`。
- `pnpm --filter @actspace/agent-service test`、`pnpm --filter @actspace/runtime test`、`pnpm --filter @actspace/subagent test`、`pnpm --filter @actspace/core-agent-loop test`、`pnpm --filter @actspace/desktop-app test`、`pnpm --filter @actspace/headless test`。
- `pnpm --filter @actspace/agent-cli test`、`pnpm test:agent-cli:process`、`node --test scripts/test/harness-recovery-process.test.mjs`。
- `pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop build`。
- `node scripts/check-harness-event-contracts.mjs`、`pnpm check:packages`、`pnpm check:desktop-build-graph`、`pnpm check:docs`、`git diff --check`。

新增 checker 和恢复进程测试必须加入对应根测试/检查入口，不能只留手动命令。测试使用本地 fixture、临时 dataRoot 和假凭据；本阶段无新增云账号、API Key、MCP 服务或网络依赖，不升级固定 Cordis/Loader，不做真实 Provider 或发布签名验收。

### Computer Use：先列验收点，再分组

默认委派 `gpt-6.1-sol` 子智能体，主智能体开发与修复。模型不可用时说明限制，不静默改用 Astra。实施期按此矩阵执行，自动化与真实 UI 证据分开登记。

- U1 正常启动、创建会话、读取 P2 历史，无白屏/初始化错误。
- U2 同会话 Plan 完成后切 Agent；排队、暂停、继续与停止保持原行为。
- U3 工具审批、取消审批中的任务、继续后不误伤下一 Run。
- U4 `/compact`、后台会话与窗口重载，任务不重复领取。
- U5 退出并重新启动后历史与结果可读，未完成任务不自动执行。

操作分组：正常会话路线覆盖 U1/U2；审批与压缩路线覆盖 U3/U4；退出重启路线覆盖 U1/U5。每组复用场景状态，在模式切换、暂停、审批及恢复关键状态保留截图和关联 Run 证据。逐 U 项报告通过/失败/未覆盖，不能用分组代替覆盖。

P3 无产品启用页面，CU 不声称已经通过界面验证 Patch 操作；A1–A13 的正式 API/持久化证据与 U1–U5 的真实界面回归分开记录。

## 10. 风险、回退和交付门槛

- 磁盘慢或写入失败：仅提交窗口阻挡新租约；故障后 fail closed，现有 Run 可收尾，选择恢复后手动继续队列。不能无限持有未完成授权造成全局阻塞。
- 多候选和历史积累：候选显式 discard/Host dispose；实例引用清零后释放。P3 不承诺无限在线替换的 ESM 内存回收或磁盘自动配额，诊断报告实例数、引用数和产物占用，后续策略由独立维护功能负责。
- 代码回退：撤回 control 生产接线和对应新包，保留 P2 默认功能；不得自动删除 harness-state、artifact 或 Session 数据。旧二进制不会恢复 P3 选择，因此在交付说明中明确“回退代码”不等于“保留已选择 Harness”；需维护者先停止 Host 并保留数据副本。无需重写已有 Session；新可选摘要字段通过旧读取 fixture 检验。
- P3 不提交或推送、不部署、不清理 tmp 或其他工作区。开发完成后执行审阅，再由用户明确决定提交。

签收要求：A1–A14 均有对应证据，U1–U5 分项报告；Host 默认入口仍可用；无绕过授权/持久提交的生产选择路径；文档明确自进化与 P4/P5 的边界。当前自动化证据见 [P3 执行记录](../../../exec-runs/20261003-agent-harness-host-refactor/phase-3-summary.md)，真实 UI 的 U1–U5 均通过，见 [Computer Use 报告](../../../exec-runs/20261003-agent-harness-host-refactor/phase-3-computer-use-acceptance.md)。
