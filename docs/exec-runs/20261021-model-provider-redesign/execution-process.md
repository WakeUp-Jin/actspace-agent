# 设置 › 模型：四层数据模型与页面重做 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261021-model-provider-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-10-21
- **结束时间**：2026-10-21

## 执行时间线

### 步骤 0：立项

- **操作**：
  - Demo 定稿，只保留 `docs/design-docs/frontend/model-provider-demo/index.html`。
  - 从 `main` 建分支 `feat/model-provider-redesign`，worktree 放在 `../actspace-agent-model-provider`。
  - 梳理后端、价格与用途、设置页三部分的现状，写出计划。
- **决定**：
  - 用户 2026-10-21 确认了三件事：中转站 `/models` 自带的字段优先于模型目录；去掉两个「测试」按钮；删除多 Key。
  - ModelKey 格式不变（实现取舍 I1）。
- **验证**：无代码改动。

### 步骤 1：A 阶段（shared 地基）

- **操作**：
  - 新增 `model-thinking-profiles.ts`（思考档位表）、`model-catalog-match.ts`（目录匹配）、`model-layers.ts`（有效值解析、档位与 capabilities 互转、facts 校验）、`provider-model-facts.ts`（`/models` 富字段）、`provider-templates.ts`（模板表）、`model-connections.ts`（IPC 契约）。
  - `ModelDefinition.providerFacts`、`TaskModelSettings.visionModel / thinking`、`SettingsV4Models.overrides / layersVersion` 加入类型。
  - `resolveModelPricing` 去掉 billingMode、referenceProviderId 和「已乘倍率」开关：传入的价格就是最终价；DeepSeek 官方地址的高峰价保留，用户手填价优先。
- **决定**：
  - IPC 契约单独放 `model-connections.ts`，不再往 1370 行的 `ipc.ts` 里加。
  - `billingMode` 等旧类型先留着（标记待删），旧 renderer 组件还在用；C12 清理时一起删，避免 B 阶段中途 typecheck 全红。
  - `PROVIDER_CATALOG` 的去留放到 C12：现在只有旧 renderer 组件在用。
- **验证**：`packages/shared` vitest 189/189 通过，tsc 通过。

### 步骤 2：B 阶段（main）

- **操作**：
  - B1/B2：settings 类型、defaults、sanitize 和四层迁移（`settings/model-layers-migration.ts`，layersVersion 0 → 1，只跑一次）。迁移前把磁盘上的原文写进 `settings.v4.pre-model-layers.backup.json`。新增 `settings-model-layers-migration.test.ts`（6 个用例）；characterization 的 golden 重新生成。
  - B3：`ModelStoreService.getModelSnapshot()` 统一算有效值并写回 definition；`definition.pricing` 就是最终价。
  - B4/B5/B9：新增 `ModelConnectionsService`（`main/model-connections-service.ts`），连接、连接下的模型、预览、用途表、余额都在这里，每个修改返回整份视图。probe 保留 `/models` 的富字段。
  - B6：`model-runtime-service.ts` 去掉倍率与 billingMode 分支；新增 `resolveImageInspectionModel`（用途表 → 会话默认 → 第一个能看图的模型）、`resolveExploreTaskModel`、`purposeThinking`；轻量任务和自动审批的固定 `{reasoning:false}` 改为读用途档位（默认「关」，行为不变）。
  - B7：桌面端注册 `explore` 路由，explore preset 改用 `routeId:"explore"`；runtime 在宿主没有这条路由时退回主路由；`desktop-app/complete-text.ts` 找对话路由时排除 `explore`。
  - B8：删掉多 Key 的数据、解析和 credentialId 分支。
  - B9：IPC 新开 `modelConnections` 域，11 个 channel；main 注册、renderer `api/model-connections.ts`、mock 都已接上。
- **决定**：
  - 计划里放在 ModelStoreService / custom-connections facade 的新方法，统一收进 `ModelConnectionsService`。ModelStoreService 只负责算快照，两份职责不再混在一起。
  - 新 channel 单独开 `modelConnections` 域，不往旧 `models` 域里加：旧域在 C12 整块删除时更干净。
  - `refreshConnectionModels` 不单独做：对已保存的连接调用 probe 就能拿到最新列表，`added` 标出哪些已经在连接里，再用 `addModels` 加入。
  - 多 Key 的 4 个旧 channel 先保留，`testCredential` 改成直接返回「不再支持」；连同其它旧 channel 在 C12 一起删。
  - 用旧接口（`models.addCustom` 等）写入的价格和推理配置，新的快照不再读取。旧接口不打补丁，相关测试改到新服务上。
  - 探索模型以前还镜像在 `subagents.routes.explore`，只写不清，导致改不回「跟随」。迁移时并入 `taskBindings.explore` 后删掉镜像。
  - v4 的 `models` 命名空间补丁里，definitions / installed / overrides 和 connections 一样，用 `null` 表示删除。
- **验证**：desktop main vitest 554 通过（1 跳过）；shared 187、subagent 12、runtime 63 全部通过；desktop 两个 tsconfig 的 typecheck、`check:ipc-channels`、`test:ipc-channels`、`check:renderer-bridge` 都通过。

### 步骤 3：C 阶段（renderer）

- **操作**：
  - 新页面都在 `renderer/components/settings/models/`：`ModelsPage`（路由：列表 / 添加连接 / 填 Key / 选模型 / 详情）、`PurposesSection` + `PurposePicker`、`ConnectionListSection`、`TemplateCatalogPage`、`ConnectionSetupPage`、`ModelSelectPage`、`ConnectionDetailPage`、`ModelList` + `ModelPanel`、`AddModelPanel`；共用字段在 `model-fields.tsx`，纯函数在 `model-view.ts`，数据和写操作在 `use-model-connections.ts`。`SettingsPage` 的 `case "model"` 改接 `ModelsPage`。
  - `ProviderLogo` 加 `size`（xs / sm / md），模型行的家族 mark 用 xs。
  - mock 改成有状态的 `mock/model-connections-fixture.ts`：有效值用 shared 的 `resolveEffectiveModel` 现算；探测按 Key 切场景（含 `badkey` → 401，`nolist` → 拿不到列表，`catalog` → 退回目录）。
  - C12（renderer 部分）：删除 `ProviderSettings`、`CustomConnection*`、`ConnectionModelPicker`、`CustomModel*`、`ModelPricingFields`、`ModelMultiSelector`、`model-selector-groups`、`OpenRouterModelCatalogDialog`、`AnthropicKeySetup`、`ModelPurposeSelect`、`ModelSettings` 以及对应测试和 preview fixture。「通用 › 模型与生成」「通用 › 媒体」「子 Agent」不再选模型，改成跳到「模型」页的入口；「工具 › 看图」说明改为指向「模型 › 用途 › 看图」。
- **决定**：
  - 「自动审批」不设时后端退回会话默认模型（demo 写的是轻量任务）。页面照实写「跟随会话默认」。
  - renderer 的 tsconfig 不是 strict，`ok: true | false` 的联合类型不会收窄；`use-model-connections` 用 `"error" in result` 判断。
  - `CommitInput` 失焦才提交；`onCommit` 返回 `false` 表示输入不合法，输入框退回原值（倍率、上下文、价格都走这条）。
  - 沿用目录模型之后，模型按已知模型显示，只给三项关键信息；「取消沿用」在「更多设置」里。
  - 「移除模型」用 `danger` 按钮：ghost 变体的文字色会盖过 className 里的红色。
- **验证**：
  - desktop 两个 tsconfig 的 typecheck 通过。
  - 新增 `model-view.test.ts`（14 个）和 `model-settings.test.tsx`（10 个，覆盖用途选择、添加官方连接、Key 无效、中转无列表、详情页开关 / 移除 / 沿用、倍率退回、两步删除、重新获取、余额与管理 Key）；`settings-page.test.tsx` 改为断言新页面，24 个通过。
  - 浏览器 mock 截图（浅色、深色、480px）：列表、用途选择器、连接详情、已知 / 未知模型展开、添加模型、模板列表、填 Key、选模型。

### 步骤 4：C12 后端清理

- **操作**（委派 Sonnet 子智能体执行，主线复查）：
  - 删掉旧 IPC：providers 的连接 / 测试 / 余额 / 多 Key，models 的 addCustom / editCustom / add / listCatalog / listInstalled 等，settings 的自定义连接 CRUD 与 probe。保留 `providers.setKey/clearKey`、`models.listUsable`、`models.getPricingCatalog/refreshPricingCatalog`。
  - 删掉 `openrouter-catalog-service.ts`、`custom-connection-probe.ts`、`facades/custom-connections.ts`，shared 的 `image-inspection-config.ts`、`openrouter-catalog.ts`、`custom-model-input.ts`，`PROVIDER_CATALOG*`，`model-connection.css`。
  - 多 Key 从类型、sanitize、defaults、migrations、`secrets-file.ts` 删光；旧的 `<provider>:<credId>` secret 读取时丢弃。
  - `billingMode` 与 `imageInspection.modelKey` 不再进设置类型，读文件时用 `legacyModelHints(raw)` 从原始 JSON 取出，只给四层迁移用。
  - `ModelStoreService` 只剩快照与列表；`ProviderNetworkService` 只剩 probe 与余额。
- **决定**：
  - 新页面里 8 条 token 检查报错：普通按钮改成 `Button`（「知道了」「高级设置」「去补充」）；两处「添加模型」行合成 `AddModelRow`；`rounded-[4px]` 改 `rounded-act-xs`。
  - 剩下 7 个原生按钮是整行或带 ARIA 角色的控件（复选框、档位开关、添加模型行、模型展开行、用途触发行、listbox 选项、思考单选），`Button` 的固定高度放不下，登记进 `native-button-baseline.json`。
- **验证**：见执行摘要「自动化证据」。

### 步骤 5：D / E 收尾

- **操作**：
  - 重拍浏览器截图，复制 11 张到 `screenshots/`。
  - 写执行摘要和人工验证指引。
  - 重写模型页规范，更新目录与费用设计、设计索引。
  - history 记一条；计划移到 `completed/`；`20260912-custom-model-reasoning` 标记为被取代。
- **验证**：`check:docs`、`check:current-docs`。

## 遇到的问题

- **问题**：现状梳理时发现，「子 Agent 探索」模型存下来以后运行时并不读取。
  - **应对**：并入计划 B7，接上真实的路由。
- **问题**：explore preset 改用 `explore` 路由后，runtime 的 default-harness 测试报「LLM route explore is unavailable」，加了回退仍然失败。
  - **原因**：runtime 的测试加载的是 `scripts/build-default-harness.mjs` 打出的固定 harness 包，只跑 `tsc` 不会更新它。
  - **应对**：改 runtime 的 harness 代码后用 `pnpm build`（tsc + 打包）重建，回退生效，测试通过。
- **问题**：浏览器截图时，在倍率框里填了非数字，失焦后框里一直显示错的内容。
  - **原因**：`CommitInput` 只在值合法时提交，不合法时既不提交也不复原。
  - **应对**：`onCommit` 返回 `false` 时退回原值，并补了测试。
- **问题**：C12 清理后 `check:frontend-tokens` 报新页面 7 个原生按钮和 1 个任意圆角。
  - **应对**：能换的换成 `Button`，重复的合成组件，剩下需要 ARIA 角色或整行布局的说明原因后登记基线。
