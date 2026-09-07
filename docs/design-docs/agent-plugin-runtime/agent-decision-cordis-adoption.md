# Cordis 运行时采用决策

> 状态：有条件确认。
>
> 决策：ActSpace v2 采用 DSH 维护发布的 `@deepseek-ai/cordis` 系列作为唯一插件生命周期运行时；通过 fresh install、Node/Electron 和 packaged smoke 后进入实现基线。
>
> 决策日期：2026-08-22。

## 1. 背景

ActSpace 需要的是可追踪的插件生命周期、依赖驱动激活、可等待卸载、Service replacement 和配置组合，不只是一个模块发现器。DSH 对 vendored Cordis 的 Fiber、Loader、Include 和 HMR 做过实质加固；旧上游 Cordis 或混合命名空间不能推定具有同样语义。

ActSpace 不采用 DSH 的完整 App Boot 和 Agent Core。Cordis 只负责运行时生命周期，产品组合、Host、Session 格式和 Agent 语义仍归 ActSpace。

## 2. 采用范围

以本次审计快照对应的发布族为首个验证基线：

| 包 | 验证基线版本 | 用途 |
|---|---:|---|
| `@deepseek-ai/cordis` | `4.0.1` | Context、Service、Fiber、Effect、Event、Registry |
| `@deepseek-ai/cordis-plugin-loader` | `1.0.2` | 稳定 Entry id 到插件 Fiber 的装载 |
| `@deepseek-ai/cordis-plugin-include` | `1.0.6` | 配置文档、patch 和串行 reconcile |
| `@deepseek-ai/cordis-plugin-group` | `1.0.1` | 配置子树组织 |
| `@deepseek-ai/cordis-plugin-timer` | `1.1.3` | 生命周期归属的 timer capability |

这些版本来自已审计 DSH 快照，不表示 npm registry 当前状态已经验证。正式依赖变更必须执行 fresh registry install，并固定 lockfile integrity。

生产依赖必须使用 exact version，并通过 workspace override 保证同一个进程只有一套 Cordis runtime family。升级必须整组评审，不能让 Loader、Include 或 Cordis Core 独立漂移。

## 3. 明确排除

- 旧上游 `cordis` 和 `@cordisjs/plugin-*`；
- 未 rescope 的 `cosmokit`、`schemastery` 与 DSH 发布族混用；
- `@deepseek-ai/cordis-plugin-hmr` 作为 Electron 生产基线；
- `@deepseek-ai/dsh-app-boot`；
- DSH Agent Core、Client 和 headless 产品包；
- 从任一发布包的 `src/*` 做生产 deep import；
- 因为上游包可读而自行复制、vendor 或 fork。

只有 ActSpace 直接调用 `cosmokit` 或 `schemastery` API 时，才把对应 DSH rescope 包声明为直接依赖；传递存在不等于应该扩大公共依赖面。

## 4. ActSpace 拥有的适配层

Cordis 不直接暴露给 Desktop、CLI、Session DTO 或普通工具 executor。最小适配层包括：

| 适配层 | 所有权 |
|---|---|
| Runtime bootstrap | 创建和释放唯一 root Context，等待 Loader settlement 并执行 Startup Validation |
| Composition | 把 ActSpace Profile / Bundle / Patch 解析为 Loader entries 和 Include patches |
| Plugin API | 定义 Session、Prompt、Tools、LLM、Agent 等稳定领域 Service |
| Legacy tool | 把现有 executor 接入新的 Tool contribution 和生命周期 |
| Projection | 把 canonical facts 投影为固定 Desktop / CLI 契约 |
| Diagnostics | 暴露插件版本、Entry、Fiber state、缺失 Service、失败和不兼容原因 |

这条边界防止插件作者把 Cordis Context 当成 ActSpace 的公共领域模型，也允许未来替换运行时而不重写 IPC 和 Session 文件。

## 5. ESM 边界

DSH Cordis 发布族和 pi-ai 都以 ESM 为主要运行形态，当前 Agent Core、Electron Main 和 CLI 构建仍以 CommonJS 为主。因此 v2 应建立 NodeNext/ESM runtime island，由现有宿主通过异步边界启动和关闭。

确认的是 ESM 隔离边界，不是最终 package 名称。Desktop preload 和 React renderer 不直接 import Cordis；旧 CommonJS Agent Core 也不通过静态 import 逐步吸收 Cordis 类型。

## 6. 配置安全

ActSpace Profile / Bundle / Patch 在 v2 中只接受 JSON-safe 数据。DSH Loader 的 `!!js` 求值路径使用动态代码执行，它属于可信应用部署代码，不是用户插件配置或安全沙箱。

因此：

- 第三方和用户插件配置拒绝 `!!js`、函数、Symbol 和非 JSON 值；
- 环境变量、cwd、credential 等动态值由 Host/Composition resolver 注入；
- secret 只以 `credentialRef` 出现在组合配置中，实际值不进入 dump、Session 或 diagnostics；
- patch 的 `config` 保持整对象替换语义，不伪装成深合并。

## 7. Startup Validation、刷新与回滚语义

Cordis 的 `PENDING` 是合法等待状态，不会自动让应用启动失败。ActSpace 必须在 Loader tree settlement 后执行 Boot-owned Startup Validation：

- enabled Entry 没有 Fiber：失败；
- Fiber 为 `FAILED`：保留原始错误并失败；
- Fiber 为 `PENDING`：列出缺失的 required Services 并失败；
- Fiber 处于其他非 `ACTIVE` 状态：失败；
- Base Profile 声明的必需 capability 没有 active Provider：失败；
- 可选 capability 缺失：记录结构化诊断，不冒充 active。

前四类 Loader/Fiber 检查和 ActSpace Base Profile capability 检查属于同一启动流程，但必须输出不同诊断；disabled Entry 不参与激活检查。Loader 自身若在 import、apply 或 reconcile 期间已经 reject，启动会在到达后置验证前失败。

Loader replacement 也不能描述为零中断事务。实际语义是先导入候选模块，再卸载旧实例并启动候选；候选启动失败时尝试恢复旧插件。它能提供 last-good 恢复路径，但不能保证新旧实例同时 active，也不能回滚已经发生的外部副作用。

v2 不启用配置或代码在线刷新。具备明确生命周期归属的 ActSpace watcher 只用于验证 restart candidate 并报告 `restartRequired`；当前 Runtime 继续使用启动时的 BootManifest，由 Host 完整 shutdown 后重新 Boot。Include / Loader 的 reconcile 能力仍可用于启动和测试，但不作为 v2 产品 API。代码 HMR 不进入生产基线。

ActSpace 不在 Cordis 之上增加全局 Composition Generation。v2 启动时由 Loader 建立配置树，运行中不做在线更新；已开始工作的稳定性由 Session 事实、one-shot LLM call activation lease、prepared tool execution 和 Prompt request snapshot 等领域机制分别保证。配置或代码变化必须要求 Runtime restart。

## 8. 验收门禁

采用决策只有在以下门禁通过后才能进入依赖提交：

1. 在干净临时目录 fresh install 上述 5 个精确版本，验证 exports、types、peer ranges 和 lockfile integrity。
2. Node 与目标 Electron 中验证 pending -> active、Provider replacement、setup failure、Effect cleanup 和异步 disposer quiescence。
3. 验证 Loader 的 builtin、file、relative、bare package import 和失败恢复。
4. 验证 Include patch 顺序、insert 后继续 patch、整对象 config replacement，以及 invalid candidate 保留 last-good 配置树或恢复先前 Entry。
5. 验证配置或插件变化只产生 `restartRequired`，当前 Runtime 不改变已发布 manifest；完整重启后重新执行 Loader settlement 与 Startup Validation。
6. 验证 packaged Desktop 的生产依赖部署后只有一份 Cordis，并能动态启动 ESM runtime。
7. 验证 shutdown 后 timer、watcher、subprocess 和插件 Effect 均进入静止状态。
8. 验证 HMR 未被传递依赖或默认 Profile 隐式启用。

若任一门禁只能通过 deep import、Node 私有 API或长期 patch `node_modules` 完成，本决策回到评审，不把该 workaround 写入生产基线。

## 9. Fork 触发条件

当前明确不 fork。只有下列情况出现时才新建 ADR：

- 发布包长期停止维护且存在影响 ActSpace 的已确认缺陷；
- npm 包无法可靠获得或供应链状态不可接受；
- Electron 目标环境存在上游不修复的阻断；
- ActSpace 必需的生命周期语义无法通过公共 API 实现。

Fork ADR 必须同时回答维护人员、同步策略、漏洞响应、发布命名空间和退出路径。
