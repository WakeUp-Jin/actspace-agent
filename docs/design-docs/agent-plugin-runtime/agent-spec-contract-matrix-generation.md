# 契约矩阵生成与检查边界

矩阵是源码声明的审计视图，不是第二套 Runtime 配置，也不证明所有声明都在某个 Profile 中激活。

## 来源和产物

`scripts/contract-matrix/source-registry.mjs` 明确列出 package、manifest、Service metadata、组合与验证来源；领域事件的声明文件与 Harness event checker 共用清单。生成器不启动插件、不访问用户数据、不调用 Provider。

`pnpm gen:contract-matrix` 更新 `artifacts/agent-contract-matrix.json` 与本专题的[生成文档](agent-contract-matrix.generated.md)；`pnpm gen:contract-matrix --check` 比较字节，禁止手改产物。

- Package/exports/dependencies 来自 package.json。
- Plugin 身份、提供/注入声明与能力来自 manifest。`agent-service`、`agent-host`、`harness-control`、checkpoint 与英语学习均纳入；存在 manifest 不等于生产以独立插件挂载它。
- Service 表合并既有领域 metadata 与 manifest 中尚未列出的服务；后者标为 `declared`。人工 consumer/publicSurface metadata 是阅读提示，不是调用图证明。
- 12 种 Session 核心事件及扩展来自 codecs；Loop 与经典通知来自 event-contract；Task/Application/Harness/Session 生命周期的 `@mode` 来自领域声明。领域通知不虚构持久 codec 或 producer 证据。
- Host Profile 配置与默认 Harness 定义分别保留自己的生命周期边界。默认 Harness 固定制品的构建入口直接复用 `default-harness-definition.ts`。

## 实际检查

生成器检查源文件存在、重复身份、必要字段、相对 sourceRef 文件有效性、digest 格式和已声明事件集合。测试检查 workspace package/manifest 清单遗漏、来源失效和错误 mode 等负向输入。

真正的 manifest admission 在 `validatePluginManifest` 内检查贡献的服务与所有 behavior 提供集合一致，支持多 behavior，而不是要求每个 behavior 提供全部服务。实际激活导出仍由 behavior loader 检查。

事件字面量分发与 `@mode` 交叉验证由 `pnpm check:harness-events` 执行；依赖边界/exports 由包守卫与构建检查，Host ceiling 和组合合法性由真实 composition admission 测试承担。

未实现：任意动态调用的完整 producer/consumer 图、sourceRef 的 TypeScript symbol 解析、所有 Profile 的全语义证明。sourceDigest 只检测源内容变化；格式检查不能证明手工修改的 digest 与内容一致，须运行生成检查。测试源存在也不等于该测试本轮运行或真实 Electron/Provider 验收通过。

旧计划要求的第二套全域语义引擎取消；可定位的具体缺口在[旧计划结算](../../exec-runs/20261004-agent-storage-and-cleanup/legacy-plan-resolution.md)记录，不把取消设计写成能力已实现。
