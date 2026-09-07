# ActSpace 模型设置页面 Maka 风格重做 — 执行过程

## 2026-09-06 加载态回归修复

用户批准后，将遗漏的两列卡片骨架改为单列连接行占位。读取本地连接设置与远程余额不再共用完成门槛；本地数据就绪即可操作连接，余额失败局限于详情余额行。新增两项延迟 Promise 回归在旧代码上失败，修复后相关两文件 54 项通过。类型、renderer 构建及主题检查通过，浏览器检查浅深主题和窄内容宽度。未提交，真实 Electron 窗口验收仍保留。

## 2026-09-06 九家供应商与三种自定义协议

- 按最终名单重排共享目录，删除自定义单独页脚，保留重复添加；新增三家 Logo 并沿用 Maka 的图形来源记录。
- 保存显式 protocol 与连接隔离的模型标识。用无 OpenRouter 默认 Key 的临时数据目录验证三协议创建、重启和请求路由，首次测试揭示并修复凭据读取器拒绝 connection 槽位的问题。
- 模型更新清洗保留 connectionId；V4 投影取最新模型状态；队列覆盖连接创建、编辑和移除，补充并发和写入失败测试。
- Desktop 相关七文件 77 项通过，之后新增失败回滚与并发两项，重跑受影响两文件 36 项通过；合计相关 Desktop 79 项。Shared 两文件 22 项通过。构建、类型、主题、文档及 diff 检查通过。
- 浏览器显式 fixture 检查十二行名称与顺序、浅色表单、深色窄屏；375px 视口内容 scrollWidth 与 clientWidth 同为 364px。样例不持久化用户数据，不进行网络模型请求。
- 实际 Electron 开发 bundle ID 查询返回 Invalid app，保留真实桌面和真实 Key 的验收缺口。未提交、未暂存、未推送。

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260901-actspace-model-settings-maka-redesign/README.md`
- **执行模式**：交互
- **开始时间**：2026-09-01
- **结束时间**：2026-09-02

## 执行时间线

### 步骤 1：截图、源码与边界审计

- **操作**：对照用户提供的四张 Maka 模型页面截图，读取 `tmp/maka` 的 Provider panel、catalog、setup、detail 和 settings row 源码，并审查当前 ActSpace ProviderSettings / ModelSettings 实现。
- **影响文件**：无代码修改。
- **决定**：当前问题属于信息结构和容器语法错误，不能继续在旧 Provider 卡片上做局部样式补丁。
- **验证**：确认当前实现仍存在 Provider 大卡片、余额嵌套卡片、信息嵌套卡片、底部模型目录和 Dialog 配置流程。

### 步骤 2：写入设计规范与 execution plan

- **操作**：新增模型页面子规范、独立 execution plan、执行过程和摘要文档，并更新设计文档索引与执行计划索引。
- **影响文件**：
  - `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
  - `docs/exec-plans/active/20260901-actspace-model-settings-maka-redesign/README.md`
  - `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/*`
  - `docs/design-docs/frontend/README.md`
  - `docs/design-docs/frontend/front-设置中心重构规范.md`
  - `docs/exec-plans/README.md`
- **决定**：将模型页重做拆成 M1 列表、M2 目录与配置、M3 详情与模型目录、M4 测试验收，避免继续混淆设置中心其他页面。
- **验证**：文档已落盘，计划明确允许修改文件、回退边界、验证命令和人工验收矩阵。

### 步骤 3：替换模型连接列表与页面路由

- **操作**：将 Provider 大卡片改为 Maka 风格的扁平连接行；添加连接进入服务商目录，服务商配置改为页面内路由；目录增加类型筛选，API Key 增加显示/隐藏控制。
- **影响文件**：
  - `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
  - `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
  - `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- **决定**：模型页只保留一个页面 h2，连接列表为 h3；不再在首屏展示余额、地址和代理事实卡片，详情页通过分隔行呈现。

### 步骤 4：将模型目录收进连接详情

- **操作**：`ModelSettings` 增加嵌入模式与服务商过滤，模型目录仅在连接详情页展示；模型页首屏不再重复出现“模型目录”分组。
- **影响文件**：`apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- **决定**：任务默认模型继续留在“通用”，模型能力配置跟随具体 Provider 连接，避免模型页首屏堆叠多个大分组。

### 步骤 5：回归测试与静态验证

- **操作**：更新旧的卡片/弹窗测试为连接列表/页面路由断言，并补充无余额首屏、详情余额、目录筛选、Escape 返回和标题层级断言。
- **验证**：Provider 与 SettingsPage 两个测试文件共 40 个断言通过；桌面 renderer/electron typecheck 通过。

### 步骤 6：构建与全量回归边界

- **操作**：完成 Desktop production build，并执行全量 renderer/main 测试。
- **验证**：production build 通过；全量测试 78 个文件中 2 个既有 hover context 数值格式断言失败，模型设置相关测试仍为 40/40 通过。
- **边界**：未修改与本次模型页面无关的 hover context 文案逻辑，避免把既有工作区变更混入本任务。

### 步骤 7：供应商元数据注册表收口

- **操作**：将 DeepSeek、Kimi、OpenRouter 的 Logo key、目录分类、认证类型、字段声明和能力标记集中到 `packages/shared/src/provider-config.ts` 的 `PROVIDER_DEFINITIONS`；Renderer 目录和 Logo 通过该注册表消费。
- **影响文件**：`packages/shared/src/provider-config.ts`、`packages/shared/src/index.ts`、`apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`、`apps/desktop/src/renderer/components/settings/ProviderLogo.tsx`。
- **边界**：本步只覆盖已有真实 Runtime 能力的三家服务商，不展示尚未接通的 OAuth 或自定义兼容连接。
- **验证**：Desktop typecheck 通过；Provider/SettingsPage 定向测试 45/45 通过；`check:frontend-theme` 仍被既有的品牌命名扫描规则阻断，未因本步引入新的主题颜色。

### 步骤 8：连接级运行时解析兼容层

- **操作**：模型安装设置支持可选 `connectionId`；SettingsService 在解析 Provider runtime 时优先读取匹配的 V4 connection，缺省继续回退到 `${provider}:default`；模型运行时结果携带连接绑定。
- **验证**：shared build、全仓库 typecheck 和模型设置定向测试通过。

### 步骤 9：连接详情模型目录刷新

- **操作**：连接详情的“更新模型目录”按钮接入现有 OpenRouter catalog reload IPC；非 OpenRouter 连接保持禁用，避免展示未实现的发现能力。
- **验证**：Desktop typecheck 与 Provider 定向测试 20/20 通过。

### 步骤 10：自定义连接 Main 存储 API

- **操作**：SettingsService 新增自定义连接创建与删除方法，连接拥有独立 ID、显示名称、默认模型、Base URL、代理和 main-only 连接级密钥；运行时按连接 ID 读取该密钥。
- **验证**：shared build 与 Desktop typecheck 通过。

### 步骤 11：自定义连接桌面 IPC

- **操作**：新增 create/remove custom connection 的 shared channel、fixed Renderer handler、preload bridge 和 `window.actspace` 类型声明。
- **验证**：shared build、Desktop typecheck 和 `check:docs` 通过。

### 步骤 12：自定义连接 Renderer 展示

- **操作**：模型设置页读取 V4 connections，展示自定义连接行，并提供连接详情和删除入口；默认 Provider 连接继续走原有详情路由。
- **验证**：shared build、Desktop typecheck、Provider 定向测试 20/20 通过。

### 步骤 13：自定义连接 setup 表单

- **操作**：添加连接目录增加自定义 OpenAI 兼容服务入口；setup 表单支持连接标识、显示名称、API Key、服务地址和默认模型，并调用连接创建 IPC。
- **验证**：shared build、Desktop typecheck、Provider 定向测试 20/20 通过。

### 步骤 14：自定义连接更新 IPC

- **操作**：新增自定义连接更新契约、Main SettingsService 实现、fixed Renderer handler、preload bridge 与全局类型声明。
- **验证**：shared build 与 Desktop typecheck 通过。

### 步骤 15：自定义连接编辑入口

- **操作**：详情页增加编辑动作并复用 setup 表单；编辑时连接 ID 锁定，API Key 可留空以保留原值。
- **验证**：shared build、Desktop typecheck、Provider 定向测试 20/20 通过。

### 步骤 16：连接级模型分区

- **操作**：ModelSettings 支持 `connectionFilter`；自定义连接详情嵌入模型分区，仅显示绑定到该 connectionId 的模型。
- **验证**：shared build、Desktop typecheck、Provider 定向测试 20/20 通过。

### 步骤 17：模型连接绑定选择器

- **操作**：模型行读取 V4 connections，提供同 Provider 连接选择器，并通过 `updateModel` 保存 `connectionId`。
- **验证**：shared build、Desktop typecheck、Provider 定向测试 20/20 通过。

## 遇到的问题

- **问题**：前一轮虽然增加了路由，但截图仍与旧 UI 基本一致。
  - **原因**：路由状态包裹的仍是旧卡片和旧 Dialog，视觉容器没有替换。
  - **应对**：冻结 Maka 的四种页面语法，后续直接重做模型页面 UI 层。

## 跳过或推迟的事项

- Electron 截图验收：代码实现和构建通过后仍需在真实 Electron 宿主复核。

## 2026-09-06 添加连接增量验收

- 使用 Maka 原始品牌 SVG 路径和资源补齐首批 API Key 目录；MiniMax 使用 Simple Icons SVG。资源和许可证记录在 provider-marks/README.md。单色标识随主题翻转，自定义连接按 catalogId 映射品牌。
- Key 表单统一输入框、显示/隐藏、单一行内路由标题与紧凑操作区，移除遗留 Dialog 包装。目录搜索固定桌面宽度，取消返回保留筛选，空结果可清除筛选。
- 修复已有连接更换 Key 未提交、自定义连接编辑未打开、仅有自定义连接时误显示空态。保存失败保留草稿。
- 高级连接设置只展示现有地址、代理和 Management Key 能力；移除没有真实编辑链路的 Header/JSON 操作。
- 新增三条交互回归，覆盖兼容连接取消/筛选/显隐、换 Key 失败重试、自定义连接编辑/保留 Key/品牌映射；相关两个文件共 48/48 测试通过。
- Shared build、Desktop typecheck、Renderer production build、Electron main/preload build 通过；Renderer 仍有大于 500 kB 的 bundle 提示。
- 显式开发夹具：`apps/desktop/src/renderer/test/fixtures/model-settings-preview.html`，复用真实 ProviderSettings 与样式，所有保存均为失败样例，不读取或写入用户凭据。
- 已通过 CUA 查看 1024px 浅/深目录、浅色 Kimi Key 表单、375px 深色 OpenAI 兼容表单；箭头与标题同行、Logo 可见、输入及按钮无横向裁切。截图见本轮工具记录，未把 mock 当成 IPC 验收。
- 原生验收：按 dev-runtime 日志的 appId 和 appPath 定位开发版应用，CUA 返回 Invalid app，未观察到真实 Electron 窗口。真实供应商请求、凭据保存与新连接焦点恢复仍需最终验收。
