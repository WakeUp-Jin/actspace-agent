# ActSpace 模型设置页面 Maka 风格重做执行计划

> 2026-09-06 范围更新：分析观测功能与专用 Analysis / Trace 接口已退役。下文保留该页面或验收其入口的原计划条目已失效；Journal、聊天、Trajectory、Context 与 Usage 仍保留。

> 状态：实施中。
>
> 计划 slug：`20260901-actspace-model-settings-maka-redesign`
>
> 本计划是 `20260830-actspace-settings-center-refactor` 的模型页面增量计划，专门处理用户截图指出的视觉和流程问题。后续确认范围已加入兼容服务目录与连接级持久化；2026-09-06 增量聚焦其 UI 和保存回归。

## 1. 目标

将 ActSpace 的“模型”页面从 Provider 大卡片和嵌套 Dialog 方案重做为 Maka 风格的连续设置流程：连接列表、添加服务目录、连接配置、连接详情和模型目录使用同一页面壳层与开放式行式交互。

## 2. 范围

### 包含

- 模型页面专用的路由状态与页面壳层。
- Provider 连接列表的单行布局、状态摘要和默认标记。
- 添加服务目录的搜索、筛选、空态和返回。
- 连接配置页面路由，复用现有 API Key、Management Key、Base URL 和代理能力；Header/额外 JSON 未完成，不展示假编辑入口。
- 连接详情的开放式设置行、余额状态、测试连接、模型发现和删除操作。
- 连接详情内的模型目录行式管理。
- 路由、标题层级、数据保留和焦点恢复测试。
- Renderer 截图和 Electron 最终验收记录。

### 不包含

- 不修改 Session Journal 或 Usage；连接级 SettingsV4 增加可选 protocol，缺省兼容旧连接。
- 不增加 Maka 中 ActSpace 没有的 Runtime Host、账号订阅或远程能力。
- 不修改分析观测页面。
- 不修改 `tmp/maka` 参考源码。
- 不保留旧 Provider 卡片作为第二套可见 UI。

## 3. 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/frontend/front-全局视觉语言规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

## 4. 相关代码路径

- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/settings/useDialogFocusTrap.ts`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/preload/index.ts`
- `packages/shared/src/settings.ts`

## 5. 实施阶段

### 2026-09-06 已批准增量：九家供应商与三种自定义协议

按顺序提供 Moonshot、DeepSeek、MiniMax、OpenAI、Anthropic、Z.AI、Xiaomi、火山方舟 Coding Plan、OpenRouter，以及自定义 OpenAI Chat / OpenAI Responses / Anthropic。所有入口使用同一列表行，自定义可重复添加；退下目录的品牌已有连接保留。

- [x] 共享目录、名称、Logo、搜索筛选与统一列表行。
- [x] 连接保存显式 protocol，缺省旧连接保持 Chat；默认模型生成连接隔离的模型标识并安装。
- [x] 可用性与实际请求使用绑定连接的凭据和协议，删除或失效连接不得回落到其他账号。
- [x] 回归覆盖三协议、同模型多连接、重启、默认模型变更、旧数据与 UI；完成构建及浅深主题 Renderer 验收。

此增量自动化与 Renderer 验证已完成；真实供应商调用和 Electron 最终验收仍未完成，不能由 mock 传输测试替代。

范围涉及 shared 契约/解析器、SettingsService、ModelStore/Runtime 和设置 UI，超过八个文件；复用已有三个 LLM 协议引擎，不新增服务。密钥继续由主进程保存。真实请求验收使用对应服务的用户凭据，自动测试只使用隔离样例，不调用收费接口。

### 当前进度（API Key 第一阶段）

- [x] API Key 目录改为 Maka 式扁平列表，移除外围 Provider 卡片
- [x] API Key setup 改为页面内路由，标题前置箭头、单一 h3 路由标题、普通高级设置行
- [x] 保存按钮、必填文案和输入框对齐通用设置主题 token
- [x] 补充目录结构与 setup 视觉回归测试
- [x] 建立显式 Provider logo registry，并接入 DeepSeek、Moonshot/Kimi、OpenRouter 官方标识
- [x] 将现有三家真实服务商的目录元数据集中到 shared ProviderDefinition 注册表
- [x] 模型运行时支持按可选 connectionId 读取 V4 连接级 Base URL、代理和凭据配置
- [x] SettingsService 提供自定义连接的创建、连接级密钥存储和删除 API
- [x] 自定义连接 API 已接入 fixed Renderer IPC 与 preload bridge
- [x] 模型设置页读取并展示 V4 自定义连接，支持进入详情和删除
- [x] 添加连接目录提供自定义 OpenAI-compatible setup 表单并调用连接创建 IPC
- [x] 自定义连接支持通过 IPC 更新显示名称、服务地址、默认模型、代理和 API Key
- [x] 自定义连接详情可进入编辑 setup，支持保留原 Key
- [x] 自定义连接详情嵌入连接级模型分区并按 connectionId 过滤
- [x] 模型行支持选择并保存连接绑定
- [x] 连接详情的 OpenRouter 模型目录刷新按钮接入现有 catalog reload IPC
- [x] 支持自定义 OpenAI-compatible 连接字段与多连接持久化
- [x] 第一批添加连接目录收口为 API Key：DeepSeek、Kimi、OpenRouter、OpenAI、xAI/Grok、Mistral、Qwen、MiniMax、Z.AI、Groq，以及自定义中转
- [x] 首批目录使用显式 provider logo 映射，移除 OAuth / 订阅入口
- [x] 2026-09-06 修复更换 Key、自定义连接编辑、品牌映射与返回目录保留筛选
- [x] 浏览器真实组件预览：1024px 浅/深目录、Key setup，375px 深色兼容表单
- [ ] Electron 真实窗口截图验收（当前 CUA 返回 Invalid app）

### M0：设计规范与执行记录

- 写入模型页面子规范。
- 创建本计划和 `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/` 执行文档。
- 将本计划加入 `docs/exec-plans/README.md`。

### M1：模型页面壳层和连接列表

- 将模型页面内容宽度、标题、连接列表和 Provider 行重做为 Maka 风格。
- 移除连接列表中的嵌套余额卡片和信息卡片。
- 保留连接状态、余额读取和已有 Provider 操作。
- 统一连接行的整行点击、默认标记、状态摘要和键盘焦点。

### M2：目录与配置路由

- 将添加服务改为页内目录路由。
- 添加搜索、分类、空结果和返回状态。
- 将 Provider 配置从普通 Dialog 迁移到页面路由，复用现有保存函数和安全字段。
- 保存成功后回列表并恢复新连接焦点。

### M3：连接详情和模型目录

- 将连接详情重做为开放式两列设置行。
- 余额移动到详情页，保留刷新、失败和上次结果。
- 将代理、Management Key 和 Base URL 改为行内展开或独立编辑区域；Header/额外 JSON 暂缓。
- 将模型目录从连接页底部卡片迁移到连接详情的模型分区。
- 保留模型启用、删除、能力和 Provider-qualified ModelKey 语义。

### M4：测试与视觉验收

- 补充一个页面 `h2`、分组 `h3`、子分组 `h4` 契约测试。
- 补充 list / catalog / setup / detail 路由测试。
- 补充模型目录、余额位置、密钥不回显、返回焦点和错误恢复测试。
- 运行 renderer 测试、Desktop typecheck、Desktop build。
- 在 1280px 和 375px 检查 Renderer 截图；启动 Electron 后检查真实窗口。

## 6. 风险与回退

| 风险 | 缓解方式 | 最小回退 |
| --- | --- | --- |
| 旧测试依赖 Provider heading 或 Dialog | 先保留 aria 名称和保存函数，逐步迁移测试 | 回退 UI 路由，不回退数据层 |
| 配置路由导致凭据草稿丢失 | setup route 本地持有草稿，取消显式回退 | 保留旧编辑入口作为内部 fallback |
| 余额刷新在路由切换后更新已卸载组件 | 使用 mounted / request ticket 守卫 | 暂停自动刷新，只保留手动刷新 |
| 模型列表迁移破坏旧 ModelKey | 只改变渲染位置，继续调用现有 model IPC | 回退模型目录 UI，不迁移引用 |
| 窄窗口行式布局换行异常 | 375px 截图矩阵和最小 40px 触控目标 | 仅收窄详情布局，不改变桌面布局 |

## 7. 验证方式

### 工程验证

```sh
pnpm --filter @actspace/desktop run typecheck
pnpm --filter @actspace/desktop run build
```

### 相关测试

```sh
pnpm exec vitest run src/renderer/test/provider-model-settings.test.tsx src/renderer/test/settings-page.test.tsx
```

### 手工视觉验证

- Renderer：1280px 模型列表、连接详情、添加目录、配置页。
- Renderer：375px 详情页和目录页。
- Electron：真实设置窗口加载、IPC 数据、测试连接、返回和配置保存。

## 8. 进度记录

- [x] 完成 Maka 源码和用户截图差异审计。
- [x] 写入模型页面 Maka 重做设计规范。
- [x] 创建执行过程与摘要文档。
- [x] 完成模型连接列表重做。
- [x] 完成目录和配置路由，移除遗留 Provider Dialog 包装，统一 Key 输入与显示/隐藏操作。
- [x] 完成连接详情与模型目录重做。
- [ ] 完成测试、Renderer 截图和 Electron 验收。

## 9. 决策记录

- 2026-09-01：不在旧 Provider 卡片上继续修补，改为独立重做模型页面 UI 层。原因是当前问题来自信息结构和容器语法，而不是单个样式值。
- 2026-09-01：不复制 Maka 的 `Local` 环境选择器。ActSpace 当前没有对应用户能力，避免添加虚假控件。
- 2026-09-01：余额从连接列表移动到连接详情。列表负责选择连接，详情负责诊断和修改连接。
- 2026-09-05：先将已接通供应商的目录元数据抽到 shared ProviderDefinition；未接通的 OAuth、自定义兼容连接不提前展示。

## 10. 执行模式

**交互模式**：人在线，Agent 按阶段执行并记录验证结果。模型页面是视觉重做，必须保留截图和人工验收边界。

## 11. 执行文档

- `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/execution-process.md`
- `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/execution-summary.md`
