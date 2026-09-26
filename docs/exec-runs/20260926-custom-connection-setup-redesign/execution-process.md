# 自定义服务与 Anthropic 连接流程重做 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260926-custom-connection-setup-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-09-26 12:01
- **结束时间**：2026-09-26 14:30（Electron 验收和真实中转站测试待用户进行）

## 执行时间线

### 步骤 0：开工检查

- **操作**：`git status --short`、`git diff --stat`。工作树只有本计划的文档改动（`docs/exec-plans/README.md` 与计划文件本身）。
- **决定**：`20260912-custom-model-reasoning` 没有未提交改动，不存在文件冲突，无需和用户确认先后顺序。

### 步骤 1：阶段 A（T1–T3）

- **操作**：
  - T1：自定义连接列表行改用 `CustomConnectionStatus`：`available` →「可用」、`unavailable` →「连接异常」、其他 →「未测试」（`off`）。
  - T2：新增 `ConfirmDialog`（`alertdialog`、复用 `useDialogFocusTrap`、Esc 关闭、默认焦点「取消」、错误留在弹窗内）。`RemoveProviderDialog` 改为基于它实现，去掉了父组件传入的 `busy`（弹窗自己管 pending）。删除自定义连接和删除模型都先弹确认，文案按计划。
  - T3：两处「保存供应商」改为「保存连接」；自定义连接编辑页返回按钮显示「返回连接详情」。
- **影响文件**：`apps/desktop/src/renderer/components/settings/ConfirmDialog.tsx`（新）、`ProviderSettings.tsx`、`CustomConnectionModels.tsx`、`apps/desktop/src/renderer/test/provider-model-settings.test.tsx`。
- **决定**：内置服务商的 `StatusBadge` 在 untested 时也显示「已连接」。它们有「有 Key 即视为已连接」的既有语义，且不在 T1 范围内，本次不改。
- **验证**：
  - `provider-model-settings.test.tsx`：37/37 通过（新增 3 条：状态文案、删除连接确认、删除模型确认；编辑页断言返回文案）。
  - `pnpm --filter @actspace/shared test` 79/79、`pnpm --filter @actspace/llm-pi-ai test` 47/47、`pnpm typecheck`、`pnpm check:frontend-theme`、`pnpm check:frontend-tokens`、`pnpm test:contract-matrix` 全部通过。
  - `pnpm --filter @actspace/desktop test`：815/817，失败 2 条与本次无关（见下）。

### 步骤 2：阶段 B（T4–T10）

用户确认继续，并要求全部完成后再统一提交。

- **T4 地址规范化**：新增 `packages/shared/src/custom-connection-address.ts`（`normalizeCustomConnectionAddress`、`customConnectionRequestUrl`）。主进程 `normalizeCustomConnectionBaseUrl` 改为调用它：`/v1` 不再报错而是去掉；地址推断出的协议和所选协议不一致时报「服务地址和所选协议不一致」（渲染层会先自动切换协议，到主进程还不一致说明请求一定打不通）。地址的 query/hash 会被丢弃。
  - shared 只带 ES2022 lib，没有 `URL` 类型，文件内局部声明了用到的字段，没有给整个包加 DOM/Node lib。
- **T5 共享类型与目录**：`settings.ts` 按计划第 7 节新增类型；目录加 `hidden`、新增 `custom` 条目、三条旧条目隐藏；`protocol` 改为可选（唯一读取处在 `ProviderSettings.tsx`，已有兜底）。`custom-model-input.ts` 新增 `findBuiltinCatalogModel`（同一 ID 优先厂商官方条目）和 `customModelDraftFromCatalog`。
- **T6 计费**：`resolveModelPricing` 新增 `billingMode`、`referenceProviderId`；新增 `billingReferenceProvider(protocol)`。`model-runtime-service` 在 reference 模式下对自定义模型传倍率 1；计价参数抽成 `customConnectionPricingInput`，放在 `model-port.ts`，运行时与 legacy 兜底共用（避免 adapter 反向依赖 model-runtime-service）。
- **T7 持久化**：读取清洗新字段；创建支持 `initialModels`/`defaultApiModel`（默认模型强制启用）、名称为空取域名并去重；更新支持新字段。
  - 决定：只有地址、Key、认证方式、代理变化时才把状态置为 untested 并清空 `resolvedAuth`；改名、改计费不再重置测试结果（原来任何编辑都会置 untested）。换 Key 也会清空 `resolvedAuth`（计划只写了地址和认证方式），保存后的自动测试会重新识别。
  - 认证字段只对 Anthropic 协议存储；运行时 `authScheme` 也只在 Anthropic 连接上出现，OpenAI 协议固定 Bearer。
- **T8 探测**：`provider-network-service.ts` 新增 `probeCustomConnection`（Anthropic 翻页最多 5 页、OpenAI `/models`）；`testCustomConnection` 支持认证方式和 auto 回退。Bearer 请求不再带 `x-api-key`。自定义连接的失败文案改为中文，且不含 Key 或响应正文。
- **T9 IPC**：两套通道都加了 `probeCustomConnection`，处理逻辑放在新文件 `apps/desktop/src/main/runtime-v2/custom-connection-probe.ts` 共用。已保存连接探测允许没有默认模型。
- **T10 运行时 Bearer**：`credential-resolver.ts` 新增 `bearerAwareAuth`；legacy adapter 在 bearer 时去掉 `apiKey`、合并 `Authorization` 头；`legacy-proxy-wire-engine.ts` 在头部自带认证时传 `apiKey: null, authToken: null`。
- **验证**：shared 97/97、llm-pi-ai 51/51、`pnpm typecheck`、theme、tokens、contract-matrix 全部通过。desktop 826/828：一条是基线已知失败，另一条是旧的目录列表用例（断言三条旧协议入口，T11 会重写）。

### 步骤 3：阶段 C（T11–T16）

- **T11 目录**：
  - 过滤 `hidden` 条目，去掉分类下拉，按「官方直连 / Coding Plan / 第三方兼容」用 `SettingSubhead` 分组；
  - 底部单独一个分组「没有找到？」，只有「自定义服务」，搜索时它始终保留；
  - `custom` 进向导，`anthropic` 进只填 Key 页，其他兼容预设仍走旧的单页表单（去掉了编辑分支）。
- **T12 向导**：
  - 新增 `CustomConnectionWizard.tsx` 和 `ConnectionModelPicker.tsx`；共用的常量和小组件在 `custom-connection-shared.tsx`（`SetupHeader`、`WizardSteps`、`ProbeResultNotice`、`MultiplierStepper` 等）；
  - 过期的测试结果用递增 token 丢弃；
  - 手动切换协议后，如果地址后缀和协议对不上，显示「地址和所选协议不一致」，并禁用测试。
- **T13**：新增 `AnthropicKeySetup.tsx`，按计划固定地址、认证方式和计费。
- **T14 详情页**：
  - 新文件 `CustomConnectionDetail.tsx`，每项行内编辑；
  - 改地址、Key、代理后自动重测，改认证方式也立即保存并重测；改名、计费、提示缓存不重测；
  - 旧的编辑路由 `editingCustom` 已删除。
- **T15**：
  - `CustomConnectionModels` 改成「…」菜单加开关，默认模型的开关和删除都禁用；
  - 「刷新」探测到的新模型默认不启用，标「新」；
  - `CustomModelForm` 只用于编辑，能力和价格各一行摘要加开关；
  - `ModelPricingFields` 改为缩进行，币种用 `SettingsSelect`。
- **T16**：
  - fixture `model-settings-preview.tsx` 改为内存数据，支持 `?scenario=ok|bearer|nolist|badkey&seed=1`，并补上应用入口本来就有的 `TooltipProvider`；
  - 用 headless Chrome（CDP 脚本，不进仓库，Vite 另起在 5199 端口）截了 9 个状态 × 浅色 / 深色，放在 `screenshots/`。
- **顺带修改**：
  - `ConfirmDialog` 改为 portal 到 body（在分组里渲染会被 `divide-y` 加上边线），Esc 不再冒泡到外层页面；
  - `SegmentedControl` 的选项在宽屏下按内容宽度排列，只在 600px 以下均分，否则长标签「Anthropic Messages」会溢出选中底色；
  - `RuntimeV2UpdateCustomConnectionInput` 改成 `Omit<CustomConnectionInput, "apiKey">`，这样「不传 Key 表示保留」的类型才成立。
- **验证**：
  - `provider-model-settings.test.tsx` 41/41；
  - shared 97/97、llm-pi-ai 51/51、typecheck、theme、tokens、contract-matrix、`pnpm --filter @actspace/desktop build` 全部通过；
  - desktop 831/832，唯一失败的是基线已知的 Git 用例。

## 遇到的问题

- **问题**：`legacy-proxy-wire-engine.ts` 动态 `import("@anthropic-ai/sdk")` 在 `@actspace/llm-pi-ai` 包内解析失败——这个 SDK 只是 pi-ai 的间接依赖，没有被声明。也就是说，Anthropic 协议 + 代理这条线路升级前就无法加载 SDK。
  - **应对**：在 `packages/llm/pi-ai/package.json` 声明 `@anthropic-ai/sdk@0.91.1`（和 pi-ai 锁定的版本相同，`pnpm add --offline`，锁文件只多了 3 行 importer 记录，没有新包）。
- **问题**：用真实 SDK 测试时发现，legacy 线路即使只传 `apiKey`，Anthropic SDK 也会从 `process.env.ANTHROPIC_AUTH_TOKEN` 读出一个 `authToken` 并发 `Authorization` 头。用户环境里有这个变量时，会把一个无关的令牌发给第三方中转站。
  - **应对**：Anthropic 线路构造 SDK 时一律显式传 `authToken: null`。pi-ai 直连线路本来就显式传了 null，不受影响。两条线路都有真实 SDK 的请求头测试。

- **问题**：`pnpm --filter @actspace/desktop test` 全量跑有 2–3 条失败。
  - **原因**：把本次改动 stash 后在基线上重跑，同样失败 3 条。`workspace-git-context-service.test.ts`「hides Git controls for a non-repository workspace」单独跑也稳定失败（返回 `failed` 而不是 `not_repository`，属于本机 Git 环境问题）；`code-render-view`、`sidebar` 单独跑通过，只在全量并发时超时。
  - **应对**：不属于本计划范围，未处理，记录在此。

- **问题**：新详情页一进入，渲染层测试就卡死，一个 worker 100% CPU。
  - **原因**：`CustomConnectionModels` 的 `load` 依赖父组件传来的内联 `onConnectionChange`。`load` 调用它会让父组件重新渲染，回调变成新引用，于是 `load` 再次执行，形成死循环。旧代码传的是 `setState`，引用稳定，所以没暴露出来。
  - **应对**：回调放进 ref，`load` 只依赖 `connectionId`。
- **问题**：fixture 页面在第 2 步白屏。
  - **原因**：`Stepper` 里的 Tooltip 需要 `TooltipProvider`。应用入口 `main.tsx` 有它，fixture 没有。
  - **应对**：在 fixture 里补上 Provider，产品代码不改。

## 跳过或推迟的事项

- 详情页「连接测试」不显示延迟（demo 里有）：测试结果没有返回耗时，只显示「刚刚通过」这类时间。
- manual 计费模式下，模型编辑页不会强制展开单价，而是和其他模式一样用「单独设置」开关。否则旧模型改名时会被要求先填四项价格。
- 「只统计 Token」模式下，模型编辑页不提供「单独设置」（单价不参与计费）。
- T18 的 Electron 真机验收和真实中转站测试需要用户操作（后者会产生费用，要先征得同意），本次没有做。
