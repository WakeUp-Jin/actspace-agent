# Plan 5：IPC、服务商/模型设置页与 Composer 联动

状态：实现完成，真实三态主题与完整键盘业务路径并入 Plan 6（2026-07-25）

依赖：Plan 0-4

产物消费方：Plan 6

## 目标

建立 renderer 可消费的类型化 provider/model IPC，把设置页拆成“服务商”和“模型”两个入口，完成供应商连接/代理配置、任务模型选择、模型启停、OpenRouter 目录添加和 Composer 可用模型列表联动，同时保持 Electron 安全边界、主题 token、键盘可访问性和大列表性能。

## 附加必读

- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-全局视觉语言规范.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`

## 允许修改的文件

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- main/preload tests
- `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/ModelSettings.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/OpenRouterModelCatalogDialog.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx`（新增）
- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/SessionHoverPreview.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `packages/desktop/src/renderer/App.tsx`
- renderer tests
- 语义 token 文件（仅现有 token 不足时）
- 对应设计文档和 history

不得让 renderer 直接访问文件系统、provider endpoint 或 API Key。

## IPC 清单

最终 channel 名称按现有风格固定为：

- `providers:list`
- `providers:connect`
- `providers:update`
- `providers:test`
- `providers:disconnect`
- `models:list-installed`
- `models:list-usable`
- `models:catalog:list`
- `models:catalog:reload`
- `models:add`
- `models:update`
- `models:remove`
- `task-models:update`
- `kairos-model:update`

每个 input/result 在 `@actspace/shared` 定义并由 preload 精确暴露。所有 main handler 校验 ProviderId、ModelKey、URL、purpose 和删除引用；不信任 renderer 已经校验。

## 任务清单

### 5.1 IPC / preload 安全边界

- main handler 调用 Plan 2/3/4 service，不复制业务逻辑。
- `providers:connect` 接受 API Key，但返回值不回显；preload 不缓存输入。
- catalog list/reload 返回归一化 view，不返回 raw provider JSON。
- `models:list-usable` 接受 purpose，main 重新计算，不接受 renderer 自报 capability。
- IPC error 返回 code + 脱敏 message，不返回 stack、headers 或响应正文。

### 5.2 设置导航与页面拆分

- SettingsNav 在“通用”之后新增“服务商”，保留“模型”。
- ProviderSettings 回答“通过谁请求”。
- ModelSettings 回答“哪些模型可用、承担什么任务”。
- 网络搜索 provider 保持独立分组，可放在服务商页下半部，但标题明确“联网搜索服务”，不进入 LLM model counts。
- `SettingsPage.tsx` 只负责编排和 section routing；provider/model 具体状态移入独立组件。

### 5.3 服务商页

每张 provider 卡展示：

- 名称、连接状态、已启用/已添加模型数。
- API Key 是否配置、Base URL、代理开关与脱敏代理地址。
- 编辑、测试连接、断开。

添加/编辑流程：

```text
选服务商 → API Key → 高级配置（Base URL/代理） → 保存 → 测试
```

- API Key 编辑框不预填旧 key。
- 允许保存后测试失败；卡片显示 errorKind 对应文案。
- 断开前说明模型会变为不可用但不会删除。
- 状态使用文字 + 图标 + 语义色，不只靠红绿。
- 视觉采用桌面端两列、窄窗单列的紧凑服务卡而非整行数据表：只让已连接服务商进入主列表，按官方直连/第三方兼容分组；未连接服务商通过页头「添加服务」选择器进入配置。联网搜索服务继续使用独立的横向列表行，不复用服务商卡片。

### 5.4 模型页与任务模型

顶部任务模型：

- 默认会话模型：`purpose=chat`。
- 轻量任务模型：`purpose=utility`。
- Explore 模型：`purpose=explore`。
- Kairos 显示当前模型和“前往 Kairos 设置”入口，不建立第二份可编辑状态。

候选项显示 provider、价格摘要、上下文窗口和关键能力。当前配置不可用时作为禁用项置顶，并显示实际 fallback/blocked 行为。

下方按 provider 分组展示 installed models：

- enabled toggle。
- 名称、apiModel、能力、价格和 source。
- 用户添加模型可删除；builtin/curated 只可停用。
- 删除在用模型时展示 main 返回的引用列表。

### 5.5 OpenRouter 目录弹窗

- 顶部固定标题、说明、搜索框。
- 显示条目数、缓存时间、fresh/stale/offline 状态和“重新加载”。
- 搜索名称与模型 ID，输入防抖 200-300ms。
- 固定行高本地虚拟列表，不引入大型表格/虚拟化依赖。
- 条目展示 context、输入/输出价格、free、text/image、tools/reasoning。
- 已添加条目显示“已添加”，未添加提供“添加”。
- 加载超过 300ms 显示 skeleton；失败保留旧 cache 并显示重试。
- 主列表是弹窗唯一滚动区，避免双重滚动。
- Esc 关闭、Tab 顺序、上下键浏览、Enter 添加、焦点返回触发按钮。

### 5.6 Composer 与其他展示入口

- App/Conversation state 从 main 获取 `purpose=chat` 可用模型列表。
- Composer 的新桥接路径只显示 usable chat models；静态 `MODEL_LIST` 仅保留为旧 preload 不提供模型接口时的兼容回退，不参与新版空候选语义。
- 设置页连接、启停、添加模型后更新上层 snapshot，Composer 无需重启同步。
- 当前 Composer 模型失效时保留显示并禁止发送，提示选择可用模型，不自动换 provider。
- Thinking 控件从当前 ModelDefinition capability/default 驱动。
- SessionHoverPreview、UsageStatisticsPage 使用返回的动态 label/provider；历史未知模型显示保存的字符串。
- KairosSettings 模型下拉改用 `purpose=kairos`，设置仍写 Kairos 单一事实源。

### 5.7 浏览器 fixture 与 Electron 边界

- renderer 单测通过 typed `window.actspace` fake 覆盖 provider/model states。
- 浏览器无 preload 时显示“仅桌面端可配置”，不在 localStorage 模拟真实 key 或 catalog。
- 可增加显式开发 fixture 入口展示 UI 状态，但 fixture 文件不得被 production bootstrap 自动启用。

### 5.8 主题与可访问性

- 组件只使用语义 Tailwind 类/token；禁止 `text-black`、`bg-white`、主题相关 hex。
- 模态、卡片、输入、状态、hover、focus-visible 在浅色/深色均验证。
- provider logo 若使用品牌色，需确认两主题对比；状态语义仍用 token。
- `prefers-reduced-motion` 下关闭非必要循环动画。
- 图标按钮有 aria-label，表单 error 与输入使用 aria-describedby 关联。

## 测试要求

- IPC 输入校验和返回脱敏。
- Provider 三态：未连接、测试中、available、unavailable。
- 代理开关/URL 校验/保存失败。
- task model purpose 候选与不可用当前值。
- model enable/disable/remove/model_in_use。
- catalog fresh/stale/offline/loading/error/empty/search/virtual rows/add。
- Composer 列表实时同步和当前模型失效禁发。
- Kairos 跳转与候选同源。
- keyboard、Esc、focus restore、aria-label。
- light/dark/system theme 下关键组件类和截图/DOM 状态。

## 验证命令

```bash
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
rg -n "text-black|bg-black|bg-white|text-\[#|bg-\[#|border-\[#|rgba\(" packages/desktop/src/renderer/components/settings packages/desktop/src/renderer/components/Composer.tsx
```

`rg` 命中必须逐条确认属于主题规范允许的例外；无法解释的命中改为语义 token。

## 手工验证

- 浏览器 renderer：使用显式 typed fixture 检查布局、目录滚动、搜索、键盘和浅深主题。
- Electron：真实检查 preload、IPC、密钥保存、provider 测试、目录缓存、Composer 更新和重启恢复。
- 至少抽查一个主按钮和一个模型卡的 computed style，确认 typography/background/border 未被全局 CSS 覆盖。

## 完成标准

- 服务商与模型在设置页成为独立、清晰的两个入口。
- renderer 全程不接触 key、文件和 raw provider response。
- Composer 和所有模型选择器只展示 purpose 对应 usable models。
- OpenRouter 数百模型通过按需目录和虚拟列表管理，不污染主会话菜单。
- 浅色、深色、跟随系统和键盘操作均通过验收。

## 决策记录

- 2026-07-24：SettingsPage 保留页面编排，Provider/Model/Catalog 拆独立组件，避免继续膨胀单文件。
- 2026-07-24：目录虚拟列表本地实现固定行高窗口，不新增大型 UI 依赖。
- 2026-07-24：浏览器 preview 不模拟真实 provider 持久化，只允许显式测试 fixture。
- 2026-07-25：服务商首屏改为紧凑卡片和统一添加入口，保留测试、编辑、断开与供应商级代理能力，不改变 IPC 契约。
